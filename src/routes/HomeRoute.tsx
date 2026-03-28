import { usePreferences } from '../state/PreferencesContext'

export function HomeRoute() {
  const { t } = usePreferences()
  return (
    <div className="empty-state">
      <h2>{t.home.welcome}</h2>
      <p>{t.home.desc1}</p>
      <p>{t.home.desc2}</p>
    </div>
  )
}
