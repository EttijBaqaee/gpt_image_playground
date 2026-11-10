import type { ReferenceImageMode } from './referenceImageMode.js'
// Pure capability rules shared by the browser and server. No network or platform dependencies.
export const IMAGE_FEATURES = ['complexity', 'extendedQuality', 'markup', 'svg', 'gif', 'svgModelSelection'] as const
export type ImageFeature = typeof IMAGE_FEATURES[number]
export type ImageModelFeatures = Partial<Record<ImageFeature, boolean>> & { gifMaxFrames?: number }
export interface ImageExtensionsConfig {
  enabled: boolean
  models: Record<string, ImageModelFeatures>
}
export interface ImageCapabilityProvider {
  model: string
  apiMode: string
  codexCli?: boolean | number
  grokApiCompat?: boolean | number
  imageExtensions?: ImageExtensionsConfig | null
}
export interface ImageRequestParams {
  reference_image_mode?: ReferenceImageMode
  size: string
  quality: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  output_format: 'png' | 'jpeg' | 'webp' | 'svg' | 'gif'
  output_compression: number | null
  moderation: 'auto' | 'low'
  n: number
  complexity?: 'low' | 'medium' | 'high'
  frame_count?: number
  frame_duration_ms?: number
  svg?: { model: string; reasoning?: { effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' } }
  // The existing single annotation attachment is either a legacy mask or a markup overlay.
  annotation_mode?: 'markup'
}

export function normalizeImageExtensions(value: unknown): ImageExtensionsConfig {
  const source = value && typeof value === 'object' ? value as Partial<ImageExtensionsConfig> : {}
  const models: Record<string, ImageModelFeatures> = Object.create(null)
  for (const [model, raw] of Object.entries(source.models && typeof source.models === 'object' && !Array.isArray(source.models) ? source.models : {}).slice(0, 64)) {
    if (!model.trim() || model.length > 256 || !raw || typeof raw !== 'object') continue
    const features: ImageModelFeatures = {}
    for (const key of IMAGE_FEATURES) if (raw[key] === true) features[key] = true
    if (features.gif) features.gifMaxFrames = Math.max(2, Math.min(64, Math.trunc(Number(raw.gifMaxFrames) || 16)))
    models[model.trim()] = features
  }
  return { enabled: source.enabled === true, models }
}

export function resolveImageCapabilities(provider: ImageCapabilityProvider): ImageModelFeatures {
  if (provider.apiMode !== 'images' || provider.codexCli || provider.grokApiCompat || !provider.imageExtensions?.enabled) return {}
  const configured = provider.imageExtensions.models?.[provider.model.trim()] ?? {}
  const result: ImageModelFeatures = {}
  // Provider aliases carry no reliable capability information. Honor the administrator's selections.
  for (const key of IMAGE_FEATURES) if (configured[key] === true) result[key] = true
  if (!result.svg) delete result.svgModelSelection
  if (result.gif) result.gifMaxFrames = Math.max(2, Math.min(64, Math.trunc(Number(configured.gifMaxFrames) || 16)))
  return result
}

export function compatibleImageDraft(params: ImageRequestParams, caps: ImageModelFeatures, hasInputs = false): ImageRequestParams {
  const result = { ...params }
  if (!caps.extendedQuality && (result.quality === 'xhigh' || result.quality === 'max')) result.quality = 'high'
  if ((result.output_format === 'svg' && (!caps.svg || hasInputs)) || (result.output_format === 'gif' && (!caps.gif || hasInputs))) result.output_format = 'png'
  if (!caps.complexity) delete result.complexity
  if (result.output_format !== 'gif') { delete result.frame_count; delete result.frame_duration_ms }
  else if (result.frame_count != null) result.frame_count = Math.min(result.frame_count, caps.gifMaxFrames ?? 16)
  if (result.output_format !== 'svg' || !caps.svgModelSelection) delete result.svg
  if (result.output_format === 'svg') result.n = 1
  if (result.output_format === 'svg' || result.output_format === 'gif') result.output_compression = null
  return result
}

export function imageExtensionError(params: ImageRequestParams, provider: ImageCapabilityProvider, inputCount: number, hasAnnotation = false): string | null {
  const caps = resolveImageCapabilities(provider)
  if (params.complexity && !caps.complexity) return '当前模型未启用规划程度参数'
  if ((params.quality === 'xhigh' || params.quality === 'max') && !caps.extendedQuality) return '当前模型不支持扩展质量档位'
  if (params.annotation_mode === 'markup' && (!caps.markup || !hasAnnotation || inputCount < 1)) return '当前模型不支持标注编辑，或缺少原图与标注层'
  if (params.output_format === 'svg') {
    if (!caps.svg) return '当前模型未启用 SVG 输出'
    if (inputCount || hasAnnotation || params.n !== 1 || params.output_compression != null) return 'SVG 仅支持无参考图的文生图，数量须为 1，且不能设置压缩率'
  }
  if (params.output_format === 'gif') {
    if (!caps.gif) return '当前模型未启用 GIF 输出'
    if (inputCount || hasAnnotation || params.output_compression != null) return 'GIF 仅支持无参考图的文生图，且不能设置压缩率'
    if (params.frame_count != null && (!Number.isInteger(params.frame_count) || params.frame_count < 2 || params.frame_count > (caps.gifMaxFrames ?? 16))) return 'GIF 帧数超出当前模型配置的范围'
    if (params.frame_duration_ms != null && (!Number.isInteger(params.frame_duration_ms) || params.frame_duration_ms < 20 || params.frame_duration_ms > 2000)) return 'GIF 每帧时长须为 20–2000 毫秒'
  } else if (params.frame_count != null || params.frame_duration_ms != null) return '动画参数仅用于 GIF 输出'
  if (params.svg && (params.output_format !== 'svg' || !caps.svgModelSelection || !params.svg.model.trim())) return 'SVG 编写模型未启用或填写不完整'
  return null
}

export function imageExtensionFields(params: ImageRequestParams, provider: ImageCapabilityProvider): Record<string, unknown> {
  const caps = resolveImageCapabilities(provider)
  return {
    ...(caps.complexity && params.complexity ? { complexity: params.complexity } : {}),
    ...(caps.gif && params.output_format === 'gif' && params.frame_count != null ? { frame_count: params.frame_count } : {}),
    ...(caps.gif && params.output_format === 'gif' && params.frame_duration_ms != null ? { frame_duration_ms: params.frame_duration_ms } : {}),
    ...(caps.svgModelSelection && params.output_format === 'svg' && params.svg ? { svg: params.svg } : {}),
  }
}
