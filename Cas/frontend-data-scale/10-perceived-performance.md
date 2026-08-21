---
title: Perceived Performance — Making a Slow Query Feel Intentional Without Lying
domain: frontend-data-scale
tags:
  - perceived-performance
  - response-time-thresholds
  - skeleton-screens
  - optimistic-ui
  - progressive-reveal
  - stale-cache
  - broadcast-latency
  - suspense
sources_reviewed: 14
last_updated: 2026-08-21
---

# Perceived Performance — Making a Slow Query Feel Intentional Without Lying

> Cas owns **time**: what the screen does between click and number. Naming the state is
> `analytics-ux/08-loading-empty-error-states.md`; what the number may claim is
> `analytics-ux/01-honest-data-presentation.md`. Grades: **(verified)** read at `file:line`;
> **(documented)** literature/vendor docs; **(inferred)** mechanism; **(cargo-cult)** unsupported.

## TL;DR

- **Triton's worst perceived-performance defect is latency it adds on purpose**: `usePlayerData.ts:263-269` holds an already-computed filtered array behind a 300 ms `setTimeout` — a debounce placed *after* the work. **(verified)**
- **No time-shaped boundaries, and React 19.2.3's tools unused**: 0 `loading.tsx`, 0 `error.tsx` across 96 pages; 5 `Suspense` wrappers, all `useSearchParams` guards; zero `useTransition`/`useDeferredValue`/`useOptimistic` call sites. **(verified)**
- **"Skeletons feel 30–50% faster" is folklore**: the one published head-to-head put them *worst* — 2.82 s perceived vs 2.41 s spinner, 2.29 s blank (n=136). **(cargo-cult)**
- **The 0.1/1/10 s triad is Nielsen's synthesis of Miller 1968 and Card 1991, not a measured constant**; for click-to-paint use INP's 200 ms. **(documented)**
- **Two deadline regimes, one spinner**: `run_query` fails hard at 8 s, `run_query_long` runs to 120 s — a two-minute wait and an 8 s failure look identical. **(verified)**
- **"Fast because cached" is honest only when labelled**: `staleTime: 5 min` + `refetchOnWindowFocus: false` over a 6 h server cache renders old numbers instantly, unmarked. **(verified)**
- **Optimistic rendering is honest only where reversal is reachable**: WorkBoard's drag rollback sits in a `catch` no Supabase error enters, so a rejected move looks saved. **(verified)**
- **Progressive reveal is honest on the rows-you-can-see axis, dishonest on the rows-in-the-denominator axis**: a table may fill in, an average may not. **(inferred)**
- **On air there is no skeleton** — last-known-labelled or nothing; and a fake progress bar loses to operational transparency, which raises tolerance for waiting. **(documented)**

## 1. Triton's latency map

| Path | Server deadline | Client cap | Treatment today |
|---|---|---|---|
| `player-data` → `run_query_long` | **120 s** (`proconfig`, hoisted) | 120 s | full-screen spinner |
| `scene-stats` → `run_query` | **8 s** `authenticator` | 120 s (moot) | button reads "Pushing…" |
| Client-side filter | none — main thread | none | **300 ms debounce, self-imposed** |

An 8 s path's worst case is a **hard failure**, not a slow success — past 8 s there is nothing left to wait for — while the 120 s path's worst case is a real two-minute wait drawn with the same spinner. **An indicator that cannot separate "will fail at 8 s" from "may succeed at 90 s" is animating, not communicating.** *(inferred)* Mechanics: `Jo/postgres-performance/03-timeouts-locks-concurrency.md`.

## 2. What the thresholds actually say

Nielsen attributes his 0.1/1/10 s limits to **Miller (1968)** and **Card, Robertson & Mackinlay (1991)**. Miller's paper is a taxonomy of transaction classes with differing tolerances, not an experiment yielding three constants: the triad is a synthesis, attributed correctly by Nielsen and flattened by everyone quoting him third-hand. **(documented)**

| Budget | Basis | Triton interaction | Correct treatment |
|---|---|---|---|
| ~100 ms | "instantaneous" | tab switch, sort, chip toggle | no indicator |
| **200 ms** | INP "good", 75th pct | filter chip → repainted table | none — the one enforceable budget |
| ~1 s | flow of thought | year change, tile re-render | keep prior content, mark in flight |
| 1–10 s | attention held | the 8 s query paths | say what runs, against what |
| >10 s | attention lost | 120 s `player-data` | determinate progress or partials |

INP is the only one with a current spec behind it. **An indicator for a sub-200 ms wait manufactures the impression of work.** *(inferred)*

## 3. The 300 ms Triton adds on purpose

```ts
// lib/hooks/usePlayerData.ts:256-269 (twin at useHitterData.ts:258-271)
const filteredData = useMemo(() =>              // ← the expensive pass runs here
  applyFiltersToData(seasonFilteredData, activeFilters), [seasonFilteredData, activeFilters])

useEffect(() => {                                // ← …then the result waits 300 ms
  const timer = setTimeout(() => { setData(filteredData); setResultCount(filteredData.length) }, 300)
  return () => clearTimeout(timer)
}, [filteredData])
```

The debounce sits downstream of the computation: `applyFiltersToData` has already scanned up to 50,000 rows before the timer starts, so it delays only *publication* of a value in memory. A debounce earns its latency by preventing work; this one prevents none, and pushes a finished local operation past the 200 ms INP budget on the busiest interaction on the analyst surface. **(verified)** `useDeferredValue` does it right and has zero call sites. **(documented)** The page gets one thing right: `player/[id]/page.tsx:124-125` puts a spinner *beside* a live `resultCount` rather than replacing it. **(verified)**

## 4. Skeletons: the evidence, and the cargo-cult versions

Viget's three-condition test (n=136) found skeletons **worst on every measure**: 2.82 s mean perceived wait vs 2.41 s spinner and 2.29 s blank, 59% vs 74% agreement that the page "loaded quickly". Other studies disagree; the effect is small and context-dependent. **(cargo-cult)**

| Practice | Status | Why |
|---|---|---|
| Skeleton shaped unlike the final layout | **cargo-cult** | pays the layout-shift cost, gains nothing |
| Artificial minimum display time | **cargo-cult** | adds latency to hide a flicker; delay *before* showing |
| Indeterminate spinner past ~10 s | **cargo-cult** | reads as hung, and outlives an 8 s query |
| Grid-shaped skeleton after ~400 ms | defensible | anticipation without inventing a wait |

Triton's are the good kind and rare — `animate-pulse` in 23 files vs `animate-spin` in 70; `app/(research)/trends/page.tsx:59-70` matches its five real highlight cards. **(verified)** But **never skeleton a number**: if the value behind the grey bar came from a partial or stale result set, the skeleton made the page feel fast *and* lied.

### Progressive reveal: which axis is incomplete

| Reveal axis | Example | Honest? |
|---|---|---|
| Rows visible | paint 200 of 50,000, extend on scroll | yes — the boundary shows |
| **Rows in a denominator** | an average updating as rows arrive | **no** — every intermediate overclaims |
| **Coverage** | a tile rendering before it knows its null rate | **no** — the Stuff+ outage's shape |

A ticking number implies convergence; a partial aggregate guarantees none. **Aggregates are all-or-nothing: they render when they can state `n`.** *(inferred)* Streaming: `04-pagination-streaming-patterns.md`; minimum `n`: `Li/statistical-inference/09-small-sample-communication.md`.

## 5. Optimistic rendering: honest and dishonest forms

Optimistic UI is legitimate when the outcome is **predictable**, the render **reversible**, and failure **visible to whoever caused it**.

| Mutation | Predictable? | Reversal wired? | Verdict |
|---|---|---|---|
| `updateTask` (`WorkBoard.tsx:463-474`) | yes | yes — snapshot restored on `error` | honest |
| `deleteTask` (`:477-485`) | yes | yes — snapshot re-appended | honest |
| Drag reorder (`:523-539`) | yes | **no** — `catch` only; `supabase-js` *resolves* with `{ error }` | **broken** |
| Producer push (`useProducerControls.ts:266-311`) | **no** — server data | n/a | correctly pessimistic |

`onDragEnd` wraps its writes in a bare `try/catch`, but a PostgREST/RLS rejection is a resolved promise, not a throw — so only a network failure reaches `fetchTasks()`, and a rejected move sits on the board looking saved. **(verified)** Mechanics: `caching-state/05-optimistic-updates-rollback.md`. Cas's rule: **unconfirmed state must look different from confirmed, and unwinding must be reachable from every failure mode — not just the one that throws.** *(inferred)*

## 6. Where speed collides with honesty

`lib/QueryProvider.tsx:12-15` is a perceived-performance policy, written as one or not.

| Setting | Perceived effect | Honesty cost |
|---|---|---|
| `staleTime: 5 * 60 * 1000` | navigation inside 5 min is instant | that render may be 5 min old |
| `refetchOnWindowFocus: false` | no spinner on refocus | **a returning user sees old numbers, unmarked** |

Behind it: `lib/queryCache.ts:32`, a DB-backed cache with a **6 h** TTL, and `Cache-Control: max-age=300, stale-while-revalidate=3600` at `app/api/player-data/route.ts:55` — three staleness windows, mutually unaware, none surfaced, while `mv_last_refreshed` reaches no user surface (hazard #5). **(verified)** The fix is not a slower app: **instant-from-cache and instant-from-fresh must look different**, and TanStack exposes the bit (`isFetching` vs `status`; `isPlaceholderData`). **(documented)** Invalidation: `caching-state/07-stale-while-revalidate.md`.

## 7. On air, the rules invert

1. **No skeletons, no spinners on the output.** A pulsing grey bar over live video is a graphics failure on camera; the honest options are *last known good, labelled with its age* or *nothing*.
2. **Escalate to the producer, not the audience.** `app/overlay/[sessionId]/page.tsx:76-88` draws disconnection as an 8×8 px red dot — right instinct, invisible at broadcast scale — and `:33-38` prints "Connecting…" in 14 px grey. **(verified)**

The producer's budget is the 8 s cap (`app/api/scene-stats/route.ts:15` calls `run_query` through the 120 s client), and the button holds "Pushing…" for all of it with no elapsed signal. **A push unlanded at ~2 s should say what it waits on; at 8 s it should fail loudly to the producer and change nothing on air.** *(inferred)* Legibility: `analytics-ux/11-broadcast-overlay-legibility.md`.

## 8. What Triton should do, in order

1. **Delete the 300 ms debounce** (`usePlayerData.ts:263-269`, `useHitterData.ts:265-271`); if the filter pass is truly slow, use `useDeferredValue`.
2. **Split wait treatment by deadline regime**: 8 s paths fail at 8 s with cause ("Query exceeded 8 s — narrow the date range"), 120 s paths show elapsed time.
3. **Add `isFetching` + `asOf` to the metric-cell affordance** proposed in `analytics-ux/01`, so a cache-fast render looks like one. Closes hazard #5.
4. **Fix the drag rollback**: destructure `{ error }` as `updateTask` does; style the card as unconfirmed until the write lands.
5. **Adopt `loading.tsx` on three routes** — player, reports, trends — skeletons after ~400 ms.
6. **Give the producer a push deadline**: elapsed counter at 2 s, hard fail at 8 s.

**Anti-recommendation: do not roll skeleton screens out across the 96 pages.** The obvious move — 70 spinner files, 23 pages already have them, it looks modern — fails three ways. *(a) The evidence is not there*: the one controlled head-to-head measured skeletons **worse** than a spinner and a blank screen (2.82 / 2.41 / 2.29 s). *(b) Wrong target*: the felt latency is a 300 ms debounce plus an 8 s cap, and no fallback UI moves either. *(c) It scales the honesty bug*: a skeleton resolving into an aggregate over a partial or stale result set makes a false number feel authoritative — for an operator who will notice that the resolve is prettier than the data.

**Highest-leverage next action:** delete the two `setTimeout(..., 300)` blocks — a two-line diff removing 300 ms from every filter interaction on the pitching and hitting dashboards, with no design decision attached.

## Sources

1. Miller (1968) — [Response time in man-computer conversational transactions](https://dl.acm.org/doi/10.1145/1476589.1476628) — §2's primary; a taxonomy, not 3 numbers.
2. Card, Robertson & Mackinlay (1991) — [The information visualizer](https://dl.acm.org/doi/10.1145/108844.108874) — §2's other primary.
3. NN/g — [Response Times: 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) — the synthesis and its attribution.
4. Viget — [A Bone to Pick with Skeleton Screens](https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens/) — §4's n=136 test.
5. Kadlec — [Effective Skeleton Screens](https://timkadlec.com/remembers/2020-11-02-skeleton-screens/) — why shape must match the layout.
6. Buell & Norton (2011) — [The Labor Illusion](https://pubsonline.informs.org/doi/10.1287/mnsc.1110.1376) — shown real work, longer waits preferred.
7. Harrison et al. (2007) — [Rethinking the Progress Bar](https://dl.acm.org/doi/10.1145/1294211.1294231) — pacing alters perceived duration.
8. web.dev — [Interaction to Next Paint](https://web.dev/articles/inp) — the 200/500 ms thresholds §2–§3 use.
9. Next.js — [`loading.js`](https://nextjs.org/docs/app/api-reference/file-conventions/loading) — the per-segment boundary Triton lacks.
10. React — [`useDeferredValue`](https://react.dev/reference/react/useDeferredValue) — §3's debounce done right.
11. React — [`useOptimistic`](https://react.dev/reference/react/useOptimistic) — the revert model §5 hand-rolls wrongly.
12. TanStack Query — [Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) — what §6's settings do.
13. TanStack Query — [Paginated queries](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries) — `isPlaceholderData`, for §6.
14. PostgreSQL — [`statement_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html) — why §1's cap fails hard.

**Triton-internal evidence.** Repo read 2026-08-21 at commit `6555039`; no production query run. Debounce: `lib/hooks/usePlayerData.ts:256-259` (`useMemo` → `applyFiltersToData`, `lib/filterEngineCore.ts:132`) then `:263-269`; twin `lib/hooks/useHitterData.ts:258-271`. Payload: `app/api/player-data/route.ts:44` ends `LIMIT 50000` via `run_query_long` at `:45`, `Cache-Control` at `:55`. Deadlines: `run_query_long.proconfig` = `statement_timeout=120s` vs `authenticator` 8 s, no override on `run_query` (`docs/reliability-findings-2026-08-11.md:20-68`); client caps `lib/supabase-admin.ts:17,20`; `scene-stats:2,15`. Waits: `app/(research)/player/[id]/page.tsx:45-53`, `:124-125`; `animate-pulse` 23 files vs `animate-spin` 70; skeleton `trends/page.tsx:59-70`. Absences: `find app \( -name loading.tsx -o -name error.tsx \)` → 0 across 96 pages; zero call sites for `useTransition`, `useDeferredValue`, `useOptimistic`, `isFetching`, `keepPreviousData`; 5 page-level `Suspense` guards (`app/(research)/reports/page.tsx:930`, `app/(launcher)/page.tsx:248`). Caching: `lib/QueryProvider.tsx:12-15`; `lib/queryCache.ts:32` TTL 21600 s. Optimistic: `components/work/WorkBoard.tsx:463-474`, `:477-485` roll back from `{ error }`; `:523-539` uses a bare `try/catch` that a resolved-with-error PostgREST response cannot enter. Live: `lib/useProducerControls.ts:266-311` awaits the fetch before `channel.send`; `components/producer/ProducerContext.tsx:118-126` sets `pushing`, rendered at `PanelTargetButtons.tsx:35,44`; overlay `app/overlay/[sessionId]/page.tsx:33-38`, `:76-88`. Not re-measured: repo counts, versions and the Stuff+ decay — from the 2026-08-21 packet.
