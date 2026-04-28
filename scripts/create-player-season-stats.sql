-- Player season stats from MLB Stats API (fields not derivable from pitches table)
-- Populated by /api/cron/player-stats nightly and backfill-player-stats.ts

CREATE TABLE IF NOT EXISTS player_season_stats (
  player_id       INT NOT NULL,
  season          INT NOT NULL,
  stat_group      TEXT NOT NULL,       -- 'pitching' | 'hitting'
  era             NUMERIC,
  wins            INT,
  losses          INT,
  saves           INT,
  holds           INT,
  innings_pitched NUMERIC,
  earned_runs     INT,
  runs            INT,
  rbi             INT,
  stolen_bases    INT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (player_id, season, stat_group)
);

CREATE INDEX IF NOT EXISTS idx_pss_season ON player_season_stats (season, stat_group);
