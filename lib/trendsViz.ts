/**
 * Trends Visualizer — shared metric catalog and request/response types.
 *
 * The SQL for each metric lives in /api/trends-viz (resolved from
 * lib/reportMetrics METRICS plus two route-local expressions); this file is
 * only the client-safe half: which keys exist, how to label them, and which
 * unit each plots in (units drive the secondary-axis assignment in metric
 * mode).
 */

export type TrendsXUnit = 'month' | 'appearance'
export type TrendsMode = 'pitch' | 'metric'
export type TrendsScope = 'career' | 'seasons' | 'custom'

export interface TrendsRequest {
  playerId: number
  scope: TrendsScope
  seasons?: number[]
  startDate?: string
  endDate?: string
  xUnit: TrendsXUnit
  mode: TrendsMode
  /** pitch mode: exactly one key; metric mode: 1–MAX_TREND_METRICS keys */
  metrics: string[]
}

export interface TrendsRow {
  /** 'YYYY-MM' (month) or 'YYYY-MM-DD' (appearance) */
  x: string
  game_pk?: number
  pitch_name?: string
  /** pitches in the bucket — sample size for the hover */
  n: number
  [metric: string]: string | number | null | undefined
}

export interface TrendMetricDef {
  label: string
  /** axis label; metrics sharing a unit share a Y axis in metric mode */
  unit: string
  group: string
  /** usage % is only meaningful split by pitch type */
  pitchModeOnly?: boolean
}

export const TREND_METRICS: Record<string, TrendMetricDef> = {
  // Usage
  usage_pct: { label: 'Usage %', unit: '%', group: 'Usage', pitchModeOnly: true },
  // Pitch traits
  avg_velo: { label: 'Velocity', unit: 'mph', group: 'Pitch Traits' },
  max_velo: { label: 'Max Velo', unit: 'mph', group: 'Pitch Traits' },
  avg_spin: { label: 'Spin Rate', unit: 'rpm', group: 'Pitch Traits' },
  avg_ext: { label: 'Extension', unit: 'ft', group: 'Pitch Traits' },
  avg_hbreak_in: { label: 'Horizontal Break', unit: 'in', group: 'Pitch Traits' },
  avg_ivb_in: { label: 'Induced Vertical Break', unit: 'in', group: 'Pitch Traits' },
  avg_arm_angle: { label: 'Arm Angle', unit: 'deg', group: 'Pitch Traits' },
  avg_stuff_plus: { label: 'Stuff+', unit: 'plus', group: 'Pitch Traits' },
  // Plate discipline / results
  whiff_pct: { label: 'Whiff %', unit: '%', group: 'Results' },
  csw_pct: { label: 'CSW %', unit: '%', group: 'Results' },
  swstr_pct: { label: 'SwStr %', unit: '%', group: 'Results' },
  chase_pct: { label: 'Chase %', unit: '%', group: 'Results' },
  zone_pct: { label: 'Zone %', unit: '%', group: 'Results' },
  fps_pct: { label: 'FPS %', unit: '%', group: 'Results' },
  k_pct: { label: 'K %', unit: '%', group: 'Results' },
  bb_pct: { label: 'BB %', unit: '%', group: 'Results' },
  // Contact quality
  avg_ev: { label: 'Avg EV', unit: 'mph', group: 'Contact Quality' },
  hard_hit_pct: { label: 'Hard Hit %', unit: '%', group: 'Contact Quality' },
  barrel_pct: { label: 'Barrel %', unit: '%', group: 'Contact Quality' },
  gb_pct: { label: 'GB %', unit: '%', group: 'Contact Quality' },
  avg_la: { label: 'Launch Angle', unit: 'deg', group: 'Contact Quality' },
  avg_xwoba: { label: 'xwOBA', unit: 'wOBA', group: 'Contact Quality' },
}

export const TREND_METRIC_GROUPS = ['Usage', 'Pitch Traits', 'Results', 'Contact Quality']

export const MAX_TREND_METRICS = 6

/** Pitch types with fewer total pitches than this across the selected range are dropped as noise. */
export const MIN_PITCHES_PER_LINE = 10
