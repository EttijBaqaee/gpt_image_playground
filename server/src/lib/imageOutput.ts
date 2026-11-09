import { SaxesParser } from 'saxes'
import sharp from 'sharp'

const SVG_NS = 'http://www.w3.org/2000/svg'
const TAGS = new Set('svg g defs symbol use title desc style path rect circle ellipse line polyline polygon text tspan textPath linearGradient radialGradient stop clipPath mask pattern marker filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence'.split(' '))
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function assertStaticValue(value: string) {
  // Escaped CSS can hide protocols or executable constructs. Local fragment paint servers are allowed.
  if (/[\\@]|\/\*|(?:javascript|vbscript|data|https?|file):|expression\s*\(|-moz-binding|behavior\s*:/i.test(value)) throw new Error('SVG 包含不支持的外部资源或动态内容')
  for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
    if (!/^\s*["']?#[\w:.-]+["']?\s*$/.test(match[1])) throw new Error('SVG 仅允许本地片段引用')
  }
}

/** Parse and reserialize a static, self-contained SVG before saving or rendering it. */
export function sanitizeStaticSvg(buffer: Buffer): Buffer {
  if (buffer.length > 10 * 1024 * 1024) throw new Error('SVG 文件过大')
  const parser = new SaxesParser({ xmlns: true })
  const chunks: string[] = []
  let depth = 0
  let nodes = 0
  let root = false
  let styleText = ''
  const stack: string[] = []
  parser.on('error', error => { throw error })
  parser.on('comment', () => { if (stack.at(-1) === 'style') throw new Error('SVG 样式不允许注释') })
  parser.on('doctype', () => { throw new Error('SVG 不允许 DTD') })
  parser.on('processinginstruction', () => { throw new Error('SVG 不允许处理指令') })
  parser.on('opentag', tag => {
    if (stack.at(-1) === 'style') throw new Error('SVG 样式不能包含子元素')
    if (++nodes > 100000 || ++depth > 128) throw new Error('SVG 结构过于复杂')
    if (!TAGS.has(tag.local) || (tag.uri && tag.uri !== SVG_NS)) throw new Error('SVG 包含不支持的元素')
    if (!root) {
      if (tag.local !== 'svg') throw new Error('SVG 缺少根元素')
      root = true
    }
    stack.push(tag.local)
    if (tag.local === 'style') styleText = ''
    const attrs: string[] = []
    for (const attr of Object.values(tag.attributes)) {
      const name = attr.local.toLowerCase()
      if (attr.name === 'xmlns' || attr.prefix === 'xmlns') continue
      if (/^on/i.test(name) || ['base', 'src', 'srcset'].includes(name)) throw new Error('SVG 包含动态或外部属性')
      if (attr.uri && !['http://www.w3.org/1999/xlink', 'http://www.w3.org/XML/1998/namespace'].includes(attr.uri)) throw new Error('SVG 属性命名空间无效')
      if (name === 'href' && !/^#[\w:.-]+$/.test(attr.value)) throw new Error('SVG 仅允许本地片段引用')
      if (name !== 'href') assertStaticValue(attr.value)
      attrs.push(`${attr.name}="${escapeXml(attr.value)}"`)
    }
    chunks.push(`<${tag.local}${depth === 1 ? ` xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink"` : ''}${attrs.length ? ' ' + attrs.join(' ') : ''}>`)
  })
  const onText = (value: string) => {
    if (stack.at(-1) === 'style') styleText += value
    chunks.push(escapeXml(value))
  }
  parser.on('text', onText)
  parser.on('cdata', onText)
  parser.on('closetag', tag => {
    if (tag.local === 'style') assertStaticValue(styleText)
    chunks.push(`</${tag.local}>`); stack.pop(); depth--
  })
  parser.write(buffer.toString('utf8').replace(/^\uFEFF/, '')).close()
  if (!root || depth) throw new Error('SVG 结构无效')
  return Buffer.from(chunks.join(''))
}

export function detectImageMime(buffer: Buffer, fallback = 'image/png'): string {
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png'
  if (buffer[0] === 255 && buffer[1] === 216) return 'image/jpeg'
  if (/^GIF8[79]a/.test(buffer.toString('ascii', 0, 6))) return 'image/gif'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (/^[\s\uFEFF]*</.test(buffer.toString('utf8', 0, Math.min(buffer.length, 4096)))) return 'image/svg+xml'
  return fallback.split(';')[0]
}

export function prepareImageOutput<T extends { buffer: Buffer; mimeType: string }>(image: T): T {
  const mimeType = detectImageMime(image.buffer, image.mimeType)
  return { ...image, mimeType, buffer: mimeType === 'image/svg+xml' ? sanitizeStaticSvg(image.buffer) : image.buffer }
}

export async function validateMarkup(overlay: Buffer, original: Buffer) {
  if (detectImageMime(overlay, '') !== 'image/png' || overlay.length > 50 * 1024 * 1024) throw new Error('标注层必须为不超过 50 MB 的透明 PNG')
  const base = await sharp(original).metadata()
  const firstWidth = base.autoOrient?.width ?? base.width
  const firstHeight = base.autoOrient?.height ?? base.height
  const { data, info } = await sharp(overlay, { limitInputPixels: 16777216 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (!firstWidth || !firstHeight || firstWidth * firstHeight > 16777216 || info.width !== firstWidth || info.height !== firstHeight) throw new Error('标注层尺寸必须与第一张原图一致，且不超过 16,777,216 像素')
  let transparent = false
  let painted = false
  for (let i = 3; i < data.length; i += 4) { if (data[i] < 255) transparent = true; if (data[i] > 0) painted = true }
  if (!transparent || !painted) throw new Error('标注层须包含绘制内容并保留透明区域')
}
