/**
 * Export 2026 hitting stats to CSV matching the 4.1 Show format.
 * Usage: npx tsx scripts/export-2026-hitting.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Load .env.local
const envContent = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input: any, init?: any) => fetch(input, { ...init, signal: AbortSignal.timeout(120000) }) } }
)

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

async function main() {
  console.log('Querying 2026 hitting stats...')

  const { data, error } = await q(`
    SELECT
      p2.name as player,
      COUNT(DISTINCT p.game_pk) as g,
      COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 100000 + p.at_bat_number END) as pa,
      COUNT(*) FILTER (WHERE p.events IN ('single','double','triple','home_run')) as h,
      COUNT(*) FILTER (WHERE p.events = 'double') as "2b",
      COUNT(*) FILTER (WHERE p.events = 'triple') as "3b",
      COUNT(*) FILTER (WHERE p.events = 'home_run') as hr,
      COUNT(*) FILTER (WHERE p.events = 'walk') as bb,
      COUNT(*) FILTER (WHERE p.events = 'hit_by_pitch') as hbp,
      COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%') as k,
      -- AB = PA - BB - HBP - sac_fly - sac_bunt - catcher_interf
      COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','catcher_interf') THEN p.game_pk::bigint * 100000 + p.at_bat_number END) as ab,
      -- TB for SLG
      (COUNT(*) FILTER (WHERE p.events = 'single')
       + 2 * COUNT(*) FILTER (WHERE p.events = 'double')
       + 3 * COUNT(*) FILTER (WHERE p.events = 'triple')
       + 4 * COUNT(*) FILTER (WHERE p.events = 'home_run')) as tb,
      -- Batted ball metrics (only on balls in play)
      ROUND(AVG(p.launch_speed) FILTER (WHERE p.launch_speed IS NOT NULL)::numeric, 1) as ev,
      ROUND(AVG(p.launch_angle) FILTER (WHERE p.launch_angle IS NOT NULL)::numeric, 1) as la,
      ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed >= 95)
        / NULLIF(COUNT(*) FILTER (WHERE p.launch_speed IS NOT NULL), 0), 1) as hh_pct,
      ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed_angle::text = '6')
        / NULLIF(COUNT(*) FILTER (WHERE p.launch_speed_angle IS NOT NULL), 0), 1) as brl_pct,
      -- Expected stats
      ROUND(AVG(p.estimated_ba_using_speedangle) FILTER (WHERE p.estimated_ba_using_speedangle IS NOT NULL)::numeric, 3) as xba,
      ROUND(AVG(p.estimated_woba_using_speedangle) FILTER (WHERE p.estimated_woba_using_speedangle IS NOT NULL)::numeric, 3) as xwoba,
      -- xSLG (using woba scale factor to approximate)
      ROUND(AVG(
        CASE WHEN p.estimated_woba_using_speedangle IS NOT NULL
          THEN (p.estimated_woba_using_speedangle / NULLIF(0.318, 0)) * 0.400
          ELSE NULL END
      )::numeric, 3) as xslg,
      -- Bat speed & swing length
      ROUND(AVG(p.bat_speed) FILTER (WHERE p.bat_speed IS NOT NULL)::numeric, 1) as batspd,
      ROUND(AVG(p.swing_length) FILTER (WHERE p.swing_length IS NOT NULL)::numeric, 1) as swglen
    FROM pitches p
    JOIN players p2 ON p2.id = p.batter
    WHERE p.game_year = 2026
      AND p.game_type = 'R'
      AND p.pitch_type NOT IN ('PO', 'IN')
    AND (
      p2.name IN (
        'Bichette, Bo', 'Raleigh, Cal', 'Arozarena, Randy', 'Naylor, Josh',
        'Stewart, Sal', 'DeLauter, Chase', 'Wetherholt, JJ', 'Trout, Mike'
      )
      OR p.batter IN (
        677594,  -- Julio Rodríguez
        805808,  -- Kevin McGonigle
        701807   -- Carson Benge
      )
    )
    GROUP BY p.batter, p2.name
    ORDER BY p2.name
  `)

  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.error('No data returned')
    process.exit(1)
  }

  console.log(`Got ${data.length} batters`)

  // Convert DB name to "First Last" display format
  function displayName(dbName: string): string {
    // "Rodríguez, Julio" -> "Julio Rodriguez"
    const parts = dbName.split(', ')
    if (parts.length === 2) {
      const first = parts[1].replace(/\s+\w\.$/, '') // strip middle initial
      // Normalize accented characters for display
      const last = parts[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      return `${first} ${last}`
    }
    return dbName // already "First Last"
  }

  // Sort by original CSV order
  const nameOrder = [
    'Bo Bichette', 'Cal Raleigh', 'Julio Rodriguez', 'Randy Arozarena',
    'Josh Naylor', 'Kevin McGonigle', 'Carson Benge', 'Sal Stewart',
    'Chase DeLauter', 'JJ Wetherholt', 'Mike Trout',
  ]
  data.sort((a: any, b: any) => {
    const ai = nameOrder.indexOf(displayName(a.player))
    const bi = nameOrder.indexOf(displayName(b.player))
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  // Build CSV
  const header = 'Player,G,PA,H,2B,3B,HR,BB,HBP,K,AVG,OBP,SLG,OPS,EV,LA,HH%,Brl%,xBA,xwOBA,xSLG,BatSpd,SwgLen'
  const rows = data.map((r: any) => {
    const pa = Number(r.pa) || 0
    const ab = Number(r.ab) || 0
    const h = Number(r.h) || 0
    const bb = Number(r.bb) || 0
    const hbp = Number(r.hbp) || 0
    const tb = Number(r.tb) || 0

    const avg = ab > 0 ? (h / ab).toFixed(3) : '.000'
    const obp = pa > 0 ? ((h + bb + hbp) / pa).toFixed(3) : '.000'
    const slg = ab > 0 ? (tb / ab).toFixed(3) : '.000'
    const ops = (parseFloat(obp) + parseFloat(slg)).toFixed(3)

    return [
      displayName(r.player),
      r.g,
      pa,
      h,
      r['2b'],
      r['3b'],
      r.hr,
      bb,
      hbp,
      r.k,
      avg,
      obp,
      slg,
      ops,
      r.ev ?? '',
      r.la ?? '',
      r.hh_pct ?? '',
      r.brl_pct ?? '',
      r.xba ?? '',
      r.xwoba ?? '',
      r.xslg ?? '',
      r.batspd ?? '',
      r.swglen ?? '',
    ].join(',')
  })

  const csv = [header, ...rows].join('\n') + '\n'
  const outPath = '/Users/trevor/Desktop/4.1 Show/2026_hitting_stats.csv'
  fs.writeFileSync(outPath, csv)
  console.log(`Wrote ${rows.length} rows to ${outPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
