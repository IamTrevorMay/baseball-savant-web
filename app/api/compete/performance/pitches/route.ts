import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { dbToRow } from '@/lib/compete/pitchSchema'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = me?.role === 'admin' || me?.role === 'owner'

  // Authorize: admin sees any session, otherwise only own.
  const { data: session } = await supabaseAdmin
    .from('compete_pitch_sessions')
    .select('id, uploaded_by')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!isAdmin && session.uploaded_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: pitches, error } = await supabaseAdmin
    .from('compete_pitches')
    .select('*')
    .eq('session_id', sessionId)
    .order('pitch_no', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    rows: (pitches || []).map(dbToRow),
  })
}
