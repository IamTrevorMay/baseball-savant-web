CREATE TABLE IF NOT EXISTS cron_runs (
  id BIGSERIAL PRIMARY KEY,
  job TEXT NOT NULL,                 -- e.g. 'pitches' | 'milb-pitches' | 'roster' | 'player-stats' | 'wbc'
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,              -- 'running' | 'success' | 'error'
  duration_ms INT,
  counts JSONB,                      -- arbitrary per-job counters: { fetched, inserted, errors, ... }
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cron_runs_job_started_idx ON cron_runs (job, started_at DESC);
