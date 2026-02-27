import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ProgramWeekConfig } from '@/lib/compete/schedule-types'

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

  const { name, start_date, weeks } = await req.json() as {
    name: string
    start_date: string
    weeks: ProgramWeekConfig[]
  }

  if (!weeks || weeks.length === 0 || weeks.length > 8) {
    return NextResponse.json({ error: 'Must have 1-8 weeks' }, { status: 400 })
  }

  // Create the program
  const { data: program, error: progErr } = await supabaseAdmin
    .from('schedule_programs')
    .insert({ athlete_id: athleteId, name, start_date, weeks: weeks.length })
    .select()
    .single()

  if (progErr || !program) {
    return NextResponse.json({ error: progErr?.message || 'Failed to create program' }, { status: 500 })
  }

  // Generate events per-week-per-day
  const startDate = new Date(start_date + 'T00:00:00')
  const events: { athlete_id: string; program_id: string; event_type: string; event_date: string }[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dayDetailMap = new Map<string, { event_type: string; config: any }>()

  for (const week of weeks) {
    const weekOffset = (week.week_number - 1) * 7
    for (const [dayOfWeekStr, dayConfig] of Object.entries(week.days)) {
      if (dayConfig.event_type === 'rest') continue

      const dayOfWeek = Number(dayOfWeekStr)
      const startDow = startDate.getDay()
      const daysOffset = weekOffset + ((dayOfWeek - startDow + 7) % 7)
      const eventDate = new Date(startDate)
      eventDate.setDate(startDate.getDate() + daysOffset)

      // Skip dates before start
      if (eventDate < startDate) continue

      const dateStr = eventDate.toISOString().split('T')[0]
      events.push({
        athlete_id: athleteId,
        program_id: program.id,
        event_type: dayConfig.event_type,
        event_date: dateStr,
      })

      dayDetailMap.set(dateStr, { event_type: dayConfig.event_type, config: dayConfig })
    }
  }

  if (events.length === 0) {
    return NextResponse.json({ program, eventCount: 0 })
  }

  const { data: insertedEvents, error: eventsErr } = await supabaseAdmin
    .from('schedule_events')
    .insert(events)
    .select()

  if (eventsErr) {
    return NextResponse.json({ error: eventsErr.message }, { status: 500 })
  }

  // Create detail rows for each event
  if (insertedEvents) {
    for (const evt of insertedEvents) {
      const detail = dayDetailMap.get(evt.event_date)
      if (!detail) continue

      if (detail.event_type === 'throwing' && detail.config.throwing) {
        await supabaseAdmin.from('throwing_details').insert({
          event_id: evt.id,
          throws: detail.config.throwing.throws ?? null,
          distance_ft: detail.config.throwing.distance_ft ?? null,
          effort_pct: detail.config.throwing.effort_pct ?? null,
          notes: detail.config.throwing.notes ?? null,
        })
      } else if (detail.event_type === 'workout' && detail.config.workout) {
        const exercises = (detail.config.workout.exercises ?? []).map((ex: { id: string; name: string; reps: string; weight: string }) => ({ ...ex, checked: false }))
        await supabaseAdmin.from('workout_details').insert({
          event_id: evt.id,
          title: detail.config.workout.title ?? null,
          description: detail.config.workout.description ?? null,
          exercises,
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

  const { data: program } = await supabaseAdmin
    .from('schedule_programs')
    .select('id, athlete_id')
    .eq('id', id)
    .single()

  if (!program || program.athlete_id !== athleteId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await supabaseAdmin.from('schedule_programs').delete().eq('id', id)

  return NextResponse.json({ success: true })
}
