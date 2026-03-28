import clsx from 'clsx';
import { Download, Trash2, X } from 'lucide-react';
import { Highlight, themes } from 'prism-react-renderer';
import { useEffect, useMemo, useState } from 'react';

import { useModalA11y } from '../../hooks/useModalA11y';
import { formatText } from '../../lib/i18n';
import { useAppData } from '../../state/AppDataContext';
import { useImportExport } from '../../state/ImportExportContext';
import { usePreferences } from '../../state/PreferencesContext';
import styles from './SettingsModal.module.scss';

const PREVIEW_CODE = `// Fetch and transform data
async function loadUsers(role = "admin") {
  const res = await fetch("/api/users?active=true")
  const data = await res.json()
  return data
    .filter((u) => u.role === role && u.age >= 18)
    .map(({ name, email }) => ({ name, email }))
}`;

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { exportLocalBundle, purgeAll, refreshDbSize, dbSizeBytes, localIndex, storageAvailable } = useAppData();
  const { exporting, exportProgress } = useImportExport();
  const { viewerPreferences, setViewerPreferences, t } = usePreferences();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [sizeReady, setSizeReady] = useState(false);
  const { containerRef, onOverlayMouseDown } = useModalA11y({
    open,
    onClose,
    disableClose: confirmOpen,
    primaryActionSelector: '[data-primary-action="true"]',
  });
  const confirmA11y = useModalA11y({
    open: confirmOpen,
    onClose: () => setConfirmOpen(false),
    disableClose: purging,
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setSizeReady(false);
    void (async () => {
      try {
        await refreshDbSize();
      } finally {
        if (!cancelled) {
          setSizeReady(true);
        }
      }
    })();
    setConfirmOpen(false);
    setPurging(false);
    return () => {
      cancelled = true;
    };
  }, [open, refreshDbSize]);
  const effectiveCodeTheme = viewerPreferences.codeTheme;
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
    } as const;
    return themeMap[effectiveCodeTheme] ?? themes.oneDark;
  }, [effectiveCodeTheme]);

  if (!open) {
    return null;
  }

  const hasCachedConversations = localIndex.length > 0;
  const nbsp = '\u00A0';
  const formattedSize = typeof dbSizeBytes === 'number' ? `${(dbSizeBytes / (1024 * 1024)).toFixed(1)}${nbsp}MB` : null;
  const sizeLabel = sizeReady && formattedSize ? formattedSize : null;
  const hasStoredData = hasCachedConversations || (sizeReady && (dbSizeBytes ?? 0) > 0);
  const topSettingsTitle = t.settings.sections.general;

  const storageBlockedHint = !storageAvailable ? t.settings.storage.storageBlockedHint : undefined;
  const purgeDisabled = !storageAvailable || !hasStoredData;
  const purgeTitle = !storageAvailable ? storageBlockedHint : !hasStoredData ? t.settings.storage.purgeNeedsImport : undefined;
  const confirmSizeNote = sizeLabel ? ` (${sizeLabel})` : '';

  const handleConfirmPurge = async () => {
    if (purging) {
      return;
    }
    setPurging(true);
    await purgeAll();
    setSizeReady(false);
    try {
      await refreshDbSize();
    } finally {
      setSizeReady(true);
    }
    setPurging(false);
    setConfirmOpen(false);
    onClose();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onOverlayMouseDown}>
      <div className={styles.modal} ref={containerRef}>
        <header className={styles.header}>
          <h2>{t.settings.title}</h2>
          <button type="button" className="icon-button modal-close-btn" onClick={onClose} aria-label={t.actions.close}>
            <X size={16} />
          </button>
        </header>

        <div className={styles.body}>
          <section className={styles.controlsSection}>
            <h3 className={styles.sectionTitle}>{topSettingsTitle}</h3>
            <div className={styles.controlsBlock}>
              <div className={styles.controlsGrid}>
                <label className={styles.fieldInline}>
                  <span className={styles.fieldLabel}>{t.settings.viewer.language}</span>
                  <select
                    className={styles.select}
                    value={viewerPreferences.locale}
                    onChange={event => setViewerPreferences({ locale: event.target.value as 'auto' | 'en' | 'de' })}
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
                    onChange={event => {
                      const appTheme = event.target.value as 'system' | 'dark' | 'light';
                      setViewerPreferences({ appTheme });
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
                    onChange={event =>
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

              <div className={styles.toggleGroup}>
                <label className={styles.toggle}>
                  <span className={styles.toggleLabel}>{t.settings.viewer.collapseSystem}</span>
                  <span className={clsx(styles.switch, viewerPreferences.collapseSystemMessages && styles.switchOn)}>
                    <input
                      type="checkbox"
                      checked={viewerPreferences.collapseSystemMessages}
                      onChange={event => setViewerPreferences({ collapseSystemMessages: event.target.checked })}
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
                      onChange={event => setViewerPreferences({ collapseCodeBlocks: event.target.checked })}
                    />
                    <span className={styles.switchTrack} />
                  </span>
                </label>
              </div>
            </div>
          </section>

          <section className={styles.previewSection}>
            <h3 className={styles.sectionTitle}>{t.settings.viewer.themePreview}</h3>
            <div className={styles.appPreview} aria-live="polite">
              <aside className={styles.previewSidebar} aria-hidden="true">
                <span className={styles.previewSidebarTitle}>{t.settings.viewer.previewSidebarTitle}</span>
                <span className={styles.previewSidebarItem} />
                <span className={styles.previewSidebarItemMuted} />
              </aside>
              <div className={styles.previewMain}>
                <div className={styles.previewTopBar} />
                <div className={styles.previewUserBubble}>{t.settings.viewer.previewPrompt}</div>
                <div className={styles.previewAssistantBlock}>
                  <p>{t.settings.viewer.previewReply}</p>
                  <div className={styles.previewCodeWrap}>
                    <Highlight theme={codeTheme} code={PREVIEW_CODE} language="javascript">
                      {({ style, tokens, getLineProps, getTokenProps }) => (
                        <pre className={styles.themePreviewCode} style={{ ...style, margin: 0 }}>
                          {tokens.slice(0, 6).map((line, i) => {
                            const { key: _k, ...lineProps } = getLineProps({ line, key: i });
                            return (
                              <div key={i} {...lineProps}>
                                {line.map((token, j) => {
                                  const { key: _tk, ...tokenProps } = getTokenProps({ token, key: j });
                                  return <span key={j} {...tokenProps} />;
                                })}
                              </div>
                            );
                          })}
                        </pre>
                      )}
                    </Highlight>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.storageSection}>
            <h3 className={styles.sectionTitle}>
              {t.settings.storage.title}
              {sizeLabel ? <span className={styles.sectionBadge}>{sizeLabel}</span> : null}
            </h3>
            <p className={styles.sectionDesc}>{t.settings.storage.description}</p>

            <div className={styles.storageActions}>
              <div className={styles.storageActionCard}>
                <div className={styles.storageActionCopy}>
                  <p className={styles.storageActionTitle}>{t.settings.storage.exportTitle}</p>
                  <p className={styles.storageActionDesc}>
                    {hasCachedConversations ? t.settings.storage.exportDescription : t.settings.storage.exportUnavailableHint}
                  </p>
                </div>
                <div className={styles.storageActionHeader}>
                  <button
                    type="button"
                    className={clsx(styles.button, styles.buttonPrimary)}
                    data-primary-action="true"
                    onClick={exportLocalBundle}
                    disabled={exporting || !hasCachedConversations}
                  >
                    <Download size={14} />
                    {exporting ? t.settings.storage.exportBuilding : t.settings.storage.exportAction}
                  </button>
                </div>
              </div>

              {exportProgress.phase !== 'idle' && (
                <p className={styles.progressHint} aria-live="polite">
                  {exportProgress.message}
                </p>
              )}
            </div>

            <div className={styles.storageDanger}>
              <div className={styles.storageDangerCopy}>
                <p className={styles.storageDangerTitle}>{t.settings.storage.purgeTitle}</p>
                <p className={styles.storageDangerHint}>{t.settings.storage.purgeDescription}</p>
              </div>
              <div className={styles.storageDangerAction}>
                <button
                  type="button"
                  className={clsx(styles.button, styles.buttonDanger)}
                  data-primary-action="true"
                  onClick={() => setConfirmOpen(true)}
                  disabled={purgeDisabled}
                  title={purgeTitle}
                >
                  <Trash2 size={14} />
                  {t.settings.storage.purgeAction}
                </button>
              </div>
            </div>
          </section>
        </div>

        {confirmOpen ? (
          <div className="modal-overlay nested" onMouseDown={confirmA11y.onOverlayMouseDown}>
            <div className={clsx('modal', styles.confirmModal)} ref={confirmA11y.containerRef}>
              <header>
                <h2>{t.settings.storage.purgeDialogTitle}</h2>
              </header>
              <div className={styles.confirmBody}>
                <p>{formatText(t.settings.storage.purgeDialogBody, { sizeNote: confirmSizeNote })}</p>
              </div>
              <div className={styles.confirmActions}>
                <button type="button" className="secondary" onClick={() => setConfirmOpen(false)} disabled={purging}>
                  {t.actions.close}
                </button>
                <button type="button" className="danger" onClick={handleConfirmPurge} disabled={purging}>
                  {purging ? t.settings.storage.purging : t.settings.storage.purgeNow}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
