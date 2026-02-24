import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) return NextResponse.json({ events: [] })

  const dateParam = req.nextUrl.searchParams.get('date')

  let query = supabaseAdmin
    .from('athlete_schedule')
    .select('*')
    .eq('athlete_id', athlete.id)
    .order('start_time', { ascending: true })

  if (dateParam === 'today') {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
    query = query.gte('start_time', start).lt('start_time', end)
  } else if (dateParam) {
    const start = new Date(dateParam).toISOString()
    const end = new Date(new Date(dateParam).getTime() + 86400000).toISOString()
    query = query.gte('start_time', start).lt('start_time', end)
  } else {
    // All upcoming
    query = query.gte('start_time', new Date().toISOString())
  }

  const { data: events } = await query

  return NextResponse.json({ events: events || [] })
}
