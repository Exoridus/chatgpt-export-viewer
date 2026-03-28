import { FileDown, Link2, Menu, Pin } from 'lucide-react'
import { useMatch } from 'react-router-dom'

import { exportConversationMarkdown } from '../../lib/markdownExport'
import { useAppData } from '../../state/AppDataContext'
import { useNotification } from '../../state/NotificationContext'
import { usePreferences } from '../../state/PreferencesContext'
import styles from './TopBar.module.scss'

interface TopBarProps {
  onToggleSidebar: () => void
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
  const { mergedIndex, getConversation, pinConversation } = useAppData()
  const { pushNotice } = useNotification()
  const { t } = usePreferences()
  const conversationMatch = useMatch('/:conversationId')
  const galleryMatch = useMatch('/gallery')
  const artifactsMatch = useMatch('/artifacts')

  const activeConversationId = conversationMatch?.params?.conversationId ?? null
  const activeConversation = activeConversationId ? mergedIndex.find((item) => item.id === activeConversationId) : null
  const activeTitle =
    galleryMatch || artifactsMatch
      ? t.nav.gallery
      : activeConversation?.title ?? (activeConversationId ? activeConversationId : t.nav.home)

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <button className={`icon-button ${styles.menuButton}`} onClick={onToggleSidebar} aria-label={t.actions.toggleSidebar}>
          <Menu size={16} />
        </button>
        <h1 className={styles.viewTitle} title={activeTitle}>
          {activeTitle}
        </h1>
      </div>
      <div className={styles.actions}>
        {activeConversation && (
          <>
            <button
              className="icon-button"
              type="button"
              title={t.actions.export}
              aria-label={t.actions.export}
              onClick={async () => {
                const conversation = await getConversation(activeConversation.id)
                if (!conversation) {
                  pushNotice(t.viewer.conversationNotAvailableExport, 'warning')
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
              title={t.actions.copyLink}
              aria-label={t.viewer.copyConversationLink}
              onClick={async () => {
                const link = typeof window !== 'undefined' ? window.location.href : ''
                if (!link) {return}
                try {
                  await navigator.clipboard.writeText(link)
                  pushNotice(t.viewer.conversationLinkCopied, 'success')
                } catch {
                  pushNotice(t.viewer.unableCopyLink, 'warning')
                }
              }}
            >
              <Link2 size={16} />
            </button>
            <button
              className={`icon-button${activeConversation.pinned ? ' active' : ''}`}
              type="button"
              title={activeConversation.pinned ? t.actions.unpin : t.actions.pin}
              aria-label={activeConversation.pinned ? t.actions.unpin : t.actions.pin}
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
