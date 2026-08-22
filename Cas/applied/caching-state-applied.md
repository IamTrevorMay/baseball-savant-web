---
title: Caching & State Consistency — Applied Playbook
domain: applied
tags:
  - caching
  - cache-invalidation
  - realtime-sync
  - optimistic-updates
  - staleness-display
  - broadcast-overlay
  - triton-platform
last_updated: 2026-08-22
---

# Caching & State Consistency — Applied Playbook

> Turns `Cas/caching-state/` into sequenced work. Two defects here are live: a cache key that serves
> one tab's payload to another, and an overlay that silently diverges on air while reporting
> `connected: true`. The rest is instrumentation this repo owns and never wired.

## TL;DR

- **`/api/trends` serves the Overview payload to the Stuff and Arsenal tabs.**
  `app/api/trends/route.ts:15` omits `tab` from the cache key and `:16` reads it *before* branching,
  so a warm Overview entry answers a tab expecting `{leaders, gainers, losers}` with `{rows:[…]}` —
  an empty tab, HTTP 200, for up to six hours. (verified)
- **The overlay never resyncs after a reconnect.** `lib/useOverlaySession.ts:303-304` records
  `connected` and nothing else; a four-second drop mid-show leaves the output diverged for the rest
  of the broadcast while the status dot reads connected. (verified)
- **The reconcile it needs is written twice already** — the mount merge at
  `lib/useOverlaySession.ts:143-149` and the `session:sync` receiver at `:214-221` — over state
  `app/api/broadcast/trigger/route.ts:160,397` persists. (verified)
- **A rejected Kanban move stays on the board looking saved.**
  `components/work/WorkBoard.tsx:523-539` wraps supabase-js in a bare `try/catch`, but the client
  *resolves* with `{ error }` rather than throwing; `:463-474` and `:477-485` do it correctly fifty
  lines up. (verified)
- **Even the correct sites are blind to an RLS `USING` denial** — zero rows updated, no error; only
  `.select()` detects it. 55 unchecked client mutation sites versus 19 checked, and `throwOnError`
  appears zero times repo-wide. (verified)
- **The instrumentation exists and was never wired.** `query_cache.created_at` is written at
  `lib/queryCache.ts:41` and not selected at `:19`; `lib/observability.ts:23-26` exports
  `logApiEvent` — doc comment naming "cache hits" — with zero call sites; `mv_last_refreshed`
  reaches one screen, `app/(admin)/admin/page.tsx:207-209`, as a raw ISO string. (verified)
- **Five of seven `CACHE_TAG_REGISTRY` prefixes are never written**, `invalidateBySource` is only
  ever called with `'pitches'` — so the MiLB and league-average crons invalidate nothing,
  successfully — and `query_cache` has no DDL anywhere in the repo. (verified)
- **Not one `run_query` analytics route reaches the CDN.** 13 route files set `max-age` with no
  `s-maxage`, which Vercel will not edge-cache; `/api/trends` is a POST, so its header is inert
  entirely; and `app/api/scene-stats/route.ts:15` calls plain `run_query`, so the on-air path is
  killed at 8 s while the browser waits two minutes. (verified)

## NOW (0–6 weeks)

### N1. Put `tab` in the trends cache key — this is serving wrong data today

`app/api/trends/route.ts:15-16`. The key is `trends:${safeSeason}:${playerType}:${minPitches}`, read
at `:16` before the handler branches on `tab`. Overview writes it at `:122`; Stuff writes
`trends:stuff:${safeSeason}:${mp}` at `:74` and Arsenal `trends:arsenal:…` at `:110`. Neither is
ever read, so both tabs are permanent misses — and once Overview has written, both are served
Overview's shape. Three edits, one file:

1. **Key on every input**: `trends:${tab}:${safeSeason}:${playerType}:${minPitches}` on all three
   branches, and normalize `minPitches` once at `:10` — today the tab branches parse it with a
   `|| 50` fallback (`lib/hooks/useTrendsData.ts:175,185`) while Overview uses `|| 500` (`:197`),
   off one shared state declared at `:110`.
2. **Read after normalization**, not before branching.
3. **Send `playerType` from the tab queries** — `lib/hooks/useTrendsData.ts:174,184` omit it and the
   route defaults to `'pitcher'` at `:10`; a defaulted value inside a shared key is the same defect
   one level down. The react-query key is already correct (`lib/queryKeys.ts:14` includes `tab`), so
   nothing on the client changes.

**Stop condition — the test must fail first.** Seed `query_cache` with an Overview-shaped row under
the current key, `POST {tab:'stuff'}`, assert the response carries `leaders`, and watch it fail
against `HEAD` before fixing. `Cas/testing-data-systems/` owns the harness, and the five red tests
in `__tests__/lib/queryCache.test.ts` must be green first. **Cost:** under an hour. (verified)

### N2. Reconcile the overlay on `SUBSCRIBED` — the highest-stakes item in this playbook

`lib/useOverlaySession.ts:303-304` is the whole reconnect story: `connected: status ===
'SUBSCRIBED'`. Every state change after mount arrives as a fire-and-forget broadcast patch
(`:159-301`), so anything sent while the socket was down is gone. Trevor is on camera when this
happens and the overlay reports healthy throughout.

**The fix reuses code that already exists.** `init()` at `:121-149` fetches
`/api/broadcast/sessions?id=…`, reads `session.active_state.visibleAssets` and `activeSegmentId` at
`:140-141`, and merges them at `:143-149`. That is the reconcile:

- **Extract `resync()`** — the session fetch, the assets fetch at `:135-138`, the merge. `init()`
  calls it once; the subscribe callback calls it on every `SUBSCRIBED` after the first (guard with a
  `hasSubscribedRef`). The state it reads is durable: `app/api/broadcast/trigger/route.ts:160,397`
  merges through the `broadcast_merge_active_state` RPC, and
  `app/api/broadcast/sessions/route.ts:77-79` strips `active_state` from raw `PUT` bodies.
- **Refetch both**, not just the session. `active_state` carries visibility and segment, not the
  `scene_config` patches applied by `asset:update` at `:167-195` — without the asset refetch,
  element edits made during the drop stay lost.
- **Merge, do not replay.** Set `visibleAssetIds` from the row and clear `animatingAssets`, exactly
  as the `session:sync` receiver does at `:214-221`. Do **not** route the diff through
  `showAsset`/`hideAsset` (`:56-95`): those set enter/exit animation classes, and a reconcile that
  animates re-runs every transition on camera at once.
- **No flash.** Never blank state before the refetch resolves; apply the merge in one `setState`
  after both responses land, keyed by asset id so an asset visible before and after reconciles
  rather than remounts. And widen `connected` (`:14,37`) from a boolean to
  `'live' | 'reconnecting' | 'stale'` — a boolean cannot express "socket up, content unknown".

**Stop condition:** with the overlay open, throttle the OBS machine offline for five seconds while
firing three triggers, then restore. Within a second the overlay matches the producer and no asset
re-animates. Repeat on the producer-panels output — `lib/useProducerOverlay.ts:156-157` is the
identical defect, with its own fetch at `:119`. (verified)

### N3. One rollback rule, then sweep 55 sites

**The rule:** `supabase-js` resolves with `{ error }`; it throws only on a network-level fetch
rejection. So:

1. **Never use `try/catch` to detect a failed write.** Destructure `{ error }`.
2. **Where RLS can deny the row, append `.select('id')`** and treat an empty array as failure. A
   `USING` denial updates zero rows and returns no error — Postgres prints `UPDATE 0`. Both of
   `WorkBoard.tsx`'s *correct* sites (`:463-474`, `:477-485`) miss this mode.
3. **Restore from a snapshot taken before the write, and tell the user.** The app-wide
   `ToastProvider` at `app/layout.tsx:51` has one consumer; a silent revert reads as a UI glitch,
   and the fix is a message (`Cas/caching-state/05-optimistic-updates-rollback.md`).

**The two live sites:** `components/work/WorkBoard.tsx:523-539` awaits the update inside a bare
`try`, so `catch { fetchTasks() }` at `:536-538` is dead code, and the sibling reindex at `:530-535`
shares it. `app/(work)/work/myboard/page.tsx:147,155-166` duplicates the same code. Both files hold
the correct pattern nearby — inconsistency, not ignorance.

**The sweep:** 55 unchecked client mutation sites against 19 checked. Do not hand-edit 55 call
sites; add one helper (`lib/mutate.ts`) wrapping a PostgREST builder that applies `.select()`,
returns `{ ok, rows, error }` and reports through `reportError`, then convert. `throwOnError` — zero
repo-wide — is cheaper only where the caller has an error boundary, and Triton has none.

**Stop condition — must fail first.** Point one update at a nonexistent id (zero rows, no error) and
confirm the card snaps back with a toast; then, in a preview project, revoke the `work_tasks` update
policy and confirm the same. A rollback never run against a real rejection is not known to work.
(verified)

### N4. Surface staleness — put the age on the wire, then render it

Nothing on an analyst surface can say how old a number is, and every part needed to fix that already
exists. `mv_last_refreshed` is written by `app/api/cron/refresh/route.ts:140`, returned by
`app/api/admin/cron-health/route.ts:44,57`, and rendered at `app/(admin)/admin/page.tsx:207-209` as
`MV last refreshed: <ISO string>` — one admin screen, no age, no threshold. Four steps:

- **Stop `getCached` collapsing three outcomes into `null`.** `lib/queryCache.ts:24` —
  `if (error || !data) return null` — makes miss, expiry and total cache failure one value, so a
  cache failing 100% of reads is indistinguishable from a cold one. Return a discriminated
  `hit | miss | expired | error`, and report the error branch through `reportError`.
- **Select the age.** `:19` selects `response` only; `created_at` is written at `:41` and read
  nowhere. Add `created_at, expires_at`; return `ageSeconds` beside the value.
- **Wire the chokepoint that exists.** `lib/observability.ts:23-26` exports `logApiEvent`, doc
  comment "duration, counts, cache hits", **zero call sites**. Call it from both consumers with
  `{ route, cacheKey, outcome, ageSeconds, ms }`; hit rate today is not low or high, it is unknown.
  Then set `X-Cache: HIT|MISS` and `Age: <seconds>` on cached responses — the standard way a
  response states its own age, which Triton never sends.
- **Render it.** A `<Freshness>` chip showing **age, not a timestamp** ("data as of 2 h ago" /
  "46 days ago", amber past a threshold), fed by a small unauthenticated `/api/freshness` route —
  the admin route is gated, so no analyst surface can call it.

**This is where a cache stops lying by omission.** The 46-day `league_averages` outage was not a
cache bug — the caches served promptly from a frozen denominator, and no layer could state the
inputs' age. `Jo/applied/data-reliability-applied.md` owns fixing that chain; until it does, this
chip is the only thing that would surface a stalled refresh to a human. Merge the visual with
`Li/applied/metric-governance-applied.md`'s coverage/`n` affordance — one chip, not three badges.

**Stop condition:** point `SUPABASE_SERVICE_ROLE_KEY` at a bad value in a preview deploy and the log
shows `outcome: 'error'` rather than a run of misses; stop the refresh cron for two days and the
chip turns amber unprompted. (verified)

### N5. Make invalidation cover the sources it claims, and stop swallowing its failures

`lib/queryCache.ts:58-62` registers seven prefixes across three sources. Five — `player:`, `scene:`,
`milb:`, `league:`, `pctile:` — are written by no route, so `invalidateBySource('milb_pitches')` and
`('league_averages')` would purge nothing, successfully, and neither is ever called: `'pitches'` is
the only argument in the repo. `app/api/cron/refresh/route.ts:163` then invalidates `'pitches'`
after refreshing `league_averages` and the matviews — the wrong source, whose right prefixes have no
writers anyway. It should invalidate `league_averages`, and the MiLB ingest `milb_pitches`, once
those prefixes have writers.

1. **Write the missing DDL first.** No `.sql` file in `scripts/` creates `query_cache` — 32 files,
   none of them this one — so its schema and indexes are unversioned and nothing below is verifiable
   on a fresh branch. Add `scripts/create-query-cache.sql`: the columns in use, an
   `expires_at` index for `purgeExpired` (`:86-91`), and
   `CREATE INDEX … (cache_key text_pattern_ops)`, because `invalidateCache` at `:76-81` deletes with
   `.like('cache_key', prefix%)` — a predicate a default-collation B-tree cannot serve, so today it
   is a sequential scan (`Cas/caching-state/03-application-cache-design.md`).
2. **Delete the five unwritten prefixes, and adopt or delete `cached()`.** A registry entry with no
   writer is cargo-cult: it makes the scheme look enforced and would put five dead series on any
   dashboard built from it, so drop each and re-add it in the commit that writes it. Likewise the
   `cached()` wrapper at `:96-104`, which has zero callers — both consumers hand-roll `getCached` +
   `setCache(...).catch(() => {})`, and a tag scheme cannot be enforced at an unused entry point.
3. **Remove the bare `.catch(() => {})`** at `app/api/cron/pitches/route.ts:67-70` and
   `app/api/cron/refresh/route.ts:161-165`. It is nearly unreachable anyway — `invalidateCache`,
   `purgeExpired` and `setCache` never destructure `{ error }`, so the failure is swallowed a layer
   down. Have `invalidateCache` return the deleted count into the cron's `counts`, where
   `Jo/applied/data-reliability-applied.md`'s stricter `trackCronRun` will read it.

**Stop condition:** the schema recreates from `scripts/` on an empty database with the `queryCache`
suite green against it — including `invalidateCache` and `purgeExpired`, which the test file imports
and never exercises — and a cron run reports `invalidated: <n>`. (verified)

## NEXT (6 weeks – 6 months)

### X1. Fix the on-air query path before tuning any header on it

`app/api/scene-stats/route.ts:2` imports `supabaseAdminLong` (a 120-second *client* abort,
`lib/supabase-admin.ts:20`) but `:15` calls the plain `run_query` RPC, which the `authenticator`
role caps at 8 s — so the client waits two minutes for a statement Postgres killed at eight seconds,
on the route that pushes stats to a live broadcast. `app/api/player-data/route.ts:45` calls
`run_query_long` and gets 120 s; `app/api/trends/route.ts:6` shares the mismatch.

Switching to `run_query_long` is the obvious move and is **not** sufficient: a producer needs an
answer in about two seconds or a labelled fallback, so this path wants a *shorter* budget and an
explicit timeout state. `:1688` also sets `stale-while-revalidate=86400` — a 25-hour maximum served
age on a live surface, which is not degraded UX but a false statement.
**Stop condition:** an artificially slow scene-stats query renders "stats unavailable" on the
producer panel within 3 s and pushes nothing. (verified)

### X2. Give the analytics routes an edge, once they can state their age

13 route files set `max-age` with no `s-maxage`, and Vercel caches a function response only for
`s-maxage` — the browser caches, the CDN does not. The routes that do reach the edge are the puzzle
game and the news feeds; the eight-second aggregations are not among them
(`Cas/caching-state/02-http-caching-cdn.md`). Two constraints shape the work. **`/api/trends` is a
POST**, so no header will ever cache it — converting it to GET with query params is the actual task,
and it makes the N1 key and the URL the same object. And **there is no purge handle** (zero
`revalidateTag`, zero `Vercel-Cache-Tag` repo-wide), so keep `s-maxage` at or below the cron cadence
rather than building a tag system.

**Sequence this after N4**: edge-caching before a surface can render its age moves data further
from its source with no signal. **Stop condition:** `x-vercel-cache: HIT` on a
second request to a converted route, and the freshness chip reflecting the added age. (documented)

### X3. Make react-query a synchronizing cache, and render the paused state

`lib/QueryProvider.tsx:12-15` sets `staleTime` 5 min with `refetchOnWindowFocus: false`; against it,
nine hook sites set `staleTime: Infinity` (`lib/hooks/useTrendsData.ts:178,188` among them) beside
**one** `invalidateQueries` (`lib/hooks/useABSData.ts:196`) and **zero** `setQueryData`, so a tab
opened in the morning can hold a value all day. `lib/hooks/useStandings.ts:25` is the model and
already exists — `season < currentYear ? Infinity : 5*60*1000`. `Infinity` is right for a completed
season; the defect is that eight other sites made that call implicitly, including for the live one.

**Offline is the same problem in different clothes.** `networkMode` appears **zero** times
repo-wide, so react-query's default applies: an offline query goes `fetchStatus: 'paused'` and never
rejects. **Zero sites read `fetchStatus`**, so a correctly paused query draws as a spinner that runs
until the network returns — the user is told "loading" about a request that is not being made. Read
`fetchStatus` in the shared loading component and render an offline state in N4's vocabulary: the
real axis is fresh → stale → absent, and Triton renders all three identically
(`Cas/caching-state/09-offline-resilience.md`).

**Repair the service worker in the same pass.** `public/sw.js:47` is
`caches.match('/offline') || new Response('Offline', …)`: `caches.match()` returns a Promise, every
Promise is truthy, so the fallback never runs and `respondWith` gets a Promise resolving to
`undefined` — which the spec turns into a network error, worse than no fallback. `install` at `:3-5`
precaches nothing, so even a corrected `await` finds `/offline` missing, and `CACHE_NAME` at `:1` is
a literal, so the `activate` cleanup at `:7-14` can never run. Triton is an installable PWA
(`public/manifest.json`, `app/layout.tsx:23`), so an offline home-screen launch hits the browser
error page. **Stop condition:** a current-season query refetches within
its stale window and a 2019 query never does; DevTools-offline shows an offline state, not a
spinner; an offline home-screen launch renders `/offline`. (verified)

## LATER (6+ months)

### L1. Decide who may write to a live session, and version `asset:update`

`app/api/broadcast/trigger/route.ts:35` states its own model in a comment: "session ID acts as
capability token (no auth required)". `broadcast_project_members` gates reads but never this write
path — past the rate limit at `:27`, anyone holding a session URL can change what is on air.
**That is a product decision, not a caching one**: a capability-URL model is legitimate where the
OBS machine has no user session.

Cas's interest is narrower. While the writer set is unbounded, `asset:update`
(`lib/useOverlaySession.ts:167-195`) is a last-writer-wins register with no version field, so two
producers editing one asset interleave field-by-field and neither sees a conflict; and `hideAsset`
at `:77-95` schedules an unconditional delete 2,000 ms out, so an `asset:show` inside that window is
silently undone. **Stop condition:** two producer tabs editing one asset produce a rejected patch,
not a silent merge. (verified)

## Standing Rules

- **A cached value that cannot state its age must not be rendered as a number.** Cas's coverage rule
  one layer down: a tile that cannot say how many rows it averaged should not render — nor one that
  cannot say how old they are.
- **"No data", "zero", "loading" and "offline" are four states and must never render identically.**
  The paused-query spinner (X3) and the empty Stuff tab (N1) are the same failure in different
  clothes — an honest state the UI has no vocabulary for.
- **Never use `try/catch` to detect a supabase-js failure, and never `.catch(() => {})` an
  invalidation.** Destructure `{ error }`, add `.select()` where RLS can deny, let cron `counts`
  carry the result.
- **A registry entry with no writer is cargo-cult; every regression test here must be shown to fail
  against `HEAD` first; on-air warnings go to the producer panel, never to the overlay output.**
- **Hand off at the border.** Jo owns whether the source is fresh and whether the cron told the
  truth; Li owns whether the number is defensible; this playbook owns only whether the screen could
  have known it was stale.
- **Not doing, deliberately:** no Redis or Upstash — a Postgres-backed cache is free, transactional,
  survives deploys and is shared across serverless invocations, which an in-process `Map` on Vercel
  is not; no state-management library, because Triton has a server-state-copied-into-client-state
  problem, not a client-state problem (`Cas/caching-state/06-state-management-patterns.md`); no
  single-flight lock until N4 makes hit rate countable; no offline write queue until N3 lands, since
  queueing writes today turns a transient wrong pixel into a durable wrong row.

**Triton-internal evidence.** Repo read 2026-08-22 on `docs/cas-frontend-data-scale`; no
database was queried for this document. Every `file:line` above was opened and read; the claims no
reader can check from a single line rest on `lib/queryCache.ts:19,24,41,58-62`,
`app/api/trends/route.ts:15,16,74,110,122`, `lib/useOverlaySession.ts:121-149,214-221,303-304`,
`components/work/WorkBoard.tsx:523-539` against `:463-474`, and `app/api/scene-stats/route.ts:2,15`
against `app/api/player-data/route.ts:45`. Counted
2026-08-22 by grep over the repo excluding `node_modules`: `throwOnError` 0, `networkMode` 0,
`fetchStatus` 0, `useMutation` 0, `setQueryData` 0, `useOptimistic` 0, `invalidateQueries` 1; 30
route files hand-set `Cache-Control` across 37 sites, 13 of them `max-age` with no `s-maxage`; 32
`.sql` files in `scripts/`, none creating `query_cache`. Reused from this build's audit rather than
re-derived: 55 unchecked client mutation sites versus 19 checked; five red tests in
`__tests__/lib/queryCache.test.ts` since 2026-08-11 (the mock lacks `.maybeSingle()`; the production
code is correct); 52 refresh runs, 50 timeouts, 0 successes, all logged `status='success'`
(`planning.md:301`). One correction found while writing: the
`scene-stats` timeout defect is not the client — `lib/supabase-admin.ts:20` gives it 120 s — it is
that `:15` calls the `run_query` RPC rather than `run_query_long`, so the 8 s cap is imposed
database-side and the client waits out a statement that is already dead.
