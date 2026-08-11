---
title: Query Planning and EXPLAIN — Reading the Plan Before It Reads You
domain: postgres-performance
tags:
  - explain
  - query-planner
  - cost-model
  - planner-statistics
  - extended-statistics
  - parallel-query
  - plan-regression
  - statement-timeout
sources_reviewed: 24
last_updated: 2026-08-11
---

# Query Planning and EXPLAIN — Reading the Plan Before It Reads You

> **Version note.** Claims are against **PostgreSQL 18 docs** (`/docs/current`, read 2026-08-11).
> Supabase defaults to **Postgres 17**, so PG 18 conveniences (`BUFFERS` on by default with
> `ANALYZE`) are probably absent *(verify: `SHOW server_version`)*.

## TL;DR

- **Plan quality here is a correctness concern, not an optimization concern.** `authenticator` carries `statement_timeout = 8s`, unoverridden by `service_role`, so a bad plan doesn't render a slow page — it raises `canceling statement due to statement timeout` and the feature returns nothing. (measured)
- **`EXPLAIN` has never been run in this repo.** A grep across `*.ts`/`*.sql` returns **zero hits**; every index in `scripts/create-tier2-indexes.sql` was reasoned from query text, not a plan. (measured, 2026-08-11)
- **You cannot get a plan through `run_query`** — it accepts SELECT/WITH only. Use the SQL editor, a direct connection, or PostgREST's `explain()`; none inherit the 8s cap, so always `SET LOCAL statement_timeout = '8s'`. (documented + measured)
- **A cold seq scan of `pitches` doesn't fit the budget.** Heap ≈ 4.9 GB ≈ 642k pages → cost ≈ **731,000**, ~5s of I/O at an optimistic 1 GB/s. `retro_events` (≈16.5 GB, cost ≈ **2.3M**) is impossible. (inferred — arithmetic over measured sizes)
- **`pitches` may go a whole season without an auto-ANALYZE.** The trigger is `50 + 0.1 × reltuples` ≈ **889,050** changed rows against ~3.6k/day of ingest → **~240 days**, leaving the leading edge of `game_date` invisible. (inferred)
- **`pitches` has four functional dependencies the planner doesn't know about** — `game_date→game_year`, `pitch_type↔pitch_name`, `pitcher→p_throws`, `game_pk→game_date`. The docs' example estimates **1** against an actual **100**; `CREATE STATISTICS` fixes it at **zero write-time cost**. (documented + inferred)
- **A Seq Scan is often correct and an index is often the wrong fix.** Past ~10% selectivity a seq scan wins, and `pitches` already carries **29 indexes / 4.8 GB, ~half its size**, repaid on every row of every bulk UPDATE. (documented + measured)
- **Parallel query is a hazard under a hard timeout.** Workers are allocated at *execution* time, so a plan that falls back to serial under load turns a 3s query into a 9s failure with no code change. (documented mechanism, inferred consequence)

---

## 1. Why plan quality is a correctness problem here

Elsewhere a bad plan costs p99 latency. Here it costs data. A query degrading from 6s to 9s doesn't get slower — it stops returning data, and if the caller catches and logs the error (as the 2026 Stuff+ outage did) the platform reports success while producing nothing.

So `EXPLAIN` is not a tuning tool here. It reports how much headroom a query has before it becomes a data-loss event, and the number is `Execution Time ÷ 8000ms`. Both measured incidents fit: the Stuff+ UPDATE crossed 8s as the 2026 table grew (~12k rows × 29 indexes in one statement), and `scripts/backfill-pitch-videos.ts` hit the same wall and escaped to `run_query_long`.

---

## 2. Getting a plan on this platform

`run_query` accepts `SELECT`/`WITH` only — the guard is mirrored at `app/api/explore/query/route.ts:29` — and `run_mutation` accepts INSERT/UPDATE/DELETE only. There is no RPC path to a plan. Three that work:

- **Supabase SQL editor** — privileged role, not `authenticator`, so the 8s cap doesn't apply *(verify the role)*.
- **Direct `psql`** via the session pooler — required for `EXPLAIN ANALYZE` on writes.
- **PostgREST `explain()`** after `ALTER ROLE authenticator SET pgrst.db_plan_enabled TO 'true'; NOTIFY pgrst, 'reload config';` — off by default because plans leak schema, and it covers only `.from().select()`.

The first two bypass the production ceiling, so reproduce it:

```sql
BEGIN;
SET LOCAL statement_timeout = '8s';          -- match authenticator
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT …;
ROLLBACK;
```

The `ROLLBACK` is also the documented safe form for writes — **`ANALYZE` actually executes the statement**. If the query already times out, plain `EXPLAIN` plans without executing, or shrink the window (one day, not one season) — but small-table results don't extrapolate, because plan *shape* changes with scale.

---

## 3. The EXPLAIN option matrix

| Option | Default | Buys you | Use when |
|---|---|---|---|
| *(none)* | — | Plan shape + estimates, no execution | Query times out |
| `ANALYZE` | off | Actual rows, time, loops | Always, if it can finish |
| `BUFFERS` | off (**on with ANALYZE in PG 18**) | shared hit/read/dirtied/written | Always — separates bad plan from cold cache |
| `VERBOSE` | off | Output columns, qualified names | Wide tables: shows if a scan drags 90 columns |
| `SETTINGS` | off | Planner GUCs differing from defaults | First plan on a managed instance |
| `TIMING` | on (w/ ANALYZE) | Per-node times | Turn **off** for nodes with millions of cheap loops |
| `GENERIC_PLAN` | off | Plan `$1`-style SQL, no execution | Parameterized queries (not with `ANALYZE`) |

**Jo's default:** `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)` — `SETTINGS` because Supabase tunes `work_mem`, `effective_cache_size` and `random_page_cost` per instance size, and guessing from defaults is how you get confidently wrong answers.

---

## 4. The cost model on a 9.7 GB table

Costs are arbitrary units anchored to one sequential 8kB page = 1.0.

| Parameter | Default | Meaning |
|---|---|---|
| `seq_page_cost` / `random_page_cost` | 1.0 / **4.0** | Sequential vs random page fetch — index scans pay the latter |
| `cpu_tuple_cost` / `cpu_index_tuple_cost` / `cpu_operator_cost` | 0.01 / 0.005 / 0.0025 | Per row / index entry / operator |
| `effective_cache_size` | 4 GB | Planner's *belief* about cache; allocates nothing |
| `work_mem` / `hash_mem_multiplier` | 4 MB / 2.0 | Per sort/hash **per node** |
| `jit_above_cost` | 100000 | Plans above this get JIT-compiled |

Seq scan cost = `pages × seq_page_cost + rows × cpu_tuple_cost`, on Triton's tables (heap = total − indexes):

| Table | Rows | Heap ≈ | Pages ≈ | Cost ≈ | Verdict under 8s |
|---|---|---|---|---|---|
| `pitches` | 8.89M | 4.9 GB | 642,000 | **731,000** | ~5s I/O at 1 GB/s before any work. Marginal at best |
| `retro_events` | 14.9M | 16.5 GB | 2,163,000 | **2,312,000** | Physically impossible |
| `milb_pitches` | 2.54M | 1.0 GB | 131,000 | 156,000 | Survivable |

*(inferred — arithmetic over measured sizes, not a captured plan)*

- Any bare `Seq Scan` on `pitches` is a candidate outage, not a slow query; `retro_events` must never be scanned at all → `08-aggregation-materialization.md`. Both clear `jit_above_cost` by 7× and 23×, charged to the same 8s.
- **`effective_cache_size` matters more than `random_page_cost` here.** At 9.7 GB the planner is probably *correct* that index scans miss cache, so lowering `random_page_cost` fights a true belief with a false one.
- **`work_mem` is per node, and each parallel worker gets its own** — the docs put a 4-worker query at up to 5× a serial one's resources. `Sort Method: external merge  Disk: 412536kB`, or `Batches: 8` on a hash join, means it spilled: budget burned on I/O, disk consumed → `05-vacuum-autovacuum-bloat.md`.

---

## 5. The node field guide

Read plans **inside-out, bottom-up** — each node's cost and time include its children.

| Node | Mechanism | Reads as |
|---|---|---|
| **Seq Scan** | Reads every heap page | Fine when unselective; an outage risk on `pitches` |
| **Index Scan** | B-tree descent, one heap fetch per match | Good when selective; pays `random_page_cost` per page |
| **Index Only Scan** | Answers from the index via the visibility map | Best case — but check `Heap Fetches` |
| **Bitmap Index → Bitmap Heap** | Sorts TIDs, visits heap in **physical** order | Middle gear: too many rows for Index Scan, too few for Seq |
| **Nested Loop** | Per outer row, scan the inner | Great for a tiny outer side; **catastrophic if that count was underestimated** |
| **Hash Join** | Build hash on inner, probe with outer | Good without a usable index; `Batches > 1` means it spilled |
| **Merge Join** | Zipper two sorted inputs | Good when both sides arrive sorted; else a blocking Sort |
| **HashAggregate / GroupAggregate** | Hash table vs. sorted stream | Chosen from estimated *group* count — `n_distinct` errors pick wrong |

**`Rows Removed by Filter: N`** under an Index Scan means the index reached the right neighbourhood but the selective predicate isn't in it (→ `02-indexing-strategy.md`); **`Heap Blocks: … lossy=M`** means the bitmap overflowed `work_mem`. And **the Nested Loop is where misestimates become timeouts**: estimate 10 outer rows, get 10,000, and a plan costed at 3ms runs 10,000 inner scans. `/api/sequencing`'s self-join is exactly this shape, and the first plan Jo would capture.

### 5.1 Index-only scans are coupled to VACUUM

An Index Only Scan skips the heap only where the visibility map marks a page all-visible, and **`VACUUM` sets those bits**; the docs say such scans "degrade significantly when tables are not recently vacuumed." `pitches` carried **1.44M dead tuples on 2026-08-11**, right after a ~250k-row backfill. A scan reporting `Heap Fetches: 0` can start reporting millions — same plan, 10× the time, no code change. **`Heap Fetches` is the most under-watched number in Triton plans.** The repo already ships a covering index for this (`scripts/create-pitch-area-stats-indexes.sql`):

```sql
create index concurrently if not exists idx_pitches_year_name_loc
  on public.pitches (game_year, pitch_name, plate_x, plate_z)
  include (p_throws, stand);
```

`INCLUDE` columns are payload, not search key. The script's header records the payoff: **~3s post-filter over 400k+ rows → ~5ms warm, ~600ms cold.**

---

## 6. Estimated vs actual — the first-bad-estimate rule

```
Nested Loop  (cost=4.65..118.50 rows=10 width=488)
             (actual time=0.017..0.051 rows=9863 loops=1)
                                  ↑ 986× under-estimate — the plan is fiction
```

depesz's thresholds are a usable rubric: **≤10×** normal, **10–100×** a defect, **100–1000×** wrong join method, **>1000×** fiction. **Find the deepest node where estimate and actual diverge and fix that one** — errors propagate strictly upward, so a leaf claiming 10 rows when it means 10,000 poisons every join above it.

- **`loops` multiplies.** `actual time` and `rows` are **averages per execution** — `rows=1 loops=10000` at 0.003ms spent 30ms. Hence depesz's *exclusive time* (node time minus children, × loops) beats raw output.
- **`LIMIT` makes actuals look better than costs**, and **parallel node rows are per-worker**: 2M rows under a `Gather` with 2 workers is ~6M. Neither is an estimation error.
- **`BUFFERS` separates "bad plan" from "cold cache."** **hit ÷ (hit+read)** is cache effectiveness; **(hit+read) ÷ rows** is pages touched per useful row — the bloat signature proving §5.1's dead tuples are being read.

---

## 7. Statistics, ANALYZE, and the number that should worry Triton

`ANALYZE` samples into `pg_statistic` (view `pg_stats`), where `n_distinct` drives group counts, `most_common_vals`/`histogram_bounds` drive selectivity, and `correlation` decides index-scan cost. `default_statistics_target = 100` caps both lists at 100 entries, so rare-value estimates are only as good as `n_distinct`.

### 7.1 The auto-analyze arithmetic

Auto-analyze fires when rows changed since the last ANALYZE exceed `autovacuum_analyze_threshold + autovacuum_analyze_scale_factor × reltuples` = `50 + 0.1 × reltuples`. For `pitches` at 8.89M rows that is **889,050 changed rows**. In-season ingest is ~110k pitches/month ≈ **3.6k/day** → **~240 days** to trip. Backfills accelerate it, but the steady state holds: **`pitches` can run most of a season on statistics that predate the season.**

`game_date`'s histogram therefore ends where the last ANALYZE saw it, so `WHERE game_date >= CURRENT_DATE - 7` falls off the end, the planner estimates ~1 row, and picks a Nested Loop that is perfect for 1 row and fatal for 25,000. **This is the highest-probability un-investigated plan risk on the platform**, and it degrades gradually across a season exactly like the Stuff+ coverage curve did. *(inferred — confirm via `pg_stat_user_tables.last_autoanalyze`.)*

### 7.2 You can't run ANALYZE from app code

`ANALYZE` is neither SELECT/WITH nor INSERT/UPDATE/DELETE, so **both** RPCs reject it. Best fix: `ALTER TABLE pitches SET (autovacuum_analyze_scale_factor = 0.005);` — threshold ~889k → ~44k changed rows, roughly every 12 days in season, one reversible statement. Failing that, a `SECURITY DEFINER` function with a function-level `statement_timeout` (the trick `run_query_long` uses), or `pg_cron`. `ANALYZE` takes `SHARE UPDATE EXCLUSIVE`, so blast radius is small → `03-timeouts-locks-concurrency.md`.

---

## 8. Extended statistics: the four correlated pairs on `pitches`

Single-column statistics assume independence, so the planner multiplies selectivities. In the docs' example — 10,000 rows where `a` and `b` are both `i % 100` — `WHERE a = 1 AND b = 1` estimates **1 row against an actual 100**, and `CREATE STATISTICS … (dependencies) ON a, b` corrects it to **100**. Likewise `GROUP BY a, b` estimates **1000** groups against **100** until `(ndistinct)` is added; `(mcv)` also catches impossible combinations.

| Columns | Relationship | Where it bites |
|---|---|---|
| `game_date`, `game_year` | Perfect dependency | `WHERE game_year=2026 AND game_date >= '2026-08-01'` — two filters that are one, off by ~20× |
| `pitch_type`, `pitch_name` | 1:1 (`FF` ↔ `4-Seam Fastball`) | Any filter or `GROUP BY` on both |
| `pitcher`, `p_throws` | Pitcher determines handedness | Arsenal/splits queries |
| `game_pk`, `game_date` | Game determines date | Sequencing self-join, per-game aggregation |

```sql
CREATE STATISTICS pitches_year_date    (dependencies, mcv)       ON game_year, game_date   FROM pitches;
CREATE STATISTICS pitches_type_name    (dependencies, ndistinct) ON pitch_type, pitch_name FROM pitches;
CREATE STATISTICS pitches_pitcher_hand (dependencies)            ON pitcher, p_throws      FROM pitches;
ANALYZE pitches;
```

**Best value/risk ratio on this table:** these come from the *same sample* ANALYZE already takes and cost **nothing at write time** — the only free lunch where write cost is the binding constraint. Caveats: `mcv` adds ANALYZE work on high-cardinality columns (not `pitcher`), and extended statistics cover single-relation restriction clauses, not join misestimates *(verify)*.

---

## 9. When a Seq Scan is the right answer

Past ~10% of rows a Seq Scan beats an Index Scan: the index scan pays `random_page_cost` 4.0 per heap page in index order, and by then it touches most pages anyway.

| Predicate | Approx. selectivity | Right path |
|---|---|---|
| `game_year = 2026` | ~2.8% (≈250k / 8.89M) | Index |
| `pitcher = 543037 AND game_year = 2026` | «0.1% | Index (`idx_pitches_pitcher_year_date`) |
| `game_type = 'R'` | ~90% | **Seq Scan — correctly** |
| `game_date >= CURRENT_DATE - 7` | ~0.3% | Index (`idx_pitches_year_date`) *if statistics are current* |

**Correlation** decides the rest. `pitches` is loaded in game-date order, so `pg_stats.correlation` for `game_date` should be near 1.0 and near 0 for `pitcher`. Hence `idx_pitches_game_date` and `idx_pitches_year_date (game_year, game_date DESC)` are structurally strong, and a `pitcher`-only lookup over a wide date range is structurally weak *(inferred — confirm via `pg_stats`)*. `SET enable_seqscan = off;` is a diagnostic, never a setting: it only tells you whether an index plan exists at all.

---

## 10. Parallel query as a reliability hazard

Parallel plans put `Gather`/`Gather Merge` above worker nodes. Worker count grows logarithmically with table size relative to `min_parallel_table_scan_size` (8 MB, ratio 3 per worker), bounded by `max_parallel_workers_per_gather` (default **2**) and `max_parallel_workers` (8) *(verify Supabase's values)*. Two properties make it dangerous as a *dependency*:

1. **Workers are allocated at execution time, not plan time.** If `max_parallel_workers` is consumed by a concurrent query the plan runs with fewer or none — same SQL, same plan, 2–3× the wall time. **This is how a query that "works fine" fails only during the nightly cron window.**
2. **Parallelism is disabled outright** for writes, `DECLARE CURSOR`, PL/pgSQL `FOR … IN query LOOP`, `PARALLEL UNSAFE` functions, and nested parallel queries. Triton's SQL runs inside `run_query`'s plpgsql body via dynamic `EXECUTE`, so **confirm whether that suppresses parallelism for the inner statement** — if it does, every editor-captured plan is *more* parallel than production and all editor timings are optimistic. **The highest-value item to verify here.** *(verify)*

Practical rule: **the serial fallback is the number that must fit in 8s.**

---

## 11. Diagnosing a plan regression

A query that worked now times out, with no code change. Cheapest first:

1. **Capture the plan with the production ceiling applied** (§2) and diff it against a stored baseline.
2. **Find the deepest node with a >10× misestimate** (§6) — everything above it is a consequence.
3. **Check statistics age** (`last_autoanalyze`, `n_mod_since_analyze`); per §7.1, the leading suspect on `pitches`.
4. **Check `BUFFERS`** (high `read`/low `hit` = cold cache; high `(hit+read)/rows` = bloat), **`Heap Fetches`**, and **spills** (`external merge`, `Batches > 1`).
5. **Check parallelism** (§10) and **table growth** — plans flip when a relation crosses a cost threshold. `pitches` grew 7.4M → 8.89M while repo docs still said 7.4M. Growth *is* a change.

On the PostgREST path only, also suspect **generic plans**: `plan_cache_mode = auto` adopts one after five executions, and it can't use parameter values for selectivity. For continuous capture, `auto_explain.log_min_duration = '3s'` needs `shared_preload_libraries` *(verify)* → `10-monitoring-postgres.md`.

---

## 12. What Triton should do, in order

1. **Adopt the ceiling-aware ritual** — every capture wrapped in `SET LOCAL statement_timeout = '8s'` (§2), logged to `docs/Queries.md`.
2. **Record the instance's real planner settings once** — `EXPLAIN (SETTINGS)` plus `SHOW server_version | work_mem | effective_cache_size | random_page_cost | jit;` → into `Jo/context/triton-context.md`. Resolve §10.2 in the same session.
3. **Fix the statistics cadence on `pitches` first:** `ALTER TABLE pitches SET (autovacuum_analyze_scale_factor = 0.005);` (~889k → ~44k changed rows) — one reversible statement against the highest-probability un-investigated risk. Same for `milb_pitches` and `retro_events`.
4. **Create the three extended statistics objects in §8, then `ANALYZE pitches`.** Capture a before/after plan for a query filtering `game_year` **and** `game_date` — the estimate change is the proof.
5. **Establish a plan baseline** for `/api/report`, `/api/scene-stats`, `/api/sequencing`, `/api/pitch-area-stats` and the Stuff+ UPDATE, as `FORMAT JSON` with date and row counts. **You cannot detect a regression without a baseline**, and Triton has none.
6. **Monitor `Execution Time ÷ 8000ms` as a saturation metric** — the conclusion `data-reliability/01-pipeline-observability-fundamentals.md` §3 also reaches. It would have *predicted* the Stuff+ outage rather than detecting it 90 days late.

**Anti-recommendation — do not "fix" a Seq Scan by adding an index.** `pitches` carries **29 indexes totalling 4.8 GB, about half the table's size**, each rewritten for every row of every bulk UPDATE — the mechanical reason the Stuff+ statement crossed 8s. A 30th index to rescue one read path trades a read problem for a write problem on the path that already caused a three-month outage. Exhaust statistics fixes, predicate rewrites and pre-aggregation first; if one is truly needed, drop an unused index in the same change → `02-indexing-strategy.md`.

**Anti-recommendation — do not globally lower `random_page_cost`, and never leave `enable_seqscan = off` outside a throwaway session.** Lowering it is only honest when the working set fits in cache; at 9.7 GB and 19 GB it makes the planner believe something false and pushes it toward random I/O against 4.8 GB of indexes that won't be cached either.

**Anti-recommendation — a query is not safe just because `EXPLAIN ANALYZE` finished in the SQL editor.** "It ran" is not the test; "it ran under 8000ms with the ceiling applied and a serial fallback" is.

---

**Highest-leverage next action:** run steps 2 and 3 in one SQL-editor session, log both to `docs/Queries.md`, then capture a `BUFFERS` plan for `/api/pitch-area-stats` — the one route with recorded before/after timings, and so the only place a capture can be checked immediately against a known-true number.

---

## Sources

PostgreSQL links are the v18 (`/docs/current`) pages.

1. [EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html) — options; `ROLLBACK` for writes.
2. [Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html) — cost formula; loops-are-averages; lossy blocks.
3. [Planner Cost Constants](https://www.postgresql.org/docs/current/runtime-config-query.html) — `random_page_cost`, `effective_cache_size`, `jit_above_cost`.
4. [Resource Consumption](https://www.postgresql.org/docs/current/runtime-config-resource.html) — `work_mem` per node; 5× resources.
5. [Multivariate Statistics Examples](https://www.postgresql.org/docs/18/multivariate-statistics-examples.html) — the 1-vs-100 and 1000-vs-100 cases.
6. [CREATE STATISTICS](https://www.postgresql.org/docs/current/sql-createstatistics.html) — syntax; the three kinds.
7. [Parallel Plans](https://www.postgresql.org/docs/current/parallel-plans.html) — Gather; parallel scans and joins.
8. [When Can Parallel Query Be Used?](https://www.postgresql.org/docs/current/when-can-parallel-query-be-used.html) — what disables parallelism; fallback.
9. [Index-Only Scans](https://www.postgresql.org/docs/current/indexes-index-only-scans.html) — visibility map; `Heap Fetches`; `INCLUDE`.
10. [Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — the auto-analyze threshold formula.
11. [auto_explain](https://www.postgresql.org/docs/current/auto-explain.html) — settings; overhead; loading.
12. explain.depesz.com — [Help](https://explain.depesz.com/help) — exclusive time; misestimate thresholds.
13. pgMustard — [BUFFERS parameter](https://www.pgmustard.com/docs/explain/buffers) — buffer types; blocks-per-row as bloat.
14. pgMustard — [Why isn't Postgres using my index?](https://www.pgmustard.com/blog/why-isnt-postgres-using-my-index) — can't-use vs won't-use.
15. Crunchy Data — [Postgres Scan Types in EXPLAIN Plans](https://www.crunchydata.com/blog/postgres-scan-types-in-explain-plans) — the ~10% crossover; bitmap middle gear.
16. Markus Winand — [PostgreSQL plan operations](https://use-the-index-luke.com/sql/explain-plan/postgresql/operations) — bitmap TID sorting; Group vs HashAggregate.
17. EDB / Thomas Munro — [Parallel Hash Joins Explained](https://www.enterprisedb.com/postgres-tutorials/parallel-hash-joins-postgresql-explained) — build vs probe; `Batches`; spilling.
18. Supabase — [Debugging performance issues](https://supabase.com/docs/guides/database/debugging-performance) — `pgrst.db_plan_enabled`; why it's off.

**Triton evidence (measured 2026-08-11):** sizes and 29-index count from `Jo/context/triton-context.md`; the ~3s → ~5ms/~600ms result and `INCLUDE` index from `scripts/create-pitch-area-stats-indexes.sql`; the SELECT/WITH guard at `app/api/explore/query/route.ts:29`; the zero-EXPLAIN repo grep.

**Siblings:** `02-indexing-strategy.md`, `03-timeouts-locks-concurrency.md`, `04-bulk-write-patterns.md`, `10-monitoring-postgres.md`.
