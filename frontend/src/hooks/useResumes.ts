import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { apiRequest, apiRequestWithoutData } from '../lib/api'

export interface Resume {
  id: string
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  processingStatus: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'ARCHIVED'
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ResumeAnalysis {
  id: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  strengths: string[] | null
  improvementSuggestions: string[] | null
  provider: string | null
  model: string | null
  analyzedAt: string | null
  createdAt: string
}

export interface ResumeDetails extends Resume {
  analyses: ResumeAnalysis[]
}

export const resumeQueryKeys = {
  all: ['resumes'] as const,
  list: (userId: string) => ['resumes', userId] as const,
  detail: (userId: string, resumeId: string) => ['resumes', userId, 'detail', resumeId] as const,
}

export function useResumes() {
  const { session, user } = useAuth()
  const query = useQuery({
    queryKey: resumeQueryKeys.list(user?.id ?? ''),
    queryFn: () => apiRequest<Resume[]>('/resumes', session!.access_token),
    enabled: Boolean(session && user),
  })

  return {
    resumes: query.data ?? [],
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: async () => { await query.refetch() },
  }
}

export function useResumeDetails(resumeId: string | undefined) {
  const { session, user } = useAuth()
  return useQuery({
    queryKey: resumeQueryKeys.detail(user?.id ?? '', resumeId ?? ''),
    queryFn: ({ signal }) => apiRequest<ResumeDetails>(
      `/resumes/${encodeURIComponent(resumeId!)}/summary`,
      session!.access_token,
      { signal },
    ),
    enabled: Boolean(session && user && resumeId),
  })
}

export function useActivateResume() {
  const { session, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (resumeId: string) => apiRequest<Resume>(
      `/resumes/${encodeURIComponent(resumeId)}/active`,
      session!.access_token,
      { method: 'PUT' },
    ),
    onSuccess: (activeResume) => {
      if (!user) return

      queryClient.setQueryData<Resume[]>(resumeQueryKeys.list(user.id), (resumes) =>
        resumes?.map((resume) => ({ ...resume, isActive: resume.id === activeResume.id })))
      queryClient.setQueryData<ResumeDetails>(
        resumeQueryKeys.detail(user.id, activeResume.id),
        (details) => details ? { ...details, isActive: true } : details,
      )
      void queryClient.invalidateQueries({ queryKey: resumeQueryKeys.list(user.id) })
    },
  })
}

export function useDeleteResume() {
  const { session, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (resumeId: string) => {
      await apiRequestWithoutData(`/resumes/${encodeURIComponent(resumeId)}`, session!.access_token, {
        method: 'DELETE',
      })
      return resumeId
    },
    onSuccess: (resumeId) => {
      if (!user) return

      queryClient.setQueryData<Resume[]>(resumeQueryKeys.list(user.id), (resumes) =>
        resumes?.filter((resume) => resume.id !== resumeId))
      queryClient.removeQueries({ queryKey: resumeQueryKeys.detail(user.id, resumeId), exact: true })
      void queryClient.invalidateQueries({ queryKey: resumeQueryKeys.list(user.id) })
    },
  })
}
