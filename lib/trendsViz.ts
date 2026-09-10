/**
 * Trends Visualizer — shared metric catalog and request/response types.
 *
 * The SQL for each metric lives in /api/trends-viz (resolved from
 * lib/reportMetrics METRICS plus route-local expressions); this file is only
 * the client-safe half: which keys exist, how to label them, and which unit
 * each plots in (units drive the secondary-axis assignment in metric mode).
 *
 * Entities: 'pitcher' (live SQL over pitches, any scope) and 'team'
 * (pitching perspective; month buckets served from mv_team_monthly_* MVs,
 * game buckets live SQL bounded to ≤2 seasons / ≤740 days).
 *
 * No 'era' key here on purpose: real monthly team ERA isn't obtainable —
 * Statcast has no earned runs, and the MLB API's team/league byMonth
 * endpoints are dead (person-level byMonth works but loses team attribution
 * after trades, so aggregating it would misattribute months). Rather than
 * plot FIP under ERA's name, trends offer FIP/xERA labeled as themselves;
 * real season-level ERA lives in scene-stats teamStats and the Teams page
 * via lib/teamEra.ts.
 */

export type TrendsEntity = 'pitcher' | 'team'
export type TrendsXUnit = 'month' | 'appearance'
export type TrendsMode = 'pitch' | 'metric'
export type TrendsScope = 'career' | 'seasons' | 'custom'

export interface TrendsRequest {
  entityType?: TrendsEntity // default 'pitcher'
  playerId?: number         // entityType=pitcher
  team?: string             // entityType=team — abbrev from MLB_TEAMS
  scope: TrendsScope
  seasons?: number[]
  startDate?: string
  endDate?: string
  xUnit: TrendsXUnit        // 'appearance' = per game for teams
  mode: TrendsMode
  /** pitch mode: exactly one key; metric mode: 1–MAX_TREND_METRICS keys */
  metrics: string[]
}

export interface TrendsRow {
  /** 'YYYY-MM' (month) or 'YYYY-MM-DD' (appearance/game) */
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
  /** staff-level averages that don't aggregate honestly (arm angle) */
  pitcherOnly?: boolean
  /** run-prevention estimators only offered at team level */
  teamOnly?: boolean
  /** MV-component metrics: month buckets on Career/Seasons scopes only */
  monthOnly?: boolean
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
  avg_arm_angle: { label: 'Arm Angle', unit: 'deg', group: 'Pitch Traits', pitcherOnly: true },
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
  // Run prevention (team only — no 'era' by design, see header comment)
  fip: { label: 'FIP', unit: 'runs/9', group: 'Run Prevention', teamOnly: true, monthOnly: true },
  xera: { label: 'xERA', unit: 'runs/9', group: 'Run Prevention', teamOnly: true, monthOnly: true },
}

export const TREND_METRIC_GROUPS = ['Usage', 'Pitch Traits', 'Results', 'Contact Quality', 'Run Prevention']

export const MAX_TREND_METRICS = 6

/** Pitch types with fewer total pitches than this across the selected range are dropped as noise. */
export const MIN_PITCHES_PER_LINE = 10

/** Team game-bucket live queries are bounded to keep them off the full table. */
export const TEAM_GAME_MAX_SEASONS = 2
export const TEAM_GAME_MAX_DAYS = 740

/**
 * Current 30 MLB teams — abbrevs match the pitches table / team MVs, which
 * use Statcast's current-era codes for all seasons: 'AZ' (not ARI) and
 * 'ATH' (not OAK), even for 2015. Ids are MLBAM (for logos and the MLB API).
 */
export const MLB_TEAMS: { abbrev: string; name: string; id: number }[] = [
  { abbrev: 'AZ', name: 'Arizona Diamondbacks', id: 109 },
  { abbrev: 'ATL', name: 'Atlanta Braves', id: 144 },
  { abbrev: 'BAL', name: 'Baltimore Orioles', id: 110 },
  { abbrev: 'BOS', name: 'Boston Red Sox', id: 111 },
  { abbrev: 'CHC', name: 'Chicago Cubs', id: 112 },
  { abbrev: 'CWS', name: 'Chicago White Sox', id: 145 },
  { abbrev: 'CIN', name: 'Cincinnati Reds', id: 113 },
  { abbrev: 'CLE', name: 'Cleveland Guardians', id: 114 },
  { abbrev: 'COL', name: 'Colorado Rockies', id: 115 },
  { abbrev: 'DET', name: 'Detroit Tigers', id: 116 },
  { abbrev: 'HOU', name: 'Houston Astros', id: 117 },
  { abbrev: 'KC', name: 'Kansas City Royals', id: 118 },
  { abbrev: 'LAA', name: 'Los Angeles Angels', id: 108 },
  { abbrev: 'LAD', name: 'Los Angeles Dodgers', id: 119 },
  { abbrev: 'MIA', name: 'Miami Marlins', id: 146 },
  { abbrev: 'MIL', name: 'Milwaukee Brewers', id: 158 },
  { abbrev: 'MIN', name: 'Minnesota Twins', id: 142 },
  { abbrev: 'NYM', name: 'New York Mets', id: 121 },
  { abbrev: 'NYY', name: 'New York Yankees', id: 147 },
  { abbrev: 'ATH', name: 'Athletics', id: 133 },
  { abbrev: 'PHI', name: 'Philadelphia Phillies', id: 143 },
  { abbrev: 'PIT', name: 'Pittsburgh Pirates', id: 134 },
  { abbrev: 'SD', name: 'San Diego Padres', id: 135 },
  { abbrev: 'SF', name: 'San Francisco Giants', id: 137 },
  { abbrev: 'SEA', name: 'Seattle Mariners', id: 136 },
  { abbrev: 'STL', name: 'St. Louis Cardinals', id: 138 },
  { abbrev: 'TB', name: 'Tampa Bay Rays', id: 139 },
  { abbrev: 'TEX', name: 'Texas Rangers', id: 140 },
  { abbrev: 'TOR', name: 'Toronto Blue Jays', id: 141 },
  { abbrev: 'WSH', name: 'Washington Nationals', id: 120 },
]

export const TEAM_BY_ABBREV = new Map(MLB_TEAMS.map(t => [t.abbrev, t]))

/** Metric keys available for a given entity (metric mode). */
export function metricsForEntity(entity: TrendsEntity): string[] {
  return Object.keys(TREND_METRICS).filter(k => {
    const d = TREND_METRICS[k]
    if (d.pitchModeOnly) return false
    if (entity === 'team') return !d.pitcherOnly
    return !d.teamOnly
  })
}
