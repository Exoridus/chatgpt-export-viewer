import clsx from 'clsx';
import { CheckCircle2, UploadCloud, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useModalA11y } from '../../hooks/useModalA11y';
import { formatText } from '../../lib/i18n';
import { type ImportMode, useAppData } from '../../state/AppDataContext';
import { useImportExport } from '../../state/ImportExportContext';
import { useNotification } from '../../state/NotificationContext';
import { usePreferences } from '../../state/PreferencesContext';
import styles from './ImportModal.module.scss';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  pendingFiles?: File[];
  onConsumePendingFiles?: () => void;
}

export function ImportModal({ open, onClose, pendingFiles = [], onConsumePendingFiles }: ImportModalProps) {
  const { importZips, storageAvailable, mergedIndex } = useAppData();
  const { importing, importProgress, resetImportProgress } = useImportExport();
  const { pushNotice } = useNotification();
  const { t } = usePreferences();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<ImportMode>('upsert');
  const { containerRef, onOverlayMouseDown } = useModalA11y({
    open,
    onClose: () => {
      if (!importing) {
        resetImportProgress();
        onClose();
      }
    },
    disableClose: importing,
    primaryActionSelector: '[data-primary-action="true"]',
  });
  const storageDisabledMessage = t.importer.storageDisabledSite;
  const hasExistingConversations = mergedIndex.length > 0;

  useEffect(() => {
    if (!open) {
      setIsDragging(false);
      if (!importing) {
        resetImportProgress();
      }
    }
  }, [open, importing, resetImportProgress]);

  const handleClose = useCallback(() => {
    if (importing) {
      return;
    }
    resetImportProgress();
    onClose();
  }, [importing, onClose, resetImportProgress]);

  const handleFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!storageAvailable) {
        return;
      }
      if (!files?.length) {
        return;
      }
      const sourceFiles = Array.isArray(files) ? files : [...files];
      const list = sourceFiles.filter(file => file.name.toLowerCase().endsWith('.zip'));
      if (!list.length) {
        pushNotice(t.importer.notifications.zipOnly, 'warning');
        return;
      }
      void importZips(list, hasExistingConversations ? mode : 'upsert');
    },
    [hasExistingConversations, importZips, mode, pushNotice, storageAvailable, t.importer.notifications.zipOnly]
  );

  const handlePendingFilesImport = useCallback(() => {
    if (!pendingFiles.length) {
      return;
    }
    handleFiles(pendingFiles);
    onConsumePendingFiles?.();
  }, [handleFiles, onConsumePendingFiles, pendingFiles]);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (!storageAvailable) {
        return;
      }
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles, storageAvailable]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!storageAvailable) {
        return;
      }
      setIsDragging(true);
    },
    [storageAvailable]
  );

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const startFilePicker = useCallback(() => {
    if (!storageAvailable) {
      return;
    }
    if (importProgress.phase === 'complete') {
      resetImportProgress();
    }
    fileInputRef.current?.click();
  }, [importProgress.phase, resetImportProgress, storageAvailable]);

  if (!open) {
    return null;
  }

  const showSelector = importProgress.phase === 'idle' || importProgress.phase === 'error';
  const showModeSelector = showSelector && hasExistingConversations;
  const showSuccess = importProgress.phase === 'complete';
  const processed = importProgress.processed ?? 0;
  const total = importProgress.total ?? 0;
  const progressPercent = total > 0 ? Math.round((processed / total) * 100) : null;
  const assetsProcessed = typeof importProgress.assetsProcessed === 'number' ? importProgress.assetsProcessed : null;
  const assetsTotal = typeof importProgress.assetsTotal === 'number' ? importProgress.assetsTotal : null;
  const progressFillWidth = progressPercent !== null ? `${progressPercent}%` : '100%';
  const dropZoneTitle = !storageAvailable ? storageDisabledMessage : undefined;
  const selectorDisabled = importing || !storageAvailable;

  let conversationStatus = importProgress.message;
  if (importProgress.phase === 'saving' && total > 0) {
    const nextIndex = Math.min(processed + 1, total);
    conversationStatus =
      processed >= total
        ? formatText(t.importer.progress.conversationCount, { processed, total })
        : formatText(t.importer.progress.processingConversationCount, { processed: nextIndex, total });
  } else if (importProgress.phase === 'complete' && total > 0) {
    conversationStatus = formatText(t.importer.progress.conversationCount, { processed, total });
  }

  let assetStatus: string | null = null;
  if (assetsTotal && assetsTotal > 0) {
    const completedAssets = Math.min(assetsProcessed ?? 0, assetsTotal);
    assetStatus = formatText(t.importer.progress.assetCount, {
      processed: completedAssets,
      total: assetsTotal,
    });
  }
  const archiveLine =
    typeof importProgress.currentArchiveIndex === 'number' && typeof importProgress.currentArchiveTotal === 'number'
      ? importProgress.currentArchiveIndex > 0
        ? formatText(t.importer.progress.archiveCount, {
            index: importProgress.currentArchiveIndex,
            total: importProgress.currentArchiveTotal,
          })
        : null
      : null;
  const archiveFileName = importProgress.currentArchiveName ?? null;

  const modeOptions: Array<{ value: ImportMode; label: string }> = [
    { value: 'upsert', label: t.importer.mode.upsert },
    { value: 'replace', label: t.importer.mode.replace },
    { value: 'clone', label: t.importer.mode.clone },
  ];
  const modeSelectId = 'import-mode-select';

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={t.importer.title} onMouseDown={onOverlayMouseDown}>
      <div className={styles.modal} ref={containerRef}>
        <header className={styles.header}>
          <div>
            <h2>{t.importer.title}</h2>
            <p>{t.importer.subtitle}</p>
          </div>
          {!importing && (
            <button className="icon-button modal-close-btn" onClick={handleClose} aria-label={t.actions.close}>
              <X size={16} />
            </button>
          )}
        </header>
        {!storageAvailable && <p className={clsx(styles.status, styles.statusWarning)}>{storageDisabledMessage}</p>}
        {showSelector ? (
          <>
            {showModeSelector ? (
              <>
                <div className={styles.modeField}>
                  <label htmlFor={modeSelectId}>{t.importer.modeLabel}</label>
                  <select
                    id={modeSelectId}
                    className={styles.modeSelect}
                    value={mode}
                    onChange={event => setMode(event.target.value as ImportMode)}
                    disabled={selectorDisabled}
                    title={selectorDisabled ? dropZoneTitle : undefined}
                  >
                    {modeOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className={styles.modeHelp}>{t.importer.modeDescription[mode]}</p>
              </>
            ) : (
              <p className={styles.modeHelp}>{t.importer.firstImportHint}</p>
            )}
            {importProgress.phase === 'error' && <p className={clsx(styles.status, styles.statusError)}>{importProgress.message}</p>}
            {pendingFiles.length > 0 && (
              <>
                <p className={styles.modeHelp}>{formatText(t.importer.pendingFilesReady, { count: pendingFiles.length })}</p>
                <button className="primary" data-primary-action="true" onClick={handlePendingFilesImport} disabled={selectorDisabled} title={dropZoneTitle}>
                  {formatText(t.importer.importDropped, { count: pendingFiles.length })}
                </button>
              </>
            )}
            <button className="primary" data-primary-action="true" onClick={startFilePicker} disabled={selectorDisabled} title={dropZoneTitle}>
              {t.importer.selectFiles}
            </button>
            <div
              className={clsx(styles.dropZone, isDragging && styles.dropZoneDragging, !storageAvailable && styles.dropZoneDisabled)}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={storageAvailable ? startFilePicker : undefined}
              role="button"
              tabIndex={storageAvailable ? 0 : -1}
              aria-disabled={!storageAvailable}
              title={dropZoneTitle}
              onKeyDown={event => storageAvailable && event.key === 'Enter' && startFilePicker()}
            >
              <UploadCloud size={32} aria-hidden="true" />
              <p>{t.importer.dropZone}</p>
              <p className={styles.dropZoneHint}>{t.importer.multipleHint}</p>
            </div>
          </>
        ) : null}
        {!showSelector && !showSuccess && (
          <div className={styles.progress}>
            {archiveLine ? <p className={clsx(styles.progressLine, styles.progressMeta)}>{archiveLine}</p> : null}
            {archiveFileName ? <p className={styles.progressFileName}>{archiveFileName}</p> : null}
            <p className={styles.progressLine}>{conversationStatus}</p>
            <div
              className={styles.progressBar}
              role="progressbar"
              aria-label={t.importer.progressAria}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent ?? undefined}
            >
              <div
                className={clsx(styles.progressBarFill, progressPercent === null && styles.progressBarFillIndeterminate)}
                style={{ width: progressFillWidth }}
              />
            </div>
            {assetStatus ? <p className={clsx(styles.progressLine, styles.progressMeta)}>{assetStatus}</p> : null}
          </div>
        )}
        {showSuccess ? (
          <div className={styles.success}>
            <CheckCircle2 size={32} aria-hidden="true" />
            <p className={styles.successTitle}>{importProgress.resultCount ? t.importer.successTitle : t.importer.completeNoChanges}</p>
            <p className={styles.progressMeta}>{importProgress.message}</p>
            <div className={styles.successActions}>
              <button
                className="primary"
                onClick={() => {
                  onClose();
                  const first = mergedIndex[0];
                  if (typeof window !== 'undefined') {
                    window.location.hash = first ? `/${first.id}` : '/';
                  }
                }}
              >
                {t.importer.viewConversations}
              </button>
            </div>
          </div>
        ) : null}
        <input
          type="file"
          accept=".zip"
          multiple
          ref={fileInputRef}
          className="sr-only"
          disabled={!storageAvailable}
          onChange={event => handleFiles(event.target.files)}
        />
      </div>
    </div>
  );
}
