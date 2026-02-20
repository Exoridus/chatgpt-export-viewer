import clsx from 'clsx'
import { CheckCircle2, Copy, UploadCloud, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useModalA11y } from '../../hooks/useModalA11y'
import { type ImportMode,useAppData } from '../../state/AppDataContext'

interface ImportModalProps {
  open: boolean
  onClose: () => void
}

export function ImportModal({ open, onClose }: ImportModalProps) {
  const { importZips, importing, importProgress, resetImportProgress, pushNotice, storageAvailable, mergedIndex } = useAppData()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [mode, setMode] = useState<ImportMode>('upsert')
  const { containerRef, onOverlayMouseDown } = useModalA11y({
    open,
    onClose: () => {
      if (!importing) {
        resetImportProgress()
        onClose()
      }
    },
    disableClose: importing,
    primaryActionSelector: '.primary',
  })
  const storageDisabledMessage =
    'Browser storage is disabled — enable IndexedDB/localStorage access for this site to import conversations.'

  useEffect(() => {
    if (!open) {
      setIsDragging(false)
      if (!importing) {
        resetImportProgress()
      }
    }
  }, [open, importing, resetImportProgress])

  const handleClose = useCallback(() => {
    if (importing) {return}
    resetImportProgress()
    onClose()
  }, [importing, onClose, resetImportProgress])

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!storageAvailable) {return}
      if (!files || !files.length) {return}
      const list = Array.from(files).filter((file) => file.name.toLowerCase().endsWith('.zip'))
      if (!list.length) {
        pushNotice('Only .zip archives from ChatGPT exports are supported.', 'warning')
        return
      }
      void importZips(list, mode)
    },
    [importZips, mode, pushNotice, storageAvailable],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)
      if (!storageAvailable) {return}
      handleFiles(event.dataTransfer.files)
    },
    [handleFiles, storageAvailable],
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      if (!storageAvailable) {return}
      setIsDragging(true)
    },
    [storageAvailable],
  )

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
  }, [])

  const startFilePicker = useCallback(() => {
    if (!storageAvailable) {return}
    if (importProgress.phase === 'complete') {
      resetImportProgress()
    }
    fileInputRef.current?.click()
  }, [importProgress.phase, resetImportProgress, storageAvailable])

  if (!open) {return null}

  const showSelector = importProgress.phase === 'idle' || importProgress.phase === 'error'
  const showSuccess = importProgress.phase === 'complete'
  const processed = importProgress.processed ?? 0
  const total = importProgress.total ?? 0
  const progressPercent = total > 0 ? Math.round((processed / total) * 100) : null
  const assetsProcessed =
    typeof importProgress.assetsProcessed === 'number' ? importProgress.assetsProcessed : null
  const assetsTotal = typeof importProgress.assetsTotal === 'number' ? importProgress.assetsTotal : null
  const progressFillWidth = progressPercent !== null ? `${progressPercent}%` : '100%'
  const dropZoneTitle = !storageAvailable ? storageDisabledMessage : undefined
  const selectorDisabled = importing || !storageAvailable

  let conversationStatus = importProgress.message
  if (importProgress.phase === 'saving' && total > 0) {
    const nextIndex = Math.min(processed + 1, total)
    conversationStatus =
      processed >= total ? `Conversations ${processed}/${total}` : `Processing conversations ${nextIndex}/${total}`
  } else if (importProgress.phase === 'complete' && total > 0) {
    conversationStatus = `Conversations ${processed}/${total}`
  }

  let assetStatus: string | null = null
  if (assetsTotal && assetsTotal > 0) {
    const completedAssets = Math.min(assetsProcessed ?? 0, assetsTotal)
    assetStatus = `Assets ${completedAssets}/${assetsTotal}`
  }
  const archiveLine =
    typeof importProgress.currentArchiveIndex === 'number' && typeof importProgress.currentArchiveTotal === 'number'
      ? importProgress.currentArchiveIndex > 0
        ? `Archive ${importProgress.currentArchiveIndex} of ${importProgress.currentArchiveTotal}`
        : null
      : null
  const archiveFileName = importProgress.currentArchiveName ?? null

  const modeDescriptions: Record<ImportMode, string> = {
    upsert: 'Imports newer conversations and adds conversations that do not exist yet.',
    replace: 'Clears existing conversations and imports only the selected archives.',
    clone: 'Imports missing conversations and keeps both versions when timestamps differ.',
  }
  const modeOptions: Array<{ value: ImportMode; label: string }> = [
    { value: 'upsert', label: 'Import newer and missing entries' },
    { value: 'replace', label: 'Import and replace all existing entries' },
    { value: 'clone', label: 'Import missing entries and clone when timestamps differ' },
  ]
  const modeSelectId = 'import-mode-select'

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Import conversations" onMouseDown={onOverlayMouseDown}>
      <div className="import-modal" ref={containerRef}>
        <header className="import-modal-header">
          <div>
            <h2>Import Conversations</h2>
            <p>Upload ChatGPT data export ZIP files</p>
          </div>
          {!importing && (
            <button className="icon-button modal-close-btn" onClick={handleClose} aria-label="Close import dialog">
              <X size={16} />
            </button>
          )}
        </header>
        {!storageAvailable && <p className="import-status warning">{storageDisabledMessage}</p>}
        {showSelector && (
          <>
            <div className="import-mode-field">
              <label htmlFor={modeSelectId}>When importing conversations, use this strategy:</label>
              <select
                id={modeSelectId}
                className="import-mode-select"
                value={mode}
                onChange={(event) => setMode(event.target.value as ImportMode)}
                disabled={selectorDisabled}
                title={selectorDisabled ? dropZoneTitle : undefined}
              >
                {modeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="import-mode-help">{modeDescriptions[mode]}</p>
            {importProgress.phase === 'error' && <p className="import-status error">{importProgress.message}</p>}
            <button className="primary" onClick={startFilePicker} disabled={selectorDisabled} title={dropZoneTitle}>
              Select ZIPs
            </button>
            <div
              className={clsx('drop-zone', isDragging && 'is-dragging', !storageAvailable && 'is-disabled')}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={storageAvailable ? startFilePicker : undefined}
              role="button"
              tabIndex={storageAvailable ? 0 : -1}
              aria-disabled={!storageAvailable}
              title={dropZoneTitle}
              onKeyDown={(event) => storageAvailable && event.key === 'Enter' && startFilePicker()}
            >
              <UploadCloud size={32} aria-hidden="true" />
              <p>Drag & drop ZIP files here</p>
              <p className="drop-zone-hint">You can select multiple exports at once.</p>
            </div>
          </>
        )}
        {!showSelector && !showSuccess && (
          <div className="import-progress">
            {archiveLine && <p className="progress-line progress-meta">{archiveLine}</p>}
            {archiveFileName && (
              <div className="progress-file-row" title={archiveFileName}>
                <p className="progress-file-name">{archiveFileName}</p>
                <button
                  type="button"
                  className="icon-button progress-copy-btn"
                  title="Copy archive filename"
                  aria-label="Copy archive filename"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(archiveFileName)
                    } catch {
                      // noop
                    }
                  }}
                >
                  <Copy size={13} />
                </button>
              </div>
            )}
            <p className="progress-line">{conversationStatus}</p>
            <div
              className="progress-bar"
              role="progressbar"
              aria-label="Conversation import progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent ?? undefined}
            >
              <div
                className={clsx('progress-bar-fill', progressPercent === null && 'is-indeterminate')}
                style={{ width: progressFillWidth }}
              />
            </div>
            {assetStatus && <p className="progress-line progress-meta">{assetStatus}</p>}
          </div>
        )}
        {showSuccess && (
          <div className="import-success">
            <CheckCircle2 size={32} aria-hidden="true" />
            <p className="import-success-title">{importProgress.resultCount ? 'Import complete.' : 'Everything is up to date.'}</p>
            <p className="progress-meta">{importProgress.message}</p>
            <div className="import-success-actions">
              <button
                className="primary"
                onClick={() => {
                  onClose()
                  const first = mergedIndex[0]
                  if (typeof window !== 'undefined') {
                    window.location.hash = first ? `/${first.id}` : '/'
                  }
                }}
              >
                View conversations
              </button>
              <button className="secondary" onClick={resetImportProgress} disabled={importing}>
                Import more
              </button>
            </div>
          </div>
        )}
        <input
          type="file"
          accept=".zip"
          multiple
          ref={fileInputRef}
          className="sr-only"
          disabled={!storageAvailable}
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
    </div>
  )
}
