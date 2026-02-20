import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImportModal } from '../../src/components/importer/ImportModal'
import type { ImportProgressState } from '../../src/state/AppDataContext'

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
      importing: state.importing,
      importProgress: state.importProgress,
      resetImportProgress,
      pushNotice,
      storageAvailable: state.storageAvailable,
    }),
  }
})

describe('ImportModal', () => {
  it('shows strategy select with expected option labels', () => {
    render(<ImportModal open onClose={() => undefined} />)

    expect(screen.getByLabelText('When importing conversations, use this strategy:')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Import newer and missing entries' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Import and replace all existing entries' })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Import missing entries and clone when timestamps differ' }),
    ).toBeInTheDocument()
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
