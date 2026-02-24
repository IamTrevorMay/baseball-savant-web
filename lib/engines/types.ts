// ── Shared types for Triton Models engines ──────────────────────────────────

export interface PitchArsenal {
  pitch_name: string
  pitch_type: string
  usage_pct: number
  avg_velo: number | null
  avg_spin: number | null
  whiff_pct: number | null
  zone_pct: number | null
  chase_pct: number | null
  csw_pct: number | null
  avg_xwoba: number | null
  pitches: number
}

export interface VeloTrend {
  game_date: string
  avg_velo: number
  pitches: number
}

export interface BatterZone {
  zone: number
  pitches: number
  avg_ev: number | null
  hard_hit_pct: number | null
  barrel_pct: number | null
  xwoba: number | null
}

export interface ChaseRegion {
  quadrant: string // 'up-left' | 'up-right' | 'down-left' | 'down-right'
  pitches: number
  swing_pct: number | null
  whiff_pct: number | null
}

export interface CountProfile {
  balls: number
  strikes: number
  pitches: number
  swing_pct: number | null
  avg_ev: number | null
  xwoba: number | null
}

export interface H2HRecord {
  pitch_name: string
  pitches: number
  whiff_pct: number | null
  xwoba: number | null
  avg_ev: number | null
  ba: number | null
}

// ── PAIE Input / Output ─────────────────────────────────────────────────────

export interface PAIEInput {
  arsenal: PitchArsenal[]
  veloTrend: VeloTrend[]
  batterZones: BatterZone[]
  chaseProfile: ChaseRegion[]
  countProfile: CountProfile[]
  h2h: H2HRecord[]
  count: { balls: number; strikes: number }
  tto: number // times through order (1, 2, 3+)
}

export interface PitchRecommendation {
  pitch_name: string
  confidence: number // 0-100
  target: string // e.g. "Low and away"
  rationale: string[]
  adjustments: { rule: string; delta: number }[]
}

export interface ZoneScore {
  zone: number
  score: number
  label: 'danger' | 'neutral' | 'cold'
}

export interface PAIEOutput {
  primary: PitchRecommendation
  secondary: PitchRecommendation
  avoid: { pitch_name: string; zone: string; reason: string }[]
  zoneScores: ZoneScore[]
  allPitches: PitchRecommendation[]
  fatigueDetected: boolean
  seasonBaselineVelo: number | null
  recentVelo: number | null
}

// ── HAIE Input / Output ─────────────────────────────────────────────────────

export type ApproachMode = 'aggressive' | 'neutral' | 'protective'

export interface HAIEInput {
  arsenal: PitchArsenal[]
  veloTrend: VeloTrend[]
  batterZones: BatterZone[]
  chaseProfile: ChaseRegion[]
  countProfile: CountProfile[]
  h2h: H2HRecord[]
  count: { balls: number; strikes: number }
}

export interface SitOnZone {
  zone: number
  zoneName: string
  avg_ev: number | null
  barrel_pct: number | null
  xwoba: number | null
  score: number
}

export interface ChaseWarning {
  quadrant: string
  swing_pct: number
  whiff_pct: number
  severity: number
  exploitedBy: string[]
  tip: string
}

export interface TwoStrikeMode {
  expectPitch: string
  protectAgainst: string
  strategy: string
}

export interface HitterZoneScore {
  zone: number
  score: number
  label: 'attack' | 'neutral' | 'avoid'
}

export interface CountAdvantageInfo {
  count: string
  xwoba: number | null
  label: 'hitter' | 'pitcher' | 'neutral'
}

export interface HAIEOutput {
  approachMode: ApproachMode
  confidence: number
  sitOnPitch: string
  sitOnZones: SitOnZone[]
  takeUntilRule: string
  chaseWarnings: ChaseWarning[]
  twoStrikeMode: TwoStrikeMode | null
  hitterZoneScores: HitterZoneScore[]
  rationale: string[]
  fatigueDetected: boolean
  fatigueMessage: string | null
  seasonBaselineVelo: number | null
  recentVelo: number | null
  countAdvantage: CountAdvantageInfo
  adjustments: { rule: string; delta: number }[]
}

// ── Matchup API response ────────────────────────────────────────────────────

export interface MatchupData {
  arsenal: PitchArsenal[]
  veloTrend: VeloTrend[]
  batterZones: BatterZone[]
  chaseProfile: ChaseRegion[]
  countProfile: CountProfile[]
  h2h: H2HRecord[]
  pitcherName: string
  batterName: string
}

// ── PURI (Pitcher Usage Risk Intelligence) ──────────────────────────────────

// Raw from API
export interface GameLogRow {
  game_date: string
  game_pk: number
  pitches: number
  avg_fb_velo: number | null
  max_fb_velo: number | null
  avg_spin: number | null
  innings: number
  batters_faced: number
  csw: number
  late_inning: number
  had_runners: number
  close_game: number
}

export interface InningVeloRow {
  game_date: string
  inning: number
  avg_velo: number
  pitches: number
}

export interface PURIInput {
  gameLog: GameLogRow[]
  inningVelo: InningVeloRow[]
  currentDate: string  // YYYY-MM-DD
}

// Computed per-game (enriched)
export interface GameLogEntry {
  game_date: string
  game_pk: number
  pitches: number
  avg_fb_velo: number | null
  max_fb_velo: number | null
  avg_spin: number | null
  innings: number
  batters_faced: number
  rest_days: number | null  // null for first game
  velo_fade: number | null  // first inning - last inning velo
  high_leverage: boolean
  pitch_flag: boolean  // exceeded threshold
}

export interface RiskAlert {
  level: 'info' | 'warning' | 'danger'
  title: string
  message: string
}

export interface WorkloadMetrics {
  acuteLoad: number
  chronicLoad: number
  acwr: number
  acwrLabel: 'underwork' | 'sweet-spot' | 'caution' | 'spike'
  role: 'starter' | 'reliever'
  seasonBaselineVelo: number | null
  recentVelo: number | null
  veloDrop: number | null
  avgVeloFade: number | null
  highLevCount7d: number
  lastRestDays: number | null
}

export interface PURIOutput {
  riskScore: number
  riskLevel: 'low' | 'moderate' | 'elevated' | 'high'
  alerts: RiskAlert[]
  workload: WorkloadMetrics
  enrichedLog: GameLogEntry[]
  adjustments: { rule: string; delta: number }[]
}

// API response
export interface RiskData {
  gameLog: GameLogRow[]
  inningVelo: InningVeloRow[]
  pitcherName: string
}

// ── CGCIE (Catcher Game Calling Intelligence Engine) ────────────────────────

export interface TransitionRow {
  from_pitch: string
  to_pitch: string
  freq: number
  whiff_pct: number | null
  xwoba: number | null
}

export interface RecentABRow {
  game_date: string
  game_pk: number
  at_bat_number: number
  pitch_number: number
  pitch_name: string
  description: string
  balls: number
  strikes: number
  release_speed: number | null
}

export interface CGCIEInput {
  arsenal: PitchArsenal[]
  batterZones: BatterZone[]
  h2h: H2HRecord[]
  transitions: TransitionRow[]
  currentSequence: string[]
  count: { balls: number; strikes: number }
  recentABs: RecentABRow[]
}

export interface SequenceRecommendation {
  pitch_name: string
  confidence: number
  target: string
  rationale: string[]
  adjustments: { rule: string; delta: number }[]
}

export interface SequenceInsight {
  type: 'repetition' | 'tunnel' | 'speed-diff' | 'pattern' | 'transition'
  level: 'info' | 'warning'
  message: string
}

export interface CGCIEOutput {
  recommended: SequenceRecommendation
  secondary: SequenceRecommendation
  allPitches: SequenceRecommendation[]
  insights: SequenceInsight[]
  adjustments: { rule: string; delta: number }[]
}

export interface AtBatSequence {
  game_date: string
  game_pk: number
  at_bat_number: number
  pitches: { pitch_name: string; description: string; count: string; velo: number | null }[]
  result: string
}

export interface GameCallData {
  arsenal: PitchArsenal[]
  batterZones: BatterZone[]
  h2h: H2HRecord[]
  transitions: TransitionRow[]
  recentABs: RecentABRow[]
  pitcherName: string
  batterName: string
}
