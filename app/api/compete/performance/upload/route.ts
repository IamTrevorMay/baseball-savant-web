import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { PitchRow, rowToDb } from '@/lib/compete/pitchSchema'

// Rows come in chunks; Supabase has per-request size limits. 500 works comfortably.
const CHUNK_SIZE = 500

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { fileName?: string; rows?: PitchRow[]; source?: string }
  const rows = body.rows || []
  if (!rows.length) {
    return NextResponse.json({ error: 'No rows' }, { status: 400 })
  }

  // Pull session metadata from the first row that has it.
  const firstDate = rows.find(r => r.Date)?.Date || null
  const firstSessionId = rows.find(r => r.SessionId)?.SessionId || null

  const { data: session, error: sessionErr } = await supabaseAdmin
    .from('compete_pitch_sessions')
    .insert({
      uploaded_by: user.id,
      source: body.source || 'csv_upload',
      file_name: body.fileName || null,
      session_date: firstDate,
      tm_session_id: firstSessionId,
      pitch_count: rows.length,
    })
    .select('id')
    .single()

  if (sessionErr || !session) {
    return NextResponse.json({ error: sessionErr?.message || 'Failed to create session' }, { status: 500 })
  }

  // Bulk insert with tm_pitch_uid conflict → ignore (idempotent re-uploads).
  let inserted = 0
  const dbRows = rows.map(r => rowToDb(r, { session_id: session.id, uploaded_by: user.id }))

  for (let i = 0; i < dbRows.length; i += CHUNK_SIZE) {
    const chunk = dbRows.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabaseAdmin
      .from('compete_pitches')
      .upsert(chunk, { onConflict: 'tm_pitch_uid', ignoreDuplicates: true })
      .select('id')

    if (error) {
      // Roll back the session so we don't leave an orphan.
      await supabaseAdmin.from('compete_pitch_sessions').delete().eq('id', session.id)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    inserted += data?.length || 0
  }

  // Reconcile pitch_count with what actually landed (duplicates are skipped).
  await supabaseAdmin
    .from('compete_pitch_sessions')
    .update({ pitch_count: inserted })
    .eq('id', session.id)

  return NextResponse.json({
    sessionId: session.id,
    inserted,
    skipped: rows.length - inserted,
    total: rows.length,
  })
}
