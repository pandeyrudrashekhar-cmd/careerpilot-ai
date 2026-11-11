import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building, Calendar, ClipboardList, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { apiRequest } from '../lib/api'

type ApplicationStatus = 'SAVED' | 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'WITHDRAWN'

interface ApplicationRecord {
  id: string
  company: string
  role: string
  status: ApplicationStatus
  appliedAt: string | null
  createdAt: string
}

interface ApplicationList {
  applications: ApplicationRecord[]
}

const nextStatuses: Record<ApplicationStatus, ApplicationStatus[]> = {
  SAVED: ['APPLIED', 'WITHDRAWN'],
  APPLIED: ['SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['REJECTED', 'WITHDRAWN'],
  REJECTED: [],
  WITHDRAWN: [],
}

function statusLabel(status: ApplicationStatus): string {
  return status.toLocaleLowerCase('en').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusVariant(status: ApplicationStatus): 'success' | 'info' | 'warning' | 'danger' | 'default' {
  if (status === 'OFFER') return 'success'
  if (status === 'INTERVIEW') return 'info'
  if (status === 'SCREENING') return 'warning'
  if (status === 'REJECTED' || status === 'WITHDRAWN') return 'danger'
  return 'default'
}

export function ApplicationsPage() {
  const { session, user } = useAuth()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<ApplicationStatus | 'All'>('All')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCompany, setNewCompany] = useState('')
  const [newRole, setNewRole] = useState('')
  const [error, setError] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['applications', user?.id ?? '', filter],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', pageSize: '100', sortBy: 'createdAt', sortOrder: 'desc' })
      if (filter !== 'All') params.set('status', filter)
      return apiRequest<ApplicationList>(`/applications?${params}`, session!.access_token)
    },
    enabled: Boolean(session && user),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['applications', user?.id ?? ''] })
  const createMutation = useMutation({
    mutationFn: (input: { company: string; role: string }) => apiRequest<ApplicationRecord>(
      '/applications',
      session!.access_token,
      {
        method: 'POST',
        body: JSON.stringify({ ...input, status: 'APPLIED', appliedAt: new Date().toISOString() }),
      },
    ),
    onSuccess: () => {
      setError(null)
      setNewCompany('')
      setNewRole('')
      setShowAddModal(false)
      void refresh()
    },
    onError: (cause: Error) => setError(cause.message),
  })
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) => apiRequest<ApplicationRecord>(
      `/applications/${encodeURIComponent(id)}/status`,
      session!.access_token,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    ),
    onSuccess: () => {
      setError(null)
      void refresh()
    },
    onError: (cause: Error) => setError(cause.message),
  })

  function handleAdd(event: FormEvent) {
    event.preventDefault()
    setError(null)
    createMutation.mutate({ company: newCompany.trim(), role: newRole.trim() })
  }

  const applications = query.data?.applications ?? []
  const activeError = error ?? (query.error instanceof Error ? query.error.message : null)

  return (
    <DashboardLayout>
      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Application Tracker</h1>
            <p className="text-sm text-gray-500 mt-1">Track applications and update their persisted recruitment status.</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Log application
          </Button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(['All', 'SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                filter === status ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {status === 'All' ? 'All' : statusLabel(status)}
            </button>
          ))}
        </div>

        {activeError && <p role="alert" className="text-sm text-red-700">{activeError}</p>}
        {query.isPending ? (
          <p role="status" className="text-sm text-gray-500">Loading applications...</p>
        ) : applications.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={28} />}
            title="No applications in this category"
            description="Log an application to start tracking it. Application changes are saved to your account."
            action={filter !== 'All' ? <Button variant="outline" size="sm" onClick={() => setFilter('All')}>View all applications</Button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {applications.map((application) => (
              <Card key={application.id} padding="lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-navy-50 text-navy-700 flex items-center justify-center font-bold text-sm">
                      {application.company.slice(0, 1).toLocaleUpperCase('en')}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold text-gray-900">{application.role}</h2>
                        <Badge variant={statusVariant(application.status)}>{statusLabel(application.status)}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 font-medium flex items-center gap-1 mt-1">
                        <Building size={12} /> {application.company}
                        <span className="mx-1">·</span>
                        <Calendar size={12} /> {application.appliedAt
                          ? new Date(application.appliedAt).toLocaleDateString()
                          : 'Application date not recorded'}
                      </p>
                    </div>
                  </div>
                  {nextStatuses[application.status].length > 0 && (
                    <label className="text-xs text-gray-600">
                      Update status
                      <select
                        aria-label={`Update status for ${application.company} ${application.role}`}
                        value=""
                        disabled={updateStatusMutation.isPending}
                        onChange={(event) => {
                          const status = nextStatuses[application.status].find((item) => item === event.target.value)
                          if (status) updateStatusMutation.mutate({ id: application.id, status })
                        }}
                        className="ml-2 text-sm bg-white border border-gray-200 rounded-xl px-3 py-2"
                      >
                        <option value="">Choose next status</option>
                        {nextStatuses[application.status].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
              <h3 className="text-base font-bold text-gray-900 mb-1">Add job application</h3>
              <p className="text-xs text-gray-500 mb-4">This records an application you have already submitted.</p>
              <form onSubmit={handleAdd} className="space-y-4">
                <label className="block text-xs font-semibold text-gray-700">
                  Company name
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={newCompany}
                    onChange={(event) => setNewCompany(event.target.value)}
                    className="mt-1 w-full text-sm px-3 py-2 border border-gray-200 rounded-xl"
                  />
                </label>
                <label className="block text-xs font-semibold text-gray-700">
                  Job title / role
                  <input
                    type="text"
                    required
                    maxLength={240}
                    value={newRole}
                    onChange={(event) => setNewRole(event.target.value)}
                    className="mt-1 w-full text-sm px-3 py-2 border border-gray-200 rounded-xl"
                  />
                </label>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                  <Button variant="ghost" size="sm" type="button" onClick={() => setShowAddModal(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" type="submit" loading={createMutation.isPending}>Save application</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
