import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { ZONE_HALF_WIDTH } from '@/lib/constants-data'
import {
  getLeagueBaseline,
  getLeagueCentroid,
  computePlus,
  computeCommandPlus,
} from '@/lib/leagueStats'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

// ── Outing-level command computation ────────────────────────────────────────

interface PitchRow {
  plate_x: number
  plate_z: number
  pitch_name: string
  sz_top: number
  sz_bot: number
  zone: number
  game_year: number
}

interface PitchTypeCommand {
  avg_missfire: number | null
  avg_brink: number | null
  avg_cluster: number | null
  cmd_plus: number | null
}

function computeOutingCommand(pitches: PitchRow[]) {
  // Group by pitch type
  const groups: Record<string, PitchRow[]> = {}
  for (const p of pitches) {
    if (!p.pitch_name) continue
    if (!groups[p.pitch_name]) groups[p.pitch_name] = []
    groups[p.pitch_name].push(p)
  }

  const byPitch: Record<string, PitchTypeCommand> = {}

  // Aggregate accumulators for weighted overall command
  let totalPitches = 0
  let wasteTotal = 0, clusterTotal = 0, brinkTotal = 0
  let wasteN = 0, clusterN = 0, brinkN = 0

  for (const [pitchName, pts] of Object.entries(groups)) {
    const year = pts[0].game_year
    const centroid = getLeagueCentroid(pitchName, year)

    let brinkSum = 0, clusterSum = 0, missfireCount = 0
    let validBrink = 0, validCluster = 0, wasteCount = 0

    for (const p of pts) {
      // Brink — signed distance to nearest zone edge (inches)
      const dLeft = p.plate_x + ZONE_HALF_WIDTH
      const dRight = ZONE_HALF_WIDTH - p.plate_x
      const dBot = p.plate_z - p.sz_bot
      const dTop = p.sz_top - p.plate_z
      const brink = Math.min(dLeft, dRight, dBot, dTop) * 12
      brinkSum += brink
      validBrink++

      // Cluster — distance from league centroid (inches)
      if (centroid) {
        const cluster = Math.sqrt((p.plate_x - centroid.cx) ** 2 + (p.plate_z - centroid.cz) ** 2) * 12
        clusterSum += cluster
        validCluster++
      }

      // Missfire — near-misses outside zone (brink between -2 and 0 inches)
      const isInZone = p.zone >= 1 && p.zone <= 9
      if (!isInZone && brink > -2) missfireCount++

      // Waste — pitches > 10 inches outside zone
      if (brink < -10) wasteCount++
    }

    const avgBrink = validBrink > 0 ? brinkSum / validBrink : null
    const avgCluster = validCluster > 0 ? clusterSum / validCluster : null
    const avgMissfire = pts.length > 0 ? (missfireCount / pts.length) * 100 : null

    // Plus stats
    const brinkBl = getLeagueBaseline('brink', pitchName, year)
    const clusterBl = getLeagueBaseline('cluster', pitchName, year)
    const missfireBl = getLeagueBaseline('missfire', pitchName, year)

    const brinkPlus = avgBrink != null && brinkBl ? computePlus(avgBrink, brinkBl.mean, brinkBl.stddev) : null
    const clusterPlus = avgCluster != null && clusterBl ? 100 - (computePlus(avgCluster, clusterBl.mean, clusterBl.stddev) - 100) : null
    const missfirePlus = avgMissfire != null && missfireBl ? 100 - (computePlus(avgMissfire, missfireBl.mean, missfireBl.stddev) - 100) : null

    const cmdPlus = brinkPlus != null && clusterPlus != null && missfirePlus != null
      ? computeCommandPlus(brinkPlus, clusterPlus, missfirePlus)
      : null

    byPitch[pitchName] = {
      avg_missfire: avgMissfire != null ? +avgMissfire.toFixed(2) : null,
      avg_brink: avgBrink != null ? +avgBrink.toFixed(2) : null,
      avg_cluster: avgCluster != null ? +avgCluster.toFixed(2) : null,
      cmd_plus: cmdPlus != null ? +cmdPlus.toFixed(1) : null,
    }

    // Accumulate for aggregate
    totalPitches += pts.length
    const wastePct = (wasteCount / pts.length) * 100
    wasteTotal += wastePct * pts.length; wasteN += pts.length
    if (avgCluster != null) { clusterTotal += avgCluster * pts.length; clusterN += pts.length }
    if (avgBrink != null) { brinkTotal += avgBrink * pts.length; brinkN += pts.length }
  }

  return {
    byPitch,
    aggregate: {
      waste_pct: wasteN > 0 ? wasteTotal / wasteN : null,
      avg_cluster: clusterN > 0 ? clusterTotal / clusterN : null,
      avg_brink: brinkN > 0 ? brinkTotal / brinkN : null,
    },
  }
}

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

    // Run queries in parallel (4 queries — no more season command lookup)
    const [boxscoreRes, arsenalRes, locationsRes, metaRes] = await Promise.all([
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

    const arsenal = (arsenalRes.data || []).map((r: any) => {
      const cmdRow = cmd.byPitch[r.pitch_name] || {}
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
