/**
 * Shared SQL fragments and pure computation helpers for scene-stats and related routes.
 * No Supabase dependency — just string constants and arithmetic.
 */

export const TRITON_COLUMNS = [
  'cmd_plus', 'rpcom_plus', 'brink_plus', 'cluster_plus',
  'hdev_plus', 'vdev_plus', 'missfire_plus',
  'avg_brink', 'avg_cluster', 'avg_hdev', 'avg_vdev',
  'avg_missfire', 'waste_pct',
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
