---
title: Aggregation & Materialization — Storing the Answer Instead of Computing It
domain: postgres-performance
tags:
  - materialized-views
  - refresh-concurrently
  - rollup-tables
  - pre-aggregation
  - staleness
  - incremental-maintenance
  - statement-timeout
  - refresh-scheduling
sources_reviewed: 22
last_updated: 2026-08-11
---

# Aggregation & Materialization — Storing the Answer Instead of Computing It

## TL;DR

- **Triton's nightly matview refresh has failed every night for at least 52 consecutive days and reported success every time.** `cron_runs WHERE job='refresh'`, 2026-06-21 → 2026-08-11: 50 runs recorded `materializedViews: {"error":"canceling statement due to statement timeout"}`, 2 skipped, **zero succeeded** — `status='success'` on all 52. `refresh_league_averages` and `refresh_league_percentiles` failed identically. The Stuff+ outage again, live, in a different pipe. (measured, 2026-08-11)
- **Root cause is a one-word omission: `refresh_materialized_views()` has no function-level `statement_timeout`.** `proconfig` is `NULL`, so it inherits `authenticator`'s 8s cap. `refresh_player_summary()`/`refresh_batter_summary()` carry `statement_timeout=120s` — and are the only refresh functions on the platform that still work. A controlled experiment inside one codebase. (measured)
- **`statement_timeout` bounds the whole function call, not the statements inside it.** Tom Lane: *"measured across an entire interactive command, not individual commands within a function."* Six `REFRESH`es plus a rollup rebuild share one 8s budget, and a timeout rolls back all of it. (documented)
- **`SECURITY DEFINER` does not raise the timeout; `SET statement_timeout` in `proconfig` does.** Constantly conflated. `run_query` is `SECURITY DEFINER` and still capped at 8s; `run_query_long` is the same function plus one `SET` clause. (measured)
- **CONCURRENTLY requires a UNIQUE index on plain columns covering all rows, and is usually *slower* than a plain refresh.** It recomputes into a temp table, `FULL OUTER JOIN`s against the existing matview, then applies the diff. It buys read availability, not speed — and being a DELETE/INSERT, it bloats. (documented)
- **A UNIQUE index on a nullable column silently wrecks concurrent refresh.** The diff join uses equality on every unique-index column and NULLs never compare equal: a 1M-row matview went **~1700 ms → ~9000 ms** after adding a unique index on an all-NULL column. (documented)
- **Postgres has no built-in "last refreshed" timestamp, and the obvious proxy is wrong for CONCURRENTLY.** Plain `REFRESH` swaps the heap so `relfilenode` changes; concurrent refresh updates in place, so it does not. Use a refresh-log table or a semantic watermark. (documented + inferred)
- **The grain you materialize at matters more than whether you materialize.** `stuff_plus` is stored per-pitch on 8.89M rows × 29 indexes — finest grain, highest write cost, and the thing that broke. `pitcher_season_command` stores the same family of answers at 27,152 rows. (measured)
- **Rollup tables beat matviews at scale because they can be incremental and a matview cannot.** `REFRESH` always recomputes everything; `INSERT ... ON CONFLICT DO UPDATE` over a watermark touches only new rows. Triton already demoted its largest view to a rollup for exactly this reason — and never generalized it. (measured)
- **A freshness monitor checking marker *age* would have missed this entirely, because the marker row does not exist.** `mv_last_refreshed` is written only on success, has never succeeded, and is absent from `system_metadata`. Absent must mean infinitely stale, not "skip." (measured)

---

## 1. Store or compute

Every derived number carries one question: do you pay on **write** or on **read**?

| | Compute on read | Materialize on write |
|---|---|---|
| Freshness | always exact | stale by up to one refresh interval |
| Read cost | every request | ~zero |
| Write cost | zero | grain × index count |
| Indexable/sortable in SQL | no (if computed in app code) | yes |
| **Failure mode** | **slow** | **silently wrong** |

That last row is the one people skip. Computing on read fails *loudly* — the page hangs, someone complains. Materializing fails *quietly* — the page is fast and the number is from June. Hence the default: **materialize only what you must, and instrument everything you materialize.**

Triton has made this call three ways, all in the repo today:

- **`wRC+` — computed on read, in JS.** `computeWRCPlus()` (`lib/sql.ts:53`) is nine lines of arithmetic per row per request. Cannot go stale, needs no monitor. Cost: no `ORDER BY wrc_plus` in SQL, so leaderboards sort in JS.
- **`stuff_plus` — materialized at the finest grain.** A stored column on `pitches` (8.89M rows, 29 indexes) scored by a bulk `UPDATE` (`app/api/update/route.ts:322`). The most expensive place on the platform to store a derived value — and where the 2026 outage happened.
- **`pitcher_season_command` / `_deception` / `league_averages` — materialized at query grain.** 27,152 / 17,386 / 1,806 rows.

> Materializing at the grain of the **fact** costs row-count × index-count on every write. Materializing at the grain of the **question** costs the size of the answer. Pick the second unless you need per-row filtering.

`stuff_plus` genuinely needs per-row storage — you slice pitches by it. Most derived values do not.

---

## 2. What a materialized view actually is

A heap holding a query's result, plus a catalog entry remembering the query. Not a cache with invalidation — a snapshot with a manual refresh. Postgres never refreshes one for you and never warns you it is old.

- **Indexes do not come along.** The matview is a separate relation needing its own indexes.
- **`REFRESH` is all-or-nothing.** Core Postgres has no incremental refresh; the full defining query runs whether one row changed or a million.
- **It is a relation** — it bloats, needs `ANALYZE`, and appears in `pg_stat_all_tables`. That last fact is how I found Triton's outage (§6).
- **`WITH NO DATA` leaves it unqueryable** — the only built-in staleness guard, and it covers "never populated," not "populated in June."

### 2.1 Plain `REFRESH` vs `CONCURRENTLY`

| | `REFRESH MATERIALIZED VIEW` | `... CONCURRENTLY` |
|---|---|---|
| Blocks concurrent `SELECT`? | **yes** | no |
| Unique index required? | no | **yes** — plain columns, all rows |
| Must already be populated? | no | **yes** |
| Mechanism | build new heap, swap | temp result → `FULL OUTER JOIN` diff → DML |
| Cheaper when | many rows changed | few rows changed |
| `relfilenode` changes? | yes | **no** |
| Generates dead tuples? | no (heap swap) | **yes** |

The docs are explicit that CONCURRENTLY is not a free win: *"Without this option a refresh which affects a lot of rows will tend to use fewer resources and complete more quickly... This option may be faster in cases where a small number of rows are affected."*

The naming is a trap. `CONCURRENTLY` buys **read availability during the refresh** and charges you in total work. If nobody reads the matview at 09:10 UTC, plain is cheaper. And because it is mechanically a DELETE/INSERT, it bloats nightly — pair it with a VACUUM policy (`05-vacuum-autovacuum-bloat.md`).

### 2.2 The nullable-unique-index landmine

The diff join gets equality conditions on every column referenced by any unique index. `NULL = NULL` is never true, so NULL-bearing rows fail to match and land in the diff as delete+insert pairs. Reproducer on pgsql-hackers: a 1M-row matview refreshed concurrently in **~1700 ms**; adding a second unique index on an all-NULL column took it to **~9000 ms**. The same mechanism causes concurrent refresh to *miss* duplicates a plain refresh rejects.

**Rule: the unique index enabling CONCURRENTLY must be on NOT NULL columns, and there should be exactly one.** Extra unique indexes are not free — they join. Triton's six are on identity tuples like `(player_id, game_year, pitch_type)`, all naturally non-null. No exposure today; assert it before anyone adds a seventh. (measured)

---

## 3. Why Triton's refresh has failed 50 nights running

A live, unresolved incident — found by checking the premise, not by any monitor.

### 3.1 The mechanism

`/api/cron/refresh` calls `supabaseAdmin.rpc('refresh_materialized_views')` (`route.ts:134`): PostgREST → connect as `authenticator` → `SET ROLE service_role` → `SELECT refresh_materialized_views()`. Three facts compose:

1. `authenticator` carries `statement_timeout=8s`; `service_role` has `rolconfig = NULL`, and `SET ROLE` does not re-apply role config. The session keeps 8s. (measured)
2. `statement_timeout` bounds the **whole** top-level command. The function body — one `DELETE`, one `INSERT ... SELECT` aggregating two seasons of `pitches`, then six `REFRESH ... CONCURRENTLY` — shares a single 8s budget. Inner statements do not reset the clock. (documented)
3. `refresh_materialized_views()` has `proconfig = NULL`. Nothing raises the ceiling. (measured)

```
-- measured 2026-08-11: SELECT proname, prosecdef, proconfig FROM pg_proc ...
        proname            | prosecdef |             proconfig
---------------------------+-----------+-------------------------------------------
 refresh_materialized_views| f         | NULL                          -- capped 8s
 refresh_league_averages   | f         | NULL                          -- capped 8s
 refresh_league_percentiles| f         | NULL                          -- capped 8s
 refresh_player_summary    | t         | {statement_timeout=120s, ...} -- works
 refresh_batter_summary    | t         | {statement_timeout=120s, ...} -- works
 run_query                 | t         | {search_path=...}             -- capped 8s
 run_query_long            | t         | {statement_timeout=120s, ...} -- works
```

Note `run_query` **is** `SECURITY DEFINER` and **is** still capped at 8s. `SECURITY DEFINER` changes whose privileges apply, not what timeout applies. Only the `SET` clause does that. This distinction is the whole bug.

### 3.2 The evidence

Across 2026-06-21 → 2026-08-11, `cron_runs` holds **52 refresh runs: 50 timed out, 2 skipped (no pitches), 0 succeeded — and `status='success'` on all 52.** The 50 all carry `canceling statement due to statement timeout` for `materializedViews`, `leagueAverages`, **and** `leaguePercentiles` — precisely the three functions with `proconfig = NULL`. The cron's own `duration_ms` ran 41,670–60,150 ms, so Vercel budget was never the constraint; the database cut each call at 8s.

`cron_runs` only retains to 2026-06-21, so 52 days is a **floor**. Corroborating state:

| Object | Last-refresh evidence | Age |
|---|---|---|
| `league_averages` (2026) | `max(updated_at)` = 2026-06-26 19:48 | **46 d** |
| `mv_pitcher_pitch_stats` | `last_autoanalyze` = 2026-06-26 19:43 | 46 d |
| `mv_batter_season_stats` | `last_autoanalyze` = 2026-06-26 19:57 | 46 d |
| `mv_team_{pitching,batting,bullpen,platoon}_stats` | `last_autoanalyze` = 2026-06-26 19:44–19:56 | 46 d |
| `league_percentiles` | `last_autoanalyze` = 2026-06-03 18:55 | **69 d** |
| `player_summary` | `last_autovacuum` = 2026-08-05 | 6 d ✅ |
| `batter_summary` | `last_autovacuum` = 2026-08-11 10:03 | same day ✅ |

Every stale timestamp clusters in a 15-minute window on 2026-06-26 at ~19:4x UTC — **not** the 09:10 UTC cron slot. That is the signature of a single manual out-of-band run from a session without the 8s cap, staggered only by autovacuum's naptime. The scheduled job has not landed a refresh since.

The control group at the bottom is the proof of mechanism: `player_summary` and `batter_summary` go through the two functions carrying `statement_timeout=120s`, and they are current. Same cluster, same disk, same night, same base table. The only difference is `proconfig`.

### 3.3 Why nobody noticed, and what is being served

Four stacked failures of "green means the work happened":

1. **`trackCronRun` recorded `success`.** The route catches the RPC error into a result object (`route.ts:134–148`) and returns 200 — the same swallow-and-return-200 shape as the Stuff+ outage.
2. **The marker is written only on success** (`route.ts:136–145`), so `mv_last_refreshed` **does not exist** in `system_metadata`.
3. **Its one consumer never asserts.** `/api/admin/cron-health` returns `mvLastRefreshed: meta?.value ?? null` — a value rendered on a page, not a threshold.
4. **A naive age check would still miss it.** `WHERE key='mv_last_refreshed' AND updated_at < now() - interval '36 hours'` returns **zero rows** when the key is absent, and zero rows reads as "nothing wrong."

Point 4 is the most portable lesson: **freshness monitors must assert existence before age.** The failure that never writes a marker is the one you most want to catch.

Meanwhile these matviews back leaderboards, team tendencies, park-adjusted views, and `/api/scene-stats` — including broadcast overlays. Since 2026-06-26 those surfaces have rendered a season ending in late June, with no null, no gap, no visual cue: the "partial degradation renders" pathology from `data-reliability/01-pipeline-observability-fundamentals.md` §1.1. I did not quantify per-surface drift — the instance became unresponsive under an `EXPLAIN ANALYZE` I ran against the `mv_pitcher_pitch_stats` defining aggregate (it did not return inside ~2 minutes, itself a useful cost signal). Quantify the gap immediately after the fix. *(verify)*

---

## 4. Rollup tables — the strategy that already works here

Triton contains the answer to its own problem, applied once and never generalized. `scripts/create-materialized-views.sql:7–10`:

> `mv_pitcher_season_stats` is a regular TABLE (not a materialized view) because the full MV REFRESH exceeds Supabase statement timeouts. It is refreshed incrementally (DELETE recent + re-INSERT).

Someone hit the wall, diagnosed it correctly, and demoted **one** view to a rollup scoped to `game_year >= current_year - 1`. The other six kept `REFRESH ... CONCURRENTLY` over all seasons — then the whole function was wrapped in a single 8s call, which took the fixed one down with the broken ones.

`REFRESH` has no notion of "what changed." A rollup does:

```sql
INSERT INTO rollups
SELECT day, page, count(*) AS views
FROM   pageviews WHERE event_id > :watermark
GROUP  BY day, page
ON CONFLICT (day, page) DO UPDATE
SET views = rollups.views + EXCLUDED.views;
```

Cost is proportional to **new rows**, not **all rows**. For an append-mostly table like `pitches` — 9,078 rows arrived on 2026-08-11 against 8.89M total, **0.1%** — that is three orders of magnitude less work per night.

| | Materialized view | Rollup table |
|---|---|---|
| Refresh cost | O(all rows) | O(new rows) |
| Incremental? | no | yes |
| Effort to build | one `CREATE` | a function + a watermark |
| Correctness risk | low (recomputed) | **higher — drift accumulates** |
| Backfill/restatement | free (just refresh) | needs an explicit rebuild path |
| Fits in 8s at Triton's scale | no | yes |

The honest cost is the last two rows. A matview self-heals: if it is wrong, refresh it. An incremental rollup accumulates drift from late-arriving data, restatements, and any night the watermark advanced without rows landing. Baseball has all three — Savant revises, which is why `/api/cron/pitches` re-syncs a **3-day window**.

> **Incremental for the hot window, full recompute for the cold one.** Rebuild the current season nightly if it fits; recompute closed seasons on demand only. Never trust a watermark across a boundary the upstream can revise.

Triton's `DELETE WHERE game_year >= current_year - 1` + re-`INSERT` is exactly this shape. It just needs to run somewhere it is allowed to finish.

**Incremental view maintenance, briefly.** `pg_ivm` populates a real table via `create_immv()` and installs triggers on every base table, so DML maintains the view in the same transaction. **Not appropriate for Triton:** triggers on every write to `pitches` add per-row work to an ingest already fighting an 8s cap and 29 indexes; pg_ivm supports neither `OUTER JOIN` nor `ORDER BY`, which these definitions use freely; and it is not Supabase-managed. (inferred) Timescale's continuous aggregates are the better model to borrow: they recompute **only the time buckets whose data changed**, and since 2.28.0 refresh in batches of 10 buckets, each in its own transaction so locks release between batches. That decomposition transfers directly (§7 step 3).

---

## 5. Refresh scheduling and staleness windows

A staleness window is a **product decision you write down**, not an accident of when cron runs.

| Object | Consumer | Tolerable | Actual today |
|---|---|---|---|
| `mv_team_*_stats` | broadcast overlays, team pages | 24 h | **46 d** |
| `mv_pitcher_pitch_stats` | leaderboards, arsenal views | 24 h | **46 d** |
| `league_averages` | every plus-stat denominator | 24 h | **46 d** |
| `league_percentiles` | percentile displays | 24 h | **69 d** |
| `player_summary` | search / quick lookup | 24 h | 6 d ✅ |

Anything exceeding its tolerance by 40× is not a tuning problem. It is an outage.

Triton drives refreshes Vercel cron → HTTP route → RPC, so every refresh inherits the 8s PostgREST ceiling. The alternative is `pg_cron`, supported natively as Supabase Cron: jobs live in `cron.job` and run **inside the database**, never touching `authenticator` and therefore never seeing its 8s cap. Not a workaround — the correct home for a database maintenance task, and it removes HTTP timeouts, cold starts, and Vercel budget from the path.

### 5.1 Ordering dependencies

**Catalog dependencies** — a matview reading another matview. Refresh the parent first or the child materializes stale input. Postgres records this in `pg_depend`/`pg_rewrite` but **does not order refreshes for you**; `REFRESH` never cascades. Triton's graph is flat: measured 2026-08-11, all six `mv_*` and `batter_summary` read `pitches` directly, `retro_id_map` reads `retro_people`. Depth 1, no matview-on-matview — so the six refreshes are independent and could run in any order or in parallel transactions.

**Data dependencies** — invisible to the catalog and far more dangerous. `mv_pitcher_pitch_stats` selects `AVG(p.stuff_plus)` and `COUNT(p.stuff_plus)`. Nothing in `pg_depend` records that it is only correct *after* the nightly `stuff_plus` scoring `UPDATE`. Refresh it early and you materialize a coverage hole into a table that serves it for 24 hours. The real order exists only in code:

```
ingest pitches → score stuff_plus → pitch_baselines
   → triton/deception → league_averages → league_percentiles → matviews
```

`/api/cron/refresh` does sequence these correctly and gates on `totalInserted > 0` and `allComputeFailed`. That instinct is right. The gap is that it gates on *upstream* success while never checking *its own*.

---

## 6. How to know a matview is stale

Postgres gives you no last-refresh timestamp. Ranked by reliability:

**1. A refresh-log table you write yourself — the only real answer.**

```sql
CREATE TABLE matview_refresh_log (
  view_name text NOT NULL, refreshed_at timestamptz NOT NULL DEFAULT now(),
  duration_ms int, row_count bigint, ok boolean NOT NULL, error_text text,
  PRIMARY KEY (view_name, refreshed_at)
);

-- fires on stale AND on never-refreshed
SELECT v.matviewname, coalesce(max(l.refreshed_at)::text, 'NEVER') AS last_ok
FROM pg_matviews v
LEFT JOIN matview_refresh_log l ON l.view_name = v.matviewname AND l.ok
WHERE v.schemaname = 'public'
GROUP BY v.matviewname
HAVING max(l.refreshed_at) < now() - interval '36 hours'
    OR max(l.refreshed_at) IS NULL;
```

Log **failures too** — that is the entire difference between this and `mv_last_refreshed`, which is written only on success and therefore does not exist.

**2. A semantic watermark — best correctness check, no new plumbing.** Compare the matview's row count for the current season against the base table's. If it trails by more than a day's ingest it is stale, regardless of what any log claims. This also catches a refresh that "succeeded" against the wrong data.

**3. `pg_stat_all_tables` — the forensic proxy, zero setup.** A concurrent refresh performs DML on the matview, moving `n_tup_ins/upd/del` and eventually `last_autovacuum`/`last_autoanalyze`. **This is how I found the outage**: six matviews frozen at 2026-06-26 while `batter_summary` showed 2026-08-11.

```sql
SELECT relname, last_autovacuum, last_autoanalyze
FROM pg_stat_all_tables WHERE relname LIKE 'mv\_%' ORDER BY 2 NULLS FIRST;
```

Caveat: it is a *proxy*. Autovacuum fires on thresholds, not refreshes — absence of a recent timestamp is strong evidence of no refresh; a recent timestamp is weak evidence of one. Good for diagnosis, not alerting.

**4. Two catalog signals that look useful and are not.** `pg_class.relfilenode` changes on a plain `REFRESH` (heap swap) but **not** on `CONCURRENTLY` (in-place update) — dead signal once you standardize on CONCURRENTLY, as Triton has. `pg_matviews.ispopulated` tells you only whether it was *ever* populated; all of Triton's report `true` while serving June data.

---

## 7. What Triton should do, in order

1. **Add `SET statement_timeout` to the three broken functions. Today.** It is the entire root cause. Blast radius: metadata-only `ALTER`, brief lock on the `pg_proc` row, instantly reversible.
   ```sql
   ALTER FUNCTION public.refresh_materialized_views()       SET statement_timeout = '600s';
   ALTER FUNCTION public.refresh_league_averages(integer)    SET statement_timeout = '600s';
   ALTER FUNCTION public.refresh_league_percentiles(integer) SET statement_timeout = '600s';
   ```
   **Then re-measure** — do not assume it now fits. Time each of the six refreshes individually; this incident exists because nobody measured this path.
2. **Run the refresh by hand and verify recovery.** Confirm `league_averages.updated_at` for 2026 advances to today and `mv_*` row counts match the base table (§6.2). Quantify the recovered-vs-stale delta so the 46-day gap is measured, not quietly closed.
3. **Split the monolith into six calls.** A timeout on the sixth `REFRESH` currently rolls back the first five *and* the `mv_pitcher_season_stats` rebuild — all-or-nothing, no partial credit. Six calls means five successes and one failure, and per-view timing becomes visible.
4. **Write a refresh log, and log failures.** Replace the success-only `mv_last_refreshed` with `matview_refresh_log` (§6.1), written unconditionally including `ok=false` and error text. The marker that does not exist is what hid this for 52+ days.
5. **Add the freshness assertion, with the existence check.** Daily: any matview whose last successful refresh is `NULL` or older than 36 hours fails the run, via `reportError` + a failed `trackCronRun`. The §5 table is the SLO — see `data-reliability/02-data-freshness-slos.md`.
6. **Make `/api/cron/refresh` fail loudly.** It collects `{error: ...}` into a payload and returns 200. Adopt the Stuff+ fix's pattern: commit what succeeded, `throw` so `trackCronRun` goes red.
7. **Move the refresh into the database on `pg_cron`.** A `cron.schedule('refresh-matviews', '10 9 * * *', ...)` job never authenticates as `authenticator`, never sees the 8s cap, and drops the HTTP layer from a database maintenance task. The durable fix; steps 1–3 are the fast one.
8. **Convert `mv_pitcher_pitch_stats` and `mv_batter_season_stats` to season-scoped rollup tables.** The two largest (41,173 and 9,746 rows) and the only two with real growth. Closed seasons are immutable — recomputing 2015–2024 nightly is pure waste. The team matviews (360–720 rows) can stay.
9. **VACUUM policy on the concurrent matviews.** Once step 1 makes them refresh again they will bloat for the first time in 46 days. Watch `n_dead_tup`; see `05-vacuum-autovacuum-bloat.md`.
10. **Audit every RPC for `proconfig`.** Run the §3.1 `pg_proc` query and treat `proconfig IS NULL` on any function doing bulk work as a defect. This generalizes Triton priority #3 — audit the *functions*, not just the routes.

**Anti-recommendation: do not raise `authenticator`'s `statement_timeout`.** It is the obvious move and it is wrong. That 8s cap is the only thing between a runaway analytical query and every front-end request on the platform — `anon` sits at 3s and `authenticated` at 8s precisely so a bad dashboard query cannot saturate the pool. Raising it globally converts a well-scoped nightly failure into an unbounded daytime availability risk, and it would have *hidden* this incident rather than surfaced it. The correct escape hatch is **per-function** `SET statement_timeout`, or moving the work off the PostgREST path via `pg_cron`. The same applies to `supabaseAdminLong` — as the comment at `route.ts:57–59` already notes, it raises only the *client-side fetch* timeout and does nothing to the database's cap. Two jobs have now hit this wall by trusting a client timeout. It is not a timeout; it is a deadline you do not control.

---

## Sources

1. PostgreSQL — [REFRESH MATERIALIZED VIEW](https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html) — CONCURRENTLY's unique-index and already-populated requirements; "without this option a refresh... will tend to use fewer resources and complete more quickly."
2. PostgreSQL — [CREATE MATERIALIZED VIEW](https://www.postgresql.org/docs/current/sql-creatematerializedview.html) — `WITH NO DATA` leaves the view unscannable.
3. PostgreSQL — [Materialized Views (Rules chapter)](https://www.postgresql.org/docs/current/rules-materializedviews.html) — stored query results, no automatic refresh.
4. PostgreSQL — [`statement_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html) — per-command application semantics.
5. Tom Lane, pgsql-general — [statement_timeout within plpgsql](https://www.postgresql.org/message-id/7211.1171993828%40sss.pgh.pa.us) — *"measured across an entire interactive command, not individual commands within a function."* Load-bearing citation for §3.
6. pgsql-hackers — [Two issues with REFRESH MATERIALIZED VIEW CONCURRENTLY](https://www.postgresql.org/message-id/40d694df-39fd-4a4a-9459-9d6489165f60%40gogi.tv) — nullable unique-index columns enlarge the diff: ~1700 ms → ~9000 ms; also misses duplicates.
7. PostgreSQL commit — [Fix performance hazard in REFRESH MATERIALIZED VIEW CONCURRENTLY](https://postgresql.org/message-id/E1ey2Fq-0000bz-Oc%40gemulon.postgresql.org) — diff-join construction and cost.
8. PostgreSQL Commitfest — [Fix performance of REFRESH MATERIALIZED VIEW CONCURRENTLY](https://commitfest.postgresql.org/patch/6580) — a known weak spot, not folklore.
9. CYBERTEC — [Creating and refreshing materialized views](https://www.cybertec-postgresql.com/en/creating-and-refreshing-materialized-views-in-postgresql/) — "technically, it is a DELETE / INSERT, which is prone to cause table bloat."
10. CYBERTEC — [Tracking view dependencies](https://www.cybertec-postgresql.com/en/tracking-view-dependencies-in-postgresql/) — walking `pg_depend`/`pg_rewrite`; basis for §5.1.
11. Crunchy Data — [Indexing Materialized Views in Postgres](https://www.crunchydata.com/blog/indexing-materialized-views-in-postgres) — base-table indexes don't transfer; matview "needs a stand alone index."
12. Crunchy Data — [Materialized Views tutorial](https://www.crunchydata.com/developers/playground/materialized-views) — plain refresh takes an exclusive lock; scheduling with pg_cron.
13. Crunchy Data — [Postgres Tuning & Performance for Analytics Data](https://www.crunchydata.com/blog/postgres-tuning-and-performance-for-analytics-data) — pre-aggregation as an analytics strategy.
14. Citus Data — [Materialized views vs. Rollup tables in Postgres](https://www.citusdata.com/blog/2018/10/31/materialized-views-vs-rollup-tables/) — the core §4 argument; rollups win at scale by "only processing net new data"; source of the `ON CONFLICT DO UPDATE` pattern.
15. Citus Data — [Scalable incremental data aggregation](https://www.citusdata.com/blog/2018/06/14/scalable-incremental-data-aggregation/) — watermark-based rollup design.
16. Citus Data — [Real-time analytics dashboards with Postgres & Citus](https://www.citusdata.com/blog/2017/12/27/real-time-analytics-dashboards-with-citus/) — pre-computed aggregates orders of magnitude faster than the fact table.
17. pganalyze — [Incremental Materialized Views with pg_ivm](https://pganalyze.com/blog/5mins-postgres-15-beta1-incremental-materialized-views-pg-ivm) — a ~20s refresh is why you can't run it continuously.
18. pg_ivm — [GitHub: sraoss/pg_ivm](https://github.com/sraoss/pg_ivm) — `create_immv()` installs triggers on every base table; no OUTER JOIN or ORDER BY.
19. PostgreSQL News — [pg_ivm 1.0 released](https://www.postgresql.org/about/news/pg_ivm-10-released-2443) — release and support context.
20. Tiger Data — [About continuous aggregates](https://www.tigerdata.com/docs/use-timescale/latest/continuous-aggregates/about-continuous-aggregates) — only changed buckets recomputed; since 2.28.0 refreshes batch 10 buckets, each in its own transaction. Basis for §7 step 3.
21. Tiger Data — [Continuous Aggregates: Incremental Materialized Views](https://www.tigerdata.com/learn/continuous-aggregates-timescaledb) — `REFRESH MATERIALIZED VIEW` fully recomputes every run.
22. Supabase — [pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron) and [Cron](https://supabase.com/docs/guides/cron) — natively supported; jobs live in `cron.job` and execute inside the database. Basis for §7 step 7.

**Triton-internal evidence (measured 2026-08-11):** `pg_proc.proconfig`/`prosecdef` for all refresh and `run_*` functions; `pg_roles.rolconfig`; 52 rows of `cron_runs WHERE job='refresh'`; `system_metadata` key inventory; `league_averages` per-season `max(updated_at)`; `pg_stat_all_tables` timestamps for `mv_*`, `player_summary`, `batter_summary`, `league_averages`, `league_percentiles`; matview dependency graph via `pg_depend`/`pg_rewrite`. Code: `scripts/create-materialized-views.sql`, `app/api/cron/refresh/route.ts:99–149`, `app/api/admin/cron-health/route.ts:41–47`, `app/api/update/route.ts:295–330`, `lib/sql.ts:53`. Cross-references: `05-vacuum-autovacuum-bloat.md`, `03-timeouts-locks-concurrency.md`, `07-postgrest-supabase-architecture.md`, `data-reliability/01-pipeline-observability-fundamentals.md`, `data-reliability/02-data-freshness-slos.md`.
