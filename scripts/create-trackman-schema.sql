-- Data app — TrackMan integration v1
-- Tables live in the `public` schema with a `trackman_` prefix (matches the
-- compete_* convention used elsewhere in Tools), so the standard PostgREST
-- exposure works without any Dashboard config.
--
-- Access model:
--   - All tables are admin/owner read-only via `public.is_compete_admin()`.
--   - Webhook + cron routes write via service-role client (bypasses RLS).
--   - No anon/authenticated INSERT path is exposed.

-- ── Sessions ──
create table if not exists public.trackman_sessions (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,                       -- 'vision_live' | 'webhook' | 'ftp_reconcile' | 'ftp_backfill'
  session_date    date,
  tm_session_id   text,
  session_name    text,
  raw_file_path   text,                                -- storage object key, if applicable
  pitch_count     int  not null default 0,
  received_at     timestamptz not null default now(),
  raw_meta        jsonb
);

create index if not exists trackman_sessions_session_date_idx  on public.trackman_sessions (session_date);
create index if not exists trackman_sessions_tm_session_id_idx on public.trackman_sessions (tm_session_id);
create index if not exists trackman_sessions_source_idx        on public.trackman_sessions (source);

-- ── Pitches (typed, mirrors TrackMan 73-column export) ──
create table if not exists public.trackman_pitches (
  id                              uuid primary key default gen_random_uuid(),
  session_id                      uuid references public.trackman_sessions(id) on delete cascade,

  -- Provenance
  source                          text not null,        -- 'vision_live' | 'webhook' | 'ftp_reconcile' | 'ftp_backfill'
  raw_file_path                   text,                 -- storage object key, when ingested from a file

  -- TrackMan natural key — UNIQUE makes webhook + FTP + sniff paths idempotent
  pitch_uid                       text unique,

  -- Pitch context
  pitch_no                        int,
  pitch_date                      date,
  pitch_time                      text,
  pitcher_name                    text,
  tm_pitcher_id                   text,
  pitcher_throws                  text,
  pitcher_team                    text,
  pitcher_set                     text,
  pitch_call                      text,
  balls                           int,
  strikes                         int,
  tagged_pitch_type               text,
  pitch_session                   text,
  flag                            text,

  -- Release / velocity
  rel_speed                       double precision,
  vert_rel_angle                  double precision,
  horz_rel_angle                  double precision,
  spin_rate                       double precision,
  spin_axis                       double precision,
  tilt                            text,
  rel_height                      double precision,
  rel_side                        double precision,
  extension                       double precision,

  -- Movement
  vert_break                      double precision,
  induced_vert_break              double precision,
  horz_break                      double precision,

  -- Plate / approach
  plate_loc_height                double precision,
  plate_loc_side                  double precision,
  zone_speed                      double precision,
  vert_appr_angle                 double precision,
  horz_appr_angle                 double precision,
  zone_time                       double precision,
  pfxx                            double precision,
  pfxz                            double precision,

  -- Trajectory (initial conditions)
  x0  double precision, y0  double precision, z0  double precision,
  vx0 double precision, vy0 double precision, vz0 double precision,
  ax0 double precision, ay0 double precision, az0 double precision,

  -- Identifiers / metadata
  play_id                         text,
  calibration_id                  text,
  eff_velocity                    double precision,
  practice_type                   text,
  device                          text,
  direction                       text,

  -- Batter / batted ball
  tm_batter_id                    text,
  batter_name                     text,
  hit_spin_rate                   double precision,
  hit_type                        text,
  exit_speed                      double precision,
  batter_side                     text,
  angle                           double precision,
  position_at_110_x               double precision,
  position_at_110_y               double precision,
  position_at_110_z               double precision,
  distance                        double precision,
  last_tracked_distance           double precision,
  hang_time                       double precision,
  bearing                         double precision,
  contact_position_x              double precision,
  contact_position_y              double precision,
  contact_position_z              double precision,

  -- 3D spin axis
  spin_axis_3d_transverse_angle   double precision,
  spin_axis_3d_longitudinal_angle double precision,
  spin_axis_3d_active_spin_rate   double precision,
  spin_axis_3d_spin_efficiency    double precision,
  spin_axis_3d_tilt               text,                 -- clock notation (e.g. "1:15"); B1 ships it as a string

  -- Session correlation
  tm_session_id                   text,

  -- Forward-compat: original row for any column we haven't promoted
  raw                             jsonb,

  inserted_at                     timestamptz not null default now()
);

create index if not exists trackman_pitches_session_id_idx        on public.trackman_pitches (session_id);
create index if not exists trackman_pitches_tm_pitcher_id_idx     on public.trackman_pitches (tm_pitcher_id);
create index if not exists trackman_pitches_pitch_date_idx        on public.trackman_pitches (pitch_date);
create index if not exists trackman_pitches_tagged_pitch_type_idx on public.trackman_pitches (tagged_pitch_type);
create index if not exists trackman_pitches_tm_session_id_idx     on public.trackman_pitches (tm_session_id);
create index if not exists trackman_pitches_source_idx            on public.trackman_pitches (source);

-- ── Raw webhook events (landing zone until payload contract is mapped) ──
create table if not exists public.trackman_raw_events (
  id            uuid primary key default gen_random_uuid(),
  received_at   timestamptz not null default now(),
  headers       jsonb,
  body          jsonb,
  body_text     text,                          -- raw body for HMAC verification / non-JSON payloads
  remote_addr   text,
  processed_at  timestamptz,
  error_text    text
);

create index if not exists trackman_raw_events_received_at_idx on public.trackman_raw_events (received_at desc);
create index if not exists trackman_raw_events_processed_idx   on public.trackman_raw_events (processed_at)
  where processed_at is null;

-- ── Ingest log (one row per run, both sniff and webhook/FTP) ──
create table if not exists public.trackman_ingest_log (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null,                    -- 'vision_live' | 'webhook' | 'ftp_reconcile' | 'ftp_backfill'
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  files_seen         int  not null default 0,
  files_downloaded   int  not null default 0,
  pitches_inserted   int  not null default 0,
  pitches_skipped    int  not null default 0,
  error_text         text,
  meta               jsonb
);

create index if not exists trackman_ingest_log_started_at_idx on public.trackman_ingest_log (started_at desc);
create index if not exists trackman_ingest_log_source_idx     on public.trackman_ingest_log (source);

-- ── RLS: admin/owner read; service role bypass for writes ──
alter table public.trackman_sessions    enable row level security;
alter table public.trackman_pitches     enable row level security;
alter table public.trackman_raw_events  enable row level security;
alter table public.trackman_ingest_log  enable row level security;

drop policy if exists trackman_sessions_admin_select   on public.trackman_sessions;
drop policy if exists trackman_pitches_admin_select    on public.trackman_pitches;
drop policy if exists trackman_raw_events_admin_select on public.trackman_raw_events;
drop policy if exists trackman_ingest_log_admin_select on public.trackman_ingest_log;

create policy trackman_sessions_admin_select   on public.trackman_sessions
  for select using (public.is_compete_admin());
create policy trackman_pitches_admin_select    on public.trackman_pitches
  for select using (public.is_compete_admin());
create policy trackman_raw_events_admin_select on public.trackman_raw_events
  for select using (public.is_compete_admin());
create policy trackman_ingest_log_admin_select on public.trackman_ingest_log
  for select using (public.is_compete_admin());

-- ── Storage bucket: trackman-raw (private, admin-only) ──
insert into storage.buckets (id, name, public)
values ('trackman-raw', 'trackman-raw', false)
on conflict (id) do nothing;

drop policy if exists trackman_raw_admin_select on storage.objects;
drop policy if exists trackman_raw_admin_insert on storage.objects;
drop policy if exists trackman_raw_admin_delete on storage.objects;

create policy trackman_raw_admin_select on storage.objects
  for select using (bucket_id = 'trackman-raw' and public.is_compete_admin());
create policy trackman_raw_admin_insert on storage.objects
  for insert with check (bucket_id = 'trackman-raw' and public.is_compete_admin());
create policy trackman_raw_admin_delete on storage.objects
  for delete using (bucket_id = 'trackman-raw' and public.is_compete_admin());
