import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { computeOutingCommand, PitchRow } from '@/lib/outingCommand'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

export async function GET(_req: NextRequest) {
  try {
    // Get previous game day (the day before the latest game_date in the current season)
    const currentYear = new Date().getFullYear()
    const dateRes = await q(`
      SELECT DISTINCT game_date::text AS gd
      FROM pitches
      WHERE game_year = ${currentYear}
      ORDER BY gd DESC
      LIMIT 2
    `)
    if (dateRes.error) return NextResponse.json({ error: dateRes.error.message }, { status: 500 })
    const dates = (dateRes.data || []).map((r: any) => r.gd)
    if (dates.length === 0) return NextResponse.json({ error: 'No data' }, { status: 404 })
    // Use the most recent date as "previous day" (latest data day)
    const prevDay = dates[0]

    // ── 1. Best Stuff+ pitch (Starter / Reliever) ───────────────────────
    // Identify starters: pitchers who threw in inning 1 of each game
    const stuffRes = await q(`
      WITH starters AS (
        SELECT DISTINCT pitcher, game_pk
        FROM pitches
        WHERE game_date = '${prevDay}' AND inning = 1
      ),
      ranked AS (
        SELECT p.pitcher AS player_id, pl.name AS player_name, pl.team,
               p.pitch_name, p.stuff_plus,
               ROUND(p.pfx_x * 12, 1) AS hbreak_in,
               ROUND(p.pfx_z * 12, 1) AS ivb_in,
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
      playerMap[r.player_id] = { name: r.player_name, team: r.team }
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
    for (const outing of Object.values(outingGroups)) {
      if (outing.pitches.length < 15) continue // skip tiny outings
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
      }

      if (outing.isStarter) {
        if (!bestCmdStarter || cmdPlus > bestCmdStarter.cmd_plus) bestCmdStarter = entry
      } else {
        if (!bestCmdReliever || cmdPlus > bestCmdReliever.cmd_plus) bestCmdReliever = entry
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

    // For new pitch alerts, also get brink/cluster/missfire/cmd+ per new pitch
    const newPitchAlerts: any[] = []
    for (const r of (newPitchRes.data || [])) {
      // Find this pitcher's outing and compute per-pitch command
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
        team: r.team,
        pitch_name: r.pitch_name,
        count: Number(r.count),
        avg_hbreak: r.avg_hbreak != null ? Number(r.avg_hbreak) : null,
        avg_ivb: r.avg_ivb != null ? Number(r.avg_ivb) : null,
        avg_stuff_plus: r.avg_stuff_plus != null ? Number(r.avg_stuff_plus) : null,
        ...cmdData,
      })
    }

    // ── Build response ──────────────────────────────────────────────────
    const stuffStarter = (stuffRes.data || []).find((r: any) => r.role === 'starter') || null
    const stuffReliever = (stuffRes.data || []).find((r: any) => r.role === 'reliever') || null

    return NextResponse.json({
      date: prevDay,
      stuff_starter: stuffStarter ? {
        player_id: stuffStarter.player_id,
        player_name: stuffStarter.player_name,
        team: stuffStarter.team,
        pitch_name: stuffStarter.pitch_name,
        stuff_plus: Number(stuffStarter.stuff_plus),
        velo: stuffStarter.velo != null ? Number(stuffStarter.velo) : null,
        hbreak_in: stuffStarter.hbreak_in != null ? Number(stuffStarter.hbreak_in) : null,
        ivb_in: stuffStarter.ivb_in != null ? Number(stuffStarter.ivb_in) : null,
      } : null,
      stuff_reliever: stuffReliever ? {
        player_id: stuffReliever.player_id,
        player_name: stuffReliever.player_name,
        team: stuffReliever.team,
        pitch_name: stuffReliever.pitch_name,
        stuff_plus: Number(stuffReliever.stuff_plus),
        velo: stuffReliever.velo != null ? Number(stuffReliever.velo) : null,
        hbreak_in: stuffReliever.hbreak_in != null ? Number(stuffReliever.hbreak_in) : null,
        ivb_in: stuffReliever.ivb_in != null ? Number(stuffReliever.ivb_in) : null,
      } : null,
      cmd_starter: bestCmdStarter,
      cmd_reliever: bestCmdReliever,
      new_pitches: newPitchAlerts,
    })
  } catch (err: any) {
    console.error('daily-highlights error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
