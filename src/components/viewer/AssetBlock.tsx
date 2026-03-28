import clsx from 'clsx'
import { AudioLines, Download, ExternalLink, FileIcon, Film, ImageIcon, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useModalA11y } from '../../hooks/useModalA11y'
import { useAppData } from '../../state/AppDataContext'
import { usePreferences } from '../../state/PreferencesContext'
import styles from './AssetBlock.module.scss'
import sharedStyles from './AssetViewerShared.module.scss'
import { CodeBlock } from './CodeBlock'

interface AssetBlockProps {
  assetPointer: string
  assetKey?: string
  mediaType?: 'image' | 'audio' | 'video' | 'file'
  alt?: string
}

export function AssetBlock({ assetPointer, assetKey, mediaType = 'file', alt }: AssetBlockProps) {
  const { getAssetBlobUrl } = useAppData()
  const { t } = usePreferences()
  const [url, setUrl] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [textPreview, setTextPreview] = useState<string | null>(null)
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      if (!assetKey) {
        return
      }
      const localUrl = await getAssetBlobUrl(assetKey)
      if (!cancelled) {
        setUrl(localUrl ?? buildServerAssetPath(assetKey))
      }
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [assetKey, getAssetBlobUrl])

  const resolvedUrl = url ?? (assetKey ? buildServerAssetPath(assetKey) : '')
  const displayName = useMemo(() => alt || extractAssetName(assetKey || assetPointer), [alt, assetKey, assetPointer])
  const canPreviewText = mediaType === 'file' && isTextLikeAsset(displayName)

  useEffect(() => {
    if (!viewerOpen || !canPreviewText || !resolvedUrl) {
      setTextPreview(null)
      setTextLoading(false)
      setTextError(null)
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
        if (cancelled) {
          return
        }
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
  }, [canPreviewText, resolvedUrl, viewerOpen])

  if (!assetKey) {
    return <div className={styles.missing}>Missing asset {assetPointer}</div>
  }

  return (
    <>
      <button
        type="button"
        className={styles.thumb}
        onClick={() => setViewerOpen(true)}
        aria-label={`${t.viewer.openAttachment} ${displayName}`}
      >
        {mediaType === 'image' && (
          <>
            <img src={resolvedUrl} alt={displayName} className={styles.thumbMedia} loading="lazy" />
            <span className={styles.thumbBadge}>
              <ImageIcon size={13} /> {t.viewer.image}
            </span>
          </>
        )}
        {mediaType === 'video' && (
          <>
            <video className={styles.thumbMedia} muted playsInline preload="metadata">
              <source src={resolvedUrl} />
            </video>
            <span className={styles.thumbBadge}>
              <Film size={13} /> {t.viewer.video}
            </span>
          </>
        )}
        {mediaType === 'audio' && (
          <div className={clsx(styles.thumbFile, styles.thumbAudioCard)}>
            <AudioLines size={24} />
            <span className={styles.thumbFileName} title={displayName}>
              {displayName}
            </span>
            <span className={styles.thumbFileMeta}>{t.viewer.audio}</span>
          </div>
        )}
        {mediaType === 'file' && (
          <div className={styles.thumbFile}>
            <FileIcon size={24} />
            <span className={styles.thumbFileName} title={displayName}>
              {displayName}
            </span>
            <span className={styles.thumbFileMeta}>{fileTypeLabel(displayName)}</span>
          </div>
        )}
      </button>
      {viewerOpen && (
        <AssetViewer
          url={resolvedUrl}
          displayName={displayName}
          mediaType={mediaType}
          textPreview={textPreview}
          textLoading={textLoading}
          textError={textError}
          truncated={truncated}
          language={inferCodeLanguage(displayName)}
          t={t}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  )
}

interface AssetViewerProps {
  url: string
  displayName: string
  mediaType: 'image' | 'audio' | 'video' | 'file'
  textPreview: string | null
  textLoading: boolean
  textError: string | null
  truncated: boolean
  language: string
  t: ReturnType<typeof usePreferences>['t']
  onClose: () => void
}

function AssetViewer({
  url,
  displayName,
  mediaType,
  textPreview,
  textLoading,
  textError,
  truncated,
  language,
  t,
  onClose,
}: AssetViewerProps) {
  const { containerRef, onOverlayMouseDown } = useModalA11y({ open: true, onClose })

  return (
    <div className={clsx('modal-overlay', sharedStyles.overlay)} role="dialog" aria-modal="true" onMouseDown={onOverlayMouseDown}>
      <div ref={containerRef} className={sharedStyles.modal}>
        <header className={sharedStyles.header}>
          <div className={sharedStyles.title}>
            <h3>{displayName}</h3>
          </div>
          <button type="button" className="icon-button modal-close-btn" onClick={onClose} aria-label={t.viewer.closePreview}>
            <X size={16} />
          </button>
        </header>
        <section className={sharedStyles.content}>
          {mediaType === 'image' && <img src={url} alt={displayName} className={sharedStyles.image} />}
          {mediaType === 'video' && (
            <video controls className={sharedStyles.video}>
              <source src={url} />
            </video>
          )}
          {mediaType === 'audio' && (
            <audio controls className={sharedStyles.audio}>
              <source src={url} />
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
                  {textError ? `Preview unavailable (${textError})` : t.viewer.previewUnavailableType}
                </p>
              )}
            </>
          )}
        </section>
        <footer className={sharedStyles.actions}>
          <a className={clsx('secondary', sharedStyles.actionLink)} href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> {t.viewer.openInNewTab}
          </a>
          <a className={clsx('secondary', sharedStyles.actionLink)} href={url} download={displayName}>
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

function buildServerAssetPath(assetKey: string): string {
  if (!assetKey) {return ''}
  return assetKey.startsWith('assets/') ? assetKey : `assets/${assetKey}`
}

function extractAssetName(input: string): string {
  const normalized = input.split('/').pop()?.trim()
  return normalized && normalized.length > 0 ? normalized : input
}

function fileTypeLabel(fileName: string): string {
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).trim().toUpperCase() : ''
  return extension || 'FILE'
}

function isTextLikeAsset(path: string): boolean {
  return /\.(txt|md|markdown|json|js|jsx|ts|tsx|css|scss|sass|html|xml|yml|yaml|toml|ini|conf|sh|bash|ps1|py|sql|go|php|lua)$/i.test(
    path.toLowerCase(),
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
    conf: 'ini',
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
