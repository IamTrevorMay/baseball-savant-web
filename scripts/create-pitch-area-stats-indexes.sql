-- Indexes powering /api/pitch-area-stats (Triton Vision MLB Area Stats popout).
--
-- The route filters `pitches` by (game_year, pitch_name) + plate location
-- bounding box and an in-radius predicate. Without these indexes the planner
-- falls back to a single-column scan of `idx_pitches_game_year` and runs a
-- sequential post-filter over 400K+ rows per query (~3s on the prod DB).
--
-- After these indexes:
--   - warm queries  ~5 ms
--   - cold queries  ~600 ms (bounded by heap I/O for matched rows only)
--
-- Both built with CREATE INDEX CONCURRENTLY in prod on 2026-06-02 (table size
-- 7.7M rows). Re-running this script is safe — both use IF NOT EXISTS.
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction. If you run
-- this through `supabase db push` or psql with implicit txn wrapping, strip
-- CONCURRENTLY first (briefly locks writes — fine off-hours).

-- Composite index for queries that filter by year + pitch_name + handedness
-- but do NOT bound plate location (e.g. global splits, leaderboard fragments).
create index concurrently if not exists idx_pitches_year_name_throws_stand
  on public.pitches (game_year, pitch_name, p_throws, stand);

-- Covering index for the area-stats radial query. plate_x / plate_z are in the
-- key portion so the bounding-box predicate can be evaluated index-only, and
-- p_throws / stand ride along as INCLUDE columns so the handedness filter
-- doesn't force a heap fetch for non-matching rows.
create index concurrently if not exists idx_pitches_year_name_loc
  on public.pitches (game_year, pitch_name, plate_x, plate_z)
  include (p_throws, stand);
