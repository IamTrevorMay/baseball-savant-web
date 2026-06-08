import { describe, it, expect } from 'vitest'
import { computeFIP, computeXERA, computeWRCPlus } from '@/lib/sql'

// ── computeFIP ───────────────────────────────────────────────────────────────

describe('computeFIP', () => {
  it('computes FIP with normal inputs', () => {
    // 200K, 50BB, 5HBP, 20HR, 180IP, cFIP=3.10
    const result = computeFIP(
      { k: 200, bb: 50, hbp: 5, hr: 20, ip: 180 },
      { cfip: 3.10 }
    )
    expect(result).not.toBeNull()
    // (13*20 + 3*(50+5) - 2*200) / 180 + 3.10
    // (260 + 165 - 400) / 180 + 3.10 = 25/180 + 3.10 = 0.1389 + 3.10 = 3.24
    expect(result).toBeCloseTo(3.24, 1)
  })

  it('returns null when ip is 0', () => {
    expect(computeFIP({ k: 10, bb: 5, hbp: 1, hr: 2, ip: 0 }, { cfip: 3.10 })).toBeNull()
  })

  it('returns null when ip is null/undefined', () => {
    expect(computeFIP({ k: 10, bb: 5, hbp: 1, hr: 2, ip: null }, { cfip: 3.10 })).toBeNull()
  })

  it('handles string numeric values from DB', () => {
    const result = computeFIP(
      { k: '200', bb: '50', hbp: '5', hr: '20', ip: '180' },
      { cfip: 3.10 }
    )
    expect(result).toBeCloseTo(3.24, 1)
  })

  it('treats null components as zero', () => {
    // All nulls except ip
    const result = computeFIP(
      { k: null, bb: null, hbp: null, hr: null, ip: 10 },
      { cfip: 3.10 }
    )
    expect(result).not.toBeNull()
    // (13*0 + 3*0 - 2*0) / 10 + 3.10 = 3.10
    expect(result).toBeCloseTo(3.10, 2)
  })

  it('produces known MLB-like values', () => {
    // Elite pitcher: 250K, 40BB, 3HBP, 15HR, 200IP, cFIP=3.15
    const result = computeFIP(
      { k: 250, bb: 40, hbp: 3, hr: 15, ip: 200 },
      { cfip: 3.15 }
    )
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(2.0)
    expect(result!).toBeLessThan(4.0)
  })
})

// ── computeXERA ──────────────────────────────────────────────────────────────

describe('computeXERA', () => {
  it('computes xERA with normal inputs', () => {
    const result = computeXERA(
      { ip: 180, pa: 700, xwoba: 0.300 },
      { woba: 0.320, woba_scale: 1.25, lg_era: 4.20 }
    )
    expect(result).not.toBeNull()
    // ((0.300 - 0.320) / 1.25) * (700/180) * 9 + 4.20
    // (-0.016) * 3.889 * 9 + 4.20 = -0.56 + 4.20 = 3.64
    expect(result).toBeCloseTo(3.64, 1)
  })

  it('returns null when xwoba is null', () => {
    expect(computeXERA(
      { ip: 180, pa: 700, xwoba: null },
      { woba: 0.320, woba_scale: 1.25, lg_era: 4.20 }
    )).toBeNull()
  })

  it('returns null when ip is 0', () => {
    expect(computeXERA(
      { ip: 0, pa: 700, xwoba: 0.300 },
      { woba: 0.320, woba_scale: 1.25, lg_era: 4.20 }
    )).toBeNull()
  })

  it('returns null when pa is 0', () => {
    expect(computeXERA(
      { ip: 180, pa: 0, xwoba: 0.300 },
      { woba: 0.320, woba_scale: 1.25, lg_era: 4.20 }
    )).toBeNull()
  })

  it('handles string numeric values from DB', () => {
    const result = computeXERA(
      { ip: '180', pa: '700', xwoba: '0.300' },
      { woba: 0.320, woba_scale: 1.25, lg_era: 4.20 }
    )
    expect(result).toBeCloseTo(3.64, 1)
  })
})

// ── computeWRCPlus ──────────────────────────────────────────────────────────

describe('computeWRCPlus', () => {
  it('returns ~100 for league average wOBA at neutral park', () => {
    const result = computeWRCPlus(
      0.320,
      { woba: 0.320, woba_scale: 1.25, r_pa: 0.120 },
      100
    )
    expect(result).toBe(100)
  })

  it('returns null when park factor causes zero denominator', () => {
    expect(computeWRCPlus(
      0.350,
      { woba: 0.320, woba_scale: 1.25, r_pa: 0.120 },
      0
    )).toBeNull()
  })

  it('returns above 100 for above-average hitter', () => {
    const result = computeWRCPlus(
      0.380,
      { woba: 0.320, woba_scale: 1.25, r_pa: 0.120 },
      100
    )
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(100)
  })

  it('returns below 100 for below-average hitter', () => {
    const result = computeWRCPlus(
      0.280,
      { woba: 0.320, woba_scale: 1.25, r_pa: 0.120 },
      100
    )
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(100)
  })

  it('adjusts for park factor', () => {
    const constants = { woba: 0.320, woba_scale: 1.25, r_pa: 0.120 }
    const neutral = computeWRCPlus(0.380, constants, 100)!
    const hitterPark = computeWRCPlus(0.380, constants, 110)!
    // Same wOBA in a hitter-friendly park (110) should yield lower wRC+
    expect(hitterPark).toBeLessThan(neutral)
  })

  it('returns null when r_pa is 0 (zero denominator)', () => {
    expect(computeWRCPlus(
      0.350,
      { woba: 0.320, woba_scale: 1.25, r_pa: 0 },
      100
    )).toBeNull()
  })
})
