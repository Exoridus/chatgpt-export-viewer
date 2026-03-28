import clsx from 'clsx'
import { ArrowUp, Bot, Brain, ChevronDown, FileDown, Globe, PanelRightClose, PanelRightOpen, Paperclip, Sparkles, UserRound, Wrench } from 'lucide-react'
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { formatConversationDate } from '../../lib/date'
import { exportConversationMarkdown } from '../../lib/markdownExport'
import {
  isStructuredJsonBlock,
  parseSearchPayloadFromString,
  parseSearchPayloadFromUnknown,
  type StructuredSearchQuery,
  type StructuredSearchResult,
  tryParseJsonText,
} from '../../lib/systemPayload'
import { useAppData } from '../../state/AppDataContext'
import { usePreferences } from '../../state/PreferencesContext'
import type { Block, Conversation, GeneratedAsset, Message } from '../../types'
import { AssetBlock } from './AssetBlock'
import { CodeBlock } from './CodeBlock'
import styles from './ConversationView.module.scss'
import { MarkdownBlock } from './MarkdownBlock'

interface ConversationViewProps {
  conversation: Conversation
  hit: { messageId: string; blockIndex: number; lineNo: number; query: string } | null
  onHitConsumed: () => void
}

type CardKind = 'request' | 'response' | 'system'

type SystemSectionKind = 'thinking' | 'search'

interface SystemSection {
  key: string
  label: string
  kind: SystemSectionKind
  textEntries: string[]
  searchQueries?: SearchQueryEntry[]
  searchMeta?: {
    responseLength?: string
  }
  searchSources?: string[]
}

interface SystemSegment {
  kind: SystemSectionKind
  label: string
  textEntries: string[]
  searchQueries?: SearchQueryEntry[]
  searchMeta?: {
    responseLength?: string
  }
  searchSources?: string[]
}

interface SystemContextState {
  segments: SystemSegment[]
}

interface MessageCardModel {
  id: string
  kind: CardKind
  message: Message
  systemSections: SystemSection[]
  systemDurationLabel?: string
}

type SearchQueryEntry = StructuredSearchQuery

const CARD_META: Record<CardKind, { label: string; icon: ReactNode; tone: CardKind }> = {
  request: { label: 'You', icon: <UserRound size={16} />, tone: 'request' },
  response: { label: 'ChatGPT', icon: <Bot size={16} />, tone: 'response' },
  system: { label: 'System', icon: <Sparkles size={16} />, tone: 'system' },
}

const CARD_KIND_CLASS: Record<CardKind, string> = {
  request: styles.typeRequest,
  response: styles.typeResponse,
  system: styles.typeSystem,
}

function createSystemContext(): SystemContextState {
  return { segments: [] }
}

function appendContext(target: SystemContextState, addition: SystemContextState) {
  addition.segments.forEach((segment) => {
    const last = target.segments[target.segments.length - 1]
    if (last && last.kind === segment.kind && last.label === segment.label) {
      last.textEntries.push(...segment.textEntries)
      if (segment.searchQueries?.length) {
        last.searchQueries = [...(last.searchQueries ?? []), ...segment.searchQueries]
      }
      if (segment.searchSources?.length) {
        last.searchSources = [...(last.searchSources ?? []), ...segment.searchSources]
      }
      if (segment.searchMeta) {
        last.searchMeta = { ...last.searchMeta, ...segment.searchMeta }
      }
    } else {
      target.segments.push({
        kind: segment.kind,
        label: segment.label,
        textEntries: [...segment.textEntries],
        searchQueries: segment.searchQueries ? [...segment.searchQueries] : undefined,
        searchSources: segment.searchSources ? [...segment.searchSources] : undefined,
        searchMeta: segment.searchMeta ? { ...segment.searchMeta } : undefined,
      })
    }
  })
}

function hasContextEntries(context: SystemContextState): boolean {
  return context.segments.length > 0
}

export function ConversationView({ conversation, hit, onHitConsumed }: ConversationViewProps) {
  const { setScrollPosition, getScrollPosition, generatedAssets } = useAppData()
  const { t, viewerPreferences } = usePreferences()
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [showJumpTop, setShowJumpTop] = useState(false)
  const [showJumpBottom, setShowJumpBottom] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const scrollHostRef = useRef<HTMLDivElement | null>(null)
  const scrollTimeoutRef = useRef<number | null>(null)
  const lastIdRef = useRef<string | null>(null)
  const showJumpTopRef = useRef(false)
  const showJumpBottomRef = useRef(false)
  const cards = useMemo(() => buildMessageCards(conversation, t), [conversation, t])
  const linkedArtifacts = useMemo(() => buildConversationArtifacts(conversation, generatedAssets), [conversation, generatedAssets])

  useEffect(() => {
    setShowJumpTop(false)
    setShowJumpBottom(false)
    showJumpTopRef.current = false
    showJumpBottomRef.current = false
  }, [conversation.id])

  useEffect(() => {
    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current)
    }
    return () => {
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (lastIdRef.current === conversation.id) {return}
    lastIdRef.current = conversation.id
    const saved = getScrollPosition(conversation.id)
    window.requestAnimationFrame(() => {
      const host = scrollHostRef.current
      if (!host) {return}
      if (hit) {return}
      if (saved !== null) {
        host.scrollTop = saved
      } else if (cards.length > 0) {
        host.scrollTop = host.scrollHeight
      }
    })
  }, [cards.length, conversation.id, getScrollPosition, hit])

  useEffect(() => {
    if (!hit) {return}
    const targetElement = typeof document !== 'undefined' ? document.getElementById(`msg-${hit.messageId}`) : null
    if (targetElement) {
      targetElement.scrollIntoView({ block: 'center' })
    }
    setHighlightedId(hit.messageId)
    const timer = window.setTimeout(() => {
      setHighlightedId(null)
      onHitConsumed()
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [hit, onHitConsumed])

  const handleScroll = useCallback(() => {
    const host = scrollHostRef.current
    if (!host) {return}
    setScrollPosition(conversation.id, host.scrollTop)

    if (scrollTimeoutRef.current) {return}
    scrollTimeoutRef.current = window.setTimeout(() => {
      scrollTimeoutRef.current = null
      const updatedViewport = scrollHostRef.current
      if (!updatedViewport) {return}

      const shouldShowTop = updatedViewport.scrollTop > 500
      if (shouldShowTop !== showJumpTopRef.current) {
        showJumpTopRef.current = shouldShowTop
        setShowJumpTop(shouldShowTop)
      }

      const shouldShowBottom = updatedViewport.scrollTop < updatedViewport.scrollHeight - updatedViewport.clientHeight - 500
      if (shouldShowBottom !== showJumpBottomRef.current) {
        showJumpBottomRef.current = shouldShowBottom
        setShowJumpBottom(shouldShowBottom)
      }
    }, 150)
  }, [conversation.id, setScrollPosition])

  const jumpToTop = () => {
    const host = scrollHostRef.current
    if (!host) {return}
    host.scrollTop = 0
  }

  const jumpToBottom = () => {
    const host = scrollHostRef.current
    if (!host) {return}
    host.scrollTop = host.scrollHeight
  }

  useEffect(() => {
    if (!actionMenuOpen) {return}
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement)) {return}
      if (event.target.closest('[data-conversation-fab-stack="true"]')) {return}
      setActionMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [actionMenuOpen])

  return (
    <main className={styles.conversationView} aria-label="Conversation thread">
      <div className={clsx(styles.layout, artifactsOpen && linkedArtifacts.length > 0 && styles.layoutWithArtifacts)}>
        <section className={styles.main}>
          {linkedArtifacts.length > 0 && (
            <div className={styles.toolbar}>
              <button type="button" className={clsx('secondary', styles.artifactsToggle)} onClick={() => setArtifactsOpen((prev) => !prev)}>
                {artifactsOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                {t.nav.gallery} ({linkedArtifacts.length})
              </button>
            </div>
          )}
          <div className={styles.threadVirtualizer} ref={scrollHostRef} onScroll={handleScroll}>
            <div className={styles.thread} role="log" aria-live="polite">
              {cards.map((card) => (
                <div key={card.id}>
                  <MessageCard
                    kind={card.kind}
                    message={card.message}
                    systemSections={card.systemSections}
                    assetsMap={conversation.assetsMap ?? {}}
                    isHighlighted={highlightedId === card.message.id}
                    hit={hit?.messageId === card.message.id ? hit : null}
                    collapseSystemMessagesDefault={viewerPreferences.collapseSystemMessages}
                    systemDurationLabel={card.systemDurationLabel}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
        {artifactsOpen && linkedArtifacts.length > 0 && (
          <aside className={styles.artifactsSidebar} aria-label={t.viewer.linkedArtifacts}>
            <div className={styles.artifactsHeader}>
              <h3>
                <Paperclip size={15} /> {t.nav.gallery}
              </h3>
              <span>{linkedArtifacts.length}</span>
            </div>
            <div className={styles.artifactsList}>
              {linkedArtifacts.map((asset) => (
                <div key={asset.path} className={styles.artifactCard}>
                  <div className={styles.artifactPreview}>
                    <AssetBlock
                      assetPointer={asset.pointers?.[0] ?? asset.path}
                      assetKey={asset.path}
                      mediaType={detectConversationArtifactMediaType(asset)}
                      alt={asset.fileName}
                    />
                  </div>
                  <div className={styles.artifactMeta}>
                    <strong title={asset.fileName}>{asset.fileName}</strong>
                    <span title={asset.path}>{asset.path}</span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
      <div className={styles.fabStack} data-conversation-fab-stack="true">
        {showJumpTop && (
          <button
            type="button"
            className={clsx(styles.fab, 'secondary')}
            onClick={jumpToTop}
            title={t.actions.jumpTop}
            aria-label={t.actions.jumpTop}
          >
            <ArrowUp size={16} />
          </button>
        )}
        <button
          type="button"
          className={styles.fab}
          onClick={() => setActionMenuOpen((prev) => !prev)}
          title={t.viewer.conversationActions}
          aria-label={t.viewer.conversationActions}
          aria-expanded={actionMenuOpen}
        >
          <ChevronDown size={16} className={clsx(actionMenuOpen && styles.menuChevronOpen)} />
        </button>
        {actionMenuOpen && (
          <div className={styles.fabMenu}>
            {showJumpBottom && (
              <button type="button" className="secondary" onClick={jumpToBottom}>
                <ChevronDown size={14} /> {t.viewer.jumpBottom}
              </button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => {
                exportConversationMarkdown(conversation)
                setActionMenuOpen(false)
              }}
            >
              <FileDown size={14} /> {t.actions.exportMarkdown}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

function buildMessageCards(conversation: Conversation, t: ReturnType<typeof usePreferences>['t']): MessageCardModel[] {
  const cards: MessageCardModel[] = []
  let pendingContext = createSystemContext()
  let contextAnchor: Message | null = null
  let contextSequence = 0
  let pendingSystemDurationLabel: string | null = null

  const flushPendingContext = () => {
    if (!hasContextEntries(pendingContext)) {return}
    const baseId = contextAnchor?.id ?? `context-${contextSequence}`
    const cardId = `${baseId}-thinking-${contextSequence}`
    const sections = convertContextToSections(pendingContext, cardId)
    const placeholder = buildContextPlaceholderMessage(contextAnchor, cardId)
    cards.push({
      id: cardId,
      kind: 'system',
      message: placeholder,
      systemSections: sections,
      systemDurationLabel: pendingSystemDurationLabel ?? undefined,
    })
    pendingContext = createSystemContext()
    contextAnchor = null
    pendingSystemDurationLabel = null
    contextSequence += 1
  }

  const collectContext = (message: Message) => {
    const addition = extractSystemContextFromMessage(message, t)
    if (!hasContextEntries(addition)) {return}
    appendContext(pendingContext, addition)
    if (!pendingSystemDurationLabel) {
      pendingSystemDurationLabel = extractThinkingDurationLabel(message, t)
    }
    if (!contextAnchor) {
      contextAnchor = message
    }
  }

  conversation.messages.forEach((message) => {
    if (message.role === 'user') {
      flushPendingContext()
      cards.push({ id: message.id, kind: 'request', message, systemSections: [] })
      return
    }
    if (message.role === 'assistant') {
      if (!isDisplayableAssistantMessage(message)) {
        collectContext(message)
        return
      }
      collectContext(message)
      flushPendingContext()
      cards.push({ id: message.id, kind: 'response', message, systemSections: [] })
      return
    }
    if (message.role === 'system' || message.role === 'tool') {
      collectContext(message)
    }
  })

  flushPendingContext()
  return cards
}

function convertContextToSections(context: SystemContextState, messageId: string): SystemSection[] {
  return context.segments.map((segment, index) => ({
    key: `${messageId}-segment-${index}`,
    label: segment.label,
    kind: segment.kind,
    textEntries: [...segment.textEntries],
    searchQueries: segment.searchQueries ? [...segment.searchQueries] : undefined,
    searchMeta: segment.searchMeta,
    searchSources: segment.searchSources ? Array.from(new Set(segment.searchSources)) : undefined,
  }))
}

function buildContextPlaceholderMessage(anchor: Message | null, id: string): Message {
  return {
    id,
    role: 'assistant',
    time: anchor?.time,
    recipient: anchor?.recipient ?? 'all',
    blocks: [],
    details: anchor?.details,
  }
}

function extractSystemContextFromMessage(message: Message, t: ReturnType<typeof usePreferences>['t']): SystemContextState {
  const context = createSystemContext()
  const addSegment = (kind: SystemSectionKind, label: string): SystemSegment => {
    const last = context.segments[context.segments.length - 1]
    if (last && last.kind === kind && last.label === label) {
      return last
    }
    const segment: SystemSegment = {
      kind,
      label,
      textEntries: [],
    }
    context.segments.push(segment)
    return segment
  }
  const appendSearchPayload = (segment: SystemSegment, payload: StructuredSearchResult) => {
    if (payload.queries.length) {
      segment.searchQueries = [...(segment.searchQueries ?? []), ...payload.queries]
    }
    if (payload.meta?.responseLength) {
      segment.searchMeta = { responseLength: payload.meta.responseLength }
    }
  }
  const ensureSearchSegment = () => addSegment('search', t.viewer.search)

  const thinking = message.details?.thinking?.trim()
  if (thinking) {
    addSegment('thinking', t.viewer.thinking).textEntries.push(thinking)
  }

  const searchDetails = message.details?.search
  const searchContent = searchDetails?.content?.trim()
  const cleanedSearchContent = searchContent ? stripSearchDuplicateSections(searchContent) : null
  if (cleanedSearchContent) {
    ensureSearchSegment().textEntries.push(cleanedSearchContent)
  }
  if (searchDetails?.sources?.length) {
    const segment = ensureSearchSegment()
    segment.searchSources = [...(segment.searchSources ?? []), ...searchDetails.sources]
  }
  if (searchContent) {
    const parsed = parseSearchPayloadFromString(searchContent)
    if (parsed) {
      appendSearchPayload(ensureSearchSegment(), parsed)
    }
  }
  if (message.details?.data) {
    const structured = parseSearchPayloadFromUnknown(message.details.data)
    if (structured) {
      appendSearchPayload(ensureSearchSegment(), structured)
    }
  }

  message.blocks.forEach((block) => {
    if (block.type !== 'markdown') {return}
    const text = block.text ?? ''
    if (!text.trim()) {return}
    const parsed = tryParseJsonText(text)
    if (parsed) {
      const searchPayload = parseSearchPayloadFromUnknown(parsed)
      if (searchPayload) {
        appendSearchPayload(ensureSearchSegment(), searchPayload)
      }
      return
    }
    const inlineSearch = parseSearchPayloadFromString(text)
    if (inlineSearch) {
      appendSearchPayload(ensureSearchSegment(), inlineSearch)
    }
  })

  return context
}

function isDisplayableAssistantMessage(message: Message): boolean {
  if (message.recipient && message.recipient !== 'all') {return false}
  const hasRenderableBlocks = message.blocks.some((block) => !isStructuredJsonBlock(block))
  const hasRenderableVariants = message.variants?.some((variant) =>
    variant.blocks.some((block) => !isStructuredJsonBlock(block)),
  )
  return hasRenderableBlocks || Boolean(hasRenderableVariants)
}

interface MessageCardProps {
  message: Message
  kind: CardKind
  systemSections: SystemSection[]
  assetsMap: Record<string, string>
  isHighlighted: boolean
  hit: { blockIndex: number; lineNo: number; query: string } | null
  collapseSystemMessagesDefault: boolean
  systemDurationLabel?: string
}

const MessageCard = memo(function MessageCard({
  message,
  kind,
  systemSections,
  assetsMap,
  isHighlighted,
  hit,
  collapseSystemMessagesDefault,
  systemDurationLabel,
}: MessageCardProps) {
  const { t } = usePreferences()
  const [activeTab, setActiveTab] = useState('primary')
  const [systemCollapsed, setSystemCollapsed] = useState(kind === 'system' ? collapseSystemMessagesDefault : false)

  const hasVariants = !!message.variants?.length
  const variantOptions = useMemo(() => {
    const options = [{ id: 'primary', label: t.viewer.latest, blocks: message.blocks }]
    message.variants?.forEach((variant, index) => {
      options.push({ id: `variant-${index}`, label: `${t.viewer.alternative} ${index + 1}`, blocks: variant.blocks })
    })
    return options
  }, [message.blocks, message.variants, t.viewer.alternative, t.viewer.latest])

  useEffect(() => {
    setActiveTab('primary')
  }, [message.id])

  useEffect(() => {
    if (hit) {
      setActiveTab('primary')
    }
  }, [hit])

  useEffect(() => {
    setSystemCollapsed(kind === 'system' ? collapseSystemMessagesDefault : false)
  }, [collapseSystemMessagesDefault, kind, message.id])

  const activeBlocksSource = variantOptions.find((option) => option.id === activeTab)?.blocks ?? message.blocks
  const activeBlocks = activeBlocksSource.filter((block) => !isStructuredJsonBlock(block))
  const meta = CARD_META[kind]
  const isSystem = kind === 'system'
  const isResponse = kind === 'response'
  const showBody = !isSystem || !systemCollapsed
  const systemSummary = isSystem ? summarizeSystemSections(systemSections, t, systemDurationLabel) : null

  return (
    <article
      id={`msg-${message.id}`}
      className={clsx(styles.chatMessage, CARD_KIND_CLASS[kind], isHighlighted && styles.highlighted)}
      aria-label={`${meta.label} message`}
    >
      <div className={styles.panel}>
        <header
          className={clsx(
            styles.meta,
            isResponse && styles.metaResponse,
            isSystem && styles.metaCollapsible,
            isSystem && styles.separatorToggle,
          )}
          onClick={isSystem ? () => setSystemCollapsed((prev) => !prev) : undefined}
          onKeyDown={
            isSystem
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSystemCollapsed((prev) => !prev)
                  }
                }
              : undefined
          }
          role={isSystem ? 'button' : undefined}
          tabIndex={isSystem ? 0 : undefined}
          aria-label={isSystem ? (systemCollapsed ? t.viewer.expandSystem : t.viewer.collapseSystem) : undefined}
          aria-expanded={isSystem ? !systemCollapsed : undefined}
        >
          <span className={clsx(styles.role, isSystem && styles.separatorLabel)}>
            {isSystem ? (
              <>
                <span className={styles.separatorLine} aria-hidden="true" />
                <span className={styles.separatorIcon} aria-hidden="true">
                  {systemSummary?.icon}
                </span>
                <span>{systemSummary?.separatorLabel ?? t.viewer.responsePreparation}</span>
                {!!systemSummary?.count && <span className={styles.roleCount}>{systemSummary.count}</span>}
                <span className={styles.separatorLine} aria-hidden="true" />
              </>
            ) : (
              <span className={clsx(isResponse && 'sr-only')}>{meta.label}</span>
            )}
          </span>
          <div className={styles.metaRight}>
            {!isSystem && <time className={styles.time}>{formatMessageTime(message.time)}</time>}
            {isSystem && (
              <span className={clsx(styles.chevron, systemCollapsed && styles.chevronCollapsed)} aria-hidden="true">
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            )}
          </div>
        </header>
        {showBody && (
          <div>
            {hasVariants && (
              <div className={styles.variants}>
                {variantOptions.map((option) => (
                  <button
                    key={option.id}
                    className={clsx(styles.variantButton, activeTab === option.id && styles.variantButtonActive)}
                    onClick={() => setActiveTab(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <CollapsibleContent
              className={styles.contentCollapsible}
              enabled={false}
              maxHeight={kind === 'request' ? 340 : kind === 'system' ? 360 : 440}
              measureKey={`${message.id}:${activeTab}:${activeBlocks.length}:${kind}`}
            >
              <div className={styles.blocks}>
                {activeBlocks.map((block, index) => (
                  <BlockRenderer
                    key={`${message.id}-${index}`}
                    block={block}
                    assetsMap={assetsMap}
                    hit={hit && hit.blockIndex === index ? hit : null}
                  />
                ))}
                {!activeBlocks.length && systemSections.length === 0 && (
                  <p className={styles.empty}>{t.viewer.noMessageContent}</p>
                )}
              </div>
            </CollapsibleContent>
            {systemSections.length > 0 && (
              <CollapsibleContent
                className={styles.contentCollapsible}
                enabled={false}
                maxHeight={360}
                measureKey={`${message.id}:system:${systemSections.length}:${kind}`}
              >
                <SystemSections sections={systemSections} time={message.time} />
              </CollapsibleContent>
            )}
          </div>
        )}
        {isSystem && systemCollapsed && systemSummary?.preview && <p className={styles.systemCollapsedPreview}>{systemSummary.preview}</p>}
      </div>
    </article>
  )
})

function SystemSections({ sections, time }: { sections: SystemSection[]; time?: number | null }) {
  if (!sections.length) {return null}
  const timeLabel = formatMessageTime(time)
  return (
    <div className={styles.systemBody}>
      {sections.map((section) => (
        <section key={section.key} className={styles.systemItem}>
          <h4>
            <span>{section.label}</span>
            {timeLabel && <time>{timeLabel}</time>}
          </h4>
          {section.kind === 'search' ? (
            <>
              {(section.searchQueries?.length ||
                section.searchMeta?.responseLength ||
                (section.searchSources && section.searchSources.length)) && (
                <SearchQueriesList
                  queries={section.searchQueries ?? []}
                  sources={section.searchSources ?? []}
                  responseLength={section.searchMeta?.responseLength}
                />
              )}
              <SystemTextEntries entries={section.textEntries} showDividers={false} />
            </>
          ) : (
            <SystemTextEntries entries={section.textEntries} showDividers={section.kind === 'thinking'} />
          )}
        </section>
      ))}
    </div>
  )
}

function SystemTextEntries({ entries, showDividers }: { entries: string[]; showDividers?: boolean }) {
  if (!entries.length) {return null}
  return (
    <div className={styles.systemTextEntries}>
      {entries.map((entry, index) => (
        <div key={`system-entry-${index}`}>
          <MarkdownBlock text={entry} className={styles.systemMarkdown} />
          {showDividers && index < entries.length - 1 && <hr className={styles.systemEntryDivider} />}
        </div>
      ))}
    </div>
  )
}

function SearchQueriesList({
  queries,
  sources,
  responseLength,
}: {
  queries: SearchQueryEntry[]
  sources?: string[]
  responseLength?: string
}) {
  const { t } = usePreferences()
  const [sourcesOpen, setSourcesOpen] = useState(false)
  if (!queries.length && !(sources && sources.length) && !responseLength) {return null}
  const normalizedSources = normalizeSearchSources(sources ?? [])
  return (
    <div className={styles.systemSearch}>
      {queries.length > 0 && (
        <CollapsibleContent enabled={false} maxHeight={210} measureKey={queries.length}>
          <ul className={styles.systemSearchList}>
            {queries.map((entry, index) => {
              const metaBits: string[] = []
              if (typeof entry.recency === 'number') {
                metaBits.push(`${t.viewer.recency} ${entry.recency}d`)
              }
              if (entry.domains?.length) {
                metaBits.push(`${t.viewer.domains} ${entry.domains.map((domain) => normalizeSourceDomain(domain)).join(', ')}`)
              }
              return (
                <li key={`${entry.query}-${index}`}>
                  <span>{entry.query}</span>
                  {metaBits.length > 0 && <span className={styles.systemSearchMeta}>{metaBits.join(' • ')}</span>}
                </li>
              )
            })}
          </ul>
        </CollapsibleContent>
      )}
      {normalizedSources.length > 0 && (
        <div className={styles.systemSearchSourcesGroup}>
          <button type="button" className={styles.systemSourcesToggle} onClick={() => setSourcesOpen((prev) => !prev)}>
            {t.viewer.sources} ({normalizedSources.length}){' '}
            <ChevronDown size={13} className={clsx(sourcesOpen && styles.sourcesChevronOpen)} />
          </button>
          {sourcesOpen && (
            <div className={styles.systemSearchSources}>
              {normalizedSources.map((source) => (
                <span key={source} className={styles.systemSearchSourceChip}>
                  {source}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {responseLength && <p className={styles.systemSearchMeta}>{t.viewer.requestedResponseLength}: {responseLength}</p>}
    </div>
  )
}

function CollapsibleContent({
  children,
  maxHeight,
  enabled = true,
  className,
  measureKey,
}: {
  children: ReactNode
  maxHeight: number
  enabled?: boolean
  className?: string
  measureKey?: string | number
}) {
  const { t } = usePreferences()
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const checkTaskIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      setOverflowing(false)
      setExpanded(false)
      return
    }
    const element = contentRef.current
    if (!element) {return}

    const check = () => {
      if (checkTaskIdRef.current !== null) {
        if (typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(checkTaskIdRef.current)
        } else {
          window.clearTimeout(checkTaskIdRef.current)
        }
      }

      const performCheck = () => {
        if (!contentRef.current) {return}
        setOverflowing(contentRef.current.scrollHeight > maxHeight + 8)
      }

      if (typeof window.requestIdleCallback === 'function') {
        checkTaskIdRef.current = window.requestIdleCallback(performCheck, { timeout: 500 })
      } else {
        checkTaskIdRef.current = window.setTimeout(performCheck, 100)
      }
    }

    check()
    
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        check()
      })
      resizeObserver.observe(element)
      return () => {
        resizeObserver.disconnect()
        if (checkTaskIdRef.current !== null) {
          if (typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(checkTaskIdRef.current)
          } else {
            window.clearTimeout(checkTaskIdRef.current)
          }
        }
      }
    }
    
    window.addEventListener('resize', check)
    return () => {
      window.removeEventListener('resize', check)
      if (checkTaskIdRef.current !== null) {
        if (typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(checkTaskIdRef.current)
        } else {
          window.clearTimeout(checkTaskIdRef.current)
        }
      }
    }
  }, [enabled, maxHeight, measureKey])

  if (!enabled) {return <>{children}</>}

  return (
    <div className={clsx(styles.collapsibleContent, className, overflowing && !expanded && styles.collapsibleClamped)}>
      <div className={styles.collapsibleInner} ref={contentRef} style={!expanded && overflowing ? { maxHeight } : undefined}>
        {children}
      </div>
      {overflowing && !expanded && <div className={styles.collapsibleFade} />}
      {overflowing && (
        <button type="button" className={clsx('secondary', styles.collapsibleToggle)} onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? t.viewer.showLess : t.viewer.showMore}
        </button>
      )}
    </div>
  )
}

function summarizeSystemSections(
  sections: SystemSection[],
  t: ReturnType<typeof usePreferences>['t'],
  durationLabel?: string,
): { label: 'SEARCH' | 'THINKING' | 'RESULT' | 'TOOL'; count: number; preview: string; icon: ReactNode; separatorLabel: string } {
  const first = sections[0]
  const hasSearchData = sections.some(
    (section) =>
      section.kind === 'search' && ((section.searchQueries?.length ?? 0) > 0 || (section.searchSources?.length ?? 0) > 0),
  )
  const hasThinking = sections.some((section) => section.kind === 'thinking')
  const count = sections.reduce((total, section) => total + section.textEntries.length + (section.searchQueries?.length ?? 0), 0)
  let label: 'SEARCH' | 'THINKING' | 'RESULT' | 'TOOL' = 'TOOL'
  if (hasSearchData && hasThinking) {
    label = 'TOOL'
  } else if (hasSearchData) {
    label = 'SEARCH'
  } else if (first?.kind === 'thinking') {
    label = 'THINKING'
  } else if (first?.kind === 'search') {
    label = 'RESULT'
  }
  const previewQuery = sections.find((section) => section.searchQueries?.length)?.searchQueries?.[0]?.query
  const previewText = sections.flatMap((section) => section.textEntries).find((entry) => entry.trim().length > 0)
  const preview = (previewQuery ?? previewText ?? '').replace(/\s+/g, ' ').trim()
  const icon =
    label === 'SEARCH'
      ? <Globe size={14} />
      : label === 'THINKING'
        ? <Brain size={14} />
        : label === 'RESULT'
          ? <Sparkles size={14} />
          : <Wrench size={14} />
  return {
    label: durationLabel ? 'TOOL' : label,
    count,
    preview,
    icon,
    separatorLabel: durationLabel ?? t.viewer.responsePreparation,
  }
}

function extractThinkingDurationLabel(message: Message, t: ReturnType<typeof usePreferences>['t']): string | null {
  const data = message.details?.data
  if (!data || typeof data !== 'object') {
    return null
  }
  const value = findValueInObject(data, ['reasoning_title', 'reasoning_status'])
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  const secondsValue = findValueInObject(data, ['finished_duration_sec', 'duration_sec', 'thinking_duration_sec', 'duration_seconds'])
  if (typeof secondsValue === 'number' && Number.isFinite(secondsValue) && secondsValue > 0) {
    return formatThinkingDuration(secondsValue, t)
  }
  return null
}

function findValueInObject(source: unknown, keys: string[], maxDepth = 4): unknown {
  if (!source || typeof source !== 'object') {return null}
  const queue: Array<{ value: unknown; depth: number }> = [{ value: source, depth: 0 }]
  while (queue.length) {
    const next = queue.shift()
    if (!next || next.depth > maxDepth || !next.value || typeof next.value !== 'object') {continue}
    const record = next.value as Record<string, unknown>
    for (const key of keys) {
      if (key in record) {
        return record[key]
      }
    }
    Object.values(record).forEach((value) => {
      if (value && typeof value === 'object') {
        queue.push({ value, depth: next.depth + 1 })
      }
    })
  }
  return null
}

function formatThinkingDuration(seconds: number, t: ReturnType<typeof usePreferences>['t']): string {
  const total = Math.max(1, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remaining = total % 60
  if (minutes > 0) {
    return `${t.viewer.thinkingFor} ${minutes}m ${remaining}s`
  }
  return `${t.viewer.thinkingFor} ${remaining}s`
}

function normalizeSearchSources(sources: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  sources.forEach((source) => {
    const domain = normalizeSourceDomain(source)
    if (!domain || seen.has(domain)) {return}
    seen.add(domain)
    normalized.push(domain)
  })
  return normalized
}

function normalizeSourceDomain(source: string): string {
  const trimmed = source.trim().toLowerCase()
  if (!trimmed) {return ''}
  const withoutScheme = trimmed.replace(/^https?:\/\//, '')
  const withoutPath = withoutScheme.split('/')[0] ?? withoutScheme
  return withoutPath.replace(/^www\./, '')
}

function stripSearchDuplicateSections(text: string): string | null {
  const groups = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
  if (!groups.length) {return null}
  const filtered = groups.filter((group) => {
    const heading = group.split('\n')[0]?.trim().toLowerCase()
    return (
      heading !== 'queries:' &&
      heading !== 'sources:' &&
      heading !== 'searched the web:' &&
      heading !== 'sources consulted:' &&
      heading !== 'requested response length:'
    )
  })
  const result = filtered.join('\n\n').trim()
  return result.length ? result : null
}

const BlockRenderer = memo(function BlockRenderer({
  block,
  assetsMap,
  hit,
}: {
  block: Block
  assetsMap: Record<string, string>
  hit: { lineNo: number; query: string } | null
}) {
  const { t } = usePreferences()
  switch (block.type) {
    case 'markdown':
      return <MarkdownBlock text={block.text} highlight={!!hit} />
    case 'code':
      return <CodeBlock text={block.text} lang={block.lang} highlightLine={hit?.lineNo} />
    case 'asset':
      return (
        <AssetBlock
          assetPointer={block.asset_pointer}
          assetKey={assetsMap[block.asset_pointer]}
          mediaType={block.mediaType}
          alt={block.alt}
        />
      )
    case 'transcript':
      return (
        <pre className={styles.transcriptBlock}>
          <code>{block.text}</code>
        </pre>
      )
    case 'separator':
      return <hr className={styles.messageSeparator} />
    default:
      return <p className={styles.empty}>{t.viewer.unsupportedBlock}</p>
  }
})

function formatMessageTime(value?: number | null): string {
  if (!value) {return ''}
  return formatConversationDate(value)
}

function buildConversationArtifacts(conversation: Conversation, generatedAssets: GeneratedAsset[]): GeneratedAsset[] {
  const assetMap = conversation.assetsMap ?? {}
  const pointerSet = new Set(Object.keys(assetMap))
  const linkedPaths = new Set(Object.values(assetMap))
  const byPath = new Map<string, GeneratedAsset>()

  linkedPaths.forEach((path) => {
    byPath.set(path, {
      path,
      fileName: path.split('/').pop() ?? path,
    })
  })

  generatedAssets.forEach((asset) => {
    const isDirectAsset = linkedPaths.has(asset.path)
    const isLinkedGenerated = asset.pointers?.some((pointer) => pointerSet.has(pointer)) ?? false
    if (!isDirectAsset && !isLinkedGenerated) {
      return
    }
    byPath.set(asset.path, asset)
  })

  return Array.from(byPath.values())
}

function detectConversationArtifactMediaType(asset: GeneratedAsset): 'image' | 'video' | 'audio' | 'file' {
  const normalizedMime = (asset.mime ?? '').toLowerCase()
  if (normalizedMime.startsWith('image/')) {return 'image'}
  if (normalizedMime.startsWith('video/')) {return 'video'}
  if (normalizedMime.startsWith('audio/')) {return 'audio'}
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(asset.path)) {return 'image'}
  if (/\.(mp4|webm|mov)$/i.test(asset.path)) {return 'video'}
  if (/\.(mp3|wav|m4a)$/i.test(asset.path)) {return 'audio'}
  return 'file'
}
