// Chip options for the Reports Builder filter bars (global + tile filters).

const TEAMS = ['AZ','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET','HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK','PHI','PIT','SD','SF','SEA','STL','TB','TEX','TOR','WSH']

const COUNT_OPTIONS = {
  balls: ['0', '1', '2', '3'],
  strikes: ['0', '1', '2'],
  outs_when_up: ['0', '1', '2'],
  inning: Array.from({ length: 18 }, (_, i) => String(i + 1)),
  zone: Array.from({ length: 14 }, (_, i) => String(i + 1)),
}

/** Options shown before any player data is loaded. */
export const STATIC_OPTIONS: Record<string, string[]> = {
  game_year: Array.from({ length: new Date().getFullYear() - 2014 }, (_, i) => String(new Date().getFullYear() - i)),
  pitch_name: ['4-Seam Fastball','Sinker','Cutter','Changeup','Slider','Sweeper','Curveball','Knuckle Curve','Split-Finger','Slurve','Knuckeball','Eephus','Slow Curve'],
  pitch_type: ['FF','SI','FC','CH','SL','ST','CU','KC','FS','SV','KN','EP','CS'],
  stand: ['L','R'], p_throws: ['L','R'],
  bb_type: ['ground_ball','fly_ball','line_drive','popup'],
  home_team: TEAMS, away_team: TEAMS, vs_team: TEAMS,
  ...COUNT_OPTIONS,
}

/** Options drawn from the loaded rows, so chips only offer values that exist. */
export function buildOptionsCache(rows: any[]): Record<string, string[]> {
  if (!rows.length) return STATIC_OPTIONS
  const bo = (col: string) => [...new Set(rows.map((r: any) => r[col]).filter(Boolean))].map(String).sort()
  return {
    ...STATIC_OPTIONS,
    game_year: bo('game_year').reverse(), pitch_name: bo('pitch_name'), pitch_type: bo('pitch_type'),
    stand: bo('stand'), p_throws: bo('p_throws'),
    type: bo('type'), events: bo('events'), description: bo('description'), bb_type: bo('bb_type'),
    home_team: bo('home_team'), away_team: bo('away_team'), vs_team: bo('vs_team'),
    ...COUNT_OPTIONS,
  }
}
