import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Save, User } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { getUserDisplayName } from '../auth/user'
import { DashboardLayout } from '../components/layout/DashboardLayout'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { apiRequest } from '../lib/api'

interface Profile {
  displayName: string | null
  headline: string | null
  summary: string | null
  location: string | null
  websiteUrl: string | null
  githubUrl: string | null
  linkedinUrl: string | null
  targetRole: string | null
}

const profileFields: Array<{ key: keyof Profile; label: string; maxLength: number }> = [
  { key: 'displayName', label: 'Display name', maxLength: 160 },
  { key: 'headline', label: 'Professional headline', maxLength: 240 },
  { key: 'location', label: 'Preferred location', maxLength: 200 },
  { key: 'targetRole', label: 'Target role', maxLength: 200 },
  { key: 'websiteUrl', label: 'Website URL', maxLength: 2048 },
  { key: 'githubUrl', label: 'GitHub URL', maxLength: 2048 },
  { key: 'linkedinUrl', label: 'LinkedIn URL', maxLength: 2048 },
]

export function SettingsPage() {
  const { session, user } = useAuth()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id ?? ''],
    queryFn: () => apiRequest<Profile>('/profile', session!.access_token),
    enabled: Boolean(session && user),
  })
  const profile = values ?? profileQuery.data ?? {
    displayName: null,
    headline: null,
    summary: null,
    location: null,
    websiteUrl: null,
    githubUrl: null,
    linkedinUrl: null,
    targetRole: null,
  }
  const updateMutation = useMutation({
    mutationFn: (updated: Profile) => apiRequest<Profile>('/profile', session!.access_token, {
      method: 'PATCH',
      body: JSON.stringify(updated),
    }),
    onSuccess: (updated) => {
      setValues(updated)
      setError(null)
      queryClient.setQueryData(['profile', user?.id ?? ''], updated)
    },
    onError: (cause: Error) => setError(cause.message),
  })

  function saveProfile(event: FormEvent) {
    event.preventDefault()
    setError(null)
    updateMutation.mutate(profile)
  }

  return (
    <DashboardLayout>
      <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Profile & Preferences</h1>
          <p className="text-sm text-gray-500 mt-1">Update the profile fields CareerPilot stores for your authenticated account.</p>
        </div>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {profileQuery.error instanceof Error && <p role="alert" className="text-sm text-red-700">{profileQuery.error.message}</p>}
        {profileQuery.isPending ? (
          <p role="status" className="text-sm text-gray-500">Loading profile...</p>
        ) : profileQuery.isError ? null : (
          <form onSubmit={saveProfile} className="space-y-6">
            <Card padding="lg">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <User size={18} className="text-navy-700" />
                  <CardTitle>Personal information</CardTitle>
                </div>
              </CardHeader>
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs font-semibold text-gray-700">
                  Account email
                  <input value={user?.email ?? ''} readOnly className="mt-1 w-full text-sm px-3.5 py-2 rounded-xl border border-gray-200 bg-gray-50" />
                </label>
                <label className="block text-xs font-semibold text-gray-700">
                  Account name
                  <input value={user ? getUserDisplayName(user) : ''} readOnly className="mt-1 w-full text-sm px-3.5 py-2 rounded-xl border border-gray-200 bg-gray-50" />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profileFields.map(({ key, label, maxLength }) => (
                  <label key={key} className="block text-xs font-semibold text-gray-700">
                    {label}
                    <input
                      type={key.endsWith('Url') ? 'url' : 'text'}
                      maxLength={maxLength}
                      value={profile[key] ?? ''}
                      onChange={(event) => setValues((current) => ({ ...profile, ...current, [key]: event.target.value || null }))}
                      className="mt-1 w-full text-sm px-3.5 py-2 rounded-xl border border-gray-200"
                    />
                  </label>
                ))}
                <label className="block text-xs font-semibold text-gray-700 sm:col-span-2">
                  Professional summary
                  <textarea
                    rows={5}
                    maxLength={10_000}
                    value={profile.summary ?? ''}
                    onChange={(event) => setValues((current) => ({ ...profile, ...current, summary: event.target.value || null }))}
                    className="mt-1 w-full text-sm px-3.5 py-2 rounded-xl border border-gray-200"
                  />
                </label>
              </div>
            </Card>

            <div className="flex justify-end">
              <Button variant="primary" size="md" type="submit" loading={updateMutation.isPending}>
                {updateMutation.isSuccess && <CheckCircle2 size={15} />}
                <Save size={15} /> Save profile
              </Button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  )
}
