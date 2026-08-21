---
title: Application Cache Design — Triton Caches Postgres Inside Postgres
domain: caching-state
tags:
  - query-cache
  - cache-keys
  - ttl
  - stampede
  - postgres
  - hit-rate
  - invalidation
sources_reviewed: 10
last_updated: 2026-08-21
---

# Application Cache Design — Triton Caches Postgres Inside Postgres

> Grades: **(verified)** read at `file:line` or from the 2026-08-21 packet; **(documented)** primary
> docs; **(inferred)** mechanism; **(cargo-cult)** unsupported. **No production query was
> run.** Next's caching model is settled in `Cas/frontend-data-scale/06-nextjs-data-fetching.md`.

## TL;DR

- **`lib/queryCache.ts` reads one key and writes a different one on two of three trends paths** — the read key omits `tab`, so the Stuff tab can be served the Overview payload while its own writes are never read (verified).
- **A Postgres-backed cache is defensible here** — free, transactional, survives deploys, shared by every serverless instance, which a `Map` on Vercel is not (inferred).
- **But every hit is a PostgREST round trip against the database the cache protects**, under the same 8 s `statement_timeout` as the query it replaced (verified).
- **The `query_cache` table has no DDL in the repo** — 32 `.sql` files in `scripts/`, none creates it; its indexes are unversioned (verified).
- **`invalidateCache` uses `LIKE 'prefix%'`, which a default-collation B-tree cannot serve** — without `text_pattern_ops` it is a seq scan (documented).
- **Stampede is live and unguarded** — read → miss → compute → write, no lock, no single-flight, no jitter — and the cron drops every key at once, the textbook trigger (verified).
- **Key granularity, not TTL, sets hit rate** — `mvpct:` keys are per-pitcher-arsenal, reused only on a repeat view inside 6 h (inferred).
- **The repo does key design well on the client and ad hoc on the server** — `lib/queryKeys.ts` is a typed factory; server keys are concatenated inline, 5 of 7 registered prefixes cache nothing, `cached()` has zero callers, and the module's only tests have been red since 2026-08-11 (verified).

## 1. What the module actually is

| Function | Line | SQL shape | Cost |
|---|---|---|---|
| `getCached(key)` | :16 | `SELECT response WHERE cache_key = $1 AND expires_at > now()` | 1 trip, point lookup |
| `setCache(key, v, ttl)` | :31 | `INSERT … ON CONFLICT (cache_key) DO UPDATE` | 1 trip, 1 row version |
| `invalidateCache(prefix)` | :76 | `DELETE WHERE cache_key LIKE 'prefix%'` | 1 trip, likely seq scan |
| `purgeExpired()` | :86 | `DELETE WHERE expires_at < now()` | 1 trip, likely seq scan |
| `cached(key, fn, ttl)` | :96 | get → miss → `fn()` → fire-and-forget write | **zero callers** |

Four importers: `api/trends`, `api/movement-percentiles`, and the two pitch crons. A two-endpoint cache carrying a seven-prefix registry.

## 2. Key design: the read key is not the write key

`app/api/trends/route.ts` builds its lookup key **before** dispatching on `tab`:

```ts
:15  const cacheKey = `trends:${safeSeason}:${playerType}:${minPitches}`
:16  const cached = await getCached(cacheKey)      // whatever is under that key
:74  setCache(`trends:stuff:${safeSeason}:${mp}`,   result, …)   // never read
:110 setCache(`trends:arsenal:${safeSeason}:${mp}`, result, …)   // never read
:122 setCache(cacheKey, result, …)                 // overview writes the READ key
```

Two consequences. **The Stuff and Arsenal caches are write-only** — nothing reads `trends:stuff:*` or `trends:arsenal:*`, so hit rate is exactly 0% and every request pays a wasted write. And **the tabs collide**: `lib/hooks/useTrendsData.ts:139` fires Overview with `playerType: 'pitcher'` and `minPitches: month <= 4 ? 50 : 500`, while `:175` fires Stuff with the same season, the same default `minPitches` (`:110` derives both) and no `playerType`, which the route defaults to `'pitcher'` at `:10`. Both resolve to `trends:2026:pitcher:500`, so Stuff gets `{ rows: [...] }` where it expects `{ leaders, gainers, losers }`.

A key must contain **every input that changes the response**, and `tab` changes its *shape*. The read key also uses raw `minPitches` while the writes use `mp = max(parseInt(minPitches), 30)` (`:43`, `:80`) — one request, two spellings, by branch. Three rules prevent all of it: one function builds the key and both sides call it; inputs are normalized before keying; the prefix carries a schema version. `lib/queryKeys.ts` (2,187 B) already does exactly this on the client — `trendsTab(season, tab, minPitches)` at `:14` *does* carry `tab`. The client key is right and the server key is wrong, for the same endpoint in the same repo, because only the client's keys pass through a factory.

## 3. Storage backend: Postgres-in-Postgres, given a fair hearing

The reflex is "that's what Redis is for." Score it against *this* workload — two endpoints, a few hundred keys, JSON payloads, Vercel serverless.

| Backend | Shared across instances | Cost | Verdict here |
|---|---|---|---|
| In-process `Map` | **No** | $0 | Fails the multi-instance test |
| **Postgres table** | **Yes** | **$0** | What Triton has; also survives deploys |
| Redis / Upstash | Yes | per-command | Real win only at high hit volume |

The honest costs:

- **A hit is not free.** `getCached` goes through PostgREST as `supabaseAdmin` (`lib/supabase-admin.ts:17`, a 30 s *client-side* timeout). The binding cap is `authenticator`'s `statement_timeout=8 s`, which `service_role` does not override (`planning.md:40`) — the lookup carries the same ceiling as the query it replaces.
- **Writes compete with ingest**, beside a `pitches` table at 1.44 M dead tuples / 13.9% (`planning.md:301`). **Vacuum tuning is Jo's** — `Jo/postgres-performance/`.
- **The schema is unversioned.** No `scripts/*.sql` creates `query_cache`; the only record is `.claude-memory/changelog.md:43`, "**DB table needed**: `query_cache (cache_key TEXT PK, response JSONB, expires_at TIMESTAMPTZ)`". A unique index on `cache_key` must exist in production, since PostgREST upsert requires one and `setCache` passes `{ onConflict: 'cache_key' }` (`:42`) — inferred from working code, not read from the schema.

| Operation | Index needed | Evidence | Consequence |
|---|---|---|---|
| `cache_key =` | PK / unique B-tree | implied by `onConflict` | Fast (inferred) |
| `LIKE 'trends:%'` | `text_pattern_ops` | **none** | Seq scan outside the C locale (documented) |
| `expires_at <` | on `expires_at` | **none** | Seq scan (inferred) |

## 4. TTL selection

A flat 6 h everywhere (`:32`, re-stated at all four write sites) is a placeholder, not a decision. Both `trends:` payloads and `mvpct:` breakpoints change only on the nightly ingest, and because the crons already call `invalidateBySource('pitches')` when rows land, TTL here is a **backstop for missed invalidation**, not the primary mechanism — so it should be *longer*, and invalidation should be the trusted path. Triton has it inverted: a shortish TTL plus an invalidation whose failure is swallowed by a bare `.catch(() => {})`. Tying invalidation to ingest is `11-pipeline-cache-invalidation.md`; TTL-vs-event tradeoffs are `01-cache-invalidation-strategies.md`.

## 5. Hit-rate expectations

Hit rate is set by **key cardinality relative to request volume inside the TTL window**, and nothing else. `trends:{season}:{type}:{minPitches}` has roughly two live values and should hit often; `trends:stuff:*` and `trends:arsenal:*` sit at 0% by construction. `mvpct:` is the instructive case: the key is `season:hand:` plus the pitcher's whole rounded velo vector (`movement-percentiles/route.ts:43`), so two pitchers share a key only if their arsenals *and* integer velocities match — effectively one key per pitcher.

That route learned half the lesson: its comment at `:30-32` records the previous version: raw float velos "produced a unique single-use key per request and the cache almost never hit." Rounding to integer mph was a hit-rate fix applied one step short. The payload is computed per pitch type in a `GROUP BY`, so the natural key is `mvpct:{season}:{hand}:{pitch_type}:{velo}` — roughly 5 pitch types × 25 velo buckets × 2 hands ≈ **250 keys shared by every pitcher on the site**, versus one per pitcher today.

**None of this is measurable today** — nothing counts hits or misses. Instrumentation is `10-cache-observability.md`; whether the numbers underneath are stale is Jo's, and whether they *mean* what the label claims is Li's.

## 6. Cache stampede

A hot key expires, N concurrent requests miss, all recompute the same expensive result, and the recompute takes the database down. It is *metastable*: the system stays broken after the trigger passes, because the backlog keeps later requests missing.

`cached()` (`lib/queryCache.ts:96-104`) is `getCached` → if `null`, `await fallback()` → fire-and-forget `setCache(...).catch(() => {})`. No lock, no single-flight, no jitter: every concurrent misser runs `fallback()`.

Three triggers synchronize the misses: `invalidateBySource` drops **every** `trends:`/`mvpct:` key in one cron statement (`cron/pitches:66-70`, `cron/refresh:161-165`); a flat 21600 s TTL expires together whatever was written together; and the fire-and-forget write lets a misser return before its write lands. Because `cached()` has zero callers, this happens in the hand-rolled copies — `trends/route.ts:74,110,122` and `movement-percentiles/route.ts:100` — around the multi-`GROUP BY` aggregate at `trends/route.ts:44-99`, capped at 8 s, run once per misser.

Two mitigations need no new infrastructure: **probabilistic early expiry (XFetch)**, one expression and no lock, and **`pg_advisory_xact_lock(hashtext(key))`**, single-flight inside the database the cache already lives in.

Two related failures never announce themselves. `getCached` returns `null` on error (`:24`), indistinguishable from a miss — a cache failing 100% of the time looks exactly like one missing 100% of the time, and `reportError` has no sink (`planning.md:301`). And the suite is permanently red: all 5 failing tests in the repo are `__tests__/lib/queryCache.test.ts`, whose `setupMockChain` (`:14-26`) defines `single` at `:21` and no `maybeSingle`, while `lib/queryCache.ts:22` legitimately calls `.maybeSingle()`. It also imports `invalidateCache` and `purgeExpired` (`:12`) and tests neither.

## What Triton should do, in order

1. **Fix the trends read key** — include `tab`, normalize `minPitches` the same way on both sides (`app/api/trends/route.ts:15`). Ends the collision; turns two write-only caches into real ones.
2. **Add `chain.maybeSingle` to `setupMockChain`** (`__tests__/lib/queryCache.test.ts:21`). One line; five tests go green and the suite stops masking new failures.
3. **Route server keys through a factory** — a `cacheKeys` object beside `lib/queryKeys.ts`, versioned per prefix, so the two sides cannot diverge again.
4. **Put XFetch early expiry inside `cached()` and move the four call sites onto it**, deleting the hand-rolled copies.
5. **Regrain `mvpct:` to `{season}:{hand}:{pitch_type}:{velo}`** — a regrouping of an existing `GROUP BY`, and the largest hit-rate change available.
6. **Commit the DDL** as `scripts/create-query-cache.sql` — PK on `cache_key`, `text_pattern_ops` index for prefix deletes, index on `expires_at`, autovacuum settings, reviewed by Jo — and stagger mass invalidation by batching the prefix deletes instead of one `DELETE … LIKE`.
7. **Only then measure** hit rate (`10-cache-observability.md`) and re-tune TTLs.

**Anti-recommendation: "This is what Redis is for — put Upstash in front of it and be done."** Wrong on three independent grounds. *One:* it does not touch the defect. The live bug is a key bug — a read key missing `tab` — and Redis would serve the same wrong payload under the same colliding key, faster. *Two:* it does not move the bottleneck, which is the 8 s `statement_timeout` on the *recompute* (`planning.md:40`); every miss still runs the identical 8 s-capped aggregate, and Redis without single-flight stampedes exactly as Postgres does. *Three:* it worsens coherence. Triton already runs four mutually unaware cache layers — React Query, hand-set `Cache-Control` in 30 route files, this table, a no-expiry service worker. A fifth, serving a few hundred keys across two endpoints, buys milliseconds and costs a layer of reasoning.

**Highest-leverage next action:** change `app/api/trends/route.ts:15` to `` `trends:${safeSeason}:${playerType}:${tab}:${mp}` `` and use that expression at `:74`, `:110`, and `:122`. One line; it removes a wrong-payload path that ships today, and it is the prerequisite for any hit-rate number meaning anything.

## Sources

- [Cache stampede — Wikipedia](https://en.wikipedia.org/wiki/Cache_stampede) — §6's taxonomy: locking, external recomputation, early expiry.
- [Vattani et al., *Optimal Probabilistic Cache Stampede Prevention*, PVLDB 8(8), 2015](https://www.vldb.org/pvldb/vol8/p886-vattani.pdf) — the XFetch expression behind step 4.
- [Amazon Builders' Library — *Caching challenges and strategies*](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/) — hit rate as a load-bearing assumption.
- [Marc Brooker, *Caches, Modes, and Unstable Systems*](https://brooker.co.za/blog/2021/08/27/caches.html) — why a miss storm is metastable, not transient.
- [PostgreSQL — Operator Classes](https://www.postgresql.org/docs/current/indexes-opclass.html) — §3's `LIKE` row: `text_pattern_ops` outside the C locale.
- [PostgreSQL — `INSERT … ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html) — the unique-index requirement §3 infers from.
- [PostgreSQL — Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html) — `pg_advisory_xact_lock` as in-database single-flight.
- [PostgreSQL — Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — dead tuples on delete-heavy tables; step 6's autovacuum ask.
- [Supabase JS — `upsert`](https://supabase.com/docs/reference/javascript/upsert) — `onConflict` semantics for the upsert `setCache` performs.
- [Vercel — Fluid compute](https://vercel.com/docs/fluid-compute) — the instance model behind "a `Map` is not shared."

**Triton-internal evidence.** All `file:line` read **2026-08-21** at commit `d6147f0`; no production query was run. `lib/queryCache.ts`, 3,263 B / 104 lines — `getCached` `:16-26` (`.maybeSingle()` `:22`, error→`null` `:24`), `setCache` `:31-43` (`21600` `:32`, `onConflict` `:42`), `CACHE_TAG_REGISTRY` `:58-62`, `invalidateCache` `:76-81`, `purgeExpired` `:86-91`, `cached` `:96-104`. Key defect: `app/api/trends/route.ts:15` builds and `:16` reads `trends:${season}:${playerType}:${minPitches}`, `:74` and `:110` write tab-scoped keys, only `:122` writes the read key; callers `lib/hooks/useTrendsData.ts:110,139,175,185`. `mvpct:` key `app/api/movement-percentiles/route.ts:43`, velo rounding and the "almost never hit" note `:30-36`, write `:100`. Cron invalidation `app/api/cron/pitches/route.ts:66-70` and `app/api/cron/refresh/route.ts:161-165`, both bare `.catch(() => {})`. Timeouts `lib/supabase-admin.ts:17,20` and `planning.md:40`; `pitches` bloat and `reportError`'s missing sink at `planning.md:301`. Missing DDL: `ls scripts/*.sql` returns 32 files and `grep -rn query_cache` matches none; the only record is `.claude-memory/changelog.md:43`. Tests `__tests__/lib/queryCache.test.ts:14-26` (`setupMockChain`), with `invalidateCache`/`purgeExpired` imported `:12` and untested. From the shared packet, not re-verified: 5 of 7 prefixes never written; `cached()` zero callers; `npm test` = 5 failed / 93 passed / 24 skipped; the four-layer cache inventory.
