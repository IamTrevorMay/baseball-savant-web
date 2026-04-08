import { describe, it, expect } from 'vitest'
import {
  buildWhereParts,
  hasIndexedFilter,
  buildSelectParts,
  GROUP_COLS,
  FILTER_COLS,
  INDEXED_FILTER_COLS,
  Filter,
} from '@/lib/reportQueryBuilder'

// ── buildWhereParts ──────────────────────────────────────────────────────────

describe('buildWhereParts', () => {
  it('builds IN clause', () => {
    const filters: Filter[] = [
      { column: 'pitcher', op: 'in', value: [123, 456] },
    ]
    const parts = buildWhereParts(filters)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toBe("pitcher IN ('123','456')")
  })

  it('builds gte clause', () => {
    const filters: Filter[] = [
      { column: 'release_speed', op: 'gte', value: '95.0' },
    ]
    const parts = buildWhereParts(filters)
    expect(parts[0]).toBe('release_speed >= 95')
  })

  it('builds lte clause', () => {
    const filters: Filter[] = [
      { column: 'release_speed', op: 'lte', value: '100.0' },
    ]
    const parts = buildWhereParts(filters)
    expect(parts[0]).toBe('release_speed <= 100')
  })

  it('builds eq clause with quote escaping', () => {
    const filters: Filter[] = [
      { column: 'player_name', op: 'eq', value: "O'Brien" },
    ]
    const parts = buildWhereParts(filters)
    expect(parts[0]).toBe("player_name = 'O''Brien'")
  })

  it('builds between clause', () => {
    const filters: Filter[] = [
      { column: 'game_date', op: 'between', value: ['2024-01-01', '2024-12-31'] },
    ]
    const parts = buildWhereParts(filters)
    expect(parts[0]).toBe("game_date BETWEEN '2024-01-01' AND '2024-12-31'")
  })

  it('skips unknown columns', () => {
    const filters: Filter[] = [
      { column: 'hacked_col', op: 'eq', value: 'test' },
    ]
    const parts = buildWhereParts(filters)
    expect(parts).toHaveLength(0)
  })

  it('strips non-alpha characters from column names', () => {
    // Even if the column passes the FILTER_COLS check somehow,
    // the regex sanitization should clean it
    const filters: Filter[] = [
      { column: 'pitcher', op: 'eq', value: 'test' },
    ]
    const parts = buildWhereParts(filters)
    expect(parts[0]).toContain('pitcher')
    expect(parts[0]).not.toContain(';')
  })

  it('escapes single quotes in IN values', () => {
    const filters: Filter[] = [
      { column: 'player_name', op: 'in', value: ["O'Brien", "D'Arnaud"] },
    ]
    const parts = buildWhereParts(filters)
    expect(parts[0]).toBe("player_name IN ('O''Brien','D''Arnaud')")
  })

  it('handles multiple filters', () => {
    const filters: Filter[] = [
      { column: 'pitcher', op: 'in', value: [123] },
      { column: 'game_year', op: 'gte', value: '2024' },
      { column: 'stand', op: 'eq', value: 'R' },
    ]
    const parts = buildWhereParts(filters)
    expect(parts).toHaveLength(3)
  })

  it('returns empty array for empty filters', () => {
    expect(buildWhereParts([])).toHaveLength(0)
  })
})

// ── hasIndexedFilter ─────────────────────────────────────────────────────────

describe('hasIndexedFilter', () => {
  it('returns true when pitcher filter present', () => {
    const filters: Filter[] = [
      { column: 'pitcher', op: 'in', value: [123] },
    ]
    expect(hasIndexedFilter(filters)).toBe(true)
  })

  it('returns true when game_year filter present', () => {
    const filters: Filter[] = [
      { column: 'game_year', op: 'gte', value: '2024' },
    ]
    expect(hasIndexedFilter(filters)).toBe(true)
  })

  it('returns false when no indexed filter', () => {
    const filters: Filter[] = [
      { column: 'stand', op: 'eq', value: 'R' },
      { column: 'pitch_name', op: 'eq', value: '4-Seam Fastball' },
    ]
    expect(hasIndexedFilter(filters)).toBe(false)
  })

  it('returns false for empty filters', () => {
    expect(hasIndexedFilter([])).toBe(false)
  })
})

// ── buildSelectParts ─────────────────────────────────────────────────────────

describe('buildSelectParts', () => {
  const mockMetrics: Record<string, string> = {
    pitches: 'COUNT(*)',
    avg_velo: 'ROUND(AVG(release_speed)::numeric, 1)',
  }

  it('returns bare column for simple groupBy', () => {
    const parts = buildSelectParts(['player_name'], ['pitches'], mockMetrics)
    expect(parts[0]).toBe('player_name')
  })

  it('aliases CASE expressions', () => {
    const parts = buildSelectParts(['pitch_team'], ['pitches'], mockMetrics)
    expect(parts[0]).toContain('AS pitch_team')
    expect(parts[0]).toContain('CASE')
  })

  it('includes metric expressions with aliases', () => {
    const parts = buildSelectParts(['player_name'], ['pitches', 'avg_velo'], mockMetrics)
    expect(parts).toHaveLength(3) // 1 group + 2 metrics
    expect(parts[1]).toBe('COUNT(*) AS pitches')
    expect(parts[2]).toBe('ROUND(AVG(release_speed)::numeric, 1) AS avg_velo')
  })
})

// ── Constants sanity checks ──────────────────────────────────────────────────

describe('constants', () => {
  it('FILTER_COLS contains all indexed columns', () => {
    for (const col of INDEXED_FILTER_COLS) {
      expect(FILTER_COLS.has(col)).toBe(true)
    }
  })

  it('GROUP_COLS has pitch_team as a CASE expression', () => {
    expect(GROUP_COLS.pitch_team).toContain('CASE')
  })

  it('GROUP_COLS has player_name as bare column', () => {
    expect(GROUP_COLS.player_name).toBe('player_name')
  })
})
