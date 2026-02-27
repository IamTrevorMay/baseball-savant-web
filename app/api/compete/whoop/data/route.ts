import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id, whoop_connected')
    .eq('profile_id', user.id)
    .single()

  if (!athlete || !athlete.whoop_connected) {
    return NextResponse.json({ connected: false, cycles: [], sleep: [], workouts: [] })
  }

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const type = req.nextUrl.searchParams.get('type') || 'all'

  const result: Record<string, unknown[]> = { cycles: [], sleep: [], workouts: [] }

  if (type === 'all' || type === 'cycles') {
    let query = supabaseAdmin
      .from('whoop_cycles')
      .select('*')
      .eq('athlete_id', athlete.id)
      .order('cycle_date', { ascending: true })
    if (from) query = query.gte('cycle_date', from)
    if (to) query = query.lte('cycle_date', to)
    const { data } = await query
    result.cycles = data || []
  }

  if (type === 'all' || type === 'sleep') {
    let query = supabaseAdmin
      .from('whoop_sleep')
      .select('*')
      .eq('athlete_id', athlete.id)
      .order('sleep_date', { ascending: true })
    if (from) query = query.gte('sleep_date', from)
    if (to) query = query.lte('sleep_date', to)
    const { data } = await query
    result.sleep = data || []
  }

  if (type === 'all' || type === 'workouts') {
    let query = supabaseAdmin
      .from('whoop_workouts')
      .select('*')
      .eq('athlete_id', athlete.id)
      .order('workout_date', { ascending: true })
    if (from) query = query.gte('workout_date', from)
    if (to) query = query.lte('workout_date', to)
    const { data } = await query
    result.workouts = data || []
  }

  return NextResponse.json({ connected: true, ...result })
}
