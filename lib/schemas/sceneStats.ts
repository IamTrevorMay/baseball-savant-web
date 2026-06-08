import { z } from 'zod'

const nn = z.number().nullable()

/**
 * Zod schema for individual player stat rows returned by /api/scene-stats.
 * Flexible: the metrics requested vary per call, so we validate the core
 * identifying fields and allow extra metric columns through.
 */
export const SceneStatsRowSchema = z.object({
  player_id: z.number(),
  player_name: z.string().nullable().optional(),
}).passthrough()

/**
 * Schema for the leaderboard mode response shape.
 */
export const SceneStatsLeaderboardRowSchema = z.object({
  player_id: z.number(),
  player_name: z.string().nullable().optional(),
  rank: z.number().optional(),
}).passthrough()

export type SceneStatsRow = z.infer<typeof SceneStatsRowSchema>

/**
 * Validate scene-stats rows.
 * On failure: logs the error and returns the raw data (graceful degradation).
 */
export function parseSceneStatsRows(rows: unknown[]): unknown[] {
  try {
    return z.array(SceneStatsRowSchema).parse(rows)
  } catch (err) {
    console.warn('[schema] sceneStats validation failed:', err instanceof z.ZodError ? err.issues.slice(0, 3) : err)
    return rows
  }
}
