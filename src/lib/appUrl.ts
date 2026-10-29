export type AppRouteKind = 'app' | 'assets' | 'api' | 'media' | 'health'

/** Runtime prefixes injected by the server; Compose changes need no web rebuild. */
export function getAppBasePath(kind: AppRouteKind = 'app') {
  if (typeof document === 'undefined') return ''
  const configured = document.querySelector<HTMLMetaElement>(`meta[name="${kind}-base-path"]`)
  return configured?.content ?? document.querySelector<HTMLMetaElement>('meta[name="app-base-path"]')?.content ?? ''
}

export function appUrl(url: string) {
  if (!url.startsWith('/') || url.startsWith('//')) return url
  const kind = url.match(/^\/(api|media|health|assets)(?:\/|[?#]|$)/)?.[1] as AppRouteKind | undefined
  return `${getAppBasePath(kind ?? 'app')}${url}`
}

export function appFetch(url: string, init?: RequestInit) {
  return fetch(appUrl(url), init)
}

export function serviceWorkerUrl(version: string) {
  const params = new URLSearchParams({
    v: version,
    api: getAppBasePath('api'),
    media: getAppBasePath('media'),
    health: getAppBasePath('health'),
  })
  return appUrl(`/sw.js?${params}`)
}
