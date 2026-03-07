// ── Game Day (11am ET reset) ──
export function gameDay(): string {
  const now = new Date()
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  if (eastern.getHours() < 11) eastern.setDate(eastern.getDate() - 1)
  return `${eastern.getFullYear()}-${String(eastern.getMonth() + 1).padStart(2, '0')}-${String(eastern.getDate()).padStart(2, '0')}`
}

/** Seconds until the next 11am ET reset (for CDN cache TTL). */
export function secondsUntilReset(): number {
  const now = new Date()
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const next = new Date(eastern)
  next.setHours(11, 0, 0, 0)
  if (eastern.getHours() >= 11) next.setDate(next.getDate() + 1)
  return Math.max(60, Math.floor((next.getTime() - eastern.getTime()) / 1000))
}

// ── NES Palette ──
export const NES = {
  bg: '#0C0C0C',
  red: '#FC0D1B',
  blue: '#0058F8',
  green: '#00A800',
  yellow: '#F8D878',
  white: '#FCFCFC',
  gray: '#7C7C7C',
  darkGray: '#383838',
} as const

// ── AL / NL team sets ──
export const AL_TEAMS = new Set([
  'NYY','BOS','TB','BAL','TOR',
  'CLE','CWS','MIN','DET','KC',
  'HOU','SEA','TEX','LAA','OAK','ATH',
])
export const NL_TEAMS = new Set([
  'NYM','ATL','PHI','MIA','WSH',
  'CHC','MIL','STL','CIN','PIT',
  'LAD','SD','SF','ARI','COL',
])

export function leagueForTeam(team: string): 'AL' | 'NL' | '?' {
  if (AL_TEAMS.has(team)) return 'AL'
  if (NL_TEAMS.has(team)) return 'NL'
  return '?'
}

// ── Division mapping ──
export const TEAM_DIVISION: Record<string, string> = {
  NYY:'AL East',BOS:'AL East',TB:'AL East',BAL:'AL East',TOR:'AL East',
  CLE:'AL Central',CWS:'AL Central',MIN:'AL Central',DET:'AL Central',KC:'AL Central',
  HOU:'AL West',SEA:'AL West',TEX:'AL West',LAA:'AL West',OAK:'AL West',ATH:'AL West',
  NYM:'NL East',ATL:'NL East',PHI:'NL East',MIA:'NL East',WSH:'NL East',
  CHC:'NL Central',MIL:'NL Central',STL:'NL Central',CIN:'NL Central',PIT:'NL Central',
  LAD:'NL West',SD:'NL West',SF:'NL West',ARI:'NL West',COL:'NL West',
}

// ── Position categories ──
const INFIELD = new Set(['C', '1B', '2B', '3B', 'SS'])
const OUTFIELD = new Set(['LF', 'CF', 'RF', 'OF'])
const STARTER = new Set(['SP', 'TWP'])
const RELIEVER = new Set(['RP', 'CP'])

export function samePositionCategory(a: string, b: string): boolean {
  if (a === b) return true
  if (INFIELD.has(a) && INFIELD.has(b)) return true
  if (OUTFIELD.has(a) && OUTFIELD.has(b)) return true
  if (STARTER.has(a) && STARTER.has(b)) return true
  if (RELIEVER.has(a) && RELIEVER.has(b)) return true
  return false
}

// ── Tier names ──
export const TIER_LABELS = ['CLASSIFIED', 'ENCRYPTED', 'DECODED', 'REVEALED', 'EXPOSED'] as const

// ── Stat definitions ──
export interface StatDef {
  key: string
  label: string
  unit: string
  format: 'pct' | 'num' | 'mph' | 'rpm' | 'in' | 'ft' | 'deg' | 'rate' | 'count'
  decimals: number
  invertPercentile?: boolean
  traditional?: boolean
  desc?: string
}

// 6 stats per tier × 5 tiers = 30 stats each
export const PITCHER_TIERS: StatDef[][] = [
  // L1 – CLASSIFIED (hardest)
  [
    { key: 'fb_hb', label: 'FB Horizontal Break', unit: 'in', format: 'in', decimals: 1, desc: 'Average horizontal movement on fastballs' },
    { key: 'gb_pct', label: 'GB%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of batted balls that are ground balls' },
    { key: 'arm_angle', label: 'Arm Angle', unit: '°', format: 'deg', decimals: 1, desc: 'Release point arm slot angle' },
    { key: 'xba_against', label: 'xBA Against', unit: '', format: 'num', decimals: 3, invertPercentile: true, desc: 'Expected batting average allowed based on exit velo and launch angle' },
    { key: 'first_strike_pct', label: 'F-Strike%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of plate appearances starting with a strike' },
    { key: 'walks', label: 'Walks', unit: '', format: 'count', decimals: 0, invertPercentile: true, traditional: true, desc: 'Total walks issued' },
    { key: 'hr_allowed', label: 'HR Allowed', unit: '', format: 'count', decimals: 0, invertPercentile: true, traditional: true, desc: 'Total home runs allowed' },
    { key: 'whip', label: 'WHIP', unit: '', format: 'num', decimals: 2, invertPercentile: true, traditional: true, desc: 'Walks plus hits per inning pitched' },
    { key: 'k_per_9', label: 'K/9', unit: '', format: 'num', decimals: 1, traditional: true, desc: 'Strikeouts per 9 innings' },
  ],
  // L2 – ENCRYPTED
  [
    { key: 'fb_spin', label: 'FB Spin Rate', unit: 'rpm', format: 'rpm', decimals: 0, desc: 'Average spin rate on fastballs' },
    { key: 'fb_ivb', label: 'FB Induced Vert Break', unit: 'in', format: 'in', decimals: 1, desc: 'Induced vertical break on fastballs (rise effect)' },
    { key: 'extension', label: 'Extension', unit: 'ft', format: 'ft', decimals: 1, desc: 'Distance toward home plate at release' },
    { key: 'zone_pct', label: 'Zone%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of pitches thrown in the strike zone' },
    { key: 'breaking_spin', label: 'Breaking Ball Spin', unit: 'rpm', format: 'rpm', decimals: 0, desc: 'Average spin rate on breaking balls' },
    { key: 'fb_usage_pct', label: 'FB Usage%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of pitches that are fastballs' },
  ],
  // L3 – DECODED
  [
    { key: 'csw_pct', label: 'CSW%', unit: '%', format: 'pct', decimals: 1, desc: 'Called strikes plus whiffs per pitch' },
    { key: 'chase_rate', label: 'Chase Rate', unit: '%', format: 'pct', decimals: 1, desc: 'Swing rate on pitches outside the zone' },
    { key: 'avg_ev_against', label: 'Avg EV Against', unit: 'mph', format: 'mph', decimals: 1, invertPercentile: true, desc: 'Average exit velocity allowed on batted balls' },
    { key: 'swstr_pct', label: 'SwStr%', unit: '%', format: 'pct', decimals: 1, desc: 'Swinging strike rate per pitch' },
    { key: 'put_away_pct', label: 'Put Away%', unit: '%', format: 'pct', decimals: 1, desc: 'Strikeout rate in two-strike counts' },
    { key: 'contact_pct_against', label: 'Contact% Against', unit: '%', format: 'pct', decimals: 1, invertPercentile: true, desc: 'Contact rate allowed when batters swing' },
  ],
  // L4 – REVEALED
  [
    { key: 'whiff_pct', label: 'Whiff%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of swings that miss' },
    { key: 'barrel_pct_against', label: 'Barrel% Against', unit: '%', format: 'pct', decimals: 1, invertPercentile: true, desc: 'Barrel rate allowed on batted balls' },
    { key: 'hard_hit_pct_against', label: 'Hard Hit% Against', unit: '%', format: 'pct', decimals: 1, invertPercentile: true, desc: 'Percentage of batted balls hit 95+ mph allowed' },
    { key: 'fip', label: 'FIP', unit: '', format: 'num', decimals: 2, invertPercentile: true, desc: 'Fielding Independent Pitching — ERA estimator using K, BB, HR' },
    { key: 'xwoba_against', label: 'xwOBA Against', unit: '', format: 'num', decimals: 3, invertPercentile: true, desc: 'Expected weighted on-base average allowed' },
    { key: 'babip_against', label: 'BABIP Against', unit: '', format: 'num', decimals: 3, invertPercentile: true, desc: 'Batting average on balls in play allowed' },
  ],
  // L5 – EXPOSED (easiest)
  [
    { key: 'fb_velo', label: 'FB Velo', unit: 'mph', format: 'mph', decimals: 1, desc: 'Average fastball velocity' },
    { key: 'k_pct', label: 'K%', unit: '%', format: 'pct', decimals: 1, desc: 'Strikeout rate per plate appearance' },
    { key: 'bb_pct', label: 'BB%', unit: '%', format: 'pct', decimals: 1, invertPercentile: true, desc: 'Walk rate per plate appearance' },
    { key: 'xera', label: 'xERA', unit: '', format: 'num', decimals: 2, invertPercentile: true, desc: 'Expected ERA based on quality of contact allowed' },
    { key: 'k_minus_bb', label: 'K-BB%', unit: '%', format: 'pct', decimals: 1, desc: 'Strikeout rate minus walk rate' },
    { key: 'avg_velo', label: 'Avg Velo', unit: 'mph', format: 'mph', decimals: 1, desc: 'Average velocity across all pitches' },
  ],
]

export const HITTER_TIERS: StatDef[][] = [
  // L1 – CLASSIFIED (hardest)
  [
    { key: 'gb_pct', label: 'GB%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of batted balls that are ground balls' },
    { key: 'fb_pct', label: 'FB%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of batted balls that are fly balls' },
    { key: 'pull_pct', label: 'Pull%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of batted balls hit to pull side' },
    { key: 'oppo_pct', label: 'Oppo%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of batted balls hit to opposite field' },
    { key: 'ld_pct', label: 'LD%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of batted balls that are line drives' },
    { key: 'popup_pct', label: 'Popup%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of batted balls that are popups' },
    { key: 'rbi', label: 'RBIs', unit: '', format: 'count', decimals: 0, traditional: true, desc: 'Runs batted in' },
    { key: 'slg', label: 'SLG%', unit: '', format: 'num', decimals: 3, traditional: true, desc: 'Slugging percentage' },
    { key: 'obp', label: 'OBP', unit: '', format: 'num', decimals: 3, traditional: true, desc: 'On-base percentage' },
  ],
  // L2 – ENCRYPTED
  [
    { key: 'sweet_spot_pct', label: 'Sweet Spot%', unit: '%', format: 'pct', decimals: 1, desc: 'Batted balls with launch angle between 8° and 32°' },
    { key: 'zone_contact_pct', label: 'Zone Contact%', unit: '%', format: 'pct', decimals: 1, desc: 'Contact rate on pitches in the strike zone' },
    { key: 'hr_fb_pct', label: 'HR/FB%', unit: '%', format: 'pct', decimals: 1, desc: 'Home runs as a percentage of fly balls' },
    { key: 'contact_pct', label: 'Contact%', unit: '%', format: 'pct', decimals: 1, desc: 'Contact rate on all swings' },
    { key: 'z_swing_pct', label: 'Z-Swing%', unit: '%', format: 'pct', decimals: 1, desc: 'Swing rate on pitches in the strike zone' },
    { key: 'pitch_per_pa', label: 'P/PA', unit: '', format: 'num', decimals: 2, desc: 'Average pitches seen per plate appearance' },
  ],
  // L3 – DECODED
  [
    { key: 'xba', label: 'xBA', unit: '', format: 'num', decimals: 3, desc: 'Expected batting average based on exit velo and launch angle' },
    { key: 'sprint_speed', label: 'Sprint Speed', unit: 'ft/s', format: 'num', decimals: 1, desc: 'Top sprint speed in feet per second' },
    { key: 'whiff_pct', label: 'Whiff%', unit: '%', format: 'pct', decimals: 1, invertPercentile: true, desc: 'Percentage of swings that miss' },
    { key: 'chase_rate', label: 'Chase Rate', unit: '%', format: 'pct', decimals: 1, invertPercentile: true, desc: 'Swing rate on pitches outside the zone' },
    { key: 'o_swing_pct', label: 'O-Swing%', unit: '%', format: 'pct', decimals: 1, invertPercentile: true, desc: 'Swing rate on pitches outside the zone' },
    { key: 'babip', label: 'BABIP', unit: '', format: 'num', decimals: 3, desc: 'Batting average on balls in play' },
  ],
  // L4 – REVEALED
  [
    { key: 'barrel_pct', label: 'Barrel%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of batted balls that are barrels' },
    { key: 'max_ev', label: 'Max EV', unit: 'mph', format: 'mph', decimals: 1, desc: 'Maximum exit velocity' },
    { key: 'xslg', label: 'xSLG', unit: '', format: 'num', decimals: 3, desc: 'Expected slugging based on quality of contact' },
    { key: 'hard_hit_pct', label: 'Hard Hit%', unit: '%', format: 'pct', decimals: 1, desc: 'Percentage of batted balls hit 95+ mph' },
    { key: 'iso_x', label: 'xISO', unit: '', format: 'num', decimals: 3, desc: 'Expected isolated power (xSLG minus xBA)' },
    { key: 'woba', label: 'wOBA', unit: '', format: 'num', decimals: 3, desc: 'Weighted on-base average' },
  ],
  // L5 – EXPOSED (easiest)
  [
    { key: 'avg_ev', label: 'Avg EV', unit: 'mph', format: 'mph', decimals: 1, desc: 'Average exit velocity on batted balls' },
    { key: 'k_pct', label: 'K%', unit: '%', format: 'pct', decimals: 1, invertPercentile: true, desc: 'Strikeout rate per plate appearance' },
    { key: 'bb_pct', label: 'BB%', unit: '%', format: 'pct', decimals: 1, desc: 'Walk rate per plate appearance' },
    { key: 'xwoba', label: 'xwOBA', unit: '', format: 'num', decimals: 3, desc: 'Expected weighted on-base average' },
    { key: 'k_minus_bb', label: 'K-BB%', unit: '%', format: 'pct', decimals: 1, desc: 'Walk rate minus strikeout rate (plate discipline)' },
    { key: 'hr_per_pa', label: 'HR/PA%', unit: '%', format: 'pct', decimals: 1, desc: 'Home runs per plate appearance' },
  ],
]

// ── Deterministic hashing ──
// Bump PUZZLE_SEED to rotate all puzzles to new players
const PUZZLE_SEED = 2

function djb2(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash
}

export function dailyPlayerIndex(date: string, year: number, type: string, poolSize: number): number {
  return djb2(`${date}-${year}-${type}-s${PUZZLE_SEED}`) % poolSize
}

/** Pick `count` unique indices from [0, statsCount). Deterministic per day/year/type/tier.
 *  When guaranteedIndices is provided, exactly 1 pick comes from that set and the rest from the complement. */
export function pickStats(date: string, year: number, type: string, tierLevel: number, statsCount: number, count: number, guaranteedIndices?: number[]): number[] {
  let h = djb2(`${date}-${year}-${type}-tier${tierLevel}-s${PUZZLE_SEED}`)

  if (guaranteedIndices && guaranteedIndices.length > 0) {
    // Pick exactly 1 from guaranteed set
    const gIdx = h % guaranteedIndices.length
    const guaranteed = guaranteedIndices[gIdx]
    h = ((h << 5) + h + 99) >>> 0

    // Pick remaining from non-guaranteed indices
    const others = Array.from({ length: statsCount }, (_, i) => i).filter(i => !guaranteedIndices.includes(i))
    const picked: number[] = [guaranteed]
    for (let attempt = 0; picked.length < count && attempt < 50; attempt++) {
      const idx = others[h % others.length]
      if (!picked.includes(idx)) picked.push(idx)
      h = ((h << 5) + h + attempt + 1) >>> 0
    }
    return picked
  }

  const picked: number[] = []
  for (let attempt = 0; picked.length < count && attempt < 50; attempt++) {
    const idx = h % statsCount
    if (!picked.includes(idx)) picked.push(idx)
    h = ((h << 5) + h + attempt + 1) >>> 0
  }
  return picked
}

// ── Scoring constants ──
export const SCORE_TABLE = [100, 80, 60, 40, 20]
export const HINT_COSTS = [3, 5, 7]
export const GREEN_BONUS = 2

// ── Format helpers ──
export function formatStatValue(value: number, def: StatDef): string {
  if (value == null || isNaN(value)) return '—'
  const v = value.toFixed(def.decimals)
  if (def.format === 'pct') return `${v}%`
  if (def.format === 'count') return v
  if (def.unit && def.format !== 'num') return `${v} ${def.unit}`
  return v
}

export function percentileColor(p: number): string {
  if (p <= 20) return NES.red
  if (p <= 40) return '#F87818'
  if (p <= 60) return NES.yellow
  if (p <= 80) return NES.green
  return NES.blue
}

export function segmentColors(percentile: number): string[] {
  const filled = Math.round(percentile / 10)
  return Array.from({ length: 10 }, (_, i) => {
    if (i >= filled) return NES.darkGray
    const p = (i + 1) * 10
    if (p <= 20) return NES.red
    if (p <= 40) return '#F87818'
    if (p <= 60) return NES.yellow
    if (p <= 80) return NES.green
    return NES.blue
  })
}
