---
title: Offline Resilience — Degrade Honestly, Don't Pretend to Work Offline
domain: caching-state
tags:
  - service-worker
  - offline
  - degraded-mode
  - write-queue
  - cache-lifecycle
  - compete
  - broadcast
sources_reviewed: 11
last_updated: 2026-08-21
---

# Offline Resilience — Degrade Honestly, Don't Pretend to Work Offline

> Grades: **(verified)** read at `file:line` or from the central packet · **(documented)** vendor
> spec · **(inferred)** mechanism or arithmetic · **(cargo-cult)** copied, unjustified here.
> No production query was run for this doc.

## TL;DR

- **The axis that matters for read-mostly analytics is fresh → stale → absent, not online/offline; offline is the far end of stale, and Triton renders all three identically.** (inferred)
- **The offline fallback cannot fire, and the cause is a type error, not a caching mistake: `caches.match()` returns a Promise, every Promise is truthy, `||` never falls through** (`public/sw.js:47`). (verified)
- **That is worse than no fallback — `respondWith` gets a Promise resolving to `undefined`, which the spec turns into a network error.** (documented)
- **`install` calls `skipWaiting()` and precaches nothing, so even a corrected `await` finds `/offline` missing** (`sw.js:3-5`). (verified)
- **"Cache-first, no expiry" is half the story: `/_next/static/` URLs are content-hashed, so no wrong version ships — the defects are unbounded growth and a cleanup that no-ops against a literal `CACHE_NAME`** (`sw.js:1,7-14`). (inferred)
- **Triton has an offline signal it never renders: at react-query's default `networkMode` an offline query goes `fetchStatus: 'paused'` and the UI spins forever** (`lib/QueryProvider.tsx:11-16`). (verified)
- **No code reads a network signal directly: 0 `navigator.onLine`, 0 `online`/`offline` listeners, 0 `navigator.connection`; every `effectiveType`/`saveData` match is an unrelated local.** (verified)
- **Queueing writes is defensible on one surface and only after rollback is fixed; built today it turns a transient wrong pixel into a durable wrong row** (`components/work/WorkBoard.tsx:523-538`). (inferred)

---

## 1. What "offline" can mean here, per surface

Triton is read-mostly over an 8.88M-row table, up to 50,000 rows per player view. Caching that
offline is neither feasible nor wanted. And "offline" is not one requirement but four, only one of
which is a sync problem.

| Surface | Network reality | What "offline" should mean | Build |
|---|---|---|---|
| Research (`player`, `reports`, `trends`) | Analyst at a desk; rare, brief | Say the fetch is paused; label the last render stale | UI state only |
| Compete (`app/(compete)/**`, 13 pages) | Athletes on phones, facility Wi-Fi; frequent | Never lose typed or dropped input | Foreground retry |
| Overlay (`app/overlay/[sessionId]`) | OBS, live to air; rare but catastrophic | Reconcile to authoritative state | Refetch on resubscribe |
| Work (`work_tasks`) | Operator laptop; occasional | A queued write genuinely helps — later | Outbox, conditionally |

A cached 50k-row payload would be a snapshot of a mutating table with no way to know its age.
**Not caching analytics data is a feature.** (inferred)

---

## 2. `public/sw.js`, read end to end

51 lines. Registered at `components/ServiceWorkerRegistration.tsx:9`, mounted at `app/layout.tsx:59`.

| Lines | What it does | Verdict |
|---|---|---|
| `:1` | `CACHE_NAME = 'triton-v1'` — a literal, not a build id | Freezes the cleanup below |
| `:3-5` | `install` → `self.skipWaiting()`. No `waitUntil`, no `addAll` | Precaches nothing |
| `:7-14` | `activate` deletes caches keyed `!== CACHE_NAME`, then `clients.claim()` | No-op forever |
| `:21-27` | Returns early for `/api/`, `/auth/`, `*supabase*` | Correct — keep |
| `:29-42` | Cache-first `/_next/static/`, no expiry | Grows forever |
| `:44-50` | Network-first navigation, dead fallback | Broken — §3 |

Excluding `/api/` is the best decision in the file — no analytics number is served from a frozen
cache. There is no `message` handler, no `registration.update()`, no version bump. `manifest.json`
declares `display: standalone`, so Triton installs to a home screen — and launches offline onto the
browser's error page, since `/` is not precached either. (verified)

---

## 3. Why `caches.match(...) || fallback` is dead code

```js
// public/sw.js:45-49
fetch(request).catch(() => caches.match('/offline') || new Response('Offline', { status: 503 }))
```

Three facts compose. `caches.match()` **returns a Promise** and resolves to `undefined` on a miss —
MDN states it plainly, "caches.match() always resolves." `||` tests the truthiness of the left
operand **as it is now**, not of what it will resolve to, and a Promise is an object, so the right
side is unreachable. `respondWith()` is therefore handed a Promise resolving to `undefined`; the
spec requires a `Response` and turns anything else into a **network error**. (documented)

So the navigation fails *harder* than if no worker were installed. The correct shape resolves
first, then chooses:

```js
event.respondWith((async () => {
  try { return await fetch(request) }
  catch { return (await caches.match('/offline'))
    ?? new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } }) }
})())
```

`.then(r => r || new Response(...))` is equivalent. Note the added `Content-Type`: a bare
`new Response('Offline')` is `text/plain`, and paints as raw text. (documented)

---

## 4. Lifecycle, and what a hardcoded `CACHE_NAME` costs

`install → waiting → activate` exists so one worker version controls a page at a time: a new worker
installs, waits until no client is controlled by the old one, then activates and deletes old caches.
`skipWaiting()` collapses that — the new worker activates immediately and "is likely controlling
pages that were loaded with an older version," mixing asset versions. (documented) Triton calls it at
`sw.js:4`, outside `event.waitUntil`, so it runs before anything could be cached — harmless only
because nothing is cached at install. Add a precache and ordering starts to matter. (inferred) The
`activate` cleanup at `:7-14` is the mirror image — correct code that can never run, because it
filters against a constant no deploy changes. (verified)

### The static cache: growth, not staleness

Next.js emits `/_next/static/` under content-addressed names — `chunks/`, `css/` and `media/` are
hash-suffixed, manifests sit under a per-build id — so a new deploy requests **new URLs**, which miss
and go to network. **Cache-first is defensible for content-hashed assets** — the one place in
Triton where it is. The missing expiry costs unbounded growth, and with it quota eviction, which
browsers apply per **origin** under pressure rather than oldest-entry-first. Workbox's
`ExpirationPlugin` (`maxEntries`, `maxAgeSeconds`) exists for this; a `maxEntries` trim inside
`activate` is a dozen lines. (documented) So the packet's "least visible on the machine that shipped
it" holds for any HTTP cache: the version-skew risk is `:4`, not `:29-42`. (inferred)

---

## 5. The signal you already have and never render

| Signal | Repo count | Note |
|---|---|---|
| `navigator.onLine`, `online`/`offline` listeners | **0** | — |
| `navigator.connection` / `effectiveType` / `saveData` | **0 real** | 14 `effectiveType` hits are a local in `TemplateDataPanel.tsx`; 6 `saveData` hits are `await res.json()` locals |
| `useMutation` | **0** | Every write is hand-rolled |
| `fetchStatus` / `isPaused` / `networkMode` | **0** | `isPaused` hits are OBS recording state |
| `loading.tsx` / `error.tsx` | **0 / 0** of 96 pages | No route-level place to render a degraded state |

react-query's `onlineManager` already tracks connectivity, and at the default `networkMode: 'online'`
(`QueryProvider.tsx:11-16` sets no override) an offline query does not fail — it **pauses**:
`state: 'pending'` with `fetchStatus: 'paused'`, resuming on reconnect. Triton reads `isLoading`, so
**an offline user sees an indefinite spinner that is in fact a correctly-paused query** — the case
TanStack warns about. The fix is one condition, not a dependency. (verified)

Do not promote `navigator.onLine` to primary signal either: MDN warns that "connection to LAN is
considered online, even though the LAN may not have Internet access," so facility Wi-Fi behind a
captive portal reports `true`. It decorates a failure you already saw. (documented)

---

## 6. Degraded-mode UX: what each state should render

| State | Today | Honest rendering |
|---|---|---|
| Query paused (offline) | Spinner, forever | "Offline — showing data from 14:02" over the last render |
| Stale cache hit | Indistinguishable from fresh | Age badge from `mv_last_refreshed` or cache write time |
| Navigation, offline | Browser error page | `app/offline/page.tsx`, once §3 is fixed |
| Overlay desynced | `connected: true` | Reconcile, then a producer-side indicator |

---

## 7. Write-queueing: the one candidate, and its precondition

| Surface | Write shape | Queue? |
|---|---|---|
| Compete CSV upload (`performance/page.tsx:119-147`) | Parse file → one POST of all rows → on failure `setError`, rows dropped | **No.** Keep the rows in state, offer Retry — the file is on the device |
| Compete forms (`schedule:130,142,166`, `whoop:76`, `review:187`) | Small athlete-initiated POSTs | **No.** Disable-and-retry suffices |
| Work board (`work_tasks`) | Optimistic drag plus position reindex | **Only after rollback is fixed** |

The Work board is the honest candidate: the operator moves cards on a laptop that sleeps, and a
queued move would survive. But `WorkBoard.tsx:523-538` wraps its writes in `try/catch`, and
`supabase-js` **resolves** with `{ error }` on an RLS or constraint rejection rather than throwing,
so only a network-level rejection reaches `fetchTasks()`. The same file gets it right twice, at
`:463-474` and `:477-485`. The rollback belongs to `05-optimistic-updates-rollback.md`; here it is
**the precondition for any queue.** (verified)

---

## What Triton should do, in order

1. **Fix `sw.js:45-49`** — `await` the lookup, `??` the fallback, add `Content-Type` — and precache
   `/offline` in `install` via `event.waitUntil(caches.open(...).addAll(['/offline']))`.
2. **Derive `CACHE_NAME` from the build id** so the `activate` cleanup at `:7-14` starts working, and
   add a `maxEntries` trim to the static cache in the same handler.
3. **Render `fetchStatus === 'paused'`** distinctly from `isPending` in the shared loading component:
   one condition, and the infinite spinner becomes "Offline — retrying."
4. **Add `error.tsx` per route group** (research, compete, broadcast, work) so a failed fetch has
   somewhere to render.
5. **Compete: keep parsed rows on upload failure** and offer Retry (`performance/page.tsx:135-143`) —
   no new infrastructure, and it removes the worst athlete-facing data loss in the product.
6. **Overlay: refetch session state when `.subscribe()` reports `SUBSCRIBED` again**
   (`lib/useOverlaySession.ts:303-305`, `:156-158` in `useProducerOverlay.ts`). Design belongs to the
   Realtime doc; the framing here is that a four-second OBS blip is this product's real outage.
7. **Only then** consider an outbox for `work_tasks`, and only for `work_tasks`.

**Anti-recommendation: do not build a Background Sync outbox that queues writes while offline.**
(1) **It makes failures durable.** Rollback is broken at `WorkBoard.tsx:523-538`; a queued write that
later fails RLS resolves with `{ error }` into a handler nobody is watching, minutes after the user
left the screen — a wrong pixel becomes a wrong row with no observer. (2) **It misses the surface
that needs it.** Background Sync is "not Baseline because it does not work in some of the most
widely-used browsers" and guarantees no timing, so it skips the iPhones in the facility — the entire
Compete case — and you ship a foreground fallback anyway. (3) **There is no layer to hang it on.**
Zero `useMutation` call sites means building the mutation layer, the persister, and the conflict
policy at once, for a payoff of a handful of card drags. Porting the PWA offline-sync playbook into
read-mostly analytics is the definition of **(cargo-cult)**.

**Highest-leverage next action:** ship item 1 — the ~10-line `public/sw.js` fix plus the `/offline`
precache. One file, no dependencies, and it turns a worker that makes offline navigation *worse* than
no worker into the honest state Triton already wrote a page for.

## Sources

- [MDN — `CacheStorage.match()`](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage/match) — the fact that kills `sw.js:47`: always a Promise, `undefined` on a miss.
- [MDN — `FetchEvent.respondWith()`](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent/respondWith) — why resolving to `undefined` is a network error, not a fall-through.
- [web.dev — Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle) — the version skew `skipWaiting()` invites at `sw.js:4`.
- [MDN — `skipWaiting()`](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting) — the contract Triton's bare call does not honor.
- [MDN — `ExtendableEvent.waitUntil()`](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil) — what `install` must do for a precache to exist.
- [web.dev — The offline cookbook](https://web.dev/articles/offline-cookbook) — the strategy taxonomy §2's table is graded against.
- [Chrome — `workbox-expiration`](https://developer.chrome.com/docs/workbox/modules/workbox-expiration) — `maxEntries`/`maxAgeSeconds`, the bound `sw.js:29-42` lacks.
- [web.dev — Storage for the web](https://web.dev/articles/storage-for-the-web) — eviction is per-origin: the real cost of unbounded growth.
- [TanStack Query — Network mode](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode) — `fetchStatus: 'paused'` and the spinner warning quoted in §5.
- [MDN — `navigator.onLine`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine) — "provide hints" only; the captive-portal false positive.
- [MDN — Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) — "not Baseline", no timing guarantee: ground 2 of the anti-recommendation.

**Triton-internal evidence.** Service worker read end to end at `public/sw.js:1,3-5,7-14,21-27,29-42,45-49`
(51 lines); registered at `components/ServiceWorkerRegistration.tsx:9` with `.catch(() => {})` and no
update coordination, mounted at `app/layout.tsx:59`. `app/offline/page.tsx:1-13` exists, uses
`var(--font-bebas)` at `:5`, unreachable through `sw.js:47`. `public/manifest.json` declares
`display: standalone`, `start_url: "/"`. react-query defaults at `lib/QueryProvider.tsx:11-16`
(`staleTime` 5 min, `gcTime` 10 min, `retry: 1`, `refetchOnWindowFocus: false`, no `networkMode`).
Network-signal greps over `app/ components/ lib/ public/`, 2026-08-21, tabulated in §5; the
`effectiveType` locals are in `components/broadcast/TemplateDataPanel.tsx`, the `saveData` locals at
`app/(research)/analyst/page.tsx:141` and `components/broadcast/AssetLibrary.tsx:414`.
`find app -name 'loading.tsx' -o -name 'error.tsx'` returns nothing against 96 `page.tsx` files.
Compete upload path `app/(compete)/compete/performance/page.tsx:119-147`; rollback asymmetry at
`components/work/WorkBoard.tsx:463-474`, `:477-485` versus `:523-538`; overlay reconnect at
`lib/useOverlaySession.ts:125,135,303-305` and `lib/useProducerOverlay.ts:156-158`. Central packet
2026-08-21, commit `d6147f0`; mobile-side account of the same worker bug in
`Cas/frontend-data-scale/09-mobile-performance-constraints.md`.
