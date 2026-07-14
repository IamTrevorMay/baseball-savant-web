import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import CompeteSidebar from '@/components/compete/CompeteSidebar'
import { isAdminRole, isAthleteRole } from '@/lib/roles'

export default async function CompeteLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: perm }] = await Promise.all([
    supabaseAdmin.from('profiles').select('role').eq('id', user.id).single(),
    supabaseAdmin.from('tool_permissions').select('id').eq('user_id', user.id).eq('tool', 'compete').single(),
  ])

  const athlete = isAthleteRole(profile?.role)
  const hasAccess = isAdminRole(profile?.role) || athlete || !!perm
  if (!hasAccess) redirect('/?denied=compete')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <CompeteSidebar athlete={athlete} />
      {/* Offset for the fixed desktop sidebar; athletes have no mobile app-switch
          bar so they don't need its bottom padding. */}
      <main className={`md:ml-56 min-w-0 ${athlete ? '' : 'pb-20 md:pb-0'}`}>
        {children}
      </main>
    </div>
  )
}
