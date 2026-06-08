import { z } from 'zod'

/**
 * Zod schema for rows returned by /api/movement-percentiles.
 */
export const MovementPercentilesRowSchema = z.object({
  pitch_type: z.string(),
  hb_breakpoints: z.array(z.number()).nullable(),
  ivb_breakpoints: z.array(z.number()).nullable(),
  n_qualified: z.number(),
  pool_avg_hb: z.number().nullable(),
  pool_avg_ivb: z.number().nullable(),
}).passthrough()

export type MovementPercentilesRow = z.infer<typeof MovementPercentilesRowSchema>

/**
 * Validate movement-percentiles rows.
 * On failure: logs the error and returns the raw data (graceful degradation).
 */
export function parseMovementPercentilesRows(rows: unknown[]): unknown[] {
  try {
    return z.array(MovementPercentilesRowSchema).parse(rows)
  } catch (err) {
    console.warn('[schema] movementPercentiles validation failed:', err instanceof z.ZodError ? err.issues.slice(0, 3) : err)
    return rows
  }
}
