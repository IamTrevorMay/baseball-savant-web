import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export default async function ResearchLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const isPublic = headersList.get('x-triton-public') === '1'

  if (!isPublic) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const [{ data: profile }, { data: perm }] = await Promise.all([
      supabaseAdmin.from('profiles').select('role').eq('id', user.id).single(),
      supabaseAdmin.from('tool_permissions').select('id').eq('user_id', user.id).eq('tool', 'research').single(),
    ])

    const isPrivileged = profile?.role === 'owner' || profile?.role === 'admin'
    if (!isPrivileged && !perm) redirect('/?denied=research')
  }

  return <div className="pb-20 md:pb-0">{children}</div>
}
