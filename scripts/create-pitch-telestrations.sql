-- Saved telestrator markups for the Research UI /videos page.
-- Each markup belongs to one user (RLS owner-only) and is keyed to a pitch by
-- row_key (game_pk-at_bat-pitch). `clip` snapshots the pitch row as jsonb so
-- the markup can be reopened without re-running a search; `strokes` is the
-- serialized Stroke[] from lib/video/strokes.ts.
--
-- Mirrors the pitch_playlists RLS pattern (scripts/create-pitch-playlists.sql).

create table if not exists public.pitch_telestrations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references public.profiles(id) on delete cascade,
  row_key text not null,
  clip jsonb not null,
  strokes jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pitch_telestrations_owner_key_idx
  on public.pitch_telestrations (created_by, row_key, created_at desc);

alter table public.pitch_telestrations enable row level security;

create policy "pitch_telestrations_owner_all"
  on public.pitch_telestrations for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
