import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ResumePage } from './ResumePage'
import type { Resume, ResumeAnalysis, ResumeDetails } from '../hooks/useResumes'
import { resumeQueryKeys } from '../hooks/useResumes'

const { api, authState } = vi.hoisted(() => ({
  api: { apiRequest: vi.fn() },
  authState: {
    current: {
      user: { id: 'user-one' },
      session: { access_token: 'token-one' },
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

const resume: Resume = {
  id: 'resume-one',
  originalFilename: 'one.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 1200,
  processingStatus: 'PROCESSED',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const analysis: ResumeAnalysis = {
  id: 'analysis-one',
  status: 'COMPLETED',
  strengths: ['Clear project experience'],
  improvementSuggestions: [],
  provider: 'parser-test',
  model: 'model-1',
  analyzedAt: '2026-01-02T00:00:00.000Z',
  createdAt: '2026-01-02T00:00:00.000Z',
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ResumePage />
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

describe('ResumePage mutations', () => {
  beforeEach(() => {
    authState.current = {
      user: { id: 'user-one' },
      session: { access_token: 'token-one' },
    }
    api.apiRequest.mockReset()
  })

  afterEach(() => cleanup())

  it('updates the signed-in user resume list after upload', async () => {
    const uploadedResume = { ...resume, id: 'resume-uploaded', originalFilename: 'new-resume.pdf' }
    api.apiRequest.mockImplementation((path: string, _token: string, options?: RequestInit) => {
      if (path === '/resumes' && options?.method === 'POST') return Promise.resolve(uploadedResume)
      if (path === '/resumes') return Promise.resolve([])
      if (path.endsWith('/summary')) return Promise.resolve({ ...uploadedResume, analyses: [] })
      throw new Error(`Unexpected request: ${path}`)
    })
    const { container, queryClient } = renderPage()

    await screen.findByText('No resumes have been uploaded to your account.')
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!fileInput) throw new Error('Resume upload input was not rendered.')
    fireEvent.change(fileInput, {
      target: { files: [new File(['resume data'], 'new-resume.pdf', { type: 'application/pdf' })] },
    })

    expect(await screen.findAllByText('new-resume.pdf')).toHaveLength(2)
    expect(queryClient.getQueryData(resumeQueryKeys.list('user-one'))).toEqual([uploadedResume])
  })

  it('refreshes selected-resume analysis after re-analysis', async () => {
    let detailRequests = 0
    const details: ResumeDetails = { ...resume, analyses: [] }
    api.apiRequest.mockImplementation((path: string, _token: string, options?: RequestInit) => {
      if (path === '/resumes' && options?.method === 'POST') return Promise.resolve(analysis)
      if (path === '/resumes') return Promise.resolve([resume])
      if (path.endsWith('/summary')) {
        detailRequests += 1
        return Promise.resolve(detailRequests === 1 ? details : { ...resume, analyses: [analysis] })
      }
      if (path.endsWith('/analyze')) return Promise.resolve(analysis)
      throw new Error(`Unexpected request: ${path}`)
    })
    renderPage()

    await screen.findByText('No completed analysis is available for this resume yet.')
    fireEvent.click(screen.getByRole('button', { name: /re-analyze/i }))

    expect(await screen.findByText('Parsed with parser-test (model-1)')).toBeTruthy()
    await waitFor(() => expect(detailRequests).toBeGreaterThanOrEqual(2))
    expect(api.apiRequest).toHaveBeenCalledWith(
      '/resumes/resume-one/analyze',
      'token-one',
      { method: 'POST' },
    )
  })
})
