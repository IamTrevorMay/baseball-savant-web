import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const gamePk = req.nextUrl.searchParams.get('gamePk')
  if (!gamePk) return NextResponse.json({ error: 'gamePk required' }, { status: 400 })

  try {
    const [boxRes, lineRes] = await Promise.all([
      fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`, { next: { revalidate: 30 } }),
      fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`, { next: { revalidate: 30 } }),
    ])

    if (!boxRes.ok || !lineRes.ok) return NextResponse.json({ error: 'MLB API error' }, { status: 502 })

    const box = await boxRes.json()
    const line = await lineRes.json()

    function parseTeam(side: any) {
      const players = side.players || {}
      const battingOrder = (side.battingOrder || []) as number[]
      const pitcherIds = (side.pitchers || []) as number[]

      const batters = battingOrder.map((id: number) => {
        const p = players[`ID${id}`]
        if (!p) return null
        const s = p.stats?.batting || {}
        const ss = p.seasonStats?.batting || {}
        return {
          id,
          name: p.person?.fullName || '',
          boxName: p.person?.boxscoreName || '',
          pos: p.position?.abbreviation || '',
          ab: s.atBats ?? 0,
          r: s.runs ?? 0,
          h: s.hits ?? 0,
          rbi: s.rbi ?? 0,
          bb: s.baseOnBalls ?? 0,
          so: s.strikeOuts ?? 0,
          hr: s.homeRuns ?? 0,
          avg: ss.avg || s.avg || '',
          obp: ss.obp || s.obp || '',
          slg: ss.slg || s.slg || '',
        }
      }).filter(Boolean)

      const pitchers = pitcherIds.map((id: number) => {
        const p = players[`ID${id}`]
        if (!p) return null
        const s = p.stats?.pitching || {}
        const ss = p.seasonStats?.pitching || {}
        return {
          id,
          name: p.person?.fullName || '',
          boxName: p.person?.boxscoreName || '',
          ip: s.inningsPitched || '0.0',
          h: s.hits ?? 0,
          r: s.runs ?? 0,
          er: s.earnedRuns ?? 0,
          bb: s.baseOnBalls ?? 0,
          so: s.strikeOuts ?? 0,
          hr: s.homeRuns ?? 0,
          era: ss.era || s.era || '',
          pitches: s.numberOfPitches ?? 0,
          strikes: s.strikes ?? 0,
        }
      }).filter(Boolean)

      const ts = side.teamStats || {}
      return {
        team: {
          id: side.team?.id,
          name: side.team?.name || '',
          abbrev: side.team?.abbreviation || '',
        },
        batting: { totals: ts.batting || {} },
        batters,
        pitchers,
      }
    }

    const innings = (line.innings || []).map((inn: any) => ({
      num: inn.num,
      ordinal: inn.ordinalNum,
      away: { runs: inn.away?.runs ?? null, hits: inn.away?.hits ?? 0, errors: inn.away?.errors ?? 0 },
      home: { runs: inn.home?.runs ?? null, hits: inn.home?.hits ?? 0, errors: inn.home?.errors ?? 0 },
    }))

    const totals = line.teams || {}

    return NextResponse.json({
      gamePk,
      away: parseTeam(box.teams?.away || {}),
      home: parseTeam(box.teams?.home || {}),
      innings,
      totals: {
        away: { runs: totals.away?.runs ?? 0, hits: totals.away?.hits ?? 0, errors: totals.away?.errors ?? 0 },
        home: { runs: totals.home?.runs ?? 0, hits: totals.home?.hits ?? 0, errors: totals.home?.errors ?? 0 },
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
