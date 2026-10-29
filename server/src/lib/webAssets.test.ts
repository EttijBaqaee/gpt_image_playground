import { describe, expect, it } from 'vitest'
import { renderWebIndexHtml } from './webAssets.js'

const paths = { basePath: '/web', assetsBasePath: '/s', apiBasePath: '/a', mediaBasePath: '/m', healthBasePath: '/h' }

describe('runtime assets prefix', () => {
  it.each(['./assets/', '/assets/', 'assets/'])('relocates entry script, CSS and preload from %s', (prefix) => {
    const result = renderWebIndexHtml(`<head><script src="${prefix}main.js"></script><link href='${prefix}main.css'><link rel="modulepreload" href="${prefix}editor.js"></head>`, paths)
    expect(result).toContain('src="/s/assets/main.js"')
    expect(result).toContain("href='/s/assets/main.css'")
    expect(result).toContain('href="/s/assets/editor.js"')
  })
  it('keeps the document base, PWA and icons under the homepage', () => {
    const result = renderWebIndexHtml('<head><link href="./manifest.webmanifest"><link href="./pwa-icon.svg"></head>', paths)
    expect(result).toContain('<base href="/web/">')
    expect(result).toContain('name="assets-base-path" content="/s"')
    expect(result).toContain('href="./manifest.webmanifest"')
    expect(result).toContain('href="./pwa-icon.svg"')
  })
  it('supports a root assets path independently of the homepage', () => {
    expect(renderWebIndexHtml('<head><script src="./assets/main.js"></script></head>', { ...paths, assetsBasePath: '' })).toContain('src="/assets/main.js"')
  })
  it('leaves unrelated and external URLs unchanged', () => {
    const html = '<script src="https://example.test/assets/a.js"></script><img src="./pwa-icon.svg"><a href="/other/assets/a.js">a</a>'
    expect(renderWebIndexHtml(html, paths)).toBe(html)
  })
})
