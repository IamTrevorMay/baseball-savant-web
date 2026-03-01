// League-level pitcher distributions (2015-2025, min 50 pitches per pitcher per pitch type)
// Mean and stddev of pitcher-level averages, used for plus-stat normalization

export const BRINK_LEAGUE: Record<string, { mean: number; stddev: number }> = {
  '4-Seam Fastball': { mean: -1.03, stddev: 0.76 },
  'Slider':          { mean: -2.79, stddev: 1.26 },
  'Sinker':          { mean: -1.06, stddev: 1.02 },
  'Changeup':        { mean: -3.59, stddev: 1.44 },
  'Curveball':       { mean: -3.60, stddev: 1.50 },
  'Cutter':          { mean: -1.47, stddev: 1.04 },
  'Sweeper':         { mean: -2.93, stddev: 1.32 },
  'Split-Finger':    { mean: -4.24, stddev: 1.34 },
  'Knuckle Curve':   { mean: -3.69, stddev: 1.36 },
}

export const CLUSTER_LEAGUE: Record<string, { mean: number; stddev: number }> = {
  '4-Seam Fastball': { mean: 12.14, stddev: 0.78 },
  'Slider':          { mean: 12.59, stddev: 1.15 },
  'Sinker':          { mean: 11.62, stddev: 0.93 },
  'Changeup':        { mean: 12.45, stddev: 1.31 },
  'Curveball':       { mean: 13.94, stddev: 1.45 },
  'Cutter':          { mean: 11.81, stddev: 0.90 },
  'Sweeper':         { mean: 12.91, stddev: 1.09 },
  'Split-Finger':    { mean: 13.03, stddev: 1.50 },
  'Knuckle Curve':   { mean: 13.87, stddev: 1.41 },
}

// Savant-style percentile breakpoints [p10, p25, p50, p75, p90]
export const SAVANT_PERCENTILES: Record<string, { label: string; percentiles: number[]; higherBetter: boolean; unit: string }> = {
  avg_velo:   { label: 'Avg Velocity',  unit: 'mph', percentiles: [88.5, 90.8, 93.2, 95.1, 97.0], higherBetter: true },
  max_velo:   { label: 'Max Velocity',  unit: 'mph', percentiles: [91.2, 93.5, 96.0, 97.8, 99.5], higherBetter: true },
  k_pct:      { label: 'K%',            unit: '%',   percentiles: [16.4, 18.9, 21.9, 25.0, 28.4], higherBetter: true },
  bb_pct:     { label: 'BB%',           unit: '%',   percentiles: [6.2, 7.4, 9.0, 10.8, 12.8],    higherBetter: false },
  whiff_pct:  { label: 'Whiff%',        unit: '%',   percentiles: [18.0, 22.0, 26.0, 31.0, 36.0], higherBetter: true },
  chase_pct:  { label: 'Chase%',        unit: '%',   percentiles: [24.0, 27.0, 30.0, 34.0, 38.0], higherBetter: true },
  barrel_pct: { label: 'Barrel%',       unit: '%',   percentiles: [0.7, 1.1, 1.5, 1.8, 2.3],      higherBetter: false },
  hard_hit:   { label: 'Hard Hit%',     unit: '%',   percentiles: [20.3, 22.2, 24.1, 26.3, 28.7], higherBetter: false },
  avg_ev:     { label: 'Avg EV',        unit: 'mph', percentiles: [81.1, 81.9, 82.6, 83.4, 84.1], higherBetter: false },
  xba:        { label: 'xBA',           unit: '',    percentiles: [0.295, 0.308, 0.319, 0.330, 0.344], higherBetter: false },
  gb_pct:     { label: 'GB%',           unit: '%',   percentiles: [16.5, 19.0, 22.2, 25.6, 29.6], higherBetter: true },
  avg_spin:   { label: 'Spin Rate',     unit: 'rpm', percentiles: [2050, 2180, 2320, 2450, 2600],  higherBetter: true },
  extension:  { label: 'Extension',     unit: 'ft',  percentiles: [5.8, 6.1, 6.3, 6.6, 6.9],      higherBetter: true },
  ivb_ff:     { label: 'IVB (FF)',      unit: 'in',  percentiles: [12.0, 14.0, 16.0, 18.0, 20.5], higherBetter: true },
  vaa_ff:     { label: 'VAA (FF)',      unit: '°',   percentiles: [-6.8, -6.2, -5.5, -4.9, -4.2], higherBetter: true },
}

export function computePercentile(value: number, percentiles: number[], higherBetter: boolean): number {
  const pcts = [10, 25, 50, 75, 90]
  const vals = higherBetter ? percentiles : [...percentiles].reverse()
  const pctsUsed = higherBetter ? pcts : [90, 75, 50, 25, 10]

  if (value <= vals[0]) return pctsUsed[0]
  if (value >= vals[vals.length - 1]) return pctsUsed[pctsUsed.length - 1]

  for (let i = 0; i < vals.length - 1; i++) {
    if (value >= vals[i] && value <= vals[i + 1]) {
      const frac = (value - vals[i]) / (vals[i + 1] - vals[i])
      return pctsUsed[i] + frac * (pctsUsed[i + 1] - pctsUsed[i])
    }
  }
  return 50
}

export function percentileColor(pct: number): string {
  // red (0) → yellow (50) → blue (100)
  if (pct <= 50) {
    const t = pct / 50
    const r = Math.round(220 - t * 100)
    const g = Math.round(50 + t * 170)
    const b = Math.round(50 + t * 20)
    return `rgb(${r},${g},${b})`
  } else {
    const t = (pct - 50) / 50
    const r = Math.round(120 - t * 80)
    const g = Math.round(220 - t * 80)
    const b = Math.round(70 + t * 180)
    return `rgb(${r},${g},${b})`
  }
}

export function computePlus(pitcherAvg: number, leagueMean: number, leagueStddev: number): number {
  return ((pitcherAvg - leagueMean) / leagueStddev) * 10 + 100
}
