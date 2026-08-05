// Kinematic sequence — the angular-velocity time series behind the peak metrics.
//
// `metrics.ts` reduces each segment's rotation to a single peak. This exposes the whole
// curve, using the *identical* heading-rate computation, so the peak drawn on the chart
// is the number printed in the report rather than a lookalike. Any smoothing is applied
// as a separate array; the reported peak is always taken from the raw signal.
//
// Proper sequencing is proximal→distal: pelvis peaks first and lowest, then trunk, then
// upper arm, then forearm/hand — each later and faster. The chart's job is to make a
// broken order obvious at a glance, which a single `pelvisToTrunkGap` number cannot.

import type { CanonicalCapture, EventFrames, JointKey, Vec3 } from './types'
import type { Hand, UpAxis } from './events'

const deg = (r: number) => (r * 180) / Math.PI

/** Horizontal heading of a vector, ignoring the up component — as metrics.ts defines it. */
function heading(v: Vec3, upAxis: UpAxis): number {
  const h = upAxis === 'z' ? [v.x, v.y] : upAxis === 'y' ? [v.x, v.z] : [v.y, v.z]
  return deg(Math.atan2(h[1], h[0]))
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })

function angleBetween(a: Vec3, b: Vec3): number {
  const ma = Math.hypot(a.x, a.y, a.z), mb = Math.hypot(b.x, b.y, b.z)
  if (!ma || !mb) return NaN
  const d = (a.x * b.x + a.y * b.y + a.z * b.z) / (ma * mb)
  return deg(Math.acos(Math.min(1, Math.max(-1, d))))
}

/**
 * Signed angular velocity (°/s) of the line jA→jB about the up axis, by the same
 * central difference `peakAngVel` uses. NaN where either endpoint is occluded.
 */
function segmentAngVel(
  cap: CanonicalCapture, jA: JointKey, jB: JointKey, f: number, upAxis: UpAxis,
): number {
  const a0 = cap.joints[jA]?.[f - 1], b0 = cap.joints[jB]?.[f - 1]
  const a1 = cap.joints[jA]?.[f + 1], b1 = cap.joints[jB]?.[f + 1]
  if (!a0 || !b0 || !a1 || !b1) return NaN
  let dh = heading(sub(a1, b1), upAxis) - heading(sub(a0, b0), upAxis)
  while (dh > 180) dh -= 360
  while (dh < -180) dh += 360
  return Math.abs(dh) * (cap.frameRate / 2)
}

/** Lead-knee extension velocity (°/s, positive = extending), matching metrics.ts's angle. */
function kneeExtVel(cap: CanonicalCapture, lead: 'l' | 'r', f: number): number {
  const flex = (fr: number) => {
    const hip = cap.joints[`hip_${lead}` as JointKey]?.[fr]
    const knee = cap.joints[`knee_${lead}` as JointKey]?.[fr]
    const ankle = cap.joints[`ankle_${lead}` as JointKey]?.[fr]
    if (!hip || !knee || !ankle) return NaN
    return 180 - angleBetween(sub(hip, knee), sub(ankle, knee))
  }
  const a = flex(f - 1), b = flex(f + 1)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
  return (a - b) * (cap.frameRate / 2)
}

/**
 * Zero-phase smoothing: a centered moving average run twice, which approximates a
 * Gaussian without shifting peaks in time. Deliberately simple and declared — it is a
 * display aid, never the source of a reported number.
 *
 * @param win half-window in frames; 2×win+1 samples per pass
 */
function smooth(src: Float32Array, win: number): Float32Array {
  const pass = (input: Float32Array) => {
    const out = new Float32Array(input.length)
    for (let i = 0; i < input.length; i++) {
      let sum = 0, n = 0
      for (let k = -win; k <= win; k++) {
        const v = input[i + k]
        if (v !== undefined && Number.isFinite(v)) { sum += v; n++ }
      }
      out[i] = n ? sum / n : NaN
    }
    return out
  }
  return pass(pass(src))
}

export interface SeqSeries {
  key: string
  label: string
  /** the metric in METRIC_DEFS this curve's peak corresponds to, when there is one */
  metricKey?: string
  /** unsmoothed — what metrics.ts sees */
  raw: Float32Array
  /** display only */
  smooth: Float32Array
  /** peak of the RAW signal over the same interval metrics.ts searches for this metric */
  peakFrame: number
  peakValue: number
  /**
   * Set only when the reported metric is a *different quantity* from this curve's peak,
   * so the chart can show both rather than implying agreement. Today that is lead-knee
   * extension: metrics.ts reports a mean rate across foot contact → release, not a peak.
   */
  reportedValue?: number
  reportedNote?: string
}

export interface SequenceResult {
  startFrame: number
  endFrame: number
  frameRate: number
  /** rotational segments, proximal → distal; share one °/s axis */
  rotational: SeqSeries[]
  /** joint-angle rate, an order of magnitude smaller — its own panel, same time axis */
  knee: SeqSeries
  /** true when raw peaks occur proximal → distal, the healthy pattern */
  sequencedCorrectly: boolean
}

export interface SequenceOptions {
  upAxis?: UpAxis
  /** half-window for the display smoothing, in frames */
  smoothWin?: number
}

export function buildSequence(
  cap: CanonicalCapture,
  events: EventFrames,
  hand: Hand,
  window: { start: number; end: number },
  opts: SequenceOptions = {},
): SequenceResult {
  const upAxis = opts.upAxis ?? 'z'
  const win = opts.smoothWin ?? 4          // ±4 frames ⇒ ~9-sample passes at 240 Hz
  const lead: 'l' | 'r' = hand === 'R' ? 'l' : 'r'
  const shoulder: JointKey = hand === 'R' ? 'shoulder_r' : 'shoulder_l'
  const elbow: JointKey = hand === 'R' ? 'elbow_r' : 'elbow_l'
  const wrist: JointKey = hand === 'R' ? 'wrist_r' : 'wrist_l'

  const start = Math.max(1, window.start)
  const end = Math.min(cap.frameCount - 2, window.end)
  const n = Math.max(0, end - start + 1)

  // Each metric searches its own interval — `shoulderIrVelocity` runs MER→release, not
  // foot-contact→release — so the peak-search window is per-series. Getting this wrong
  // makes the chart disagree with the report, which is the one thing it must not do.
  const FC_TO_REL: [number, number] = [events.footContact, events.release]
  const MER_TO_REL: [number, number] = [events.maxExternalRotation, events.release]

  const defs: Array<{ key: string; label: string; metricKey?: string; a: JointKey; b: JointKey; peakWin: [number, number] }> = [
    { key: 'pelvis', label: 'Hips', metricKey: 'velocities.pelvisAngVel', a: 'hip_r', b: 'hip_l', peakWin: FC_TO_REL },
    { key: 'trunk', label: 'Chest', metricKey: 'velocities.trunkAngVel', a: 'shoulder_r', b: 'shoulder_l', peakWin: FC_TO_REL },
    // The upper arm has no peak metric of its own today; it is included because a
    // sequence missing it cannot show whether the arm lags the trunk.
    { key: 'upperArm', label: 'Upper arm', a: shoulder, b: elbow, peakWin: FC_TO_REL },
    { key: 'hand', label: 'Forearm / hand', metricKey: 'velocities.shoulderIrVelocity', a: elbow, b: wrist, peakWin: MER_TO_REL },
  ]

  const build = (
    sample: (f: number) => number,
    peakWin: [number, number],
    meta: Omit<SeqSeries, 'raw' | 'smooth' | 'peakFrame' | 'peakValue'>,
  ): SeqSeries => {
    const raw = new Float32Array(n)
    for (let i = 0; i < n; i++) raw[i] = sample(start + i)
    // `peakAngVel` iterates s+1 … e-1 exclusive; match it so the peak is bit-identical.
    let peakValue = -Infinity, peakFrame = peakWin[0]
    for (let f = Math.max(start, peakWin[0] + 1); f <= Math.min(end, peakWin[1] - 1); f++) {
      const v = raw[f - start]
      if (Number.isFinite(v) && v > peakValue) { peakValue = v; peakFrame = f }
    }
    return {
      ...meta,
      raw,
      smooth: smooth(raw, win),
      peakFrame,
      peakValue: Number.isFinite(peakValue) ? peakValue : NaN,
    }
  }

  const rotational = defs.map(d =>
    build(f => segmentAngVel(cap, d.a, d.b, f, upAxis), d.peakWin,
      { key: d.key, label: d.label, metricKey: d.metricKey }),
  )

  // The knee curve is an instantaneous rate, but metrics.ts reports the *mean* across
  // foot contact → release. Both are carried so the chart can show the gap instead of
  // quietly presenting one as the other.
  const kneeFlexAt = (f: number): number => {
    const hip = cap.joints[`hip_${lead}` as JointKey]?.[f]
    const knee = cap.joints[`knee_${lead}` as JointKey]?.[f]
    const ankle = cap.joints[`ankle_${lead}` as JointKey]?.[f]
    if (!hip || !knee || !ankle) return NaN
    return 180 - angleBetween(sub(hip, knee), sub(ankle, knee))
  }
  const dtSec = Math.max(1, events.release - events.footContact) / cap.frameRate
  const reportedKnee = (kneeFlexAt(events.footContact) - kneeFlexAt(events.release)) / dtSec

  const knee = build(f => kneeExtVel(cap, lead, f), FC_TO_REL, {
    key: 'kneeExt',
    label: 'Lead knee extension',
    metricKey: 'lowerBody.leadKneeExtVelocity',
    reportedValue: Number.isFinite(reportedKnee) ? reportedKnee : undefined,
    reportedNote: 'report uses the mean rate across FC→release, not this peak',
  })

  const peaks = rotational.map(s => s.peakFrame)
  const sequencedCorrectly = peaks.every((p, i) => i === 0 || p >= peaks[i - 1])

  return { startFrame: start, endFrame: end, frameRate: cap.frameRate, rotational, knee, sequencedCorrectly }
}
