/**
 * Time-zone-correct calendar-date helpers.
 *
 * Avoids the common bug `new Date(d.toLocaleString('en-US', { timeZone })).toISOString()`,
 * which double-converts (parses a tz-wall-clock string as server-local, then re-applies
 * the UTC offset) and can land on the wrong calendar day. Reading Intl parts is exact.
 */

/** YYYY-MM-DD for an instant in an IANA time zone (default America/New_York). */
export function ymdInTimeZone(date: Date = new Date(), timeZone = 'America/New_York'): string {
  // en-CA formats as YYYY-MM-DD directly.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** YYYY-MM-DD from a Date's LOCAL components (browser-local) — no UTC day-shift.
 *  Use for client-side calendar/day grouping where you want the user's local date. */
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Add n calendar days to a YYYY-MM-DD string (pure calendar math, tz-agnostic). */
export function addDaysToYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10) // dt is UTC-midnight, so this is the calendar date
}
