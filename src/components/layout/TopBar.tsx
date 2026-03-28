import { Ellipsis, FileDown, Link2, Menu, Pin, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useMatch } from 'react-router-dom';

import { exportConversationMarkdown } from '../../lib/markdownExport';
import { useAppData } from '../../state/AppDataContext';
import { useNotification } from '../../state/NotificationContext';
import { usePreferences } from '../../state/PreferencesContext';
import styles from './TopBar.module.scss';

interface TopBarProps {
  onToggleSidebar: () => void;
  onOpenUpload: () => void;
}

export function TopBar({ onToggleSidebar, onOpenUpload }: TopBarProps) {
  const { mergedIndex, getConversation, pinConversation } = useAppData();
  const { pushNotice } = useNotification();
  const { t } = usePreferences();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const overflowButtonRef = useRef<HTMLButtonElement | null>(null);
  const { pathname } = useLocation();
  const conversationMatch = useMatch('/:conversationId');
  const galleryMatch = useMatch('/gallery');
  const artifactsMatch = useMatch('/artifacts');

  const activeConversationId = conversationMatch?.params?.conversationId ?? null;
  const activeConversation = activeConversationId ? mergedIndex.find(item => item.id === activeConversationId) : null;
  const activeTitle =
    galleryMatch || artifactsMatch ? t.nav.gallery : (activeConversation?.title ?? (activeConversationId ? activeConversationId : t.nav.home));

  useEffect(() => {
    setOverflowOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!overflowOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (overflowRef.current?.contains(event.target)) {
        return;
      }
      if (overflowButtonRef.current?.contains(event.target)) {
        return;
      }
      setOverflowOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      setOverflowOpen(false);
      overflowButtonRef.current?.focus();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [overflowOpen]);

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <button type="button" className={`icon-button ${styles.menuButton}`} onClick={onToggleSidebar} aria-label={t.actions.toggleSidebar}>
          <Menu size={16} />
        </button>
        <h1 className={styles.viewTitle} title={activeTitle}>
          {activeTitle}
        </h1>
      </div>
      <div className={styles.actions}>
        <button className={styles.importButton} type="button" title={t.importer.title} aria-label={t.actions.importZip} onClick={onOpenUpload}>
          <Upload size={14} />
          <span>{t.actions.importZip}</span>
        </button>
        {activeConversation ? (
          <div className={styles.overflowWrap}>
            <button
              ref={overflowButtonRef}
              className={`icon-button ${styles.overflowTrigger}`}
              type="button"
              title={t.viewer.conversationActions}
              aria-label={t.viewer.conversationActions}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen(open => !open)}
            >
              <Ellipsis size={16} />
            </button>
            {overflowOpen ? (
              <div ref={overflowRef} className={styles.overflowMenu} role="menu" aria-label={t.viewer.conversationActions}>
                <button
                  className={styles.menuItem}
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setOverflowOpen(false);
                    const conversation = await getConversation(activeConversation.id);
                    if (!conversation) {
                      pushNotice(t.viewer.conversationNotAvailableExport, 'warning');
                      return;
                    }
                    exportConversationMarkdown(conversation);
                  }}
                >
                  <FileDown size={15} />
                  <span>{t.actions.exportMarkdown}</span>
                </button>
                <button
                  className={styles.menuItem}
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setOverflowOpen(false);
                    const link = typeof window !== 'undefined' ? window.location.href : '';
                    if (!link) {
                      return;
                    }
                    try {
                      await navigator.clipboard.writeText(link);
                      pushNotice(t.viewer.conversationLinkCopied, 'success');
                    } catch {
                      pushNotice(t.viewer.unableCopyLink, 'warning');
                    }
                  }}
                >
                  <Link2 size={15} />
                  <span>{t.viewer.copyConversationLink}</span>
                </button>
                <button
                  className={styles.menuItem}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOverflowOpen(false);
                    void pinConversation(activeConversation.id, !activeConversation.pinned);
                  }}
                >
                  <Pin size={15} />
                  <span>{activeConversation.pinned ? t.actions.unpin : t.actions.pin}</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
