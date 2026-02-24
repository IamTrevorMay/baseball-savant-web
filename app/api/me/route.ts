import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ profile: null, permissions: [] })
  }

  // Use admin client (bypasses RLS) for profile + permissions
  const [{ data: profile }, { data: perms }] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name, display_name, role').eq('id', user.id).single(),
    supabaseAdmin.from('tool_permissions').select('tool').eq('user_id', user.id),
  ])

  let permissions: string[]
  if (profile?.role === 'owner' || profile?.role === 'admin') {
    permissions = ['research', 'mechanics', 'models', 'compete', 'visualize']
  } else {
    permissions = perms?.map((p: any) => p.tool) ?? []
  }

  return NextResponse.json({ profile, permissions })
}
