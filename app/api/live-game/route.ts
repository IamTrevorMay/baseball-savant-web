import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/live-game?gamePk=123456
 * Fetches a single game from the MLB Stats API and returns a flat object
 * matching GAME_METRICS field names for template data binding.
 */
export async function GET(req: NextRequest) {
  const gamePk = req.nextUrl.searchParams.get('gamePk')
  if (!gamePk) return NextResponse.json({ error: 'gamePk required' }, { status: 400 })

  try {
    const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`
    const resp = await fetch(url, { next: { revalidate: 15 } })
    if (!resp.ok) return NextResponse.json({ error: 'MLB API error' }, { status: 502 })

    const data = await resp.json()
    const gameData = data?.gameData
    const liveData = data?.liveData
    if (!gameData) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

    const status = gameData.status || {}
    const teams = gameData.teams || {}
    const linescore = liveData?.linescore || {}
    const offense = linescore.offense || {}
    const defense = linescore.defense || {}

    const away = teams.away || {}
    const home = teams.home || {}

    const inningHalf = linescore.inningHalf || null
    const inningOrdinal = linescore.currentInningOrdinal || null
    const outs = linescore.outs ?? null

    // Build inning display string
    let inningDisplay = ''
    if (inningHalf && inningOrdinal) {
      inningDisplay = `${inningHalf === 'Top' ? 'Top' : 'Bot'} ${inningOrdinal}`
    }

    // Build state line: "BOT 7 · 2 OUT"
    let stateLine = ''
    if (status.abstractGameState === 'Live' && inningHalf && linescore.currentInning) {
      const half = inningHalf === 'Top' ? 'TOP' : 'BOT'
      stateLine = `${half} ${linescore.currentInning}`
      if (outs != null) stateLine += ` \u00b7 ${outs} OUT`
    } else if (status.abstractGameState === 'Final') {
      stateLine = status.detailedState || 'Final'
    } else {
      stateLine = status.detailedState || 'Scheduled'
    }

    const game = {
      // Teams
      away_abbrev: away.abbreviation || '',
      home_abbrev: home.abbreviation || '',
      away_name: away.teamName || away.name || '',
      home_name: home.teamName || home.name || '',
      away_id: away.id,
      home_id: home.id,
      // Themed (same as non-themed; actual theming happens in applyThemeToElements)
      away_abbrev_themed: away.abbreviation || '',
      home_abbrev_themed: home.abbreviation || '',
      matchup_themed: `${away.abbreviation || ''} - ${home.abbreviation || ''}`,
      // Score
      away_score: linescore.teams?.away?.runs ?? away.score ?? null,
      home_score: linescore.teams?.home?.runs ?? home.score ?? null,
      // Game State
      inning_display: inningDisplay,
      inning_half: inningHalf,
      inning_ordinal: inningOrdinal,
      outs,
      game_state: status.abstractGameState || '',
      detailed_state: status.detailedState || '',
      state_line: stateLine,
      // Runners
      on_first: !!offense.first,
      on_second: !!offense.second,
      on_third: !!offense.third,
      // Players
      pitcher_name: defense.pitcher?.fullName || '',
      batter_name: offense.batter?.fullName || '',
      probable_away: gameData.probablePitchers?.away?.fullName || '',
      probable_home: gameData.probablePitchers?.home?.fullName || '',
      // Player IDs (for player-image elements)
      pitcher_id: defense.pitcher?.id || null,
      batter_id: offense.batter?.id || null,
      probable_away_id: gameData.probablePitchers?.away?.id || null,
      probable_home_id: gameData.probablePitchers?.home?.id || null,
    }

    return NextResponse.json({ game })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
