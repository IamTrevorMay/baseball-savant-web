-- Personal playlists for the Research UI /videos page (Playlist view).
-- Mirrors Mayday Studio's pitch_playlists tables but for Triton's own user
-- base. Each playlist belongs to one user (RLS owner-only). Items snapshot
-- the full pitch row as jsonb so a playlist keeps playing even if the search
-- index changes; row_key (game_pk-at_bat-pitch) dedupes.
--
-- Applied to prod 2026-07-10 (migration `pitch_playlists`).

create table if not exists public.pitch_playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pitch_playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.pitch_playlists(id) on delete cascade,
  row_key text not null,
  clip jsonb not null,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  unique (playlist_id, row_key)
);

create index if not exists pitch_playlist_items_playlist_idx
  on public.pitch_playlist_items (playlist_id, position);

alter table public.pitch_playlists enable row level security;
alter table public.pitch_playlist_items enable row level security;

create policy "pitch_playlists_owner_all"
  on public.pitch_playlists for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "pitch_playlist_items_owner_all"
  on public.pitch_playlist_items for all
  to authenticated
  using (exists (select 1 from public.pitch_playlists p where p.id = playlist_id and p.created_by = auth.uid()))
  with check (exists (select 1 from public.pitch_playlists p where p.id = playlist_id and p.created_by = auth.uid()));
