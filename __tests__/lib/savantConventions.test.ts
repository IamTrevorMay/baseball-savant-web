import { describe, it, expect } from 'vitest'
import { METRICS, WHIFFS, PA_COUNT, AB_EVENTS, XWOBA_SQL, WOBA_EVENT_SQL } from '@/lib/reportMetrics'
import { isWhiff, isSwing, isPlateAppearance, isAtBat, isWobaDenomEvent, WOBA_WEIGHTS } from '@/lib/pitcherStats'

/**
 * Locks in the Savant-matched conventions established 2026-09-09 by
 * reproducing Savant's displayed values for Skenes / Skubal / Judge.
 * If one of these fails, a formula drifted from the documented convention
 * in docs/VARIABLES.md §1.0 — do not "fix" the test without re-verifying
 * against Savant.
 */

describe('client-side event/description sets', () => {
  it('whiff counts foul tips (the Savant convention)', () => {
    expect(isWhiff('foul_tip')).toBe(true)
    expect(isWhiff('bunt_foul_tip')).toBe(true)
    expect(isWhiff('swinging_strike')).toBe(true)
    expect(isWhiff('swinging_strike_blocked')).toBe(true)
    expect(isWhiff('missed_bunt')).toBe(true)
    expect(isWhiff('foul')).toBe(false)
    expect(isWhiff('hit_into_play')).toBe(false)
  })

  it('every whiff is a swing', () => {
    for (const d of ['swinging_strike', 'swinging_strike_blocked', 'missed_bunt', 'swinging_pitchout', 'foul_tip', 'bunt_foul_tip']) {
      expect(isSwing(d)).toBe(true)
    }
    expect(isSwing('called_strike')).toBe(false)
    expect(isSwing('ball')).toBe(false)
  })

  it('PA excludes truncated_pa and baserunning rows (matches batters faced)', () => {
    expect(isPlateAppearance('strikeout')).toBe(true)
    expect(isPlateAppearance('intent_walk')).toBe(true)
    expect(isPlateAppearance('truncated_pa')).toBe(false)
    expect(isPlateAppearance('caught_stealing_2b')).toBe(false)
    expect(isPlateAppearance('game_advisory')).toBe(false)
    expect(isPlateAppearance(null)).toBe(false)
  })

  it('AB is a positive list: errors count, IBB and sacrifices never do', () => {
    expect(isAtBat('field_error')).toBe(true)
    expect(isAtBat('strikeout_double_play')).toBe(true)
    expect(isAtBat('intent_walk')).toBe(false)
    expect(isAtBat('sac_fly')).toBe(false)
    expect(isAtBat('catcher_interf')).toBe(false)
    expect(isAtBat('truncated_pa')).toBe(false)
  })

  it('wOBA excludes IBB and CI from numerator and denominator', () => {
    expect(WOBA_WEIGHTS['intent_walk']).toBeUndefined()
    expect(WOBA_WEIGHTS['walk']).toBe(0.7)
    expect(isWobaDenomEvent('intent_walk')).toBe(false)
    expect(isWobaDenomEvent('catcher_interf')).toBe(false)
    expect(isWobaDenomEvent('sac_fly')).toBe(true)
    expect(isWobaDenomEvent('walk')).toBe(true)
  })
})

describe('shared SQL fragments', () => {
  it('SQL whiff numerator includes foul tips', () => {
    expect(WHIFFS).toContain("'foul_tip'")
    expect(WHIFFS).toContain("'bunt_foul_tip'")
    expect(METRICS.whiff_pct).toContain("'foul_tip'")
  })

  it('SQL PA excludes truncated_pa', () => {
    expect(PA_COUNT).toContain("'truncated_pa'")
    expect(METRICS.k_pct).toContain("'truncated_pa'")
  })

  it('BB metrics include intentional walks; wOBA-family excludes them', () => {
    expect(METRICS.bb_pct).toContain("'intent_walk'")
    expect(METRICS.bb_count).toContain("'intent_walk'")
    expect(METRICS.obp).toContain("'intent_walk'")
    expect(XWOBA_SQL).not.toContain('intent_walk')
    expect(WOBA_EVENT_SQL).not.toContain('intent_walk')
  })

  it('xwOBA blends BBE estimates with 0.7 uBB and 0.7 HBP', () => {
    expect(METRICS.avg_xwoba).toContain('0.7')
    expect(METRICS.avg_xwoba).toContain('estimated_woba_using_speedangle')
    expect(METRICS.avg_xwoba).not.toContain('AVG(estimated_woba_using_speedangle)')
  })

  it('wOBA is event-derived, not the stored woba_value column', () => {
    expect(METRICS.avg_woba).not.toContain('woba_value')
  })

  it('AB set excludes intent_walk and contains field_error', () => {
    expect(AB_EVENTS).toContain("'field_error'")
    expect(AB_EVENTS).not.toContain('intent_walk')
  })

  it('barrel and EV denominators are batted-ball events', () => {
    expect(METRICS.barrel_pct).toContain('bb_type IS NOT NULL')
    expect(METRICS.avg_ev).toContain('bb_type IS NOT NULL')
    expect(METRICS.avg_la).toContain('bb_type IS NOT NULL')
  })
})
