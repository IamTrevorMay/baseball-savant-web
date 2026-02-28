import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, role = 'user', tools = [] } = await request.json()
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Send invite via Supabase auth
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/callback`,
  })
  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  const invitedUserId = inviteData.user.id

  // Pre-create profile with chosen role
  await supabaseAdmin.from('profiles').upsert({
    id: invitedUserId,
    email,
    role,
  }, { onConflict: 'id' })

  // Insert tool permissions for non-admin roles
  if (role !== 'owner' && role !== 'admin' && tools.length > 0) {
    const permRows = tools.map((tool: string) => ({
      user_id: invitedUserId,
      granted_by: user.id,
      tool,
    }))
    await supabaseAdmin.from('tool_permissions').insert(permRows)
  }

  // Record invitation
  await supabaseAdmin.from('invitations').insert({
    email,
    role,
    tools,
    invited_by: user.id,
  })

  return NextResponse.json({ success: true })
}
