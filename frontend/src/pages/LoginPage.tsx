import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabaseConfigurationError } from '../lib/supabase'
import { Button } from '../components/ui/Button'

interface RedirectState {
  from?: { pathname?: string; search?: string }
}

export function LoginPage() {
  const { user, signIn, initializationError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const redirect = (location.state as RedirectState | null)?.from

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
      navigate(`${redirect?.pathname ?? '/dashboard'}${redirect?.search ?? ''}`, { replace: true })
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to sign in.')
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
        <h1 className="mt-8 text-2xl font-bold text-gray-900">Sign in to your account</h1>
        <p className="mt-2 text-sm text-gray-500">Use your CareerPilot account credentials.</p>
        {(error || initializationError || supabaseConfigurationError) && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error || initializationError || supabaseConfigurationError}
          </p>
        )}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-semibold text-gray-700">Email address</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-navy-700" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-semibold text-gray-700">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-navy-700" />
          </div>
          <Button type="submit" className="w-full" loading={submitting}>Login</Button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500">
          New to CareerPilot? <Link to="/signup" className="font-semibold text-electric-700 hover:underline">Create an account</Link>
        </p>
      </section>
    </main>
  )
}
