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

  const { event_id, checklist_item_id, checked } = await req.json()

  // Get the event and verify ownership
  const { data: event } = await supabaseAdmin
    .from('schedule_events')
    .select('id, athlete_id, event_type')
    .eq('id', event_id)
    .single()

  if (!event || event.athlete_id !== athlete.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const detailTable = event.event_type === 'throwing' ? 'throwing_details' : 'workout_details'

  // Get current detail row
  const { data: detail } = await supabaseAdmin
    .from(detailTable)
    .select('checklist')
    .eq('event_id', event_id)
    .single()

  if (!detail) return NextResponse.json({ error: 'No details found' }, { status: 404 })

  // Toggle the checklist item
  const checklist = (detail.checklist as { id: string; label: string; checked: boolean }[] || []).map(item =>
    item.id === checklist_item_id ? { ...item, checked } : item
  )

  // Update checklist
  await supabaseAdmin
    .from(detailTable)
    .update({ checklist })
    .eq('event_id', event_id)

  // Recompute completed: all items checked = true
  const allChecked = checklist.length > 0 && checklist.every(item => item.checked)
  await supabaseAdmin
    .from('schedule_events')
    .update({ completed: allChecked, updated_at: new Date().toISOString() })
    .eq('id', event_id)

  return NextResponse.json({ checklist, completed: allChecked })
}
