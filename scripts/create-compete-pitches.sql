-- Compete Performance — persistent storage for TrackMan pitch data.
-- Two tables:
--   compete_pitch_sessions  — one row per upload (or future API sync)
--   compete_pitches         — one row per pitch, full 73-column TrackMan schema
--
-- RLS: admins/owners see everything; regular users see rows where uploaded_by = auth.uid().
-- Writes on the app go through the service-role admin client, which bypasses RLS;
-- API routes enforce auth themselves. RLS is defense-in-depth for direct anon access.

-- ── Helper: is current user an admin/owner? ──
create or replace function public.is_compete_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','owner')
  );
$$;

grant execute on function public.is_compete_admin() to authenticated, anon;

-- ── Sessions table ──
create table if not exists public.compete_pitch_sessions (
  id           uuid primary key default gen_random_uuid(),
  uploaded_by  uuid not null references public.profiles(id) on delete cascade,
  uploaded_at  timestamptz not null default now(),
  source       text not null default 'csv_upload', -- csv_upload | trackman_api | ...
  file_name    text,
  session_date date,
  tm_session_id text,
  pitch_count  int  not null default 0,
  raw_meta     jsonb
);

create index if not exists compete_pitch_sessions_uploaded_by_idx
  on public.compete_pitch_sessions (uploaded_by);
create index if not exists compete_pitch_sessions_session_date_idx
  on public.compete_pitch_sessions (session_date);
create index if not exists compete_pitch_sessions_tm_session_id_idx
  on public.compete_pitch_sessions (tm_session_id);

-- ── Pitches table (mirrors full 73-column TrackMan export) ──
create table if not exists public.compete_pitches (
  id                              uuid primary key default gen_random_uuid(),
  session_id                      uuid not null references public.compete_pitch_sessions(id) on delete cascade,
  uploaded_by                     uuid not null references public.profiles(id) on delete cascade,
  athlete_profile_id              uuid references public.athlete_profiles(id) on delete set null,

  -- TrackMan natural key — enables idempotent re-uploads
  tm_pitch_uid                    text unique,

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
  x0 double precision, y0 double precision, z0 double precision,
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
  spin_axis_3d_tilt               double precision,

  -- Session correlation
  tm_session_id                   text,

  -- Forward-compat: original CSV row for any columns we haven't promoted
  raw                             jsonb,

  created_at                      timestamptz not null default now()
);

create index if not exists compete_pitches_session_id_idx          on public.compete_pitches (session_id);
create index if not exists compete_pitches_uploaded_by_idx         on public.compete_pitches (uploaded_by);
create index if not exists compete_pitches_athlete_profile_id_idx  on public.compete_pitches (athlete_profile_id);
create index if not exists compete_pitches_tm_pitcher_id_idx       on public.compete_pitches (tm_pitcher_id);
create index if not exists compete_pitches_pitch_date_idx          on public.compete_pitches (pitch_date);
create index if not exists compete_pitches_tagged_pitch_type_idx   on public.compete_pitches (tagged_pitch_type);

-- ── RLS ──
alter table public.compete_pitch_sessions enable row level security;
alter table public.compete_pitches        enable row level security;

drop policy if exists sessions_select_own_or_admin on public.compete_pitch_sessions;
drop policy if exists sessions_insert_self         on public.compete_pitch_sessions;
drop policy if exists sessions_delete_own_or_admin on public.compete_pitch_sessions;
drop policy if exists pitches_select_own_or_admin  on public.compete_pitches;
drop policy if exists pitches_insert_self          on public.compete_pitches;
drop policy if exists pitches_delete_own_or_admin  on public.compete_pitches;

create policy sessions_select_own_or_admin on public.compete_pitch_sessions
  for select using (uploaded_by = auth.uid() or public.is_compete_admin());
create policy sessions_insert_self on public.compete_pitch_sessions
  for insert with check (uploaded_by = auth.uid());
create policy sessions_delete_own_or_admin on public.compete_pitch_sessions
  for delete using (uploaded_by = auth.uid() or public.is_compete_admin());

create policy pitches_select_own_or_admin on public.compete_pitches
  for select using (uploaded_by = auth.uid() or public.is_compete_admin());
create policy pitches_insert_self on public.compete_pitches
  for insert with check (uploaded_by = auth.uid());
create policy pitches_delete_own_or_admin on public.compete_pitches
  for delete using (uploaded_by = auth.uid() or public.is_compete_admin());
