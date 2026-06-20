-- Retrosheet historical database — v1 schema.
-- Spec: retrosheet.planning.md
--
-- Coverage:
--   retro_events  — play-by-play (1914+ complete, partial pre-1914)
--   retro_games   — game-level (1871+)
--   retro_rosters — per team per season
--   retro_people  — Chadwick Register + Retrosheet biofile
--   retro_parks   — Retrosheet park database + MLBAM venue crosswalk
--   retro_id_map  — materialized view: retro_id ↔ mlbam_id ↔ bbref_id ↔ fg_id
--   retro_id_map_conflicts — multi-mapping ambiguities flagged at ingest
--   retro_ingest_runs — bookkeeping
--
-- RLS: authenticated read, service-role write. Matches work_/broadcast_/compete_ convention.
-- Ingest writes via SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. retro_people
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.retro_people (
  retro_id        text primary key,
  mlbam_id        int,
  bbref_id        text,
  fg_id           int,
  name_first      text,
  name_last       text,
  name_given      text,
  name_suffix     text,
  birth_date      date,
  birth_city      text,
  birth_country   text,
  death_date      date,
  bats            text,
  throws          text,
  height_in       int,
  weight_lb       int,
  debut_date      date,
  final_date      date,
  source_version  text,
  updated_at      timestamptz not null default now()
);

create index if not exists retro_people_mlbam_idx on public.retro_people (mlbam_id) where mlbam_id is not null;
create index if not exists retro_people_bbref_idx on public.retro_people (bbref_id) where bbref_id is not null;
create index if not exists retro_people_name_idx  on public.retro_people (name_last, name_first);

comment on table public.retro_people is 'Chadwick Register + Retrosheet biofile. One row per person across all leagues/eras (~22K rows).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. retro_parks
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.retro_parks (
  park_id         text primary key,
  name            text,
  aka             text,
  city            text,
  state           text,
  country         text,
  first_game      date,
  last_game       date,
  league          text,
  mlbam_venue_id  int,
  notes           text
);

create index if not exists retro_parks_mlbam_venue_idx
  on public.retro_parks (mlbam_venue_id) where mlbam_venue_id is not null;

comment on table public.retro_parks is 'Retrosheet park database (~300 rows). mlbam_venue_id manually curated for ~30 active MLB parks.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. retro_games  (game logs authoritative; cwgame fills supplementary fields)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.retro_games (
  game_id           text primary key,
  game_date         date not null,
  game_number       int  not null default 0,
  day_of_week       text,
  season            int  not null,
  home_team_id      text not null,
  away_team_id      text not null,
  home_league       text,
  away_league       text,
  park_id           text,                                 -- not FK; game logs may reference parks added between Retrosheet park-DB releases
  home_score        int,
  away_score        int,
  innings           int,
  day_night         text,
  attendance        int,
  duration_min      int,
  temperature_f     int,
  wind_dir          text,
  wind_speed        int,
  field_condition   text,
  precipitation     text,
  sky               text,
  winning_pitcher   text,
  losing_pitcher    text,
  save_pitcher      text,
  home_manager      text,
  away_manager      text,
  ump_home_id       text,
  ump_1b_id         text,
  ump_2b_id         text,
  ump_3b_id         text,
  forfeit           text,
  protest           text,
  source            text not null default 'gamelog',  -- 'gamelog' or 'gamelog+cwgame'
  source_version    text,
  raw               jsonb
);

create index if not exists retro_games_date_idx       on public.retro_games (game_date);
create index if not exists retro_games_season_idx     on public.retro_games (season);
create index if not exists retro_games_home_team_idx  on public.retro_games (season, home_team_id);
create index if not exists retro_games_away_team_idx  on public.retro_games (season, away_team_id);
create index if not exists retro_games_park_idx       on public.retro_games (park_id);

comment on table public.retro_games is 'Game-level data 1871+. Game logs authoritative; cwgame supplements (e.g. umpire IDs).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. retro_rosters
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.retro_rosters (
  id              bigserial primary key,
  season          int  not null,
  team_id         text not null,
  retro_id        text not null references public.retro_people(retro_id) on delete restrict,
  last_name       text,
  first_name      text,
  bats            text,
  throws          text,
  position        text,
  constraint retro_rosters_natural_key unique (season, team_id, retro_id)
);

create index if not exists retro_rosters_season_team_idx on public.retro_rosters (season, team_id);
create index if not exists retro_rosters_retro_id_idx    on public.retro_rosters (retro_id);

comment on table public.retro_rosters is 'Per (player, team, season). Chadwick cwroster output.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. retro_events  (the big one — ~15M rows 1914+)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.retro_events (
  id                       bigserial primary key,
  game_id                  text not null references public.retro_games(game_id) on delete cascade,
  event_id                 int  not null,

  inning                   int,
  bat_team                 int,                   -- 0=away, 1=home
  outs                     int,
  balls                    int,
  strikes                  int,
  pitch_seq                text,
  away_score               int,
  home_score               int,

  batter_id                text,
  batter_hand              text,
  pitcher_id               text,
  pitcher_hand             text,
  catcher_id               text,
  first_id                 text,
  second_id                text,
  third_id                 text,
  shortstop_id             text,
  left_id                  text,
  center_id                text,
  right_id                 text,
  runner_1b_id             text,
  runner_2b_id             text,
  runner_3b_id             text,

  event_text               text,                  -- e.g. S8/L, K, HR/F89D
  leadoff_flag             boolean,
  ph_flag                  boolean,
  defensive_pos            int,
  lineup_pos               int,
  event_type               int,                   -- Chadwick coded type 0..24
  bat_event_flag           boolean,
  ab_flag                  boolean,
  hit_value                int,                   -- 0=out,1=1B,2=2B,3=3B,4=HR
  sh_flag                  boolean,
  sf_flag                  boolean,
  outs_on_play             int,
  rbi_on_play              int,
  wp_flag                  boolean,
  pb_flag                  boolean,
  batted_ball_type         text,                  -- F/G/L/P when known
  bunt_flag                boolean,
  foul_flag                boolean,
  hit_location             text,
  num_errors               int,
  batter_dest              int,
  runner_1b_dest           int,
  runner_2b_dest           int,
  runner_3b_dest           int,
  play_on_batter           text,
  play_on_runner_1b        text,
  play_on_runner_2b        text,
  play_on_runner_3b        text,
  responsible_pitcher_1b   text,
  responsible_pitcher_2b   text,
  responsible_pitcher_3b   text,

  source_version           text,
  raw                      jsonb,

  constraint retro_events_natural_key unique (game_id, event_id)
);

create index if not exists retro_events_pitcher_game_idx
  on public.retro_events (pitcher_id, game_id) where pitcher_id is not null;
create index if not exists retro_events_batter_game_idx
  on public.retro_events (batter_id, game_id) where batter_id is not null;
create index if not exists retro_events_event_type_idx
  on public.retro_events (event_type);
create index if not exists retro_events_game_inning_idx
  on public.retro_events (game_id, inning, bat_team);

comment on table public.retro_events is 'Play-by-play. ~15M rows 1914+ complete, scattered pre-1914. One row per play.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. retro_id_map  (MATERIALIZED VIEW — refreshed by ingest pipeline)
-- ─────────────────────────────────────────────────────────────────────────────
drop materialized view if exists public.retro_id_map;
create materialized view public.retro_id_map as
  select retro_id, mlbam_id, bbref_id, fg_id
  from public.retro_people
  where retro_id is not null;

-- UNIQUE index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
create unique index retro_id_map_retro_id_idx on public.retro_id_map (retro_id);
create        index retro_id_map_mlbam_idx    on public.retro_id_map (mlbam_id) where mlbam_id is not null;
create        index retro_id_map_bbref_idx    on public.retro_id_map (bbref_id) where bbref_id is not null;

comment on materialized view public.retro_id_map is 'Crosswalk view over retro_people. REFRESH MATERIALIZED VIEW CONCURRENTLY retro_id_map after each retro_people ingest.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. retro_id_map_conflicts  (ambiguity log — empty = clean)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.retro_id_map_conflicts (
  id                bigserial primary key,
  retro_id          text,
  mlbam_id          int,
  reason            text not null,                -- 'multiple_mlbam_for_retro' | 'multiple_retro_for_mlbam' | etc.
  register_version  text not null,
  detected_at       timestamptz not null default now()
);

create index if not exists retro_id_map_conflicts_retro_idx on public.retro_id_map_conflicts (retro_id);
create index if not exists retro_id_map_conflicts_mlbam_idx on public.retro_id_map_conflicts (mlbam_id);

comment on table public.retro_id_map_conflicts is 'Ambiguity log for crosswalk. Empty = clean. Populated by ingest, manually resolved.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. retro_ingest_runs  (bookkeeping)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.retro_ingest_runs (
  id              bigserial primary key,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  season          int,
  table_loaded    text not null,
  source_version  text,
  rows_inserted   int  not null default 0,
  rows_updated    int  not null default 0,
  status          text not null default 'running',  -- running|success|failed|partial
  error           text,
  notes           jsonb
);

create index if not exists retro_ingest_runs_started_idx on public.retro_ingest_runs (started_at desc);
create index if not exists retro_ingest_runs_status_idx  on public.retro_ingest_runs (status);

comment on table public.retro_ingest_runs is 'One row per ingest invocation. Bookkeeping + audit trail.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. retro_starter_outings  (derived from retro_events by scripts/build-starter-outings.ts)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.retro_starter_outings (
  game_id           text not null,   -- references retro_games(game_id); not FK (table is rebuilt wholesale from retro_events)
  pitcher_id        text not null,
  first_hit_inning  int,
  last_inning       int,
  hits_allowed      int,
  primary key (game_id, pitcher_id)
);

create index if not exists retro_starter_outings_pitcher_idx   on public.retro_starter_outings (pitcher_id);
create index if not exists retro_starter_outings_threshold_idx on public.retro_starter_outings (last_inning, first_hit_inning);

comment on table public.retro_starter_outings is 'Derived from retro_events by scripts/build-starter-outings.ts. One row per (game, starting pitcher): first hit inning, last inning, hits allowed — backs no-hitter / hit-tracking queries.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — authenticated read, service-role write
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.retro_people            enable row level security;
alter table public.retro_parks             enable row level security;
alter table public.retro_games             enable row level security;
alter table public.retro_rosters           enable row level security;
alter table public.retro_events            enable row level security;
alter table public.retro_id_map_conflicts  enable row level security;
alter table public.retro_ingest_runs       enable row level security;
alter table public.retro_starter_outings   enable row level security;
-- Materialized views inherit RLS from underlying tables via the security_invoker setting;
-- in practice we expose retro_id_map only through service-role / authenticated reads.

-- SELECT policies (authenticated only — matches existing convention)
drop policy if exists retro_people_select            on public.retro_people;
drop policy if exists retro_parks_select             on public.retro_parks;
drop policy if exists retro_games_select             on public.retro_games;
drop policy if exists retro_rosters_select           on public.retro_rosters;
drop policy if exists retro_events_select            on public.retro_events;
drop policy if exists retro_id_map_conflicts_select  on public.retro_id_map_conflicts;
drop policy if exists retro_ingest_runs_select       on public.retro_ingest_runs;
drop policy if exists retro_starter_outings_select   on public.retro_starter_outings;

create policy retro_people_select           on public.retro_people            for select to authenticated using (true);
create policy retro_parks_select            on public.retro_parks             for select to authenticated using (true);
create policy retro_games_select            on public.retro_games             for select to authenticated using (true);
create policy retro_rosters_select          on public.retro_rosters           for select to authenticated using (true);
create policy retro_events_select           on public.retro_events            for select to authenticated using (true);
create policy retro_id_map_conflicts_select on public.retro_id_map_conflicts  for select to authenticated using (true);
create policy retro_ingest_runs_select      on public.retro_ingest_runs       for select to authenticated using (true);
create policy retro_starter_outings_select  on public.retro_starter_outings   for select to authenticated using (true);

-- No INSERT/UPDATE/DELETE policies → only service_role (which bypasses RLS) can write.

-- Grant SELECT on materialized view to authenticated
grant select on public.retro_id_map to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- system_metadata marker for attribution requirement
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='system_metadata') then
    insert into public.system_metadata (key, value, updated_at)
    values ('retrosheet_attribution', to_jsonb('Retrosheet attribution notice required on any UI/API surface displaying retro_* data. See retrosheet.org/notice.txt'::text), now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end$$;
