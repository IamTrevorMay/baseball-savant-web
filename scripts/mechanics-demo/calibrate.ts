// Calibrate delivery parameters against the real metric extractor.
//
// Rather than writing metric values into the database, the generator poses a skeleton
// and lets lib/mechanics compute the metrics — so the demo can only claim a number the
// pipeline actually produces. That inverts the problem: we need pose parameters that
// yield a wanted percentile. Each parameter is paired with the one metric it dominates
// and solved by bisection over the *real* extractor, then the whole set is swept a few
// times so the genuinely coupled pairs (pelvis height ↔ stride ↔ knee flexion) settle.
//
// Parameters with no independent knob are deliberately absent — see LEAD_KNEE_EXT_NOTE.

import {
  anthroFor, synthesizeThrow, BASE_PARAMS, type Anthro, type DeliveryParams, type Hand,
} from './deliveryModel'
import { processCanonical } from '../../lib/mechanics/process'
import { METRIC_DEF_BY_KEY, bandFor, flattenMetrics, type NormBand } from '../../lib/mechanics/norms'
import type { AthleteLevel } from '../../lib/mechanics/types'

/** Value sitting at `pct` within a norm band (linear between the published knots). */
export function valueAtPct(band: NormBand, pct: number): number {
  const pts: Array<[number, number]> = [[10, band.p10], [25, band.p25], [50, band.p50], [75, band.p75], [90, band.p90]]
  if (pct <= 10) return band.p10
  if (pct >= 90) return band.p90
  for (let i = 0; i < pts.length - 1; i++) {
    const [pa, va] = pts[i], [pb, vb] = pts[i + 1]
    if (pct >= pa && pct <= pb) return va + ((pct - pa) / (pb - pa)) * (vb - va)
  }
  return band.p50
}

/** One tunable: the parameter, the metric it dominates, and its physical range. */
interface Knob { param: keyof DeliveryParams; metric: string; lo: number; hi: number }

const KNOBS: Knob[] = [
  // structural — solved first, and the most strongly coupled to each other
  { param: 'leadAnkleY', metric: 'lowerBody.strideLengthPct', lo: 1150, hi: 1980 },
  { param: 'pelvisZFC', metric: 'lowerBody.leadKneeFlexionFC', lo: 520, hi: 830 },
  { param: 'pelvisZRel', metric: 'lowerBody.leadKneeFlexionRelease', lo: 690, hi: 1010 },
  { param: 'pelvisYawFC', metric: 'lowerBody.pelvisRotation', lo: 8, hi: 72 },
  // trunk
  { param: 'trunkTiltRel', metric: 'lowerBody.trunkForwardTilt', lo: 22, hi: 84 },
  { param: 'trunkAzRel', metric: 'lowerBody.trunkLateralTilt', lo: 32, hi: 88 },
  // arm action at foot contact
  { param: 'armAbdFC', metric: 'armAction.shoulderAbduction', lo: 58, hi: 124 },
  { param: 'armAzFC', metric: 'armAction.horizontalAbduction', lo: 6, hi: 82 },
  { param: 'foreElevFC', metric: 'armAction.elbowFlexion', lo: 0, hi: 74 },
  // rotation magnitudes and the lag between them
  { param: 'pelvisYawEnd', metric: 'velocities.pelvisAngVel', lo: 46, hi: 168 },
  { param: 'shoulderYawEnd', metric: 'velocities.trunkAngVel', lo: 38, hi: 186 },
  { param: 'shoulderYawFC', metric: 'hipShoulderSep.maxSeparation', lo: -74, hi: 34 },
  { param: 'shoulderRotT0', metric: 'sequencing.pelvisToTrunkGap', lo: 0.786, hi: 0.902 },
  // arm whip. foreElevRel is bounded below the upper arm's own elevation so elbow
  // flexion stays a monotone function of it — past that point the forearm crosses the
  // upper-arm axis and the relationship folds back on itself.
  { param: 'foreElevMER', metric: 'outcome.maxExternalRotation', lo: 22, hi: 150 },
  { param: 'foreElevRel', metric: 'velocities.elbowExtVelocity', lo: 38, hi: 96 },
  // `shoulderIrVelocity` is the horizontal *heading* rate of the elbow→wrist vector, so
  // it is ill-conditioned: the rate spikes as the forearm passes vertical and is not
  // monotone in how far the forearm actually sweeps. Widening this range past -150
  // lowers the achieved value rather than raising it. It saturates around p27 — see the
  // metric-definition notes in docs/mechanics.md.
  { param: 'foreAzRel', metric: 'velocities.shoulderIrVelocity', lo: -150, hi: 24 },
]

/**
 * `lowerBody.leadKneeExtVelocity` has no knob of its own: metrics.ts derives it as
 * (flexion@FC − flexion@release) / (release − FC), so it is fully determined once the
 * two knee-flexion metrics are set. It is reported, never targeted.
 */
export const LEAD_KNEE_EXT_NOTE = 'derived from the two knee-flexion targets'

/** Evaluate one metric by posing the skeleton and running the real extractor. */
function evalMetric(p: DeliveryParams, a: Anthro, hand: Hand, level: AthleteLevel, metric: string): number {
  const cap = synthesizeThrow(p, a, hand)
  const res = processCanonical(cap, { hand, level, heightMm: a.heightMm })
  return flattenMetrics(res.sessionMetrics)[metric]
}

export interface CalibrationResult {
  params: DeliveryParams
  /** metric → { target, achieved, percentile } after the final sweep */
  report: Record<string, { target: number; achieved: number; pct: number }>
}

/**
 * Solve for parameters that land each metric at its requested percentile.
 * `targets` maps metric key → wanted percentile (0–100).
 */
export function calibrate(
  targets: Record<string, number>,
  level: AthleteLevel,
  heightMm: number,
  hand: Hand,
  opts: { sweeps?: number; iters?: number; seed?: DeliveryParams } = {},
): CalibrationResult {
  const sweeps = opts.sweeps ?? 4
  const iters = opts.iters ?? 16
  const a = anthroFor(heightMm)
  const params: DeliveryParams = { ...(opts.seed ?? BASE_PARAMS) }

  const wanted = (metric: string) => {
    const def = METRIC_DEF_BY_KEY[metric]
    return valueAtPct(bandFor(def, level), targets[metric] ?? 50)
  }

  for (let s = 0; s < sweeps; s++) {
    for (const knob of KNOBS) {
      if (!(knob.metric in targets)) continue
      const goal = wanted(knob.metric)
      let lo = knob.lo, hi = knob.hi
      const f = (x: number) => {
        params[knob.param] = x as never
        return evalMetric(params, a, hand, level, knob.metric)
      }
      const fLo = f(lo), fHi = f(hi)
      // Bisect on the monotone branch; if the goal sits outside the reachable range,
      // settle on the nearest bound rather than thrashing.
      if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || (goal - fLo) * (goal - fHi) > 0) {
        params[knob.param] = (Math.abs(goal - fLo) <= Math.abs(goal - fHi) ? lo : hi) as never
        continue
      }
      const rising = fHi > fLo
      for (let i = 0; i < iters; i++) {
        const mid = (lo + hi) / 2
        const v = f(mid)
        if (!Number.isFinite(v)) break
        if ((v < goal) === rising) lo = mid
        else hi = mid
      }
      params[knob.param] = ((lo + hi) / 2) as never
    }
  }

  // Final measurement through the full pipeline, including percentile ranking.
  const cap = synthesizeThrow(params, a, hand)
  const res = processCanonical(cap, { hand, level, heightMm })
  const flat = flattenMetrics(res.sessionMetrics)
  const report: CalibrationResult['report'] = {}
  for (const [key, value] of Object.entries(flat)) {
    report[key] = {
      target: key in targets ? wanted(key) : NaN,
      achieved: value,
      pct: res.percentiles.find(pp => pp.key === key)?.percentile ?? NaN,
    }
  }
  return { params, report }
}
