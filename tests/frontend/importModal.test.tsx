import React from 'react'
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
}

vi.mock('../../src/state/AppDataContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/AppDataContext')>('../../src/state/AppDataContext')
  return {
    ...actual,
    useAppData: () => ({
      importZips,
      storageAvailable: state.storageAvailable,
      mergedIndex: [],
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
  it('shows strategy select with expected option labels', () => {
    render(<ImportModal open onClose={() => undefined} />)

    expect(screen.getByLabelText('When importing conversations, use this strategy:')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Upsert (Add/Update)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Replace (Clear & Import)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Clone (Force unique IDs)' })).toBeInTheDocument()
  })

  it('updates helper description when selecting clone mode', () => {
    render(<ImportModal open onClose={() => undefined} />)

    const select = screen.getByLabelText('When importing conversations, use this strategy:')
    fireEvent.change(select, { target: { value: 'clone' } })

    expect(
      screen.getByText('Imports missing conversations and keeps both versions when timestamps differ.'),
    ).toBeInTheDocument()
  })
})
