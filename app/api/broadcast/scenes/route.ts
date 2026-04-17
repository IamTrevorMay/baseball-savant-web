import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkProjectAccess, canEdit, resolveProjectId } from '@/lib/broadcast/checkProjectAccess'

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const level = await checkProjectAccess(projectId, user.id)
    if (level === 'none') return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data, error } = await supabaseAdmin
      .from('broadcast_scenes')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ scenes: data })
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

    const level = await checkProjectAccess(body.project_id, user.id)
    if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabaseAdmin
      .from('broadcast_scenes')
      .insert({
        project_id: body.project_id,
        name: body.name || 'Untitled Scene',
        sort_order: body.sort_order ?? 0,
        transition_override: body.transition_override || null,
        enter_transition: body.enter_transition || null,
        exit_transition: body.exit_transition || null,
        hotkey_key: body.hotkey_key || null,
        hotkey_color: body.hotkey_color || '#10b981',
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ scene: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    // Resolve project_id from the scene
    const projectId = await resolveProjectId('broadcast_scenes', id)
    if (!projectId) return NextResponse.json({ error: 'Scene not found' }, { status: 404 })

    const level = await checkProjectAccess(projectId, user.id)
    if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('broadcast_scenes')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ scene: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const projectId = await resolveProjectId('broadcast_scenes', body.id)
    if (!projectId) return NextResponse.json({ error: 'Scene not found' }, { status: 404 })

    const level = await checkProjectAccess(projectId, user.id)
    if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await supabaseAdmin
      .from('broadcast_scenes')
      .delete()
      .eq('id', body.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
