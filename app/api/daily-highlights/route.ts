import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { computeOutingCommand, PitchRow } from '@/lib/outingCommand'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

interface GameLine {
  ip: string; h: number; r: number; er: number; bb: number; k: number
  pitches: number; decision: string // W, L, ND, HLD, SV
}

async function fetchPitcherGameLine(gamePk: number, pitcherId: number): Promise<GameLine | null> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`)
    if (!res.ok) return null
    const box = await res.json()
    for (const side of ['home', 'away'] as const) {
      const pitchers = box?.teams?.[side]?.pitchers || []
      if (pitchers.includes(pitcherId)) {
        const p = box?.teams?.[side]?.players?.[`ID${pitcherId}`]
        const s = p?.stats?.pitching
        if (!s) return null
        let decision = 'ND'
        const note: string = s.note || ''
        if (s.wins >= 1 || note.includes('W')) decision = 'W'
        else if (s.losses >= 1 || note.includes('L')) decision = 'L'
        else if (s.holds >= 1 || note.includes('H')) decision = 'HLD'
        else if (s.saves >= 1 || note.includes('S')) decision = 'SV'
        return {
          ip: s.inningsPitched || '0.0',
          h: s.hits ?? 0, r: s.runs ?? 0, er: s.earnedRuns ?? 0,
          bb: s.baseOnBalls ?? 0, k: s.strikeOuts ?? 0,
          pitches: s.numberOfPitches ?? 0, decision,
        }
      }
    }
    return null
  } catch { return null }
}

export async function GET(_req: NextRequest) {
  try {
    // Determine current season and whether regular season has started
    const currentYear = new Date().getFullYear()
    const regCheck = await q(`SELECT 1 FROM pitches WHERE game_year = ${currentYear} AND game_type = 'R' LIMIT 1`)
    const hasRegularSeason = (regCheck.data || []).length > 0
    const gameTypeFilter = hasRegularSeason ? "AND game_type = 'R'" : ''

    // Get previous game day (most recent date in the applicable game scope)
    const dateRes = await q(`
      SELECT DISTINCT game_date::text AS gd
      FROM pitches
      WHERE game_year = ${currentYear} ${gameTypeFilter}
      ORDER BY gd DESC
      LIMIT 2
    `)
    if (dateRes.error) return NextResponse.json({ error: dateRes.error.message }, { status: 500 })
    const dates = (dateRes.data || []).map((r: any) => r.gd)
    if (dates.length === 0) return NextResponse.json({ error: 'No data' }, { status: 404 })
    const prevDay = dates[0]

    // ── 1. Best Stuff+ pitch (Starter / Reliever) ───────────────────────
    const stuffRes = await q(`
      WITH starters AS (
        SELECT DISTINCT pitcher, game_pk
        FROM pitches
        WHERE game_date = '${prevDay}' AND inning = 1
      ),
      ranked AS (
        SELECT p.pitcher AS player_id, pl.name AS player_name, pl.team,
               p.game_pk,
               p.pitch_name, p.stuff_plus,
               ROUND((p.pfx_x * 12)::numeric, 1) AS hbreak_in,
               ROUND((p.pfx_z * 12)::numeric, 1) AS ivb_in,
               ROUND(p.release_speed::numeric, 1) AS velo,
               CASE WHEN s.pitcher IS NOT NULL THEN 'starter' ELSE 'reliever' END AS role,
               ROW_NUMBER() OVER (
                 PARTITION BY CASE WHEN s.pitcher IS NOT NULL THEN 'starter' ELSE 'reliever' END
                 ORDER BY p.stuff_plus DESC NULLS LAST
               ) AS rn
        FROM pitches p
        JOIN players pl ON pl.id = p.pitcher
        LEFT JOIN starters s ON s.pitcher = p.pitcher AND s.game_pk = p.game_pk
        WHERE p.game_date = '${prevDay}'
          AND p.stuff_plus IS NOT NULL
          AND p.pitch_name IS NOT NULL
      )
      SELECT * FROM ranked WHERE rn = 1
    `)

    // ── 2. Best Cmd+ outing — fetch all previous-day pitches and compute ─
    const outingPitchesRes = await q(`
      SELECT p.pitcher AS player_id, p.game_pk,
             p.plate_x, p.plate_z, p.pitch_name, p.sz_top, p.sz_bot,
             p.zone, p.game_year, p.description, p.stand, p.inning
      FROM pitches p
      WHERE p.game_date = '${prevDay}'
        AND p.pitch_name IS NOT NULL
        AND p.plate_x IS NOT NULL
        AND p.plate_z IS NOT NULL
    `)

    const outingPlayerRes = await q(`
      SELECT DISTINCT p.pitcher AS player_id, pl.name AS player_name, pl.team
      FROM pitches p
      JOIN players pl ON pl.id = p.pitcher
      WHERE p.game_date = '${prevDay}'
    `)

    // Build player lookup
    const playerMap: Record<number, { name: string; team: string }> = {}
    for (const r of (outingPlayerRes.data || [])) {
      playerMap[r.player_id] = { name: r.player_name, team: r.team || '??' }
    }

    // Group pitches by pitcher+game_pk, determine starter vs reliever
    const outingGroups: Record<string, { playerId: number; gamePk: number; pitches: PitchRow[]; isStarter: boolean }> = {}
    for (const r of (outingPitchesRes.data || [])) {
      const key = `${r.player_id}-${r.game_pk}`
      if (!outingGroups[key]) {
        outingGroups[key] = {
          playerId: r.player_id,
          gamePk: r.game_pk,
          pitches: [],
          isStarter: false,
        }
      }
      outingGroups[key].pitches.push({
        plate_x: Number(r.plate_x),
        plate_z: Number(r.plate_z),
        pitch_name: r.pitch_name,
        sz_top: Number(r.sz_top),
        sz_bot: Number(r.sz_bot),
        zone: Number(r.zone),
        game_year: Number(r.game_year),
        description: r.description || '',
        stand: r.stand || '',
      })
      if (Number(r.inning) === 1) outingGroups[key].isStarter = true
    }

    // Compute cmd+ per outing, find best starter and reliever
    let bestCmdStarter: any = null
    let bestCmdReliever: any = null
    let bestCmdStarterGpk = 0
    let bestCmdRelieverGpk = 0
    for (const outing of Object.values(outingGroups)) {
      if (outing.pitches.length < 15) continue
      const cmd = computeOutingCommand(outing.pitches)
      const cmdPlus = cmd.overall_cmd_plus
      if (cmdPlus == null) continue

      const info = playerMap[outing.playerId]
      const entry = {
        player_id: outing.playerId,
        player_name: info?.name || 'Unknown',
        team: info?.team || '??',
        cmd_plus: +cmdPlus.toFixed(1),
        pitches: outing.pitches.length,
        game_line: null as GameLine | null,
      }

      if (outing.isStarter) {
        if (!bestCmdStarter || cmdPlus > bestCmdStarter.cmd_plus) {
          bestCmdStarter = entry
          bestCmdStarterGpk = outing.gamePk
        }
      } else {
        if (!bestCmdReliever || cmdPlus > bestCmdReliever.cmd_plus) {
          bestCmdReliever = entry
          bestCmdRelieverGpk = outing.gamePk
        }
      }
    }

    // ── 3. New pitch alerts ─────────────────────────────────────────────
    const newPitchRes = await q(`
      WITH today_types AS (
        SELECT pitcher, pitch_name,
               COUNT(*) AS count,
               ROUND(AVG(pfx_x * 12)::numeric, 1) AS avg_hbreak,
               ROUND(AVG(pfx_z * 12)::numeric, 1) AS avg_ivb,
               ROUND(AVG(stuff_plus)::numeric, 1) AS avg_stuff_plus
        FROM pitches
        WHERE game_date = '${prevDay}'
          AND pitch_name IS NOT NULL
        GROUP BY pitcher, pitch_name
      ),
      prior_types AS (
        SELECT DISTINCT pitcher, pitch_name
        FROM pitches
        WHERE game_date < '${prevDay}'
          AND pitch_name IS NOT NULL
          AND pitcher IN (SELECT DISTINCT pitcher FROM pitches WHERE game_date = '${prevDay}')
      )
      SELECT t.pitcher AS player_id, pl.name AS player_name, pl.team,
             t.pitch_name, t.count, t.avg_hbreak, t.avg_ivb, t.avg_stuff_plus
      FROM today_types t
      JOIN players pl ON pl.id = t.pitcher
      LEFT JOIN prior_types pr ON pr.pitcher = t.pitcher AND pr.pitch_name = t.pitch_name
      WHERE pr.pitcher IS NULL
        AND t.count >= 3
      ORDER BY t.count DESC
    `)

    const newPitchAlerts: any[] = []
    for (const r of (newPitchRes.data || [])) {
      const outingKey = Object.keys(outingGroups).find(k => k.startsWith(`${r.player_id}-`))
      let cmdData: any = {}
      if (outingKey) {
        const outing = outingGroups[outingKey]
        const cmd = computeOutingCommand(outing.pitches)
        const ptCmd = cmd.byPitch[r.pitch_name]
        if (ptCmd) {
          cmdData = {
            avg_brink: ptCmd.avg_brink,
            avg_cluster: ptCmd.avg_cluster,
            avg_missfire: ptCmd.avg_missfire,
            cmd_plus: ptCmd.cmd_plus,
          }
        }
      }
      newPitchAlerts.push({
        player_id: r.player_id,
        player_name: r.player_name,
        team: r.team || '??',
        pitch_name: r.pitch_name,
        count: Number(r.count),
        avg_hbreak: r.avg_hbreak != null ? Number(r.avg_hbreak) : null,
        avg_ivb: r.avg_ivb != null ? Number(r.avg_ivb) : null,
        avg_stuff_plus: r.avg_stuff_plus != null ? Number(r.avg_stuff_plus) : null,
        ...cmdData,
      })
    }

    // ── Fetch game lines from MLB boxscore API ──────────────────────────
    const stuffStarter = (stuffRes.data || []).find((r: any) => r.role === 'starter') || null
    const stuffReliever = (stuffRes.data || []).find((r: any) => r.role === 'reliever') || null

    // Collect unique gamePk→pitcherId pairs to fetch
    const lineups: { gamePk: number; pitcherId: number; key: string }[] = []
    if (stuffStarter) lineups.push({ gamePk: stuffStarter.game_pk, pitcherId: stuffStarter.player_id, key: 'stuffStarter' })
    if (stuffReliever) lineups.push({ gamePk: stuffReliever.game_pk, pitcherId: stuffReliever.player_id, key: 'stuffReliever' })
    if (bestCmdStarter) lineups.push({ gamePk: bestCmdStarterGpk, pitcherId: bestCmdStarter.player_id, key: 'cmdStarter' })
    if (bestCmdReliever) lineups.push({ gamePk: bestCmdRelieverGpk, pitcherId: bestCmdReliever.player_id, key: 'cmdReliever' })

    const gameLines: Record<string, GameLine | null> = {}
    await Promise.all(lineups.map(async ({ gamePk, pitcherId, key }) => {
      gameLines[key] = await fetchPitcherGameLine(gamePk, pitcherId)
    }))

    const mapStuff = (r: any, lineKey: string) => r ? {
      player_id: r.player_id,
      player_name: r.player_name,
      team: r.team,
      pitch_name: r.pitch_name,
      stuff_plus: Number(r.stuff_plus),
      velo: r.velo != null ? Number(r.velo) : null,
      hbreak_in: r.hbreak_in != null ? Number(r.hbreak_in) : null,
      ivb_in: r.ivb_in != null ? Number(r.ivb_in) : null,
      game_line: gameLines[lineKey] || null,
    } : null

    if (bestCmdStarter) bestCmdStarter.game_line = gameLines['cmdStarter'] || null
    if (bestCmdReliever) bestCmdReliever.game_line = gameLines['cmdReliever'] || null

    return NextResponse.json({
      date: prevDay,
      stuff_starter: mapStuff(stuffStarter, 'stuffStarter'),
      stuff_reliever: mapStuff(stuffReliever, 'stuffReliever'),
      cmd_starter: bestCmdStarter,
      cmd_reliever: bestCmdReliever,
      new_pitches: newPitchAlerts,
    })
  } catch (err: any) {
    console.error('daily-highlights error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
