import type { SupabaseClient } from '@supabase/supabase-js'

interface MetricDef {
  key: string
  label: string
  seasonSQL: string
  recentSQL: string
  higherIsBetter: boolean
}

// Savant-matched fragments — keep in sync with lib/reportMetrics.ts and
// docs/VARIABLES.md. Each takes an optional extra condition (the recent-window
// date guard) so the season and recent variants use the SAME definition; the
// old hand-written recent copies had drifted (narrower swing set, no pitchout).
const RECENT = "game_date >= '{recent}' AND "
const WHIFF_SET = "(description LIKE '%swinging_strike%' OR description IN ('missed_bunt','swinging_pitchout','foul_tip','bunt_foul_tip'))"
const SWING_SET = "(description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description LIKE 'hit_into_play%' OR description = 'missed_bunt' OR description = 'swinging_pitchout')"
const NON_PA = "'truncated_pa','game_advisory','ejection','wild_pitch','passed_ball','other_advance','runner_double_play','caught_stealing_2b','caught_stealing_3b','caught_stealing_home','pickoff_1b','pickoff_2b','pickoff_3b','pickoff_caught_stealing_2b','pickoff_caught_stealing_3b','pickoff_caught_stealing_home','stolen_base_2b','stolen_base_3b','stolen_base_home'"
const AB_SET = "'single','double','triple','home_run','field_out','strikeout','strikeout_double_play','grounded_into_double_play','force_out','double_play','field_error','fielders_choice','fielders_choice_out','triple_play','other_out'"
const paCount = (c: string) => `COUNT(DISTINCT CASE WHEN ${c}events IS NOT NULL AND events NOT IN (${NON_PA}) THEN game_pk::bigint * 10000 + at_bat_number END)`
const whiffSQL = (c: string) => `ROUND(100.0 * COUNT(*) FILTER (WHERE ${c}${WHIFF_SET}) / NULLIF(COUNT(*) FILTER (WHERE ${c}${SWING_SET}), 0), 1)`
const kPctSQL = (c: string) => `ROUND(100.0 * COUNT(*) FILTER (WHERE ${c}events LIKE '%strikeout%') / NULLIF(${paCount(c)}, 0), 1)`
const bbPctSQL = (c: string) => `ROUND(100.0 * COUNT(*) FILTER (WHERE ${c}events IN ('walk','intent_walk')) / NULLIF(${paCount(c)}, 0), 1)`
const zonePctSQL = (c: string) => `ROUND(100.0 * COUNT(*) FILTER (WHERE ${c}zone BETWEEN 1 AND 9) / NULLIF(COUNT(*) FILTER (WHERE ${c}zone IS NOT NULL), 0), 1)`
// Savant xwOBA: per-BBE estimates + 0.7·uBB + 0.7·HBP over AB + uBB + SF + HBP.
const xwobaSQL = (c: string) => `ROUND((COALESCE(SUM(estimated_woba_using_speedangle) FILTER (WHERE ${c}description LIKE 'hit_into_play%'), 0) + 0.7 * COUNT(*) FILTER (WHERE ${c}events = 'walk') + 0.7 * COUNT(*) FILTER (WHERE ${c}events = 'hit_by_pitch'))::numeric / NULLIF(COUNT(*) FILTER (WHERE ${c}events IN (${AB_SET},'walk','hit_by_pitch','sac_fly','sac_fly_double_play')), 0), 3)`
const hardHitSQL = (c: string) => `ROUND(100.0 * COUNT(*) FILTER (WHERE ${c}launch_speed >= 95 AND bb_type IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE ${c}bb_type IS NOT NULL), 0), 1)`

export const PITCHER_METRICS: MetricDef[] = [
  { key: 'velo', label: 'Avg Velo', seasonSQL: 'ROUND(AVG(release_speed)::numeric, 1)', recentSQL: "ROUND(AVG(release_speed) FILTER (WHERE game_date >= '{recent}')::numeric, 1)", higherIsBetter: true },
  { key: 'whiff', label: 'Whiff%', seasonSQL: whiffSQL(''), recentSQL: whiffSQL(RECENT), higherIsBetter: true },
  { key: 'k_pct', label: 'K%', seasonSQL: kPctSQL(''), recentSQL: kPctSQL(RECENT), higherIsBetter: true },
  { key: 'zone_pct', label: 'Zone%', seasonSQL: zonePctSQL(''), recentSQL: zonePctSQL(RECENT), higherIsBetter: false },
  { key: 'xwoba', label: 'xwOBA', seasonSQL: xwobaSQL(''), recentSQL: xwobaSQL(RECENT), higherIsBetter: false },
  { key: 'spin', label: 'Avg Spin', seasonSQL: 'ROUND(AVG(release_spin_rate)::numeric, 0)', recentSQL: "ROUND(AVG(release_spin_rate) FILTER (WHERE game_date >= '{recent}')::numeric, 0)", higherIsBetter: true },
]

export const HITTER_METRICS: MetricDef[] = [
  { key: 'ev', label: 'Avg EV', seasonSQL: 'ROUND(AVG(launch_speed) FILTER (WHERE bb_type IS NOT NULL)::numeric, 1)', recentSQL: "ROUND(AVG(launch_speed) FILTER (WHERE bb_type IS NOT NULL AND game_date >= '{recent}')::numeric, 1)", higherIsBetter: true },
  { key: 'xwoba', label: 'xwOBA', seasonSQL: xwobaSQL(''), recentSQL: xwobaSQL(RECENT), higherIsBetter: true },
  { key: 'k_pct', label: 'K%', seasonSQL: kPctSQL(''), recentSQL: kPctSQL(RECENT), higherIsBetter: false },
  { key: 'bb_pct', label: 'BB%', seasonSQL: bbPctSQL(''), recentSQL: bbPctSQL(RECENT), higherIsBetter: true },
  { key: 'hard_hit', label: 'Hard Hit%', seasonSQL: hardHitSQL(''), recentSQL: hardHitSQL(RECENT), higherIsBetter: true },
  { key: 'whiff', label: 'Whiff%', seasonSQL: whiffSQL(''), recentSQL: whiffSQL(RECENT), higherIsBetter: false },
]

export interface TrendAlertRow {
  player_id: number
  player_name: string
  metric: string
  metric_label: string
  season_val: number
  recent_val: number
  delta: number
  sigma: number
  direction: 'up' | 'down'
  sentiment: 'good' | 'bad'
}

export interface TrendAlertsResult {
  rows: TrendAlertRow[]
  recentDate?: string
  latestDate?: string
  message?: string
}

export interface ComputeTrendAlertsArgs {
  supabase: SupabaseClient
  season: number
  playerType: 'pitcher' | 'hitter'
  minPitches?: number
}

/**
 * Compute season-vs-recent trend alerts (surges/concerns) for a given season + player type.
 * This is the same logic that powers /api/trends on the default (overview) tab —
 * extracted so callers like the nightly brief cron can invoke it directly without
 * an HTTP self-fetch (which was failing silently and leaving surges/concerns empty).
 */
export async function computeTrendAlerts({
  supabase,
  season,
  playerType,
  minPitches = 100,
}: ComputeTrendAlertsArgs): Promise<TrendAlertsResult> {
  // These are season-wide aggregates over `pitches` — 11s+ on the overview tab,
  // well past the 8s statement_timeout that plain `run_query` carries. Callers
  // must pass a client whose HTTP timeout outlasts that: supabaseAdminLong
  // (120s), not the 30s default.
  const q = (sql: string) => supabase.rpc('run_query_long', { query_text: sql.trim() })

  const regSeasonCheck = await q(`SELECT 1 FROM pitches WHERE game_year = ${season} AND game_type = 'R' LIMIT 1`)
  const hasRegularSeason = (regSeasonCheck.data || []).length > 0
  const gameTypeFilter = hasRegularSeason ? "AND game_type = 'R'" : ''

  const dateRes = await q(`SELECT MIN(game_date) as earliest, MAX(game_date) as latest FROM pitches WHERE game_year = ${season} ${gameTypeFilter}`)
  if (dateRes.error) throw new Error(dateRes.error.message)
  const latestDate = dateRes.data?.[0]?.latest
  const earliestDate = dateRes.data?.[0]?.earliest
  if (!latestDate) return { rows: [], message: 'No data for this season' }

  const seasonSpanDays = Math.round((new Date(latestDate).getTime() - new Date(earliestDate).getTime()) / 86400000)
  const recentWindowDays = seasonSpanDays < 21 ? Math.max(3, Math.floor(seasonSpanDays / 2)) : 14
  const recentDate = new Date(new Date(latestDate).getTime() - recentWindowDays * 86400000).toISOString().slice(0, 10)

  const isPitcher = playerType === 'pitcher'
  const groupCol = isPitcher ? 'pitcher' : 'batter'
  const metrics = isPitcher ? PITCHER_METRICS : HITTER_METRICS
  const mp = Math.max(minPitches || 0, 100)

  const seasonCols = metrics.map(m => `${m.seasonSQL} as season_${m.key}`).join(',\n  ')
  const recentCols = metrics.map(m => `${m.recentSQL.replace(/\{recent\}/g, recentDate)} as recent_${m.key}`).join(',\n  ')

  const { data, error } = await q(`
    SELECT p.${groupCol} as player_id, pl.name as player_name,
      COUNT(*) as total_pitches,
      COUNT(*) FILTER (WHERE game_date >= '${recentDate}') as recent_pitches,
      ${seasonCols},
      ${recentCols}
    FROM pitches p
    JOIN players pl ON pl.id = p.${groupCol}
    WHERE game_year = ${season} AND COALESCE(pitch_type, '') NOT IN ('PO','IN') ${gameTypeFilter}
    GROUP BY p.${groupCol}, pl.name
    HAVING COUNT(*) >= ${mp}
      AND COUNT(*) FILTER (WHERE game_date >= '${recentDate}') >= 30
  `)
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return { rows: [], recentDate, latestDate }

  const stddevs: Record<string, number> = {}
  for (const m of metrics) {
    const vals = data
      .map((r: any) => r[`season_${m.key}`])
      .filter((v: any) => v != null) as number[]
    if (vals.length < 3) { stddevs[m.key] = 1; continue }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
    stddevs[m.key] = Math.sqrt(variance) || 1
  }

  const alerts: TrendAlertRow[] = []
  for (const row of data as any[]) {
    for (const m of metrics) {
      const sv = row[`season_${m.key}`]
      const rv = row[`recent_${m.key}`]
      if (sv == null || rv == null) continue
      const delta = rv - sv
      const sigma = delta / stddevs[m.key]
      if (Math.abs(sigma) < 1.5) continue

      const direction = delta > 0 ? 'up' : 'down'
      const isGood = (delta > 0) === m.higherIsBetter
      alerts.push({
        player_id: row.player_id,
        player_name: row.player_name,
        metric: m.key,
        metric_label: m.label,
        season_val: sv,
        recent_val: rv,
        delta: Math.round(delta * 100) / 100,
        sigma: Math.round(sigma * 100) / 100,
        direction,
        sentiment: isGood ? 'good' : 'bad',
      })
    }
  }

  alerts.sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma))

  return { rows: alerts.slice(0, 200), recentDate, latestDate }
}
