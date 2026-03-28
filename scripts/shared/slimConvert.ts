import { linesFromText, sanitizeRenderedMarkdown } from '../../src/lib/text'
import type {
  AssetIndex,
  Block,
  Conversation,
  ConversationMeta,
  ConversationSummary,
  Details,
  GraphConversation,
  GraphMessage,
  GraphMessageContent,
  GraphMultimodalContentPart,
  GraphNode,
  GraphThoughtFragment,
  Message,
  MessageMeta,
} from '../../src/types'

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
  summary: Pick<ConversationSummary, 'last_message_time' | 'pinned_time'>
  mappingNodeCount?: number
  importOrder: number
}

function toRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' ? (value as JsonRecord) : null
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {return undefined}
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function getNestedString(record: JsonRecord, key: string, nestedKey: string): string | undefined {
  const nested = toRecord(record[key])
  return nested ? getString(nested[nestedKey]) : undefined
}

function normalizeTimestampMs(value: unknown): number | undefined {
  const parsed = getNumber(value)
  if (parsed === undefined) {return undefined}
  return parsed > 10_000_000_000 ? parsed : parsed * 1000
}

function normalizeNullableTimestampMs(value: unknown): number | null | undefined {
  if (value === null) {return null}
  if (value === undefined) {return undefined}
  return normalizeTimestampMs(value)
}

export function dedupeTrimmedStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {return undefined}
  const output: string[] = []
  const seen = new Set<string>()
  value.forEach((entry) => {
    if (typeof entry !== 'string') {return}
    const trimmed = entry.trim()
    if (!trimmed || seen.has(trimmed)) {return}
    seen.add(trimmed)
    output.push(trimmed)
  })
  return output.length ? output : undefined
}

export function convertRawConversation(raw: RawConversation, assetsJson: AssetsIndex): SlimConversionResult | null {
  if (!raw.mapping || !raw.current_node) return null
  const nodes = raw.mapping
  const mappingNodeCount = Object.keys(raw.mapping ?? {}).length
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
  const resolvedConversationId = raw.conversation_id ?? raw.id ?? messages[0].id
  const safeUrls = dedupeTrimmedStrings(raw.safe_urls)
  const rawId = typeof raw.id === 'string' && raw.id !== resolvedConversationId ? raw.id : undefined
  const conversationMeta = extractConversationMeta(raw)
  const conversation: Conversation = {
    schema_version: 1,
    id: resolvedConversationId,
    conversation_id: raw.conversation_id ?? resolvedConversationId,
    raw_id: rawId,
    title: raw.title || buildTitleFromMessages(messages),
    current_node: raw.current_node,
    create_time: normalizeOptionalMs(raw.create_time),
    update_time: normalizeOptionalMs(raw.update_time),
    pinned_time: normalizeNullableTimestampMs(raw.pinned_time),
    is_archived: getBoolean(raw.is_archived),
    memory_scope: getString(raw.memory_scope),
    safe_urls: safeUrls,
    mapping_node_count: mappingNodeCount,
    meta: conversationMeta,
    last_message_time: normalizeMs(lastMessageTs),
    assetsMap: Object.keys(assetsMap).length ? assetsMap : undefined,
    messages,
  }
  const assetKeys = Array.from(new Set(Object.values(assetsMap)))
  return {
    conversation,
    snippet,
    mappingNodeCount,
    assetKeys,
  }
}

export function shouldReplace(current: ComparisonPayload, incoming: ComparisonPayload): boolean {
  if (incoming.summary.last_message_time > current.summary.last_message_time) return true
  if (incoming.summary.last_message_time < current.summary.last_message_time) return false
  const currentPinnedTime = current.summary.pinned_time ?? null
  const incomingPinnedTime = incoming.summary.pinned_time ?? null
  if (incomingPinnedTime !== currentPinnedTime) {
    return incoming.importOrder > current.importOrder
  }
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
  const rawJsonString = extractBalancedExpression(html, braceIndex, '{', '}')
  if (!rawJsonString) return {}
  const jsonString = decodeHtmlEntities(rawJsonString)
  try {
    return JSON.parse(jsonString) as AssetsIndex
  } catch (error) {
    const normalized = normalizeJsonLikeObjectLiteral(jsonString)
    if (normalized) {
      try {
        return JSON.parse(normalized) as AssetsIndex
      } catch (fallbackError) {
        console.warn('Failed fallback parse for assets JSON from chat.html', fallbackError)
      }
    }
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
  const jsonString = extractBalancedExpression(html, braceIndex, '[', ']')
  if (!jsonString) return null
  try {
    return JSON.parse(jsonString) as RawConversation[]
  } catch (error) {
    console.warn('Failed to parse conversations from chat.html', error)
    return null
  }
}

function extractBalancedExpression(html: string, start: number, open: string, close: string): string | null {
  let depth = 0
  let i = start
  let inString = false
  let stringChar = ''
  let escaped = false

  while (i < html.length) {
    const char = html[i]
    if (escaped) {
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (inString) {
      if (char === stringChar) {
        inString = false
      }
    } else if (char === '"' || char === "'" || char === '`') {
      inString = true
      stringChar = char
    } else if (char === open) {
      depth += 1
    } else if (char === close) {
      depth -= 1
      if (depth === 0) {
        return html.slice(start, i + 1)
      }
    }
    i += 1
  }
  return null
}

function normalizeJsonLikeObjectLiteral(input: string): string | null {
  const noComments = stripJsComments(input)
  const withDoubleQuotes = normalizeStringQuotes(noComments)
  if (!withDoubleQuotes) {return null}
  const withQuotedKeys = quoteBareObjectKeys(withDoubleQuotes)
  return removeTrailingCommas(withQuotedKeys)
}

function decodeHtmlEntities(input: string): string {
  const namedMap: Record<string, string> = {
    '&quot;': '"',
    '&apos;': '\'',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
  }
  const withNamed = input.replace(/&(quot|apos|amp|lt|gt);/g, (entity) => namedMap[entity] ?? entity)
  const withDecimal = withNamed.replace(/&#(\d+);/g, (_full, value) => {
    const code = Number.parseInt(value, 10)
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {return _full}
    try {
      return String.fromCodePoint(code)
    } catch {
      return _full
    }
  })
  return withDecimal.replace(/&#x([0-9a-fA-F]+);/g, (_full, value) => {
    const code = Number.parseInt(value, 16)
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {return _full}
    try {
      return String.fromCodePoint(code)
    } catch {
      return _full
    }
  })
}

function stripJsComments(input: string): string {
  let result = ''
  let inString = false
  let quote = ''
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    const next = input[i + 1]
    if (escaped) {
      result += char
      escaped = false
      continue
    }
    if (inString) {
      result += char
      if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        inString = false
        quote = ''
      }
      continue
    }
    if (char === '"' || char === '\'') {
      inString = true
      quote = char
      result += char
      continue
    }
    if (char === '/' && next === '/') {
      i += 2
      while (i < input.length && input[i] !== '\n') {
        i += 1
      }
      if (i < input.length) {
        result += input[i]
      }
      continue
    }
    if (char === '/' && next === '*') {
      i += 2
      while (i + 1 < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
        i += 1
      }
      i += 1
      continue
    }
    result += char
  }
  return result
}

function normalizeStringQuotes(input: string): string | null {
  let result = ''
  let inString = false
  let quote = ''
  let escaped = false

  for (const char of input) {
    if (!inString) {
      if (char === '`') {
        return null
      }
      if (char === '\'') {
        inString = true
        quote = '\''
        result += '"'
        continue
      }
      if (char === '"') {
        inString = true
        quote = '"'
      }
      result += char
      continue
    }

    if (escaped) {
      if (quote === '\'' && char === '\'') {
        result += '\''
      } else if (quote === '\'' && char === '"') {
        result += '\\"'
      } else {
        result += `\\${char}`
      }
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (char === quote) {
      inString = false
      quote = ''
      result += '"'
      continue
    }

    if (quote === '\'' && char === '"') {
      result += '\\"'
      continue
    }

    result += char
  }

  if (inString || escaped) {
    return null
  }
  return result
}

function quoteBareObjectKeys(input: string): string {
  let result = ''
  const stack: Array<'object' | 'array'> = []
  let inString = false
  let escaped = false
  let expectingKey = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      continue
    }

    if (char === '{') {
      stack.push('object')
      expectingKey = true
      result += char
      continue
    }
    if (char === '[') {
      stack.push('array')
      expectingKey = false
      result += char
      continue
    }
    if (char === '}' || char === ']') {
      stack.pop()
      expectingKey = false
      result += char
      continue
    }
    if (char === ',') {
      result += char
      expectingKey = stack[stack.length - 1] === 'object'
      continue
    }
    if (char === ':') {
      result += char
      expectingKey = false
      continue
    }

    if (stack[stack.length - 1] === 'object' && expectingKey) {
      if (/\s/.test(char)) {
        result += char
        continue
      }
      if (/[A-Za-z_$]/.test(char)) {
        let end = i + 1
        while (end < input.length && /[A-Za-z0-9_$]/.test(input[end])) {
          end += 1
        }
        const key = input.slice(i, end)
        result += `"${key}"`
        i = end - 1
        continue
      }
    }

    result += char
  }
  return result
}

function removeTrailingCommas(input: string): string {
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      continue
    }

    if (char === ',') {
      let j = i + 1
      while (j < input.length && /\s/.test(input[j])) {
        j += 1
      }
      const next = input[j]
      if (next === '}' || next === ']') {
        continue
      }
    }

    result += char
  }
  return result
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
  if (part === null || part === undefined) return []
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
  const meta = extractStructuredMessageMeta(message)
  if (meta) {
    details.meta = meta
  }
  if (message.metadata) {
    details.data = cloneMetadata(message.metadata)
  }
  return Object.keys(details).length ? details : undefined
}

function extractConversationMeta(raw: RawConversation): ConversationMeta | undefined {
  const meta: ConversationMeta = {}
  const blockedUrls = dedupeTrimmedStrings(raw.blocked_urls)
  const contextScopes = dedupeTrimmedStrings(raw.context_scopes)
  const pluginIds = dedupeTrimmedStrings(raw.plugin_ids)

  if (blockedUrls) {
    meta.blocked_urls = blockedUrls
  }
  if (typeof raw.default_model_slug === 'string' || raw.default_model_slug === null) {
    meta.default_model_slug = raw.default_model_slug
  }
  if (typeof raw.conversation_origin === 'string' || raw.conversation_origin === null) {
    meta.conversation_origin = raw.conversation_origin
  }
  if (contextScopes) {
    meta.context_scopes = contextScopes
  }
  if (pluginIds) {
    meta.plugin_ids = pluginIds
  }
  if (typeof raw.gizmo_id === 'string' || raw.gizmo_id === null) {
    meta.gizmo_id = raw.gizmo_id
  }
  if (typeof raw.owner === 'string' || raw.owner === null) {
    meta.owner = raw.owner
  }
  if (typeof raw.is_starred === 'boolean') {
    meta.is_starred = raw.is_starred
  }
  if (typeof raw.is_read_only === 'boolean') {
    meta.is_read_only = raw.is_read_only
  }
  if (typeof raw.is_do_not_remember === 'boolean') {
    meta.is_do_not_remember = raw.is_do_not_remember
  }

  return Object.keys(meta).length ? meta : undefined
}

function extractStructuredMessageMeta(message: RawMessage): MessageMeta | null {
  const metadata = toRecord(message.metadata) ?? {}

  const meta: MessageMeta = {}
  const status = getString(message.status) ?? getString(metadata.status)
  if (status) {
    meta.status = status
  }

  const messageType = getString(metadata.message_type)
  if (messageType) {
    meta.message_type = messageType
  }
  const requestId = getString(metadata.request_id)
  if (requestId) {
    meta.request_id = requestId
  }
  const modelSlug = getString(metadata.model_slug)
  if (modelSlug) {
    meta.model_slug = modelSlug
  }
  const requestedModelSlug = getString(metadata.requested_model_slug)
  if (requestedModelSlug) {
    meta.requested_model_slug = requestedModelSlug
  }
  const reasoningTitle = getString(metadata.reasoning_title)
  if (reasoningTitle) {
    meta.reasoning_title = reasoningTitle
  }
  const reasoningStatus = getString(metadata.reasoning_status)
  if (reasoningStatus) {
    meta.reasoning_status = reasoningStatus
  }
  const finishedDurationSec = getNumber(metadata.finished_duration_sec)
  if (finishedDurationSec !== undefined) {
    meta.finished_duration_sec = finishedDurationSec
  }

  if (Object.keys(metadata).length > 0) {
    const tokenUsage = extractTokenUsage(metadata)
    if (tokenUsage) {
      if (tokenUsage.prompt_tokens !== undefined) {
        meta.prompt_tokens = tokenUsage.prompt_tokens
      }
      if (tokenUsage.completion_tokens !== undefined) {
        meta.completion_tokens = tokenUsage.completion_tokens
      }
      if (tokenUsage.total_tokens !== undefined) {
        meta.total_tokens = tokenUsage.total_tokens
      }
    }
  }

  return Object.keys(meta).length ? meta : null
}

function extractTokenUsage(
  metadata: JsonRecord,
): Pick<MessageMeta, 'prompt_tokens' | 'completion_tokens' | 'total_tokens'> | null {
  const queue: unknown[] = [metadata]
  const visited = new Set<object>()

  while (queue.length) {
    const current = queue.shift()
    if (!current || typeof current !== 'object') {
      continue
    }
    if (visited.has(current)) {
      continue
    }
    visited.add(current)

    if (Array.isArray(current)) {
      current.forEach((entry) => queue.push(entry))
      continue
    }

    const record = current as JsonRecord
    const promptTokens = getFirstNumberByKeys(record, ['prompt_tokens', 'input_tokens'])
    const completionTokens = getFirstNumberByKeys(record, ['completion_tokens', 'output_tokens'])
    const totalTokens = getFirstNumberByKeys(record, ['total_tokens'])

    if (promptTokens !== undefined || completionTokens !== undefined || totalTokens !== undefined) {
      return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      }
    }

    Object.values(record).forEach((entry) => queue.push(entry))
  }

  return null
}

function getFirstNumberByKeys(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = getNumber(record[key])
    if (value !== undefined) {
      return value
    }
  }
  return undefined
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
