/**
 * Daily ingest of Savant's "Swing Timing & Miss Distance" bat-tracking leaderboard.
 *
 * The leaderboard is season-cumulative with no date filtering, so we snapshot it
 * each night (keyed by snapshot_date) into `bat_tracking_swing_miss` to build a
 * time-series. See scripts/create-bat-tracking-swing-miss.sql.
 *
 * Four CSV pulls per run: {pitcher, batter} × {overall, per-pitch-type}.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'

const LEADERBOARD_URL =
  'https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-timing-miss-distance'

/** RFC 4180 CSV line parser (handles quoted fields with embedded commas, e.g. "Last, First"). */
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

/** Parse a Savant leaderboard CSV into header-keyed row objects (numbers coerced). */
function parseCsv(csv: string): Record<string, any>[] {
  const lines = csv.replace(/^﻿/, '').split('\n')
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(h => h.trim()).filter(h => h !== '')
  const n = headers.length
  const rows: Record<string, any>[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseCSVLine(lines[i])
    if (vals.length < n) continue
    const row: Record<string, any> = {}
    headers.forEach((h, j) => {
      let v: any = vals[j]?.trim() ?? ''
      if (v === '' || v === 'null') v = null
      else if (!isNaN(Number(v))) v = Number(v)
      row[h] = v
    })
    if (row.id != null) rows.push(row)
  }
  return rows
}

const NUM = (v: any) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v))

/** Map one Savant CSV row → a bat_tracking_swing_miss DB row. */
function toDbRow(
  r: Record<string, any>,
  playerType: 'pitcher' | 'batter',
  season: number,
  snapshotDate: string,
) {
  return {
    snapshot_date: snapshotDate,
    player_type: playerType,
    player_id: Number(r.id),
    season,
    pitch_type: r.api_pitch_type ?? 'ALL', // split rows carry api_pitch_type; overall rows don't
    player_name: r.name ?? null,
    bat_side: r.bat_side_formatted ?? null,
    team_name: r.team_name ?? null,
    miss_distance: NUM(r.miss_distance),
    n_swings: NUM(r.n_swings),
    whiff_rate: NUM(r.whiff_rate),
    competitive_percent: NUM(r.competitive_percent),
    flawed_percent: NUM(r.flawed_percent),
    perfect_percent: NUM(r.perfect_percent),
    tied_up_percent: NUM(r.tied_up_percent),
    avg_x_tied_up: NUM(r.avg_x_tied_up),
    centered_percent: NUM(r.centered_percent),
    flailed_percent: NUM(r.flailed_percent),
    avg_x_flail: NUM(r.avg_x_flail),
    early_percent: NUM(r.early_percent),
    avg_y_early: NUM(r.avg_y_early),
    on_time_percent: NUM(r.on_time_percent),
    late_percent: NUM(r.late_percent),
    avg_y_late: NUM(r.avg_y_late),
    over_percent: NUM(r.over_percent),
    avg_z_over: NUM(r.avg_z_over),
    lined_up_percent: NUM(r.lined_up_percent),
    under_percent: NUM(r.under_percent),
    avg_z_under: NUM(r.avg_z_under),
  }
}

async function fetchLeaderboard(
  playerType: 'pitcher' | 'batter',
  season: number,
  split: boolean,
): Promise<Record<string, any>[]> {
  const p = new URLSearchParams()
  p.set('type', playerType)
  p.append('season[]', String(season))
  if (split) p.append('split[]', 'api_pitch_type_group03') // per-pitch-type rows
  p.set('csv', 'true')

  const resp = await fetch(`${LEADERBOARD_URL}?${p}`, { signal: AbortSignal.timeout(60_000) })
  if (!resp.ok) throw new Error(`Savant leaderboard fetch failed: ${resp.status} ${resp.statusText}`)
  return parseCsv(await resp.text())
}

export interface BatTrackingSyncResult {
  ok: boolean
  snapshot_date: string
  season: number
  inserted: number
  errors: number
  pulls: Record<string, number>
  error?: string
}

/**
 * Snapshot the swing-timing/miss-distance leaderboard for `season` as of `snapshotDate`.
 * Idempotent per day: re-running overwrites that day's rows (upsert on the PK).
 */
export async function syncBatTrackingSwingMiss(
  season: number,
  snapshotDate: string,
): Promise<BatTrackingSyncResult> {
  const combos: Array<{ type: 'pitcher' | 'batter'; split: boolean; key: string }> = [
    { type: 'pitcher', split: false, key: 'pitcher_overall' },
    { type: 'pitcher', split: true, key: 'pitcher_by_pitch' },
    { type: 'batter', split: false, key: 'batter_overall' },
    { type: 'batter', split: true, key: 'batter_by_pitch' },
  ]

  const pulls: Record<string, number> = {}
  const dbRows: any[] = []

  try {
    for (const c of combos) {
      const raw = await fetchLeaderboard(c.type, season, c.split)
      pulls[c.key] = raw.length
      for (const r of raw) dbRows.push(toDbRow(r, c.type, season, snapshotDate))
    }
  } catch (e: any) {
    return { ok: false, snapshot_date: snapshotDate, season, inserted: 0, errors: 0, pulls, error: e.message }
  }

  // De-dupe on the PK within this run (defensive — a player shouldn't repeat per key).
  const seen = new Set<string>()
  const deduped = dbRows.filter(r => {
    const k = `${r.player_type}|${r.player_id}|${r.pitch_type}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  let inserted = 0
  let errors = 0
  const batchSize = 500
  for (let i = 0; i < deduped.length; i += batchSize) {
    const batch = deduped.slice(i, i + batchSize)
    const { error } = await supabaseAdmin.from('bat_tracking_swing_miss').upsert(batch, {
      onConflict: 'snapshot_date,player_type,player_id,season,pitch_type',
      ignoreDuplicates: false,
    })
    if (error) errors += batch.length
    else inserted += batch.length
  }

  return { ok: errors === 0, snapshot_date: snapshotDate, season, inserted, errors, pulls }
}
