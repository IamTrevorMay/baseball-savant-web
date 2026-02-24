import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ResearchLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check permission
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    const { data: perm } = await supabase
      .from('tool_permissions').select('id')
      .eq('user_id', user.id).eq('tool', 'research').single()

    if (!perm) redirect('/?denied=research')
  }

  return <>{children}</>
}
