-- Team monthly materialized views for the Trends Visualizer team mode.
--
-- Month buckets over the derived team (no team column exists on pitches, and
-- the CASE derivation can't use an index) would otherwise scan most of the
-- 8.8M-row table for a career span. These pre-aggregate the pitching
-- perspective per team × month; game-level buckets stay live SQL.
--
-- Metric expressions are copied verbatim from METRICS in lib/reportMetrics.ts
-- so team trend lines match the pitcher trend lines (the older mv_team_*
-- views use slightly simplified whiff/chase filters — these do not).
--
-- Regular season only (game_type = 'R'), pitchouts/intentional balls
-- excluded, matching the existing team MVs.
--
-- Refresh nightly via refresh_team_monthly_views(), called by
-- /api/cron/refresh after refresh_materialized_views().

-- ============================================================================
-- 1. mv_team_monthly_pitching_stats — per team × month (pitching perspective)
--    Covers: trends-viz team metric mode (month buckets), incl. FIP/xERA
--    components. ERA itself is NOT here — it comes from the MLB Stats API.
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS mv_team_monthly_pitching_stats CASCADE;
CREATE MATERIALIZED VIEW mv_team_monthly_pitching_stats AS
SELECT
  CASE WHEN p.inning_topbot = 'Top' THEN p.home_team ELSE p.away_team END AS team,
  p.game_year,
  to_char(p.game_date, 'YYYY-MM') AS month,
  COUNT(*)::int AS pitches,
  COUNT(DISTINCT p.game_pk)::int AS games,
  COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events <> 'truncated_pa' THEN p.game_pk::bigint * 10000 + p.at_bat_number END)::int AS pa,
  ROUND(AVG(p.release_speed)::numeric, 1) AS avg_velo,
  ROUND(MAX(p.release_speed)::numeric, 1) AS max_velo,
  ROUND(AVG(p.release_spin_rate)::numeric, 0) AS avg_spin,
  ROUND(AVG(p.release_extension)::numeric, 2) AS avg_ext,
  ROUND(AVG(p.pfx_x * 12)::numeric, 1) AS avg_hbreak_in,
  ROUND(AVG(p.pfx_z * 12)::numeric, 1) AS avg_ivb_in,
  ROUND(AVG(p.stuff_plus)::numeric, 0) AS avg_stuff_plus,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'missed_bunt' OR p.description = 'swinging_pitchout')
    / NULLIF(COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description LIKE 'hit_into_play%' OR p.description = 'missed_bunt' OR p.description = 'swinging_pitchout'), 0), 1) AS whiff_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'called_strike' OR p.description = 'swinging_pitchout')
    / NULLIF(COUNT(*), 0), 1) AS csw_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'swinging_pitchout')
    / NULLIF(COUNT(*), 0), 1) AS swstr_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone > 9 AND (p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description LIKE 'hit_into_play%' OR p.description = 'missed_bunt' OR p.description = 'swinging_pitchout'))
    / NULLIF(COUNT(*) FILTER (WHERE p.zone > 9), 0), 1) AS chase_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone BETWEEN 1 AND 9)
    / NULLIF(COUNT(*) FILTER (WHERE p.zone IS NOT NULL), 0), 1) AS zone_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.pitch_number = 1 AND (p.description = 'called_strike' OR p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description LIKE 'hit_into_play%' OR p.description = 'missed_bunt' OR p.description = 'swinging_pitchout'))
    / NULLIF(COUNT(*) FILTER (WHERE p.pitch_number = 1), 0), 1) AS fps_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events <> 'truncated_pa' THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS k_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events IN ('walk','intent_walk'))
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events <> 'truncated_pa' THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS bb_pct,
  ROUND(AVG(p.launch_speed)::numeric, 1) AS avg_ev,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed >= 95 AND p.bb_type IS NOT NULL)
    / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0), 1) AS hard_hit_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed_angle::text = '6')
    / NULLIF(COUNT(*) FILTER (WHERE p.launch_speed_angle IS NOT NULL), 0), 1) AS barrel_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.bb_type = 'ground_ball')
    / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0), 1) AS gb_pct,
  ROUND(AVG(p.launch_angle)::numeric, 1) AS avg_la,
  -- Savant-faithful blended xwOBA (batted balls + 0.7*uBB + 0.7*HBP over official wOBA denominator)
  ROUND(((COALESCE(SUM(p.estimated_woba_using_speedangle) FILTER (WHERE p.description LIKE 'hit_into_play%'), 0)
    + 0.7 * COUNT(*) FILTER (WHERE p.events = 'walk') + 0.7 * COUNT(*) FILTER (WHERE p.events = 'hit_by_pitch'))
    / NULLIF(COUNT(*) FILTER (WHERE p.events IN ('single','double','triple','home_run','field_out','strikeout','strikeout_double_play','grounded_into_double_play','force_out','double_play','field_error','fielders_choice','fielders_choice_out','triple_play','other_out','walk','hit_by_pitch','sac_fly','sac_fly_double_play')), 0))::numeric, 3) AS avg_xwoba,
  -- FIP/xERA components (same shapes as ERA_COMPONENTS_SQL in lib/sql.ts)
  COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')::int AS strikeouts,
  COUNT(*) FILTER (WHERE p.events IN ('walk','intent_walk'))::int AS walks,
  COUNT(*) FILTER (WHERE p.events = 'hit_by_pitch')::int AS hbp,
  COUNT(*) FILTER (WHERE p.events = 'home_run')::int AS home_runs,
  ROUND((COUNT(*) FILTER (WHERE p.events IN ('strikeout','field_out','force_out','fielders_choice','fielders_choice_out','sac_fly','sac_bunt'))
    + 2 * COUNT(*) FILTER (WHERE p.events IN ('strikeout_double_play','double_play','grounded_into_double_play','sac_fly_double_play'))
    + 3 * COUNT(*) FILTER (WHERE p.events = 'triple_play'))::numeric / 3, 1) AS ip,
  ((COALESCE(SUM(p.estimated_woba_using_speedangle) FILTER (WHERE p.description LIKE 'hit_into_play%'), 0)
    + 0.7 * COUNT(*) FILTER (WHERE p.events = 'walk') + 0.7 * COUNT(*) FILTER (WHERE p.events = 'hit_by_pitch'))
    / NULLIF(COUNT(*) FILTER (WHERE p.events IN ('single','double','triple','home_run','field_out','strikeout','strikeout_double_play','grounded_into_double_play','force_out','double_play','field_error','fielders_choice','fielders_choice_out','triple_play','other_out','walk','hit_by_pitch','sac_fly','sac_fly_double_play')), 0)) AS xwoba_raw
FROM pitches p
WHERE p.pitch_type NOT IN ('PO', 'IN') AND p.game_type = 'R'
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX ON mv_team_monthly_pitching_stats (team, month);
CREATE INDEX ON mv_team_monthly_pitching_stats (team, game_year);

-- ============================================================================
-- 2. mv_team_monthly_pitch_mix — per team × month × pitch_name
--    Covers: trends-viz team pitch mode (staff pitch mix + per-pitch traits).
--    usage_pct is the pitch's share of the team's month.
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS mv_team_monthly_pitch_mix CASCADE;
CREATE MATERIALIZED VIEW mv_team_monthly_pitch_mix AS
SELECT
  CASE WHEN p.inning_topbot = 'Top' THEN p.home_team ELSE p.away_team END AS team,
  p.game_year,
  to_char(p.game_date, 'YYYY-MM') AS month,
  p.pitch_name,
  COUNT(*)::int AS n,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (
    PARTITION BY CASE WHEN p.inning_topbot = 'Top' THEN p.home_team ELSE p.away_team END,
                 to_char(p.game_date, 'YYYY-MM')), 0), 1) AS usage_pct,
  ROUND(AVG(p.release_speed)::numeric, 1) AS avg_velo,
  ROUND(MAX(p.release_speed)::numeric, 1) AS max_velo,
  ROUND(AVG(p.release_spin_rate)::numeric, 0) AS avg_spin,
  ROUND(AVG(p.release_extension)::numeric, 2) AS avg_ext,
  ROUND(AVG(p.pfx_x * 12)::numeric, 1) AS avg_hbreak_in,
  ROUND(AVG(p.pfx_z * 12)::numeric, 1) AS avg_ivb_in,
  ROUND(AVG(p.stuff_plus)::numeric, 0) AS avg_stuff_plus,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'missed_bunt' OR p.description = 'swinging_pitchout')
    / NULLIF(COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description LIKE 'hit_into_play%' OR p.description = 'missed_bunt' OR p.description = 'swinging_pitchout'), 0), 1) AS whiff_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'called_strike' OR p.description = 'swinging_pitchout')
    / NULLIF(COUNT(*), 0), 1) AS csw_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'swinging_pitchout')
    / NULLIF(COUNT(*), 0), 1) AS swstr_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone > 9 AND (p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description LIKE 'hit_into_play%' OR p.description = 'missed_bunt' OR p.description = 'swinging_pitchout'))
    / NULLIF(COUNT(*) FILTER (WHERE p.zone > 9), 0), 1) AS chase_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone BETWEEN 1 AND 9)
    / NULLIF(COUNT(*) FILTER (WHERE p.zone IS NOT NULL), 0), 1) AS zone_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.pitch_number = 1 AND (p.description = 'called_strike' OR p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description LIKE 'hit_into_play%' OR p.description = 'missed_bunt' OR p.description = 'swinging_pitchout'))
    / NULLIF(COUNT(*) FILTER (WHERE p.pitch_number = 1), 0), 1) AS fps_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events <> 'truncated_pa' THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS k_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events IN ('walk','intent_walk'))
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events <> 'truncated_pa' THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS bb_pct,
  ROUND(AVG(p.launch_speed)::numeric, 1) AS avg_ev,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed >= 95 AND p.bb_type IS NOT NULL)
    / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0), 1) AS hard_hit_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed_angle::text = '6')
    / NULLIF(COUNT(*) FILTER (WHERE p.launch_speed_angle IS NOT NULL), 0), 1) AS barrel_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.bb_type = 'ground_ball')
    / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0), 1) AS gb_pct,
  ROUND(AVG(p.launch_angle)::numeric, 1) AS avg_la,
  -- Savant-faithful blended xwOBA (batted balls + 0.7*uBB + 0.7*HBP over official wOBA denominator)
  ROUND(((COALESCE(SUM(p.estimated_woba_using_speedangle) FILTER (WHERE p.description LIKE 'hit_into_play%'), 0)
    + 0.7 * COUNT(*) FILTER (WHERE p.events = 'walk') + 0.7 * COUNT(*) FILTER (WHERE p.events = 'hit_by_pitch'))
    / NULLIF(COUNT(*) FILTER (WHERE p.events IN ('single','double','triple','home_run','field_out','strikeout','strikeout_double_play','grounded_into_double_play','force_out','double_play','field_error','fielders_choice','fielders_choice_out','triple_play','other_out','walk','hit_by_pitch','sac_fly','sac_fly_double_play')), 0))::numeric, 3) AS avg_xwoba
FROM pitches p
WHERE p.pitch_type NOT IN ('PO', 'IN') AND p.game_type = 'R' AND p.pitch_name IS NOT NULL
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX ON mv_team_monthly_pitch_mix (team, month, pitch_name);
CREATE INDEX ON mv_team_monthly_pitch_mix (team, game_year);

-- ============================================================================
-- Refresh function — separate from refresh_materialized_views() so this
-- migration doesn't have to restate that function's large body. The refresh
-- cron calls both.
-- ============================================================================
-- CONCURRENTLY requires a populated MV; fall back to a plain REFRESH the
-- first time (or after a failed initial load) so the nightly cron can
-- self-heal an unpopulated view instead of erroring forever.
CREATE OR REPLACE FUNCTION refresh_team_monthly_views()
RETURNS void LANGUAGE plpgsql
SET statement_timeout = '3600s'  -- caller's role default (8s) can't fit a REFRESH
AS $$
BEGIN
  IF (SELECT ispopulated FROM pg_matviews WHERE matviewname = 'mv_team_monthly_pitching_stats') THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_team_monthly_pitching_stats;
  ELSE
    REFRESH MATERIALIZED VIEW mv_team_monthly_pitching_stats;
  END IF;
  IF (SELECT ispopulated FROM pg_matviews WHERE matviewname = 'mv_team_monthly_pitch_mix') THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_team_monthly_pitch_mix;
  ELSE
    REFRESH MATERIALIZED VIEW mv_team_monthly_pitch_mix;
  END IF;
END;
$$;
