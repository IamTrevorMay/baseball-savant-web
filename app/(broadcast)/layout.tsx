import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import BroadcastNav from '@/components/broadcast/BroadcastNav'
import TridentLogo from '@/components/TridentLogo'

export default async function BroadcastLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: perm }] = await Promise.all([
    supabaseAdmin.from('profiles').select('role').eq('id', user.id).single(),
    supabaseAdmin.from('tool_permissions').select('id').eq('user_id', user.id).eq('tool', 'broadcast').single(),
  ])

  const isPrivileged = profile?.role === 'owner' || profile?.role === 'admin'
  if (!isPrivileged && !perm) redirect('/?denied=broadcast')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 pb-20 md:pb-0">
      <nav className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-6 gap-4">
        <TridentLogo className="w-5 h-6 text-red-400 mr-1.5" />
        <a href="/" className="font-[family-name:var(--font-bebas)] text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wider transition">TRITON APEX</a>
        <span className="text-zinc-700">/</span>
        <span className="font-[family-name:var(--font-bebas)] text-red-400 tracking-wide text-sm">Broadcast</span>
        <BroadcastNav />
      </nav>
      {children}
    </div>
  )
}
