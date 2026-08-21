---
title: Cache Invalidation — Triton's Tag Registry Describes an Architecture That Never Shipped
domain: caching-state
tags:
  - invalidation
  - ttl
  - cache-tags
  - staleness-budget
  - two-generals
  - query-cache
  - provenance
  - cron
sources_reviewed: 10
last_updated: 2026-08-21
---

# Cache Invalidation — Triton's Tag Registry Describes an Architecture That Never Shipped

> Anchor doc for `caching-state/`. Grades: **(verified)** read at `file:line` or from the packet ·
> **(documented)** vendor/standards text · **(inferred)** mechanism · **(cargo-cult)** unsupported
> here. No production query was run. Next's caching semantics are settled in
> `Cas/frontend-data-scale/06-nextjs-data-fetching.md`.

## TL;DR

- **Five of `CACHE_TAG_REGISTRY`'s seven prefixes tag nothing,** and `invalidateBySource` is only ever called with `'pitches'` — so two of its three sources have no caller and would purge nothing, successfully. (verified)
- **A tag scheme can't be enforced when its entry point is bypassed:** `cached()` has zero callers; both consumers hand-roll `getCached` + `setCache(...).catch(() => {})`. (verified)
- **Invalidation is gated on a success signal that can lie** — skipped on `totalInserted === 0` or `skipDownstream`, then wrapped in a bare `.catch(() => {})` that makes a failed purge indistinguishable from a successful one. (verified)
- **You can never prove an invalidation happened, only detect that it didn't** — two generals, applied to cache and source of truth. Meta runs a service whose only job is observing the violations. (documented)
- **Triton owns a working tag vocabulary in the wrong layer:** `lib/queryKeys.ts` keys invalidate by prefix natively, yet the hooks layer holds one `invalidateQueries` call. (verified)
- **A staleness budget exists only if a surface renders age.** `mv_last_refreshed` reaches one screen: the admin page, as a raw ISO string, no age, no threshold. (verified)
- **The 46-day `league_averages` outage was not a cache bug** — the caches served, promptly, numbers from a frozen denominator. Their only failure was having no way to state the inputs' age. (verified)
- **A cached value must state its age and provenance or it can't be shown honestly** — Cas's coverage rule, one layer down. (inferred)
## 1. Four strategies, and what each can actually promise

| Strategy | Promise | Silent-failure mode | In Triton |
|---|---|---|---|
| **TTL / expiry** | "never more than N old" | none — wrongness bounded by N | layers 1–3; `query_cache.expires_at` |
| **Event-driven purge** | "fresh the moment the source changes" | event lost or gated off; cache looks right forever | `invalidateBySource('pitches')`, 2 sites |
| **Tag / prefix** | "one event clears everything derived from X" | tags never applied at write time, so the purge matches nothing | `CACHE_TAG_REGISTRY` — 2 of 7 prefixes real |
| **Versioned key** | "new content, new name" | key not bumped when it mattered | `/_next/static/` hashes; `CACHE_NAME='triton-v1'` |

The ranking that matters is not hit rate, it is **what failure looks like**. TTL fails into bounded
staleness, versioned keys into a cache miss, event and tag invalidation into **unbounded, invisible
staleness** — a purge matching nothing looks exactly like one matching everything. (inferred)
## 2. The four layers, and the strategy each actually runs

| # | Layer | Strategy | Who can bust it | Worst-case age |
|---|---|---|---|---|
| 1 | React Query (`lib/QueryProvider.tsx` + 9 hooks) | TTL (`staleTime`) | the user, by reloading | **unbounded** — `staleTime: Infinity` at 9 sites, `refetchOnWindowFocus: false` |
| 2 | `Cache-Control` in 30 route files | TTL + SWR | nobody; no purge API is called | up to 7 days |
| 3 | `lib/queryCache.ts` (`query_cache` table) | TTL 6 h **+ event purge** | the two crons | 6 h, or unbounded for a key no prefix matches |
| 4 | Service worker (`public/sw.js`) | versioned key | bumping `CACHE_NAME` | no expiry |

Only layer 3 has an invalidation *event*. The rest are time-and-naming schemes, so **an ingest
landing new pitches at 04:10 UTC cannot reach a tab an analyst left open at 21:00 the night before,
by any mechanism in the repo.** (verified)
## 3. The worked example: a registry that documents an intention

`lib/queryCache.ts:58-62` declares three sources and seven prefixes, documented at `:45-57`.
`invalidateBySource` (`:68-71`) maps source → prefixes and calls `invalidateCache` (`:76-81`), a
`.delete().like('cache_key', prefix || '%')`.

| Prefix | Registered under | Written as a key | Where |
|---|---|---|---|
| `trends:` | `pitches` | 3× | `app/api/trends/route.ts:74,110,122` |
| `mvpct:` | `pitches` | 1× | `app/api/movement-percentiles/route.ts:100` |
| `player:` | `pitches` | **0** | — |
| `scene:` | `pitches` | **0** | — |
| `milb:` | `milb_pitches` | **0** | — |
| `league:` | `league_averages` | **0** | — |
| `pctile:` | `league_averages` | **0** | — |

So `invalidateBySource('pitches')` fires four `DELETE`s to clear at most four possible keys, and
`('league_averages')` / `('milb_pitches')` **have no call site at all** — added tomorrow, either
would delete zero rows, resolve, and be indistinguishable from working.

A registry is a contract, read by a human deciding whether invalidation is handled. It says yes; the
code says two prefixes and one source. **A cache tag declared but never applied is worse than no tag
scheme, because it converts an open question into a false answer.** The drift is structural:
`cached()` (`:96-104`) is the only place a key format could be enforced, and it has **zero callers**.
(verified)

### 3.1 A second, healthier vocabulary nobody reconciled

`lib/queryKeys.ts` centralizes React Query keys as hierarchical arrays — `['player', id, 'pitches',
year]`, `['trends', 'tab', …]` — which `invalidateQueries` matches by **prefix by default**. The two
vocabularies are near-identical and unlinked: `trends:` / `['trends', …]`, `player:` /
`['player', id, …]`, `league:` / `['leagueBaseline', …]`. The working mechanism sits in the layer with
**one** `invalidateQueries` call repo-wide (`lib/hooks/useABSData.ts:196`); the dead one sits in the
layer that has the events. (verified)
## 4. Two generals: the invalidation edge cannot be made certain

Two parties on a lossy channel can never reach common knowledge of an agreement. Cache and source of
truth are that pair: **the writer cannot know the cache purged, and the cache cannot know a write
happened that it missed.** So change the goal — bound the damage with TTL and *observe the
violations*. Meta's Polaris does exactly that, watching client-observable invariants and reporting
inconsistency as a rate: correctness measured after the fact, never asserted at the call site.
(documented)

Triton's edge has four places to lose the message and none of them reports:

| Hop | Code | Failure |
|---|---|---|
| Ingest → marker | `cron/pitches` upserts `pitches_last_run` via `.then(() => {}, () => {})` | marker write swallowed |
| Marker → decision | `cron/refresh:47` `skipDownstream = totalInserted === 0` | a failed ingest reports 0, reads as "nothing changed" |
| Decision → purge | `cron/pitches:67-70`, `cron/refresh:161-165` ternaries | purge never attempted |
| Purge → outcome | both `.catch(() => {})` | purge failed, reported nothing |

The run containing all four is still recorded green. `trackCronRun` writes `status: 'success'`
whenever the inner function *resolves* (`lib/cronTracker.ts:66-80`), and the refresh chain captures
RPC errors into result objects instead of throwing (`cron/refresh:107-109, 120-122, 134-136`:
`error ? { error: error.message } : { ok: true }`). A timed-out `refresh_league_averages` yields a
payload field nobody reads and a `cron_runs` row saying success — the mechanism behind
`planning.md:301`'s "52 runs, 50 timeouts, 0 successes, all logged `status='success'`". (verified)
## 5. Why invalidation is genuinely hard, in four lines

| Difficulty | Shape | Triton instance |
|---|---|---|
| Naming | two authors must agree on a string, later | `trends:` vs `['trends', …]` (§3.1) |
| Fan-out | derived data has no edge back to its inputs | nothing links `league_averages` → plus-stats |
| Races | a cache-aside fill can land *after* a purge and re-store a stale value | `setCache(...).catch(() => {})` is unordered against `invalidateCache` |
| No negative ack | a no-op purge and a full purge are one observation | `invalidateCache` returns `void` |

**The caches were never lied to; they were never told anything.**
## 6. Staleness budgets: the number that makes this decidable

A **staleness budget** is the maximum age a surface may serve *without saying so*. Not a TTL: a TTL
is what one cache does, a budget is what the *screen* promises, summed across every layer in the
path. Freshness is an SLI — pick a target, measure it, alert on burn.

| Surface | Layers in path | Worst case today | Budget | Signal |
|---|---|---|---|---|
| Trends tab | 3 (6 h) → 2 (`max-age=3600, swr=86400`) → 1 (`Infinity`) | 6 h + 24 h + tab lifetime | 12 h | none |
| Player dashboard | 2 (`max-age=300, swr=3600`) → 1 (`Infinity`) | 1 h + tab lifetime | 1 h | none |
| Plus-stats / leaderboards | upstream `league_averages` refresh | **46 days, observed** | 36 h | `mv_last_refreshed` |
| Producer stat push (on air) | `/api/scene-stats`, no app cache | seconds | 60 s | none |

`lib/hooks/useStandings.ts:25` is the model — `staleTime: season < currentYear ? Infinity : 5 min`,
the only site where a lifetime derives from a claim about the *data*. (verified)

### 6.1 What budget would have made the 46-day outage visible

Fixing the refresh chain is `Jo/`'s (three `ALTER FUNCTION … SET statement_timeout`); judging whether
the resulting plus-stats mean anything is `Li/`'s. The narrower question is **could the UI have
known, and what would it have had to render?** It could have. `cron/refresh:138-145` upserts
`mv_last_refreshed`, `app/api/admin/cron-health/route.ts:41-45` returns it, and
`app/(admin)/admin/page.tsx:207-209` renders it — as a raw ISO timestamp in `text-zinc-600`, on an
admin page, with **no age computed and no threshold**, while the adjacent cron table computes
`age_minutes` for every job (`:196`). (verified — refining the packet's "no UI component reads it":
one does, in the least legible form available, on the screen an analyst never opens.)

The miss was presentation, not instrumentation. `2026-06-26T04:12:07.441Z` beside a Stuff+
leaderboard reads as provenance detail; "League baselines: **46 days old**" reads as a defect.
**Stated as Cas states coverage:** a surface must say how many rows it averaged *and* how old they
are; a tile that cannot answer "as of when, from where" should render the age placeholder instead of
the number. (inferred)
## 7. What Triton should do, in order

1. **Make invalidation return a number** — `invalidateCache` → `Promise<number>` (Supabase `delete()`
   with `count: 'exact'`), summed by `invalidateBySource`. Precondition for everything below.
2. **Delete the bare `.catch(() => {})` at `cron/pitches:70` and `cron/refresh:165`** and put that
   count into `trackCronRun`'s `counts`, which the admin cron table already renders.
3. **Shrink the registry to what exists** — drop the five dead prefixes and two sourceless entries,
   or add the writes. Either is fine; only the current state misinforms.
4. **Ungate the purge.** Two `DELETE`s on a small table beat a silent 6 h stall after any miscount.
5. **Return age with data** — `getCached` → `{ data, cachedAt }` plus an `X-Cache-Age` header, then
   render age wherever a budget is breached.

**Anti-recommendation: do not "fix" this by building a real tag-based invalidation system.** Three
independent grounds. *Volume* — layer 3 holds keys from **two routes**; tags earn their keep at
fan-out where one write touches thousands of entries, and here a full-table `DELETE` of
`query_cache` is correct and cheaper than the graph you would maintain. *Edge reliability* — a
richer graph inherits the same gated, unlogged, swallowed delivery edge, multiplying the ways to
silently match nothing. *Wrong layer* — the cache users read from is layer 1, where 9 sites sit at
`staleTime: Infinity` with `refetchOnWindowFocus: false` and native prefix invalidation goes unused;
no server-side tagging reaches a tab that has decided never to ask again.

**Highest-leverage next action:** make `invalidateCache` return its deleted-row count and record it
in both crons' `counts` payload. One afternoon converts the platform's only event-driven
invalidation from an unobservable no-op into a number on a screen that already exists — and a count
sitting at zero is the fastest possible proof of §3.
## Sources

1. Fowler — [TwoHardThings](https://martinfowler.com/bliki/TwoHardThings.html) — why naming and invalidation are one problem; §1.
2. Wikipedia — [Two Generals' Problem](https://en.wikipedia.org/wiki/Two_Generals%27_Problem) — the impossibility result §4 applies to cache vs source of truth.
3. Meta — [Cache made consistent](https://engineering.fb.com/2022/06/08/core-infra/cache-invalidation/) — Polaris; §4's "measure violations, don't assert correctness" posture.
4. USENIX NSDI '13 — [Scaling Memcache at Facebook](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170.pdf) — leases: the fix for §5's stale-set race.
5. Microsoft — [Cache-Aside pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside) — the read-fill/write-purge ordering hazard `setCache` inherits.
6. IETF — [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html) — freshness lifetime, `max-age` vs `s-maxage`; §6.
7. IETF — [RFC 5861](https://datatracker.ietf.org/doc/html/rfc5861) — `stale-while-revalidate`: why a 1 h header serves 24 h old bytes.
8. Fastly — [Surrogate keys](https://www.fastly.com/documentation/guides/full-site-delivery/purging/working-with-surrogate-keys/) — why a tag must ride on the response, not a side table like §3's registry.
9. TanStack Query — [Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation) — prefix matching by default, §3.1's unused mechanism.
10. Google SRE Workbook — [Implementing SLOs](https://sre.google/workbook/implementing-slos/) — freshness as an SLI with a target and burn rate; §6.

**Triton-internal evidence (repo read 2026-08-21 at commit `d6147f0`; no production query run).**
`lib/queryCache.ts`: `setCache` `:31-43` (6 h default `:32`), prefix comment `:45-57`,
`CACHE_TAG_REGISTRY` `:58-62`, `invalidateBySource` `:68-71`, `invalidateCache` `:76-81` (`.like()`,
returns `void`), `cached` `:96-104` — **zero callers**, by grep over `app/`, `lib/`, `components/`.
Four importers only: `app/api/trends/route.ts:3` (keys `:74,110,122`),
`app/api/movement-percentiles/route.ts:3` (key `:100`), `app/api/cron/pitches/route.ts:3`,
`app/api/cron/refresh/route.ts:2`. Gated invalidation `cron/pitches:67-70`, `cron/refresh:161-165`;
`skipDownstream` `cron/refresh:47`; error-swallowing RPC results `:107-109, 120-122, 134-136`;
`mv_last_refreshed` upsert `:138-145`. `lib/cronTracker.ts:66-80` writes `status:'success'` on
resolve. `app/api/admin/cron-health/route.ts:41-45` returns `mvLastRefreshed`;
`app/(admin)/admin/page.tsx:207-209` renders it raw while `:196` computes `age_minutes` — the only
two UI-reachable readers. `lib/queryKeys.ts:3-4,15-16,18-24`; sole `invalidateQueries`
`lib/hooks/useABSData.ts:196`; `lib/hooks/useStandings.ts:25`; `public/sw.js:1,29-42`. Layer counts,
the nine `staleTime: Infinity` sites, 30 `Cache-Control` files and the prefix tally are the shared
packet; the 52-run / 0-success / 46-day figures are `planning.md:301`.
