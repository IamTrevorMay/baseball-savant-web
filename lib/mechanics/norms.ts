// Metric registry + normative percentiles.
//
// Single source of truth for every report metric: label, unit, direction, velocity
// correlation, markerless-directional flag, and the p10–p90 norm band. Values are
// adult college/pro centers from the ASMI/Driveline clinician consensus (see
// Soto/biomechanics/08-biomechanical-assessment.md §3), the v1 stand-in for the
// OpenBiomechanics dataset. Swap these for in-house percentiles as the capture DB
// grows — the exact pattern league_averages uses.

import type { AthleteLevel, MetricBuckets, MetricKey } from './types'

export interface NormBand { p10: number; p25: number; p50: number; p75: number; p90: number }

export interface MetricDef {
  key: MetricKey
  label: string
  unit: string
  /** display hint; flags fire on |divergence from p50| regardless of direction */
  higherIsBetter: boolean
  /** markerless caveat — rotational-shoulder metrics are directional, not absolute */
  directional: boolean
  /** correlation to velocity/stress — drives flag ranking */
  corr: number
  /** pro-level norm band; scaled per level when scaleByLevel */
  base: NormBand
  /** magnitude metrics that scale down at lower competition levels */
  scaleByLevel?: boolean
}

// Level scaling for magnitude metrics (velocities, stride). Angles hold across levels.
export const LEVEL_SCALE: Record<AthleteLevel, number> = {
  pro: 1, college: 0.97, hs: 0.9, youth: 0.8,
}

export const METRIC_DEFS: MetricDef[] = [
  // arm action
  { key: 'armAction.shoulderAbduction', label: 'Shoulder Abduction @ FC', unit: '°', higherIsBetter: true, directional: false, corr: 0.15,
    base: { p10: 78, p25: 84, p50: 90, p75: 97, p90: 104 } },
  { key: 'armAction.horizontalAbduction', label: 'Scap Load (Horiz Abd)', unit: '°', higherIsBetter: true, directional: true, corr: 0.2,
    base: { p10: 25, p25: 33, p50: 40, p75: 48, p90: 55 } },
  { key: 'armAction.elbowFlexion', label: 'Elbow Flexion @ FC', unit: '°', higherIsBetter: true, directional: false, corr: 0.1,
    base: { p10: 78, p25: 84, p50: 90, p75: 97, p90: 104 } },
  // lower body / trunk
  { key: 'lowerBody.strideLengthPct', label: 'Stride Length', unit: '% ht', higherIsBetter: true, directional: false, corr: 0.4, scaleByLevel: true,
    base: { p10: 76, p25: 81, p50: 85, p75: 89, p90: 93 } },
  { key: 'lowerBody.trunkForwardTilt', label: 'Trunk Forward Tilt @ Rel', unit: '°', higherIsBetter: true, directional: false, corr: 0.25,
    base: { p10: 22, p25: 29, p50: 35, p75: 41, p90: 48 } },
  { key: 'lowerBody.trunkLateralTilt', label: 'Contralateral Trunk Tilt @ Rel', unit: '°', higherIsBetter: false, directional: false, corr: 0.45,
    base: { p10: 8, p25: 14, p50: 20, p75: 27, p90: 34 } },
  { key: 'lowerBody.leadKneeFlexionFC', label: 'Lead Knee Flexion @ FC', unit: '°', higherIsBetter: true, directional: false, corr: 0.1,
    base: { p10: 30, p25: 38, p50: 45, p75: 53, p90: 60 } },
  { key: 'lowerBody.leadKneeFlexionRelease', label: 'Lead Knee Flexion @ Rel', unit: '°', higherIsBetter: false, directional: false, corr: 0.3,
    base: { p10: 18, p25: 24, p50: 30, p75: 37, p90: 45 } },
  { key: 'lowerBody.leadKneeExtVelocity', label: 'Lead Knee Ext Velocity', unit: '°/s', higherIsBetter: true, directional: false, corr: 0.5, scaleByLevel: true,
    base: { p10: 180, p25: 260, p50: 350, p75: 440, p90: 520 } },
  { key: 'lowerBody.pelvisRotation', label: 'Pelvis Rotation @ FC', unit: '°', higherIsBetter: true, directional: false, corr: 0.2,
    base: { p10: 20, p25: 28, p50: 35, p75: 43, p90: 52 } },
  // kinematic velocities
  { key: 'velocities.pelvisAngVel', label: 'Peak Pelvis Rotation Vel', unit: '°/s', higherIsBetter: true, directional: false, corr: 0.5, scaleByLevel: true,
    base: { p10: 520, p25: 600, p50: 690, p75: 780, p90: 860 } },
  { key: 'velocities.trunkAngVel', label: 'Peak Trunk Rotation Vel', unit: '°/s', higherIsBetter: true, directional: false, corr: 0.6, scaleByLevel: true,
    base: { p10: 880, p25: 980, p50: 1080, p75: 1180, p90: 1280 } },
  { key: 'velocities.elbowExtVelocity', label: 'Peak Elbow Ext Vel', unit: '°/s', higherIsBetter: true, directional: false, corr: 0.5, scaleByLevel: true,
    base: { p10: 1900, p25: 2150, p50: 2400, p75: 2550, p90: 2700 } },
  { key: 'velocities.shoulderIrVelocity', label: 'Peak Shoulder IR Vel', unit: '°/s', higherIsBetter: true, directional: true, corr: 0.6, scaleByLevel: true,
    base: { p10: 5500, p25: 6300, p50: 7000, p75: 7400, p90: 7800 } },
  // sequencing
  { key: 'sequencing.pelvisToTrunkGap', label: 'Pelvis→Trunk Timing Gap', unit: 's', higherIsBetter: true, directional: false, corr: 0.35,
    base: { p10: 0.01, p25: 0.025, p50: 0.04, p75: 0.05, p90: 0.065 } },
  // hip-shoulder separation
  { key: 'hipShoulderSep.maxSeparation', label: 'Hip–Shoulder Separation', unit: '°', higherIsBetter: true, directional: false, corr: 0.5,
    base: { p10: 30, p25: 38, p50: 45, p75: 53, p90: 60 } },
  // outcome
  { key: 'outcome.maxExternalRotation', label: 'Max External Rotation (Layback)', unit: '°', higherIsBetter: true, directional: true, corr: 0.4,
    base: { p10: 158, p25: 167, p50: 175, p75: 182, p90: 190 } },
]

export const METRIC_DEF_BY_KEY: Record<string, MetricDef> =
  Object.fromEntries(METRIC_DEFS.map(d => [d.key, d]))

/** Norm band for a metric at a level, applying magnitude scaling. */
export function bandFor(def: MetricDef, level: AthleteLevel): NormBand {
  if (!def.scaleByLevel || level === 'pro') return def.base
  const s = LEVEL_SCALE[level]
  return {
    p10: def.base.p10 * s, p25: def.base.p25 * s, p50: def.base.p50 * s,
    p75: def.base.p75 * s, p90: def.base.p90 * s,
  }
}

/** Rows to seed into assessment_norms for all levels. */
export function buildNormRows(): Array<Record<string, unknown>> {
  const levels: AthleteLevel[] = ['youth', 'hs', 'college', 'pro']
  const rows: Array<Record<string, unknown>> = []
  for (const def of METRIC_DEFS) {
    for (const level of levels) {
      const b = bandFor(def, level)
      rows.push({
        metric: def.key, label: def.label, level, unit: def.unit,
        pctl_10: round(b.p10), pctl_25: round(b.p25), pctl_50: round(b.p50),
        pctl_75: round(b.p75), pctl_90: round(b.p90),
        higher_is_better: def.higherIsBetter, correlation_to_velo: def.corr,
        directional: def.directional, source: 'openbiomechanics',
      })
    }
  }
  return rows
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** Flatten MetricBuckets into dotted key→value pairs the registry understands. */
export function flattenMetrics(b: MetricBuckets): Record<MetricKey, number> {
  const out: Record<string, number> = {}
  for (const def of METRIC_DEFS) {
    const [bucket, leaf] = def.key.split('.')
    const v = (b as any)[bucket]?.[leaf]
    if (typeof v === 'number') out[def.key] = v
  }
  return out
}
