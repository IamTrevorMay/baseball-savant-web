import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GAME_TYPE_MAP: Record<string, string> = {
  R: 'R|',
  S: 'S|',
  P: 'P|',
}

async function syncNewPlayers(rows: any[]) {
  // Collect unique pitcher IDs and names from CSV data
  const pitcherMap = new Map<number, string>()
  for (const r of rows) {
    if (r.pitcher && r.player_name) pitcherMap.set(r.pitcher, r.player_name)
  }

  // Collect unique batter IDs
  const batterIds = [...new Set(rows.map(r => r.batter).filter(Boolean))] as number[]

  // Check which players already exist
  const allIds = [...new Set([...pitcherMap.keys(), ...batterIds])]
  if (allIds.length === 0) return

  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .in('id', allIds)
  const existingSet = new Set((existing || []).map((p: any) => p.id))

  // Insert missing pitchers (we have names from player_name column)
  const missingPitchers = [...pitcherMap.entries()]
    .filter(([id]) => !existingSet.has(id))
    .map(([id, name]) => ({ id, name }))

  // For missing batters, fetch names from MLB People API in batches of 50
  const missingBatterIds = batterIds.filter(id => !existingSet.has(id) && !pitcherMap.has(id))
  const missingBatters: { id: number; name: string }[] = []

  for (let i = 0; i < missingBatterIds.length; i += 50) {
    const batch = missingBatterIds.slice(i, i + 50)
    const ids = batch.join(',')
    try {
      const resp = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids}`)
      const data = await resp.json()
      for (const p of data.people || []) {
        missingBatters.push({ id: p.id, name: p.fullName })
      }
    } catch { /* skip batch on error */ }
  }

  const toInsert = [...missingPitchers, ...missingBatters]
  if (toInsert.length > 0) {
    await supabase.from('players').upsert(toInsert, { onConflict: 'id', ignoreDuplicates: true })
  }
}

export async function syncPitches(start_date: string, end_date: string, game_type: string = 'R') {
  const hfGT = GAME_TYPE_MAP[game_type] || 'R|'

  const params = new URLSearchParams({
    all: 'true', hfPT: '', hfAB: '', hfGT, hfPR: '', hfZ: '',
    stadium: '', hfBBL: '', hfNewZones: '', hfPull: '', hfC: '',
    hfSea: '', hfSit: '', player_type: 'pitcher', hfOuts: '',
    opponent: '', pitcher_throws: '', batter_stands: '', hfSA: '',
    game_date_gt: start_date, game_date_lt: end_date,
    hfMo: '', team: '', home_road: '', hfRO: '', position: '',
    hfInfield: '', hfOutfield: '', hfInn: '', hfBBT: '', hfFlag: '',
    metric_1: '', group_by: 'name', min_pitches: '0',
    min_results: '0', min_pas: '0', sort_col: 'pitches',
    player_event_sort: 'api_p_release_speed', sort_order: 'desc',
    type: 'details'
  })

  const savantUrl = `https://baseballsavant.mlb.com/statcast_search/csv?${params}`
  const resp = await fetch(savantUrl, { signal: AbortSignal.timeout(120000) })

  if (!resp.ok) throw new Error('Failed to fetch from Baseball Savant')

  const csv = (await resp.text()).replace(/^\ufeff/, '') // strip UTF-8 BOM
  if (csv.length < 100) return { fetched: 0, inserted: 0, errors: 0, message: 'No data available for this date range' }

  // Parse CSV (proper RFC 4180 parser to handle quoted fields with commas)
  function parseCSVLine(line: string): string[] {
    const fields: string[] = []
    let i = 0
    while (i <= line.length) {
      if (i === line.length) { fields.push(''); break }
      if (line[i] === '"') {
        let val = ''
        i++ // skip opening quote
        while (i < line.length) {
          if (line[i] === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') { val += '"'; i += 2 }
            else { i++; break }
          } else { val += line[i]; i++ }
        }
        fields.push(val)
        if (i < line.length && line[i] === ',') i++ // skip comma
      } else {
        const next = line.indexOf(',', i)
        if (next === -1) { fields.push(line.slice(i)); break }
        fields.push(line.slice(i, next))
        i = next + 1
      }
    }
    return fields
  }

  const lines = csv.split('\n')
  const headers = parseCSVLine(lines[0]).map(h => h.trim()).filter(h => h !== '')
  const numHeaders = headers.length
  const rows: any[] = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseCSVLine(lines[i])
    // Allow rows with >= numHeaders fields (trailing empty fields from commas)
    if (vals.length < numHeaders) continue
    const row: any = {}
    headers.forEach((h, j) => {
      let v: any = vals[j]?.trim() || null
      if (v === '' || v === 'null') v = null
      else if (v && !isNaN(Number(v)) && h !== 'game_date' && h !== 'sv_id') v = Number(v)
      row[h] = v
    })
    if (row.game_pk) rows.push(row)
  }

  if (rows.length === 0) return { fetched: 0, inserted: 0, errors: 0, message: 'No valid rows parsed' }

  // Remove id column if present
  rows.forEach(r => delete r.id)
  // Remove unnamed columns
  rows.forEach(r => { Object.keys(r).forEach(k => { if (k.startsWith('Unnamed')) delete r[k] }) })

  // Upload in batches
  let inserted = 0
  let errors = 0
  const batchSize = 500

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from('pitches').upsert(batch, {
      onConflict: 'game_pk,at_bat_number,pitch_number',
      ignoreDuplicates: false
    })
    if (error) errors += batch.length
    else inserted += batch.length
  }

  // Sync any new players that appeared in the ingested data
  await syncNewPlayers(rows)

  // Refresh materialized views
  await supabase.rpc('refresh_player_summary')
  await supabase.rpc('refresh_batter_summary')

  // Compute Stuff+ for the ingested date range
  const stuffResult = await computeStuffPlusForDateRange(supabase as any, start_date, end_date)
  if (!stuffResult.ok) {
    console.error('Stuff+ computation failed:', stuffResult.error)
  }

  // Recompute SOS for affected years
  const sosResult = await computeSOSForYears(supabase as any, start_date, end_date)
  if (!sosResult.ok) {
    console.error('SOS computation failed:', sosResult.error)
  }

  return {
    fetched: rows.length,
    inserted,
    errors,
    message: `Fetched ${rows.length} pitches, ${inserted} processed`,
    stuff_plus: stuffResult,
    sos: sosResult,
  }
}

async function computeStuffPlusForDateRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  startDate: string,
  endDate: string
) {
  try {
    const m = async (sql: string) => {
      const res = await sb.rpc('run_mutation', { query_text: sql.trim() })
      if (res.error) {
        console.error('run_mutation error:', res.error.message)
        throw new Error(`run_mutation failed: ${res.error.message}`)
      }
      return res
    }

    // Determine affected years from date range
    const startYear = new Date(startDate).getFullYear()
    const endYear = new Date(endDate).getFullYear()
    const years: number[] = []
    for (let y = startYear; y <= endYear; y++) years.push(y)

    // Refresh baselines for affected years
    for (const year of years) {
      await m(`
        INSERT INTO pitch_baselines (pitch_name, game_year, avg_velo, std_velo, avg_movement, std_movement, avg_ext, std_ext, pitch_count)
        SELECT
          pitch_name,
          game_year,
          ROUND(AVG(release_speed)::numeric, 4),
          ROUND(STDDEV(release_speed)::numeric, 4),
          ROUND(AVG(SQRT(POWER(pfx_x * 12, 2) + POWER(pfx_z * 12, 2)))::numeric, 4),
          ROUND(STDDEV(SQRT(POWER(pfx_x * 12, 2) + POWER(pfx_z * 12, 2)))::numeric, 4),
          ROUND(AVG(release_extension)::numeric, 4),
          ROUND(STDDEV(release_extension)::numeric, 4),
          COUNT(*)::int
        FROM pitches
        WHERE pitch_name IS NOT NULL
          AND release_speed IS NOT NULL
          AND pfx_x IS NOT NULL AND pfx_z IS NOT NULL
          AND release_extension IS NOT NULL
          AND game_year = ${year}
        GROUP BY pitch_name, game_year
        ON CONFLICT (pitch_name, game_year) DO UPDATE SET
          avg_velo     = EXCLUDED.avg_velo,
          std_velo     = EXCLUDED.std_velo,
          avg_movement = EXCLUDED.avg_movement,
          std_movement = EXCLUDED.std_movement,
          avg_ext      = EXCLUDED.avg_ext,
          std_ext      = EXCLUDED.std_ext,
          pitch_count  = EXCLUDED.pitch_count
      `)
    }

    // Update stuff_plus for pitches in the date range (scoped — no batching needed)
    await m(`
      UPDATE pitches p
      SET stuff_plus = GREATEST(0, LEAST(200, ROUND(
        100
        + COALESCE((p.release_speed - b.avg_velo) / NULLIF(b.std_velo, 0), 0) * 4.5
        + COALESCE((SQRT(POWER(p.pfx_x * 12, 2) + POWER(p.pfx_z * 12, 2)) - b.avg_movement) / NULLIF(b.std_movement, 0), 0) * 3.5
        + COALESCE((p.release_extension - b.avg_ext) / NULLIF(b.std_ext, 0), 0) * 2.0
      )::numeric))
      FROM pitch_baselines b
      WHERE p.pitch_name = b.pitch_name
        AND p.game_year = b.game_year
        AND p.game_date BETWEEN '${startDate}' AND '${endDate}'
        AND p.release_speed IS NOT NULL
    `)

    return { ok: true, years }
  } catch (err: any) {
    console.error('computeStuffPlusForDateRange error:', err)
    return { ok: false, error: err.message }
  }
}

const SOS_REGRESSION_K = 60

export async function computeSOSForYears(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  startDate: string,
  endDate: string
) {
  try {
    const q = async (sql: string) => {
      const res = await sb.rpc('run_query_long', { query_text: sql.trim() })
      if (res.error) throw new Error(`run_query_long failed: ${res.error.message}`)
      return res.data || []
    }
    const m = async (sql: string) => {
      const res = await sb.rpc('run_mutation', { query_text: sql.trim() })
      if (res.error) throw new Error(`run_mutation failed: ${res.error.message}`)
      return res
    }

    const startYear = parseInt(startDate.slice(0, 4), 10)
    const endYear = parseInt(endDate.slice(0, 4), 10)
    const years: number[] = []
    for (let y = startYear; y <= endYear; y++) years.push(y)

    let totalUpserted = 0

    for (const year of years) {
      const yStart = `${year}-01-01`
      const yEnd = `${year}-12-31`
      const f = `game_date BETWEEN '${yStart}' AND '${yEnd}' AND events IS NOT NULL AND game_type = 'R' AND pitch_type NOT IN ('PO','IN')`

      // ── Hitter SOS ──────────────────────────────────────────────────
      const hitterRows = await q(`
        WITH all_pitcher_stats AS (
          SELECT pitcher, COUNT(*) AS total_pa,
            SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS total_xwoba_sum
          FROM pitches WHERE ${f} GROUP BY pitcher
        ),
        league AS (
          SELECT AVG(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_avg,
                 STDDEV(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_std
          FROM all_pitcher_stats WHERE total_pa >= 10
        ),
        matchup_stats AS (
          SELECT batter, pitcher, COUNT(*) AS mu_pa,
            SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS mu_xwoba_sum
          FROM pitches WHERE ${f} GROUP BY batter, pitcher
        ),
        loo AS (
          SELECT m.batter, m.pitcher, m.mu_pa AS pas_vs,
            (a.total_pa - m.mu_pa) AS loo_n,
            CASE WHEN (a.total_pa - m.mu_pa) > 0
              THEN (a.total_xwoba_sum - COALESCE(m.mu_xwoba_sum, 0)) / (a.total_pa - m.mu_pa)
            END AS loo_xwoba
          FROM matchup_stats m
          JOIN all_pitcher_stats a ON m.pitcher = a.pitcher
        ),
        regressed AS (
          SELECT batter, pitcher, pas_vs,
            (loo_n * loo_xwoba + ${SOS_REGRESSION_K} * l.lg_avg) / (loo_n + ${SOS_REGRESSION_K}) AS reg_xwoba
          FROM loo CROSS JOIN league l WHERE loo_xwoba IS NOT NULL
        )
        SELECT
          r.batter AS player_id,
          SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) AS raw_sos,
          l.lg_avg, l.lg_std,
          100 + ((l.lg_avg - SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0)) / NULLIF(l.lg_std, 0)) * 10 AS sos,
          COUNT(DISTINCT r.pitcher) AS opp_count,
          SUM(r.pas_vs) AS total_pa
        FROM regressed r CROSS JOIN league l
        GROUP BY r.batter, l.lg_avg, l.lg_std
        HAVING SUM(r.pas_vs) >= 10
      `)

      if (hitterRows.length > 0) {
        const values = hitterRows.map((r: any) =>
          `(${r.player_id}, ${year}, 'hitter', ${r.sos != null ? Math.round(r.sos * 10) / 10 : 'NULL'}, ${r.raw_sos != null ? Math.round(r.raw_sos * 10000) / 10000 : 'NULL'}, ${r.lg_avg != null ? Math.round(r.lg_avg * 10000) / 10000 : 'NULL'}, ${r.lg_std != null ? Math.round(r.lg_std * 10000) / 10000 : 'NULL'}, ${r.opp_count}, ${r.total_pa}, NOW())`
        ).join(',\n')

        await m(`
          INSERT INTO sos_scores (player_id, game_year, role, sos, raw_opponent_xwoba, league_avg_xwoba, league_std_xwoba, opponents_faced, total_pa, updated_at)
          VALUES ${values}
          ON CONFLICT (player_id, game_year, role) DO UPDATE SET
            sos = EXCLUDED.sos,
            raw_opponent_xwoba = EXCLUDED.raw_opponent_xwoba,
            league_avg_xwoba = EXCLUDED.league_avg_xwoba,
            league_std_xwoba = EXCLUDED.league_std_xwoba,
            opponents_faced = EXCLUDED.opponents_faced,
            total_pa = EXCLUDED.total_pa,
            updated_at = NOW()
        `)
        totalUpserted += hitterRows.length
      }

      // ── Pitcher SOS ─────────────────────────────────────────────────
      const pitcherRows = await q(`
        WITH all_batter_stats AS (
          SELECT batter, COUNT(*) AS total_pa,
            SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS total_xwoba_sum
          FROM pitches WHERE ${f} GROUP BY batter
        ),
        league AS (
          SELECT AVG(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_avg,
                 STDDEV(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_std
          FROM all_batter_stats WHERE total_pa >= 10
        ),
        matchup_stats AS (
          SELECT pitcher, batter, COUNT(*) AS mu_pa,
            SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS mu_xwoba_sum
          FROM pitches WHERE ${f} GROUP BY pitcher, batter
        ),
        loo AS (
          SELECT m.pitcher, m.batter, m.mu_pa AS pas_vs,
            (a.total_pa - m.mu_pa) AS loo_n,
            CASE WHEN (a.total_pa - m.mu_pa) > 0
              THEN (a.total_xwoba_sum - COALESCE(m.mu_xwoba_sum, 0)) / (a.total_pa - m.mu_pa)
            END AS loo_xwoba
          FROM matchup_stats m
          JOIN all_batter_stats a ON m.batter = a.batter
        ),
        regressed AS (
          SELECT pitcher, batter, pas_vs,
            (loo_n * loo_xwoba + ${SOS_REGRESSION_K} * l.lg_avg) / (loo_n + ${SOS_REGRESSION_K}) AS reg_xwoba
          FROM loo CROSS JOIN league l WHERE loo_xwoba IS NOT NULL
        )
        SELECT
          r.pitcher AS player_id,
          SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) AS raw_sos,
          l.lg_avg, l.lg_std,
          100 + ((SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) - l.lg_avg) / NULLIF(l.lg_std, 0)) * 10 AS sos,
          COUNT(DISTINCT r.batter) AS opp_count,
          SUM(r.pas_vs) AS total_pa
        FROM regressed r CROSS JOIN league l
        GROUP BY r.pitcher, l.lg_avg, l.lg_std
        HAVING SUM(r.pas_vs) >= 10
      `)

      if (pitcherRows.length > 0) {
        const values = pitcherRows.map((r: any) =>
          `(${r.player_id}, ${year}, 'pitcher', ${r.sos != null ? Math.round(r.sos * 10) / 10 : 'NULL'}, ${r.raw_sos != null ? Math.round(r.raw_sos * 10000) / 10000 : 'NULL'}, ${r.lg_avg != null ? Math.round(r.lg_avg * 10000) / 10000 : 'NULL'}, ${r.lg_std != null ? Math.round(r.lg_std * 10000) / 10000 : 'NULL'}, ${r.opp_count}, ${r.total_pa}, NOW())`
        ).join(',\n')

        await m(`
          INSERT INTO sos_scores (player_id, game_year, role, sos, raw_opponent_xwoba, league_avg_xwoba, league_std_xwoba, opponents_faced, total_pa, updated_at)
          VALUES ${values}
          ON CONFLICT (player_id, game_year, role) DO UPDATE SET
            sos = EXCLUDED.sos,
            raw_opponent_xwoba = EXCLUDED.raw_opponent_xwoba,
            league_avg_xwoba = EXCLUDED.league_avg_xwoba,
            league_std_xwoba = EXCLUDED.league_std_xwoba,
            opponents_faced = EXCLUDED.opponents_faced,
            total_pa = EXCLUDED.total_pa,
            updated_at = NOW()
        `)
        totalUpserted += pitcherRows.length
      }
    }

    return { ok: true, years, upserted: totalUpserted }
  } catch (err: any) {
    console.error('computeSOSForYears error:', err)
    return { ok: false, error: err.message }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { start_date, end_date, game_type } = await req.json()
    const result = await syncPitches(start_date, end_date, game_type || 'R')

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
