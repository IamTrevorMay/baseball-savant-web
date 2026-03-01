import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getLeagueBaseline,
  computePlus,
  computeCommandPlus,
  computeRPComPlus,
} from '@/lib/leagueStats'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
        zone, description
      FROM pitches
      WHERE game_year = ${year}
        AND pitch_name IS NOT NULL
        AND plate_x IS NOT NULL
        AND plate_z IS NOT NULL
        AND sz_top IS NOT NULL
        AND sz_bot IS NOT NULL
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
    for (const r of rows) {
      const pn = r.pitch_name
      if (!centroidBuckets[pn]) centroidBuckets[pn] = { sx: 0, sz: 0, n: 0 }
      centroidBuckets[pn].sx += r.plate_x
      centroidBuckets[pn].sz += r.plate_z
      centroidBuckets[pn].n++
    }
    for (const pn in centroidBuckets) {
      const b = centroidBuckets[pn]
      centroids[pn] = { cx: b.sx / b.n, cz: b.sz / b.n }
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

        // Compute per-pitch raw metrics
        let brinkSum = 0, clusterSum = 0, hdevSum = 0, vdevSum = 0, missfireCount = 0
        let validBrink = 0, validCluster = 0

        for (const p of pitches) {
          // Brink
          const dLeft = p.plate_x + 0.83
          const dRight = 0.83 - p.plate_x
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

          // Missfire: intended strike that missed zone, or ball intended as ball that caught zone
          const isInZone = p.zone >= 1 && p.zone <= 9
          const isSwStr = p.description && p.description.includes('swinging_strike')
          const isCalled = p.description === 'called_strike'
          const isStrike = isSwStr || isCalled || (p.description && p.description.includes('foul'))
          // Missfire = pitch outside zone that wasn't an intentional waste (in a 2-strike count where the pitch was a ball)
          if (!isInZone && brink > -2) missfireCount++ // near misses outside zone
        }

        const avgBrink = validBrink > 0 ? brinkSum / validBrink : null
        const avgCluster = validCluster > 0 ? clusterSum / validCluster : null
        const avgHdev = validCluster > 0 ? hdevSum / validCluster : null
        const avgVdev = validCluster > 0 ? vdevSum / validCluster : null
        const avgMissfire = pitches.length > 0 ? (missfireCount / pitches.length) * 100 : null

        // Compute plus stats
        const brinkBl = getLeagueBaseline('brink', pitchName, year)
        const clusterBl = getLeagueBaseline('cluster', pitchName, year)
        const hdevBl = getLeagueBaseline('hdev', pitchName, year)
        const vdevBl = getLeagueBaseline('vdev', pitchName, year)
        const missfireBl = getLeagueBaseline('missfire', pitchName, year)

        const brinkPlus = avgBrink != null && brinkBl ? computePlus(avgBrink, brinkBl.mean, brinkBl.stddev) : null
        // For cluster/hdev/vdev/missfire: lower is better, so invert
        const clusterPlus = avgCluster != null && clusterBl ? 100 - (computePlus(avgCluster, clusterBl.mean, clusterBl.stddev) - 100) : null
        const hdevPlus = avgHdev != null && hdevBl ? 100 - (computePlus(avgHdev, hdevBl.mean, hdevBl.stddev) - 100) : null
        const vdevPlus = avgVdev != null && vdevBl ? 100 - (computePlus(avgVdev, vdevBl.mean, vdevBl.stddev) - 100) : null
        const missfirePlus = avgMissfire != null && missfireBl ? 100 - (computePlus(avgMissfire, missfireBl.mean, missfireBl.stddev) - 100) : null

        // Composites
        const cmdPlus = brinkPlus != null && clusterPlus != null && missfirePlus != null
          ? computeCommandPlus(brinkPlus, clusterPlus, missfirePlus) : null
        const rpcomPlus = brinkPlus != null && clusterPlus != null && hdevPlus != null && vdevPlus != null && missfirePlus != null
          ? computeRPComPlus(brinkPlus, clusterPlus, hdevPlus, vdevPlus, missfirePlus) : null

        // Waste%: pitches deliberately thrown outside zone in 2-strike counts
        // Simplified: zone > 9 pitches / total pitches
        const wasteCount = pitches.filter(p => p.zone > 9).length
        const wastePct = (wasteCount / pitches.length) * 100

        upsertRows.push({
          pitcher: parseInt(pitcherId),
          player_name: playerName,
          game_year: year,
          pitch_name: pitchName,
          pitches: pitches.length,
          avg_brink: avgBrink != null ? +avgBrink.toFixed(2) : null,
          avg_cluster: avgCluster != null ? +avgCluster.toFixed(2) : null,
          avg_hdev: avgHdev != null ? +avgHdev.toFixed(2) : null,
          avg_vdev: avgVdev != null ? +avgVdev.toFixed(2) : null,
          avg_missfire: avgMissfire != null ? +avgMissfire.toFixed(2) : null,
          brink_plus: brinkPlus != null ? +brinkPlus.toFixed(1) : null,
          cluster_plus: clusterPlus != null ? +clusterPlus.toFixed(1) : null,
          hdev_plus: hdevPlus != null ? +hdevPlus.toFixed(1) : null,
          vdev_plus: vdevPlus != null ? +vdevPlus.toFixed(1) : null,
          missfire_plus: missfirePlus != null ? +missfirePlus.toFixed(1) : null,
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
