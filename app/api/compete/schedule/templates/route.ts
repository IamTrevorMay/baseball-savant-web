import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

async function getAthleteId(userId: string) {
  const { data } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', userId)
    .single()
  return data?.id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const athleteId = await getAthleteId(user.id)
  if (!athleteId) return NextResponse.json({ throwing: [], workout: [] })

  const [{ data: throwing }, { data: workout }] = await Promise.all([
    supabaseAdmin.from('throwing_templates').select('*').eq('athlete_id', athleteId).order('name'),
    supabaseAdmin.from('workout_templates').select('*').eq('athlete_id', athleteId).order('name'),
  ])

  return NextResponse.json({ throwing: throwing || [], workout: workout || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const athleteId = await getAthleteId(user.id)
  if (!athleteId) return NextResponse.json({ error: 'No athlete profile' }, { status: 400 })

  const { type, name, config } = await req.json()
  const table = type === 'throwing' ? 'throwing_templates' : 'workout_templates'

  const { data: template, error } = await supabaseAdmin
    .from(table)
    .insert({ athlete_id: athleteId, name, config })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const athleteId = await getAthleteId(user.id)
  if (!athleteId) return NextResponse.json({ error: 'No athlete profile' }, { status: 400 })

  const { id, type } = await req.json()
  const table = type === 'throwing' ? 'throwing_templates' : 'workout_templates'

  // Verify ownership
  const { data: existing } = await supabaseAdmin.from(table).select('athlete_id').eq('id', id).single()
  if (!existing || existing.athlete_id !== athleteId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await supabaseAdmin.from(table).delete().eq('id', id)
  return NextResponse.json({ success: true })
}
