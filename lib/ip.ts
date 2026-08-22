/**
 * Innings pitched — one definition, two representations.
 *
 * Triton had four incompatible IP implementations. They are unified here:
 *
 *   OUTS are the canonical unit. A double play retires two runners, a triple play three.
 *   DECIMAL (203.67) is the compute representation — safe to sum, average and compare.
 *   BASE-3  (203.2)  is the display representation — "203 innings and 2 outs", the
 *                    convention every box score uses.
 *
 * The two are NOT interchangeable and must never be mixed in one column. Base-3 cannot be
 * summed or averaged arithmetically: 203.2 + 0.2 is 204.1, not 203.4.
 */

/** Out-events → outs. Shared by every IP computation. */
export const OUT_EVENTS_SINGLE = [
  'strikeout', 'field_out', 'force_out', 'fielders_choice',
  'fielders_choice_out', 'sac_fly', 'sac_bunt',
] as const

export const OUT_EVENTS_DOUBLE = [
  'strikeout_double_play', 'double_play',
  'grounded_into_double_play', 'sac_fly_double_play',
] as const

/** Outs recorded by a single `events` value. Returns 0 for non-outs. */
export function outsForEvent(event: string | null | undefined): number {
  if (!event) return 0
  const e = String(event)
  if ((OUT_EVENTS_DOUBLE as readonly string[]).includes(e)) return 2
  if (e === 'triple_play') return 3
  if ((OUT_EVENTS_SINGLE as readonly string[]).includes(e)) return 1
  return 0
}

/** Outs → base-3 display string, e.g. 611 outs → "203.2". */
export function outsToDisplayIP(outs: number): string {
  const o = Math.max(0, Math.round(outs))
  return `${Math.floor(o / 3)}.${o % 3}`
}

/** Outs → decimal innings for arithmetic, e.g. 611 → 203.667. */
export function outsToDecimalIP(outs: number): number {
  return Math.max(0, outs) / 3
}

/**
 * Parse an IP value back to outs.
 *
 * Accepts base-3 ("203.2") and decimal (203.67) and distinguishes them: a fractional part
 * of .0/.1/.2 is base-3, anything else is decimal. This matters because the totals row used
 * to split on "." unconditionally, so a decimal 203.7 was read as 203 innings + 7 outs.
 */
export function ipToOuts(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  if (!Number.isFinite(n) || n < 0) return 0

  const whole = Math.floor(n)
  const frac = Math.round((n - whole) * 10) / 10

  // .0 / .1 / .2 is unambiguously base-3 notation.
  if (frac === 0 || frac === 0.1 || frac === 0.2) {
    return whole * 3 + Math.round(frac * 10)
  }
  // Anything else must be decimal innings.
  return Math.round(n * 3)
}
