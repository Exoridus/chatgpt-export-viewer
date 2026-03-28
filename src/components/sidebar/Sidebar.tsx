import clsx from 'clsx';
import { CircleHelp, Ellipsis, FileArchive, FileDown, Info, Pin, Search, Settings, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NavigateFunction, useLocation, useNavigate } from 'react-router-dom';
import { List, type RowComponentProps } from 'react-window';

import { useModalA11y } from '../../hooks/useModalA11y';
import { formatShortDate } from '../../lib/date';
import { buildGalleryItems } from '../../lib/gallery';
import { exportConversationMarkdown } from '../../lib/markdownExport';
import { useAppData } from '../../state/AppDataContext';
import { useNotification } from '../../state/NotificationContext';
import { usePreferences } from '../../state/PreferencesContext';
import type { Conversation, ConversationSummary } from '../../types';
import styles from './Sidebar.module.scss';

interface SidebarProps {
  onOpenSearch: () => void;
  onOpenAbout: () => void;
  onOpenSettings: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

const ITEM_HEIGHT = 56;

interface SidebarRowData {
  items: ConversationSummary[];
  navigate: NavigateFunction;
  noPreviewLabel: string;
  pinnedLabel: string;
  onCloseMobile: () => void;
  selectedId: string | null;
  activeMenuId: string | null;
  setActiveMenuId: (id: string | null) => void;
  openInfo: (id: string) => void;
  exportMarkdown: (id: string) => Promise<void>;
  exportZip: (id: string) => Promise<void>;
  togglePin: (id: string, nextPinned: boolean) => void;
  deleteConversation: (id: string) => Promise<void>;
  labels: {
    menuActions: string;
    actionInfo: string;
    actionExportZip: string;
    actionExportMarkdown: string;
    actionDelete: string;
    actionPin: string;
    actionUnpin: string;
  };
}

interface InfoModalState {
  open: boolean;
  summary: ConversationSummary | null;
  conversation: Conversation | null;
  loading: boolean;
}

export function Sidebar({ onOpenSearch, onOpenAbout, onOpenSettings, isMobileOpen, onCloseMobile }: SidebarProps) {
  const {
    mergedIndex,
    localIndex,
    generatedAssets,
    storedAssets,
    getConversation,
    pinConversation,
    exportConversationBundle,
    deleteLocalConversation,
    assetOwnerIndex,
    referencedAssetKeys,
  } = useAppData();
  const { pushNotice } = useNotification();
  const { t } = usePreferences();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModalState>({
    open: false,
    summary: null,
    conversation: null,
    loading: false,
  });
  const isGalleryRoute = pathname === '/gallery' || pathname === '/artifacts';
  const selectedId = pathname.startsWith('/') && pathname.length > 1 && !isGalleryRoute ? pathname.slice(1) : null;
  const hasConversations = mergedIndex.length > 0;
  const galleryCount = useMemo(
    () =>
      buildGalleryItems({
        generatedAssets,
        storedAssets,
        ownerIndex: assetOwnerIndex,
        referencedAssetKeys,
      }).length,
    [assetOwnerIndex, generatedAssets, referencedAssetKeys, storedAssets]
  );
  const lastExportTimestamp = localIndex.reduce((latest, item) => Math.max(latest, item.saved_at ?? 0), 0);
  const lastExportLabel = lastExportTimestamp > 0 ? formatShortDate(lastExportTimestamp) : t.sidebar.unknown;

  const items: ConversationSummary[] = useMemo(() => {
    const pinned = mergedIndex.filter(item => item.pinned);
    const unpinned = mergedIndex.filter(item => !item.pinned);
    return [...pinned, ...unpinned];
  }, [mergedIndex]);

  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) {
      return;
    }
    const update = () => setListHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setActiveMenuId(null);
  }, [pathname]);

  useEffect(() => {
    if (!activeMenuId) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      if (event.target.closest('[data-sidebar-row-menu]') || event.target.closest('[data-sidebar-row-trigger]')) {
        return;
      }
      setActiveMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveMenuId(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeMenuId]);

  const handleOpenInfo = useCallback(
    (id: string) => {
      const summary = mergedIndex.find(item => item.id === id) ?? null;
      setInfoModal({ open: true, summary, conversation: null, loading: true });
      void getConversation(id)
        .then(conversation => {
          setInfoModal(prev => ({
            ...prev,
            conversation,
            loading: false,
          }));
        })
        .catch(() => {
          setInfoModal(prev => ({ ...prev, loading: false }));
        });
    },
    [getConversation, mergedIndex]
  );

  const handleExportMarkdown = useCallback(
    async (id: string) => {
      const conversation = await getConversation(id);
      if (!conversation) {
        pushNotice(t.viewer.conversationNotAvailableExport, 'warning');
        return;
      }
      exportConversationMarkdown(conversation);
    },
    [getConversation, pushNotice, t.viewer.conversationNotAvailableExport]
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteLocalConversation(id);
      if (selectedId === id) {
        void navigate('/');
      }
    },
    [deleteLocalConversation, navigate, selectedId]
  );

  const rowProps = useMemo<SidebarRowData>(
    () => ({
      items,
      navigate,
      noPreviewLabel: t.sidebar.noPreview,
      pinnedLabel: t.nav.pinned,
      onCloseMobile,
      selectedId,
      activeMenuId,
      setActiveMenuId,
      openInfo: handleOpenInfo,
      exportMarkdown: handleExportMarkdown,
      exportZip: exportConversationBundle,
      togglePin: (id, nextPinned) => {
        void pinConversation(id, nextPinned);
      },
      deleteConversation: handleDeleteConversation,
      labels: {
        menuActions: t.viewer.conversationActions,
        actionInfo: t.viewer.conversationInfo,
        actionExportZip: t.viewer.exportConversationZip,
        actionExportMarkdown: t.actions.exportMarkdown,
        actionDelete: t.actions.delete,
        actionPin: t.actions.pin,
        actionUnpin: t.actions.unpin,
      },
    }),
    [
      items,
      navigate,
      t.sidebar.noPreview,
      t.nav.pinned,
      onCloseMobile,
      selectedId,
      activeMenuId,
      handleOpenInfo,
      handleExportMarkdown,
      exportConversationBundle,
      pinConversation,
      handleDeleteConversation,
      t.viewer.conversationActions,
      t.viewer.conversationInfo,
      t.viewer.exportConversationZip,
      t.actions.exportMarkdown,
      t.actions.delete,
      t.actions.pin,
      t.actions.unpin,
    ]
  );

  const ownerAssetCount = infoModal.summary ? (assetOwnerIndex.byConversation[infoModal.summary.id]?.length ?? 0) : 0;
  const mappedAssetCount = infoModal.conversation ? Object.keys(infoModal.conversation.assetsMap ?? {}).length : 0;
  const totalAssetCount = Math.max(ownerAssetCount, mappedAssetCount);

  return (
    <>
      <aside className={clsx(styles.sidebar, isMobileOpen && styles.mobileOpen)} aria-label={t.sidebar.ariaSidebar}>
        <div className={styles.fixedTop}>
          <div className={styles.brand}>
            <p>ChatGPT Data Export Viewer</p>
          </div>
          {hasConversations ? (
            <button
              className={styles.searchTrigger}
              type="button"
              onClick={() => {
                onOpenSearch();
                onCloseMobile();
              }}
              title={`${t.nav.search} (${t.actions.searchKeyboard})`}
              aria-keyshortcuts="Control+K Meta+K"
            >
              <Search size={16} aria-hidden="true" />
              <span>{t.nav.search}</span>
              <kbd aria-hidden="true">{t.actions.searchKeyboard}</kbd>
            </button>
          ) : null}
          {hasConversations ? (
            <nav className={styles.nav} aria-label={t.sidebar.ariaSecondaryNav}>
              <button
                type="button"
                className={clsx(styles.navButton, isGalleryRoute && styles.navButtonActive)}
                onClick={() => {
                  void navigate('/gallery');
                  onCloseMobile();
                }}
                aria-current={isGalleryRoute ? 'page' : undefined}
              >
                <span>{t.nav.gallery}</span>
                {galleryCount > 0 && <span className={styles.navCount}>{galleryCount}</span>}
              </button>
            </nav>
          ) : null}
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
        ) : null}

        <footer className={styles.footer}>
          {hasConversations ? (
            <div className={styles.footerStatus}>
              <p>{t.sidebar.localDataset}</p>
              <p title={`${t.sidebar.lastExport}: ${lastExportLabel}`}>
                {t.sidebar.lastExport}: {lastExportLabel}
              </p>
            </div>
          ) : <span className={styles.footerZeroStateLabel}>{t.sidebar.emptyTitle}</span>}
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

      <ConversationInfoModal
        open={infoModal.open}
        onClose={() => {
          setInfoModal({ open: false, summary: null, conversation: null, loading: false });
        }}
        summary={infoModal.summary}
        conversation={infoModal.conversation}
        loading={infoModal.loading}
        assetCount={totalAssetCount}
      />
    </>
  );
}

function SidebarRow({
  ariaAttributes,
  index,
  items,
  navigate,
  noPreviewLabel,
  pinnedLabel,
  onCloseMobile,
  selectedId,
  activeMenuId,
  setActiveMenuId,
  openInfo,
  exportMarkdown,
  exportZip,
  togglePin,
  deleteConversation,
  labels,
  style,
}: RowComponentProps<SidebarRowData>) {
  const conversation = items[index];
  if (!conversation) {
    return null;
  }

  const isSelected = conversation.id === selectedId;
  const isPinned = (conversation.pinned_time !== null && conversation.pinned_time !== undefined) || conversation.pinned;
  const menuOpen = activeMenuId === conversation.id;
  const canDelete = conversation.source === 'local';

  return (
    <div {...ariaAttributes} className={clsx(styles.item, isSelected && styles.itemSelected)} style={style}>
      <button
        type="button"
        className={styles.itemMain}
        onClick={() => {
          setActiveMenuId(null);
          void navigate(`/${conversation.id}`);
          onCloseMobile();
        }}
        aria-current={isSelected ? 'page' : undefined}
      >
        <div className={styles.itemLine}>
          <span className={styles.itemTitle} title={conversation.title}>
            {conversation.title}
          </span>
          <span className={styles.itemMeta}>
            <time className={styles.itemDate}>{formatShortDate(conversation.last_message_time)}</time>
            <span className={clsx(styles.itemPin, isPinned && styles.itemPinVisible)} aria-hidden={!isPinned} title={isPinned ? pinnedLabel : undefined}>
              <Pin size={11} />
            </span>
          </span>
        </div>
        <div className={styles.itemSnippet} title={conversation.snippet || noPreviewLabel}>
          {conversation.snippet || noPreviewLabel}
        </div>
      </button>

      <button
        type="button"
        data-sidebar-row-trigger="true"
        className={clsx(styles.rowActionTrigger, menuOpen && styles.rowActionTriggerVisible)}
        aria-label={labels.menuActions}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={event => {
          event.stopPropagation();
          setActiveMenuId(menuOpen ? null : conversation.id);
        }}
      >
        <Ellipsis size={14} />
      </button>

      {menuOpen ? (
        <div className={styles.rowMenu} data-sidebar-row-menu="true" role="menu" aria-label={labels.menuActions}>
          <button
            type="button"
            className={styles.rowMenuItem}
            role="menuitem"
            onClick={() => {
              setActiveMenuId(null);
              openInfo(conversation.id);
            }}
          >
            <Info size={14} />
            <span>{labels.actionInfo}</span>
          </button>
          <button
            type="button"
            className={styles.rowMenuItem}
            role="menuitem"
            onClick={() => {
              setActiveMenuId(null);
              void exportZip(conversation.id);
            }}
          >
            <FileArchive size={14} />
            <span>{labels.actionExportZip}</span>
          </button>
          <button
            type="button"
            className={styles.rowMenuItem}
            role="menuitem"
            onClick={() => {
              setActiveMenuId(null);
              void exportMarkdown(conversation.id);
            }}
          >
            <FileDown size={14} />
            <span>{labels.actionExportMarkdown}</span>
          </button>
          <button
            type="button"
            className={styles.rowMenuItem}
            role="menuitem"
            onClick={() => {
              setActiveMenuId(null);
              togglePin(conversation.id, !isPinned);
            }}
          >
            <Pin size={14} />
            <span>{isPinned ? labels.actionUnpin : labels.actionPin}</span>
          </button>
          <button
            type="button"
            className={clsx(styles.rowMenuItem, styles.rowMenuDanger)}
            role="menuitem"
            onClick={() => {
              setActiveMenuId(null);
              void deleteConversation(conversation.id);
            }}
            disabled={!canDelete}
            title={!canDelete ? labels.actionDelete : undefined}
          >
            <Trash2 size={14} />
            <span>{labels.actionDelete}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ConversationInfoModal({
  open,
  onClose,
  summary,
  conversation,
  loading,
  assetCount,
}: {
  open: boolean;
  onClose: () => void;
  summary: ConversationSummary | null;
  conversation: Conversation | null;
  loading: boolean;
  assetCount: number;
}) {
  const { t } = usePreferences();
  const { containerRef, onOverlayMouseDown } = useModalA11y({ open, onClose });
  if (!open || !summary) {
    return null;
  }

  const archived = summary.is_archived ? t.actions.yes : t.actions.no;
  const isPinned = (summary.pinned_time !== null && summary.pinned_time !== undefined) || summary.pinned;
  const pinned = isPinned ? t.actions.yes : t.actions.no;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onOverlayMouseDown}>
      <div ref={containerRef} className={clsx('modal', styles.infoModal)}>
        <header className={styles.infoHeader}>
          <h2>{t.viewer.conversationInfo}</h2>
          <button type="button" className="icon-button modal-close-btn" onClick={onClose} aria-label={t.actions.close}>
            <X size={14} />
          </button>
        </header>
        <div className={styles.infoBody}>
          <p className={styles.infoTitle} title={summary.title}>
            {summary.title}
          </p>
          <dl className={styles.infoGrid}>
            <div>
              <dt>{t.viewer.conversationInfoId}</dt>
              <dd>{summary.id}</dd>
            </div>
            {summary.conversation_id ? (
              <div>
                <dt>{t.viewer.conversationInfoConversationId}</dt>
                <dd>{summary.conversation_id}</dd>
              </div>
            ) : null}
            {summary.raw_id ? (
              <div>
                <dt>{t.viewer.conversationInfoRawId}</dt>
                <dd>{summary.raw_id}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t.viewer.conversationInfoUpdated}</dt>
              <dd>{formatShortDate(summary.last_message_time)}</dd>
            </div>
            <div>
              <dt>{t.nav.pinned}</dt>
              <dd>{pinned}</dd>
            </div>
            <div>
              <dt>{t.viewer.conversationInfoArchived}</dt>
              <dd>{archived}</dd>
            </div>
            <div>
              <dt>{t.viewer.linkedArtifacts}</dt>
              <dd>{assetCount}</dd>
            </div>
            {summary.memory_scope ? (
              <div>
                <dt>{t.viewer.conversationInfoMemoryScope}</dt>
                <dd>{summary.memory_scope}</dd>
              </div>
            ) : null}
            {summary.mapping_node_count ? (
              <div>
                <dt>{t.viewer.conversationInfoNodes}</dt>
                <dd>{summary.mapping_node_count}</dd>
              </div>
            ) : null}
          </dl>
          {loading ? <p className={styles.infoHint}>{t.viewer.loadingConversation}</p> : null}
          {!loading && conversation?.update_time ? (
            <p className={styles.infoHint}>
              {t.viewer.conversationInfoServerUpdated}: {formatShortDate(conversation.update_time)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
