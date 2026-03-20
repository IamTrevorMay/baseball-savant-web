import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  getLeagueBaseline,
  computePlus,
  computeCommandPlus,
  computeRPComPlus,
} from '@/lib/leagueStats'
import { ZONE_HALF_WIDTH } from '@/lib/constants-data'

const SWING_DESCRIPTIONS = new Set([
  'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip',
  'foul_bunt', 'hit_into_play', 'hit_into_play_no_out', 'hit_into_play_score',
  'missed_bunt',
])

/**
 * Batch compute Triton command metrics and store in pitcher_season_command.
 * POST /api/compute-triton?year=2025
 * Protected: requires admin key in Authorization header.
 */
export async function POST(req: NextRequest) {
  // Simple admin protection
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '2025')

  try {
    // Get all pitchers for the year with min 50 pitches per pitch type
    const sql = `
      SELECT pitcher, player_name, pitch_name, game_year,
        plate_x, plate_z, sz_top, sz_bot,
        zone, description, stand
      FROM pitches
      WHERE game_year = ${year}
        AND pitch_name IS NOT NULL
        AND plate_x IS NOT NULL
        AND plate_z IS NOT NULL
        AND sz_top IS NOT NULL
        AND sz_bot IS NOT NULL
        AND pitch_type NOT IN ('PO', 'IN')
      ORDER BY pitcher, pitch_name
    `

    const { data: rows, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!rows || rows.length === 0) return NextResponse.json({ message: 'No data found', year })

    // Group by pitcher → pitch_name → array of pitches
    const groups: Record<string, Record<string, any[]>> = {}
    for (const r of rows) {
      const pid = r.pitcher
      const pn = r.pitch_name
      if (!groups[pid]) groups[pid] = {}
      if (!groups[pid][pn]) groups[pid][pn] = []
      groups[pid][pn].push(r)
    }

    // Compute centroids per pitch_name (across all pitchers for this year)
    const centroids: Record<string, { cx: number; cz: number }> = {}
    const centroidBuckets: Record<string, { sx: number; sz: number; n: number }> = {}
    // R/L centroids
    const centroidsR: Record<string, { cx: number; cz: number }> = {}
    const centroidsL: Record<string, { cx: number; cz: number }> = {}
    const centroidBucketsR: Record<string, { sx: number; sz: number; n: number }> = {}
    const centroidBucketsL: Record<string, { sx: number; sz: number; n: number }> = {}
    for (const r of rows) {
      const pn = r.pitch_name
      if (!centroidBuckets[pn]) centroidBuckets[pn] = { sx: 0, sz: 0, n: 0 }
      centroidBuckets[pn].sx += r.plate_x
      centroidBuckets[pn].sz += r.plate_z
      centroidBuckets[pn].n++
      if (r.stand === 'R') {
        if (!centroidBucketsR[pn]) centroidBucketsR[pn] = { sx: 0, sz: 0, n: 0 }
        centroidBucketsR[pn].sx += r.plate_x; centroidBucketsR[pn].sz += r.plate_z; centroidBucketsR[pn].n++
      } else if (r.stand === 'L') {
        if (!centroidBucketsL[pn]) centroidBucketsL[pn] = { sx: 0, sz: 0, n: 0 }
        centroidBucketsL[pn].sx += r.plate_x; centroidBucketsL[pn].sz += r.plate_z; centroidBucketsL[pn].n++
      }
    }
    for (const pn in centroidBuckets) {
      const b = centroidBuckets[pn]
      centroids[pn] = { cx: b.sx / b.n, cz: b.sz / b.n }
    }
    for (const pn in centroidBucketsR) {
      const b = centroidBucketsR[pn]
      centroidsR[pn] = { cx: b.sx / b.n, cz: b.sz / b.n }
    }
    for (const pn in centroidBucketsL) {
      const b = centroidBucketsL[pn]
      centroidsL[pn] = { cx: b.sx / b.n, cz: b.sz / b.n }
    }

    const upsertRows: any[] = []
    let pitcherCount = 0

    for (const [pitcherId, pitchTypes] of Object.entries(groups)) {
      const playerName = pitchTypes[Object.keys(pitchTypes)[0]][0]?.player_name
      pitcherCount++

      for (const [pitchName, pitches] of Object.entries(pitchTypes)) {
        if (pitches.length < 50) continue

        const centroid = centroids[pitchName]
        if (!centroid) continue

        const centroidR = centroidsR[pitchName]
        const centroidL = centroidsL[pitchName]

        // Compute per-pitch raw metrics
        let brinkSum = 0, clusterSum = 0, hdevSum = 0, vdevSum = 0
        let missfireSum = 0, missfireCount = 0, closeCount = 0, outsideCount = 0
        let validBrink = 0, validCluster = 0
        let clusterRSum = 0, clusterRCount = 0
        let clusterLSum = 0, clusterLCount = 0

        for (const p of pitches) {
          // Brink
          const dLeft = p.plate_x + ZONE_HALF_WIDTH
          const dRight = ZONE_HALF_WIDTH - p.plate_x
          const dBot = p.plate_z - p.sz_bot
          const dTop = p.sz_top - p.plate_z
          const brink = Math.min(dLeft, dRight, dBot, dTop) * 12
          brinkSum += brink
          validBrink++

          // Cluster / HDev / VDev
          const cluster = Math.sqrt((p.plate_x - centroid.cx) ** 2 + (p.plate_z - centroid.cz) ** 2) * 12
          const hdev = Math.abs(p.plate_x - centroid.cx) * 12
          const vdev = Math.abs(p.plate_z - centroid.cz) * 12
          clusterSum += cluster
          hdevSum += hdev
          vdevSum += vdev
          validCluster++

          // ClusterR / ClusterL — distance from handedness-specific centroid
          if (p.stand === 'R' && centroidR) {
            clusterRSum += Math.sqrt((p.plate_x - centroidR.cx) ** 2 + (p.plate_z - centroidR.cz) ** 2) * 12
            clusterRCount++
          } else if (p.stand === 'L' && centroidL) {
            clusterLSum += Math.sqrt((p.plate_x - centroidL.cx) ** 2 + (p.plate_z - centroidL.cz) ** 2) * 12
            clusterLCount++
          }

          // Missfire (avg miss distance) + Close% (% of misses within 2")
          // Only count pitches the batter did NOT swing at
          const isInZone = p.zone >= 1 && p.zone <= 9
          const didSwing = p.description ? SWING_DESCRIPTIONS.has(p.description) : false
          if (!isInZone && !didSwing) {
            outsideCount++
            missfireSum += Math.abs(brink)
            missfireCount++
            if (brink > -2) closeCount++
          }
        }

        const avgBrink = validBrink > 0 ? brinkSum / validBrink : null
        const avgCluster = validCluster > 0 ? clusterSum / validCluster : null
        const avgClusterR = clusterRCount > 0 ? clusterRSum / clusterRCount : null
        const avgClusterL = clusterLCount > 0 ? clusterLSum / clusterLCount : null
        const avgHdev = validCluster > 0 ? hdevSum / validCluster : null
        const avgVdev = validCluster > 0 ? vdevSum / validCluster : null
        const avgMissfire = missfireCount > 0 ? missfireSum / missfireCount : null
        const closePct = outsideCount > 0 ? (closeCount / outsideCount) * 100 : null

        // Compute plus stats
        const brinkBl = getLeagueBaseline('brink', pitchName, year)
        const clusterBl = getLeagueBaseline('cluster', pitchName, year)
        const hdevBl = getLeagueBaseline('hdev', pitchName, year)
        const vdevBl = getLeagueBaseline('vdev', pitchName, year)
        const missfireBl = getLeagueBaseline('missfire', pitchName, year)
        const closePctBl = getLeagueBaseline('close_pct', pitchName, year)

        const clusterRBl = getLeagueBaseline('cluster_r', pitchName, year)
        const clusterLBl = getLeagueBaseline('cluster_l', pitchName, year)

        const brinkPlus = avgBrink != null && brinkBl ? computePlus(avgBrink, brinkBl.mean, brinkBl.stddev) : null
        // For cluster/hdev/vdev/missfire: lower is better, so invert
        const clusterPlus = avgCluster != null && clusterBl ? 100 - (computePlus(avgCluster, clusterBl.mean, clusterBl.stddev) - 100) : null
        const clusterRPlus = avgClusterR != null && clusterRBl ? 100 - (computePlus(avgClusterR, clusterRBl.mean, clusterRBl.stddev) - 100) : null
        const clusterLPlus = avgClusterL != null && clusterLBl ? 100 - (computePlus(avgClusterL, clusterLBl.mean, clusterLBl.stddev) - 100) : null
        const hdevPlus = avgHdev != null && hdevBl ? 100 - (computePlus(avgHdev, hdevBl.mean, hdevBl.stddev) - 100) : null
        const vdevPlus = avgVdev != null && vdevBl ? 100 - (computePlus(avgVdev, vdevBl.mean, vdevBl.stddev) - 100) : null
        const missfirePlus = avgMissfire != null && missfireBl ? 100 - (computePlus(avgMissfire, missfireBl.mean, missfireBl.stddev) - 100) : null
        // Close%: higher is better, NOT inverted
        const closePctPlus = closePct != null && closePctBl ? computePlus(closePct, closePctBl.mean, closePctBl.stddev) : null

        // Composites
        const cmdPlus = brinkPlus != null && clusterPlus != null && missfirePlus != null
          ? computeCommandPlus(brinkPlus, clusterPlus, missfirePlus) : null
        const rpcomPlus = brinkPlus != null && clusterPlus != null && hdevPlus != null && vdevPlus != null && missfirePlus != null
          ? computeRPComPlus(brinkPlus, clusterPlus, hdevPlus, vdevPlus, missfirePlus) : null

        // Waste%: pitches that miss the zone by more than 10 inches (brink < -10)
        let wasteCount = 0
        for (const p of pitches) {
          const dLeft = p.plate_x + ZONE_HALF_WIDTH
          const dRight = ZONE_HALF_WIDTH - p.plate_x
          const dBot = p.plate_z - p.sz_bot
          const dTop = p.sz_top - p.plate_z
          const b = Math.min(dLeft, dRight, dBot, dTop) * 12
          if (b < -10) wasteCount++
        }
        const wastePct = (wasteCount / pitches.length) * 100

        upsertRows.push({
          pitcher: parseInt(pitcherId),
          player_name: playerName,
          game_year: year,
          pitch_name: pitchName,
          pitches: pitches.length,
          avg_brink: avgBrink != null ? +avgBrink.toFixed(2) : null,
          avg_cluster: avgCluster != null ? +avgCluster.toFixed(2) : null,
          avg_cluster_r: avgClusterR != null ? +avgClusterR.toFixed(2) : null,
          avg_cluster_l: avgClusterL != null ? +avgClusterL.toFixed(2) : null,
          avg_hdev: avgHdev != null ? +avgHdev.toFixed(2) : null,
          avg_vdev: avgVdev != null ? +avgVdev.toFixed(2) : null,
          avg_missfire: avgMissfire != null ? +avgMissfire.toFixed(2) : null,
          close_pct: closePct != null ? +closePct.toFixed(2) : null,
          brink_plus: brinkPlus != null ? +brinkPlus.toFixed(1) : null,
          cluster_plus: clusterPlus != null ? +clusterPlus.toFixed(1) : null,
          cluster_r_plus: clusterRPlus != null ? +clusterRPlus.toFixed(1) : null,
          cluster_l_plus: clusterLPlus != null ? +clusterLPlus.toFixed(1) : null,
          hdev_plus: hdevPlus != null ? +hdevPlus.toFixed(1) : null,
          vdev_plus: vdevPlus != null ? +vdevPlus.toFixed(1) : null,
          missfire_plus: missfirePlus != null ? +missfirePlus.toFixed(1) : null,
          close_pct_plus: closePctPlus != null ? +closePctPlus.toFixed(1) : null,
          cmd_plus: cmdPlus != null ? +cmdPlus.toFixed(1) : null,
          rpcom_plus: rpcomPlus != null ? +rpcomPlus.toFixed(1) : null,
          waste_pct: +wastePct.toFixed(1),
        })
      }
    }

    // Upsert in batches of 500
    let upserted = 0
    for (let i = 0; i < upsertRows.length; i += 500) {
      const batch = upsertRows.slice(i, i + 500)
      const { error: upsertErr } = await supabase
        .from('pitcher_season_command')
        .upsert(batch, { onConflict: 'pitcher,game_year,pitch_name' })
      if (upsertErr) return NextResponse.json({ error: upsertErr.message, upserted }, { status: 500 })
      upserted += batch.length
    }

    return NextResponse.json({
      message: `Computed Triton metrics for ${pitcherCount} pitchers, ${upserted} pitch type rows`,
      year,
      pitcherCount,
      rowsUpserted: upserted,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
