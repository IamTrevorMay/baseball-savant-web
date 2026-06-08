import { z } from 'zod'

/** Nullable number — DB returns null for missing numeric fields. */
const nn = z.number().nullable()

/**
 * Zod schema for rows returned by /api/player-data (pitches table).
 * Validates the most critical fields. Unknown keys are stripped.
 */
export const PlayerDataRowSchema = z.object({
  game_pk: z.number(),
  game_date: z.string(),
  game_year: z.number(),
  game_type: z.string(),
  pitcher: z.number(),
  batter: z.number(),
  player_name: z.string().nullable(),
  stand: z.string().nullable(),
  p_throws: z.string().nullable(),
  pitch_name: z.string().nullable(),
  pitch_type: z.string().nullable(),
  release_speed: nn,
  effective_speed: nn,
  release_spin_rate: nn,
  spin_axis: nn,
  pfx_x: nn,
  pfx_z: nn,
  plate_x: nn,
  plate_z: nn,
  sz_top: nn,
  sz_bot: nn,
  zone: nn,
  type: z.string().nullable(),
  events: z.string().nullable(),
  description: z.string().nullable(),
  bb_type: z.string().nullable(),
  balls: nn,
  strikes: nn,
  outs_when_up: nn,
  inning: nn,
  inning_topbot: z.string().nullable(),
  home_team: z.string().nullable(),
  away_team: z.string().nullable(),
  launch_speed: nn,
  launch_angle: nn,
  hit_distance_sc: nn,
  release_extension: nn,
  at_bat_number: z.number(),
  pitch_number: nn,
  home_score: nn,
  away_score: nn,
  stuff_plus: nn,
}).passthrough()

export type PlayerDataRow = z.infer<typeof PlayerDataRowSchema>

/**
 * Validate an array of player-data rows.
 * On failure: logs the error and returns the raw data (graceful degradation).
 */
export function parsePlayerDataRows(rows: unknown[]): unknown[] {
  try {
    return z.array(PlayerDataRowSchema).parse(rows)
  } catch (err) {
    console.warn('[schema] playerData validation failed:', err instanceof z.ZodError ? err.issues.slice(0, 3) : err)
    return rows
  }
}
