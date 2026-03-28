import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImportModal } from '../../src/components/importer/ImportModal'
import type { ImportProgressState } from '../../src/state/ImportExportContext'

const importZips = vi.fn(async () => 0)
const resetImportProgress = vi.fn()
const pushNotice = vi.fn()

const state = {
  importing: false,
  importProgress: {
    phase: 'idle',
    message: 'Select ChatGPT data export ZIP files.',
  } as ImportProgressState,
  storageAvailable: true,
  mergedIndex: [] as Array<{ id: string; title: string; pinned: boolean; pinned_time: number | null }>,
}

vi.mock('../../src/state/AppDataContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/AppDataContext')>('../../src/state/AppDataContext')
  return {
    ...actual,
    useAppData: () => ({
      importZips,
      storageAvailable: state.storageAvailable,
      mergedIndex: state.mergedIndex,
    }),
  }
})

vi.mock('../../src/state/ImportExportContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/ImportExportContext')>('../../src/state/ImportExportContext')
  return {
    ...actual,
    useImportExport: () => ({
      importing: state.importing,
      importProgress: state.importProgress,
      resetImportProgress,
      exporting: false,
      exportProgress: { phase: 'idle', message: '' },
    }),
  }
})

vi.mock('../../src/state/NotificationContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/NotificationContext')>('../../src/state/NotificationContext')
  return {
    ...actual,
    useNotification: () => ({
      notice: null,
      pushNotice,
      clearNotice: vi.fn(),
    }),
  }
})

vi.mock('../../src/state/PreferencesContext', async () => {
  const { translations } = await import('../../src/lib/i18n')
  return {
    usePreferences: () => ({
      viewerPreferences: {
        locale: 'auto',
        appTheme: 'system',
        codeThemeFollowAppTheme: true,
        codeTheme: 'a11yDark',
        collapseSystemMessages: true,
        collapseCodeBlocks: false,
      },
      setViewerPreferences: vi.fn(),
      t: translations.en,
    }),
  }
})

describe('ImportModal', () => {
  it('hides strategy controls for first import when no conversations exist yet', () => {
    state.mergedIndex = []
    render(<ImportModal open onClose={() => { /* noop */ }} />)

    expect(screen.queryByLabelText('When importing conversations, use this strategy:')).not.toBeInTheDocument()
    expect(screen.getByText('Start with your first import. Strategy options appear once conversations already exist.')).toBeInTheDocument()
  })

  it('shows strategy controls once conversations exist and updates helper text for clone mode', () => {
    state.mergedIndex = [{ id: 'c1', title: 'Conversation 1', pinned: false, pinned_time: null }]
    render(<ImportModal open onClose={() => { /* noop */ }} />)

    const select = screen.getByLabelText('When importing conversations, use this strategy:')
    fireEvent.change(select, { target: { value: 'clone' } })

    expect(
      screen.getByText('Imports missing conversations and keeps both versions when timestamps differ.'),
    ).toBeInTheDocument()
  })
})
