'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface Profile {
  full_name: string | null
  display_name: string | null
  role: string
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  permissions: string[]
  loading: boolean
}

const AuthCtx = createContext<AuthContextType>({
  user: null,
  profile: null,
  permissions: [],
  loading: true,
})

export const useAuth = () => useContext(AuthCtx)

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) loadProfile()
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null
        setUser(u)
        if (u) loadProfile()
        else {
          setProfile(null)
          setPermissions([])
          setLoading(false)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile() {
    const res = await fetch('/api/me')
    const { profile: prof, permissions: perms } = await res.json()
    setProfile(prof)
    setPermissions(perms ?? [])
    setLoading(false)
  }

  return (
    <AuthCtx.Provider value={{ user, profile, permissions, loading }}>
      {children}
    </AuthCtx.Provider>
  )
}
