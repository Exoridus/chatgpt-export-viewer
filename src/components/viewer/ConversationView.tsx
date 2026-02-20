import clsx from 'clsx'
import { ArrowUp, Bot, Brain, ChevronDown, FileDown, Globe, Sparkles, UserRound, Wrench } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

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
import type { Block, Conversation, Message } from '../../types'
import { AssetBlock } from './AssetBlock'
import { CodeBlock } from './CodeBlock'
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
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [showJumpTop, setShowJumpTop] = useState(false)
  const [systemCollapseCommand, setSystemCollapseCommand] = useState<{ collapsed: boolean; token: number } | null>(null)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!hit) {return}
    const target = document.getElementById(`msg-${hit.messageId}`)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    setHighlightedId(hit.messageId)
    const timer = setTimeout(() => {
      setHighlightedId(null)
      onHitConsumed()
    }, 4000)
    return () => clearTimeout(timer)
  }, [hit, onHitConsumed])

  useEffect(() => {
    if (hit) {return}
    const viewport = viewportRef.current
    if (!viewport) {return}
    viewport.scrollTop = viewport.scrollHeight
  }, [conversation.id, conversation.messages.length, hit])

  const handleScroll = () => {
    const viewport = viewportRef.current
    if (!viewport) {return}
    setShowJumpTop(viewport.scrollTop > 500)
  }

  const jumpToTop = () => {
    const viewport = viewportRef.current
    if (!viewport) {return}
    viewport.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    if (!actionMenuOpen) {return}
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement)) {return}
      if (event.target.closest('.conversation-fab-stack')) {return}
      setActionMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [actionMenuOpen])

  const cards = useMemo(() => buildMessageCards(conversation), [conversation])
  const systemCardsCount = cards.filter((card) => card.kind === 'system').length

  return (
    <div className="conversation-view" ref={viewportRef} onScroll={handleScroll}>
      {systemCardsCount > 0 && (
        <div className="conversation-system-controls">
          <button type="button" className="secondary" onClick={() => setSystemCollapseCommand({ collapsed: true, token: Date.now() })}>
            Collapse all system blocks
          </button>
          <button type="button" className="secondary" onClick={() => setSystemCollapseCommand({ collapsed: false, token: Date.now() + 1 })}>
            Expand all system blocks
          </button>
        </div>
      )}
      <div className="chat-thread">
        {cards.map((card) => (
          <MessageCard
            key={card.id}
            kind={card.kind}
            message={card.message}
            systemSections={card.systemSections}
            assetsMap={conversation.assetsMap ?? {}}
            isHighlighted={highlightedId === card.message.id}
            hit={hit?.messageId === card.message.id ? hit : null}
            systemCollapseCommand={systemCollapseCommand}
            systemDurationLabel={card.systemDurationLabel}
          />
        ))}
      </div>
      <div className="conversation-fab-stack">
        <button
          type="button"
          className="conversation-fab"
          onClick={() => setActionMenuOpen((prev) => !prev)}
          title="Conversation actions"
          aria-label="Conversation actions"
          aria-expanded={actionMenuOpen}
        >
          <ChevronDown size={16} />
        </button>
        {actionMenuOpen && (
          <div className="conversation-fab-menu">
            {showJumpTop && (
              <button type="button" className="secondary" onClick={jumpToTop}>
                <ArrowUp size={14} /> Jump to top
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
              <FileDown size={14} /> Export as Markdown
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function buildMessageCards(conversation: Conversation): MessageCardModel[] {
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
    const addition = extractSystemContextFromMessage(message)
    if (!hasContextEntries(addition)) {return}
    appendContext(pendingContext, addition)
    if (!pendingSystemDurationLabel) {
      pendingSystemDurationLabel = extractThinkingDurationLabel(message)
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

function extractSystemContextFromMessage(message: Message): SystemContextState {
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
  const ensureSearchSegment = () => addSegment('search', 'Search')

  const thinking = message.details?.thinking?.trim()
  if (thinking) {
    addSegment('thinking', 'Thinking').textEntries.push(thinking)
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
  systemCollapseCommand: { collapsed: boolean; token: number } | null
  systemDurationLabel?: string
}

function MessageCard({
  message,
  kind,
  systemSections,
  assetsMap,
  isHighlighted,
  hit,
  systemCollapseCommand,
  systemDurationLabel,
}: MessageCardProps) {
  const [activeTab, setActiveTab] = useState('primary')
  const [systemCollapsed, setSystemCollapsed] = useState(kind === 'system')
  const hasVariants = !!message.variants?.length
  const variantOptions = useMemo(() => {
    const options = [{ id: 'primary', label: 'Latest', blocks: message.blocks }]
    message.variants?.forEach((variant, index) => {
      options.push({ id: `variant-${index}`, label: `Alt ${index + 1}`, blocks: variant.blocks })
    })
    return options
  }, [message.blocks, message.variants])

  useEffect(() => {
    setActiveTab('primary')
  }, [message.id])

  useEffect(() => {
    if (hit) {
      setActiveTab('primary')
    }
  }, [hit])

  useEffect(() => {
    setSystemCollapsed(kind === 'system')
  }, [kind, message.id])

  useEffect(() => {
    if (kind !== 'system' || !systemCollapseCommand) {return}
    setSystemCollapsed(systemCollapseCommand.collapsed)
  }, [kind, systemCollapseCommand])

  const activeBlocksSource = variantOptions.find((option) => option.id === activeTab)?.blocks ?? message.blocks
  const activeBlocks = activeBlocksSource.filter((block) => !isStructuredJsonBlock(block))
  const meta = CARD_META[kind]
  const isSystem = kind === 'system'
  const isResponse = kind === 'response'
  const showBody = !isSystem || !systemCollapsed
  const systemSummary = isSystem ? summarizeSystemSections(systemSections, systemDurationLabel) : null

  return (
    <article id={`msg-${message.id}`} className={clsx('chat-message', `type-${kind}`, isHighlighted && 'is-highlighted')} aria-label={`${meta.label} message`}>
      <div className={clsx('chat-panel', `tone-${kind}`)}>
        <header
          className={clsx('chat-meta', isResponse && 'response-meta', isSystem && 'is-collapsible', isSystem && 'system-separator-toggle')}
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
          aria-label={isSystem ? (systemCollapsed ? 'Expand system message' : 'Collapse system message') : undefined}
          aria-expanded={isSystem ? !systemCollapsed : undefined}
        >
          <span className={clsx('chat-role', isSystem && 'system-separator-label')}>
            {isSystem ? (
              <>
                <span className="system-separator-line" aria-hidden="true" />
                <span className="system-separator-icon" aria-hidden="true">
                  {systemSummary?.icon}
                </span>
                <span>{systemSummary?.separatorLabel ?? 'Response preparation'}</span>
                {!!systemSummary?.count && <span className="chat-role-count">{systemSummary.count}</span>}
                <span className="system-separator-line" aria-hidden="true" />
              </>
            ) : (
              <span className={clsx(isResponse && 'sr-only')}>{meta.label}</span>
            )}
          </span>
          <div className="chat-meta-right">
            {!isSystem && <time className="chat-time">{formatMessageTime(message.time)}</time>}
            {isSystem && (
              <span className={clsx('chat-meta-chevron', systemCollapsed && 'is-collapsed')} aria-hidden="true">
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            )}
          </div>
        </header>
        {showBody && hasVariants && (
          <div className="chat-variants">
            {variantOptions.map((option) => (
              <button
                key={option.id}
                className={clsx('chat-variant-btn', activeTab === option.id && 'is-active')}
                onClick={() => setActiveTab(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {showBody && (
          <>
            <CollapsibleContent
              className="chat-content-collapsible"
              enabled
              maxHeight={kind === 'request' ? 340 : kind === 'system' ? 360 : 440}
            >
              <div className="chat-blocks">
                {activeBlocks.map((block, index) => (
                  <BlockRenderer key={`${message.id}-${index}`} block={block} assetsMap={assetsMap} hit={hit && hit.blockIndex === index ? hit : null} />
                ))}
                {!activeBlocks.length && systemSections.length === 0 && <p className="chat-empty">No content for this message.</p>}
              </div>
            </CollapsibleContent>
            {systemSections.length > 0 && (
              <CollapsibleContent className="chat-content-collapsible" enabled={kind === 'system'} maxHeight={360}>
                <SystemSections sections={systemSections} time={message.time} />
              </CollapsibleContent>
            )}
          </>
        )}
        {isSystem && systemCollapsed && systemSummary?.preview && <p className="system-collapsed-preview">{systemSummary.preview}</p>}
      </div>
    </article>
  )
}

function SystemSections({ sections, time }: { sections: SystemSection[]; time?: number | null }) {
  if (!sections.length) {return null}
  const timeLabel = formatMessageTime(time)
  return (
    <div className="system-body">
      {sections.map((section) => (
        <section key={section.key} className={clsx('system-item', `system-kind-${section.kind}`)}>
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
    <div className="system-text-entries">
      {entries.map((entry, index) => (
        <div key={`system-entry-${index}`} className="system-text-entry">
          <MarkdownBlock text={entry} />
          {showDividers && index < entries.length - 1 && <hr className="system-entry-divider" />}
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
  const [sourcesOpen, setSourcesOpen] = useState(false)
  if (!queries.length && !(sources && sources.length) && !responseLength) {return null}
  const normalizedSources = normalizeSearchSources(sources ?? [])
  return (
    <div className="system-search">
      {queries.length > 0 && (
        <CollapsibleContent className="system-section-collapsible" maxHeight={210}>
          <ul className="system-search-list">
            {queries.map((entry, index) => {
              const metaBits: string[] = []
              if (typeof entry.recency === 'number') {
                metaBits.push(`Recency ${entry.recency}d`)
              }
              if (entry.domains?.length) {
                metaBits.push(`Domains ${entry.domains.map((domain) => normalizeSourceDomain(domain)).join(', ')}`)
              }
              return (
                <li key={`${entry.query}-${index}`}>
                  <span>{entry.query}</span>
                  {metaBits.length > 0 && <span className="system-search-meta">{metaBits.join(' • ')}</span>}
                </li>
              )
            })}
          </ul>
        </CollapsibleContent>
      )}
      {normalizedSources.length > 0 && (
        <div className="system-search-sources-group">
          <button type="button" className="system-sources-toggle" onClick={() => setSourcesOpen((prev) => !prev)}>
            Sources ({normalizedSources.length}) <ChevronDown size={13} className={clsx(sourcesOpen && 'is-open')} />
          </button>
          {sourcesOpen && (
            <div className="system-search-sources">
              {normalizedSources.map((source) => (
                <span key={source} className="system-search-source-chip">
                  {source}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {responseLength && <p className="system-search-meta">Requested response length: {responseLength}</p>}
    </div>
  )
}

function CollapsibleContent({
  children,
  maxHeight,
  enabled = true,
  className,
}: {
  children: ReactNode
  maxHeight: number
  enabled?: boolean
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled) {
      setOverflowing(false)
      return
    }
    const element = contentRef.current
    if (!element) {return}
    const check = () => setOverflowing(element.scrollHeight > maxHeight + 8)
    check()
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(check)
      resizeObserver.observe(element)
      return () => resizeObserver.disconnect()
    }
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [enabled, maxHeight, children])

  if (!enabled) {return <>{children}</>}

  return (
    <div className={clsx('collapsible-content', className, overflowing && !expanded && 'is-clamped')}>
      <div className="collapsible-content-inner" ref={contentRef} style={!expanded && overflowing ? { maxHeight } : undefined}>
        {children}
      </div>
      {overflowing && !expanded && <div className="collapsible-fade" />}
      {overflowing && (
        <button type="button" className="secondary collapsible-toggle" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function summarizeSystemSections(
  sections: SystemSection[],
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
    separatorLabel: durationLabel ?? 'Response preparation',
  }
}

function extractThinkingDurationLabel(message: Message): string | null {
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
    return formatThinkingDuration(secondsValue)
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

function formatThinkingDuration(seconds: number): string {
  const total = Math.max(1, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remaining = total % 60
  if (minutes > 0) {
    return `Nachgedacht für ${minutes}m ${remaining}s`
  }
  return `Nachgedacht für ${remaining}s`
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

function BlockRenderer({
  block,
  assetsMap,
  hit,
}: {
  block: Block
  assetsMap: Record<string, string>
  hit: { lineNo: number; query: string } | null
}) {
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
        <pre className="transcript-block">
          <code>{block.text}</code>
        </pre>
      )
    case 'separator':
      return <hr className="message-separator" />
    default:
      return <p className="chat-empty">Unsupported block type.</p>
  }
}

function formatMessageTime(value?: number | null): string {
  if (!value) {return ''}
  return formatConversationDate(value)
}
