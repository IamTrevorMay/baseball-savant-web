import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

async function getAthleteId(user: { id: string }) {
  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  return athlete?.id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const athleteId = await getAthleteId(user)
  if (!athleteId) return NextResponse.json({ events: [] })

  const dateParam = req.nextUrl.searchParams.get('date')
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  // Support legacy ?date=today for the Today page
  if (dateParam === 'today') {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
    const { data: events } = await supabaseAdmin
      .from('athlete_schedule')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('start_time', start)
      .lt('start_time', end)
      .order('start_time', { ascending: true })
    return NextResponse.json({ events: events || [] })
  }

  // New schedule events query with date range
  let query = supabaseAdmin
    .from('schedule_events')
    .select('*, throwing_details(*), workout_details(*)')
    .eq('athlete_id', athleteId)
    .order('event_date', { ascending: true })

  if (from) query = query.gte('event_date', from)
  if (to) query = query.lte('event_date', to)

  const { data: events, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the joined details (Supabase returns arrays for 1:1 via select *)
  const normalized = (events || []).map(e => ({
    ...e,
    throwing_details: Array.isArray(e.throwing_details) ? e.throwing_details[0] ?? null : e.throwing_details,
    workout_details: Array.isArray(e.workout_details) ? e.workout_details[0] ?? null : e.workout_details,
  }))

  return NextResponse.json({ events: normalized })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const athleteId = await getAthleteId(user)
  if (!athleteId) return NextResponse.json({ error: 'No athlete profile' }, { status: 400 })

  const body = await req.json()
  const { event_type, event_date, program_id, throwing, workout } = body

  // Create the event
  const { data: event, error: eventErr } = await supabaseAdmin
    .from('schedule_events')
    .insert({ athlete_id: athleteId, event_type, event_date, program_id: program_id || null })
    .select()
    .single()

  if (eventErr || !event) return NextResponse.json({ error: eventErr?.message || 'Failed to create event' }, { status: 500 })

  // Create detail row
  if (event_type === 'throwing' && throwing) {
    await supabaseAdmin.from('throwing_details').insert({
      event_id: event.id,
      throws: throwing.throws ?? null,
      distance_ft: throwing.distance_ft ?? null,
      effort_pct: throwing.effort_pct ?? null,
      notes: throwing.notes ?? null,
    })
  } else if (event_type === 'workout' && workout) {
    const exercises = (workout.exercises ?? []).map((ex: { id: string; name: string; reps: string; weight: string }) => ({ ...ex, checked: false }))
    await supabaseAdmin.from('workout_details').insert({
      event_id: event.id,
      title: workout.title ?? null,
      description: workout.description ?? null,
      exercises,
    })
  }

  // Re-fetch with details
  const { data: full } = await supabaseAdmin
    .from('schedule_events')
    .select('*, throwing_details(*), workout_details(*)')
    .eq('id', event.id)
    .single()

  const normalized = full ? {
    ...full,
    throwing_details: Array.isArray(full.throwing_details) ? full.throwing_details[0] ?? null : full.throwing_details,
    workout_details: Array.isArray(full.workout_details) ? full.workout_details[0] ?? null : full.workout_details,
  } : event

  return NextResponse.json({ event: normalized })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const athleteId = await getAthleteId(user)
  if (!athleteId) return NextResponse.json({ error: 'No athlete profile' }, { status: 400 })

  const body = await req.json()
  const { id, event_date, throwing, workout } = body

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('schedule_events')
    .select('id, athlete_id, event_type')
    .eq('id', id)
    .single()

  if (!existing || existing.athlete_id !== athleteId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Update event date if provided
  if (event_date) {
    await supabaseAdmin.from('schedule_events').update({ event_date, updated_at: new Date().toISOString() }).eq('id', id)
  }

  // Update details
  if (existing.event_type === 'throwing' && throwing) {
    await supabaseAdmin.from('throwing_details').update({
      throws: throwing.throws ?? null,
      distance_ft: throwing.distance_ft ?? null,
      effort_pct: throwing.effort_pct ?? null,
      notes: throwing.notes ?? null,
    }).eq('event_id', id)
  } else if (existing.event_type === 'workout' && workout) {
    const exercises = (workout.exercises ?? []).map((ex: { id: string; name: string; reps: string; weight: string; checked?: boolean }) => ({ ...ex, checked: ex.checked ?? false }))
    await supabaseAdmin.from('workout_details').update({
      title: workout.title ?? null,
      description: workout.description ?? null,
      exercises,
    }).eq('event_id', id)
  }

  // Re-fetch
  const { data: full } = await supabaseAdmin
    .from('schedule_events')
    .select('*, throwing_details(*), workout_details(*)')
    .eq('id', id)
    .single()

  const normalized = full ? {
    ...full,
    throwing_details: Array.isArray(full.throwing_details) ? full.throwing_details[0] ?? null : full.throwing_details,
    workout_details: Array.isArray(full.workout_details) ? full.workout_details[0] ?? null : full.workout_details,
  } : null

  return NextResponse.json({ event: normalized })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const athleteId = await getAthleteId(user)
  if (!athleteId) return NextResponse.json({ error: 'No athlete profile' }, { status: 400 })

  const { id } = await req.json()

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('schedule_events')
    .select('id, athlete_id')
    .eq('id', id)
    .single()

  if (!existing || existing.athlete_id !== athleteId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Cascade delete handles throwing_details/workout_details
  await supabaseAdmin.from('schedule_events').delete().eq('id', id)

  return NextResponse.json({ success: true })
}
