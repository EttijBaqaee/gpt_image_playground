import crypto from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
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
  if (settings.apiMode !== 'images' || settings.codexCli || settings.grokApiCompat) {
    throw configurationError('公网参考图仅支持标准 Images 模式，请关闭 Grok API 兼容和 Codex CLI 模式')
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
export function createPublicReferenceImageUrl(config: Config, provider: ProviderProfileRecord, filePath: string) {
  if (!provider.publicReferenceEnabled || !isPublicReferenceVerified(config, provider)) throw new Error('公网参考图配置尚未通过检测，请重新检测并保存该节点')
  if (!isReferenceFilePath(filePath)) {
    throw new Error('公网参考图只能引用当前任务的输入图片或遮罩')
  }
  // Generated at execution time, after queuing. Leave room for a retry and
  // provider-side image fetching, with a minimum lifetime of one hour.
  const expires = Date.now() + Math.max(3600, provider.timeoutSeconds * 2 + 60) * 1000
  return signedReferenceUrl(config, normalizePublicReferenceBaseUrl(provider.publicReferenceBaseUrl || ''), filePath, provider.id, expires)
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
      return { publicReferenceBaseUrl: origin, publicReferenceVerification: publicReferenceVerification(app.config, origin), message: '公网图片访问检测通过' }
    } catch (error) {
      return reply.code(400).send({ message: `检测失败：${error instanceof Error ? error.message : '无法访问公网图片'}。请确认反代保留参考图路径和查询参数，且无需额外登录。` })
    } finally { probes.delete(nonce) }
  })
}
