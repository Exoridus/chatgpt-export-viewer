import { useMemo, useState } from 'react'

import { GeneratedGallery } from '../components/viewer/GeneratedGallery'
import { useAppData } from '../state/AppDataContext'
import type { GeneratedAsset } from '../types'

type GalleryFilter = 'linked' | 'unlinked'

export function GalleryRoute() {
  const { generatedAssets } = useAppData()
  const [filter, setFilter] = useState<GalleryFilter>('linked')

  const [referenced, unreferenced] = useMemo(() => {
    const referencedList: GeneratedAsset[] = []
    const orphanList: GeneratedAsset[] = []
    generatedAssets.forEach((asset) => {
      if (asset.pointers && asset.pointers.length) {
        referencedList.push(asset)
      } else {
        orphanList.push(asset)
      }
    })
    return [referencedList, orphanList]
  }, [generatedAssets])

  const filtered = filter === 'linked' ? referenced : unreferenced

  return (
    <section className="generated-route">
      <div className="generated-header">
        <div>
          <h2>Gallery</h2>
          <p>{generatedAssets.length} total items</p>
        </div>
        <div className="gallery-filter" role="tablist" aria-label="Gallery filter">
          <button
            type="button"
            className={filter === 'linked' ? 'is-active' : undefined}
            onClick={() => setFilter('linked')}
            title="Items used inside conversations"
          >
            In conversations ({referenced.length})
          </button>
          <button
            type="button"
            className={filter === 'unlinked' ? 'is-active' : undefined}
            onClick={() => setFilter('unlinked')}
            title="Items without active conversation links"
          >
            Unlinked ({unreferenced.length})
          </button>
        </div>
      </div>
      {filtered.length ? <GeneratedGallery assets={filtered} /> : <p className="generated-empty">No assets in this category yet.</p>}
    </section>
  )
}
