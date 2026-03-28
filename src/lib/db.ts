import { type DBSchema, type IDBPDatabase, type IDBPTransaction, openDB, type StoreNames } from 'idb';

import type { Conversation, ConversationSummary, ExportExtraData } from '../types';
import type { SearchLine } from '../types/search';

export interface ConversationRecord {
  id: string;
  conversationSlim: Conversation;
  last_message_time: number;
  saved_at: number;
  assetKeys?: string[];
}

export interface AssetRecord {
  key: string;
  blob: Blob;
  mime?: string;
  size: number;
}

export interface AssetSaveInput {
  key: string;
  blob: Blob;
  mime?: string;
}

export interface AssetCatalogEntry {
  key: string;
  mime?: string;
  size: number;
}

export interface AssetOwnerIndex {
  byAsset: Record<string, string[]>;
  byConversation: Record<string, string[]>;
}

interface LegacyAssetRecord extends AssetRecord {
  owners?: string[];
}

interface AssetOwnerRecord {
  id: string;
  assetKey: string;
  ownerId: string;
}

interface UserMetaRecord {
  id: string;
  pinned?: boolean;
}

interface SearchLinesRecord {
  conversationId: string;
  lines: SearchLine[];
}

interface SearchIndexRecord {
  gram: string;
  ids: string[];
}

interface SearchMembershipRecord {
  conversationId: string;
  grams: string[];
}

interface MetadataRecord {
  key: string;
  value: unknown;
}

interface ViewerDB extends DBSchema {
  index: {
    key: string;
    value: ConversationSummary;
  };
  conversations: {
    key: string;
    value: ConversationRecord;
  };
  assets: {
    key: string;
    value: AssetRecord;
  };
  assetOwners: {
    key: string;
    value: AssetOwnerRecord;
    indexes: { byAsset: string; byOwner: string };
  };
  userMeta: {
    key: string;
    value: UserMetaRecord;
  };
  searchLines: {
    key: string;
    value: SearchLinesRecord;
  };
  searchIndex: {
    key: string;
    value: SearchIndexRecord;
  };
  searchMembership: {
    key: string;
    value: SearchMembershipRecord;
  };
  metadata: {
    key: string;
    value: MetadataRecord;
  };
}

export type { ViewerDB };

export const GENERATED_ASSET_OWNER_ID = '__generated_gallery__';
const DB_NAME = 'chatgpt-data-export-viewer';
const DB_VERSION = 5;

let dbPromise: Promise<IDBPDatabase<ViewerDB>> | null = null;

export async function openViewerDatabase(): Promise<IDBPDatabase<ViewerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ViewerDB>(DB_NAME, DB_VERSION, {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('index', { keyPath: 'id' });
          db.createObjectStore('conversations', { keyPath: 'id' });
          db.createObjectStore('assets', { keyPath: 'key' });
          db.createObjectStore('userMeta', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('searchLines', { keyPath: 'conversationId' });
          db.createObjectStore('searchIndex', { keyPath: 'gram' });
        }
        if (oldVersion < 3) {
          db.createObjectStore('searchMembership', { keyPath: 'conversationId' });
        }
        if (oldVersion < 4) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('assetOwners')) {
            const ownerStore = db.createObjectStore('assetOwners', { keyPath: 'id' });
            ownerStore.createIndex('byAsset', 'assetKey', { unique: false });
            ownerStore.createIndex('byOwner', 'ownerId', { unique: false });
          }
          await migrateLegacyAssetOwners(transaction);
        }
      },
    });
  }
  return dbPromise;
}

export async function closeViewerDatabase(): Promise<void> {
  if (!dbPromise) {
    return;
  }
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}

export async function loadLocalSummaries(db: IDBPDatabase<ViewerDB>): Promise<ConversationSummary[]> {
  const summaries = await db.getAll('index');
  return summaries.map(summary => {
    const pinnedTime = summary.pinned_time ?? null;
    return {
      ...summary,
      pinned_time: pinnedTime,
      pinned: pinnedTime !== null,
    };
  });
}

export async function saveConversationRecord(
  db: IDBPDatabase<ViewerDB>,
  summary: ConversationSummary,
  conversation: Conversation,
  assetKeys: string[] = []
): Promise<void> {
  const now = Date.now();
  const pinnedTime = summary.pinned_time ?? conversation.pinned_time ?? null;
  const tx = db.transaction(['index', 'conversations'], 'readwrite');
  const normalizedSummary: ConversationSummary = {
    ...summary,
    source: 'local',
    snippet: summary.snippet ?? '',
    pinned_time: pinnedTime,
    pinned: pinnedTime !== null,
  };
  await Promise.all([
    tx.objectStore('index').put({ ...normalizedSummary, saved_at: now }),
    tx.objectStore('conversations').put({
      id: conversation.id,
      conversationSlim: conversation,
      last_message_time: conversation.last_message_time,
      saved_at: now,
      assetKeys,
    }),
  ]);
  await tx.done;
}

export async function saveConversationWithSearchData(
  db: IDBPDatabase<ViewerDB>,
  summary: ConversationSummary,
  conversation: Conversation,
  assetKeys: string[],
  lines: SearchLine[],
  grams: string[]
): Promise<void> {
  const now = Date.now();
  const pinnedTime = summary.pinned_time ?? conversation.pinned_time ?? null;
  const tx = db.transaction(['index', 'conversations', 'searchLines', 'searchIndex', 'searchMembership'], 'readwrite');
  const normalizedSummary: ConversationSummary = {
    ...summary,
    source: 'local',
    snippet: summary.snippet ?? '',
    pinned_time: pinnedTime,
    pinned: pinnedTime !== null,
  };
  await Promise.all([
    tx.objectStore('index').put({ ...normalizedSummary, saved_at: now }),
    tx.objectStore('conversations').put({
      id: conversation.id,
      conversationSlim: conversation,
      last_message_time: conversation.last_message_time,
      saved_at: now,
      assetKeys,
    }),
    tx.objectStore('searchLines').put({ conversationId: conversation.id, lines }),
    tx.objectStore('searchMembership').put({ conversationId: conversation.id, grams }),
  ]);

  const indexStore = tx.objectStore('searchIndex');
  const uniqueGrams = [...new Set(grams)];
  await Promise.all(
    uniqueGrams.map(async gram => {
      const entry = (await indexStore.get(gram)) as SearchIndexRecord | undefined;
      const ids = new Set(entry?.ids ?? []);
      if (!ids.has(conversation.id)) {
        ids.add(conversation.id);
        await indexStore.put({ gram, ids: [...ids] });
      }
    })
  );

  await tx.done;
}

export async function setConversationPinned(
  db: IDBPDatabase<ViewerDB>,
  id: string,
  pinned: boolean,
  fallbackSummary?: ConversationSummary
): Promise<ConversationSummary | null> {
  const tx = db.transaction(['index', 'conversations'], 'readwrite');
  const indexStore = tx.objectStore('index');
  const conversationStore = tx.objectStore('conversations');

  const existingSummary = (await indexStore.get(id)) as ConversationSummary | undefined;
  const baseSummary = existingSummary ?? (fallbackSummary ? { ...fallbackSummary, id } : null);
  if (!baseSummary) {
    await tx.done;
    return null;
  }

  const pinnedTime = pinned ? (baseSummary.pinned_time ?? Date.now()) : null;
  const normalizedSummary: ConversationSummary = {
    ...baseSummary,
    id,
    source: 'local',
    snippet: baseSummary.snippet ?? '',
    pinned_time: pinnedTime,
    pinned: pinnedTime !== null,
  };
  await indexStore.put(normalizedSummary);

  const conversationRecord = (await conversationStore.get(id)) as ConversationRecord | undefined;
  if (conversationRecord) {
    await conversationStore.put({
      ...conversationRecord,
      conversationSlim: {
        ...conversationRecord.conversationSlim,
        pinned_time: pinnedTime,
      },
    });
  }

  await tx.done;
  return normalizedSummary;
}

export async function deleteConversation(db: IDBPDatabase<ViewerDB>, id: string): Promise<void> {
  await removeSearchData(db, id);
  const tx = db.transaction(['index', 'conversations', 'userMeta'], 'readwrite');
  await Promise.all([
    tx.objectStore('index').delete(id),
    tx.objectStore('conversations').delete(id),
    tx.objectStore('userMeta').delete(id),
  ]);
  await tx.done;
  await removeAssetsForOwner(db, id);
}

export async function getLocalConversation(db: IDBPDatabase<ViewerDB>, id: string): Promise<Conversation | null> {
  const record = await db.transaction('conversations').objectStore('conversations').get(id);
  return record?.conversationSlim ?? null;
}

export async function saveAsset(db: IDBPDatabase<ViewerDB>, key: string, blob: Blob, ownerId: string, mime?: string): Promise<void> {
  const tx = db.transaction(['assets', 'assetOwners'], 'readwrite');
  const assetStore = tx.objectStore('assets');
  const ownerStore = tx.objectStore('assetOwners');
  const existing = (await assetStore.get(key)) as AssetRecord | undefined;
  if (existing?.size !== blob.size || (mime && existing.mime !== mime)) {
    await assetStore.put({
      key,
      blob,
      mime: mime ?? existing?.mime,
      size: blob.size,
    });
  }
  await ownerStore.put({ id: buildAssetOwnerId(key, ownerId), assetKey: key, ownerId });
  await tx.done;
}

export async function saveAssetsBatch(db: IDBPDatabase<ViewerDB>, assets: AssetSaveInput[], ownerId: string): Promise<void> {
  if (!assets.length) {
    return;
  }
  const tx = db.transaction(['assets', 'assetOwners'], 'readwrite');
  const assetStore = tx.objectStore('assets');
  const ownerStore = tx.objectStore('assetOwners');
  for (const asset of assets) {
    const existing = (await assetStore.get(asset.key)) as AssetRecord | undefined;
    if (existing?.size !== asset.blob.size || (asset.mime && existing.mime !== asset.mime)) {
      await assetStore.put({
        key: asset.key,
        blob: asset.blob,
        mime: asset.mime ?? existing?.mime,
        size: asset.blob.size,
      });
    }
    await ownerStore.put({ id: buildAssetOwnerId(asset.key, ownerId), assetKey: asset.key, ownerId });
  }
  await tx.done;
}

export async function removeAssetsForOwner(db: IDBPDatabase<ViewerDB>, ownerId: string): Promise<void> {
  const tx = db.transaction(['assetOwners', 'assets'], 'readwrite');
  const ownerStore = tx.objectStore('assetOwners');
  const assetStore = tx.objectStore('assets');
  const ownerIndex = ownerStore.index('byOwner');
  const assetIndex = ownerStore.index('byAsset');
  const links = await ownerIndex.getAll(ownerId);
  for (const link of links) {
    await ownerStore.delete(link.id);
    const remaining = await assetIndex.count(IDBKeyRange.only(link.assetKey));
    if (remaining === 0) {
      await assetStore.delete(link.assetKey);
      revokeAssetUrlForKey(link.assetKey);
    }
  }
  await tx.done;
}

function buildAssetOwnerId(assetKey: string, ownerId: string): string {
  return `${assetKey}::${ownerId}`;
}

const assetUrlCache = new Map<string, string>();

function revokeAssetUrlForKey(key: string): void {
  const cached = assetUrlCache.get(key);
  if (cached) {
    URL.revokeObjectURL(cached);
    assetUrlCache.delete(key);
  }
}

export async function getAssetUrl(db: IDBPDatabase<ViewerDB>, key: string): Promise<string | null> {
  const cached = assetUrlCache.get(key);
  if (cached) {
    // Move to end (most recently used)
    assetUrlCache.delete(key);
    assetUrlCache.set(key, cached);
    return cached;
  }
  const record = (await db.transaction('assets').objectStore('assets').get(key)) as AssetRecord | undefined;
  if (!record) {
    return null;
  }
  const url = URL.createObjectURL(record.blob);
  assetUrlCache.set(key, url);
  // Evict oldest entries if cache exceeds limit
  while (assetUrlCache.size > 150) {
    const oldest = assetUrlCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    const oldUrl = assetUrlCache.get(oldest);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }
    assetUrlCache.delete(oldest);
  }
  return url;
}

export async function getAssetBlob(db: IDBPDatabase<ViewerDB>, key: string): Promise<Blob | null> {
  const record = (await db.transaction('assets').objectStore('assets').get(key)) as AssetRecord | undefined;
  return record?.blob ?? null;
}

export function revokeAssetUrls(): void {
  for (const url of assetUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  assetUrlCache.clear();
}

export async function saveSearchData(db: IDBPDatabase<ViewerDB>, conversationId: string, lines: SearchLine[], grams: string[]): Promise<void> {
  const tx = db.transaction(['searchLines', 'searchIndex', 'searchMembership'], 'readwrite');
  const linesStore = tx.objectStore('searchLines');
  const membershipStore = tx.objectStore('searchMembership');
  const indexStore = tx.objectStore('searchIndex');

  await Promise.all([linesStore.put({ conversationId, lines }), membershipStore.put({ conversationId, grams })]);

  const uniqueGrams = [...new Set(grams)];
  await Promise.all(
    uniqueGrams.map(async gram => {
      const entry = (await indexStore.get(gram)) as SearchIndexRecord | undefined;
      const ids = new Set(entry?.ids ?? []);
      if (!ids.has(conversationId)) {
        ids.add(conversationId);
        await indexStore.put({ gram, ids: [...ids] });
      }
    })
  );
  await tx.done;
}

export async function removeSearchData(db: IDBPDatabase<ViewerDB>, conversationId: string): Promise<void> {
  const membership = await db.transaction('searchMembership').objectStore('searchMembership').get(conversationId);
  const grams = membership?.grams ?? [];

  const tx = db.transaction(['searchLines', 'searchMembership', 'searchIndex'], 'readwrite');
  await Promise.all([
    tx.objectStore('searchLines').delete(conversationId),
    tx.objectStore('searchMembership').delete(conversationId),
  ]);

  if (grams.length) {
    const indexStore = tx.objectStore('searchIndex');
    await Promise.all(
      grams.map(async gram => {
        const entry = (await indexStore.get(gram)) as SearchIndexRecord | undefined;
        if (!entry) {
          return;
        }
        const ids = entry.ids.filter(id => id !== conversationId);
        await (ids.length === 0 ? indexStore.delete(gram) : indexStore.put({ gram, ids }));
      })
    );
  }
  await tx.done;
}

const EXTRA_METADATA_KEYS = {
  user: 'user',
  messageFeedback: 'message_feedback',
  groupChats: 'group_chats',
  shopping: 'shopping',
  basisPoints: 'basispoints',
  sora: 'sora',
  generatedAssets: 'generated_assets',
} as const;

export async function saveExtraData(db: IDBPDatabase<ViewerDB>, extras: ExportExtraData): Promise<void> {
  const tx = db.transaction('metadata', 'readwrite');
  const store = tx.objectStore('metadata');
  const operations: Array<Promise<IDBValidKey>> = [];
  if (extras.user) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.user, value: extras.user }));
  }
  if (extras.messageFeedback) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.messageFeedback, value: extras.messageFeedback }));
  }
  if (extras.groupChats) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.groupChats, value: extras.groupChats }));
  }
  if (extras.shopping) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.shopping, value: extras.shopping }));
  }
  if (extras.basisPoints) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.basisPoints, value: extras.basisPoints }));
  }
  if (extras.sora) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.sora, value: extras.sora }));
  }
  if (extras.generatedAssets) {
    operations.push(store.put({ key: EXTRA_METADATA_KEYS.generatedAssets, value: extras.generatedAssets }));
  }
  await Promise.all(operations);
  await tx.done;
}

export async function loadExtraData(db: IDBPDatabase<ViewerDB>): Promise<ExportExtraData> {
  const rows = await db.getAll('metadata');
  const extras: ExportExtraData = {};
  rows.forEach(row => {
    switch (row.key) {
      case EXTRA_METADATA_KEYS.user:
        extras.user = row.value as ExportExtraData['user'];
        break;
      case EXTRA_METADATA_KEYS.messageFeedback:
        extras.messageFeedback = row.value as ExportExtraData['messageFeedback'];
        break;
      case EXTRA_METADATA_KEYS.groupChats:
        extras.groupChats = row.value as ExportExtraData['groupChats'];
        break;
      case EXTRA_METADATA_KEYS.shopping:
        extras.shopping = row.value as ExportExtraData['shopping'];
        break;
      case EXTRA_METADATA_KEYS.basisPoints:
        extras.basisPoints = row.value as ExportExtraData['basisPoints'];
        break;
      case EXTRA_METADATA_KEYS.sora:
        extras.sora = row.value as ExportExtraData['sora'];
        break;
      case EXTRA_METADATA_KEYS.generatedAssets:
        extras.generatedAssets = row.value as ExportExtraData['generatedAssets'];
        break;
      default:
        break;
    }
  });
  return extras;
}

export async function loadSearchBundleFromDb(db: IDBPDatabase<ViewerDB>, summaryMap: Record<string, { title: string; last_message_time: number }> = {}) {
  const [linesRows, indexRows] = await Promise.all([db.getAll('searchLines'), db.getAll('searchIndex')]);
  const linesByConversation: Record<string, SearchLine[]> = {};
  for (const row of linesRows) {
    linesByConversation[row.conversationId] = row.lines;
  }
  const grams: Record<string, string[]> = {};
  for (const row of indexRows) {
    grams[row.gram] = row.ids;
  }
  return { linesByConversation, grams, summaryMap };
}

export async function findReferencedAssetKeys(db: IDBPDatabase<ViewerDB>): Promise<Set<string>> {
  const keys = new Set<string>();
  const tx = db.transaction('assetOwners', 'readonly');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const record = cursor.value;
    if (record.ownerId !== GENERATED_ASSET_OWNER_ID) {
      keys.add(record.assetKey);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return keys;
}

export async function loadAssetOwnerIndex(db: IDBPDatabase<ViewerDB>): Promise<AssetOwnerIndex> {
  const byAsset = new Map<string, Set<string>>();
  const byConversation = new Map<string, Set<string>>();
  const tx = db.transaction('assetOwners', 'readonly');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const record = cursor.value;
    if (record.ownerId !== GENERATED_ASSET_OWNER_ID) {
      if (!byAsset.has(record.assetKey)) {
        byAsset.set(record.assetKey, new Set<string>());
      }
      byAsset.get(record.assetKey)?.add(record.ownerId);

      if (!byConversation.has(record.ownerId)) {
        byConversation.set(record.ownerId, new Set<string>());
      }
      byConversation.get(record.ownerId)?.add(record.assetKey);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return {
    byAsset: Object.fromEntries([...byAsset.entries()].map(([key, owners]) => [key, [...owners]])),
    byConversation: Object.fromEntries([...byConversation.entries()].map(([id, keys]) => [id, [...keys]])),
  };
}

export async function loadAssetCatalog(db: IDBPDatabase<ViewerDB>): Promise<AssetCatalogEntry[]> {
  const rows = await db.getAll('assets');
  return rows.map(row => ({
    key: row.key,
    mime: row.mime,
    size: row.size,
  }));
}

export async function estimateDatabaseSize(_db: IDBPDatabase<ViewerDB>): Promise<number> {
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    return estimate.usage ?? 0;
  }
  // Fallback: count records (less accurate but avoids JSON.stringify)
  let total = 0;
  const stores: Array<'conversations' | 'assets' | 'assetOwners'> = ['conversations', 'assets', 'assetOwners'];
  for (const storeName of stores) {
    const tx = _db.transaction(storeName, 'readonly');
    let cursor = await tx.store.openCursor();
    while (cursor) {
      const value = cursor.value;
      if (storeName === 'assets') {
        total += (value as AssetRecord).size;
      } else {
        total += 512; // rough per-record estimate
      }
      cursor = await cursor.continue();
    }
  }
  return total;
}

export async function purgeDatabase(db: IDBPDatabase<ViewerDB>): Promise<void> {
  revokeAssetUrls();
  const stores: Array<'index' | 'conversations' | 'assets' | 'assetOwners' | 'userMeta' | 'searchLines' | 'searchIndex' | 'searchMembership' | 'metadata'> = [
    'index',
    'conversations',
    'assets',
    'assetOwners',
    'userMeta',
    'searchLines',
    'searchIndex',
    'searchMembership',
    'metadata',
  ];
  await Promise.all(stores.map(store => db.clear(store)));
}

async function migrateLegacyAssetOwners(transaction?: IDBPTransaction<ViewerDB, Array<StoreNames<ViewerDB>>, 'versionchange'>): Promise<void> {
  if (!transaction) {
    return;
  }
  if (!transaction.objectStoreNames.contains('assets') || !transaction.objectStoreNames.contains('assetOwners')) {
    return;
  }
  const assetsStore = transaction.objectStore('assets');
  const ownerStore = transaction.objectStore('assetOwners');
  const assets = await assetsStore.getAll();
  if (!assets.length) {
    return;
  }
  await Promise.all(
    assets.map(async asset => {
      const legacyOwners = Array.isArray((asset as LegacyAssetRecord).owners) ? (asset as LegacyAssetRecord).owners! : [];
      if (!legacyOwners.length) {
        if ('owners' in asset) {
          const sanitized: AssetRecord = {
            key: asset.key,
            blob: asset.blob,
            mime: asset.mime,
            size: asset.size,
          };
          await assetsStore.put(sanitized);
        }
        return;
      }
      await Promise.all(legacyOwners.map(ownerId => ownerStore.put({ id: buildAssetOwnerId(asset.key, ownerId), assetKey: asset.key, ownerId })));
      const sanitizedAsset: AssetRecord = {
        key: asset.key,
        blob: asset.blob,
        mime: asset.mime,
        size: asset.size,
      };
      await assetsStore.put(sanitizedAsset);
    })
  );
}
