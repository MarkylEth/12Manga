'use client'
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

type User = { id: string; email: string; username: string | null } | null
type Profile = { role: string | null } | null

type AuthCtx = {
  user: User
  profile: Profile
  loading: boolean
  register: (email: string, username?: string) => Promise<{ ok: boolean; sent?: boolean; error?: string }>
  login: (email: string) => Promise<{ ok: boolean; sent?: boolean; error?: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null)
  const [profile, setProfile] = useState<Profile>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' })
      const j = await r.json()
      setUser(j.user ?? null)
      setProfile(j.profile ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const register: AuthCtx['register'] = async (email, username) => {
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username }),
      })
      const j = await r.json()
      return j
    } catch {
      return { ok: false, error: 'network' }
    }
  }

  const login: AuthCtx['login'] = async (email) => {
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const j = await r.json()
      return j
    } catch {
      return { ok: false, error: 'network' }
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null); setProfile(null)
  }

  return (
    <Ctx.Provider value={{ user, profile, loading, register, login, logout, refresh }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
