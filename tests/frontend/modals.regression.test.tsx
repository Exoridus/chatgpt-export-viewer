import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AboutModal } from '../../src/components/layout/AboutModal'
import { SettingsModal } from '../../src/components/settings/SettingsModal'
import { translations } from '../../src/lib/i18n'

const exportLocalBundle = vi.fn(async () => { /* noop */ })
const purgeAll = vi.fn(async () => { /* noop */ })
const refreshDbSize = vi.fn(async () => 12 * 1024 * 1024 as number)
const setViewerPreferences = vi.fn()
const writeText = vi.fn(async () => { /* noop */ })

const appDataState = {
  exportLocalBundle,
  purgeAll,
  refreshDbSize,
  dbSizeBytes: 12 * 1024 * 1024,
  localIndex: [
    {
      id: 'conversation-1',
      title: 'Conversation One',
      snippet: 'Snippet',
      last_message_time: 1000,
      source: 'local' as const,
      pinned: false,
    },
  ],
  storageAvailable: true,
}

const importExportState = {
  exporting: false,
  exportProgress: {
    phase: 'idle',
    message: '',
  },
}

vi.mock('../../src/state/AppDataContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/AppDataContext')>('../../src/state/AppDataContext')
  return {
    ...actual,
    useAppData: () => appDataState,
  }
})

vi.mock('../../src/state/ImportExportContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/ImportExportContext')>('../../src/state/ImportExportContext')
  return {
    ...actual,
    useImportExport: () => importExportState,
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
      setViewerPreferences,
      locale: 'en',
      t: translations.en,
    }),
  }
})

describe('Modal regressions', () => {
  beforeEach(() => {
    exportLocalBundle.mockClear()
    purgeAll.mockClear()
    refreshDbSize.mockClear()
    setViewerPreferences.mockClear()
    writeText.mockClear()
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

  it('keeps Settings actions and destructive flow usable', async () => {
    const onClose = vi.fn()
    render(<SettingsModal open onClose={onClose} />)

    expect(screen.getByRole('heading', { name: translations.en.settings.title })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: translations.en.settings.sections.general })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: translations.en.settings.storage.title })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: translations.en.settings.storage.exportAction }))
    await waitFor(() => expect(exportLocalBundle).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: translations.en.settings.storage.purgeAction }))
    expect(screen.getByRole('heading', { name: translations.en.settings.storage.purgeDialogTitle })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: translations.en.settings.storage.purgeNow }))
    await waitFor(() => expect(purgeAll).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('keeps About modal links, commit copy action, and close behavior operable', async () => {
    const onClose = vi.fn()
    render(<AboutModal open onClose={onClose} />)

    expect(screen.getByRole('heading', { name: translations.en.about.title })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /GitHub/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /License/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Sponsor/i })).toBeInTheDocument()

    const copyButton = screen.getByRole('button', { name: translations.en.about.copyCommit })
    fireEvent.click(copyButton)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: translations.en.about.copiedCommit })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: translations.en.about.closeDialog }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
