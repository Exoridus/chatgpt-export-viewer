import type { Conversation, ConversationSummary, GeneratedAsset } from '../types'
import type { SearchBundle } from '../types/search'

const CONVERSATIONS_INDEX_URL = 'conversations.json'

export async function fetchServerIndex(): Promise<ConversationSummary[]> {
  try {
    const payload = await fetchJsonFromUrl<unknown>(CONVERSATIONS_INDEX_URL)
    if (!payload) {
      return []
    }
    if (!Array.isArray(payload)) {return []}
    return payload.map((item) => ({
      id: String(item.id ?? item.conversation_id ?? crypto.randomUUID()),
      title: item.title ?? 'Untitled Conversation',
      snippet: item.snippet ?? '',
      last_message_time: normalizeTimestamp(item.last_message_time ?? item.update_time),
      create_time: normalizeTimestamp(item.create_time),
      update_time: normalizeTimestamp(item.update_time),
      mapping_node_count: item.mapping_node_count ?? item.node_count,
      source: 'server',
      pinned: false,
    }))
  } catch (error) {
    console.error('Failed to fetch conversations index', error)
    return []
  }
}

export async function fetchServerConversation(id: string): Promise<Conversation | null> {
  try {
    const encodedId = encodeURIComponent(id)
    const data = await fetchJsonFromUrl<Conversation>(`conversations/${encodedId}/conversation.json`, { cache: 'no-store' })
    return data
  } catch (error) {
    console.error('Failed to fetch conversation from server', error)
    return null
  }
}

export async function fetchServerSearchBundle(): Promise<SearchBundle | null> {
  try {
    return await fetchJsonFromUrl<SearchBundle>('search_index.json', { cache: 'no-store' })
  } catch (error) {
    console.warn('Search index unavailable', error)
    return null
  }
}

export async function fetchServerGeneratedAssets(): Promise<GeneratedAsset[]> {
  try {
    const data = await fetchJsonFromUrl<unknown>('generated_files.json', { cache: 'no-store' })
    if (!data) {return []}
    if (!Array.isArray(data)) {return []}
    return data as GeneratedAsset[]
  } catch (error) {
    console.warn('Generated files metadata unavailable', error)
    return []
  }
}

async function fetchJsonFromUrl<T>(url: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(url, init)
  if (!response.ok) {return null}

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/json') || contentType.includes('text/json')) {
    return (await response.json()) as T
  }

  const body = await response.text()
  const trimmed = body.trim()
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return null
  }

  try {
    return JSON.parse(trimmed) as T
  } catch {
    return null
  }
}

function normalizeTimestamp(value?: number | string | null): number {
  if (!value) {return 0}
  if (typeof value === 'number') {return value * (value < 10_000_000_000 ? 1000 : 1)}
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {return 0}
  return parsed
}
