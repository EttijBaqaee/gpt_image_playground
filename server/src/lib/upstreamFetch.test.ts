import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, request } from 'node:http'
import { connect, createServer as createTcpServer, type Socket } from 'node:net'
import { fetchWithProviderProxy } from './upstreamFetch.js'
import { executeImageTask, type TaskExecutionPayload } from './imageApi.js'
import type { AppDatabase, ProviderProfileRecord } from './db.js'

const sockets = new Set<Socket>()
function track(socket: Socket) { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); return socket }
let origin: string, httpProxy: string, socksProxy: string
const upstream = createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://localhost')
  if (url.pathname === '/multipart') {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk)
    if (!req.headers['content-type']?.startsWith('multipart/form-data;')) { res.writeHead(400); res.end('Expected multipart/form-data'); return }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type']! } }).formData()
    const files = form.getAll('image[]') as File[]
    res.end(JSON.stringify(await Promise.all(files.map(async (file) => ({ name: file.name, value: await file.text() })))))
    return
  }
  if (url.pathname.startsWith('/result-url/')) {
    res.end(JSON.stringify({ data: [{ url: origin + '/body?delay=1600' }] }))
    return
  }
  if (url.pathname === '/stream') {
    res.writeHead(200); res.flushHeaders()
    const timer = setInterval(() => res.write('chunk'), 100)
    res.once('close', () => clearInterval(timer))
    return
  }
  if (url.pathname === '/body') { res.writeHead(200); res.flushHeaders() }
  const delay = Number(url.searchParams.get('delay')) || 1600
  const timer = setTimeout(() => res.end('complete'), delay)
  res.once('close', () => clearTimeout(timer))
})
const proxy = createServer((req, res) => {
  const target = request(req.url!, { method: req.method, headers: req.headers }, (reply) => { res.writeHead(reply.statusCode!, reply.headers); reply.pipe(res) })
  req.pipe(target)
  target.once('socket', track)
  target.on('error', () => res.destroy())
  res.once('close', () => target.destroy())
})
proxy.on('connect', (req, socket, head) => {
  const [host, port] = req.url!.split(':')
  const target = track(connect(Number(port), host, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length) target.write(head)
    socket.pipe(target); target.pipe(socket)
  }))
  socket.on('error', () => target.destroy()); target.on('error', () => socket.destroy())
  socket.once('close', () => target.destroy())
})
const socks = createTcpServer((socket) => {
  let pending = Buffer.alloc(0), greeted = false
  const receive = (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk])
    if (!greeted) {
      if (pending.length < 2 || pending.length < 2 + pending[1]) return
      pending = pending.subarray(2 + pending[1]); greeted = true
      socket.write(Buffer.from([5, 0]))
    }
    if (pending.length < 5) return
    const type = pending[3]
    const addressLength = type === 1 ? 4 : type === 3 ? pending[4] + 1 : 16
    const length = 4 + addressLength + 2
    if (pending.length < length) return
    const host = type === 1 ? [...pending.subarray(4, 8)].join('.') : pending.subarray(5, 4 + addressLength).toString()
    const port = pending.readUInt16BE(4 + addressLength)
    const remaining = pending.subarray(length)
    socket.removeListener('data', receive)
    const target = track(connect(port, host, () => {
      socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]))
      if (remaining.length) target.write(remaining)
      socket.pipe(target); target.pipe(socket)
    }))
    socket.on('error', () => target.destroy()); target.on('error', () => socket.destroy())
    socket.once('close', () => target.destroy())
  }
  socket.on('data', receive)
})
const servers = [upstream, proxy, socks]
beforeAll(async () => {
  for (const server of servers) server.on('connection', track)
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))))
  const port = (server: typeof upstream | typeof socks) => (server.address() as { port: number }).port
  origin = `http://127.0.0.1:${port(upstream)}`
  httpProxy = `http://127.0.0.1:${port(proxy)}`
  socksProxy = `socks5://127.0.0.1:${port(socks)}`
})
afterAll(async () => {
  for (const socket of sockets) socket.destroy()
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})
function provider(mode: string, seconds = 1) {
  return { timeoutSeconds: seconds, proxyEnabled: mode !== 'direct', proxyUrl: mode === 'http' ? httpProxy : socksProxy }
}
async function text(mode: string, pathname: string, seconds = 1, init: RequestInit = {}) {
  return (await fetchWithProviderProxy(provider(mode, seconds), origin + pathname, init)).text()
}

describe.each(['direct', 'http', 'socks'])('upstream deadline through %s', (mode) => {
  it.concurrent('times out while waiting for response headers', async () => {
    await expect(text(mode, '/headers')).rejects.toMatchObject({ name: 'TimeoutError' })
  })
  it.concurrent('continues enforcing the deadline after receiving headers', async () => {
    await expect(text(mode, '/body')).rejects.toMatchObject({ name: 'TimeoutError' })
  })
  it.concurrent('allows a larger configured deadline for the same response', async () => {
    await expect(text(mode, '/body', 3)).resolves.toBe('complete')
  })
  it.concurrent('does not reset the total deadline on incoming body chunks', async () => {
    await expect(text(mode, '/stream')).rejects.toMatchObject({ name: 'TimeoutError' })
  })
  it.concurrent('preserves external cancellation during response body reading', async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('caller cancelled body')), 100)
    try { await expect(text(mode, '/body', 10, { signal: controller.signal })).rejects.toThrow('caller cancelled body') }
    finally { clearTimeout(timer) }
  })
  it.concurrent('rejects an already cancelled request with its original reason', async () => {
    await expect(text(mode, '/headers', 10, { signal: AbortSignal.abort(new Error('cancelled before sending')) })).rejects.toThrow('cancelled before sending')
  })
  it.concurrent('keeps native FormData files in order', async () => {
    const body = new FormData()
    body.append('image[]', new Blob(['first']), 'z-first.png')
    body.append('image[]', new Blob(['second']), 'a-second.png')
    const response = await fetchWithProviderProxy(provider(mode, 10), origin + '/multipart', { method: 'POST', body })
    expect(await response.json()).toEqual([{ name: 'z-first.png', value: 'first' }, { name: 'a-second.png', value: 'second' }])
  })
})

it('uses an explicit per-operation timeout override', async () => {
  const response = fetchWithProviderProxy({ timeoutSeconds: 20 }, origin + '/body', {}, 1).then((r) => r.text())
  await expect(response).rejects.toMatchObject({ name: 'TimeoutError' })
})

describe.each(['images', 'responses'] as const)('%s integration timeout', (mode) => {
  function payload(baseUrl: string): TaskExecutionPayload {
    return {
      prompt: 'local timeout fixture', inputImages: [],
      params: { size: 'auto', quality: 'auto', output_format: 'png', output_compression: null, moderation: 'auto', n: 1 },
      provider: { baseUrl, model: mode === 'images' ? 'gpt-image-2' : 'gpt-5.5', apiMode: mode, timeoutSeconds: 1, maxReferenceImages: 16 } as ProviderProfileRecord,
    }
  }
  it.concurrent('honors a configured timeout shorter than the old 180-second minimum', async () => {
    await expect(executeImageTask(null as unknown as AppDatabase, payload(origin), 'local-only')).rejects.toMatchObject({ name: 'TimeoutError' })
  })
  it.concurrent('passes the configured deadline to result URL downloads', async () => {
    await expect(executeImageTask(null as unknown as AppDatabase, payload(origin + '/result-url'), 'local-only')).rejects.toMatchObject({ name: 'TimeoutError' })
  })
})
