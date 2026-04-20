import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkProjectAccess, canEdit, resolveProjectId } from '@/lib/broadcast/checkProjectAccess'

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    // Auth check — skip for overlay consumers (no cookies)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const level = await checkProjectAccess(projectId, user.id)
      if (level === 'none') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data, error } = await supabaseAdmin
      .from('broadcast_assets')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ assets: data })
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
      .from('broadcast_assets')
      .insert({
        project_id: body.project_id,
        name: body.name || 'Untitled Asset',
        asset_type: body.asset_type || 'scene',
        scene_config: body.scene_config || null,
        storage_path: body.storage_path || null,
        template_id: body.template_id || null,
        template_data: body.template_data || null,
        slideshow_config: body.slideshow_config || null,
        ad_config: body.ad_config || null,
        widget_config: body.widget_config || null,
        canvas_x: body.canvas_x ?? 0,
        canvas_y: body.canvas_y ?? 0,
        canvas_width: body.canvas_width ?? 1920,
        canvas_height: body.canvas_height ?? 1080,
        layer: body.layer ?? 0,
        enter_transition: body.enter_transition || null,
        exit_transition: body.exit_transition || null,
        opacity: body.opacity ?? 1.0,
        trigger_mode: body.trigger_mode || 'toggle',
        trigger_duration: body.trigger_duration ?? 3.0,
        hotkey_key: body.hotkey_key || null,
        hotkey_label: body.hotkey_label || '',
        hotkey_color: body.hotkey_color || '#06b6d4',
        sort_order: body.sort_order ?? 0,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ asset: data })
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

    const projectId = await resolveProjectId('broadcast_assets', id)
    if (!projectId) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

    const level = await checkProjectAccess(projectId, user.id)
    if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    updates.updated_at = new Date().toISOString()

    const { error } = await supabaseAdmin
      .from('broadcast_assets')
      .update(updates)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
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

    const projectId = await resolveProjectId('broadcast_assets', body.id)
    if (!projectId) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

    const level = await checkProjectAccess(projectId, user.id)
    if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await supabaseAdmin
      .from('broadcast_assets')
      .delete()
      .eq('id', body.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
