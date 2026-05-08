-- Audit table for the daily data-integrity cron (/api/cron/integrity).
-- Each row is one check result within a single cron run.

CREATE TABLE IF NOT EXISTS integrity_checks (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT,                              -- links to cron_runs.id for this run
  check_name TEXT NOT NULL,                    -- e.g. 'unknown_players', 'orphaned_pitchers'
  status TEXT NOT NULL,                        -- 'pass' | 'warn' | 'fail' | 'remediated'
  found INT NOT NULL DEFAULT 0,               -- count of issues found
  remediated INT NOT NULL DEFAULT 0,          -- count auto-fixed
  details JSONB,                              -- specifics: player IDs, pitch names, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integrity_checks_run_idx ON integrity_checks (run_id);
CREATE INDEX IF NOT EXISTS integrity_checks_name_idx ON integrity_checks (check_name, created_at DESC);
