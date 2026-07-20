import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { processC3D } from '@/lib/mechanics/process'
import type { AthleteLevel } from '@/lib/mechanics/types'
import type { Hand } from '@/lib/mechanics/events'

// Ingest a Captury C3D capture: store raw file, run the biomech pipeline, persist
// the session + per-throw metrics. Admin only. Server-side parse (binary + heavy).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData()
  const file = form.get('file')
  const athleteId = form.get('athlete_id') as string | null
  const captureDate = (form.get('capture_date') as string | null) || null
  const level = ((form.get('level') as string | null) || 'pro') as AthleteLevel
  const veloContext = (form.get('velo_context') as string | null) || null
  const notes = (form.get('notes') as string | null) || null

  if (!(file instanceof File) || !athleteId) {
    return NextResponse.json({ error: 'file and athlete_id are required' }, { status: 400 })
  }

  // Athlete context — handedness + height drive the pipeline.
  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id, throws, height_in')
    .eq('id', athleteId)
    .single()
  if (!athlete) return NextResponse.json({ error: 'Athlete not found' }, { status: 404 })

  const hand: Hand = (athlete.throws || 'R').toUpperCase().startsWith('L') ? 'L' : 'R'
  const heightMm = athlete.height_in ? athlete.height_in * 25.4 : 1830

  const buf = await file.arrayBuffer()

  // Store the raw C3D (the database is the moat — never discard the capture).
  const rawPath = `${athleteId}/${crypto.randomUUID()}.c3d`
  await supabaseAdmin.storage.from('biomech-captures').upload(rawPath, buf, {
    contentType: 'application/octet-stream', upsert: false,
  })

  // Create the capture row up front so a parse failure still leaves a record.
  const { data: capture, error: capErr } = await supabaseAdmin
    .from('biomech_captures')
    .insert({
      athlete_profile_id: athleteId,
      uploaded_by: user.id,
      capture_date: captureDate,
      level,
      velo_context: veloContext,
      notes,
      raw_file_path: rawPath,
      status: 'processing',
      raw_meta: { file_name: file.name, size: buf.byteLength },
    })
    .select('id')
    .single()
  if (capErr || !capture) {
    return NextResponse.json({ error: 'Failed to create capture' }, { status: 500 })
  }

  // Run the pipeline.
  let processed
  try {
    processed = processC3D(buf, { hand, level, heightMm })
  } catch (e) {
    await supabaseAdmin.from('biomech_captures')
      .update({ status: 'failed', raw_meta: { error: String(e), file_name: file.name } })
      .eq('id', capture.id)
    return NextResponse.json({
      error: `C3D parse failed: ${String(e)}. Export Captury CSV-curves as a fallback.`,
      captureId: capture.id,
    }, { status: 422 })
  }

  // Persist per-throw rows.
  const throwRows = processed.throws.map(t => ({
    capture_id: capture.id,
    athlete_profile_id: athleteId,
    throw_no: t.throwNo,
    frame_foot_contact: t.events.footContact,
    frame_mer: t.events.maxExternalRotation,
    frame_release: t.events.release,
    event_confidence: t.events.confidence,
    metrics: t.metrics,
    directional_keys: t.directionalKeys,
    qc_flags: t.qcFlags,
    rel_speed_mph: t.metrics.outcome.relSpeedMph,
    excluded: t.events.confidence < 0.5,
  }))
  if (throwRows.length) {
    await supabaseAdmin.from('biomech_throws').insert(throwRows)
  }

  await supabaseAdmin.from('biomech_captures')
    .update({
      status: 'ready',
      frame_rate: processed.frameRate,
      throw_count: processed.throws.length,
      raw_meta: {
        file_name: file.name, size: buf.byteLength,
        qc: processed.qc,
      },
    })
    .eq('id', capture.id)

  return NextResponse.json({
    captureId: capture.id,
    throwsDetected: processed.qc.throwsDetected,
    throwsUsed: processed.qc.throwsUsed,
    unmappedJoints: processed.qc.unmappedJoints,
    flags: processed.flags.map(f => ({ label: f.label, percentile: f.percentile })),
  })
}
