import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkProjectAccess } from '@/lib/broadcast/checkProjectAccess'

const SYSTEM_ADMIN_IDS = (process.env.BROADCAST_ADMIN_IDS || '').split(',').filter(Boolean)

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isAdmin = SYSTEM_ADMIN_IDS.includes(user.id)

    if (isAdmin) {
      // Admins see all projects
      const { data, error } = await supabaseAdmin
        .from('broadcast_projects')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const projects = (data || []).map(p => ({
        ...p,
        _userRole: p.user_id === user.id ? 'owner' : 'producer',
      }))
      return NextResponse.json({ projects })
    }

    // Get projects user owns
    const { data: ownedProjects } = await supabaseAdmin
      .from('broadcast_projects')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    // Get projects user is a member of
    const { data: memberships } = await supabaseAdmin
      .from('broadcast_project_members')
      .select('project_id, role')
      .eq('user_id', user.id)

    const memberProjectIds = (memberships || []).map(m => m.project_id)
    const memberRoleMap = new Map((memberships || []).map(m => [m.project_id, m.role]))

    let sharedProjects: any[] = []
    if (memberProjectIds.length > 0) {
      const { data } = await supabaseAdmin
        .from('broadcast_projects')
        .select('*')
        .in('id', memberProjectIds)
        .order('updated_at', { ascending: false })
      sharedProjects = data || []
    }

    const projects = [
      ...(ownedProjects || []).map(p => ({ ...p, _userRole: 'owner' })),
      ...sharedProjects.map(p => ({ ...p, _userRole: memberRoleMap.get(p.id) || 'viewer' })),
    ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    return NextResponse.json({ projects })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    const { data, error } = await supabaseAdmin
      .from('broadcast_projects')
      .insert({
        user_id: user.id,
        name: body.name || 'Untitled Project',
        description: body.description || '',
        settings: body.settings || { fps: 30, defaultTransitionDuration: 15 },
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auto-add system admins as producers on every new project
    const adminIds = SYSTEM_ADMIN_IDS.filter(id => id !== user.id)
    if (adminIds.length > 0) {
      await supabaseAdmin
        .from('broadcast_project_members')
        .insert(adminIds.map(adminId => ({
          project_id: data.id,
          user_id: adminId,
          role: 'producer',
          invited_by: user.id,
        })))
    }

    return NextResponse.json({ id: data.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
