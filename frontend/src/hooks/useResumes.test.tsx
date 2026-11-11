import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useActivateResume, useDeleteResume, useResumeDetails, useResumes, resumeQueryKeys } from './useResumes'
import type { Resume, ResumeDetails } from './useResumes'

const { api, authState } = vi.hoisted(() => ({
  api: {
    apiRequest: vi.fn(),
    apiRequestWithoutData: vi.fn(),
  },
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

const firstResume: Resume = {
  id: 'resume-one',
  originalFilename: 'one.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 1200,
  processingStatus: 'PROCESSED',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false } },
  })
}

describe('resume query caching', () => {
  beforeEach(() => {
    authState.current = {
      user: { id: 'user-one' },
      session: { access_token: 'token-one' },
    }
    api.apiRequest.mockReset()
    api.apiRequestWithoutData.mockReset()
  })

  afterEach(() => cleanup())

  it('deduplicates concurrent list requests and reuses fresh data when opening the page again', async () => {
    api.apiRequest.mockResolvedValue([firstResume])
    const queryClient = createQueryClient()
    const wrapper = createWrapper(queryClient)
    const first = renderHook(() => useResumes(), { wrapper })
    const second = renderHook(() => useResumes(), { wrapper })

    await waitFor(() => {
      expect(first.result.current.resumes).toEqual([firstResume])
      expect(second.result.current.resumes).toEqual([firstResume])
    })
    expect(api.apiRequest).toHaveBeenCalledOnce()

    first.unmount()
    second.unmount()
    const reopened = renderHook(() => useResumes(), { wrapper })
    await waitFor(() => expect(reopened.result.current.resumes).toEqual([firstResume]))
    expect(api.apiRequest).toHaveBeenCalledOnce()
  })

  it('uses a distinct cache entry for each account', async () => {
    api.apiRequest.mockImplementation(async (_path: string, token: string) =>
      token === 'token-one' ? [firstResume] : [{ ...firstResume, id: 'resume-two' }])
    const queryClient = createQueryClient()
    const wrapper = createWrapper(queryClient)
    const first = renderHook(() => useResumes(), { wrapper })
    await waitFor(() => expect(first.result.current.resumes).toEqual([firstResume]))

    authState.current = {
      user: { id: 'user-two' },
      session: { access_token: 'token-two' },
    }
    first.rerender()

    await waitFor(() => expect(first.result.current.resumes[0]?.id).toBe('resume-two'))
    expect(api.apiRequest).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(resumeQueryKeys.list('user-one'))).toEqual([firstResume])
    expect(queryClient.getQueryData(resumeQueryKeys.list('user-two'))).toEqual([{ ...firstResume, id: 'resume-two' }])
  })

  it('loads detail summaries independently and ignores late responses after selection changes', async () => {
    let resolveFirst!: (value: ResumeDetails) => void
    let resolveSecond!: (value: ResumeDetails) => void
    const firstDetails = new Promise<ResumeDetails>((resolve) => { resolveFirst = resolve })
    const secondDetails = new Promise<ResumeDetails>((resolve) => { resolveSecond = resolve })
    api.apiRequest.mockImplementation((path: string) => path.endsWith('resume-one/summary') ? firstDetails : secondDetails)
    const queryClient = createQueryClient()
    const { result, rerender } = renderHook(
      ({ resumeId }) => useResumeDetails(resumeId),
      { wrapper: createWrapper(queryClient), initialProps: { resumeId: 'resume-one' } },
    )

    rerender({ resumeId: 'resume-two' })
    resolveSecond({ ...firstResume, id: 'resume-two', analyses: [] })
    await waitFor(() => expect(result.current.data?.id).toBe('resume-two'))
    resolveFirst({ ...firstResume, analyses: [] })
    await waitFor(() => expect(result.current.data?.id).toBe('resume-two'))
    expect(api.apiRequest).toHaveBeenCalledWith(
      '/resumes/resume-one/summary',
      'token-one',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('updates the cached active resume after activation', async () => {
    const secondResume = { ...firstResume, id: 'resume-two', originalFilename: 'two.pdf', isActive: false }
    const queryClient = createQueryClient()
    queryClient.setQueryData(resumeQueryKeys.list('user-one'), [firstResume, secondResume])
    api.apiRequest.mockResolvedValue({ ...secondResume, isActive: true })
    const { result } = renderHook(() => useActivateResume(), { wrapper: createWrapper(queryClient) })

    await result.current.mutateAsync('resume-two')

    expect(queryClient.getQueryData(resumeQueryKeys.list('user-one'))).toEqual([
      { ...firstResume, isActive: false },
      { ...secondResume, isActive: true },
    ])
  })

  it('removes deleted resume and its cached details', async () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(resumeQueryKeys.list('user-one'), [firstResume])
    queryClient.setQueryData(resumeQueryKeys.detail('user-one', firstResume.id), { ...firstResume, analyses: [] })
    api.apiRequestWithoutData.mockResolvedValue(undefined)
    const { result } = renderHook(() => useDeleteResume(), { wrapper: createWrapper(queryClient) })

    await result.current.mutateAsync(firstResume.id)

    expect(queryClient.getQueryData(resumeQueryKeys.list('user-one'))).toEqual([])
    expect(queryClient.getQueryData(resumeQueryKeys.detail('user-one', firstResume.id))).toBeUndefined()
    expect(api.apiRequestWithoutData).toHaveBeenCalledWith(
      '/resumes/resume-one',
      'token-one',
      { method: 'DELETE' },
    )
  })
})
