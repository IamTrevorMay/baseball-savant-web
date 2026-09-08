-- Saved row layouts for the Research /compare page ("Save preset" + the
-- Custom dropdown at the end of the Stat sets chips). One row per preset,
-- owner-only RLS (same pattern as pitch_playlists).
--
-- config captures the row layout only — active sections, per-section closed
-- rows, and custom-row metric keys — never players, scope, or time windows:
--   { "sections": ["pit_traditional", "pit_arsenal"],
--     "closedRows": { "pit_traditional": ["l", "sv"] },
--     "customMetrics": ["fps_pct", "deception_score"] }
--
-- Applied to prod 2026-09-08 (migration `compare_presets`).

create table if not exists public.compare_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  -- 'pitch' added 2026-09-08 (migration `compare_presets_pitch_group`)
  player_group text not null check (player_group in ('hitting', 'pitching', 'pitch')),
  config jsonb not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists compare_presets_owner_idx
  on public.compare_presets (created_by, player_group, created_at);

alter table public.compare_presets enable row level security;

create policy "compare_presets_owner_all"
  on public.compare_presets for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
