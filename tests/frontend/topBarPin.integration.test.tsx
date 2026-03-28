import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TopBar } from '../../src/components/layout/TopBar'
import { translations } from '../../src/lib/i18n'
import { ConversationRoute } from '../../src/routes/ConversationRoute'
import type { ConversationSummary } from '../../src/types'

const getConversation = vi.fn<() => Promise<unknown>>()
const pinConversation = vi.fn<(id: string, pin: boolean) => Promise<void>>()
const pushNotice = vi.fn()

const appState: {
  mergedIndex: ConversationSummary[]
  getConversation: typeof getConversation
  pinConversation: typeof pinConversation
} = {
  mergedIndex: [],
  getConversation,
  pinConversation,
}

vi.mock('../../src/components/viewer/ConversationView', () => ({
  ConversationView: ({ conversation: conv }: { conversation: { title: string } }) => (
    <div data-testid="active-conversation">{conv.title}</div>
  ),
}))

vi.mock('../../src/state/AppDataContext', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/AppDataContext')>('../../src/state/AppDataContext')
  return {
    ...actual,
    useAppData: () => ({
      mergedIndex: appState.mergedIndex,
      getConversation: appState.getConversation,
      pinConversation: appState.pinConversation,
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

const summaryBase: ConversationSummary = {
  id: 'conversation-1',
  title: 'Integration Conversation',
  snippet: 'Snippet',
  last_message_time: 1000,
  update_time: 1000,
  pinned_time: null,
  source: 'local',
  pinned: false,
}

const conversation = {
  schema_version: 1 as const,
  id: 'conversation-1',
  title: 'Integration Conversation',
  last_message_time: 1000,
  messages: [],
}

function IntegrationShell({ tick }: { tick: number }) {
  return (
    <div data-testid={`integration-shell-${tick}`}>
      <MemoryRouter initialEntries={['/conversation-1']}>
        <TopBar onToggleSidebar={() => { /* noop */ }} onOpenUpload={() => { /* noop */ }} />
        <Routes>
          <Route path="/:conversationId" element={<ConversationRoute />} />
        </Routes>
      </MemoryRouter>
    </div>
  )
}

describe('TopBar pinning integration regression', () => {
  beforeEach(() => {
    getConversation.mockReset()
    pinConversation.mockReset()
    pushNotice.mockReset()

    appState.mergedIndex = [{ ...summaryBase }]
    getConversation.mockResolvedValue(conversation)

    pinConversation.mockImplementation(async (id, pin) => {
      appState.mergedIndex = appState.mergedIndex.map((item) => {
        if (item.id !== id) {return item}
        const pinnedTime = pin ? (item.pinned_time ?? Date.now()) : null
        return {
          ...item,
          pinned: pin,
          pinned_time: pinnedTime,
        }
      })
    })
  })

  it('pins and unpins via the real overflow menu without redundant route refetch', async () => {
    const { rerender } = render(<IntegrationShell tick={0} />)

    expect(await screen.findByTestId('active-conversation')).toHaveTextContent('Integration Conversation')
    expect(getConversation).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: translations.en.viewer.conversationActions }))
    fireEvent.click(screen.getByRole('menuitem', { name: translations.en.actions.pin }))
    await waitFor(() => expect(pinConversation).toHaveBeenCalledWith('conversation-1', true))

    rerender(<IntegrationShell tick={1} />)
    expect(screen.getByTestId('active-conversation')).toHaveTextContent('Integration Conversation')
    expect(getConversation).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: translations.en.viewer.conversationActions }))
    expect(screen.getByRole('menuitem', { name: translations.en.actions.unpin })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: translations.en.actions.unpin }))
    await waitFor(() => expect(pinConversation).toHaveBeenCalledWith('conversation-1', false))

    rerender(<IntegrationShell tick={2} />)
    expect(screen.getByTestId('active-conversation')).toHaveTextContent('Integration Conversation')
    expect(getConversation).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: translations.en.viewer.conversationActions }))
    expect(screen.getByRole('menuitem', { name: translations.en.actions.pin })).toBeInTheDocument()
  })
})
