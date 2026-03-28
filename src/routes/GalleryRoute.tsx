import { useMemo, useState } from 'react'

import { GeneratedGallery } from '../components/viewer/GeneratedGallery'
import { useAppData } from '../state/AppDataContext'
import { usePreferences } from '../state/PreferencesContext'
import type { GeneratedAsset } from '../types'
import styles from './GalleryRoute.module.scss'

type GalleryFilter = 'linked' | 'unlinked'

export function GalleryRoute() {
  const { generatedAssets, referencedAssetKeys } = useAppData()
  const { t } = usePreferences()
  const [filter, setFilter] = useState<GalleryFilter>('linked')

  const [referenced, unreferenced] = useMemo(() => {
    const referencedList: GeneratedAsset[] = []
    const orphanList: GeneratedAsset[] = []
    generatedAssets.forEach((asset) => {
      const isLinked = (asset.pointers && asset.pointers.length > 0) || isAssetReferenced(asset.path, referencedAssetKeys)
      if (isLinked) {
        referencedList.push(asset)
      } else {
        orphanList.push(asset)
      }
    })
    return [referencedList, orphanList]
  }, [generatedAssets, referencedAssetKeys])

  const filtered = filter === 'linked' ? referenced : unreferenced

  return (
    <section className={styles.route}>
      <div className={styles.header}>
        <div>
          <h2>{t.gallery.title}</h2>
          <p>{generatedAssets.length} {t.gallery.totalItems}</p>
        </div>
        <div className={styles.filter} role="tablist" aria-label={`${t.gallery.title} filter`}>
          <button
            type="button"
            className={filter === 'linked' ? `${styles.filterButton} ${styles.filterButtonActive}` : styles.filterButton}
            onClick={() => setFilter('linked')}
            title="Items used inside conversations"
          >
            {t.gallery.linked} ({referenced.length})
          </button>
          <button
            type="button"
            className={filter === 'unlinked' ? `${styles.filterButton} ${styles.filterButtonActive}` : styles.filterButton}
            onClick={() => setFilter('unlinked')}
            title="Items without active conversation links"
          >
            {t.gallery.unlinked} ({unreferenced.length})
          </button>
        </div>
      </div>
      {filtered.length ? <GeneratedGallery assets={filtered} /> : <p className={styles.empty}>{t.gallery.empty}</p>}
    </section>
  )
}

function isAssetReferenced(path: string, referencedAssetKeys: Set<string>): boolean {
  const normalized = normalizeAssetPath(path)
  if (referencedAssetKeys.has(normalized)) {return true}
  const withoutPrefix = normalized.replace(/^assets\//, '')
  if (referencedAssetKeys.has(withoutPrefix)) {return true}
  const withPrefix = normalized.startsWith('assets/') ? normalized : `assets/${normalized}`
  if (referencedAssetKeys.has(withPrefix)) {return true}
  return false
}

function normalizeAssetPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '')
}
