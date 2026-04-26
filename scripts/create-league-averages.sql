-- league_averages: per-metric league benchmarks scoped to qualified players.
-- Populated by refresh_league_averages(p_season int). Current season refreshes
-- nightly after pitch ingest; historical seasons are written once and frozen.
--
-- Qualification rules (applied per season/level/role):
--   hitter : AB >= max(0.20 * AB_leader, 25)
--   SP     : IP >= max(0.20 * SP_IP_leader, 5)
--   RP     : IP >= max(0.20 * RP_IP_leader, 5)
-- SP/RP classification: first-inning game share > 0.5 -> SP else RP
-- (matches convention in app/api/game/puzzle/route.ts).
--
-- Plus-stats (any metric ending in `_plus`) are excluded — they already
-- normalize to a league-average midpoint of 100.

CREATE TABLE IF NOT EXISTS league_averages (
  season       integer     NOT NULL,
  level        text        NOT NULL CHECK (level IN ('MLB', 'MiLB')),
  role         text        NOT NULL CHECK (role IN ('hitter', 'SP', 'RP')),
  metric       text        NOT NULL,
  value        numeric,
  stddev       numeric,
  n_qualified  integer,
  leader_value numeric,
  qual_floor   numeric,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season, level, role, metric)
);

-- Idempotent migration for environments that pre-date the stddev column.
ALTER TABLE league_averages ADD COLUMN IF NOT EXISTS stddev numeric;

CREATE INDEX IF NOT EXISTS league_averages_metric_idx
  ON league_averages (metric, season, level, role);

COMMENT ON TABLE  league_averages              IS 'League-average benchmarks per metric, scoped to qualified players per season/level/role.';
COMMENT ON COLUMN league_averages.value        IS 'Mean of the metric across qualified players.';
COMMENT ON COLUMN league_averages.stddev       IS 'Sample stddev across qualified players (consumers use mean ± 3σ for color-scale extremes).';
COMMENT ON COLUMN league_averages.n_qualified  IS 'Number of players meeting the qualification floor.';
COMMENT ON COLUMN league_averages.leader_value IS 'Counting-stat leader (AB hitters, IP SP/RP) used to derive qual_floor.';
COMMENT ON COLUMN league_averages.qual_floor   IS 'Cutoff applied: max(0.20 * leader_value, hard_floor). Hard floor = 25 AB / 5 IP.';
