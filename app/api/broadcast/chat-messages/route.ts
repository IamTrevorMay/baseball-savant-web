import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkProjectAccess, canEdit } from '@/lib/broadcast/checkProjectAccess'

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id')
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const level = await checkProjectAccess(projectId, user.id)
    if (level === 'none') return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data, error } = await supabaseAdmin
      .from('broadcast_chat_messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ messages: data })
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
    const { project_id, session_id, messages } = body
    if (!project_id || !messages?.length) {
      return NextResponse.json({ error: 'project_id and messages[] required' }, { status: 400 })
    }

    const level = await checkProjectAccess(project_id, user.id)
    if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const rows = messages.map((m: any) => ({
      project_id,
      session_id: session_id || null,
      provider: m.provider,
      message_type: m.type || 'message',
      display_name: m.displayName,
      color: m.color || '#FFFFFF',
      profile_image_url: m.profileImageUrl || null,
      content: m.content,
      amount: m.amount || null,
      months: m.months || null,
      plan: m.plan || null,
    }))

    const { error } = await supabaseAdmin
      .from('broadcast_chat_messages')
      .insert(rows)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: rows.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const projectId = req.nextUrl.searchParams.get('project_id')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const level = await checkProjectAccess(projectId, user.id)
    if (!canEdit(level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await supabaseAdmin
      .from('broadcast_chat_messages')
      .delete()
      .eq('project_id', projectId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
