import { strToU8, zipSync } from 'fflate';
import type { IDBPDatabase, StoreNames } from 'idb';

import type { ConversationSummary, ExportExtraData } from '../types';
import type { SearchBundle } from '../types/search';
import type { AssetRecord, ConversationRecord, ViewerDB } from './db';
import { loadExtraData, loadSearchBundleFromDb, openViewerDatabase } from './db';

interface ManifestEntry {
  file?: string;
  css?: string[];
  assets?: string[];
}

export interface ExportProgressState {
  phase: 'idle' | 'preparing' | 'packaging' | 'compressing' | 'complete' | 'error';
  message: string;
  total?: number;
  processed?: number;
}

export interface ExportBundleData {
  indexRows: ConversationSummary[];
  conversationRows: ConversationRecord[];
  assetRows: AssetRecord[];
  searchBundle: SearchBundle;
  extras: ExportExtraData;
  appFiles: Record<string, Uint8Array>;
}

export async function exportFullWorkingZip(db: IDBPDatabase<ViewerDB>, options: { onProgress?: (progress: ExportProgressState) => void } = {}): Promise<Blob> {
  if (typeof Worker !== 'undefined') {
    const { buildExportZipInWorker } = await import('./exportWorkerClient');
    return buildExportZipInWorker(options);
  }
  options.onProgress?.({
    phase: 'preparing',
    message: 'Reading conversations and assets from IndexedDB…',
  });
  const bundle = await collectExportBundleData(db, options);
  return buildExportArchiveBlob(bundle, options);
}

export async function exportFullWorkingZipFromDatabase(options: { onProgress?: (progress: ExportProgressState) => void } = {}): Promise<Blob> {
  const db = await openViewerDatabase();
  options.onProgress?.({
    phase: 'preparing',
    message: 'Reading conversations and assets from IndexedDB…',
  });
  const bundle = await collectExportBundleData(db, options);
  return buildExportArchiveBlob(bundle, options);
}

export async function collectExportBundleData(
  db: IDBPDatabase<ViewerDB>,
  options: { onProgress?: (progress: ExportProgressState) => void } = {}
): Promise<ExportBundleData> {
  const [indexCount, conversationCount, assetCount] = await Promise.all([db.count('index'), db.count('conversations'), db.count('assets')]);
  const total = indexCount + conversationCount + assetCount;
  let processed = 0;
  const emitPreparing = (message: string) => {
    options.onProgress?.({
      phase: 'preparing',
      message,
      total,
      processed,
    });
  };

  const indexRows = await readStoreByCursor(db, 'index', count => {
    processed = count;
    emitPreparing(`Reading conversation index ${Math.min(count, indexCount)}/${indexCount}…`);
  });

  const conversationRows = await readStoreByCursor(db, 'conversations', count => {
    processed = indexCount + count;
    emitPreparing(`Reading conversation payloads ${Math.min(count, conversationCount)}/${conversationCount}…`);
  });

  const assetRows = await readStoreByCursor(db, 'assets', count => {
    processed = indexCount + conversationCount + count;
    emitPreparing(`Reading assets ${Math.min(count, assetCount)}/${assetCount}…`);
  });

  const summaryMap = Object.fromEntries(
    indexRows.map((row: ConversationSummary) => [row.id, { title: row.title, last_message_time: row.last_message_time }] as const)
  );
  emitPreparing('Preparing search index and metadata…');
  const [searchBundle, extras, appFiles] = await Promise.all([loadSearchBundleFromDb(db, summaryMap), loadExtraData(db), fetchAppFiles()]);
  return {
    indexRows,
    conversationRows,
    assetRows: assetRows as AssetRecord[],
    searchBundle,
    extras,
    appFiles,
  };
}

export async function buildExportArchiveBlob(bundle: ExportBundleData, options: { onProgress?: (progress: ExportProgressState) => void } = {}): Promise<Blob> {
  const files = await buildExportFiles(bundle, options);
  options.onProgress?.({
    phase: 'compressing',
    message: 'Compressing offline viewer ZIP…',
  });
  const zipped = zipSync(files, { level: 6 });
  return new Blob([bufferFromU8(zipped)], { type: 'application/zip' });
}

export async function buildExportFiles(
  bundle: ExportBundleData,
  options: { onProgress?: (progress: ExportProgressState) => void } = {}
): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  files['conversations.json'] = strToU8(JSON.stringify(bundle.indexRows, null, 2));

  const total = bundle.conversationRows.length + bundle.assetRows.length;
  let processed = 0;
  const emitProgress = (message: string) => {
    options.onProgress?.({
      phase: 'packaging',
      message,
      total,
      processed,
    });
  };

  emitProgress('Packaging conversations…');
  for (const row of bundle.conversationRows) {
    const path = `conversations/${row.id}/conversation.json`;
    files[path] = strToU8(JSON.stringify(row.conversationSlim, null, 2));
    processed += 1;
    if (processed === bundle.conversationRows.length || processed % 20 === 0) {
      emitProgress(`Packaging conversations ${Math.min(processed, bundle.conversationRows.length)}/${bundle.conversationRows.length}…`);
      await yieldToMainThread();
    }
  }

  emitProgress('Packaging assets…');
  for (const asset of bundle.assetRows) {
    const arrayBuffer = await asset.blob.arrayBuffer();
    files[asset.key] = new Uint8Array(arrayBuffer);
    processed += 1;
    if (processed === total || processed % 20 === 0) {
      emitProgress(`Packaging assets ${Math.max(processed - bundle.conversationRows.length, 0)}/${bundle.assetRows.length}…`);
      await yieldToMainThread();
    }
  }

  files['search_index.json'] = strToU8(JSON.stringify(bundle.searchBundle));
  appendExtraFiles(files, bundle.extras);
  Object.assign(files, bundle.appFiles);
  return files;
}

async function fetchAppFiles(): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const manifest = await fetch('./manifest.json')
    .then(response => response.json() as Promise<Record<string, ManifestEntry>>)
    .catch(() => null);
  const toFetch: string[] = ['index.html', 'favicon.svg', '404.html'];

  if (manifest) {
    Object.values(manifest).forEach(entry => {
      if (entry.file) {
        toFetch.push(entry.file);
      }
      if (entry.css) {
        toFetch.push(...entry.css);
      }
      if (entry.assets) {
        toFetch.push(...entry.assets);
      }
    });
  } else {
    // Fallback: try to find script/link tags in current document
    const scripts = [...document.querySelectorAll('script[src]')].map(s => (s as HTMLScriptElement).src);
    const links = [...document.querySelectorAll('link[href]')].map(l => (l as HTMLLinkElement).href);
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');

    scripts.concat(links).forEach(url => {
      if (url.startsWith(baseUrl)) {
        toFetch.push(url.replace(baseUrl, ''));
      }
    });
  }

  await Promise.all(
    [...new Set(toFetch)].map(async path => {
      try {
        const response = await fetch(`./${path}`);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          files[path] = new Uint8Array(buffer);
        }
      } catch {
        console.warn(`Failed to fetch ${path} for bundling`);
      }
    })
  );
  return files;
}

function appendExtraFiles(files: Record<string, Uint8Array>, extras: ExportExtraData) {
  const append = (target: string, data?: unknown) => {
    if (data === undefined) {
      return;
    }
    files[target] = strToU8(JSON.stringify(data, null, 2));
  };
  append('user.json', extras.user);
  append('message_feedback.json', extras.messageFeedback);
  append('group_chats.json', extras.groupChats);
  append('shopping.json', extras.shopping);
  append('basispoints.json', extras.basisPoints);
  append('sora.json', extras.sora);
  append('generated_files.json', extras.generatedAssets);
}

function bufferFromU8(view: Uint8Array): ArrayBuffer {
  return (view.buffer as ArrayBuffer).slice(view.byteOffset, view.byteOffset + view.byteLength);
}

async function yieldToMainThread(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function readStoreByCursor<T extends StoreNames<ViewerDB>>(
  db: IDBPDatabase<ViewerDB>,
  storeName: T,
  onProgress: (count: number) => void
): Promise<Array<ViewerDB[T]['value']>> {
  const values: Array<ViewerDB[T]['value']> = [];
  const tx = db.transaction(storeName, 'readonly');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    values.push(cursor.value as ViewerDB[T]['value']);
    if (values.length % 25 === 0) {
      onProgress(values.length);
      await yieldToMainThread();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  onProgress(values.length);
  return values;
}
