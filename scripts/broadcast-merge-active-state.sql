-- Atomic merge for broadcast_sessions.active_state.
-- The trigger route used to read active_state, mutate it in JS, and write the WHOLE
-- object back — so concurrent triggers (Stream Deck + producer) clobbered each other,
-- and a write that only set {visibleAssets, slideshowIndexes} dropped other keys
-- (e.g. recording timing). This merges a patch atomically (row lock serializes
-- concurrent writers; top-level jsonb || preserves unrelated keys).
-- See app/api/broadcast/trigger/route.ts. (Applied to production 2026-06.)

create or replace function public.broadcast_merge_active_state(p_session_id uuid, p_patch jsonb)
returns jsonb
language sql
as $$
  update public.broadcast_sessions
     set active_state = coalesce(active_state, '{}'::jsonb) || p_patch
   where id = p_session_id
  returning active_state;
$$;

comment on function public.broadcast_merge_active_state(uuid, jsonb) is
  'Atomically merge a patch into broadcast_sessions.active_state (top-level jsonb ||). Row lock serializes concurrent trigger writes so they no longer clobber each other''s unrelated keys.';
