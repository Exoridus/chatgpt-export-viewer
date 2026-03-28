import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { translations } from '../../src/lib/i18n'
import { ConversationRoute } from '../../src/routes/ConversationRoute'
import type { ConversationSummary } from '../../src/types'

const getConversation = vi.fn<() => Promise<unknown>>()
const appState: {
  getConversation: typeof getConversation
  mergedIndex: ConversationSummary[]
} = {
  getConversation,
  mergedIndex: [],
}

vi.mock('../../src/components/viewer/ConversationView', () => ({
  ConversationView: ({ conversation }: { conversation: { id: string; title: string } }) => (
    <div data-testid="conversation-view">{conversation.title}</div>
  ),
}))

vi.mock('../../src/state/AppDataContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/AppDataContext')>('../../src/state/AppDataContext')
  return {
    ...actual,
    useAppData: () => ({
      getConversation: appState.getConversation,
      mergedIndex: appState.mergedIndex,
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

const mockConversation = {
  schema_version: 1 as const,
  id: 'conversation-1',
  title: 'Conversation One',
  last_message_time: 1000,
  messages: [],
}

const baseSummary: ConversationSummary = {
  id: 'conversation-1',
  title: 'Conversation One',
  snippet: 'First snippet',
  last_message_time: 1000,
  update_time: 1000,
  pinned_time: null,
  source: 'local',
  pinned: false,
}

function RouteShell({ tick }: { tick: number }) {
  return (
    <div data-testid={`shell-${tick}`}>
      <MemoryRouter initialEntries={['/conversation-1']}>
        <Routes>
          <Route path="/:conversationId" element={<ConversationRoute />} />
        </Routes>
      </MemoryRouter>
    </div>
  )
}

describe('ConversationRoute regression', () => {
  beforeEach(() => {
    getConversation.mockReset()
    appState.mergedIndex = [{ ...baseSummary }]
    getConversation.mockResolvedValue(mockConversation)
  })

  it('does not refetch on pin metadata changes, but refetches for content-relevant summary updates', async () => {
    const { rerender } = render(<RouteShell tick={0} />)

    expect(await screen.findByTestId('conversation-view')).toHaveTextContent('Conversation One')
    expect(getConversation).toHaveBeenCalledTimes(1)

    appState.mergedIndex = [{ ...baseSummary, pinned: true, pinned_time: 1700000000000 }]
    rerender(<RouteShell tick={1} />)

    await waitFor(() => expect(screen.getByTestId('conversation-view')).toHaveTextContent('Conversation One'))
    expect(getConversation).toHaveBeenCalledTimes(1)

    appState.mergedIndex = [
      {
        ...baseSummary,
        pinned: true,
        pinned_time: 1700000000000,
        last_message_time: 2000,
        update_time: 2000,
      },
    ]
    rerender(<RouteShell tick={2} />)

    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('conversation-view')).toHaveTextContent('Conversation One')
  })
})
