import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'
import { METRICS } from '@/lib/reportMetrics'
import { TREND_METRICS, type TrendsRequest } from '@/lib/trendsViz'

/**
 * POST /api/trends-viz
 *
 * Time-bucketed metric series for the Trends Visualizer. Body is a
 * TrendsRequest (lib/trendsViz.ts):
 *
 *   { playerId, scope: 'career'|'seasons'|'custom', seasons?, startDate?,
 *     endDate?, xUnit: 'month'|'appearance', mode: 'pitch'|'metric',
 *     metrics: string[] }
 *
 * Regular-season pitches only. Pitch mode groups by (bucket, pitch_name)
 * and excludes pitchouts/intentional balls; metric mode groups by bucket
 * alone. A career × appearance × pitch query is the worst case at a few
 * thousand rows — well inside run_query_long's window.
 */
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_METRICS = 6

// METRICS.usage_pct partitions by player_name (share of a report's pool);
// here usage is share of the time bucket, so the window partitions by the
// grouping expression instead.
function metricSql(key: string, usagePartition: string): string | null {
  if (key === 'usage_pct')
    return `ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY ${usagePartition}), 0), 1)`
  if (key === 'avg_stuff_plus') return 'ROUND(AVG(stuff_plus)::numeric, 0)'
  return METRICS[key] ?? null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TrendsRequest

    const playerId = Number(body.playerId)
    if (!Number.isInteger(playerId) || playerId <= 0)
      return NextResponse.json({ error: 'Invalid playerId' }, { status: 400 })

    const mode = body.mode === 'metric' ? 'metric' : 'pitch'
    const xUnit = body.xUnit === 'appearance' ? 'appearance' : 'month'

    const metrics = [...new Set(body.metrics || [])]
      .filter(k => TREND_METRICS[k] && (mode === 'pitch' || !TREND_METRICS[k].pitchModeOnly))
      .slice(0, mode === 'pitch' ? 1 : MAX_METRICS)
    if (!metrics.length)
      return NextResponse.json({ error: 'No valid metrics requested' }, { status: 400 })

    const where = [`pitcher = ${playerId}`, `game_type = 'R'`]
    if (body.scope === 'seasons') {
      const seasons = [...new Set(body.seasons || [])]
        .map(Number).filter(y => Number.isInteger(y) && y >= 2015 && y <= 2100)
      if (!seasons.length)
        return NextResponse.json({ error: 'No valid seasons' }, { status: 400 })
      where.push(`game_year IN (${seasons.join(',')})`)
    } else if (body.scope === 'custom') {
      if (!DATE_RE.test(body.startDate || '') || !DATE_RE.test(body.endDate || ''))
        return NextResponse.json({ error: 'Custom range needs startDate and endDate (YYYY-MM-DD)' }, { status: 400 })
      where.push(`game_date >= '${body.startDate}'`, `game_date <= '${body.endDate}'`)
    }
    if (mode === 'pitch')
      where.push(`pitch_name IS NOT NULL`, `pitch_type NOT IN ('PO','IN')`)

    const bucketCols = xUnit === 'month'
      ? [`to_char(game_date, 'YYYY-MM') AS x`]
      : [`game_date::text AS x`, `game_pk`]
    const usagePartition = xUnit === 'month' ? `to_char(game_date, 'YYYY-MM')` : `game_pk`

    const selects = [
      ...bucketCols,
      ...(mode === 'pitch' ? ['pitch_name'] : []),
      'COUNT(*) AS n',
      ...metrics.map(k => `${metricSql(k, usagePartition)} AS ${k}`),
    ]
    const groupCount = bucketCols.length + (mode === 'pitch' ? 1 : 0)
    const groupBy = Array.from({ length: groupCount }, (_, i) => i + 1).join(', ')

    const sql = `
      SELECT ${selects.join(', ')}
      FROM pitches
      WHERE ${where.join(' AND ')}
      GROUP BY ${groupBy}
      ORDER BY ${groupBy}
    `.trim()

    const { data, error } = await supabase.rpc('run_query_long', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message, sql }, { status: 500 })

    return NextResponse.json({ rows: data ?? [], count: data?.length || 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
