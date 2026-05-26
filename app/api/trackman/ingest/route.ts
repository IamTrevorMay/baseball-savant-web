import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Bearer-token ingest endpoint for Triton Vision (sniff-based pipeline).
// Vision posts a full session at end-of-session: session metadata + typed pitch
// rows (WS-mapped) + an optional JSONL log of every WS frame.
//
// Auth: `Authorization: Bearer <VISION_INGEST_TOKEN>` header.
// Idempotency: trackman.pitches.pitch_uid is UNIQUE; re-posts upsert-ignore.

const CHUNK_SIZE = 500
const SOURCE = 'vision_live'

type SessionPayload = {
  session_date?: string | null
  session_name?: string | null
  tm_session_id?: string | null
  pitch_count?: number
  raw_meta?: Record<string, unknown> | null
}

type PitchPayload = Record<string, unknown> & {
  pitch_uid?: string | null
}

type IngestBody = {
  session: SessionPayload
  pitches: PitchPayload[]
  // JSONL of every WS frame as one string. Optional but recommended.
  ws_jsonl?: string
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const expected = process.env.VISION_INGEST_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: 'Server misconfigured: VISION_INGEST_TOKEN not set' },
      { status: 500 },
    )
  }
  const auth = req.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m || m[1].trim() !== expected) return unauthorized()

  let body: IngestBody
  try {
    body = (await req.json()) as IngestBody
  } catch {
    return bad('Invalid JSON body')
  }
  if (!body || typeof body !== 'object') return bad('Body must be an object')
  if (!body.session || typeof body.session !== 'object') {
    return bad('Missing session metadata')
  }
  const pitches = Array.isArray(body.pitches) ? body.pitches : []

  // 1. Open an ingest_log row up front so failures are tracable.
  const startedAt = new Date().toISOString()
  const { data: logRow, error: logErr } = await supabaseAdmin
    .from('trackman_ingest_log')
    .insert({
      source: SOURCE,
      started_at: startedAt,
      files_seen: body.ws_jsonl ? 1 : 0,
      meta: { client: 'triton-vision', pitch_count_claimed: pitches.length },
    })
    .select('id')
    .single()

  if (logErr) {
    return NextResponse.json({ error: `ingest_log insert failed: ${logErr.message}` }, { status: 500 })
  }
  const ingestLogId = (logRow as { id: string }).id

  const finalizeLog = async (patch: Record<string, unknown>) => {
    await supabaseAdmin
      .from('trackman_ingest_log')
      .update({ finished_at: new Date().toISOString(), ...patch })
      .eq('id', ingestLogId)
  }

  // 2. Insert sessions row.
  const { data: sessionRow, error: sessionErr } = await supabaseAdmin
    .from('trackman_sessions')
    .insert({
      source: SOURCE,
      session_date: body.session.session_date ?? null,
      session_name: body.session.session_name ?? null,
      tm_session_id: body.session.tm_session_id ?? null,
      pitch_count: pitches.length,
      raw_meta: body.session.raw_meta ?? null,
    })
    .select('id')
    .single()

  if (sessionErr || !sessionRow) {
    await finalizeLog({ error_text: `sessions insert failed: ${sessionErr?.message ?? 'unknown'}` })
    return NextResponse.json(
      { error: sessionErr?.message ?? 'Failed to create session' },
      { status: 500 },
    )
  }
  const sessionId = (sessionRow as { id: string }).id

  // 3. Bulk upsert typed pitch rows (idempotent on pitch_uid).
  let inserted = 0
  if (pitches.length > 0) {
    const dbRows = pitches.map((p) => ({
      ...p,
      session_id: sessionId,
      source: SOURCE,
      tm_session_id: body.session.tm_session_id ?? null,
    }))
    for (let i = 0; i < dbRows.length; i += CHUNK_SIZE) {
      const chunk = dbRows.slice(i, i + CHUNK_SIZE)
      const { data, error } = await supabaseAdmin
        .from('trackman_pitches')
        .upsert(chunk, { onConflict: 'pitch_uid', ignoreDuplicates: true })
        .select('id')

      if (error) {
        await supabaseAdmin.from('trackman_sessions').delete().eq('id', sessionId)
        await finalizeLog({
          error_text: `pitches upsert failed: ${error.message}`,
          pitches_inserted: inserted,
        })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      inserted += data?.length || 0
    }
    // Reconcile pitch_count with what actually landed (duplicates skipped).
    await supabaseAdmin
      .from('trackman_sessions')
      .update({ pitch_count: inserted })
      .eq('id', sessionId)
  }

  // 4. Optional: upload WS JSONL to trackman-raw bucket.
  let rawPath: string | null = null
  if (body.ws_jsonl && body.ws_jsonl.length > 0) {
    rawPath = `${sessionId}/ws.jsonl`
    const blob = new Blob([body.ws_jsonl], { type: 'application/x-ndjson' })
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('trackman-raw')
      .upload(rawPath, blob, { upsert: true, contentType: 'application/x-ndjson' })
    if (uploadErr) {
      // Non-fatal: the typed rows are already in. Log + continue.
      await finalizeLog({
        error_text: `ws_jsonl upload failed: ${uploadErr.message}`,
        pitches_inserted: inserted,
        pitches_skipped: pitches.length - inserted,
      })
      return NextResponse.json(
        {
          sessionId,
          inserted,
          skipped: pitches.length - inserted,
          jsonl_uploaded: false,
          warning: `ws_jsonl upload failed: ${uploadErr.message}`,
        },
        { status: 207 },
      )
    }
    await supabaseAdmin
      .from('trackman_sessions')
      .update({ raw_file_path: rawPath })
      .eq('id', sessionId)
  }

  await finalizeLog({
    files_downloaded: rawPath ? 1 : 0,
    pitches_inserted: inserted,
    pitches_skipped: pitches.length - inserted,
  })

  return NextResponse.json({
    sessionId,
    inserted,
    skipped: pitches.length - inserted,
    total: pitches.length,
    jsonl_uploaded: !!rawPath,
    raw_path: rawPath,
  })
}
