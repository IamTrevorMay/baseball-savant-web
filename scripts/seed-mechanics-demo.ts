// Seed demo biomech captures. Generates synthetic per-throw metrics sampled around
// the normative bands with a 3-session improving story, runs them through the REAL
// pipeline libs (aggregate → rank → flag → payload → PDF), and writes captures,
// throws, reports (+ PDFs) and notifications straight to Supabase via the service
// role. Bypasses only C3D parse + event geometry — the whole analytics/report path
// is exercised with realistic inputs. Idempotent: clears prior demo rows first.
//
// Run: npx tsx scripts/seed-mechanics-demo.ts

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { METRIC_DEFS, bandFor, type NormBand } from '../lib/mechanics/norms'
import { aggregateSession } from '../lib/mechanics/metrics'
import { rankSession } from '../lib/mechanics/percentile'
import { computeFlags } from '../lib/mechanics/flags'
import { buildReportPayload } from '../lib/mechanics/reportPayload'
import { buildReportPdf } from '../lib/mechanics/pdf'
import type { AthleteLevel, MetricBuckets, ThrowMetrics } from '../lib/mechanics/types'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function valueAtPct(band: NormBand, pct: number): number {
  const pts: Array<[number, number]> = [[10, band.p10], [25, band.p25], [50, band.p50], [75, band.p75], [90, band.p90]]
  if (pct <= 10) return band.p10
  if (pct >= 90) return band.p90
  for (let i = 0; i < pts.length - 1; i++) {
    const [pa, va] = pts[i], [pb, vb] = pts[i + 1]
    if (pct >= pa && pct <= pb) return va + ((pct - pa) / (pb - pa)) * (vb - va)
  }
  return band.p50
}
const round = (n: number, d = 2) => { const f = 10 ** d; return Math.round(n * f) / f }

const STORY: Record<string, number[]> = {
  'hipShoulderSep.maxSeparation': [22, 40, 56],
  'lowerBody.trunkLateralTilt': [82, 62, 46],
  'lowerBody.leadKneeExtVelocity': [28, 46, 62],
  'velocities.trunkAngVel': [46, 56, 68],
  'lowerBody.strideLengthPct': [40, 52, 60],
}
const DEFAULT_TARGET = [50, 54, 58]
const SESSIONS = [
  { date: '2026-04-26', velo: 'max_effort' },
  { date: '2026-06-07', velo: 'max_effort' },
  { date: '2026-07-19', velo: 'max_effort' },
]
const VELO_STORY = [93.1, 93.8, 94.6]
const THROWS_PER_SESSION = 8

interface DemoAthlete { id: string; name: string; level: AthleteLevel; seed: number }
const ATHLETES: DemoAthlete[] = [
  { id: 'da83a6a6-07b7-4a57-9e8f-8097881e9e78', name: 'Trevor May', level: 'pro', seed: 7 },
  { id: 'd52e66fe-8bf5-4ed4-ad32-1eb94e3d105a', name: 'EJ', level: 'college', seed: 19 },
]

function emptyBuckets(): MetricBuckets {
  return {
    armAction: { shoulderAbduction: 0, horizontalAbduction: 0, elbowFlexion: 0 },
    lowerBody: { strideLengthPct: 0, trunkForwardTilt: 0, trunkLateralTilt: 0, leadKneeFlexionFC: 0, leadKneeFlexionRelease: 0, leadKneeExtVelocity: 0, pelvisRotation: 0 },
    velocities: { pelvisAngVel: 0, trunkAngVel: 0, elbowExtVelocity: 0, shoulderIrVelocity: 0 },
    sequencing: { pelvisPeakTime: 0, trunkPeakTime: 0, armPeakTime: 0, pelvisToTrunkGap: 0 },
    hipShoulderSep: { maxSeparation: 0 },
    outcome: { maxExternalRotation: 0, relSpeedMph: null },
    kinetics: { status: 'pending_force_plates', note: 'Torque requires force plates + inverse dynamics (v2).' },
  }
}

async function clearPrior(ath: DemoAthlete) {
  await admin.from('biomech_captures').delete().eq('athlete_profile_id', ath.id).eq('notes', 'Demo capture (synthetic)')
  await admin.from('compete_reports').delete().eq('athlete_id', ath.id).eq('subject_type', 'biomech')
}

async function run() {
  for (const ath of ATHLETES) {
    await clearPrior(ath)
    const rnd = mulberry32(ath.seed)

    for (let si = 0; si < SESSIONS.length; si++) {
      const sess = SESSIONS[si]
      const captureId = randomUUID()
      const throws: ThrowMetrics[] = []

      for (let t = 0; t < THROWS_PER_SESSION; t++) {
        const buckets = emptyBuckets()
        for (const def of METRIC_DEFS) {
          const band = bandFor(def, ath.level)
          const targetPct = STORY[def.key]?.[si] ?? DEFAULT_TARGET[si]
          const noisyPct = Math.min(95, Math.max(5, targetPct + (rnd() - 0.5) * 16))
          const [bucket, leaf] = def.key.split('.')
          ;(buckets as any)[bucket][leaf] = round(valueAtPct(band, noisyPct))
        }
        buckets.outcome.relSpeedMph = round(VELO_STORY[si] + (rnd() - 0.5) * 1.4, 1)
        const fc = 140 + Math.floor(rnd() * 6)
        const mer = fc + 28 + Math.floor(rnd() * 4)
        const rel = mer + 10 + Math.floor(rnd() * 3)
        throws.push({
          throwNo: t + 1,
          events: { footContact: fc, maxExternalRotation: mer, release: rel, confidence: round(0.82 + rnd() * 0.14, 2) },
          metrics: buckets,
          directionalKeys: ['velocities.shoulderIrVelocity', 'outcome.maxExternalRotation', 'armAction.horizontalAbduction'],
          qcFlags: [],
        })
      }

      const sessionMetrics = aggregateSession(throws)
      const percentiles = rankSession(sessionMetrics, ath.level)
      const flags = computeFlags(percentiles)
      const qc = { unmappedJoints: [], throwsDetected: THROWS_PER_SESSION, throwsUsed: THROWS_PER_SESSION }
      const payload = buildReportPayload(
        { sessionMetrics, percentiles, flags, qc },
        { captureId, captureDate: sess.date, level: ath.level, veloContext: sess.velo, system: 'captury_optitrack', athleteName: ath.name },
      )

      // capture
      await admin.from('biomech_captures').insert({
        id: captureId, athlete_profile_id: ath.id, capture_date: sess.date,
        capture_system: 'captury_optitrack', frame_rate: 240, throw_count: THROWS_PER_SESSION,
        velo_context: sess.velo, level: ath.level, status: 'ready',
        notes: 'Demo capture (synthetic)', raw_meta: { qc, demo: true },
      })
      // throws
      await admin.from('biomech_throws').insert(throws.map(tm => ({
        capture_id: captureId, athlete_profile_id: ath.id, throw_no: tm.throwNo,
        frame_foot_contact: tm.events.footContact, frame_mer: tm.events.maxExternalRotation,
        frame_release: tm.events.release, event_confidence: tm.events.confidence,
        metrics: tm.metrics, directional_keys: tm.directionalKeys, qc_flags: tm.qcFlags,
        rel_speed_mph: tm.metrics.outcome.relSpeedMph, excluded: false,
      })))
      // PDF
      let pdfUrl: string | null = null
      try {
        const pdf = buildReportPdf(payload)
        const path = `${ath.id}/${captureId}.pdf`
        await admin.storage.from('biomech-reports').upload(path, Buffer.from(pdf), { contentType: 'application/pdf', upsert: true })
        pdfUrl = admin.storage.from('biomech-reports').getPublicUrl(path).data.publicUrl
      } catch (e) { console.warn('pdf failed', e) }
      // report + notification
      const desc = `Movement grade ${payload.movementGrade}. ${flags.length} priority flag${flags.length === 1 ? '' : 's'}.`
      const { error: repErr } = await admin.from('compete_reports').insert({
        athlete_id: ath.id, title: `Biomechanics Report — ${sess.date}`, description: desc,
        player_name: ath.name, subject_type: 'biomech', report_date: sess.date, pdf_url: pdfUrl, metadata: payload,
      })
      if (repErr) throw new Error(`report insert failed: ${repErr.message}`)
      await admin.from('athlete_notifications').insert({
        athlete_id: ath.id, title: 'New biomechanics report', body: desc, type: 'report',
      })
      console.log(`${ath.name}  ${sess.date}  grade ${payload.movementGrade}  flags ${flags.length}  pdf ${pdfUrl ? 'ok' : 'none'}`)
    }
  }
  console.log('done.')
}

run().catch(e => { console.error(e); process.exit(1) })
