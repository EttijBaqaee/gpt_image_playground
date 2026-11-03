import { Agent, Pool, ProxyAgent, FormData as UndiciFormData, fetch as undiciFetch, type Dispatcher, type RequestInit as UndiciRequestInit } from 'undici'
import { SocksProxyAgent } from 'socks-proxy-agent'
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

export type UpstreamProxyProvider = {
  timeoutSeconds: number
  proxyEnabled?: number | boolean | null
  proxyUrl?: string | null
}

function isProxyEnabled(provider: UpstreamProxyProvider) {
  return Boolean(provider.proxyEnabled) && Boolean(provider.proxyUrl?.trim())
}

export function normalizeProxyUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) return trimmed
  return `http://${trimmed}`
}

export function validateProxyUrl(raw: string | null | undefined) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  let parsed: URL
  try {
    parsed = new URL(normalizeProxyUrl(value))
  } catch {
    throw new Error('代理地址格式无效')
  }
  const protocol = parsed.protocol.replace(':', '').toLowerCase()
  if (!['http', 'https', 'socks', 'socks4', 'socks4a', 'socks5', 'socks5h'].includes(protocol)) {
    throw new Error('代理仅支持 http、https、socks4、socks5')
  }
  if (!parsed.hostname) throw new Error('代理地址缺少主机名')
  return parsed.toString()
}

// The per-request deadline below covers both headers and the complete body.
// Disable Undici's independent 300-second limits so a longer configured
// deadline is not cut short. Use the matching Undici fetch/dispatcher pair.
// HTTP forward proxies create another internal client. Set request options
// as well, so that client's defaults cannot reintroduce the 300-second cap.
const useDeadlineOnly: Dispatcher.DispatcherComposeInterceptor = (dispatch) => (options, handler) =>
  dispatch({ ...options, headersTimeout: 0, bodyTimeout: 0 }, handler)
const directDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 }).compose(useDeadlineOnly)

function createAbortSignal(timeoutSeconds: number, external?: AbortSignal | null) {
  const deadline = AbortSignal.timeout(Math.max(1, timeoutSeconds) * 1000)
  return external ? AbortSignal.any([external, deadline]) : deadline
}

function toUndiciRequestInit(init: RequestInit): UndiciRequestInit {
  const options = { ...init } as UndiciRequestInit
  // Undici 8 does not recognize Node's built-in FormData class. Convert its
  // entries without buffering or changing file names, MIME types or order.
  if (init.body instanceof FormData) {
    const form = new UndiciFormData()
    for (const [name, value] of init.body) {
      if (typeof value === 'string') form.append(name, value)
      else form.append(name, value, value.name)
    }
    options.body = form
  }
  return options
}

async function fetchWithSocks(
  url: string,
  init: RequestInit,
  proxyUrl: string,
  signal: AbortSignal,
): Promise<Response> {
  const target = new URL(url)
  const isHttps = target.protocol === 'https:'
  const agent = new SocksProxyAgent(proxyUrl)
  const method = (init.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {}
  if (init.headers) {
    const h = new Headers(init.headers)
    h.forEach((value, key) => {
      headers[key] = value
    })
  }

  let body: string | Buffer | undefined
  if (init.body != null) {
    if (typeof init.body === 'string') body = init.body
    else if (init.body instanceof Buffer) body = init.body
    else if (init.body instanceof Uint8Array) body = Buffer.from(init.body)
    else if (init.body instanceof ArrayBuffer) body = Buffer.from(init.body)
    else if (typeof init.body === 'object' && 'getReader' in (init.body as object)) {
      throw new Error('SOCKS 代理暂不支持流式请求体')
    } else {
      // FormData / Blob
      const resLike = new Request(url, init)
      const ab = await resLike.arrayBuffer()
      body = Buffer.from(ab)
      const contentType = resLike.headers.get('content-type')
      if (contentType && !headers['content-type'] && !headers['Content-Type']) {
        headers['Content-Type'] = contentType
      }
    }
  }

  return await new Promise<Response>((resolve, reject) => {
    const requestFn = isHttps ? https.request : http.request
    const req = requestFn(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        agent,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('error', reject)
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const responseHeaders = new Headers()
          for (const [key, value] of Object.entries(res.headers)) {
            if (value == null) continue
            if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(key, item))
            else responseHeaders.set(key, value)
          }
          resolve(new Response(buffer, {
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: responseHeaders,
          }))
        })
      },
    )
    req.on('error', reject)
    const onAbort = () => {
      req.destroy(signal.reason instanceof Error ? signal.reason : new Error('请求超时或已取消'))
    }
    req.once('close', () => signal.removeEventListener('abort', onAbort))
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
    if (body) req.write(body)
    req.end()
  }).finally(() => agent.destroy())
}

export async function fetchWithProviderProxy(
  provider: UpstreamProxyProvider,
  url: string,
  init: RequestInit = {},
  timeoutSeconds?: number,
): Promise<Response> {
  const timeout = Math.max(1, timeoutSeconds ?? provider.timeoutSeconds ?? 30)
  const signal = createAbortSignal(timeout, init.signal)
  const proxyUrl = isProxyEnabled(provider) ? validateProxyUrl(provider.proxyUrl) : null
  if (!proxyUrl) {
    return await undiciFetch(url, {
      ...toUndiciRequestInit(init),
      signal,
      dispatcher: directDispatcher,
    }) as unknown as Response
  }

  const protocol = new URL(proxyUrl).protocol.replace(':', '').toLowerCase()
  if (protocol === 'http' || protocol === 'https') {
    const dispatcher = new ProxyAgent({
      uri: proxyUrl,
      headersTimeout: 0,
      bodyTimeout: 0,
      clientFactory: (origin, options) => new Pool(origin, { ...options, headersTimeout: 0, bodyTimeout: 0 }),
    })
    try {
      return await undiciFetch(url, {
        ...toUndiciRequestInit(init),
        signal,
        dispatcher: dispatcher.compose(useDeadlineOnly),
      }) as unknown as Response
    } finally {
      // close() waits for the response body; do not destroy its socket when
      // fetch resolves at the headers. Retire this request's proxy afterward.
      void dispatcher.close().catch(() => dispatcher.destroy()).catch(() => {})
    }
  }

  if (protocol.startsWith('socks')) {
    return await fetchWithSocks(url, { ...init, signal }, proxyUrl, signal)
  }

  throw new Error('代理仅支持 http、https、socks4、socks5')
}
