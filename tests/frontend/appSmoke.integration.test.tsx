import { fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { TopBar } from '../../src/components/layout/TopBar'
import { translations } from '../../src/lib/i18n'
import { GalleryRoute } from '../../src/routes/GalleryRoute'
import { HomeRoute } from '../../src/routes/HomeRoute'
import type { GeneratedAsset } from '../../src/types'

const onOpenUpload = vi.fn()
const appState: {
  mergedIndex: Array<{ id: string; title: string; pinned: boolean; pinned_time: number | null }>
  generatedAssets: GeneratedAsset[]
  storedAssets: Array<{ key: string; size: number; mime?: string }>
  assetOwnerIndex: { byAsset: Record<string, string[]>; byConversation: Record<string, string[]> }
  referencedAssetKeys: Set<string>
} = {
  mergedIndex: [],
  generatedAssets: [
    { path: 'assets/linked-a.png', fileName: 'linked-a.png', pointers: ['ptr-a'] },
    { path: 'assets/linked-b.png', fileName: 'linked-b.png' },
    { path: 'assets/unlinked-c.png', fileName: 'unlinked-c.png' },
  ],
  storedAssets: [],
  assetOwnerIndex: { byAsset: {}, byConversation: {} },
  referencedAssetKeys: new Set(['assets/linked-b.png']),
}

vi.mock('../../src/components/viewer/GeneratedGallery', () => ({
  GeneratedGallery: ({ assets }: { assets: GeneratedAsset[] }) => (
    <ul data-testid="gallery-assets">
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
      mergedIndex: appState.mergedIndex,
      generatedAssets: appState.generatedAssets,
      storedAssets: appState.storedAssets,
      assetOwnerIndex: appState.assetOwnerIndex,
      referencedAssetKeys: appState.referencedAssetKeys,
      getConversation: vi.fn(async () => null),
      pinConversation: vi.fn(async () => { /* noop */ }),
    }),
  }
})

vi.mock('../../src/state/NotificationContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/NotificationContext')>('../../src/state/NotificationContext')
  return {
    ...actual,
    useNotification: () => ({
      notice: null,
      pushNotice: vi.fn(),
      clearNotice: vi.fn(),
    }),
  }
})

vi.mock('../../src/state/PreferencesContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/PreferencesContext')>('../../src/state/PreferencesContext')
  return {
    ...actual,
    usePreferences: () => ({
      viewerPreferences: {
        locale: 'en',
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

function SmokeShell() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <TopBar onToggleSidebar={() => { /* noop */ }} onOpenUpload={onOpenUpload} />
      <nav>
        <Link to="/">Home</Link>
        <Link to="/gallery">Gallery</Link>
      </nav>
      <Routes>
        <Route path="/" element={<HomeRoute onOpenUpload={onOpenUpload} />} />
        <Route path="/gallery" element={<GalleryRoute />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('frontend integration smoke (Playwright-light fallback)', () => {
  it('renders home onboarding and switches to gallery filter interactions without crash', () => {
    onOpenUpload.mockReset()
    render(<SmokeShell />)

    expect(screen.getByRole('heading', { name: translations.en.home.welcome })).toBeInTheDocument()
    const importButtons = screen.getAllByRole('button', { name: translations.en.actions.importZip })
    expect(importButtons.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(importButtons[1])
    expect(onOpenUpload).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('link', { name: 'Gallery' }))
    expect(screen.getByRole('heading', { level: 2, name: translations.en.gallery.title })).toBeInTheDocument()

    const allTab = screen.getByRole('tab', { name: 'All (3)' })
    const linkedTab = screen.getByRole('tab', { name: 'In conversations (2)' })
    const unlinkedTab = screen.getByRole('tab', { name: 'Unlinked (1)' })

    expect(allTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    fireEvent.click(linkedTab)
    expect(linkedTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)

    fireEvent.click(unlinkedTab)
    expect(unlinkedTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
