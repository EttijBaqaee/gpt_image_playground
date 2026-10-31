/**
 * Run against an isolated Vite development server (default http://127.0.0.1:5173).
 * Requires Playwright (`npm install --no-save --package-lock=false playwright`).
 * Optional: PLAYWRIGHT_MODULE=file:///.../playwright/index.mjs; BROWSER_CHANNEL=msedge.
 * Build the server first (`npm run build:server`). Starts an isolated API on
 * Vite's backend port 8787, using the real task route, SQLite, and TaskWorker.
 * A local supplier fixture returns a PNG; no external supplier is contacted.
 * Real Chromium touch input, multipart requests, throttled HTTP, and delayed
 * FileReader/IndexedDB completion are used, rather than directly invoking drag handlers.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AppDatabase } from '../server/dist/lib/db.js'
import { appConfig } from '../server/dist/config.js'
import { createSession } from '../server/dist/lib/auth.js'
import { encryptText } from '../server/dist/lib/crypto.js'
import { TaskEventBus } from '../server/dist/lib/eventBus.js'
import { TaskWorker } from '../server/dist/lib/taskWorker.js'
import { taskRoutes } from '../server/dist/routes/tasks.js'
const requireServer = createRequire(new URL('../server/package.json', import.meta.url))
const Fastify = requireServer('fastify')
const multipart = requireServer('@fastify/multipart')

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5173'
const output = path.resolve(process.env.TEST_OUTPUT || 'touch-sort-async-validation')
await mkdir(output, { recursive: true })
const checks = [], captures = [], workerCalls = [], returnedTasks = [], pageErrors = []
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const gate = () => { let release; const promise = new Promise((resolve) => { release = resolve }); return { promise, release } }
let uploadGate = null, uploadFailure = false, imageGate = null
const provider = { id: 'browser-fixture', name: 'Local browser fixture', apiMode: 'images', model: 'test', isDefault: true, timeoutSeconds: 300, maxReferenceImages: 16 }
const auth = { authenticated: true, role: 'admin', distributionEnabled: false, adminConfigured: true, usageCodes: [], user: null, maintenance: { active: false, operation: null, phase: 'idle', message: '', progressPercent: 0 } }
const dataDir = path.join(output, `isolated-data-${Date.now()}`)
await mkdir(dataDir, { recursive: true })
const db = new AppDatabase(path.join(dataDir, 'app.db'))
const secret = 'local-browser-order-test-only'
const fixtureConfig = { ...appConfig, appSecret: secret, adminPassword: 'test-only', mediaDir: path.join(dataDir, 'media'), outputsDir: path.join(dataDir, 'media/outputs'), thumbsDir: path.join(dataDir, 'media/thumbs'), maxConcurrentTasks: 1 }
const now = new Date().toISOString()
db.sqlite.prepare(`INSERT INTO provider_profiles (id,name,base_url,api_key_encrypted,model,api_mode,timeout_seconds,created_at,updated_at) VALUES (?,?,'http://127.0.0.1:8787/v1',?,'test','images',60,?,?)`).run(provider.id, provider.name, encryptText('local-test', secret), now, now)
const taskEvents = new TaskEventBus()
const worker = new TaskWorker(db, taskEvents, fixtureConfig)
const taskApp = Fastify()
taskApp.decorate('config', fixtureConfig); taskApp.decorate('db', db)
taskApp.decorate('taskEvents', taskEvents); taskApp.decorate('taskWorker', worker)
await taskApp.register(multipart)
await taskApp.register(taskRoutes)
await taskApp.ready()
const cookie = `gip_session=${createSession(taskApp, { role: 'admin' }).token}`
const api = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const json = (value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
    if (url.pathname === '/v1/images/edits') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] } }).formData()
      const images = [...form.entries()].filter(([key, value]) => key.startsWith('image') && typeof value !== 'string').map(([, value]) => value)
      workerCalls.push(await Promise.all(images.map(async (file) => hash(Buffer.from(await file.arrayBuffer())))))
      return json({ data: [{ b64_json: captures.fixturePng }] })
    }
    if (url.pathname.endsWith('/events')) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': test fixture\n\n'); return }
    if (url.pathname === '/api/auth/status') return json(auth)
    if (url.pathname === '/api/provider-options') return json({ items: [provider] })
    if (url.pathname === '/api/runtime-settings') return json({ ...provider, baseUrl: '', apiKey: '', apiKeyConfigured: true, clearInputAfterSubmit: false, persistInputOnRestart: true })
    if (url.pathname === '/media/slow.png') {
      if (imageGate) await imageGate.promise
      res.writeHead(200, { 'content-type': 'image/png' }); res.end(Buffer.from(captures.fixturePng, 'base64')); return
    }
    if (url.pathname === '/api/tasks' && req.method === 'POST') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = Buffer.concat(chunks)
      const form = await new Response(body, { headers: { 'content-type': req.headers['content-type'] } }).formData()
      const inputs = await Promise.all(form.getAll('input').map(async (file) => ({ name: file.name, hash: hash(Buffer.from(await file.arrayBuffer())) })))
      const captured = { inputs, prompt: form.get('prompt'), receivedAt: Date.now() }
      captures.push(captured)
      if (uploadGate) await uploadGate.promise
      if (uploadFailure) return json({ message: 'Simulated network failure' }, 503)
      const actual = await taskApp.inject({ method: 'POST', url: '/api/tasks', payload: body, headers: { 'content-type': req.headers['content-type'], cookie } })
      if (actual.statusCode === 201) {
        const task = actual.json().task
        returnedTasks.push(task)
        captured.taskId = task.id
        const images = db.listTaskImages(task.id).filter((image) => image.kind === 'input')
        captured.persistedHashes = images.map((image) => image.sha256)
        captured.detailHashes = task.inputImageIds.map((id) => images.find((image) => image.id === id).sha256)
      }
      return json(actual.json(), actual.statusCode)
    }
    if (url.pathname === '/api/tasks') return json({ items: [], total: 0, page: 1, pageSize: 20 })
    return json({ items: [] })
  } catch (error) { res.writeHead(500); res.end(String(error)) }
})
await new Promise((resolve, reject) => { api.once('error', reject); api.listen(8787, '127.0.0.1', resolve) })
let browser, context, page, cdp, fixtureImages
const report = { touchInput: 'Chromium CDP Input.dispatchTouchEvent', physicalPhoneTested: false, externalProviderCalls: 0, checks, captures, workerCalls, pageErrors }
function check(name, actual, expected = true) { assert.deepEqual(actual, expected, name); checks.push(name); console.log('PASS ' + name) }
async function wait(test, message, timeout = 15000) {
  const until = Date.now() + timeout
  while (Date.now() < until) { if (await test()) return; await new Promise((resolve) => setTimeout(resolve, 50)) }
  throw new Error('Timed out: ' + message)
}
async function state() { return page.evaluate(() => ({ ids: window.testStore.getState().inputImages.map((image) => image.id), pending: window.testStore.getState().pendingInputImages, submitting: window.testStore.getState().isSubmittingTask })) }
async function order() { return page.locator('[data-input-image-id]').evaluateAll((elements) => elements.map((element) => element.dataset.inputImageId)) }
async function points() { return page.locator('[data-input-image-id]').evaluateAll((elements) => elements.map((element) => { const r = element.getBoundingClientRect(); return { id: element.dataset.inputImageId, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })) }
async function touch(type, point, extra = []) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: ['touchEnd', 'touchCancel'].includes(type) ? [] : [{ x: point.x, y: point.y, id: 1 }, ...extra] }) }
async function move(from, to) { for (let n = 1; n <= 8; n++) { await touch('touchMove', { x: Math.round(from.x + (to.x - from.x) * n / 8), y: Math.round(from.y + (to.y - from.y) * n / 8) }); await page.waitForTimeout(35) } }
async function drag(from, to, hold = 550) { await touch('touchStart', from); await page.waitForTimeout(hold); await move(from, to); await touch('touchEnd', to); await page.waitForTimeout(180) }
async function mouseDrag(from, to) {
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.waitForTimeout(550)
  await page.mouse.move(to.x, to.y, { steps: 12 }); await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(200)
}
async function sameOrder(name, expected) { check(name + ' (DOM)', await order(), expected); check(name + ' (store)', (await state()).ids, expected) }
async function seed(count = 8) {
  await page.evaluate(async (images) => {
    window.testStore.getState().clearInputImages()
    const { addImagesFromFiles } = await import('/src/store.ts')
    await addImagesFromFiles(images.map((data, index) => new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], `${index}.png`, { type: 'image/png' })))
    window.testStore.getState().setPrompt('async order browser regression')
  }, fixtureImages.slice(0, count))
  await wait(async () => (await order()).length === count, 'seed images render')
  await page.waitForTimeout(300)
}
async function fileInput(files) {
  await page.locator('input[type=file][accept="image/*"]:not([capture])').setInputFiles(files.map((index) => ({ name: `${index}.png`, mimeType: 'image/png', buffer: Buffer.from(fixtureImages[index], 'base64') })))
}
async function installReadGate() {
  await page.evaluate(() => {
    const original = FileReader.prototype.readAsDataURL
    window.readQueue = []
    FileReader.prototype.readAsDataURL = function (file) {
      window.readQueue.push(() => original.call(this, file))
    }
    window.releaseReader = () => window.readQueue.shift()?.()
    window.restoreReader = () => { FileReader.prototype.readAsDataURL = original; window.readQueue.splice(0).forEach((run) => run()) }
  })
}
async function releaseAllReaders() {
  while ((await state()).pending) {
    await page.evaluate(() => window.releaseReader())
    await page.waitForTimeout(100)
  }
  await page.evaluate(() => window.restoreReader())
}
async function expectedHashes() { return page.evaluate(async () => Promise.all(window.testStore.getState().inputImages.map(async (image) => { const bytes = await (await fetch(image.dataUrl)).arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((n) => n.toString(16).padStart(2, '0')).join('') }))) }
async function submit() { await page.getByRole('button', { name: '生成图像', exact: true }).filter({ visible: true }).tap() }
try {
  browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL, headless: true } : { headless: true })
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(origin)
  await page.locator('[contenteditable=true]').waitFor()
  await page.waitForTimeout(1000)
  await page.evaluate(async () => { window.testStore = (await import('/src/store.ts')).useStore })
  await wait(() => page.evaluate(() => window.testStore.getState().authInitialized), 'store initialized')
  cdp = await context.newCDPSession(page)
  report.browser = browser.version()
  fixtureImages = await page.evaluate(() => Array.from({ length: 16 }, (_, index) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96
    const ctx = canvas.getContext('2d'); ctx.fillStyle = `rgb(${20 + index * 14},90,180)`; ctx.fillRect(0, 0, 96, 96)
    ctx.fillStyle = '#fff'; ctx.font = '48px sans-serif'; ctx.fillText(String(index + 1), 12, 65)
    return canvas.toDataURL('image/png').split(',')[1]
  }))
  captures.fixturePng = fixtureImages[15]
  await seed()
  let baseline = await order(), p = await points()
  check('thumbnails wrap across rows on a 390px phone', new Set(p.map((item) => item.y)).size > 1)
  await drag(p[0], p.at(-1))
  await sameOrder('long-press cross-row drag changes actual order', [...baseline.slice(1), baseline[0]])
  p = await points(); await drag(p.at(-1), p[0])
  await sameOrder('reverse drag restores actual order', baseline)
  for (let n = 0; n < 8; n++) {
    p = await points(); const from = n % p.length, to = (from + 3) % p.length
    const expected = [...baseline], [id] = expected.splice(from, 1); expected.splice(to, 0, id)
    await drag(p[from], p[to]); await sameOrder(`repeated drag ${n + 1}`, expected); baseline = expected
  }
  p = await points(); await touch('touchStart', p[0]); await page.waitForTimeout(550); await move(p[0], p.at(-1)); await touch('touchCancel', p[0])
  await sameOrder('touchcancel never commits a reorder', baseline)
  p = await points(); await drag(p[0], { x: 5, y: 150 })
  await sameOrder('dropping outside cancels a reorder', baseline)
  p = await points(); await drag(p[0], p.at(-1), 20)
  await sameOrder('short swipes leave order unchanged', baseline)
  await page.waitForTimeout(750)

  // Deterministically hold storage callbacks, as on a busy phone during startup.
  await page.reload(); await page.locator('[contenteditable=true]').waitFor(); await page.waitForTimeout(500)
  await page.evaluate(async () => {
    window.testStore = (await import('/src/store.ts')).useStore
    const { putImage } = await import('/src/lib/db.ts')
    const images = Array.from({ length: 8 }, (_, i) => ({ id: 'restore-fixture-' + i, dataUrl: window.testStore.getState().inputImages[i].dataUrl }))
    for (const image of images) await putImage({ ...image, createdAt: 1 })
    window.testStore.getState().setInputImages(images.map((image) => ({ ...image, dataUrl: '' })))
    const get = IDBObjectStore.prototype.get
    window.draftCallbacks = []
    IDBObjectStore.prototype.get = function (...args) {
      const request = get.apply(this, args)
      return new Proxy(request, {
        get(target, key) { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value },
        set(target, key, value) { return Reflect.set(target, key, key === 'onsuccess' ? (event) => window.draftCallbacks.push(() => value(event)) : value, target) },
      })
    }
    window.restorePromise = (await import('/src/store.ts')).restorePersistedInputDrafts()
    window.releaseDrafts = () => { IDBObjectStore.prototype.get = get; window.draftCallbacks.splice(0).reverse().forEach((run) => run()) }
  })
  await wait(() => page.evaluate(() => window.draftCallbacks.length === 8), 'all draft reads pending')
  baseline = await order(); p = await points(); await drag(p[0], p.at(-1))
  baseline = [...baseline.slice(1), baseline[0]]
  await sameOrder('reorder while draft data is still loading', baseline)
  await page.evaluate(() => { window.releaseDrafts(); return window.restorePromise })
  await sameOrder('late out-of-order draft reads preserve reordered list', baseline)
  await page.screenshot({ path: path.join(output, 'draft-reorder-preserved.png') })

  await seed()
  await installReadGate()
  await fileInput([8, 9, 10])
  await wait(async () => (await state()).pending === 3, 'whole selected batch marked pending')
  check('generate is disabled before selected files finish reading', await page.getByRole('button', { name: '生成图像', exact: true }).filter({ visible: true }).isDisabled())
  baseline = await order(); p = await points(); await drag(p[0], p.at(-1)); baseline = [...baseline.slice(1), baseline[0]]
  await sameOrder('existing images can reorder while unread files are pending', baseline)
  await page.evaluate(() => window.releaseReader())
  await wait(async () => (await state()).ids.length === 9, 'first new image finishes')
  p = await points()
  await touch('touchStart', p[0]); await page.waitForTimeout(550)
  await page.evaluate(() => window.releaseReader())
  await wait(async () => (await state()).ids.length === 10, 'next image finishes during active drag')
  p = await points(); const beforeDrop = await order()
  await move(p[0], p[7]); await touch('touchEnd', p[7]); await page.waitForTimeout(250)
  const expected = [...beforeDrop], [moving] = expected.splice(0, 1); expected.splice(7, 0, moving)
  await sameOrder('completion during a gesture does not move the wrong image', expected)
  await releaseAllReaders()
  await wait(async () => (await state()).ids.length === 11, 'whole batch complete')
  check('remaining completed files append without resetting reordered images', (await order()).slice(0, 10), expected)

  // Delay a real HTTP image transfer, while continuing to use real touch input.
  imageGate = gate()
  await page.evaluate(() => { window.imagePromise = (async () => (await import('/src/store.ts')).addImageFromUrl('/media/slow.png'))() })
  await wait(async () => (await state()).pending === 1, 'remote image download pending')
  baseline = await order(); p = await points(); await drag(p[0], p.at(-1)); baseline = [...baseline.slice(1), baseline[0]]
  imageGate.release(); await page.evaluate(() => window.imagePromise); imageGate = null
  check('late HTTP image arrival preserves existing image order', (await order()).slice(0, 11), baseline)

  // Throttle actual browser HTTP and hold the server response after reading multipart.
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 900, downloadThroughput: 32 * 1024, uploadThroughput: 12 * 1024, connectionType: 'cellular3g' })
  report.network = { latencyMs: 900, downloadBytesPerSecond: 32768, uploadBytesPerSecond: 12288 }
  const hashes = await expectedHashes(); baseline = await order(); const count = captures.length
  uploadGate = gate(); await submit()
  await wait(async () => (await state()).submitting, 'upload locks order')
  check('pending upload explains locked order', await page.getByRole('status').filter({ hasText: '本次顺序已锁定' }).isVisible())
  check('gesture starts before the throttled request finishes uploading', captures.length, count)
  p = await points(); await drag(p[0], p.at(-1))
  await sameOrder('drag during upload keeps visible and submitted order aligned', baseline)
  check('delete is disabled throughout upload', await page.locator('[data-input-image-action=delete]').first().isDisabled())
  await wait(() => captures.length === count + 1, 'throttled multipart reaches local fixture', 30000)
  check('multipart image bytes match displayed order, including late arrivals', captures.at(-1).inputs.map((input) => input.hash), hashes)
  uploadGate.release(); uploadGate = null
  await wait(async () => !(await state()).submitting, 'slow response unlocks reference area')
  check('SQLite preserves the displayed reference image order', captures.at(-1).persistedHashes, hashes)
  check('real task detail preserves reference image order', captures.at(-1).detailHashes, hashes)
  await wait(() => workerCalls.length >= 1, 'real worker calls local supplier fixture')
  check('real Worker sends image bytes to the supplier in displayed order', workerCalls[0], hashes)
  p = await points(); await drag(p.at(-1), p[0]); baseline = [baseline.at(-1), ...baseline.slice(0, -1)]
  await sameOrder('sorting resumes after upload success', baseline)

  uploadFailure = true; uploadGate = gate(); const failureCount = captures.length
  await submit(); await wait(() => captures.length === failureCount + 1, 'failed upload reaches fixture', 30000)
  uploadGate.release(); uploadGate = null
  await wait(async () => !(await state()).submitting, 'failure unlocks input')
  await sameOrder('failed upload preserves reference order for retry', baseline)
  uploadFailure = false
  const retryHashes = await expectedHashes(), retryCount = captures.length
  await submit(); await wait(() => captures.length === retryCount + 1, 'retry received', 30000)
  await wait(async () => !(await state()).submitting, 'retry succeeds')
  check('retry submits the current actual order', captures.at(-1).inputs.map((input) => input.hash), retryHashes)
  check('retried task persists the current order', captures.at(-1).persistedHashes, retryHashes)
  await wait(() => workerCalls.length >= 2, 'retry reaches real worker')
  check('real Worker keeps the retry order', workerCalls[1], retryHashes)
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await page.screenshot({ path: path.join(output, 'slow-network-upload-verified.png') })

  await installReadGate(); await fileInput([12, 13])
  await wait(async () => (await state()).pending === 2, 'cancel test batch pending')
  await page.getByTitle('清空全部参考图', { exact: true }).tap()
  await page.getByRole('button', { name: '确认删除', exact: true }).tap()
  check('clearing pending files immediately releases the pending state', (await state()).pending, 0)
  await releaseAllReaders()
  await page.waitForTimeout(300)
  await sameOrder('clearing during incomplete import never resurrects unread images', [])

  await seed()
  await page.setViewportSize({ width: 1200, height: 900 })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await page.waitForTimeout(500)
  baseline = await order(); p = await points()
  check('desktop retains native drag support', await page.locator('[data-input-image-id]').evaluateAll((elements) => elements.every((element) => element.draggable)))
  await mouseDrag(p[0], p.at(-1))
  await sameOrder('desktop real mouse drag still commits order', [...baseline.slice(1), baseline[0]])

  // Desktop: 16-file selection, repeated native mouse drags, persistence and reuse.
  await page.getByTitle('清空全部参考图', { exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await fileInput(Array.from({ length: 16 }, (_, index) => index))
  await wait(async () => (await state()).pending === 0 && (await order()).length === 16, 'desktop sixteen files finish reading')
  check('desktop preserves the selected order of all sixteen files', await expectedHashes(), fixtureImages.map((image) => hash(Buffer.from(image, 'base64'))))
  await page.setViewportSize({ width: 900, height: 900 }); await page.waitForTimeout(300)
  p = await points(); baseline = await order()
  check('desktop multi-image case also spans rows', new Set(p.map((item) => item.y)).size > 1)
  for (const [from, to] of [[0, 15], [14, 1], [4, 10], [15, 0], [7, 6], [2, 13]]) {
    p = await points(); await mouseDrag(p[from], p[to])
    const expected = [...baseline], [image] = expected.splice(from, 1); expected.splice(to, 0, image)
    await sameOrder(`desktop sixteen-image reorder ${from + 1} to ${to + 1}`, expected); baseline = expected
  }
  const desktopHashes = await expectedHashes(), desktopCount = captures.length, desktopWorkerCount = workerCalls.length
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 900, downloadThroughput: 32 * 1024, uploadThroughput: 12 * 1024, connectionType: 'cellular3g' })
  uploadGate = gate()
  await page.getByRole('button', { name: '生成图像', exact: true }).filter({ visible: true }).click()
  await wait(async () => (await state()).submitting, 'desktop upload starts')
  check('desktop drag starts while the slow multipart upload is incomplete', captures.length, desktopCount)
  p = await points(); await mouseDrag(p[0], p.at(-1))
  await sameOrder('desktop upload also locks reference order', baseline)
  await wait(() => captures.length === desktopCount + 1, 'desktop sixteen images uploaded', 30000)
  check('desktop multipart contains all sixteen images in displayed order', captures.at(-1).inputs.map((input) => input.hash), desktopHashes)
  uploadGate.release(); uploadGate = null
  await wait(async () => !(await state()).submitting, 'desktop submission completes')
  check('desktop database and task detail retain order', captures.at(-1).persistedHashes, desktopHashes)
  check('desktop returned detail retains all sixteen image positions', captures.at(-1).detailHashes, desktopHashes)
  await wait(() => workerCalls.length === desktopWorkerCount + 1, 'desktop real worker receives sixteen images')
  check('desktop real Worker sends all sixteen images in the exact displayed order', workerCalls.at(-1), desktopHashes)
  await page.evaluate(async (task) => { await (await import('/src/store.ts')).reuseConfig(task) }, returnedTasks.at(-1))
  await wait(async () => (await order()).length === 16, 'desktop reused configuration renders')
  check('reuse configuration preserves actual image bytes and order', await expectedHashes(), desktopHashes)
  await page.screenshot({ path: path.join(output, 'desktop-sixteen-image-order.png') })
  const retryDesktopCount = captures.length, retryDesktopWorkerCount = workerCalls.length
  await page.getByRole('button', { name: '生成图像', exact: true }).filter({ visible: true }).click()
  await wait(() => captures.length === retryDesktopCount + 1, 'reused desktop task resubmits')
  await wait(async () => !(await state()).submitting, 'reused desktop task finishes uploading')
  check('resubmitting reused sixteen-image task keeps multipart order', captures.at(-1).inputs.map((input) => input.hash), desktopHashes)
  await wait(() => workerCalls.length === retryDesktopWorkerCount + 1, 'reused task reaches real worker')
  check('resubmitting reused sixteen-image task keeps actual Worker order', workerCalls.at(-1), desktopHashes)
  await wait(() => returnedTasks.every((task) => db.getTask(task.id)?.status === 'succeeded'), 'all real worker tasks finish successfully')
  check('all four real Worker tasks complete with local fixture output', returnedTasks.map((task) => db.getTask(task.id).status), ['succeeded', 'succeeded', 'succeeded', 'succeeded'])
  check('browser has no uncaught page errors', pageErrors, [])
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'; report.error = error.stack
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  console.error(error); process.exitCode = 1
} finally {
  uploadGate?.release(); imageGate?.release()
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser?.close()
  await wait(() => worker.getSnapshot().runningCount === 0, 'fixture worker finishes').catch(() => {})
  api.closeAllConnections(); await new Promise((resolve) => api.close(resolve))
  await taskApp.close(); db.sqlite.close()
}
