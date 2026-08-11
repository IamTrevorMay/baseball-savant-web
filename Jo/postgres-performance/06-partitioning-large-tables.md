---
title: Partitioning Large Tables — Declarative Partitioning, Pruning, and When Not To
domain: postgres-performance
tags:
  - partitioning
  - declarative-partitioning
  - partition-pruning
  - pg-partman
  - attach-detach
  - migration
  - maintenance
  - capacity
sources_reviewed: 20
last_updated: 2026-08-11
---

# Partitioning Large Tables — Declarative Partitioning, Pruning, and When Not To

## TL;DR

- **Partitioning is a manageability feature that sometimes helps queries, not the reverse.** The reliable wins are per-partition VACUUM/reindex, instant bulk delete via `DETACH`, and cheap archival. (documented)
- **Triton's flagship candidate, `pitches`, is already pruned by index.** `WHERE game_year=2026 AND pitch_type='FF'` plans as `Index Only Scan`, `Index Cond: ((game_year = 2026) AND (pitch_type = 'FF'))`. No seq scan. **14 of its 29 indexes already lead with `game_year` or `game_date`.** (measured, 2026-08-11)
- **The maintenance case is real and urgent.** `pitches` has run autovacuum **exactly once in its life** (`autovacuum_count = 1`, last 2026-05-17) while carrying **1,437,923 dead tuples against 8,891,054 live — 16.2%**. `milb_pitches`, a quarter the size, has run 28 times. (measured)
- **The stale visibility map already costs query time.** `count(*) WHERE pitcher=605483 AND game_year=2025` returns 1,063 rows by index-only scan but reports **`Heap Fetches: 914`** — 86% fell to the heap. 6,574 ms cold / 1,766 ms warm. (measured)
- **The primary-key restriction is a correctness argument here, not an inconvenience.** A unique constraint "must include all of the partition key columns." Triton's upsert target `UNIQUE (game_pk, at_bat_number, pitch_number)` — **13,943,600 scans** — would go 4-column and could no longer stop the same pitch existing under two different years. (documented + measured)
- **`retro_events`, the largest table at 19 GB, cannot be range-partitioned by time at all.** It has **no date, year, or season column** — only `game_id` (text) with the year in characters 4–7. (measured)
- **The migration is blocked twice over on this platform.** `ATTACH PARTITION` scans unless a **valid** `CHECK` exists, and creating that `CHECK` on an 800k-row partition exceeds the 8s `statement_timeout` every RPC carries — so no part of the DDL can run through `run_mutation`. Separately, an in-place migration transiently needs **~2× the footprint (~19.4 GB)** on a plan whose headroom carries a *(verify)* flag. See `11-capacity-storage-planning.md`. (documented + measured)
- **Partition-wise join and aggregate are OFF by default and should stay off.** PG docs: work_mem-restricted nodes "increase linearly according to the number of partitions." Triton's `work_mem` is **3500kB**; 12 partitions turns 3.5 MB into 42 MB per query. (documented + measured)
- **Autovacuum does not process partitioned tables, only their children** — stated outright in the PG 18 release notes. Partitioning doesn't fix vacuum; it makes each unit small enough to finish. (documented)
- **The cheaper fix that beats partitioning outright: drop the nine `pitches` indexes with `idx_scan = 0`.** They total **1,417 MB** — 29% of the 4,833 MB index footprint — including a 370 MB `pitches_pkey` on `id` never once scanned. (measured)

---

## 1. What partitioning buys, and what it doesn't

**Real:** bounded per-partition VACUUM/ANALYZE/REINDEX; instant archive via `DETACH`/`DROP` instead of row-by-row `DELETE`; shallower per-partition index trees. **Conditional:** pruning speedups, only where no index already narrows to the same rows. **Not real:** faster inserts (tuple routing costs) and faster point lookups (planning and lock overhead).

The docs are blunt: "**Too many partitions can mean longer query planning times and higher memory consumption**," since "each partition requires its metadata to be loaded into the local memory of each session that touches it." The closing guidance is anti-cargo-cult: "**Never just assume that more partitions are better than fewer partitions, nor vice-versa.**"

Vendor sizing guidance clusters where Triton isn't — Crunchy Data: "Do you need to partition a 200GB database? Probably not"; pganalyze: complexity pays "typically [for] tables exceeding 100GB." `pitches` is **9.7 GB**, `retro_events` **19 GB**. (documented)

---

## 2. RANGE, LIST, HASH — and which fits baseball

**RANGE** is the only sensible fit (lower bound inclusive, upper exclusive). **LIST** on `game_type` has trivial cardinality and extreme skew. **HASH** destroys time locality, kills archival, and helps no Triton query.

Measured, `pitches` spans 12 seasons averaging **741k rows** each, tightly clustered from 746k–826k except **2020 at 311,024** (COVID) and 2026 at 657,570 (in progress). That is twelve partitions of ~809 MB apiece including indexes (9,707 MB / 8,891,054 rows = 1.09 KB/row) — a *good* number, far under the "few thousand" the planner handles well. Whatever kills this proposal, it will not be partition count.

**`game_year` over `game_date`:** monthly gives ~140 partitions and finer archival granularity, but Triton's code filters on `game_year =` **140 times** vs `game_date >=` 74 (measured over `app/`, `lib/`, `scripts/`), and the season is the analytical unit for baselines and qualification.

---

## 3. Partition pruning: plan-time vs run-time

`enable_partition_pruning` defaults on and is confirmed **on** here. Three cases, each reading differently in `EXPLAIN`:

- **Plan-time** — eliminated using constants. Pruned partitions **do not appear in `EXPLAIN` or `EXPLAIN ANALYZE` at all**.
- **Run-time at executor init** — external params known at startup (prepared statements). Reported as **`Subplans Removed: N`**.
- **Run-time during execution** — exec params from parameterized nested loops or subqueries. All partitions initialize; unused ones show **`(never executed)`**. EDB's example: 5 partitions, ~115 ms with pruning off, ~37 ms on.

**The prepared-statement trap.** A cached **generic plan** has no parameter value at plan time, so plan-time pruning cannot happen and you fall back to the costlier run-time path — pganalyze: "the more partitions you have," the worse it gets. The escape is `plan_cache_mode = force_custom_plan`, trading caching for pruning. Triton's value is unverified *(verify)*.

### 3.1 Why pruning is nearly worthless for `pitches`

Pruning wins when the alternative is scanning data you don't need. Triton's alternative is already an index leading with the would-be partition key:

```
EXPLAIN SELECT count(*), avg(release_speed)
FROM pitches WHERE game_year=2026 AND pitch_type='FF';

Aggregate
  ->  Index Only Scan using idx_pitches_movement on pitches  (rows=204327)
        Index Cond: ((game_year = 2026) AND (pitch_type = 'FF'::text))
```

No seq scan, no touching of 2015–2025. A b-tree leading with `game_year` does the same narrowing — inside one index instead of across twelve relations.

The counter-argument to my own point: partitioning would let those 14 indexes **drop their leading column**, making each narrower and shallower, and skip 11 relations' worth of descents. Real, but second-order — and dwarfed by §8.1. (measured + inferred)

---

## 4. Partition-wise join and aggregate

`enable_partition_pruning` defaults `on`; `enable_partitionwise_join` and `enable_partitionwise_aggregate` default `off`. All three are at their defaults on Triton's instance (measured). The two partition-wise GUCs are off for a documented reason:

> With this setting enabled, the number of nodes whose memory usage is restricted by `work_mem` … can increase linearly according to the number of partitions being scanned … Query planning also becomes significantly more expensive in terms of memory and CPU.

**Triton's `work_mem` is 3500kB (measured).** Twelve partitions turns a 3.5 MB worst case into ~42 MB per concurrent query. Partition-wise join also requires the join condition to include **all** partition keys — a `pitches`→`pitch_baselines` join would need `game_year` on both sides. pganalyze's benchmark turned 5,200 ms of execution into a ~600 ms net saving (~12%) at materially higher planning cost. If ever tried, `SET` per-connection for one query, never globally.

---

## 5. Indexes and constraints — the restriction that decides this

### 5.1 The unique/PK rule

> To create a unique or primary key constraint on a partitioned table … **the constraint's columns must include all of the partition key columns** … because the individual indexes making up the constraint can only directly enforce uniqueness within their own partitions.

| Index on `pitches` | Size | `idx_scan` | Under `PARTITION BY RANGE (game_year)` |
|---|---|---|---|
| `pitches_game_pk_at_bat_number_pitch_number_key` | 534 MB | **13,943,600** | Must go 4-column; **semantics weaken** |
| `pitches_pkey` (`id`) | 370 MB | **0** | Must become `(id, game_year)` — or be dropped |

**The upsert key is the problem.** That index is the `ON CONFLICT` target for the nightly Savant upsert. Partitioning forces it to `(game_pk, at_bat_number, pitch_number, game_year)`, after which Postgres would permit the *same physical pitch* to exist twice — once under 2025, once under 2026.

`game_pk` functionally determines `game_year`, so this only breaks if the feed supplies a wrong year — precisely the failure the constraint exists to catch, and it would now fail **silently**: the conflict target no longer matches, `ON CONFLICT` degrades to a plain `INSERT`, and duplicates accumulate without error. On a platform whose defining incident was a three-month silent degradation, that is the wrong direction. The `ON CONFLICT` clause in `app/api/cron/pitches/route.ts` would also need `game_year` added. (documented mechanism; inferred consequence)

**`pitches_pkey` is the easy half.** 370 MB, `idx_scan = 0` — a surrogate PK never used for a lookup. The right move isn't to extend it; it's to drop it. *(verify: confirm no FK references `pitches.id`.)*

### 5.2 Index creation is not concurrent on partitioned tables

> One limitation … is that **it is not possible to use the `CONCURRENTLY` qualifier**, which could lead to long lock times.

The workaround is three steps *per index per partition*: `CREATE INDEX ON ONLY parent` (creates it invalid), `CREATE INDEX CONCURRENTLY` on each child, then `ALTER INDEX ... ATTACH PARTITION`. 29 indexes × 12 partitions = **348 index builds** plus 348 attaches; trimmed to 20 indexes, still 240. That is the real labor cost, and the reason an index audit must come first.

### 5.3 Other inherited restrictions

`CHECK`/`NOT NULL` on the parent are **always** inherited (`NO INHERIT` disallowed). Exclusion constraints must include all partition keys and compare them for **equality**. Partitions cannot have columns absent from the parent, nor add them later. `BEFORE ROW INSERT` triggers cannot redirect a row to another partition. `TRUNCATE ONLY` on a partitioned table always errors.

---

## 6. Attaching, detaching, and the maintenance win

| Operation | Parent lock | Child lock | Scan? |
|---|---|---|---|
| `CREATE TABLE ... PARTITION OF` | `ACCESS EXCLUSIVE` | — | no |
| `ATTACH PARTITION` | `SHARE UPDATE EXCLUSIVE` | `ACCESS EXCLUSIVE` | **yes, unless a valid `CHECK` matches** |
| `ATTACH` with a DEFAULT present | + `ACCESS EXCLUSIVE` on default | | **scans the default too** |
| `DETACH PARTITION` | `ACCESS EXCLUSIVE` | | no |
| `DETACH PARTITION CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | `ACCESS EXCLUSIVE` (2nd txn) | no |

`DETACH ... CONCURRENTLY` runs as two transactions: the first marks the partition detaching and waits for existing transactions to drain; the second completes it and adds a `CHECK` duplicating the partition constraint. It **cannot run inside a transaction block**, is **not allowed if a DEFAULT partition exists**, and only one partition may be pending detach at a time; an interrupted run finishes with `... FINALIZE`.

**The default-partition trap** (Crunchy Data): attaching a new partition while a DEFAULT exists forces a scan of the whole default — "most likely … a costly sequential scan" — while holding a lock on the parent, and can take "minutes or even longer." Keep defaults empty, or don't create one.

### 6.1 The maintenance argument — Triton's only genuine case

| Table | Total | Indexes | Live | Dead | Dead % | `autovacuum_count` | Last autovacuum |
|---|---|---|---|---|---|---|---|
| `retro_events` | 19 GB | 2,480 MB | 14,915,507 | 194,912 | 1.3% | 25 | 2026-06-14 |
| `pitches` | 9,707 MB | **4,833 MB** | 8,891,054 | **1,437,923** | **16.2%** | **1** | **2026-05-17** |
| `milb_pitches` | 2,365 MB | 1,406 MB | 2,535,599 | 112,916 | 4.5% | 28 | 2026-08-02 |

`pitches` has autovacuumed **once, ever**; a table a quarter its size has done it 28 times. The mechanism isn't mysterious: vacuuming `pitches` means scanning 4,872 MB of heap and then cleaning **29 index trees totalling 4,833 MB**. It is expensive enough that it effectively never completes. The cost is measurable in latency:

```
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM pitches WHERE pitcher=605483 AND game_year=2025;

Aggregate  (actual time=1765.765..1765.765 rows=1 loops=1)
  Buffers: shared hit=846
  ->  Index Only Scan using idx_pitches_pitcher_year_date on pitches
        (actual time=0.045..1765.612 rows=1063 loops=1)
        Index Cond: ((pitcher = 605483) AND (game_year = 2025))
        Heap Fetches: 914          <-- 86% of rows, all avoidable
Execution Time: 1765.924 ms
```

Cold, the same query took **6,573.974 ms**. An index-only scan of 1,063 rows should be sub-millisecond warm; 914 rows fell through to the heap because nothing has set all-visible bits since May.

Partitioned, `VACUUM pitches_2015` touches ~453 MB of heap and ~404 MB of index and finishes; historical partitions reach steady state and stop needing work, because they never change. That is a real, durable win — and the *only* first-order win partitioning offers Triton.

**Caveat from the PG 18 release notes:** "autovacuum does not process partitioned tables, just its children" — so monitoring must target children. Cross-reference `05-vacuum-autovacuum-bloat.md`.

---

## 7. pg_partman, and migrating a live table

`pg_partman` is **available but not installed** here (`pg_available_extensions` = 1, `pg_extension` = 0). The only partitioned table present is Supabase's own `realtime.messages` — `RANGE (inserted_at)`, 7 partitions. (measured)

The API is `create_parent(p_parent_table, p_control, p_interval, p_type, p_premake)` to define the set, `partition_data_proc()` to move existing rows in batches that commit per batch, and `run_maintenance_proc()` to create partitions ahead and apply retention. `part_config` holds `retention`, `retention_keep_table` (default `true` — **detach**, don't drop), `retention_keep_index`, and `retention_schema`.

**Honest assessment:** `pg_partman` earns its keep when partitions churn daily or weekly under a retention policy. Triton would create **one partition per year** — a calendar reminder, not an extension dependency. `partition_data_proc`'s batch-and-commit is genuinely useful during a migration (Percona: ~100k rows/batch, mandatory `VACUUM ANALYZE` after), but that is a one-time need. (inferred)

### 7.1 Three migration strategies

**A — ATTACH the existing table as one catch-all partition.** Fast, near-zero data movement. **Fails here:** `ATTACH` scans unless a **valid** `CHECK` exists, and creating that `CHECK` on 8.89M rows is itself a full scan; neither fits in 8s. And `ALTER TABLE ... SPLIT PARTITION`, which would make the incremental split path work, **was reverted before PG 17 shipped** (commit `3890d90`) and doesn't exist in PG 17.6. It landed in PG 19, taking `ACCESS EXCLUSIVE` on the parent throughout *(verify — PG 19 detail is secondary reporting)*.

**B — rename + UNION view + `INSTEAD OF` triggers.** The best-documented true-online path, used at Workable on **1 TB / 350M rows** and at Wemolo on **1.5 TB**: rename the original to `_old`, create a `UNION ALL` view under the original name, add `INSTEAD OF` triggers routing writes to the partitioned side, backfill in batches, then drop the view and rename. Workable's run took **36 hours** live, after upgrading the instance and provisioning 20k IOPS. Both writeups flag the same lesson: the view isn't updatable without the triggers, and application `ON CONFLICT` clauses must be removed for the duration — for Triton, that is the nightly ingest upsert.

**C — build beside, backfill, swap.** Best fit for Triton's shape: **11 of 12 partitions are frozen history.** Only `pitches_2026` is live, so the dual-write window shrinks from a whole table to one season and cutover is a single rename.

### 7.2 The two constraints that actually decide it

**Disk.** B and C hold both copies at once: 9,707 MB × 2 = **~19.4 GB** transient, plus WAL and copy-generated bloat — against a plan whose headroom carries a *(verify)* flag. Wemolo hit exactly this, with bloat severe enough to force a mid-migration vacuum pause. **This is the binding constraint, not the SQL.** See `11-capacity-storage-planning.md`.

**The 8s ceiling.** Every statement through `run_query`/`run_mutation` is capped at 8s, and `lock_timeout` is 8s too (measured on `pitches`: ~8k rows per UPDATE passes, ~11k times out). A migration needs statements that scan or copy hundreds of thousands of rows, so **no part of it can run through the RPC path** — it requires a direct session with a session-level `SET statement_timeout`. Any plan assuming normal app database access is wrong before it starts. (measured + inferred)

---

## 8. When partitioning is the wrong answer

1. **Queries already hit an index narrowing to the same rows** → `pitches` (§3.1).
2. **The table is under ~100 GB** → `pitches` 9.7 GB, `retro_events` 19 GB.
3. **No natural range key exists** → `retro_events` has **no date, year, or season column at all**.
4. **Queries don't consistently filter on the partition key** — unpruned queries fan out across every partition. (Not Triton's problem: 253 partition-key-shaped predicates.)
5. **Uniqueness must hold on a key excluding the partition key** → `(game_pk, at_bat_number, pitch_number)`, 13.9M scans.
6. **You're partitioning to speed up writes** — tuple routing makes them slower.
7. **You'd end up with hundreds or thousands of partitions.** ChartMogul went from "hundreds, if not thousands" of list partitions to 30 hash partitions for **5× on plain SELECTs, 3× with joins** — by partitioning *less*.
8. **A cheaper intervention is available and untried** — Triton's exact situation.

### 8.1 The cheaper intervention, measured

Nine indexes on `pitches` have **never been scanned**:

| Index | Size | | Index | Size |
|---|---|---|---|---|
| `pitches_pkey` (`id`) | 370 MB | | `idx_pitches_balls_strikes` | 88 MB |
| `idx_pitches_seq` | 367 MB | | `idx_pitches_year_type_pitcher` | 78 MB |
| `idx_pitches_stuff_plus` | 261 MB | | `idx_pitches_year_pitcher_bb` | 13 MB |
| `idx_pitches_pitcher_pitch` | 133 MB | | `idx_pitches_year_batter_bb` | 13 MB |
| `idx_pitches_batter_year_date` | 94 MB | | **Total** | **1,417 MB** |

That is **29% of the 4,833 MB index footprint**, reclaimable with nine `DROP INDEX CONCURRENTLY` statements. Six more are near-dead — `idx_pitches_year_name_loc` (464 MB, 48 scans), `idx_pitches_movement` (350 MB, 13), `idx_pitches_home_date`/`idx_pitches_away_date` (168 MB each, 12 apiece), `idx_pitches_player_name` (120 MB, 11), `idx_pitches_pitch_type` (106 MB, 7) — though `idx_pitches_movement` serves the §3.1 plan and earns its place.

Dropping the nine takes `pitches` from 29 → 20 indexes and ~9,707 → ~8,290 MB. Every row UPDATE then pays 20 index writes instead of 29 — a **31% cut in write amplification**, widening the row budget under the 8s cap — and autovacuum gets 31% less index to clean, the difference between "runs" and "has run once since May."

Caveat: `idx_scan` resets on server restart, so a zero could mean "recently reset" — though the upsert key showing 13.9M scans over the same window argues otherwise. Check `pg_stat_reset_time` first. *(verify)* (measured sizes and counts; inferred consequences)

---

## 9. The verdict, table by table

| Table | Size | Partition? | Why |
|---|---|---|---|
| `pitches` | 9,707 MB | **No — not yet** | Already index-pruned; PK restriction weakens the upsert guarantee; 348 index builds; ~2× transient disk. Revisit at ~25–30 GB, or if per-partition VACUUM becomes the only way to hold bloat. |
| `retro_events` | 19 GB | **No** | **No time column exists.** Needs `ADD COLUMN season` + a 14.9M-row backfill first. Also 17 GB heap / 2.5 GB index at 1.3% dead — a *storage* problem, not a maintenance one. Archive pre-1974 to cold storage instead. |
| `milb_pitches` | 2,365 MB | **No** | An order of magnitude too small; autovacuum runs fine (28 times). |
| `pitch_videos` | 430 MB | **No** | Not close. |

For `retro_events` the lever is retention, not partitioning (`11-capacity-storage-planning.md`). It also repeats the dead-surrogate-PK pattern: `retro_events_pkey` on `id` has **5 scans** against 324 MB, while the natural key `(game_id, event_id)` has **15,109,674**.

---

## 10. What Triton should do, in order

1. **Do not partition anything. Close the question and write it down** — with a trigger condition: revisit when `pitches` exceeds ~25 GB, or when per-partition VACUUM is the only remaining way to hold bloat under 10%.
2. **Verify the counters, then drop the nine zero-scan indexes on `pitches`.** Check `pg_stat_reset_time`, confirm no FK references `pitches.id`, then `DROP INDEX CONCURRENTLY` one at a time, outside a transaction block. **Blast radius:** `SHARE UPDATE EXCLUSIVE`, does not block reads or writes, cannot be rolled back inside a transaction. Save all nine `pg_get_indexdef()` strings to `docs/Queries.md` first — that is the undo. Expected: −1,417 MB, 31% less write amplification.
3. **Run a manual `VACUUM (ANALYZE) pitches` immediately after.** 1,437,923 dead tuples and one lifetime autovacuum is the actual emergency. **Blast radius:** no exclusive lock, does not block reads or writes, but I/O-heavy over 4.8 GB of heap — run it off-peak, not through an RPC. Re-measure `Heap Fetches` on the §6.1 query; expect 914 → ~0.
4. **Lower `autovacuum_vacuum_scale_factor` on `pitches` specifically.** At the default 0.2 the threshold is ~1.78M dead tuples, which is why it has fired once. Arithmetic in `05-vacuum-autovacuum-bloat.md`.
5. **Leave a detector behind: a bloat and autovacuum-recency monitor.** Alert when `n_dead_tup / n_live_tup > 0.10` on any table over 1 GB, or `last_autovacuum` exceeds 14 days. Without it, step 3 just resets the clock. Ties to `data-reliability/01-pipeline-observability-fundamentals.md`.
6. **Add `season int` to `retro_events`** (from `substring(game_id, 4, 4)`) regardless of partitioning — to make retention, archival, and season-scoped queries possible at all. Backfill chunked by `game_id`.
7. **Leave both partition-wise GUCs off.** At `work_mem = 3500kB` they're a memory hazard with no partitioned table to apply them to.

**Anti-recommendation — do not partition `pitches` by `game_year`.** It is the obvious move, it has a clean 12-partition shape, and it is wrong at this size. It buys pruning that 14 existing `game_year`-leading indexes already deliver (measured: `Index Cond: ((game_year = 2026) AND (pitch_type = 'FF'))`, no seq scan); it costs 348 index builds that cannot use `CONCURRENTLY`; it needs ~19.4 GB of transient disk on a plan that may not have it; it cannot run through the platform's own 8s-capped RPC path; and it converts a hard uniqueness guarantee on the nightly upsert into one Postgres can enforce only per-partition — reintroducing exactly the silent-duplicate failure mode this platform has already been burned by. The one genuinely real benefit, bounded per-partition VACUUM, is obtainable **this week** by deleting 1,417 MB of indexes nobody queries and running the vacuum that hasn't run since May.

**Anti-recommendation 2 — do not install `pg_partman`.** Twelve partitions created once a year is a calendar entry. The extension exists to manage daily/weekly churn with retention policies; Triton has neither.

---

## Sources

1. PostgreSQL Docs — [5.12. Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html) — RANGE/LIST/HASH, pruning phases, the unique-must-include-partition-key rule, the `CONCURRENTLY` limitation, partition-count best practices.
2. PostgreSQL Docs — [20.7. Query Planning](https://www.postgresql.org/docs/current/runtime-config-query.html) — GUC defaults and the work_mem-scaling warning.
3. PostgreSQL Docs — [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — ATTACH/DETACH lock levels, the validation scan, `DETACH ... CONCURRENTLY`, `FINALIZE`.
4. PostgreSQL — [18.0 Release Notes](https://www.postgresql.org/docs/release/18.0/) — "autovacuum does not process partitioned tables, just its children"; `VACUUM ONLY`.
5. Crunchy Data — [Partitioning with Native Postgres and pg_partman](https://www.crunchydata.com/blog/native-partitioning-with-postgres) — "a 200GB database? Probably not."
6. Crunchy Data — [Postgres Partitioning with a Default Partition](https://www.crunchydata.com/blog/postgres-partitioning-with-a-default-partition) — the default-partition scan-and-lock trap.
7. pganalyze — [The risk of high partition counts](https://pganalyze.com/blog/5mins-postgres-partitioning) — 0.7 ms planning vs 0.235 ms execution; ChartMogul's 5× / 3× from partitioning *less*.
8. pganalyze — [Partition-wise joins and aggregates](https://pganalyze.com/blog/5mins-postgres-partition-wise-joins-aggregates-query-performance) — why both GUCs default off; the ~600 ms net saving.
9. pganalyze — [Pruning, prepared statements, generic vs custom plans](https://pganalyze.com/blog/5mins-postgres-partition-pruning-prepared-statements-generic-vs-custom-query-plans) — `plan_cache_mode = force_custom_plan`.
10. pganalyze — [PostgreSQL partitioning with Django](https://pganalyze.com/blog/postgresql-partitioning-django) — "typically tables exceeding 100GB."
11. Postgres.ai — [Planning time vs number of partitions](https://postgres.ai/blog/20241003-how-does-planning-time-depend-on-number-of-partitions) — 12.435 ms cold at 1,000 partitions; Rowley's relcache correction (<0.1 ms pooled).
12. EDB — [Partition Pruning During Execution](https://www.enterprisedb.com/postgres-tutorials/partition-pruning-during-executionpartition-pruning-during-execution) — `Subplans Removed` vs `(never executed)`; 115 → 37 ms.
13. AWS — [Migrating large PostgreSQL tables to partitioned tables](https://aws.amazon.com/blogs/database/improve-performance-and-manageability-of-large-postgresql-tables-by-migrating-to-partitioned-tables-on-amazon-aurora-and-amazon-rds/) — logical-replication/CDC path.
14. pg_partman — [Documentation](https://github.com/pgpartman/pg_partman/blob/master/doc/pg_partman.md) — `create_parent()`, `partition_data_proc`, `part_config` retention keys.
15. Percona — [Partitioning with pg_partman](https://www.percona.com/blog/partitioning-in-postgresql-with-pg_partman-serial-based-trigger-based/) — ~100k rows/batch, mandatory `VACUUM ANALYZE`.
16. Tiger Data — [Optimal Postgres Partition Size](https://www.tigerdata.com/learn/determining-optimal-postgres-partition-size) — the shared_buffers heuristic; "there is no magic setting."
17. Stormatics — [Improving Performance with Partitioning](https://stormatics.tech/blogs/improving-postgresql-performance-with-partitioning) — a few dozen to a few hundred partitions; 10,000+ rows minimum.
18. Workable — [Live partitioning of existing tables](https://engineering.workable.com/postgres-live-partitioning-of-existing-tables-15a99c16b291) — view+trigger method, 1 TB / 350M rows, 36 hours, `ON CONFLICT` removed.
19. Fahad Khalid — [Near zero-downtime partitioning of a 1.5TB table](https://medium.com/@syedfahadkhalid93/tackling-a-1-5tb-table-near-zero-downtime-partitioning-in-postgresql-using-pg-partman-7e2ae55b9b4f) — migration bloat forced a vacuum pause.
20. dbi-services — [PG17: split and merge partitions](https://www.dbi-services.com/blog/postgresql-17-split-and-merge-partitions/) — `ACCESS EXCLUSIVE` parent lock; reverted before PG 17 shipped ([`3890d90`](https://github.com/postgres/postgres/commit/3890d90)).

**Triton-internal evidence (measured 2026-08-11, PostgreSQL 17.6):** all 29 `pitches` and 6 `retro_events` index definitions, sizes and `idx_scan` counts from `pg_stat_user_indexes`; per-season row counts; live/dead tuples and `autovacuum_count` from `pg_stat_user_tables`; GUCs from `current_setting()`; `pg_partman` availability from `pg_available_extensions`; `EXPLAIN` output quoted verbatim; predicate counts (140 `game_year =`, 74 `game_date >=`, 60 files with `FROM pitches`) from `grep` over `app/`, `lib/`, `scripts/`. Queries logged in `docs/Queries.md`; the 8s ceiling from `Jo/context/triton-context.md`.
