import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { computeOutingCommand, PitchRow } from '@/lib/outingCommand'
import { computeStuffRV, computePlus, getLeagueBaseline } from '@/lib/leagueStats'

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
      const season = sp.get('season') || '2026'

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

    // Run queries in parallel (6 queries)
    const [boxscoreRes, arsenalRes, locationsRes, metaRes, pitchLevelRes, deceptionRes] = await Promise.all([
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

      // 3. Pitch locations + zone data for command computation
      q(`
        SELECT plate_x, plate_z, pitch_name, sz_top, sz_bot, zone, game_year
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk}
          AND plate_x IS NOT NULL AND plate_z IS NOT NULL
      `),

      // 4. Game metadata (opponent, date)
      q(`
        SELECT
          game_date::text AS game_date,
          MODE() WITHIN GROUP (ORDER BY CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END) AS opponent
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk}
        GROUP BY game_date
        LIMIT 1
      `),

      // 5. Pitch-level data for stuff+ and whiffs
      q(`
        SELECT pitch_name, description, stuff_plus, p_throws,
               release_speed, pfx_x, pfx_z, release_spin_rate, spin_axis,
               release_extension, release_pos_x, release_pos_z, arm_angle,
               vx0, vy0, vz0, ax, ay, az, game_year
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk}
          AND pitch_name IS NOT NULL
      `),

      // 6. Season-level deception scores
      q(`
        SELECT pitch_name, unique_score, deception_score
        FROM pitcher_season_deception
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

    // Compute outing-level command metrics from pitch locations
    const pitchRows: PitchRow[] = (locationsRes.data || []).map((r: any) => ({
      plate_x: Number(r.plate_x),
      plate_z: Number(r.plate_z),
      pitch_name: r.pitch_name,
      sz_top: Number(r.sz_top),
      sz_bot: Number(r.sz_bot),
      zone: Number(r.zone),
      game_year: Number(r.game_year),
    }))

    const cmd = computeOutingCommand(pitchRows)

    // Compute per-pitch-type whiffs and stuff+ from pitch-level data
    const rawPitches: any[] = pitchLevelRes.data || []
    const pitchByType: Record<string, any[]> = {}
    for (const p of rawPitches) {
      const name = p.pitch_name
      if (!pitchByType[name]) pitchByType[name] = []
      pitchByType[name].push(p)
    }

    const whiffsByType: Record<string, number> = {}
    const stuffPlusByType: Record<string, number | null> = {}
    for (const [name, pts] of Object.entries(pitchByType)) {
      // Whiffs: count swinging strikes
      whiffsByType[name] = pts.filter((p: any) =>
        typeof p.description === 'string' && p.description.includes('swinging_strike')
      ).length

      // Stuff+: average DB column, fallback to computeStuffRV + computePlus
      const stuffArr = pts.filter((p: any) => p.stuff_plus != null).map((p: any) => Number(p.stuff_plus))
      if (stuffArr.length > 0) {
        stuffPlusByType[name] = Math.round(stuffArr.reduce((s, v) => s + v, 0) / stuffArr.length)
      } else {
        // Fallback: compute from pitch mechanics
        const year = pts[0]?.game_year || 2025
        const rvArr = pts.map((p: any) => computeStuffRV(p)).filter((v): v is number => v != null)
        const league = getLeagueBaseline('stuff', name, year)
        if (rvArr.length > 0 && league) {
          const avgRV = rvArr.reduce((s, v) => s + v, 0) / rvArr.length
          stuffPlusByType[name] = Math.round(computePlus(avgRV, league.mean, league.stddev))
        } else {
          stuffPlusByType[name] = null
        }
      }
    }

    // Build deception lookup
    const deceptionByType: Record<string, { unique_score: number | null; deception_score: number | null }> = {}
    for (const r of (deceptionRes.data || [])) {
      deceptionByType[r.pitch_name] = {
        unique_score: r.unique_score != null ? Number(r.unique_score) : null,
        deception_score: r.deception_score != null ? Number(r.deception_score) : null,
      }
    }

    const arsenal = (arsenalRes.data || []).map((r: any) => {
      const cmdRow = cmd.byPitch[r.pitch_name] || {}
      const dec = deceptionByType[r.pitch_name] || {}
      return {
        pitch_name: r.pitch_name,
        count: Number(r.count),
        avg_velo: Number(r.avg_velo),
        avg_ivb: Number(r.avg_ivb),
        avg_hbreak: Number(r.avg_hbreak),
        avg_arm_angle: Number(r.avg_arm_angle),
        avg_ext: Number(r.avg_ext),
        whiffs: whiffsByType[r.pitch_name] || 0,
        stuff_plus: stuffPlusByType[r.pitch_name] ?? null,
        unique_score: dec.unique_score ?? null,
        deception_score: dec.deception_score ?? null,
        cmd_plus: cmdRow.cmd_plus ?? null,
      }
    })

    const locations = pitchRows.map((r) => ({
      plate_x: r.plate_x,
      plate_z: r.plate_z,
      pitch_name: r.pitch_name,
    }))

    const outing = {
      pitcher_id: Number(pitcherId),
      pitcher_name: pitcherName,
      game_date: meta.game_date || '',
      opponent: meta.opponent || '??',
      game_line: gameLine,
      arsenal,
      locations,
      command: cmd.aggregate,
    }

    return NextResponse.json({ outing })
  } catch (err: any) {
    console.error('pitcher-outing error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
