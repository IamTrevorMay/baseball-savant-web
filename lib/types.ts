/* ─── Shared Types ─── */

/** Player search result — superset of all search/picker variants */
export interface PlayerResult {
  player_name: string
  pitcher?: number
  batter?: number
  total_pitches: number
  team: string
  /** Only present on full search results (pitchers page) */
  games?: number
  last_date?: string
  avg_velo?: number
  pitch_types?: string[]
  latest_season?: number
}

/** Minimal player reference used in live scoreboards */
export interface PlayerRef {
  id: number
  name: string
}

/** Team entry in live scoreboard games */
export interface GameTeam {
  id: number
  name: string
  abbrev: string
  score: number | null
  /** MiLB only */
  parentOrgId?: number | null
}

/** Live scoreboard game (MLB / MiLB / WBC home pages) */
export interface Game {
  gamePk: number
  gameDate: string
  gameType: string
  seriesDescription: string
  state: string
  detailedState: string
  away: GameTeam
  home: GameTeam
  inning: number | null
  inningOrdinal: string | null
  inningHalf: string | null
  outs: number | null
  onFirst: boolean
  onSecond: boolean
  onThird: boolean
  pitcher: PlayerRef | null
  batter: PlayerRef | null
  probableAway: PlayerRef | null
  probableHome: PlayerRef | null
}

/** Pitch-level breakdown for matchup views */
export interface PitchBreakdown {
  pitch_name: string
  pitches: number
  usage_pct: number
  whiff_pct: number | null
  xwoba: number | null
  ba: number | null
  avg_ev: number | null
}

