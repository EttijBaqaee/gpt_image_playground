import { useLanguagePreference, setLanguagePreference, useLocale, type LanguagePreference } from '../lib/i18n'
import { cycleThemeMode, getThemeModeLabel } from '../lib/theme'
import { useStore } from '../store'
import type { ThemeMode } from '../types'

export default function AppearanceControls({ compact = false }: { compact?: boolean }) {
  const locale = useLocale()
  const themeMode = useStore(s => s.themeMode)
  const setThemeMode = useStore(s => s.setThemeMode)
  const nextTheme = cycleThemeMode(themeMode)
  const languageLabel = locale === 'zh' ? '切换到 English' : 'Switch to 中文'
  const themeLabel = locale === 'zh'
    ? `主题：${getThemeModeLabel(themeMode)}；切换到${getThemeModeLabel(nextTheme)}`
    : `Theme: ${getThemeModeLabel(themeMode)}; switch to ${getThemeModeLabel(nextTheme)}`
  const buttonClass = 'inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-300 dark:hover:bg-white/[0.08]'

  return (
    <div className="flex shrink-0 items-center gap-0.5" aria-label={locale === 'zh' ? '语言与主题' : 'Language and appearance'}>
      <button type="button" className={buttonClass} title={languageLabel} aria-label={languageLabel}
        onClick={() => setLanguagePreference(locale === 'zh' ? 'en' : 'zh')}>
        <span lang={locale === 'zh' ? 'en' : 'zh-CN'}>{locale === 'zh' ? 'EN' : '中文'}</span>
      </button>
      <button type="button" className={buttonClass} title={themeLabel} aria-label={themeLabel}
        onClick={() => setThemeMode(nextTheme)}>
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {themeMode === 'system' ? <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>
            : themeMode === 'dark' ? <path d="M21 12.79A9 9 0 1111.21 3c0 .31 0 .61.02.91A7 7 0 0021 12.79z" />
            : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>}
        </svg>
        {!compact && <span className="hidden sm:inline">{getThemeModeLabel(themeMode)}</span>}
      </button>
    </div>
  )
}

export function AppearancePreferences() {
  const languagePreference = useLanguagePreference()
  const locale = useLocale()
  const themeMode = useStore(s => s.themeMode)
  const setThemeMode = useStore(s => s.setThemeMode)
  const selectClass = 'max-w-[60%] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 dark:border-white/10 dark:bg-gray-900 dark:text-gray-200'
  return (
    <div className="space-y-3 border-b border-gray-100 pb-4 dark:border-white/[0.08]">
      <label className="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-200">
        <span>{locale === 'zh' ? '界面语言' : 'Interface language'}</span>
        <select className={selectClass} value={languagePreference} onChange={e => setLanguagePreference(e.target.value as LanguagePreference)}>
          <option value="browser">{locale === 'zh' ? '跟随浏览器' : 'Browser language'}</option>
          <option value="zh">简体中文</option><option value="en">English</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-200">
        <span>{locale === 'zh' ? '外观' : 'Appearance'}</span>
        <select className={selectClass} value={themeMode} onChange={e => setThemeMode(e.target.value as ThemeMode)}>
          <option value="system">{locale === 'zh' ? '跟随系统' : 'System'}</option>
          <option value="light">{locale === 'zh' ? '浅色' : 'Light'}</option>
          <option value="dark">{locale === 'zh' ? '深色' : 'Dark'}</option>
        </select>
      </label>
    </div>
  )
}
