export interface CQRPitchResult {
  pitchIndex: number
  distanceInches: number
  zone: number
  score: number
}

/**
 * Score a single pitch based on target vs actual location.
 * Rules evaluated in order (first match wins):
 * 1. Zone 5 (center-center) → 0
 * 2. ≤2" → 100
 * 3. ≤3" → 80
 * 4. ≤4" → 60
 * 5. >4" AND ball (zone > 9 or zone = 0) → 0
 * 6. ≤5" (in zone) → 30
 * 7. >5" → 0
 */
export function scorePitch(
  target: { x: number; z: number },
  actual: { plate_x: number; plate_z: number },
  zone: number,
  pitchIndex: number = 0
): CQRPitchResult {
  const dx = (actual.plate_x - target.x) * 12
  const dz = (actual.plate_z - target.z) * 12
  const distanceInches = Math.sqrt(dx * dx + dz * dz)

  let score: number

  if (zone === 5) {
    score = 0
  } else if (distanceInches <= 2) {
    score = 100
  } else if (distanceInches <= 3) {
    score = 80
  } else if (distanceInches <= 4) {
    score = 60
  } else if (zone > 9 || zone === 0) {
    // Ball — more than 4" away
    score = 0
  } else if (distanceInches <= 5) {
    score = 30
  } else {
    score = 0
  }

  return { pitchIndex, distanceInches, zone, score }
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
  const ZONE_LEFT = -17 / 24
  const ZONE_RIGHT = 17 / 24
  const ZONE_BOT = 1.5
  const ZONE_TOP = 3.5

  if (x < ZONE_LEFT || x > ZONE_RIGHT || z < ZONE_BOT || z > ZONE_TOP) return 0

  const colWidth = (ZONE_RIGHT - ZONE_LEFT) / 3
  const rowHeight = (ZONE_TOP - ZONE_BOT) / 3

  const col = Math.min(Math.floor((x - ZONE_LEFT) / colWidth), 2)
  const row = Math.min(Math.floor((ZONE_TOP - z) / rowHeight), 2)

  return row * 3 + col + 1
}
