import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { translations } from '../../src/lib/i18n'
import { HomeRoute } from '../../src/routes/HomeRoute'

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

describe('HomeRoute regression', () => {
  it('renders import-first onboarding copy and visible import CTA', () => {
    const onOpenUpload = vi.fn()
    render(<HomeRoute onOpenUpload={onOpenUpload} />)

    expect(screen.getByRole('heading', { name: translations.en.home.welcome })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: translations.en.actions.importZip })).toBeInTheDocument()
    expect(screen.getByText(/Drop files anywhere or click to select/i)).toBeInTheDocument()
    expect(screen.queryByText(/Already have a server dataset/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: translations.en.actions.importZip }))
    expect(onOpenUpload).toHaveBeenCalledTimes(1)
  })
})
