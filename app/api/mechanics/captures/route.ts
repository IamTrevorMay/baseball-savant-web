import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// List biomech captures (admin: all; optional ?athlete_id filter). Session browser.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const athleteId = req.nextUrl.searchParams.get('athlete_id')
  let q = supabaseAdmin
    .from('biomech_captures')
    .select('id, athlete_profile_id, capture_date, level, velo_context, status, throw_count, capture_system, created_at, athlete_profiles(profiles(full_name, display_name))')
    .order('capture_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (athleteId) q = q.eq('athlete_profile_id', athleteId)

  const { data } = await q
  const captures = (data ?? []).map((c: any) => ({
    id: c.id,
    athleteProfileId: c.athlete_profile_id,
    athleteName: c.athlete_profiles?.profiles?.full_name ?? c.athlete_profiles?.profiles?.display_name ?? 'Athlete',
    captureDate: c.capture_date,
    level: c.level,
    veloContext: c.velo_context,
    status: c.status,
    throwCount: c.throw_count,
    system: c.capture_system,
    createdAt: c.created_at,
  }))
  return NextResponse.json({ captures })
}
