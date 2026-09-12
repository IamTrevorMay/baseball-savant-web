import { describe, it, expect } from 'vitest'
import { parsePeriodParams, periodWhereSql } from '@/lib/reports/periodFilter'

const parse = (qs: string) => parsePeriodParams(new URLSearchParams(qs))

describe('parsePeriodParams', () => {
  it('treats no params as the full history', () => {
    expect(parse('')).toEqual({ period: { years: [], startDate: null, endDate: null } })
  })

  it('reads a csv of seasons, deduped and sorted', () => {
    expect(parse('years=2026,2024,2026')).toEqual({ period: { years: [2024, 2026], startDate: null, endDate: null } })
  })

  it('still accepts the legacy single year param', () => {
    expect(parse('year=2025')).toEqual({ period: { years: [2025], startDate: null, endDate: null } })
  })

  it('reads a date range', () => {
    expect(parse('startDate=2026-04-01&endDate=2026-09-10')).toEqual({
      period: { years: [], startDate: '2026-04-01', endDate: '2026-09-10' },
    })
  })

  it('rejects anything that is not a plain four-digit year', () => {
    expect(parse('years=2025;DROP TABLE pitches')).toEqual({ error: 'Invalid year' })
    expect(parse('years=25')).toEqual({ error: 'Invalid year' })
    expect(parse('year=2025abc')).toEqual({ error: 'Invalid year' })
  })

  it('rejects malformed and impossible dates', () => {
    expect(parse("startDate=2026-04-01'--")).toEqual({ error: 'Invalid startDate' })
    expect(parse('endDate=2026-02-30')).toEqual({ error: 'Invalid endDate' })
    expect(parse('endDate=04/01/2026')).toEqual({ error: 'Invalid endDate' })
  })
})

describe('periodWhereSql', () => {
  it('is empty for the full history', () => {
    expect(periodWhereSql({ years: [], startDate: null, endDate: null })).toBe('')
  })

  it('combines seasons and dates with the table prefix', () => {
    expect(periodWhereSql({ years: [2025, 2026], startDate: '2025-06-01', endDate: '2026-09-10' }, 'p.')).toBe(
      " AND p.game_year IN (2025,2026) AND p.game_date >= '2025-06-01' AND p.game_date <= '2026-09-10'",
    )
  })
})
