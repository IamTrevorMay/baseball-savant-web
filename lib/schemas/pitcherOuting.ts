import { z } from 'zod'

const nn = z.number().nullable()

/**
 * Zod schema for pitch rows returned by the pitcher-outing query.
 */
export const PitcherOutingPitchSchema = z.object({
  pitch_name: z.string().nullable(),
  pitch_type: z.string().nullable(),
  description: z.string().nullable(),
  stuff_plus: nn,
  p_throws: z.string().nullable(),
  stand: z.string().nullable(),
  release_speed: nn,
  pfx_x: nn,
  pfx_z: nn,
  release_spin_rate: nn,
  spin_axis: nn,
  release_extension: nn,
  release_pos_x: nn,
  release_pos_z: nn,
  arm_angle: nn,
  plate_x: nn,
  plate_z: nn,
  sz_top: nn,
  sz_bot: nn,
  zone: nn,
  vx0: nn,
  vy0: nn,
  vz0: nn,
  ax: nn,
  ay: nn,
  az: nn,
  game_year: z.number(),
  game_date: z.string(),
  inning_topbot: z.string().nullable(),
  home_team: z.string().nullable(),
  away_team: z.string().nullable(),
}).passthrough()

export type PitcherOutingPitch = z.infer<typeof PitcherOutingPitchSchema>

/**
 * Validate pitcher-outing pitch rows.
 * On failure: logs the error and returns the raw data (graceful degradation).
 */
export function parsePitcherOutingRows(rows: unknown[]): unknown[] {
  try {
    return z.array(PitcherOutingPitchSchema).parse(rows)
  } catch (err) {
    console.warn('[schema] pitcherOuting validation failed:', err instanceof z.ZodError ? err.issues.slice(0, 3) : err)
    return rows
  }
}
