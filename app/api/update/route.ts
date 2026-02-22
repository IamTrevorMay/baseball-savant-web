import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { start_date, end_date } = await req.json()

    // Fetch from Baseball Savant
    const params = new URLSearchParams({
      all: 'true', hfPT: '', hfAB: '', hfGT: 'R|', hfPR: '', hfZ: '',
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

    if (!resp.ok) return NextResponse.json({ error: 'Failed to fetch from Baseball Savant' }, { status: 502 })

    const csv = await resp.text()
    if (csv.length < 100) return NextResponse.json({ fetched: 0, inserted: 0, message: 'No data available for this date range' })

    // Parse CSV
    const lines = csv.split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const rows: any[] = []

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      const vals = lines[i].match(/(".*?"|[^,]*)/g)
      if (!vals || vals.length !== headers.length) continue
      const row: any = {}
      headers.forEach((h, j) => {
        let v = vals[j]?.trim().replace(/^"|"$/g, '') || null
        if (v === '' || v === 'null') v = null
        else if (v && !isNaN(Number(v)) && h !== 'game_date' && h !== 'sv_id') v = Number(v) as any
        row[h] = v
      })
      if (row.game_pk) rows.push(row)
    }

    if (rows.length === 0) return NextResponse.json({ fetched: 0, inserted: 0, message: 'No valid rows parsed' })

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
        ignoreDuplicates: true
      })
      if (error) errors += batch.length
      else inserted += batch.length
    }

    // Refresh materialized view
    await supabase.rpc('refresh_player_summary')

    return NextResponse.json({
      fetched: rows.length,
      inserted,
      errors,
      message: `Fetched ${rows.length} pitches, ${inserted} processed`
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
