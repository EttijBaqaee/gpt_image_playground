export const REFERENCE_IMAGE_MODES = ['original', 'lossless', 'pixel'] as const
export type ReferenceImageMode = typeof REFERENCE_IMAGE_MODES[number]

export function normalizeReferenceImageMode(value: unknown): ReferenceImageMode {
  return value === 'lossless' || value === 'pixel' ? value : 'original'
}
