import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationsPage } from './ApplicationsPage'
import { InterviewPage } from './InterviewPage'
import { JobsPage } from './JobsPage'
import { SettingsPage } from './SettingsPage'

const { api, authState, resumeState } = vi.hoisted(() => ({
  api: { apiRequest: vi.fn() },
  authState: {
    current: {
      user: { id: 'user-one', email: 'user@example.test', user_metadata: { display_name: 'Career User' } },
      session: { access_token: 'session-token' },
    },
  },
  resumeState: { current: { resumes: [] as Array<{ id: string; isActive: boolean }> } },
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => authState.current }))
vi.mock('../lib/api', () => api)
vi.mock('../hooks/useResumes', () => ({ useResumes: () => resumeState.current }))
vi.mock('../components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => children,
}))

function renderPage(page: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>)
}

describe('Career module API integrations', () => {
  beforeEach(() => {
    authState.current = {
      user: { id: 'user-one', email: 'user@example.test', user_metadata: { display_name: 'Career User' } },
      session: { access_token: 'session-token' },
    }
    resumeState.current = { resumes: [] }
    api.apiRequest.mockReset()
  })

  afterEach(() => cleanup())

  it('searches stored jobs and saves a selected job through the authenticated API', async () => {
    const job = {
      id: 'job-one',
      title: 'Platform Engineer',
      company: 'Example Co',
      description: 'Build reliable services.',
      requiredSkills: ['TypeScript'],
      optionalSkills: [],
      location: 'Remote',
      remoteStatus: 'REMOTE',
      employmentType: 'FULL_TIME',
      applicationUrl: null,
      postedAt: null,
    }
    api.apiRequest.mockImplementation((path: string) => {
      if (path.startsWith('/jobs/search?')) return Promise.resolve({ jobs: [job], pagination: { total: 1 } })
      if (path === '/applications') return Promise.resolve({ id: 'application-one' })
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    renderPage(<JobsPage />)
    expect(await screen.findByText('Platform Engineer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save job' }))

    await waitFor(() => expect(api.apiRequest).toHaveBeenCalledWith(
      '/applications',
      'session-token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ jobId: 'job-one', status: 'SAVED' }),
      }),
    ))
  })

  it('loads persisted applications and requests an allowed status transition', async () => {
    const application = {
      id: 'application-one',
      company: 'Example Co',
      role: 'Platform Engineer',
      status: 'APPLIED',
      appliedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    api.apiRequest.mockImplementation((path: string, _token: string, options?: RequestInit) => {
      if (path.startsWith('/applications?')) return Promise.resolve({ applications: [application] })
      if (path.endsWith('/status') && options?.method === 'PATCH') {
        return Promise.resolve({ ...application, status: 'INTERVIEW' })
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    renderPage(<ApplicationsPage />)
    expect(await screen.findByText('Platform Engineer')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Update status for Example Co Platform Engineer' }), {
      target: { value: 'INTERVIEW' },
    })

    await waitFor(() => expect(api.apiRequest).toHaveBeenCalledWith(
      '/applications/application-one/status',
      'session-token',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'INTERVIEW' }) }),
    ))
  })

  it('loads and persists the authenticated profile instead of reporting a local-only save', async () => {
    const profile = {
      displayName: 'Career User',
      headline: null,
      summary: null,
      location: null,
      websiteUrl: null,
      githubUrl: null,
      linkedinUrl: null,
      targetRole: null,
    }
    api.apiRequest.mockImplementation((path: string, _token: string, options?: RequestInit) => {
      if (path === '/profile' && options?.method === 'PATCH') return Promise.resolve(profile)
      if (path === '/profile') return Promise.resolve(profile)
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    renderPage(<SettingsPage />)
    expect(await screen.findByLabelText('Display name')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(api.apiRequest).toHaveBeenCalledWith(
      '/profile',
      'session-token',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(profile) }),
    ))
  })

  it('creates an interview session and displays provider failure without substitute questions', async () => {
    const created = {
      id: 'session-one',
      targetRole: 'Backend Engineer',
      type: 'TECHNICAL',
      difficulty: 'INTERMEDIATE',
      status: 'IN_PROGRESS',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    let hasSession = false
    api.apiRequest.mockImplementation((path: string, _token: string, options?: RequestInit) => {
      if (path === '/interviews' && options?.method === 'POST') {
        hasSession = true
        return Promise.resolve(created)
      }
      if (path === '/interviews?page=1&pageSize=50') {
        return Promise.resolve({ sessions: hasSession ? [created] : [] })
      }
      if (path === '/interviews/session-one/questions' && options?.method === 'POST') {
        return Promise.reject(new Error('Interview question generation is not configured'))
      }
      if (path === '/interviews/session-one/questions') return Promise.resolve([])
      if (path === '/interviews/session-one/feedback') return Promise.resolve({ questions: [] })
      return Promise.reject(new Error(`Unexpected request: ${path}`))
    })

    renderPage(<InterviewPage />)
    fireEvent.change(screen.getByPlaceholderText('e.g. Backend Engineer'), { target: { value: 'Backend Engineer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }))

    expect(await screen.findByRole('heading', { name: 'Backend Engineer' })).toBeTruthy()
    await waitFor(() => expect(api.apiRequest).toHaveBeenCalledWith(
      '/interviews',
      'session-token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targetRole: 'Backend Engineer', type: 'TECHNICAL', difficulty: 'INTERMEDIATE' }),
      }),
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Generate 5 questions' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Interview question generation is not configured')
    expect(screen.queryByText(/For a Backend Engineer role/)).toBeNull()
  })
})
