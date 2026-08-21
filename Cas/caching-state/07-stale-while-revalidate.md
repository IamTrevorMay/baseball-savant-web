---
title: Stale-While-Revalidate — Serving Old Data Is Fine, Not Saying So Is Not
domain: caching-state
tags:
  - stale-while-revalidate
  - cache-control
  - react-query
  - staleness-signals
  - background-refresh
  - broadcast-overlay
  - data-age
  - honest-presentation
sources_reviewed: 10
last_updated: 2026-08-21
---

# Stale-While-Revalidate — Serving Old Data Is Fine, Not Saying So Is Not

> Grades: **(verified)** read at `file:line`; **(documented)** spec or vendor docs; **(inferred)**
> mechanism reasoned from both; **(cargo-cult)** repeated without support. No production query was run.

## TL;DR

- **Two unrelated things are called "SWR" and Triton uses exactly one** — the RFC 5861 `Cache-Control` directive, in 28 places. The `swr` React library is absent from `package.json`; `useSWR` appears zero times. (verified)
- **Triton runs stale-serving at three mutually unaware layers, and each implemented a different half of the pattern — the wrong halves.** react-query serves stale forever and never revalidates; `queryCache` revalidates but refuses to serve stale. Only HTTP does both. (verified)
- **Worst case on `/api/trends` is 6 h + 1 h + 24 h = 31 h of cache age, then unbounded** — `staleTime: Infinity` plus a global `refetchOnWindowFocus: false` means a tab never refetches. (verified)
- **Half of Triton's `stale-while-revalidate` headers are inert, on the wrong half of the routes.** 12 of 24 files set `max-age` with no `s-maxage`, which Vercel's CDN will not cache — and those are the analytics routes, while the trivia game gets the edge cache. (documented)
- **Every layer knows the age and every layer discards it** — HTTP `Age`, `query_cache.created_at`, `dataUpdatedAt`. Zero read sites. HTTP once had an explicit stale signal and RFC 9111 deleted `Warning: 110` because it "is not widely generated or surfaced to users." (documented)
- **`app/api/scene-stats/route.ts:1688` puts a 25-hour maximum served age on the route that pushes stats to a live broadcast.** A stale number on air is not degraded UX, it is a false statement. (verified)
- **`lib/hooks/useStandings.ts:25` is the model and it already exists** — `Infinity` for a completed season, 5 min for the live one. One ternary, correct. (verified)
- **Extending Cas's standing rule: a stale value must be able to state its age, and a surface that cannot should not render the number at all.** Nothing in the repo can. (inferred)
## 1. Two things named SWR — do not conflate them

This doc is about the **HTTP `Cache-Control` directive** (RFC 5861), set on a response and honoured
by browser and CDN caches: **28 occurrences across 24 route files** (verified). It is *not* about
Vercel's `swr` React library, which is **absent** — not in `package.json`, 0 `useSWR` call sites
(verified). The library's name derives from the directive, so conflating them sends someone editing
hooks when the problem is a header; Triton's client-side equivalent is `@tanstack/react-query`.
Semantics (documented): `max-age=N, stale-while-revalidate=M` serves fresh for `N`, then stale
without blocking for `M` while revalidating, then hard-misses.

## 2. Three layers, each holding the wrong half

| Layer | Serves stale? | Background revalidate? | Max served age | Age observable? |
|---|---|---|---|---|
| **L1** react-query (`lib/QueryProvider.tsx:12-15`; 9 × `staleTime: Infinity`) | Yes, permanently | **No** | Tab lifetime — unbounded | `dataUpdatedAt` exists, **0 read sites** |
| **L2** HTTP `Cache-Control` (24 route files) | Yes, bounded | Yes (browser) | `max-age + swr`: 65 min – 25 h | `Age`/`Date` on the wire, **0 read sites** |
| **L3** `lib/queryCache.ts` (`query_cache` table) | **No** | No | 6 h, then a blocking miss | `created_at` written, **not selected** |

**L1 is stale-serving with the revalidate half switched off.** `refetchOnWindowFocus: false` is
global (`lib/QueryProvider.tsx:15`) and `staleTime: Infinity` appears at nine hook sites. Documented
refetch triggers — mount, focus, reconnect — fire only for *stale* queries, and a query that is never
stale fires none of them. The player dashboard is one of these. (verified)

**L3 is the exact inverse.** `lib/queryCache.ts:21` filters `.gt('expires_at', now)`, so an entry one
second past its 6-hour TTL returns `null` — a hard miss paying full aggregation cost against 7.4M+
rows. (verified)

That inversion is the finding. **L1 sits closest to the user, where hiding a revalidation is
cheapest, and never revalidates. L3 sits furthest away, where a cold miss is most expensive, and
refuses the one thing that would hide it.**

### L2 is half-inert, on the wrong half of the routes

Vercel caches a function response only when `Cache-Control` carries `s-maxage` (documented);
`max-age` alone is a browser instruction and nothing more.

| Form | Files | Which routes |
|---|---|---|
| `max-age=…, swr=…` (**CDN ignores**) | 12 | the analytics routes — `player-data`, `trends`, `scene-stats`, `league-baseline`, `movement-percentiles`, … |
| `s-maxage=…, swr=…` (**CDN honours**) | 12 | `game/*` (6), `news`, `milb/news`, `hot`, `bat-tracking`, … |

For the top row the "free" part of the pattern — one user's revalidation warming the cache for
everyone else — never happens; each browser holds a private stale copy. (verified)

## 3. The compounding, computed honestly

`/api/trends` traverses all three layers, so it bounds the worst case.

| Step | Source | Contribution |
|---|---|---|
| L3 `query_cache` hit | `app/api/trends/route.ts:122` — `ttlSeconds: 21600` | up to **6 h** |
| L2 browser fresh window | `app/api/trends/route.ts:19,125` — `max-age=3600` | up to **1 h** |
| L2 browser stale window | same line — `stale-while-revalidate=86400` | up to **24 h** |
| L1 react-query hold | `lib/hooks/useTrendsData.ts:178,188` — `staleTime: Infinity` | **unbounded** |

**31 hours of cache age at the last fetch, then however long the tab stays open.** `gcTime` does not
rescue this: collection only evicts queries with no mounted observer. (inferred)

Now stack the upstream. `planning.md:301` records the nightly refresh chain dead since 2026-06-26 —
52 runs, 50 timeouts, **0 successes, every one logged `status='success'`** — leaving
`league_averages` **46 days stale** and `league_percentiles` **69 days**. `/api/league-baseline`
reads that table (`:63`), sets `max-age=3600, stale-while-revalidate=86400` (`:94`), and is consumed
by `lib/useLeagueBaseline.ts:48` at `staleTime: Infinity`. A plus-stat on screen can therefore be
**46 days + 25 h + tab age** old, every layer behaving exactly as configured.

**Fixing the chain is Jo's** (`Jo/data-reliability/`); **judging the numbers is Li's**
(`Li/metric-governance/`). Cas's question is narrower and unanswered by either: *could the screen
have known?* Yes — three times over.

## 4. Every layer knows the age; nothing reads it

| Signal | Where it already exists | Read by |
|---|---|---|
| HTTP `Age` | RFC 9111 §4.2.3 — a cache **MUST** generate it, equal to `current_age` | nothing |
| `x-vercel-cache` | Vercel returns HIT/MISS/STALE on every response | nothing |
| `query_cache.created_at` | written at `lib/queryCache.ts:41` | **not selected** — `:19` is `.select('response')` |
| `league_averages.updated_at` | `scripts/create-league-averages.sql:25`, `NOT NULL DEFAULT now()` | not selected by `league-baseline/route.ts:63` |
| `dataUpdatedAt` | returned by every `useQuery` | 0 sites |
| `system_metadata.mv_last_refreshed` | 3 server files | **one** UI: `app/(admin)/admin/page.tsx:209`, raw string, no age math |

Two corrections to the standing briefing, both verified. `mv_last_refreshed` **is** rendered — on
`/admin` only, as a raw string with no elapsed-time computation and no threshold; no analytics
surface reads it. And `app/api/league-baseline/route.ts:63` already `SELECT`s `n_qualified` — the
sample size — then drops it before responding at `:92`. The coverage number Cas's standing rule
demands is fetched and thrown away one line early.

## 5. When serving stale is simply wrong

Serving stale is usually right. The distinction is not old-vs-fresh, it is **whether a wrong value
is recoverable by the reader**.

| Surface | Stale is | Why |
|---|---|---|
| `/standings`, completed season (`useStandings.ts:25`) | **Correct** | `season < currentYear ? Infinity : 5*60*1000` — the model to copy |
| `useScores.ts:47-48` | **Correct** | `refetchInterval: 30_000`, `staleTime: 0` for live scores |
| Player dashboard, reports | **Acceptable, undisclosed** | Analyst can re-run; nothing says the number is a day old |
| `app/overlay/[sessionId]`, `app/(broadcast)/producer/[sessionId]` | **Wrong** | An audience that cannot check, cannot refresh, has no reason to doubt |

The overlay case is categorically different. An analyst reading a stale Stuff+ holds a stale
*belief*; a viewer shown a stale count has been *told something false on camera* — no undo, no
disclosure channel. Yet `app/api/scene-stats/route.ts:1688` — the route `lib/useProducerControls.ts`
calls for every stat push — sets `max-age=3600, stale-while-revalidate=86400`: a **25-hour** maximum
served age on live output. It also calls plain `run_query` (`:15`), so it hard-fails at the 8 s cap
(`planning.md:40,46,304`). The on-air path is at once the most stale-tolerant and the least
failure-tolerant route in the repo. (verified)

## 6. The threshold nobody has set

A refuse-to-render threshold is a design decision, not a technical one, and it has never been made.
Proposed rule, tied to the promise each source makes rather than a taste-based constant:

> **Warn at 2× the source's promised refresh interval. Refuse to render the number at 7×.**

Seven consecutive misses of a daily job is not a delay, it is an outage, and no honest surface
asserts a number through one.

| Source | Promised interval | Show age | Refuse to render |
|---|---|---|---|
| Live overlay in-game state | Realtime | always | > 5 min |
| `league_averages` / plus-stats | nightly | > 48 h | > 7 days |
| Completed seasons, career totals | immutable | never | never |

Applied to the real incident: the chain died 2026-06-26, so the 2× warning fires 2026-06-28 and the
7× blank fires **2026-07-03**. The reliability audit found it 2026-08-11 — the rule would have put
it on screen **39 days earlier**, with nobody monitoring anything. (inferred)

## What Triton should do, in order

1. **Add `updated_at` to the `.select()` at `app/api/league-baseline/route.ts:63`, returning it with the already-fetched `n_qualified` as `meta.asOf` / `meta.n`**, then pass `meta` through `lib/useLeagueBaseline.ts` with one display rule: age > 48 h annotates the value, age > 7 days renders `—` and a tooltip naming the date. Two identifiers on the exact path that carried a 46-day-old number to screen.
2. **Change `lib/queryCache.ts:19` to `.select('response, created_at')`**, have `getCached` return `{ value, ageSeconds }`, and echo it from both consumer routes as `X-Data-Age`.
3. **Add `s-maxage` alongside `max-age` on the 12 analytics routes**, so revalidation amortizes across users instead of running privately in N browsers.
4. **Cut `scene-stats` to `s-maxage=60, stale-while-revalidate=30` for in-game metrics**, keeping the long window only for season-to-date. Broadcast is the one surface where a blocking fetch beats a confident lie.

**Anti-recommendation: "remove `stale-while-revalidate` and drop the `staleTime`s to zero so users
always see fresh data."** Killed on three grounds. **(a) It does not touch the failure that
happened** — a fresh fetch of a 46-day-stale row returns a 46-day-old number with *more* apparent
authority; transport freshness is not data freshness. **(b) The latency lands with nowhere to put
it** — removing L3's TTL turns every `/api/trends` hit into a live aggregation over 7.4M+ rows, and
with 0 `loading.tsx` across 96 pages that surfaces as a frozen screen, not a spinner. **(c) It is
the wrong lever for the broadcast case**, where the defect is that `lib/useOverlaySession.ts:156`
never refetches authoritative state on reconnect; no header fixes a missed-event divergence that
displays `connected: true`.

**Single highest-leverage next action:** add `updated_at` to the `.select()` at
`app/api/league-baseline/route.ts:63` and return it as `meta.asOf` — one line, on the one route whose
output was provably wrong for 46 days.

## Sources

- [RFC 5861 — Cache-Control Extensions for Stale Content](https://www.rfc-editor.org/rfc/rfc5861) — normative `stale-while-revalidate`; §1's "without blocking".
- [RFC 9111 — HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111) — §4.2.3: a cache MUST generate `Age` on a reused response; §4's table.
- [web.dev — stale-while-revalidate](https://web.dev/articles/stale-while-revalidate) — the fresh/stale/expired windows §3 computes with.
- [MDN — `Cache-Control`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) — the `max-age` vs `s-maxage` split that makes 12 headers edge-inert.
- [MDN — `Age`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Age) — `Age` as seconds-in-cache: the signal Triton receives and discards.
- [Vercel — CDN Cache](https://vercel.com/docs/edge-network/caching) — CDN caching requires `s-maxage`; `x-vercel-cache`. Basis for §2.
- [TanStack Query — Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) — refetches fire only for *stale* queries, so `staleTime: Infinity` fires none.
- [TanStack Query — Caching](https://tanstack.com/query/latest/docs/framework/react/guides/caching) — the `gcTime` lifecycle behind §3, and `dataUpdatedAt`.
- [SWR (Vercel) — Getting Started](https://swr.vercel.app/docs/getting-started) — the *library* named SWR, cited only to separate it from the directive.
- [AWS Builders' Library — Caching challenges and strategies](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/) — thundering-herd reasoning behind recommendation 4 and L3's correlated misses.

**Triton-internal evidence.** Measured 2026-08-21 at commit `d6147f0`. SWR directive: 28 occurrences across 24 route files, of 30 setting `Cache-Control`; `app/api/player-data/route.ts:55` = `public, max-age=300, stale-while-revalidate=3600`; CDN eligibility splits 12/12, the `max-age`-only dozen including `trends:19,125`, `scene-stats:1688`, `league-baseline:94`, `movement-percentiles:47,104`, `pitcher-outing:64,238`. L1: `lib/QueryProvider.tsx:12-15`; `staleTime: Infinity` at `usePlayerData.ts:169,226`, `useHitterData.ts:200,228`, `useTrendsData.ts:178,188`, `useABSData.ts:151`, `useExploreData.ts:157`, `lib/useLeagueBaseline.ts:48`; counter-examples `useStandings.ts:25`, `useScores.ts:47-48`. L3: `lib/queryCache.ts:19` selects only `response`, `:21` makes expiry a hard miss, `:32` TTL 21600 s, `:41` writes `created_at`; consumers `trends/route.ts:16,74,110,122` and `movement-percentiles/route.ts:44,100`. Age signals: `scripts/create-league-averages.sql:25`; `league-baseline/route.ts:63-64` selects `n_qualified` but returns only `{ value, stddev }` at `:92-93`; `system_metadata` at `cron-health/route.ts:42`, `cron/refresh/route.ts:35,138`, `cron/pitches/route.ts:55`, surfaced only at `app/(admin)/admin/page.tsx:207-209`, while `cron-health/route.ts:49-53` computes `age_minutes` for jobs but not data. Broadcast: `scene-stats/route.ts:15,1688`, callers `lib/useProducerControls.ts:40,108,131-132,161-162,199,223`, `lib/useOverlaySession.ts:156`. Absences: 0 `loading.tsx`, 0 `error.tsx` across 96 `page.tsx`; `swr` absent from `package.json`; 0 reads of `dataUpdatedAt`/`isStale`. Incident and timeouts: `planning.md:301`, `planning.md:40,46,304`.
