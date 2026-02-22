import { NextRequest, NextResponse } from 'next/server'

const DIV_MAP: Record<number, { division: string; divAbbrev: string; league: string }> = {
  // AL East
  141: { division: 'AL East', divAbbrev: 'ALE', league: 'AL' },
  147: { division: 'AL East', divAbbrev: 'ALE', league: 'AL' },
  111: { division: 'AL East', divAbbrev: 'ALE', league: 'AL' },
  139: { division: 'AL East', divAbbrev: 'ALE', league: 'AL' },
  110: { division: 'AL East', divAbbrev: 'ALE', league: 'AL' },
  // AL Central
  114: { division: 'AL Central', divAbbrev: 'ALC', league: 'AL' },
  116: { division: 'AL Central', divAbbrev: 'ALC', league: 'AL' },
  118: { division: 'AL Central', divAbbrev: 'ALC', league: 'AL' },
  142: { division: 'AL Central', divAbbrev: 'ALC', league: 'AL' },
  145: { division: 'AL Central', divAbbrev: 'ALC', league: 'AL' },
  // AL West
  136: { division: 'AL West', divAbbrev: 'ALW', league: 'AL' },
  117: { division: 'AL West', divAbbrev: 'ALW', league: 'AL' },
  140: { division: 'AL West', divAbbrev: 'ALW', league: 'AL' },
  133: { division: 'AL West', divAbbrev: 'ALW', league: 'AL' },
  108: { division: 'AL West', divAbbrev: 'ALW', league: 'AL' },
  // NL East
  143: { division: 'NL East', divAbbrev: 'NLE', league: 'NL' },
  121: { division: 'NL East', divAbbrev: 'NLE', league: 'NL' },
  146: { division: 'NL East', divAbbrev: 'NLE', league: 'NL' },
  144: { division: 'NL East', divAbbrev: 'NLE', league: 'NL' },
  120: { division: 'NL East', divAbbrev: 'NLE', league: 'NL' },
  // NL Central
  158: { division: 'NL Central', divAbbrev: 'NLC', league: 'NL' },
  112: { division: 'NL Central', divAbbrev: 'NLC', league: 'NL' },
  113: { division: 'NL Central', divAbbrev: 'NLC', league: 'NL' },
  138: { division: 'NL Central', divAbbrev: 'NLC', league: 'NL' },
  134: { division: 'NL Central', divAbbrev: 'NLC', league: 'NL' },
  // NL West
  119: { division: 'NL West', divAbbrev: 'NLW', league: 'NL' },
  135: { division: 'NL West', divAbbrev: 'NLW', league: 'NL' },
  137: { division: 'NL West', divAbbrev: 'NLW', league: 'NL' },
  109: { division: 'NL West', divAbbrev: 'NLW', league: 'NL' },
  115: { division: 'NL West', divAbbrev: 'NLW', league: 'NL' },
}

export async function GET(req: NextRequest) {
  const season = req.nextUrl.searchParams.get('season') || new Date().getFullYear().toString()

  try {
    const url = `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team`
    const resp = await fetch(url, { next: { revalidate: 300 } })
    if (!resp.ok) return NextResponse.json({ error: 'MLB API error' }, { status: 502 })

    const data = await resp.json()
    const records = data?.records || []

    // Flatten all teams
    const allTeams = records.flatMap((div: any) =>
      (div.teamRecords || []).map((t: any) => {
        const info = DIV_MAP[t.team?.id] || { division: 'Unknown', divAbbrev: '???', league: '?' }
        return {
          id: t.team?.id,
          name: t.team?.name || '',
          abbrev: t.team?.abbreviation || '',
          division: info.division,
          divAbbrev: info.divAbbrev,
          league: info.league,
          w: t.wins,
          l: t.losses,
          pct: t.winningPercentage,
          gb: t.gamesBack === '-' ? '—' : t.gamesBack,
          wcGb: t.wildCardGamesBack === '-' ? '—' : t.wildCardGamesBack,
          streak: t.streak?.streakCode || '',
          l10: `${t.records?.splitRecords?.find((r: any) => r.type === 'lastTen')?.wins || 0}-${t.records?.splitRecords?.find((r: any) => r.type === 'lastTen')?.losses || 0}`,
          home: `${t.records?.splitRecords?.find((r: any) => r.type === 'home')?.wins || 0}-${t.records?.splitRecords?.find((r: any) => r.type === 'home')?.losses || 0}`,
          away: `${t.records?.splitRecords?.find((r: any) => r.type === 'away')?.wins || 0}-${t.records?.splitRecords?.find((r: any) => r.type === 'away')?.losses || 0}`,
          rs: t.runsScored || 0,
          ra: t.runsAllowed || 0,
          diff: (t.runDifferential > 0 ? '+' : '') + (t.runDifferential || 0),
          divRank: t.divisionRank,
          wcRank: t.wildCardRank,
        }
      })
    )

    // Group by division
    const divNames = ['AL East','AL Central','AL West','NL East','NL Central','NL West']
    const divisions = divNames.map(name => ({
      division: name,
      divisionAbbrev: name,
      league: name.startsWith('AL') ? 'AL' : 'NL',
      teams: allTeams.filter((t: any) => t.division === name).sort((a: any, b: any) => b.w - a.w || a.l - b.l)
    }))

    return NextResponse.json({ season, divisions })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
