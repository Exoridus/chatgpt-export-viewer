import clsx from 'clsx'
import { CircleHelp, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useModalA11y } from '../../hooks/useModalA11y'
import { useAppData } from '../../state/AppDataContext'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const {
    cacheEnabled,
    toggleCache,
    exportLocalBundle,
    cleanupLocal,
    purgeAll,
    refreshDbSize,
    dbSizeBytes,
    localIndex,
    storageAvailable,
  } = useAppData()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [purging, setPurging] = useState(false)
  const [sizeReady, setSizeReady] = useState(false)
  const { containerRef, onOverlayMouseDown } = useModalA11y({
    open,
    onClose,
    disableClose: confirmOpen,
    primaryActionSelector: '.settings-actions .primary, .settings-actions .danger',
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

  if (!open) {return null}

  const hasCachedConversations = localIndex.length > 0
  const formattedSize = typeof dbSizeBytes === 'number' ? `${(dbSizeBytes / (1024 * 1024)).toFixed(1)} MB` : null
  const sizeLabel = sizeReady && formattedSize ? formattedSize : null
  const clearCacheLabel = sizeLabel ? `Clear Cache (${sizeLabel})` : 'Clear Cache'
  const purgeLabel = sizeLabel ? `Purge Database (${sizeLabel})` : 'Purge Database'
  const hasStoredData = hasCachedConversations || (sizeReady && (dbSizeBytes ?? 0) > 0)
  const storageBlockedHint = !storageAvailable
    ? 'Browser storage is disabled — enable IndexedDB/localStorage to manage cached data.'
    : undefined
  const purgeDisabled = !storageAvailable || !hasStoredData
  const purgeTitle = !storageAvailable
    ? storageBlockedHint
    : !hasStoredData
      ? 'Import conversations before purging.'
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
      <div className="modal" ref={containerRef}>
        <header>
          <h2>Settings</h2>
          <button className="icon-button modal-close-btn" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </header>

        <section>
          <label className="settings-toggle-row">
            <span className="settings-toggle-copy">
              <span className="settings-toggle-title">Cache in IndexedDB</span>
              <span className="settings-toggle-desc">Keep imported conversations locally for faster offline access.</span>
            </span>
            <span className="settings-checkbox-wrap" title={storageBlockedHint}>
              <input
                type="checkbox"
                checked={cacheEnabled}
                onChange={(event) => toggleCache(event.target.checked)}
                disabled={!storageAvailable}
              />
            </span>
          </label>
        </section>

        <section className="actions settings-actions">
          {hasCachedConversations && (
            <button className="primary" onClick={exportLocalBundle}>
              Download self-hosted data
            </button>
          )}
          {hasCachedConversations && (
            <button
              className="secondary"
              onClick={handleCleanup}
              disabled={!storageAvailable}
              title={storageBlockedHint ?? 'Removes local duplicates when server data is already available.'}
              aria-label={`${clearCacheLabel}. Removes local duplicates that already exist on server data.`}
            >
              {clearCacheLabel}
              <CircleHelp size={13} />
            </button>
          )}
          <button
            className="danger"
            onClick={() => setConfirmOpen(true)}
            disabled={purgeDisabled}
            title={purgeTitle ?? 'Deletes all local conversations, assets, and metadata.'}
          >
            <Trash2 size={16} /> {purgeLabel}
            <CircleHelp size={13} />
          </button>
        </section>
      </div>

      {confirmOpen && (
        <div
          className="modal-overlay nested"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="purge-confirm-title"
          onMouseDown={confirmA11y.onOverlayMouseDown}
        >
          <div className="confirm-modal" ref={confirmA11y.containerRef}>
            <h3 id="purge-confirm-title">Delete all imported data?</h3>
            <p>This removes every cached conversation and asset{confirmSizeNote}. This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="secondary" onClick={() => setConfirmOpen(false)} disabled={purging}>
                Cancel
              </button>
              <button className={clsx('danger', purging && 'is-busy')} onClick={handleConfirmPurge} disabled={purging}>
                {purging ? 'Purging…' : 'Yes, delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
