import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkVisionAuth } from '@/lib/visionAuth'

// PATCH /api/trackman/pitch/<pitch_uid>
// Body: subset of mutable fields (currently: tagged_pitch_type, pitcher_name)
// Used by Vision's recall/tag flow to backfill pitch metadata after the fact.

const ALLOWED_FIELDS = new Set([
  'tagged_pitch_type',
  'pitch_call',
  'pitcher_name',
  'pitcher_throws',
  'tagged_target_x',  // not in schema yet but reserved
  'tagged_target_y',
])

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ uid: string }> },
) {
  const auth = checkVisionAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 })

  const { uid } = await ctx.params
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = v
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no updatable fields in body' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('trackman_pitches')
    .update(patch)
    .eq('pitch_uid', uid)
    .select('id, pitch_uid, tagged_pitch_type, pitcher_name')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'pitch_uid not found' }, { status: 404 })

  return NextResponse.json({ pitch: data, updated: patch })
}
