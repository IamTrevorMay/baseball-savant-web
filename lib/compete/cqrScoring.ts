export interface CQRPitchResult {
  pitchIndex: number
  distanceInches: number
  edgeDistanceInches: number
  zone: number
  score: number
}

export interface ScoringConfig {
  gradingMode: 'edge' | 'base10'
  baseballRadius: number    // 1.45"
  centerBoxHalf: number     // 2" (4×4" box = ±2")
  outsideZoneMax: number    // 6" (penalty threshold)
  highSwingExempt: boolean  // true (above zone + swung at bypasses penalty)
  tiers: { maxEdge: number; score: number }[]
}

export const DEFAULT_CONFIG: ScoringConfig = {
  gradingMode: 'edge',
  baseballRadius: 1.45,
  centerBoxHalf: 2,
  outsideZoneMax: 6,
  highSwingExempt: true,
  tiers: [
    { maxEdge: 3, score: 100 },
    { maxEdge: 5, score: 75 },
    { maxEdge: 7, score: 50 },
    { maxEdge: 9, score: 25 },
  ],
}

// Strike zone boundaries in feet
const ZONE_LEFT = -17 / 24
const ZONE_RIGHT = 17 / 24
const ZONE_BOT = 1.5
const ZONE_TOP = 3.5

// Center box reference point
const CENTER_X = 0 // feet
const CENTER_Z = 2.5 // feet

/** Check if pitch lands in the center box (zone center ± centerBoxHalf). */
export function isInCenterBox(plate_x: number, plate_z: number, centerBoxHalf: number = DEFAULT_CONFIG.centerBoxHalf): boolean {
  const dx = Math.abs(plate_x - CENTER_X) * 12
  const dz = Math.abs(plate_z - CENTER_Z) * 12
  return dx <= centerBoxHalf && dz <= centerBoxHalf
}

/** Distance in inches from pitch to nearest strike zone edge. Returns 0 if inside zone. */
export function distanceOutsideZone(plate_x: number, plate_z: number): number {
  // All in feet first
  const dx = Math.max(0, ZONE_LEFT - plate_x, plate_x - ZONE_RIGHT)
  const dz = Math.max(0, ZONE_BOT - plate_z, plate_z - ZONE_TOP)
  return Math.sqrt(dx * dx + dz * dz) * 12 // convert to inches
}

const SWING_DESCRIPTIONS = new Set([
  'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip',
  'foul_bunt', 'hit_into_play', 'hit_into_play_no_out', 'hit_into_play_score',
  'missed_bunt', 'bunt_foul_tip',
])

/** Check if pitch was swung at based on Statcast description. */
export function wasSwungAt(description: string | undefined): boolean {
  if (!description) return false
  return SWING_DESCRIPTIONS.has(description)
}

/** Check if pitch is above the strike zone. */
export function isAboveZone(plate_z: number): boolean {
  return plate_z > ZONE_TOP
}

/**
 * Score a single pitch based on target vs actual location.
 *
 * Edge distance = max(0, centerDistance - baseballRadius)
 *
 * Zero cases (evaluated first):
 * - Actual in center box → 0
 * - Too far outside zone → 0 (UNLESS highSwingExempt AND above zone AND swung at)
 *
 * Tiers evaluated in order of ascending maxEdge from config.
 */
export function scorePitch(
  target: { x: number; z: number },
  actual: { plate_x: number; plate_z: number },
  zone: number,
  pitchIndex: number = 0,
  description?: string,
  config?: ScoringConfig
): CQRPitchResult {
  const cfg = config ?? DEFAULT_CONFIG
  const dx = (actual.plate_x - target.x) * 12
  const dz = (actual.plate_z - target.z) * 12
  const distanceInches = Math.sqrt(dx * dx + dz * dz)
  const edgeDistanceInches = Math.max(0, distanceInches - cfg.baseballRadius)

  const outsideDist = distanceOutsideZone(actual.plate_x, actual.plate_z)
  const tooFarOutside = outsideDist > cfg.outsideZoneMax
  const outsideExempt = cfg.highSwingExempt && isAboveZone(actual.plate_z) && wasSwungAt(description)

  let score: number

  if (isInCenterBox(actual.plate_x, actual.plate_z, cfg.centerBoxHalf)) {
    score = 0
  } else if (tooFarOutside && !outsideExempt) {
    score = 0
  } else {
    // Evaluate tiers sorted by ascending maxEdge
    const sorted = [...cfg.tiers].sort((a, b) => a.maxEdge - b.maxEdge)
    score = 0
    for (const tier of sorted) {
      if (edgeDistanceInches < tier.maxEdge) {
        score = tier.score
        break
      }
    }
  }

  return { pitchIndex, distanceInches, edgeDistanceInches, zone, score }
}

/** Average of all pitch scores, rounded to nearest integer. */
export function computeCQR(results: CQRPitchResult[]): number {
  if (results.length === 0) return 0
  const sum = results.reduce((s, r) => s + r.score, 0)
  return Math.round(sum / results.length)
}

/**
 * Determine which 3×3 zone (1-9) a point falls in.
 * Zone layout (catcher's view):
 *   1 | 2 | 3
 *   4 | 5 | 6
 *   7 | 8 | 9
 * Returns 0 if outside the zone.
 */
export function getTargetZone(x: number, z: number): number {
  if (x < ZONE_LEFT || x > ZONE_RIGHT || z < ZONE_BOT || z > ZONE_TOP) return 0

  const colWidth = (ZONE_RIGHT - ZONE_LEFT) / 3
  const rowHeight = (ZONE_TOP - ZONE_BOT) / 3

  const col = Math.min(Math.floor((x - ZONE_LEFT) / colWidth), 2)
  const row = Math.min(Math.floor((ZONE_TOP - z) / rowHeight), 2)

  return row * 3 + col + 1
}

/** Get horizontal third (column 0-2) for a point. */
function getColumn(x: number): number {
  const colWidth = (ZONE_RIGHT - ZONE_LEFT) / 3
  const col = Math.floor((x - ZONE_LEFT) / colWidth)
  return Math.max(0, Math.min(2, col))
}

/** Get vertical third (row 0-2) with extended edges (±extendInches past zone). */
function getRowExtended(z: number, extendInches: number): number | null {
  const extendFt = extendInches / 12
  const extBot = ZONE_BOT - extendFt
  const extTop = ZONE_TOP + extendFt
  if (z < extBot || z > extTop) return null
  const rowHeight = (extTop - extBot) / 3
  const row = Math.floor((extTop - z) / rowHeight)
  return Math.max(0, Math.min(2, row))
}

/**
 * Score a single pitch using Base10 mode (0-10 points from 7 binary criteria).
 *
 * +2  Same horizontal third (column) as target
 * +2  Same vertical third (row) as target (rows extended 2" past zone edges)
 * +1  Within 4" of target
 * +1  Within 8" of target
 * +1  Not more than 6" outside the zone
 * +1  Not in the 4×4" center box
 * +2  |actual.plate_x| > |target.x| (farther from plate center)
 */
export function scorePitchBase10(
  target: { x: number; z: number },
  actual: { plate_x: number; plate_z: number },
  pitchIndex: number = 0,
  config?: ScoringConfig
): CQRPitchResult {
  const cfg = config ?? DEFAULT_CONFIG
  const dx = (actual.plate_x - target.x) * 12
  const dz = (actual.plate_z - target.z) * 12
  const distanceInches = Math.sqrt(dx * dx + dz * dz)
  const edgeDistanceInches = Math.max(0, distanceInches - cfg.baseballRadius)

  let score = 0

  // +2: Same column
  if (getColumn(actual.plate_x) === getColumn(target.x)) score += 2

  // +2: Same row (extended 2" past zone edges)
  const actualRow = getRowExtended(actual.plate_z, 2)
  const targetRow = getRowExtended(target.z, 2)
  if (actualRow !== null && targetRow !== null && actualRow === targetRow) score += 2

  // +1: Within 4" of target
  if (distanceInches <= 4) score += 1

  // +1: Within 8" of target
  if (distanceInches <= 8) score += 1

  // +1: Not more than 6" outside the zone
  const outsideDist = distanceOutsideZone(actual.plate_x, actual.plate_z)
  if (outsideDist <= cfg.outsideZoneMax) score += 1

  // +1: Not in the center box
  if (!isInCenterBox(actual.plate_x, actual.plate_z, cfg.centerBoxHalf)) score += 1

  // +2: |actual.plate_x| > |target.x| (farther from plate center)
  if (Math.abs(actual.plate_x) > Math.abs(target.x)) score += 2

  return { pitchIndex, distanceInches, edgeDistanceInches, zone: 0, score }
}

/** Average of all pitch scores, ceil to nearest 0.1. */
export function computeBase10CQR(results: CQRPitchResult[]): number {
  if (results.length === 0) return 0
  const sum = results.reduce((s, r) => s + r.score, 0)
  const avg = sum / results.length
  return Math.ceil(avg * 10) / 10
}
