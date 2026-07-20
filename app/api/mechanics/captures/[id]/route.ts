import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Capture detail: session row + per-throw rows + any published report id. Admin only.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: capture } = await supabaseAdmin
    .from('biomech_captures')
    .select('*, athlete_profiles(player_id, profiles(full_name, display_name))')
    .eq('id', id).single()
  if (!capture) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: throws } = await supabaseAdmin
    .from('biomech_throws').select('*').eq('capture_id', id).order('throw_no')

  // Latest biomech report for this athlete (loose link — reports key on athlete, not capture)
  const { data: report } = await supabaseAdmin
    .from('compete_reports')
    .select('id, created_at, metadata')
    .eq('athlete_id', capture.athlete_profile_id)
    .eq('subject_type', 'biomech')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const a: any = capture.athlete_profiles
  return NextResponse.json({
    capture: {
      id: capture.id,
      athleteProfileId: capture.athlete_profile_id,
      athleteName: a?.profiles?.full_name ?? a?.profiles?.display_name ?? 'Athlete',
      captureDate: capture.capture_date,
      level: capture.level,
      veloContext: capture.velo_context,
      status: capture.status,
      throwCount: capture.throw_count,
      system: capture.capture_system,
      notes: capture.notes,
      rawMeta: capture.raw_meta,
    },
    throws: throws ?? [],
    latestReport: report && report.metadata?.captureId === id ? report : null,
  })
}
