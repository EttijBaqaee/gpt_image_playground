import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appConfig } from '../config.js'
import { AppDatabase } from '../lib/db.js'
import { createSession } from '../lib/auth.js'
import { TaskEventBus } from '../lib/eventBus.js'
import { taskRoutes } from './tasks.js'
import { authRoutes } from './auth.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn() })
async function setup(prefix = '', trusted: false | string[] = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gip-integration-'))
  const app = Fastify({ trustProxy: trusted })
  const db = new AppDatabase(path.join(dir, 'app.db'))
  app.decorate('config', { ...appConfig, mediaDir: dir, appSecret: 'integration-test-secret', adminPassword: 'integration-password', uploadFileBytes: 1024, uploadTotalBytes: 1536 })
  app.decorate('db', db)
  app.decorate('taskEvents', new TaskEventBus())
  app.decorate('taskWorker', { enqueue: vi.fn() })
  const now = new Date().toISOString()
  for (const [id, mode] of [['p', 'images'], ['v', 'videos']]) {
    db.sqlite.prepare(`INSERT INTO provider_profiles (id,name,base_url,api_key_encrypted,model,api_mode,timeout_seconds,created_at,updated_at) VALUES (?,?,'http://127.0.0.1:1','enc','model',?,60,?,?)`).run(id,id,mode,now,now)
  }
  db.createUsageCode({ id: 'u', codeHash: 'hash', codeEncrypted: 'enc', name: 'test', imageQuota: null, providerImageQuotas: { p: 2 }, providerVideoQuotas: { v: 2 } })
  db.setDistributionSettings({ ...db.getDistributionSettings(), enabled: true })
  const { token } = createSession(app, { role: 'user', usageCodeId: 'u' })
  await app.register(multipart)
  await app.register(taskRoutes, { prefix })
  await app.register(authRoutes, { prefix })
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => reply.code(error.statusCode ?? 400).send({ message: error.message }))
  app.get('/test-ip', (request) => ({ip:request.ip}))
  await app.ready()
  cleanup.push(async () => { await app.close(); db.sqlite.close(); fs.rmSync(dir, { recursive: true, force: true }) })
  return { app, db, dir, cookie: `gip_session=${token}` }
}
function body(fields: Record<string, string>, files: Buffer[] = []) {
  const boundary = 'gip-test-boundary'
  const chunks: Buffer[] = []
  for (const [key, value] of Object.entries(fields)) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`))
  for (const buffer of files) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="same.png"\r\nContent-Type: image/png\r\n\r\n`), buffer, Buffer.from('\r\n'))
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}
async function submit(app: FastifyInstance, cookie: string, fields: Record<string, string> = {}, files: Buffer[] = [], prefix = '') {
  const data = body({ prompt: 'test', providerProfileId: 'p', ...fields }, files)
  return app.inject({ method: 'POST', url: `${prefix}/api/tasks`, ...data, headers: { ...data.headers, cookie } })
}
function expectEmpty(db: AppDatabase) {
  expect(db.listTasks()).toHaveLength(0)
  expect(db.listUsageQuotaEvents('u')).toHaveLength(0)
  expect(db.getUsageCode('u')?.usedImageCredits).toBe(0)
  expect(db.getUsageCode('u')?.usedVideoCredits).toBe(0)
}

describe('task creation integration', () => {
  it('rejects excess reference images before reserving quota', async () => {
    const { app, db, cookie } = await setup()
    db.sqlite.prepare('UPDATE provider_profiles SET max_reference_images=1 WHERE id=?').run('p')
    expect((await submit(app,cookie,{},[Buffer.from('a'),Buffer.from('b')])).statusCode).toBe(400)
    expectEmpty(db)
  })
  it('stores same-name attachments at unique paths with their original bytes', async () => {
    const { app, db, dir, cookie } = await setup('/aaa')
    const response = await submit(app,cookie,{},[Buffer.from('one'),Buffer.from('two')],'/aaa')
    expect(response.statusCode).toBe(201)
    const rows = db.sqlite.prepare('SELECT file_path FROM task_images ORDER BY rowid').all() as Array<{file_path:string}>
    expect(new Set(rows.map((row) => row.file_path)).size).toBe(2)
    expect(rows.map((row) => fs.readFileSync(path.join(dir,row.file_path),'utf8'))).toEqual(['one','two'])
    expect(db.getUsageCode('u')?.usedImageCredits).toBe(1)
    expect(app.taskWorker.enqueue).toHaveBeenCalledTimes(1)
    expect((await app.inject('/api/tasks')).statusCode).toBe(404)
  })
  for (const taskType of ['image','video']) {
    it(`rolls back ${taskType} quota, task, event and files when attachment insert fails`, async () => {
      const { app, db, dir, cookie } = await setup()
      vi.spyOn(db, 'addTaskImage').mockImplementation(() => { throw new Error('injected attachment failure') })
      const response = await submit(app,cookie,{ taskType, providerProfileId: taskType === 'video' ? 'v' : 'p' },[Buffer.from('one')])
      expect(response.statusCode).toBe(500)
      expectEmpty(db)
      expect(app.taskWorker.enqueue).not.toHaveBeenCalled()
      expect(fs.existsSync(path.join(dir,'uploads')) ? fs.readdirSync(path.join(dir,'uploads')) : []).toEqual([])
    })
    it(`refunds ${taskType} quota once and prevents overspending`, async () => {
      const { app, db, cookie } = await setup()
      const fields = { taskType, providerProfileId: taskType === 'video' ? 'v' : 'p' }
      const responses = await Promise.all([submit(app,cookie,fields),submit(app,cookie,fields),submit(app,cookie,fields)])
      expect(responses.map((r) => r.statusCode).sort()).toEqual([201,201,403])
      const task = db.listTasks()[0]
      expect(db.refundTaskQuota(task.id,'test')).toBe(true)
      expect(db.refundTaskQuota(task.id,'test')).toBe(false)
      expect(taskType === 'video' ? db.getUsageCode('u')?.usedVideoCredits : db.getUsageCode('u')?.usedImageCredits).toBe(1)
    })
  }
  it('rejects single-file and aggregate upload limits without quota or task side effects', async () => {
    const { app, db, cookie } = await setup()
    expect((await submit(app,cookie,{},[Buffer.alloc(1025)])).statusCode).toBe(413)
    expect((await submit(app,cookie,{},[Buffer.alloc(800),Buffer.alloc(800)])).statusCode).toBe(413)
    expectEmpty(db)
  })
  it('rejects anonymous uploads before consuming files', async () => {
    const { app, db } = await setup()
    expect((await submit(app,'',{},[Buffer.alloc(2000)])).statusCode).toBe(401)
    expectEmpty(db)
  })
  it('rolls back quota when task insertion fails', async () => {
    const { app, db, cookie } = await setup()
    vi.spyOn(db,'createTask').mockImplementation(() => { throw new Error('injected task failure') })
    expect((await submit(app,cookie)).statusCode).toBe(500)
    expectEmpty(db)
  })
  it('rolls back quota and task if the initial event cannot be stored', async () => {
    const { app, db, cookie } = await setup()
    vi.spyOn(db,'appendTaskEvent').mockImplementation(() => { throw new Error('injected event failure') })
    expect((await submit(app,cookie)).statusCode).toBe(500)
    expectEmpty(db)
    expect(app.taskWorker.enqueue).not.toHaveBeenCalled()
  })
  it('removes request-owned files when quota reservation is rejected', async () => {
    const { app, db, dir, cookie } = await setup()
    const response = await submit(app,cookie,{params:JSON.stringify({n:3})},[Buffer.from('one')])
    expect(response.statusCode).toBe(403)
    expectEmpty(db)
    expect(fs.readdirSync(path.join(dir,'uploads'))).toEqual([])
  })
  it('limits multipart file and field counts before creating a task', async () => {
    const { app, db, cookie } = await setup()
    expect((await submit(app,cookie,{},Array.from({length:33},()=>Buffer.from('a')))).statusCode).toBe(413)
    const extraFields=Object.fromEntries(Array.from({length:17},(_,i)=>['field'+i,'value']))
    expect((await submit(app,cookie,extraFields)).statusCode).toBe(413)
    expectEmpty(db)
  })
  it('does not trust spoofed forwarded IPs for login rate limits by default', async () => {
    const { app } = await setup()
    for (let i=0;i<9;i++) {
      const response = await app.inject({ method:'POST',url:'/api/auth/admin/login',remoteAddress:'10.33.1.1',headers:{'x-forwarded-for':`203.0.113.${i+1}`},payload:{password:'wrong'} })
      expect(response.statusCode).toBe(i<8 ? 401 : 429)
    }
  })
  it('uses forwarded IP only for explicitly trusted proxy addresses', async () => {
    const { app } = await setup('', ['10.33.2.1'])
    expect((await app.inject({url:'/test-ip',remoteAddress:'10.33.2.1',headers:{'x-forwarded-for':'203.0.113.5'}})).json().ip).toBe('203.0.113.5')
    expect((await app.inject({url:'/test-ip',remoteAddress:'10.33.2.2',headers:{'x-forwarded-for':'203.0.113.5'}})).json().ip).toBe('10.33.2.2')
  })
})
