import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

/**
 * GET /api/pitcher-outing
 *
 * Mode A — Game list:
 *   ?games=true&pitcherId=X&season=Y
 *   Returns list of games with opponent, pitch count, IP estimate
 *
 * Mode B — Outing data:
 *   ?pitcherId=X&gamePk=Y
 *   Returns full outing data: boxscore, arsenal, locations, command
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const pitcherId = sp.get('pitcherId')

    if (!pitcherId) return NextResponse.json({ error: 'pitcherId required' }, { status: 400 })

    // ── Mode A: Game List ────────────────────────────────────────────────
    if (sp.get('games') === 'true') {
      const season = sp.get('season') || '2025'

      const sql = `
        SELECT
          game_pk,
          game_date::text AS game_date,
          MODE() WITHIN GROUP (ORDER BY CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END) AS opponent,
          COUNT(*) AS pitches,
          ROUND(SUM(CASE WHEN COALESCE(events, '') != '' THEN 1 ELSE 0 END)::numeric / 3, 1) AS ip_est
        FROM pitches
        WHERE pitcher = ${pitcherId}
          AND game_year = ${season}
        GROUP BY game_pk, game_date
        ORDER BY game_date DESC
      `

      const { data, error } = await q(sql)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const games = (data || []).map((r: any) => ({
        game_pk: r.game_pk,
        game_date: r.game_date,
        opponent: r.opponent || '??',
        pitches: Number(r.pitches),
        ip: String(r.ip_est ?? '?'),
      }))

      return NextResponse.json({ games })
    }

    // ── Mode B: Outing Data ──────────────────────────────────────────────
    const gamePk = sp.get('gamePk')
    if (!gamePk) return NextResponse.json({ error: 'gamePk required' }, { status: 400 })

    // Run queries in parallel
    const [boxscoreRes, arsenalRes, locationsRes, metaRes, commandRes] = await Promise.all([
      // 1. MLB Stats API boxscore
      fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`).then(r => r.json()).catch(() => null),

      // 2. Arsenal breakdown
      q(`
        SELECT
          pitch_name,
          COUNT(*) AS count,
          ROUND(AVG(release_speed)::numeric, 1) AS avg_velo,
          ROUND(AVG(pfx_z * 12)::numeric, 1) AS avg_ivb,
          ROUND(AVG(pfx_x * 12)::numeric, 1) AS avg_hbreak,
          ROUND(AVG(arm_angle)::numeric, 1) AS avg_arm_angle,
          ROUND(AVG(release_extension)::numeric, 1) AS avg_ext
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk}
          AND pitch_name IS NOT NULL
        GROUP BY pitch_name
        ORDER BY count DESC
      `),

      // 3. Pitch locations
      q(`
        SELECT plate_x, plate_z, pitch_name
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk}
          AND plate_x IS NOT NULL AND plate_z IS NOT NULL
      `),

      // 4. Game metadata (opponent, date, pitcher name)
      q(`
        SELECT
          game_date::text AS game_date,
          MODE() WITHIN GROUP (ORDER BY CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END) AS opponent
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk}
        GROUP BY game_date
        LIMIT 1
      `),

      // 5. Season-level command metrics (per pitch type)
      q(`
        SELECT pitch_name, pitches, waste_pct, avg_missfire, avg_brink, cmd_plus
        FROM pitcher_season_command
        WHERE pitcher = ${pitcherId}
          AND game_year = (SELECT game_year FROM pitches WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk} LIMIT 1)
      `),
    ])

    // Extract boxscore pitcher line
    let gameLine = { ip: '?', h: 0, r: 0, er: 0, bb: 0, k: 0, pitches: 0 }
    if (boxscoreRes) {
      const pid = Number(pitcherId)
      for (const side of ['home', 'away'] as const) {
        const pitchers = boxscoreRes?.teams?.[side]?.pitchers || []
        if (pitchers.includes(pid)) {
          const pStats = boxscoreRes?.teams?.[side]?.players?.[`ID${pid}`]?.stats?.pitching
          if (pStats) {
            gameLine = {
              ip: pStats.inningsPitched || '?',
              h: pStats.hits ?? 0,
              r: pStats.runs ?? 0,
              er: pStats.earnedRuns ?? 0,
              bb: pStats.baseOnBalls ?? 0,
              k: pStats.strikeOuts ?? 0,
              pitches: pStats.numberOfPitches ?? 0,
            }
          }
          break
        }
      }
    }

    // Get pitcher name from players table
    const { data: playerRow } = await q(`SELECT player_name FROM players WHERE id = ${pitcherId} LIMIT 1`)
    const pitcherName = playerRow?.[0]?.player_name || 'Unknown'

    const meta = metaRes.data?.[0] || {}

    // Build per-pitch-type command lookup from season data
    const cmdByPitch: Record<string, { avg_missfire: number | null; avg_brink: number | null; cmd_plus: number | null }> = {}
    for (const r of (commandRes.data || [])) {
      cmdByPitch[r.pitch_name] = {
        avg_missfire: r.avg_missfire != null ? Number(r.avg_missfire) : null,
        avg_brink: r.avg_brink != null ? Number(r.avg_brink) : null,
        cmd_plus: r.cmd_plus != null ? Number(r.cmd_plus) : null,
      }
    }

    const arsenal = (arsenalRes.data || []).map((r: any) => {
      const cmdRow = cmdByPitch[r.pitch_name] || {}
      return {
        pitch_name: r.pitch_name,
        count: Number(r.count),
        avg_velo: Number(r.avg_velo),
        avg_ivb: Number(r.avg_ivb),
        avg_hbreak: Number(r.avg_hbreak),
        avg_arm_angle: Number(r.avg_arm_angle),
        avg_ext: Number(r.avg_ext),
        avg_missfire: cmdRow.avg_missfire ?? null,
        avg_brink: cmdRow.avg_brink ?? null,
        cmd_plus: cmdRow.cmd_plus ?? null,
      }
    })

    const locations = (locationsRes.data || []).map((r: any) => ({
      plate_x: Number(r.plate_x),
      plate_z: Number(r.plate_z),
      pitch_name: r.pitch_name,
    }))

    // Aggregate season-level command totals
    const allCmdRows = commandRes.data || []
    const totalPitches = allCmdRows.reduce((s: number, r: any) => s + (Number(r.pitches) || 0), 0)
    let aggWaste: number | null = null
    let aggMissfire: number | null = null
    let aggBrink: number | null = null
    if (totalPitches > 0) {
      let ws = 0, ms = 0, bs = 0, wc = 0, mc = 0, bc = 0
      for (const r of allCmdRows) {
        const n = Number(r.pitches) || 0
        if (r.waste_pct != null) { ws += Number(r.waste_pct) * n; wc += n }
        if (r.avg_missfire != null) { ms += Number(r.avg_missfire) * n; mc += n }
        if (r.avg_brink != null) { bs += Number(r.avg_brink) * n; bc += n }
      }
      if (wc > 0) aggWaste = ws / wc
      if (mc > 0) aggMissfire = ms / mc
      if (bc > 0) aggBrink = bs / bc
    }

    const outing = {
      pitcher_id: Number(pitcherId),
      pitcher_name: pitcherName,
      game_date: meta.game_date || '',
      opponent: meta.opponent || '??',
      game_line: gameLine,
      arsenal,
      locations,
      command: {
        waste_pct: aggWaste,
        avg_missfire: aggMissfire,
        avg_brink: aggBrink,
      },
    }

    return NextResponse.json({ outing })
  } catch (err: any) {
    console.error('pitcher-outing error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
