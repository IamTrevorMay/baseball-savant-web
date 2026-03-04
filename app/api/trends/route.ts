import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

interface MetricDef {
  key: string; label: string
  seasonSQL: string; recentSQL: string
  higherIsBetter: boolean // from pitcher perspective
}

const PITCHER_METRICS: MetricDef[] = [
  { key: 'velo', label: 'Avg Velo', seasonSQL: 'ROUND(AVG(release_speed)::numeric, 1)', recentSQL: "ROUND(AVG(release_speed) FILTER (WHERE game_date >= '{recent}')::numeric, 1)", higherIsBetter: true },
  { key: 'whiff', label: 'Whiff%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt') / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt'), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND (description LIKE '%swinging_strike%' OR description = 'missed_bunt')) / NULLIF(COUNT(*) FILTER (WHERE game_date >= '{recent}' AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt')), 0), 1)", higherIsBetter: true },
  { key: 'k_pct', label: 'K%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL AND game_date >= '{recent}' THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", higherIsBetter: true },
  { key: 'zone_pct', label: 'Zone%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9) / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND zone BETWEEN 1 AND 9) / NULLIF(COUNT(*) FILTER (WHERE game_date >= '{recent}' AND zone IS NOT NULL), 0), 1)", higherIsBetter: false },
  { key: 'xwoba', label: 'xwOBA', seasonSQL: 'ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3)', recentSQL: "ROUND(AVG(estimated_woba_using_speedangle) FILTER (WHERE game_date >= '{recent}')::numeric, 3)", higherIsBetter: false },
  { key: 'spin', label: 'Avg Spin', seasonSQL: 'ROUND(AVG(release_spin_rate)::numeric, 0)', recentSQL: "ROUND(AVG(release_spin_rate) FILTER (WHERE game_date >= '{recent}')::numeric, 0)", higherIsBetter: true },
]

const HITTER_METRICS: MetricDef[] = [
  { key: 'ev', label: 'Avg EV', seasonSQL: 'ROUND(AVG(launch_speed)::numeric, 1)', recentSQL: "ROUND(AVG(launch_speed) FILTER (WHERE game_date >= '{recent}')::numeric, 1)", higherIsBetter: true },
  { key: 'xwoba', label: 'xwOBA', seasonSQL: 'ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3)', recentSQL: "ROUND(AVG(estimated_woba_using_speedangle) FILTER (WHERE game_date >= '{recent}')::numeric, 3)", higherIsBetter: true },
  { key: 'k_pct', label: 'K%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL AND game_date >= '{recent}' THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", higherIsBetter: false },
  { key: 'bb_pct', label: 'BB%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND events = 'walk') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL AND game_date >= '{recent}' THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)", higherIsBetter: true },
  { key: 'hard_hit', label: 'Hard Hit%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95) / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND launch_speed >= 95) / NULLIF(COUNT(*) FILTER (WHERE game_date >= '{recent}' AND launch_speed IS NOT NULL), 0), 1)", higherIsBetter: true },
  { key: 'whiff', label: 'Whiff%', seasonSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt') / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt'), 0), 1)", recentSQL: "ROUND(100.0 * COUNT(*) FILTER (WHERE game_date >= '{recent}' AND (description LIKE '%swinging_strike%' OR description = 'missed_bunt')) / NULLIF(COUNT(*) FILTER (WHERE game_date >= '{recent}' AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt')), 0), 1)", higherIsBetter: false },
]

export async function POST(req: NextRequest) {
  try {
    const { season = 2025, playerType = 'pitcher', minPitches = 500 } = await req.json()
    const safeSeason = parseInt(season)
    if (isNaN(safeSeason)) return NextResponse.json({ error: 'Invalid season' }, { status: 400 })

    // Recent window = 14 days before latest game_date in data
    const dateRes = await q(`SELECT MAX(game_date) as latest FROM pitches WHERE game_year = ${safeSeason}`)
    if (dateRes.error) return NextResponse.json({ error: dateRes.error.message }, { status: 500 })
    const latestDate = dateRes.data?.[0]?.latest
    if (!latestDate) return NextResponse.json({ rows: [], message: 'No data for this season' })

    const recentDate = new Date(new Date(latestDate).getTime() - 14 * 86400000).toISOString().slice(0, 10)

    const isPitcher = playerType === 'pitcher'
    const groupCol = isPitcher ? 'pitcher' : 'batter'
    const metrics = isPitcher ? PITCHER_METRICS : HITTER_METRICS
    const mp = Math.max(parseInt(String(minPitches)) || 0, 100)

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
      WHERE game_year = ${safeSeason} AND pitch_type NOT IN ('PO', 'IN')
      GROUP BY p.${groupCol}, pl.name
      HAVING COUNT(*) >= ${mp}
        AND COUNT(*) FILTER (WHERE game_date >= '${recentDate}') >= 30
    `)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (!data || data.length === 0) return NextResponse.json({ rows: [] })

    // Compute stddev for each metric across all players
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

    // Build alert rows
    interface Alert {
      player_id: number; player_name: string
      metric: string; metric_label: string
      season_val: number; recent_val: number
      delta: number; sigma: number
      direction: 'up' | 'down'
      sentiment: 'good' | 'bad'
    }

    const alerts: Alert[] = []
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

    // Sort by |sigma| descending
    alerts.sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma))

    return NextResponse.json({ rows: alerts.slice(0, 200), recentDate, latestDate })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
