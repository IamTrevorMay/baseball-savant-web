import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getWorkAuth, isWorkStaff } from '@/lib/work/serverAuth'
import { MOVEMENT_SCREEN_FIELDS } from '@/lib/work/movementScreen'

/**
 * Movement Screening assessments (/work/assessments).
 *
 * GET  — athlete list (Compete athlete_profiles) + caller capabilities;
 *        with ?athleteId=<uuid>, also that athlete's screen history.
 * POST — save a screen for an athlete. Work staff only.
 * DELETE — remove a screen. Work staff only.
 *
 * Reads/writes go through the service-role client; access is gated here via
 * getWorkAuth (same rules as the /work layout).
 */

const FIELD_KEYS = new Set(MOVEMENT_SCREEN_FIELDS.map((f) => f.key))

export async function GET(request: Request) {
  const auth = await getWorkAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: athletes, error } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id, position, level, profiles:profile_id (full_name, display_name)')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const athleteRows = (athletes || []).map((a: any) => ({
    id: a.id,
    name: a.profiles?.full_name || a.profiles?.display_name || 'Unnamed athlete',
    position: a.position,
    level: a.level,
  })).sort((x, y) => x.name.localeCompare(y.name))

  const athleteId = new URL(request.url).searchParams.get('athleteId')
  let screens = null
  if (athleteId) {
    const { data, error: screensErr } = await supabaseAdmin
      .from('work_movement_screens')
      .select('id, athlete_profile_id, assessed_at, responses, notes, source, nbp_submission_id, created_at')
      .eq('athlete_profile_id', athleteId)
      .order('assessed_at', { ascending: false })
      .order('created_at', { ascending: false })
    if (screensErr) return NextResponse.json({ error: screensErr.message }, { status: 500 })
    screens = data
  }

  return NextResponse.json({
    athletes: athleteRows,
    screens,
    canWrite: isWorkStaff(auth),
  })
}

export async function POST(request: Request) {
  const auth = await getWorkAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isWorkStaff(auth)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const athleteProfileId = String(body.athleteProfileId || '')
  if (!athleteProfileId) {
    return NextResponse.json({ error: 'athleteProfileId is required' }, { status: 400 })
  }

  // Keep only known field keys with non-empty string values.
  const responses: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.responses || {})) {
    if (FIELD_KEYS.has(k) && typeof v === 'string' && v.trim() !== '') responses[k] = v.trim()
  }
  if (Object.keys(responses).length === 0) {
    return NextResponse.json({ error: 'Fill in at least one field' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('work_movement_screens')
    .insert({
      athlete_profile_id: athleteProfileId,
      assessed_at: body.assessedAt || new Date().toISOString().slice(0, 10),
      responses,
      notes: typeof body.notes === 'string' && body.notes.trim() !== '' ? body.notes.trim() : null,
      source: 'triton',
      created_by: auth.userId,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, id: data.id })
}

export async function DELETE(request: Request) {
  const auth = await getWorkAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isWorkStaff(auth)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('work_movement_screens').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
