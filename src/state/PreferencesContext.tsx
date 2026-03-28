import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { type Locale, resolveLocale, type TranslationMessages,translations } from '../lib/i18n'
import { localSettings, type ViewerPreferences } from '../lib/localStorage'

export type { ViewerPreferences }

export interface PreferencesContextValue {
  viewerPreferences: ViewerPreferences
  setViewerPreferences: (updates: Partial<ViewerPreferences>) => void
  locale: Locale
  t: TranslationMessages
}

const systemLocale = typeof navigator !== 'undefined' ? navigator.language : 'en'

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined)

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) {throw new Error('PreferencesContext missing')}
  return ctx
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ViewerPreferences>(localSettings.getViewerPreferences())

  const locale = resolveLocale(prefs.locale, systemLocale)
  const t = translations[locale]

  useEffect(() => {
    if (typeof document === 'undefined') {return}
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: light)')
    const applyTheme = () => {
      const nextTheme =
        prefs.appTheme === 'system'
          ? mediaQuery?.matches
            ? 'light'
            : 'dark'
          : prefs.appTheme
      document.documentElement.dataset.appTheme = nextTheme
    }
    applyTheme()
    mediaQuery?.addEventListener?.('change', applyTheme)
    return () => mediaQuery?.removeEventListener?.('change', applyTheme)
  }, [prefs.appTheme])

  const setViewerPreferences = useCallback((updates: Partial<ViewerPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...updates }
      localSettings.setViewerPreferences(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ viewerPreferences: prefs, setViewerPreferences, locale, t }),
    [prefs, setViewerPreferences, locale, t],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
