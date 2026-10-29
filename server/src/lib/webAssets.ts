interface WebPaths {
  basePath: string
  assetsBasePath: string
  apiBasePath: string
  mediaBasePath: string
  healthBasePath: string
}

/** Vite uses relative chunk/CSS URLs; only HTML entry URLs need relocating. */
export function renderWebIndexHtml(html: string, paths: WebPaths) {
  const metadata = [
    ['app', paths.basePath],
    ['assets', paths.assetsBasePath],
    ['api', paths.apiBasePath],
    ['media', paths.mediaBasePath],
    ['health', paths.healthBasePath],
  ].map(([kind, prefix]) => `<meta name="${kind}-base-path" content="${prefix}">`).join('')
  return html
    .replace(/(\b(?:src|href)\s*=\s*)(["'])(?:\.\/|\/)?assets\/([^"']*)\2/g,
      (_match, attribute: string, quote: string, filename: string) =>
        `${attribute}${quote}${paths.assetsBasePath}/assets/${filename}${quote}`)
    .replace('<head>', `<head><base href="${paths.basePath}/">${metadata}`)
}
