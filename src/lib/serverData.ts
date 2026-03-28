import type { Conversation, ConversationSummary, GeneratedAsset } from '../types';
import type { SearchBundle } from '../types/search';

const CONVERSATIONS_INDEX_URL = 'conversations.json';

export async function fetchServerIndex(): Promise<ConversationSummary[]> {
  try {
    const payload = await fetchJsonFromUrl<unknown>(CONVERSATIONS_INDEX_URL);
    if (!payload) {
      return [];
    }
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload.map(item => {
      const pinnedTime = normalizeNullableTimestamp(item.pinned_time);
      return {
        id: String(item.id ?? item.conversation_id ?? crypto.randomUUID()),
        conversation_id: typeof item.conversation_id === 'string' ? item.conversation_id : undefined,
        raw_id: typeof item.raw_id === 'string' ? item.raw_id : null,
        title: item.title ?? 'Untitled Conversation',
        snippet: item.snippet ?? '',
        last_message_time: normalizeTimestamp(item.last_message_time ?? item.update_time),
        create_time: normalizeTimestamp(item.create_time),
        update_time: normalizeTimestamp(item.update_time),
        pinned_time: pinnedTime,
        is_archived: typeof item.is_archived === 'boolean' ? item.is_archived : undefined,
        memory_scope: typeof item.memory_scope === 'string' || item.memory_scope === null ? item.memory_scope : undefined,
        mapping_node_count: item.mapping_node_count ?? item.node_count,
        source: 'server',
        pinned: pinnedTime !== null && pinnedTime !== undefined,
      };
    });
  } catch (error) {
    console.error('Failed to fetch conversations index', error);
    return [];
  }
}

export async function fetchServerConversation(id: string): Promise<Conversation | null> {
  try {
    const encodedId = encodeURIComponent(id);
    const data = await fetchJsonFromUrl<Conversation>(`conversations/${encodedId}/conversation.json`, { cache: 'no-store' });
    return data;
  } catch (error) {
    console.error('Failed to fetch conversation from server', error);
    return null;
  }
}

export async function fetchServerSearchBundle(): Promise<SearchBundle | null> {
  try {
    return await fetchJsonFromUrl<SearchBundle>('search_index.json', { cache: 'no-store' });
  } catch (error) {
    console.warn('Search index unavailable', error);
    return null;
  }
}

export async function fetchServerGeneratedAssets(): Promise<GeneratedAsset[]> {
  try {
    const data = await fetchJsonFromUrl<unknown>('generated_files.json', { cache: 'no-store' });
    if (!data) {
      return [];
    }
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map(item => normalizeGeneratedAsset(item)).filter((item): item is GeneratedAsset => item !== null);
  } catch (error) {
    console.warn('Generated files metadata unavailable', error);
    return [];
  }
}

async function fetchJsonFromUrl<T>(url: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(url, init);
  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json') || contentType.includes('text/json')) {
    return (await response.json()) as T;
  }

  const body = await response.text();
  const trimmed = body.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

function normalizeTimestamp(value?: number | string | null): number {
  if (!value) {
    return 0;
  }
  if (typeof value === 'number') {
    return value * (value < 10_000_000_000 ? 1000 : 1);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function normalizeNullableTimestamp(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }
  }
  return undefined;
}

function normalizeGeneratedAsset(value: unknown): GeneratedAsset | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Record<string, unknown>;
  const path = typeof row.path === 'string' ? row.path : null;
  const fileName = typeof row.fileName === 'string' ? row.fileName : path ? (path.split('/').pop() ?? path) : null;
  if (!path || !fileName) {
    return null;
  }
  const size = typeof row.size === 'number' ? row.size : undefined;
  const mime = typeof row.mime === 'string' ? row.mime : undefined;
  const pointers = Array.isArray(row.pointers) ? row.pointers.filter((item): item is string => typeof item === 'string') : undefined;
  const createdAt = normalizeGeneratedAssetTimestamp(row.createdAt ?? row.create_time ?? row.created_at ?? row.creation_time);
  const updatedAt = normalizeGeneratedAssetTimestamp(row.updatedAt ?? row.update_time ?? row.updated_at ?? row.modified_at ?? row.last_modified ?? row.mtime);
  return {
    path,
    fileName,
    size,
    mime,
    pointers,
    createdAt: createdAt ?? undefined,
    updatedAt: updatedAt ?? undefined,
  };
}

function normalizeGeneratedAssetTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}
