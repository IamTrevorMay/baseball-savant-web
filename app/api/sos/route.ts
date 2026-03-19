import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'

const REGRESSION_K = 60 // PA regression constant — blends toward league avg

const DATE_FILTER = (start: string, end: string, gameType: string, prefix = '') => {
  const p = prefix ? `${prefix}.` : ''
  return `${p}game_date BETWEEN '${start}' AND '${end}' AND ${p}events IS NOT NULL AND ${p}game_type = '${gameType}' AND ${p}pitch_type NOT IN ('PO','IN')`
}

/**
 * Strength of Schedule (SOS)
 *
 * Measures quality of opposition faced by a hitter or pitcher.
 * Uses leave-one-out xwOBA with regression toward league average.
 * Scale: 100 = league avg, 110 = 1 SD tougher.
 *
 * Optimized via subtraction: LOO = (total - matchup) / (total_n - matchup_n)
 * Avoids expensive anti-join scans.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const role = req.nextUrl.searchParams.get('role')
  const startDate = req.nextUrl.searchParams.get('start')
  const endDate = req.nextUrl.searchParams.get('end')
  const gameType = req.nextUrl.searchParams.get('game_type') || 'R'

  if (!id || !role || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing required params: id, role, start, end' }, { status: 400 })
  }
  if (role !== 'hitter' && role !== 'pitcher') {
    return NextResponse.json({ error: 'role must be hitter or pitcher' }, { status: 400 })
  }

  const safeId = parseInt(id)
  if (isNaN(safeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const safeStart = startDate.replace(/[^0-9-]/g, '')
  const safeEnd = endDate.replace(/[^0-9-]/g, '')
  const safeGameType = gameType.replace(/[^A-Z]/g, '')

  try {
    // Fast path: if querying a full season with regular-season games, use precomputed table
    const startYear = parseInt(safeStart.slice(0, 4), 10)
    const isFullSeason = safeStart === `${startYear}-01-01` && safeEnd === `${startYear}-12-31` && safeGameType === 'R'

    if (isFullSeason) {
      const { data: cached, error: cacheErr } = await supabase.rpc('run_query', {
        query_text: `SELECT sos, raw_opponent_xwoba AS raw_sos, league_avg_xwoba AS lg_avg, opponents_faced AS opp_count, total_pa FROM sos_scores WHERE player_id = ${safeId} AND game_year = ${startYear} AND role = '${role}'`
      })
      if (!cacheErr && cached && cached.length > 0) {
        return NextResponse.json(formatRow(cached[0]))
      }
    }

    // Slow path: live computation for custom date ranges
    const sql = role === 'hitter'
      ? buildHitterSOS(safeId, safeStart, safeEnd, safeGameType)
      : buildPitcherSOS(safeId, safeStart, safeEnd, safeGameType)

    const { data, error } = await supabase.rpc('run_query_long', { query_text: sql.trim() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No data found for this player/date range' }, { status: 404 })
    }

    const row = data[0]
    return NextResponse.json(formatRow(row))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * POST for batch SOS (multiple players at once)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ids, role, start, end, game_type = 'R' } = body

    if (!ids || !Array.isArray(ids) || !role || !start || !end) {
      return NextResponse.json({ error: 'Missing required fields: ids (array), role, start, end' }, { status: 400 })
    }
    if (role !== 'hitter' && role !== 'pitcher') {
      return NextResponse.json({ error: 'role must be hitter or pitcher' }, { status: 400 })
    }

    const safeIds = ids.map((id: any) => parseInt(id)).filter((n: number) => !isNaN(n))
    if (safeIds.length === 0) return NextResponse.json({ error: 'No valid ids' }, { status: 400 })

    const safeStart = start.replace(/[^0-9-]/g, '')
    const safeEnd = end.replace(/[^0-9-]/g, '')
    const safeGameType = game_type.replace(/[^A-Z]/g, '')

    // Fast path: full season lookup from precomputed table
    const startYear = parseInt(safeStart.slice(0, 4), 10)
    const isFullSeason = safeStart === `${startYear}-01-01` && safeEnd === `${startYear}-12-31` && safeGameType === 'R'

    if (isFullSeason) {
      const { data: cached, error: cacheErr } = await supabase.rpc('run_query', {
        query_text: `SELECT player_id, sos, raw_opponent_xwoba AS raw_sos, league_avg_xwoba AS lg_avg, opponents_faced AS opp_count, total_pa FROM sos_scores WHERE player_id IN (${safeIds.join(',')}) AND game_year = ${startYear} AND role = '${role}'`
      })
      if (!cacheErr && cached && cached.length > 0) {
        const results: Record<number, any> = {}
        for (const row of cached) {
          results[row.player_id] = formatRow(row)
        }
        return NextResponse.json({ results })
      }
    }

    // Slow path: live computation
    const sql = role === 'hitter'
      ? buildBatchHitterSOS(safeIds, safeStart, safeEnd, safeGameType)
      : buildBatchPitcherSOS(safeIds, safeStart, safeEnd, safeGameType)

    const { data, error } = await supabase.rpc('run_query_long', { query_text: sql.trim() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const results: Record<number, any> = {}
    for (const row of (data || [])) {
      results[row.player_id] = formatRow(row)
    }

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function formatRow(row: any) {
  return {
    sos: row.sos != null ? Math.round(row.sos * 10) / 10 : null,
    raw_opponent_xwoba: row.raw_sos != null ? Math.round(row.raw_sos * 1000) / 1000 : null,
    league_avg_xwoba: row.lg_avg != null ? Math.round(row.lg_avg * 1000) / 1000 : null,
    opponents_faced: row.opp_count,
    total_pa: row.total_pa,
  }
}

// ── SQL Builders (subtraction-based leave-one-out) ──────────────────────────
//
// Instead of scanning all PAs with "batter != X", we:
//   1. Compute each opponent's TOTAL stats for the date range
//   2. Compute the specific matchup stats (player vs opponent)
//   3. LOO = (total - matchup) / (total_n - matchup_n)
// This turns an expensive anti-join into two fast indexed scans.

function buildHitterSOS(batterId: number, start: string, end: string, gameType: string): string {
  const f = DATE_FILTER(start, end, gameType)
  return `WITH all_pitcher_stats AS (
  SELECT pitcher, COUNT(*) AS total_pa,
    SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS total_xwoba_sum
  FROM pitches WHERE ${f} GROUP BY pitcher
),
matchup_stats AS (
  SELECT pitcher, COUNT(*) AS mu_pa,
    SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS mu_xwoba_sum
  FROM pitches WHERE batter = ${batterId} AND ${f} GROUP BY pitcher
),
league AS (
  SELECT AVG(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_avg,
         STDDEV(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_std
  FROM all_pitcher_stats WHERE total_pa >= 10
),
loo AS (
  SELECT m.pitcher, m.mu_pa AS pas_vs,
    (a.total_pa - m.mu_pa) AS loo_n,
    CASE WHEN (a.total_pa - m.mu_pa) > 0
      THEN (a.total_xwoba_sum - COALESCE(m.mu_xwoba_sum, 0)) / (a.total_pa - m.mu_pa)
    END AS loo_xwoba
  FROM matchup_stats m
  JOIN all_pitcher_stats a ON m.pitcher = a.pitcher
),
regressed AS (
  SELECT pitcher, pas_vs,
    (loo_n * loo_xwoba + ${REGRESSION_K} * l.lg_avg) / (loo_n + ${REGRESSION_K}) AS reg_xwoba
  FROM loo CROSS JOIN league l WHERE loo_xwoba IS NOT NULL
)
SELECT
  SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) AS raw_sos,
  l.lg_avg, l.lg_std,
  100 + ((l.lg_avg - SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0)) / NULLIF(l.lg_std, 0)) * 10 AS sos,
  COUNT(DISTINCT r.pitcher) AS opp_count,
  SUM(r.pas_vs) AS total_pa
FROM regressed r CROSS JOIN league l
GROUP BY l.lg_avg, l.lg_std`
}

function buildPitcherSOS(pitcherId: number, start: string, end: string, gameType: string): string {
  const f = DATE_FILTER(start, end, gameType)
  return `WITH all_batter_stats AS (
  SELECT batter, COUNT(*) AS total_pa,
    SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS total_xwoba_sum
  FROM pitches WHERE ${f} GROUP BY batter
),
matchup_stats AS (
  SELECT batter, COUNT(*) AS mu_pa,
    SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS mu_xwoba_sum
  FROM pitches WHERE pitcher = ${pitcherId} AND ${f} GROUP BY batter
),
league AS (
  SELECT AVG(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_avg,
         STDDEV(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_std
  FROM all_batter_stats WHERE total_pa >= 10
),
loo AS (
  SELECT m.batter, m.mu_pa AS pas_vs,
    (a.total_pa - m.mu_pa) AS loo_n,
    CASE WHEN (a.total_pa - m.mu_pa) > 0
      THEN (a.total_xwoba_sum - COALESCE(m.mu_xwoba_sum, 0)) / (a.total_pa - m.mu_pa)
    END AS loo_xwoba
  FROM matchup_stats m
  JOIN all_batter_stats a ON m.batter = a.batter
),
regressed AS (
  SELECT batter, pas_vs,
    (loo_n * loo_xwoba + ${REGRESSION_K} * l.lg_avg) / (loo_n + ${REGRESSION_K}) AS reg_xwoba
  FROM loo CROSS JOIN league l WHERE loo_xwoba IS NOT NULL
)
SELECT
  SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) AS raw_sos,
  l.lg_avg, l.lg_std,
  100 + ((SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) - l.lg_avg) / NULLIF(l.lg_std, 0)) * 10 AS sos,
  COUNT(DISTINCT r.batter) AS opp_count,
  SUM(r.pas_vs) AS total_pa
FROM regressed r CROSS JOIN league l
GROUP BY l.lg_avg, l.lg_std`
}

function buildBatchHitterSOS(ids: number[], start: string, end: string, gameType: string): string {
  const idList = ids.join(',')
  const f = DATE_FILTER(start, end, gameType)
  return `WITH all_pitcher_stats AS (
  SELECT pitcher, COUNT(*) AS total_pa,
    SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS total_xwoba_sum
  FROM pitches WHERE ${f} GROUP BY pitcher
),
matchup_stats AS (
  SELECT batter, pitcher, COUNT(*) AS mu_pa,
    SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS mu_xwoba_sum
  FROM pitches WHERE batter IN (${idList}) AND ${f} GROUP BY batter, pitcher
),
league AS (
  SELECT AVG(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_avg,
         STDDEV(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_std
  FROM all_pitcher_stats WHERE total_pa >= 10
),
loo AS (
  SELECT m.batter AS player_id, m.pitcher, m.mu_pa AS pas_vs,
    (a.total_pa - m.mu_pa) AS loo_n,
    CASE WHEN (a.total_pa - m.mu_pa) > 0
      THEN (a.total_xwoba_sum - COALESCE(m.mu_xwoba_sum, 0)) / (a.total_pa - m.mu_pa)
    END AS loo_xwoba
  FROM matchup_stats m
  JOIN all_pitcher_stats a ON m.pitcher = a.pitcher
),
regressed AS (
  SELECT player_id, pitcher, pas_vs,
    (loo_n * loo_xwoba + ${REGRESSION_K} * l.lg_avg) / (loo_n + ${REGRESSION_K}) AS reg_xwoba
  FROM loo CROSS JOIN league l WHERE loo_xwoba IS NOT NULL
)
SELECT
  r.player_id,
  SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) AS raw_sos,
  l.lg_avg, l.lg_std,
  100 + ((l.lg_avg - SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0)) / NULLIF(l.lg_std, 0)) * 10 AS sos,
  COUNT(DISTINCT r.pitcher) AS opp_count,
  SUM(r.pas_vs) AS total_pa
FROM regressed r CROSS JOIN league l
GROUP BY r.player_id, l.lg_avg, l.lg_std`
}

function buildBatchPitcherSOS(ids: number[], start: string, end: string, gameType: string): string {
  const idList = ids.join(',')
  const f = DATE_FILTER(start, end, gameType)
  return `WITH all_batter_stats AS (
  SELECT batter, COUNT(*) AS total_pa,
    SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS total_xwoba_sum
  FROM pitches WHERE ${f} GROUP BY batter
),
matchup_stats AS (
  SELECT pitcher, batter, COUNT(*) AS mu_pa,
    SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS mu_xwoba_sum
  FROM pitches WHERE pitcher IN (${idList}) AND ${f} GROUP BY pitcher, batter
),
league AS (
  SELECT AVG(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_avg,
         STDDEV(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_std
  FROM all_batter_stats WHERE total_pa >= 10
),
loo AS (
  SELECT m.pitcher AS player_id, m.batter, m.mu_pa AS pas_vs,
    (a.total_pa - m.mu_pa) AS loo_n,
    CASE WHEN (a.total_pa - m.mu_pa) > 0
      THEN (a.total_xwoba_sum - COALESCE(m.mu_xwoba_sum, 0)) / (a.total_pa - m.mu_pa)
    END AS loo_xwoba
  FROM matchup_stats m
  JOIN all_batter_stats a ON m.batter = a.batter
),
regressed AS (
  SELECT player_id, batter, pas_vs,
    (loo_n * loo_xwoba + ${REGRESSION_K} * l.lg_avg) / (loo_n + ${REGRESSION_K}) AS reg_xwoba
  FROM loo CROSS JOIN league l WHERE loo_xwoba IS NOT NULL
)
SELECT
  r.player_id,
  SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) AS raw_sos,
  l.lg_avg, l.lg_std,
  100 + ((SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) - l.lg_avg) / NULLIF(l.lg_std, 0)) * 10 AS sos,
  COUNT(DISTINCT r.batter) AS opp_count,
  SUM(r.pas_vs) AS total_pa
FROM regressed r CROSS JOIN league l
GROUP BY r.player_id, l.lg_avg, l.lg_std`
}
