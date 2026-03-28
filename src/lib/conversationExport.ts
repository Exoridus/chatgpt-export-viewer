import { strToU8, zipSync } from 'fflate';

import type { Conversation, ConversationSummary } from '../types';

interface BuildConversationBundleOptions {
  conversation: Conversation;
  summary?: ConversationSummary;
  resolveAssetBlob: (assetPath: string) => Promise<Blob | null>;
}

interface BuildConversationBundleResult {
  blob: Blob;
  assetCount: number;
  missingAssets: string[];
}

export async function buildConversationBundleZip({
  conversation,
  summary,
  resolveAssetBlob,
}: BuildConversationBundleOptions): Promise<BuildConversationBundleResult> {
  const files: Record<string, Uint8Array> = {};
  files['conversation.json'] = strToU8(JSON.stringify(conversation, null, 2));
  if (summary) {
    files['conversation-summary.json'] = strToU8(JSON.stringify(summary, null, 2));
  }

  const assetPaths = [...new Set(Object.values(conversation.assetsMap ?? {}))].filter(path => typeof path === 'string' && path.trim().length > 0);
  const missingAssets: string[] = [];
  let assetCount = 0;

  for (const assetPath of assetPaths) {
    const blob = await resolveAssetBlob(assetPath);
    if (!blob) {
      missingAssets.push(assetPath);
      continue;
    }
    const assetZipPath = `assets/${normalizeAssetPath(assetPath)}`;
    const buffer = await blob.arrayBuffer();
    files[assetZipPath] = new Uint8Array(buffer);
    assetCount += 1;
  }

  if (missingAssets.length > 0) {
    files['missing-assets.json'] = strToU8(JSON.stringify(missingAssets, null, 2));
  }

  const zipped = zipSync(files, { level: 6 });
  return {
    blob: new Blob([toArrayBuffer(zipped)], { type: 'application/zip' }),
    assetCount,
    missingAssets,
  };
}

function normalizeAssetPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^assets\//, '').trim();
  return normalized || 'unknown';
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const start = view.byteOffset;
  const end = view.byteOffset + view.byteLength;
  return (view.buffer as ArrayBuffer).slice(start, end);
}
