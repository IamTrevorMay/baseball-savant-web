import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { aggregateSession } from '@/lib/mechanics/metrics'
import { rankSession } from '@/lib/mechanics/percentile'
import { computeFlags } from '@/lib/mechanics/flags'
import { buildReportPayload } from '@/lib/mechanics/reportPayload'
import { buildReportPdf } from '@/lib/mechanics/pdf'
import type { AthleteLevel, MetricBuckets, ThrowMetrics } from '@/lib/mechanics/types'

// Generate a biomech report from a processed capture: re-aggregate stored throws,
// rank + flag, render a PDF, and publish to the athlete's Compete profile via
// compete_reports (+ notification). Admin only.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { captureId } = await req.json() as { captureId?: string }
  if (!captureId) return NextResponse.json({ error: 'captureId required' }, { status: 400 })

  const { data: capture } = await supabaseAdmin
    .from('biomech_captures').select('*').eq('id', captureId).single()
  if (!capture) return NextResponse.json({ error: 'Capture not found' }, { status: 404 })

  const { data: throwRows } = await supabaseAdmin
    .from('biomech_throws').select('*').eq('capture_id', captureId).order('throw_no')
  if (!throwRows || !throwRows.length) {
    return NextResponse.json({ error: 'No throws in capture' }, { status: 400 })
  }

  // Athlete name: prefer players.name via player_id, else profiles.full_name.
  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles').select('profile_id, player_id').eq('id', capture.athlete_profile_id).single()
  let athleteName: string | null = null
  if (athlete?.player_id) {
    const { data: pl } = await supabaseAdmin.from('players').select('name').eq('id', athlete.player_id).single()
    athleteName = pl?.name ?? null
  }
  if (!athleteName && athlete?.profile_id) {
    const { data: pr } = await supabaseAdmin.from('profiles').select('full_name, display_name').eq('id', athlete.profile_id).single()
    athleteName = pr?.full_name ?? pr?.display_name ?? null
  }

  // Re-aggregate from stored per-throw metrics.
  const pool: ThrowMetrics[] = throwRows
    .filter(r => !r.excluded)
    .map(r => ({
      throwNo: r.throw_no,
      events: { footContact: r.frame_foot_contact ?? 0, maxExternalRotation: r.frame_mer ?? 0, release: r.frame_release ?? 0, confidence: r.event_confidence ?? 1 },
      metrics: r.metrics as MetricBuckets,
      directionalKeys: (r.directional_keys as string[]) ?? [],
      qcFlags: (r.qc_flags as string[]) ?? [],
    }))
  const usable = pool.length ? pool : throwRows.map(r => ({
    throwNo: r.throw_no,
    events: { footContact: 0, maxExternalRotation: 0, release: 0, confidence: r.event_confidence ?? 1 },
    metrics: r.metrics as MetricBuckets,
    directionalKeys: [], qcFlags: [],
  }))

  const level = (capture.level ?? 'pro') as AthleteLevel
  const sessionMetrics = aggregateSession(usable)
  const percentiles = rankSession(sessionMetrics, level)
  const flags = computeFlags(percentiles)

  const payload = buildReportPayload(
    { sessionMetrics, percentiles, flags, qc: capture.raw_meta?.qc ?? { unmappedJoints: [], throwsDetected: throwRows.length, throwsUsed: usable.length } },
    {
      captureId, captureDate: capture.capture_date, level,
      veloContext: capture.velo_context, system: capture.capture_system, athleteName,
    },
  )

  // Render + upload PDF (public bucket).
  const pdf = buildReportPdf(payload)
  const pdfPath = `${capture.athlete_profile_id}/${captureId}-${crypto.randomUUID()}.pdf`
  await supabaseAdmin.storage.from('biomech-reports').upload(pdfPath, pdf, {
    contentType: 'application/pdf', upsert: true,
  })
  const { data: pub } = supabaseAdmin.storage.from('biomech-reports').getPublicUrl(pdfPath)
  const pdfUrl = pub?.publicUrl ?? null

  const title = `Biomechanics Report — ${capture.capture_date ?? ''}`.trim()
  const { data: report, error } = await supabaseAdmin
    .from('compete_reports')
    .insert({
      athlete_id: capture.athlete_profile_id,
      title,
      description: `Movement grade ${payload.movementGrade}. ${flags.length} priority flag${flags.length === 1 ? '' : 's'}.`,
      player_name: athleteName,
      subject_type: 'biomech',
      created_by: user.id,
      pdf_url: pdfUrl,
      metadata: payload,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await supabaseAdmin.from('athlete_notifications').insert({
    athlete_id: capture.athlete_profile_id,
    title: `New biomechanics report`,
    body: `Movement grade ${payload.movementGrade} · ${flags.length} priority flag${flags.length === 1 ? '' : 's'}.`,
    type: 'report',
  })

  return NextResponse.json({ reportId: report.id, pdfUrl, movementGrade: payload.movementGrade })
}
