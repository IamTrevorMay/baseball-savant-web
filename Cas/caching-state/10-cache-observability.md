---
title: Cache Observability — Telling a Working Cache From a Dead One
domain: caching-state
tags:
  - cache-observability
  - hit-rate
  - cache-age
  - silent-invalidation
  - instrumentation
  - x-vercel-cache
  - query-cache
last_updated: 2026-08-21
sources_reviewed: 13
---

# Cache Observability — Telling a Working Cache From a Dead One

> Enforcement doc for `caching-state/`. Siblings 01 and 03 design invalidation and the app cache;
> this one asks whether either is *doing what it claims*. Grades: **(verified)** read at `file:line`
> or from the 2026-08-21 packet · **(documented)** vendor docs · **(inferred)** mechanism ·
> **(cargo-cult)** ritual. Data freshness is Jo's — handoffs in §4.

## TL;DR

- **`getCached` returns `null` identically for a miss, an expiry, and a total cache failure** — `lib/queryCache.ts:24`, `if (error || !data) return null`. A cache failing 100% of reads is indistinguishable from a cold one. (verified)
- **Nothing in the repo counts a hit or a miss at any of the four layers** — no counter, no `X-Cache` header, no log line. Hit rate today is not low or high; it is unknown. (verified)
- **The chokepoint already exists and has zero callers**: `lib/observability.ts:23-26` exports `logApiEvent`, whose own doc comment names "cache hits". (verified)
- **Invalidation failure is silent by construction** — `app/api/cron/pitches/route.ts:66-70` and `app/api/cron/refresh/route.ts:161-165` both end in a bare `.catch(() => {})`. (verified)
- **This failure shape has already run seven weeks here**: 52 refresh runs, 50 timeouts, 0 successes, all logged `status='success'` (`planning.md:301`). Swallowed errors plus no counters equals silent decay. (verified)
- **A dashboard built from `CACHE_TAG_REGISTRY` would monitor five things that do not exist** — 5 of 7 prefixes are written zero times. (verified)
- **A hit-rate proxy is available today with no new infrastructure**: `query_cache` rows carry `cache_key`, `created_at`, and `expires_at` — row count, age distribution, expiry pressure. (inferred)
- **An alert that has never fired is not known to work.** Every monitor below must be tripped against a deliberately broken cache before it counts. (inferred)

---

## 1. The defect that defines the domain: `null` means three things

```ts
// lib/queryCache.ts:17-24 — one .gt('expires_at', …).maybeSingle() lookup, then:
if (error || !data) return null
```

| Real state | Returns | Route does | Operator sees |
|---|---|---|---|
| Key absent (cold) | `null` | recompute, `setCache` | slow first request — correct |
| Key present, expired | `null` | recompute, `setCache` | slow request — correct |
| `query_cache` unreadable (RLS, timeout, dropped) | `null` | recompute, `setCache` **also fails** | slow forever, **no error anywhere** |

All three are one symptom with three causes, and the code discards the discriminator it holds: `error` is non-null in the third case and thrown away on the line that reads it. The honest fix is a discriminated return — `{ status: 'hit' | 'miss' | 'expired' | 'error', value, error }` — which costs nothing at runtime and makes every counter below possible. Until then layer 3 has one observable state: "not fast". Vercel's CDN draws the same distinction and is worth copying: a read failure is a `MISS` with reason **Error**, separate from reason **Cold**. (verified / documented)

---

## 2. Four layers, four different instruments

| Layer | Instrument today | Instrument to add | What it would answer |
|---|---|---|---|
| 1 · react-query | none — devtools not installed | `@tanstack/react-query-devtools` (dev-only); `getQueryCache().getAll()` → `state.dataUpdatedAt` | which queries are stale, how old this tab's copy is |
| 2 · HTTP / CDN | Vercel runtime logs | `x-vercel-cache` + `Age` on a `curl -I` | did the edge serve this, and how old was it |
| 3 · `query_cache` | none in code | discriminated `getCached` → `logApiEvent({ cache })`; `X-Cache` header | hit rate, and whether reads are failing |
| 4 · service worker | none | `caches.keys()` → `cache.keys()` in the DevTools console | is a stale `/_next/static/` bundle pinned here? |

`Age` — the proxy's clock minus the response `Date` — is the only layer-2 age signal needing no code. Layer 4 has **no age API at all**: `CacheStorage` exposes `keys`, `match`, `has`, `delete`, `open` and nothing about entry age, which is why `public/sw.js:29-42` serving `/_next/static/` cache-first with no expiry is an unobservable trap. `@vercel/analytics` (`app/layout.tsx:60`) fills none of these gaps — see `Cas/frontend-data-scale/11-profiling-measurement.md`. (documented / verified)

The highest-value addition is a response header, not a metrics backend: emit `X-Cache: HIT|MISS|ERROR` beside the existing `Cache-Control`. Today `app/api/trends/route.ts:18-20` and `app/api/movement-percentiles/route.ts:46-48` return the **identical** `Cache-Control` on hit and on miss, so the two are indistinguishable from outside the process too. (verified)

---

## 3. Invalidation is silent by construction

```ts
await Promise.all([gate ? Promise.resolve() : invalidateBySource('pitches'),
  purgeExpired()]).catch(() => {})   // pitches:66-70 · refresh:161-165
```

Three things are unobservable. Whether `invalidateBySource` ran — it is gated on `totalInserted` / `skipDownstream`. Whether it succeeded — the `.catch` erases that. And how many rows it removed: `invalidateCache` issues `.delete().like(...)` and discards the count, so "deleted 0 because the prefix matches nothing" and "deleted 400" are the same event; `count: 'exact'` fixes that for free. `purgeExpired()` sits in the same swallow — if it stops, `query_cache` grows unbounded and nothing says so. (verified)

---

## 4. The precedent, and where Jo's territory starts

`planning.md:301`: the nightly refresh chain has failed since 2026-06-26 — `proconfig = NULL`, capped at the `authenticator` role's 8 s — **52 runs, 50 timeouts, 0 successes, all logged `status='success'`**, leaving `league_averages` 46 days stale, undetected for about seven weeks.

That is not an analogy — it is the same two ingredients this domain has now: **errors swallowed at the call site** plus **no counter that could disagree with the success label**. A status field that only ever says `success` is not a monitor, and the cache layer has no status field at all. (verified)

The split, stated once: **whether the data is fresh, complete, and on time is Jo's** — `Jo/data-reliability/01-pipeline-observability-fundamentals.md`, `02-data-freshness-slos.md`, `11-serverless-cron-reliability.md`, `04-alerting-oncall-design.md`. **Cas's is narrower: given whatever the data is, does the cache report honestly about what it serves, and could the screen have known?** In June, no on both counts.

---

## 5. The registry describes an architecture that isn't running

Of 7 `CACHE_TAG_REGISTRY` prefixes only `trends:` (3 writes) and `mvpct:` (1) are ever used as keys; `player:`, `scene:`, `milb:`, `league:`, and `pctile:` are written **zero** times, and `invalidateBySource` is only ever called with `'pitches'`. A per-prefix dashboard built from that registry shows five permanently empty panels beside two real ones, and an operator learns within a week to ignore the board. **Instrument the two live prefixes; delete the five dead entries.** Monitoring fiction is worse than monitoring nothing — it teaches people to disbelieve the panel. (verified / inferred)

---

## 6. What can be seen today, with no new code

**`query_cache` shape.** One read-only query gives row count, age distribution, and expiry pressure — a hit-rate *proxy*, since a cache nobody reads and one with a 0% hit rate both look like "rows exist, all near expiry". Run it once, log it to `docs/Queries.md`, and treat it as a baseline, not a rate:

```sql
SELECT split_part(cache_key,':',1) AS prefix, count(*) AS rows,
  round(avg(extract(epoch FROM now()-created_at))/60) AS avg_age_min,
  count(*) FILTER (WHERE expires_at < now()) AS expired
FROM query_cache GROUP BY 1;
```

**Layer-2 hit rate from the Vercel dashboard.** Runtime logs filter on `cache:` (`HIT`, `MISS`, `STALE`, `PRERENDER`) with no instrumentation. Two caveats: retention is **1 day** on Pro, and the CDN only stores `GET`/`HEAD` responses carrying `s-maxage`. **12 of 30 route files set `s-maxage`; 18 do not** (bare `max-age`, e.g. `app/api/player-data/route.ts:55`), and `/api/trends` is a `POST` — for those, `MISS` is permanent and correct, and reading it as a cache problem is a misdiagnosis. (verified / documented)

**What is `(cargo-cult)` here:** chasing a headline hit-rate percentage. A 95% hit rate on a cache that stopped invalidating is worse than 40% on one that hasn't, and the number separates neither. The counters that matter are the ones that *should never move* — read errors, invalidation failures, entries older than their source. Redis exposes `keyspace_hits` and `keyspace_misses` separately, not as a ratio, for this reason. (documented)

---

## 7. Proving a monitor works before trusting it

A threshold that has never gone red is not a gate. Each monitor needs a deliberate break that trips it, and each break is cheap.

| Monitor | Deliberate break | Must trip |
|---|---|---|
| `getCached` returns `error` | point `supabaseAdmin` at a nonexistent table in a test | `status: 'error'`, not `'miss'` |
| invalidation ran and deleted N | call `invalidateBySource('milb_pitches')` | rows deleted = 0 → warn |
| cache age vs source age | write a `query_cache` row with `created_at` before `mv_last_refreshed` | stale-cache flag |

This is the chaos-engineering loop at its smallest useful scale: steady state, hypothesis, injected failure, attempted disproof. The symptom to alert on — per Prometheus's alerting guidance and Google's golden-signals chapter — is *the screen shows a number computed from data older than its source*: one comparison, not a metrics platform. (documented / inferred)

---

## What Triton should do, in order

1. **Fix `__tests__/lib/queryCache.test.ts`** — add `.maybeSingle()` to the mock chain. All 5 failing tests in the repo are this file; instrumentation added under a red suite will not be maintained. (Cas's standing priority #1.)
2. **Make `getCached` return a discriminated result**, with a test that fails before the change — the domain's blocking dependency.
3. **Emit `X-Cache: HIT|MISS|ERROR` and call `logApiEvent({ route, cache, ms })`** from the two consumer routes — the log function already exists and has no callers.
4. **Stop swallowing invalidation errors**: replace both `.catch(() => {})` with `.catch(e => reportError(e, …))` and return the deleted-row count from `invalidateCache`.
5. **Add `cacheRows`, `oldestEntryAge`, `lastInvalidate` to `/api/admin/cron-health/route.ts`**, rendered beside the `mvLastRefreshed` line at `app/(admin)/admin/page.tsx:207-209` — surface, auth gate, and fetch already exist.
6. **Delete the 5 dead `CACHE_TAG_REGISTRY` prefixes** so step 5's panel shows only real things.
7. **Trip each monitor against a broken cache** (§7) before anyone is told to rely on it.

**Anti-recommendation: do not add Sentry, OpenTelemetry, or a metrics backend first.** Three independent grounds. (a) It cannot help: `getCached` collapses miss and error *before* any exporter sees it, so a perfect pipeline would faithfully export an undifferentiated `null` — step 2 is a hard prerequisite. (b) It is redundant where it would help most: Vercel already classifies every CDN response `HIT`/`MISS`/`STALE`/`BYPASS`/`PRERENDER`/`REVALIDATED` and filters logs on it for free. (c) It inverts the cost curve for a one-operator platform — steps 2–4 are ~30 lines against a vendor integration, a DSN, and a bill, for a question a response header answers in the Network panel.

**Highest-leverage next action:** change `lib/queryCache.ts:16-25` to return `{ status, value, error }` instead of `T | null`, with a Vitest case proving a Supabase read error surfaces as `'error'`, not `'miss'`. Everything else here is blocked on that distinction existing.

## Sources

1. Vercel — [CDN Cache](https://vercel.com/docs/caching/cdn-cache) — cacheability criteria behind §6's `GET`/`HEAD` + `s-maxage` rule.
2. Vercel — [Response headers](https://vercel.com/docs/headers/response-headers) — the exact name `x-vercel-cache` and its six values.
3. Vercel — [Cache status and reasons](https://vercel.com/docs/caching/cache-status) — the `MISS`/Error vs `MISS`/Cold split §1 copies.
4. Vercel — [Runtime logs](https://vercel.com/docs/logs/runtime) — the `cache:` filter and 1-day Pro retention, §6.
5. MDN — [`Age`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Age) — proxy-clock-minus-`Date`, §2's layer-2 age signal.
6. MDN — [`CacheStorage`](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage) — `caches.keys()`, and the absent entry-age API.
7. TanStack Query — [`QueryCache`](https://tanstack.com/query/latest/docs/framework/react/reference/QueryCache) — `getAll` and `state.dataUpdatedAt`, §2's layer-1 age read.
8. TanStack Query — [Devtools](https://tanstack.com/query/latest/docs/framework/react/devtools) — dev-bundle-only, so §2's layer-1 instrument ships nothing.
9. Prometheus — [Instrumentation practices](https://prometheus.io/docs/practices/instrumentation/) — failures need a total-attempts counter, §6.
10. Prometheus — [Alerting practices](https://prometheus.io/docs/practices/alerting/) — symptom-over-cause alerting, applied in §7.
11. Google SRE Book — [Monitoring distributed systems](https://sre.google/sre-book/monitoring-distributed-systems/) — golden signals; symptom/cause, §7.
12. Redis — [`INFO`](https://redis.io/docs/latest/commands/info/) — `keyspace_hits`/`keyspace_misses` as separate counters, §6.
13. [Principles of Chaos Engineering](https://principlesofchaos.org/) — steady state, hypothesis, injected failure: §7.

**Triton-internal evidence (repo read 2026-08-21; no production query was run).** Layer 3: `lib/queryCache.ts:16-25` (`getCached`; `.maybeSingle()` `:22`; the collapsing `if (error || !data) return null` `:24`), `:31-43` (`setCache`, 21600 s), `:58-62` (registry), `:68-71`/`:76-81` (invalidation, discarded delete count), `:86-91` (`purgeExpired`), `:96-104` (`cached`, zero callers). Consumers, identical hit/miss headers: `app/api/trends/route.ts:8` (`POST`), `:15-20,122`; `app/api/movement-percentiles/route.ts:43-48,100`. Swallowed invalidation: `app/api/cron/pitches/route.ts:66-70`, `app/api/cron/refresh/route.ts:161-165`. Unused chokepoint: `lib/observability.ts:23-26` (`logApiEvent`), `:29-36` (`reportError`, `TODO` sink at `:35`), `:39-51` (`withApiLogging`) — zero call sites for either across `app/`, `lib/`, `components/`. Admin surface: `app/api/admin/cron-health/route.ts:41-45,54-59` reads `system_metadata.mv_last_refreshed`; `app/(admin)/admin/page.tsx:67` fetches and `:207-209` renders it — correcting the packet's "no UI component reads it", though no analyst-facing surface does. Layer 2: 30 route files under `app/api/` set `Cache-Control`, 12 use `s-maxage`, 18 use bare `max-age` (e.g. `app/api/player-data/route.ts:55`). Layer 1: `lib/QueryProvider.tsx:9-18`, `package.json:24` (no devtools). Layer 4: `public/sw.js:1,29-42` via `components/ServiceWorkerRegistration.tsx:8`. RUM: `app/layout.tsx:11,60`. Tests (`npm test`): 93 passed / 5 failed / 24 skipped; all 5 failures in `__tests__/lib/queryCache.test.ts`, whose `setupMockChain` (`:14-26`) omits `.maybeSingle()`. Registry write counts and the four-layer inventory are from the 2026-08-21 packet.
