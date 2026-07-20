// Report payload — the self-contained object stored on compete_reports.metadata and
// rendered by both the admin preview and the athlete-facing Compete view. Pure/shared
// (no server deps) so client and server build/read it identically.

import { METRIC_DEF_BY_KEY } from './norms'
import type {
  AthleteLevel, Flag, MetricBuckets, MetricPercentile,
} from './types'

export interface BiomechReportPayload {
  kind: 'biomech'
  captureId: string
  captureDate: string | null
  level: AthleteLevel
  veloContext: string | null
  system: string
  athleteName: string | null
  /** 0–100 weighted movement grade (higher = closer to/above norm where it helps). */
  movementGrade: number
  sessionMetrics: MetricBuckets
  percentiles: MetricPercentile[]
  flags: Flag[]
  qc: { unmappedJoints: string[]; throwsDetected: number; throwsUsed: number }
}

export interface ReportMeta {
  captureId: string
  captureDate: string | null
  level: AthleteLevel
  veloContext: string | null
  system: string
  athleteName: string | null
}

/**
 * Overall movement grade: velocity-correlation-weighted mean of percentiles, with
 * "lower is better" metrics inverted so a high grade always means better mechanics.
 */
export function movementGrade(percentiles: MetricPercentile[]): number {
  let wSum = 0, acc = 0
  for (const p of percentiles) {
    const def = METRIC_DEF_BY_KEY[p.key]
    const w = (def?.corr ?? 0.1) + 0.05
    const contribution = p.higherIsBetter ? p.percentile : 100 - p.percentile
    acc += contribution * w
    wSum += w
  }
  return wSum ? Math.round(acc / wSum) : 50
}

export function buildReportPayload(
  input: {
    sessionMetrics: MetricBuckets
    percentiles: MetricPercentile[]
    flags: Flag[]
    qc: { unmappedJoints: string[]; throwsDetected: number; throwsUsed: number }
  },
  meta: ReportMeta,
): BiomechReportPayload {
  return {
    kind: 'biomech',
    captureId: meta.captureId,
    captureDate: meta.captureDate,
    level: meta.level,
    veloContext: meta.veloContext,
    system: meta.system,
    athleteName: meta.athleteName,
    movementGrade: movementGrade(input.percentiles),
    sessionMetrics: input.sessionMetrics,
    percentiles: input.percentiles,
    flags: input.flags,
    qc: input.qc,
  }
}

/** The six report buckets, in Driveline report order, with their member metric keys. */
export const REPORT_BUCKETS: Array<{ key: string; title: string; metrics: string[] }> = [
  { key: 'armAction', title: 'Arm Action', metrics: [
    'armAction.shoulderAbduction', 'armAction.horizontalAbduction', 'armAction.elbowFlexion',
  ] },
  { key: 'lowerBody', title: 'Lower Body / Trunk', metrics: [
    'lowerBody.strideLengthPct', 'lowerBody.pelvisRotation', 'lowerBody.leadKneeFlexionFC',
    'lowerBody.leadKneeFlexionRelease', 'lowerBody.leadKneeExtVelocity',
    'lowerBody.trunkForwardTilt', 'lowerBody.trunkLateralTilt',
  ] },
  { key: 'velocities', title: 'Kinematic Velocities', metrics: [
    'velocities.pelvisAngVel', 'velocities.trunkAngVel',
    'velocities.elbowExtVelocity', 'velocities.shoulderIrVelocity',
  ] },
  { key: 'sequencing', title: 'Kinematic Sequencing', metrics: ['sequencing.pelvisToTrunkGap'] },
  { key: 'hipShoulderSep', title: 'Hip–Shoulder Separation', metrics: ['hipShoulderSep.maxSeparation'] },
  { key: 'outcome', title: 'Outcome & Layback', metrics: ['outcome.maxExternalRotation'] },
]
