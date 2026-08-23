import { describe, it, expect } from 'vitest'
import { computePlus, plusToPercentile, PLUS_SCALE_SD } from '@/lib/leagueStats'
import { getCellColor, calcTotalsFromRegistry } from '@/lib/metricRegistry'
import { ipToOuts, outsToDisplayIP, outsForEvent } from '@/lib/ip'

/**
 * Regression tests for the 2026-08-22 metrics audit fixes.
 * Each case fails against the pre-fix implementation.
 */

describe('plus-stat scale (audit step 21)', () => {
  it('round-trips one standard deviation to the 84th percentile, not the 93rd', () => {
    // computePlus scales by 15; plusToPercentile used to divide by a hardcoded 10,
    // inflating z by 1.5x and reporting 93 for a genuine +1 SD.
    const plus = computePlus(11, 10, 1) // exactly +1 SD
    expect(plus).toBe(100 + PLUS_SCALE_SD)
    expect(plusToPercentile(plus)).toBe(84)
  })

  it('agrees with the producer scale at -1 SD', () => {
    expect(plusToPercentile(computePlus(9, 10, 1))).toBe(16)
  })

  it('honours an explicit sd for metrics on a different scale', () => {
    // Stuff+ measures ~6.1 points per SD, so the default would overstate its percentile.
    expect(plusToPercentile(106.1, 6.1)).toBe(84)
  })

  it('returns the neutral 50 for a non-positive sd rather than NaN', () => {
    expect(plusToPercentile(115, 0)).toBe(50)
  })
})

describe('null-vs-zero colouring (audit step 22)', () => {
  const plusKey = 'sos' // the registry's ColorSpec mode 'plus' entry

  it('colours a missing plus-stat neutral, not below-average', () => {
    // Number(null) === 0 cleared the old isNaN guard, so a missing value took the
    // "below 100" branch and rendered in the same colour as a genuinely poor one.
    expect(getCellColor(plusKey, null)).toBe('text-zinc-400')
    expect(getCellColor(plusKey, undefined)).toBe('text-zinc-400')
    expect(getCellColor(plusKey, '')).toBe('text-zinc-400')
    expect(getCellColor(plusKey, '—')).toBe('text-zinc-400')
  })

  it('still colours a real value', () => {
    expect(getCellColor(plusKey, 120)).not.toBe('text-zinc-400')
    expect(getCellColor(plusKey, 80)).not.toBe('text-zinc-400')
  })

  it('distinguishes a real zero from a missing value', () => {
    expect(getCellColor(plusKey, 0)).not.toBe(getCellColor(plusKey, null))
  })
})

describe('innings pitched (audit step 9)', () => {
  it('counts outs, not out-events', () => {
    expect(outsForEvent('strikeout')).toBe(1)
    expect(outsForEvent('grounded_into_double_play')).toBe(2)
    expect(outsForEvent('triple_play')).toBe(3)
    expect(outsForEvent('single')).toBe(0)
    expect(outsForEvent(null)).toBe(0)
  })

  it('formats outs as base-3 innings', () => {
    expect(outsToDisplayIP(611)).toBe('203.2')
    expect(outsToDisplayIP(3)).toBe('1.0')
  })

  it('parses base-3 without mistaking it for decimal', () => {
    expect(ipToOuts('203.2')).toBe(611)
    expect(ipToOuts('1.0')).toBe(3)
  })

  it('parses decimal innings, which splitting on "." used to corrupt', () => {
    // '203.7' was read as 203 innings + 7 outs = 616. It is 203.67 innings = 611 outs.
    expect(ipToOuts(203.7)).toBe(611)
    expect(ipToOuts('203.7')).toBe(611)
  })
})

describe('weighted totals (audit step 10)', () => {
  it('weights a rate by its denominator instead of averaging seasons equally', () => {
    // A 20-PA season at .400 and a 600-PA season at .270 pool to ~.274, not .335.
    const rows = [
      { year: 2024, ba: '0.400', pa: 20 },
      { year: 2025, ba: '0.270', pa: 600 },
    ]
    const totals = calcTotalsFromRegistry(rows, ['ba'])
    expect(Number(totals.ba)).toBeCloseTo((0.4 * 20 + 0.27 * 600) / 620, 3)
    expect(Number(totals.ba)).toBeLessThan(0.28)
  })

  it('renders an em dash when no usable weight exists rather than a wrong number', () => {
    const rows = [
      { year: 2024, ba: '0.400', pa: 0 },
      { year: 2025, ba: '0.270', pa: null },
    ]
    expect(calcTotalsFromRegistry(rows, ['ba']).ba).toBe('—')
  })
})
