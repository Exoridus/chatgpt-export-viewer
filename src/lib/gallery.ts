import type { Conversation, GeneratedAsset } from '../types';
import type { AssetCatalogEntry, AssetOwnerIndex } from './db';

export type GalleryItemKind = 'image' | 'video' | 'audio' | 'code' | 'document';
export type GalleryItemOrigin = 'generated' | 'uploaded';

export interface GalleryItem extends GeneratedAsset {
  id: string;
  kind: GalleryItemKind;
  origin: GalleryItemOrigin;
  linkedConversationIds: string[];
  linked: boolean;
}

interface BuildGalleryItemsOptions {
  generatedAssets?: GeneratedAsset[];
  storedAssets?: AssetCatalogEntry[];
  ownerIndex?: AssetOwnerIndex;
  referencedAssetKeys?: Set<string>;
}

export function buildGalleryItems({
  generatedAssets = [],
  storedAssets = [],
  ownerIndex = { byAsset: {}, byConversation: {} },
  referencedAssetKeys,
}: BuildGalleryItemsOptions): GalleryItem[] {
  const generatedByIdentity = new Map<string, GeneratedAsset>();
  generatedAssets.forEach(asset => {
    const normalizedPath = normalizeAssetPath(asset.path);
    if (!normalizedPath) {
      return;
    }
    generatedByIdentity.set(toIdentityPath(normalizedPath), {
      ...asset,
      path: normalizedPath,
      fileName: asset.fileName || normalizedPath.split('/').pop() || normalizedPath,
    });
  });

  const storedByIdentity = new Map<string, AssetCatalogEntry>();
  storedAssets.forEach(asset => {
    const normalizedPath = normalizeAssetPath(asset.key);
    if (!normalizedPath) {
      return;
    }
    storedByIdentity.set(toIdentityPath(normalizedPath), {
      ...asset,
      key: normalizedPath,
    });
  });

  const ownerLookup = buildOwnerLookup(ownerIndex.byAsset);
  const referencedIdentitySet = new Set<string>();
  referencedAssetKeys?.forEach(key => {
    const normalized = normalizeAssetPath(key);
    if (!normalized) {
      return;
    }
    collectPathVariants(normalized).forEach(variant => referencedIdentitySet.add(toIdentityPath(variant)));
  });
  const allIds = new Set([...generatedByIdentity.keys(), ...storedByIdentity.keys()]);
  const items: GalleryItem[] = [];

  for (const id of allIds) {
    const generated = generatedByIdentity.get(id);
    const stored = storedByIdentity.get(id);
    const path = generated?.path ?? stored?.key;
    if (!path) {
      continue;
    }
    const linkedConversationIds = resolveOwners(path, ownerLookup);
    const linkedByReference = collectPathVariants(path).some(variant => referencedIdentitySet.has(toIdentityPath(variant)));
    const linkedByPointer = (generated?.pointers?.length ?? 0) > 0;
    const linked = linkedConversationIds.length > 0 || linkedByReference || linkedByPointer;
    items.push({
      id,
      path,
      fileName: generated?.fileName || path.split('/').pop() || path,
      size: generated?.size ?? stored?.size,
      mime: generated?.mime ?? stored?.mime,
      pointers: generated?.pointers,
      createdAt: generated?.createdAt ?? generated?.create_time,
      updatedAt: generated?.updatedAt ?? generated?.update_time,
      kind: detectGalleryKind(path, generated?.mime ?? stored?.mime),
      origin: generated ? 'generated' : 'uploaded',
      linkedConversationIds,
      linked,
    });
  }

  return items.sort((a, b) => {
    const aTime = resolveGallerySortTime(a);
    const bTime = resolveGallerySortTime(b);
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    return a.fileName.localeCompare(b.fileName);
  });
}

export function buildConversationGalleryItems(conversation: Conversation, allItems: GalleryItem[]): GalleryItem[] {
  const assetMap = conversation.assetsMap ?? {};
  const linkedPaths = new Set(
    Object.values(assetMap)
      .map(path => normalizeAssetPath(path))
      .filter((path): path is string => Boolean(path))
  );
  const pointers = new Set(Object.keys(assetMap));

  return allItems.filter(item => {
    if (linkedPaths.has(normalizeAssetPath(item.path))) {
      return true;
    }
    if (item.linkedConversationIds.includes(conversation.id)) {
      return true;
    }
    return item.pointers?.some(pointer => pointers.has(pointer)) ?? false;
  });
}

export function resolveGallerySortTime(item: GeneratedAsset): number {
  const updated = normalizeTimestamp(item.updatedAt ?? item.update_time);
  if (updated !== null) {
    return updated;
  }
  const created = normalizeTimestamp(item.createdAt ?? item.create_time);
  if (created !== null) {
    return created;
  }
  return 0;
}

export function normalizeAssetPath(path: string): string {
  const normalized = path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/[?#].*$/, '')
    .trim();
  if (!normalized) {
    return '';
  }
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function toIdentityPath(path: string): string {
  return path.replace(/^assets\//, '').toLowerCase();
}

function buildOwnerLookup(byAsset: Record<string, string[]>): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  Object.entries(byAsset).forEach(([rawPath, owners]) => {
    const normalized = normalizeAssetPath(rawPath);
    if (!normalized) {
      return;
    }
    const normalizedOwners = [...new Set(owners.filter(owner => owner.trim().length > 0))];
    const variants = collectPathVariants(normalized);
    variants.forEach(variant => lookup.set(variant, normalizedOwners));
  });
  return lookup;
}

function resolveOwners(path: string, lookup: Map<string, string[]>): string[] {
  const variants = collectPathVariants(path);
  for (const variant of variants) {
    const owners = lookup.get(variant);
    if (owners?.length) {
      return owners;
    }
  }
  return [];
}

function collectPathVariants(path: string): string[] {
  const normalized = normalizeAssetPath(path).toLowerCase();
  if (!normalized) {
    return [];
  }
  const withoutAssets = normalized.replace(/^assets\//, '');
  const withAssets = normalized.startsWith('assets/') ? normalized : `assets/${withoutAssets}`;
  const segments = withoutAssets.split('/').filter(Boolean);
  const tailTwo = segments.length > 1 ? segments.slice(-2).join('/') : withoutAssets;
  const fileName = segments[segments.length - 1] ?? withoutAssets;
  return [...new Set([normalized, withoutAssets, withAssets, tailTwo, fileName])];
}

function detectGalleryKind(path: string, mime?: string): GalleryItemKind {
  const normalizedMime = (mime ?? '').toLowerCase();
  const normalizedPath = path.toLowerCase();
  if (normalizedMime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(normalizedPath)) {
    return 'image';
  }
  if (normalizedMime.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(normalizedPath)) {
    return 'video';
  }
  if (normalizedMime.startsWith('audio/') || /\.(mp3|wav|m4a)$/i.test(normalizedPath)) {
    return 'audio';
  }
  if (isCodeLike(path, mime)) {
    return 'code';
  }
  return 'document';
}

function isCodeLike(path: string, mime?: string): boolean {
  const normalizedMime = (mime ?? '').toLowerCase();
  if (
    normalizedMime.startsWith('text/') ||
    normalizedMime.includes('json') ||
    normalizedMime.includes('javascript') ||
    normalizedMime.includes('typescript') ||
    normalizedMime.includes('xml') ||
    normalizedMime.includes('yaml') ||
    normalizedMime.includes('toml')
  ) {
    return true;
  }
  return /\.(txt|md|markdown|json|js|jsx|ts|tsx|css|scss|sass|html|xml|yml|yaml|toml|ini|sh|bash|ps1|py|sql|go|php|lua)$/i.test(path.toLowerCase());
}

function normalizeTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}
