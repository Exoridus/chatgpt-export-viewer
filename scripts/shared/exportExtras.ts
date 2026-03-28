import { strFromU8 } from 'fflate'

import type {
  BasisPointsExport,
  ExportExtraData,
  ExportUserProfile,
  GeneratedAsset,
  GroupChatsExport,
  MessageFeedbackRecord,
  ShoppingListEntry,
  SoraExport,
} from '../../src/types'
import type { AssetsIndex } from './slimConvert'
import { guessMimeByPath } from './slimConvert'

interface AssetDescriptorInfo {
  pointers: Set<string>
  createdAt?: number
  updatedAt?: number
}

export function extractExtraData(entries: Map<string, Uint8Array>): ExportExtraData {
  return {
    user: readJson<ExportUserProfile>(entries, 'tmp/user.json'),
    messageFeedback: readJson<MessageFeedbackRecord[]>(entries, 'tmp/message_feedback.json'),
    groupChats: readJson<GroupChatsExport>(entries, 'tmp/group_chats.json'),
    shopping: readJson<ShoppingListEntry[]>(entries, 'tmp/shopping.json'),
    basisPoints: readJson<BasisPointsExport>(entries, 'tmp/basispoints.json'),
    sora: readJson<SoraExport>(entries, 'tmp/sora.json'),
  }
}

export function collectGeneratedAssets(
  entries: Map<string, Uint8Array>,
  assetsJson: AssetsIndex,
  userId?: string | null,
): GeneratedAsset[] {
  const folderName = normalizeUserFolder(userId, entries)
  if (!folderName) return []
  const descriptorMap = buildDescriptorMap(assetsJson, folderName)
  const files = new Map<string, GeneratedAsset>()
  entries.forEach((buffer, rawKey) => {
    if (!rawKey || rawKey.endsWith('/')) return
    const relativePath = extractUserPath(rawKey, folderName)
    if (!relativePath) return
    const fileName = relativePath.split('/').pop() ?? relativePath
    const descriptor = descriptorMap.get(relativePath)
    const next: GeneratedAsset = {
      path: relativePath,
      fileName,
      size: buffer.length,
      mime: guessMimeByPath(relativePath),
      pointers: descriptor ? Array.from(descriptor.pointers) : undefined,
      createdAt: descriptor?.createdAt,
      updatedAt: descriptor?.updatedAt,
    }
    const existing = files.get(relativePath)
    if (existing) {
      existing.pointers = mergePointerLists(existing.pointers, next.pointers)
      if ((existing.size === null || existing.size === undefined) && next.size !== null && next.size !== undefined) existing.size = next.size
      if (!existing.mime && next.mime) existing.mime = next.mime
      existing.createdAt = pickEarlierTimestamp(existing.createdAt, next.createdAt)
      existing.updatedAt = pickLaterTimestamp(existing.updatedAt, next.updatedAt)
    } else {
      files.set(relativePath, next)
    }
  })
  return Array.from(files.values())
}

function readJson<T>(entries: Map<string, Uint8Array>, key: string): T | undefined {
  const payload = entries.get(key)
  if (!payload) return undefined
  try {
    return JSON.parse(strFromU8(payload)) as T
  } catch (error) {
    console.warn(`Failed to parse ${key}`, error)
    return undefined
  }
}

function normalizeUserFolder(userId: string | null | undefined, entries: Map<string, Uint8Array>): string | null {
  if (userId) {
    const trimmed = userId.trim()
    if (trimmed) return trimmed
  }
  for (const key of entries.keys()) {
    const match = key.match(/(user-[a-zA-Z0-9_-]+)/)
    if (match) {
      return match[1]
    }
  }
  return null
}

function extractUserPath(rawKey: string, folderName: string): string | null {
  const normalized = rawKey.replace(/\\/g, '/')
  const idx = normalized.indexOf(folderName)
  if (idx === -1) return null
  const prefixValid = idx === 0 || normalized[idx - 1] === '/'
  if (!prefixValid) return null
  const suffix = normalized.slice(idx)
  if (!suffix.includes('/')) return null
  return suffix
}

function buildDescriptorMap(assetsJson: AssetsIndex, folderName: string): Map<string, AssetDescriptorInfo> {
  const map = new Map<string, AssetDescriptorInfo>()
  Object.entries(assetsJson).forEach(([pointer, descriptor]) => {
    const info = resolveAssetDescriptor(descriptor)
    if (!info.path) return
    const rel = extractUserPath(info.path, folderName)
    if (!rel) return
    if (!map.has(rel)) {
      map.set(rel, { pointers: new Set() })
    }
    const target = map.get(rel)!
    target.pointers.add(pointer)
    target.createdAt = pickEarlierTimestamp(target.createdAt, info.createdAt)
    target.updatedAt = pickLaterTimestamp(target.updatedAt, info.updatedAt)
  })
  return map
}

function resolveAssetDescriptor(descriptor: unknown): { path: string | null; createdAt?: number; updatedAt?: number } {
  if (typeof descriptor === 'string') {
    return { path: descriptor }
  }
  if (descriptor && typeof descriptor === 'object') {
    const data = descriptor as {
      file_path?: string
      download_url?: string
      created_at?: unknown
      create_time?: unknown
      creation_time?: unknown
      updated_at?: unknown
      update_time?: unknown
      modified_at?: unknown
      last_modified?: unknown
      mtime?: unknown
    }
    const path = typeof data.file_path === 'string' ? data.file_path : typeof data.download_url === 'string' ? data.download_url : null
    const createdAt = normalizeTimestamp(data.created_at ?? data.create_time ?? data.creation_time)
    const updatedAt = normalizeTimestamp(data.updated_at ?? data.update_time ?? data.modified_at ?? data.last_modified ?? data.mtime)
    return { path, createdAt: createdAt ?? undefined, updatedAt: updatedAt ?? undefined }
  }
  return { path: null }
}

function mergePointerLists(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) return undefined
  const set = new Set<string>()
  a?.forEach((item) => set.add(item))
  b?.forEach((item) => set.add(item))
  return Array.from(set)
}

function pickEarlierTimestamp(a: unknown, b: unknown): number | undefined {
  const left = normalizeTimestamp(a)
  const right = normalizeTimestamp(b)
  if (left === null) {return right ?? undefined}
  if (right === null) {return left}
  return Math.min(left, right)
}

function pickLaterTimestamp(a: unknown, b: unknown): number | undefined {
  const left = normalizeTimestamp(a)
  const right = normalizeTimestamp(b)
  if (left === null) {return right ?? undefined}
  if (right === null) {return left}
  return Math.max(left, right)
}

function normalizeTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {return null}
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {return null}
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric
    }
    const parsed = Date.parse(trimmed)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}
