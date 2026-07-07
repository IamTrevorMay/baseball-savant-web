-- Pitch video archive index — tracks which Baseball Savant pitch clips are
-- archived on the Mayday Cloud NAS (/Volumes/May Server/PitchVideos/...).
--
-- Keyed by (game_pk, at_bat_number, pitch_number) — the `pitches` table has no
-- single pitch id, so this composite is the join key back to pitch metadata.
-- play_id is the Savant UUID used to resolve the actual video clip.
--
-- Populated by scripts/backfill-pitch-videos.ts (play_id resolution) and the
-- download worker (status/file_path updates). Read by /api/pitch-video.
--
-- status lifecycle:
--   pending    — play_id resolved, clip not yet downloaded
--   downloaded — clip on NAS at file_path
--   failed     — download errored (attempts tracked; worker retries)
--   missing    — Savant has no clip for this pitch (terminal)

create table if not exists public.pitch_videos (
  game_pk        integer not null,
  at_bat_number  integer not null,
  pitch_number   integer not null,
  play_id        uuid,
  status         text not null default 'pending'
                 check (status in ('pending','downloaded','failed','missing')),
  file_path      text,
  size_bytes     bigint,
  attempts       integer not null default 0,
  error          text,
  requested_at   timestamptz not null default now(),
  downloaded_at  timestamptz,
  primary key (game_pk, at_bat_number, pitch_number)
);

create index if not exists pitch_videos_status_idx  on public.pitch_videos (status);
create index if not exists pitch_videos_play_id_idx on public.pitch_videos (play_id);

-- Internal table: service-role access only (API routes + scripts). No anon policies.
alter table public.pitch_videos enable row level security;
