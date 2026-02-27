import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!athlete) return NextResponse.json({ error: 'No athlete profile' }, { status: 400 })

  // Delete tokens and cached data (CASCADE from whoop_tokens won't cover the cache tables, delete explicitly)
  await Promise.all([
    supabaseAdmin.from('whoop_tokens').delete().eq('athlete_id', athlete.id),
    supabaseAdmin.from('whoop_cycles').delete().eq('athlete_id', athlete.id),
    supabaseAdmin.from('whoop_sleep').delete().eq('athlete_id', athlete.id),
    supabaseAdmin.from('whoop_workouts').delete().eq('athlete_id', athlete.id),
  ])

  // Mark disconnected
  await supabaseAdmin.from('athlete_profiles').update({ whoop_connected: false }).eq('id', athlete.id)

  return NextResponse.json({ success: true })
}
