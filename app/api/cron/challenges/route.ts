import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const maxDuration = 300

const TEAM_ID_TO_ABBR: Record<number, string> = {
  108:'LAA',109:'ARI',110:'BAL',111:'BOS',112:'CHC',113:'CIN',114:'CLE',
  115:'COL',116:'DET',117:'HOU',118:'KC',119:'LAD',120:'WSH',121:'NYM',
  133:'OAK',134:'PIT',135:'SD',136:'SEA',137:'SF',138:'STL',139:'TB',
  140:'TEX',141:'TOR',142:'MIN',143:'PHI',144:'ATL',145:'CWS',146:'MIA',
  147:'NYY',158:'MIL',
}

interface ChallengeRow {
  game_pk: number
  game_date: string
  hp_umpire: string
  hp_umpire_id: number | null
  inning: number | null
  half_inning: string | null
  at_bat_index: number | null
  review_type: string
  is_overturned: boolean
  challenge_team_id: number | null
  challenge_team: string | null
  challenger_id: number | null
  challenger_name: string | null
  batter_id: number | null
  batter_name: string | null
  pitcher_id: number | null
  pitcher_name: string | null
  balls: number | null
  strikes: number | null
  outs: number | null
  description: string | null
}

function extractChallenges(
  feedData: any,
  gamePk: number,
  gameDate: string,
  hpUmpire: string,
  hpUmpireId: number | null
): ChallengeRow[] {
  const challenges: ChallengeRow[] = []
  const allPlays = feedData?.liveData?.plays?.allPlays || []

  for (const play of allPlays) {
    const about = play.about || {}
    const matchup = play.matchup || {}
    const batterId = matchup.batter?.id || null
    const batterName = matchup.batter?.fullName || null
    const pitcherId = matchup.pitcher?.id || null
    const pitcherName = matchup.pitcher?.fullName || null

    const addChallenge = (rd: any, count?: any) => {
      challenges.push({
        game_pk: gamePk,
        game_date: gameDate,
        hp_umpire: hpUmpire,
        hp_umpire_id: hpUmpireId,
        inning: about.inning || null,
        half_inning: about.halfInning || null,
        at_bat_index: play.atBatIndex ?? null,
        review_type: rd.reviewType || 'unknown',
        is_overturned: rd.isOverturned === true,
        challenge_team_id: rd.challengeTeamId || null,
        challenge_team: TEAM_ID_TO_ABBR[rd.challengeTeamId] || null,
        challenger_id: rd.player?.id || null,
        challenger_name: rd.player?.fullName || null,
        batter_id: batterId,
        batter_name: batterName,
        pitcher_id: pitcherId,
        pitcher_name: pitcherName,
        balls: count?.balls ?? null,
        strikes: count?.strikes ?? null,
        outs: count?.outs ?? about.outs ?? null,
        description: play.result?.description || null,
      })
    }

    // Play-level reviewDetails
    if (play.reviewDetails) {
      addChallenge(play.reviewDetails)
    }

    // Event-level reviewDetails
    for (const evt of play.playEvents || []) {
      if (evt.reviewDetails) {
        addChallenge(evt.reviewDetails, evt.count)
      }
    }
  }

  return challenges
}

export async function syncChallenges(
  season?: number,
  limit?: number
): Promise<{ inserted: number; errors: number; games_processed: number }> {
  const year = season || new Date().getFullYear()

  // Find games that have umpire data but no challenge records yet
  const { data: games, error: gErr } = await supabaseAdmin.rpc('run_query', {
    query_text: `
      SELECT u.game_pk, u.game_date::text as game_date, u.hp_umpire, u.hp_umpire_id
      FROM game_umpires u
      LEFT JOIN (SELECT DISTINCT game_pk FROM umpire_challenges) c ON c.game_pk = u.game_pk
      WHERE EXTRACT(YEAR FROM u.game_date) = ${year}
        AND c.game_pk IS NULL
      ORDER BY u.game_date DESC
      LIMIT ${limit || 500}
    `,
  })

  if (gErr) throw new Error(`Challenge query failed: ${gErr.message}`)
  if (!games || games.length === 0) return { inserted: 0, errors: 0, games_processed: 0 }

  let inserted = 0
  let errors = 0
  const rows: ChallengeRow[] = []

  for (let i = 0; i < games.length; i++) {
    const g = games[i]
    try {
      const resp = await fetch(
        `https://statsapi.mlb.com/api/v1.1/game/${g.game_pk}/feed/live`,
        { signal: AbortSignal.timeout(15000) }
      )
      if (!resp.ok) { errors++; continue }

      const feedData = await resp.json()
      const challenges = extractChallenges(feedData, g.game_pk, g.game_date, g.hp_umpire, g.hp_umpire_id)
      rows.push(...challenges)
    } catch {
      errors++
    }

    // Batch upsert every 100 games or at the end
    if (rows.length >= 200 || i === games.length - 1) {
      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from('umpire_challenges').insert(rows)
        if (!error) inserted += rows.length
        else { console.error('Challenge insert error:', error.message); errors += rows.length }
        rows.length = 0
      }
    }

    // Rate limit every 50 requests
    if (i > 0 && i % 50 === 0) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  return { inserted, errors, games_processed: games.length }
}

// Cron GET handler
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncChallenges()
    return NextResponse.json({ ok: true, ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST handler for manual backfill
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { season, limit } = await req.json().catch(() => ({}))
    const result = await syncChallenges(season, limit)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
