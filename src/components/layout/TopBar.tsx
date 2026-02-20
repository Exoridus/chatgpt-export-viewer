import { FileDown, Link2, Menu, Pin } from 'lucide-react'
import { useMatch } from 'react-router-dom'

import { exportConversationMarkdown } from '../../lib/markdownExport'
import { useAppData } from '../../state/AppDataContext'

interface TopBarProps {
  onToggleSidebar: () => void
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
  const { mergedIndex, getConversation, pinConversation, pushNotice } = useAppData()
  const conversationMatch = useMatch('/:conversationId')
  const galleryMatch = useMatch('/gallery')

  const activeConversationId = conversationMatch?.params?.conversationId ?? null
  const activeConversation = activeConversationId ? mergedIndex.find((item) => item.id === activeConversationId) : null
  const activeTitle = galleryMatch ? 'Gallery' : activeConversation?.title ?? (activeConversationId ? activeConversationId : 'Welcome')

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button className="icon-button top-bar-menu" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <Menu size={16} />
        </button>
        <h1 className="top-bar-view-title" title={activeTitle}>
          {activeTitle}
        </h1>
      </div>
      <div className="top-bar-actions">
        {activeConversation && (
          <>
            <button
              className="icon-button"
              type="button"
              title="Export Markdown"
              aria-label="Export conversation as Markdown"
              onClick={async () => {
                const conversation = await getConversation(activeConversation.id)
                if (!conversation) {
                  pushNotice('Conversation not available for export.', 'warning')
                  return
                }
                exportConversationMarkdown(conversation)
              }}
            >
              <FileDown size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              title="Copy link"
              aria-label="Copy conversation link"
              onClick={async () => {
                const link = typeof window !== 'undefined' ? window.location.href : ''
                if (!link) {return}
                try {
                  await navigator.clipboard.writeText(link)
                  pushNotice('Conversation link copied.', 'success')
                } catch {
                  pushNotice('Unable to copy link.', 'warning')
                }
              }}
            >
              <Link2 size={16} />
            </button>
            <button
              className={`icon-button${activeConversation.pinned ? ' active' : ''}`}
              type="button"
              title={activeConversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
              aria-label={activeConversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
              onClick={() => pinConversation(activeConversation.id, !activeConversation.pinned)}
            >
              <Pin size={16} />
            </button>
          </>
        )}
      </div>
    </header>
  )
}
