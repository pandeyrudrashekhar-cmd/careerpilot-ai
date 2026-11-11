import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { requireSupabase, supabase, supabaseConfigurationError } from '../lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  initializationError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<boolean>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [initializationError, setInitializationError] = useState<string | null>(null)
  const currentUserId = useRef<string | null>(null)

  const applySession = useCallback((nextSession: Session | null) => {
    const nextUserId = nextSession?.user.id ?? null
    if (currentUserId.current && currentUserId.current !== nextUserId) {
      queryClient.clear()
    }
    currentUserId.current = nextUserId
    setSession(nextSession)
  }, [queryClient])

  useEffect(() => {
    if (!supabase) {
      setInitializationError(supabaseConfigurationError)
      setLoading(false)
      return
    }

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
      setInitializationError(null)
      setLoading(false)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) throw error
      applySession(data.session)
      setInitializationError(null)
    }).catch((error: unknown) => {
      if (!active) return
      setSession(null)
      setInitializationError(error instanceof Error ? error.message : 'Unable to restore your session.')
    }).finally(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [applySession, queryClient])

  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireSupabase()
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.session) throw new Error('Supabase did not return an authenticated session.')

    applySession(data.session)
    setInitializationError(null)
  }, [applySession])

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const client = requireSupabase()
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) throw error

    if (data.session) {
      applySession(data.session)
      setInitializationError(null)
    }

    return Boolean(data.session)
  }, [applySession])

  const signOut = useCallback(async () => {
    const client = requireSupabase()
    const { error } = await client.auth.signOut()
    if (error) throw error

    applySession(null)
    queryClient.clear()
    setInitializationError(null)
  }, [applySession, queryClient])

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    loading,
    initializationError,
    signIn,
    signUp,
    signOut,
  }), [session, loading, initializationError, signIn, signUp, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within an AuthProvider.')
  return value
}
