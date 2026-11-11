import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { CopilotPage } from './CopilotPage'

const { api, authState } = vi.hoisted(() => ({
  api: { apiRequest: vi.fn() },
  authState: {
    current: {
      user: { id: 'user-one', email: 'user@example.test', user_metadata: { display_name: 'Career User' } },
      session: { access_token: 'session-token' },
    },
  },
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => authState.current,
}))

vi.mock('../lib/api', () => api)

vi.mock('../components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => children,
}))

const conversation = {
  id: 'conversation-one',
  title: 'Resume planning',
  status: 'ACTIVE',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
}

function renderPage() {
  return render(<CopilotPage />)
}

describe('CopilotPage integration', () => {
  beforeEach(() => {
    authState.current = {
      user: { id: 'user-one', email: 'user@example.test', user_metadata: { display_name: 'Career User' } },
      session: { access_token: 'session-token' },
    }
    api.apiRequest.mockReset()
  })

  afterEach(() => cleanup())

  it('loads persistent conversation history and renders grounded source references', async () => {
    api.apiRequest.mockImplementation((path: string, _token: string, options?: RequestInit) => {
      if (path.startsWith('/copilot/conversations?')) {
        return Promise.resolve({ conversations: [conversation], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } })
      }
      if (path === '/knowledge/status') return Promise.resolve({ sourceCount: 2, chunkCount: 4 })
      if (path === `/copilot/conversations/${conversation.id}` && !options?.method) {
        return Promise.resolve({
          ...conversation,
          messages: [{
            id: 'message-old',
            role: 'ASSISTANT',
            content: 'Earlier career response',
            createdAt: '2026-01-01T10:00:00.000Z',
            metadata: {
              grounded: true,
              sources: [{
                id: 'chunk-old',
                sourceType: 'PROFILE',
                sourceId: 'profile-one',
                title: 'Career profile',
                chunkIndex: 0,
                similarity: 0.88,
              }],
            },
          }],
        })
      }
      if (path === `/copilot/conversations/${conversation.id}/messages`) {
        return Promise.resolve({
          userMessage: {
            id: 'message-user',
            role: 'USER',
            content: 'How can I improve my resume?',
            createdAt: '2026-01-01T10:01:00.000Z',
          },
          assistantMessage: {
            id: 'message-assistant',
            role: 'ASSISTANT',
            content: 'Highlight the measurable outcomes in your projects.',
            createdAt: '2026-01-01T10:01:01.000Z',
          },
          sources: [
            {
              id: 'chunk-resume',
              sourceType: 'RESUME',
              sourceId: 'resume-one',
              title: 'Current resume',
              chunkIndex: 3,
              similarity: 0.92,
            },
            {
              id: 'chunk-resume-context',
              sourceType: 'RESUME',
              sourceId: 'resume-one',
              title: 'Current resume',
              chunkIndex: 4,
              contextExpanded: true,
            },
          ],
        })
      }
      throw new Error(`Unexpected API request: ${path}`)
    })

    renderPage()

    expect(await screen.findByText('Earlier career response')).toBeTruthy()
    expect(screen.getByText('Career profile · PROFILE · 88% match')).toBeTruthy()
    expect(screen.getByText('2 sources · 4 searchable sections')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'How can I improve my resume?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Highlight the measurable outcomes in your projects.')).toBeTruthy()
    expect(screen.getByText('Current resume · RESUME · 92% match')).toBeTruthy()
    expect(screen.getByText('Current resume · RESUME · Supporting context')).toBeTruthy()
    expect(api.apiRequest).toHaveBeenCalledWith(
      `/copilot/conversations/${conversation.id}/messages`,
      'session-token',
      { method: 'POST', body: JSON.stringify({ content: 'How can I improve my resume?' }) },
    )
  })

  it('syncs personal knowledge and creates a persistent conversation from an empty account', async () => {
    const newConversation = { ...conversation, id: 'conversation-new', title: null }
    api.apiRequest.mockImplementation((path: string, _token: string, options?: RequestInit) => {
      if (path.startsWith('/copilot/conversations?')) {
        return Promise.resolve({ conversations: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } })
      }
      if (path === '/knowledge/status') return Promise.resolve({ sourceCount: 0, chunkCount: 0 })
      if (path === '/knowledge/reindex') return Promise.resolve({ sourceCount: 3, chunkCount: 7 })
      if (path === '/copilot/conversations' && options?.method === 'POST') return Promise.resolve(newConversation)
      if (path === `/copilot/conversations/${newConversation.id}/messages`) {
        return Promise.resolve({
          userMessage: {
            id: 'message-user',
            role: 'USER',
            content: 'What experience is in my resume?',
            createdAt: '2026-01-01T10:01:00.000Z',
          },
          assistantMessage: {
            id: 'message-assistant',
            role: 'ASSISTANT',
            content: 'Your resume describes building reliable APIs.',
            createdAt: '2026-01-01T10:01:01.000Z',
          },
          sources: [{
            id: 'chunk-resume',
            sourceType: 'RESUME',
            sourceId: 'resume-one',
            title: 'Active resume',
            chunkIndex: 0,
            similarity: 0.91,
          }],
        })
      }
      if (path === `/copilot/conversations/${newConversation.id}`) {
        return Promise.resolve({ ...newConversation, messages: [] })
      }
      throw new Error(`Unexpected API request: ${path}`)
    })

    renderPage()
    expect(await screen.findByText('Sync personal data to enable personalized answers.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sync personal data' }))

    expect(await screen.findByText('3 sources · 7 searchable sections')).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toContain(
      'Personal data synced: 3 sources and 7 searchable sections.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start a conversation' }))

    await waitFor(() => {
      expect(api.apiRequest).toHaveBeenCalledWith('/copilot/conversations', 'session-token', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    })
    expect(await screen.findByRole('combobox', { name: 'Conversation history' })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message' }).hasAttribute('disabled')).toBe(false))
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'What experience is in my resume?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Your resume describes building reliable APIs.')).toBeTruthy()
    expect(screen.getByText('Active resume · RESUME · 91% match')).toBeTruthy()
    expect(api.apiRequest).toHaveBeenCalledWith('/knowledge/reindex', 'session-token', { method: 'POST' })
  })

  it('shows personal-data sync failures and retains the last known index counts', async () => {
    api.apiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/copilot/conversations?')) {
        return Promise.resolve({ conversations: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } })
      }
      if (path === '/knowledge/status') return Promise.resolve({ sourceCount: 0, chunkCount: 0 })
      if (path === '/knowledge/reindex') return Promise.reject(new Error('Sync failed. Please try again.'))
      throw new Error(`Unexpected API request: ${path}`)
    })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Sync personal data' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Sync failed. Please try again.')
    expect(screen.getByText('0 sources · 0 searchable sections')).toBeTruthy()
    expect(screen.queryByText(/Personal data synced:/)).toBeNull()
  })

  it('clears the visible conversation when the authenticated account changes', async () => {
    api.apiRequest.mockImplementation((path: string, token: string) => {
      if (path.startsWith('/copilot/conversations?')) {
        const conversations = token === 'session-token' ? [conversation] : []
        return Promise.resolve({
          conversations,
          pagination: { page: 1, pageSize: 50, total: conversations.length, totalPages: 1 },
        })
      }
      if (path === '/knowledge/status') return Promise.resolve({ sourceCount: 0, chunkCount: 0 })
      if (path === `/copilot/conversations/${conversation.id}`) {
        return Promise.resolve({
          ...conversation,
          messages: [{
            id: 'private-message',
            role: 'ASSISTANT',
            content: 'Private account conversation',
            createdAt: '2026-01-01T10:00:00.000Z',
          }],
        })
      }
      throw new Error(`Unexpected API request: ${path}`)
    })
    const view = renderPage()

    expect(await screen.findByText('Private account conversation')).toBeTruthy()
    authState.current = {
      user: { id: 'user-two', email: 'other@example.test', user_metadata: { display_name: 'Other User' } },
      session: { access_token: 'other-session-token' },
    }
    view.rerender(<CopilotPage />)

    expect(await screen.findByText('Hello, Other User. Start a conversation to get guidance based on your career data.')).toBeTruthy()
    expect(screen.queryByText('Private account conversation')).toBeNull()
  })
})
