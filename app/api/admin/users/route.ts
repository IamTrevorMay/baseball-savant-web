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
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get all auth users
  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get all profiles
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, display_name, role, created_at')

  // Get all tool permissions
  const { data: perms } = await supabaseAdmin
    .from('tool_permissions')
    .select('user_id, tool')

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))
  const permMap = new Map<string, string[]>()
  for (const p of perms ?? []) {
    const list = permMap.get(p.user_id) ?? []
    list.push(p.tool)
    permMap.set(p.user_id, list)
  }

  const result = users.map(u => {
    const prof = profileMap.get(u.id)
    const role = prof?.role ?? 'user'
    const tools = (role === 'owner' || role === 'admin')
      ? ['research', 'mechanics', 'models', 'compete', 'visualize']
      : (permMap.get(u.id) ?? [])
    return {
      id: u.id,
      email: u.email,
      full_name: prof?.full_name ?? null,
      display_name: prof?.display_name ?? null,
      role,
      created_at: prof?.created_at ?? u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      tools,
    }
  })

  return NextResponse.json({ users: result })
}
