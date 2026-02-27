import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { syncWhoopData } from '@/lib/compete/whoop'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id, whoop_connected')
    .eq('profile_id', user.id)
    .single()

  if (!athlete || !athlete.whoop_connected) {
    return NextResponse.json({ error: 'WHOOP not connected' }, { status: 400 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const days = body.days || 30

    const result = await syncWhoopData(athlete.id, days)
    return NextResponse.json({ success: true, synced: result })
  } catch (err) {
    console.error('WHOOP sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
