// Lahman database types and utilities

export interface LahmanPlayer {
  lahman_id: string
  mlb_id: number | null
  bbref_id: string | null
  retro_id: string | null
  name_first: string
  name_last: string
  name_given: string | null
  birth_year: number | null
  birth_month: number | null
  birth_day: number | null
  birth_country: string | null
  birth_state: string | null
  birth_city: string | null
  death_year: number | null
  weight: number | null
  height: number | null
  bats: string | null
  throws: string | null
  debut: string | null
  final_game: string | null
}

export interface LahmanBattingSeason {
  lahman_id: string
  year: number
  team_id: string | null
  lg_id: string | null
  g: number; ab: number; r: number; h: number
  doubles: number; triples: number; hr: number
  rbi: number; sb: number; cs: number
  bb: number; so: number; ibb: number
  hbp: number; sh: number; sf: number; gidp: number
  pa: number; ba: number | null; obp: number | null; slg: number | null; ops: number | null
}

export interface LahmanPitchingSeason {
  lahman_id: string
  year: number
  team_id: string | null
  lg_id: string | null
  w: number; l: number; g: number; gs: number
  cg: number; sho: number; sv: number
  ipouts: number; h: number; er: number; hr: number
  bb: number; so: number; ibb: number
  wp: number; hbp: number; bk: number
  bfp: number; gf: number; r: number
  ip: number; era: number | null; whip: number | null
  k9: number | null; bb9: number | null; hr9: number | null
  k_pct: number | null; bb_pct: number | null
}

export interface LahmanFieldingSeason {
  lahman_id: string
  year: number
  team_id: string | null
  pos: string | null
  g: number; gs: number | null
  inn_outs: number | null
  po: number; a: number; e: number; dp: number
}

export interface LahmanAward {
  lahman_id: string
  award_id: string
  year: number
  lg_id: string | null
  notes: string | null
}

export interface LahmanAllStar {
  lahman_id: string
  year: number
  lg_id: string | null
  team_id: string | null
}

export interface LahmanHOF {
  lahman_id: string
  year: number
  voted_by: string | null
  ballots: number | null
  needed: number | null
  votes: number | null
  inducted: string | null
  category: string | null
}

export interface LahmanPlayerData {
  player: LahmanPlayer
  batting: LahmanBattingSeason[]
  pitching: LahmanPitchingSeason[]
  fielding: LahmanFieldingSeason[]
  awards: LahmanAward[]
  allstars: LahmanAllStar[]
  hof: LahmanHOF[]
}

// Format IP from ipouts: 213 outs -> "71.0"
export function formatIP(ipouts: number): string {
  const full = Math.floor(ipouts / 3)
  const partial = ipouts % 3
  return `${full}.${partial}`
}

// Historical Lahman team codes -> modern 3-letter codes
export const LAHMAN_TEAM_MAP: Record<string, string> = {
  // Current teams with historical aliases
  'ANA': 'LAA', 'CAL': 'LAA', 'MON': 'WSH', 'EXP': 'WSH',
  'FLO': 'MIA', 'TBD': 'TB', 'TBA': 'TB',
  'MLN': 'ATL', 'BSN': 'ATL',
  'PHA': 'OAK',
  'SLB': 'BAL', 'MLA': 'BAL',
  'WSA': 'MIN', 'WS1': 'MIN', 'WS2': 'TEX',
  'SEP': 'MIL', 'ML4': 'MIL',
  'BRO': 'LAD',
  'NYG': 'SF', 'SFG': 'SF',
  'NY1': 'SF', 'NY2': 'SF',
  // Current codes (Lahman -> modern 3-letter)
  'ARI': 'ARI', 'ATL': 'ATL', 'BAL': 'BAL', 'BOS': 'BOS',
  'CHN': 'CHC', 'CHA': 'CWS', 'CHW': 'CWS',
  'CIN': 'CIN', 'CLE': 'CLE', 'COL': 'COL',
  'DET': 'DET', 'HOU': 'HOU', 'KCA': 'KC', 'KCR': 'KC',
  'LAN': 'LAD', 'LAD': 'LAD', 'LAA': 'LAA',
  'MIA': 'MIA', 'MIL': 'MIL', 'MIN': 'MIN',
  'NYA': 'NYY', 'NYN': 'NYM', 'NYY': 'NYY', 'NYM': 'NYM',
  'OAK': 'OAK', 'PHI': 'PHI', 'PIT': 'PIT',
  'SDN': 'SD', 'SDP': 'SD', 'SD': 'SD',
  'SEA': 'SEA', 'SFN': 'SF', 'SF': 'SF',
  'SLN': 'STL', 'STL': 'STL',
  'TB': 'TB', 'TEX': 'TEX', 'TOR': 'TOR',
  'WAS': 'WSH', 'WSN': 'WSH', 'WSH': 'WSH',
  'ATH': 'ATH',
}

export function modernTeamCode(lahmanCode: string | null): string {
  if (!lahmanCode) return ''
  return LAHMAN_TEAM_MAP[lahmanCode] || lahmanCode
}
