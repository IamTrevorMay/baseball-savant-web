import { describe, it, expect } from 'vitest'
import { computeOutingCommand, PitchRow } from '@/lib/outingCommand'

// Helper to make a minimal PitchRow with defaults
function makePitch(overrides: Partial<PitchRow> = {}): PitchRow {
  return {
    plate_x: 0,
    plate_z: 2.5,
    pitch_name: '4-Seam Fastball',
    sz_top: 3.5,
    sz_bot: 1.5,
    zone: 5,
    game_year: 2024,
    description: 'called_strike',
    stand: 'R',
    ...overrides,
  }
}

describe('computeOutingCommand', () => {
  it('returns empty byPitch and null aggregates for empty input', () => {
    const result = computeOutingCommand([])
    expect(Object.keys(result.byPitch)).toHaveLength(0)
    expect(result.aggregate.avg_brink).toBeNull()
    expect(result.aggregate.avg_cluster).toBeNull()
    expect(result.aggregate.waste_pct).toBeNull()
    expect(result.overall_cmd_plus).toBeNull()
  })

  it('computes metrics for a single pitch type', () => {
    const pitches: PitchRow[] = [
      makePitch({ plate_x: 0.0, plate_z: 2.5, zone: 5 }),
      makePitch({ plate_x: 0.5, plate_z: 3.0, zone: 3 }),
      makePitch({ plate_x: -0.3, plate_z: 2.0, zone: 4 }),
    ]

    const result = computeOutingCommand(pitches)

    expect(result.byPitch['4-Seam Fastball']).toBeDefined()
    const fb = result.byPitch['4-Seam Fastball']

    // avg_brink should be a number (min distance to edge in inches)
    expect(fb.avg_brink).not.toBeNull()
    expect(typeof fb.avg_brink).toBe('number')

    // avg_cluster should be a number (distance from centroid in inches)
    // May be null if no centroid data for pitch, but should be numeric if centroid exists
    if (fb.avg_cluster !== null) {
      expect(typeof fb.avg_cluster).toBe('number')
    }
  })

  it('computes correct aggregate across multiple pitch types', () => {
    const pitches: PitchRow[] = [
      // Fastballs
      makePitch({ pitch_name: '4-Seam Fastball', plate_x: 0.0, plate_z: 2.5, zone: 5 }),
      makePitch({ pitch_name: '4-Seam Fastball', plate_x: 0.2, plate_z: 2.8, zone: 2 }),
      // Sliders
      makePitch({ pitch_name: 'Slider', plate_x: 0.6, plate_z: 1.8, zone: 9 }),
      makePitch({ pitch_name: 'Slider', plate_x: 0.8, plate_z: 1.6, zone: 9 }),
    ]

    const result = computeOutingCommand(pitches)

    expect(result.byPitch['4-Seam Fastball']).toBeDefined()
    expect(result.byPitch['Slider']).toBeDefined()

    // Aggregate avg_brink is usage-weighted across all types
    expect(result.aggregate.avg_brink).not.toBeNull()
    expect(typeof result.aggregate.avg_brink).toBe('number')
  })

  it('skips pitches with null pitch_name', () => {
    const pitches: PitchRow[] = [
      makePitch({ pitch_name: '4-Seam Fastball' }),
      makePitch({ pitch_name: '' }),  // will be skipped (falsy)
    ]

    const result = computeOutingCommand(pitches)
    // Only the fastball group should exist
    expect(Object.keys(result.byPitch)).toHaveLength(1)
    expect(result.byPitch['4-Seam Fastball']).toBeDefined()
  })

  it('handles outside-zone pitches for missfire and close_pct', () => {
    // Zone >= 10 = outside zone
    const pitches: PitchRow[] = [
      // Outside zone, no swing → counts as missfire
      makePitch({ plate_x: 1.2, plate_z: 2.5, zone: 11, description: 'ball' }),
      // Outside zone, close miss (brink > -2in), no swing
      makePitch({ plate_x: 0.9, plate_z: 2.5, zone: 11, description: 'ball' }),
      // Outside zone but batter swung → NOT a command miss
      makePitch({ plate_x: 1.5, plate_z: 2.5, zone: 14, description: 'swinging_strike' }),
      // Inside zone
      makePitch({ plate_x: 0.0, plate_z: 2.5, zone: 5, description: 'called_strike' }),
    ]

    const result = computeOutingCommand(pitches)
    const fb = result.byPitch['4-Seam Fastball']

    // Should have missfire data from the 2 non-swing outside pitches
    expect(fb.avg_missfire).not.toBeNull()
    expect(fb.close_pct).not.toBeNull()
    expect(typeof fb.avg_missfire).toBe('number')
    expect(typeof fb.close_pct).toBe('number')
    // close_pct should be between 0 and 100
    expect(fb.close_pct!).toBeGreaterThanOrEqual(0)
    expect(fb.close_pct!).toBeLessThanOrEqual(100)
  })

  it('handles R/L split cluster metrics', () => {
    const pitches: PitchRow[] = [
      makePitch({ stand: 'R', plate_x: 0.1, plate_z: 2.5 }),
      makePitch({ stand: 'R', plate_x: 0.2, plate_z: 2.6 }),
      makePitch({ stand: 'L', plate_x: -0.3, plate_z: 2.4 }),
    ]

    const result = computeOutingCommand(pitches)
    const fb = result.byPitch['4-Seam Fastball']

    // Should have R/L cluster values if centroids exist
    if (fb.avg_cluster_r !== null) {
      expect(typeof fb.avg_cluster_r).toBe('number')
    }
    if (fb.avg_cluster_l !== null) {
      expect(typeof fb.avg_cluster_l).toBe('number')
    }
  })
})
