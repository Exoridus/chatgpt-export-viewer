import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { translations } from '../../src/lib/i18n'
import { GalleryRoute } from '../../src/routes/GalleryRoute'
import type { GeneratedAsset } from '../../src/types'

const appState: {
  generatedAssets: GeneratedAsset[]
  storedAssets: Array<{ key: string; size: number; mime?: string }>
  assetOwnerIndex: { byAsset: Record<string, string[]>; byConversation: Record<string, string[]> }
  mergedIndex: Array<{ id: string; title: string }>
  referencedAssetKeys: Set<string>
} = {
  generatedAssets: [],
  storedAssets: [],
  assetOwnerIndex: { byAsset: {}, byConversation: {} },
  mergedIndex: [],
  referencedAssetKeys: new Set<string>(),
}

vi.mock('../../src/components/viewer/GeneratedGallery', () => ({
  GeneratedGallery: ({ assets }: { assets: GeneratedAsset[] }) => (
    <ul data-testid="gallery-list">
      {assets.map((asset) => (
        <li key={asset.path}>{asset.fileName}</li>
      ))}
    </ul>
  ),
}))

vi.mock('../../src/state/AppDataContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/AppDataContext')>('../../src/state/AppDataContext')
  return {
    ...actual,
    useAppData: () => ({
      generatedAssets: appState.generatedAssets,
      storedAssets: appState.storedAssets,
      assetOwnerIndex: appState.assetOwnerIndex,
      mergedIndex: appState.mergedIndex,
      referencedAssetKeys: appState.referencedAssetKeys,
    }),
  }
})

vi.mock('../../src/state/PreferencesContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/PreferencesContext')>('../../src/state/PreferencesContext')
  return {
    ...actual,
    usePreferences: () => ({
      viewerPreferences: {
        locale: 'auto',
        appTheme: 'system',
        codeTheme: 'a11yDark',
        collapseSystemMessages: true,
        collapseCodeBlocks: false,
      },
      setViewerPreferences: vi.fn(),
      locale: 'en',
      t: translations.en,
    }),
  }
})

describe('GalleryRoute regression', () => {
  beforeEach(() => {
    appState.generatedAssets = [
      { path: 'assets/linked-pointer.png', fileName: 'linked-pointer.png', pointers: ['ptr-a'] },
      { path: 'assets/linked-ref.png', fileName: 'linked-ref.png' },
      { path: 'assets/unlinked.png', fileName: 'unlinked.png' },
    ]
    appState.storedAssets = []
    appState.assetOwnerIndex = { byAsset: {}, byConversation: {} }
    appState.mergedIndex = []
    appState.referencedAssetKeys = new Set(['assets/linked-ref.png'])
  })

  it('uses All as default and switches linked/unlinked filters with correct counts and selected state', () => {
    render(<GalleryRoute />)

    const allTab = screen.getByRole('tab', { name: `All (${appState.generatedAssets.length})` })
    const linkedTab = screen.getByRole('tab', { name: `In conversations (2)` })
    const unlinkedTab = screen.getByRole('tab', { name: `Unlinked (1)` })

    expect(allTab).toHaveAttribute('aria-selected', 'true')
    expect(linkedTab).toHaveAttribute('aria-selected', 'false')
    expect(unlinkedTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('linked-pointer.png')).toBeInTheDocument()
    expect(screen.getByText('linked-ref.png')).toBeInTheDocument()
    expect(screen.getByText('unlinked.png')).toBeInTheDocument()

    fireEvent.click(linkedTab)
    expect(allTab).toHaveAttribute('aria-selected', 'false')
    expect(linkedTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('linked-pointer.png')).toBeInTheDocument()
    expect(screen.getByText('linked-ref.png')).toBeInTheDocument()
    expect(screen.queryByText('unlinked.png')).not.toBeInTheDocument()

    fireEvent.click(unlinkedTab)
    expect(unlinkedTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('unlinked.png')).toBeInTheDocument()
    expect(screen.queryByText('linked-pointer.png')).not.toBeInTheDocument()
    expect(screen.queryByText('linked-ref.png')).not.toBeInTheDocument()
  })
})
