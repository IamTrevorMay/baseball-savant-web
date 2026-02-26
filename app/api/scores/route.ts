import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10)

  try {
    const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=team,linescore`
    const resp = await fetch(url, { next: { revalidate: 30 } })
    if (!resp.ok) return NextResponse.json({ error: 'MLB API error' }, { status: 502 })

    const data = await resp.json()
    const dateEntry = data?.dates?.[0]
    if (!dateEntry) return NextResponse.json({ date, games: [] })

    const games = (dateEntry.games || []).map((g: any) => {
      const status = g.status || {}
      const away = g.teams?.away || {}
      const home = g.teams?.home || {}
      const ls = g.linescore || {}

      return {
        gamePk: g.gamePk,
        gameDate: g.gameDate,
        gameType: g.gameType,
        seriesDescription: g.seriesDescription || '',
        state: status.abstractGameState,       // Preview, Live, Final
        detailedState: status.detailedState,    // Scheduled, In Progress, Final, Postponed, etc.
        away: {
          id: away.team?.id,
          name: away.team?.name || '',
          abbrev: away.team?.abbreviation || '',
          score: away.score ?? null,
        },
        home: {
          id: home.team?.id,
          name: home.team?.name || '',
          abbrev: home.team?.abbreviation || '',
          score: home.score ?? null,
        },
        inning: ls.currentInning ?? null,
        inningOrdinal: ls.currentInningOrdinal ?? null,
        inningHalf: ls.inningHalf ?? null,
      }
    })

    return NextResponse.json({ date, games })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
