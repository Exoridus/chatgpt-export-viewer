import { useMemo, useState } from 'react';

import { GeneratedGallery } from '../components/viewer/GeneratedGallery';
import { buildGalleryItems,type GalleryItem, type GalleryItemKind } from '../lib/gallery';
import { useAppData } from '../state/AppDataContext';
import { usePreferences } from '../state/PreferencesContext';
import styles from './GalleryRoute.module.scss';

type LinkFilter = 'all' | 'linked' | 'unlinked';
type OriginFilter = 'all' | 'generated' | 'uploaded';

export function GalleryRoute() {
  const { generatedAssets, storedAssets, assetOwnerIndex, mergedIndex, referencedAssetKeys } = useAppData();
  const { t } = usePreferences();
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | GalleryItemKind>('all');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [conversationFilter, setConversationFilter] = useState('all');

  const items = useMemo(
    () =>
      buildGalleryItems({
        generatedAssets,
        storedAssets,
        ownerIndex: assetOwnerIndex,
        referencedAssetKeys,
      }),
    [assetOwnerIndex, generatedAssets, referencedAssetKeys, storedAssets]
  );

  const [linkedItems, unlinkedItems] = useMemo(() => {
    const linked: GalleryItem[] = [];
    const unlinked: GalleryItem[] = [];
    items.forEach(item => {
      if (item.linked) {
        linked.push(item);
      } else {
        unlinked.push(item);
      }
    });
    return [linked, unlinked];
  }, [items]);

  const conversationOptions = useMemo(() => {
    const linkedIds = new Set(items.flatMap(item => item.linkedConversationIds));
    return mergedIndex
      .filter(item => linkedIds.has(item.id))
      .map(item => ({
        id: item.id,
        title: item.title,
      }));
  }, [items, mergedIndex]);

  const filtered = useMemo(() => {
    let next = items;
    if (linkFilter === 'linked') {
      next = linkedItems;
    } else if (linkFilter === 'unlinked') {
      next = unlinkedItems;
    }
    if (typeFilter !== 'all') {
      next = next.filter(item => item.kind === typeFilter);
    }
    if (originFilter !== 'all') {
      next = next.filter(item => item.origin === originFilter);
    }
    if (conversationFilter !== 'all') {
      next = next.filter(item => item.linkedConversationIds.includes(conversationFilter));
    }
    return next;
  }, [conversationFilter, items, linkedItems, linkFilter, originFilter, typeFilter, unlinkedItems]);

  return (
    <section className={styles.route}>
      <div className={styles.header}>
        <div>
          <h2>{t.gallery.title}</h2>
          <p>{t.gallery.overview}</p>
          <p>
            {items.length} {t.gallery.totalItems}
          </p>
        </div>
        <div className={styles.filter} role="tablist" aria-label={t.gallery.filterLabel}>
          <button
            type="button"
            role="tab"
            aria-selected={linkFilter === 'all'}
            className={linkFilter === 'all' ? `${styles.filterButton} ${styles.filterButtonActive}` : styles.filterButton}
            onClick={() => setLinkFilter('all')}
            title={t.gallery.allTitle}
          >
            {t.nav.all} ({items.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={linkFilter === 'linked'}
            className={linkFilter === 'linked' ? `${styles.filterButton} ${styles.filterButtonActive}` : styles.filterButton}
            onClick={() => setLinkFilter('linked')}
            title={t.gallery.linkedTitle}
          >
            {t.gallery.linked} ({linkedItems.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={linkFilter === 'unlinked'}
            className={linkFilter === 'unlinked' ? `${styles.filterButton} ${styles.filterButtonActive}` : styles.filterButton}
            onClick={() => setLinkFilter('unlinked')}
            title={t.gallery.unlinkedTitle}
          >
            {t.gallery.unlinked} ({unlinkedItems.length})
          </button>
        </div>
      </div>

      <div className={styles.controls}>
        <label className={styles.control}>
          <span>{t.gallery.kindLabel}</span>
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value as 'all' | GalleryItemKind)}>
            <option value="all">{t.gallery.kindAll}</option>
            <option value="image">{t.gallery.kindImage}</option>
            <option value="video">{t.gallery.kindVideo}</option>
            <option value="audio">{t.gallery.kindAudio}</option>
            <option value="code">{t.gallery.kindCode}</option>
            <option value="document">{t.gallery.kindDocument}</option>
          </select>
        </label>
        <label className={styles.control}>
          <span>{t.gallery.originLabel}</span>
          <select value={originFilter} onChange={event => setOriginFilter(event.target.value as OriginFilter)}>
            <option value="all">{t.gallery.originAll}</option>
            <option value="generated">{t.gallery.originGenerated}</option>
            <option value="uploaded">{t.gallery.originUploaded}</option>
          </select>
        </label>
        <label className={styles.control}>
          <span>{t.gallery.conversationLabel}</span>
          <select value={conversationFilter} onChange={event => setConversationFilter(event.target.value)}>
            <option value="all">{t.gallery.conversationAll}</option>
            {conversationOptions.map(option => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length ? <GeneratedGallery assets={filtered} /> : <p className={styles.empty}>{t.gallery.empty}</p>}
    </section>
  );
}
