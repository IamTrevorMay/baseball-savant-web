import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'owner' && profile?.role !== 'admin') return null
  return user
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ invitations: data })
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await request.json()
  if (!id) {
    return NextResponse.json({ error: 'Invitation ID is required' }, { status: 400 })
  }

  // Get invitation email before deleting
  const { data: inv } = await supabaseAdmin
    .from('invitations')
    .select('email')
    .eq('id', id)
    .single()

  await supabaseAdmin.from('invitations').delete().eq('id', id)

  // Optionally delete the auth user if they haven't signed in yet
  if (inv?.email) {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
    const authUser = users.find(u => u.email === inv.email)
    if (authUser && !authUser.last_sign_in_at) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id)
      await supabaseAdmin.from('profiles').delete().eq('id', authUser.id)
      await supabaseAdmin.from('tool_permissions').delete().eq('user_id', authUser.id)
    }
  }

  return NextResponse.json({ success: true })
}
