import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { computeXDeceptionScore, isFastball } from '@/lib/leagueStats'
import { PITCH_TYPE_TO_ABBREV } from '@/lib/constants-data'

/**
 * Query pre-computed Deception metrics for the leaderboard.
 * Returns one flat row per pitcher with per-pitch-type columns.
 *
 * POST /api/leaderboard-deception
 * Body: { gameYear, minPitches, sortBy, sortDir, limit, offset }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      gameYear = 2025,
      gameType = 'R',
      minPitches = 500,
      sortBy = 'deception_score',
      sortDir = 'DESC',
      limit = 100,
      offset = 0,
    } = body

    const safeYear = parseInt(String(gameYear))
    const safeMinPitches = Math.max(parseInt(String(minPitches)) || 0, 0)
    const safeLimit = Math.min(Math.max(parseInt(String(limit)), 1), 1000)
    const safeOffset = Math.max(parseInt(String(offset)) || 0, 0)
    const safeSortDir = sortDir === 'ASC' ? 1 : -1

    const sql = `
      SELECT pitcher, player_name, pitch_type, pitch_name, p_throws, pitches,
        z_vaa, z_haa, z_vb, z_hb, z_ext,
        unique_score, deception_score
      FROM pitcher_season_deception
      WHERE game_year = ${safeYear}
        AND game_type = '${String(gameType).replace(/'/g, '')}'
    `.trim()

    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message, sql }, { status: 500 })

    // Pivot: one flat row per pitcher
    const pitcherMap = new Map<number, Record<string, any>>()

    for (const row of (data || [])) {
      const id = row.pitcher
      if (!pitcherMap.has(id)) {
        pitcherMap.set(id, {
          pitcher: id,
          player_name: row.player_name,
          pitches: 0,
          // Accumulators for weighted overall scores
          _unique_sum: 0, _unique_weight: 0,
          _deception_sum: 0, _deception_weight: 0,
          // Accumulators for xDeception (FB and OS z-score weighted avgs)
          _fb_z: { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 },
          _os_z: { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 },
        })
      }
      const p = pitcherMap.get(id)!
      const pt = PITCH_TYPE_TO_ABBREV[row.pitch_type] || row.pitch_type.toLowerCase()
      const ptPitches = Number(row.pitches) || 0
      p.pitches += ptPitches

      // Per-pitch-type columns
      p[`${pt}_unique`] = row.unique_score != null ? Number(row.unique_score) : null
      p[`${pt}_deception`] = row.deception_score != null ? Number(row.deception_score) : null

      // Accumulate weighted scores for overall
      if (row.unique_score != null) {
        p._unique_sum += Number(row.unique_score) * ptPitches
        p._unique_weight += ptPitches
      }
      if (row.deception_score != null) {
        p._deception_sum += Number(row.deception_score) * ptPitches
        p._deception_weight += ptPitches
      }

      // Accumulate z-scores for xDeception
      const isFB = isFastball(row.pitch_type)
      const bucket = isFB ? p._fb_z : p._os_z
      if (row.z_vaa != null && row.z_haa != null && row.z_vb != null && row.z_hb != null) {
        bucket.vaa += Number(row.z_vaa) * ptPitches
        bucket.haa += Number(row.z_haa) * ptPitches
        bucket.vb += Number(row.z_vb) * ptPitches
        bucket.hb += Number(row.z_hb) * ptPitches
        bucket.ext += (row.z_ext != null ? Number(row.z_ext) : 0) * ptPitches
        bucket.w += ptPitches
      }
    }

    // Finalize rows
    let rows = Array.from(pitcherMap.values())
    for (const row of rows) {
      row.unique_score = row._unique_weight > 0
        ? Math.round((row._unique_sum / row._unique_weight) * 1000) / 1000
        : null
      row.deception_score = row._deception_weight > 0
        ? Math.round((row._deception_sum / row._deception_weight) * 1000) / 1000
        : null

      // xDeception
      const fb = row._fb_z
      const os = row._os_z
      if (fb.w > 0 && os.w > 0) {
        const fbZ = { vaa: fb.vaa / fb.w, haa: fb.haa / fb.w, vb: fb.vb / fb.w, hb: fb.hb / fb.w, ext: fb.ext / fb.w }
        const osZ = { vaa: os.vaa / os.w, haa: os.haa / os.w, vb: os.vb / os.w, hb: os.hb / os.w, ext: os.ext / os.w }
        row.xdeception_score = Math.round(computeXDeceptionScore(fbZ, osZ) * 1000) / 1000
      } else {
        row.xdeception_score = null
      }

      delete row._unique_sum; delete row._unique_weight
      delete row._deception_sum; delete row._deception_weight
      delete row._fb_z; delete row._os_z
    }

    // Filter by min pitches
    rows = rows.filter(r => r.pitches >= safeMinPitches)

    // Sort
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
