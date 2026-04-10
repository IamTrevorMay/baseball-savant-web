import { NextRequest, NextResponse } from 'next/server'

// AAA team ID → division mapping (International League + Pacific Coast League)
const MILB_DIV_MAP: Record<number, { division: string; league: string; parentOrgId: number }> = {
  // International League East
  1410: { division: 'IL East', league: 'IL', parentOrgId: 143 },
  531:  { division: 'IL East', league: 'IL', parentOrgId: 147 },
  533:  { division: 'IL East', league: 'IL', parentOrgId: 111 },
  534:  { division: 'IL East', league: 'IL', parentOrgId: 120 },
  422:  { division: 'IL East', league: 'IL', parentOrgId: 141 },
  552:  { division: 'IL East', league: 'IL', parentOrgId: 121 },
  234:  { division: 'IL East', league: 'IL', parentOrgId: 139 },
  494:  { division: 'IL East', league: 'IL', parentOrgId: 145 },
  564:  { division: 'IL East', league: 'IL', parentOrgId: 146 },
  568:  { division: 'IL East', league: 'IL', parentOrgId: 110 },
  // International League West
  512:  { division: 'IL West', league: 'IL', parentOrgId: 116 },
  451:  { division: 'IL West', league: 'IL', parentOrgId: 112 },
  541:  { division: 'IL West', league: 'IL', parentOrgId: 118 },
  416:  { division: 'IL West', league: 'IL', parentOrgId: 113 },
  484:  { division: 'IL West', league: 'IL', parentOrgId: 134 },
  1960: { division: 'IL West', league: 'IL', parentOrgId: 142 },
  235:  { division: 'IL West', league: 'IL', parentOrgId: 138 },
  556:  { division: 'IL West', league: 'IL', parentOrgId: 158 },
  431:  { division: 'IL West', league: 'IL', parentOrgId: 144 },
  445:  { division: 'IL West', league: 'IL', parentOrgId: 114 },
  // Pacific Coast League East
  342:  { division: 'PCL East', league: 'PCL', parentOrgId: 115 },
  102:  { division: 'PCL East', league: 'PCL', parentOrgId: 140 },
  4904: { division: 'PCL East', league: 'PCL', parentOrgId: 135 },
  238:  { division: 'PCL East', league: 'PCL', parentOrgId: 119 },
  5434: { division: 'PCL East', league: 'PCL', parentOrgId: 117 },
  // Pacific Coast League West
  2310: { division: 'PCL West', league: 'PCL', parentOrgId: 109 },
  400:  { division: 'PCL West', league: 'PCL', parentOrgId: 133 },
  529:  { division: 'PCL West', league: 'PCL', parentOrgId: 136 },
  105:  { division: 'PCL West', league: 'PCL', parentOrgId: 137 },
  561:  { division: 'PCL West', league: 'PCL', parentOrgId: 108 },
}

export async function GET(req: NextRequest) {
  const season = req.nextUrl.searchParams.get('season') || new Date().getFullYear().toString()

  try {
    // AAA uses leagueId 117 (International League) and 112 (Pacific Coast League)
    const url = `https://statsapi.mlb.com/api/v1/standings?leagueId=117,112&season=${season}&standingsTypes=regularSeason&hydrate=team`
    const resp = await fetch(url, { next: { revalidate: 300 } })
    if (!resp.ok) return NextResponse.json({ error: 'MiLB API error' }, { status: 502 })

    const data = await resp.json()
    const records = data?.records || []

    const allTeams = records.flatMap((div: any) =>
      (div.teamRecords || []).map((t: any) => {
        const info = MILB_DIV_MAP[t.team?.id] || { division: 'Unknown', league: '?', parentOrgId: null }
        return {
          id: t.team?.id,
          name: t.team?.name || '',
          abbrev: t.team?.abbreviation || '',
          division: info.division,
          league: info.league,
          parentOrgId: info.parentOrgId,
          w: t.wins,
          l: t.losses,
          pct: t.winningPercentage,
          gb: t.gamesBack === '-' ? '—' : t.gamesBack,
          streak: t.streak?.streakCode || '',
          l10: `${t.records?.splitRecords?.find((r: any) => r.type === 'lastTen')?.wins || 0}-${t.records?.splitRecords?.find((r: any) => r.type === 'lastTen')?.losses || 0}`,
          home: `${t.records?.splitRecords?.find((r: any) => r.type === 'home')?.wins || 0}-${t.records?.splitRecords?.find((r: any) => r.type === 'home')?.losses || 0}`,
          away: `${t.records?.splitRecords?.find((r: any) => r.type === 'away')?.wins || 0}-${t.records?.splitRecords?.find((r: any) => r.type === 'away')?.losses || 0}`,
          rs: t.runsScored || 0,
          ra: t.runsAllowed || 0,
          diff: (t.runDifferential > 0 ? '+' : '') + (t.runDifferential || 0),
          divRank: t.divisionRank,
        }
      })
    )

    const divNames = ['IL East', 'IL West', 'PCL East', 'PCL West']
    const divisions = divNames.map(name => ({
      division: name,
      league: name.startsWith('IL') ? 'IL' : 'PCL',
      teams: allTeams.filter((t: any) => t.division === name).sort((a: any, b: any) => b.w - a.w || a.l - b.l),
    }))

    return NextResponse.json({ season, divisions })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
