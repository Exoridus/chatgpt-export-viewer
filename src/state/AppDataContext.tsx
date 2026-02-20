import type { IDBPDatabase } from 'idb'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import {
  deleteConversation,
  estimateDatabaseSize,
  GENERATED_ASSET_OWNER_ID,
  getAssetUrl,
  getLocalConversation,
  loadExtraData,
  loadLocalSummaries,
  loadSearchBundleFromDb,
  openViewerDatabase,
  purgeDatabase,
  saveAsset,
  saveConversationRecord,
  saveExtraData,
  saveSearchData,
  setConversationPinned,
  type ViewerDB,
} from '../lib/db'
import { triggerDownload } from '../lib/download'
import type { ImportConversationPayload } from '../lib/importer'
import { localSettings } from '../lib/localStorage'
import { mergeSummaries, shouldUseLocal } from '../lib/merge'
import { fetchServerConversation, fetchServerGeneratedAssets, fetchServerIndex, fetchServerSearchBundle } from '../lib/serverData'
import type { Conversation, ConversationSummary, ExportExtraData, GeneratedAsset } from '../types'
import type { SearchBundle } from '../types/search'

export type LoadState = 'loading' | 'ready' | 'error'

export type NoticeTone = 'info' | 'success' | 'warning' | 'error'

export interface NoticeOptions {
  persistent?: boolean
}

export interface NoticeMessage {
  id: number
  message: string
  tone: NoticeTone
  persistent?: boolean
}

export type ImportMode = 'upsert' | 'replace' | 'clone'

export interface AppDataContextValue {
  status: LoadState
  error?: string | null
  notice?: NoticeMessage | null
  serverIndex: ConversationSummary[]
  localIndex: ConversationSummary[]
  mergedIndex: ConversationSummary[]
  cacheEnabled: boolean
  storageAvailable: boolean
  importing: boolean
  importProgress: ImportProgressState
  dbSizeBytes: number | null
  refreshDbSize: () => Promise<number | null>
  importZips: (files: File[], mode?: ImportMode) => Promise<number>
  resetImportProgress: () => void
  toggleCache: (enabled: boolean) => Promise<void>
  getConversation: (id: string) => Promise<Conversation | null>
  getAssetBlobUrl: (key: string) => Promise<string | null>
  pinConversation: (id: string, pin: boolean) => Promise<void>
  cleanupLocal: () => Promise<number>
  purgeAll: () => Promise<void>
  exportLocalBundle: () => Promise<void>
  ensureSearchBundle: () => Promise<SearchBundle | null>
  clearNotice: () => void
  pushNotice: (message: string, tone?: NoticeTone, options?: NoticeOptions) => void
  extraData: ExportExtraData
  generatedAssets: GeneratedAsset[]
}

export interface ImportProgressState {
  phase: 'idle' | 'processing' | 'saving' | 'complete' | 'error'
  message: string
  total?: number
  processed?: number
  resultCount?: number
  assetsTotal?: number
  assetsProcessed?: number
  currentAssetsTotal?: number
  currentAssetsProcessed?: number
  currentArchiveName?: string
  currentArchiveIndex?: number
  currentArchiveTotal?: number
}

function isNewerSummary(incoming: ConversationSummary, existing?: ConversationSummary | null): boolean {
  if (!existing) {return true}
  if (incoming.last_message_time > existing.last_message_time) {return true}
  if (
    incoming.last_message_time === existing.last_message_time &&
    (incoming.mapping_node_count ?? 0) > (existing.mapping_node_count ?? 0)
  ) {
    return true
  }
  return false
}

function buildCloneTracker(ids: Iterable<string>): Map<string, number> {
  const tracker = new Map<string, number>()
  for (const id of ids) {
    const { base, suffix } = splitCloneIdentifier(id)
    const current = tracker.get(base) ?? 0
    if (suffix > current) {
      tracker.set(base, suffix)
    }
  }
  return tracker
}

function ensureClonePayloadIdForLocal(
  payload: ImportConversationPayload,
  usedIds: Set<string>,
  tracker: Map<string, number>,
): ImportConversationPayload {
  const originalId = payload.conversation.id
  const { base, suffix } = splitCloneIdentifier(originalId)
  if (!usedIds.has(originalId)) {
    usedIds.add(originalId)
    const current = tracker.get(base) ?? 0
    if (suffix > current) {
      tracker.set(base, suffix)
    }
    return payload
  }
  let nextSuffix = Math.max(tracker.get(base) ?? suffix, suffix) + 1
  let candidate = `${base}_v${nextSuffix}`
  while (usedIds.has(candidate)) {
    nextSuffix += 1
    candidate = `${base}_v${nextSuffix}`
  }
  tracker.set(base, nextSuffix)
  usedIds.add(candidate)
  return cloneImportPayloadWithId(payload, candidate)
}

function splitCloneIdentifier(id: string): { base: string; suffix: number } {
  const match = id.match(/^(.*)_v(\d+)$/)
  if (match) {
    return { base: match[1], suffix: Number(match[2]) }
  }
  return { base: id, suffix: 1 }
}

function cloneImportPayloadWithId(
  payload: ImportConversationPayload,
  nextId: string,
): ImportConversationPayload {
  return {
    ...payload,
    summary: { ...payload.summary, id: nextId },
    conversation: { ...payload.conversation, id: nextId },
    searchLines: payload.searchLines.map((line) => ({
      ...line,
      loc: { ...line.loc, conversationId: nextId },
    })),
  }
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined)

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext)
  if (!ctx) {throw new Error('AppDataContext missing')}
  return ctx
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeMessage | null>(null)
  const [serverIndex, setServerIndex] = useState<ConversationSummary[]>([])
  const [localIndex, setLocalIndex] = useState<ConversationSummary[]>([])
  const [mergedIndex, setMergedIndex] = useState<ConversationSummary[]>([])
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgressState>({
    phase: 'idle',
    message: 'Select ChatGPT data export ZIP files.',
  })
  const [cacheEnabled, setCacheEnabledState] = useState(localSettings.isCacheEnabled())
  const [dbAllowed, setDbAllowed] = useState(localSettings.hasImportsAvailable() || localSettings.isCacheEnabled())
  const [dbSizeBytes, setDbSizeBytes] = useState<number | null>(null)
  const [searchBundle, setSearchBundle] = useState<SearchBundle | null>(null)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [pinnedIds, setPinnedIds] = useState<string[]>(localSettings.getPinnedConversationIds())
  const [extraData, setExtraData] = useState<ExportExtraData>(() => ({}))
  const [serverGeneratedAssets, setServerGeneratedAssets] = useState<GeneratedAsset[]>([])
  const dbRef = useRef<IDBPDatabase<ViewerDB> | null>(null)
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])

  const showNotice = useCallback(
    (message: string, tone: NoticeTone = 'info', options?: NoticeOptions) => {
      setNotice({
        id: Date.now(),
        message,
        tone,
        persistent: options?.persistent ?? tone === 'error',
      })
    },
    [],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {return}
    try {
      const testKey = '__viewer_storage_test__'
      window.localStorage.setItem(testKey, '1')
      window.localStorage.removeItem(testKey)
    } catch (error) {
      console.error('Local storage unavailable', error)
      setStorageAvailable(false)
      showNotice('Browser storage is disabled — enable it to import and cache conversations.', 'error', {
        persistent: true,
      })
    }
  }, [showNotice])

  const ensureDb = useCallback(async (): Promise<IDBPDatabase<ViewerDB>> => {
    if (!storageAvailable) {
      throw new Error('storage-unavailable')
    }
    if (dbRef.current) {return dbRef.current}
    try {
      const db = await openViewerDatabase()
      dbRef.current = db
      return db
    } catch (error) {
      console.error('IndexedDB unavailable', error)
      setStorageAvailable(false)
      showNotice('Browser blocked IndexedDB — enable storage permissions to import conversations.', 'error', {
        persistent: true,
      })
      throw error
    }
  }, [showNotice, storageAvailable])

  useEffect(() => {
    let cancelled = false
    async function loadServerIndex() {
      try {
        const list = await fetchServerIndex()
        if (!cancelled) {
          setServerIndex(list)
          setStatus('ready')
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError('Unable to load conversations index')
          setStatus('error')
        }
      }
    }
    loadServerIndex()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!dbAllowed) {return}
    let cancelled = false
    async function loadLocal() {
      try {
        const db = await ensureDb()
        if (cancelled) {return}
        const list = await loadLocalSummaries(db)
        if (!cancelled) {
          setLocalIndex(list)
        }
      } catch (err) {
        console.error('Failed to load local data', err)
      }
    }
    loadLocal()
    return () => {
      cancelled = true
    }
  }, [dbAllowed, ensureDb])

  useEffect(() => {
    setMergedIndex(mergeSummaries(serverIndex, localIndex, pinnedSet))
  }, [serverIndex, localIndex, pinnedSet])

  useEffect(() => {
    const dbPinned = localIndex.filter((entry) => entry.pinned).map((entry) => entry.id)
    if (!dbPinned.length) {return}
    setPinnedIds((prev) => {
      const next = new Set(prev)
      let changed = false
      dbPinned.forEach((id) => {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      })
      if (!changed) {return prev}
      const normalized = Array.from(next)
      localSettings.setPinnedConversationIds(normalized)
      return normalized
    })
  }, [localIndex])

  const updateLocalIndex = useCallback(
    async (db: IDBPDatabase<ViewerDB>) => {
      const locals = await loadLocalSummaries(db)
      setLocalIndex(locals)
      setSearchBundle(null)
    },
    [],
  )

  const importZips = useCallback(
    async (files: File[], mode: ImportMode = 'upsert'): Promise<number> => {
      if (!files.length) {return 0}
      const zipFiles = files.filter((file) => file.name.toLowerCase().endsWith('.zip'))
      if (!zipFiles.length) {
        showNotice('Please select ZIP exports generated by ChatGPT.', 'warning')
        setImportProgress({
          phase: 'error',
          message: 'Only .zip exports are supported.',
        })
        return 0
      }
      if (!storageAvailable) {
        const message = 'Browser storage is disabled. Enable IndexedDB and local storage access to import conversations.'
        showNotice(message, 'error', { persistent: true })
        setImportProgress({
          phase: 'error',
          message,
        })
        return 0
      }
      setImporting(true)
      setImportProgress({
        phase: 'processing',
        message: 'Uploading selected archives…',
        currentArchiveIndex: 0,
        currentArchiveTotal: zipFiles.length,
      })
      try {
        const db = await ensureDb()
        if (mode === 'replace') {
          await purgeDatabase(db)
          setLocalIndex([])
          setMergedIndex(mergeSummaries(serverIndex, [], new Set()))
          setSearchBundle(null)
          setExtraData({})
          setPinnedIds([])
          localSettings.setPinnedConversationIds([])
        }
        const { parseExportZipsInWorker } = await import('../lib/importWorkerClient')
        const bundle = await parseExportZipsInWorker(zipFiles, {
          onProgress(progress) {
            if (progress.phase === 'archive-start') {
              setImportProgress({
                phase: 'processing',
                message: 'Reading archive metadata',
                currentArchiveName: progress.archiveName,
                currentArchiveIndex: progress.archiveIndex,
                currentArchiveTotal: progress.archivesTotal,
              })
              return
            }
            if (progress.phase === 'archive-conversations') {
              setImportProgress({
                phase: 'processing',
                message: `Parsing conversations ${progress.conversationsProcessed}/${progress.conversationsTotal} from ${progress.archiveName}`,
                currentArchiveName: progress.archiveName,
                currentArchiveIndex: progress.archiveIndex,
                currentArchiveTotal: progress.archivesTotal,
              })
              return
            }
            if (progress.phase === 'archive-assets') {
              setImportProgress({
                phase: 'processing',
                message: `Collecting assets from ${progress.archiveName} (${progress.assetsProcessed})`,
                currentArchiveName: progress.archiveName,
                currentArchiveIndex: progress.archiveIndex,
                currentArchiveTotal: progress.archivesTotal,
              })
              return
            }
            setImportProgress({
              phase: 'processing',
              message: `Processed archive ${progress.archiveIndex}/${progress.archivesTotal}: ${progress.archiveName}`,
              currentArchiveName: progress.archiveName,
              currentArchiveIndex: progress.archiveIndex,
              currentArchiveTotal: progress.archivesTotal,
            })
          },
        })
        await saveExtraData(db, bundle.extras)
        setExtraData(bundle.extras)
        if (!bundle.conversations.length) {
          showNotice('No conversations found in the archive', 'warning')
          setImportProgress({
            phase: 'error',
            message: 'No conversations were detected in the selected files.',
          })
          return 0
        }
        const baselineLocalIndex = mode === 'replace' ? [] : localIndex
        const existingLocalMap = new Map(baselineLocalIndex.map((entry) => [entry.id, entry]))
        const usedConversationIds = new Set<string>([
          ...serverIndex.map((entry) => entry.id),
          ...baselineLocalIndex.map((entry) => entry.id),
        ])
        const cloneTracker = mode === 'clone' ? buildCloneTracker(usedConversationIds) : null
        const conversationsToProcess =
          mode === 'clone'
            ? bundle.conversations.map((payload) =>
                ensureClonePayloadIdForLocal(payload, usedConversationIds, cloneTracker!),
              )
            : bundle.conversations.filter((payload) =>
                isNewerSummary(payload.summary, existingLocalMap.get(payload.summary.id)),
              )
        if (!conversationsToProcess.length) {
          const upToDateMessage = 'No new or updated conversations to process — everything is up to date.'
          showNotice(upToDateMessage, 'info')
          setImportProgress({
            phase: 'complete',
            message: upToDateMessage,
            total: 0,
            processed: 0,
            resultCount: 0,
            assetsTotal: 0,
            assetsProcessed: 0,
            currentAssetsTotal: 0,
            currentAssetsProcessed: 0,
            currentArchiveName: undefined,
            currentArchiveIndex: undefined,
            currentArchiveTotal: undefined,
          })
          return 0
        }
        const uniqueAssetKeys = new Set<string>()
        for (const payload of conversationsToProcess) {
          for (const assetKey of payload.assetKeys) {
            if (bundle.assets.has(assetKey)) {
              uniqueAssetKeys.add(assetKey)
            }
          }
        }
        const conversationTotal = conversationsToProcess.length
        const assetTotal = uniqueAssetKeys.size
        const buildConversationLabel = (completed: number) => {
          if (!conversationTotal) {return 'Processing conversations…'}
          if (completed >= conversationTotal) {
            return `Processed ${completed}/${conversationTotal} conversations`
          }
          const currentIndex = Math.min(completed + 1, conversationTotal)
          return `Processing conversation ${currentIndex}/${conversationTotal}`
        }
        setImportProgress({
          phase: 'saving',
          message: buildConversationLabel(0),
          total: conversationTotal,
          processed: 0,
          assetsTotal: assetTotal,
          assetsProcessed: 0,
          currentAssetsTotal: conversationsToProcess[0]?.assetKeys.length ?? 0,
          currentAssetsProcessed: 0,
          currentArchiveName: undefined,
          currentArchiveIndex: undefined,
          currentArchiveTotal: undefined,
        })
        let processed = 0
        let savedAssets = 0
        const processedAssetKeys = new Set<string>()
        for (const payload of conversationsToProcess) {
          const conversationAssetsTotal = payload.assetKeys.length
          let conversationAssetsSaved = 0
          setImportProgress((prev) => ({
            ...prev,
            message: buildConversationLabel(processed),
            currentAssetsTotal: conversationAssetsTotal,
            currentAssetsProcessed: 0,
          }))
          await saveConversationRecord(db, payload.summary, payload.conversation, payload.assetKeys)
          await saveSearchData(db, payload.conversation.id, payload.searchLines, payload.grams)
          for (const assetKey of payload.assetKeys) {
            const blob = bundle.assets.get(assetKey)
            if (blob) {
              await saveAsset(db, assetKey, blob, payload.conversation.id, bundle.assetMime.get(assetKey))
              if (!processedAssetKeys.has(assetKey)) {
                processedAssetKeys.add(assetKey)
                savedAssets += 1
              }
              conversationAssetsSaved += 1
              setImportProgress((prev) => ({
                ...prev,
                assetsProcessed: savedAssets,
                currentAssetsTotal: conversationAssetsTotal,
                currentAssetsProcessed: conversationAssetsSaved,
              }))
            }
          }
          processed += 1
          setImportProgress((prev) => ({
            ...prev,
            processed,
            assetsProcessed: savedAssets,
            message: buildConversationLabel(processed),
            currentAssetsTotal: 0,
            currentAssetsProcessed: 0,
          }))
        }
        if (bundle.extras.generatedAssets?.length) {
          for (const asset of bundle.extras.generatedAssets) {
            const blob = bundle.assets.get(asset.path)
            if (!blob) {continue}
            await saveAsset(db, asset.path, blob, GENERATED_ASSET_OWNER_ID, bundle.assetMime.get(asset.path))
          }
        }
        localSettings.setImportsAvailable()
        setDbAllowed(true)
        await updateLocalIndex(db)
        const assetNotice =
          savedAssets > 0 ? ` and stored ${savedAssets} asset${savedAssets === 1 ? '' : 's'}` : ''
        const successMessage = `Processed ${conversationTotal} conversation${conversationTotal === 1 ? '' : 's'}${assetNotice}.`
        showNotice(successMessage, 'success')
        setImportProgress({
          phase: 'complete',
          message: successMessage,
          total: conversationTotal,
          processed: conversationTotal,
          resultCount: conversationTotal,
          assetsTotal: assetTotal,
          assetsProcessed: savedAssets,
          currentAssetsTotal: 0,
          currentAssetsProcessed: 0,
          currentArchiveName: undefined,
          currentArchiveIndex: undefined,
          currentArchiveTotal: undefined,
        })
        return conversationTotal
      } catch (err) {
        console.error('Import failed', err)
        setError('Import failed — please verify the ZIP file came from ChatGPT data export.')
        setImportProgress({
          phase: 'error',
          message: 'Import failed — please verify the ZIP file came from ChatGPT data export.',
        })
        return 0
      } finally {
        setImporting(false)
      }
    },
    [ensureDb, localIndex, serverIndex, showNotice, storageAvailable, updateLocalIndex],
  )

  const resetImportProgress = useCallback(() => {
    setImportProgress({ phase: 'idle', message: 'Select ChatGPT data export ZIP files.' })
  }, [])

  const toggleCache = useCallback(
    async (enabled: boolean) => {
      localSettings.setCacheEnabled(enabled)
      setCacheEnabledState(enabled)
      if (enabled) {
        setDbAllowed(true)
        await ensureDb()
      }
    },
    [ensureDb],
  )

  const getConversation = useCallback(
    async (id: string): Promise<Conversation | null> => {
      const serverEntry = serverIndex.find((item) => item.id === id)
      const localEntry = localIndex.find((item) => item.id === id)
      if (shouldUseLocal(serverEntry, localEntry)) {
        if (!dbAllowed) {return null}
        const db = await ensureDb()
        const convo = await getLocalConversation(db, id)
        if (convo) {return convo}
        return serverEntry ? fetchServerConversation(id) : null
      }
      const serverConversation = await fetchServerConversation(id)
      if (serverConversation) {return serverConversation}
      if (dbAllowed) {
        const db = await ensureDb()
        return getLocalConversation(db, id)
      }
      return null
    },
    [dbAllowed, ensureDb, localIndex, serverIndex],
  )

  const getAssetBlobUrl = useCallback(
    async (key: string) => {
      if (!dbAllowed) {return null}
      const db = await ensureDb()
      return getAssetUrl(db, key)
    },
    [dbAllowed, ensureDb],
  )

  const pinConversation = useCallback(
    async (id: string, pin: boolean) => {
      setPinnedIds((prev) => {
        const next = new Set(prev)
        if (pin) {
          next.add(id)
        } else {
          next.delete(id)
        }
        const normalized = Array.from(next)
        localSettings.setPinnedConversationIds(normalized)
        return normalized
      })
      if (!dbAllowed) {return}
      try {
        const db = dbRef.current ?? (await ensureDb())
        await setConversationPinned(db, id, pin)
        setLocalIndex((prev) => prev.map((entry) => (entry.id === id ? { ...entry, pinned: pin } : entry)))
      } catch (error) {
        console.warn('Failed to persist pin preference', error)
      }
    },
    [dbAllowed, ensureDb],
  )

  const cleanupLocal = useCallback(async () => {
    if (!dbAllowed) {return 0}
    const db = await ensureDb()
    const serverMap = new Map(serverIndex.map((entry) => [entry.id, entry]))
    let removed = 0
    for (const local of localIndex) {
      const serverEntry = serverMap.get(local.id)
      if (serverEntry && serverEntry.last_message_time >= local.last_message_time) {
        await deleteConversation(db, local.id)
        removed += 1
      }
    }
    if (removed) {
      await updateLocalIndex(db)
      showNotice(
        `Removed ${removed} cached conversation${removed === 1 ? '' : 's'} that already exist on the server.`,
        'success',
      )
    } else {
      showNotice('Local cache already matches server data.', 'info')
    }
    return removed
  }, [dbAllowed, ensureDb, localIndex, serverIndex, showNotice, updateLocalIndex])

  const purgeAll = useCallback(async () => {
    if (!dbAllowed || !dbRef.current) {return}
    await purgeDatabase(dbRef.current)
    setLocalIndex([])
    setMergedIndex(mergeSummaries(serverIndex, [], pinnedSet))
    setSearchBundle(null)
    localSettings.clearAll()
    setPinnedIds([])
    setCacheEnabledState(false)
    setDbAllowed(false)
     setExtraData({})
    showNotice('All local data was purged.', 'success')
    if (typeof window !== 'undefined') {
      const { origin, pathname, search } = window.location
      window.location.replace(`${origin}${pathname}${search}#/`)
    }
  }, [dbAllowed, pinnedSet, serverIndex, showNotice])

  const exportLocalBundle = useCallback(async () => {
    if (!dbAllowed || !dbRef.current) {
      showNotice('Nothing to export yet — import data first.', 'warning')
      return
    }
    const { exportServerCompatibleZip } = await import('../lib/exporter')
    const blob = await exportServerCompatibleZip(dbRef.current)
    triggerDownload(blob, 'chatgpt-data-export.zip')
  }, [dbAllowed, showNotice])

  const refreshDbSize = useCallback(async () => {
    if (!dbAllowed || !storageAvailable) {
      setDbSizeBytes(null)
      return null
    }
    const db = dbRef.current ?? (await ensureDb())
    const size = await estimateDatabaseSize(db)
    setDbSizeBytes(size)
    return size
  }, [dbAllowed, ensureDb, storageAvailable])

  const ensureSearchBundle = useCallback(async () => {
    if (searchBundle) {return searchBundle}
    if (dbAllowed) {
      const db = dbRef.current ?? (await ensureDb())
      const summaryMap = Object.fromEntries(
        mergedIndex.map((item) => [item.id, { title: item.title, last_message_time: item.last_message_time }]),
      )
      const bundle = await loadSearchBundleFromDb(db, summaryMap)
      if (Object.keys(bundle.linesByConversation).length) {
        setSearchBundle(bundle)
        return bundle
      }
    }
    const serverBundle = await fetchServerSearchBundle()
    if (serverBundle) {
      setSearchBundle(serverBundle)
      return serverBundle
    }
    return null
  }, [dbAllowed, ensureDb, mergedIndex, searchBundle])

  const generatedAssets =
    extraData.generatedAssets && extraData.generatedAssets.length ? extraData.generatedAssets : serverGeneratedAssets

  useEffect(() => {
    if (!dbAllowed) {return}
    let cancelled = false
    async function loadExtrasFromDb() {
      try {
        const db = await ensureDb()
        if (cancelled) {return}
        const extras = await loadExtraData(db)
        if (!cancelled) {
          setExtraData(extras)
        }
      } catch (error) {
        console.warn('Failed to load extra data', error)
      }
    }
    loadExtrasFromDb()
    return () => {
      cancelled = true
    }
  }, [dbAllowed, ensureDb])

  useEffect(() => {
    let cancelled = false
    async function loadServerGenerated() {
      const generated = await fetchServerGeneratedAssets()
      if (!cancelled) {
        setServerGeneratedAssets(generated)
      }
    }
    loadServerGenerated()
    return () => {
      cancelled = true
    }
  }, [])

  const value: AppDataContextValue = useMemo(
    () => ({
      status,
      error,
      notice,
      serverIndex,
      localIndex,
      mergedIndex,
      cacheEnabled,
      storageAvailable,
      importing,
      importProgress,
      dbSizeBytes,
      refreshDbSize,
      importZips,
      resetImportProgress,
      toggleCache,
      getConversation,
      getAssetBlobUrl,
      pinConversation,
      cleanupLocal,
      purgeAll,
      exportLocalBundle,
      ensureSearchBundle,
      clearNotice: () => setNotice(null),
      pushNotice: (message: string, tone: NoticeTone = 'info', options?: NoticeOptions) =>
        showNotice(message, tone, options),
      extraData,
      generatedAssets,
    }),
    [
      cacheEnabled,
      storageAvailable,
      cleanupLocal,
      dbSizeBytes,
      error,
      exportLocalBundle,
      getAssetBlobUrl,
      getConversation,
      importProgress,
      importZips,
      importing,
      localIndex,
      mergedIndex,
      notice,
      refreshDbSize,
      resetImportProgress,
      serverIndex,
      status,
      toggleCache,
      pinConversation,
      purgeAll,
      ensureSearchBundle,
      showNotice,
      extraData,
      generatedAssets,
    ],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}
