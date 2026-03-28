import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
  generatedAssets: [
    { path: 'assets/verbunden-pointer.png', fileName: 'verbunden-pointer.png', pointers: ['ptr-de'] },
    { path: 'assets/verbunden-ref.png', fileName: 'verbunden-ref.png' },
    { path: 'assets/nicht-verbunden.png', fileName: 'nicht-verbunden.png' },
  ],
  storedAssets: [],
  assetOwnerIndex: { byAsset: {}, byConversation: {} },
  mergedIndex: [],
  referencedAssetKeys: new Set(['assets/verbunden-ref.png']),
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
        locale: 'de',
        appTheme: 'system',
        codeTheme: 'a11yDark',
        collapseSystemMessages: true,
        collapseCodeBlocks: false,
      },
      setViewerPreferences: vi.fn(),
      locale: 'de',
      t: translations.de,
    }),
  }
})

describe('GalleryRoute German locale regression', () => {
  it('renders filter labels in German and keeps all/linked/unlinked behavior intact', () => {
    render(<GalleryRoute />)

    expect(screen.getByRole('heading', { name: translations.de.gallery.title })).toBeInTheDocument()

    const allTab = screen.getByRole('tab', { name: `Alle (${appState.generatedAssets.length})` })
    const linkedTab = screen.getByRole('tab', { name: `In Unterhaltungen (2)` })
    const unlinkedTab = screen.getByRole('tab', { name: `Nicht verknüpft (1)` })

    expect(allTab).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(linkedTab)
    expect(linkedTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('nicht-verbunden.png')).not.toBeInTheDocument()
    fireEvent.click(unlinkedTab)
    expect(unlinkedTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('nicht-verbunden.png')).toBeInTheDocument()
  })
})
