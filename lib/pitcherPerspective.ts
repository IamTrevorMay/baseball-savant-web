/**
 * Pitcher's Perspective Conversion
 *
 * Statcast stores plate_x and pfx_x in catcher's perspective:
 *   positive = toward 1B (catcher's right)
 *
 * Baseball Savant's movement profile uses pitcher's perspective:
 *   positive = toward 3B (arm-side for RHP)
 *   negative = toward 1B (glove-side for RHP)
 *
 * This module converts display values to pitcher's perspective.
 * Raw data remains in Statcast convention — only visualization is negated.
 */

/** Negate a single x-value from catcher to pitcher perspective */
export function toPitcherX(v: number): number {
  return -v
}

/** Negate zone coordinate maps (returns new object) */
export function toPitcherZoneCoords<T extends Record<number, { x: number; z: number }>>(
  coords: T
): T {
  const result = {} as Record<number, { x: number; z: number }>
  for (const [key, val] of Object.entries(coords)) {
    result[Number(key)] = { x: -val.x, z: val.z }
  }
  return result as T
}

// Axis label constants — no longer reference "Catcher View"
export const PITCH_LOC_X_TITLE = 'Horizontal (ft)'
export const MOVEMENT_X_TITLE = 'Horizontal Break (in)'
export const RELEASE_X_TITLE = 'Horizontal (ft)'
