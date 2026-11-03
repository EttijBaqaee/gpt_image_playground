import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import Fastify from 'fastify'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appConfig } from '../config.js'
import { AppDatabase, type ProviderProfileRecord } from './db.js'
import { createSession } from './auth.js'
import { encryptText } from './crypto.js'
import { settingsRoutes } from '../routes/settings.js'
import { executeImageTask, type TaskExecutionPayload } from './imageApi.js'
import {
  assertPublicReferenceSettings, canReadPublicReference, createPublicReferenceImageUrl,
  isPublicReferenceVerified, normalizePublicReferenceBaseUrl, publicReferenceRoutes, publicReferenceVerification,
} from './publicReferenceImages.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { vi.useRealTimers(); for (const fn of cleanup.splice(0).reverse()) await fn() })
const config = { appSecret: 'public-reference-test-secret', referenceBasePath: '/custom-references' }
function provider(origin = 'https://mabfx.com'): ProviderProfileRecord {
  return { id: 'p', apiMode: 'images', timeoutSeconds: 1500, publicReferenceEnabled: 1,
    publicReferenceBaseUrl: origin, publicReferenceVerification: publicReferenceVerification(config, origin) } as ProviderProfileRecord
}
async function setup(referenceBasePath = config.referenceBasePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gip-public-reference-'))
  const db = new AppDatabase(path.join(dir, 'app.db'))
  const app = Fastify()
  app.decorate('config', { ...appConfig, ...config, referenceBasePath, apiBasePath: '/backend', mediaBasePath: '/private-media', mediaDir: dir })
  app.decorate('db', db)
  await app.register(publicReferenceRoutes)
  await app.register(settingsRoutes, { prefix: '/backend' })
  app.setErrorHandler((error: Error, _request, reply) => reply.code(400).send({ message: error.message }))
  const { token } = createSession(app, { role: 'admin', usageCodeId: null })
  await app.ready()
  cleanup.push(async () => { await app.close(); db.sqlite.close(); fs.rmSync(dir, { recursive: true, force: true }) })
  return { app, db, dir, cookie: `gip_session=${token}` }
}
async function expose(app: Awaited<ReturnType<typeof setup>>['app'], transform?: (url: string) => string) {
  const server = createServer(async (req, res) => {
    if (transform?.(req.url!) === 'html') { res.setHeader('content-type', 'text/html'); res.end('<html>login</html>'); return }
    const result = await app.inject({ method: 'GET', url: transform ? transform(req.url!) : req.url! })
    res.writeHead(result.statusCode, result.headers); res.end(result.rawPayload)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}

describe('public reference URLs', () => {
  it('normalizes an origin and rejects paths, credentials, queries and other protocols', () => {
    expect(normalizePublicReferenceBaseUrl(' https://mabfx.com/ ')).toBe('https://mabfx.com')
    expect(normalizePublicReferenceBaseUrl('https://mabfx.com:8443')).toBe('https://mabfx.com:8443')
    expect(normalizePublicReferenceBaseUrl('http://203.0.113.10:8787/')).toBe('http://203.0.113.10:8787')
    expect(normalizePublicReferenceBaseUrl('http://[2001:db8::1]:8787/')).toBe('http://[2001:db8::1]:8787')
    for (const url of ['mabfx.com', 'https://mabfx.com/home/', 'https://a:b@mabfx.com', 'file:///tmp/x', 'https://mabfx.com/?x=y', 'https://mabfx.com/#x']) {
      expect(() => normalizePublicReferenceBaseUrl(url)).toThrow()
    }
  })
  it('binds check receipts to the origin, reference prefix and installation secret', () => {
    const settings = provider()
    expect(isPublicReferenceVerified(config, settings)).toBe(true)
    expect(isPublicReferenceVerified({ ...config, referenceBasePath: '/changed' }, settings)).toBe(false)
    expect(isPublicReferenceVerified({ ...appConfig, ...config, mediaBasePath: '/changed' }, settings)).toBe(true)
    expect(isPublicReferenceVerified({ ...config, appSecret: 'another' }, settings)).toBe(false)
    expect(isPublicReferenceVerified(config, { ...settings, publicReferenceBaseUrl: 'https://other.example' })).toBe(false)
    expect(() => assertPublicReferenceSettings(config, { ...settings, publicReferenceEnabled: true, publicReferenceVerification: 'forged' })).toThrow('检测')
  })
  it('uses the independent reference prefix and only signs input or mask paths', () => {
    const before = Date.now()
    const url = new URL(createPublicReferenceImageUrl(config, provider(), 'uploads/task/reference image.png'))
    expect(url.pathname).toBe('/custom-references/references/uploads/task/reference%20image.png')
    expect(Number(url.searchParams.get('ref_expires'))).toBeGreaterThanOrEqual(before + 3600_000)
    for (const name of ['outputs/t/a.png', 'uploads/../secret', 'uploads\\t\\a.png']) {
      expect(() => createPublicReferenceImageUrl(config, provider(), name)).toThrow()
    }
    for (const origin of ['http://203.0.113.10:8787', 'http://[2001:db8::1]:8787']) {
      expect(new URL(createPublicReferenceImageUrl(config, provider(origin), 'uploads/task/a.png')).origin).toBe(origin)
    }
  })
  it('checks a real HTTP round trip and gates saving and updates on its receipt', async () => {
    const { app, db, cookie } = await setup()
    const origin = await expose(app)
    const payload = { name: 'Public Images', baseUrl: 'https://supplier.example/v1', apiKey: 'dummy', model: 'gpt-image-2',
      apiMode: 'images', timeoutSeconds: 1500, publicReferenceEnabled: true, publicReferenceBaseUrl: origin }
    const post = (url: string, body: unknown, method: 'POST' | 'PUT' = 'POST') => app.inject({ method, url: '/backend/api/admin/' + url, payload: body, headers: { cookie } })
    expect((await app.inject({ method: 'POST', url: '/backend/api/admin/public-reference/check', payload: { publicReferenceBaseUrl: origin } })).statusCode).not.toBe(200)
    expect((await post('provider-profiles', payload)).statusCode).toBe(400)
    const check = await post('public-reference/check', { publicReferenceBaseUrl: origin })
    expect(check.statusCode).toBe(200)
    const proof = check.json()
    const saved = await post('provider-profiles', { ...payload, ...proof })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().publicReferenceVerification).toBe(proof.publicReferenceVerification)
    const row = db.getProviderProfile(saved.json().id)!
    expect(row.publicReferenceEnabled).toBe(1)
    expect(row.publicReferenceBaseUrl).toBe(origin)
    expect((await post('provider-profiles/' + row.id, { ...payload, publicReferenceBaseUrl: 'https://other.example', publicReferenceVerification: proof.publicReferenceVerification }, 'PUT')).statusCode).toBe(400)
    expect((await post('provider-profiles/' + row.id, { ...payload, publicReferenceEnabled: undefined, publicReferenceBaseUrl: 'https://other.example' }, 'PUT')).statusCode).toBe(400)
    const publicOptions = await app.inject({ url: '/backend/api/provider-options', headers: { cookie } })
    expect(publicOptions.body).not.toContain('publicReferenceVerification')
  })
  it.each(['login page', 'missing prefix', 'lost query'])('rejects %s during real HTTP checks', async kind => {
    const { app, cookie } = await setup()
    const origin = await expose(app, url => kind === 'login page' ? 'html' : kind === 'missing prefix' ? url.replace('/custom-references', '') : url.split('?')[0])
    const response = await app.inject({ method: 'POST', url: '/backend/api/admin/public-reference/check',
      payload: { publicReferenceBaseUrl: origin }, headers: { cookie } })
    expect(response.statusCode).toBe(400)
    expect(response.json()).not.toHaveProperty('publicReferenceVerification')
  })
  it('preserves settings on database reopen and adds disabled fields to an older database', async () => {
    const { db } = await setup()
    const saved = db.upsertProviderProfile({ id: 'p', name: 'p', baseUrl: 'https://supplier.example', apiKeyEncrypted: encryptText('dummy', config.appSecret),
      model: 'gpt-image-2', apiMode: 'images', timeoutSeconds: 1500, isDefault: true,
      publicReferenceEnabled: true, publicReferenceBaseUrl: 'https://mabfx.com', publicReferenceVerification: provider().publicReferenceVerification })!
    expect(db.getDefaultProviderProfile()?.publicReferenceVerification).toBe(saved.publicReferenceVerification)
    const persisted = new AppDatabase(db.sqlite.name)
    try {
      expect(persisted.getProviderProfile('p')).toMatchObject({
        publicReferenceEnabled: 1,
        publicReferenceBaseUrl: 'https://mabfx.com',
        publicReferenceVerification: saved.publicReferenceVerification,
      })
    } finally { persisted.sqlite.close() }
    db.sqlite.prepare('UPDATE provider_profiles SET public_reference_enabled=0').run()
    for (const column of ['public_reference_enabled', 'public_reference_base_url', 'public_reference_verification']) db.sqlite.exec(`ALTER TABLE provider_profiles DROP COLUMN ${column}`)
    const reopened = new AppDatabase(db.sqlite.name)
    try { expect(reopened.getProviderProfile('p')?.publicReferenceEnabled).toBe(0) } finally { reopened.sqlite.close() }
  })
  it('rejects tampered paths, signatures, expiry, other tasks, output files and disabled nodes', async () => {
    const { app } = await setup()
    const profile = provider()
    const file = 'uploads/task/a.png'
    const image = { taskId: 'task', kind: 'input', filePath: file }
    vi.spyOn(app.db, 'getTask').mockReturnValue({ providerProfileId: 'p' } as never)
    vi.spyOn(app.db, 'getProviderProfile').mockReturnValue(profile)
    const url = createPublicReferenceImageUrl(config, profile, file)
    expect(canReadPublicReference(app, url, image)).toBe(true)
    expect(canReadPublicReference(app, url, { ...image, filePath: file.replace(/\//g, '\\') })).toBe(true)
    expect(canReadPublicReference(app, url, { ...image, filePath: 'uploads/other/a.png' })).toBe(false)
    expect(canReadPublicReference(app, url, { ...image, kind: 'output' })).toBe(false)
    expect(canReadPublicReference(app, url.replace('ref_signature=', 'ref_signature=x'), image)).toBe(false)
    expect(canReadPublicReference(app, url.replace('/custom-references/references/', '/private-media/media/'), image)).toBe(false)
    expect(canReadPublicReference(app, url.replace('/custom-references/', '/other/'), image)).toBe(false)
    const changed = new URL(url); changed.searchParams.set('ref_provider', 'other')
    expect(canReadPublicReference(app, changed.toString(), image)).toBe(false)
    profile.publicReferenceEnabled = 0
    expect(canReadPublicReference(app, url, image)).toBe(false)
    profile.publicReferenceEnabled = 1
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 3600_001)
    expect(canReadPublicReference(app, url, image)).toBe(false)
  })
  it('sends ordered URL objects and a mask to the real Images edits endpoint', async () => {
    const received: Array<{ url: string; type: string; body: Record<string, unknown> }> = []
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer()
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = []; for await (const part of req) chunks.push(part)
      received.push({ url: req.url!, type: req.headers['content-type']!, body: JSON.parse(Buffer.concat(chunks).toString()) })
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
    const paths = ['third.png', 'first.png', 'second.png']
    const payload = { prompt: 'ordered references', params: { size: 'auto', quality: 'auto', output_format: 'png', output_compression: null, moderation: 'auto', n: 1 },
      provider: { ...provider(), model: 'gpt-image-2', baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, maxReferenceImages: 16 },
      inputImages: paths.map(filePath => ({ filePath, mimeType: 'image/png' })), maskImage: { filePath: 'mask.png', mimeType: 'image/png' } } as TaskExecutionPayload
    await executeImageTask(null as never, payload, 'dummy', { publicReferenceImageUrl: image => 'https://mabfx.com/custom-references/references/uploads/' + image.filePath })
    expect(received).toHaveLength(1)
    expect(received[0].url).toBe('/v1/images/edits')
    expect(received[0].type).toBe('application/json')
    expect(received[0].body.images).toEqual(paths.map(name => ({ image_url: 'https://mabfx.com/custom-references/references/uploads/' + name })))
    expect(received[0].body.mask).toEqual({ image_url: 'https://mabfx.com/custom-references/references/uploads/mask.png' })
    expect(JSON.stringify(received[0])).not.toContain('data:image')
  })
  it.each(['', '/r/custom'])('serves only signed inputs and masks through reference prefix %s', async referenceBasePath => {
    const { app, db, dir, cookie } = await setup(referenceBasePath)
    const origin = await expose(app)
    const checked = await app.inject({ method: 'POST', url: '/backend/api/admin/public-reference/check',
      payload: { publicReferenceBaseUrl: origin }, headers: { cookie } })
    expect(checked.statusCode).toBe(200)
    const profile = db.upsertProviderProfile({ id: 'p', name: 'p', baseUrl: 'https://supplier.example',
      apiKeyEncrypted: encryptText('dummy', config.appSecret), model: 'gpt-image-2', apiMode: 'images', timeoutSeconds: 300,
      isDefault: true, publicReferenceEnabled: true, ...checked.json() })!
    db.createTask({ id: 't', prompt: 'references', paramsJson: '{}', providerProfileId: 'p' })
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'green' } }).png().toBuffer()
    for (const [kind, filePath] of [['input', 'uploads/t/ref.png'], ['mask', 'masks/t/mask.png'], ['output', 'outputs/t/out.png']] as const) {
      fs.mkdirSync(path.dirname(path.join(dir, filePath)), { recursive: true })
      fs.writeFileSync(path.join(dir, filePath), png)
      db.addTaskImage({ id: kind, taskId: 't', kind, filePath, mimeType: 'image/png', bytes: png.length, sha256: 'dummy' })
      if (kind === 'output') continue
      const signed = new URL(createPublicReferenceImageUrl(app.config, profile, filePath))
      const url = signed.pathname + signed.search
      const get = await app.inject({ url })
      expect(get.statusCode).toBe(200)
      expect(get.rawPayload).toEqual(png)
      expect(get.headers['cache-control']).toBe('private, no-store')
      expect((await app.inject({ url, method: 'HEAD' })).headers['content-length']).toBe(String(png.length))
      expect((await app.inject({ url: signed.pathname })).statusCode).toBe(401)
      expect((await app.inject({ url: url.replace('ref_signature=', 'ref_signature=x') })).statusCode).toBe(401)
      expect((await app.inject({ url: url.replace(`${referenceBasePath}/references/`, '/private-media/media/') })).statusCode).toBe(404)
    }
    expect((await app.inject({ url: `${referenceBasePath}/references/outputs/t/out.png` })).statusCode).toBe(404)
    expect((await app.inject({ url: `${referenceBasePath}/references/uploads/t/missing.png` })).statusCode).toBe(401)
    const url = new URL(createPublicReferenceImageUrl(app.config, profile, 'uploads/t/ref.png'))
    db.sqlite.prepare('UPDATE provider_profiles SET public_reference_enabled=0').run()
    expect((await app.inject({ url: url.pathname + url.search })).statusCode).toBe(401)
  })
})
