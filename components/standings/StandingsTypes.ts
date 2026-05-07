export interface StandingsTeam {
  id: number; name: string; abbrev: string
  w: number; l: number; pct: string; gb: string; wcGb: string
  streak: string; l10: string; home: string; away: string
  rs: number; ra: number; diff: string; divRank: string; wcRank: string
}

export interface Division {
  division: string; divisionAbbrev: string; league: string; teams: StandingsTeam[]
}
