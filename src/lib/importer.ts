import { strFromU8, unzipSync } from 'fflate'

import type { Conversation, ConversationSummary, ExportExtraData, GeneratedAsset } from '../types'
import type { SearchLine } from '../types/search'
import { collectGeneratedAssets, extractExtraData } from './exportExtras'
import { buildSearchData } from './searchBuilder'
import {
  type ComparisonPayload,
  convertRawConversation,
  extractAssetsJson,
  extractConversationsFromChat,
  findAssetEntry,
  guessMimeByPath,
  isSafeRelativePath,
  normalizePath,
  type RawConversation,
  safeJsonParse,
  shouldReplace,
} from './slimConvert'

export interface ImportConversationPayload extends ComparisonPayload {
  summary: ConversationSummary
  conversation: Conversation
  searchLines: SearchLine[]
  grams: string[]
  assetKeys: string[]
}

export interface ImportBundle {
  conversations: ImportConversationPayload[]
  assets: Map<string, Blob>
  assetMime: Map<string, string | undefined>
  extras: ExportExtraData
}

export interface ImportParseProgress {
  phase: 'archive-start' | 'archive-conversations' | 'archive-assets' | 'archive-complete'
  archiveIndex: number
  archivesTotal: number
  archiveName: string
  conversationsProcessed: number
  conversationsTotal: number
  assetsProcessed: number
}

export interface ParseExportZipsOptions {
  onProgress?: (progress: ImportParseProgress) => void
}

export async function parseExportZips(files: File[], options: ParseExportZipsOptions = {}): Promise<ImportBundle> {
  const merged = new Map<string, ImportConversationPayload>()
  const assets = new Map<string, Blob>()
  const assetMime = new Map<string, string | undefined>()
  const extras: ExportExtraData = {}
  const generatedAssets = new Map<string, GeneratedAsset>()
  const archivesTotal = files.length
  let order = 0

  for (let archiveIndex = 0; archiveIndex < files.length; archiveIndex += 1) {
    const file = files[archiveIndex]
    options.onProgress?.({
      phase: 'archive-start',
      archiveIndex: archiveIndex + 1,
      archivesTotal,
      archiveName: file.name,
      conversationsProcessed: 0,
      conversationsTotal: 0,
      assetsProcessed: 0,
    })
    const buffer = new Uint8Array(await file.arrayBuffer())
    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(buffer)
    } catch (error) {
      console.warn(`Failed to unzip ${file.name}:`, error)
      continue
    }

    let conversationsJson = ''
    let chatHtml = ''
    const entryMap = new Map<string, Uint8Array>()

    Object.entries(entries).forEach(([name, data]) => {
      const normalized = normalizePath(name)
      if (!normalized) {return}
      entryMap.set(normalized, data)
      if (normalized.endsWith('conversations.json')) {
        conversationsJson = strFromU8(data)
      } else if (normalized.endsWith('chat.html')) {
        chatHtml = strFromU8(data)
      }
    })

    const extractedExtras = extractExtraData(entryMap)
    mergeExtras(extras, extractedExtras)

    let rawList: RawConversation[] | null = chatHtml ? extractConversationsFromChat(chatHtml) : null
    if ((!rawList || !rawList.length) && conversationsJson) {
      rawList = safeJsonParse(conversationsJson, [])
    }
    if (!rawList || !rawList.length) {
      console.warn('ZIP missing conversation data, skipping')
      continue
    }

    options.onProgress?.({
      phase: 'archive-conversations',
      archiveIndex: archiveIndex + 1,
      archivesTotal,
      archiveName: file.name,
      conversationsProcessed: 0,
      conversationsTotal: rawList.length,
      assetsProcessed: 0,
    })

    const assetsJson = chatHtml ? extractAssetsJson(chatHtml) : {}
    const userAssets = collectGeneratedAssets(entryMap, assetsJson, extractedExtras.user?.id ?? extras.user?.id)
    mergeGeneratedAssets(generatedAssets, userAssets)
    ensureGeneratedAssetBlobs(userAssets, entryMap, assets, assetMime)

    let conversationsProcessed = 0
    for (const raw of rawList) {
      const converted = convertRawConversation(raw, assetsJson)
      if (!converted) {continue}
      const { conversation, snippet, mappingNodeCount, assetKeys } = converted
      if (!isSafeConversationId(conversation.id)) {
        console.warn(`Skipping conversation with unsafe id: ${conversation.id}`)
        continue
      }

      const { lines, grams } = buildSearchData(conversation)
      const summary: ConversationSummary = {
        id: conversation.id,
        title: conversation.title || 'Untitled',
        snippet,
        last_message_time: conversation.last_message_time,
        create_time: conversation.create_time,
        update_time: conversation.update_time,
        mapping_node_count: mappingNodeCount,
        source: 'local',
      }

      const payload: ImportConversationPayload = {
        summary,
        conversation,
        searchLines: lines,
        grams,
        assetKeys,
        mappingNodeCount,
        importOrder: order++,
      }

      const existing = merged.get(conversation.id)
      if (!existing || shouldReplace(existing, payload)) {
        merged.set(conversation.id, payload)
      }
      conversationsProcessed += 1
      options.onProgress?.({
        phase: 'archive-conversations',
        archiveIndex: archiveIndex + 1,
        archivesTotal,
        archiveName: file.name,
        conversationsProcessed,
        conversationsTotal: rawList.length,
        assetsProcessed: 0,
      })
    }

    let assetsProcessed = 0
    for (const payload of merged.values()) {
      payload.assetKeys.forEach((assetKey) => {
        if (!isSafeRelativePath(assetKey)) {
          console.warn(`Skipping unsafe asset key: ${assetKey}`)
          return
        }
        if (assets.has(assetKey)) {return}
        const data = findAssetEntry(entryMap, assetKey)
        if (!data) {
          console.warn(`Missing asset data for ${assetKey}`)
          return
        }
        const blob = new Blob([cloneToArrayBuffer(data)], { type: guessMimeByPath(assetKey) })
        assets.set(assetKey, blob)
        assetMime.set(assetKey, blob.type)
        assetsProcessed += 1
      })
    }
    options.onProgress?.({
      phase: 'archive-assets',
      archiveIndex: archiveIndex + 1,
      archivesTotal,
      archiveName: file.name,
      conversationsProcessed,
      conversationsTotal: rawList.length,
      assetsProcessed,
    })
    options.onProgress?.({
      phase: 'archive-complete',
      archiveIndex: archiveIndex + 1,
      archivesTotal,
      archiveName: file.name,
      conversationsProcessed,
      conversationsTotal: rawList.length,
      assetsProcessed,
    })
  }

  extras.generatedAssets = Array.from(generatedAssets.values())
  return {
    conversations: Array.from(merged.values()),
    assets,
    assetMime,
    extras,
  }
}

function cloneToArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.length)
  copy.set(view)
  return copy.buffer
}

function mergeExtras(target: ExportExtraData, incoming: ExportExtraData): void {
  if (incoming.user) {target.user = incoming.user}
  if (incoming.messageFeedback) {target.messageFeedback = incoming.messageFeedback}
  if (incoming.groupChats) {target.groupChats = incoming.groupChats}
  if (incoming.shopping) {target.shopping = incoming.shopping}
  if (incoming.basisPoints) {target.basisPoints = incoming.basisPoints}
  if (incoming.sora) {target.sora = incoming.sora}
}

function mergeGeneratedAssets(store: Map<string, GeneratedAsset>, incoming: GeneratedAsset[]): void {
  incoming.forEach((asset) => {
    const existing = store.get(asset.path)
    if (existing) {
      existing.pointers = mergePointerLists(existing.pointers, asset.pointers)
      if ((existing.size === null || existing.size === undefined) && asset.size !== null && asset.size !== undefined) {
        existing.size = asset.size
      }
      if (!existing.mime && asset.mime) {
        existing.mime = asset.mime
      }
      return
    }
    store.set(asset.path, { ...asset })
  })
}

function mergePointerLists(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) {return undefined}
  const set = new Set<string>()
  a?.forEach((item) => set.add(item))
  b?.forEach((item) => set.add(item))
  return Array.from(set)
}

function ensureGeneratedAssetBlobs(
  assetsList: GeneratedAsset[],
  entryMap: Map<string, Uint8Array>,
  assets: Map<string, Blob>,
  assetMime: Map<string, string | undefined>,
): void {
  assetsList.forEach((asset) => {
    if (!asset.path || assets.has(asset.path)) {return}
    if (!isSafeRelativePath(asset.path)) {
      console.warn(`Skipping unsafe generated asset path: ${asset.path}`)
      return
    }
    const data = findAssetEntry(entryMap, asset.path)
    if (!data) {
      console.warn(`Missing generated asset payload for ${asset.path}`)
      return
    }
    const blob = new Blob([cloneToArrayBuffer(data)], { type: asset.mime || guessMimeByPath(asset.path) })
    assets.set(asset.path, blob)
    assetMime.set(asset.path, blob.type)
  })
}

function isSafeConversationId(id: string): boolean {
  return Boolean(id) && !id.includes('/') && !id.includes('\\') && !id.includes('\0') && !id.includes('..')
}
