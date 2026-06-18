-- ─────────────────────────────────────────────────────────────────────────────
-- bat_tracking_swing_miss
-- Daily snapshots of Savant's "Swing Timing & Miss Distance" bat-tracking
-- leaderboard (https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-timing-miss-distance).
--
-- The leaderboard is season-cumulative with NO date slicing, so we snapshot it
-- every night (keyed by snapshot_date) to build a time-series. Source CSV:
--   ?type=pitcher|batter&season[]=YYYY[&split[]=api_pitch_type_group03]&csv=true
--
-- Granularity: one row per snapshot_date × player_type × player × season × pitch_type.
--   pitch_type = 'ALL'  -> overall aggregate row (no split)
--   pitch_type = FF/SI/SL/CH/FC/... -> per-pitch-type row (split=api_pitch_type_group03)
--
-- RLS: authenticated read, service-role write. Matches retro_/work_/compete_ convention.
-- Ingest writes via SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.bat_tracking_swing_miss (
  snapshot_date        date    not null,
  player_type          text    not null check (player_type in ('pitcher','batter')),
  player_id            int     not null,
  season               int     not null,
  pitch_type           text    not null default 'ALL',  -- 'ALL' = overall; else FF/SI/SL/CH/FC/...
  player_name          text,
  bat_side             text,                             -- bat_side_formatted (R/L/S)
  team_name            text,

  -- Headline
  miss_distance        double precision,   -- avg miss distance (inches)
  n_swings             int,
  whiff_rate           double precision,
  competitive_percent  double precision,

  -- Contact quality
  flawed_percent       double precision,
  perfect_percent      double precision,

  -- X axis: tied-up / flail (horizontal bat-ball offset, bat POV)
  tied_up_percent      double precision,
  avg_x_tied_up        double precision,
  centered_percent     double precision,
  flailed_percent      double precision,
  avg_x_flail          double precision,

  -- Y axis: early / late (swing timing, ms)
  early_percent        double precision,
  avg_y_early          double precision,
  on_time_percent      double precision,
  late_percent         double precision,
  avg_y_late           double precision,

  -- Z axis: over / under (vertical bat-ball offset, bat POV)
  over_percent         double precision,
  avg_z_over           double precision,
  lined_up_percent     double precision,
  under_percent        double precision,
  avg_z_under          double precision,

  ingested_at          timestamptz not null default now(),

  primary key (snapshot_date, player_type, player_id, season, pitch_type)
);

-- "Most recent snapshot per player" lookups
create index if not exists bat_tracking_swing_miss_latest_idx
  on public.bat_tracking_swing_miss (player_type, player_id, season, pitch_type, snapshot_date desc);

-- Filter by season + type for a given snapshot
create index if not exists bat_tracking_swing_miss_season_idx
  on public.bat_tracking_swing_miss (season, player_type, snapshot_date desc);

comment on table public.bat_tracking_swing_miss is
  'Daily snapshots of Savant swing-timing/miss-distance bat-tracking leaderboard. Season-cumulative values captured per day for time-series. pitch_type=ALL is the overall row; others are per-pitch-type (split=api_pitch_type_group03).';

-- Most-recent snapshot per player/season/pitch_type
create or replace view public.bat_tracking_swing_miss_latest as
select distinct on (player_type, player_id, season, pitch_type) *
from public.bat_tracking_swing_miss
order by player_type, player_id, season, pitch_type, snapshot_date desc;

alter table public.bat_tracking_swing_miss enable row level security;

drop policy if exists bat_tracking_swing_miss_select on public.bat_tracking_swing_miss;
create policy bat_tracking_swing_miss_select
  on public.bat_tracking_swing_miss for select to authenticated using (true);
