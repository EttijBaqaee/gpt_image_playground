import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { normalizeReferenceImageMode, type ReferenceImageMode } from './referenceImageMode.js'

const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' }
export function referenceExtension(mimeType: string) { return extensions[mimeType] || 'bin' }

function isAnimatedPng(source: Buffer) {
  for (let offset = 8; offset + 12 <= source.length;) {
    const length = source.readUInt32BE(offset)
    if (offset + length + 12 > source.length) break
    if (source.toString('ascii', offset + 4, offset + 8) === 'acTL') return true
    offset += length + 12
  }
  return false
}

export async function assertReferenceModeSupported(image: { filePath: string; mimeType: string }, mode: unknown) {
  const selected = normalizeReferenceImageMode(mode)
  if (selected === 'original') return
  if (!extensions[image.mimeType]) throw new Error('此参考图格式暂不支持扰动，请使用原版方案或转换为 PNG、JPEG、WebP、GIF、AVIF')
  if (selected === 'pixel' && image.mimeType === 'image/svg+xml') throw new Error('SVG 参考图请使用原版或无损方案；轻微像素扰动需先转换为位图')
  if (selected === 'pixel' && image.mimeType === 'image/png' && isAnimatedPng(await fs.readFile(image.filePath))) throw new Error('APNG 参考图请使用原版或无损方案，避免丢失动画帧')
  if (selected === 'pixel' && image.mimeType === 'image/avif') {
    const source = await fs.readFile(image.filePath)
    const metadata = await sharp(source, { animated: true }).metadata()
    if ((metadata.pages || 1) > 1 || source.subarray(8, 64).includes(Buffer.from('avis'))) throw new Error('动画 AVIF 请使用原版或无损方案，避免丢失动画帧')
  }
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

export async function varyReferenceImage(source: Buffer, mimeType: string, mode: ReferenceImageMode, seed = crypto.randomBytes(32)) {
  if (mode === 'original') return { buffer: source, mimeType }
  if (mode === 'lossless') return { buffer: varyFile(source, mimeType, seed), mimeType }
  if (mimeType === 'image/gif') return { buffer: gifVariant(source, seed, true), mimeType }
  if (mimeType === 'image/svg+xml') throw new Error('SVG 参考图请使用原版或无损方案；轻微像素扰动需先转换为位图')
  if (mimeType === 'image/png' && isAnimatedPng(source)) throw new Error('APNG 参考图请使用原版或无损方案，避免丢失动画帧')
  const metadata = await sharp(source, { animated: true }).metadata()
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
  let pipeline = sharp(data, { raw: { width: info.width, height: info.height, channels: 4, ...(pages > 1 ? { pageHeight: metadata.pageHeight } : {}) } })
  if (metadata.orientation) pipeline = pipeline.withMetadata({ orientation: metadata.orientation })
  // Lossless output avoids introducing JPEG/AVIF re-compression artifacts.
  const outputMime = mimeType === 'image/webp' ? 'image/webp' : 'image/png'
  const output = outputMime === 'image/webp'
    ? await pipeline.webp({ lossless: true, effort: 4, loop: metadata.loop, delay: metadata.delay }).toBuffer()
    : await pipeline.png().toBuffer()
  return { buffer: varyFile(output, outputMime, seed), mimeType: outputMime }
}

export async function readOutgoingReference(image: { filePath: string; mimeType: string }, mode: unknown) {
  const result = await varyReferenceImage(await fs.readFile(image.filePath), image.mimeType, normalizeReferenceImageMode(mode))
  return { ...result, fileName: `${crypto.randomUUID()}.${referenceExtension(result.mimeType)}` }
}
