import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export default async function ModelsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: perm }] = await Promise.all([
    supabaseAdmin.from('profiles').select('role').eq('id', user.id).single(),
    supabaseAdmin.from('tool_permissions').select('id').eq('user_id', user.id).eq('tool', 'models').single(),
  ])

  const isPrivileged = profile?.role === 'owner' || profile?.role === 'admin'
  if (!isPrivileged && !perm) redirect('/?denied=models')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <nav className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-6 gap-4">
        <a href="/" className="font-[family-name:var(--font-bebas)] text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wider transition">TRITON APEX</a>
        <span className="text-zinc-700">/</span>
        <a href="/models" className="font-bold text-purple-400 hover:text-purple-300 tracking-wide text-sm transition">Models</a>
        <span className="text-zinc-700">/</span>
        <div className="flex items-center gap-3 ml-1">
          <a href="/models/matchup" className="text-xs text-zinc-400 hover:text-purple-400 transition">Matchup</a>
          <span className="text-zinc-800 text-[10px]">&#x2022;</span>
          <span className="text-xs text-zinc-600 cursor-default" title="Coming soon">Risk</span>
          <span className="text-zinc-800 text-[10px]">&#x2022;</span>
          <span className="text-xs text-zinc-600 cursor-default" title="Coming soon">Hitter</span>
          <span className="text-zinc-800 text-[10px]">&#x2022;</span>
          <span className="text-xs text-zinc-600 cursor-default" title="Coming soon">Game Call</span>
        </div>
      </nav>
      {children}
    </div>
  )
}
