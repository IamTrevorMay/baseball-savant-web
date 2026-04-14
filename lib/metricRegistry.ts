// Centralized metric registry — single source of truth for column definitions,
// formatting, coloring, and totals aggregation.

export type TotalsStrategy = 'sum' | 'avg' | 'max' | 'ip' | 'totalRE' | 'none'

export type FormatSpec =
  | { type: 'int' }
  | { type: 'dec'; digits: 1 | 2 | 3 }
  | { type: 'pct'; digits: 1 }
  | { type: 'ip' }

export type ColorSpec =
  | { mode: 'static'; class: string }
  | { mode: 'plus'; above: string; below: string; neutral?: string; high?: number; low?: number }
  | { mode: 'inverted_value'; good: 'negative' | 'positive'; goodClass: string; badClass: string }

export interface MetricDef {
  key: string
  label: string
  unit: '' | '%' | 'mph' | 'rpm' | 'in' | 'ft' | 'deg' | 'z' | 'runs'
  format: FormatSpec
  color: ColorSpec
  totals: TotalsStrategy
  higherBetter?: boolean
  tip?: string
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const METRIC_REGISTRY: Record<string, MetricDef> = {
  // ── Identifiers ──────────────────────────────────────────────────────
  year: {
    key: 'year', label: 'Year', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-white font-medium' },
    totals: 'none',
    tip: 'Season year',
  },
  name: {
    key: 'name', label: 'Pitch', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-white font-medium' },
    totals: 'none',
  },

  // ── Counting stats ───────────────────────────────────────────────────
  w: {
    key: 'w', label: 'W', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'sum',
    tip: 'Wins',
  },
  l: {
    key: 'l', label: 'L', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'sum',
    tip: 'Losses',
  },
  games: {
    key: 'games', label: 'G', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-400' },
    totals: 'sum',
    tip: 'Games played',
  },
  gs: {
    key: 'gs', label: 'GS', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-400' },
    totals: 'sum',
    tip: 'Games started',
  },
  sv: {
    key: 'sv', label: 'SV', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'sum',
    tip: 'Saves',
  },
  ip: {
    key: 'ip', label: 'IP', unit: '',
    format: { type: 'ip' },
    color: { mode: 'static', class: 'text-zinc-400' },
    totals: 'ip',
    tip: 'Innings pitched',
  },
  pa: {
    key: 'pa', label: 'PA', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-400' },
    totals: 'sum',
    tip: 'Plate appearances',
  },
  pitches: {
    key: 'pitches', label: 'Pitches', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-400' },
    totals: 'sum',
    tip: 'Total number of pitches',
  },
  count: {
    key: 'count', label: '#', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-400' },
    totals: 'sum',
    tip: 'Number of pitches',
  },
  h: {
    key: 'h', label: 'H', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'sum',
    tip: 'Hits',
  },
  '2b': {
    key: '2b', label: '2B', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'sum',
    tip: 'Doubles',
  },
  '3b': {
    key: '3b', label: '3B', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'sum',
    tip: 'Triples',
  },
  hr: {
    key: 'hr', label: 'HR', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'sum',
    tip: 'Home runs',
  },
  bb: {
    key: 'bb', label: 'BB', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'sum',
    tip: 'Walks (bases on balls)',
  },
  k: {
    key: 'k', label: 'K', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'sum',
    tip: 'Strikeouts',
  },
  hbp: {
    key: 'hbp', label: 'HBP', unit: '',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'sum',
    tip: 'Hit by pitch',
  },

  // ── Batting-against rates ────────────────────────────────────────────
  ba: {
    key: 'ba', label: 'BA', unit: '',
    format: { type: 'dec', digits: 3 },
    color: { mode: 'static', class: 'text-rose-400' },
    totals: 'avg',
    tip: 'Batting average (hits / at-bats)',
  },
  obp: {
    key: 'obp', label: 'OBP', unit: '',
    format: { type: 'dec', digits: 3 },
    color: { mode: 'static', class: 'text-rose-400' },
    totals: 'avg',
    tip: 'On-base percentage',
  },
  slg: {
    key: 'slg', label: 'SLG', unit: '',
    format: { type: 'dec', digits: 3 },
    color: { mode: 'static', class: 'text-rose-400' },
    totals: 'avg',
    tip: 'Slugging percentage',
  },
  ops: {
    key: 'ops', label: 'OPS', unit: '',
    format: { type: 'dec', digits: 3 },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'avg',
    tip: 'On-base plus slugging',
  },
  whip: {
    key: 'whip', label: 'WHIP', unit: '',
    format: { type: 'dec', digits: 2 },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'avg',
    higherBetter: false,
    tip: 'Walks + hits per inning pitched',
  },
  era: {
    key: 'era', label: 'ERA', unit: '',
    format: { type: 'dec', digits: 2 },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'avg',
    higherBetter: false,
    tip: 'Earned run average',
  },

  // ── Pitching rates ───────────────────────────────────────────────────
  kPct: {
    key: 'kPct', label: 'K%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-emerald-400' },
    totals: 'avg',
    higherBetter: true,
    tip: 'Strikeout rate per plate appearance',
  },
  bbPct: {
    key: 'bbPct', label: 'BB%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-red-400' },
    totals: 'avg',
    higherBetter: false,
    tip: 'Walk rate per plate appearance',
  },
  kbbPct: {
    key: 'kbbPct', label: 'K-BB%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-emerald-400' },
    totals: 'avg',
    higherBetter: true,
    tip: 'Strikeout rate minus walk rate',
  },
  whiffPct: {
    key: 'whiffPct', label: 'Whiff%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-emerald-400' },
    totals: 'avg',
    higherBetter: true,
    tip: 'Swinging strikes divided by total swings',
  },
  swStrPct: {
    key: 'swStrPct', label: 'SwStr%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-emerald-400' },
    totals: 'avg',
    higherBetter: true,
    tip: 'Swinging strike rate per pitch',
  },
  csPct: {
    key: 'csPct', label: 'CSt%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-emerald-400' },
    totals: 'avg',
    higherBetter: true,
    tip: 'Called strike rate per pitch',
  },
  fpsPct: {
    key: 'fpsPct', label: 'FPS%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-emerald-400' },
    totals: 'avg',
    higherBetter: true,
    tip: 'First pitch strike percentage',
  },
  zonePct: {
    key: 'zonePct', label: 'Zone%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-sky-400' },
    totals: 'avg',
    tip: 'Percentage of pitches in the strike zone',
  },
  usagePct: {
    key: 'usagePct', label: 'Usage%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'avg',
    tip: 'Percentage of total pitches thrown',
  },

  // ── Batted ball ──────────────────────────────────────────────────────
  avgEV: {
    key: 'avgEV', label: 'Avg EV', unit: 'mph',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-orange-400' },
    totals: 'avg',
    tip: 'Average exit velocity on batted balls (mph)',
  },
  maxEV: {
    key: 'maxEV', label: 'Max EV', unit: 'mph',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-orange-400' },
    totals: 'max',
    tip: 'Maximum exit velocity (mph)',
  },
  avgLA: {
    key: 'avgLA', label: 'Avg LA', unit: 'deg',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-orange-400' },
    totals: 'avg',
    tip: 'Average launch angle on batted balls',
  },
  gbPct: {
    key: 'gbPct', label: 'GB%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-orange-400' },
    totals: 'avg',
    tip: 'Ground ball rate of batted balls',
  },
  fbPct: {
    key: 'fbPct', label: 'FB%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-orange-400' },
    totals: 'avg',
    tip: 'Fly ball rate of batted balls',
  },
  ldPct: {
    key: 'ldPct', label: 'LD%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-orange-400' },
    totals: 'avg',
    tip: 'Line drive rate of batted balls',
  },
  puPct: {
    key: 'puPct', label: 'PU%', unit: '%',
    format: { type: 'pct', digits: 1 },
    color: { mode: 'static', class: 'text-orange-400' },
    totals: 'avg',
    tip: 'Popup rate of batted balls',
  },

  // ── Expected stats ───────────────────────────────────────────────────
  xBA: {
    key: 'xBA', label: 'xBA', unit: '',
    format: { type: 'dec', digits: 3 },
    color: { mode: 'static', class: 'text-rose-400' },
    totals: 'avg',
    tip: 'Expected batting avg from exit velo + launch angle',
  },
  xwOBA: {
    key: 'xwOBA', label: 'xwOBA', unit: '',
    format: { type: 'dec', digits: 3 },
    color: { mode: 'static', class: 'text-rose-400' },
    totals: 'avg',
    tip: 'Expected wOBA from exit velo + launch angle',
  },
  xSLG: {
    key: 'xSLG', label: 'xSLG', unit: '',
    format: { type: 'dec', digits: 3 },
    color: { mode: 'static', class: 'text-rose-400' },
    totals: 'avg',
    tip: 'Expected slugging from exit velo + launch angle',
  },
  wOBA: {
    key: 'wOBA', label: 'wOBA', unit: '',
    format: { type: 'dec', digits: 3 },
    color: { mode: 'static', class: 'text-rose-400' },
    totals: 'avg',
    tip: 'Weighted on-base average',
  },

  // ── Models ───────────────────────────────────────────────────────────
  fip: {
    key: 'fip', label: 'FIP', unit: '',
    format: { type: 'dec', digits: 2 },
    color: { mode: 'static', class: 'text-cyan-400' },
    totals: 'avg',
    higherBetter: false,
    tip: 'Fielding independent pitching',
  },
  xfip: {
    key: 'xfip', label: 'xFIP', unit: '',
    format: { type: 'dec', digits: 2 },
    color: { mode: 'static', class: 'text-cyan-400' },
    totals: 'avg',
    higherBetter: false,
    tip: 'Expected FIP (normalizes HR/FB rate)',
  },
  xera: {
    key: 'xera', label: 'xERA', unit: '',
    format: { type: 'dec', digits: 2 },
    color: { mode: 'static', class: 'text-cyan-400' },
    totals: 'avg',
    higherBetter: false,
    tip: 'Expected ERA from xwOBA',
  },
  siera: {
    key: 'siera', label: 'SIERA', unit: '',
    format: { type: 'dec', digits: 2 },
    color: { mode: 'static', class: 'text-cyan-400' },
    totals: 'avg',
    higherBetter: false,
    tip: 'Skill-interactive ERA',
  },

  // ── Per-9 ────────────────────────────────────────────────────────────
  k9: {
    key: 'k9', label: 'K/9', unit: '',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'avg',
    higherBetter: true,
    tip: 'Strikeouts per 9 innings',
  },
  bb9: {
    key: 'bb9', label: 'BB/9', unit: '',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'avg',
    higherBetter: false,
    tip: 'Walks per 9 innings',
  },
  hr9: {
    key: 'hr9', label: 'HR/9', unit: '',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-zinc-300' },
    totals: 'avg',
    higherBetter: false,
    tip: 'Home runs per 9 innings',
  },

  // ── Run value ────────────────────────────────────────────────────────
  totalRE: {
    key: 'totalRE', label: 'RE24', unit: 'runs',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'inverted_value', good: 'negative', goodClass: 'text-emerald-400', badClass: 'text-red-400' },
    totals: 'totalRE',
    tip: 'Run expectancy change across 24 base-out states',
  },

  // ── Command / plus stats ─────────────────────────────────────────────
  commandPlus: {
    key: 'commandPlus', label: 'Cmd+', unit: '',
    format: { type: 'int' },
    color: { mode: 'plus', above: 'text-teal-400', below: 'text-orange-400' },
    totals: 'avg',
    tip: 'Command+ composite: Brink+, Cluster+, Missfire+',
  },
  rpcomPlus: {
    key: 'rpcomPlus', label: 'RPCom+', unit: '',
    format: { type: 'int' },
    color: { mode: 'plus', above: 'text-teal-400', below: 'text-orange-400' },
    totals: 'avg',
    tip: 'Run Prevention Command+: all 5 metrics weighted by xwOBA correlation',
  },
  sos: {
    key: 'sos', label: 'SOS', unit: '',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'plus', above: 'text-emerald-400', below: 'text-orange-400', high: 105, low: 95 },
    totals: 'avg',
    tip: 'Strength of schedule rating (100 = average)',
  },

  // ── Arsenal ──────────────────────────────────────────────────────────
  avgVelo: {
    key: 'avgVelo', label: 'Avg Velo', unit: 'mph',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-amber-400' },
    totals: 'avg',
    tip: 'Average pitch velocity at release (mph)',
  },
  maxVelo: {
    key: 'maxVelo', label: 'Max Velo', unit: 'mph',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-amber-400' },
    totals: 'max',
    tip: 'Maximum pitch velocity (mph)',
  },
  avgSpin: {
    key: 'avgSpin', label: 'Avg Spin', unit: 'rpm',
    format: { type: 'int' },
    color: { mode: 'static', class: 'text-sky-400' },
    totals: 'avg',
    tip: 'Average spin rate after release (rpm)',
  },
  hBreak: {
    key: 'hBreak', label: 'HB', unit: 'in',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-purple-400' },
    totals: 'avg',
    tip: 'Horizontal break from catcher view (in)',
  },
  vBreak: {
    key: 'vBreak', label: 'IVB', unit: 'in',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-purple-400' },
    totals: 'avg',
    tip: 'Induced vertical break, gravity removed (in)',
  },
  ext: {
    key: 'ext', label: 'Ext', unit: 'ft',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-purple-400' },
    totals: 'avg',
    tip: 'Release extension from rubber (ft)',
  },
  armAngle: {
    key: 'armAngle', label: 'Arm\u00B0', unit: 'deg',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-purple-400' },
    totals: 'avg',
    tip: 'Pitcher arm angle at release',
  },
  brink: {
    key: 'brink', label: 'Brink', unit: 'in',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-teal-400' },
    totals: 'avg',
    tip: 'Avg distance to nearest zone edge (in). Higher = more edge pitching',
  },
  cluster: {
    key: 'cluster', label: 'Cluster', unit: 'in',
    format: { type: 'dec', digits: 1 },
    color: { mode: 'static', class: 'text-teal-400' },
    totals: 'avg',
    tip: 'Avg distance from pitch-type centroid (in). Lower = tighter grouping',
  },
  brinkPlus: {
    key: 'brinkPlus', label: 'Brink+', unit: '',
    format: { type: 'int' },
    color: { mode: 'plus', above: 'text-teal-400', below: 'text-orange-400' },
    totals: 'avg',
    tip: 'Brink plus stat (100 = league avg)',
  },
  clusterPlus: {
    key: 'clusterPlus', label: 'Cluster+', unit: '',
    format: { type: 'int' },
    color: { mode: 'plus', above: 'text-teal-400', below: 'text-orange-400' },
    totals: 'avg',
    tip: 'Cluster plus stat (100 = league avg)',
  },
  stuffPlus: {
    key: 'stuffPlus', label: 'Stuff+', unit: '',
    format: { type: 'int' },
    color: { mode: 'plus', above: 'text-teal-400', below: 'text-orange-400' },
    totals: 'avg',
    tip: 'Stuff+ model rating (100 = league avg)',
  },
}

// ---------------------------------------------------------------------------
// Group column orderings — arrays of keys (or {k,l} overrides for short labels)
// ---------------------------------------------------------------------------

type ColEntry = string | { k: string; l: string }

const GROUP_COLUMNS: Record<string, ColEntry[]> = {
  'pitcher:traditional': [
    'year', 'w', 'l', 'era', 'games', 'gs', 'sv', 'ip', 'pa',
    'h', '2b', '3b', 'hr', 'bb', 'k', 'hbp',
    'ba', 'obp', 'slg', 'ops', 'whip',
    'kPct', 'bbPct', 'whiffPct', 'pitches',
  ],
  'pitcher:advanced': [
    'year', 'pitches', 'ip',
    'kPct', 'bbPct', 'kbbPct', 'whiffPct', 'swStrPct', 'csPct', 'fpsPct', 'zonePct',
    'avgEV', 'maxEV', 'avgLA',
    'gbPct', 'fbPct', 'ldPct',
    'xBA', 'xwOBA', 'xSLG', 'wOBA',
    'fip', 'xfip', 'xera', 'siera',
    'k9', 'bb9', 'hr9',
    'totalRE', 'commandPlus', 'rpcomPlus', 'sos',
  ],
  'pitcher:arsenal': [
    'name', 'count', 'usagePct',
    { k: 'avgVelo', l: 'Velo' }, { k: 'maxVelo', l: 'Max' },
    { k: 'avgSpin', l: 'Spin' }, 'hBreak', 'vBreak', 'ext', 'armAngle',
    'whiffPct', 'csPct',
    { k: 'avgEV', l: 'EV' }, 'xBA',
    'brink', 'cluster', 'brinkPlus', 'clusterPlus', 'stuffPlus',
  ],
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Resolve a group key to ordered {k, l} column descriptors. */
export function getColumns(group: string): { k: string; l: string }[] {
  const cols = GROUP_COLUMNS[group]
  if (!cols) return []
  return cols.map(c => {
    if (typeof c === 'object') return c
    const def = METRIC_REGISTRY[c]
    return { k: c, l: def?.label ?? c }
  })
}

/** Format a pre-computed value for display (adds % suffix for pct metrics, handles dashes). */
export function formatMetric(key: string, value: any): string {
  if (value == null || value === '' || value === '\u2014') return '\u2014'
  const str = String(value)
  if (str === '\u2014') return '\u2014'
  const def = METRIC_REGISTRY[key]
  if (def?.format.type === 'pct') return str + '%'
  return str
}

/** Get cell color class for a metric value. */
export function getCellColor(key: string, value: any): string {
  const def = METRIC_REGISTRY[key]
  if (!def) return 'text-zinc-300'
  const color = def.color
  switch (color.mode) {
    case 'static':
      return color.class
    case 'plus': {
      const n = Number(value)
      if (isNaN(n)) return 'text-zinc-400'
      const high = color.high ?? 100
      const low = color.low ?? 100
      if (n > high) return color.above
      if (n < low) return color.below
      return color.neutral ?? 'text-zinc-300'
    }
    case 'inverted_value': {
      const n = Number(value)
      if (color.good === 'negative') return n < 0 ? color.goodClass : color.badClass
      return n > 0 ? color.goodClass : color.badClass
    }
  }
}

/** Compute a totals row from data rows using registry-defined aggregation strategies. */
export function calcTotalsFromRegistry(rows: any[], keys: string[]): any {
  if (rows.length === 0) return null
  const totals: any = {}

  keys.forEach(key => {
    const def = METRIC_REGISTRY[key]
    if (!def || def.totals === 'none') {
      totals[key] = 'Career'
      return
    }

    const vals = rows.map(r => parseFloat(r[key])).filter(v => !isNaN(v))
    if (vals.length === 0) { totals[key] = '\u2014'; return }

    const sum = vals.reduce((a, b) => a + b, 0)

    switch (def.totals) {
      case 'sum':
        totals[key] = sum
        break
      case 'avg': {
        const avg = sum / vals.length
        const precision = def.format.type === 'dec' ? def.format.digits
          : def.format.type === 'pct' ? def.format.digits
          : 1 // int + avg → 1 decimal (matches plus stats, avgSpin, etc.)
        totals[key] = avg.toFixed(precision)
        break
      }
      case 'max':
        totals[key] = Math.max(...vals).toFixed(
          def.format.type === 'dec' ? def.format.digits : 1
        )
        break
      case 'ip': {
        const outs = rows.reduce((s, r) => {
          const parts = String(r[key]).split('.')
          return s + parseInt(parts[0]) * 3 + parseInt(parts[1] || '0')
        }, 0)
        totals[key] = Math.floor(outs / 3) + '.' + (outs % 3)
        break
      }
      case 'totalRE':
        totals[key] = sum.toFixed(1)
        break
    }
  })

  return totals
}

/** Check if a metric key should display a % suffix. */
export function needsPercentSuffix(key: string): boolean {
  return METRIC_REGISTRY[key]?.format.type === 'pct'
}

/** Look up a registry tip by display label (used as glossary.ts fallback). */
export function getRegistryTipByLabel(label: string): string {
  const entry = Object.values(METRIC_REGISTRY).find(d => d.label === label)
  return entry?.tip || ''
}
