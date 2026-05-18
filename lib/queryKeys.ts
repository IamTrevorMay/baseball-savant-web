export const queryKeys = {
  // League baselines
  leagueBaseline: (season: number | null | undefined, level: string | undefined, role: string | null | undefined, metric: string | null | undefined) =>
    ['leagueBaseline', season, level, role, metric] as const,

  // Standings & scores
  standings: (season: number, type: string) => ['standings', season, type] as const,
  scores: (date: string) => ['scores', date] as const,
  boxscore: (gamePk: number | null) => ['boxscore', gamePk] as const,

  // Trends
  dailyHighlights: () => ['trends', 'daily'] as const,
  trendsHighlights: () => ['trends', 'highlights'] as const,
  trendsTab: (season: string, tab: string, minPitches: string) =>
    ['trends', 'tab', season, tab, minPitches] as const,

  // Player (pitcher)
  playerInfo: (id: number) => ['player', id, 'info'] as const,
  playerPitches: (id: number, year: number | null) => ['player', id, 'pitches', year] as const,
  playerMlbStats: (id: number) => ['player', id, 'mlbStats'] as const,
  playerLahman: (id: number) => ['player', id, 'lahman'] as const,
  playerSos: (id: number) => ['player', id, 'sos'] as const,
  playerFilterOptions: (id: number, col: string) => ['player', id, 'filterOptions', col] as const,

  // Hitter
  hitterInfo: (id: number) => ['hitter', id, 'info'] as const,
  hitterPitches: (id: number, year: number | null) => ['hitter', id, 'pitches', year] as const,
  hitterLahman: (id: number) => ['hitter', id, 'lahman'] as const,

  // ABS
  absFilters: () => ['abs', 'filters'] as const,
  absDashboard: (year: number, gameType: string, level: string) =>
    ['abs', 'dashboard', year, gameType, level] as const,
  absLeaderboard: (params: { year: number; gameType: string; level: string; challengeType: string; minChal: number }) =>
    ['abs', 'leaderboard', params] as const,
  absUmpires: (params: { year: number; gameType: string; minGames: number }) =>
    ['abs', 'umpires', params] as const,

  // Explore
  exploreOptions: () => ['explore', 'options'] as const,
  exploreRows: (params: Record<string, unknown>) => ['explore', 'rows', params] as const,

  // Models
  deployedModels: (role: string) => ['deployedModels', role] as const,
}
