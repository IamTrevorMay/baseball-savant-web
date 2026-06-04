import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { computeOutingCommand, PitchRow } from '@/lib/outingCommand'
import { computeStuffRV } from '@/lib/leagueStats'

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

      return NextResponse.json({ games }, {
        headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
      })
    }

    // ── Mode B: Outing Data ──────────────────────────────────────────────
    const gamePk = sp.get('gamePk')
    if (!gamePk) return NextResponse.json({ error: 'gamePk required' }, { status: 400 })

    // Run queries in parallel (3 DB queries + 1 external fetch, down from 6)
    // Merged: arsenal, locations, metadata, and pitch-level into one query
    const [boxscoreRes, allPitchesRes, deceptionRes] = await Promise.all([
      // 1. MLB Stats API boxscore
      fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`).then(r => r.json()).catch(() => null),

      // 2. All pitches for this outing (replaces 4 separate queries)
      q(`
        SELECT pitch_name, pitch_type, description, stuff_plus, p_throws, stand,
               release_speed, pfx_x, pfx_z, release_spin_rate, spin_axis,
               release_extension, release_pos_x, release_pos_z, arm_angle,
               plate_x, plate_z, sz_top, sz_bot, zone,
               vx0, vy0, vz0, ax, ay, az, game_year,
               game_date::text AS game_date, inning_topbot, home_team, away_team
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk}
      `),

      // 3. Season-level deception scores
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
    const { data: playerRow } = await q(`SELECT name FROM players WHERE id = ${pitcherId} LIMIT 1`)
    const pitcherName = playerRow?.[0]?.name || 'Unknown'

    const allPitches: any[] = allPitchesRes.data || []
    if (allPitchesRes.error) return NextResponse.json({ error: allPitchesRes.error.message }, { status: 500 })

    // Extract metadata from first row
    const firstRow = allPitches[0] || {}
    const gameDate = firstRow.game_date || ''
    // Compute opponent: most common opposing team
    const teamCounts: Record<string, number> = {}
    for (const p of allPitches) {
      const opp = p.inning_topbot === 'Top' ? p.away_team : p.home_team
      if (opp) teamCounts[opp] = (teamCounts[opp] || 0) + 1
    }
    const opponent = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '??'

    // Filter to named pitches (exclude PO/IN)
    const namedPitches = allPitches.filter((p: any) => p.pitch_name != null && p.pitch_type !== 'PO' && p.pitch_type !== 'IN')

    // Compute outing-level command metrics from pitch locations
    const pitchRows: PitchRow[] = allPitches
      .filter((r: any) => r.plate_x != null && r.plate_z != null)
      .map((r: any) => ({
        plate_x: Number(r.plate_x),
        plate_z: Number(r.plate_z),
        pitch_name: r.pitch_name,
        sz_top: Number(r.sz_top),
        sz_bot: Number(r.sz_bot),
        zone: Number(r.zone),
        game_year: Number(r.game_year),
        description: r.description || '',
        stand: r.stand || '',
      }))

    const cmd = computeOutingCommand(pitchRows)

    // Group named pitches by type for arsenal stats, whiffs, and stuff+
    const pitchByType: Record<string, any[]> = {}
    for (const p of namedPitches) {
      if (!pitchByType[p.pitch_name]) pitchByType[p.pitch_name] = []
      pitchByType[p.pitch_name].push(p)
    }

    const whiffsByType: Record<string, number> = {}
    const stuffPlusByType: Record<string, number | null> = {}
    for (const [name, pts] of Object.entries(pitchByType)) {
      whiffsByType[name] = pts.filter((p: any) =>
        typeof p.description === 'string' && p.description.includes('swinging_strike')
      ).length

      const stuffArr = pts.map((p: any) => {
        if (p.stuff_plus != null) return Number(p.stuff_plus)
        return computeStuffRV(p)
      }).filter((x): x is number => x != null)
      stuffPlusByType[name] = stuffArr.length > 0
        ? Math.round(stuffArr.reduce((s, v) => s + v, 0) / stuffArr.length)
        : null
    }

    // Build deception lookup
    const deceptionByType: Record<string, { unique_score: number | null; deception_score: number | null }> = {}
    for (const r of (deceptionRes.data || [])) {
      deceptionByType[r.pitch_name] = {
        unique_score: r.unique_score != null ? Number(r.unique_score) : null,
        deception_score: r.deception_score != null ? Number(r.deception_score) : null,
      }
    }

    // Compute arsenal stats in JS from raw pitch rows (replaces SQL GROUP BY)
    const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d
    const notNull = (v: number | null | undefined): v is number => v != null
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
    const arsenal = Object.entries(pitchByType)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, pts]) => {
        const cmdRow = cmd.byPitch[name] || {}
        const dec = deceptionByType[name] || {}
        return {
          pitch_name: name,
          count: pts.length,
          avg_velo: round(avg(pts.map((p: any) => p.release_speed as number | null).filter(notNull)), 1),
          avg_ivb: round(avg(pts.map((p: any) => p.pfx_z != null ? p.pfx_z * 12 : null).filter(notNull)), 1),
          avg_hbreak: round(avg(pts.map((p: any) => p.pfx_x != null ? p.pfx_x * 12 : null).filter(notNull)), 1),
          avg_arm_angle: round(avg(pts.map((p: any) => p.arm_angle as number | null).filter(notNull)), 1),
          avg_ext: round(avg(pts.map((p: any) => p.release_extension as number | null).filter(notNull)), 1),
          whiffs: whiffsByType[name] || 0,
          stuff_plus: stuffPlusByType[name] ?? null,
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
      game_date: gameDate,
      opponent,
      game_line: gameLine,
      arsenal,
      locations,
      command: cmd.aggregate,
    }

    return NextResponse.json({ outing }, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
    })
  } catch (err: any) {
    console.error('pitcher-outing error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
