import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('id')
    const channelName = req.nextUrl.searchParams.get('channel_name')

    if (sessionId) {
      // Public: anyone can read a session by ID (for overlay page)
      const { data, error } = await supabaseAdmin
        .from('broadcast_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 404 })
      return NextResponse.json({ session: data })
    }

    if (channelName) {
      const { data, error } = await supabaseAdmin
        .from('broadcast_sessions')
        .select('*')
        .eq('channel_name', channelName)
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 404 })
      return NextResponse.json({ session: data })
    }

    return NextResponse.json({ error: 'id or channel_name required' }, { status: 400 })
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
      .from('broadcast_sessions')
      .insert({
        project_id: body.project_id,
        user_id: user.id,
        channel_name: body.channel_name,
        is_live: true,
        active_state: { visibleAssets: [] },
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ session: data })
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

    const { error } = await supabaseAdmin
      .from('broadcast_sessions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
