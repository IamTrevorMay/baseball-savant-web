import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import CompeteNav from '@/components/compete/CompeteNav'
import TridentLogo from '@/components/TridentLogo'

export default async function CompeteLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: perm }] = await Promise.all([
    supabaseAdmin.from('profiles').select('role').eq('id', user.id).single(),
    supabaseAdmin.from('tool_permissions').select('id').eq('user_id', user.id).eq('tool', 'compete').single(),
  ])

  const isPrivileged = profile?.role === 'owner' || profile?.role === 'admin'
  if (!isPrivileged && !perm) redirect('/?denied=compete')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 pb-20 md:pb-0">
      <nav className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-6 gap-4">
        <TridentLogo className="w-5 h-6 text-amber-400 mr-1.5" />
        <a href="/" className="font-[family-name:var(--font-bebas)] text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wider transition">TRITON APEX</a>
        <span className="text-zinc-700">/</span>
        <span className="font-bold text-amber-400 tracking-wide text-sm">Compete</span>
        <CompeteNav />
      </nav>
      {children}
    </div>
  )
}
