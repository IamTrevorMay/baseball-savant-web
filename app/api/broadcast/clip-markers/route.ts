import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkProjectAccess, canEdit, resolveProjectId } from '@/lib/broadcast/checkProjectAccess'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
  }

  // Resolve project from session for access check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await supabaseAdmin
    .from('broadcast_sessions')
    .select('project_id')
    .eq('id', sessionId)
    .single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const level = await checkProjectAccess(session.project_id, user.id)
  if (level === 'none') return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('broadcast_clip_markers')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ markers: data })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { session_id, project_id, start_time, clip_type, title, sort_order } = body

    if (!session_id || !project_id) {
      return NextResponse.json({ error: 'session_id and project_id are required' }, { status: 400 })
    }

    const level = await checkProjectAccess(project_id, user.id)
    if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabaseAdmin
      .from('broadcast_clip_markers')
      .insert({
        session_id,
        project_id,
        start_time: start_time ?? null,
        clip_type: clip_type || 'short',
        title: title || '',
        sort_order: sort_order ?? 0,
        status: 'open',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ marker: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const projectId = await resolveProjectId('broadcast_clip_markers', id)
    if (!projectId) return NextResponse.json({ error: 'Marker not found' }, { status: 404 })

    const level = await checkProjectAccess(projectId, user.id)
    if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('broadcast_clip_markers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ marker: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const projectId = await resolveProjectId('broadcast_clip_markers', id)
  if (!projectId) return NextResponse.json({ error: 'Marker not found' }, { status: 404 })

  const level = await checkProjectAccess(projectId, user.id)
  if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabaseAdmin
    .from('broadcast_clip_markers')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
