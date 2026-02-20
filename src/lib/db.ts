import { type DBSchema, type IDBPDatabase, type IDBPTransaction, openDB, type StoreNames } from 'idb'

import type { Conversation, ConversationSummary, ExportExtraData } from '../types'
import type { SearchLine } from '../types/search'

export interface ConversationRecord {
  id: string
  conversationSlim: Conversation
  last_message_time: number
  saved_at: number
  assetKeys?: string[]
}

interface AssetRecord {
  key: string
  blob: Blob
  mime?: string
  size: number
}

interface LegacyAssetRecord extends AssetRecord {
  owners?: string[]
}

interface AssetOwnerRecord {
  id: string
  assetKey: string
  ownerId: string
}

interface UserMetaRecord {
  id: string
  pinned?: boolean
}

interface SearchLinesRecord {
  conversationId: string
  lines: SearchLine[]
}

interface SearchIndexRecord {
  gram: string
  ids: string[]
}

interface SearchMembershipRecord {
  conversationId: string
  grams: string[]
}

interface MetadataRecord {
  key: string
  value: unknown
}

interface ViewerDB extends DBSchema {
  index: {
    key: string
    value: ConversationSummary
  }
  conversations: {
    key: string
    value: ConversationRecord
  }
  assets: {
    key: string
    value: AssetRecord
  }
  assetOwners: {
    key: string
    value: AssetOwnerRecord
    indexes: { byAsset: string; byOwner: string }
  }
  userMeta: {
    key: string
    value: UserMetaRecord
  }
  searchLines: {
    key: string
    value: SearchLinesRecord
  }
  searchIndex: {
    key: string
    value: SearchIndexRecord
  }
  searchMembership: {
    key: string
    value: SearchMembershipRecord
  }
  metadata: {
    key: string
    value: MetadataRecord
  }
}

export type { ViewerDB }

export const GENERATED_ASSET_OWNER_ID = '__generated_gallery__'
const DB_NAME = 'chatgpt-data-export-viewer'
const DB_VERSION = 5

let dbPromise: Promise<IDBPDatabase<ViewerDB>> | null = null

export async function openViewerDatabase(): Promise<IDBPDatabase<ViewerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ViewerDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('index', { keyPath: 'id' })
          db.createObjectStore('conversations', { keyPath: 'id' })
          db.createObjectStore('assets', { keyPath: 'key' })
          db.createObjectStore('userMeta', { keyPath: 'id' })
        }
        if (oldVersion < 2) {
          db.createObjectStore('searchLines', { keyPath: 'conversationId' })
          db.createObjectStore('searchIndex', { keyPath: 'gram' })
        }
        if (oldVersion < 3) {
          db.createObjectStore('searchMembership', { keyPath: 'conversationId' })
        }
        if (oldVersion < 4) {
          db.createObjectStore('metadata', { keyPath: 'key' })
        }
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('assetOwners')) {
            const ownerStore = db.createObjectStore('assetOwners', { keyPath: 'id' })
            ownerStore.createIndex('byAsset', 'assetKey', { unique: false })
            ownerStore.createIndex('byOwner', 'ownerId', { unique: false })
          }
          await migrateLegacyAssetOwners(transaction)
        }
      },
    })
  }
  return dbPromise
}

export async function closeViewerDatabase(): Promise<void> {
  if (!dbPromise) {return}
  const db = await dbPromise
  db.close()
  dbPromise = null
}

export async function loadLocalSummaries(db: IDBPDatabase<ViewerDB>): Promise<ConversationSummary[]> {
  const [summaries, meta] = await Promise.all([
    db.getAll('index'),
    db.getAll('userMeta'),
  ])
  const metaMap = new Map(meta.map((item) => [item.id, item]))
  return summaries.map((summary) => ({
    ...summary,
    pinned: metaMap.get(summary.id)?.pinned ?? false,
  }))
}

export async function saveConversationRecord(
  db: IDBPDatabase<ViewerDB>,
  summary: ConversationSummary,
  conversation: Conversation,
  assetKeys: string[] = [],
): Promise<void> {
  const now = Date.now()
  const tx = db.transaction(['index', 'conversations'], 'readwrite')
  const normalizedSummary: ConversationSummary = {
    ...summary,
    source: 'local',
    snippet: summary.snippet ?? '',
  }
  await Promise.all([
    tx.objectStore('index').put({ ...normalizedSummary, saved_at: now }),
    tx
      .objectStore('conversations')
      .put({
        id: conversation.id,
        conversationSlim: conversation,
        last_message_time: conversation.last_message_time,
        saved_at: now,
        assetKeys,
      }),
  ])
  await tx.done
}

export async function setConversationPinned(
  db: IDBPDatabase<ViewerDB>,
  id: string,
  pinned: boolean,
): Promise<void> {
  const store = db.transaction('userMeta', 'readwrite').objectStore('userMeta')
  const existing = ((await store.get(id)) as UserMetaRecord | undefined) ?? { id }
  if (pinned) {
    await store.put({ ...existing, id, pinned: true })
    return
  }
  if (!('pinned' in existing)) {
    return
  }
  const { pinned: _removed, ...rest } = existing
  const hasAdditionalFields = Object.keys(rest).some((key) => key !== 'id')
  if (hasAdditionalFields) {
    await store.put(rest as UserMetaRecord)
  } else {
    await store.delete(id)
  }
}

export async function deleteConversation(db: IDBPDatabase<ViewerDB>, id: string): Promise<void> {
  await removeSearchData(db, id)
  const tx = db.transaction(['index', 'conversations', 'userMeta'], 'readwrite')
  tx.objectStore('index').delete(id)
  tx.objectStore('conversations').delete(id)
  tx.objectStore('userMeta').delete(id)
  await tx.done
  await removeAssetsForOwner(db, id)
}

export async function getLocalConversation(db: IDBPDatabase<ViewerDB>, id: string): Promise<Conversation | null> {
  const record = await db.transaction('conversations').objectStore('conversations').get(id)
  return record?.conversationSlim ?? null
}

export async function saveAsset(
  db: IDBPDatabase<ViewerDB>,
  key: string,
  blob: Blob,
  ownerId: string,
  mime?: string,
): Promise<void> {
  const tx = db.transaction(['assets', 'assetOwners'], 'readwrite')
  const assetStore = tx.objectStore('assets')
  const ownerStore = tx.objectStore('assetOwners')
  const existing = (await assetStore.get(key)) as AssetRecord | undefined
  if (!existing || existing.size !== blob.size || (mime && existing.mime !== mime)) {
    await assetStore.put({
      key,
      blob,
      mime: mime ?? existing?.mime,
      size: blob.size,
    })
  }
  await ownerStore.put({ id: buildAssetOwnerId(key, ownerId), assetKey: key, ownerId })
  await tx.done
}

export async function removeAssetsForOwner(db: IDBPDatabase<ViewerDB>, ownerId: string): Promise<void> {
  const tx = db.transaction(['assetOwners', 'assets'], 'readwrite')
  const ownerStore = tx.objectStore('assetOwners')
  const assetStore = tx.objectStore('assets')
  const ownerIndex = ownerStore.index('byOwner')
  const assetIndex = ownerStore.index('byAsset')
  const links = await ownerIndex.getAll(ownerId)
  for (const link of links) {
    await ownerStore.delete(link.id)
    const remaining = await assetIndex.count(IDBKeyRange.only(link.assetKey))
    if (remaining === 0) {
      await assetStore.delete(link.assetKey)
      revokeAssetUrlForKey(link.assetKey)
    }
  }
  await tx.done
}

function buildAssetOwnerId(assetKey: string, ownerId: string): string {
  return `${assetKey}::${ownerId}`
}

const assetUrlCache = new Map<string, string>()

function revokeAssetUrlForKey(key: string): void {
  const cached = assetUrlCache.get(key)
  if (cached) {
    URL.revokeObjectURL(cached)
    assetUrlCache.delete(key)
  }
}

export async function getAssetUrl(db: IDBPDatabase<ViewerDB>, key: string): Promise<string | null> {
  if (assetUrlCache.has(key)) {
    return assetUrlCache.get(key) ?? null
  }
  const record = (await db.transaction('assets').objectStore('assets').get(key)) as AssetRecord | undefined
  if (!record) {return null}
  const url = URL.createObjectURL(record.blob)
  assetUrlCache.set(key, url)
  return url
}

export function revokeAssetUrls(): void {
  for (const url of assetUrlCache.values()) {
    URL.revokeObjectURL(url)
  }
  assetUrlCache.clear()
}

export async function saveSearchData(
  db: IDBPDatabase<ViewerDB>,
  conversationId: string,
  lines: SearchLine[],
  grams: string[],
): Promise<void> {
  const tx = db.transaction(['searchLines', 'searchIndex', 'searchMembership'], 'readwrite')
  tx.objectStore('searchLines').put({ conversationId, lines })
  tx.objectStore('searchMembership').put({ conversationId, grams })
  await tx.done
  await addConversationToSearchIndex(db, conversationId, grams)
}

export async function removeSearchData(db: IDBPDatabase<ViewerDB>, conversationId: string): Promise<void> {
  const membership = await db.transaction('searchMembership').objectStore('searchMembership').get(conversationId)
  const grams = membership?.grams ?? []
  const tx = db.transaction(['searchLines', 'searchMembership'], 'readwrite')
  tx.objectStore('searchLines').delete(conversationId)
  tx.objectStore('searchMembership').delete(conversationId)
  await tx.done
  if (grams.length) {
    const indexStore = db.transaction('searchIndex', 'readwrite').objectStore('searchIndex')
    await Promise.all(
      grams.map(async (gram) => {
        const entry = (await indexStore.get(gram)) as SearchIndexRecord | undefined
        if (!entry) {return}
        const ids = entry.ids.filter((id) => id !== conversationId)
        if (ids.length === 0) {
          await indexStore.delete(gram)
        } else {
          await indexStore.put({ gram, ids })
        }
      }),
    )
  }
}

async function addConversationToSearchIndex(
  db: IDBPDatabase<ViewerDB>,
  conversationId: string,
  grams: string[],
): Promise<void> {
  const store = db.transaction('searchIndex', 'readwrite').objectStore('searchIndex')
  const uniqueGrams = Array.from(new Set(grams))
  await Promise.all(
    uniqueGrams.map(async (gram) => {
      const entry = (await store.get(gram)) as SearchIndexRecord | undefined
      const ids = new Set(entry?.ids ?? [])
      ids.add(conversationId)
      await store.put({ gram, ids: Array.from(ids) })
    }),
  )
}

const EXTRA_METADATA_KEYS = {
  user: 'user',
  messageFeedback: 'message_feedback',
  groupChats: 'group_chats',
  shopping: 'shopping',
  basisPoints: 'basispoints',
  sora: 'sora',
  generatedAssets: 'generated_assets',
} as const

export async function saveExtraData(db: IDBPDatabase<ViewerDB>, extras: ExportExtraData): Promise<void> {
  const tx = db.transaction('metadata', 'readwrite')
  const store = tx.objectStore('metadata')
  const operations: Promise<IDBValidKey>[] = []
  if (extras.user) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.user, value: extras.user }))
  }
  if (extras.messageFeedback) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.messageFeedback, value: extras.messageFeedback }))
  }
  if (extras.groupChats) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.groupChats, value: extras.groupChats }))
  }
  if (extras.shopping) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.shopping, value: extras.shopping }))
  }
  if (extras.basisPoints) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.basisPoints, value: extras.basisPoints }))
  }
  if (extras.sora) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.sora, value: extras.sora }))
  }
  if (extras.generatedAssets) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.generatedAssets, value: extras.generatedAssets }))
  }
  await Promise.all(operations)
  await tx.done
}

export async function loadExtraData(db: IDBPDatabase<ViewerDB>): Promise<ExportExtraData> {
  const rows = await db.getAll('metadata')
  const extras: ExportExtraData = {}
  rows.forEach((row) => {
    switch (row.key) {
      case EXTRA_METADATA_KEYS.user:
        extras.user = row.value as ExportExtraData['user']
        break
      case EXTRA_METADATA_KEYS.messageFeedback:
        extras.messageFeedback = row.value as ExportExtraData['messageFeedback']
        break
      case EXTRA_METADATA_KEYS.groupChats:
        extras.groupChats = row.value as ExportExtraData['groupChats']
        break
      case EXTRA_METADATA_KEYS.shopping:
        extras.shopping = row.value as ExportExtraData['shopping']
        break
      case EXTRA_METADATA_KEYS.basisPoints:
        extras.basisPoints = row.value as ExportExtraData['basisPoints']
        break
      case EXTRA_METADATA_KEYS.sora:
        extras.sora = row.value as ExportExtraData['sora']
        break
      case EXTRA_METADATA_KEYS.generatedAssets:
        extras.generatedAssets = row.value as ExportExtraData['generatedAssets']
        break
      default:
        break
    }
  })
  return extras
}

export async function loadSearchBundleFromDb(
  db: IDBPDatabase<ViewerDB>,
  summaryMap: Record<string, { title: string; last_message_time: number }> = {},
) {
  const [linesRows, indexRows] = await Promise.all([
    db.getAll('searchLines'),
    db.getAll('searchIndex'),
  ])
  const linesByConversation: Record<string, SearchLine[]> = {}
  for (const row of linesRows) {
    linesByConversation[row.conversationId] = row.lines
  }
  const grams: Record<string, string[]> = {}
  for (const row of indexRows) {
    grams[row.gram] = row.ids
  }
  return { linesByConversation, grams, summaryMap }
}

export async function estimateDatabaseSize(db: IDBPDatabase<ViewerDB>): Promise<number> {
  let total = 0
  const [convos, assets, owners] = await Promise.all([
    db.getAll('conversations'),
    db.getAll('assets'),
    db.getAll('assetOwners'),
  ])
  for (const convo of convos) {
    total += JSON.stringify(convo).length
  }
  for (const asset of assets) {
    total += asset.size
  }
  for (const owner of owners) {
    total += JSON.stringify(owner).length
  }
  return total
}

export async function purgeDatabase(db: IDBPDatabase<ViewerDB>): Promise<void> {
  revokeAssetUrls()
  const stores: Array<
    'index' | 'conversations' | 'assets' | 'assetOwners' | 'userMeta' | 'searchLines' | 'searchIndex' | 'searchMembership' | 'metadata'
  > = [
    'index',
    'conversations',
    'assets',
    'assetOwners',
    'userMeta',
    'searchLines',
    'searchIndex',
    'searchMembership',
    'metadata',
  ]
  await Promise.all(stores.map((store) => db.clear(store)))
}

async function migrateLegacyAssetOwners(
  transaction?: IDBPTransaction<ViewerDB, StoreNames<ViewerDB>[], 'versionchange'>,
): Promise<void> {
  if (!transaction) {return}
  if (!transaction.objectStoreNames.contains('assets') || !transaction.objectStoreNames.contains('assetOwners')) {return}
  const assetsStore = transaction.objectStore('assets')
  const ownerStore = transaction.objectStore('assetOwners')
  const assets = await assetsStore.getAll()
  if (!assets.length) {return}
  await Promise.all(
    assets.map(async (asset) => {
      const legacyOwners = Array.isArray((asset as LegacyAssetRecord).owners)
        ? ((asset as LegacyAssetRecord).owners as string[])
        : []
      if (!legacyOwners.length) {
        if ('owners' in asset) {
          const sanitized: AssetRecord = {
            key: asset.key,
            blob: asset.blob,
            mime: asset.mime,
            size: asset.size,
          }
          await assetsStore.put(sanitized)
        }
        return
      }
      await Promise.all(
        legacyOwners.map((ownerId) =>
          ownerStore.put({ id: buildAssetOwnerId(asset.key, ownerId), assetKey: asset.key, ownerId }),
        ),
      )
      const sanitized: AssetRecord = {
        key: asset.key,
        blob: asset.blob,
        mime: asset.mime,
        size: asset.size,
      }
      await assetsStore.put(sanitized)
    }),
  )
}
