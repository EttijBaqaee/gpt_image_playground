/** Runtime prefix injected by the server; changing Compose needs no web rebuild. */
export function appUrl(url: string) {
  const base = typeof document === 'undefined' ? '' : document.querySelector<HTMLMetaElement>('meta[name="app-base-path"]')?.content ?? ''
  return url.startsWith('/') && !url.startsWith('//') ? `${base}${url}` : url
}

export function appFetch(url: string, init?: RequestInit) {
  return fetch(appUrl(url), init)
}
