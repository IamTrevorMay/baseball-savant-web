import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    // Try to fetch existing state
    let { data, error } = await supabaseAdmin
      .from('broadcast_widget_state')
      .select('*')
      .eq('project_id', projectId)
      .single()

    // Auto-create if not found
    if (error && error.code === 'PGRST116') {
      const { data: created, error: createErr } = await supabaseAdmin
        .from('broadcast_widget_state')
        .insert({ project_id: projectId })
        .select('*')
        .single()

      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
      data = created
    } else if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ state: data })
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
    const { project_id, ...updates } = body
    if (!project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    updates.updated_at = new Date().toISOString()

    const { error } = await supabaseAdmin
      .from('broadcast_widget_state')
      .update(updates)
      .eq('project_id', project_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
