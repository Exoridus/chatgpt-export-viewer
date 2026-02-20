import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import type { ConversationSummary, Conversation, ExportExtraData, GeneratedAsset } from '../../src/types'
import type { SearchBundle, SearchLine } from '../../src/types/search'
import { buildSearchData } from '../../src/lib/searchBuilder'
import {
  convertRawConversation,
  extractAssetsJson,
  extractConversationsFromChat,
  findAssetEntry,
  isSafeRelativePath,
  normalizePath,
  safeJsonParse,
  shouldReplace,
  type AssetsIndex,
  type ComparisonPayload,
  type RawConversation,
} from './slimConvert'
import { extractExtraData, collectGeneratedAssets } from './exportExtras'

export type DatasetImportMode = 'upsert' | 'replace' | 'clone'

export interface DatasetImportOptions {
  patterns?: string[]
  outputDir: string
  mode?: DatasetImportMode
}

export interface DatasetImportResult {
  conversations: number
  assets: number
}

interface SourceCandidate {
  kind: 'zip' | 'dir'
  path: string
}

interface ArchiveData {
  conversations: RawConversation[]
  assetsJson: AssetsIndex
  entries: Map<string, Uint8Array>
}

interface ServerConversationPayload extends ComparisonPayload {
  summary: ConversationSummary
  conversation: Conversation
  searchLines: SearchLine[]
  grams: string[]
  assetKeys: string[]
}

const DEFAULT_GLOB = './*.zip'
const DEFAULT_MODE: DatasetImportMode = 'upsert'
const EXTRA_FILE_ENTRIES: Array<[keyof ExportExtraData, string]> = [
  ['user', 'user.json'],
  ['messageFeedback', 'message_feedback.json'],
  ['groupChats', 'group_chats.json'],
  ['shopping', 'shopping.json'],
  ['basisPoints', 'basispoints.json'],
  ['sora', 'sora.json'],
  ['generatedAssets', 'generated_files.json'],
]

export async function importDatasets(options: DatasetImportOptions): Promise<DatasetImportResult> {
  const patterns = (options.patterns && options.patterns.length ? options.patterns : [DEFAULT_GLOB]).map((pattern) =>
    pattern.trim(),
  )
  const mode: DatasetImportMode = options.mode ?? DEFAULT_MODE
  const sources = await discoverSources(patterns)
  if (!sources.length) {
    throw new Error(`No exports found for patterns: ${patterns.join(', ')}`)
  }
  const merged = new Map<string, ServerConversationPayload>()
  const assetData = new Map<string, Uint8Array>()
  const extras: ExportExtraData = {}
  const generatedAssets = new Map<string, GeneratedAsset>()
  let importOrder = 0

  if (mode === 'upsert' || mode === 'clone') {
    const existing = await loadExistingDataset(options.outputDir)
    existing.payloads.forEach((payload) => {
      merged.set(payload.conversation.id, { ...payload, importOrder: importOrder++ })
    })
    existing.assets.forEach((value, key) => {
      if (!assetData.has(key)) {
        assetData.set(key, value)
      }
    })
    mergeExtras(extras, existing.extras)
    if (existing.extras.generatedAssets) {
      mergeGeneratedAssets(generatedAssets, existing.extras.generatedAssets)
    }
  }

  const cloneTracker = mode === 'clone' ? buildCloneTracker(merged.keys()) : null

  for (const source of sources) {
    const archive = source.kind === 'zip' ? await loadZipArchive(source.path) : await loadDirectoryArchive(source.path)
    const extractedExtras = extractExtraData(archive.entries)
    mergeExtras(extras, extractedExtras)
    const userAssets = collectGeneratedAssets(archive.entries, archive.assetsJson, extractedExtras.user?.id ?? extras.user?.id)
    mergeGeneratedAssets(generatedAssets, userAssets)
    ensureGeneratedAssetData(userAssets, archive.entries, assetData)
    for (const raw of archive.conversations) {
      const converted = convertRawConversation(raw, archive.assetsJson)
      if (!converted) continue
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
        source: 'server',
        pinned: false,
      }
      let payload: ServerConversationPayload = {
        summary,
        conversation,
        searchLines: lines,
        grams,
        assetKeys,
        mappingNodeCount,
        importOrder: importOrder++,
      }
      if (mode === 'clone') {
        payload = ensureClonePayloadId(payload, merged, cloneTracker!)
        merged.set(payload.conversation.id, payload)
      } else {
        const existing = merged.get(conversation.id)
        if (!existing || shouldReplace(existing, payload)) {
          merged.set(conversation.id, payload)
        }
      }
      assetKeys.forEach((assetKey) => {
        if (!isSafeRelativePath(assetKey)) {
          console.warn(`Skipping unsafe asset path: ${assetKey}`)
          return
        }
        if (assetData.has(assetKey)) return
        const data = findAssetEntry(archive.entries, assetKey)
        if (!data) {
          console.warn(`Missing asset payload for ${assetKey}`)
          return
        }
        assetData.set(assetKey, data)
      })
    }
  }

  extras.generatedAssets = Array.from(generatedAssets.values())
  await writeDataset(path.resolve(process.cwd(), options.outputDir), merged, assetData, extras)
  return { conversations: merged.size, assets: assetData.size }
}

async function discoverSources(patterns: string[]): Promise<SourceCandidate[]> {
  const seen = new Set<string>()
  const sources: SourceCandidate[] = []
  for (const pattern of patterns) {
    const matches = await expandGlob(pattern)
    for (const match of matches) {
      if (seen.has(match)) continue
      seen.add(match)
      try {
        const stats = await stat(match)
        if (stats.isFile() && match.endsWith('.zip')) {
          sources.push({ kind: 'zip', path: match })
        } else if (stats.isDirectory()) {
          sources.push({ kind: 'dir', path: match })
        }
      } catch {
        // ignore
      }
    }
  }
  return sources
}

const GLOB_CHARS = /[*?[]/

async function expandGlob(pattern: string): Promise<string[]> {
  const normalized = pattern.replace(/\\/g, '/').trim()
  if (!normalized) return []
  if (!GLOB_CHARS.test(normalized)) {
    const target = path.resolve(process.cwd(), normalized)
    try {
      await stat(target)
      return [target]
    } catch {
      return []
    }
  }
  const { base, matcher } = buildMatcher(normalized)
  const baseAbs = path.resolve(process.cwd(), base)
  const results = new Set<string>()
  await walkForGlob(baseAbs, matcher, results)
  return Array.from(results).sort((a, b) => a.localeCompare(b))
}

function buildMatcher(pattern: string) {
  const firstGlob = pattern.search(GLOB_CHARS)
  const slashIndex = firstGlob === -1 ? pattern.lastIndexOf('/') : pattern.lastIndexOf('/', firstGlob)
  const base = slashIndex === -1 ? '.' : pattern.slice(0, slashIndex)
  const rest = pattern.slice(slashIndex + 1) || '**'
  return {
    base,
    matcher: globToRegExp(rest),
  }
}

function globToRegExp(pattern: string): RegExp {
  let regex = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        const next = pattern[i + 2]
        if (next === '/') {
          regex += '(?:.*/)?'
          i += 2
        } else {
          regex += '.*'
          i += 1
        }
      } else {
        regex += '[^/]*'
      }
      continue
    }
    if (char === '?') {
      regex += '[^/]'
      continue
    }
    if (char === '[') {
      regex += '\\['
      continue
    }
    regex += escapeRegExpChar(char)
  }
  return new RegExp(`^${regex}$`)
}

function escapeRegExpChar(char: string) {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char
}

async function walkForGlob(baseDir: string, matcher: RegExp, bucket: Set<string>, relative = ''): Promise<void> {
  const relPosix = relative.replace(/\\/g, '/')
  if (relPosix && matcher.test(relPosix)) {
    bucket.add(path.join(baseDir, relative))
  }
  const current = relative ? path.join(baseDir, relative) : baseDir
  const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
  await Promise.all(
    entries.map(async (entry) => {
      const childRel = relative ? path.join(relative, entry.name) : entry.name
      const childPosix = childRel.replace(/\\/g, '/')
      const childFull = path.join(baseDir, childRel)
      if (matcher.test(childPosix)) {
        bucket.add(childFull)
      }
      if (entry.isDirectory()) {
        await walkForGlob(baseDir, matcher, bucket, childRel)
      }
    }),
  )
}

async function loadZipArchive(filePath: string): Promise<ArchiveData> {
  const buffer = new Uint8Array(await readFile(filePath))
  let entriesRaw: Record<string, Uint8Array>
  try {
    entriesRaw = unzipSync(buffer)
  } catch (error) {
    throw new Error(`Failed to read ZIP archive ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const entries = new Map<string, Uint8Array>()
  let conversationsJson = ''
  let chatHtml = ''
  Object.entries(entriesRaw).forEach(([name, data]) => {
    const normalized = normalizePath(name)
    const typed = data as Uint8Array
    entries.set(normalized, typed)
    if (normalized.endsWith('conversations.json')) {
      conversationsJson = strFromU8(typed)
    } else if (normalized.endsWith('chat.html')) {
      chatHtml = strFromU8(typed)
    }
  })
  const conversationsFromChat = chatHtml ? extractConversationsFromChat(chatHtml) : null
  const conversations =
    conversationsFromChat && conversationsFromChat.length
      ? conversationsFromChat
      : conversationsJson
        ? safeJsonParse<RawConversation[]>(conversationsJson, [])
        : null
  if (!conversations || !conversations.length) {
    throw new Error(`Archive ${filePath} is missing chat.html and conversations.json`)
  }
  const assetsJson = chatHtml ? extractAssetsJson(chatHtml) : {}
  return { conversations, assetsJson, entries }
}

async function loadDirectoryArchive(dirPath: string): Promise<ArchiveData> {
  const entries = new Map<string, Uint8Array>()
  await walkDirectory(dirPath, dirPath, entries)
  const chatEntry = findEntry(entries, 'chat.html')
  const chatHtml = chatEntry ? Buffer.from(chatEntry).toString('utf-8') : ''
  let conversations: RawConversation[] | null = chatHtml ? extractConversationsFromChat(chatHtml) : null
  if (!conversations?.length) {
    const conversationsEntry = findEntry(entries, 'conversations.json')
    if (!conversationsEntry) {
      throw new Error(`Directory ${dirPath} is missing chat.html and conversations.json`)
    }
    const conversationsJson = Buffer.from(conversationsEntry).toString('utf-8')
    conversations = safeJsonParse<RawConversation[]>(conversationsJson, [])
  }
  const assetsJson = chatHtml ? extractAssetsJson(chatHtml) : {}
  return { conversations, assetsJson, entries }
}

async function walkDirectory(root: string, current: string, entries: Map<string, Uint8Array>) {
  const dirEntries = await readdir(current, { withFileTypes: true })
  await Promise.all(
    dirEntries.map(async (entry) => {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walkDirectory(root, fullPath, entries)
        return
      }
      if (entry.isFile()) {
        const data = await readFile(fullPath)
        const relative = normalizePath(path.relative(root, fullPath))
        entries.set(relative, data)
      }
    }),
  )
}

function findEntry(entries: Map<string, Uint8Array>, filename: string): Uint8Array | null {
  for (const [key, value] of entries.entries()) {
    if (key.endsWith(filename)) return value
  }
  return null
}

async function writeDataset(
  outputDir: string,
  payloads: Map<string, ServerConversationPayload>,
  assetData: Map<string, Uint8Array>,
  extras: ExportExtraData,
) {
  const conversationsDir = path.join(outputDir, 'conversations')
  const assetsDir = path.join(outputDir, 'assets')
  await mkdir(conversationsDir, { recursive: true })
  await mkdir(assetsDir, { recursive: true })
  await clearDirectory(conversationsDir)
  await clearDirectory(assetsDir)

  for (const payload of payloads.values()) {
    if (!isSafeConversationId(payload.conversation.id)) {
      console.warn(`Skipping unsafe conversation id while writing: ${payload.conversation.id}`)
      continue
    }
    const conversationDir = path.join(conversationsDir, payload.conversation.id)
    await mkdir(conversationDir, { recursive: true })
    await writeJson(path.join(conversationDir, 'conversation.json'), payload.conversation)
  }

  const summaries = Array.from(payloads.values()).map((item) => item.summary)
  await writeJson(path.join(outputDir, 'conversations.json'), summaries)
  await writeJson(path.join(outputDir, 'search_index.json'), buildSearchBundle(payloads.values()))

  for (const [assetKey, data] of assetData.entries()) {
    if (!isSafeRelativePath(assetKey)) {
      console.warn(`Skipping unsafe asset key while writing: ${assetKey}`)
      continue
    }
    const assetPath = safeJoinUnder(assetsDir, assetKey)
    if (!assetPath) {
      console.warn(`Skipping path outside assets dir: ${assetKey}`)
      continue
    }
    await mkdir(path.dirname(assetPath), { recursive: true })
    await writeFile(assetPath, Buffer.from(data))
  }

  await writeExtraFiles(outputDir, extras)
}

function buildCloneTracker(ids: Iterable<string>): Map<string, number> {
  const tracker = new Map<string, number>()
  for (const id of ids) {
    const { base, suffix } = splitCloneId(id)
    const current = tracker.get(base) ?? 0
    if (suffix > current) {
      tracker.set(base, suffix)
    }
  }
  return tracker
}

function ensureClonePayloadId(
  payload: ServerConversationPayload,
  merged: Map<string, ServerConversationPayload>,
  tracker: Map<string, number>,
): ServerConversationPayload {
  const originalId = payload.conversation.id
  const { base, suffix } = splitCloneId(originalId)
  if (!merged.has(originalId)) {
    const current = tracker.get(base) ?? 0
    if (suffix > current) {
      tracker.set(base, suffix)
    }
    return payload
  }
  let nextSuffix = Math.max(tracker.get(base) ?? suffix, suffix) + 1
  let candidate = `${base}_v${nextSuffix}`
  while (merged.has(candidate)) {
    nextSuffix += 1
    candidate = `${base}_v${nextSuffix}`
  }
  tracker.set(base, nextSuffix)
  return clonePayloadWithId(payload, candidate)
}

function splitCloneId(id: string): { base: string; suffix: number } {
  const match = id.match(/^(.*)_v(\d+)$/)
  if (match) {
    return { base: match[1], suffix: Number(match[2]) }
  }
  return { base: id, suffix: 1 }
}

function clonePayloadWithId(payload: ServerConversationPayload, newId: string): ServerConversationPayload {
  const conversation: Conversation = { ...payload.conversation, id: newId }
  const summary: ConversationSummary = { ...payload.summary, id: newId }
  const searchLines = payload.searchLines.map((line) => ({
    ...line,
    loc: { ...line.loc, conversationId: newId },
  }))
  return {
    ...payload,
    conversation,
    summary,
    searchLines,
  }
}

async function loadExistingDataset(outputDir: string) {
  const payloads = new Map<string, ServerConversationPayload>()
  const assets = new Map<string, Uint8Array>()
  const extras: ExportExtraData = {}
  const conversationsPath = path.join(outputDir, 'conversations.json')
  let summaries: ConversationSummary[] | undefined
  try {
    const raw = await readFile(conversationsPath, 'utf-8')
    summaries = JSON.parse(raw) as ConversationSummary[]
  } catch {
    return { payloads, assets, extras }
  }
  const searchBundle = await readJsonFile<SearchBundle>(path.join(outputDir, 'search_index.json'))
  const linesByConversation = searchBundle?.linesByConversation ?? {}
  const gramsByConversation = buildGramMembership(searchBundle?.grams ?? {})
  for (const summary of summaries) {
    const conversationPath = path.join(outputDir, 'conversations', summary.id, 'conversation.json')
    const conversation = await readJsonFile<Conversation>(conversationPath)
    if (!conversation) continue
    const assetKeys = Array.from(new Set(Object.values(conversation.assetsMap ?? {}))).filter(
      (key): key is string => typeof key === 'string' && key.length > 0,
    )
    payloads.set(summary.id, {
      summary,
      conversation,
      searchLines: linesByConversation[summary.id] ?? [],
      grams: gramsByConversation.get(summary.id) ?? [],
      assetKeys,
      mappingNodeCount: summary.mapping_node_count ?? 0,
      importOrder: 0,
    })
  }
  for (const [key, fileName] of EXTRA_FILE_ENTRIES) {
    const value = await readJsonFile(path.join(outputDir, fileName))
    if (value !== undefined) {
      setExtraValue(extras, key, value)
    }
  }
  const assetFiles = await collectExistingAssets(path.join(outputDir, 'assets'))
  assetFiles.forEach((value, key) => assets.set(key, value))
  return { payloads, assets, extras }
}

function mergeExtras(target: ExportExtraData, incoming: ExportExtraData) {
  if (incoming.user) target.user = incoming.user
  if (incoming.messageFeedback) target.messageFeedback = incoming.messageFeedback
  if (incoming.groupChats) target.groupChats = incoming.groupChats
  if (incoming.shopping) target.shopping = incoming.shopping
  if (incoming.basisPoints) target.basisPoints = incoming.basisPoints
  if (incoming.sora) target.sora = incoming.sora
  if (incoming.generatedAssets) target.generatedAssets = incoming.generatedAssets
}

function mergeGeneratedAssets(store: Map<string, GeneratedAsset>, incoming: GeneratedAsset[]) {
  incoming.forEach((asset) => {
    const existing = store.get(asset.path)
    if (existing) {
      existing.pointers = mergePointerLists(existing.pointers, asset.pointers)
      if (existing.size == null && asset.size != null) existing.size = asset.size
      if (!existing.mime && asset.mime) existing.mime = asset.mime
    } else {
      store.set(asset.path, { ...asset })
    }
  })
}

function mergePointerLists(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) return undefined
  const set = new Set<string>()
  a?.forEach((item) => set.add(item))
  b?.forEach((item) => set.add(item))
  return Array.from(set)
}

function ensureGeneratedAssetData(
  assetsList: GeneratedAsset[],
  entries: Map<string, Uint8Array>,
  assetData: Map<string, Uint8Array>,
) {
  assetsList.forEach((asset) => {
    if (!asset.path || assetData.has(asset.path)) return
    const data = findAssetEntry(entries, asset.path)
    if (!data) {
      console.warn(`Missing generated asset payload for ${asset.path}`)
      return
    }
    assetData.set(asset.path, data)
  })
}

async function writeExtraFiles(outputDir: string, extras: ExportExtraData) {
  await Promise.all(
    EXTRA_FILE_ENTRIES.map(async ([key, fileName]) => {
      const value = extras[key]
      const target = path.join(outputDir, fileName)
      if (value !== undefined) {
        await writeJson(target, value)
      } else {
        await rm(target, { force: true })
      }
    }),
  )
}

async function readJsonFile<T>(target: string): Promise<T | undefined> {
  try {
    const raw = await readFile(target, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function buildGramMembership(grams: SearchBundle['grams'] = {}) {
  const membership = new Map<string, Set<string>>()
  Object.entries(grams).forEach(([gram, ids]) => {
    ids.forEach((id) => {
      if (!membership.has(id)) {
        membership.set(id, new Set())
      }
      membership.get(id)!.add(gram)
    })
  })
  const resolved = new Map<string, string[]>()
  membership.forEach((set, id) => {
    resolved.set(id, Array.from(set))
  })
  return resolved
}

async function collectExistingAssets(rootDir: string): Promise<Map<string, Uint8Array>> {
  const assets = new Map<string, Uint8Array>()
  async function walk(currentDir: string, relative: string) {
    let entries
    try {
      entries = await readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const nextPath = path.join(currentDir, entry.name)
      const relPath = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(nextPath, relPath)
      } else if (entry.isFile()) {
        const buffer = await readFile(nextPath)
        assets.set(relPath, new Uint8Array(buffer))
      }
    }
  }
  await walk(rootDir, '')
  return assets
}

async function clearDirectory(target: string) {
  const entries = await readdir(target, { withFileTypes: true }).catch(() => [])
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === '.gitkeep') return
      const fullPath = path.join(target, entry.name)
      if (entry.isDirectory()) {
        await rm(fullPath, { recursive: true, force: true })
      } else {
        await rm(fullPath, { force: true })
      }
    }),
  )
}

async function writeJson(target: string, data: unknown) {
  await writeFile(target, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

function isSafeConversationId(id: string): boolean {
  return Boolean(id) && !id.includes('/') && !id.includes('\\') && !id.includes('\0') && !id.includes('..')
}

function safeJoinUnder(rootDir: string, relativePath: string): string | null {
  const target = path.resolve(rootDir, relativePath)
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`
  if (target === rootDir || target.startsWith(rootWithSep)) {
    return target
  }
  return null
}

function setExtraValue<K extends keyof ExportExtraData>(
  target: ExportExtraData,
  key: K,
  value: ExportExtraData[K],
): void {
  target[key] = value
}

function buildSearchBundle(payloads: Iterable<ServerConversationPayload>): SearchBundle {
  const linesByConversation: Record<string, SearchLine[]> = {}
  const summaryMap: SearchBundle['summaryMap'] = {}
  const gramIndex = new Map<string, Set<string>>()
  for (const payload of payloads) {
    const id = payload.conversation.id
    linesByConversation[id] = payload.searchLines
    summaryMap[id] = { title: payload.summary.title, last_message_time: payload.summary.last_message_time }
    payload.grams.forEach((gram) => {
      if (!gramIndex.has(gram)) {
        gramIndex.set(gram, new Set())
      }
      gramIndex.get(gram)!.add(id)
    })
  }
  const grams: Record<string, string[]> = {}
  gramIndex.forEach((ids, gram) => {
    grams[gram] = Array.from(ids)
  })
  return { grams, linesByConversation, summaryMap }
}
