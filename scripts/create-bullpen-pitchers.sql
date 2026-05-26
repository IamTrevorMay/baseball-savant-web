-- Bullpen pitcher roster for Triton Vision
-- Owned by Vision's Trackman Mode + future modes that need a "who's throwing"
-- selector. Separate from Tools' MLB `players` table (which is the pro roster).
--
-- Vision pulls list via GET /api/pitchers, adds new via POST /api/pitchers.
-- Both go through Tools API routes (bearer auth same as /api/trackman/ingest).

create table if not exists public.bullpen_pitchers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  throws       text,                              -- 'R' | 'L' | NULL
  team         text,
  created_at   timestamptz not null default now()
);

create unique index if not exists bullpen_pitchers_name_idx on public.bullpen_pitchers (lower(name));

alter table public.bullpen_pitchers enable row level security;

drop policy if exists bullpen_pitchers_admin_select on public.bullpen_pitchers;
create policy bullpen_pitchers_admin_select on public.bullpen_pitchers
  for select using (public.is_compete_admin());

-- Link trackman_pitches.pitcher_name to a pitcher row when tagged. Soft FK by
-- name lookup is fine for v1 — promote to a real uuid column later if needed.
