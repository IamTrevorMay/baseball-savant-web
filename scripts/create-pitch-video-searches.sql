-- Global search history for the Research UI /videos page (pitch video
-- archive search). Mirrors Mayday Studio's table of the same name but for
-- Triton's own user base: every executed search is logged with who ran it,
-- readable by any signed-in user; clicking an entry re-fills the filters.
--
-- Applied to prod 2026-07-07 (migration `pitch_video_searches`).

create table if not exists public.pitch_video_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  user_name text,                      -- denormalized display name at search time
  filters jsonb not null,              -- the page's filter state, verbatim
  result_count integer,
  created_at timestamptz not null default now()
);

create index if not exists pitch_video_searches_created_idx
  on public.pitch_video_searches (created_at desc);

alter table public.pitch_video_searches enable row level security;

-- Global visibility: any signed-in user can read the shared history.
create policy "pitch_video_searches_select_authenticated"
  on public.pitch_video_searches for select
  to authenticated
  using (true);

-- Users insert their own rows only.
create policy "pitch_video_searches_insert_own"
  on public.pitch_video_searches for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Live-update the History drawer in open sessions.
alter publication supabase_realtime add table public.pitch_video_searches;
