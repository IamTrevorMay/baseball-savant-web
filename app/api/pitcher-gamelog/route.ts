import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/pitcher-gamelog?id=<mlbamId>&seasons=2026,2025
 *
 * Official per-game pitching lines from the MLB Stats API, keyed by gamePk so
 * a caller holding Statcast pitch rows can join straight onto them.
 *
 * Why not derive these from `pitches`: Statcast carries no earned-run
 * bookkeeping at all, and its run columns credit a run to whoever was on the
 * mound rather than to the pitcher who put the runner on — so ER is
 * underivable and R would disagree with the box score on inherited runners.
 * IP/H/K/BB come from here too, so a game row reads as one consistent line.
 *
 * gameType R,P,S covers regular season, every postseason round, and spring —
 * anything Statcast might hold. Extra games are harmless; the caller joins by
 * gamePk and ignores what it has no pitches for.
 */

const MAX_SEASONS = 15
const GAME_TYPES = 'R,P,S'

export interface PitcherGameLogLine {
  gamePk: number
  date: string
  gameType: string
  ip: string
  outs: number
  h: number
  k: number
  bb: number
  r: number
  er: number
  pitches: number
}

/** The slice of a statsapi gameLog split this route reads. */
interface GameLogSplit {
  date?: string
  gameType?: string
  game?: { gamePk?: number }
  stat?: Record<string, unknown>
}

/** One season of game logs, or [] if the player has none / the API errors. */
async function fetchSeason(playerId: number, season: number): Promise<PitcherGameLogLine[]> {
  const url =
    `https://statsapi.mlb.com/api/v1/people/${playerId}/stats` +
    `?stats=gameLog&group=pitching&season=${season}&gameType=${GAME_TYPES}`
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return []
    const json = await res.json()
    const splits = json?.stats?.[0]?.splits || []
    return (splits as GameLogSplit[])
      .map((sp): PitcherGameLogLine | null => {
        const gamePk = sp?.game?.gamePk
        const st = sp?.stat || {}
        if (!gamePk) return null
        return {
          gamePk: Number(gamePk),
          date: String(sp.date || ''),
          gameType: String(sp.gameType || ''),
          ip: String(st.inningsPitched ?? ''),
          outs: Number(st.outs ?? 0),
          h: Number(st.hits ?? 0),
          k: Number(st.strikeOuts ?? 0),
          bb: Number(st.baseOnBalls ?? 0),
          r: Number(st.runs ?? 0),
          er: Number(st.earnedRuns ?? 0),
          pitches: Number(st.numberOfPitches ?? 0),
        }
      })
      .filter(Boolean) as PitcherGameLogLine[]
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const playerId = parseInt(sp.get('id') || '', 10)
  if (isNaN(playerId)) return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })

  const seasons = [
    ...new Set(
      (sp.get('seasons') || '')
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n >= 1900 && n <= 2100),
    ),
  ].slice(0, MAX_SEASONS)

  if (seasons.length === 0) {
    return NextResponse.json({ error: 'Missing or invalid seasons' }, { status: 400 })
  }

  try {
    const perSeason = await Promise.all(seasons.map(s => fetchSeason(playerId, s)))

    // A doubleheader gives one gamePk per game, so gamePk stays unique here.
    const games: Record<string, PitcherGameLogLine> = {}
    for (const lines of perSeason) {
      for (const line of lines) games[String(line.gamePk)] = line
    }

    return NextResponse.json(
      { games, seasons },
      { headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' } },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Game log fetch failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
