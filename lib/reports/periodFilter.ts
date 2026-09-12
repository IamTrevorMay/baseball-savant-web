// Time-period params shared by /api/player-data and /api/milb/player-data.
// Values are interpolated into SQL, so every one is validated here first.

export interface Period {
  years: number[]
  startDate: string | null
  endDate: string | null
}

const YEAR_RE = /^\d{4}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
function isIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/**
 * Reads `years` (csv), the legacy single `year`, `startDate` and `endDate`.
 * All are optional; an empty period means the player's full history.
 */
export function parsePeriodParams(params: URLSearchParams): { period: Period } | { error: string } {
  const parts = [params.get('years'), params.get('year')]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const years: number[] = []
  for (const part of parts) {
    if (!YEAR_RE.test(part)) return { error: 'Invalid year' }
    years.push(Number(part))
  }

  const startDate = params.get('startDate') || null
  const endDate = params.get('endDate') || null
  if (startDate && !isIsoDate(startDate)) return { error: 'Invalid startDate' }
  if (endDate && !isIsoDate(endDate)) return { error: 'Invalid endDate' }

  return { period: { years: [...new Set(years)].sort(), startDate, endDate } }
}

/** SQL `AND …` clauses for a validated period. `prefix` is a table alias like `p.`. */
export function periodWhereSql(period: Period, prefix = ''): string {
  let sql = ''
  if (period.years.length) sql += ` AND ${prefix}game_year IN (${period.years.join(',')})`
  if (period.startDate) sql += ` AND ${prefix}game_date >= '${period.startDate}'`
  if (period.endDate) sql += ` AND ${prefix}game_date <= '${period.endDate}'`
  return sql
}
