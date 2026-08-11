---
title: Monitoring a Running Postgres — The Query Cookbook
domain: postgres-performance
tags:
  - pg-stat-statements
  - pg-stat-activity
  - wait-events
  - auto-explain
  - bloat
  - unused-indexes
  - cache-hit-ratio
  - saturation
sources_reviewed: 20
last_updated: 2026-08-11
---

# Monitoring a Running Postgres — The Query Cookbook

## TL;DR

- **`pg_stat_statements` is already installed on Triton — v1.11, schema `extensions`, PostgreSQL 17.6 — and nobody has ever looked at it.** Accumulating since `2026-04-07 23:39 UTC` with `dealloc = 0`: no entry ever evicted, so the 126-day window is complete. Four months of free forensic evidence. (measured, 2026-08-11)
- **`pg_stat_statements` does not record statements that time out — the most important caveat on this platform.** Verified by experiment: `pg_sleep(5)` under a 300 ms timeout raised `ERROR: 57014` and left **zero** rows, while a 200 ms control was recorded (`calls = 1, mean = 201.3 ms`). Every statement the 8s cap killed — including the Stuff+ UPDATE, nightly, for three months — is invisible here. (measured)
- **So the observed maximum is a *censored* distribution, which makes it a leading indicator rather than a lagging one — and four workloads are pinned against their ceiling right now.** `run_query`: 50,548 calls, 19,258 s total, mean 381.0 ms, **max 7,997.0 ms against 8,000 ms (99.96%)**; a second `run_query` shape at 98.5%; the **`pitches` ingest upsert at 94.8%**; and `refresh_player_summary()` at **99.94%** of the 120 s ceiling. Those are survivors piling against a wall; casualties leave no row. Duration-as-a-fraction-of-timeout is the highest-value metric here, and it is screaming. (measured)
- **`auto_explain` is loaded but configured so it can never fire on the 8s path.** It is in `shared_preload_libraries`, but `auto_explain.log_min_duration = 10000` ms — *above* the cap. No `run_query` statement survives long enough to be logged. Installed and structurally inert. (measured)
- **`pitches` has 9 indexes with `idx_scan = 0` totalling ~1.48 GB, of which ~1.02 GB is genuinely droppable.** The 9th is `pitches_pkey` — zero scans, but it enforces the primary key. `idx_scan = 0` is not a drop signal for constraint-backing indexes. One dead index is `idx_pitches_stuff_plus` (261 MB), taxing every write of the column whose scoring job died. (measured)
- **`pitches` HOT-update ratio is 4.0% (85,867 of 2,142,692); `sos_scores` is 96.1%.** A 24× gap — index write amplification made visible in a system view. Updating an *indexed* column (like `stuff_plus`) is exactly what disables HOT. (measured)
- **`pitches` will not be autovacuumed for a long time, and defaults are why.** 1,437,923 dead tuples against a trigger of `50 + 0.2 × 8,891,054 = 1,778,261` — **80.9%** of threshold, `autovacuum_count = 1`, `last_autovacuum` **2026-05-17** (86 days). Autovacuum isn't broken; it's tuned for a table a tenth this size. (measured)
- **Cache hit ratio is 38.5% and you should almost certainly ignore it.** Postgres counts OS page-cache hits as `blks_read`, so the number overstates real I/O pain, and "99% or else" is folklore for a 35 GB working set on 256 MB of `shared_buffers`. A capacity fact, not an alert. (documented + measured)
- **Nearly all of this cookbook runs through `run_query` unchanged** — its guard only checks the statement starts with `select`/`with`, and its `search_path` is `public, extensions`, so unqualified `pg_stat_statements` resolves. Needing the dashboard: `CREATE EXTENSION`, `ALTER SYSTEM`, `VACUUM`. (measured)
- **Alert on saturation and staleness; dashboard everything else.** Four signals justify a page: timeout margin, autovacuum staleness on `pitches`, idle-in-transaction age, connection headroom. The rest only produce fatigue as alerts. (inferred)

---

## 1. Inventory the box you actually have

Never tune from assumption.

```sql
SELECT version() AS pg_version,
       (SELECT setting FROM pg_settings WHERE name='shared_preload_libraries')      AS preloaded,
       (SELECT extversion FROM pg_extension WHERE extname='pg_stat_statements')     AS pgss,
       (SELECT setting FROM pg_settings WHERE name='track_io_timing')               AS io_timing,
       (SELECT setting FROM pg_settings WHERE name='auto_explain.log_min_duration') AS ae_min_ms,
       (SELECT setting::int*8/1024 FROM pg_settings WHERE name='shared_buffers')    AS shared_buf_mb,
       (SELECT setting FROM pg_settings WHERE name='max_connections')               AS max_conn;
```

**Triton (measured 2026-08-11):**

| Setting | Value | Consequence |
|---|---|---|
| Version | **17.6** | `pg_stat_io`, `last_idx_scan`, `n_tup_newpage_upd` available |
| `shared_preload_libraries` | includes `pg_stat_statements`, **`auto_explain`**, `pg_cron`, `pgaudit` | Both key tools already loaded |
| `pg_stat_statements` | 1.11, schema `extensions`, `max=5000`, `track=top` | 2,470 entries, `dealloc = 0` |
| `track_io_timing` | **off** | All `read_time`/`blk_*_time` columns are **zero and meaningless** |
| `auto_explain.log_min_duration` | **10000 ms** | Above the 8s cap — §6.2 |
| `shared_buffers` | 256 MB (`effective_cache_size` 768 MB) | Against ~35 GB of data |
| `work_mem` / `max_connections` | 3500 kB / 60 | 22 connections in use at sample |

Two role facts, confirmed from the catalog because the platform hinges on them:

```sql
SELECT rolname, array_to_string(rolconfig, ', ') AS cfg
FROM pg_roles WHERE rolname IN ('authenticator','service_role','authenticated','anon');
```

- `authenticator` → `session_preload_libraries=safeupdate, statement_timeout=8s, lock_timeout=8s`
- `service_role` → **`(none)`**

That is the 8s ceiling, in writing. `service_role` has no override, so `SET ROLE` leaves the session at 8s. Database-level `statement_timeout` is 120 s — which is why `run_query_long`'s function-level `SET statement_timeout='120s'` works and nothing else does. Also `idle_in_transaction_session_timeout = 0` and database `lock_timeout = 0`: the only protection is the `authenticator` rolconfig. Cross-reference `03-timeouts-locks-concurrency.md`.

---

## 2. `pg_stat_statements` — the workload's flight recorder

Requires `shared_preload_libraries` and a restart, then `CREATE EXTENSION`. Supabase enables it on every project by default, in the `extensions` schema — **nothing to install here.** Queries are normalized (constants → `$1, $2, …`, grouped by `queryid`), so `WHERE pitcher = 543037` and `= 605400` collapse into one row.

| Column | How Jo reads it |
|---|---|
| `calls` | Frequency half of cost |
| `total_exec_time` | **The real cost ranking** |
| `mean_exec_time` | Diagnostic, never the ranking |
| `max_exec_time` | The saturation signal (§3) — worst *successful* run |
| `stddev_exec_time` | High vs mean ⇒ plan instability or data skew |
| `rows` | `rows/calls` catches accidental full scans |
| `shared_blks_hit`/`_read` | Per-query cache behaviour |
| `wal_bytes` | Write amplification per statement |

### 2.1 The mean-vs-total trap

The commonest misuse is sorting by `mean_exec_time` and "fixing" the slowest query. Your slowest query is rarely your most expensive: a 4-second report run twice daily costs 8 seconds; a 3 ms lookup run 40,000 times a minute costs two minutes of CPU every sixty seconds. Rank by `total_exec_time`, then use the calls/mean split to pick the remedy — high calls + low mean is an *application* problem (N+1, polling); low calls + high mean is a *query* problem (index, rewrite, materialize); high on both is where you start.

```sql
SELECT calls,
       round((total_exec_time/1000)::numeric,1) AS total_s,
       round(mean_exec_time::numeric,1)         AS mean_ms,
       round(max_exec_time::numeric,1)          AS max_ms,
       round(stddev_exec_time::numeric,1)       AS sd_ms,
       rows / nullif(calls,0)                   AS rows_per_call,
       left(regexp_replace(query,'\s+',' ','g'),120) AS q
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat%'
ORDER BY total_exec_time DESC LIMIT 20;
```

**Triton's top of the list (measured, 126-day window):**

| calls | total_s | mean_ms | max_ms | What it is |
|---:|---:|---:|---:|---|
| 50,548 | 19,258 | 381.0 | **7,997.0** | `run_query` RPC (all ad-hoc analytics) |
| 163 | 16,840 | 103,311 | **119,926.5** | `refresh_player_summary()` |
| 187 | 13,534 | 72,373 | 116,780.5 | `refresh_batter_summary()` |
| 1,035 | 8,743 | 8,447 | 119,399.2 | `run_query_long` traffic |
| 972 | — | 1,076.9 | **7,587.6** | **`pitches` ingest upsert** |

### 2.2 The blind spot that matters most here

`pg_stat_statements` records only **completed** executions. A statement cancelled by `statement_timeout` never reaches the hook that records it. I verified this rather than citing it:

```sql
SET LOCAL statement_timeout = '300ms';
SELECT pg_sleep(5)   /* jo_timeout_probe_A */;         -- ERROR:  57014: canceling statement due to statement timeout
SELECT pg_sleep(0.2) /* jo_timeout_probe_B_control */; -- succeeds
```

`probe_A` → **zero rows** in `pg_stat_statements`. `probe_B_control` → present, `calls = 1, mean_exec_time = 201.3`. (measured)

1. **The Stuff+ outage is not in `pg_stat_statements`.** The UPDATE that timed out nightly for three months left no trace. You cannot post-mortem a timeout with this view.
2. **`max_exec_time` is a censored maximum** — "the worst case that *survived*," not "the worst case."
3. **Which is precisely why it is a leading indicator.** A shape whose successful max creeps toward the ceiling is about to start failing invisibly. Watch the approach, not the arrival.

Other blind spots: no plans (that's `auto_explain`), no parameter values, no percentiles, and cumulative-since-reset totals that hide *when* something got slow. Always check the window:

```sql
SELECT dealloc, stats_reset, now() - stats_reset AS window FROM pg_stat_statements_info;
```

`dealloc > 0` means entries were evicted — the algorithm decays every entry's usage by 1%, sorts, drops the bottom 5% — and your window has holes. Triton: `dealloc = 0`. Clean.

---

## 3. The saturation metric: duration as a fraction of the timeout

This is the section that matters, and the Postgres-side counterpart to `../data-reliability/01-pipeline-observability-fundamentals.md` §3.

Saturation — headroom against a hard limit — usually means CPU or IOPS. On Triton it is far sharper: **every RPC call is capped at 8s, so `duration / 8000 ms` is a true utilization ratio with a hard, known denominator.**

```sql
WITH ceiling AS (SELECT 8000.0 AS ms)
SELECT round((max_exec_time / ceiling.ms * 100)::numeric,1) AS pct_of_ceiling,
       calls,
       round(mean_exec_time::numeric,1) AS mean_ms,
       round(max_exec_time::numeric,1)  AS max_ms,
       left(regexp_replace(query,'\s+',' ','g'),90) AS q
FROM pg_stat_statements, ceiling
WHERE calls > 5
ORDER BY max_exec_time DESC LIMIT 20;
```

**Triton, measured 2026-08-11:**

| % of 8s ceiling | calls | mean_ms | max_ms | Statement |
|---:|---:|---:|---:|---|
| **100.0%** | 50,548 | 381.0 | 7,997.0 | `run_query` RPC |
| **98.5%** | 529 | 2,655.2 | 7,881.5 | `run_query` (second shape) |
| **95.6%** | 8 | 4,885.2 | 7,647.6 | RPC variant |
| **94.8%** | 972 | 1,076.9 | 7,587.6 | **`pitches` ingest upsert** |

Against the 120 s `run_query_long` ceiling: `refresh_player_summary()` at **99.94%** (119,926.5 / 120,000).

**Why this would have predicted the Stuff+ outage.** The scoring UPDATE did not fail suddenly. It grew — more 2026 rows each week, 29 index writes per row — climbing through 4s, 6s, 7s, then crossing 8s and dying silently. Every one of those weeks, `max_exec_time / 8000` would have shown a number marching toward 100%. Nobody had to guess *which* statement would break; the ratio ranks them. Detection took ~90 days after the fact. This metric flags the class weeks *before* it starts.

**The prediction it makes today:** the `pitches` ingest upsert is at 94.8%. It is next, and it will fail the same way — silently, because timed-out statements are never recorded. The mechanism isn't hypothetical: `scripts/backfill-pitch-videos.ts` already hit this wall and worked around it by switching to `run_query_long`.

**Grade discipline.** That four workloads sit at 94.8–100.0% is *measured*. That the ratio rose monotonically before the outage is *inferred* — the window starts 2026-04-07 and, per §2.2, contains no failures. Persisting the ratio nightly from now on is what converts it.

---

## 4. `pg_stat_user_tables` — scans, dead tuples, vacuum debt

```sql
SELECT relname, n_live_tup, n_dead_tup,
       round(100.0*n_dead_tup/nullif(n_live_tup+n_dead_tup,0),2) AS dead_pct,
       seq_scan, idx_scan, n_tup_upd, n_tup_hot_upd,
       round(100.0*n_tup_hot_upd/nullif(n_tup_upd,0),1) AS hot_pct,
       last_autovacuum, autovacuum_count,
       (50 + 0.2*n_live_tup)::bigint AS autovac_threshold,
       round(100.0*n_dead_tup/nullif(50+0.2*n_live_tup,0),1) AS pct_to_trigger
FROM pg_stat_user_tables WHERE n_live_tup > 10000 ORDER BY n_dead_tup DESC;
```

| Table | live | dead | dead% | % to trigger | last_autovacuum | HOT% |
|---|---:|---:|---:|---:|---|---:|
| `pitches` | 8,891,054 | **1,437,923** | 13.92% | **80.9%** | **2026-05-17** (86d) | **4.0%** |
| `retro_events` | 14,915,507 | 194,912 | 1.29% | 6.5% | 2026-06-14 | 0.7% |
| `milb_pitches` | 2,535,599 | 112,916 | 4.26% | 22.3% | 2026-08-02 | 0.8% |
| `pitch_videos` | 1,478,458 | 51,024 | 3.34% | 17.3% | 2026-08-09 | 4.6% |
| `player_season_stats` | 79,070 | 668 | 0.84% | 4.2% | 2026-07-18 | **77.1%** |
| `sos_scores` | 17,052 | 2,538 | 12.96% | 74.4% | 2026-04-17 | **96.1%** |

**Autovacuum is not broken on `pitches`; it is tuned for a smaller table.** With the default `autovacuum_vacuum_scale_factor = 0.2` and `threshold = 50`, the trigger is `50 + 0.2 × 8.89M = 1,778,261` dead tuples. At 1,437,923 it needs ~340k more before autovacuum even looks — hence `autovacuum_count = 1` and a May run. Scale factor is a *percentage*: the bigger the table, the more garbage it tolerates absolutely. The fix is a per-table override. See `05-vacuum-autovacuum-bloat.md`.

**The HOT ratio quantifies the 29-index problem.** A HOT update avoids writing index entries, but only when **no indexed column changed** and the page has room. `sos_scores` gets 96.1%; `pitches` gets 4.0% — so ~96% of its 2.14M updates wrote into all 29 indexes. Note the trap: `idx_pitches_stuff_plus` exists, so **every Stuff+ scoring UPDATE was disqualified from HOT by the index on the very column it was writing**, inflating both duration and bloat. Dropping it (§5) makes that UPDATE cheaper *and* more HOT-eligible. Cross-reference `04-bulk-write-patterns.md`.

**Sequential scans are not the problem here.** `pitches` shows 781 seq scans against 14,032,565 index scans (0.006%). Triton's indexing problem is over-indexing, not under-indexing.

---

## 5. `pg_stat_user_indexes` — the dead weight on `pitches`

```sql
SELECT s.indexrelname, s.idx_scan, s.last_idx_scan,          -- last_idx_scan is PG 16+
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
       ix.indisprimary, ix.indisunique,
       CASE WHEN ix.indisprimary OR ix.indisunique
            THEN 'KEEP — backs a constraint' ELSE 'drop candidate' END AS verdict
FROM pg_stat_user_indexes s
JOIN pg_index ix ON ix.indexrelid = s.indexrelid
WHERE s.relname = 'pitches'
ORDER BY s.idx_scan, pg_relation_size(s.indexrelid) DESC;
```

**The 9 indexes on `pitches` with `idx_scan = 0` (measured):**

| Index | Size | Verdict |
|---|---:|---|
| `pitches_pkey` | 370 MB | **KEEP** — primary key |
| `idx_pitches_seq` | 367 MB | drop candidate |
| `idx_pitches_stuff_plus` | 261 MB | drop candidate (and see §4) |
| `idx_pitches_pitcher_pitch` | 133 MB | drop candidate |
| `idx_pitches_batter_year_date` | 94 MB | drop candidate |
| `idx_pitches_balls_strikes` | 88 MB | drop candidate |
| `idx_pitches_year_type_pitcher` | 78 MB | drop candidate |
| `idx_pitches_year_batter_bb` | 13 MB | drop candidate |
| `idx_pitches_year_pitcher_bb` | 13 MB | drop candidate |

**~1.48 GB never scanned; ~1.02 GB genuinely droppable.** For contrast, the busiest index is `pitches_game_pk_at_bat_number_pitch_number_key` at **13,943,600 scans** — the upsert conflict target, doing nearly all the work.

The caveats are not optional:

- **`idx_scan = 0` does not mean droppable.** `pitches_pkey` proves it: constraint-backing indexes are used for enforcement without incrementing scan counters. pganalyze's own check excludes primary keys, unique indexes, and anything under 32 kB for this reason.
- **Counters are cumulative since the last stats reset** — a quarterly report's index looks unused in August.
- **`last_idx_scan` (PG 16+) is better evidence** — it answers *when*, not just *how many*. Triton is on 17.6; use it.
- **Replicas keep separate statistics**, and some indexes exist only to make foreign-key validation cheap.

Dropping isn't free: `DROP INDEX` takes `ACCESS EXCLUSIVE`, and with `lock_timeout = 8s` it aborts rather than queues. Use `DROP INDEX CONCURRENTLY` from the dashboard. Full analysis in `02-indexing-strategy.md`.

---

## 6. `pg_stat_activity` and `auto_explain` — the present tense, and plans

```sql
-- Long-running and blocked backends, worst first
SELECT pid, now()-query_start AS runtime, now()-xact_start AS txn_age,
       state, wait_event_type, wait_event,
       pg_blocking_pids(pid) AS blocked_by, left(query,120) AS q
FROM pg_stat_activity
WHERE backend_type='client backend' AND state<>'idle'
  AND now()-query_start > interval '2 seconds'
ORDER BY query_start;

-- Idle in transaction: the quiet killer
SELECT pid, usename, now()-xact_start AS txn_age, now()-state_change AS idle_for, left(query,120)
FROM pg_stat_activity WHERE state LIKE 'idle in transaction%' ORDER BY xact_start;
```

**Why idle-in-transaction earns its own alert.** An open transaction holds its snapshot, and **vacuum cannot remove any tuple newer than the oldest running transaction**. One forgotten `BEGIN` blocks cleanup database-wide — on a table already carrying 1.44M dead tuples, that compounds fast. Triton had **0** at sample time and 22/60 connections, but `idle_in_transaction_session_timeout = 0` means no backstop for non-`authenticator` roles.

### 6.1 Wait events

`wait_event_type` turns "it's slow" into a direction (PG 17 docs):

| Type | Meaning | Reading |
|---|---|---|
| **IO** | Waiting on I/O (`DataFileRead`, `WalSync`) | Working set exceeds cache; storage-bound |
| **Lock** | Heavyweight lock (`relation`, `transactionid`, `tuple`) | Concurrent DDL/UPDATE contention |
| **LWLock** | Lightweight lock on a shared-memory structure | Internal contention |
| **BufferPin** | Exclusive buffer access | Usually a long-open cursor |
| **Client** | Client socket (`ClientRead`) | **Not a database problem** — the app is slow |
| **IPC** / **Timeout** | Another backend (parallel workers) / a timer | Usually benign |
| **Activity** | Background process idle in its main loop | **Always ignore** — idleness, not waiting |
| **Extension** | Extension-defined condition | Depends |

The two classic mistakes: alerting on `Activity` (background workers are *supposed* to sit there) and on `Client`/`ClientRead` (that is your application thinking). **Triton at sample:** 5 backends active on `IO/DataFileRead`, 6 idle on `Client/ClientRead`, rest background `Activity` — consistent with §7, storage-bound by design. `pg_stat_activity` is a **sample, not a counter**; one snapshot is an anecdote.

### 6.2 `auto_explain` — the only way to see production plans

`pg_stat_statements` says a query is slow; it stores no plans. `auto_explain` logs the plan of any statement over a threshold. Triton's config vs defaults: `log_min_duration` **10000 ms** (default -1/off), `log_analyze` off, `log_timing` on, `log_nested_statements` **off**, `sample_rate` 1.

**Two measured findings, both bad:**

1. **The threshold is above the ceiling.** `log_min_duration = 10000 ms` exceeds the 8,000 ms `authenticator` timeout. **No statement on the `run_query` path can run long enough to be logged.** Only `run_query_long` work can trip it.
2. **`log_nested_statements = off` hides the RPC bodies.** Everything here executes inside a `SECURITY DEFINER` plpgsql function (`run_query`, `run_mutation`), so the interesting SQL is a *nested* statement. Even a 60-second `run_query_long` call would log the outer call, not the slow SQL.

The overhead caveat, quoted, because it is why you don't just turn everything on:

> "When this parameter is on, per-plan-node timing occurs for all statements executed, whether or not they run long enough to actually get logged. This can have an extremely negative impact on performance."

**Recommended (dashboard only — needs `ALTER SYSTEM` + reload):** `log_min_duration = 3000`, `log_nested_statements = on`, `log_analyze = off`. At 3,000 ms this would have captured the Stuff+ UPDATE's plan on its way up, during the months it was slow but still succeeding. With §3, that pair turns this outage class from post-mortem into prevention. Cross-reference `01-query-planning-explain.md`.

---

## 7. Cache hit ratio — the most over-alerted number in Postgres

```sql
SELECT round(sum(heap_blks_hit)*100.0
           / nullif(sum(heap_blks_hit)+sum(heap_blks_read),0),2) AS table_cache_hit_pct
FROM pg_statio_user_tables;
```

**Triton: 38.51%** (measured). Every vendor default would be red — Crunchy Bridge targets ~99% and advises upgrading memory below it; Percona ships a low-cache-hit-ratio advisor. **Ignore it, for four reasons:**

1. **`heap_blks_read` is not "disk reads."** It counts blocks not found in *Postgres's own* `shared_buffers`. Most are served by the **OS page cache** at memory speed. Postgres cannot distinguish the two, so the metric systematically overstates real I/O pain. This is why "99%" is folklore, not physics.
2. **It is cumulative since stats reset** — lifetime totals mislead once the cache is warm.
3. **The arithmetic is not tunable.** 256 MB of `shared_buffers` against ~35 GB of hot data (`retro_events` 19 GB + `pitches` 9.7 GB + rest) is a working set ~140× the cache. No setting reaches 99%. That is a **capacity** fact, not a config bug.
4. **It is not actionable at 3 a.m.** Nobody resizes an instance in response to a page.

Treat it as a monthly capacity input alongside `11-capacity-storage-planning.md`. The per-table form is more useful for finding *which* relations are missing cache:

```sql
SELECT relname, heap_blks_read, heap_blks_hit,
       round(heap_blks_hit*100.0/nullif(heap_blks_hit+heap_blks_read,0),1) AS hit_pct
FROM pg_statio_user_tables
WHERE heap_blks_read + heap_blks_hit > 100000
ORDER BY heap_blks_read DESC LIMIT 15;
```

### 7.1 `pg_stat_io` — the better I/O view (PG 16+)

Introduced in Postgres 16, it breaks I/O down by three dimensions `pg_statio_*` never exposed: `backend_type` (who), `object` (relation / temp relation / wal), and `context` (`normal`, `vacuum`, `bulkread`, `bulkwrite`, `init`). It answers *which process actually wrote your data*, and how much I/O is autovacuum vs client queries vs large sequential scans.

```sql
SELECT backend_type, object, context, reads, writes, extends, evictions, reuses, fsyncs
FROM pg_stat_io WHERE reads+writes+extends > 0 ORDER BY reads+writes DESC;
```

Read `evictions` as buffer-cache pressure and `reuses` as bulk ring-buffer churn (evictions from the dedicated bulkread/bulkwrite ring, not shared buffers — normal during large scans). **Caveat for Triton:** `track_io_timing = off`, so `read_time`/`write_time` are **zero**. Counts valid, timings not. Enabling needs `ALTER SYSTEM`; the docs warn it "will repeatedly query the operating system for the current time, which may cause significant overhead on some platforms" — measure with `pg_test_timing` first.

---

## 8. Bloat, connections, locks

**Bloat** — two families with a real accuracy/cost tradeoff:

| Method | Cost | Accuracy | On Triton |
|---|---|---|---|
| Statistical estimation (ioguix / check_postgres lineage) | Cheap, catalog-only | ~3% typical deviation | Works today via `run_query` |
| `pgstattuple()` | **Full table scan** | Exact | Available, **not installed** |
| `pgstattuple_approx()` | Moderate (uses visibility map) | ~0.5% deviation | Same |

Estimation queries have documented blind spots: no statistics on TOASTed data, alignment padding counted as bloat, inflated percentages on small relations, and dependence on fresh `ANALYZE` (the `is_na` column flags unreliable rows). Crunchy Data's position is that estimation "was often not reporting on bloat that I knew for a fact was there," and a full `pgstattuple` scan is worth it — though on a 1.2 TB database that took just under an hour.

**Jo's call:** the dead-tuple counter in §4 is the cheap daily signal and it is sufficient. Reserve `pgstattuple_approx()` for a one-off confirmation on `pitches` before deciding on `pg_repack` (available, not installed) — run it from the dashboard, not the 8s-capped RPC path. See `05-vacuum-autovacuum-bloat.md`.

**Connections and locks:**

```sql
SELECT (SELECT setting::int FROM pg_settings WHERE name='max_connections') AS max_conn,
       count(*) AS total,
       count(*) FILTER (WHERE state='active')              AS active,
       count(*) FILTER (WHERE state LIKE 'idle in trans%') AS idle_in_txn,
       max(now()-xact_start) FILTER (WHERE state LIKE 'idle in trans%') AS oldest_idle_txn
FROM pg_stat_activity WHERE backend_type='client backend';
```

Triton: 22/60, 8 active, 0 idle-in-transaction. Healthy. On Supabase the Supavisor pooler sits in front, so pooled connections and database backends are different populations — see `07-postgrest-supabase-architecture.md`. For locks, `pg_blocking_pids()` (§6) beats the classic `pg_locks` self-join; also set `log_lock_waits = on` so waits past `deadlock_timeout` reach the logs. Triton's 8s `lock_timeout` converts a lock queue into a burst of errors — the better failure mode, but only if someone watches errors, and `reportError` still has no sink.

---

## 9. What to alert on vs. merely dashboard

The test is whether a human can *do something* in the next fifteen minutes.

| Signal | Alert? | Threshold | Why |
|---|---|---|---|
| **Timeout margin** (`max_exec_time / 8000`) | **Yes** | any shape > 80%, 2 days running | Predicts silent failure before it starts |
| **Autovacuum staleness on `pitches`** | **Yes** | `last_autovacuum` > 14d OR dead% > 20% | Compounds into bloat and slow scans |
| **Idle-in-transaction age** | **Yes** | > 5 minutes | Blocks vacuum database-wide |
| **Connection headroom** | **Yes** | > 80% of `max_connections` | Imminent hard failure |
| Blocked queries | Yes (low urgency) | any wait > 30 s | Rare — `lock_timeout` aborts at 8s |
| Cache hit ratio | **No** | — | Not actionable (§7) |
| `idx_scan = 0` indexes | **No** | — | Quarterly review |
| Bloat estimates | **No** | — | Monthly; dead-tuple counter covers the urgent case |
| `seq_scan` counts | **No** | — | 0.006% on `pitches` |
| Wait-event mix / `pg_stat_io` | **No** | — | Incident diagnostics and capacity input |

Three of the four alert-worthy signals are **saturation against a hard limit**; the fourth is **staleness**. Everything else is context you consult *after* an alert fires.

---

## 10. What Triton should do, in order

1. **Persist the saturation ratio nightly** (§3): one row per day, `max_exec_time / 8000` for the top 20 shapes; alert above 80% two days running. **The highest-leverage monitoring change available here** — and it is currently telling you the `pitches` ingest upsert (94.8%) is next.
2. **Fix `auto_explain` so it can fire.** `log_min_duration = 3000`, `log_nested_statements = on`, `log_analyze = off`, via the dashboard. The module is loaded and inert today; cheapest possible win.
3. **Set a per-table autovacuum scale factor on `pitches`:** `ALTER TABLE pitches SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);` — dropping the trigger from 1.78M dead tuples to ~178k. Blast radius: more frequent, individually cheaper autovacuums, which is the point. Run a manual `VACUUM (ANALYZE) pitches` first to clear the 1.44M backlog, from the dashboard, off-peak.
4. **Drop the eight zero-scan non-constraint indexes on `pitches`,** reclaiming ~1.02 GB and removing eight index writes per row from every UPDATE. Start with `idx_pitches_stuff_plus` (261 MB) — unused *and* it disables HOT on the exact scoring statement that broke. Use `DROP INDEX CONCURRENTLY`; verify against `last_idx_scan` and the stats window first. **Do not touch `pitches_pkey`.**
5. **Wire the four §9 alerts** into the cron/`reportError` path — after giving `reportError` a real sink, which remains the #1 platform gap.
6. **Snapshot `pg_stat_statements` weekly into a table before it is ever reset.** The counters are cumulative; a reset destroys four months of evidence irrecoverably. A weekly delta also reveals *when* something got slow, which the raw view never can.
7. **Sample `pg_stat_activity` every 10 seconds into a table** if you want a real wait-event profile. Do it when you have a specific mystery, not preemptively.

**Anti-recommendation: do not act on the 38.5% cache hit ratio, and specifically do not buy a larger instance because of it.** It is the most alarming-looking number in this document and the least actionable, for the four reasons in §7 — chiefly that `blks_read` counts OS page-cache hits, so true I/O pain is materially lower than 38.5% implies, and that a 35 GB working set on 256 MB of `shared_buffers` cannot reach 99% at any tunable setting. Buying RAM to move this number would be an expensive change justified by a metric that does not measure what it appears to measure. Justify a larger plan with **disk headroom** (`11-capacity-storage-planning.md`) or **measured query latency** instead. Second, smaller: **do not enable `auto_explain.log_analyze` globally** — per-node timing runs for *all* statements regardless of whether they are logged. Gate it behind `sample_rate` if you need it.

---

## Sources

1. PostgreSQL — [F.32. pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) — column definitions; `max`/`track`/`save`; `pg_stat_statements_info` (`dealloc`, `stats_reset`); normalization and `queryid` caveats.
2. PostgreSQL — [27.2. Cumulative Statistics System](https://www.postgresql.org/docs/current/monitoring-stats.html) — exact definitions for `pg_stat_all_tables` (`seq_scan`, `last_idx_scan`, `n_dead_tup`, `n_tup_hot_upd`, `last_autovacuum`), `pg_stat_all_indexes`, `pg_stat_activity`, `pg_stat_io`.
3. PostgreSQL — [Table 27.4: Wait Event Types (PG 17)](https://www.postgresql.org/docs/17/monitoring-stats.html#WAIT-EVENT-TABLE) — the ten wait event types with official descriptions.
4. PostgreSQL — [F.4. auto_explain](https://www.postgresql.org/docs/current/auto-explain.html) — all parameters and defaults; the exact `log_timing` overhead warning; three loading methods.
5. PostgreSQL — [20.9. Run-time Statistics](https://www.postgresql.org/docs/current/runtime-config-statistics.html) — `track_io_timing` default off, its overhead warning, `pg_test_timing`.
6. PostgreSQL Wiki — [Lock Monitoring](https://wiki.postgresql.org/wiki/Lock_Monitoring) — the `pg_locks` + `pg_stat_activity` blocking join; `log_lock_waits`, `deadlock_timeout`.
7. pganalyze — [How pg_stat_statements Decides What to Keep](https://pganalyze.com/blog/postgres-in-production-pg-stat-statements-deep-dive-part-4) — eviction algorithm (decay 1%, sort, drop bottom 5%); **only completed executions are stored**.
8. pganalyze — [Unused Indexes check](https://pganalyze.com/docs/checks/schema/index_unused) — 35-day window; excludes indexes <32 kB, primary keys, unique indexes because they enforce constraints.
9. pganalyze — [Waiting for Postgres 16: pg_stat_io](https://pganalyze.com/blog/pg-stat-io) — PG 16 introduction; `backend_type`/`object`/`context`; evictions vs reuses.
10. Supabase — [Debugging and monitoring (`supabase inspect db`)](https://supabase.com/docs/guides/database/inspect) — subcommand catalogue and which require `pg_stat_statements`.
11. Supabase — [pg_stat_statements extension](https://supabase.com/docs/guides/database/extensions/pg_stat_statements) — the `extensions`-schema convention; sample slow-query filter.
12. Supabase — [Query Optimization](https://supabase.com/docs/guides/database/query-optimization) — `pg_stat_statements` is enabled by default on every Supabase project.
13. Supabase — [Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors) — Query Performance report and `index_advisor`.
14. Crunchy Data — [Checking for PostgreSQL Bloat](https://www.crunchydata.com/blog/checking-for-postgresql-bloat) — estimation "often not reporting on bloat that I knew for a fact was there"; `pgstattuple` cost (~1 h on 1.2 TB).
15. Crunchy Bridge — [Cache hit and index hit](https://docs.crunchybridge.com/insights-metrics/cache-and-index-hit) — the ~99% targets and "upgrade memory" advice this doc argues against.
16. ioguix — [pgsql-bloat-estimation](https://github.com/ioguix/pgsql-bloat-estimation) — canonical statistical bloat queries; `is_na` flag; TOAST and alignment-padding blind spots.
17. Tiger Data — [What pg_stat_statements Actually Tells You](https://www.tigerdata.com/blog/what-pg_stat_statements-actually-tells-you-about-your-queries) — "your slowest query is rarely your most expensive"; no plans, no parameters, no percentiles.
18. Haki Benita — [The Unexpected Find That Freed 20GB of Unused Index Space](https://hakibenita.com/postgresql-unused-index-size) — the unused-index query; constraint-backing-index caveat.
19. Percona — [PostgreSQL cache hit ratio advisor](https://docs.percona.com/percona-monitoring-and-management/3/advisors/checks/performance-pg-low-cache-hit-ratio.html) — a shipped low-cache-hit check, cited as the default threshold argued against here.
20. Red Gate — [Understanding PostgreSQL's Cache Hit Ratio](https://www.red-gate.com/hub/product-learning/redgate-monitor/understanding-postgresqls-cache-hit-ratio/) — why lifetime totals mislead, and how the OS page cache breaks the naive reading.

**Triton-internal evidence (measured 2026-08-11, PostgreSQL 17.6, project `xgzxfsqwtemlcosglhzr`):** `pg_settings` and extension inventory; `pg_roles.rolconfig`; `pg_stat_statements` top-20 by `total_exec_time` and `max_exec_time` (window `2026-04-07 23:39` → `2026-08-11 20:04 UTC`, `dealloc = 0`, 2,470/5,000 entries); `pg_stat_user_tables` dead-tuple/HOT table; all 29 `pg_stat_user_indexes` rows for `pitches`; `pg_statio_user_tables` aggregate; `pg_stat_activity` wait-event sample. The timeout-censoring experiment (§2.2) was run directly against this database. Outage history from `Jo/context/triton-context.md`. Related: `01-query-planning-explain.md`, `02-indexing-strategy.md`, `03-timeouts-locks-concurrency.md`, `04-bulk-write-patterns.md`, `05-vacuum-autovacuum-bloat.md`, `07-postgrest-supabase-architecture.md`, `11-capacity-storage-planning.md`, `../data-reliability/01-pipeline-observability-fundamentals.md` §3.
