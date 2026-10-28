import fs from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')

function loadWorker(query = '?v=test&api=%2Fa&media=%2Fm&health=%2Fh') {
  const handlers: Record<string, (event: unknown) => void> = {}
  const caches = {
    match: vi.fn().mockResolvedValue({ cached: true }),
    open: vi.fn(),
  }
  vm.runInNewContext(source, {
    URL,
    self: {
      location: new URL(`https://example.test/web/sw.js${query}`),
      registration: { scope: 'https://example.test/web/' },
      addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler },
    },
    caches,
  })
  return { handlers, caches }
}

describe('service worker independent paths', () => {
  it.each(['/a/api/tasks', '/a/api/tasks/events', '/a/api', '/h/health', '/h/health/'])('does not cache %s outside the homepage prefix', (pathname) => {
    const { handlers, caches } = loadWorker()
    const respondWith = vi.fn()
    handlers.fetch({ request: { method: 'GET', url: `https://example.test${pathname}`, destination: 'image', mode: 'cors' }, respondWith })
    expect(respondWith).not.toHaveBeenCalled()
    expect(caches.match).not.toHaveBeenCalled()
  })
  it.each(['/api/tasks', '/health', '/health/'])('accepts explicitly empty backend prefixes for %s', (pathname) => {
    const { handlers } = loadWorker('?v=test&api=&media=&health=')
    const respondWith = vi.fn()
    handlers.fetch({ request: { method: 'GET', url: `https://example.test${pathname}` }, respondWith })
    expect(respondWith).not.toHaveBeenCalled()
  })
  it('keeps compatibility with a legacy shared-prefix worker URL', () => {
    const { handlers } = loadWorker('?v=test')
    const respondWith = vi.fn()
    handlers.fetch({ request: { method: 'GET', url: 'https://example.test/web/api/tasks' }, respondWith })
    expect(respondWith).not.toHaveBeenCalled()
  })
  it('still handles media at its independent prefix', async () => {
    const { handlers, caches } = loadWorker()
    const respondWith = vi.fn()
    handlers.fetch({ request: { method: 'GET', url: 'https://example.test/m/media/output.png', destination: '', mode: 'cors' }, respondWith })
    expect(respondWith).toHaveBeenCalledOnce()
    await respondWith.mock.calls[0][0]
    expect(caches.match).toHaveBeenCalledOnce()
  })
})
