import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, FileCode, FileText, RefreshCw, Sparkles, UploadCloud } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../lib/api'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { resumeQueryKeys, useResumeDetails, useResumes, type Resume, type ResumeAnalysis } from '../hooks/useResumes'

function formatFileSize(fileSizeBytes: number): string {
  return `${Math.max(1, Math.round(fileSizeBytes / 1024))} KB`
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString()
}

export function ResumePage() {
  const { session } = useAuth()
  const { user } = useAuth()
  const { resumes, loading, error, refresh } = useResumes()
  const [selection, setSelection] = useState<{ userId: string; resumeId: string } | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const defaultResume = resumes.find((resume) => resume.isActive) ?? resumes[0]
  const selectedId = selection?.userId === user?.id ? selection?.resumeId ?? null : null
  const selectedResume = resumes.find((resume) => resume.id === selectedId) ?? defaultResume
  const detailsQuery = useResumeDetails(selectedResume?.id)
  const latestAnalysis = detailsQuery.data?.analyses[0]

  async function handleReanalyze() {
    if (!session || !selectedResume) return

    setAnalyzing(true)
    setAnalysisError(null)
    try {
      const analysis = await apiRequest<ResumeAnalysis>(
        `/resumes/${encodeURIComponent(selectedResume.id)}/analyze`,
        session.access_token,
        { method: 'POST' },
      )
      if (user && selectedResume) {
        queryClient.setQueryData(
          resumeQueryKeys.detail(user.id, selectedResume.id),
          (current: { analyses: ResumeAnalysis[] } | undefined) => current
            ? { ...current, analyses: [analysis, ...current.analyses.filter((item) => item.id !== analysis.id)] }
            : current,
        )
        await queryClient.invalidateQueries({
          queryKey: resumeQueryKeys.detail(user.id, selectedResume.id),
          exact: true,
        })
      }
      await refresh()
    } catch (requestError) {
      setAnalysisError(requestError instanceof Error ? requestError.message : 'Unable to analyze this resume.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleUpload(file: File) {
    if (!session) return
    setUploadError(null)

    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setUploadError('Choose a PDF or DOCX resume.')
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Resume exceeds the 10 MB limit.')
      if (fileInput.current) fileInput.current.value = ''
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      const resume = await apiRequest<Resume>('/resumes', session.access_token, {
        method: 'POST',
        body: formData,
      })
      if (user) {
        queryClient.setQueryData<Resume[]>(resumeQueryKeys.list(user.id), (current) => {
          if (!current) return [resume]
          return [resume, ...current.filter((item) => item.id !== resume.id)]
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        })
        setSelection({ userId: user.id, resumeId: resume.id })
      }
    } catch (requestError) {
      setUploadError(requestError instanceof Error ? requestError.message : 'Unable to upload this resume.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void handleUpload(file)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) void handleUpload(file)
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-8 p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Resume Diagnostics</h1>
            <p className="mt-1 text-sm text-gray-500">Review resumes and analysis associated with your account.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleReanalyze()} loading={analyzing} disabled={!selectedResume || !session}>
            <RefreshCw size={14} className="mr-1" /> Re-analyze
          </Button>
        </div>

        {(error || detailsQuery.error || analysisError || uploadError) && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error || (detailsQuery.error instanceof Error ? detailsQuery.error.message : null) || analysisError || uploadError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 bg-white p-8 text-center transition-colors hover:border-electric-400 lg:col-span-2"
          >
            <input ref={fileInput} type="file" accept=".pdf,.docx" onChange={handleFileChange} className="hidden" />
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-electric-50 text-electric-600">
              <UploadCloud size={28} />
            </div>
            <h3 className="mb-1 text-base font-semibold text-gray-900">Upload an updated resume</h3>
            <p className="mb-4 max-w-sm text-xs text-gray-500">
              Resume uploads are securely associated with your signed-in account.
            </p>
            <Button variant="outline" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>Choose File</Button>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-gray-400">
              <Sparkles size={12} className="text-electric-500" />
              <span>{latestAnalysis?.provider ? `Parsed with ${latestAnalysis.provider}${latestAnalysis.model ? ` (${latestAnalysis.model})` : ''}` : 'Analysis provider appears after a completed analysis'}</span>
            </div>
          </Card>

          <Card padding="lg">
            <CardHeader>
              <CardTitle>Your Resumes</CardTitle>
              {loading && <span role="status" className="text-xs text-gray-400">Loading…</span>}
            </CardHeader>
            {resumes.length === 0 && !loading ? (
              <p className="text-sm text-gray-500">No resumes have been uploaded to your account.</p>
            ) : (
              <ul className="space-y-2">
                {resumes.map((resume) => (
                  <li key={resume.id}>
                    <button
                      type="button"
                      onClick={() => user && setSelection({ userId: user.id, resumeId: resume.id })}
                      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${selectedResume?.id === resume.id ? 'bg-electric-50 ring-1 ring-electric-200' : 'bg-gray-50 hover:bg-gray-100'}`}
                    >
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                        <FileCode size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-gray-900">{resume.originalFilename}</span>
                        <span className="mt-0.5 block text-[10px] text-gray-500">
                          {formatDate(resume.createdAt)} · {formatFileSize(resume.fileSizeBytes)}
                        </span>
                      </span>
                      {resume.isActive && <Badge variant="success">Active</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <Card padding="lg">
            <CardTitle className="mb-4">Selected Resume</CardTitle>
            {selectedResume ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-gray-900">{selectedResume.originalFilename}</p>
                    <p className="text-[10px] text-gray-500">Uploaded {formatDate(selectedResume.createdAt)} · {formatFileSize(selectedResume.fileSizeBytes)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Processing status</span>
                  <span className="font-semibold text-gray-800">{selectedResume.processingStatus}</span>
                </div>
                {latestAnalysis?.status === 'COMPLETED' && (
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Analysis status</span>
                    <span className="font-semibold text-gray-800">Completed</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">{loading ? 'Loading your resumes…' : 'Select a resume after uploading one.'}</p>
            )}
          </Card>

          <Card padding="lg" className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Resume Analysis</CardTitle>
              {latestAnalysis?.status && <Badge variant={latestAnalysis.status === 'COMPLETED' ? 'success' : 'outline'}>{latestAnalysis.status}</Badge>}
            </CardHeader>
            {detailsQuery.isPending && selectedResume ? (
              <p role="status" className="text-sm text-gray-500">Loading resume analysis…</p>
            ) : latestAnalysis?.status === 'COMPLETED' ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <section>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-900">Strengths</h4>
                  {latestAnalysis.strengths?.length ? (
                    <ul className="space-y-2 text-xs text-gray-600">
                      {latestAnalysis.strengths.map((strength) => <li key={strength} className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-green-500" /><span>{strength}</span></li>)}
                    </ul>
                  ) : <p className="text-xs text-gray-500">No strengths were returned for this analysis.</p>}
                </section>
                <section>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-900">Recommendations</h4>
                  {latestAnalysis.improvementSuggestions?.length ? (
                    <ul className="space-y-2 text-xs text-gray-600">
                      {latestAnalysis.improvementSuggestions.map((suggestion) => <li key={suggestion} className="flex items-start gap-2"><AlertCircle size={15} className="mt-0.5 flex-shrink-0 text-amber-500" /><span>{suggestion}</span></li>)}
                    </ul>
                  ) : <p className="text-xs text-gray-500">No recommendations were returned for this analysis.</p>}
                </section>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {selectedResume ? 'No completed analysis is available for this resume yet.' : 'Upload a resume to view account-specific analysis.'}
              </p>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
