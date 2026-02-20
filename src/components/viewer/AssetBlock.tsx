import clsx from 'clsx'
import { FileIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAppData } from '../../state/AppDataContext'

interface AssetBlockProps {
  assetPointer: string
  assetKey?: string
  mediaType?: 'image' | 'audio' | 'video' | 'file'
  alt?: string
}

export function AssetBlock({ assetPointer, assetKey, mediaType = 'file', alt }: AssetBlockProps) {
  const { getAssetBlobUrl } = useAppData()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      if (!assetKey) {return}
      const localUrl = await getAssetBlobUrl(assetKey)
      if (!cancelled) {
        setUrl(localUrl ?? buildServerAssetPath(assetKey))
      }
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [assetKey, getAssetBlobUrl])

  if (!assetKey) {
    return <div className="asset-block missing">Missing asset {assetPointer}</div>
  }

  const resolvedUrl = url ?? buildServerAssetPath(assetKey)

  if (mediaType === 'image') {
    return <img src={resolvedUrl} alt={alt || assetPointer} className="asset-image" loading="lazy" />
  }
  if (mediaType === 'video') {
    return (
      <video controls className="asset-video">
        <source src={resolvedUrl} />
      </video>
    )
  }
  if (mediaType === 'audio') {
    return (
      <audio controls className="asset-audio">
        <source src={resolvedUrl} />
      </audio>
    )
  }
  return (
    <a className={clsx('asset-file')} href={resolvedUrl} download>
      <FileIcon size={16} /> Download {alt || assetPointer}
    </a>
  )
}

function buildServerAssetPath(assetKey: string): string {
  if (!assetKey) {return ''}
  return assetKey.startsWith('assets/') ? assetKey : `assets/${assetKey}`
}
