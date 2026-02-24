import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ResearchLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check permission
  // Check permission — profile role OR explicit tool_permissions
  const [{ data: profile }, { data: perm }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('tool_permissions').select('id').eq('user_id', user.id).eq('tool', 'research').single(),
  ])

  const isPrivileged = profile?.role === 'owner' || profile?.role === 'admin'
  if (!isPrivileged && !perm) redirect('/?denied=research')

  return <>{children}</>
}
