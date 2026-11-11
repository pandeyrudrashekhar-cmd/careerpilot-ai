import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Briefcase,
  Clock,
  ExternalLink,
  MapPin,
  Search,
  Sparkles,
} from 'lucide-react'
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
  description: string
  requiredSkills: string[]
  optionalSkills: string[]
  location: string | null
  remoteStatus: string
  employmentType: string
  applicationUrl: string | null
  postedAt: string | null
}

interface JobSearchResult {
  jobs: JobRecord[]
  pagination: { total: number }
}

interface JobMatch {
  score: number
  matchedSkills: string[]
  missingSkills: string[]
}

function formatEmploymentType(type: string): string {
  return type.toLocaleLowerCase('en').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function JobsPage() {
  const { session, user } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState('All')
  const [error, setError] = useState<string | null>(null)
  const jobsQuery = useQuery({
    queryKey: ['jobs', user?.id ?? '', search, selectedType],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', pageSize: '50' })
      if (search.trim()) params.set('title', search.trim())
      if (selectedType !== 'All') params.set('employmentType', selectedType)
      return apiRequest<JobSearchResult>(`/jobs/search?${params}`, session!.access_token)
    },
    enabled: Boolean(session && user),
  })
  const applicationMutation = useMutation({
    mutationFn: (job: JobRecord) => apiRequest('/applications', session!.access_token, {
      method: 'POST',
      body: JSON.stringify({ jobId: job.id, status: 'SAVED' }),
    }),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['applications', user?.id ?? ''] })
    },
    onError: (cause: Error) => setError(cause.message),
  })
  const matchMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest<JobMatch>(
      `/jobs/${encodeURIComponent(jobId)}/match`,
      session!.access_token,
      { method: 'POST' },
    ),
    onSuccess: (_match, jobId) => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['job-match', user?.id ?? '', jobId] })
    },
    onError: (cause: Error) => setError(cause.message),
  })

  const jobs = jobsQuery.data?.jobs ?? []
  const activeError = error ?? (jobsQuery.error instanceof Error ? jobsQuery.error.message : null)

  return (
    <DashboardLayout>
      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Explore Jobs & Internships</h1>
          <p className="text-sm text-gray-500 mt-1">
            Search roles stored in CareerPilot, save them to your tracker, or calculate a skills match against your active resume.
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-card">
          <div className="flex-1 flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
            <Search size={16} className="text-gray-400 flex-shrink-0" />
            <input
              type="search"
              aria-label="Search jobs"
              placeholder="Search role title..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="bg-transparent text-sm w-full outline-none placeholder-gray-400 text-gray-800"
            />
          </div>
          <label className="text-sm text-gray-600">
            Employment type
            <select
              aria-label="Employment type"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="ml-2 text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-800"
            >
              <option value="All">All types</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </label>
        </div>

        {activeError && <p role="alert" className="text-sm text-red-700">{activeError}</p>}
        {jobsQuery.isPending ? (
          <p role="status" className="text-sm text-gray-500">Loading jobs...</p>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={28} />}
            title="No jobs found"
            description="There are no stored jobs matching this search yet. Try another title or check back after jobs are added."
            action={search || selectedType !== 'All'
              ? <Button variant="outline" size="sm" onClick={() => { setSearch(''); setSelectedType('All') }}>Reset filters</Button>
              : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {jobs.map((job) => {
              const matchedJob = matchMutation.variables === job.id ? matchMutation.data : undefined
              return (
                <Card key={job.id} padding="lg">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-base font-bold text-gray-900">{job.title}</h2>
                        <Badge variant="outline">{formatEmploymentType(job.employmentType)}</Badge>
                        {matchedJob && <Badge variant="info"><Sparkles size={11} /> {matchedJob.score}% skill match</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="font-semibold text-gray-800">{job.company}</span>
                        <span className="flex items-center gap-1"><MapPin size={13} />{job.location || job.remoteStatus}</span>
                        <span className="flex items-center gap-1"><Clock size={13} />{job.postedAt ? new Date(job.postedAt).toLocaleDateString() : 'Posting date not listed'}</span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-3">{job.description}</p>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {[...job.requiredSkills, ...job.optionalSkills].map((skill) => (
                          <span key={skill} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 font-medium">{skill}</span>
                        ))}
                      </div>
                      {matchedJob && (
                        <p className="text-xs text-gray-600">
                          Matched: {matchedJob.matchedSkills.join(', ') || 'none'} · Missing: {matchedJob.missingSkills.join(', ') || 'none'}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        loading={applicationMutation.isPending && applicationMutation.variables?.id === job.id}
                        onClick={() => applicationMutation.mutate(job)}
                      >
                        Save job
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={matchMutation.isPending && matchMutation.variables === job.id}
                        onClick={() => matchMutation.mutate(job.id)}
                      >
                        Match resume
                      </Button>
                      {job.applicationUrl && (
                        <a
                          href={job.applicationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-xl bg-navy-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800"
                        >
                          Apply <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
