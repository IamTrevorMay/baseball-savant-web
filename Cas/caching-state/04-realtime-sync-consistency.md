---
title: Realtime Sync & Consistency — The Overlay Can Be Wrong and Still Say It Is Connected
domain: caching-state
tags:
  - realtime
  - broadcast
  - reconnection
  - consistency
  - overlays
  - idempotency
  - ordering
  - presence
sources_reviewed: 10
last_updated: 2026-08-21
---

# Realtime Sync & Consistency — The Overlay Can Be Wrong and Still Say It Is Connected

> Grades: **(verified)** read at `file:line` or from the packet; **(documented)** vendor docs;
> **(inferred)** mechanism; **(cargo-cult)** unsupported. No production query and no channel
> connection was made to write this.

## TL;DR

- **A four-second blip on the OBS machine desynchronises the overlay for the rest of the broadcast, and the only on-screen signal — an 8×8 red dot — turns *off* as divergence begins.** (verified)
- **Broadcast is fire-and-forget, and the replay feature that exists cannot apply here**: it needs a private channel and covers only messages sent from the database. (documented)
- **All four broadcast consumers treat `.subscribe()` as a status light** — each sets `connected: status === 'SUBSCRIBED'` and nothing more. No refetch-on-rejoin exists. (verified)
- **The reconcile handler is already written and nothing sends it**: `session:sync` and `widget:state-sync` have receivers in `useOverlaySession.ts` and zero senders repo-wide. (verified)
- **The durable state that fix would read is half-written** — `PUT /api/broadcast/sessions` discards `active_state`, so clicking Show in the editor never reaches the row. (verified)
- **`asset:hide` is not order-safe against a later `asset:show`**: it schedules an unconditional delete 2,000 ms out, and a show inside that window is silently undone. (verified)
- **`asset:update` is a last-writer-wins register with no version**, so two producers editing one asset interleave field-by-field, and neither sees a conflict. (verified)
- **Chat inverts the failure mode** — a missed message is invisible, a duplicate is on camera, and the overlay appends chat with no dedup by `id`. (verified)

---

## 1. Three extensions, three guarantees

Supabase Realtime is three products behind one `.channel()` call, and treating them as one turns "we
use Realtime" into a consistency claim it never was.
| | Broadcast | Postgres Changes | Presence |
|---|---|---|---|
| Delivery | best-effort, none documented | best-effort, none documented | merged state, reconciled |
| Ordering | none documented | preserved — single-threaded | n/a (state, not events) |
| Replay after a gap | private + DB-sent only, 72 h | none | full `sync` on rejoin |
| Triton use | **all 8 broadcast channels** | 6 sites, none on broadcast | **zero sites** |

Presence is the only one that self-heals, emitting a full `sync` on rejoin (documented). Broadcast
has no equivalent, so anything built on it must supply its own reconcile; Triton does not. Replay is
no escape hatch either: it needs a **private** channel and covers only Broadcast From the Database,
and Triton has zero `private: true` repo-wide (verified).

## 2. What Triton actually wired

| Consumer | `file:line` | On `SUBSCRIBED` |
|---|---|---|
| Overlay output | `lib/useOverlaySession.ts:156`, sub `:303-305` | sets `connected` only |
| Producer panels output | `lib/useProducerOverlay.ts:135`, sub `:156-158` | sets `connected` only |
| Producer control panel | `components/producer/ProducerContext.tsx:64`, sub `:95-97` | sets `connected` only |
| Broadcast editor (live) | `components/broadcast/BroadcastContext.tsx:1325`, sub `:1371` | nothing |

All four share `session.channel_name`, so failures are correlated, not independent: one channel error
takes the overlay, the producer's panel output *and* the producer's control surface down together
(inferred) — the operator loses the picture and the instrument at once.

## 3. The gap, step by step

1. Initial state is fetched exactly once inside `init()`: session at `useOverlaySession.ts:125`,
   assets at `:135`, `visibleAssetIds` seeded from `session.active_state.visibleAssets` at `:140`.
2. Sixteen `.on('broadcast', …)` handlers (`:159-302`) then patch that state **incrementally**.
3. `.subscribe(status => setState(prev => ({ ...prev, connected: status === 'SUBSCRIBED' })))` at
   `:303-305` — no fetch, no sequence check, no "did I miss anything." So when the socket drops and
   the client rejoins, `connected` returns to `true`, the red dot at
   `app/overlay/[sessionId]/page.tsx:76-88` disappears, and every event sent in the gap is gone,
   because Broadcast has no buffer (documented).

The overlay is now a stale fold over a truncated event log, showing green. An asset hidden in the gap
stays on air; one shown in the gap never appears. Neither self-corrects, because only deltas are ever
sent. **A signal that goes quiet as the problem starts is worse than none.**

## 4. Idempotency and ordering audit

| Event | Twice = once? | Order-safe? | Shape |
|---|---|---|---|
| `asset:show` `:159-162` | state yes, animation **no** | yes | set-add |
| `asset:hide` `:163-166` | yes | **no** — see below | set-delete, deferred |
| `asset:update` (`elementUpdates`) `:176-194` | yes | **no** | LWW register, unversioned |
| `slideshow:goto` `:196-206` | **yes** | **yes** | absolute index |
| `session:sync` `:214-221` | **yes** | **yes** | full replace |

`slideshow:goto` is the shape to copy: the authority computes the index and broadcasts an absolute
value, so it is idempotent and order-independent. `asset:hide` is the opposite — `hideAsset`
(`:77-95`) schedules an **unconditional** `visibleAssetIds.delete(assetId)` at +2,000 ms, and an
`asset:show` inside that window re-adds it (`:61-62`) only for the pending timer to remove it anyway.
Hide-then-show inside two seconds — a producer correcting a misfire on air — leaves the asset hidden
while the producer and the durable row both believe it visible (verified shape; consequence
inferred).

A **monotonic sequence number** on every payload buys gap *detection without a disconnect* — a
receiver seeing `seq` jump 41 → 44 knows it lost two events though the socket never dropped — plus
staleness rejection and a resume token, the role `Last-Event-ID` plays for server-sent events
(documented). Connection status catches only gaps that were visible.

## 5. The authoritative state exists — and is half-written

`broadcast_sessions.active_state` is the durable copy — `visibleAssets`, `slideshowIndexes`,
`activeSegmentId` — maintained atomically by the trigger route
through an RPC written for exactly this, `broadcast_merge_active_state`
(`app/api/broadcast/trigger/route.ts:397-400`). Then the editor path drops it on the floor.
`BroadcastContext.tsx:445-455` PUTs
`{ id, active_state: {...} }` to `/api/broadcast/sessions`, and that route does
`const { id, active_state: _ignoredActiveState, ...updates } = body` (`sessions/route.ts:79`) —
deliberately, to stop a raw body clobbering the atomic merge. **The result is that clicking Show in
the editor never reaches the durable row** (verified): the comment names a real hazard, but the call
site was never migrated to the RPC. A refetch-on-rejoin today would therefore restore the
*trigger API's* view of the world: right for Stream Deck and hotkey URLs, stale for anything driven
from the editor. **Fix the write path before shipping the read path.**

## 6. Reconcile on `SUBSCRIBED`, specified

The `session:sync` handler at `useOverlaySession.ts:214-221` is already a correct full-state reducer:
it replaces `visibleAssetIds` wholesale and clears `animatingAssets`, and it has no sender.

1. **Detect a rejoin, not a first join** — a `hasJoinedRef` set on the first `SUBSCRIBED`, since
   `init()` already covers that one.
2. **Refetch both authorities before touching state**: `GET /api/broadcast/sessions?id=` for
   `active_state` and `GET /api/broadcast/assets?project_id=` for the `scene_config` `asset:update`
   patches.
3. **Replace, never diff** — the local copy is a fold over an event log with a hole in it. Apply
   `visibleAssetIds`, `slideshowIndexes`, `activeSegmentId` and `assets` in **one** `setState`, and
   empty `animatingAssets` as `session:sync` does at `:219`. One commit, one frame: assets correctly
   on air never remount, so no re-entry animation, no flash, and no empty intermediate frame.
4. **Add `seq` and make the indicator honest** — increment a counter inside
   `broadcast_merge_active_state`, stamp every payload, reconcile on any discontinuity, and show
   three states rather than two: disconnected (red), unreconciled or gap-detected (amber), reconciled
   (nothing). Per `Cas/analytics-ux/`, the badge must describe correctness, not connectivity.

## 7. Chat inverts the failure mode, and the 8 s cap makes silence ambiguous

For asset state a lost event is catastrophic and a duplicate harmless. For chat it inverts: a missed
message is invisible, a duplicate is on camera.

| | Twitch IRC | YouTube |
|---|---|---|
| Transport | `WebSocket` `:74`, backoff cap 30 s `:180-182` | 10 s poll `:269` |
| Resume token | none — no backlog on JOIN (documented) | `nextPageToken` `:196` |

That backoff loop is the best-behaved reconnect logic in the repo (verified) and still drops every
message sent while it waits — acceptably, invisibly. Duplication is what to fix: `ytPageTokenRef`
advances **only if** `data.nextPageToken` is truthy (`:233-234`), so a response delivering messages
without a token parks the cursor and the next poll re-delivers the batch, while
`useOverlaySession.ts:227-235` checks only that `msg?.id` is truthy and `:236-244` concatenates
wholesale (verified). Both providers supply a stable id (`:110`, `:203`); a `Set` of the last 500 ids
closes it.

The stat push has its own honesty problem. `app/api/scene-stats/route.ts:15` calls plain `run_query`,
so the `authenticator` role's **8 s** `statement_timeout` binds despite the 120 s client timeout
(packet). On failure `fetchStatLine` reads `json.stats || {}` (`useProducerControls.ts:51`) rather
than throwing, so the panel goes on air *empty* rather than not at all, with nothing separating
"timed out" from "no data" from "still loading" — `Jo/` owns whether those numbers are stale and
`Li/` whether they are defensible; whether the screen can say which, is this one.

## What Triton should do, in order

1. **Stop `PUT /api/broadcast/sessions` silently discarding `active_state`** — route
   `BroadcastContext.tsx:445-455` through `broadcast_merge_active_state`. Until the durable row
   reflects editor-driven shows and hides, every downstream fix restores the wrong state.
2. **Reconcile on rejoin at `useOverlaySession.ts:303-305`**, per §6, reusing the `session:sync`
   reducer at `:214-221` and shipping the three-state indicator in the same commit. This is the
   on-air defect and the smallest fix here relative to its blast radius.
3. **Fix the `asset:hide` timer race** at `:85-94` — check membership or a generation counter before
   the deferred delete.
4. **Add `seq` to `active_state` and every payload**, reconciling on a discontinuity — the only
   mechanism that catches a drop with no disconnect, and it versions `asset:update` besides.
5. **Dedup chat by provider id** at `useOverlaySession.ts:227-244`.

**Anti-recommendation: do not replace Broadcast with `postgres_changes` on `broadcast_sessions` "so
the overlay is always in sync with the database."** It is the obvious move and it fails three ways.
*It does not fix the gap* — Postgres Changes documents no delivery guarantee, no buffering and no
replay on reconnect either, so a four-second drop loses WAL events exactly as it loses broadcast
events, now with replication latency on a live video path. *It scales the wrong way* — it authorizes
every event per subscriber and runs single-threaded, and Supabase's own guidance is to move to
Broadcast past ~3,000 subscribers. *It replicates a row nobody writes* — `sessions/route.ts:79`
discards the editor's `active_state`, so it would stream staleness faithfully.

**Highest-leverage next action:** add a `hasJoinedRef` and a `reconcile()` at
`lib/useOverlaySession.ts:303-305` that refetches `/api/broadcast/sessions` and
`/api/broadcast/assets` and applies the result through the existing `session:sync` reducer at
`:214-221` — one function, one file, turning the platform's worst failure, a silently wrong overlay
on live television, into a self-healing one.

---

## Sources

1. Supabase — [Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast) — ephemerality, `ack`, `self`, and Replay's private-channel + DB-sent restriction.
2. Supabase — [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) — single-threaded ordering, per-subscriber authorization, and the ~3,000-subscriber guidance behind the anti-recommendation.
3. Supabase — [Realtime Presence](https://supabase.com/docs/guides/realtime/presence) — the `sync`-on-rejoin reconcile Broadcast lacks.
4. Supabase — [`subscribe()` reference](https://supabase.com/docs/reference/javascript/subscribe) — the status-callback contract every Triton consumer reduces to a boolean.
5. OBS Project — [Browser Source](https://obsproject.com/kb/browser-source) — the shutdown/refresh behaviour making a mid-show reconnect ordinary.
6. MDN — [Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) — `Last-Event-ID`, the resume token Broadcast has no equivalent of.
7. Jepsen — [Consistency models](https://jepsen.io/consistency) — names what incremental patching over an unordered channel yields.
8. Leslie Lamport — [Time, Clocks, and the Ordering of Events](https://lamport.azurewebsites.net/pubs/time-clocks.pdf) — why a monotonic counter beats the wall-clock `timestamp` these payloads carry.
9. Twitch — [Chat IRC](https://dev.twitch.tv/docs/chat/irc/) — no backlog on JOIN, so backoff reconnect is correct and lossy by design.
10. Google — [`liveChatMessages.list`](https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list) — `nextPageToken` semantics behind the duplicate-batch risk.

**Triton-internal evidence.** Repo read 2026-08-21; no production query, no channel connection.
Overlay `lib/useOverlaySession.ts`: channel `:156`, one-time fetches `:125`/`:135`, seed `:140`,
handlers `:159-302`, `showAsset` `:56-74`, `hideAsset` `:77-95` (unconditional deferred delete
`:85-94`), `asset:update` `:167-195`, `slideshow:goto` `:196-206`, `session:sync` `:214-221`, chat
`:227-244`, `widget:state-sync` `:289-302`, `.subscribe()` `:303-305`. Producer
`lib/useProducerOverlay.ts:135,156-158`, `components/producer/ProducerContext.tsx:64,95-97`. Editor
`components/broadcast/BroadcastContext.tsx`: `persistActiveState` `:445-455`, live channel
`:1325-1372`, `obs:status` in a 1,000 ms `setTimeout` `:1376-1383` **(cargo-cult)**. Durable path
`app/api/broadcast/trigger/route.ts:397-400`; `active_state` stripped at
`app/api/broadcast/sessions/route.ts:79`; type `lib/broadcastTypes.ts:172-179`. Indicators
`app/overlay/[sessionId]/page.tsx:76-88`, `.../producer-panels/page.tsx:57-69` (8×8 px, drawn only
when `!connected`). Chat `lib/useChatConnection.ts:74,110,180-182,196,203,233-234,269`; stats
`app/api/scene-stats/route.ts:15`, `lib/useProducerControls.ts:51,305-309`. By `grep`: 14 `.channel(`
sites, 8 on the broadcast surface; 6 `postgres_changes` sites, none on broadcast; **0** Presence,
**0** `private: true`, **0** `ack: true`, **0** `useSyncExternalStore`; `session:sync` and
`widget:state-sync` appear only as receivers plus type-union entries — zero senders. The 8 s
`authenticator` cap on plain `run_query` traces to `planning.md:40,46,304`.
