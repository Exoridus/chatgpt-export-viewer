import clsx from 'clsx'
import { CircleHelp, Pin, Search, Settings } from 'lucide-react'
import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { type ListChildComponentProps, VariableSizeList as List } from 'react-window'

import { useWindowSize } from '../../hooks/useWindowSize'
import { formatShortDate } from '../../lib/date'
import { useAppData } from '../../state/AppDataContext'
import type { ConversationSummary } from '../../types'

interface SidebarProps {
  onOpenUpload: () => void
  onOpenSearch: () => void
  onOpenAbout: () => void
  onOpenSettings: () => void
  isMobileOpen: boolean
  onCloseMobile: () => void
}

interface HeaderItem {
  type: 'header'
  label: string
}

interface ConversationItemRow {
  type: 'conversation'
  data: ConversationSummary
}

type ListItem = HeaderItem | ConversationItemRow

export function Sidebar({
  onOpenUpload,
  onOpenSearch,
  onOpenAbout,
  onOpenSettings,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { mergedIndex, pinConversation, importing, localIndex } = useAppData()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { height, width } = useWindowSize()
  const isGalleryRoute = pathname === '/gallery'
  const selectedId = pathname.startsWith('/') && pathname.length > 1 && !isGalleryRoute ? pathname.slice(1) : null
  const listHeight = Math.max(180, height - 330)
  const listWidth = Math.min(296, Math.max(220, width - 56))
  const hasConversations = mergedIndex.length > 0
  const lastExportTimestamp = localIndex.reduce<number>((latest, item) => Math.max(latest, item.saved_at ?? 0), 0)
  const lastExportLabel = lastExportTimestamp > 0 ? formatShortDate(lastExportTimestamp) : 'unknown'

  const items: ListItem[] = useMemo(() => {
    const pinned = mergedIndex.filter((item) => item.pinned)
    const others = mergedIndex.filter((item) => !item.pinned)
    const list: ListItem[] = []
    if (pinned.length) {
      list.push({ type: 'header', label: `Pinned (${pinned.length})` })
      pinned.forEach((conversation) => list.push({ type: 'conversation', data: conversation }))
    }
    if (others.length) {
      list.push({ type: 'header', label: `All (${others.length})` })
      others.forEach((conversation) => list.push({ type: 'conversation', data: conversation }))
    }
    return list
  }, [mergedIndex])

  const getItemSize = (index: number) => (items[index]?.type === 'header' ? 34 : 74)

  const rowRenderer = ({ index, style, data }: ListChildComponentProps<ListItem[]>) => {
    const item = data[index]
    if (item.type === 'header') {
      return (
        <div className="sidebar-header" style={style}>
          {item.label}
        </div>
      )
    }
    const conversation = item.data
    const isSelected = conversation.id === selectedId
    return (
      <div className={clsx('sidebar-item', isSelected && 'selected')} style={style}>
        <button
          className="sidebar-item-main"
          onClick={() => {
            navigate(`/${conversation.id}`)
            onCloseMobile()
          }}
        >
          <div className="sidebar-item-line">
            <span className="sidebar-item-title" title={conversation.title}>
              {conversation.title}
            </span>
            <span className="sidebar-item-meta">{formatShortDate(conversation.last_message_time)}</span>
          </div>
          <div className="sidebar-item-snippet" title={conversation.snippet || 'No preview available'}>
            {conversation.snippet || 'No preview available'}
          </div>
        </button>
        <div className="sidebar-item-actions">
          <button
            type="button"
            className={clsx('icon-button', conversation.pinned && 'active')}
            title={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
            aria-label={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
            onClick={() => pinConversation(conversation.id, !conversation.pinned)}
          >
            <Pin size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <aside className={clsx('sidebar', isMobileOpen && 'is-mobile-open')}>
      <div className="sidebar-scroll">
        <div className="sidebar-brand">
          <p>ChatGPT Data Export Viewer</p>
        </div>
        <button
          className="sidebar-search-trigger"
          type="button"
          onClick={() => {
            onOpenSearch()
            onCloseMobile()
          }}
          title="Search conversations (Ctrl/Cmd + K)"
        >
          <Search size={16} />
          <span>Search conversations…</span>
          <kbd>Ctrl/Cmd + K</kbd>
        </button>
        <div className="sidebar-top-actions">
          <button
            className="primary"
            onClick={() => {
              onOpenUpload()
              onCloseMobile()
            }}
            disabled={importing}
            title="Import ChatGPT ZIP exports"
          >
            Import ZIP
          </button>
        </div>
        {hasConversations ? (
          <>
            <div className="sidebar-section-head">
              <span>Conversations</span>
              <span>{mergedIndex.length}</span>
            </div>
            <div className="sidebar-nav">
              <button
                className={clsx('sidebar-nav-button', isGalleryRoute && 'active')}
                onClick={() => {
                  navigate('/gallery')
                  onCloseMobile()
                }}
              >
                Gallery
              </button>
            </div>
            <div className="sidebar-list">
              <List height={listHeight} itemCount={items.length} itemSize={getItemSize} width={listWidth} itemData={items}>
                {rowRenderer as never}
              </List>
            </div>
          </>
        ) : (
          <div className="sidebar-empty">
            <h3>No conversations yet</h3>
            <p>Import a ChatGPT ZIP archive to start browsing offline.</p>
          </div>
        )}
      </div>
      <footer className="sidebar-footer">
        <div className="sidebar-footer-status">
          <p>Local dataset</p>
          <p title={`Last export: ${lastExportLabel}`}>Last export: {lastExportLabel}</p>
        </div>
        <div className="sidebar-footer-actions">
          <button type="button" className="icon-button" title="About" aria-label="About" onClick={onOpenAbout}>
            <CircleHelp size={15} />
          </button>
          <button type="button" className="icon-button" title="Settings" aria-label="Settings" onClick={onOpenSettings}>
            <Settings size={15} />
          </button>
        </div>
      </footer>
    </aside>
  )
}
