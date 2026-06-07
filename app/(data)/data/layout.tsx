import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export default async function DataLayout({ children }: { children: React.ReactNode }) {
  // Dev bypass: set DATA_DEV_BYPASS=1 in .env.local to skip auth gate locally.
  // Production builds ignore this unless the env var is explicitly set there.
  const bypass = process.env.DATA_DEV_BYPASS === '1'

  if (!bypass) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [{ data: profile }, { data: perm }] = await Promise.all([
      supabaseAdmin.from('profiles').select('role').eq('id', user.id).single(),
      supabaseAdmin.from('tool_permissions').select('id').eq('user_id', user.id).eq('tool', 'data').single(),
    ])

    const isPrivileged = profile?.role === 'owner' || profile?.role === 'admin'
    if (!isPrivileged && !perm) redirect('/?denied=data')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {children}
    </div>
  )
}
