import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const sceneId = req.nextUrl.searchParams.get('scene_id')
    const projectId = req.nextUrl.searchParams.get('project_id')

    let query = supabaseAdmin.from('broadcast_scene_assets').select('*')

    if (sceneId) {
      query = query.eq('scene_id', sceneId)
    } else if (projectId) {
      // Get all scene assets for all scenes in a project
      const { data: scenes } = await supabaseAdmin
        .from('broadcast_scenes')
        .select('id')
        .eq('project_id', projectId)

      if (!scenes || scenes.length === 0) return NextResponse.json({ sceneAssets: [] })

      const sceneIds = scenes.map(s => s.id)
      query = query.in('scene_id', sceneIds)
    } else {
      return NextResponse.json({ error: 'scene_id or project_id required' }, { status: 400 })
    }

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sceneAssets: data })
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
      .from('broadcast_scene_assets')
      .insert({
        scene_id: body.scene_id,
        asset_id: body.asset_id,
        override_x: body.override_x ?? null,
        override_y: body.override_y ?? null,
        override_width: body.override_width ?? null,
        override_height: body.override_height ?? null,
        override_layer: body.override_layer ?? null,
        override_opacity: body.override_opacity ?? null,
        is_visible: body.is_visible ?? true,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sceneAsset: data })
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

    const { data, error } = await supabaseAdmin
      .from('broadcast_scene_assets')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sceneAsset: data })
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

    const { error } = await supabaseAdmin
      .from('broadcast_scene_assets')
      .delete()
      .eq('id', body.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
