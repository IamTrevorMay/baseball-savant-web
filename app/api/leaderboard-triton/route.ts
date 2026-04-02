import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { PITCH_NAME_TO_ABBREV } from '@/lib/constants-data'

/**
 * Query pre-computed Triton command metrics for the leaderboard.
 * Returns one flat row per pitcher with per-pitch-type metric columns.
 *
 * POST /api/leaderboard-triton
 * Body: { gameYear, minPitches, sortBy, sortDir, limit, offset, mode }
 *   mode: 'raw' — raw metric values (brink, cluster, hdev, vdev, missfire, waste_pct)
 *         'plus' — plus metric values per pitch type + overall cmd_plus, rpcom_plus
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      gameYear = 2025,
      gameType = 'R',
      minPitches = 500,
      sortBy = 'cmd_plus',
      sortDir = 'DESC',
      limit = 100,
      offset = 0,
      mode = 'plus',
    } = body

    const safeYear = parseInt(String(gameYear))
    const safeMinPitches = Math.max(parseInt(String(minPitches)) || 0, 0)
    const safeLimit = Math.min(Math.max(parseInt(String(limit)), 1), 1000)
    const safeOffset = Math.max(parseInt(String(offset)) || 0, 0)
    const safeSortDir = sortDir === 'ASC' ? 1 : -1

    // Fetch all rows (one per pitcher × pitch type) for the year
    const sql = `
      SELECT pitcher, player_name, pitch_name, pitches,
        avg_brink, avg_cluster, avg_cluster_r, avg_cluster_l,
        avg_hdev, avg_vdev, avg_missfire, close_pct, waste_pct,
        brink_plus, cluster_plus, cluster_r_plus, cluster_l_plus,
        hdev_plus, vdev_plus, missfire_plus, close_pct_plus,
        cmd_plus, rpcom_plus
      FROM pitcher_season_command
      WHERE game_year = ${safeYear}
        AND game_type = '${String(gameType).replace(/'/g, '')}'
    `.trim()

    // Fetch avg stuff_plus per pitcher × pitch type from pitches table
    const stuffSql = `
      SELECT pitcher, pitch_name, ROUND(AVG(stuff_plus)::numeric, 1) AS avg_stuff_plus
      FROM pitches
      WHERE game_year = ${safeYear} AND game_type = '${String(gameType).replace(/'/g, '')}' AND pitch_name IS NOT NULL AND stuff_plus IS NOT NULL
      GROUP BY pitcher, pitch_name
    `.trim()

    const [{ data, error }, stuffRes] = await Promise.all([
      supabase.rpc('run_query', { query_text: sql }),
      supabase.rpc('run_query', { query_text: stuffSql }),
    ])
    if (error) return NextResponse.json({ error: error.message, sql }, { status: 500 })

    // Build stuff+ lookup: pitcher → pitch_name → avg_stuff_plus
    const stuffMap = new Map<number, Record<string, number>>()
    for (const row of (stuffRes.data || [])) {
      const id = row.pitcher
      if (!stuffMap.has(id)) stuffMap.set(id, {})
      stuffMap.get(id)![row.pitch_name] = Number(row.avg_stuff_plus)
    }

    // Pivot: one flat row per pitcher
    const pitcherMap = new Map<number, Record<string, any>>()

    for (const row of (data || [])) {
      const id = row.pitcher
      if (!pitcherMap.has(id)) {
        pitcherMap.set(id, {
          pitcher: id,
          player_name: row.player_name,
          pitches: 0,
          _cmd_sum: 0, _cmd_weight: 0,
          _rpcom_sum: 0, _rpcom_weight: 0,
        })
      }
      const p = pitcherMap.get(id)!
      const pt = PITCH_NAME_TO_ABBREV[row.pitch_name] || (row.pitch_name || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2)
      const ptPitches = Number(row.pitches) || 0
      p.pitches += ptPitches

      if (mode === 'raw') {
        p[`${pt}_brink`] = row.avg_brink != null ? Number(row.avg_brink) : null
        p[`${pt}_cluster`] = row.avg_cluster != null ? Number(row.avg_cluster) : null
        p[`${pt}_cluster_r`] = row.avg_cluster_r != null ? Number(row.avg_cluster_r) : null
        p[`${pt}_cluster_l`] = row.avg_cluster_l != null ? Number(row.avg_cluster_l) : null
        p[`${pt}_hdev`] = row.avg_hdev != null ? Number(row.avg_hdev) : null
        p[`${pt}_vdev`] = row.avg_vdev != null ? Number(row.avg_vdev) : null
        p[`${pt}_missfire`] = row.avg_missfire != null ? Number(row.avg_missfire) : null
        p[`${pt}_close_pct`] = row.close_pct != null ? Number(row.close_pct) : null
        p[`${pt}_waste_pct`] = row.waste_pct != null ? Number(row.waste_pct) : null
      } else {
        p[`${pt}_brink_plus`] = row.brink_plus != null ? Number(row.brink_plus) : null
        p[`${pt}_cluster_plus`] = row.cluster_plus != null ? Number(row.cluster_plus) : null
        p[`${pt}_cluster_r_plus`] = row.cluster_r_plus != null ? Number(row.cluster_r_plus) : null
        p[`${pt}_cluster_l_plus`] = row.cluster_l_plus != null ? Number(row.cluster_l_plus) : null
        p[`${pt}_hdev_plus`] = row.hdev_plus != null ? Number(row.hdev_plus) : null
        p[`${pt}_vdev_plus`] = row.vdev_plus != null ? Number(row.vdev_plus) : null
        p[`${pt}_missfire_plus`] = row.missfire_plus != null ? Number(row.missfire_plus) : null
        p[`${pt}_close_pct_plus`] = row.close_pct_plus != null ? Number(row.close_pct_plus) : null
        p[`${pt}_cmd_plus`] = row.cmd_plus != null ? Number(row.cmd_plus) : null
        p[`${pt}_rpcom_plus`] = row.rpcom_plus != null ? Number(row.rpcom_plus) : null
        p[`${pt}_stuff_plus`] = stuffMap.get(id)?.[row.pitch_name] ?? null
        p[`${pt}_waste_pct`] = row.waste_pct != null ? Number(row.waste_pct) : null

        // Accumulate for weighted cmd_plus / rpcom_plus
        if (row.cmd_plus != null) {
          p._cmd_sum += Number(row.cmd_plus) * ptPitches
          p._cmd_weight += ptPitches
        }
        if (row.rpcom_plus != null) {
          p._rpcom_sum += Number(row.rpcom_plus) * ptPitches
          p._rpcom_weight += ptPitches
        }
      }
    }

    // Finalize rows
    let rows = Array.from(pitcherMap.values())

    if (mode === 'plus') {
      for (const row of rows) {
        row.cmd_plus = row._cmd_weight > 0
          ? Math.round((row._cmd_sum / row._cmd_weight) * 10) / 10
          : null
        row.rpcom_plus = row._rpcom_weight > 0
          ? Math.round((row._rpcom_sum / row._rpcom_weight) * 10) / 10
          : null
        delete row._cmd_sum; delete row._cmd_weight
        delete row._rpcom_sum; delete row._rpcom_weight
      }
    } else {
      // Clean up internal accumulators for raw mode
      for (const row of rows) {
        delete row._cmd_sum; delete row._cmd_weight
        delete row._rpcom_sum; delete row._rpcom_weight
      }
    }

    // Filter by min pitches
    rows = rows.filter(r => r.pitches >= safeMinPitches)

    // Sort in JS
    const safeSort = String(sortBy)
    rows.sort((a, b) => {
      const va = a[safeSort], vb = b[safeSort]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'string') return va.localeCompare(vb) * safeSortDir
      return (va - vb) * safeSortDir
    })

    // Paginate
    const paged = rows.slice(safeOffset, safeOffset + safeLimit)

    return NextResponse.json({ rows: paged, count: paged.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
