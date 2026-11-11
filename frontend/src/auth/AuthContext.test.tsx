import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { AuthProvider, useAuth } from './AuthContext'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'
import { LoginPage } from '../pages/LoginPage'

const { auth } = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    authCallback: undefined as ((event: string, session: Session | null) => void) | undefined,
  },
}))

vi.mock('../lib/supabase', () => ({
  supabase: { auth },
  supabaseConfigurationError: null,
  requireSupabase: () => ({ auth }),
}))

const session = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4_000_000_000,
  user: {
    id: 'user-id',
    app_metadata: {},
    user_metadata: { display_name: 'Rudra Shekhar' },
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    email: 'rudrashekhar.cse123111@bppimt.ac.in',
  },
} as Session

function TestDashboard() {
  const { signOut, user } = useAuth()

  return (
    <>
      <button onClick={() => void signOut()}>Test sign out</button>
      <span>{user?.email}</span>
      <p>Protected dashboard</p>
    </>
  )
}

function renderRoutes(path = '/dashboard') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<ProtectedRoute><TestDashboard /></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

describe('Supabase authentication', () => {
  beforeEach(() => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    auth.onAuthStateChange.mockImplementation((callback) => {
      auth.authCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null })
    auth.signOut.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('restores a Supabase session on refresh and protects dashboard routes', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    renderRoutes()

    expect(await screen.findByText('Protected dashboard')).toBeTruthy()
    expect(screen.getByText('rudrashekhar.cse123111@bppimt.ac.in')).toBeTruthy()
    expect(auth.getSession).toHaveBeenCalledOnce()
  })

  it('redirects an unauthenticated visitor from a protected route to login', async () => {
    renderRoutes()

    expect(await screen.findByRole('heading', { name: 'Sign in to your account' })).toBeTruthy()
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('authenticates with the entered email and password', async () => {
    renderRoutes('/login')

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'rudrashekhar.cse123111@bppimt.ac.in' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'entered-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'rudrashekhar.cse123111@bppimt.ac.in',
      password: 'entered-password',
    }))
    expect(await screen.findByText('Protected dashboard')).toBeTruthy()
  })

  it('does not authenticate when Supabase rejects the entered credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: new Error('Invalid login credentials') })
    renderRoutes('/login')

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'rudrashekhar.cse123111@bppimt.ac.in' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Invalid login credentials')
    expect(screen.queryByText('Protected dashboard')).toBeNull()
  })

  it('calls Supabase signOut and removes access to protected routes', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    const { queryClient } = renderRoutes()

    fireEvent.click(await screen.findByRole('button', { name: 'Test sign out' }))

    await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce())
    expect(await screen.findByRole('heading', { name: 'Sign in to your account' })).toBeTruthy()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('clears cached account data when the authenticated account changes', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    const { queryClient } = renderRoutes()

    await screen.findByText('Protected dashboard')
    queryClient.setQueryData(['resumes', session.user.id], [{ id: 'private-resume' }])

    const otherAccount = {
      ...session,
      user: { ...session.user, id: 'another-user-id', email: 'another@example.test' },
    } as Session
    expect(auth.authCallback).toBeTypeOf('function')
    auth.authCallback?.('SIGNED_IN', otherAccount)

    await waitFor(() => expect(screen.getByText('another@example.test')).toBeTruthy())
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })
})
