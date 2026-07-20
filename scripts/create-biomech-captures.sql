-- MEchanics — biomechanics capture pipeline storage.
-- Mirrors the compete_pitches session/child pattern:
--   biomech_captures  — one row per Captury capture session
--   biomech_throws    — one row per detected throw (events + extracted metrics)
--   assessment_norms  — percentile reference (seeded from OpenBiomechanics)
--
-- Kinematics-only v1: kinetics/torque is a placeholder until force plates land.
-- Provenance: capture_system tags every row; kinematics and kinetics are never
-- blended into one leaderboard (same discipline as league_averages provenance).
--
-- RLS: admins/owners see everything; athletes see their own captures/throws via
-- athlete_profiles.profile_id = auth.uid(). Writes go through the service-role
-- admin client (bypasses RLS); API routes enforce auth. RLS is defense-in-depth.

-- ── Sessions ──
create table if not exists public.biomech_captures (
  id                 uuid primary key default gen_random_uuid(),
  athlete_profile_id uuid not null references public.athlete_profiles(id) on delete cascade,
  uploaded_by        uuid references public.profiles(id) on delete set null,
  capture_date       date not null,
  capture_system     text not null default 'captury_optitrack',
  frame_rate         int  not null default 240,
  throw_count        int  not null default 0,
  velo_context       text,                 -- 'max_effort' | 'submax' | mph band
  level              text not null default 'pro',  -- youth | hs | college | pro (norm bucket)
  raw_file_path      text,                 -- storage key in biomech-captures bucket
  status             text not null default 'processing', -- processing | ready | failed
  notes              text,
  raw_meta           jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists biomech_captures_athlete_idx on public.biomech_captures (athlete_profile_id);
create index if not exists biomech_captures_date_idx    on public.biomech_captures (capture_date);

-- ── Throws (child) ──
create table if not exists public.biomech_throws (
  id                 uuid primary key default gen_random_uuid(),
  capture_id         uuid not null references public.biomech_captures(id) on delete cascade,
  athlete_profile_id uuid not null references public.athlete_profiles(id) on delete cascade,
  throw_no           int  not null,
  -- canonical event frames (foot contact → release holds the peak loads)
  frame_foot_contact int,
  frame_mer          int,
  frame_release      int,
  event_confidence   double precision,
  -- extracted six-bucket metrics
  metrics            jsonb,
  directional_keys   jsonb,               -- metrics flagged directional-not-absolute
  qc_flags           jsonb,
  rel_speed_mph      double precision,    -- joined from TrackMan if paired
  excluded           boolean not null default false,  -- dropped from session median
  created_at         timestamptz not null default now()
);

create index if not exists biomech_throws_capture_idx on public.biomech_throws (capture_id);
create index if not exists biomech_throws_athlete_idx on public.biomech_throws (athlete_profile_id);

-- ── Norms (reference) ──
create table if not exists public.assessment_norms (
  id                  uuid primary key default gen_random_uuid(),
  metric              text not null,       -- e.g. 'lowerBody.strideLengthPct'
  label               text not null,
  level               text not null,       -- youth | hs | college | pro
  unit                text,
  pctl_10             double precision,
  pctl_25             double precision,
  pctl_50             double precision,
  pctl_75             double precision,
  pctl_90             double precision,
  higher_is_better    boolean not null default true,
  correlation_to_velo double precision not null default 0, -- drives flag ranking
  directional         boolean not null default false,      -- markerless caveat
  source              text not null default 'openbiomechanics',
  created_at          timestamptz not null default now(),
  unique (metric, level, source)
);

create index if not exists assessment_norms_lookup_idx on public.assessment_norms (metric, level);

-- ── RLS ──
alter table public.biomech_captures enable row level security;
alter table public.biomech_throws   enable row level security;
alter table public.assessment_norms enable row level security;

-- helper: does the current user own this athlete profile?
create or replace function public.owns_athlete_profile(p_athlete_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.athlete_profiles ap
    where ap.id = p_athlete_id and ap.profile_id = auth.uid()
  );
$$;
grant execute on function public.owns_athlete_profile(uuid) to authenticated, anon;

drop policy if exists biomech_captures_select on public.biomech_captures;
create policy biomech_captures_select on public.biomech_captures
  for select using (public.is_compete_admin() or public.owns_athlete_profile(athlete_profile_id));

drop policy if exists biomech_throws_select on public.biomech_throws;
create policy biomech_throws_select on public.biomech_throws
  for select using (public.is_compete_admin() or public.owns_athlete_profile(athlete_profile_id));

drop policy if exists assessment_norms_select on public.assessment_norms;
create policy assessment_norms_select on public.assessment_norms
  for select using (auth.role() = 'authenticated');

-- ── Storage bucket for raw C3D files (private) ──
insert into storage.buckets (id, name, public)
values ('biomech-captures', 'biomech-captures', false)
on conflict (id) do nothing;

-- Public bucket for rendered report PDFs (unguessable UUID paths).
insert into storage.buckets (id, name, public)
values ('biomech-reports', 'biomech-reports', true)
on conflict (id) do nothing;

-- Allow biomech reports to publish through the shared compete_reports pipeline.
alter table public.compete_reports drop constraint if exists compete_reports_subject_type_check;
alter table public.compete_reports add constraint compete_reports_subject_type_check
  check (subject_type = any (array['pitching'::text, 'hitting'::text, 'biomech'::text]));
