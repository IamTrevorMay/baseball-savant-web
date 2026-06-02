import { describe, it, expect } from 'vitest'
import {
  computePlus,
  computeCommandPlus,
  computeRPComPlus,
  plusToPercentile,
  valueToPercentile,
  empiricalPercentile,
  percentileColor,
  getLeagueBaseline,
  computeYearWeightedPlus,
  normalCDF,
  COMMAND_WEIGHTS,
  RPCOM_WEIGHTS,
} from '@/lib/leagueStats'

// ── computePlus ──────────────────────────────────────────────────────────────

describe('computePlus', () => {
  it('returns 100 for league average', () => {
    expect(computePlus(90, 90, 2)).toBe(100)
  })

  it('returns 115 for 1 stddev above', () => {
    expect(computePlus(92, 90, 2)).toBe(115)
  })

  it('returns 85 for 1 stddev below', () => {
    expect(computePlus(88, 90, 2)).toBe(85)
  })

  it('handles fractional values', () => {
    // 0.5 stddev above → 107.5
    expect(computePlus(91, 90, 2)).toBe(107.5)
  })

  it('returns Infinity when stddev is zero (division by zero)', () => {
    // This documents the current behavior — no guard against zero stddev
    const result = computePlus(91, 90, 0)
    expect(result).toBe(Infinity)
  })
})

// ── normalCDF ────────────────────────────────────────────────────────────────

describe('normalCDF', () => {
  it('returns ~0.5 for z=0', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 4)
  })

  it('returns ~0.8413 for z=1', () => {
    expect(normalCDF(1)).toBeCloseTo(0.8413, 3)
  })

  it('returns ~0.1587 for z=-1', () => {
    expect(normalCDF(-1)).toBeCloseTo(0.1587, 3)
  })

  it('returns ~0.9772 for z=2', () => {
    expect(normalCDF(2)).toBeCloseTo(0.9772, 3)
  })
})

// ── plusToPercentile ─────────────────────────────────────────────────────────

describe('plusToPercentile', () => {
  it('returns ~50 for plus=100', () => {
    expect(plusToPercentile(100)).toBe(50)
  })

  it('returns ~84 for plus=110 (1 stddev)', () => {
    // z = (110-100)/10 = 1.0 → normalCDF(1) ≈ 0.8413 → 84
    expect(plusToPercentile(110)).toBe(84)
  })

  it('returns ~16 for plus=90 (-1 stddev)', () => {
    expect(plusToPercentile(90)).toBe(16)
  })

  it('clamps extreme high values to 99', () => {
    expect(plusToPercentile(200)).toBeLessThanOrEqual(99)
  })

  it('clamps extreme low values to 1', () => {
    expect(plusToPercentile(0)).toBeGreaterThanOrEqual(1)
  })
})

// ── valueToPercentile ────────────────────────────────────────────────────────

describe('valueToPercentile', () => {
  it('returns ~50 when value equals mean (higherBetter=true)', () => {
    expect(valueToPercentile(90, 90, 2, true)).toBe(50)
  })

  it('returns high percentile when above mean (higherBetter=true)', () => {
    const pct = valueToPercentile(92, 90, 2, true)
    expect(pct).toBeGreaterThan(70)
  })

  it('returns low percentile when above mean (higherBetter=false)', () => {
    // For "lower is better" stats (like ERA), being above mean is bad
    const pct = valueToPercentile(92, 90, 2, false)
    expect(pct).toBeLessThan(30)
  })

  it('returns 50 when stddev is 0', () => {
    expect(valueToPercentile(92, 90, 0, true)).toBe(50)
  })

  it('returns 50 when stddev is negative', () => {
    expect(valueToPercentile(92, 90, -1, true)).toBe(50)
  })
})

// ── computeCommandPlus ───────────────────────────────────────────────────────

describe('computeCommandPlus', () => {
  it('returns 100 when all components are 100', () => {
    expect(computeCommandPlus(100, 100, 100)).toBe(100)
  })

  it('returns correct weighted sum', () => {
    // 120*0.60 + 110*0.17 + 90*0.23 = 72 + 18.7 + 20.7 = 111.4 → 111
    expect(computeCommandPlus(120, 110, 90)).toBe(111)
  })

  it('weights sum to 1.0', () => {
    const sum = COMMAND_WEIGHTS.brinkPlus + COMMAND_WEIGHTS.clusterPlus + COMMAND_WEIGHTS.missfirePlus
    expect(sum).toBeCloseTo(1.0, 10)
  })
})

// ── computeRPComPlus ─────────────────────────────────────────────────────────

describe('computeRPComPlus', () => {
  it('returns 100 when all components are 100', () => {
    expect(computeRPComPlus(100, 100, 100, 100, 100)).toBe(100)
  })

  it('returns correct weighted sum', () => {
    // 120*0.31 + 110*0.16 + 105*0.09 + 95*0.15 + 80*0.29
    // = 37.2 + 17.6 + 9.45 + 14.25 + 23.2 = 101.7 → 102
    expect(computeRPComPlus(120, 110, 105, 95, 80)).toBe(102)
  })

  it('weights sum to 1.0', () => {
    const sum = RPCOM_WEIGHTS.brinkPlus + RPCOM_WEIGHTS.clusterPlus +
      RPCOM_WEIGHTS.hdevPlus + RPCOM_WEIGHTS.vdevPlus + RPCOM_WEIGHTS.missfirePlus
    expect(sum).toBeCloseTo(1.0, 10)
  })
})

// ── empiricalPercentile ──────────────────────────────────────────────────────

describe('empiricalPercentile', () => {
  // 99-element breakpoints: p1=80, p2=81, ..., p99=178
  const breakpoints = Array.from({ length: 99 }, (_, i) => 80 + i)

  it('returns 1 for values below all breakpoints (higherBetter=true)', () => {
    expect(empiricalPercentile(70, breakpoints, true)).toBe(1)
  })

  it('returns 99 for values above all breakpoints (higherBetter=true)', () => {
    expect(empiricalPercentile(200, breakpoints, true)).toBe(99)
  })

  it('returns correct position for exact match', () => {
    // breakpoints[49] = 129 → 50 values ≤ 129 → rawPct = 50
    expect(empiricalPercentile(129, breakpoints, true)).toBe(50)
  })

  it('inverts for higherBetter=false', () => {
    // rawPct=50 → 100-50=50 (still 50 at midpoint)
    expect(empiricalPercentile(129, breakpoints, false)).toBe(50)
    // rawPct=99 → 100-99=1
    expect(empiricalPercentile(200, breakpoints, false)).toBe(1)
    // rawPct=1 → 100-1=99
    expect(empiricalPercentile(70, breakpoints, false)).toBe(99)
  })

  it('clamps to 1-99 range', () => {
    expect(empiricalPercentile(-1000, breakpoints, true)).toBe(1)
    expect(empiricalPercentile(1000, breakpoints, true)).toBe(99)
  })
})

// ── percentileColor ──────────────────────────────────────────────────────────

describe('percentileColor', () => {
  it('returns blue-ish for pct=0', () => {
    const color = percentileColor(0)
    expect(color).toBe('rgb(50,80,220)')
  })

  it('returns gray for pct=50', () => {
    const color = percentileColor(50)
    expect(color).toBe('rgb(200,200,200)')
  })

  it('returns red-ish for pct=100', () => {
    const color = percentileColor(100)
    expect(color).toBe('rgb(230,60,50)')
  })

  it('always returns a valid rgb string', () => {
    for (const pct of [0, 10, 25, 50, 75, 90, 100]) {
      expect(percentileColor(pct)).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    }
  })
})

// ── getLeagueBaseline ────────────────────────────────────────────────────────

describe('getLeagueBaseline', () => {
  it('returns exact year match', () => {
    const result = getLeagueBaseline('brink', '4-Seam Fastball', 2015)
    expect(result).toBeDefined()
    expect(result!.mean).toBe(-0.90)
    expect(result!.stddev).toBe(0.71)
  })

  it('falls back to nearest year', () => {
    // 2027 doesn't exist, should fall back to 2026
    const result = getLeagueBaseline('brink', '4-Seam Fastball', 2027)
    expect(result).toBeDefined()
    // Should get data from the nearest available year (2026)
    expect(result!.mean).toBeDefined()
  })

  it('returns average across years when no year specified', () => {
    const result = getLeagueBaseline('brink', '4-Seam Fastball')
    expect(result).toBeDefined()
    // Average should be between min and max of individual years
    expect(result!.mean).toBeLessThan(0)
  })

  it('returns undefined for unknown pitch name', () => {
    expect(getLeagueBaseline('brink', 'Fake Pitch', 2020)).toBeUndefined()
  })

  it('returns undefined for unknown metric', () => {
    expect(getLeagueBaseline('fake_metric' as any, '4-Seam Fastball', 2020)).toBeUndefined()
  })
})

// ── computeYearWeightedPlus ──────────────────────────────────────────────────

describe('computeYearWeightedPlus', () => {
  it('computes for single year group', () => {
    const pitches = [
      { game_year: 2020 },
      { game_year: 2020 },
      { game_year: 2020 },
    ]
    const result = computeYearWeightedPlus(
      pitches,
      '4-Seam Fastball',
      'brink',
      () => -1.05, // exactly the 2020 mean
      false
    )
    expect(result).toBe(100) // league average → 100
  })

  it('returns null when all values are null', () => {
    const pitches = [{ game_year: 2020 }]
    const result = computeYearWeightedPlus(
      pitches,
      '4-Seam Fastball',
      'brink',
      () => null,
      false
    )
    expect(result).toBeNull()
  })

  it('returns null for empty array', () => {
    const result = computeYearWeightedPlus(
      [],
      '4-Seam Fastball',
      'brink',
      () => 0,
      false
    )
    expect(result).toBeNull()
  })

  it('inverts correctly', () => {
    const pitches = [
      { game_year: 2020 },
      { game_year: 2020 },
    ]
    // Value 1 stddev above mean → plus=115. With invert: 100-(115-100)=85
    const baseline = getLeagueBaseline('brink', '4-Seam Fastball', 2020)!
    const aboveMean = baseline.mean + baseline.stddev
    const result = computeYearWeightedPlus(
      pitches,
      '4-Seam Fastball',
      'brink',
      () => aboveMean,
      true
    )
    expect(result).toBe(85)
  })

  it('usage-weights across years', () => {
    // More pitches in 2020 → result should be closer to 2020's plus
    const pitches = [
      ...Array(100).fill({ game_year: 2020 }),
      ...Array(10).fill({ game_year: 2019 }),
    ]
    const baseline2020 = getLeagueBaseline('brink', '4-Seam Fastball', 2020)!
    const result = computeYearWeightedPlus(
      pitches,
      '4-Seam Fastball',
      'brink',
      () => baseline2020.mean, // exactly 2020 mean
      false
    )
    // Heavy weight on 2020 → close to 100
    expect(result).toBeDefined()
    expect(result!).toBeGreaterThan(95)
    expect(result!).toBeLessThan(105)
  })
})
