import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

// ── Types ─────────────────────────────────────────────────────────────────
interface Appearance {
  pitcher: number
  player_name: string
  team: string
  game_pk: number
  game_date: string
  runs: number
  outs: number
  comp_pitches: number // competitive pitches (excl PO/IN), for SP/RP rule
}

interface StreakRow {
  pitcher: number
  name: string
  team: string
  outings: number
  outs: number
  ip: string // X.Y baseball notation
  start_date: string
  end_date: string
  active: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────
// Convert raw outs to baseball IP notation (10 outs -> "3.1")
function ipNotation(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

// Normalize "Last, First" -> "First Last"
function flipName(n: string): string {
  if (!n) return ''
  const parts = n.split(',')
  if (parts.length === 2) return `${parts[1].trim()} ${parts[0].trim()}`
  return n
}

const cache = new Map<string, { data: unknown; ts: number }>()

export async function GET(req: NextRequest) {
  const year = parseInt(req.nextUrl.searchParams.get('year') || '2026')
  if (year < 2015 || year > 2026) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  const cacheKey = `hot-${year}`
  const cached = cache.get(cacheKey)
  // 30 min in-memory cache
  if (cached && Date.now() - cached.ts < 1_800_000) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=300' },
    })
  }

  // One row per (pitcher, game_pk) appearance: runs charged + outs recorded + competitive pitch count.
  // Runs charged to the pitcher on the mound = sum of batting-team run deltas on PA-ending pitches.
  const sql = `
    SELECT
      pitcher,
      MAX(player_name) AS player_name,
      MAX(CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END) AS team,
      game_pk,
      MAX(game_date) AS game_date,
      SUM(CASE WHEN events IS NOT NULL THEN COALESCE(post_bat_score, 0) - COALESCE(bat_score, 0) ELSE 0 END) AS runs,
      SUM(CASE events
        WHEN 'strikeout' THEN 1
        WHEN 'field_out' THEN 1
        WHEN 'force_out' THEN 1
        WHEN 'sac_fly' THEN 1
        WHEN 'sac_bunt' THEN 1
        WHEN 'fielders_choice_out' THEN 1
        WHEN 'fielders_choice' THEN 1
        WHEN 'other_out' THEN 1
        WHEN 'caught_stealing_2b' THEN 1
        WHEN 'caught_stealing_3b' THEN 1
        WHEN 'caught_stealing_home' THEN 1
        WHEN 'pickoff_1b' THEN 1
        WHEN 'pickoff_2b' THEN 1
        WHEN 'pickoff_3b' THEN 1
        WHEN 'pickoff_caught_stealing_2b' THEN 1
        WHEN 'pickoff_caught_stealing_3b' THEN 1
        WHEN 'pickoff_caught_stealing_home' THEN 1
        WHEN 'grounded_into_double_play' THEN 2
        WHEN 'double_play' THEN 2
        WHEN 'strikeout_double_play' THEN 2
        WHEN 'sac_fly_double_play' THEN 2
        WHEN 'sac_bunt_double_play' THEN 2
        WHEN 'triple_play' THEN 3
        ELSE 0
      END) AS outs,
      COUNT(*) FILTER (WHERE pitch_type NOT IN ('PO', 'IN') OR pitch_type IS NULL) AS comp_pitches
    FROM pitches
    WHERE game_year = ${year}
      AND game_type = 'R'
    GROUP BY pitcher, game_pk
    ORDER BY pitcher, game_date, game_pk
  `

  const { data, error } = await q(sql)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows: Appearance[] = (data || []).map((r: Record<string, unknown>) => ({
    pitcher: Number(r.pitcher),
    player_name: String(r.player_name ?? ''),
    team: String(r.team ?? ''),
    game_pk: Number(r.game_pk),
    game_date: String(r.game_date),
    runs: Number(r.runs ?? 0),
    outs: Number(r.outs ?? 0),
    comp_pitches: Number(r.comp_pitches ?? 0),
  }))

  // Group appearances by pitcher (rows already ordered by pitcher, date).
  const byPitcher = new Map<number, Appearance[]>()
  for (const a of rows) {
    if (!byPitcher.has(a.pitcher)) byPitcher.set(a.pitcher, [])
    byPitcher.get(a.pitcher)!.push(a)
  }

  // Latest regular-season game date across all RP — used to flag "active" streaks.
  const latestDate = rows.reduce((m, r) => (r.game_date > m ? r.game_date : m), '')

  const active: StreakRow[] = []
  const completed: StreakRow[] = []

  for (const [pid, apps] of byPitcher) {
    // SP/RP rule: SP if >=3 games with 50+ competitive pitches. Keep RP only.
    const bigGames = apps.filter(a => a.comp_pitches >= 50).length
    if (bigGames >= 3) continue

    const name = flipName(apps[0].player_name)
    const team = apps[apps.length - 1].team // most recent team

    // Walk appearances, accumulating maximal consecutive scoreless runs (islands).
    // A streak is "active" if it's the pitcher's trailing island AND their last
    // appearance was scoreless — i.e. nothing has broken it yet (idle days are fine).
    // The Active list gets the active streak; the Completed list gets the longest
    // ENDED streak (an active streak hasn't completed, so it's excluded there).
    let curOuts = 0, curOutings = 0, curStart = '', curEnd = ''
    let bestEnded: StreakRow | null = null
    const flush = (endsAtLast: boolean) => {
      if (curOutings === 0) return
      const row: StreakRow = {
        pitcher: pid, name, team,
        outings: curOutings, outs: curOuts, ip: ipNotation(curOuts),
        start_date: curStart, end_date: curEnd,
        active: endsAtLast,
      }
      if (endsAtLast) {
        active.push(row)
      } else if (!bestEnded || curOuts > bestEnded.outs || (curOuts === bestEnded.outs && curOutings > bestEnded.outings)) {
        bestEnded = row
      }
    }

    for (let i = 0; i < apps.length; i++) {
      const a = apps[i]
      if (a.runs === 0) {
        if (curOutings === 0) curStart = a.game_date
        curOuts += a.outs
        curOutings += 1
        curEnd = a.game_date
      } else {
        flush(false)
        curOuts = 0; curOutings = 0; curStart = ''; curEnd = ''
      }
    }
    // Trailing island: active if the pitcher's most recent appearance was scoreless.
    flush(apps[apps.length - 1].runs === 0)

    if (bestEnded) completed.push(bestEnded)
  }

  const rank = (arr: StreakRow[]) =>
    arr.sort((a, b) => b.outs - a.outs || b.outings - a.outings).slice(0, 25)

  const payload = {
    year,
    latestDate,
    active: rank(active),
    completed: rank(completed),
  }

  cache.set(cacheKey, { data: payload, ts: Date.now() })
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=300' },
  })
}
