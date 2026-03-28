import clsx from 'clsx'
import { CircleHelp, Download, HardDriveDownload, Trash2, X } from 'lucide-react'
import { Highlight, themes } from 'prism-react-renderer'
import { useEffect, useMemo, useState } from 'react'

import { useModalA11y } from '../../hooks/useModalA11y'
import { formatText, type TranslationMessages } from '../../lib/i18n'
import { useAppData } from '../../state/AppDataContext'
import { useImportExport } from '../../state/ImportExportContext'
import { usePreferences } from '../../state/PreferencesContext'
import styles from './SettingsModal.module.scss'

const PREVIEW_CODE = `// Fetch and transform data
async function loadUsers(role = "admin") {
  const res = await fetch("/api/users?active=true")
  const data = await res.json()
  return data
    .filter((u) => u.role === role && u.age >= 18)
    .map(({ name, email }) => ({ name, email }))
}`

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { exportLocalBundle, cleanupLocal, purgeAll, refreshDbSize, dbSizeBytes, localIndex, storageAvailable } = useAppData()
  const { exporting, exportProgress } = useImportExport()
  const { viewerPreferences, setViewerPreferences, t } = usePreferences()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [purging, setPurging] = useState(false)
  const [sizeReady, setSizeReady] = useState(false)
  const [resolvedSystemTheme, setResolvedSystemTheme] = useState<'dark' | 'light'>(() => getSystemTheme())
  const { containerRef, onOverlayMouseDown } = useModalA11y({
    open,
    onClose,
    disableClose: confirmOpen,
    primaryActionSelector: '[data-primary-action="true"]',
  })
  const confirmA11y = useModalA11y({
    open: confirmOpen,
    onClose: () => setConfirmOpen(false),
    disableClose: purging,
  })

  useEffect(() => {
    if (!open) {return}
    let cancelled = false
    setSizeReady(false)
    void (async () => {
      try {
        await refreshDbSize()
      } finally {
        if (!cancelled) {
          setSizeReady(true)
        }
      }
    })()
    setConfirmOpen(false)
    setPurging(false)
    return () => {
      cancelled = true
    }
  }, [open, refreshDbSize])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {return}
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const sync = () => setResolvedSystemTheme(media.matches ? 'light' : 'dark')
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  const effectiveCodeTheme = viewerPreferences.codeTheme
  const codeTheme = useMemo(() => {
    const themeMap = {
      a11yDark: themes.gruvboxMaterialDark,
      a11yLight: themes.gruvboxMaterialLight,
      monokaiSublime: themes.okaidia,
      idea: themes.vsLight,
      oneDark: themes.oneDark,
      oneLight: themes.oneLight,
      github: themes.github,
      nightOwl: themes.nightOwl,
      nightOwlLight: themes.nightOwlLight,
      shadesOfPurple: themes.shadesOfPurple,
      duotoneDark: themes.duotoneDark,
      duotoneLight: themes.duotoneLight,
      vsDark: themes.vsDark,
      vsLight: themes.vsLight,
    } as const
    return themeMap[effectiveCodeTheme] ?? themes.oneDark
  }, [effectiveCodeTheme])

  if (!open) {return null}

  const hasCachedConversations = localIndex.length > 0
  const nbsp = '\u00A0'
  const formattedSize = typeof dbSizeBytes === 'number' ? `${(dbSizeBytes / (1024 * 1024)).toFixed(1)}${nbsp}MB` : null
  const sizeLabel = sizeReady && formattedSize ? formattedSize : null
  const hasStoredData = hasCachedConversations || (sizeReady && (dbSizeBytes ?? 0) > 0)
  const effectiveAppTheme = viewerPreferences.appTheme === 'system' ? resolvedSystemTheme : viewerPreferences.appTheme

  const storageBlockedHint = !storageAvailable
    ? t.settings.storage.storageBlockedHint
    : undefined
  const purgeDisabled = !storageAvailable || !hasStoredData
  const purgeTitle = !storageAvailable
    ? storageBlockedHint
    : !hasStoredData
      ? t.settings.storage.purgeNeedsImport
      : undefined
  const confirmSizeNote = sizeLabel ? ` (${sizeLabel})` : ''

  const handleCleanup = async () => {
    await cleanupLocal()
    setSizeReady(false)
    try {
      await refreshDbSize()
    } finally {
      setSizeReady(true)
    }
  }

  const handleConfirmPurge = async () => {
    if (purging) {return}
    setPurging(true)
    await purgeAll()
    setSizeReady(false)
    try {
      await refreshDbSize()
    } finally {
      setSizeReady(true)
    }
    setPurging(false)
    setConfirmOpen(false)
    onClose()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onOverlayMouseDown}>
      <div className={styles.modal} ref={containerRef}>
        <header className={styles.header}>
          <h2>{t.settings.title}</h2>
          <button className="icon-button modal-close-btn" onClick={onClose} aria-label={t.actions.close}>
            <X size={16} />
          </button>
        </header>

        <div className={styles.body}>
          {/* ── Appearance ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {t.settings.sections.appearance}
            </h3>

            <div className={styles.fieldsGrid}>
              <label className={styles.fieldInline}>
                <span className={styles.fieldLabel}>{t.settings.viewer.language}</span>
                <select
                  className={styles.select}
                  value={viewerPreferences.locale}
                  onChange={(event) =>
                    setViewerPreferences({ locale: event.target.value as 'auto' | 'en' | 'de' })
                  }
                >
                  <option value="auto">{t.settings.viewer.languageAuto}</option>
                  <option value="en">{t.settings.viewer.languageEnglish}</option>
                  <option value="de">{t.settings.viewer.languageGerman}</option>
                </select>
              </label>

              <label className={styles.fieldInline}>
                <span className={styles.fieldLabel}>{t.settings.viewer.appTheme}</span>
                <select
                  className={styles.select}
                  value={viewerPreferences.appTheme}
                  onChange={(event) => {
                    const appTheme = event.target.value as 'system' | 'dark' | 'light'
                    setViewerPreferences({ appTheme })
                  }}
                >
                  <option value="system">{t.settings.viewer.themeSystem}</option>
                  <option value="dark">{t.settings.viewer.themeDark}</option>
                  <option value="light">{t.settings.viewer.themeLight}</option>
                </select>
              </label>

              <label className={styles.fieldInline}>
                <span className={styles.fieldLabel}>{t.settings.viewer.codeTheme}</span>
                <select
                  className={styles.select}
                  value={effectiveCodeTheme}
                  onChange={(event) =>
                    setViewerPreferences({
                      codeTheme: event.target.value as typeof viewerPreferences.codeTheme,
                    })
                  }
                >
                  <option value="a11yDark">a11y-dark</option>
                  <option value="a11yLight">a11y-light</option>
                  <option value="monokaiSublime">monokai-sublime</option>
                  <option value="idea">idea</option>
                  <option value="oneDark">One Dark</option>
                  <option value="oneLight">One Light</option>
                  <option value="github">GitHub</option>
                  <option value="nightOwl">Night Owl</option>
                  <option value="nightOwlLight">Night Owl Light</option>
                  <option value="shadesOfPurple">Shades of Purple</option>
                  <option value="duotoneDark">Duotone Dark</option>
                  <option value="duotoneLight">Duotone Light</option>
                  <option value="vsDark">VS Dark</option>
                  <option value="vsLight">VS Light</option>
                </select>
              </label>
            </div>

            <div className={styles.themePreview} aria-live="polite">
              <div className={styles.themeChips}>
                <span className={styles.themeChip}>{appThemeLabel(effectiveAppTheme, t)}</span>
                <span className={styles.themeChip}>{themeLabel(effectiveCodeTheme)}</span>
              </div>
              <Highlight theme={codeTheme} code={PREVIEW_CODE} language="javascript">
                {({ style, tokens, getLineProps, getTokenProps }) => (
                  <pre className={styles.themePreviewCode} style={{ ...style, margin: 0 }}>
                    {tokens.map((line, i) => {
                      const { key: _k, ...lineProps } = getLineProps({ line, key: i })
                      return (
                        <div key={i} {...lineProps}>
                          {line.map((token, j) => {
                            const { key: _tk, ...tokenProps } = getTokenProps({ token, key: j })
                            return <span key={j} {...tokenProps} />
                          })}
                        </div>
                      )
                    })}
                  </pre>
                )}
              </Highlight>
            </div>
          </section>

          {/* ── Behavior ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {t.settings.sections.behavior}
            </h3>

            <div className={styles.toggles}>
              <label className={styles.toggle}>
                <span className={styles.toggleLabel}>{t.settings.viewer.collapseSystem}</span>
                <span className={clsx(styles.switch, viewerPreferences.collapseSystemMessages && styles.switchOn)}>
                  <input
                    type="checkbox"
                    checked={viewerPreferences.collapseSystemMessages}
                    onChange={(event) => setViewerPreferences({ collapseSystemMessages: event.target.checked })}
                  />
                  <span className={styles.switchTrack} />
                </span>
              </label>

              <label className={styles.toggle}>
                <span className={styles.toggleLabel}>{t.settings.viewer.collapseCode}</span>
                <span className={clsx(styles.switch, viewerPreferences.collapseCodeBlocks && styles.switchOn)}>
                  <input
                    type="checkbox"
                    checked={viewerPreferences.collapseCodeBlocks}
                    onChange={(event) => setViewerPreferences({ collapseCodeBlocks: event.target.checked })}
                  />
                  <span className={styles.switchTrack} />
                </span>
              </label>
            </div>
          </section>

          {/* ── Data & Storage ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {t.settings.storage.title}
              {sizeLabel && <span className={styles.sectionBadge}>{sizeLabel}</span>}
            </h3>
            <p className={styles.sectionDesc}>{t.settings.storage.description}</p>

            <div className={styles.actions}>
              {hasCachedConversations && (
                <button
                  className={clsx(styles.button, styles.buttonPrimary)}
                  data-primary-action="true"
                  onClick={exportLocalBundle}
                  disabled={exporting}
                >
                  <Download size={14} />
                  {exporting ? t.settings.storage.exportBuilding : t.actions.downloadBundle}
                </button>
              )}
              {exportProgress.phase !== 'idle' && (
                <p className={styles.progressHint} aria-live="polite">
                  {exportProgress.message}
                </p>
              )}
              {hasCachedConversations && (
                <button
                  className={clsx(styles.button, styles.buttonSecondary)}
                  onClick={handleCleanup}
                  disabled={!storageAvailable}
                  title={storageBlockedHint ?? t.settings.storage.cleanupDesc}
                  aria-label={`${t.settings.storage.cleanup}. ${t.settings.storage.cleanupDesc}`}
                >
                  <HardDriveDownload size={14} />
                  {t.settings.storage.cleanup}
                  <CircleHelp size={12} className={styles.buttonHintIcon} />
                </button>
              )}
              <button
                className={clsx(styles.button, styles.buttonDanger)}
                data-primary-action="true"
                onClick={() => setConfirmOpen(true)}
                disabled={purgeDisabled}
                title={purgeTitle}
              >
                <Trash2 size={14} />
                {t.settings.storage.purge}
              </button>
            </div>
          </section>
        </div>

        {confirmOpen && (
          <div className="modal-overlay nested" onMouseDown={confirmA11y.onOverlayMouseDown}>
            <div className={clsx('modal', styles.confirmModal)} ref={confirmA11y.containerRef}>
              <header>
                <h2>{t.settings.storage.purgeDialogTitle}</h2>
              </header>
              <div className={styles.confirmBody}>
                <p>
                  {formatText(t.settings.storage.purgeDialogBody, { sizeNote: confirmSizeNote })}
                </p>
              </div>
              <div className={styles.confirmActions}>
                <button className="secondary" onClick={() => setConfirmOpen(false)} disabled={purging}>
                  {t.actions.close}
                </button>
                <button className="danger" onClick={handleConfirmPurge} disabled={purging}>
                  {purging ? t.settings.storage.purging : t.settings.storage.purgeNow}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark'
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function appThemeLabel(
  theme: 'dark' | 'light',
  t: TranslationMessages,
): string {
  return theme === 'light' ? t.settings.viewer.themeLight : t.settings.viewer.themeDark
}

function themeLabel(theme: string): string {
  const map: Record<string, string> = {
    a11yDark: 'a11y-dark',
    a11yLight: 'a11y-light',
    monokaiSublime: 'monokai-sublime',
    idea: 'idea',
    oneDark: 'One Dark',
    oneLight: 'One Light',
    github: 'GitHub',
    nightOwl: 'Night Owl',
    nightOwlLight: 'Night Owl Light',
    shadesOfPurple: 'Shades of Purple',
    duotoneDark: 'Duotone Dark',
    duotoneLight: 'Duotone Light',
    vsDark: 'VS Dark',
    vsLight: 'VS Light',
  }
  return map[theme] ?? theme
}
