'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type WorkRole = 'admin' | 'assistant' | 'member' | null

export function useWorkRole() {
  const [role, setRole] = useState<WorkRole>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('work_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return
      setRole((data?.role as WorkRole) ?? null)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [])

  return {
    role,
    userId,
    loading,
    isAdmin: role === 'admin',
    isStaff: role === 'admin' || role === 'assistant',
    hasAccess: role !== null,
  }
}
