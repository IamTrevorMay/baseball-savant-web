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
      if (user) loadProfile(user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null
        setUser(u)
        if (u) loadProfile(u.id)
        else {
          setProfile(null)
          setPermissions([])
          setLoading(false)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    const [{ data: prof }, { data: perms }] = await Promise.all([
      supabase.from('profiles').select('full_name, display_name, role').eq('id', userId).single(),
      supabase.from('tool_permissions').select('tool').eq('user_id', userId),
    ])
    setProfile(prof)
    if (prof?.role === 'owner' || prof?.role === 'admin') {
      setPermissions(['research', 'mechanics', 'models', 'compete'])
    } else {
      setPermissions(perms?.map((p: any) => p.tool) ?? [])
    }
    setLoading(false)
  }

  return (
    <AuthCtx.Provider value={{ user, profile, permissions, loading }}>
      {children}
    </AuthCtx.Provider>
  )
}
