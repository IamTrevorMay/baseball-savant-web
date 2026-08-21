---
title: Client vs Server Computation — Where Triton's Boundary Belongs and What It Costs
domain: frontend-data-scale
tags:
  - client-server-boundary
  - payload-size
  - derived-fields
  - denominators
  - statement-timeout
  - main-thread
  - truncation
sources_reviewed: 13
last_updated: 2026-08-21
---

# Client vs Server Computation — Where Triton's Boundary Belongs and What It Costs

> Anchor doc for `frontend-data-scale/`. Grades: **(verified)** read at `file:line` or run against
> repo code; **(documented)** vendor docs; **(inferred)** mechanism or synthetic estimate. No
> production query was run.

## TL;DR

- **Triton runs two boundaries and only one can state a denominator:** single-player ships rows, reports ship answers. (verified)
- **Column *names* cost 1,009 B per row: 50,000 rows spend ~48 MiB on repeated JSON keys before a single value.** (verified)
- **A full payload is ~66 MiB raw / ~7 MiB gzipped, and the route's `Cache-Control` lacks `s-maxage`, so the CDN caches none of it.** (verified / documented)
- **Client filtering is the cheap half: 5 predicates over 50,000 rows in 7–12 ms, ~5% of the 200 ms budget.** (inferred)
- **The costly work is the one-time pass: enrich ≈93 ms + options build ≈47 ms, main thread, both past the 50 ms long-task line.** (inferred)
- **11 of 59 filter fields have no column in `pitches`, and the engine's server-side twin has zero callers and would query columns that do not exist.** (verified)
- **`cluster`/`hdev`/`vdev` use a centroid built from whatever rows the fetch returned, so a `LIMIT` sets the comparison population.** (verified)
- **Server aggregation discards the denominator by construction: 59 report metrics, 27 with a `NULLIF` denominator, none returning one.** (verified)
- **`LIMIT 50000` truncates silently and returns `count: 50000` — a ceiling that reads as a count — while the true denominator sits unread in `player_summary`.** (verified)
- **The 8s cap governs `/api/report`, not `/api/player-data`, which uses `run_query_long` at 120s.** (verified)

## 1. Two boundaries, not one

| | Single-player dashboard | Cross-player report |
|---|---|---|
| Entry | `app/api/player-data/route.ts` | `app/api/report/route.ts` |
| RPC / statement cap | `run_query_long` — **120 s** | `run_query` — **8 s** |
| Returned | 71 raw columns × ≤50,000 rows | one row per group, ≤1,000 |
| Filtering | browser, `applyFiltersToData` | SQL `WHERE` |
| Derived fields | browser, `enrichDerivedFields` | none — not expressible |
| Can state `n`? | **yes, for free** | **only if `pitches` was selected** |

The left ships *evidence* and answers in the browser; the right ships only *answers*.

## 2. What 50,000 rows costs

`BASE_COLUMNS` is 70 columns (`app/api/player-data/route.ts:5`) plus a joined `batter_name`, ordered
`game_date DESC`, capped at `LIMIT 50000` (`:44`).

| Component | Per row | × 50,000 | Grade |
|---|---|---|---|
| JSON key names + `":,` punctuation | **1,009 B** | **48.1 MiB** | (verified) |
| Representative full row | ~1,380 B | ~66 MiB | (inferred) |
| gzip / brotli on the wire | — | **~7** / ~4.7 MiB | (inferred) |
| JS heap, row objects | — | ~100 MiB | (inferred) |

JSON is row-oriented; a columnar encoding pays each name once — the whole argument for Arrow-shaped
transport, needing no boundary move. And Vercel will not CDN-cache a non-streaming response over
**10 MB**, and caches one only when `s-maxage` is present; `/api/player-data:55` sends
`public, max-age=300, stale-while-revalidate=3600`, so **that header buys a browser cache and nothing
else**. (verified / documented)

**The year filter exists and the first load skips it.** The route takes `?year=`; its own comment
says that cuts "50K → ~5K" (`:29`). But `usePlayerData` starts `selectedYear` at `null`
(`lib/hooks/usePlayerData.ts:123`) and resets it per player (`:236–239`), so **the default page load
is the maximum payload.** (verified)

## 3. The client side is not the slow part

Repo functions transcribed verbatim, run on synthetic rows under Node 22 — the shape is trustworthy,
the absolute numbers are not. (inferred)

| Work | 5,000 | 50,000 rows | Runs |
|---|---|---|---|
| `enrichDerivedFields` (VAA/HAA/brink/centroids) | 14 ms | **93 ms** | once per fetch |
| `applyFiltersToData`, 5 predicates | 1.6 ms | **7–12 ms** | every filter change |
| `buildOptionsCache`, 16 columns | 5 ms | **47 ms** | once per fetch |

INP's "good" threshold is 200 ms; a task over 50 ms is a long task. **Filtering 50,000 rows in the
browser costs ~5% of the interaction budget.** The other two rows are the real main-thread problem —
~140 ms of blocking work per fetch, no Web Worker in the repo to move it to
(`08-web-workers-offthread.md`), landing unchanged on mobile (`09-mobile-performance-constraints.md`).

`applyFiltersToData` returns *references*: `allData → seasonFilteredData → filteredData → data` are
four pointer arrays over one set of rows, ~1.6 MB, not four copies. (verified)

## 4. Why the line sits here: 11 filters have no column

`FILTER_CATALOG` has **59 entries** and **zero** `dbColumn` overrides. Eleven exist nowhere in
`pitches` — the browser produces them:

| Client-only filter | Produced at (`lib/enrichDerivedFields.ts`) |
|---|---|
| `vaa`, `haa` (trajectory solve), `pfx_x_in`, `pfx_z_in` | `:10–25` |
| `brink`, `vs_team` | `:27–34` |
| `cluster`, `cluster_r`, `cluster_l`, `hdev`, `vdev` | `:38–63` |

Pushing the filter down means deleting eleven chips or porting the physics into SQL — and movement
and approach angle are what an analyst reaches for first. The repo already holds a half-built
version: `applyFiltersToQuery` (`lib/filterEngineCore.ts:109–129`), the server-side twin of
`applyFiltersToData`, exported with **no callers anywhere**; wired up it would emit
`q.gte('vaa', …)` against a column that does not exist. (verified)

**The payload defines the metric.** `cluster`, `hdev` and `vdev` measure distance from a per-year,
per-pitch-type centroid computed from `allRows` — the rows *this* fetch returned
(`lib/enrichDerivedFields.ts:38–52`). Fetch a career, get a career centroid; fetch a season, get a
season centroid. **The same pitch takes a different `cluster` value depending on where the boundary
fell, and nothing on screen names the population.** Whether that centroid is the right baseline is
`Li/metric-governance/`; that it is undeclared is Cas's.

## 5. What the server gives up: the denominator

`lib/reportMetrics.ts` defines **59 metrics**: **27** carry a `NULLIF(...)` denominator inside the
expression, **17** are bare `AVG(column)` (which skips NULLs), **zero** return a denominator as a
column. The SELECT list is exactly `groupBy` + the metrics the caller asked for
(`lib/reportQueryBuilder.ts:107–113`), and `pitches: 'COUNT(*)'` (`lib/reportMetrics.ts:7`) is
**opt-in** — three of the four hitting stat sets omit it for `pa`
(`lib/leaderboardColumns.ts:177–182`), so on `hitting:battedball` `avgEv` averages `launch_speed`
over tracked batted balls while the shown sample size is plate appearances, several times larger:
`analytics-ux/01-honest-data-presentation.md` §4's arsenal defect, from the other side.

| | Client-filter path | Server-aggregate path |
|---|---|---|
| Rows behind a number | in memory | discarded in the DB |
| Adding `n` or coverage % | `array.length`, `.filter().length` — free | new SELECT column + round trip |
| Recoverable afterwards? | yes | **no** |

**That asymmetry should drive the decision.** A server aggregate returning a number without an `n`
cannot be made honest downstream — nothing reconstructs a denominator consumed inside a `NULLIF` and
never returned. The client path is the only one where every tile *can* state its coverage. The rule
is not "aggregate less" but **when computation crosses to the server, its denominator must cross
back.**

## 6. Two caps, and what the page shows when one hits

| Cap | Applies to | On exceed | Visible? |
|---|---|---|---|
| `LIMIT 50000` | `player-data`, `milb/player-data`, `imagine/heatmap-data` | newest 50,000 rows | **no** |
| `statement_timeout=8s` | `run_query` — `/api/report`, most routes | error → 500 | yes |
| `statement_timeout=120s` | `run_query_long` — payload routes | error at 120 s | yes |

The `LIMIT` is dangerous because it *succeeds*: the route returns `{ rows, count: validated.length }`
(`:54`), so a truncated career reports `count: 50000`, a ceiling that reads as a count. At
~3,000–3,800 pitches per full season a 2015-debut workhorse is near 36,000–45,000 by 2026 — probably
not bitten yet, a season or two away, no signal for the crossing. (inferred)

The fix costs one comparison. `usePlayerData` already fetches `player_summary.total_pitches`
(`:131–137`) — the true career denominator, in memory beside the truncated array — and the page
renders `resultCount` without ever comparing them (`app/(research)/player/[id]/page.tsx:125`).
**The instrument that would detect the truncation is already on the client, unread**, exactly like
`stuff_plus_n` in `analytics-ux/01`.
`docs/research-app-audit-scope.md` Slice C asks the adjacent question — "when the query doesn't
finish, what does the page show?" For truncation: a smaller career, confidently.

## 7. When to move the line

| Signal | Toward server | Toward client |
|---|---|---|
| Rows needed / rows shipped | < 1:100 | > 1:10 |
| Interaction latency after the move | worse than 200 ms INP | better |
| Filters expressible in SQL | all | any client-only field |
| Denominator needed on screen | only if returned | free |
| DB is the scarce resource | **no** | yes |

The last row decides Triton. Gray's economics — move computation to the data — assume the data side
has capacity to spare; Triton's is a Micro-class instance that ~20 concurrent readers took down for
an hour.

## 8. What Triton should do, in order

1. **Detect the truncation** — compare `allData.length` to `player_summary.total_pitches`; when
   capped, render "50,000 of 61,204, most recent first", not a bare count.
2. **Send `year` on first load** — default `selectedYear` to `info.latest_season`, already fetched:
   ~10× off the default payload, no architectural change, the largest byte win available.
3. **Split the column set** — ship the ~35 columns the dashboard filters and plots on, and move
   `hc_x`/`hc_y`/`launch_speed_angle`/swing-tracking behind a second fetch. Key names are 73% of a
   row, so cutting columns cuts bytes near-linearly.
4. **Return the denominator from `/api/report`** — force `COUNT(*)` into every generated SELECT in
   `lib/reportQueryBuilder.ts`, plus an `_n` companion for the 17 bare-`AVG` metrics. The one item
   that cannot be retrofitted later.
5. **Declare the centroid population** — the row count and year span `enrichDerivedFields` used,
   shown wherever `cluster`/`hdev`/`vdev` render.
6. **Delete `applyFiltersToQuery`**, or gate it to the 48 server-expressible keys.
7. **Move the ~140 ms enrich + options pass off the main thread** — `08-web-workers-offthread.md`.

**Anti-recommendation: do not move single-player filtering to the server.** The obvious answer to
"we ship 66 MiB", wrong on three grounds. *Latency* — the filter costs 7–12 ms for 50,000 rows and
the cheapest replacement is a round trip, so every chip toggle gets slower.
*Expressiveness* — 11 of 59 filter fields have no column to filter on, so it silently deletes the
movement and approach-angle filters or demands the trajectory physics in SQL. *Blast radius* — one
fetch per player becomes N queries per session against a Micro-class instance already taken down
once by ~20 concurrent readers, each under a statement cap. The payload is real; the fix is
fewer columns and a year default, not server-side filtering.

**Highest-leverage next action:** ship item 1 — two lines comparing values already in
`usePlayerData`, turning this surface's one silent data-loss path into a visible one.

## Sources

1. Jim Gray — [Distributed Computing Economics](https://arxiv.org/abs/cs/0403019) — the move-computation-to-data rule §7 inverts.
2. web.dev — [Interaction to Next Paint](https://web.dev/articles/inp) — the 200 ms budget §3's filter clears.
3. web.dev — [Optimize long tasks](https://web.dev/articles/optimize-long-tasks) — the 50 ms line §3's one-time passes cross.
4. web.dev — [The RAIL model](https://web.dev/articles/rail) — the 100 ms response budget grading §3.
5. Vercel — [CDN cache](https://vercel.com/docs/edge-network/caching) — the 10 MB ceiling and `s-maxage` rule §2 fails.
6. Vercel — [Compression](https://vercel.com/docs/edge-network/compression) — edge brotli/gzip behind §2's wire figures.
7. PostgreSQL — [Aggregate functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — `AVG()` skipping NULLs, §5's lost `n`.
8. PostgreSQL — [Client connection defaults](https://www.postgresql.org/docs/current/runtime-config-client.html) — `statement_timeout`, §6's two caps.
9. Supabase — [Postgres configuration](https://supabase.com/docs/guides/database/postgres/configuration) — the role timeout on `run_query`.
10. Next.js — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — what 355 `'use client'` files opt out of.
11. Next.js — [Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route) — the layer Triton uses instead of RSC.
12. Apache Arrow — [Overview](https://arrow.apache.org/overview/) — columnar layout, §2's key-name fix.
13. TanStack Query — [Caching](https://tanstack.com/query/latest/docs/framework/react/guides/caching) — `staleTime`/`gcTime` holding the payload past unmount.

**Triton-internal evidence (repo read and benchmarked 2026-08-21; no production query).** Boundary — `app/api/player-data/route.ts:5` (70 `BASE_COLUMNS`), `:29` ("50K → ~5K"), `:44` (`LIMIT 50000` via `run_query_long`), `:54` (`count: validated.length`), `:55` (no `s-maxage`); same shape at `app/api/milb/player-data/route.ts:17`, `app/api/imagine/heatmap-data/route.ts:64`. **1,009 B/row of JSON key+punctuation across 71 columns → 48.1 MiB at 50,000 rows**, exact from that file; row-size and compression figures (~1,380 B/row; 66 MiB raw, 7 MiB gzip, 4.7 MiB brotli) are from **synthetic** rows matching the column list, not production data. Timings are verbatim transcriptions of `lib/enrichDerivedFields.ts` and `lib/filterEngineCore.ts:132–155` under Node 22.18 on the dev machine — at 50,000 rows: enrich 93 ms, 5-predicate filter 7–12 ms, options build 47 ms, ~58 MiB heap on a 44-field row (the 80-field row scales to ~100 MiB). Filters — `lib/filterEngineCore.ts:33–102`: **59 keys, 0 `dbColumn` overrides, 11 with no `pitches` column**; `applyFiltersToQuery` `:109–129`, **zero callers** in `app/`, `lib/`, `components/`. Payload-scoped centroids `lib/enrichDerivedFields.ts:38–63`. Wiring — `lib/hooks/usePlayerData.ts:123`, `:142–154`, `:236–239`; `player_summary.total_pitches` `:131–137`, unread by `app/(research)/player/[id]/page.tsx:125`. Server — `app/api/report/route.ts:11`, `lib/reportQueryBuilder.ts:107–113`; `lib/reportMetrics.ts`: **59 metrics, 27 `NULLIF` denominators, 17 bare `AVG(...)`, 0 returning a denominator**, `pitches: 'COUNT(*)'` `:7`; sets omitting it `lib/leaderboardColumns.ts:177–182`. Caps — `PLANNING.md:40`, `:304`: `authenticator` 8s, `run_query_long` 120s, `supabaseAdminLong` (`lib/supabase-admin.ts:20`) a client deadline with no server effect. Repo-scale counts are the packet's; §6's truncation onset is arithmetic on season pitch counts, not a measured row count.
