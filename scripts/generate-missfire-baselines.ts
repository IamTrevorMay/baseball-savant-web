/**
 * Regenerate missfire + close_pct league baselines with the new no-swing filter.
 * Outputs data to paste into lib/leagueStats.ts.
 *
 * Usage: npx tsx scripts/generate-missfire-baselines.ts
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

const NO_SWING = `description NOT IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','hit_into_play','hit_into_play_no_out','hit_into_play_score','missed_bunt')`

async function main() {
  // MISSFIRE baselines (excluding swings)
  console.log('export const MISSFIRE_LEAGUE_BY_YEAR: YearLeague = {')
  for (const year of YEARS) {
    const sql = `
      WITH pitcher_avgs AS (
        SELECT p.pitcher, p.pitch_name,
          AVG(ABS(LEAST(plate_x + 0.83, 0.83 - plate_x, plate_z - sz_bot, sz_top - plate_z)) * 12)
            FILTER (WHERE zone > 9 AND ${NO_SWING}) as avg_missfire
        FROM pitches p
        WHERE p.game_year = ${year}
          AND p.pitch_name IS NOT NULL AND p.plate_x IS NOT NULL AND p.plate_z IS NOT NULL
          AND p.sz_top IS NOT NULL AND p.sz_bot IS NOT NULL
          AND p.pitch_type NOT IN ('PO', 'IN')
        GROUP BY p.pitcher, p.pitch_name
        HAVING COUNT(*) >= 50
          AND COUNT(*) FILTER (WHERE zone > 9 AND ${NO_SWING}) >= 10
      )
      SELECT pitch_name,
        ROUND(AVG(avg_missfire)::numeric, 2) as mean,
        ROUND(STDDEV(avg_missfire)::numeric, 2) as stddev
      FROM pitcher_avgs
      WHERE avg_missfire IS NOT NULL
      GROUP BY pitch_name
      HAVING COUNT(*) >= 10
      ORDER BY pitch_name
    `
    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) { console.error(`  Error ${year}:`, error.message); continue }
    const entries = (data || []).map((r: any) =>
      `    '${r.pitch_name}': { mean: ${r.mean}, stddev: ${r.stddev} }`
    ).join(',\n')
    console.log(`  ${year}: {\n${entries}\n  },`)
  }
  console.log('}')

  // CLOSE_PCT baselines (excluding swings)
  console.log('\nexport const CLOSE_PCT_LEAGUE_BY_YEAR: YearLeague = {')
  for (const year of YEARS) {
    const sql = `
      WITH pitcher_avgs AS (
        SELECT p.pitcher, p.pitch_name,
          100.0 * COUNT(*) FILTER (WHERE zone > 9 AND ${NO_SWING} AND LEAST(plate_x + 0.83, 0.83 - plate_x, plate_z - sz_bot, sz_top - plate_z) * 12 > -2)
            / NULLIF(COUNT(*) FILTER (WHERE zone > 9 AND ${NO_SWING}), 0) as close_pct
        FROM pitches p
        WHERE p.game_year = ${year}
          AND p.pitch_name IS NOT NULL AND p.plate_x IS NOT NULL AND p.plate_z IS NOT NULL
          AND p.sz_top IS NOT NULL AND p.sz_bot IS NOT NULL
          AND p.pitch_type NOT IN ('PO', 'IN')
        GROUP BY p.pitcher, p.pitch_name
        HAVING COUNT(*) >= 50
          AND COUNT(*) FILTER (WHERE zone > 9 AND ${NO_SWING}) >= 10
      )
      SELECT pitch_name,
        ROUND(AVG(close_pct)::numeric, 2) as mean,
        ROUND(STDDEV(close_pct)::numeric, 2) as stddev
      FROM pitcher_avgs
      WHERE close_pct IS NOT NULL
      GROUP BY pitch_name
      HAVING COUNT(*) >= 10
      ORDER BY pitch_name
    `
    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) { console.error(`  Error ${year}:`, error.message); continue }
    const entries = (data || []).map((r: any) =>
      `    '${r.pitch_name}': { mean: ${r.mean}, stddev: ${r.stddev} }`
    ).join(',\n')
    console.log(`  ${year}: {\n${entries}\n  },`)
  }
  console.log('}')
}

main().catch(console.error)
