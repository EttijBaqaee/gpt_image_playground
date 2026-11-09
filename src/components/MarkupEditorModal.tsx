import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { loadImage } from '../lib/canvasImage'
import { t } from '../lib/i18n'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'

type Tool = 'brush' | 'rectangle' | 'arrow' | 'eraser'
export default function MarkupEditorModal({ source, initial, onSave, onClose }: { source: string; initial?: string; onSave: (dataUrl: string) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stroke = useRef<{ x: number; y: number; before: ImageData } | null>(null)
  const history = useRef<ImageData[]>([])
  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState('#ef4444')
  const [width, setWidth] = useState(12)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const remember = (image: ImageData) => {
    history.current.push(image)
    const limit = Math.max(1, Math.min(12, Math.floor(64 * 1024 * 1024 / image.data.byteLength)))
    while (history.current.length > limit) history.current.shift()
  }
  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const image = await loadImage(source)
      const overlay = initial ? await loadImage(initial) : null
      if (cancelled) return
      const canvas = canvasRef.current!
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      if (canvas.width * canvas.height > 16777216) throw new Error(t('原图超过标注编辑的像素上限'))
      if (overlay && overlay.naturalWidth === canvas.width && overlay.naturalHeight === canvas.height) canvas.getContext('2d')!.drawImage(overlay, 0, 0)
      setReady(true)
    })().catch(error => { if (!cancelled) setError(String(error.message)) })
    return () => { cancelled = true }
  }, [source, initial])
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!, box = canvas.getBoundingClientRect()
    return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height }
  }
  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || stroke.current) return
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d', { willReadFrequently: true })!
    canvas.setPointerCapture(event.pointerId)
    const p = point(event)
    stroke.current = { ...p, before: ctx.getImageData(0, 0, canvas.width, canvas.height) }
    remember(stroke.current.before)
    ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color; ctx.fillStyle = color
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.beginPath(); ctx.moveTo(p.x, p.y)
    if (tool === 'brush' || tool === 'eraser') { ctx.lineTo(p.x + 0.01, p.y); ctx.stroke() }
  }
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const start = stroke.current; if (!start) return
    const ctx = canvasRef.current!.getContext('2d')!, p = point(event)
    if (tool === 'brush' || tool === 'eraser') { ctx.lineTo(p.x, p.y); ctx.stroke(); return }
    ctx.putImageData(start.before, 0, 0); ctx.beginPath()
    if (tool === 'rectangle') ctx.rect(start.x, start.y, p.x - start.x, p.y - start.y)
    else {
      const angle = Math.atan2(p.y - start.y, p.x - start.x), length = width * 3
      ctx.moveTo(start.x, start.y); ctx.lineTo(p.x, p.y)
      ctx.moveTo(p.x - length * Math.cos(angle - Math.PI / 6), p.y - length * Math.sin(angle - Math.PI / 6)); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x - length * Math.cos(angle + Math.PI / 6), p.y - length * Math.sin(angle + Math.PI / 6))
    }
    ctx.stroke()
  }
  const save = () => {
    if (!ready || stroke.current) return
    const canvas = canvasRef.current!, pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let transparent = false, painted = false
    for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] < 255) transparent = true; if (pixels[i] > 0) painted = true }
    if (!transparent || !painted) { setError(t('标注层须包含绘制内容并保留透明区域')); return }
    onSave(canvas.toDataURL('image/png')); onClose()
  }
  const button = 'rounded-xl border border-gray-200 px-3 py-2 text-xs dark:border-white/10'
  return createPortal(<div role="dialog" aria-modal="true" aria-label={t('标注编辑')} className="fixed inset-0 z-[110] flex flex-col bg-white p-4 text-gray-800 dark:bg-gray-950 dark:text-gray-100">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <strong className="mr-auto">{t('标注编辑')}</strong>
      {(['brush','rectangle','arrow','eraser'] as Tool[]).map((item, index) => <button type="button" key={item} onClick={() => setTool(item)} aria-pressed={tool === item} className={`${button} ${tool === item ? 'bg-blue-500 text-white' : ''}`}>{[t('画笔'),t('矩形'),t('箭头'),t('橡皮擦')][index]}</button>)}
      <input type="color" aria-label={t('标注颜色')} value={color} onChange={e => setColor(e.target.value)} className="h-9 w-10" />
      <input type="range" aria-label={t('画笔大小')} min={2} max={80} value={width} onChange={e => setWidth(Number(e.target.value))} className="w-24" />
      <button className={button} onClick={() => { const previous = history.current.pop(); if (previous) canvasRef.current!.getContext('2d')!.putImageData(previous, 0, 0) }}>{t('撤销')}</button>
      <button className={button} disabled={!ready} onClick={() => { const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!; remember(ctx.getImageData(0,0,canvas.width,canvas.height)); ctx.clearRect(0,0,canvas.width,canvas.height) }}>{t('清空')}</button>
      <button className={button} onClick={onClose}>{t('取消')}</button>
      <button className={`${button} bg-blue-500 text-white disabled:opacity-40`} disabled={!ready} onClick={save}>{t('保存标注')}</button>
    </div>
    <p className="mb-3 text-xs text-gray-500">{t('在原图上绘制修改指示。提交时原图与透明 PNG 标注层分别发送。')}</p>
    {error && <p role="alert" className="mb-2 text-sm text-red-500">{error}</p>}
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-2xl bg-gray-100 p-2 dark:bg-white/5">
      <div className="relative max-h-full max-w-full" style={{ lineHeight: 0 }}>
        <img src={source} alt={t('原图')} className="max-h-[70vh] max-w-full object-contain" draggable={false} />
        <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={() => { stroke.current = null }} onPointerCancel={() => { stroke.current = null }} className="absolute inset-0 h-full w-full touch-none" style={{ cursor: 'crosshair' }} />
      </div>
    </div>
  </div>, document.body)
}
