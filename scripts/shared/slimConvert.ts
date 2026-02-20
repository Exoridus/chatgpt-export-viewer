import type {
  ConversationSummary,
  Block,
  Conversation,
  Details,
  Message,
  AssetIndex,
  GraphConversation,
  GraphNode,
  GraphMessage,
  GraphMessageContent,
  GraphMultimodalContentPart,
  GraphThoughtFragment,
} from '../../src/types'
import { linesFromText, sanitizeRenderedMarkdown } from '../../src/lib/text'

export type RawConversation = GraphConversation
type RawNode = GraphNode
type RawMessage = GraphMessage
type JsonRecord = Record<string, unknown>
type RawContent = GraphMessageContent | JsonRecord | null | undefined
type RawPart = GraphMultimodalContentPart | JsonRecord | string | null | undefined

interface SearchMetadata {
  search_queries?: Array<{ q?: string }>
  search_result_groups?: Array<{ domain?: string | null }>
  retrieval_search_sources?: Array<{ id?: string | null; display_name?: string | null }>
  search_display_string?: string
  deep_research_version?: string
}

export type AssetsIndex = AssetIndex

export interface SlimConversionResult {
  conversation: Conversation
  snippet: string
  mappingNodeCount: number
  assetKeys: string[]
}

export interface ComparisonPayload {
  summary: Pick<ConversationSummary, 'last_message_time'>
  mappingNodeCount?: number
  importOrder: number
}

function toRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' ? (value as JsonRecord) : null
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function getNestedString(record: JsonRecord, key: string, nestedKey: string): string | undefined {
  const nested = toRecord(record[key])
  return nested ? getString(nested[nestedKey]) : undefined
}

export function convertRawConversation(raw: RawConversation, assetsJson: AssetsIndex): SlimConversionResult | null {
  if (!raw.mapping || !raw.current_node) return null
  const nodes = raw.mapping
  const path: RawNode[] = []
  const visited = new Set<string>()
  let cursor: RawNode | undefined = nodes[raw.current_node]
  while (cursor && !visited.has(cursor.id)) {
    path.push(cursor)
    visited.add(cursor.id)
    cursor = cursor.parent ? nodes[cursor.parent] : undefined
  }
  path.reverse()
  const messages: Message[] = []
  const assetsMap: Record<string, string> = {}
  let snippet = ''
  let lastMessageTs = raw.update_time ?? raw.create_time ?? 0
  for (const node of path) {
    if (!node?.message) continue
    const msg = transformMessage(node, nodes, assetsJson, assetsMap)
    if (!msg) continue
    if (!snippet && msg.role === 'user') {
      const firstBlock = msg.blocks.find((block) => block.type === 'markdown') as { text: string } | undefined
      if (firstBlock?.text) {
        snippet = buildSnippet(firstBlock.text)
      }
    }
    if (msg.time && msg.time > (lastMessageTs ?? 0)) {
      lastMessageTs = msg.time
    }
    messages.push(msg)
  }
  if (!messages.length) return null
  const conversation: Conversation = {
    schema_version: 1,
    id: raw.conversation_id ?? messages[0].id,
    title: raw.title || buildTitleFromMessages(messages),
    create_time: normalizeOptionalMs(raw.create_time),
    update_time: normalizeOptionalMs(raw.update_time),
    last_message_time: normalizeMs(lastMessageTs),
    assetsMap: Object.keys(assetsMap).length ? assetsMap : undefined,
    messages,
  }
  const assetKeys = Array.from(new Set(Object.values(assetsMap)))
  return {
    conversation,
    snippet,
    mappingNodeCount: Object.keys(raw.mapping ?? {}).length,
    assetKeys,
  }
}

export function shouldReplace(current: ComparisonPayload, incoming: ComparisonPayload): boolean {
  if (incoming.summary.last_message_time > current.summary.last_message_time) return true
  if (incoming.summary.last_message_time < current.summary.last_message_time) return false
  if ((incoming.mappingNodeCount ?? 0) > (current.mappingNodeCount ?? 0)) return true
  if ((incoming.mappingNodeCount ?? 0) < (current.mappingNodeCount ?? 0)) return false
  return incoming.importOrder > current.importOrder
}

export function safeJsonParse<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T
  } catch (error) {
    console.warn('Failed to parse JSON', error)
    return fallback
  }
}

export function extractAssetsJson(html: string): AssetsIndex {
  const marker = 'var assetsJson'
  const markerIndex = html.indexOf(marker)
  if (markerIndex === -1) return {}
  const braceIndex = html.indexOf('{', markerIndex)
  if (braceIndex === -1) return {}
  let depth = 0
  let end = braceIndex
  while (end < html.length) {
    const char = html[end]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        end += 1
        break
      }
    }
    end += 1
  }
  try {
    const jsonString = html.slice(braceIndex, end)
    return JSON.parse(jsonString) as AssetsIndex
  } catch (error) {
    console.warn('Failed to parse assets JSON from chat.html', error)
    return {}
  }
}

export function extractConversationsFromChat(html: string): RawConversation[] | null {
  const marker = 'var jsonData'
  const markerIndex = html.indexOf(marker)
  if (markerIndex === -1) return null
  const braceIndex = html.indexOf('[', markerIndex)
  if (braceIndex === -1) return null
  let depth = 0
  let end = braceIndex
  while (end < html.length) {
    const char = html[end]
    if (char === '[') depth += 1
    if (char === ']') {
      depth -= 1
      if (depth === 0) {
        end += 1
        break
      }
    }
    end += 1
  }
  if (depth !== 0) return null
  const jsonString = html.slice(braceIndex, end)
  try {
    return JSON.parse(jsonString) as RawConversation[]
  } catch (error) {
    console.warn('Failed to parse conversations from chat.html', error)
    return null
  }
}

export function normalizePath(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/^\.\/?/, '').replace(/^\/+/, '')
  const parts = normalized.split('/')
  const safeParts: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      safeParts.pop()
      continue
    }
    safeParts.push(part)
  }
  return safeParts.join('/')
}

export function isSafeRelativePath(input: string): boolean {
  if (!input) return false
  if (input.includes('\0')) return false
  if (input.includes('\\')) return false
  if (input.startsWith('/')) return false
  if (/^[A-Za-z]:/.test(input)) return false
  if (pathHasTraversal(input)) return false
  return normalizePath(input).length > 0
}

function pathHasTraversal(value: string): boolean {
  return value.split('/').some((segment) => segment === '..')
}

export function guessMimeByPath(path: string): string {
  if (/\.png$/i.test(path)) return 'image/png'
  if (/\.jpe?g$/i.test(path)) return 'image/jpeg'
  if (/\.gif$/i.test(path)) return 'image/gif'
  if (/\.webp$/i.test(path)) return 'image/webp'
  if (/\.svg$/i.test(path)) return 'image/svg+xml'
  if (/\.mp3$/i.test(path)) return 'audio/mpeg'
  if (/\.wav$/i.test(path)) return 'audio/wav'
  if (/\.m4a$/i.test(path)) return 'audio/mp4'
  if (/\.mp4$/i.test(path)) return 'video/mp4'
  if (/\.webm$/i.test(path)) return 'video/webm'
  if (/\.json$/i.test(path)) return 'application/json'
  if (/\.txt$/i.test(path)) return 'text/plain'
  if (/\.dat$/i.test(path)) return 'application/octet-stream'
  return 'application/octet-stream'
}

export function findAssetEntry(entries: Map<string, Uint8Array>, assetKey: string): Uint8Array | null {
  const normalized = normalizePath(assetKey)
  const direct = entries.get(normalized)
  if (direct) return direct
  const trimmed = normalized.replace(/^assets\//, '')
  if (trimmed !== normalized) {
    const alt = entries.get(trimmed)
    if (alt) return alt
  }
  const prefixed = `assets/${normalized}`
  const prefixedEntry = entries.get(prefixed)
  if (prefixedEntry) return prefixedEntry
  for (const [key, value] of entries.entries()) {
    if (key === normalized || key === trimmed) continue
    if (key.endsWith(`/${normalized}`) || key.endsWith(`/${trimmed}`)) {
      return value
    }
  }
  return null
}

function transformMessage(
  node: RawNode,
  nodes: Record<string, RawNode>,
  assetsJson: AssetsIndex,
  assetsMap: Record<string, string>,
): Message | null {
  const raw = node.message
  if (!raw) return null
  const role = (raw.author?.role ?? 'user') as Message['role']
  const blocks = convertParts(raw.content, assetsJson, assetsMap)
  const details = buildDetails(raw)
  const slim: Message = {
    id: raw.id || node.id,
    role: role === 'assistant' || role === 'user' || role === 'system' || role === 'tool' ? role : 'user',
    time: normalizeOptionalMs(raw.create_time ?? raw.update_time ?? null),
    recipient: raw.recipient ?? null,
    blocks,
    details,
  }
  if (slim.role === 'assistant') {
    const variantNodes = collectAssistantVariants(node, nodes)
    if (variantNodes.length) {
      slim.variants = variantNodes.map((variant) => ({
        id: variant.message?.id || variant.id,
        time: normalizeOptionalMs(variant.message?.create_time ?? variant.message?.update_time ?? null),
        blocks: convertParts(variant.message?.content, assetsJson, assetsMap),
        details: buildDetails(variant.message),
      }))
    }
  }
  return slim
}

function convertParts(
  content: RawContent | undefined,
  assetsJson: AssetsIndex,
  assetsMap: Record<string, string>,
): Block[] {
  if (!content) return []
  const contentData = toRecord(content)
  if (!contentData) return []
  const hasParts = Array.isArray(contentData.parts)
  if (hasParts) {
    return (contentData.parts as RawPart[]).flatMap((part) => convertPart(part, assetsJson, assetsMap))
  }
  const textValue =
    typeof contentData.text === 'string'
      ? contentData.text
      : typeof contentData.transcript === 'string'
        ? contentData.transcript
        : undefined
  if (textValue) {
    return splitMarkdownIntoBlocks(textValue)
  }
  return []
}

function convertPart(part: RawPart, assetsJson: AssetsIndex, assetsMap: Record<string, string>): Block[] {
  if (part == null) return []
  if (typeof part === 'string') {
    return part.trim().length ? splitMarkdownIntoBlocks(part) : []
  }
  if (typeof part !== 'object') return []
  const partData = toRecord(part)
  if (!partData) return []
  const contentType = getString(partData.content_type)
  const nestedParts = Array.isArray(partData.parts) ? (partData.parts as RawPart[]) : null
  if (nestedParts && contentType === 'multimodal_text') {
    return nestedParts.flatMap((inner) => convertPart(inner, assetsJson, assetsMap))
  }
  if (contentType === 'code') {
    const lang = typeof partData.language === 'string' ? (partData.language as string) : 'text'
    const codeText =
      typeof partData.text === 'string'
        ? (partData.text as string)
        : typeof partData.code === 'string'
          ? (partData.code as string)
          : ''
    return [
      {
        type: 'code' as const,
        lang: lang || 'text',
        text: codeText,
      },
    ]
  }
  if (
    contentType === 'image_file' ||
    contentType === 'asset_pointer' ||
    contentType === 'file' ||
    contentType === 'image_asset_pointer'
  ) {
    const pointer = getString(partData.asset_pointer)
    if (pointer) {
      const assetKey = resolveAssetKey(pointer, assetsJson)
      if (assetKey) {
        assetsMap[pointer] = assetKey
        const metadata = toRecord(partData.metadata)
        const alt = metadata ? getString(metadata.name) : undefined
        return [
          {
            type: 'asset' as const,
            asset_pointer: pointer,
            mediaType: detectMediaType(assetKey),
            alt,
          },
        ]
      }
    }
    return []
  }
  const transcript = getString(partData.transcript)
  if (contentType === 'transcript' || transcript) {
    return [{ type: 'transcript' as const, text: transcript ?? '' }]
  }
  if (nestedParts && nestedParts.length) {
    return nestedParts.flatMap((inner) => convertPart(inner, assetsJson, assetsMap))
  }
  const text = typeof partData.text === 'string' ? partData.text : (getNestedString(partData, 'tts', 'text') ?? '')
  if (!text) return []
  return splitMarkdownIntoBlocks(text)
}

function splitMarkdownIntoBlocks(text: string): Block[] {
  const sanitizedText = sanitizeRenderedMarkdown(text)
  if (!sanitizedText) {
    return []
  }
  const lines = linesFromText(sanitizedText)
  const blocks: Block[] = []
  let buffer: string[] = []
  let inFence = false
  let fenceLang = ''
  let fenceBuffer: string[] = []
  for (const line of lines) {
    const fenceMatch = line.match(/^```(.*)$/)
    if (fenceMatch) {
      if (inFence) {
        blocks.push({ type: 'code', lang: fenceLang || 'text', text: fenceBuffer.join('\n') })
        fenceBuffer = []
        fenceLang = ''
        inFence = false
      } else {
        if (buffer.length) {
          blocks.push({ type: 'markdown', text: buffer.join('\n') })
          buffer = []
        }
        inFence = true
        fenceLang = fenceMatch[1]?.trim() ?? ''
      }
      continue
    }
    if (inFence) {
      fenceBuffer.push(line)
    } else {
      buffer.push(line)
    }
  }
  if (fenceBuffer.length) {
    blocks.push({ type: 'code', lang: fenceLang || 'text', text: fenceBuffer.join('\n') })
  }
  if (buffer.length) {
    blocks.push({ type: 'markdown', text: buffer.join('\n') })
  }
  if (!blocks.length) {
    blocks.push({ type: 'markdown', text: sanitizedText })
  }
  return blocks
}

function collectAssistantVariants(node: RawNode, nodes: Record<string, RawNode>): RawNode[] {
  if (!node.parent) return []
  const parent = nodes[node.parent]
  if (!parent?.children) return []
  return parent.children
    .map((childId) => nodes[childId])
    .filter((child): child is RawNode => Boolean(child && child.id !== node.id && child.message?.author?.role === 'assistant'))
}

function buildDetails(message?: RawMessage): Details | undefined {
  if (!message) return undefined
  const details: Details = {}
  const thinking = extractThinking(message.content)
  if (thinking) {
    details.thinking = thinking
  }
  const search = extractSearchDetails(message.metadata)
  if (search) {
    details.search = search
  }
  if (message.metadata) {
    details.data = cloneMetadata(message.metadata)
  }
  return Object.keys(details).length ? details : undefined
}

function extractThinking(content?: RawContent): string | null {
  if (!content) return null
  const contentData = toRecord(content)
  if (!contentData) return null
  const segments: string[] = []
  if (content && typeof content === 'object' && contentData.content_type === 'thoughts' && Array.isArray(contentData.thoughts)) {
    const thoughts = contentData.thoughts as GraphThoughtFragment[]
    thoughts.forEach((thought) => {
      const candidate = typeof thought?.content === 'string' ? thought.content : typeof thought?.summary === 'string' ? thought.summary : undefined
      const normalized = candidate?.toString().trim()
      if (normalized) segments.push(normalized)
    })
  }
  const hasParts = Array.isArray(contentData.parts)
  if (hasParts && !segments.length) {
    collectThinkingFromParts(contentData.parts as RawPart[], segments)
  }
  return segments.length ? segments.join('\n\n') : null
}

function collectThinkingFromParts(parts: RawPart[], bucket: string[]) {
  parts.forEach((part) => {
    if (!part || typeof part === 'string') return
    const data = toRecord(part)
    if (!data) return
    const contentType = getString(data.content_type)
    if (contentType === 'thought' || contentType === 'thoughts') {
      const meta = toRecord(data.metadata)
      const summary = meta ? getString(meta.summary) : undefined
      const textCandidate = typeof data.text === 'string' ? data.text : summary
      const normalized = textCandidate?.toString().trim()
      if (normalized) {
        bucket.push(normalized)
      }
    }
    if (Array.isArray(data.parts)) {
      collectThinkingFromParts(data.parts as RawPart[], bucket)
    }
  })
}

function extractSearchDetails(metadata?: JsonRecord): Details['search'] | null {
  if (!metadata) return null
  const meta = metadata as SearchMetadata
  const queries: string[] = Array.isArray(meta.search_queries)
    ? meta.search_queries.map((entry) => entry?.q?.trim()).filter((q): q is string => Boolean(q))
    : []
  const domains = new Set<string>()
  if (Array.isArray(meta.search_result_groups)) {
    for (const group of meta.search_result_groups) {
      if (group?.domain) {
        domains.add(group.domain)
      }
    }
  }
  if (Array.isArray(meta.retrieval_search_sources)) {
    for (const source of meta.retrieval_search_sources) {
      const label = source?.display_name ?? source?.id
      if (label) {
        domains.add(label)
      }
    }
  }
  const domainList = Array.from(domains)
  const searchKind =
    (typeof meta.search_display_string === 'string' && meta.search_display_string) ||
    (typeof meta.deep_research_version === 'string' ? 'deep-research' : undefined)
  if (!queries.length && !domainList.length && !searchKind) {
    return null
  }
  const sections: string[] = []
  if (queries.length) {
    sections.push(['Queries:', ...queries.map((query) => `• ${query}`)].join('\n'))
  }
  if (domainList.length) {
    sections.push(['Sources:', ...domainList.map((domain) => `• ${domain}`)].join('\n'))
  }
  return {
    kind: searchKind,
    content: sections.length ? sections.join('\n\n') : null,
    queries,
    sources: domainList.length ? domainList : undefined,
  }
}

function resolveAssetKey(pointer: string, assetsJson: AssetsIndex): string | null {
  const descriptor = assetsJson[pointer]
  if (!descriptor) return null
  if (typeof descriptor === 'string') {
    return isSafeRelativePath(descriptor) ? normalizePath(descriptor) : null
  }
  if (descriptor.file_path) {
    return isSafeRelativePath(descriptor.file_path) ? normalizePath(descriptor.file_path) : null
  }
  if (descriptor.download_url) {
    return isSafeRelativePath(descriptor.download_url) ? normalizePath(descriptor.download_url) : null
  }
  return null
}

function detectMediaType(path: string): 'image' | 'audio' | 'video' | 'file' {
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(path)) return 'image'
  if (/\.(mp3|wav|m4a|ogg)$/i.test(path)) return 'audio'
  if (/\.(mp4|webm|mov)$/i.test(path)) return 'video'
  return 'file'
}

function buildTitleFromMessages(messages: Message[]): string {
  const firstUser = messages.find((msg) => msg.role === 'user')
  if (!firstUser) return 'Conversation'
  const textBlock = firstUser.blocks.find((block) => block.type === 'markdown') as { text: string } | undefined
  if (!textBlock?.text) return 'Conversation'
  return buildSnippet(textBlock.text)
}

function buildSnippet(text: string): string {
  return sanitizeRenderedMarkdown(text).replace(/\s+/g, ' ').trim().slice(0, 120)
}

function normalizeMs(value?: number | null): number {
  if (!value) return 0
  if (value > 10_000_000_000) return value
  return value * 1000
}

function normalizeOptionalMs(value?: number | null): number | undefined {
  if (!value) return undefined
  return normalizeMs(value)
}

function cloneMetadata(metadata: JsonRecord): JsonRecord {
  try {
    return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>
  } catch {
    return { ...metadata }
  }
}
