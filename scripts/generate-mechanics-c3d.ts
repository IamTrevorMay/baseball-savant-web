// Generate demo Captury-style C3D bullpens for the MEchanics lab.
//
// Unlike scripts/seed-mechanics-demo.ts — which writes metric values straight to
// Supabase — this produces real .c3d files. Uploading them through the Mechanics Lab
// exercises the parts nothing else covers: parseC3D, the Captury→canonical label
// mapper, throw segmentation and event detection, then metric extraction. Nothing is
// asserted into the database; every number in the resulting report is computed by the
// pipeline from marker positions.
//
// Run: npx tsx scripts/generate-mechanics-c3d.ts
// Then upload each file in /mechanics with the settings printed in MANIFEST.md.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  anthroFor, synthesizeSession, type DeliveryParams, type Hand, type ThrowPlan,
} from './mechanics-demo/deliveryModel'
import { calibrate } from './mechanics-demo/calibrate'
import { MARKER_LABELS, toMarkerTrajectories } from './mechanics-demo/markers'
import { writeC3D } from './mechanics-demo/c3dWriter'
import { parseC3D } from '../lib/mechanics/c3d'
import { mapCapturyToCanonical, unmappedJoints } from '../lib/mechanics/captureSchema'
import { processCanonical } from '../lib/mechanics/process'
import { movementGrade } from '../lib/mechanics/reportPayload'
import { METRIC_DEFS, bandFor, flattenMetrics } from '../lib/mechanics/norms'
import type { AthleteLevel } from '../lib/mechanics/types'

const OUT_DIR = join(process.cwd(), 'data', 'mechanics-demo')
const THROWS_PER_SESSION = 8

// ── the three-session arc ──────────────────────────────────────────────────────
// Target percentiles per session. Only metrics the model can move independently are
// given a story; see NOTES at the bottom for the ones that are anatomically pinned.
const STORY: Record<string, number[]> = {
  'hipShoulderSep.maxSeparation': [22, 40, 56],
  'lowerBody.trunkLateralTilt': [82, 62, 46],   // lower is better — this one falls
  'velocities.trunkAngVel': [46, 56, 68],
  'velocities.pelvisAngVel': [38, 50, 62],
  'sequencing.pelvisToTrunkGap': [26, 44, 58],
  'armAction.horizontalAbduction': [34, 46, 55],
  // Held flat: inter-ankle stride is capped by leg length (see NOTES), and pushing it
  // higher collapses lead-knee flexion, so moving it would tell a false story.
  'lowerBody.strideLengthPct': [15, 15, 15],
}
const DEFAULT_ARC = [52, 57, 62]

const SESSIONS = [
  { date: '2026-04-26', velo: 'max_effort' },
  { date: '2026-06-07', velo: 'max_effort' },
  { date: '2026-07-19', velo: 'max_effort' },
]

interface DemoAthlete {
  id: string; name: string; slug: string
  level: AthleteLevel; hand: Hand; heightIn: number
  /** shifts every target percentile, so the two athletes don't render identically */
  bias: number
  seed: number
}

// id / throws / height_in read from athlete_profiles — the upload route derives
// handedness and height from that row, and height directly scales strideLengthPct.
const ATHLETES: DemoAthlete[] = [
  { id: 'da83a6a6-07b7-4a57-9e8f-8097881e9e78', name: 'Trevor May', slug: 'trevor-may', level: 'pro', hand: 'R', heightIn: 77, bias: 0, seed: 7 },
  { id: 'd52e66fe-8bf5-4ed4-ad32-1eb94e3d105a', name: 'EJ', slug: 'ej', level: 'college', hand: 'R', heightIn: 74, bias: -6, seed: 19 },
]

// ── per-throw variation ────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function gauss(rnd: () => number) {
  const u = Math.max(1e-9, rnd())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd())
}

/** Throw-to-throw variability. Event times move in absolute seconds; everything else
 *  scales, so a big parameter varies proportionally to its own magnitude. */
function jitter(p: DeliveryParams, rnd: () => number): DeliveryParams {
  const TIME_KEYS = new Set(['pelvisRotT0', 'pelvisRotT1', 'shoulderRotT0', 'shoulderRotT1'])
  const out = { ...p }
  for (const k of Object.keys(out) as Array<keyof DeliveryParams>) {
    out[k] = (TIME_KEYS.has(k)
      ? out[k] + gauss(rnd) * 0.004
      : out[k] * (1 + gauss(rnd) * 0.007)) as never
  }
  return out
}

// ── report printing ────────────────────────────────────────────────────────────
function printReport(label: string, level: AthleteLevel, res: ReturnType<typeof processCanonical>) {
  const flat = flattenMetrics(res.sessionMetrics)
  console.log(`\n  ${label}`)
  console.log('  metric                                   value      p50    pctile')
  for (const def of METRIC_DEFS) {
    const v = flat[def.key]
    const pct = res.percentiles.find(p => p.key === def.key)?.percentile
    console.log(
      '  ' + def.label.padEnd(38),
      (Number.isFinite(v) ? v.toFixed(1) : 'NaN').padStart(8),
      bandFor(def, level).p50.toFixed(1).padStart(8),
      (pct ?? NaN).toFixed(0).padStart(8),
    )
  }
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true })
  const manifest: string[] = [
    '# MEchanics demo captures',
    '',
    'Synthetic Captury/OptiTrack bullpens generated by `npx tsx scripts/generate-mechanics-c3d.ts`.',
    'Real C3D (Intel float, Z-up, mm, MotionBuilder/HIK joint names) — upload each file at',
    '`/mechanics` → **+ New Capture** with the settings below. The upload form has no',
    'up-axis control; the route defaults to Z, which is what these files use.',
    '',
    'Upload oldest → newest per athlete so the trend chart on the Compete report builds in order.',
    '',
    '| File | Athlete | Capture date | Level | Velo context |',
    '| --- | --- | --- | --- | --- |',
  ]
  const summary: string[] = []

  for (const ath of ATHLETES) {
    const heightMm = ath.heightIn * 25.4
    const anthro = anthroFor(heightMm)
    console.log(`\n=== ${ath.name} (${ath.level}, ${ath.hand}HP, ${ath.heightIn}") ===`)

    for (let si = 0; si < SESSIONS.length; si++) {
      const sess = SESSIONS[si]

      // 1. Solve delivery parameters that land this session's target percentiles.
      const targets: Record<string, number> = {}
      for (const def of METRIC_DEFS) {
        const arc = STORY[def.key] ?? DEFAULT_ARC
        targets[def.key] = Math.min(92, Math.max(6, arc[si] + ath.bias))
      }
      const { params } = calibrate(targets, ath.level, heightMm, ath.hand)

      // 2. Build an 8-throw bullpen with throw-to-throw variation and marker jitter.
      const rnd = mulberry32(ath.seed * 1009 + si * 31)
      const plans: ThrowPlan[] = Array.from({ length: THROWS_PER_SESSION }, (_, t) => ({
        params: jitter(params, rnd),
        noiseMm: 0.6,
        seed: ath.seed * 100 + si * 10 + t,
      }))
      const cap = synthesizeSession(plans, anthro, ath.hand)

      // 3. Write real C3D.
      const file = `${ath.slug}_${sess.date}_bullpen.c3d`
      const buf = writeC3D({
        frameRate: cap.frameRate,
        labels: MARKER_LABELS,
        trajectories: toMarkerTrajectories(cap),
      })
      writeFileSync(join(OUT_DIR, file), buf)

      // 4. Verify by reading the bytes back through the real ingest path.
      const c3d = parseC3D(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
      const canonical = mapCapturyToCanonical(c3d)
      const unmapped = unmappedJoints(c3d)
      const res = processCanonical(canonical, { hand: ath.hand, level: ath.level, heightMm })
      const grade = movementGrade(res.percentiles)

      const sizeMb = (buf.length / 1e6).toFixed(1)
      console.log(
        `\n  ${file}  ${sizeMb} MB  ${c3d.frameCount} frames @ ${c3d.frameRate}Hz  ${c3d.pointCount} markers`,
      )
      console.log(
        `  throws ${res.qc.throwsDetected} detected / ${res.qc.throwsUsed} used   ` +
        `unmapped joints: ${unmapped.length ? unmapped.join(', ') : 'none'}   grade ${grade}`,
      )
      console.log(`  flags: ${res.flags.map(f => `${f.label} (p${f.percentile}, ${f.direction})`).join(' | ') || 'none'}`)
      if (si === SESSIONS.length - 1) printReport(`${ath.name} — final session metric table`, ath.level, res)

      manifest.push(`| \`${file}\` | ${ath.name} | ${sess.date} | ${ath.level} | ${sess.velo} |`)
      summary.push(`${ath.name.padEnd(11)} ${sess.date}  grade ${String(grade).padStart(3)}  ` +
        `throws ${res.qc.throwsUsed}/${res.qc.throwsDetected}  flags ${res.flags.length}`)
    }
  }

  manifest.push(
    '', '## Verified on generation', '',
    '```', ...summary, '```', '',
    '## Notes', '',
    '- `relSpeedMph` is null throughout: the C3D carries no ball data, so release speed',
    '  only appears once a TrackMan session is paired.',
    '- Marker jitter is 0.6 mm. Real Captury joint-centre noise is 3-8 mm, and',
    '  `peakAngVel` differentiates raw positions with no smoothing stage, so the velocity',
    '  metrics read high on real markerless data.',
    '- `lowerBody.strideLengthPct` is held at ~p15. metrics.ts measures it as the',
    '  instantaneous ankle-to-ankle distance at foot contact, which is bounded by leg',
    '  length; reaching the p50 norm (85% of height) forces both knees straight and',
    '  collapses lead-knee flexion and extension velocity.',
  )
  writeFileSync(join(OUT_DIR, 'MANIFEST.md'), manifest.join('\n') + '\n')

  console.log(`\n\nWrote ${ATHLETES.length * SESSIONS.length} captures + MANIFEST.md to ${OUT_DIR}`)
  console.log(summary.map(s => '  ' + s).join('\n'))
}

run().catch(e => { console.error(e); process.exit(1) })
