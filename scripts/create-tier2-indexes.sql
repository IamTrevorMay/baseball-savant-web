-- Tier 2: Composite & Partial Indexes for the pitches table
-- Run each CREATE INDEX CONCURRENTLY separately (cannot run inside a transaction).
-- Total table: 8.65M rows, 4.9GB data, 4.4GB indexes (30 existing).
--
-- These indexes target the slowest remaining API routes that still scan
-- the full pitches table when materialized views can't be used (date
-- filters, non-regular-season, etc.).

-- ============================================================
-- 1. Batter page loads: /api/player-data?col=batter&year=2026
--    Existing (batter, game_date DESC) lacks game_year leading column.
--    This lets PostgreSQL seek directly to batter+year rows.
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pitches_batter_year_date
  ON pitches (batter, game_year, game_date DESC);

-- ============================================================
-- 2. Season aggregation (pitcher side):
--    /api/compute-triton, /api/compute-deception, /api/scene-stats
--    Queries: WHERE game_year=X AND game_type='R' AND pitcher IN (...)
--    or DISTINCT pitcher WHERE game_year=X AND game_type='R'.
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pitches_year_type_pitcher
  ON pitches (game_year, game_type, pitcher);

-- ============================================================
-- 3. Season aggregation (batter side):
--    /api/scene-stats teamStats batter, /api/team-tendencies hitting fallback
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pitches_year_type_batter
  ON pitches (game_year, game_type, batter);

-- ============================================================
-- 4. Sequencing self-join: /api/sequencing
--    JOIN condition: b.pitcher=X AND b.game_year=Y
--      AND a.game_pk=b.game_pk AND a.at_bat_number=b.at_bat_number
--      AND b.pitch_number = a.pitch_number + 1
--    The unique index (game_pk, at_bat_number, pitch_number) handles
--    the join, but this lets the initial filter narrow by pitcher+year
--    first, then seek within the game.
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pitches_seq
  ON pitches (pitcher, game_year, game_pk, at_bat_number, pitch_number);

-- ============================================================
-- 5. Movement percentiles: /api/movement-percentiles
--    Compound OR: (pitch_type='FF' AND release_speed BETWEEN 94 AND 96)
--                 OR (pitch_type='SI' AND release_speed BETWEEN 92 AND 94) ...
--    Filtered by game_year + p_throws. This index lets each OR branch
--    do a tight range scan.
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pitches_movement
  ON pitches (game_year, p_throws, pitch_type, release_speed);

-- ============================================================
-- 6-7. Partial indexes for batted ball queries.
--    Only ~30% of pitches result in a batted ball (bb_type IS NOT NULL).
--    Routes: /api/report (batted ball metrics), /api/scene-stats (xBA),
--    damage model, DamageZoneMap, HitterZoneMap.
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pitches_year_pitcher_bb
  ON pitches (game_year, pitcher)
  WHERE bb_type IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pitches_year_batter_bb
  ON pitches (game_year, batter)
  WHERE bb_type IS NOT NULL;


-- ============================================================
-- Drop redundant single-column indexes.
-- These are fully covered by composite indexes or have near-zero
-- selectivity (50/50 or 3-value columns) making them useless as
-- standalone B-tree leading columns.
-- ============================================================

-- Covered by (batter, game_date DESC) and new (batter, game_year, game_date DESC)
DROP INDEX CONCURRENTLY IF EXISTS idx_pitches_batter;

-- Covered by (away_team, game_date DESC)
DROP INDEX CONCURRENTLY IF EXISTS idx_pitches_away_team;

-- Covered by (home_team, game_date DESC)
DROP INDEX CONCURRENTLY IF EXISTS idx_pitches_home_team;

-- 50/50 split (L/R), never useful as sole filter
DROP INDEX CONCURRENTLY IF EXISTS idx_pitches_p_throws;

-- 50/50 split (L/R), never useful as sole filter
DROP INDEX CONCURRENTLY IF EXISTS idx_pitches_stand;

-- 3 values (B/S/X), near-zero selectivity
DROP INDEX CONCURRENTLY IF EXISTS idx_pitches_type;

-- Rarely a primary filter, low selectivity (1-9+)
DROP INDEX CONCURRENTLY IF EXISTS idx_pitches_inning;

-- Replaced by partial indexes above; 4 values + NULLs, low selectivity
DROP INDEX CONCURRENTLY IF EXISTS idx_pitches_bb_type;
