import { t } from './i18n'
import type { ThemeMode } from '../types'

export function resolveThemeMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined

export function applyThemeMode(mode: ThemeMode, animate = true) {
  if (typeof document === 'undefined') return
  const resolved = resolveThemeMode(mode)
  const root = document.documentElement
  const update = () => {
    root.classList.toggle('dark', resolved === 'dark')
    root.style.colorScheme = resolved
  }
  const changed = root.classList.contains('dark') !== (resolved === 'dark')
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!animate || !changed || reduceMotion) { update(); return }
  // Crossfade the whole page, including gradients, without moving its content.
  if (document.startViewTransition) {
    document.startViewTransition(update)
    return
  }
  clearTimeout(transitionTimer)
  root.classList.add('theme-transition')
  update()
  transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), 420)
}

export function watchSystemTheme(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onChange()
  media.addEventListener('change', handler)
  return () => media.removeEventListener('change', handler)
}

export function cycleThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === 'system') return 'dark'
  if (mode === 'dark') return 'light'
  return 'system'
}

export function getThemeModeLabel(mode: ThemeMode) {
  if (mode === 'dark') return t("深色模式")
  if (mode === 'light') return t("浅色模式")
  return t("跟随系统")
}
