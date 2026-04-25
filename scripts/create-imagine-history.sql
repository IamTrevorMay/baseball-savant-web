-- Imagine — persistent per-user history of rendered visualizations.
-- Each row is one render the user kept (right-panel history list).
--
-- RLS: a user only sees and writes their own rows.
-- Thumbnails are stored in the `imagine-thumbnails` bucket (public read, auth write).

-- ── Table ──
create table if not exists public.imagine_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  widget_id       text not null,
  title           text not null,
  filters         jsonb not null default '{}'::jsonb,
  size            jsonb not null default '{}'::jsonb,
  thumbnail_url   text,
  created_at      timestamptz not null default now()
);

create index if not exists imagine_history_user_id_created_at_idx
  on public.imagine_history (user_id, created_at desc);

-- ── RLS ──
alter table public.imagine_history enable row level security;

drop policy if exists imagine_history_select_own on public.imagine_history;
drop policy if exists imagine_history_insert_self on public.imagine_history;
drop policy if exists imagine_history_delete_own on public.imagine_history;

create policy imagine_history_select_own on public.imagine_history
  for select using (user_id = auth.uid());
create policy imagine_history_insert_self on public.imagine_history
  for insert with check (user_id = auth.uid());
create policy imagine_history_delete_own on public.imagine_history
  for delete using (user_id = auth.uid());

-- ── Storage bucket for thumbnails ──
-- Public read so <img src> works without signed URLs; only authenticated users can write.
insert into storage.buckets (id, name, public)
values ('imagine-thumbnails', 'imagine-thumbnails', true)
on conflict (id) do nothing;

-- Allow any authenticated user to upload, and let owners delete their own files.
drop policy if exists "imagine-thumbs read"   on storage.objects;
drop policy if exists "imagine-thumbs write"  on storage.objects;
drop policy if exists "imagine-thumbs delete" on storage.objects;

create policy "imagine-thumbs read" on storage.objects
  for select using (bucket_id = 'imagine-thumbnails');

create policy "imagine-thumbs write" on storage.objects
  for insert with check (bucket_id = 'imagine-thumbnails' and auth.uid() is not null);

create policy "imagine-thumbs delete" on storage.objects
  for delete using (bucket_id = 'imagine-thumbnails' and owner = auth.uid());
