import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import WorkNav from '@/components/work/WorkNav'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export default async function WorkLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: triton }, { data: workRole }, { data: perm }] = await Promise.all([
    supabaseAdmin.from('profiles').select('role').eq('id', user.id).single(),
    supabaseAdmin.from('work_roles').select('role').eq('user_id', user.id).maybeSingle(),
    supabaseAdmin.from('tool_permissions').select('id').eq('user_id', user.id).eq('tool', 'work').single(),
  ])

  const isTritonAdmin = triton?.role === 'owner' || triton?.role === 'admin'
  if (!isTritonAdmin && !workRole && !perm) redirect('/?denied=work')

  // Triton admins without an explicit work_role default to work-admin behavior.
  const role: 'admin' | 'assistant' | 'member' = (workRole?.role as any) ?? (isTritonAdmin ? 'admin' : 'member')

  return (
    <div className="h-screen bg-zinc-950 text-zinc-200 flex overflow-hidden">
      <WorkNav role={role} />
      <main className="flex-1 overflow-y-auto">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  )
}
