import type { IDBPDatabase } from 'idb';
import { createContext, type ReactNode, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { buildConversationBundleZip } from '../lib/conversationExport';
import {
  type AssetCatalogEntry,
  type AssetOwnerIndex,
  deleteConversation,
  estimateDatabaseSize,
  findReferencedAssetKeys,
  GENERATED_ASSET_OWNER_ID,
  getAssetBlob,
  getAssetUrl,
  getLocalConversation,
  loadAssetCatalog,
  loadAssetOwnerIndex,
  loadExtraData,
  loadLocalSummaries,
  loadSearchBundleFromDb,
  openViewerDatabase,
  purgeDatabase,
  saveAssetsBatch,
  saveConversationWithSearchData,
  saveExtraData,
  setConversationPinned,
  type ViewerDB,
} from '../lib/db';
import { triggerDownload } from '../lib/download';
import { formatText } from '../lib/i18n';
import type { ImportConversationPayload } from '../lib/importer';
import { localSettings } from '../lib/localStorage';
import { mergeSummaries, shouldUseLocal } from '../lib/merge';
import { fetchServerConversation, fetchServerGeneratedAssets, fetchServerIndex, fetchServerSearchBundle } from '../lib/serverData';
import type { Conversation, ConversationSummary, ExportExtraData, GeneratedAsset } from '../types';
import type { SearchBundle } from '../types/search';
import { useImportExportSetters } from './ImportExportContext';
import { useNotification } from './NotificationContext';
import { usePreferences } from './PreferencesContext';

export type LoadState = 'loading' | 'ready' | 'error';

export type ImportMode = 'upsert' | 'replace' | 'clone';

function isNewerSummary(incoming: ConversationSummary, existing?: ConversationSummary | null): boolean {
  if (!existing) {
    return true;
  }
  if (incoming.last_message_time > existing.last_message_time) {
    return true;
  }
  if (incoming.last_message_time === existing.last_message_time && (incoming.pinned_time ?? null) !== (existing.pinned_time ?? null)) {
    return true;
  }
  if (incoming.last_message_time === existing.last_message_time && (incoming.is_archived ?? false) !== (existing.is_archived ?? false)) {
    return true;
  }
  if (incoming.last_message_time === existing.last_message_time && (incoming.memory_scope ?? null) !== (existing.memory_scope ?? null)) {
    return true;
  }
  if (incoming.last_message_time === existing.last_message_time && (incoming.mapping_node_count ?? 0) > (existing.mapping_node_count ?? 0)) {
    return true;
  }
  return false;
}

function buildCloneTracker(ids: Iterable<string>): Map<string, number> {
  const tracker = new Map<string, number>();
  for (const id of ids) {
    const { base, suffix } = splitCloneIdentifier(id);
    const current = tracker.get(base) ?? 0;
    if (suffix > current) {
      tracker.set(base, suffix);
    }
  }
  return tracker;
}

function ensureClonePayloadIdForLocal(payload: ImportConversationPayload, usedIds: Set<string>, tracker: Map<string, number>): ImportConversationPayload {
  const originalId = payload.conversation.id;
  const { base, suffix } = splitCloneIdentifier(originalId);
  if (!usedIds.has(originalId)) {
    usedIds.add(originalId);
    const current = tracker.get(base) ?? 0;
    if (suffix > current) {
      tracker.set(base, suffix);
    }
    return payload;
  }
  let nextSuffix = Math.max(tracker.get(base) ?? suffix, suffix) + 1;
  let candidate = `${base}_v${nextSuffix}`;
  while (usedIds.has(candidate)) {
    nextSuffix += 1;
    candidate = `${base}_v${nextSuffix}`;
  }
  tracker.set(base, nextSuffix);
  usedIds.add(candidate);
  return cloneImportPayloadWithId(payload, candidate);
}

function splitCloneIdentifier(id: string): { base: string; suffix: number } {
  const match = /^(.*)_v(\d+)$/.exec(id);
  if (match) {
    return { base: match[1], suffix: Number(match[2]) };
  }
  return { base: id, suffix: 1 };
}

function cloneImportPayloadWithId(payload: ImportConversationPayload, nextId: string): ImportConversationPayload {
  return {
    ...payload,
    summary: { ...payload.summary, id: nextId },
    conversation: { ...payload.conversation, id: nextId },
    searchLines: payload.searchLines.map(line => ({
      ...line,
      loc: { ...line.loc, conversationId: nextId },
    })),
  };
}

function toSafeFileName(value: string): string {
  const withoutControlChars = [...value]
    .filter(char => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
  const sanitized = withoutControlChars
    .trim()
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return sanitized || 'conversation';
}

export interface AppDataContextValue {
  status: LoadState;
  error?: string | null;
  serverIndex: ConversationSummary[];
  localIndex: ConversationSummary[];
  mergedIndex: ConversationSummary[];
  storageAvailable: boolean;
  dbSizeBytes: number | null;
  refreshDbSize: () => Promise<number | null>;
  importZips: (files: File[], mode?: ImportMode) => Promise<number>;
  getConversation: (id: string) => Promise<Conversation | null>;
  getAssetBlobUrl: (key: string) => Promise<string | null>;
  exportConversationBundle: (id: string) => Promise<void>;
  deleteLocalConversation: (id: string) => Promise<void>;
  pinConversation: (id: string, pin: boolean) => Promise<void>;
  setScrollPosition: (id: string, top: number) => void;
  getScrollPosition: (id: string) => number | null;
  cleanupLocal: () => Promise<number>;
  purgeAll: () => Promise<void>;
  exportLocalBundle: () => Promise<void>;
  ensureSearchBundle: () => Promise<SearchBundle | null>;
  extraData: ExportExtraData;
  generatedAssets: GeneratedAsset[];
  referencedAssetKeys: Set<string>;
  assetOwnerIndex: AssetOwnerIndex;
  storedAssets: AssetCatalogEntry[];
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('AppDataContext missing');
  }
  return ctx;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { pushNotice } = useNotification();
  const { t } = usePreferences();
  const ieSetters = useImportExportSetters();

  const [status, setStatus] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [serverIndex, setServerIndex] = useState<ConversationSummary[]>([]);
  const [localIndex, setLocalIndex] = useState<ConversationSummary[]>([]);
  const [mergedIndex, setMergedIndex] = useState<ConversationSummary[]>([]);
  const [dbAllowed, setDbAllowed] = useState(true);
  const [dbSizeBytes, setDbSizeBytes] = useState<number | null>(null);
  const [searchBundle, setSearchBundle] = useState<SearchBundle | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [extraData, setExtraData] = useState<ExportExtraData>(() => ({}));
  const [serverGeneratedAssets, setServerGeneratedAssets] = useState<GeneratedAsset[]>([]);
  const [referencedAssetKeys, setReferencedAssetKeys] = useState(() => new Set<string>());
  const [assetOwnerIndex, setAssetOwnerIndex] = useState({ byAsset: {}, byConversation: {} } satisfies AssetOwnerIndex);
  const [storedAssets, setStoredAssets] = useState<AssetCatalogEntry[]>([]);
  const [scrollPositions] = useState<Map<string, number>>(() => new Map());
  const dbRef = useRef<IDBPDatabase<ViewerDB> | null>(null);

  // Keep a ref to ieSetters so importZips callback doesn't depend on it
  const ieSettersRef = useRef(ieSetters);
  ieSettersRef.current = ieSetters;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const testKey = '__viewer_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
    } catch (err) {
      console.error('Local storage unavailable', err);
      setStorageAvailable(false);
      pushNotice(t.storage.unavailable, 'error', { persistent: true });
    }
  }, [pushNotice, t.storage.unavailable]);

  const ensureDb = useCallback(async (): Promise<IDBPDatabase<ViewerDB>> => {
    if (!storageAvailable) {
      throw new Error('storage-unavailable');
    }
    if (dbRef.current) {
      return dbRef.current;
    }
    try {
      const db = await openViewerDatabase();
      dbRef.current = db;
      return db;
    } catch (err) {
      console.error('IndexedDB unavailable', err);
      setStorageAvailable(false);
      pushNotice(t.storage.indexedDbBlocked, 'error', { persistent: true });
      throw err;
    }
  }, [pushNotice, storageAvailable, t.storage.indexedDbBlocked]);

  const setScrollPosition = useCallback(
    (id: string, top: number) => {
      scrollPositions.set(id, top);
    },
    [scrollPositions]
  );

  const getScrollPosition = useCallback(
    (id: string) => {
      return scrollPositions.get(id) ?? null;
    },
    [scrollPositions]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadServerIndex() {
      try {
        const list = await fetchServerIndex();
        if (!cancelled) {
          setServerIndex(list);
          setStatus('ready');
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError('Unable to load conversations index');
          setStatus('error');
        }
      }
    }
    void loadServerIndex();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dbAllowed) {
      return;
    }
    let cancelled = false;
    async function loadLocal() {
      try {
        const db = await ensureDb();
        if (cancelled) {
          return;
        }
        const [list, refKeys, ownerIndex, assets] = await Promise.all([
          loadLocalSummaries(db),
          findReferencedAssetKeys(db),
          loadAssetOwnerIndex(db),
          loadAssetCatalog(db),
        ]);
        if (!cancelled) {
          setLocalIndex(list);
          setReferencedAssetKeys(refKeys);
          setAssetOwnerIndex(ownerIndex);
          setStoredAssets(assets);
        }
      } catch (err) {
        console.error('Failed to load local data', err);
      }
    }
    void loadLocal();
    return () => {
      cancelled = true;
    };
  }, [dbAllowed, ensureDb]);

  useEffect(() => {
    startTransition(() => {
      setMergedIndex(mergeSummaries(serverIndex, localIndex));
    });
  }, [serverIndex, localIndex]);

  const updateLocalIndex = useCallback(async (db: IDBPDatabase<ViewerDB>) => {
    const [locals, refKeys, ownerIndex, assets] = await Promise.all([
      loadLocalSummaries(db),
      findReferencedAssetKeys(db),
      loadAssetOwnerIndex(db),
      loadAssetCatalog(db),
    ]);
    setLocalIndex(locals);
    setReferencedAssetKeys(refKeys);
    setAssetOwnerIndex(ownerIndex);
    setStoredAssets(assets);
    setSearchBundle(null);
  }, []);

  const importZips = useCallback(
    async (files: File[], mode: ImportMode = 'upsert'): Promise<number> => {
      const { setImporting, setImportProgress } = ieSettersRef.current;
      if (!files.length) {
        return 0;
      }
      const zipFiles = files.filter(file => file.name.toLowerCase().endsWith('.zip'));
      if (!zipFiles.length) {
        pushNotice(t.importer.notifications.zipOnly, 'warning');
        setImportProgress({
          phase: 'error',
          message: t.importer.notifications.zipOnly,
        });
        return 0;
      }
      if (!storageAvailable) {
        pushNotice(t.importer.notifications.storageDisabled, 'error', { persistent: true });
        setImportProgress({
          phase: 'error',
          message: t.importer.notifications.storageDisabled,
        });
        return 0;
      }
      setImporting(true);
      setImportProgress({
        phase: 'processing',
        message: t.importer.progress.uploading,
        currentArchiveIndex: 0,
        currentArchiveTotal: zipFiles.length,
      });
      try {
        const db = await ensureDb();
        if (mode === 'replace') {
          await purgeDatabase(db);
          setLocalIndex([]);
          setMergedIndex(mergeSummaries(serverIndex, []));
          setSearchBundle(null);
          setExtraData({});
        }
        const { parseExportZipsInWorker } = await import('../lib/importWorkerClient');
        const bundle = await parseExportZipsInWorker(zipFiles, {
          onProgress(progress) {
            if (progress.phase === 'archive-start') {
              setImportProgress({
                phase: 'processing',
                message: t.importer.progress.readingMetadata,
                currentArchiveName: progress.archiveName,
                currentArchiveIndex: progress.archiveIndex,
                currentArchiveTotal: progress.archivesTotal,
              });
              return;
            }
            if (progress.phase === 'archive-conversations') {
              setImportProgress({
                phase: 'processing',
                message: `${t.importer.status.processing} ${progress.conversationsProcessed}/${progress.conversationsTotal}`,
                currentArchiveName: progress.archiveName,
                currentArchiveIndex: progress.archiveIndex,
                currentArchiveTotal: progress.archivesTotal,
              });
              return;
            }
            if (progress.phase === 'archive-assets') {
              setImportProgress({
                phase: 'processing',
                message: `${progress.archiveName} (${progress.assetsProcessed})`,
                currentArchiveName: progress.archiveName,
                currentArchiveIndex: progress.archiveIndex,
                currentArchiveTotal: progress.archivesTotal,
              });
              return;
            }
            setImportProgress({
              phase: 'processing',
              message: `${progress.archiveIndex}/${progress.archivesTotal}: ${progress.archiveName}`,
              currentArchiveName: progress.archiveName,
              currentArchiveIndex: progress.archiveIndex,
              currentArchiveTotal: progress.archivesTotal,
            });
          },
        });
        await saveExtraData(db, bundle.extras);
        setExtraData(bundle.extras);
        if (!bundle.conversations.length) {
          pushNotice(t.importer.notifications.noConversations, 'warning');
          setImportProgress({
            phase: 'error',
            message: t.importer.notifications.noConversationsDetected,
          });
          return 0;
        }
        const baselineLocalIndex = mode === 'replace' ? [] : localIndex;
        const existingLocalMap = new Map(baselineLocalIndex.map(entry => [entry.id, entry]));
        const usedConversationIds = new Set<string>([...serverIndex.map(entry => entry.id), ...baselineLocalIndex.map(entry => entry.id)]);
        const cloneTracker = mode === 'clone' ? buildCloneTracker(usedConversationIds) : null;
        const conversationsToProcess =
          mode === 'clone'
            ? bundle.conversations.map(payload => ensureClonePayloadIdForLocal(payload, usedConversationIds, cloneTracker!))
            : bundle.conversations.filter(payload => isNewerSummary(payload.summary, existingLocalMap.get(payload.summary.id)));
        if (!conversationsToProcess.length) {
          pushNotice(t.importer.notifications.upToDate, 'info');
          setImportProgress({
            phase: 'complete',
            message: t.importer.notifications.upToDate,
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
          });
          return 0;
        }
        const uniqueAssetKeys = new Set<string>();
        for (const payload of conversationsToProcess) {
          for (const assetKey of payload.assetKeys) {
            if (bundle.assets.has(assetKey)) {
              uniqueAssetKeys.add(assetKey);
            }
          }
        }
        const conversationTotal = conversationsToProcess.length;
        const assetTotal = uniqueAssetKeys.size;
        const buildConversationLabel = (completed: number) => {
          if (!conversationTotal) {
            return t.importer.status.saving;
          }
          if (completed >= conversationTotal) {
            return `${completed}/${conversationTotal}`;
          }
          const currentIndex = Math.min(completed + 1, conversationTotal);
          return `${currentIndex}/${conversationTotal}`;
        };
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
        });
        setSearchBundle(null);
        let processed = 0;
        let savedAssets = 0;
        const processedAssetKeys = new Set<string>();
        const progressiveLocalMap = new Map<string, ConversationSummary>(baselineLocalIndex.map(entry => [entry.id, entry]));
        // Time-based throttle: yield to the event loop at most once per frame,
        // and push UI updates at most ~10×/second to avoid flooding React's
        // scheduler with hundreds of state updates on large imports.
        let lastYield = Date.now();
        let lastProgressUpdate = Date.now();
        let lastLocalPublish = Date.now();
        const YIELD_INTERVAL = 16; // ~1 frame
        const PROGRESS_INTERVAL = 100;
        const LOCAL_PUBLISH_INTERVAL = 200;

        const publishLocalProgress = (force = false) => {
          const now = Date.now();
          if (!force && now - lastLocalPublish < LOCAL_PUBLISH_INTERVAL) {
            return;
          }
          lastLocalPublish = now;
          const nextLocal = [...progressiveLocalMap.values()].sort((a, b) => b.last_message_time - a.last_message_time);
          startTransition(() => {
            setLocalIndex(nextLocal);
          });
        };

        for (const payload of conversationsToProcess) {
          const conversationAssetsTotal = payload.assetKeys.length;
          let conversationAssetsSaved = 0;

          // Yield to the browser at most once per frame so the UI can breathe,
          // but don't saturate the scheduler with a setTimeout per conversation.
          const now0 = Date.now();
          if (now0 - lastYield >= YIELD_INTERVAL) {
            await new Promise(resolve => window.setTimeout(resolve, 0));
            lastYield = Date.now();
          }

          await saveConversationWithSearchData(db, payload.summary, payload.conversation, payload.assetKeys, payload.searchLines, payload.grams);

          const previousSummary = progressiveLocalMap.get(payload.summary.id);
          const pinnedTime = payload.summary.pinned_time ?? null;
          const nextSummary: ConversationSummary = {
            ...payload.summary,
            source: 'local',
            pinned_time: pinnedTime,
            pinned: pinnedTime !== null,
          };
          if (isNewerSummary(nextSummary, previousSummary)) {
            progressiveLocalMap.set(nextSummary.id, nextSummary);
          }

          const pendingAssetsForConversation: Array<{ key: string; blob: Blob; mime?: string }> = [];
          for (const assetKey of payload.assetKeys) {
            const blob = bundle.assets.get(assetKey);
            if (blob) {
              pendingAssetsForConversation.push({
                key: assetKey,
                blob,
                mime: bundle.assetMime.get(assetKey),
              });
              if (!processedAssetKeys.has(assetKey)) {
                processedAssetKeys.add(assetKey);
                savedAssets += 1;
              }
              conversationAssetsSaved += 1;
            }
          }
          await saveAssetsBatch(db, pendingAssetsForConversation, payload.conversation.id);
          processed += 1;

          // Single throttled update per iteration covering both conversation and
          // asset counters — replaces the two separate setImportProgress calls
          // that previously fired on every conversation.
          const now1 = Date.now();
          const isLast = processed === conversationTotal;
          if (isLast || now1 - lastProgressUpdate >= PROGRESS_INTERVAL) {
            lastProgressUpdate = now1;
            setImportProgress(prev => ({
              ...prev,
              processed,
              assetsProcessed: savedAssets,
              message: buildConversationLabel(processed),
              currentAssetsTotal: isLast ? 0 : conversationAssetsTotal,
              currentAssetsProcessed: isLast ? 0 : conversationAssetsSaved,
            }));
          }
          publishLocalProgress(isLast);
        }
        publishLocalProgress(true);
        if (bundle.extras.generatedAssets?.length) {
          const generatedAssetsToSave: Array<{ key: string; blob: Blob; mime?: string }> = [];
          for (const asset of bundle.extras.generatedAssets) {
            const blob = bundle.assets.get(asset.path);
            if (!blob) {
              continue;
            }
            generatedAssetsToSave.push({ key: asset.path, blob, mime: bundle.assetMime.get(asset.path) });
          }
          await saveAssetsBatch(db, generatedAssetsToSave, GENERATED_ASSET_OWNER_ID);
        }
        localSettings.setImportsAvailable();
        setDbAllowed(true);
        await updateLocalIndex(db);

        const successMessage = formatText(t.importer.successSummary, { count: conversationTotal });
        const toastMessage =
          savedAssets > 0
            ? formatText(t.importer.notifications.importSuccessWithAssets, { count: conversationTotal, assets: savedAssets })
            : formatText(t.importer.notifications.importSuccess, { count: conversationTotal });
        pushNotice(toastMessage, 'success');
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
        });
        return conversationTotal;
      } catch (err) {
        console.error('Import failed', err);
        setError(t.importer.notifications.failed);
        setImportProgress({
          phase: 'error',
          message: t.importer.notifications.failed,
        });
        return 0;
      } finally {
        setImporting(false);
      }
    },
    [ensureDb, localIndex, pushNotice, serverIndex, storageAvailable, t, updateLocalIndex]
  );

  const getConversation = useCallback(
    async (id: string): Promise<Conversation | null> => {
      const serverEntry = serverIndex.find(item => item.id === id);
      const localEntry = localIndex.find(item => item.id === id);
      if (shouldUseLocal(serverEntry, localEntry)) {
        if (!dbAllowed) {
          return null;
        }
        const db = await ensureDb();
        const convo = await getLocalConversation(db, id);
        if (convo) {
          return convo;
        }
        return serverEntry ? fetchServerConversation(id) : null;
      }
      const serverConversation = await fetchServerConversation(id);
      if (serverConversation) {
        return serverConversation;
      }
      if (dbAllowed) {
        const db = await ensureDb();
        return getLocalConversation(db, id);
      }
      return null;
    },
    [dbAllowed, ensureDb, localIndex, serverIndex]
  );

  const getAssetBlobUrl = useCallback(
    async (key: string) => {
      if (!dbAllowed) {
        return null;
      }
      const db = await ensureDb();
      return getAssetUrl(db, key);
    },
    [dbAllowed, ensureDb]
  );

  const exportConversationBundle = useCallback(
    async (id: string) => {
      const conversation = await getConversation(id);
      if (!conversation) {
        pushNotice(t.viewer.conversationNotAvailableExport, 'warning');
        return;
      }

      const summary = mergedIndex.find(item => item.id === id);
      const db = dbAllowed ? dbRef.current ?? (await ensureDb()) : null;
      const resolveAssetBlob = async (assetPath: string) => {
        const normalized = assetPath.replace(/\\/g, '/').replace(/^\/+/, '');
        const dbCandidates = [...new Set([normalized, normalized.replace(/^assets\//, ''), `assets/${normalized.replace(/^assets\//, '')}`])];
        if (db) {
          for (const candidate of dbCandidates) {
            const localBlob = await getAssetBlob(db, candidate);
            if (localBlob) {
              return localBlob;
            }
          }
        }
        for (const candidate of dbCandidates) {
          try {
            const response = await fetch(candidate, { cache: 'no-store' });
            if (response.ok) {
              return await response.blob();
            }
          } catch {
            // Ignore and continue with fallback candidates.
          }
        }
        return null;
      };

      const { blob, assetCount, missingAssets } = await buildConversationBundleZip({
        conversation,
        summary,
        resolveAssetBlob,
      });
      const fileBase = toSafeFileName(summary?.title || conversation.title || id || 'conversation');
      triggerDownload(blob, `${fileBase}.zip`);
      const message = missingAssets.length
        ? formatText(t.viewer.conversationZipExportedPartial, { assets: assetCount, missing: missingAssets.length })
        : formatText(t.viewer.conversationZipExported, { assets: assetCount });
      pushNotice(message, missingAssets.length ? 'warning' : 'success');
    },
    [dbAllowed, ensureDb, getConversation, mergedIndex, pushNotice, t]
  );

  const deleteLocalConversation = useCallback(
    async (id: string) => {
      if (!dbAllowed) {
        pushNotice(t.viewer.conversationDeleteUnavailable, 'warning');
        return;
      }
      const localEntry = localIndex.find(item => item.id === id);
      if (!localEntry) {
        pushNotice(t.viewer.conversationDeleteUnavailable, 'warning');
        return;
      }
      const db = dbRef.current ?? (await ensureDb());
      await deleteConversation(db, id);
      await updateLocalIndex(db);
      pushNotice(t.viewer.conversationDeleted, 'success');
    },
    [dbAllowed, ensureDb, localIndex, pushNotice, t, updateLocalIndex]
  );

  const pinConversation = useCallback(
    async (id: string, pin: boolean) => {
      const mergedEntry = mergedIndex.find(entry => entry.id === id);
      const nextPinnedTime = pin ? (mergedEntry?.pinned_time ?? Date.now()) : null;
      const fallbackSummary: ConversationSummary | undefined = mergedEntry
        ? {
            ...mergedEntry,
            source: 'local' as const,
            pinned_time: nextPinnedTime,
            pinned: nextPinnedTime !== null,
          }
        : undefined;

      setLocalIndex(prev => {
        let matched = false;
        const updated = prev.map(entry => {
          if (entry.id !== id) {
            return entry;
          }
          matched = true;
          return {
            ...entry,
            source: 'local' as const,
            pinned_time: nextPinnedTime,
            pinned: nextPinnedTime !== null,
          };
        });
        if (!matched && fallbackSummary && pin) {
          updated.push(fallbackSummary);
        }
        return updated;
      });

      if (!dbAllowed) {
        return;
      }
      try {
        const db = dbRef.current ?? (await ensureDb());
        const persisted = await setConversationPinned(db, id, pin, pin ? fallbackSummary : undefined);
        if (!persisted) {
          return;
        }
        setLocalIndex(prev => {
          let matched = false;
          const updated = prev.map(entry => {
            if (entry.id !== id) {
              return entry;
            }
            matched = true;
            return { ...persisted };
          });
          if (!matched) {
            updated.push(persisted);
          }
          return updated;
        });
      } catch (err) {
        console.warn('Failed to persist pin preference', err);
      }
    },
    [dbAllowed, ensureDb, mergedIndex]
  );

  const cleanupLocal = useCallback(async () => {
    if (!dbAllowed) {
      return 0;
    }
    const db = await ensureDb();
    const serverMap = new Map(serverIndex.map(entry => [entry.id, entry]));
    let removed = 0;
    for (const local of localIndex) {
      const serverEntry = serverMap.get(local.id);
      if (serverEntry && serverEntry.last_message_time >= local.last_message_time) {
        await deleteConversation(db, local.id);
        removed += 1;
      }
    }
    if (removed) {
      await updateLocalIndex(db);
      pushNotice(`${removed} ${t.data.cleanupRemoved}`, 'success');
    } else {
      pushNotice(t.data.cleanupUpToDate, 'info');
    }
    return removed;
  }, [dbAllowed, ensureDb, localIndex, pushNotice, serverIndex, t, updateLocalIndex]);

  const purgeAll = useCallback(async () => {
    if (!dbAllowed || !dbRef.current) {
      return;
    }
    await purgeDatabase(dbRef.current);
    setLocalIndex([]);
    setMergedIndex(mergeSummaries(serverIndex, []));
    setSearchBundle(null);
    localSettings.clearAll();
    setDbAllowed(true);
    setExtraData({});
    setReferencedAssetKeys(new Set());
    setAssetOwnerIndex({ byAsset: {}, byConversation: {} });
    setStoredAssets([]);
    pushNotice(t.data.purged, 'success');
    if (typeof window !== 'undefined') {
      const { origin, pathname, search } = window.location;
      window.location.replace(`${origin}${pathname}${search}#/`);
    }
  }, [dbAllowed, pushNotice, serverIndex, t]);

  const exportLocalBundle = useCallback(async () => {
    const { setExporting, setExportProgress } = ieSettersRef.current;
    if (!dbAllowed || !dbRef.current) {
      pushNotice(t.exporter.nothingToExport, 'warning');
      return;
    }
    setExporting(true);
    setExportProgress({
      phase: 'preparing',
      message: t.exporter.preparing,
    });
    try {
      const { exportFullWorkingZip } = await import('../lib/exporter');
      await new Promise(resolve => window.setTimeout(resolve, 0));
      const blob = await exportFullWorkingZip(dbRef.current, {
        onProgress(progress) {
          setExportProgress(progress);
        },
      });
      triggerDownload(blob, 'chatgpt-offline-viewer.zip');
      setExportProgress({
        phase: 'complete',
        message: t.exporter.complete,
      });
      pushNotice(t.exporter.exported, 'success');
    } catch (err) {
      console.error('Export failed', err);
      setExportProgress({
        phase: 'error',
        message: t.exporter.exportFailed,
      });
      pushNotice(t.exporter.failed, 'error');
    } finally {
      setExporting(false);
    }
  }, [dbAllowed, pushNotice, t]);

  const refreshDbSize = useCallback(async () => {
    if (!dbAllowed || !storageAvailable) {
      setDbSizeBytes(null);
      return null;
    }
    const db = dbRef.current ?? (await ensureDb());
    const size = await estimateDatabaseSize(db);
    setDbSizeBytes(size);
    return size;
  }, [dbAllowed, ensureDb, storageAvailable]);

  const ensureSearchBundle = useCallback(async () => {
    if (searchBundle) {
      return searchBundle;
    }
    if (dbAllowed) {
      const db = dbRef.current ?? (await ensureDb());
      const summaryMap = Object.fromEntries(mergedIndex.map(item => [item.id, { title: item.title, last_message_time: item.last_message_time }]));
      const bundle = await loadSearchBundleFromDb(db, summaryMap);
      if (Object.keys(bundle.linesByConversation).length) {
        setSearchBundle(bundle);
        return bundle;
      }
    }
    const serverBundle = await fetchServerSearchBundle();
    if (serverBundle) {
      setSearchBundle(serverBundle);
      return serverBundle;
    }
    return null;
  }, [dbAllowed, ensureDb, mergedIndex, searchBundle]);

  const generatedAssets = extraData.generatedAssets?.length ? extraData.generatedAssets : serverGeneratedAssets;

  useEffect(() => {
    if (!dbAllowed) {
      return;
    }
    let cancelled = false;
    async function loadExtrasFromDb() {
      try {
        const db = await ensureDb();
        if (cancelled) {
          return;
        }
        const extras = await loadExtraData(db);
        if (!cancelled) {
          setExtraData(extras);
        }
      } catch (err) {
        console.warn('Failed to load extra data', err);
      }
    }
    void loadExtrasFromDb();
    return () => {
      cancelled = true;
    };
  }, [dbAllowed, ensureDb]);

  useEffect(() => {
    let cancelled = false;
    async function loadServerGenerated() {
      const generated = await fetchServerGeneratedAssets();
      if (!cancelled) {
        setServerGeneratedAssets(generated);
      }
    }
    void loadServerGenerated();
    return () => {
      cancelled = true;
    };
  }, []);

  const value: AppDataContextValue = useMemo(
    () => ({
      status,
      error,
      serverIndex,
      localIndex,
      mergedIndex,
      storageAvailable,
      dbSizeBytes,
      refreshDbSize,
      importZips,
      getConversation,
      getAssetBlobUrl,
      exportConversationBundle,
      deleteLocalConversation,
      pinConversation,
      setScrollPosition,
      getScrollPosition,
      cleanupLocal,
      purgeAll,
      exportLocalBundle,
      ensureSearchBundle,
      extraData,
      generatedAssets,
      referencedAssetKeys,
      assetOwnerIndex,
      storedAssets,
    }),
    [
      status,
      error,
      serverIndex,
      localIndex,
      mergedIndex,
      storageAvailable,
      dbSizeBytes,
      refreshDbSize,
      importZips,
      getConversation,
      getAssetBlobUrl,
      exportConversationBundle,
      deleteLocalConversation,
      pinConversation,
      setScrollPosition,
      getScrollPosition,
      cleanupLocal,
      purgeAll,
      exportLocalBundle,
      ensureSearchBundle,
      extraData,
      generatedAssets,
      referencedAssetKeys,
      assetOwnerIndex,
      storedAssets,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
