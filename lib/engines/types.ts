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
