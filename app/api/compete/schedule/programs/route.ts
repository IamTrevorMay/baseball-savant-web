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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const athleteId = await getAthleteId(user.id)
  if (!athleteId) return NextResponse.json({ error: 'No athlete profile' }, { status: 400 })

  const { name, type, start_date, weeks, days } = await req.json()
  // days: array of { day_of_week: 0-6, throwing?: {...}, workout?: {...} }

  // Create the program
  const { data: program, error: progErr } = await supabaseAdmin
    .from('schedule_programs')
    .insert({ athlete_id: athleteId, name, type, start_date, weeks })
    .select()
    .single()

  if (progErr || !program) {
    return NextResponse.json({ error: progErr?.message || 'Failed to create program' }, { status: 500 })
  }

  // Generate events for each week
  const startDate = new Date(start_date + 'T00:00:00')
  const events: { athlete_id: string; program_id: string; event_type: string; event_date: string }[] = []

  for (let week = 0; week < weeks; week++) {
    for (const day of (days || [])) {
      const eventDate = new Date(startDate)
      const startDow = startDate.getDay()
      // Calculate days offset: for the current week, shift to the target day_of_week
      const daysOffset = (week * 7) + ((day.day_of_week - startDow + 7) % 7)
      eventDate.setDate(startDate.getDate() + daysOffset)

      // Skip days before start_date (for first week when start is mid-week)
      if (eventDate < startDate) continue

      // Skip days beyond the program end
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + (weeks * 7))
      if (eventDate >= endDate) continue

      const dateStr = eventDate.toISOString().split('T')[0]
      events.push({
        athlete_id: athleteId,
        program_id: program.id,
        event_type: type,
        event_date: dateStr,
      })
    }
  }

  if (events.length === 0) {
    return NextResponse.json({ program, events: [] })
  }

  // Bulk insert events
  const { data: insertedEvents, error: eventsErr } = await supabaseAdmin
    .from('schedule_events')
    .insert(events)
    .select()

  if (eventsErr) {
    return NextResponse.json({ error: eventsErr.message }, { status: 500 })
  }

  // Create detail rows for each event
  if (insertedEvents) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dayMap = new Map<number, any>((days || []).map((d: any) => [d.day_of_week, d]))

    for (const evt of insertedEvents) {
      const evtDate = new Date(evt.event_date + 'T00:00:00')
      const dow = evtDate.getDay()
      const dayConfig = dayMap.get(dow)

      if (type === 'throwing' && dayConfig?.throwing) {
        await supabaseAdmin.from('throwing_details').insert({
          event_id: evt.id,
          throws: dayConfig.throwing.throws ?? null,
          distance_ft: dayConfig.throwing.distance_ft ?? null,
          effort_pct: dayConfig.throwing.effort_pct ?? null,
          notes: dayConfig.throwing.notes ?? null,
          checklist: dayConfig.throwing.checklist ?? [],
        })
      } else if (type === 'workout' && dayConfig?.workout) {
        await supabaseAdmin.from('workout_details').insert({
          event_id: evt.id,
          title: dayConfig.workout.title ?? null,
          description: dayConfig.workout.description ?? null,
          exercises: dayConfig.workout.exercises ?? [],
          checklist: dayConfig.workout.checklist ?? [],
        })
      }
    }
  }

  return NextResponse.json({ program, eventCount: insertedEvents?.length ?? 0 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const athleteId = await getAthleteId(user.id)
  if (!athleteId) return NextResponse.json({ error: 'No athlete profile' }, { status: 400 })

  const { id } = await req.json()

  // Verify ownership
  const { data: program } = await supabaseAdmin
    .from('schedule_programs')
    .select('id, athlete_id')
    .eq('id', id)
    .single()

  if (!program || program.athlete_id !== athleteId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Cascade delete handles events + details
  await supabaseAdmin.from('schedule_programs').delete().eq('id', id)

  return NextResponse.json({ success: true })
}
