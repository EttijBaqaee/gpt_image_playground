import { useState } from 'react'
import { resolveImageCapabilities } from '../../server/src/lib/imageCapabilities'
import { useStore, replaceInputImageWithDataUrl } from '../store'
import { prepareInputImageDataUrl } from '../lib/inputImagePreprocess'
import { t } from '../lib/i18n'
import MarkupEditorModal from './MarkupEditorModal'

export default function AdvancedImageParameters() {
  const settings = useStore(s => s.settings), params = useStore(s => s.params), images = useStore(s => s.inputImages)
  const mask = useStore(s => s.maskDraft), setParams = useStore(s => s.setParams)
  const [editor, setEditor] = useState<{ id: string; source: string } | null>(null)
  const caps = resolveImageCapabilities(settings)
  if (!Object.keys(caps).length) return null
  const inputClass = 'w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-xs dark:border-white/10'
  const openEditor = async () => {
    try {
      const source = images[0]; if (!source) return
      const prepared = await prepareInputImageDataUrl(source.dataUrl)
      const id = prepared.dataUrl === source.dataUrl ? source.id : await replaceInputImageWithDataUrl(source.id, prepared.dataUrl)
      setEditor({ id, source: prepared.dataUrl })
    } catch (error) { useStore.getState().showToast(error instanceof Error ? error.message : String(error), 'error') }
  }
  return <>
    <details className="mt-4 rounded-2xl border border-gray-200 p-3 dark:border-white/10">
      <summary className="cursor-pointer text-xs font-medium">{t('扩展参数')}</summary>
      <div className="mt-3 space-y-3 text-xs">
        {caps.complexity && <label className="block">{t('规划程度')}<select className={`${inputClass} mt-1`} value={params.complexity ?? ''} onChange={e => setParams({ complexity: (e.target.value || undefined) as typeof params.complexity })}><option value="">{t('模型默认')}</option>{['low','medium','high'].map(v => <option key={v} value={v}>{v}</option>)}</select></label>}
        {(params.output_format === 'svg' || params.output_format === 'gif') && <p className="leading-5 text-gray-500">{t('SVG / GIF 仅用于无参考图的文生图；SVG 数量固定为 1。下载保留原格式，GIF 可在大图预览中播放。')}</p>}
        {caps.gif && params.output_format === 'gif' && <div className="grid grid-cols-2 gap-2">
          <label>{t('帧数')}<input className={`${inputClass} mt-1`} type="number" min={2} max={caps.gifMaxFrames ?? 16} placeholder="9" value={params.frame_count ?? ''} onChange={e => setParams({ frame_count: e.target.value ? Number(e.target.value) : undefined })} /></label>
          <label>{t('每帧毫秒')}<input className={`${inputClass} mt-1`} type="number" min={20} max={2000} placeholder="200" value={params.frame_duration_ms ?? ''} onChange={e => setParams({ frame_duration_ms: e.target.value ? Number(e.target.value) : undefined })} /></label>
        </div>}
        {caps.svgModelSelection && params.output_format === 'svg' && <>
          <label className="block">{t('SVG 编写模型（可选）')}<input className={`${inputClass} mt-1`} value={params.svg?.model ?? ''} placeholder={t('留空使用供应商默认')} onChange={e => setParams({ svg: e.target.value.trim() ? { ...params.svg, model: e.target.value } : undefined })} /></label>
          {params.svg?.model && <label className="block">{t('推理强度')}<select className={`${inputClass} mt-1`} value={params.svg.reasoning?.effort ?? ''} onChange={e => setParams({ svg: { model: params.svg!.model, ...(e.target.value ? { reasoning: { effort: e.target.value as NonNullable<NonNullable<typeof params.svg>['reasoning']>['effort'] } } : {}) } })}><option value="">{t('模型默认')}</option>{['none','minimal','low','medium','high','xhigh','max'].map(v => <option key={v}>{v}</option>)}</select></label>}
        </>}
        {caps.markup && <div className="space-y-2">
          <button type="button" disabled={!images.length} onClick={() => void openEditor()} className={`${inputClass} text-blue-500 disabled:opacity-40`}>{mask?.kind === 'markup' ? t('修改标注层') : t('标注第一张参考图')}</button>
          {mask?.kind === 'markup' && <button type="button" onClick={() => useStore.getState().clearMaskDraft()} className="text-red-500">{t('移除标注层')}</button>}
          <p className="leading-5 text-gray-500">{t('标注与遮罩互斥。保存新标注会替换当前遮罩；原图保持独立。')}</p>
        </div>}
      </div>
    </details>
    {editor && <MarkupEditorModal source={editor.source} initial={mask?.kind === 'markup' && mask.targetImageId === editor.id ? mask.maskDataUrl : undefined} onClose={() => setEditor(null)} onSave={dataUrl => useStore.getState().setMaskDraft({ kind: 'markup', targetImageId: editor.id, maskDataUrl: dataUrl, updatedAt: Date.now() })} />}
  </>
}
