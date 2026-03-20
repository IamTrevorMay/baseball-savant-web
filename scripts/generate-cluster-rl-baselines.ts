/**
 * Generate league baselines for ClusterR / ClusterL (cluster split by batter handedness).
 * Outputs the data structures to paste into lib/leagueStats.ts.
 *
 * Usage: npx tsx scripts/generate-cluster-rl-baselines.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envContent = readFileSync('.env.local', 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=["']?([^"'\n]*)["']?$/)
  if (match) process.env[match[1]] = match[2]
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]

async function main() {
  // 1. Generate centroids by stand (league-wide avg plate_x/plate_z per pitch_name per stand per year)
  console.log('// ── CENTROIDS BY STAND ──')
  for (const stand of ['R', 'L'] as const) {
    console.log(`\nexport const CENTROIDS_${stand}_BY_YEAR: YearCentroids = {`)
    for (const year of YEARS) {
      const sql = `
        SELECT pitch_name,
          ROUND(AVG(plate_x)::numeric, 4) as cx,
          ROUND(AVG(plate_z)::numeric, 4) as cz
        FROM pitches
        WHERE game_year = ${year}
          AND stand = '${stand}'
          AND pitch_name IS NOT NULL
          AND plate_x IS NOT NULL AND plate_z IS NOT NULL
          AND pitch_type NOT IN ('PO', 'IN')
        GROUP BY pitch_name
        HAVING COUNT(*) >= 500
        ORDER BY pitch_name
      `
      const { data, error } = await supabase.rpc('run_query', { query_text: sql })
      if (error) { console.error(`Error ${year} ${stand}:`, error.message); continue }
      const entries = (data || []).map((r: any) =>
        `    '${r.pitch_name}': { cx: ${r.cx}, cz: ${r.cz} }`
      ).join(',\n')
      console.log(`  ${year}: {\n${entries}\n  },`)
    }
    console.log('}')
  }

  // 2. Generate cluster baselines by stand (pitcher-level avg cluster, mean/stddev across pitchers)
  console.log('\n// ── CLUSTER BASELINES BY STAND ──')
  for (const stand of ['R', 'L'] as const) {
    console.log(`\nexport const CLUSTER_${stand}_LEAGUE_BY_YEAR: YearLeague = {`)
    for (const year of YEARS) {
      // Compute per-pitcher, per-pitch-type avg cluster distance vs this stand,
      // then take mean/stddev across pitchers (min 30 pitches vs that hand)
      const sql = `
        WITH centroids AS (
          SELECT pitch_name, AVG(plate_x) as cx, AVG(plate_z) as cz
          FROM pitches
          WHERE game_year = ${year} AND stand = '${stand}'
            AND pitch_name IS NOT NULL AND plate_x IS NOT NULL AND plate_z IS NOT NULL
            AND pitch_type NOT IN ('PO', 'IN')
          GROUP BY pitch_name
        ),
        pitcher_avgs AS (
          SELECT p.pitcher, p.pitch_name,
            AVG(SQRT(POWER(p.plate_x - c.cx, 2) + POWER(p.plate_z - c.cz, 2)) * 12) as avg_cluster
          FROM pitches p
          JOIN centroids c ON c.pitch_name = p.pitch_name
          WHERE p.game_year = ${year} AND p.stand = '${stand}'
            AND p.pitch_name IS NOT NULL AND p.plate_x IS NOT NULL AND p.plate_z IS NOT NULL
            AND p.pitch_type NOT IN ('PO', 'IN')
          GROUP BY p.pitcher, p.pitch_name
          HAVING COUNT(*) >= 30
        )
        SELECT pitch_name,
          ROUND(AVG(avg_cluster)::numeric, 2) as mean,
          ROUND(STDDEV(avg_cluster)::numeric, 2) as stddev
        FROM pitcher_avgs
        GROUP BY pitch_name
        HAVING COUNT(*) >= 10
        ORDER BY pitch_name
      `
      const { data, error } = await supabase.rpc('run_query', { query_text: sql })
      if (error) { console.error(`Error ${year} ${stand}:`, error.message); continue }
      const entries = (data || []).map((r: any) =>
        `    '${r.pitch_name}': { mean: ${r.mean}, stddev: ${r.stddev} }`
      ).join(',\n')
      console.log(`  ${year}: {\n${entries}\n  },`)
    }
    console.log('}')
  }
}

main().catch(console.error)
