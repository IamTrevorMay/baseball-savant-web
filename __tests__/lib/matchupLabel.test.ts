import { describe, it, expect } from 'vitest'
import { matchupLabel, surname } from '@/lib/video/clip'

const game = (over: Partial<Parameters<typeof matchupLabel>[0]> = {}) => ({
  away_team: 'PIT',
  home_team: 'PHI',
  away_starter: 'Skenes, Paul',
  home_starter: 'Wheeler, Zack',
  ...over,
})

describe('matchupLabel', () => {
  it('reads away-first, the way a matchup is spoken', () => {
    expect(matchupLabel(game())).toBe('Skenes (PIT) vs. Wheeler (PHI)')
  })

  it('falls back to the bare matchup when a starter is missing', () => {
    expect(matchupLabel(game({ home_starter: null }))).toBe('PIT @ PHI')
    expect(matchupLabel(game({ away_starter: '' }))).toBe('PIT @ PHI')
    expect(matchupLabel(game({ away_starter: undefined, home_starter: undefined }))).toBe('PIT @ PHI')
  })

  it('keeps multi-word and punctuated surnames intact', () => {
    expect(
      matchupLabel(game({ away_starter: 'De La Cruz, Oscar', home_starter: "O'Brien, Riley" })),
    ).toBe("De La Cruz (PIT) vs. O'Brien (PHI)")
  })

  it('tolerates a name that is not in "Last, First" form', () => {
    expect(matchupLabel(game({ away_starter: 'Skenes', home_starter: 'Wheeler' }))).toBe(
      'Skenes (PIT) vs. Wheeler (PHI)',
    )
  })

  it('surname trims and handles null', () => {
    expect(surname('  Alcantara , Sandy')).toBe('Alcantara')
    expect(surname(null)).toBe('')
  })
})
