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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { role, tools } = await request.json()

  // Update role in profiles
  if (role) {
    await supabaseAdmin.from('profiles').update({ role }).eq('id', id)
  }

  // Update tool permissions
  if (tools !== undefined) {
    // Delete existing permissions
    await supabaseAdmin.from('tool_permissions').delete().eq('user_id', id)
    // Insert new ones (only for non-admin roles)
    if (role !== 'owner' && role !== 'admin' && tools.length > 0) {
      const permRows = tools.map((tool: string) => ({
        user_id: id,
        granted_by: admin.id,
        tool,
      }))
      await supabaseAdmin.from('tool_permissions').insert(permRows)
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  // Prevent self-deletion
  if (id === admin.id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  // Delete from tool_permissions, profiles, invitations, then auth
  await supabaseAdmin.from('tool_permissions').delete().eq('user_id', id)

  // Get email before deleting profile
  const { data: prof } = await supabaseAdmin.from('profiles').select('email').eq('id', id).single()
  await supabaseAdmin.from('profiles').delete().eq('id', id)

  if (prof?.email) {
    await supabaseAdmin.from('invitations').delete().eq('email', prof.email)
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
