-- Materialized views for pre-aggregated analytics.
-- Eliminates full-season pitches table scans (7.4M+ rows) from leaderboard,
-- team-tendencies, park-adjusted, trends, and scene-stats routes.
--
-- All cover regular season only (game_type = 'R').
-- Refresh nightly via refresh_materialized_views() after pitch ingest.
--
-- NOTE: mv_pitcher_season_stats is a regular TABLE (not a materialized view)
-- because the full MV REFRESH exceeds Supabase statement timeouts. It is
-- refreshed incrementally (DELETE recent + re-INSERT) by the refresh function.
-- The other six are true materialized views refreshed with REFRESH CONCURRENTLY.

-- ============================================================================
-- 1. mv_pitcher_season_stats — per pitcher × game_year × p_throws (TABLE)
--    Covers: park-adjusted pitching, scene-stats pitcher leaderboard,
--            percentile mode, FIP/xERA leaderboard
-- ============================================================================
DROP TABLE IF EXISTS mv_pitcher_season_stats CASCADE;
-- Populate via: INSERT INTO mv_pitcher_season_stats SELECT ... FROM pitches ... GROUP BY pitcher, game_year, p_throws
-- See refresh_materialized_views() for the full INSERT query.
CREATE TABLE mv_pitcher_season_stats AS
SELECT
  p.pitcher AS player_id,
  p.game_year,
  p.p_throws,
  MODE() WITHIN GROUP (ORDER BY CASE WHEN p.inning_topbot = 'Top' THEN p.home_team ELSE p.away_team END) AS team,
  -- Counting
  COUNT(*)::int AS pitches,
  COUNT(DISTINCT p.game_pk)::int AS games,
  COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END)::int AS pa,
  -- IP estimate (matches lib/sql.ts IP_ESTIMATE_SQL)
  ROUND((COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events NOT IN ('single','double','triple','home_run','walk','hit_by_pitch','catcher_interf','field_error') THEN p.game_pk::bigint * 10000 + p.at_bat_number END)
   + COUNT(DISTINCT CASE WHEN p.events LIKE '%double_play%' THEN p.game_pk::bigint * 10000 + p.at_bat_number END)
   + 2 * COUNT(DISTINCT CASE WHEN p.events = 'triple_play' THEN p.game_pk::bigint * 10000 + p.at_bat_number END))::numeric / 3.0, 1) AS ip,
  -- Velocity / Spin / Extension
  ROUND(AVG(p.release_speed)::numeric, 1) AS avg_velo,
  ROUND(MAX(p.release_speed)::numeric, 1) AS max_velo,
  ROUND(AVG(p.release_spin_rate)::numeric, 0) AS avg_spin,
  ROUND(AVG(p.release_extension)::numeric, 2) AS avg_ext,
  -- Movement (inches)
  ROUND(AVG(p.pfx_x * 12)::numeric, 1) AS avg_hbreak_in,
  ROUND(AVG(p.pfx_z * 12)::numeric, 1) AS avg_ivb_in,
  -- Arm angle
  ROUND(AVG(p.arm_angle)::numeric, 1) AS avg_arm_angle,
  -- K% / BB%
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS k_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events = 'walk')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS bb_pct,
  -- Whiff% / CSW% / SwStr%
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'missed_bunt')
    / NULLIF(COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description = 'hit_into_play' OR p.description = 'foul_tip' OR p.description = 'missed_bunt'), 0), 1) AS whiff_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'called_strike')
    / NULLIF(COUNT(*), 0), 1) AS csw_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%')
    / NULLIF(COUNT(*), 0), 1) AS swstr_pct,
  -- Zone% / Chase%
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone BETWEEN 1 AND 9)
    / NULLIF(COUNT(*) FILTER (WHERE p.zone IS NOT NULL), 0), 1) AS zone_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone > 9 AND (p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description = 'hit_into_play' OR p.description = 'missed_bunt'))
    / NULLIF(COUNT(*) FILTER (WHERE p.zone > 9), 0), 1) AS chase_pct,
  -- Contact% / Z-Swing% / O-Contact%
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip'))
    / NULLIF(COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip','missed_bunt')), 0), 1) AS contact_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone BETWEEN 1 AND 9 AND (p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description = 'hit_into_play' OR p.description = 'missed_bunt'))
    / NULLIF(COUNT(*) FILTER (WHERE p.zone BETWEEN 1 AND 9), 0), 1) AS z_swing_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone > 9 AND p.description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip'))
    / NULLIF(COUNT(*) FILTER (WHERE p.zone > 9 AND (p.description LIKE '%swinging_strike%' OR p.description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip','missed_bunt'))), 0), 1) AS o_contact_pct,
  -- Batting against
  ROUND(COUNT(*) FILTER (WHERE p.events IN ('single','double','triple','home_run'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) AS ba,
  ROUND((COUNT(*) FILTER (WHERE p.events = 'single') + 2 * COUNT(*) FILTER (WHERE p.events = 'double') + 3 * COUNT(*) FILTER (WHERE p.events = 'triple') + 4 * COUNT(*) FILTER (WHERE p.events = 'home_run'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) AS slg,
  ROUND((COUNT(*) FILTER (WHERE p.events IN ('single','double','triple','home_run','walk','hit_by_pitch')))::numeric
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events NOT IN ('sac_bunt','catcher_interf') THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 3) AS obp,
  -- Expected
  ROUND(AVG(p.estimated_woba_using_speedangle)::numeric, 3) AS avg_xwoba,
  ROUND(SUM(p.estimated_ba_using_speedangle)::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) AS avg_xba,
  ROUND(AVG(p.estimated_slg_using_speedangle)::numeric, 3) AS avg_xslg,
  ROUND(AVG(p.woba_value)::numeric, 3) AS avg_woba,
  -- Batted ball quality
  ROUND(AVG(p.launch_speed)::numeric, 1) AS avg_ev,
  ROUND(MAX(p.launch_speed)::numeric, 1) AS max_ev,
  ROUND(AVG(p.launch_angle)::numeric, 1) AS avg_la,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed >= 95 AND p.bb_type IS NOT NULL)
    / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0), 1) AS hard_hit_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed_angle::text = '6')
    / NULLIF(COUNT(*) FILTER (WHERE p.launch_speed_angle IS NOT NULL), 0), 1) AS barrel_pct,
  -- GB/FB/LD
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.bb_type = 'ground_ball')
    / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0), 1) AS gb_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.bb_type = 'fly_ball')
    / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0), 1) AS fb_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.bb_type = 'line_drive')
    / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0), 1) AS ld_pct,
  -- ERA raw components (for FIP/xERA computation in JS)
  COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')::int AS strikeouts,
  COUNT(*) FILTER (WHERE p.events = 'walk')::int AS walks,
  COUNT(*) FILTER (WHERE p.events = 'hit_by_pitch')::int AS hbp,
  COUNT(*) FILTER (WHERE p.events = 'home_run')::int AS home_runs,
  COUNT(p.estimated_woba_using_speedangle)::int AS xwoba_n,
  -- Stuff+
  ROUND(AVG(p.stuff_plus)::numeric, 1) AS avg_stuff_plus,
  COUNT(p.stuff_plus)::int AS stuff_plus_n,
  -- RE24
  ROUND(SUM(p.delta_run_exp)::numeric, 1) AS total_re24
FROM pitches p
WHERE p.pitch_type NOT IN ('PO', 'IN') AND p.game_type = 'R'
GROUP BY p.pitcher, p.game_year, p.p_throws;

ALTER TABLE mv_pitcher_season_stats ADD PRIMARY KEY (player_id, game_year, p_throws);
CREATE INDEX ON mv_pitcher_season_stats (game_year);
CREATE INDEX ON mv_pitcher_season_stats (game_year, team);

-- ============================================================================
-- 2. mv_batter_season_stats — per batter × game_year
--    Covers: park-adjusted hitting, scene-stats batter leaderboard, wRC+
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS mv_batter_season_stats CASCADE;
CREATE MATERIALIZED VIEW mv_batter_season_stats AS
SELECT
  p.batter AS player_id,
  p.game_year,
  MODE() WITHIN GROUP (ORDER BY CASE WHEN p.inning_topbot = 'Top' THEN p.away_team ELSE p.home_team END) AS team,
  -- Counting
  COUNT(*)::int AS pitches,
  COUNT(DISTINCT p.game_pk)::int AS games,
  COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END)::int AS pa,
  -- Rates
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS k_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events = 'walk')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS bb_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'missed_bunt')
    / NULLIF(COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description = 'hit_into_play' OR p.description = 'foul_tip' OR p.description = 'missed_bunt'), 0), 1) AS whiff_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone > 9 AND (p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description = 'hit_into_play' OR p.description = 'missed_bunt'))
    / NULLIF(COUNT(*) FILTER (WHERE p.zone > 9), 0), 1) AS chase_pct,
  -- Batting
  ROUND(COUNT(*) FILTER (WHERE p.events IN ('single','double','triple','home_run'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) AS ba,
  ROUND((COUNT(*) FILTER (WHERE p.events = 'single') + 2 * COUNT(*) FILTER (WHERE p.events = 'double') + 3 * COUNT(*) FILTER (WHERE p.events = 'triple') + 4 * COUNT(*) FILTER (WHERE p.events = 'home_run'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) AS slg,
  ROUND((COUNT(*) FILTER (WHERE p.events IN ('single','double','triple','home_run','walk','hit_by_pitch')))::numeric
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events NOT IN ('sac_bunt','catcher_interf') THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 3) AS obp,
  -- Expected
  ROUND(AVG(p.estimated_woba_using_speedangle)::numeric, 3) AS avg_xwoba,
  ROUND(SUM(p.estimated_ba_using_speedangle)::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) AS avg_xba,
  ROUND(AVG(p.estimated_slg_using_speedangle)::numeric, 3) AS avg_xslg,
  ROUND(AVG(p.woba_value)::numeric, 3) AS avg_woba,
  AVG(p.woba_value) AS woba_raw,  -- unrounded for wRC+ precision
  -- Batted ball quality
  ROUND(AVG(p.launch_speed)::numeric, 1) AS avg_ev,
  ROUND(MAX(p.launch_speed)::numeric, 1) AS max_ev,
  ROUND(AVG(p.launch_angle)::numeric, 1) AS avg_la,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed >= 95 AND p.bb_type IS NOT NULL)
    / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0), 1) AS hard_hit_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed_angle::text = '6')
    / NULLIF(COUNT(*) FILTER (WHERE p.launch_speed_angle IS NOT NULL), 0), 1) AS barrel_pct,
  -- Swing metrics
  ROUND(AVG(p.bat_speed)::numeric, 1) AS avg_bat_speed,
  ROUND(AVG(p.swing_length)::numeric, 2) AS avg_swing_length,
  -- RE24
  ROUND(SUM(p.delta_run_exp)::numeric, 1) AS total_re24
FROM pitches p
WHERE p.pitch_type NOT IN ('PO', 'IN') AND p.game_type = 'R'
GROUP BY p.batter, p.game_year;

CREATE UNIQUE INDEX ON mv_batter_season_stats (player_id, game_year);
CREATE INDEX ON mv_batter_season_stats (game_year);
CREATE INDEX ON mv_batter_season_stats (game_year, team);

-- ============================================================================
-- 3. mv_team_pitching_stats — per team × game_year (pitching perspective)
--    Covers: team-tendencies pitching, scene-stats teamStats pitching
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS mv_team_pitching_stats CASCADE;
CREATE MATERIALIZED VIEW mv_team_pitching_stats AS
SELECT
  CASE WHEN p.inning_topbot = 'Top' THEN p.home_team ELSE p.away_team END AS team,
  p.game_year,
  COUNT(*)::int AS pitches,
  COUNT(DISTINCT p.game_pk)::int AS games,
  COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END)::int AS pa,
  ROUND(AVG(p.release_speed)::numeric, 1) AS avg_velo,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'missed_bunt')
    / NULLIF(COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description = 'hit_into_play' OR p.description = 'foul_tip' OR p.description = 'missed_bunt'), 0), 1) AS whiff_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS k_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events = 'walk')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS bb_pct,
  ROUND(AVG(p.estimated_woba_using_speedangle)::numeric, 3) AS avg_xwoba,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'called_strike')
    / NULLIF(COUNT(*), 0), 1) AS csw_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone BETWEEN 1 AND 9)
    / NULLIF(COUNT(*) FILTER (WHERE p.zone IS NOT NULL), 0), 1) AS zone_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.zone > 9 AND (p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description = 'hit_into_play' OR p.description = 'missed_bunt'))
    / NULLIF(COUNT(*) FILTER (WHERE p.zone > 9), 0), 1) AS chase_pct,
  -- ERA components
  COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')::int AS strikeouts,
  COUNT(*) FILTER (WHERE p.events = 'walk')::int AS walks,
  COUNT(*) FILTER (WHERE p.events = 'hit_by_pitch')::int AS hbp,
  COUNT(*) FILTER (WHERE p.events = 'home_run')::int AS home_runs,
  ROUND((COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events NOT IN ('single','double','triple','home_run','walk','hit_by_pitch','catcher_interf','field_error') THEN p.game_pk::bigint * 10000 + p.at_bat_number END)
   + COUNT(DISTINCT CASE WHEN p.events LIKE '%double_play%' THEN p.game_pk::bigint * 10000 + p.at_bat_number END)
   + 2 * COUNT(DISTINCT CASE WHEN p.events = 'triple_play' THEN p.game_pk::bigint * 10000 + p.at_bat_number END))::numeric / 3.0, 1) AS ip,
  AVG(p.estimated_woba_using_speedangle) AS xwoba_raw,
  -- wOBA for wRC+ (batting perspective — stored here for convenience)
  AVG(p.woba_value) AS woba_raw
FROM pitches p
WHERE p.pitch_type NOT IN ('PO', 'IN') AND p.game_type = 'R'
GROUP BY 1, p.game_year;

CREATE UNIQUE INDEX ON mv_team_pitching_stats (team, game_year);

-- ============================================================================
-- 4. mv_team_batting_stats — per team × game_year (batting perspective)
--    Covers: team-tendencies hitting, scene-stats teamStats hitting
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS mv_team_batting_stats CASCADE;
CREATE MATERIALIZED VIEW mv_team_batting_stats AS
SELECT
  CASE WHEN p.inning_topbot = 'Top' THEN p.away_team ELSE p.home_team END AS team,
  p.game_year,
  COUNT(*)::int AS pitches,
  COUNT(DISTINCT p.game_pk)::int AS games,
  COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END)::int AS pa,
  SUM(COALESCE(p.post_bat_score, 0) - COALESCE(p.bat_score, 0)) FILTER (WHERE p.events IS NOT NULL) AS runs,
  ROUND(AVG(p.launch_speed)::numeric, 1) AS avg_ev,
  ROUND(COUNT(*) FILTER (WHERE p.events IN ('single','double','triple','home_run'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) AS ba,
  ROUND((COUNT(*) FILTER (WHERE p.events = 'single') + 2 * COUNT(*) FILTER (WHERE p.events = 'double') + 3 * COUNT(*) FILTER (WHERE p.events = 'triple') + 4 * COUNT(*) FILTER (WHERE p.events = 'home_run'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) AS slg,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS k_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events = 'walk')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS bb_pct,
  ROUND(AVG(p.estimated_woba_using_speedangle)::numeric, 3) AS avg_xwoba,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed >= 95 AND p.bb_type IS NOT NULL)
    / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0), 1) AS hard_hit_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.launch_speed_angle::text = '6')
    / NULLIF(COUNT(*) FILTER (WHERE p.launch_speed_angle IS NOT NULL), 0), 1) AS barrel_pct,
  -- wOBA for wRC+
  AVG(p.woba_value) AS woba_raw
FROM pitches p
WHERE p.pitch_type NOT IN ('PO', 'IN') AND p.game_type = 'R'
GROUP BY 1, p.game_year;

CREATE UNIQUE INDEX ON mv_team_batting_stats (team, game_year);

-- ============================================================================
-- 5. mv_team_bullpen_stats — per team × game_year (inning >= 6)
--    Covers: team-tendencies bullpen tab
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS mv_team_bullpen_stats CASCADE;
CREATE MATERIALIZED VIEW mv_team_bullpen_stats AS
SELECT
  CASE WHEN p.inning_topbot = 'Top' THEN p.home_team ELSE p.away_team END AS team,
  p.game_year,
  COUNT(DISTINCT p.game_pk)::int AS games,
  COUNT(DISTINCT p.pitcher)::int AS unique_pitchers,
  ROUND(COUNT(DISTINCT p.pitcher)::numeric / NULLIF(COUNT(DISTINCT p.game_pk), 0), 1) AS pitchers_per_game,
  COUNT(*)::int AS pitches,
  ROUND(AVG(p.release_speed)::numeric, 1) AS avg_velo,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'missed_bunt')
    / NULLIF(COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description = 'hit_into_play' OR p.description = 'foul_tip' OR p.description = 'missed_bunt'), 0), 1) AS whiff_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS k_pct,
  ROUND(AVG(p.estimated_woba_using_speedangle)::numeric, 3) AS avg_xwoba
FROM pitches p
WHERE p.pitch_type NOT IN ('PO', 'IN') AND p.game_type = 'R' AND p.inning >= 6
GROUP BY 1, p.game_year;

CREATE UNIQUE INDEX ON mv_team_bullpen_stats (team, game_year);

-- ============================================================================
-- 6. mv_team_platoon_stats — per team × game_year × p_throws
--    Covers: team-tendencies platoon tab
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS mv_team_platoon_stats CASCADE;
CREATE MATERIALIZED VIEW mv_team_platoon_stats AS
SELECT
  CASE WHEN p.inning_topbot = 'Top' THEN p.home_team ELSE p.away_team END AS team,
  p.game_year,
  p.p_throws,
  COUNT(*)::int AS pitches,
  COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END)::int AS pa,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events LIKE '%strikeout%')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS k_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.events = 'walk')
    / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END), 0), 1) AS bb_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description = 'missed_bunt')
    / NULLIF(COUNT(*) FILTER (WHERE p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description = 'hit_into_play' OR p.description = 'foul_tip' OR p.description = 'missed_bunt'), 0), 1) AS whiff_pct,
  ROUND(AVG(p.estimated_woba_using_speedangle)::numeric, 3) AS avg_xwoba,
  ROUND(COUNT(*) FILTER (WHERE p.events IN ('single','double','triple','home_run'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) AS ba,
  ROUND((COUNT(*) FILTER (WHERE p.events = 'single') + 2 * COUNT(*) FILTER (WHERE p.events = 'double') + 3 * COUNT(*) FILTER (WHERE p.events = 'triple') + 4 * COUNT(*) FILTER (WHERE p.events = 'home_run'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) AS slg
FROM pitches p
WHERE p.pitch_type NOT IN ('PO', 'IN') AND p.game_type = 'R'
GROUP BY 1, p.game_year, p.p_throws;

CREATE UNIQUE INDEX ON mv_team_platoon_stats (team, game_year, p_throws);

-- ============================================================================
-- 7. mv_pitcher_pitch_stats — per pitcher × pitch_type × game_year
--    Covers: trends arsenal, trends stuff+ changes
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS mv_pitcher_pitch_stats CASCADE;
CREATE MATERIALIZED VIEW mv_pitcher_pitch_stats AS
SELECT
  p.pitcher AS player_id,
  p.game_year,
  p.pitch_type,
  MODE() WITHIN GROUP (ORDER BY p.pitch_name) AS pitch_name,
  COUNT(*)::int AS pitches,
  ROUND(AVG(p.release_speed)::numeric, 1) AS avg_velo,
  ROUND(AVG(p.pfx_z * 12)::numeric, 1) AS avg_ivb,
  ROUND(AVG(p.pfx_x * 12)::numeric, 1) AS avg_hb,
  ROUND(AVG(p.release_spin_rate)::numeric, 0) AS avg_spin,
  ROUND(AVG(p.stuff_plus)::numeric, 1) AS avg_stuff_plus,
  COUNT(p.stuff_plus)::int AS stuff_plus_n
FROM pitches p
WHERE p.pitch_type NOT IN ('PO', 'IN') AND p.game_type = 'R'
GROUP BY p.pitcher, p.game_year, p.pitch_type;

CREATE UNIQUE INDEX ON mv_pitcher_pitch_stats (player_id, game_year, pitch_type);
CREATE INDEX ON mv_pitcher_pitch_stats (game_year);

-- ============================================================================
-- Refresh function — call nightly after pitch ingest
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Table-based refresh for pitcher_season_stats (too large for MV REFRESH timeout).
  -- Only refreshes recent seasons (current + previous) since historical data is static.
  DELETE FROM mv_pitcher_season_stats WHERE game_year >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1;
  INSERT INTO mv_pitcher_season_stats
  SELECT
    p.pitcher, p.game_year, p.p_throws,
    MODE() WITHIN GROUP (ORDER BY CASE WHEN p.inning_topbot = 'Top' THEN p.home_team ELSE p.away_team END),
    COUNT(*)::int, COUNT(DISTINCT p.game_pk)::int,
    COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint * 10000 + p.at_bat_number END)::int,
    ROUND((COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events NOT IN ('single','double','triple','home_run','walk','hit_by_pitch','catcher_interf','field_error') THEN p.game_pk::bigint * 10000 + p.at_bat_number END) + COUNT(DISTINCT CASE WHEN p.events LIKE '%double_play%' THEN p.game_pk::bigint * 10000 + p.at_bat_number END) + 2 * COUNT(DISTINCT CASE WHEN p.events = 'triple_play' THEN p.game_pk::bigint * 10000 + p.at_bat_number END))::numeric / 3.0, 1),
    ROUND(AVG(p.release_speed)::numeric,1), ROUND(MAX(p.release_speed)::numeric,1), ROUND(AVG(p.release_spin_rate)::numeric,0), ROUND(AVG(p.release_extension)::numeric,2),
    ROUND(AVG(p.pfx_x*12)::numeric,1), ROUND(AVG(p.pfx_z*12)::numeric,1), ROUND(AVG(p.arm_angle)::numeric,1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.events LIKE '%strikeout%')/NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint*10000+p.at_bat_number END),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.events='walk')/NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN p.game_pk::bigint*10000+p.at_bat_number END),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.description LIKE '%swinging_strike%' OR p.description='missed_bunt')/NULLIF(COUNT(*) FILTER(WHERE p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description='hit_into_play' OR p.description='foul_tip' OR p.description='missed_bunt'),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.description LIKE '%swinging_strike%' OR p.description='called_strike')/NULLIF(COUNT(*),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.description LIKE '%swinging_strike%')/NULLIF(COUNT(*),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.zone BETWEEN 1 AND 9)/NULLIF(COUNT(*) FILTER(WHERE p.zone IS NOT NULL),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.zone>9 AND (p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description='hit_into_play' OR p.description='missed_bunt'))/NULLIF(COUNT(*) FILTER(WHERE p.zone>9),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip'))/NULLIF(COUNT(*) FILTER(WHERE p.description LIKE '%swinging_strike%' OR p.description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip','missed_bunt')),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.zone BETWEEN 1 AND 9 AND (p.description LIKE '%swinging_strike%' OR p.description LIKE '%foul%' OR p.description='hit_into_play' OR p.description='missed_bunt'))/NULLIF(COUNT(*) FILTER(WHERE p.zone BETWEEN 1 AND 9),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.zone>9 AND p.description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip'))/NULLIF(COUNT(*) FILTER(WHERE p.zone>9 AND (p.description LIKE '%swinging_strike%' OR p.description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip','missed_bunt'))),0),1),
    ROUND(COUNT(*) FILTER(WHERE p.events IN ('single','double','triple','home_run'))::numeric/NULLIF(COUNT(*) FILTER(WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')),0),3),
    ROUND((COUNT(*) FILTER(WHERE p.events='single')+2*COUNT(*) FILTER(WHERE p.events='double')+3*COUNT(*) FILTER(WHERE p.events='triple')+4*COUNT(*) FILTER(WHERE p.events='home_run'))::numeric/NULLIF(COUNT(*) FILTER(WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')),0),3),
    ROUND(COUNT(*) FILTER(WHERE p.events IN ('single','double','triple','home_run','walk','hit_by_pitch'))::numeric/NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events NOT IN ('sac_bunt','catcher_interf') THEN p.game_pk::bigint*10000+p.at_bat_number END),0),3),
    ROUND(AVG(p.estimated_woba_using_speedangle)::numeric,3),
    ROUND(SUM(p.estimated_ba_using_speedangle)::numeric/NULLIF(COUNT(*) FILTER(WHERE p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')),0),3),
    ROUND(AVG(p.estimated_slg_using_speedangle)::numeric,3), ROUND(AVG(p.woba_value)::numeric,3),
    ROUND(AVG(p.launch_speed)::numeric,1), ROUND(MAX(p.launch_speed)::numeric,1), ROUND(AVG(p.launch_angle)::numeric,1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.launch_speed>=95 AND p.bb_type IS NOT NULL)/NULLIF(COUNT(*) FILTER(WHERE p.bb_type IS NOT NULL),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.launch_speed_angle::text='6')/NULLIF(COUNT(*) FILTER(WHERE p.launch_speed_angle IS NOT NULL),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.bb_type='ground_ball')/NULLIF(COUNT(*) FILTER(WHERE p.bb_type IS NOT NULL),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.bb_type='fly_ball')/NULLIF(COUNT(*) FILTER(WHERE p.bb_type IS NOT NULL),0),1),
    ROUND(100.0*COUNT(*) FILTER(WHERE p.bb_type='line_drive')/NULLIF(COUNT(*) FILTER(WHERE p.bb_type IS NOT NULL),0),1),
    COUNT(*) FILTER(WHERE p.events LIKE '%strikeout%')::int, COUNT(*) FILTER(WHERE p.events='walk')::int,
    COUNT(*) FILTER(WHERE p.events='hit_by_pitch')::int, COUNT(*) FILTER(WHERE p.events='home_run')::int,
    COUNT(p.estimated_woba_using_speedangle)::int,
    ROUND(AVG(p.stuff_plus)::numeric,1), COUNT(p.stuff_plus)::int, ROUND(SUM(p.delta_run_exp)::numeric,1)
  FROM pitches p WHERE p.pitch_type NOT IN ('PO','IN') AND p.game_type='R'
    AND p.game_year >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
  GROUP BY p.pitcher, p.game_year, p.p_throws;

  -- MV-based refreshes (CONCURRENTLY requires populated MV + unique index)
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_batter_season_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_team_pitching_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_team_batting_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_team_bullpen_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_team_platoon_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_pitcher_pitch_stats;
END;
$$;
