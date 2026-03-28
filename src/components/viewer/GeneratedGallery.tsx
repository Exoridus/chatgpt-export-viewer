import clsx from 'clsx'
import { Download, ExternalLink, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { List, type RowComponentProps } from 'react-window'

import { useModalA11y } from '../../hooks/useModalA11y'
import { useWindowSize } from '../../hooks/useWindowSize'
import { formatConversationDate } from '../../lib/date'
import { formatText } from '../../lib/i18n'
import { useAppData } from '../../state/AppDataContext'
import { usePreferences } from '../../state/PreferencesContext'
import type { GeneratedAsset } from '../../types'
import { AssetBlock } from './AssetBlock'
import sharedStyles from './AssetViewerShared.module.scss'
import { CodeBlock } from './CodeBlock'
import styles from './GeneratedGallery.module.scss'

interface GeneratedGalleryProps {
  assets: GeneratedAsset[]
}

interface GeneratedGalleryRowData {
  columnCount: number
  gap: number
  onSelect: (asset: GeneratedAsset) => void
  openPreviewLabel: string
  rows: GeneratedAsset[][]
  unknownTimeLabel: string
}

export function GeneratedGallery({ assets }: GeneratedGalleryProps) {
  const [selectedAsset, setSelectedAsset] = useState<GeneratedAsset | null>(null)
  const { width, height: windowHeight } = useWindowSize()
  const { t } = usePreferences()

  const containerWidth = Math.max(300, width - 360)
  const cardMinWidth = 240
  const gap = 16
  const columnCount = Math.max(1, Math.floor((containerWidth + gap) / (cardMinWidth + gap)))
  const rowCount = Math.ceil(assets.length / columnCount)
  const rowHeight = 300

  const rows = useMemo(() => {
    const result: GeneratedAsset[][] = []
    for (let i = 0; i < assets.length; i += columnCount) {
      result.push(assets.slice(i, i + columnCount))
    }
    return result
  }, [assets, columnCount])

  const listHeight = Math.max(400, windowHeight - 180)
  const rowProps = useMemo<GeneratedGalleryRowData>(
    () => ({
      columnCount,
      gap,
      onSelect: setSelectedAsset,
      openPreviewLabel: t.gallery.openPreviewFor,
      rows,
      unknownTimeLabel: t.gallery.unknownTime,
    }),
    [columnCount, gap, rows, t.gallery.openPreviewFor, t.gallery.unknownTime],
  )

  return (
    <>
      <div className={styles.viewport} role="list">
        <List
          rowComponent={GeneratedGalleryRow}
          rowCount={rowCount}
          rowHeight={rowHeight}
          rowProps={rowProps}
          style={{ height: listHeight, width: '100%' }}
        />
      </div>
      {selectedAsset && <GeneratedAssetViewer asset={selectedAsset} onClose={() => setSelectedAsset(null)} />}
    </>
  )
}

function GeneratedGalleryRow({
  ariaAttributes,
  columnCount,
  gap,
  index,
  onSelect,
  openPreviewLabel,
  rows,
  style,
  unknownTimeLabel,
}: RowComponentProps<GeneratedGalleryRowData>) {
  const rowAssets = rows[index]
  if (!rowAssets) {
    return null
  }

  return (
    <div
      {...ariaAttributes}
      className={styles.row}
      style={{ ...style, display: 'flex', gap: `${gap}px` }}
    >
      {rowAssets.map((asset) => (
        <div
          className={clsx(styles.card, styles.cardClickable)}
          key={asset.path}
          role="button"
          tabIndex={0}
          aria-label={formatText(openPreviewLabel, { name: asset.fileName })}
          style={{ width: `calc((100% - ${(columnCount - 1) * gap}px) / ${columnCount})` }}
          onClick={() => onSelect(asset)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(asset)
            }
          }}
        >
          <div className={styles.cardPreview}>
            <GeneratedCardPreview asset={asset} />
          </div>
          <div className={styles.cardFooter}>
            <div className={styles.cardTitle}>
              <span className={styles.cardName} title={asset.fileName}>
                {asset.fileName}
              </span>
            </div>
            <div className={styles.cardMeta}>
              <span
                className={styles.cardTime}
                title={formatAssetTimestampLabel(asset, unknownTimeLabel)}
              >
                {formatAssetTimestampLabel(asset, unknownTimeLabel)}
              </span>
              <span className={styles.cardSize}>{formatBytes(asset.size) || '\u2014'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function GeneratedCardPreview({ asset }: { asset: GeneratedAsset }) {
  const mediaType = detectMediaType(asset.path, asset.mime)
  if (mediaType === 'file') {
    return (
      <div className={styles.filePreview}>
        <span>{fileTypeLabel(asset.fileName)}</span>
      </div>
    )
  }
  return (
    <AssetBlock
      assetPointer={asset.pointers?.[0] ?? asset.path}
      assetKey={asset.path}
      mediaType={mediaType}
      alt={asset.fileName}
    />
  )
}

function GeneratedAssetViewer({ asset, onClose }: { asset: GeneratedAsset; onClose: () => void }) {
  const { getAssetBlobUrl } = useAppData()
  const { t } = usePreferences()
  const { containerRef, onOverlayMouseDown } = useModalA11y({ open: true, onClose })
  const [resolvedUrl, setResolvedUrl] = useState('')
  const [textPreview, setTextPreview] = useState<string | null>(null)
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)

  const mediaType = detectMediaType(asset.path, asset.mime)
  const language = inferCodeLanguage(asset.path)
  const canPreviewText = mediaType === 'file' && isTextLikeAsset(asset.path, asset.mime)

  useEffect(() => {
    let cancelled = false
    async function resolveAssetUrl() {
      const localUrl = await getAssetBlobUrl(asset.path)
      if (!cancelled) {
        setResolvedUrl(localUrl ?? buildServerAssetPath(asset.path))
      }
    }
    resolveAssetUrl()
    return () => {
      cancelled = true
    }
  }, [asset.path, getAssetBlobUrl])

  useEffect(() => {
    if (!canPreviewText || !resolvedUrl) {
      setTextPreview(null)
      setTextError(null)
      setTextLoading(false)
      setTruncated(false)
      return
    }
    let cancelled = false
    setTextLoading(true)
    setTextError(null)
    setTextPreview(null)
    setTruncated(false)
    fetch(resolvedUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.text()
      })
      .then((text) => {
        if (cancelled) {return}
        const maxPreviewChars = 200_000
        setTruncated(text.length > maxPreviewChars)
        setTextPreview(text.slice(0, maxPreviewChars))
      })
      .catch((error) => {
        if (!cancelled) {
          setTextError(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTextLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [canPreviewText, resolvedUrl])

  return (
    <div className={clsx('modal-overlay', sharedStyles.overlay)} role="dialog" aria-modal="true" onMouseDown={onOverlayMouseDown}>
      <div ref={containerRef} className={sharedStyles.modal}>
        <header className={sharedStyles.header}>
          <div className={sharedStyles.title}>
            <h3>{asset.fileName}</h3>
            <p>{asset.path}</p>
          </div>
          <button
            type="button"
            className="icon-button modal-close-btn"
            onClick={onClose}
            aria-label={t.viewer.closePreview}
          >
            <X size={16} />
          </button>
        </header>
        <section className={sharedStyles.content}>
          {mediaType === 'image' && <img src={resolvedUrl} alt={asset.fileName} className={sharedStyles.image} />}
          {mediaType === 'video' && (
            <video controls className={sharedStyles.video}>
              <source src={resolvedUrl} />
            </video>
          )}
          {mediaType === 'audio' && (
            <audio controls className={sharedStyles.audio}>
              <source src={resolvedUrl} />
            </audio>
          )}
          {mediaType === 'file' && (
            <>
              {textLoading && <p className={sharedStyles.status}>{t.viewer.loadingPreview}</p>}
              {!textLoading && textPreview !== null && (
                <div className={sharedStyles.code}>
                  <CodeBlock text={textPreview} lang={language} />
                  {truncated && <p className={sharedStyles.status}>{t.viewer.previewTruncated}</p>}
                </div>
              )}
              {!textLoading && textPreview === null && (
                <p className={sharedStyles.status}>
                  {textError
                    ? formatText(t.viewer.previewUnavailableWithReason, { reason: textError })
                    : t.viewer.previewUnavailableType}
                </p>
              )}
            </>
          )}
        </section>
        <footer className={sharedStyles.actions}>
          <a className={clsx('secondary', sharedStyles.actionLink)} href={resolvedUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> {t.viewer.openInNewTab}
          </a>
          <a className={clsx('secondary', sharedStyles.actionLink)} href={resolvedUrl} download={asset.fileName}>
            <Download size={14} /> {t.viewer.download}
          </a>
          <button type="button" className="secondary" onClick={onClose}>
            {t.actions.close}
          </button>
        </footer>
      </div>
    </div>
  )
}

function detectMediaType(path: string, mime?: string): 'image' | 'video' | 'audio' | 'file' {
  const normalizedMime = (mime ?? '').toLowerCase()
  if (normalizedMime.startsWith('image/')) {return 'image'}
  if (normalizedMime.startsWith('video/')) {return 'video'}
  if (normalizedMime.startsWith('audio/')) {return 'audio'}
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path)) {return 'image'}
  if (/\.(mp4|webm|mov)$/i.test(path)) {return 'video'}
  if (/\.(mp3|wav|m4a)$/i.test(path)) {return 'audio'}
  return 'file'
}

function isTextLikeAsset(path: string, mime?: string): boolean {
  const normalizedPath = path.toLowerCase()
  const normalizedMime = (mime ?? '').toLowerCase()
  if (normalizedMime.startsWith('text/')) {return true}
  if (
    normalizedMime.includes('json') ||
    normalizedMime.includes('javascript') ||
    normalizedMime.includes('typescript') ||
    normalizedMime.includes('xml') ||
    normalizedMime.includes('yaml') ||
    normalizedMime.includes('toml')
  ) {
    return true
  }
  return /\.(txt|md|markdown|json|js|jsx|ts|tsx|css|scss|sass|html|xml|yml|yaml|toml|ini|sh|bash|ps1|py|sql|go|php|lua)$/i.test(
    normalizedPath,
  )
}

function inferCodeLanguage(path: string): string {
  const lower = path.toLowerCase()
  const extension = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''
  const map: Record<string, string> = {
    txt: 'text',
    md: 'markdown',
    markdown: 'markdown',
    json: 'json',
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    html: 'markup',
    xml: 'markup',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    sh: 'bash',
    bash: 'bash',
    ps1: 'powershell',
    py: 'python',
    sql: 'sql',
    go: 'go',
    php: 'php',
    lua: 'lua',
  }
  return map[extension] ?? 'text'
}

function buildServerAssetPath(assetKey: string): string {
  if (!assetKey) {return ''}
  return assetKey.startsWith('assets/') ? assetKey : `assets/${assetKey}`
}

function fileTypeLabel(fileName: string): string {
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).trim().toUpperCase() : ''
  return extension || 'FILE'
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) {return ''}
  const nbsp = '\u00A0'
  if (value < 1024) {return `${value}${nbsp}B`}
  const units = ['KB', 'MB', 'GB']
  let size = value / 1024
  let unit = units[0]
  for (let i = 0; i < units.length; i += 1) {
    unit = units[i]
    if (size < 1024 || i === units.length - 1) {break}
    size /= 1024
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)}${nbsp}${unit}`
}

function formatAssetTimestampLabel(asset: GeneratedAsset, unknownLabel: string): string {
  const timestamp = resolveAssetTimestamp(asset)
  if (!timestamp) {
    return unknownLabel
  }
  return formatConversationDate(timestamp)
}

function resolveAssetTimestamp(asset: GeneratedAsset): number | null {
  const updated = normalizeTimestamp(asset.updatedAt ?? asset.update_time)
  if (updated) {return updated}
  return normalizeTimestamp(asset.createdAt ?? asset.create_time)
}

function normalizeTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {return null}
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {return null}
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric
    }
    const parsed = Date.parse(trimmed)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}
