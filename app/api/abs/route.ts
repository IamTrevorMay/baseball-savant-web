import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Use admin client when available, fall back to anon (works when RLS is off)
const writeClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseAdmin : supabase

// --- Helpers ---

/** Extract a JS variable from Savant HTML: var/let/const name = <value>; */
function extractVar(html: string, varName: string): unknown {
  const re = new RegExp(`(?:var|let|const)\\s+${varName}\\s*=\\s*`)
  const m = re.exec(html)
  if (!m) return null
  let i = m.index + m[0].length
  // Find start of value
  while (i < html.length && html[i] === ' ') i++
  const startChar = html[i]
  if (startChar === '[' || startChar === '{') {
    // Balanced bracket parser
    const open = startChar
    const close = open === '[' ? ']' : '}'
    let depth = 0
    const start = i
    for (; i < html.length; i++) {
      if (html[i] === open) depth++
      else if (html[i] === close) { depth--; if (depth === 0) break }
      else if (html[i] === '"' || html[i] === "'") {
        const q = html[i]; i++
        while (i < html.length && html[i] !== q) { if (html[i] === '\\') i++; i++ }
      }
    }
    try { return JSON.parse(html.slice(start, i + 1)) } catch { return null }
  }
  // Primitive value
  const rest = html.slice(i)
  const semi = rest.indexOf(';')
  const raw = (semi >= 0 ? rest.slice(0, semi) : rest).trim()
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  const num = Number(raw)
  if (!isNaN(num) && raw.length > 0) return num
  try { return JSON.parse(raw) } catch { return raw }
}

const TEAM_ID_TO_ABBR: Record<number, string> = {
  108:'LAA',109:'ARI',110:'BAL',111:'BOS',112:'CHC',113:'CIN',114:'CLE',
  115:'COL',116:'DET',117:'HOU',118:'KC',119:'LAD',120:'WSH',121:'NYM',
  133:'OAK',134:'PIT',135:'SD',136:'SEA',137:'SF',138:'STL',139:'TB',
  140:'TEX',141:'TOR',142:'MIN',143:'PHI',144:'ATL',145:'CWS',146:'MIA',
  147:'NYY',158:'MIL',
}

type GameType = 'S' | 'R' | 'P'

function gameTypeParam(gt: GameType): string {
  if (gt === 'S') return 'S'
  if (gt === 'P') return 'P'
  return 'R'
}

// --- Sync action ---

export async function syncData(year: number, gameType: GameType = 'R', level: string = 'MLB') {
  const gt = gameTypeParam(gameType)
  const baseUrl = `https://baseballsavant.mlb.com/abs?year=${year}&gameType=${gt}&level=${level}`
  const res = await fetch(baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Savant fetch failed: ${res.status}`)
  const html = await res.text()

  // Parse embedded JS variables
  // breakdownData is a 2D array: [batter[], fielder[], all[]]
  const breakdownData = extractVar(html, 'breakdownData') as Record<string, unknown>[][] | null
  const absSummaryData = extractVar(html, 'absSummaryData') as Record<string, unknown>[] | null
  const batterSummaryData = extractVar(html, 'batterSummaryData') as Record<string, unknown>[] | null
  const fielderSummaryData = extractVar(html, 'fielderSummaryData') as Record<string, unknown>[] | null
  const teamData = extractVar(html, 'teamData') as Record<string, unknown>[] | null

  // Helper: extract date portion from ISO string
  const toDate = (v: unknown) => {
    const s = String(v || '')
    return s.includes('T') ? s.split('T')[0] : s
  }

  // --- Daily summary ---
  const dailyRows: Record<string, unknown>[] = []
  const addDaily = (rows: Record<string, unknown>[] | null, source: string) => {
    if (!rows) return
    for (const r of rows) {
      dailyRows.push({
        year, game_type: gameType, level, source,
        game_date: toDate(r.game_date),
        challenges: Number(r.challenges || 0),
        overturns: Number(r.overturns || 0),
        overturn_rate: r.overturn_rate != null ? Number(r.overturn_rate) : null,
        tot_pitches: Number(r.tot_pitches || 0),
        chal_rate: r.chal_rate != null ? Number(r.chal_rate) : null,
        rolling_overturn_rate_week: r.rolling_overturn_rate_week != null ? Number(r.rolling_overturn_rate_week) : null,
        rolling_chal_rate_week: r.rolling_chal_rate_week != null ? Number(r.rolling_chal_rate_week) : null,
      })
    }
  }
  addDaily(absSummaryData, 'all')
  addDaily(batterSummaryData, 'batter')
  addDaily(fielderSummaryData, 'fielder')

  if (dailyRows.length > 0) {
    const { error } = await writeClient.from('abs_daily_summary').upsert(dailyRows, {
      onConflict: 'year,game_type,level,source,game_date',
    })
    if (error) throw new Error(`Daily upsert: ${error.message}`)
  }

  // --- Breakdowns ---
  // breakdownData is [[batter items], [fielder items], [all items]]
  const breakdownRows: Record<string, unknown>[] = []
  if (breakdownData && Array.isArray(breakdownData)) {
    const sourceLabels = ['batter', 'fielder', 'all']
    for (let si = 0; si < breakdownData.length && si < 3; si++) {
      const items = breakdownData[si]
      if (!Array.isArray(items)) continue
      for (const r of items) {
        breakdownRows.push({
          year, game_type: gameType, level, source: sourceLabels[si],
          breakdown_key: String(r.key || ''),
          challenges: Number(r.challenges || 0),
          overturns: Number(r.overturns || 0),
          rate: r.rate != null ? Number(r.rate) : null,
          pitches: Number(r.pitches || 0),
          chal_rate: r.chal_rate != null ? Number(r.chal_rate) : null,
        })
      }
    }
  }

  if (breakdownRows.length > 0) {
    const { error } = await writeClient.from('abs_breakdown').upsert(breakdownRows, {
      onConflict: 'year,game_type,level,source,breakdown_key',
    })
    if (error) throw new Error(`Breakdown upsert: ${error.message}`)
  }

  // --- Teams ---
  // teamData uses `id` (string) for team ID
  const teamRows: Record<string, unknown>[] = []
  if (teamData) {
    for (const r of teamData) {
      const teamId = Number(r.id || 0)
      teamRows.push({
        year, game_type: gameType, level,
        team_id: teamId,
        team_abbr: TEAM_ID_TO_ABBR[teamId] || '',
        bat_for: Number(r.bat_for || 0),
        fld_for: Number(r.fld_for || 0),
        bat_against: Number(r.bat_against || 0),
        fld_against: Number(r.fld_against || 0),
      })
    }
  }

  if (teamRows.length > 0) {
    const { error } = await writeClient.from('abs_team').upsert(teamRows, {
      onConflict: 'year,game_type,level,team_id',
    })
    if (error) throw new Error(`Team upsert: ${error.message}`)
  }

  // --- Player leaderboard ---
  // Leaderboard page uses `id` for player_id, `player_name`, `team_abbr`
  for (const challengeType of ['batter', 'pitcher', 'catcher']) {
    const leaderUrl = `https://baseballsavant.mlb.com/leaderboard/abs-challenges?year=${year}&challengeType=${challengeType}`
    const lRes = await fetch(leaderUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!lRes.ok) continue
    const lHtml = await lRes.text()
    const absData = extractVar(lHtml, 'absData') as Record<string, unknown>[] | null
    if (!absData || absData.length === 0) continue

    const playerRows = absData.map(r => ({
      year, game_type: gameType, level,
      challenge_type: challengeType,
      player_id: Number(r.id || 0),
      player_name: String(r.player_name || ''),
      team_abbr: String(r.team_abbr || ''),
      n_total_sample: Number(r.n_total_sample || 0),
      n_challenges: Number(r.n_challenges || 0),
      n_overturns: Number(r.n_overturns || 0),
      n_fails: Number(r.n_fails || 0),
      n_strikeouts: Number(r.n_strikeouts || 0),
      n_walks: Number(r.n_walks || 0),
      rate_challenges: r.rate_challenges != null ? Number(r.rate_challenges) : null,
      exp_rate_challenges: r.exp_rate_challenges != null ? Number(r.exp_rate_challenges) : null,
      rate_overturns: r.rate_overturns != null ? Number(r.rate_overturns) : null,
      exp_rate_overturns: r.exp_rate_overturns != null ? Number(r.exp_rate_overturns) : null,
      exp_chal: r.exp_chal != null ? Number(r.exp_chal) : null,
      net_net_chal: r.net_net_chal != null ? Number(r.net_net_chal) : null,
      overturns_vs_exp: r.overturns_vs_exp != null ? Number(r.overturns_vs_exp) : null,
      n_challenges_against: Number(r.n_challenges_against || 0),
      n_overturns_against: Number(r.n_overturns_against || 0),
      rate_overturns_against: r.rate_overturns_against != null ? Number(r.rate_overturns_against) : null,
      net_net_chal_against: r.net_net_chal_against != null ? Number(r.net_net_chal_against) : null,
    }))

    const { error } = await writeClient.from('abs_player').upsert(playerRows, {
      onConflict: 'year,game_type,level,challenge_type,player_id',
    })
    if (error) throw new Error(`Player upsert (${challengeType}): ${error.message}`)
  }

  return {
    daily: dailyRows.length,
    breakdowns: breakdownRows.length,
    teams: teamRows.length,
  }
}

// --- Route handler ---

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'sync') {
    try {
      const year = Number(body.year || 2026)
      const gameType = (body.gameType || 'R') as GameType
      const level = body.level || 'MLB'
      const result = await syncData(year, gameType, level)
      return NextResponse.json({ ok: true, ...result })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  if (action === 'dashboard') {
    const year = Number(body.year || 2026)
    const gameType = body.gameType || 'R'
    const level = body.level || 'MLB'

    const [dailyRes, breakdownRes, teamRes] = await Promise.all([
      supabase.from('abs_daily_summary')
        .select('*')
        .eq('year', year).eq('game_type', gameType).eq('level', level)
        .order('game_date', { ascending: true }),
      supabase.from('abs_breakdown')
        .select('*')
        .eq('year', year).eq('game_type', gameType).eq('level', level),
      supabase.from('abs_team')
        .select('*')
        .eq('year', year).eq('game_type', gameType).eq('level', level)
        .order('team_abbr', { ascending: true }),
    ])

    for (const r of [dailyRes, breakdownRes, teamRes]) {
      if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 })
    }

    const daily = dailyRes.data || []
    const allDaily = daily.filter(r => r.source === 'all')
    const batterDaily = daily.filter(r => r.source === 'batter')
    const fielderDaily = daily.filter(r => r.source === 'fielder')

    const breakdowns = breakdownRes.data || []
    const batterBreakdown = breakdowns.filter(r => r.source === 'batter')
    const fielderBreakdown = breakdowns.filter(r => r.source === 'fielder')
    const allBreakdown = breakdowns.filter(r => r.source === 'all')

    // Compute aggregate summary from daily "all" rows
    const totChal = allDaily.reduce((s, r) => s + (r.challenges || 0), 0)
    const totOver = allDaily.reduce((s, r) => s + (r.overturns || 0), 0)
    const totPitches = allDaily.reduce((s, r) => s + (r.tot_pitches || 0), 0)

    return NextResponse.json({
      daily: { all: allDaily, batter: batterDaily, fielder: fielderDaily },
      breakdown: { batter: batterBreakdown, fielder: fielderBreakdown, all: allBreakdown },
      teams: teamRes.data || [],
      summary: {
        challenges: totChal,
        overturns: totOver,
        overturn_rate: totChal > 0 ? totOver / totChal : 0,
        chal_rate: totPitches > 0 ? totChal / totPitches : 0,
        pitches: totPitches,
      },
    })
  }

  if (action === 'leaderboard') {
    const year = Number(body.year || 2026)
    const gameType = body.gameType || 'R'
    const level = body.level || 'MLB'
    const challengeType = body.challengeType || 'batter'
    const minChal = Number(body.minChal || 0)

    let q = supabase.from('abs_player')
      .select('*')
      .eq('year', year).eq('game_type', gameType).eq('level', level)
      .eq('challenge_type', challengeType)

    if (minChal > 0) q = q.gte('n_challenges', minChal)

    const { data, error } = await q.order('n_challenges', { ascending: false }).limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  }

  if (action === 'umpires') {
    const year = Number(body.year || 2026)
    const gameType = body.gameType || 'R'
    const minGames = Number(body.minGames || 1)

    // Zone constants (same as umpire route)
    const IN_ZONE = `(ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top)`
    const CORRECT = `((${IN_ZONE} AND p.type = 'S') OR (NOT ${IN_ZONE} AND p.type = 'B'))`
    const EXPANDED = `(ABS(p.plate_x) <= 0.913 AND p.plate_z >= p.sz_bot - 0.083 AND p.plate_z <= p.sz_top + 0.083)`
    const CONTRACTED = `(ABS(p.plate_x) <= 0.747 AND p.plate_z >= p.sz_bot + 0.083 AND p.plate_z <= p.sz_top - 0.083)`
    const NOT_SHADOW = `(NOT (${EXPANDED} AND NOT ${CONTRACTED}))`
    const UMP_BASE_WHERE = `p.type IN ('B', 'S') AND p.plate_x IS NOT NULL AND p.sz_top IS NOT NULL AND p.pitch_type NOT IN ('PO', 'IN')`

    const gtFilter = gameType && ['R', 'S', 'P'].includes(gameType)
      ? `AND p.game_type = '${gameType}'`
      : ''

    const sql = `
      SELECT u.hp_umpire,
        COUNT(DISTINCT u.game_pk) as games,
        COUNT(*) as called_pitches,
        COUNT(*) FILTER (WHERE NOT ${CORRECT}) as missed_calls,
        ROUND(COUNT(*) FILTER (WHERE NOT ${CORRECT})::numeric / NULLIF(COUNT(*), 0), 4) as miss_rate,
        COUNT(*) FILTER (WHERE p.type = 'S' AND NOT ${IN_ZONE}) as bad_strikes,
        COUNT(*) FILTER (WHERE p.type = 'B' AND ${IN_ZONE}) as bad_balls,
        COUNT(*) FILTER (WHERE ${NOT_SHADOW}) as non_shadow_pitches,
        COUNT(*) FILTER (WHERE ${NOT_SHADOW} AND NOT ${CORRECT}) as non_shadow_missed,
        ROUND(COUNT(*) FILTER (WHERE ${NOT_SHADOW} AND NOT ${CORRECT})::numeric / NULLIF(COUNT(*) FILTER (WHERE ${NOT_SHADOW}), 0), 4) as non_shadow_miss_rate
      FROM game_umpires u
      JOIN pitches p ON p.game_pk = u.game_pk AND p.game_year = ${year} ${gtFilter}
      WHERE ${UMP_BASE_WHERE}
      GROUP BY u.hp_umpire
      HAVING COUNT(DISTINCT u.game_pk) >= ${minGames}
      ORDER BY missed_calls DESC
      LIMIT 100
    `

    const { data, error } = await supabase.rpc('run_query', { query_text: sql.trim() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  }

  if (action === 'filters') {
    const { data, error } = await supabase.from('abs_daily_summary')
      .select('year,game_type,level')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Deduplicate
    const seen = new Set<string>()
    const unique = (data || []).filter(r => {
      const key = `${r.year}-${r.game_type}-${r.level}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })
    return NextResponse.json(unique)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
