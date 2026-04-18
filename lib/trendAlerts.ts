import type { SupabaseClient } from '@supabase/supabase-js'

interface MetricDef {
  key: string
  label: string
  seasonSQL: string
  recentSQL: string
  higherIsBetter: boolean
}

export const PITCHER_METRICS: MetricDef[] = [
  { key: 'velo', label: 'Avg Velo', seasonSQL: 'ROUND(AVG(release_speed)::numeric, 1)', recentSQL: "ROUND(AVG(release_speed) FILTER (WHERE game_date >= '{recent}')::numeric, 1)", higherIsBetter: true },
  { key: 'whiff', label: 'Whiff%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt') / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt'), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND (description LIKE '%swinging_strike%' OR description = 'missed_bunt')) / NULLIF(COUNT(*) FILTER (WHERE game_date >= '{recent}' AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt')), 0), 1)", higherIsBetter: true },
  { key: 'k_pct', label: 'K%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL AND game_date >= '{recent}' THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", higherIsBetter: true },
  { key: 'zone_pct', label: 'Zone%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9) / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND zone BETWEEN 1 AND 9) / NULLIF(COUNT(*) FILTER (WHERE game_date >= '{recent}' AND zone IS NOT NULL), 0), 1)", higherIsBetter: false },
  { key: 'xwoba', label: 'xwOBA', seasonSQL: 'ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3)', recentSQL: "ROUND(AVG(estimated_woba_using_speedangle) FILTER (WHERE game_date >= '{recent}')::numeric, 3)", higherIsBetter: false },
  { key: 'spin', label: 'Avg Spin', seasonSQL: 'ROUND(AVG(release_spin_rate)::numeric, 0)', recentSQL: "ROUND(AVG(release_spin_rate) FILTER (WHERE game_date >= '{recent}')::numeric, 0)", higherIsBetter: true },
]

export const HITTER_METRICS: MetricDef[] = [
  { key: 'ev', label: 'Avg EV', seasonSQL: 'ROUND(AVG(launch_speed)::numeric, 1)', recentSQL: "ROUND(AVG(launch_speed) FILTER (WHERE game_date >= '{recent}')::numeric, 1)", higherIsBetter: true },
  { key: 'xwoba', label: 'xwOBA', seasonSQL: 'ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3)', recentSQL: "ROUND(AVG(estimated_woba_using_speedangle) FILTER (WHERE game_date >= '{recent}')::numeric, 3)", higherIsBetter: true },
  { key: 'k_pct', label: 'K%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL AND game_date >= '{recent}' THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", higherIsBetter: false },
  { key: 'bb_pct', label: 'BB%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND events = 'walk') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL AND game_date >= '{recent}' THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", higherIsBetter: true },
  { key: 'hard_hit', label: 'Hard Hit%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95) / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND launch_speed >= 95) / NULLIF(COUNT(*) FILTER (WHERE game_date >= '{recent}' AND launch_speed IS NOT NULL), 0), 1)", higherIsBetter: true },
  { key: 'whiff', label: 'Whiff%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt') / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt'), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND (description LIKE '%swinging_strike%' OR description = 'missed_bunt')) / NULLIF(COUNT(*) FILTER (WHERE game_date >= '{recent}' AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt')), 0), 1)", higherIsBetter: false },
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
  const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

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
    WHERE game_year = ${season} AND pitch_type NOT IN ('PO', 'IN') ${gameTypeFilter}
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
