/**
 * Fetches and parses a Baseball Savant Statcast CSV for a given pitcher/season.
 * Reuses the RFC 4180 CSV parser from app/api/update/route.ts.
 */

export interface SavantFetchOptions {
  pitcherId: number
  season: number
  gameType?: string   // 'R' (regular), 'P' (postseason), etc.
  timeoutMs?: number
}

/** RFC 4180 compliant CSV line parser (handles quoted fields with embedded commas) */
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

export async function fetchSavantCsv(opts: SavantFetchOptions): Promise<any[]> {
  const { pitcherId, season, gameType = 'R', timeoutMs = 60_000 } = opts

  const hfGT = `${gameType}|`
  const hfSea = `${season}|`

  const params = new URLSearchParams({
    all: 'true',
    hfPT: '', hfAB: '', hfGT, hfPR: '', hfZ: '',
    stadium: '', hfBBL: '', hfNewZones: '', hfPull: '', hfC: '',
    hfSea, hfSit: '', player_type: 'pitcher', hfOuts: '',
    opponent: '', pitcher_throws: '', batter_stands: '', hfSA: '',
    game_date_gt: '', game_date_lt: '',
    hfMo: '', team: '', home_road: '', hfRO: '', position: '',
    hfInfield: '', hfOutfield: '', hfInn: '', hfBBT: '', hfFlag: '',
    metric_1: '', group_by: 'name', min_pitches: '0',
    min_results: '0', min_pas: '0', sort_col: 'pitches',
    player_event_sort: 'api_p_release_speed', sort_order: 'desc',
    [`pitchers_lookup[]`]: String(pitcherId),
    type: 'details',
  })

  const url = `https://baseballsavant.mlb.com/statcast_search/csv?${params}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })

  if (!resp.ok) {
    throw new Error(`Savant fetch failed: ${resp.status} ${resp.statusText}`)
  }

  const csv = (await resp.text()).replace(/^\ufeff/, '') // strip UTF-8 BOM
  if (csv.length < 100) return []

  const lines = csv.split('\n')
  const headers = parseCSVLine(lines[0]).map(h => h.trim()).filter(h => h !== '')
  const numHeaders = headers.length
  const rows: any[] = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseCSVLine(lines[i])
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

  return rows
}
