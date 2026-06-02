-- league_percentiles: empirical percentile breakpoints per metric, scoped to
-- qualified players. Each row stores 99 values (p1..p99) in ascending order.
-- Populated by refresh_league_percentiles(p_season int). Current season refreshes
-- nightly after pitch ingest; historical seasons are written once and frozen.
--
-- Qualification rules match league_averages (see create-league-averages.sql).
-- Replaces the z-score → normal CDF approximation with exact rank-based
-- percentiles computed from the actual qualified-player pool.

CREATE TABLE IF NOT EXISTS league_percentiles (
  season       integer     NOT NULL,
  level        text        NOT NULL CHECK (level IN ('MLB', 'MiLB')),
  role         text        NOT NULL CHECK (role IN ('hitter', 'SP', 'RP')),
  metric       text        NOT NULL,
  breakpoints  numeric[99] NOT NULL,  -- values at p1..p99, always ascending
  higher_better boolean    NOT NULL,
  n_qualified  integer,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, level, role, metric)
);

CREATE INDEX IF NOT EXISTS league_percentiles_lookup_idx
  ON league_percentiles (season, level, role);

COMMENT ON TABLE  league_percentiles              IS 'Empirical percentile breakpoints per metric, scoped to qualified players per season/level/role.';
COMMENT ON COLUMN league_percentiles.breakpoints  IS 'Array of 99 values at p1..p99 in ascending order. Use nearest-rank to map a raw value to its percentile.';
COMMENT ON COLUMN league_percentiles.higher_better IS 'Whether a higher raw value = better performance. Consumers invert percentile for lower-is-better metrics.';
COMMENT ON COLUMN league_percentiles.n_qualified  IS 'Number of players meeting the qualification floor.';
