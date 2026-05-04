import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkProjectAccess } from '@/lib/broadcast/checkProjectAccess'

const SYSTEM_ADMIN_IDS = (process.env.BROADCAST_ADMIN_IDS || '').split(',').filter(Boolean)

// GET — list members + owner for a project (viewer+ access)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const projectId = req.nextUrl.searchParams.get('project_id')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const level = await checkProjectAccess(projectId, user.id)
    if (level === 'none') return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Get project owner
    const { data: project } = await supabaseAdmin
      .from('broadcast_projects')
      .select('user_id')
      .eq('id', projectId)
      .single()

    // Get members
    const { data: members, error } = await supabaseAdmin
      .from('broadcast_project_members')
      .select('id, user_id, role, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fetch all auth users
    const { data: users } = await supabaseAdmin.auth.admin.listUsers()
    const allUsers = (users?.users || []).map(u => ({ id: u.id, email: u.email || '' }))

    // Non-owner, non-member users available to add
    const memberIds = new Set((members || []).map(m => m.user_id))
    const ownerId = project?.user_id

    return NextResponse.json({
      owner: {
        user_id: ownerId,
        email: allUsers.find(u => u.id === ownerId)?.email || '',
      },
      members: (members || []).map(m => ({
        ...m,
        email: allUsers.find(u => u.id === m.user_id)?.email || '',
      })),
      allUsers: allUsers
        .filter(u => u.id !== ownerId && !memberIds.has(u.id))
        .map(u => ({ user_id: u.id, email: u.email })),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — add member by email (owner only)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { project_id, email, role } = body

    if (!project_id || !email || !role) {
      return NextResponse.json({ error: 'project_id, email, and role required' }, { status: 400 })
    }
    if (role !== 'viewer' && role !== 'producer') {
      return NextResponse.json({ error: 'role must be viewer or producer' }, { status: 400 })
    }

    const level = await checkProjectAccess(project_id, user.id)
    if (level !== 'owner' && !SYSTEM_ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Only the project owner or an admin can add members' }, { status: 403 })

    // Look up user by email
    const { data: users } = await supabaseAdmin.auth.admin.listUsers()
    const targetUser = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Cannot add self
    if (targetUser.id === user.id) {
      return NextResponse.json({ error: 'Cannot add yourself as a member' }, { status: 400 })
    }

    // Upsert membership
    const { data, error } = await supabaseAdmin
      .from('broadcast_project_members')
      .upsert({
        project_id,
        user_id: targetUser.id,
        role,
        invited_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,user_id' })
      .select('id, user_id, role, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ member: { ...data, email: targetUser.email } })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT — update member role (owner only)
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { id, project_id, role } = body

    if (!id || !project_id || !role) {
      return NextResponse.json({ error: 'id, project_id, and role required' }, { status: 400 })
    }
    if (role !== 'viewer' && role !== 'producer') {
      return NextResponse.json({ error: 'role must be viewer or producer' }, { status: 400 })
    }

    const level = await checkProjectAccess(project_id, user.id)
    if (level !== 'owner' && !SYSTEM_ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Only the project owner or an admin can update members' }, { status: 403 })

    const { error } = await supabaseAdmin
      .from('broadcast_project_members')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE — remove member (owner only)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { id, project_id } = body

    if (!id || !project_id) {
      return NextResponse.json({ error: 'id and project_id required' }, { status: 400 })
    }

    const level = await checkProjectAccess(project_id, user.id)
    if (level !== 'owner' && !SYSTEM_ADMIN_IDS.includes(user.id)) return NextResponse.json({ error: 'Only the project owner or an admin can remove members' }, { status: 403 })

    const { error } = await supabaseAdmin
      .from('broadcast_project_members')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
