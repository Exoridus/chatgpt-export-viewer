import clsx from 'clsx'
import { CircleHelp, Search, Settings } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type NavigateFunction, useLocation, useNavigate } from 'react-router-dom'
import { List, type RowComponentProps } from 'react-window'

import { formatShortDate } from '../../lib/date'
import { useAppData } from '../../state/AppDataContext'
import { useImportExport } from '../../state/ImportExportContext'
import { usePreferences } from '../../state/PreferencesContext'
import type { ConversationSummary } from '../../types'
import styles from './Sidebar.module.scss'

interface SidebarProps {
  onOpenUpload: () => void
  onOpenSearch: () => void
  onOpenAbout: () => void
  onOpenSettings: () => void
  isMobileOpen: boolean
  onCloseMobile: () => void
}

const ITEM_HEIGHT = 58

interface SidebarRowData {
  items: ConversationSummary[]
  navigate: NavigateFunction
  noPreviewLabel: string
  onCloseMobile: () => void
  selectedId: string | null
}

export function Sidebar({
  onOpenUpload,
  onOpenSearch,
  onOpenAbout,
  onOpenSettings,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { mergedIndex, localIndex, generatedAssets } = useAppData()
  const { importing } = useImportExport()
  const { t } = usePreferences()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isGalleryRoute = pathname === '/gallery' || pathname === '/artifacts'
  const selectedId = pathname.startsWith('/') && pathname.length > 1 && !isGalleryRoute ? pathname.slice(1) : null
  const hasConversations = mergedIndex.length > 0
  const lastExportTimestamp = localIndex.reduce<number>((latest, item) => Math.max(latest, item.saved_at ?? 0), 0)
  const lastExportLabel = lastExportTimestamp > 0 ? formatShortDate(lastExportTimestamp) : t.sidebar.unknown

  // Flat list: pinned items sort to the top, no separate section headers.
  const items: ConversationSummary[] = useMemo(() => {
    const pinned = mergedIndex.filter((item) => item.pinned)
    const unpinned = mergedIndex.filter((item) => !item.pinned)
    return [...pinned, ...unpinned]
  }, [mergedIndex])

  // Measure the list container height so react-window can fill the available
  // space while the width tracks the parent nav directly.
  const listContainerRef = useRef<HTMLDivElement>(null)
  const [listHeight, setListHeight] = useState(400)
  useEffect(() => {
    const el = listContainerRef.current
    if (!el) {return}
    const update = () => setListHeight(el.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rowProps = useMemo<SidebarRowData>(
    () => ({
      items,
      navigate,
      noPreviewLabel: t.sidebar.noPreview,
      onCloseMobile,
      selectedId,
    }),
    [items, navigate, onCloseMobile, selectedId, t.sidebar.noPreview],
  )

  return (
    <aside className={clsx(styles.sidebar, isMobileOpen && styles.mobileOpen)} aria-label={t.sidebar.ariaSidebar}>
      <div className={styles.fixedTop}>
        <div className={styles.brand}>
          <p>ChatGPT Data Export Viewer</p>
        </div>
        <button
          className={styles.searchTrigger}
          type="button"
          onClick={() => {
            onOpenSearch()
            onCloseMobile()
          }}
          title={`${t.nav.search} (${t.actions.searchKeyboard})`}
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search size={16} aria-hidden="true" />
          <span>{t.nav.search}</span>
          <kbd aria-hidden="true">{t.actions.searchKeyboard}</kbd>
        </button>
        <div className={styles.topActions}>
          <button
            className="primary"
            onClick={() => {
              onOpenUpload()
              onCloseMobile()
            }}
            disabled={importing}
            title={t.importer.title}
          >
            {t.actions.importZip}
          </button>
        </div>
        {hasConversations && (
          <nav className={styles.nav} aria-label={t.sidebar.ariaSecondaryNav}>
            <button
              className={clsx(styles.navButton, isGalleryRoute && styles.navButtonActive)}
              onClick={() => {
                navigate('/artifacts')
                onCloseMobile()
              }}
              aria-current={isGalleryRoute ? 'page' : undefined}
            >
              <span>{t.nav.gallery}</span>
              {generatedAssets.length > 0 && <span className={styles.navCount}>{generatedAssets.length}</span>}
            </button>
          </nav>
        )}
      </div>

      {hasConversations ? (
        <>
          <div className={styles.sectionHead} aria-hidden="true">
            <span>{t.nav.home}</span>
            <span>{mergedIndex.length}</span>
          </div>
          <nav ref={listContainerRef} className={styles.list} aria-label={t.sidebar.ariaConversations}>
            <List
              rowComponent={SidebarRow}
              rowCount={items.length}
              rowHeight={ITEM_HEIGHT}
              rowProps={rowProps}
              overscanCount={5}
              style={{ height: listHeight, width: '100%' }}
            />
          </nav>
        </>
      ) : (
        <div className={styles.empty}>
          <h3>{t.sidebar.emptyTitle}</h3>
          <p>{t.sidebar.emptyDesc}</p>
        </div>
      )}

      <footer className={styles.footer}>
        <div className={styles.footerStatus}>
          <p>{t.sidebar.localDataset}</p>
          <p title={`${t.sidebar.lastExport}: ${lastExportLabel}`}>{t.sidebar.lastExport}: {lastExportLabel}</p>
        </div>
        <div className={styles.footerActions}>
          <button type="button" className="icon-button" title={t.nav.about} aria-label={t.nav.about} onClick={onOpenAbout}>
            <CircleHelp size={15} />
          </button>
          <button type="button" className="icon-button" title={t.nav.settings} aria-label={t.nav.settings} onClick={onOpenSettings}>
            <Settings size={15} />
          </button>
        </div>
      </footer>
    </aside>
  )
}

function SidebarRow({
  ariaAttributes,
  index,
  items,
  navigate,
  noPreviewLabel,
  onCloseMobile,
  selectedId,
  style,
}: RowComponentProps<SidebarRowData>) {
  const conversation = items[index]
  if (!conversation) {
    return null
  }

  const isSelected = conversation.id === selectedId

  return (
    <div {...ariaAttributes} className={clsx(styles.item, isSelected && styles.itemSelected)} style={style}>
      <button
        className={styles.itemMain}
        onClick={() => {
          navigate(`/${conversation.id}`)
          onCloseMobile()
        }}
        aria-current={isSelected ? 'page' : undefined}
      >
        <div className={styles.itemLine}>
          <span className={styles.itemTitle} title={conversation.title}>
            {conversation.title}
          </span>
          <span className={styles.itemMeta}>{formatShortDate(conversation.last_message_time)}</span>
        </div>
        <div className={styles.itemSnippet} title={conversation.snippet || noPreviewLabel}>
          {conversation.snippet || noPreviewLabel}
        </div>
      </button>
    </div>
  )
}
