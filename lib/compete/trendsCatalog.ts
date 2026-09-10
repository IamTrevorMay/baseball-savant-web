/**
 * Compete Trends — metric catalog for the athlete-history correlation tool.
 *
 * Every series an athlete can chart, grouped by source. Keys are namespaced
 * by source (`whoop.`, `bio.`, `tm.`, `vis.`, `pro.`) so the API knows which
 * store to query. Units drive the two-axis assignment on the chart, exactly
 * like the Research Trends Visualizer.
 *
 * Vision (`vis.`) is plumbed but pending: trackman_pitches has no athlete
 * linkage until the alias/stamping work lands, so those series return empty
 * with `pending` explaining why. Pro (`pro.`) requires the athlete's
 * profile to be linked to an MLBAM player_id.
 */
import { METRIC_DEFS } from '@/lib/mechanics/norms'

export type TrendBucket = 'day' | 'week' | 'month' | 'year'
export const TREND_BUCKETS: { value: TrendBucket; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
]

export interface CompeteTrendMetric {
  key: string
  label: string
  unit: string
  group: string
  /** series exists in schema but ingestion doesn't populate it yet */
  pending?: string
}

// Four sidebar menus (Trevor, 2026-09-11): all Whoop under one "Wearable"
// menu; TrackMan + Vision combined as "Pitch Level".
const W = 'Wearable'
const WS = 'Wearable'
const WW = 'Wearable'
const B = 'Biomechanics'
const T = 'Pitch Level'
const V = 'Pitch Level'
const P = 'Pro Ball Data'

export const COMPETE_TREND_METRICS: CompeteTrendMetric[] = [
  // Whoop cycles
  { key: 'whoop.recovery', label: 'Recovery Score', unit: '%', group: W },
  { key: 'whoop.hrv', label: 'HRV (RMSSD)', unit: 'ms', group: W },
  { key: 'whoop.rhr', label: 'Resting HR', unit: 'bpm', group: W },
  { key: 'whoop.strain', label: 'Day Strain', unit: 'strain', group: W },
  { key: 'whoop.spo2', label: 'SpO₂', unit: '%', group: W },
  { key: 'whoop.skin_temp', label: 'Skin Temp', unit: '°C', group: W },
  // Whoop sleep
  { key: 'whoop.sleep_score', label: 'Sleep Score', unit: '%', group: WS },
  { key: 'whoop.sleep_hours', label: 'Sleep Duration', unit: 'hrs', group: WS },
  { key: 'whoop.rem_hours', label: 'REM Sleep', unit: 'hrs', group: WS },
  { key: 'whoop.sws_hours', label: 'Deep Sleep (SWS)', unit: 'hrs', group: WS },
  { key: 'whoop.sleep_eff', label: 'Sleep Efficiency', unit: '%', group: WS },
  { key: 'whoop.resp_rate', label: 'Respiratory Rate', unit: 'rpm', group: WS },
  { key: 'whoop.sleep_consistency', label: 'Sleep Consistency', unit: '%', group: WS },
  // Whoop workouts
  { key: 'whoop.workout_strain', label: 'Workout Strain', unit: 'strain', group: WW },
  { key: 'whoop.workout_max_hr', label: 'Workout Max HR', unit: 'bpm', group: WW },
  // Biomechanics (per capture — sparse point series)
  { key: 'bio.movement_grade', label: 'Movement Grade', unit: 'grade', group: B },
  { key: 'bio.rel_speed', label: 'Mocap Velo', unit: 'mph', group: B },
  ...METRIC_DEFS.map(d => ({
    key: `bio.m.${d.key}`, label: d.label, unit: d.unit, group: B,
  })),
  // TrackMan CSV sessions (compete_pitches)
  { key: 'tm.rel_speed', label: 'Velo (TM)', unit: 'mph', group: T },
  { key: 'tm.spin_rate', label: 'Spin (TM)', unit: 'rpm', group: T },
  { key: 'tm.ivb', label: 'IVB (TM)', unit: 'in', group: T },
  { key: 'tm.hb', label: 'H-Break (TM)', unit: 'in', group: T },
  { key: 'tm.extension', label: 'Extension (TM)', unit: 'ft', group: T },
  // Vision (pending athlete identity link)
  { key: 'vis.rel_speed', label: 'Velo (Vision)', unit: 'mph', group: V, pending: 'Vision pitches aren’t linked to athletes yet' },
  { key: 'vis.spin_rate', label: 'Spin (Vision)', unit: 'rpm', group: V, pending: 'Vision pitches aren’t linked to athletes yet' },
  { key: 'vis.ivb', label: 'IVB (Vision)', unit: 'in', group: V, pending: 'Vision pitches aren’t linked to athletes yet' },
  { key: 'vis.hb', label: 'H-Break (Vision)', unit: 'in', group: V, pending: 'Vision pitches aren’t linked to athletes yet' },
  // Pro (Savant, requires linked player_id)
  { key: 'pro.velo', label: 'Velo (MLB)', unit: 'mph', group: P },
  { key: 'pro.spin', label: 'Spin (MLB)', unit: 'rpm', group: P },
  { key: 'pro.ivb', label: 'IVB (MLB)', unit: 'in', group: P },
  { key: 'pro.hb', label: 'H-Break (MLB)', unit: 'in', group: P },
  { key: 'pro.ext', label: 'Extension (MLB)', unit: 'ft', group: P },
  { key: 'pro.whiff', label: 'Whiff % (MLB)', unit: '%', group: P },
]

export const TREND_METRIC_BY_KEY = new Map(COMPETE_TREND_METRICS.map(m => [m.key, m]))
export const TREND_GROUPS = ['Wearable', 'Biomechanics', 'Pitch Level', 'Pro Ball Data']
export const MAX_COMPETE_TREND_METRICS = 6

export interface TrendPoint { x: string; value: number; n: number }
export type TrendSeries = Record<string, TrendPoint[]>
