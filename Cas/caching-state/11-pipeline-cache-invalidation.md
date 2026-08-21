---
title: Pipeline Completion and Cache Invalidation — Telling the Surface to Forget
domain: caching-state
tags: [caching-state, cache-invalidation, cron, data-pipeline, staleness, partial-failure, vercel, supabase]
sources_reviewed: 11
last_updated: 2026-08-21
---

# Pipeline Completion and Cache Invalidation — Telling the Surface to Forget

Invalidation *theory* — key design, TTL vs. event, tag granularity — belongs to
`Cas/caching-state/01-cache-invalidation-strategies.md`. This doc owns the **seam**: the moment a
cron stops writing rows and something must tell the surface its cached answer is now a lie.

## TL;DR

- **The pipeline's job is to make the data correct; the cache's job is to stop showing the old answer. Two failures, two detections, two owners.** (documented)
- **Two of Triton's 17 cron routes invalidate anything, and both do it with the same five lines, carrying three separate defects.** (verified)
- **The gate `totalInserted === 0` cannot tell "Savant had no games" from "the fetch failed"** — `app/api/update/route.ts:87` returns `inserted: 0` for both. (verified)
- **The bare `.catch(() => {})` is nearly dead code: supabase-js resolves with `{ error }` and `invalidateCache` never reads it, so the failure is swallowed a layer earlier.** (verified)
- **`/api/cron/refresh` invalidates `'pitches'` after changing `league_averages` and the matviews — the wrong source, and the right prefixes have zero writers anyway.** (verified)
- **On a partial-success ingest, invalidate unconditionally and label the result; gating is worse because its staleness is unbounded.** (inferred)
- **Vercel crons are UTC, best-effort, never retried and sometimes duplicated, so any design assuming "the cron ran" is unsound.** (documented)
- **This seam already failed for 46 days in production: 52 refresh runs, 50 timeouts, 0 successes, all logged `status='success'`.** (documented)

## 1. The seam, and who owns which half

One symptom — a confidently wrong number on screen — decomposes into two independent faults.

| Question | Owner | Where it goes |
|---|---|---|
| Did the rows land, complete and fresh? | **Jo** | `Jo/data-reliability/02-data-freshness-slos.md`, `03-volume-completeness-monitoring.md` |
| Did the run happen at all? | **Jo** | `Jo/data-reliability/11-serverless-cron-reliability.md` — open (audit A1b) |
| **Did the surface find out the answer changed?** | **Cas** | this doc |

Not academic. A screen showing a stale-but-once-correct number because nobody told it to forget is a
**Cas** defect even when the root cause is Jo's. Jo can repair the pipeline completely and
the screen stays wrong for six more hours: `lib/queryCache.ts:32` hands out a 6-hour TTL and nothing
in the repair path clears it. Reach is limited too — a cron clears only layer 3 (`query_cache`).

## 2. The five lines, dissected

Both sites are byte-for-byte identical but for the gate:

```ts
// app/api/cron/pitches/route.ts:67-70          gate: totalInserted === 0
// app/api/cron/refresh/route.ts:162-165        gate: skipDownstream
await Promise.all([
  <gate> ? Promise.resolve() : invalidateBySource('pitches'),
  purgeExpired(),
]).catch(() => {})
```

### (a) The gate trusts a success signal that can be wrong

`totalInserted` sums `r?.inserted ?? r?.count ?? 0` (`pitches/route.ts:47-50`). In `syncPitches`,
`inserted` counts landed rows and `errors` counts rejected ones, and both are returned
(`app/api/update/route.ts:144-169,:204-209`). **The cron reads `inserted`, never `errors`.**

| syncPitches outcome | `inserted` | `errors` | Gate sees | Cache does | Truth |
|---|---|---|---|---|---|
| Clean 3-day ingest | 12,000 | 0 | new data | invalidate | correct |
| 500 rows rejected | 11,500 | 500 | new data | invalidate | **incomplete, served fresh** |
| Savant returned an error page | 0 | 0 | no data (`:87`) | **skip** | **stale, served current** |
| Genuine off-day | 0 | 0 | no data | skip | correct, by luck |
| Rows landed, Stuff+ failed | 12,000 | 0 | new data | invalidate | **unscored, served fresh** |

Rows 3 and 4 are the same two numbers. The gate's entire information content is "was `inserted`
nonzero" — a *volume* fact standing in for a *completeness* fact it cannot express.
`/api/cron/refresh` inherits it at one remove: `skipDownstream` reads the `pitches_last_run` marker
(`refresh/route.ts:34-47`) that the ingest writes with `.then(() => {}, () => {})`
(`pitches/route.ts:64`). A failed marker write — or an ingest that never ran — skips the whole
downstream and logs `success` (A11).

### (b) `Promise.all` — the charge, stated precisely

"One rejection abandons the other operation" is **not** how `Promise.all` behaves — both start
eagerly and neither is cancelled. What bites: the `await` settles on the first rejection and the cron
moves on while the sibling is still in flight, which in `refresh/route.ts` is the last statement
before the response (inferred). Two outcomes also collapse into one bit — `Promise.allSettled` would
name the failure.

### (c) The bare catch — and the error that never reaches it

`.catch(() => {})` makes a failed invalidation indistinguishable from a successful one. The sharper
problem is one layer down: `invalidateCache` issues `.delete().like(...)` and **never destructures
`{ error }`** (`lib/queryCache.ts:76-81`); nor does `purgeExpired` (`:86-91`) or `setCache`
(`:31-43`). `supabase-js` *resolves* with `{ error }` on an RLS or constraint rejection instead of
throwing — the mechanism that also lets a rejected Kanban card look saved
(`WorkBoard.tsx:523-539`). A refused DELETE returns a fulfilled promise, `Promise.all` succeeds, and
the `.catch` never fires. **The outer catch guards an error already discarded.**

**And the order is backwards.** The cache is cleared at `pitches/route.ts:67-70`; the Stuff+ failure
that fails the whole run is raised 12 lines later at `:82-84`. The cron records `status='error'` with
the cache already empty, so the next reader re-populates `trends:` from pitches known to be unscored
and pins that for 6 hours. Invalidate after you know *what* you have, not after you know something
arrived.

## 3. Partial success: a position, not a menu

An ingest covering two of three days is a success by row count and a lie by coverage. Jo's audit
found exactly this: MiLB Stuff+ silently unscored for 2026-08-06/07/08 — 13,702 pitches, 0% scored
(A5) — while the cron reported success, and `pitches` missing 08-12 and 08-13 outright (A1).
The dilemma is real: invalidate and serve incomplete data as fresh; don't and serve stale as
current.

**Position: always invalidate, never gate, and move the decision to the label.**

1. **Gating has unbounded staleness; invalidating has bounded incorrectness.** A skipped invalidation
   persists until some later run happens to open the gate — 46 days, in the `league_averages` case.
   Unconditional invalidation is wrong for one read, after which cache and database agree again.
2. **Consistency with the store of record beats optimistic retention.** Once bad rows are committed,
   the cached "good" answer is a *second, disagreeing* answer while every uncached surface already
   shows the new data. Two truths on one screen is the worse failure.
3. **The always-taken branch is the only branch that gets exercised.** A conditional that fires on
   one run in three rots unobserved, and the gate saves exactly one cheap DELETE.

What the gate reached for is real and belongs elsewhere: persist the coverage facts the ingest
already computed — `inserted`, `errors`, `max(game_date)` — beside the cache entry, and let `/trends`
render "through 2026-08-11" instead of an unlabelled "recent 14 days" (`app/api/trends/route.ts:29`
anchors that window to `MAX(game_date)`). That turns a correctness question the cache cannot answer
into a labelling one Cas can.

## 4. Which crons write what, and what invalidates nothing

`app/api/cron/` holds 17 route directories, `vercel.json` schedules 15, and exactly **two** import
`lib/queryCache.ts`.

| Cron (UTC) | Writes | Prefixes that should follow | Invalidates today |
|---|---|---|---|
| `pitches` 09:00 | `pitches`, `system_metadata`, 2 matviews (`update:181-183`) | `trends: mvpct: player: scene:` | `pitches`, gated |
| `refresh` 09:10 | `league_averages`, `league_percentiles`, matviews, Triton/Deception | `league: pctile:` + pitch prefixes | `pitches` — **wrong source**, gated |
| `milb-pitches` 09:00 | `milb_pitches` | `milb:` | **nothing** |
| `player-stats` 09:30 | `player_season_stats` (`:101,:148`) | unregistered | **nothing** |
| `roster` 09:00 / 23:00 | `players`, `game_umpires`, 2 matviews (`:154-158`) | `player: scene:` | **nothing** |
| `janitor` 13:00 | `players` repairs (`:458-466`) | `player:` | **nothing** |
| 11 others | wbc, abs, briefs, cards, graphics, emails, sos … | mostly unregistered | **nothing** |

`refresh` is the only cron that changes `league_averages`, and it invalidates `'pitches'` — a source
it did not write. But the fix is *not* "also call `invalidateBySource('league_averages')`";
`league:`, `pctile:`, `player:`, `scene:` and `milb:` have **zero writers**
(`lib/queryCache.ts:58-62`), so those calls would be no-ops that *look* like coverage. Reading
`CACHE_TAG_REGISTRY` as a description of the running system is the most cargo-cult thing in this
domain (cargo-cult).

## 5. Designs that do not assume the cron ran

Vercel documents that cron delivery is **best effort**, that a failed invocation is **not retried**,
and that a run may occasionally fire **more than once**. The audit caught the 09:00 UTC `pitches`
slot simply not firing on 2026-08-14, with nothing detecting the absence (A1b).

| Trigger | Survives a missed run? | Fit for Triton |
|---|---|---|
| Cron calls `invalidateBySource` (today) | **No** | in place, unreliable |
| Version token folded into the cache key | Yes — old keys age out by TTL | best fit; makes purging unnecessary |
| Realtime `postgres_changes` / outbox / `NOTIFY` | Yes | correct, but each wants a listener serverless lacks |

`invalidateBySource` is a **dual write**: commit rows, then delete cache keys, with no transaction
spanning both — the problem the outbox pattern exists to solve. Folding a monotonic `pitches_version`
(or `max(game_date)`) into the key removes it: a key computed from a version that no longer exists is
simply a miss, no DELETE has to succeed, no error is left to swallow, and the refill spreads across
natural traffic instead of landing all at once at 09:10.

## What Triton should do, in order

1. **Make failures visible before making them rarer.** Destructure `{ error }` in `invalidateCache`,
   `purgeExpired` and `setCache` (`lib/queryCache.ts:31-91`) and return a result. Today the outer
   `.catch` cannot fire, so nothing below is verifiable.
2. **Delete the gates.** Invalidate on every run of `pitches` and `refresh`: two cheap DELETEs, one
   always-exercised path, no unbounded staleness. Swap `Promise.all` for `Promise.allSettled` and
   record both outcomes in `cron_runs.counts`.
3. **Move the invalidation below the Stuff+ throw** (`pitches/route.ts:82-84`), and stop `refresh`
   invalidating a source it did not write — `league:` / `pctile:` need a *writer* first.
4. **Write an as-of stamp the surface can read.** Persist `max(game_date)`, `inserted`, `errors` and
   cache-write time; `system_metadata.mv_last_refreshed` already exists and is read by zero UI
   components. Then label `/trends` and the dashboards with it.
5. **Version the keys** — fold a pitches version into `trends:` / `mvpct:` and the react-query
   `queryKey`, retiring the dual write on both layers, and give the HTTP responses `s-maxage` so an
   invalidated answer is actually replaceable.

**Anti-recommendation: do not "fix" this by cutting the `query_cache` TTL from 6 hours to 15
minutes.** (1) It does not address the failure — the 46-day outage was stale *source* data, and a
15-minute TTL would have re-cached the same wrong number 4,416 times instead of 184. (2) It cannot
reach the layers where the surviving copies live: `staleTime: Infinity` in 9 hooks and `max-age=3600`
in the browser are untouched by a server-side TTL. (3) It multiplies cost on the one dimension the
cache exists to protect — the queries heavy enough to need caching, against a database with an
8-second statement timeout. It trades a correctness problem you still have for a capacity problem you
did not.

**Single highest-leverage next action:** make `invalidateCache` and `purgeExpired` return
`{ ok, error }`, check them at both call sites, and write the result into `cron_runs.counts`. A
~15-line change that turns the platform's only invalidation path from unobservable to observable —
every other item here becomes verifiable the moment it lands.

## Sources

- [Vercel — Cron Jobs](https://vercel.com/docs/cron-jobs) — "the timezone is always UTC", against an ET-derived `today`.
- [Vercel — Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — "Vercel will not retry an invocation if a cron job fails"; best-effort delivery. Basis for §5.
- [Vercel — Edge cache](https://vercel.com/docs/edge-cache) — which directives the shared cache honours, behind the `s-maxage` step.
- [MDN — `Cache-Control`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) — why `max-age` alone puts the surviving copy beyond a server-side purge.
- [Next.js — `revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag) — the tag invalidation Triton cannot use, `run_query` being a POST.
- [TanStack Query — Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation) — the layer-1 primitive no cron can call.
- [microservices.io — Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html) — names the dual write `invalidateBySource` does.
- [Supabase — Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) — the change feed Triton already runs.
- [Google SRE Book — Data Processing Pipelines](https://sre.google/sre-book/data-processing-pipelines/) — periodic jobs that complete without doing their work.
- [AWS Builders' Library — Reliability and constant work](https://aws.amazon.com/builders-library/reliability-and-constant-work/) — §3's case for an always-taken path.
- [Healthchecks — dead man's switch monitoring](https://healthchecks.io/docs/) — how an *absent* run is detected; the gap behind A1b, handed to Jo.

**Triton-internal evidence.** Read from the repo on 2026-08-21, branch `main`; no database was
queried. Invalidation sites: `app/api/cron/pitches/route.ts:67-70` (gate computed `:47-50`, marker
`:54-64`, Stuff+ throw `:82-84`) and `app/api/cron/refresh/route.ts:162-165` (gate derived `:34-47`,
downstream `:96-149`). Cache module `lib/queryCache.ts`:
`setCache` `:31-43` (TTL 21600 s at `:32`), `CACHE_TAG_REGISTRY` `:58-62`, `invalidateBySource`
`:68-71`, `invalidateCache` `:76-81` and `purgeExpired` `:86-91` — neither reads `{ error }` —
`cached()` `:96-104`, zero callers. Ingest: `app/api/update/route.ts:87`, `:144-169`, `:181-183`,
`:204-209`. Consumer and other-cron lines in §4–§5 were read the same way. Counts from
`ls app/api/cron` (17 directories) against `vercel.json` (16 entries, 15 paths). The four cache
layers, 9 `staleTime: Infinity` sites and the `WorkBoard.tsx:523-539` precedent come from the shared
measurement packet of 2026-08-21, not re-measured here. Production
history: `planning.md:301` and `docs/research-app-audit-2026-08-14.md:23,:25,:29,:30,:53-56`
(findings A1, A5, A11, A13, A1b).
