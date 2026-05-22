// ── Producer Overlay Types ──────────────────────────────────────────────────

export type PanelPosition = 'lower-bar' | 'right-panel'

export type PresetType =
  | 'stat-line'
  | 'standings'
  | 'leaderboard'
  | 'matchup'
  | 'comparison'
  | 'custom-text'
  | 'arsenal'
  | 'movement'

// ── Per-Preset Data Shapes ──────────────────────────────────────────────────

export interface StatLineData {
  playerId: number
  playerName: string
  team?: string
  headshot?: string
  stats: Record<string, number | string>
  metricLabels: Record<string, string>
}

export interface StandingsTeam {
  id: number
  name: string
  abbrev: string
  w: number
  l: number
  pct: string
  gb: string
  streak: string
  l10: string
}

export interface StandingsData {
  division: string
  divisionAbbrev: string
  teams: StandingsTeam[]
}

export interface LeaderboardEntry {
  player_id: number
  player_name: string
  primary_value: number | string
  rank: number
}

export interface LeaderboardData {
  metric: string
  metricLabel: string
  entries: LeaderboardEntry[]
  playerType: 'pitcher' | 'batter'
  season: number
}

export interface MatchupPlayerData {
  playerId: number
  playerName: string
  team?: string
  headshot?: string
  stats: Record<string, number | string>
  metricLabels: Record<string, string>
}

export interface MatchupData {
  pitcher: MatchupPlayerData
  batter: MatchupPlayerData
}

export interface ComparisonData {
  playerA: MatchupPlayerData
  playerB: MatchupPlayerData
  metrics: string[]
  metricLabels: Record<string, string>
}

export interface CustomTextData {
  headline: string
  subline?: string
  body?: string
}

export interface ArsenalPitch {
  pitch_type: string
  pitch_name: string
  avg_velo: number
  ivb: number
  hb: number
  usage_pct: number
  whiff_pct?: number
  count: number
}

export interface ArsenalData {
  playerId: number
  playerName: string
  team?: string
  pitches: ArsenalPitch[]
}

export interface MovementPoint {
  pitch_type: string
  pitch_name: string
  hb: number
  ivb: number
}

export interface MovementData {
  playerId: number
  playerName: string
  team?: string
  pitches: MovementPoint[]
  averages: { pitch_type: string; pitch_name: string; hb: number; ivb: number }[]
}

// ── Panel Content ───────────────────────────────────────────────────────────

export type PanelContentData =
  | { presetType: 'stat-line'; data: StatLineData }
  | { presetType: 'standings'; data: StandingsData }
  | { presetType: 'leaderboard'; data: LeaderboardData }
  | { presetType: 'matchup'; data: MatchupData }
  | { presetType: 'comparison'; data: ComparisonData }
  | { presetType: 'custom-text'; data: CustomTextData }
  | { presetType: 'arsenal'; data: ArsenalData }
  | { presetType: 'movement'; data: MovementData }

export interface PanelContent {
  presetType: PresetType
  data: PanelContentData['data']
  title?: string
  subtitle?: string
}

// ── Panel State ─────────────────────────────────────────────────────────────

export interface ProducerPanelState {
  visible: boolean
  animating: 'entering' | 'exiting' | null
  content: PanelContent | null
}

// ── Realtime Event Payloads ─────────────────────────────────────────────────

export interface ProducerPanelShowPayload {
  position: PanelPosition
  content: PanelContent
  timestamp: number
}

export interface ProducerPanelHidePayload {
  position: PanelPosition
  timestamp: number
}

export interface ProducerPanelUpdatePayload {
  position: PanelPosition
  content: PanelContent
  timestamp: number
}

// ── Config shapes (what the producer page sends to the controls hook) ──────

export interface StatLineConfig {
  playerId: number
  playerName: string
  playerType: 'pitcher' | 'batter'
  metrics: string[]
  season: number
}

export interface StandingsConfig {
  division: string // 'ALE' | 'ALC' | 'ALW' | 'NLE' | 'NLC' | 'NLW' | 'AL' | 'NL' | 'MLB'
  season: number
}

export interface LeaderboardConfig {
  metric: string
  metricLabel: string
  playerType: 'pitcher' | 'batter'
  count: number
  season: number
}

export interface MatchupConfig {
  pitcherId: number
  pitcherName: string
  batterId: number
  batterName: string
  season: number
}

export interface ComparisonConfig {
  playerAId: number
  playerAName: string
  playerBId: number
  playerBName: string
  playerType: 'pitcher' | 'batter'
  metrics: string[]
  season: number
}

export interface CustomTextConfig {
  headline: string
  subline?: string
  body?: string
}

export interface ArsenalConfig {
  playerId: number
  playerName: string
  season: number
}

export interface MovementConfig {
  playerId: number
  playerName: string
  season: number
}

export type PresetConfig =
  | { type: 'stat-line'; config: StatLineConfig }
  | { type: 'standings'; config: StandingsConfig }
  | { type: 'leaderboard'; config: LeaderboardConfig }
  | { type: 'matchup'; config: MatchupConfig }
  | { type: 'comparison'; config: ComparisonConfig }
  | { type: 'custom-text'; config: CustomTextConfig }
  | { type: 'arsenal'; config: ArsenalConfig }
  | { type: 'movement'; config: MovementConfig }

// ── Preset metadata ─────────────────────────────────────────────────────────

export interface PresetMeta {
  type: PresetType
  label: string
  icon: string
  description: string
}

export const PRESET_METAS: PresetMeta[] = [
  { type: 'stat-line', label: 'Stat Line', icon: '📊', description: 'Player headshot + key stats' },
  { type: 'standings', label: 'Standings', icon: '🏆', description: 'Division standings table' },
  { type: 'leaderboard', label: 'Leaderboard', icon: '📈', description: 'Ranked stat leaders' },
  { type: 'matchup', label: 'Matchup', icon: '⚔️', description: 'Pitcher vs batter cards' },
  { type: 'comparison', label: 'Comparison', icon: '🔄', description: 'Head-to-head stat bars' },
  { type: 'custom-text', label: 'Custom Text', icon: '✏️', description: 'Free-form headline card' },
  { type: 'arsenal', label: 'Arsenal', icon: '🎯', description: 'Pitch arsenal table' },
  { type: 'movement', label: 'Movement', icon: '🌀', description: 'HB vs IVB scatter plot' },
]
