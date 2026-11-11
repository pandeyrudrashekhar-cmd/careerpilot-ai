import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabaseConfigurationError } from '../lib/supabase'
import { Button } from '../components/ui/Button'

export function SignupPage() {
  const { signUp, initializationError } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      const hasSession = await signUp(email.trim(), password, name.trim())
      if (hasSession) {
        navigate('/dashboard', { replace: true })
      } else {
        setMessage('Check your email for a confirmation link, then sign in.')
      }
    } catch (signUpError) {
      setError(signUpError instanceof Error ? signUpError.message : 'Unable to create your account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-12">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <Link to="/" className="text-sm font-bold text-navy-800">
          Career<span className="text-electric-600">Pilot</span>
        </Link>
        <h1 className="mt-8 text-2xl font-bold text-gray-900">Create your account</h1>
        <p className="mt-2 text-sm text-gray-500">Use your email to get started with CareerPilot.</p>
        {(error || initializationError || supabaseConfigurationError) && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error || initializationError || supabaseConfigurationError}
          </p>
        )}
        {message && <p role="status" className="mt-5 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-xs font-semibold text-gray-700">Full name</label>
            <input id="name" type="text" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-navy-700" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-semibold text-gray-700">Email address</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-navy-700" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-semibold text-gray-700">Password</label>
            <input id="password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-navy-700" />
          </div>
          <Button type="submit" className="w-full" loading={submitting}>Create account</Button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account? <Link to="/login" className="font-semibold text-electric-700 hover:underline">Sign in</Link>
        </p>
      </section>
    </main>
  )
}
