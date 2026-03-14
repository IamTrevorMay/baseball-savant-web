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

  // Refresh materialized view
  await supabase.rpc('refresh_player_summary')

  // Compute Stuff+ for the ingested date range
  const stuffResult = await computeStuffPlusForDateRange(supabase as any, start_date, end_date)
  if (!stuffResult.ok) {
    console.error('Stuff+ computation failed:', stuffResult.error)
  }

  return {
    fetched: rows.length,
    inserted,
    errors,
    message: `Fetched ${rows.length} pitches, ${inserted} processed`,
    stuff_plus: stuffResult,
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

export async function POST(req: NextRequest) {
  try {
    const { start_date, end_date, game_type } = await req.json()
    const result = await syncPitches(start_date, end_date, game_type || 'R')

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
