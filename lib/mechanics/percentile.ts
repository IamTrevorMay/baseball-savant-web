// Percentile engine — rank a session's metrics against normative bands.
//
// Piecewise-linear interpolation across p10/p25/p50/p75/p90, flat-extrapolated beyond
// the ends. Works from the embedded METRIC_DEFS (v1 / OpenBiomechanics stand-in) or
// from norm rows fetched out of assessment_norms once in-house data replaces them.

import type { AthleteLevel, MetricBuckets, MetricPercentile } from './types'
import { METRIC_DEFS, METRIC_DEF_BY_KEY, bandFor, flattenMetrics, type NormBand } from './norms'

/** Interpolate a raw value's percentile (0–100) within a norm band. */
export function percentileOf(value: number, band: NormBand): number {
  const pts: Array<[number, number]> = [
    [band.p10, 10], [band.p25, 25], [band.p50, 50], [band.p75, 75], [band.p90, 90],
  ]
  if (value <= pts[0][0]) return Math.max(1, 10 - (pts[0][0] - value) / Math.max(1e-6, pts[0][0]) * 10)
  if (value >= pts[pts.length - 1][0]) return Math.min(99, 90 + (value - pts[4][0]) / Math.max(1e-6, pts[4][0]) * 10)
  for (let i = 0; i < pts.length - 1; i++) {
    const [v0, p0] = pts[i], [v1, p1] = pts[i + 1]
    if (value >= v0 && value <= v1) {
      const t = v1 === v0 ? 0 : (value - v0) / (v1 - v0)
      return p0 + t * (p1 - p0)
    }
  }
  return 50
}

/**
 * Rank every session metric against the norms for the athlete's level.
 * Uses embedded METRIC_DEFS; pass `overrideBands` (from assessment_norms) to use DB norms.
 */
export function rankSession(
  buckets: MetricBuckets,
  level: AthleteLevel,
  overrideBands?: Record<string, NormBand>,
): MetricPercentile[] {
  const flat = flattenMetrics(buckets)
  const out: MetricPercentile[] = []
  for (const def of METRIC_DEFS) {
    const value = flat[def.key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const band = overrideBands?.[def.key] ?? bandFor(def, level)
    out.push({
      key: def.key,
      value,
      percentile: Math.round(percentileOf(value, band)),
      norm50: band.p50,
      higherIsBetter: def.higherIsBetter,
      directional: def.directional,
    })
  }
  return out
}

/** Convenience: metric label lookup for renderers. */
export function labelOf(key: string): string {
  return METRIC_DEF_BY_KEY[key]?.label ?? key
}
