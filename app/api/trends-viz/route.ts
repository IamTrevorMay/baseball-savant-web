import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'
import { METRICS } from '@/lib/reportMetrics'
import { computeFIP, computeXERA } from '@/lib/sql'
import { SEASON_CONSTANTS, LATEST_SEASON_YEAR } from '@/lib/constants-data'
import {
  TREND_METRICS, TEAM_BY_ABBREV, TEAM_GAME_MAX_SEASONS, TEAM_GAME_MAX_DAYS,
  type TrendsRequest,
} from '@/lib/trendsViz'

/**
 * POST /api/trends-viz
 *
 * Time-bucketed metric series for the Trends Visualizer. Body is a
 * TrendsRequest (lib/trendsViz.ts). Regular-season only.
 *
 * Pitcher entity: live SQL over pitches (pitcher index makes any scope
 * cheap). Team entity (pitching perspective): month buckets come from
 * mv_team_monthly_pitching_stats / mv_team_monthly_pitch_mix; game buckets
 * and custom date ranges run live with the derived-team CASE, bounded to
 * ≤2 seasons / ≤740 days because that predicate can't use an index.
 *
 * No 'era' output: real monthly team ERA isn't obtainable (see the header
 * comment in lib/trendsViz.ts). FIP/xERA are computed from Statcast
 * components per month bucket and labeled as themselves.
 */
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_METRICS = 6
const MIN_SEASON = 2015

const q = (sql: string) => supabase.rpc('run_query_long', { query_text: sql.trim() })

const TEAM_EXPR = "CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END"

// Columns available on the monthly MVs (metric keys that map 1:1).
const MV_METRIC_COLS = new Set([
  'avg_velo', 'max_velo', 'avg_spin', 'avg_ext', 'avg_hbreak_in', 'avg_ivb_in', 'avg_stuff_plus',
  'whiff_pct', 'csw_pct', 'swstr_pct', 'chase_pct', 'zone_pct', 'fps_pct', 'k_pct', 'bb_pct',
  'avg_ev', 'hard_hit_pct', 'barrel_pct', 'gb_pct', 'avg_la', 'avg_xwoba',
])

// METRICS.usage_pct partitions by player_name (share of a report's pool);
// here usage is share of the time bucket, so the window partitions by the
// grouping expression instead.
function metricSql(key: string, usagePartition: string): string | null {
  if (key === 'usage_pct')
    return `ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY ${usagePartition}), 0), 1)`
  if (key === 'avg_stuff_plus') return 'ROUND(AVG(stuff_plus)::numeric, 0)'
  return METRICS[key] ?? null
}

const ERA_COMPONENT_KEYS = new Set(['fip', 'xera'])

const constantsFor = (year: number) => SEASON_CONSTANTS[year] || SEASON_CONSTANTS[LATEST_SEASON_YEAR]

/** Attach fip/xera computed from MV component columns; strip the components. */
function attachFipXera(rows: Record<string, any>[], wanted: string[]) {
  for (const r of rows) {
    const year = Number(String(r.x).slice(0, 4))
    const comps = {
      k: r.strikeouts, bb: r.walks, hbp: r.hbp, hr: r.home_runs,
      ip: r.ip, pa: r.pa, xwoba: r.xwoba_raw,
    }
    if (wanted.includes('fip')) r.fip = computeFIP(comps, constantsFor(year))
    if (wanted.includes('xera')) r.xera = computeXERA(comps, constantsFor(year))
    delete r.strikeouts; delete r.walks; delete r.hbp; delete r.home_runs; delete r.xwoba_raw
    if (!wanted.includes('ip')) delete r.ip
    delete r.pa
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TrendsRequest

    const entityType = body.entityType === 'team' ? 'team' : 'pitcher'
    const mode = body.mode === 'metric' ? 'metric' : 'pitch'
    const xUnit = body.xUnit === 'appearance' ? 'appearance' : 'month'
    const scope = body.scope

    // ── Validate entity ─────────────────────────────────────────────────
    let playerId = 0
    let teamEntry: { abbrev: string; id: number } | null = null
    if (entityType === 'pitcher') {
      playerId = Number(body.playerId)
      if (!Number.isInteger(playerId) || playerId <= 0)
        return NextResponse.json({ error: 'Invalid playerId' }, { status: 400 })
    } else {
      teamEntry = TEAM_BY_ABBREV.get(String(body.team || '')) ?? null
      if (!teamEntry) return NextResponse.json({ error: 'Invalid team' }, { status: 400 })
    }

    // ── Validate metrics ────────────────────────────────────────────────
    const metrics = [...new Set(body.metrics || [])]
      .filter(k => {
        const d = TREND_METRICS[k]
        if (!d) return false
        if (mode === 'metric' && d.pitchModeOnly) return false
        if (entityType === 'pitcher' && d.teamOnly) return false
        if (entityType === 'team' && d.pitcherOnly) return false
        return true
      })
      .slice(0, mode === 'pitch' ? 1 : MAX_METRICS)
    if (!metrics.length)
      return NextResponse.json({ error: 'No valid metrics requested' }, { status: 400 })

    // ── Validate scope ──────────────────────────────────────────────────
    let seasons: number[] = []
    if (scope === 'seasons') {
      seasons = [...new Set(body.seasons || [])]
        .map(Number).filter(y => Number.isInteger(y) && y >= MIN_SEASON && y <= 2100)
        .sort()
      if (!seasons.length)
        return NextResponse.json({ error: 'No valid seasons' }, { status: 400 })
    } else if (scope === 'custom') {
      if (!DATE_RE.test(body.startDate || '') || !DATE_RE.test(body.endDate || ''))
        return NextResponse.json({ error: 'Custom range needs startDate and endDate (YYYY-MM-DD)' }, { status: 400 })
    }

    // ── Team bounds: game buckets & custom ranges run live (no index) ───
    const spanDays = scope === 'custom'
      ? (new Date(body.endDate!).getTime() - new Date(body.startDate!).getTime()) / 86400000
      : null
    if (entityType === 'team' && xUnit === 'appearance') {
      if (scope === 'career')
        return NextResponse.json({ error: 'Per-game team trends need a Seasons or Custom range (Career is month-buckets only)' }, { status: 400 })
      if (scope === 'seasons' && seasons.length > TEAM_GAME_MAX_SEASONS)
        return NextResponse.json({ error: `Per-game team trends are limited to ${TEAM_GAME_MAX_SEASONS} seasons` }, { status: 400 })
      if (scope === 'custom' && spanDays! > TEAM_GAME_MAX_DAYS)
        return NextResponse.json({ error: `Per-game team trends are limited to ${TEAM_GAME_MAX_DAYS} days` }, { status: 400 })
    }
    if (entityType === 'team' && scope === 'custom' && spanDays! > TEAM_GAME_MAX_DAYS)
      return NextResponse.json({ error: `Custom team ranges are limited to ${TEAM_GAME_MAX_DAYS} days — use Seasons or Career for longer spans` }, { status: 400 })

    // fip/xera live on the MV component columns only
    if (metrics.some(m => ERA_COMPONENT_KEYS.has(m)) && (xUnit !== 'month' || scope === 'custom'))
      return NextResponse.json({ error: 'FIP/xERA need month buckets on Career or Seasons scopes' }, { status: 400 })

    // ── Team + month + career/seasons → MV fast path ────────────────────
    if (entityType === 'team' && xUnit === 'month' && scope !== 'custom') {
      const where = [`team = '${teamEntry!.abbrev}'`]
      if (scope === 'seasons') where.push(`game_year IN (${seasons.join(',')})`)

      let rows: Record<string, any>[]
      if (mode === 'pitch') {
        const metric = metrics[0]
        const col = metric === 'usage_pct' ? 'usage_pct' : MV_METRIC_COLS.has(metric) ? metric : null
        if (!col) return NextResponse.json({ error: `${metric} is not available for team pitch mode` }, { status: 400 })
        const { data, error } = await q(`
          SELECT month AS x, pitch_name, n, ${col}
          FROM mv_team_monthly_pitch_mix
          WHERE ${where.join(' AND ')}
          ORDER BY month, pitch_name
        `)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        rows = (data || []) as Record<string, any>[]
      } else {
        const plainCols = metrics.filter(m => MV_METRIC_COLS.has(m))
        const needsComponents = metrics.some(m => ERA_COMPONENT_KEYS.has(m))
        const cols = [
          'month AS x', 'pitches AS n',
          ...plainCols,
          ...(needsComponents ? ['strikeouts', 'walks', 'hbp', 'home_runs', 'ip', 'pa', 'xwoba_raw'] : []),
        ]
        const { data, error } = await q(`
          SELECT ${cols.join(', ')}
          FROM mv_team_monthly_pitching_stats
          WHERE ${where.join(' AND ')}
          ORDER BY month
        `)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        rows = (data || []) as Record<string, any>[]
        if (needsComponents) attachFipXera(rows, metrics)
      }
      return NextResponse.json({ rows, count: rows.length })
    }

    // ── Live SQL over pitches (pitcher any scope; team game/custom) ─────
    const where = [`game_type = 'R'`]
    if (entityType === 'pitcher') {
      where.push(`pitcher = ${playerId}`)
    } else {
      where.push(`(${TEAM_EXPR}) = '${teamEntry!.abbrev}'`)
      // game_date bounds let the planner use the game_date index — the
      // derived-team CASE can't be indexed.
      if (scope === 'seasons')
        where.push(`game_date >= '${seasons[0]}-01-01'`, `game_date <= '${seasons[seasons.length - 1]}-12-31'`)
    }
    if (scope === 'seasons') where.push(`game_year IN (${seasons.join(',')})`)
    else if (scope === 'custom') where.push(`game_date >= '${body.startDate}'`, `game_date <= '${body.endDate}'`)
    if (mode === 'pitch') where.push(`pitch_name IS NOT NULL`)
    where.push(`pitch_type NOT IN ('PO','IN')`)

    // fip/xera per game bucket are too noisy to be honest — refuse rather
    // than plot; the UI disables them for game buckets.
    const liveMetrics = metrics.filter(m => !ERA_COMPONENT_KEYS.has(m))
    if (!liveMetrics.length)
      return NextResponse.json({ error: 'FIP/xERA need month buckets' }, { status: 400 })

    const bucketCols = xUnit === 'month'
      ? [`to_char(game_date, 'YYYY-MM') AS x`]
      : [`game_date::text AS x`, `game_pk`]
    const usagePartition = xUnit === 'month' ? `to_char(game_date, 'YYYY-MM')` : `game_pk`

    const selects = [
      ...bucketCols,
      ...(mode === 'pitch' ? ['pitch_name'] : []),
      'COUNT(*) AS n',
      ...liveMetrics.map(k => `${metricSql(k, usagePartition)} AS ${k}`),
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

    const { data, error } = await q(sql)
    if (error) return NextResponse.json({ error: error.message, sql }, { status: 500 })

    return NextResponse.json({ rows: data ?? [], count: data?.length || 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
