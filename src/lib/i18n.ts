import { useSyncExternalStore } from 'react'
import { englishMessages } from './en'

export type Locale = 'zh' | 'en'
export type LanguagePreference = Locale | 'browser'
const STORAGE_KEY = 'gpt-image-playground-language'
const listeners = new Set<() => void>()

function browserLocale(): Locale {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'zh'
  return /^zh(?:-|$)/i.test(navigator.languages?.[0] || navigator.language) ? 'zh' : 'en'
}

function readPreference(): LanguagePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'zh' || value === 'en') return value
  } catch { /* Browser language remains available without storage. */ }
  return 'browser'
}

let preference = readPreference()
let locale: Locale = preference === 'browser' ? browserLocale() : preference

export function getLocale() { return locale }
export function getLanguagePreference() { return preference }
export function getLocaleTag() { return locale === 'zh' ? 'zh-CN' : 'en-US' }

function notify() {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = getLocaleTag()
    document.title = t('绘坊 · Pictelier')
  }
  listeners.forEach(listener => listener())
}

export function setLanguagePreference(value: LanguagePreference) {
  preference = value
  locale = value === 'browser' ? browserLocale() : value
  try {
    if (value === 'browser') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, value)
  } catch { /* Keep the selection for this session if storage is blocked. */ }
  notify()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useLanguagePreference() {
  return useSyncExternalStore(subscribe, getLanguagePreference, () => 'browser' as LanguagePreference)
}

export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => 'zh' as Locale)
}

export function t(source: string, ...values: unknown[]): string {
  const key = source.trim().replace(/\s+/g, ' ')
  const translated = locale === 'en' ? englishMessages[key] : undefined
  const message = translated === undefined ? source : source.match(/^\s*/)?.[0] + translated + source.match(/\s*$/)?.[0]
  return message.replace(/\{(\d+)\}/g, (match, index: string) => Number(index) < values.length ? String(values[Number(index)] ?? '') : match)
}

if (typeof window !== 'undefined') {
  window.addEventListener('languagechange', () => {
    if (preference !== 'browser') return
    locale = browserLocale()
    notify()
  })
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    preference = readPreference()
    locale = preference === 'browser' ? browserLocale() : preference
    notify()
  })
  notify()
}
