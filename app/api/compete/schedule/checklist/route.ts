import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!athlete) return NextResponse.json({ error: 'No athlete profile' }, { status: 400 })

  const body = await req.json()

  // Get the event and verify ownership
  const { data: event } = await supabaseAdmin
    .from('schedule_events')
    .select('id, athlete_id, event_type')
    .eq('id', body.event_id)
    .single()

  if (!event || event.athlete_id !== athlete.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Flow 1: Throwing — direct completed toggle
  if (event.event_type === 'throwing') {
    const { completed } = body
    await supabaseAdmin
      .from('schedule_events')
      .update({ completed: !!completed, updated_at: new Date().toISOString() })
      .eq('id', event.id)

    return NextResponse.json({ completed: !!completed })
  }

  // Flow 2: Workout — toggle individual exercise, recompute completed
  const { exercise_id, checked } = body

  const { data: detail } = await supabaseAdmin
    .from('workout_details')
    .select('exercises')
    .eq('event_id', event.id)
    .single()

  if (!detail) return NextResponse.json({ error: 'No details found' }, { status: 404 })

  const exercises = ((detail.exercises as { id: string; name: string; reps: string; weight: string; checked: boolean }[]) || []).map(ex =>
    ex.id === exercise_id ? { ...ex, checked: !!checked } : ex
  )

  await supabaseAdmin
    .from('workout_details')
    .update({ exercises })
    .eq('event_id', event.id)

  const allChecked = exercises.length > 0 && exercises.every(ex => ex.checked)
  await supabaseAdmin
    .from('schedule_events')
    .update({ completed: allChecked, updated_at: new Date().toISOString() })
    .eq('id', event.id)

  return NextResponse.json({ exercises, completed: allChecked })
}
