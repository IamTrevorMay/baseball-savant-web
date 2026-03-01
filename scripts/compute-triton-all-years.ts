/**
 * Compute Triton command metrics for years 2015-2023 and upsert into pitcher_season_command.
 * Uses SQL for heavy aggregation, Node.js for plus-stat normalization.
 *
 * Usage: npx tsx scripts/compute-triton-all-years.ts
 */
import { createClient } from '@supabase/supabase-js'
import {
  BRINK_LEAGUE_BY_YEAR,
  CLUSTER_LEAGUE_BY_YEAR,
  HDEV_LEAGUE_BY_YEAR,
  VDEV_LEAGUE_BY_YEAR,
  MISSFIRE_LEAGUE_BY_YEAR,
  COMMAND_WEIGHTS,
  RPCOM_WEIGHTS,
} from '../lib/leagueStats'
import { readFileSync } from 'fs'
// Load .env.local manually
const envContent = readFileSync('.env.local', 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/)
  if (match) process.env[match[1]] = match[2]
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function computePlus(avg: number, mean: number, stddev: number): number {
  return ((avg - mean) / stddev) * 10 + 100
}

function invertPlus(avg: number, mean: number, stddev: number): number {
  return 100 - (computePlus(avg, mean, stddev) - 100)
}

async function computeYear(year: number) {
  console.log(`\n=== Computing year ${year} ===`)

  const sql = `SELECT pitcher, player_name, pitch_name, game_year, COUNT(*) as pitches, AVG(LEAST(plate_x + 0.83, 0.83 - plate_x, plate_z - sz_bot, sz_top - plate_z) * 12) as avg_brink, AVG(SQRT(POWER(plate_x - cx, 2) + POWER(plate_z - cz, 2)) * 12) as avg_cluster, AVG(ABS(plate_x - cx) * 12) as avg_hdev, AVG(ABS(plate_z - cz) * 12) as avg_vdev, 100.0 * COUNT(*) FILTER (WHERE zone > 9 AND LEAST(plate_x + 0.83, 0.83 - plate_x, plate_z - sz_bot, sz_top - plate_z) * 12 > -2) / NULLIF(COUNT(*), 0) as avg_missfire, 100.0 * COUNT(*) FILTER (WHERE zone > 9) / NULLIF(COUNT(*), 0) as waste_pct FROM (SELECT p.*, c.cx, c.cz FROM pitches p JOIN (SELECT pitch_name, AVG(plate_x) as cx, AVG(plate_z) as cz FROM pitches WHERE game_year = ${year} AND pitch_name IS NOT NULL AND plate_x IS NOT NULL AND plate_z IS NOT NULL GROUP BY pitch_name) c ON c.pitch_name = p.pitch_name WHERE p.game_year = ${year} AND p.pitch_name IS NOT NULL AND p.plate_x IS NOT NULL AND p.plate_z IS NOT NULL AND p.sz_top IS NOT NULL AND p.sz_bot IS NOT NULL) sub GROUP BY pitcher, player_name, pitch_name, game_year HAVING COUNT(*) >= 50`

  const { data: rows, error } = await supabase.rpc('run_query', { query_text: sql })
  if (error) {
    console.error(`  Error fetching data for ${year}:`, error.message)
    return
  }
  if (!rows || rows.length === 0) {
    console.log(`  No data for ${year}`)
    return
  }

  console.log(`  Got ${rows.length} pitch-type rows`)

  const brinkBl = BRINK_LEAGUE_BY_YEAR[year] || {}
  const clusterBl = CLUSTER_LEAGUE_BY_YEAR[year] || {}
  const hdevBl = HDEV_LEAGUE_BY_YEAR[year] || {}
  const vdevBl = VDEV_LEAGUE_BY_YEAR[year] || {}
  const missfireBl = MISSFIRE_LEAGUE_BY_YEAR[year] || {}

  const upsertRows = rows.map((r: any) => {
    const pn = r.pitch_name

    // Plus stats (brink is NOT inverted — higher brink = closer to edge = better)
    // cluster/hdev/vdev/missfire ARE inverted — lower = tighter = better
    const brinkPlus = r.avg_brink != null && brinkBl[pn]
      ? computePlus(r.avg_brink, brinkBl[pn].mean, brinkBl[pn].stddev)
      : null
    const clusterPlus = r.avg_cluster != null && clusterBl[pn]
      ? invertPlus(r.avg_cluster, clusterBl[pn].mean, clusterBl[pn].stddev)
      : null
    const hdevPlus = r.avg_hdev != null && hdevBl[pn]
      ? invertPlus(r.avg_hdev, hdevBl[pn].mean, hdevBl[pn].stddev)
      : null
    const vdevPlus = r.avg_vdev != null && vdevBl[pn]
      ? invertPlus(r.avg_vdev, vdevBl[pn].mean, vdevBl[pn].stddev)
      : null
    const missfirePlus = r.avg_missfire != null && missfireBl[pn]
      ? invertPlus(r.avg_missfire, missfireBl[pn].mean, missfireBl[pn].stddev)
      : null

    // Composites
    const cmdPlus = brinkPlus != null && clusterPlus != null && missfirePlus != null
      ? Math.round(
          COMMAND_WEIGHTS.brinkPlus * brinkPlus +
          COMMAND_WEIGHTS.clusterPlus * clusterPlus +
          COMMAND_WEIGHTS.missfirePlus * missfirePlus
        )
      : null
    const rpcomPlus = brinkPlus != null && clusterPlus != null && hdevPlus != null && vdevPlus != null && missfirePlus != null
      ? Math.round(
          RPCOM_WEIGHTS.brinkPlus * brinkPlus +
          RPCOM_WEIGHTS.clusterPlus * clusterPlus +
          RPCOM_WEIGHTS.hdevPlus * hdevPlus +
          RPCOM_WEIGHTS.vdevPlus * vdevPlus +
          RPCOM_WEIGHTS.missfirePlus * missfirePlus
        )
      : null

    return {
      pitcher: r.pitcher,
      player_name: r.player_name,
      game_year: year,
      pitch_name: pn,
      pitches: parseInt(r.pitches),
      avg_brink: r.avg_brink != null ? +parseFloat(r.avg_brink).toFixed(2) : null,
      avg_cluster: r.avg_cluster != null ? +parseFloat(r.avg_cluster).toFixed(2) : null,
      avg_hdev: r.avg_hdev != null ? +parseFloat(r.avg_hdev).toFixed(2) : null,
      avg_vdev: r.avg_vdev != null ? +parseFloat(r.avg_vdev).toFixed(2) : null,
      avg_missfire: r.avg_missfire != null ? +parseFloat(r.avg_missfire).toFixed(2) : null,
      brink_plus: brinkPlus != null ? +brinkPlus.toFixed(1) : null,
      cluster_plus: clusterPlus != null ? +clusterPlus.toFixed(1) : null,
      hdev_plus: hdevPlus != null ? +hdevPlus.toFixed(1) : null,
      vdev_plus: vdevPlus != null ? +vdevPlus.toFixed(1) : null,
      missfire_plus: missfirePlus != null ? +missfirePlus.toFixed(1) : null,
      cmd_plus: cmdPlus != null ? +cmdPlus.toFixed(1) : null,
      rpcom_plus: rpcomPlus != null ? +rpcomPlus.toFixed(1) : null,
      waste_pct: r.waste_pct != null ? +parseFloat(r.waste_pct).toFixed(1) : null,
    }
  })

  // Filter out rows where we couldn't compute plus stats (unknown pitch types)
  const validRows = upsertRows.filter((r: any) => r.cmd_plus != null)
  const skipped = upsertRows.length - validRows.length
  if (skipped > 0) console.log(`  Skipped ${skipped} rows with unknown pitch types`)

  // Upsert in batches of 500
  let upserted = 0
  for (let i = 0; i < validRows.length; i += 500) {
    const batch = validRows.slice(i, i + 500)
    const { error: upsertErr } = await supabase
      .from('pitcher_season_command')
      .upsert(batch, { onConflict: 'pitcher,game_year,pitch_name' })
    if (upsertErr) {
      console.error(`  Upsert error at batch ${i}:`, upsertErr.message)
      return
    }
    upserted += batch.length
  }

  console.log(`  Upserted ${upserted} rows for ${year}`)
}

async function main() {
  const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]
  for (const year of years) {
    await computeYear(year)
  }

  // Verify total
  const { data } = await supabase.rpc('run_query', {
    query_text: 'SELECT game_year, COUNT(*) as cnt FROM pitcher_season_command GROUP BY game_year ORDER BY game_year'
  })
  console.log('\n=== Final counts ===')
  console.log(data)
}

main().catch(console.error)
