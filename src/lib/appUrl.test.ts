import { afterEach, describe, expect, it, vi } from 'vitest'
import { appFetch, appUrl, getAppBasePath, serviceWorkerUrl } from './appUrl'

afterEach(() => vi.unstubAllGlobals())

function setPaths(paths: Record<string, string>) {
  vi.stubGlobal('document', {
    querySelector: (selector: string) => {
      const kind = selector.match(/name="(app|api|media|health)-base-path"/)?.[1]
      return kind && kind in paths ? { content: paths[kind] } : null
    },
  })
}

describe('independent runtime URLs', () => {
  it.each([
    ['/api/tasks', '/a/api/tasks'],
    ['/api/tasks/events', '/a/api/tasks/events'],
    ['/api?x=1', '/a/api?x=1'],
    ['/media/outputs/image.png', '/m/media/outputs/image.png'],
    ['/health/', '/h/health/'],
    ['/manifest.webmanifest', '/web/manifest.webmanifest'],
    ['/assets/app.js', '/web/assets/app.js'],
  ])('resolves %s to its own prefix', (input, expected) => {
    setPaths({ app: '/web', api: '/a', media: '/m', health: '/h' })
    expect(appUrl(input)).toBe(expected)
  })
  it('keeps explicit root API/media/health paths when the homepage has a prefix', () => {
    setPaths({ app: '/web', api: '', media: '', health: '' })
    expect(appUrl('/api/tasks')).toBe('/api/tasks')
    expect(appUrl('/media/a.png')).toBe('/media/a.png')
    expect(appUrl('/health')).toBe('/health')
    expect(appUrl('/sw.js')).toBe('/web/sw.js')
  })
  it('uses legacy metadata only if the independent metadata is absent', () => {
    setPaths({ app: '/legacy' })
    expect(appUrl('/api/tasks')).toBe('/legacy/api/tasks')
  })
  it.each(['https://example.test/api/tasks', '//example.test/media/a.png', 'relative/path'])('preserves %s', (url) => {
    setPaths({ app: '/web', api: '/a', media: '/m', health: '/h' })
    expect(appUrl(url)).toBe(url)
  })
  it('has original URLs outside the browser', () => {
    vi.stubGlobal('document', undefined)
    expect(getAppBasePath('api')).toBe('')
    expect(appUrl('/api/tasks')).toBe('/api/tasks')
  })
  it('fetches the independently configured API URL', async () => {
    setPaths({ app: '/web', api: '/a' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await appFetch('/api/auth/status', { credentials: 'include' })
    expect(fetchMock).toHaveBeenCalledWith('/a/api/auth/status', { credentials: 'include' })
  })
  it('keeps the worker under the homepage and tells it the backend paths', () => {
    setPaths({ app: '/web', api: '/a', media: '/m', health: '' })
    const url = new URL(serviceWorkerUrl('0.3.66.1'), 'https://example.test')
    expect(url.pathname).toBe('/web/sw.js')
    expect(Object.fromEntries(url.searchParams)).toEqual({ v: '0.3.66.1', api: '/a', media: '/m', health: '' })
  })
})
