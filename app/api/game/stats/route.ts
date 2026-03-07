import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const sql = `
    WITH headline AS (
      SELECT
        COUNT(*)::int AS total_games,
        COUNT(*) FILTER (WHERE puzzle_date = CURRENT_DATE)::int AS games_today,
        COUNT(*) FILTER (WHERE puzzle_date >= CURRENT_DATE - INTERVAL '7 days')::int AS games_week,
        COUNT(*) FILTER (WHERE puzzle_date >= CURRENT_DATE - INTERVAL '30 days')::int AS games_month,
        COUNT(DISTINCT player_uuid)::int AS unique_players,
        ROUND(100.0 * COUNT(*) FILTER (WHERE won) / NULLIF(COUNT(*), 0), 1) AS win_rate,
        ROUND(AVG(score), 1) AS avg_score
      FROM game_scores
    ),
    by_type AS (
      SELECT
        puzzle_type,
        COUNT(*)::int AS games,
        ROUND(AVG(score), 1) AS avg_score,
        ROUND(100.0 * COUNT(*) FILTER (WHERE won) / NULLIF(COUNT(*), 0), 1) AS win_rate,
        COUNT(*) FILTER (WHERE score = 100)::int AS perfect_scores
      FROM game_scores
      GROUP BY puzzle_type
    ),
    by_year AS (
      SELECT
        puzzle_year,
        COUNT(*)::int AS games,
        ROUND(AVG(score), 1) AS avg_score,
        ROUND(100.0 * COUNT(*) FILTER (WHERE won) / NULLIF(COUNT(*), 0), 1) AS win_rate
      FROM game_scores
      GROUP BY puzzle_year
      ORDER BY puzzle_year
    ),
    top_players AS (
      SELECT
        display_name,
        SUM(score)::int AS total_score,
        COUNT(*)::int AS games_played,
        COUNT(*) FILTER (WHERE won)::int AS wins,
        ROUND(AVG(score), 1) AS avg_score
      FROM game_scores
      GROUP BY player_uuid, display_name
      ORDER BY total_score DESC
      LIMIT 5
    ),
    most_games AS (
      SELECT
        display_name,
        COUNT(*)::int AS games_played
      FROM game_scores
      GROUP BY player_uuid, display_name
      ORDER BY games_played DESC
      LIMIT 1
    ),
    hardest AS (
      SELECT
        puzzle_date,
        puzzle_year,
        puzzle_type,
        ROUND(AVG(score), 1) AS avg_score,
        COUNT(*)::int AS submissions
      FROM game_scores
      GROUP BY puzzle_date, puzzle_year, puzzle_type
      HAVING COUNT(*) >= 3
      ORDER BY AVG(score) ASC
      LIMIT 1
    ),
    easiest AS (
      SELECT
        puzzle_date,
        puzzle_year,
        puzzle_type,
        ROUND(AVG(score), 1) AS avg_score,
        COUNT(*)::int AS submissions
      FROM game_scores
      GROUP BY puzzle_date, puzzle_year, puzzle_type
      HAVING COUNT(*) >= 3
      ORDER BY AVG(score) DESC
      LIMIT 1
    ),
    distribution AS (
      SELECT
        COUNT(*) FILTER (WHERE score BETWEEN 0 AND 20)::int AS "0-20",
        COUNT(*) FILTER (WHERE score BETWEEN 21 AND 40)::int AS "21-40",
        COUNT(*) FILTER (WHERE score BETWEEN 41 AND 60)::int AS "41-60",
        COUNT(*) FILTER (WHERE score BETWEEN 61 AND 80)::int AS "61-80",
        COUNT(*) FILTER (WHERE score BETWEEN 81 AND 100)::int AS "81-100"
      FROM game_scores
    ),
    fun AS (
      SELECT
        ROUND(AVG(guesses), 1) AS avg_guesses_to_win,
        ROUND(100.0 * COUNT(*) FILTER (WHERE hints_used > 0) / NULLIF(COUNT(*), 0), 1) AS hint_usage_rate,
        COUNT(*) FILTER (WHERE won AND guesses = 1)::int AS first_guess_wins,
        COUNT(*) FILTER (WHERE score = 100)::int AS perfect_100s,
        COUNT(*) FILTER (WHERE score >= 95)::int AS score_95_plus,
        COUNT(*) FILTER (WHERE score >= 80)::int AS score_80_plus
      FROM game_scores
    )
    SELECT json_build_object(
      'headline', (SELECT row_to_json(h) FROM headline h),
      'by_type', (SELECT json_agg(row_to_json(t)) FROM by_type t),
      'by_year', (SELECT json_agg(row_to_json(y)) FROM by_year y),
      'top_players', (SELECT json_agg(row_to_json(p)) FROM top_players p),
      'most_games', (SELECT row_to_json(m) FROM most_games m),
      'hardest', (SELECT row_to_json(h) FROM hardest h),
      'easiest', (SELECT row_to_json(e) FROM easiest e),
      'distribution', (SELECT row_to_json(d) FROM distribution d),
      'fun', (SELECT row_to_json(f) FROM fun f)
    ) AS result
  `

  const { data, error } = await supabaseAdmin.rpc('run_query', { query_text: sql.trim() })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = (data as Record<string, unknown>[])?.[0]?.result ?? {}

  return NextResponse.json(
    result,
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } }
  )
}
