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

  // Sync new players that appeared in pitch data but aren't in the players table
  const newPlayersResult = await syncNewPlayers(supabase, start_date, end_date)

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

  // Recompute league metric baselines for affected years
  const baselinesResult = await computeLeagueBaselines(supabase as any, start_date, end_date)
  if (!baselinesResult.ok) {
    console.error('League baselines computation failed:', baselinesResult.error)
  }

  return {
    fetched: rows.length,
    inserted,
    errors,
    message: `Fetched ${rows.length} pitches, ${inserted} processed`,
    stuff_plus: stuffResult,
    sos: sosResult,
    new_players: newPlayersResult,
    league_baselines: baselinesResult,
  }
}

async function syncNewPlayers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  startDate: string,
  endDate: string
): Promise<{ inserted: number; errors: number }> {
  try {
    // Find pitcher IDs in the ingested date range that are missing from the players table
    const { data: missingPitchers } = await sb.rpc('run_query', {
      query_text: `
        SELECT DISTINCT p.pitcher AS id, p.player_name AS name
        FROM pitches p
        LEFT JOIN players pl ON pl.id = p.pitcher
        WHERE p.game_date BETWEEN '${startDate}' AND '${endDate}'
          AND pl.id IS NULL AND p.pitcher IS NOT NULL
      `,
    })

    // Find batter IDs in the ingested date range that are missing from the players table
    const { data: missingBatters } = await sb.rpc('run_query', {
      query_text: `
        SELECT DISTINCT p.batter AS id
        FROM pitches p
        LEFT JOIN players pl ON pl.id = p.batter
        WHERE p.game_date BETWEEN '${startDate}' AND '${endDate}'
          AND pl.id IS NULL AND p.batter IS NOT NULL
      `,
    })

    const playerRows: { id: number; name: string; position: string | null }[] = []

    // Pitcher names come directly from the CSV's player_name column (formatted as "Last, First")
    if (missingPitchers && missingPitchers.length > 0) {
      for (const p of missingPitchers) {
        if (p.id && p.name) {
          playerRows.push({ id: p.id, name: p.name, position: null })
        }
      }
    }

    // Batter names must be fetched from the MLB Stats API
    if (missingBatters && missingBatters.length > 0) {
      for (let i = 0; i < missingBatters.length; i += 50) {
        const batch = missingBatters.slice(i, i + 50)
        const results = await Promise.all(
          batch.map(async (b: { id: number }) => {
            try {
              const res = await fetch(
                `https://statsapi.mlb.com/api/v1/people/${b.id}`,
                { signal: AbortSignal.timeout(10000) }
              )
              if (!res.ok) return null
              const data = await res.json()
              const person = data?.people?.[0]
              if (!person) return null
              const parts = (person.fullName || '').split(' ')
              const formatted = parts.length > 1
                ? `${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(' ')}`
                : person.fullName || 'Unknown'
              return {
                id: b.id,
                name: formatted,
                position: person.primaryPosition?.abbreviation || null,
              }
            } catch {
              return null
            }
          })
        )
        for (const r of results) {
          if (r) playerRows.push(r)
        }
      }
    }

    if (playerRows.length === 0) return { inserted: 0, errors: 0 }

    let inserted = 0
    let errors = 0

    for (let i = 0; i < playerRows.length; i += 100) {
      const batch = playerRows.slice(i, i + 100)
      const { error } = await sb.from('players').upsert(batch, { onConflict: 'id' })
      if (error) errors += batch.length
      else inserted += batch.length
    }

    return { inserted, errors }
  } catch (err) {
    console.error('syncNewPlayers error:', err)
    return { inserted: 0, errors: -1 }
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

// ── League metric baselines (dynamic percentile system) ──────────────────────

export async function computeLeagueBaselines(
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
      // ── Pitcher-level metrics (one value per pitcher per season) ──
      const pitcherMetrics = await q(`
        WITH pitcher_stats AS (
          SELECT
            pitcher,
            AVG(release_speed) as avg_velo,
            MAX(release_speed) as max_velo,
            AVG(release_spin_rate) as avg_spin,
            AVG(release_extension) as extension,
            AVG(CASE WHEN pitch_name IN ('4-Seam Fastball') THEN pfx_z * 12 END) as ivb_ff,
            AVG(CASE WHEN pitch_name IN ('4-Seam Fastball')
                      AND vy0 IS NOT NULL AND vz0 IS NOT NULL AND ay IS NOT NULL AND az IS NOT NULL AND release_extension IS NOT NULL
                 THEN DEGREES(ATAN2(
                   vz0 + az * ((-vy0 - SQRT(vy0*vy0 - 2*ay*(50 - release_extension))) / ay),
                   -(vy0 + ay * ((-vy0 - SQRT(vy0*vy0 - 2*ay*(50 - release_extension))) / ay))
                 ))
            END) as vaa_ff,
            COUNT(*) FILTER (WHERE events = 'strikeout')::numeric
              / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL), 0) * 100 as k_pct,
            COUNT(*) FILTER (WHERE events = 'walk')::numeric
              / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL), 0) * 100 as bb_pct,
            COUNT(*) FILTER (WHERE description IN ('swinging_strike', 'swinging_strike_blocked'))::numeric
              / NULLIF(COUNT(*) FILTER (WHERE description IN ('swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'hit_into_play_no_out', 'hit_into_play_score')), 0) * 100 as whiff_pct,
            COUNT(*) FILTER (WHERE zone >= 11 AND description IN ('swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'foul_bunt', 'hit_into_play', 'hit_into_play_no_out', 'hit_into_play_score'))::numeric
              / NULLIF(COUNT(*) FILTER (WHERE zone >= 11), 0) * 100 as chase_pct,
            COUNT(*) FILTER (WHERE launch_speed_angle::text = '6')::numeric
              / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0) * 100 as barrel_pct,
            COUNT(*) FILTER (WHERE launch_speed >= 95)::numeric
              / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0) * 100 as hard_hit,
            AVG(launch_speed) FILTER (WHERE launch_speed IS NOT NULL) as avg_ev,
            AVG(estimated_ba_using_speedangle) FILTER (WHERE estimated_ba_using_speedangle IS NOT NULL) as xba,
            COUNT(*) FILTER (WHERE bb_type = 'ground_ball')::numeric
              / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0) * 100 as gb_pct
          FROM pitches
          WHERE game_year = ${year} AND game_type = 'R'
            AND pitch_type NOT IN ('PO', 'IN')
          GROUP BY pitcher
          HAVING COUNT(*) >= 200
        )
        SELECT
          unnest(ARRAY['avg_velo','max_velo','avg_spin','extension','ivb_ff','vaa_ff',
                        'k_pct','bb_pct','whiff_pct','chase_pct','barrel_pct','hard_hit',
                        'avg_ev','xba','gb_pct']) as metric,
          unnest(ARRAY[
            AVG(avg_velo), AVG(max_velo), AVG(avg_spin), AVG(extension), AVG(ivb_ff), AVG(vaa_ff),
            AVG(k_pct), AVG(bb_pct), AVG(whiff_pct), AVG(chase_pct), AVG(barrel_pct), AVG(hard_hit),
            AVG(avg_ev), AVG(xba), AVG(gb_pct)
          ]) as mean,
          unnest(ARRAY[
            STDDEV(avg_velo), STDDEV(max_velo), STDDEV(avg_spin), STDDEV(extension), STDDEV(ivb_ff), STDDEV(vaa_ff),
            STDDEV(k_pct), STDDEV(bb_pct), STDDEV(whiff_pct), STDDEV(chase_pct), STDDEV(barrel_pct), STDDEV(hard_hit),
            STDDEV(avg_ev), STDDEV(xba), STDDEV(gb_pct)
          ]) as stddev,
          unnest(ARRAY[
            COUNT(avg_velo), COUNT(max_velo), COUNT(avg_spin), COUNT(extension), COUNT(ivb_ff), COUNT(vaa_ff),
            COUNT(k_pct), COUNT(bb_pct), COUNT(whiff_pct), COUNT(chase_pct), COUNT(barrel_pct), COUNT(hard_hit),
            COUNT(avg_ev), COUNT(xba), COUNT(gb_pct)
          ])::int as sample_size
        FROM pitcher_stats
      `)

      const higherBetterMap: Record<string, boolean> = {
        avg_velo: true, max_velo: true, avg_spin: true, extension: true,
        ivb_ff: true, vaa_ff: true, k_pct: true, bb_pct: false,
        whiff_pct: true, chase_pct: true, barrel_pct: false, hard_hit: false,
        avg_ev: false, xba: false, gb_pct: true,
      }

      if (pitcherMetrics.length > 0) {
        const values = pitcherMetrics
          .filter((r: any) => r.mean != null && r.stddev != null && r.stddev > 0)
          .map((r: any) =>
            `('${r.metric}', ${year}, '_all', ${Number(r.mean).toFixed(4)}, ${Number(r.stddev).toFixed(4)}, ${r.sample_size}, ${higherBetterMap[r.metric] ?? true}, NOW())`
          ).join(',\n')

        if (values) {
          await m(`
            INSERT INTO league_metric_baselines (metric, game_year, pitch_type, mean, stddev, sample_size, higher_better, updated_at)
            VALUES ${values}
            ON CONFLICT (metric, game_year, pitch_type) DO UPDATE SET
              mean = EXCLUDED.mean, stddev = EXCLUDED.stddev,
              sample_size = EXCLUDED.sample_size, updated_at = NOW()
          `)
          totalUpserted += pitcherMetrics.filter((r: any) => r.mean != null && r.stddev != null && r.stddev > 0).length
        }
      }

      // ── Deception metrics (from pitcher_season_deception) ──
      const deceptionMetrics = await q(`
        SELECT
          unnest(ARRAY['unique_score', 'deception_score']) as metric,
          unnest(ARRAY[AVG(unique_score), AVG(deception_score)]) as mean,
          unnest(ARRAY[STDDEV(unique_score), STDDEV(deception_score)]) as stddev,
          unnest(ARRAY[COUNT(unique_score), COUNT(deception_score)])::int as sample_size
        FROM pitcher_season_deception
        WHERE game_year = ${year}
      `)

      if (deceptionMetrics.length > 0) {
        const values = deceptionMetrics
          .filter((r: any) => r.mean != null && r.stddev != null && r.stddev > 0)
          .map((r: any) =>
            `('${r.metric}', ${year}, '_all', ${Number(r.mean).toFixed(4)}, ${Number(r.stddev).toFixed(4)}, ${r.sample_size}, true, NOW())`
          ).join(',\n')

        if (values) {
          await m(`
            INSERT INTO league_metric_baselines (metric, game_year, pitch_type, mean, stddev, sample_size, higher_better, updated_at)
            VALUES ${values}
            ON CONFLICT (metric, game_year, pitch_type) DO UPDATE SET
              mean = EXCLUDED.mean, stddev = EXCLUDED.stddev,
              sample_size = EXCLUDED.sample_size, updated_at = NOW()
          `)
          totalUpserted += deceptionMetrics.filter((r: any) => r.mean != null && r.stddev != null && r.stddev > 0).length
        }
      }

      // ── Command metrics (per pitch type) ──
      // brink, cluster, hdev, vdev, missfire, close_pct
      const commandMetrics = await q(`
        WITH pitch_with_brink AS (
          SELECT
            pitcher, pitch_name, plate_x, plate_z, sz_bot, sz_top, zone, description,
            LEAST(
              (plate_x + 0.83),
              (0.83 - plate_x),
              (plate_z - sz_bot),
              (sz_top - plate_z)
            ) * 12 as brink_in
          FROM pitches
          WHERE game_year = ${year} AND game_type = 'R'
            AND plate_x IS NOT NULL AND sz_top IS NOT NULL
            AND pitch_type NOT IN ('PO', 'IN')
            AND pitch_name IS NOT NULL
        ),
        centroids AS (
          SELECT pitcher, pitch_name,
            AVG(plate_x) as cx, AVG(plate_z) as cz
          FROM pitch_with_brink
          GROUP BY pitcher, pitch_name
        ),
        pitcher_pitch_stats AS (
          SELECT
            p.pitcher, p.pitch_name,
            AVG(p.brink_in) as avg_brink,
            AVG(SQRT(POWER((p.plate_x - c.cx) * 12, 2) + POWER((p.plate_z - c.cz) * 12, 2))) as avg_cluster,
            AVG(ABS((p.plate_x - c.cx) * 12)) as avg_hdev,
            AVG(ABS((p.plate_z - c.cz) * 12)) as avg_vdev,
            AVG(ABS(p.brink_in)) FILTER (
              WHERE (p.zone IS NULL OR p.zone >= 11)
              AND p.description NOT IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt',
                                        'hit_into_play','hit_into_play_no_out','hit_into_play_score','missed_bunt')
            ) as avg_missfire,
            COUNT(*) FILTER (
              WHERE (p.zone IS NULL OR p.zone >= 11)
              AND p.description NOT IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt',
                                        'hit_into_play','hit_into_play_no_out','hit_into_play_score','missed_bunt')
              AND p.brink_in BETWEEN -2 AND 0
            )::numeric / NULLIF(COUNT(*) FILTER (
              WHERE (p.zone IS NULL OR p.zone >= 11)
              AND p.description NOT IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt',
                                        'hit_into_play','hit_into_play_no_out','hit_into_play_score','missed_bunt')
            ), 0) * 100 as avg_close_pct,
            COUNT(*) as n
          FROM pitch_with_brink p
          JOIN centroids c ON c.pitcher = p.pitcher AND c.pitch_name = p.pitch_name
          GROUP BY p.pitcher, p.pitch_name
          HAVING COUNT(*) >= 50
        )
        SELECT pitch_name,
          unnest(ARRAY['brink','cluster','hdev','vdev','missfire','close_pct']) as metric,
          unnest(ARRAY[AVG(avg_brink), AVG(avg_cluster), AVG(avg_hdev), AVG(avg_vdev), AVG(avg_missfire), AVG(avg_close_pct)]) as mean,
          unnest(ARRAY[STDDEV(avg_brink), STDDEV(avg_cluster), STDDEV(avg_hdev), STDDEV(avg_vdev), STDDEV(avg_missfire), STDDEV(avg_close_pct)]) as stddev,
          unnest(ARRAY[COUNT(avg_brink), COUNT(avg_cluster), COUNT(avg_hdev), COUNT(avg_vdev), COUNT(avg_missfire), COUNT(avg_close_pct)])::int as sample_size
        FROM pitcher_pitch_stats
        GROUP BY pitch_name
      `)

      const cmdHigherBetter: Record<string, boolean> = {
        brink: true, cluster: false, hdev: false, vdev: false, missfire: false, close_pct: true,
      }

      if (commandMetrics.length > 0) {
        const values = commandMetrics
          .filter((r: any) => r.mean != null && r.stddev != null && r.stddev > 0)
          .map((r: any) => {
            const pn = (r.pitch_name || '').replace(/'/g, "''")
            return `('${r.metric}', ${year}, '${pn}', ${Number(r.mean).toFixed(4)}, ${Number(r.stddev).toFixed(4)}, ${r.sample_size}, ${cmdHigherBetter[r.metric] ?? false}, NOW())`
          }).join(',\n')

        if (values) {
          await m(`
            INSERT INTO league_metric_baselines (metric, game_year, pitch_type, mean, stddev, sample_size, higher_better, updated_at)
            VALUES ${values}
            ON CONFLICT (metric, game_year, pitch_type) DO UPDATE SET
              mean = EXCLUDED.mean, stddev = EXCLUDED.stddev,
              sample_size = EXCLUDED.sample_size, updated_at = NOW()
          `)
          totalUpserted += commandMetrics.filter((r: any) => r.mean != null && r.stddev != null && r.stddev > 0).length
        }
      }
    }

    return { ok: true, years, upserted: totalUpserted }
  } catch (err: any) {
    console.error('computeLeagueBaselines error:', err)
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
