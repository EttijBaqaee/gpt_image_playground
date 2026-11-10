import { normalizeReferenceImageMode, type ReferenceImageMode } from './referenceImageMode.js'
import { referenceExtension, varyReferenceImage } from './outgoingReferenceImages.js'
import crypto from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat, readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from './auth.js'
import { fetchWithProviderProxy } from './upstreamFetch.js'
import type { ProviderProfileRecord } from './db.js'

type Config = { appSecret: string; referenceBasePath: string }
type PublicReferenceSettings = {
  publicReferenceEnabled?: boolean | number
  publicReferenceBaseUrl?: string | null
  publicReferenceVerification?: string | null
}
const probes = new Map<string, { bytes: Buffer; expires: number }>()
function configurationError(message: string) { return Object.assign(new Error(message), { statusCode: 400 }) }

export function normalizePublicReferenceBaseUrl(value: string) {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw configurationError('请填写完整公网地址，例如 https://example.com') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw configurationError('公网地址只填写协议、域名和可选端口，不包含路径、账号或查询参数')
  }
  return url.origin
}

function sign(secret: string, values: unknown[]) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(values)).digest('base64url')
}
function matches(actual: string, expected: string) {
  const left = Buffer.from(actual), right = Buffer.from(expected)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}
export function publicReferenceVerification(config: Config, origin: string) {
  return sign(config.appSecret, ['public-reference-verified-v2', normalizePublicReferenceBaseUrl(origin), config.referenceBasePath])
}
export function isPublicReferenceVerified(config: Config, settings: PublicReferenceSettings) {
  try {
    return Boolean(settings.publicReferenceVerification) && matches(settings.publicReferenceVerification!, publicReferenceVerification(config, settings.publicReferenceBaseUrl || ''))
  } catch { return false }
}
export function assertPublicReferenceSettings(config: Config, settings: PublicReferenceSettings & { apiMode: string; codexCli?: boolean; grokApiCompat?: boolean }) {
  if (!settings.publicReferenceEnabled) return
  if (settings.apiMode !== 'images' || settings.codexCli) {
    throw configurationError('公网参考图仅支持 Images 模式，请关闭 Codex CLI 模式')
  }
  normalizePublicReferenceBaseUrl(settings.publicReferenceBaseUrl || '')
  if (!isPublicReferenceVerified(config, settings)) throw configurationError('请先检测公网参考图地址，检测通过后才能保存')
}

function signedReferenceUrl(config: Config, origin: string, filePath: string, providerId: string, expires: number) {
  const url = new URL(`${config.referenceBasePath}/references/${filePath.split('/').map(encodeURIComponent).join('/')}`, origin)
  url.searchParams.set('ref_provider', providerId)
  url.searchParams.set('ref_expires', String(expires))
  url.searchParams.set('ref_signature', sign(config.appSecret, ['public-reference-image-v2', config.referenceBasePath, providerId, filePath, expires]))
  return url.toString()
}
function validReferenceSignature(config: Config, url: URL, filePath: string, providerId: string) {
  const root = `${config.referenceBasePath}/references/`
  try {
    if (!url.pathname.startsWith(root) || decodeURIComponent(url.pathname.slice(root.length)) !== filePath) return false
  } catch { return false }
  const expires = Number(url.searchParams.get('ref_expires'))
  return Number.isSafeInteger(expires) && expires > Date.now() && url.searchParams.get('ref_provider') === providerId
    && matches(url.searchParams.get('ref_signature') || '', sign(config.appSecret, ['public-reference-image-v2', config.referenceBasePath, providerId, filePath, expires]))
}
function isReferenceFilePath(filePath: string) {
  return !filePath.includes('\\') && !filePath.includes('\0') && !filePath.split('/').some(part => !part || part === '.' || part === '..')
    && /^(uploads|masks)\//.test(filePath)
}
type Variant = { filePath: string; mimeType: string; mode: ReferenceImageMode; seed: string }
function variantKey(config: Config) {
  return crypto.createHash('sha256').update('public-reference-variant-v1\0').update(config.appSecret).digest()
}
function encodeVariant(config: Config, route: string, variant: Variant) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', variantKey(config), iv)
  cipher.setAAD(Buffer.from(config.referenceBasePath + '/' + route))
  const bytes = Buffer.concat([cipher.update(JSON.stringify(variant)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64url')
}
function decodeVariant(config: Config, route: string, token: string): Variant {
  if (token.length > 4096) throw new Error('Invalid variant')
  const bytes = Buffer.from(token, 'base64url')
  const decipher = crypto.createDecipheriv('aes-256-gcm', variantKey(config), bytes.subarray(0, 12))
  decipher.setAAD(Buffer.from(config.referenceBasePath + '/' + route))
  decipher.setAuthTag(bytes.subarray(12, 28))
  const variant = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()) as Variant
  if (!isReferenceFilePath(variant.filePath) || !/^[a-f0-9]{64}$/.test(variant.seed) || !['lossless', 'pixel'].includes(variant.mode)) throw new Error('Invalid variant')
  return variant
}
export function createPublicReferenceImageUrl(config: Config, provider: ProviderProfileRecord, filePath: string, options: { mode?: ReferenceImageMode; mimeType?: string; mask?: boolean } = {}) {
  if (!provider.publicReferenceEnabled || !isPublicReferenceVerified(config, provider)) throw new Error('公网参考图配置尚未通过检测，请重新检测并保存该节点')
  if (!isReferenceFilePath(filePath)) {
    throw new Error('公网参考图只能引用当前任务的输入图片或遮罩')
  }
  // Generated at execution time, after queuing. Leave room for a retry and
  // provider-side image fetching, with a minimum lifetime of one hour.
  const expires = Date.now() + Math.max(3600, provider.timeoutSeconds * 2 + 60) * 1000
  const mode = normalizeReferenceImageMode(options.mode ?? provider.referenceImageMode)
  const origin = normalizePublicReferenceBaseUrl(provider.publicReferenceBaseUrl || '')
  if (mode === 'original') return signedReferenceUrl(config, origin, filePath, provider.id, expires)
  const mimeType = options.mimeType || 'image/png'
  const effectiveMode = options.mask && mode === 'pixel' ? 'lossless' : mode
  const outputMime = effectiveMode === 'pixel' && ['image/jpeg', 'image/avif'].includes(mimeType) ? 'image/png' : mimeType
  const route = `.variants/${crypto.randomUUID()}/${crypto.randomUUID()}.${referenceExtension(outputMime)}`
  const url = new URL(signedReferenceUrl(config, origin, route, provider.id, expires))
  url.searchParams.set('ref_variant', encodeVariant(config, route, { filePath, mimeType, mode: effectiveMode, seed: crypto.randomBytes(32).toString('hex') }))
  return url.toString()
}

function publicReferenceProbe(config: Config, rawUrl: string): Buffer | null {
  const url = new URL(rawUrl, 'http://local')
  const prefix = `${config.referenceBasePath}/references/.check/`
  if (!url.pathname.startsWith(prefix)) return null
  const nonce = url.pathname.slice(prefix.length)
  const probe = probes.get(nonce)
  if (!probe || probe.expires <= Date.now() || !validReferenceSignature(config, url, `.check/${nonce}`, 'probe')) return null
  return probe.bytes
}
export function canReadPublicReference(app: FastifyInstance, rawUrl: string, image: { taskId: string; kind: string; filePath: string }) {
  if (!['input', 'mask'].includes(image.kind)) return false
  const task = app.db.getTask(image.taskId)
  if (!task?.providerProfileId) return false
  const provider = app.db.getProviderProfile(task.providerProfileId)
  if (!provider?.publicReferenceEnabled || !isPublicReferenceVerified(app.config, provider)) return false
  const filePath = image.filePath.replace(/\\/g, '/')
  return isReferenceFilePath(filePath) && validReferenceSignature(app.config, new URL(rawUrl, 'http://local'), filePath, provider.id)
}

export const publicReferenceRoutes: FastifyPluginAsync = async app => {
  app.get(`${app.config.referenceBasePath}/references/.check/:nonce`, async (request, reply) => {
    const bytes = publicReferenceProbe(app.config, request.url)
    if (!bytes) return reply.code(404).send({ message: '检测图片不存在或已失效' })
    return reply.header('Cache-Control', 'no-store').type('image/png').send(bytes)
  })
  app.get<{ Params: { '*': string } }>(`${app.config.referenceBasePath}/references/*`, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store')
    const relativePath = request.params['*']
    if (/^\.variants\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z]+$/.test(relativePath)) {
      const url = new URL(request.url, 'http://local')
      const providerId = url.searchParams.get('ref_provider') || ''
      if (!validReferenceSignature(app.config, url, relativePath, providerId)) return reply.code(401).send({ message: '参考图链接无效或已过期' })
      let variant: Variant
      try { variant = decodeVariant(app.config, relativePath, url.searchParams.get('ref_variant') || '') }
      catch { return reply.code(401).send({ message: '参考图链接无效或已过期' }) }
      const image = app.db.getTaskImageByFilePath(variant.filePath)
      const task = image ? app.db.getTask(image.taskId) : null
      const provider = app.db.getProviderProfile(providerId)
      // The token carries the immutable mode and seed. Changing the profile's
      // mode never invalidates a URL, including across a server restart.
      if (!image || !['input', 'mask'].includes(image.kind) || task?.providerProfileId !== providerId || !provider?.publicReferenceEnabled || !isPublicReferenceVerified(app.config, provider) || image.mimeType !== variant.mimeType || image.kind === 'mask' && variant.mode === 'pixel') return reply.code(401).send({ message: '参考图链接无效或已过期' })
      const bytes = await readFile(path.join(app.config.mediaDir, variant.filePath)).catch(() => null)
      if (!bytes) return reply.code(404).send({ message: '参考图不存在' })
      const result = await varyReferenceImage(bytes, variant.mimeType, variant.mode, Buffer.from(variant.seed, 'hex'))
      return reply.header('Content-Length', result.buffer.length).header('X-Content-Type-Options', 'nosniff').type(result.mimeType).send(result.buffer)
    }
    if (!isReferenceFilePath(relativePath)) return reply.code(404).send({ message: '参考图不存在' })
    const image = app.db.getTaskImageByFilePath(relativePath)
    if (!image || !canReadPublicReference(app, request.url, image)) {
      return reply.code(401).send({ message: '参考图链接无效或已过期' })
    }
    const filePath = path.join(app.config.mediaDir, relativePath)
    const file = await stat(filePath).catch(() => null)
    if (!file?.isFile()) return reply.code(404).send({ message: '参考图不存在' })
    return reply.header('Content-Length', file.size).header('X-Content-Type-Options', 'nosniff')
      .type(image.mimeType).send(createReadStream(filePath))
  })
  app.post(`${app.config.apiBasePath}/api/admin/public-reference/check`, async (request, reply) => {
    await requireAdmin(app, request, reply)
    const payload = z.object({ publicReferenceBaseUrl: z.string().min(1) }).parse(request.body)
    const origin = normalizePublicReferenceBaseUrl(payload.publicReferenceBaseUrl)
    const nonce = `${crypto.randomUUID()}.png`
    const bytes = await sharp(crypto.randomBytes(48), { raw: { width: 4, height: 4, channels: 3 } }).png().toBuffer()
    const expires = Date.now() + 15_000
    probes.set(nonce, { bytes, expires })
    const testUrl = signedReferenceUrl(app.config, origin, `.check/${nonce}`, 'probe', expires)
    try {
      const response = await fetchWithProviderProxy({ timeoutSeconds: 10 }, testUrl, { redirect: 'error', cache: 'no-store' })
      if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('image/png')) {
        await response.body?.cancel()
        throw new Error(`公网地址未返回检测图片（HTTP ${response.status}），请检查公网地址和参考图路径反代`)
      }
      // A bounded read also rejects login pages, stale cached images and an
      // unrelated server serving another image at the same path.
      const reader = response.body!.getReader()
      const chunks: Uint8Array[] = []
      let count = 0
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          count += value.length
          if (count > bytes.length) throw new Error('公网地址返回的图片与本次检测不一致')
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => {}) }
      if (!Buffer.concat(chunks).equals(bytes)) throw new Error('公网地址返回的图片与本次检测不一致')
      return { publicReferenceBaseUrl: origin, publicReferenceVerification: publicReferenceVerification(app.config, origin), message: '当前服务器图片访问检测通过' }
    } catch (error) {
      return reply.code(400).send({ message: `检测失败：${error instanceof Error ? error.message : '无法访问公网图片'}。请确认反代保留参考图路径和查询参数，且无需额外登录。` })
    } finally { probes.delete(nonce) }
  })
}
