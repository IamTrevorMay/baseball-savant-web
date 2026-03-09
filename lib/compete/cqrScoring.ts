export interface CQRPitchResult {
  pitchIndex: number
  distanceInches: number
  edgeDistanceInches: number
  zone: number
  score: number
}

const BASEBALL_RADIUS = 1.45 // inches (2.9" diameter)

// Strike zone boundaries in feet
const ZONE_LEFT = -17 / 24
const ZONE_RIGHT = 17 / 24
const ZONE_BOT = 1.5
const ZONE_TOP = 3.5

// Center box: ±2" from zone center (x=0, z=2.5ft) → 4×4" box
const CENTER_X = 0 // feet
const CENTER_Z = 2.5 // feet
const CENTER_HALF = 2 // inches

/** Check if pitch lands in the 4×4" center box (zone center ±2"). */
export function isInCenterBox(plate_x: number, plate_z: number): boolean {
  const dx = Math.abs(plate_x - CENTER_X) * 12
  const dz = Math.abs(plate_z - CENTER_Z) * 12
  return dx <= CENTER_HALF && dz <= CENTER_HALF
}

/** Distance in inches from pitch to nearest strike zone edge. Returns 0 if inside zone. */
export function distanceOutsideZone(plate_x: number, plate_z: number): number {
  // All in feet first
  const dx = Math.max(0, ZONE_LEFT - plate_x, plate_x - ZONE_RIGHT)
  const dz = Math.max(0, ZONE_BOT - plate_z, plate_z - ZONE_TOP)
  return Math.sqrt(dx * dx + dz * dz) * 12 // convert to inches
}

/**
 * Score a single pitch based on target vs actual location.
 *
 * Edge distance = max(0, centerDistance - baseballRadius)
 *
 * Tiers (evaluated in order):
 * 1. Actual in 4×4" center box → 0
 * 2. Edge distance ≤ 2" → 100
 * 3. Edge distance ≤ 4" → 75
 * 4. Edge distance ≤ 6" AND not >4" outside zone → 50
 * 5. Edge distance ≤ 8" AND not >4" outside zone → 25
 * 6. Everything else → 0
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
  const edgeDistanceInches = Math.max(0, distanceInches - BASEBALL_RADIUS)

  const outsideDist = distanceOutsideZone(actual.plate_x, actual.plate_z)
  const tooFarOutside = outsideDist > 4

  let score: number

  if (isInCenterBox(actual.plate_x, actual.plate_z)) {
    score = 0
  } else if (edgeDistanceInches <= 2) {
    score = 100
  } else if (edgeDistanceInches <= 4) {
    score = 75
  } else if (edgeDistanceInches <= 6 && !tooFarOutside) {
    score = 50
  } else if (edgeDistanceInches <= 8 && !tooFarOutside) {
    score = 25
  } else {
    score = 0
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
