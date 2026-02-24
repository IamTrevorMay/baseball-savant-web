import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
    current += ch
  }
  result.push(current.trim())
  return result
}

export async function POST(req: NextRequest) {
  try {
    const { season } = await req.json().catch(() => ({ season: null }))
    const minSeason = season || 2015
    const maxSeason = season || 2025

    let totalInserted = 0

    for (let yr = minSeason; yr <= maxSeason; yr++) {
      const url = `https://baseballsavant.mlb.com/leaderboard/sprint_speed?min_season=${yr}&max_season=${yr}&position=&team=&min=0&csv=true`
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!resp.ok) continue

      const csv = (await resp.text()).replace(/^\uFEFF/, '') // strip BOM
      if (csv.length < 50) continue

      const lines = csv.split('\n').filter(l => l.trim())
      const headers = parseCSVLine(lines[0])

      const rows: any[] = []
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i])
        if (vals.length !== headers.length) continue

        const row: Record<string, any> = {}
        headers.forEach((h, j) => {
          const v = vals[j]
          row[h] = (v === '' || v === 'null') ? null : v
        })

        if (!row.player_id) continue

        const name = row['last_name, first_name']
        rows.push({
          season: yr,
          player_id: Number(row.player_id),
          player_name: name ? name.split(', ').reverse().join(' ') : null,
          team: row.team || null,
          sprint_speed: row.sprint_speed ? Number(row.sprint_speed) : null,
          hp_to_1b: row.hp_to_1b ? Number(row.hp_to_1b) : null,
          bolts: row.bolts ? Number(row.bolts) : null,
          competitive_runs: row.competitive_runs ? Number(row.competitive_runs) : null,
        })
      }

      if (rows.length === 0) continue

      const batchSize = 500
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const { error } = await supabase.from('sprint_speed').upsert(batch, { onConflict: 'season,player_id' })
        if (error) console.error(`Sprint speed ${yr} batch error:`, error.message)
      }

      totalInserted += rows.length
    }

    return NextResponse.json({
      inserted: totalInserted,
      message: `Populated sprint speed for seasons ${minSeason}-${maxSeason}`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
