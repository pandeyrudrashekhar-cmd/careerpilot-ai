import { Link } from 'react-router-dom'
import { FileText, Sparkles } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { getUserDisplayName } from '../auth/user'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useResumes } from '../hooks/useResumes'

export function DashboardPage() {
  const { user } = useAuth()
  const { resumes, loading, error } = useResumes()
  const activeResume = resumes.find((resume) => resume.isActive)
  const displayName = user ? getUserDisplayName(user) : 'there'

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-8 p-6 sm:p-8">
        <section className="flex flex-col justify-between gap-4 rounded-3xl bg-gradient-to-r from-navy-900 to-navy-800 p-6 text-white shadow-sm sm:flex-row sm:items-center sm:p-8">
          <div>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-electric-500/20 px-3 py-1 text-xs font-semibold text-electric-300">
              <Sparkles size={13} />
              <span>Your CareerPilot workspace</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome back, {displayName}!</h1>
            <p className="mt-1 max-w-xl text-sm text-navy-200">
              Manage your resume and build your next career step from your personal workspace.
            </p>
          </div>
          <Link to="/resume">
            <Button variant="outline" className="border-navy-700 bg-navy-800/80 text-white hover:bg-navy-700">
              View Resumes
            </Button>
          </Link>
        </section>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card padding="lg">
            <CardHeader>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Your resumes</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{loading ? '…' : resumes.length}</p>
              </div>
              <div className="rounded-xl bg-electric-50 p-2.5 text-electric-600"><FileText size={20} /></div>
            </CardHeader>
            <p className="text-xs text-gray-500">Resume records associated with your authenticated account.</p>
          </Card>

          <Card padding="lg">
            <CardHeader>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Active resume</p>
                <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                  {loading ? 'Loading…' : activeResume?.originalFilename ?? 'None selected'}
                </p>
              </div>
              {activeResume && <Badge variant="success">Active</Badge>}
            </CardHeader>
            <p className="text-xs text-gray-500">
              {activeResume ? `Status: ${activeResume.processingStatus.toLowerCase()}` : 'Upload a resume to get started.'}
            </p>
          </Card>
        </div>

        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle>Continue building your profile</CardTitle>
              <p className="mt-1 text-xs text-gray-500">Resume diagnostics are shown when analysis is available for your document.</p>
            </div>
            <Link to="/resume">
              <Button variant="outline" size="sm">Open resume diagnostics</Button>
            </Link>
          </CardHeader>
        </Card>
      </div>
    </DashboardLayout>
  )
}
