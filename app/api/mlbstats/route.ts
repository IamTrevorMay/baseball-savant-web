import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const pitcherId = req.nextUrl.searchParams.get('pitcher')
  if (!pitcherId) return NextResponse.json({ error: 'pitcher param required' }, { status: 400 })

  try {
    // Fetch career stats from MLB Stats API
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=yearByYear&group=pitching`
    const resp = await fetch(url, { next: { revalidate: 3600 } })
    if (!resp.ok) return NextResponse.json({ error: 'MLB API error' }, { status: 502 })

    const data = await resp.json()
    const splits = data?.stats?.[0]?.splits || []

    const seasons = splits
      .filter((s: any) => s.sport?.id === 1) // MLB only
      .map((s: any) => ({
        year: s.season,
        team: s.team?.abbreviation || s.team?.name || '',
        w: s.stat?.wins ?? null,
        l: s.stat?.losses ?? null,
        era: s.stat?.era ?? null,
        gs: s.stat?.gamesStarted ?? null,
        g: s.stat?.gamesPlayed ?? null,
        sv: s.stat?.saves ?? null,
        ip: s.stat?.inningsPitched ?? null,
        h: s.stat?.hits ?? null,
        er: s.stat?.earnedRuns ?? null,
        bb: s.stat?.baseOnBalls ?? null,
        k: s.stat?.strikeOuts ?? null,
        hr: s.stat?.homeRuns ?? null,
        whip: s.stat?.whip ?? null,
        avg: s.stat?.avg ?? null,
        k9: s.stat?.strikeoutsPer9Inn ?? null,
        bb9: s.stat?.walksPer9Inn ?? null,
        hr9: s.stat?.homeRunsPer9Inn ?? null,
        fip: s.stat?.fip ?? null,
      }))

    return NextResponse.json({ seasons })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
