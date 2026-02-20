import type { GeneratedAsset } from '../../types'
import { AssetBlock } from './AssetBlock'

interface GeneratedGalleryProps {
  assets: GeneratedAsset[]
}

export function GeneratedGallery({ assets }: GeneratedGalleryProps) {
  return (
    <div className="generated-gallery">
      {assets.map((asset) => (
        <div className="generated-card" key={asset.path}>
          <div className="generated-card-preview">
            <AssetBlock
              assetPointer={asset.pointers?.[0] ?? asset.path}
              assetKey={asset.path}
              mediaType={detectMediaType(asset.path)}
              alt={asset.fileName}
            />
          </div>
          <div className="generated-card-footer">
            <div className="generated-card-meta">
              <span className="generated-card-name" title={asset.fileName}>
                {asset.fileName}
              </span>
              {asset.size !== null && asset.size !== undefined && <span className="generated-card-size">{formatBytes(asset.size)}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function detectMediaType(path: string): 'image' | 'video' | 'audio' | 'file' {
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path)) {return 'image'}
  if (/\.(mp4|webm|mov)$/i.test(path)) {return 'video'}
  if (/\.(mp3|wav|m4a)$/i.test(path)) {return 'audio'}
  return 'file'
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) {return ''}
  if (value < 1024) {return `${value} B`}
  const units = ['KB', 'MB', 'GB']
  let size = value / 1024
  let unit = units[0]
  for (let i = 0; i < units.length; i += 1) {
    unit = units[i]
    if (size < 1024 || i === units.length - 1) {break}
    size /= 1024
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`
}
