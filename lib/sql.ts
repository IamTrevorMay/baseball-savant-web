/**
 * Shared SQL fragments, computation helpers, and backfill utilities for scene-stats
 * and related routes.
 */
import { METRICS } from '@/lib/reportMetrics'

export const TRITON_COLUMNS = [
  'cmd_plus', 'rpcom_plus', 'brink_plus', 'cluster_plus',
  'cluster_r_plus', 'cluster_l_plus',
  'hdev_plus', 'vdev_plus', 'missfire_plus', 'close_pct_plus',
  'avg_brink', 'avg_cluster', 'avg_cluster_r', 'avg_cluster_l',
  'avg_hdev', 'avg_vdev',
  'avg_missfire', 'close_pct', 'waste_pct',
] as const

export const TRITON_COL: Record<string, string> =
  Object.fromEntries(TRITON_COLUMNS.map(k => [k, k]))

export const IP_ESTIMATE_SQL = `(COUNT(DISTINCT CASE WHEN events IS NOT NULL AND events NOT IN ('single','double','triple','home_run','walk','hit_by_pitch','catcher_interf','field_error') THEN game_pk::bigint * 10000 + at_bat_number END) + COUNT(DISTINCT CASE WHEN events LIKE '%double_play%' THEN game_pk::bigint * 10000 + at_bat_number END) + 2 * COUNT(DISTINCT CASE WHEN events = 'triple_play' THEN game_pk::bigint * 10000 + at_bat_number END))::numeric / 3.0`

export const ERA_COMPONENTS_SQL = `COUNT(*) FILTER (WHERE events LIKE '%strikeout%') as k,
  COUNT(*) FILTER (WHERE events = 'walk') as bb,
  COUNT(*) FILTER (WHERE events = 'hit_by_pitch') as hbp,
  COUNT(*) FILTER (WHERE events = 'home_run') as hr,
  ${IP_ESTIMATE_SQL} as ip,
  COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
  AVG(estimated_woba_using_speedangle) as xwoba`

export function computeFIP(
  stats: { k: any; bb: any; hbp: any; hr: any; ip: any },
  constants: { cfip: number }
): number | null {
  const ip = Number(stats.ip) || 0
  if (ip <= 0) return null
  return Math.round(((13 * (Number(stats.hr) || 0) + 3 * ((Number(stats.bb) || 0) + (Number(stats.hbp) || 0)) - 2 * (Number(stats.k) || 0)) / ip + constants.cfip) * 100) / 100
}

export function computeXERA(
  stats: { ip: any; pa: any; xwoba: any },
  constants: { woba: number; woba_scale: number; lg_era: number }
): number | null {
  const ip = Number(stats.ip) || 0
  const pa = Number(stats.pa) || 0
  const xwoba = stats.xwoba != null ? Number(stats.xwoba) : null
  if (ip <= 0 || pa <= 0 || xwoba == null) return null
  return Math.round((((xwoba - constants.woba) / constants.woba_scale) * (pa / ip) * 9 + constants.lg_era) * 100) / 100
}

/**
 * Compute wRC+ from wOBA, season constants, and park factor.
 * Formula: (((wOBA - lgwOBA) / wOBA_scale + r_pa) / (parkFactor/100 * r_pa)) * 100
 */
export function computeWRCPlus(
  woba: number,
  constants: { woba: number; woba_scale: number; r_pa: number },
  parkFactor: number, // e.g. 100 = neutral
): number | null {
  const denom = (parkFactor / 100) * constants.r_pa
  if (denom === 0) return null
  return Math.round((((woba - constants.woba) / constants.woba_scale + constants.r_pa) / denom) * 100)
}

/** Pivot pitcher_season_command rows into one entry per pitcher with usage-weighted averages. */
export function pivotTritonRows(
  rows: Record<string, any>[]
): Map<number, Record<string, any>> {
  const map = new Map<number, Record<string, any>>()
  for (const row of rows) {
    const id = row.pitcher
    if (!map.has(id)) {
      const init: Record<string, any> = { player_name: row.player_name, pitches: 0 }
      for (const k of TRITON_COLUMNS) { init[`_${k}_s`] = 0; init[`_${k}_w`] = 0 }
      map.set(id, init)
    }
    const p = map.get(id)!
    const n = Number(row.pitches) || 0
    p.pitches += n
    for (const k of TRITON_COLUMNS) {
      if (row[k] != null) { p[`_${k}_s`] += Number(row[k]) * n; p[`_${k}_w`] += n }
    }
  }
  for (const p of map.values()) {
    for (const k of TRITON_COLUMNS) {
      const precision = k.startsWith('avg_') || k === 'waste_pct' ? 100 : 10
      p[k] = p[`_${k}_w`] > 0 ? Math.round((p[`_${k}_s`] / p[`_${k}_w`]) * precision) / precision : null
      delete p[`_${k}_s`]; delete p[`_${k}_w`]
    }
  }
  return map
}

/** Merge lookup data into result rows by player_id for the given metric aliases. */
export function backfillFromLookup(
  result: Record<string, any>[],
  lookupData: Record<string, any>[],
  metrics: { key: string; alias: string }[]
): void {
  const lookup = new Map(lookupData.map(r => [r.player_id, r]))
  for (const r of result) {
    const extra = lookup.get(r.player_id)
    if (extra) {
      for (const m of metrics) r[m.alias] = extra[m.alias] ?? null
    }
  }
}

// ── Leaderboard backfill helpers ─────────────────────────────────────────────
// Each runs a single query and merges results into `result` rows.
// Designed to be called inside Promise.all for parallelism.

/** Backfill pitches-table metrics (whiff%, avg_velo, etc.) into result rows. */
export async function backfillPitchesMetrics(
  q: (sql: string) => PromiseLike<{ data: any; error: any }>,
  result: Record<string, any>[],
  metrics: { key: string; alias: string }[],
  groupCol: string,
  extraWhere: string[]
): Promise<void> {
  if (metrics.length === 0 || result.length === 0) return
  try {
    const ids = result.map(r => r.player_id)
    const where = [`p.${groupCol} IN (${ids.join(',')})`, "pitch_type NOT IN ('PO', 'IN')", ...extraWhere]
    const selects = metrics.map(m => `${METRICS[m.key]} as ${m.alias}`)
    const sql = `SELECT p.${groupCol} as player_id, ${selects.join(', ')} FROM pitches p WHERE ${where.join(' AND ')} GROUP BY p.${groupCol}`
    const { data } = await q(sql)
    if (data) backfillFromLookup(result, data as any[], metrics)
  } catch (e) { console.error('Pitches backfill failed:', e) }
}

/** Backfill Triton command metrics from pitcher_season_command into result rows. */
export async function backfillTritonMetrics(
  q: (sql: string) => PromiseLike<{ data: any; error: any }>,
  result: Record<string, any>[],
  metrics: { key: string; alias: string }[],
  year: number
): Promise<void> {
  if (metrics.length === 0 || result.length === 0) return
  try {
    const ids = result.map(r => r.player_id)
    const sql = `SELECT pitcher, pitches, ${TRITON_COLUMNS.join(', ')} FROM pitcher_season_command WHERE game_year = ${year} AND pitcher IN (${ids.join(',')})`
    const { data } = await q(sql)
    if (data) {
      const tMap = pivotTritonRows(data as any[])
      for (const r of result) {
        const t = tMap.get(r.player_id); if (!t) continue
        for (const m of metrics) {
          if (TRITON_COL[m.key]) r[m.alias] = t[TRITON_COL[m.key]] ?? null
        }
      }
    }
  } catch (e) { console.error('Triton backfill failed:', e) }
}

/** Backfill FIP/xERA metrics computed from pitches ERA components into result rows. */
export async function backfillEraMetrics(
  q: (sql: string) => PromiseLike<{ data: any; error: any }>,
  result: Record<string, any>[],
  metrics: { key: string; alias: string }[],
  constants: { cfip: number; woba: number; woba_scale: number; lg_era: number },
  extraWhere: string[]
): Promise<void> {
  if (metrics.length === 0 || result.length === 0) return
  try {
    const ids = result.map(r => r.player_id)
    const where = [`p.pitcher IN (${ids.join(',')})`, "pitch_type NOT IN ('PO','IN')", ...extraWhere]
    const sql = `SELECT p.pitcher as player_id, ${ERA_COMPONENTS_SQL} FROM pitches p WHERE ${where.join(' AND ')} GROUP BY p.pitcher`
    const { data } = await q(sql)
    if (data) {
      const lookup = new Map((data as any[]).map((r: any) => [r.player_id, r]))
      for (const r of result) {
        const s = lookup.get(r.player_id); if (!s) continue
        const fipVal = computeFIP(s, constants)
        const xeraVal = computeXERA(s, constants)
        const ERA_VALS: Record<string, any> = { era: fipVal, fip: fipVal, xera: xeraVal }
        for (const m of metrics) r[m.alias] = ERA_VALS[m.key] ?? null
      }
    }
  } catch (e) { console.error('ERA backfill failed:', e) }
}
