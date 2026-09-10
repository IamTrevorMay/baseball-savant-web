import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Server-side work-app access check for API routes. Mirrors the gate in
 * app/(work)/work/layout.tsx: a user has work access if they are a Triton
 * owner/admin, hold a work_roles row, or have the 'work' tool permission.
 */
export type WorkAuth = {
  userId: string
  isTritonAdmin: boolean
  workRole: 'admin' | 'assistant' | 'member' | null
}

export async function getWorkAuth(): Promise<WorkAuth | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: triton }, { data: workRole }, { data: perm }] = await Promise.all([
    supabaseAdmin.from('profiles').select('role').eq('id', user.id).single(),
    supabaseAdmin.from('work_roles').select('role').eq('user_id', user.id).maybeSingle(),
    supabaseAdmin.from('tool_permissions').select('id').eq('user_id', user.id).eq('tool', 'work').single(),
  ])

  const isTritonAdmin = triton?.role === 'owner' || triton?.role === 'admin'
  if (!isTritonAdmin && !workRole && !perm) return null

  return {
    userId: user.id,
    isTritonAdmin,
    workRole: (workRole?.role as WorkAuth['workRole']) ?? null,
  }
}

export function isWorkStaff(auth: WorkAuth): boolean {
  return auth.isTritonAdmin || auth.workRole === 'admin' || auth.workRole === 'assistant'
}

export function isWorkAdmin(auth: WorkAuth): boolean {
  return auth.isTritonAdmin || auth.workRole === 'admin'
}
