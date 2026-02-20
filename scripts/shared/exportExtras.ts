import { strFromU8 } from 'fflate'
import type {
  ExportExtraData,
  ExportUserProfile,
  MessageFeedbackRecord,
  GroupChatsExport,
  ShoppingListEntry,
  BasisPointsExport,
  SoraExport,
  GeneratedAsset,
} from '../../src/types'
import type { AssetsIndex } from './slimConvert'
import { guessMimeByPath } from './slimConvert'

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
  const pointerMap = buildPointerMap(assetsJson, folderName)
  const files = new Map<string, GeneratedAsset>()
  entries.forEach((buffer, rawKey) => {
    if (!rawKey || rawKey.endsWith('/')) return
    const relativePath = extractUserPath(rawKey, folderName)
    if (!relativePath) return
    const fileName = relativePath.split('/').pop() ?? relativePath
    const next: GeneratedAsset = {
      path: relativePath,
      fileName,
      size: buffer.length,
      mime: guessMimeByPath(relativePath),
      pointers: pointerMap.get(relativePath) ? Array.from(pointerMap.get(relativePath)!) : undefined,
    }
    const existing = files.get(relativePath)
    if (existing) {
      existing.pointers = mergePointerLists(existing.pointers, next.pointers)
      if (existing.size == null && next.size != null) existing.size = next.size
      if (!existing.mime && next.mime) existing.mime = next.mime
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

function buildPointerMap(assetsJson: AssetsIndex, folderName: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  Object.entries(assetsJson).forEach(([pointer, descriptor]) => {
    const path = resolveAssetPath(descriptor)
    if (!path) return
    const rel = extractUserPath(path, folderName)
    if (!rel) return
    if (!map.has(rel)) {
      map.set(rel, new Set())
    }
    map.get(rel)!.add(pointer)
  })
  return map
}

function resolveAssetPath(descriptor: unknown): string | null {
  if (typeof descriptor === 'string') return descriptor
  if (descriptor && typeof descriptor === 'object') {
    const data = descriptor as { file_path?: string; download_url?: string }
    if (typeof data.file_path === 'string') return data.file_path
    if (typeof data.download_url === 'string') return data.download_url
  }
  return null
}

function mergePointerLists(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) return undefined
  const set = new Set<string>()
  a?.forEach((item) => set.add(item))
  b?.forEach((item) => set.add(item))
  return Array.from(set)
}
