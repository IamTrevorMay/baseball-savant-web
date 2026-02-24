import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function MechanicsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    const { data: perm } = await supabase
      .from('tool_permissions').select('id')
      .eq('user_id', user.id).eq('tool', 'mechanics').single()

    if (!perm) redirect('/?denied=mechanics')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <nav className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-6 gap-4">
        <a href="/" className="text-zinc-500 hover:text-zinc-300 text-xs transition">Triton Apex</a>
        <span className="text-zinc-700">/</span>
        <span className="font-bold text-blue-400 tracking-wide text-sm">Mechanics</span>
      </nav>
      {children}
    </div>
  )
}
