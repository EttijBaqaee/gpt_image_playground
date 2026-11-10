import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { normalizeReferenceImageMode, type ReferenceImageMode } from './referenceImageMode.js'

// libvips operation caching can retain task-scoped raw reference buffers.
sharp.cache(false)

const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' }
export function referenceExtension(mimeType: string) { return extensions[mimeType] || 'bin' }
export function outgoingReferenceMime(mimeType: string, mode: ReferenceImageMode) {
  return mode === 'pixel' && ['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(mimeType) ? 'image/webp' : mimeType
}

// Bound decoded raster memory across tasks, n>1 submissions and public downloads.
// Hand a released slot directly to the oldest waiter so new work cannot overtake it.
let activeReferenceJobs = 0
const referenceWaiters: Array<() => void> = []
async function withReferenceProcessing<T>(run: () => Promise<T>): Promise<T> {
  if (activeReferenceJobs < 1) activeReferenceJobs++
  else await new Promise<void>(resolve => referenceWaiters.push(resolve))
  try { return await run() }
  finally {
    const next = referenceWaiters.shift()
    if (next) next()
    else activeReferenceJobs--
  }
}

// Reference bodies can remain alive while a slow upstream responds. Reserve
// their serialized size before reading files, independently of decoder slots.
const referenceRequestBudget = 96 * 1024 * 1024
let reservedReferenceBytes = 0
const referenceRequests: Array<{ bytes: number; resolve: () => void }> = []
function drainReferenceRequests() {
  while (referenceRequests.length && reservedReferenceBytes + referenceRequests[0].bytes <= referenceRequestBudget) {
    const next = referenceRequests.shift()!
    reservedReferenceBytes += next.bytes
    next.resolve()
  }
}
export async function withOutgoingReferenceRequest<T>(images: Array<{ filePath: string }>, run: () => Promise<T>) {
  if (!images.length) return run()
  const sizes = await Promise.all(images.map(async image => (await fs.stat(image.filePath)).size))
  const bytes = Math.min(referenceRequestBudget, Math.max(256 * 1024, sizes.reduce((sum, size) => sum + Math.max(size, 16 * 1024), 0) * 6))
  await new Promise<void>(resolve => { referenceRequests.push({ bytes, resolve }); drainReferenceRequests() })
  try { return await run() }
  finally { reservedReferenceBytes -= bytes; drainReferenceRequests() }
}

function isAnimatedPng(source: Buffer) {
  for (let offset = 8; offset + 12 <= source.length;) {
    const length = source.readUInt32BE(offset)
    if (offset + length + 12 > source.length) break
    if (source.toString('ascii', offset + 4, offset + 8) === 'acTL') return true
    offset += length + 12
  }
  return false
}

async function referenceMetadata(source: Buffer, mimeType: string) {
  try {
    const metadata = await sharp(source, { animated: true }).metadata()
    const expected: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'heif', 'image/svg+xml': 'svg' }
    if (!metadata.width || !metadata.height || metadata.format !== expected[mimeType]) throw new Error('图片格式与声明的 MIME 类型不一致')
    if (mimeType === 'image/png') {
      let complete = false
      for (let offset = 8; offset + 12 <= source.length;) {
        const size = source.readUInt32BE(offset)
        if (offset + size + 12 > source.length) break
        if (source.toString('ascii', offset + 4, offset + 8) === 'IEND') { complete = size === 0; break }
        offset += size + 12
      }
      if (!complete) throw new Error('PNG 文件不完整')
    }
    if (mimeType === 'image/jpeg' && source.lastIndexOf(Buffer.from([0xff, 0xd9])) < 2) throw new Error('JPEG 文件不完整')
    if (mimeType === 'image/webp' && (source.length < 12 || source.readUInt32LE(4) + 8 > source.length)) throw new Error('WebP 文件不完整')
    return metadata
  } catch (error) {
    throw new Error(`参考图无效，无法生成扰动副本：${error instanceof Error ? error.message : '图片损坏'}`)
  }
}

export async function assertReferenceModeSupported(image: { filePath: string; mimeType: string }, mode: unknown) {
  const selected = normalizeReferenceImageMode(mode)
  if (selected === 'original') return
  if (!extensions[image.mimeType]) throw new Error('此参考图格式暂不支持扰动，请使用原版方案或转换为 PNG、JPEG、WebP、GIF、AVIF')
  await withReferenceProcessing(async () => {
    const source = await fs.readFile(image.filePath)
    const metadata = await referenceMetadata(source, image.mimeType)
    if (selected === 'pixel' && image.mimeType === 'image/svg+xml') throw new Error('SVG 参考图请使用原版或无损方案；轻微像素扰动需先转换为位图')
    if (selected === 'pixel' && image.mimeType === 'image/png' && isAnimatedPng(source)) throw new Error('APNG 参考图请使用原版或无损方案，避免丢失动画帧')
    if (selected === 'pixel' && image.mimeType === 'image/avif') {
      if ((metadata.pages || 1) > 1 || source.subarray(8, 64).includes(Buffer.from('avis'))) throw new Error('动画 AVIF 请使用原版或无损方案，避免丢失动画帧')
    }
  })
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// Walk GIF blocks without re-encoding palettes, transparency, timing or frames.
function gifVariant(source: Buffer, seed: Buffer, pixels: boolean) {
  const data = Buffer.from(source)
  let offset = 13, paletteNumber = 0
  const palette = (count: number) => {
    if (offset + count * 3 > data.length) throw new Error('GIF 色表无效')
    if (pixels) {
      const noise = crypto.createHash('sha256').update(seed).update(String(paletteNumber++)).digest()
      for (let i = 0; i < count * 3; i++) {
        const value = data[offset + i]
        data[offset + i] = value === 0 ? 1 : value === 255 ? 254 : value + (noise[i % noise.length] & 1 ? 1 : -1)
      }
    }
    offset += count * 3
  }
  const skipBlocks = () => {
    for (;;) {
      if (offset >= data.length) throw new Error('GIF 数据块无效')
      const size = data[offset++]
      if (!size) break
      offset += size
      if (offset > data.length) throw new Error('GIF 数据块无效')
    }
  }
  if (data[10] & 0x80) palette(2 ** ((data[10] & 7) + 1))
  while (offset < data.length) {
    const kind = data[offset++]
    if (kind === 0x3b) {
      const comment = Buffer.from(seed.toString('hex'))
      return Buffer.concat([data.subarray(0, offset - 1), Buffer.from([0x21, 0xfe, comment.length]), comment, Buffer.from([0]), data.subarray(offset - 1)])
    }
    if (kind === 0x21) { offset++; skipBlocks(); continue }
    if (kind !== 0x2c || offset + 9 > data.length) throw new Error('GIF 图片块无效')
    const packed = data[offset + 8]
    offset += 9
    if (packed & 0x80) palette(2 ** ((packed & 7) + 1))
    offset++ // LZW minimum code size
    skipBlocks()
  }
  throw new Error('GIF 缺少结束标记')
}

function varyFile(source: Buffer, mimeType: string, seed: Buffer): Buffer {
  if (mimeType === 'image/png') {
    let offset = 8
    while (offset + 12 <= source.length) {
      const length = source.readUInt32BE(offset)
      if (offset + length + 12 > source.length) break
      if (source.toString('ascii', offset + 4, offset + 8) === 'IEND') {
        const content = Buffer.concat([Buffer.from('tEXtReference\0'), Buffer.from(seed.toString('hex'))])
        const chunk = Buffer.alloc(content.length + 8)
        chunk.writeUInt32BE(content.length - 4)
        content.copy(chunk, 4)
        chunk.writeUInt32BE(crc32(content), chunk.length - 4)
        return Buffer.concat([source.subarray(0, offset), chunk, source.subarray(offset)])
      }
      offset += length + 12
    }
    throw new Error('PNG 数据无效')
  }
  if (mimeType === 'image/jpeg') {
    // Insert after existing APP segments, preserving JFIF/EXIF positioning.
    let offset = 2
    while (offset + 4 <= source.length && source[offset] === 0xff && source[offset + 1] >= 0xe0 && source[offset + 1] <= 0xef) offset += 2 + source.readUInt16BE(offset + 2)
    const comment = Buffer.from(seed.toString('hex'))
    const header = Buffer.from([0xff, 0xfe, 0, comment.length + 2])
    return Buffer.concat([source.subarray(0, offset), header, comment, source.subarray(offset)])
  }
  if (mimeType === 'image/webp') {
    const chunk = Buffer.concat([Buffer.from('JUNK'), Buffer.alloc(4), seed])
    chunk.writeUInt32LE(seed.length, 4)
    const result = Buffer.concat([source, chunk])
    result.writeUInt32LE(result.length - 8, 4)
    return result
  }
  if (mimeType === 'image/gif') return gifVariant(source, seed, false)
  if (mimeType === 'image/avif') {
    const data = Buffer.from(source)
    for (let offset = 0; offset + 8 <= data.length;) {
      const size = data.readUInt32BE(offset)
      if (size === 0) { data.writeUInt32BE(data.length - offset, offset); break }
      const length = size === 1 ? Number(data.readBigUInt64BE(offset + 8)) : size
      if (length < 8 || offset + length > data.length) throw new Error('AVIF 数据无效')
      offset += length
    }
    const box = Buffer.concat([Buffer.alloc(4), Buffer.from('free'), seed])
    box.writeUInt32BE(box.length)
    return Buffer.concat([data, box])
  }
  if (mimeType === 'image/svg+xml') return Buffer.concat([source, Buffer.from(`\n<!-- reference:${seed.toString('hex')} -->`)])
  throw new Error('此参考图格式暂不支持扰动，请选择原版不变或转换为 PNG、JPEG、WebP、GIF、AVIF')
}

async function transformReferenceImage(source: Buffer, mimeType: string, mode: ReferenceImageMode, seed: Buffer) {
  if (mode === 'original') return { buffer: source, mimeType }
  const metadata = await referenceMetadata(source, mimeType)
  if (mode === 'lossless') return { buffer: varyFile(source, mimeType, seed), mimeType }
  if (mimeType === 'image/gif') return { buffer: gifVariant(source, seed, true), mimeType }
  if (mimeType === 'image/svg+xml') throw new Error('SVG 参考图请使用原版或无损方案；轻微像素扰动需先转换为位图')
  if (mimeType === 'image/png' && isAnimatedPng(source)) throw new Error('APNG 参考图请使用原版或无损方案，避免丢失动画帧')
  if (mimeType === 'image/avif' && (metadata.pages && metadata.pages > 1 || source.subarray(8, 64).includes(Buffer.from('avis')))) throw new Error('动画 AVIF 请使用原版或无损方案，避免丢失动画帧')
  const { data, info } = await sharp(source, { animated: true }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const noise = crypto.createHash('sha256').update(seed).digest()
  // RGB only; alpha and fully transparent pixels stay intact. Always start from the original.
  for (let pixel = 0; pixel < info.width * info.height; pixel++) {
    if (!data[pixel * 4 + 3]) continue
    const channel = noise[pixel % noise.length] % 3
    const offset = pixel * 4 + channel
    const value = data[offset]
    data[offset] = value === 0 ? 1 : value === 255 ? 254 : value + (noise[(pixel + 7) % noise.length] & 1 ? 1 : -1)
  }
  const pages = metadata.pages || 1
  const pipeline = () => {
    let image = sharp(data, { raw: { width: info.width, height: info.height, channels: 4, ...(pages > 1 ? { pageHeight: metadata.pageHeight } : {}) } })
    if (metadata.orientation) image = image.withMetadata({ orientation: metadata.orientation })
    return image
  }
  // Apply the size budget to the final transmitted bytes, including the nonce.
  // Small files have a 16 KiB floor for container overhead. Never inflate a
  // compressed photo back into a large lossless raster or silently resize it.
  const maxBytes = Math.max(16 * 1024, Math.min(source.length, 2 * 1024 * 1024))
  const encode = async (lossless: boolean, quality = 84) => varyFile(await pipeline().webp({
    lossless, quality, effort: 0, alphaQuality: 100, loop: metadata.loop, delay: metadata.delay,
  }).toBuffer(), 'image/webp', seed)
  // Lossless is cheap for small/flat images and preserves the exact RGB deltas.
  // Large photographic inputs go straight to bounded lossy encoding.
  if (source.length <= 128 * 1024) {
    const output = await encode(true)
    if (output.length <= maxBytes) return { buffer: output, mimeType: 'image/webp' }
  }
  let smallestOutput: Buffer | undefined
  for (const quality of [84, 80, 76, 72]) {
    const output = await encode(false, quality)
    if (output.length <= maxBytes) return { buffer: output, mimeType: 'image/webp' }
    if (!smallestOutput || output.length < smallestOutput.length) smallestOutput = output
  }
  // A format change can need a little container/codec overhead even when its
  // visible content is unchanged. Allow at most 5%, never beyond 2 MiB, rather
  // than lowering the quality floor or randomly failing near the size budget.
  const toleratedBytes = Math.max(16 * 1024, Math.min(Math.ceil(source.length * 1.05), 2 * 1024 * 1024))
  if (smallestOutput && smallestOutput.length <= toleratedBytes) return { buffer: smallestOutput, mimeType: 'image/webp' }
  throw new Error('像素扰动后的参考图无法压入体积上限，请先压缩参考图或选择无损文件扰动方案')
}

export async function varyReferenceImage(source: Buffer, mimeType: string, mode: ReferenceImageMode, seed = crypto.randomBytes(32)) {
  return withReferenceProcessing(() => transformReferenceImage(source, mimeType, mode, seed))
}

export async function readOutgoingReference(image: { filePath: string; mimeType: string }, mode: unknown, seed = crypto.randomBytes(32)) {
  return withReferenceProcessing(async () => {
    const result = await transformReferenceImage(await fs.readFile(image.filePath), image.mimeType, normalizeReferenceImageMode(mode), seed)
    return { ...result, fileName: `${crypto.randomUUID()}.${referenceExtension(result.mimeType)}` }
  })
}
