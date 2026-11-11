import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BookOpen, CheckCircle2, Layers } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { apiRequest } from '../lib/api'

interface JobRecord {
  id: string
  title: string
  company: string
  requiredSkills: string[]
}

interface RoadmapSummary {
  id: string
  targetRole: string
  skillGaps: string[]
  status: string
  createdAt: string
  _count?: { items: number }
}

interface RoadmapItem {
  id: string
  order: number
  title: string
  description: string
  priority: string
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
}

interface RoadmapDetails extends RoadmapSummary {
  items: RoadmapItem[]
}

interface RoadmapList {
  roadmaps: RoadmapSummary[]
}

interface GeneratedRoadmap {
  roadmap: RoadmapDetails
  skillGapAnalysis: {
    existingSkills: string[]
    missingSkills: string[]
    partiallyMatchingSkills: string[]
    summary: string
  }
}

const roadmapStatuses: RoadmapItem['status'][] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED']
const roadmapTransitions: Record<RoadmapItem['status'], RoadmapItem['status'][]> = {
  NOT_STARTED: ['IN_PROGRESS', 'SKIPPED'],
  IN_PROGRESS: ['NOT_STARTED', 'COMPLETED', 'SKIPPED'],
  COMPLETED: ['IN_PROGRESS'],
  SKIPPED: ['NOT_STARTED', 'IN_PROGRESS'],
}

export function SkillGapPage() {
  const { session, user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedRoadmapId, setSelectedRoadmapId] = useState('')
  const [existingSkills, setExistingSkills] = useState<string[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const jobsQuery = useQuery({
    queryKey: ['jobs', user?.id ?? '', 'roadmap-options'],
    queryFn: () => apiRequest<{ jobs: JobRecord[] }>('/jobs?page=1&pageSize=50', session!.access_token),
    enabled: Boolean(session && user),
  })
  const roadmapsQuery = useQuery({
    queryKey: ['roadmaps', user?.id ?? ''],
    queryFn: () => apiRequest<RoadmapList>('/roadmaps?page=1&pageSize=50', session!.access_token),
    enabled: Boolean(session && user),
  })
  const detailsQuery = useQuery({
    queryKey: ['roadmap', user?.id ?? '', selectedRoadmapId],
    queryFn: () => apiRequest<RoadmapDetails>(`/roadmaps/${encodeURIComponent(selectedRoadmapId)}`, session!.access_token),
    enabled: Boolean(session && user && selectedRoadmapId),
  })
  const generateMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest<GeneratedRoadmap>('/roadmaps/generate', session!.access_token, {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    }),
    onSuccess: (result) => {
      setError(null)
      setSummary(result.skillGapAnalysis.summary)
      setExistingSkills(result.skillGapAnalysis.existingSkills)
      setSelectedRoadmapId(result.roadmap.id)
      queryClient.setQueryData(['roadmap', user?.id ?? '', result.roadmap.id], result.roadmap)
      void queryClient.invalidateQueries({ queryKey: ['roadmaps', user?.id ?? ''] })
    },
    onError: (cause: Error) => setError(cause.message),
  })
  const updateItemMutation = useMutation({
    mutationFn: ({ roadmapId, itemId, status }: { roadmapId: string; itemId: string; status: RoadmapItem['status'] }) =>
      apiRequest<RoadmapItem>(
        `/roadmaps/${encodeURIComponent(roadmapId)}/items/${encodeURIComponent(itemId)}`,
        session!.access_token,
        { method: 'PATCH', body: JSON.stringify({ status }) },
      ),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['roadmap', user?.id ?? '', selectedRoadmapId] })
      void queryClient.invalidateQueries({ queryKey: ['roadmaps', user?.id ?? ''] })
    },
    onError: (cause: Error) => setError(cause.message),
  })

  const jobs = jobsQuery.data?.jobs ?? []
  const roadmaps = roadmapsQuery.data?.roadmaps ?? []
  const roadmap = detailsQuery.data
  const activeError = error
    ?? (jobsQuery.error instanceof Error ? jobsQuery.error.message : null)
    ?? (roadmapsQuery.error instanceof Error ? roadmapsQuery.error.message : null)
    ?? (detailsQuery.error instanceof Error ? detailsQuery.error.message : null)

  return (
    <DashboardLayout>
      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Skill Gap Analysis</h1>
          <p className="text-sm text-gray-500 mt-1">
            Compare your active resume analysis with a stored job's required skills and track a generated learning roadmap.
          </p>
        </div>

        <Card padding="lg">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="flex-1 text-sm font-medium text-gray-700">
              Target job
              <select
                aria-label="Target job"
                value={selectedJobId}
                onChange={(event) => setSelectedJobId(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select a stored job</option>
                {jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.company}</option>)}
              </select>
            </label>
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedJobId}
              loading={generateMutation.isPending}
              onClick={() => {
                setError(null)
                generateMutation.mutate(selectedJobId)
              }}
            >
              Generate skill-gap plan
            </Button>
          </div>
          {jobs.length === 0 && !jobsQuery.isPending && (
            <p className="mt-3 text-xs text-gray-500">Add or import a job before generating a job-specific roadmap.</p>
          )}
        </Card>

        {activeError && <p role="alert" className="text-sm text-red-700">{activeError}</p>}
        {summary && <p role="status" className="text-sm text-gray-700">{summary}</p>}

        {roadmapsQuery.isPending ? (
          <p role="status" className="text-sm text-gray-500">Loading learning plans...</p>
        ) : roadmaps.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={28} />}
            title="No learning plans yet"
            description="Select a stored job above to compare its requirements with your completed resume analysis."
          />
        ) : (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">Your learning plans</h2>
            <div className="flex flex-wrap gap-2">
              {roadmaps.map((item) => (
                <Button
                  key={item.id}
                  variant={selectedRoadmapId === item.id ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedRoadmapId(item.id)
                    setSummary(null)
                  }}
                >
                  {item.targetRole} · {item.skillGaps.length} gaps
                </Button>
              ))}
            </div>
          </section>
        )}

        {existingSkills.length > 0 && (
          <Card padding="lg">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600" /> Skills found in the active resume analysis
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {existingSkills.map((skill) => <Badge key={skill} variant="success">{skill}</Badge>)}
            </div>
          </Card>
        )}

        {detailsQuery.isFetching && <p role="status" className="text-sm text-gray-500">Loading roadmap...</p>}
        {roadmap && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <h2 className="text-base font-bold text-gray-900">{roadmap.targetRole} skill gaps</h2>
            </div>
            {roadmap.items.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={28} />}
                title="No skill gaps found"
                description="The active resume analysis covers the stored required skills for this job."
              />
            ) : roadmap.items.map((item) => (
              <Card key={item.id} padding="lg">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Layers size={15} className="text-gray-400" />
                      <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
                      <Badge variant={item.priority === 'HIGH' ? 'danger' : 'warning'}>{item.priority} priority</Badge>
                    </div>
                    <p className="text-sm text-gray-600">{item.description}</p>
                  </div>
                  <label className="text-xs text-gray-600">
                    Progress
                    <select
                      aria-label={`Progress for ${item.title}`}
                      value={item.status}
                      disabled={updateItemMutation.isPending}
                      onChange={(event) => {
                        const status = roadmapStatuses.find((value) => value === event.target.value)
                        if (status) updateItemMutation.mutate({ roadmapId: roadmap.id, itemId: item.id, status })
                      }}
                      className="ml-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
                      {[item.status, ...roadmapTransitions[item.status]].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                    </select>
                  </label>
                </div>
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  )
}
