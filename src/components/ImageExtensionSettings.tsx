import { IMAGE_FEATURES, normalizeImageExtensions, type ImageExtensionsConfig, type ImageFeature } from '../../server/src/lib/imageCapabilities'
import { t } from '../lib/i18n'

export default function ImageExtensionSettings({ model, value, onChange }: { model: string; value?: ImageExtensionsConfig; onChange: (value: ImageExtensionsConfig) => void }) {
  const config = normalizeImageExtensions(value)
  const key = model.trim()
  const current = config.models[key] ?? {}
  const labels: Record<ImageFeature, string> = {
    complexity: t('规划程度'), extendedQuality: t('扩展质量（xhigh / max）'), markup: t('透明标注层编辑'),
    svg: t('SVG 矢量输出'), gif: t('GIF 动画输出'), svgModelSelection: t('自选 SVG 编写模型'),
  }
  const setFeature = (patch: typeof current) => onChange({ ...config, models: { ...config.models, [key]: { ...current, ...patch } } })
  return <div className="rounded-2xl border border-gray-200/70 bg-gray-50/60 p-3 text-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
    <label className="flex items-center justify-between gap-3 font-medium">
      {t('图像扩展能力')}
      <input type="checkbox" checked={config.enabled} onChange={e => onChange({ ...config, enabled: e.target.checked })} className="h-4 w-4 accent-blue-500" />
    </label>
    <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{t('默认关闭，按供应商文档手动勾选。')}</p>
    {config.enabled && <fieldset disabled={!key} className="mt-3 space-y-3">
      <div className="text-xs text-gray-500">{t('当前完整模型名')}<code className="ml-2 break-all text-gray-800 dark:text-gray-200">{key || '—'}</code></div>
      <p className="text-xs leading-5 text-gray-500">{t('能力仅绑定当前 API 配置与完整模型名；更换站点会清除配置，更换模型不会继承勾选。')}</p>
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{t('勾选仅允许发送对应扩展参数，不代表供应商支持。OpenAI 兼容接口也可能接入 Seedream、Grok 等模型；不支持时可能报错或仍被计费，请先确认供应商说明。')}</p>
      <div className="grid gap-3 sm:grid-cols-2">{IMAGE_FEATURES.map(feature => <label key={feature} className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(current[feature])} disabled={feature === 'svgModelSelection' && !current.svg} onChange={e => setFeature({ [feature]: e.target.checked })} className="h-4 w-4 accent-blue-500" />{labels[feature]}
      </label>)}</div>
      {current.gif && <label className="flex items-center gap-2 text-xs">{t('GIF 帧数上限')}<input aria-label={t('GIF 帧数上限')} type="number" min={2} max={64} value={current.gifMaxFrames ?? 16} onChange={e => setFeature({ gifMaxFrames: Math.min(64, Math.max(2, Number(e.target.value) || 16)) })} className="w-20 rounded-lg border bg-transparent p-2 dark:border-white/10" /><span className="text-gray-500">{t('默认 16；仅在供应商支持时提高至 64。')}</span></label>}
    </fieldset>}
  </div>
}
