---
title: VACUUM, Autovacuum, and Bloat — Reclaiming What MVCC Leaves Behind
domain: postgres-performance
tags:
  - mvcc
  - vacuum
  - autovacuum
  - dead-tuples
  - bloat
  - visibility-map
  - xid-wraparound
  - pg_repack
sources_reviewed: 24
last_updated: 2026-08-11
---

# VACUUM, Autovacuum, and Bloat — Reclaiming What MVCC Leaves Behind

## TL;DR

- **Every `UPDATE` is an insert plus a tombstone** — "the row version must not be deleted while it is still potentially visible to other transactions." A 250k-row backfill produces 250k dead tuples. (documented)
- **On `pitches` a non-HOT update writes 29 new index entries and orphans 29 old ones.** Indexes are 4.8 GB of the table's 9.7 GB, so batch-rewrite bloat is *index* churn, not heap churn. (measured sizes; inferred multiplication)
- **`pitches` sits just below the default autovacuum trigger and will stay bloated.** `50 + 0.2 × 8,890,000 = 1,778,050` dead tuples required; it holds **1,437,923** — 80.9% of the way there. Autovacuum will not fire. (measured 2026-08-11 + documented defaults)
- **0.2 is a small-table policy applied to every table** — 250 dead rows at 1,000 rows, 1.78M on `pitches`. Tolerance scales *with* size, which is backwards. The fix is one per-table storage parameter: `SHARE UPDATE EXCLUSIVE`, no downtime, reversible. (documented)
- **`VACUUM` does not shrink the file; it marks space for reuse.** Only `VACUUM FULL`/`CLUSTER`/`pg_repack` return space to the OS, and FULL needs `ACCESS EXCLUSIVE` plus a second full copy on disk. (documented)
- **`VACUUM` cannot go through `run_mutation`, and no RPC wrapper can fix that** — it takes INSERT/UPDATE/DELETE only, and "`VACUUM` cannot be executed inside a transaction block," which every PostgREST RPC call is. (documented + inferred)
- **The convention "VACUUM between large batch updates" has never once been executed.** Repo-wide grep finds `vacuum` only in prose — zero in any route, script, or `.sql` file. (measured 2026-08-11)
- **Skipping vacuum silently downgrades index-only scans**, because only vacuum sets the visibility-map bits they depend on. (documented)
- **XID wraparound is the one vacuum failure that ends read-only** — warning at 40M XIDs remaining, refusal of new write transactions at 3M, and anti-wraparound autovacuum restarts immediately if cancelled. (documented)
- **The cheapest detector is `pg_stat_user_tables` plus one arithmetic expression.** You don't need pgstattuple to know `pitches` is below its trigger. (inferred)

---

## 1. Why MVCC manufactures garbage

Postgres gives each statement "a snapshot of data... as it was some time ago," so "reading never blocks writing and writing never blocks reading." An `UPDATE` writes a *new* row version and marks the old with the deleting XID; a `DELETE` leaves the tombstone. Once no live snapshot can see it, the old version is **dead** — holding a heap slot and, unless the update was HOT, an entry in every index.

**HOT is the escape hatch, and `pitches` mostly cannot use it.** A heap-only-tuple update skips index maintenance but needs both (1) no indexed column modified and (2) free space on the *same page*. Condition 2 bites: heap `fillfactor` defaults to **100**, so a full page has no room and the update spills elsewhere, writing indexes even if (1) held. Lowering `fillfactor` helps future updates only — "the table contents will not be modified immediately by this command."

**Measure it:** `n_tup_hot_upd / n_tup_upd`. If the nightly `stuff_plus` rewrite is ~0% HOT, every scored row pays 29 index inserts — the write amplification that put that UPDATE over the 8s cap (`04-bulk-write-patterns.md`).

---

## 2. `VACUUM` vs `VACUUM ANALYZE` vs `VACUUM FULL`

| | Plain `VACUUM` | `VACUUM ANALYZE` | `VACUUM FULL` |
|---|---|---|---|
| Lock | `SHARE UPDATE EXCLUSIVE` | same | **`ACCESS EXCLUSIVE`** |
| Blocks reads/writes? | No | No | **Yes, entirely** |
| Space to OS? | Trailing empty pages only | same | Yes — rewrites the relation |
| Extra disk | ~none | ~none | **Second full copy of heap + all indexes** |
| Rebuilds indexes? | No (marks entries reusable) | No | Yes |
| Planner stats | `relpages`/`reltuples` only | **Full column stats** | None — `ANALYZE` after |
| Progress view | `pg_stat_progress_vacuum` | same | `pg_stat_progress_cluster` |

Plain VACUUM *"will not return the space to the operating system, except in the special case where one or more pages at the end of a table become entirely free,"* and *"administrators should strive to use standard `VACUUM` and avoid `VACUUM FULL`."* So "I vacuumed and it didn't shrink" is not a bug — marked-free space is reused by later writes, and is *waste* only if churn never refills it.

**Why 29 indexes matter.** The `vacuuming indexes` phase visits **every** index — 4.8 GB of pages per cycle on `pitches`. If dead item IDs exceed `autovacuum_work_mem` (default `-1` → `maintenance_work_mem`, Postgres default 64 MB — *(verify Supabase's value)*), vacuum flushes and repeats, meaning 29 more index scans. Here 1,437,923 IDs × ~6 bytes (pre-PG17 array form) ≈ **8.6 MB**, so one pass. *(inferred — confirm server version.)*

---

## 3. How autovacuum decides, and how fast it's allowed to go

A table becomes eligible when `n_dead_tup` exceeds:

```
vacuum threshold  = autovacuum_vacuum_threshold  + autovacuum_vacuum_scale_factor  * pg_class.reltuples
analyze threshold = autovacuum_analyze_threshold + autovacuum_analyze_scale_factor * pg_class.reltuples
```

(the analyze form compared against `n_mod_since_analyze`).

| Parameter | Default | Per-table? |
|---|---|---|
| `autovacuum_vacuum_threshold` | **50 tuples** | yes |
| `autovacuum_vacuum_scale_factor` | **0.2 (20% of table size)** | yes |
| `autovacuum_analyze_threshold` / `_scale_factor` | 50 / 0.1 | yes |
| `autovacuum_vacuum_insert_threshold` / `_scale_factor` | 1000 / 0.2 | yes |
| `autovacuum_naptime` / `autovacuum_max_workers` | 1min / 3 | no |
| `autovacuum_vacuum_cost_delay` | 2 ms | yes |
| `autovacuum_vacuum_cost_limit` | −1 (inherit `vacuum_cost_limit` = 200) | yes |
| `autovacuum_freeze_max_age` / `_multixact_` | 200M XIDs / 400M | yes |
| `autovacuum_vacuum_max_threshold` **(PG18+ only)** | 100,000,000 | yes |

**Version caveat:** `autovacuum_vacuum_max_threshold` is PG18-only (I checked PG17's page explicitly) and at Triton's sizes never binds. Don't assume a parameter exists because it's on `/docs/current/`.

**The throttle.** Vacuum accrues cost (`page_hit` 1, `page_miss` 2, `page_dirty` 20; limit 200) and sleeps `cost_delay` at the limit. At the modern 2 ms default that's 500 sleeps/sec → per-worker ceilings of ≈ **800 MB/s** cached, **400 MB/s** disk reads, **40 MB/s** newly-dirtied, matching EDB's PG14+ figures — so the throttle is probably not the bottleneck, the disk is. The classic "raise `cost_limit` to 1000–2000" advice assumed the pre-PG12 `cost_delay = 20ms` default (~4 MB/s writes), as does Percona's widely-cited 78 / 3.9 MB/s example: **check which era a tuning post assumes before copying it**. Raising `autovacuum_max_workers` does *not* raise throughput — the budget divides among workers. Leave it at 3. Upper bound for one plain VACUUM of `pitches`: 4.8 GB of index reads at 400 MB/s ≈ 12 s of budget plus the heap pass; real duration must be **measured**. *(inferred — not a measurement.)*

---

## 4. Why 0.2 is badly wrong for large tables — the Triton arithmetic

The scale factor makes tolerated garbage *proportional to table size*: defensible at 1,000 rows, indefensible at 8.9M. EDB's framing: **"If it hurts, you're not doing it often enough."**

Measured 2026-08-11, immediately after a ~250k-row `stuff_plus` backfill plus rescore testing:

| Table | Live rows | Dead tuples | Dead % | Default trigger `50 + 0.2 × live` | % of trigger | Fires? |
|---|---:|---:|---:|---:|---:|---|
| `pitches` | 8,890,000 | **1,437,923** | **13.9%** | 1,778,050 | **80.9%** | **No** |
| `retro_events` | 14,900,000 | 194,912 | 1.3% | 2,980,050 | 6.5% | No |
| `milb_pitches` | 2,540,000 | 112,916 | 4.3% | 508,050 | 22.2% | No |
| `pitch_videos` | 1,480,000 | 51,024 | 3.3% | 296,050 | 17.2% | No |

`pitches` is the problem — one dead row per six live ones, held indefinitely because the default policy says that's fine until 1.78M. Heap waste ≈ 4.9 GB × 13.9% ≈ **~0.7 GB**; dead index entries ≈ 1,437,923 × 29 ≈ **41.7M** orphaned btree tuples ≈ **0.7–0.8 GB** of the 4.8 GB index footprint. *(both inferred — `pgstattuple`/`pgstatindex` give the real numbers.)* Every seq or bitmap-heap scan reads those dead pages, so this is I/O on live queries, not just disk (`02-indexing-strategy.md`).

### 4.1 The fix, with the exact statements

Set the scale factor low and let an absolute threshold do the work — the consensus across EDB (0.01 + threshold 1000–10000), pganalyze (0.05 for large tables), Cybertec (0.005 for update-heavy), Percona (scale factor 0, pure threshold).

```sql
-- pitches: trigger moves 1,778,050 -> 10,000 + 0.02*8.89M = 187,800 dead tuples
ALTER TABLE pitches SET (
  autovacuum_vacuum_scale_factor  = 0.02, autovacuum_vacuum_threshold  = 10000,
  autovacuum_analyze_scale_factor = 0.02, autovacuum_analyze_threshold = 10000);

ALTER TABLE milb_pitches SET (autovacuum_vacuum_scale_factor=0.02, autovacuum_vacuum_threshold=10000); -- ->  60,800
ALTER TABLE pitch_videos SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_vacuum_threshold=10000); -- ->  84,000
ALTER TABLE retro_events SET (autovacuum_vacuum_scale_factor=0.02, autovacuum_vacuum_threshold=10000); -- -> 308,000
```

**Blast radius:** each takes a **`SHARE UPDATE EXCLUSIVE`** lock — *"`SHARE UPDATE EXCLUSIVE` lock will be taken for fillfactor, toast and autovacuum storage parameters."* It does not block DML, but it conflicts with a running autovacuum, and `authenticator` carries `lock_timeout = 8s`, so it may abort — retry. Reversible via `RESET`.

The analyze parameters matter as much: at defaults `pitches` needs `50 + 0.1 × 8.89M = 889,050` modifications before autoanalyze runs — a nightly ingest of ~4k rows takes **seven months** to trip that. Cybertec documents stale statistics as a *cause* of bloat in their own right.

---

## 5. Freezing, wraparound, and aggressive vacuum

XIDs are 32-bit; past ~4 billion transactions the counter wraps and old rows appear to be in the future — invisible. **Freezing** marks old tuples unconditionally visible. `vacuum_freeze_min_age` (**50M**) sets how old an XID must be; `autovacuum_freeze_max_age` (**200M**) is a hard trigger that runs autovacuum *even if disabled for the table*. An **aggressive vacuum** also scans all-visible-but-not-all-frozen pages and advances `relfrozenxid`.

Escalation, verbatim: at ~40M XIDs remaining, `WARNING: database "mydb" must be vacuumed within 39985967 transactions`; at ~3M, `ERROR: database is not accepting commands that assign new XIDs to avoid wraparound data loss` — read-only until vacuumed. Anti-wraparound autovacuum shows as `(to prevent wraparound)` in `pg_stat_activity`, **is not automatically interrupted by conflicting locks**, and restarts immediately if cancelled. That's why autovacuum can never simply be "turned off."

Monitor `greatest(age(c.relfrozenxid), age(t.relfrozenxid))` over `pg_class c LEFT JOIN pg_class t ON c.reltoastrelid = t.oid` for `relkind IN ('r','m')` as a percentage of `autovacuum_freeze_max_age`; Crunchy: alert on approach to that, treat approach to 2 billion as an emergency, and afterwards get max age back to **30–40%** of it. Triton's exposure is low but asymmetric — if autovacuum keeps skipping `pitches` for months (which current thresholds guarantee), the eventual anti-wraparound pass arrives as one large aggressive vacuum at an unchosen moment rather than many small ones. *(inferred)*

---

## 6. The visibility map — where vacuum becomes a query-performance feature

The visibility map stores **two bits per heap page** (*all-visible*, *all-frozen*). Bits are **only ever set by vacuum** and are cleared by any modification to the page. An index-only scan checks the all-visible bit; if it isn't set, "the heap entry must be visited, so no performance advantage is gained over a standard index scan," and the technique "will be a win only if a significant fraction of the table's heap pages have their all-visible map bits set." In `EXPLAIN (ANALYZE)` that's the `Heap Fetches:` line under an `Index Only Scan`. If Triton adds covering indexes for the reports path (`02-indexing-strategy.md`), their payoff is contingent on §4.1.

**Insert-only tables: `retro_events`.** Before PG13 an insert-only table was never autovacuumed — no dead tuples, no trigger — with two consequences Crunchy documented in production: the visibility map never updated (one case degraded from <1 ms to ~300 ms on replicas until a manual `VACUUM ANALYZE`), and freeze work accumulated into one enormous anti-wraparound pass. PG13's insert thresholds fixed it, but for `retro_events` that trigger is `1000 + 0.2 × 14.9M ≈ 2.98M` inserts — effectively never. So: **after any bulk load into `retro_events`, run `VACUUM ANALYZE` manually.** Nothing else will.

---

## 7. Measuring bloat — three tiers

**Tier 1 — `pg_stat_user_tables` (free, approximate, always available).** `n_dead_tup` is an estimate, but it is the *same* number autovacuum uses to decide, which makes it exactly right for "will autovacuum fire?" Leave this behind as the monitor:

```sql
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze,
       coalesce((SELECT option_value::float FROM pg_options_to_table(c.reloptions)
                 WHERE option_name='autovacuum_vacuum_threshold'), 50)
     + coalesce((SELECT option_value::float FROM pg_options_to_table(c.reloptions)
                 WHERE option_name='autovacuum_vacuum_scale_factor'), 0.2) * n_live_tup AS trigger_at
FROM pg_stat_user_tables s JOIN pg_class c ON c.oid = s.relid
WHERE n_live_tup > 100000 ORDER BY n_dead_tup DESC;
```

Alert when `n_dead_tup > trigger_at`, or when `last_autovacuum` on `pitches` exceeds 7 days. Supabase ships an equivalent as `supabase inspect db vacuum-stats`.

**Tier 2 — statistical estimate queries (free, ~seconds).** The `check_postgres.pl` lineage (`tbloat`/`wastedbytes`/`ibloat`/`wastedibytes` on the PG wiki) and ioguix's `pgsql-bloat-estimation` derive bloat from `pg_statistic` column widths versus page count. Both warn it is "a loose estimate... not a 100% accurate portrayal." ioguix's failure modes: the `name` type breaks it (sometimes negative), TOASTed values aren't tracked so bloat is *under*-estimated, up to 10% alignment padding counts as bloat, and small relations always look bloated. Filter on `is_na`.

**Tier 3 — `pgstattuple` (exact, full scan, expensive).** Crunchy's calibration is why it's worth the cost: on one production table the estimate query said 9.6% / 4158 MB while `pgstattuple` found **37.84% / 16 GB** (a full check on a 1.2 TB database took just under an hour). `pgstattuple_approx()` skips all-visible pages via the visibility map — approximate for live tuples, **exact for dead ones** — and is the right default at 9.7 GB. `pgstatindex()` gives `avg_leaf_density` and `leaf_fragmentation`, separating index from table bloat. **Never run Tier 3 through `run_query`** — it won't finish in 8 s; use `run_query_long` (120 s) or a direct connection (`10-monitoring-postgres.md`).

**When vacuum runs and removes nothing** — check these four before blaming thresholds (Cybertec): a long-running transaction with an old snapshot (`pg_stat_activity`, large `age(backend_xmin)`); an inactive replication slot pinning `xmin` (Supabase's most common platform stall); an orphaned prepared transaction (`pg_prepared_xacts`); a standby with `hot_standby_feedback = on`. The tell is identical in all four: `last_autovacuum` recent, `autovacuum_count` climbing, `n_dead_tup` flat.

---

## 8. Index bloat is a separate problem with a separate fix

Crunchy: "a table could have little to no bloat, but one or more of its indexes could be badly bloated." Vacuum marks dead index entries reusable and btree recycles emptied pages, but never returns them to the OS, and some access patterns strand nearly-empty pages permanently — the docs' one sanctioned reason to `REINDEX`.

| Option | Lock | Extra disk for `pitches` | Verdict |
|---|---|---|---|
| `REINDEX INDEX CONCURRENTLY` (one at a time) | `SHARE UPDATE EXCLUSIVE` | ~one index (avg ~165 MB) | **Use this** |
| `pg_repack --no-order --table pitches` | `ACCESS EXCLUSIVE` briefly at setup and swap | "about twice as large as the target table(s) and its indexes" ≈ **19.4 GB** | Not on this plan |
| `VACUUM FULL pitches` | **`ACCESS EXCLUSIVE` for the entire run** | a full second copy ≈ **9.7 GB** | **No** |

`REINDEX CONCURRENTLY` is the disk-friendly path *because* `pitches` has 29 indexes — you pay for one at a time. Caveats: two table scans, substantially slower, cannot run inside a transaction block, and on failure leaves an invalid `_ccnew`/`_ccold` index you must drop before retrying (`SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid`).

If `pg_repack` ever becomes right: Supabase documents `create extension pg_repack with schema extensions;`, needs version **≥ 1.5.2** for non-superuser operation, and requires `-k`/`--no-superuser-check` on **every** CLI invocation, since "that role is not available to users on the Supabase platform." Availability is *(verify)* — check `pg_available_extensions` first.

---

## 9. Running VACUUM on this platform — the wrinkle that matters

**You cannot vacuum through the app.** Two independent blockers: `run_mutation` accepts `INSERT`/`UPDATE`/`DELETE` only (`run_query` is SELECT-only); and even a permissive wrapper would fail, because **"`VACUUM` cannot be executed inside a transaction block"** — a PostgREST RPC executes inside a transaction and a `plpgsql` body always is. Structural, not a permissions gap; a `run_maintenance` RPC would not work. *(documented + inferred; if you build one anyway, prove it on a small table first.)*

**How to actually run one:**

- **Supabase SQL Editor** — Supabase's disk-size docs instruct users to run `vacuum full <table name>;` there, implying no wrapping transaction. *(documented by implication — verify with a cheap `VACUUM (ANALYZE) player_season_stats;` first.)*
- **A direct connection** — `psql` on the direct connection string (port 5432), *not* the transaction-mode pooler. *(verify this project's pooler mode.)*
- **The Supabase MCP `execute_sql` path** — `docs/Queries.md:816` records that an UPDATE which timed out through the app "ran instantly over the MCP direct connection," so it does not inherit `authenticator`'s 8s `statement_timeout`. Whether it wraps in a transaction is *(verify)*.

A manual `VACUUM` inherits the session's `statement_timeout`, so from any 8s session a vacuum of `pitches` aborts partway:

```sql
SET statement_timeout = 0;
SET lock_timeout = '5s';          -- fail fast rather than queue behind DDL
VACUUM (VERBOSE, ANALYZE) pitches;
```

**Managed-Postgres reality.** Supabase states "Supabase projects have automatic vacuuming enabled," and that "Disks don't automatically downsize during normal operation" — they shrink only on project upgrade, to 1.2× database size with an 8 GB floor. Autovacuum being *on* is not autovacuum being *tuned* (§4), and `VACUUM FULL` buys free space *inside* the Postgres files, not a smaller bill (`11-capacity-storage-planning.md`).

---

## 10. What Triton should do, in order

1. **Apply the per-table overrides from §4.1.** Four statements, `SHARE UPDATE EXCLUSIVE`, no downtime, reversible with `RESET`. Moves `pitches` from a 1,778,050-dead-tuple trigger to ~188,000. Retry on lock timeout.
2. **Run one manual `VACUUM (VERBOSE, ANALYZE) pitches;`** over a direct connection with `statement_timeout = 0`, clearing the existing 1.44M dead tuples rather than waiting. Capture the VERBOSE output and wall-clock duration — that turns §3's inferred estimates into a measured baseline.
3. **Re-measure `n_dead_tup` afterward and log it to `docs/Queries.md`.** A vacuum that removed nothing means one of the four §7 blockers is active.
4. **Add the §7 Tier-1 query as a daily monitor**, alerting on `n_dead_tup > trigger_at` for tables over 100k rows and on `last_autovacuum` older than 7 days. **This is the detector** — without it the next backfill recreates today's state silently. Route it through `reportError` alongside the coverage monitors in `data-reliability/01`.
5. **Make the backfill routes vacuum-aware.** `/api/admin/backfill-stuff-plus` cannot issue `VACUUM` (§9), so it should **report** the dead-tuple delta and warn when a run pushed `n_dead_tup` past the trigger — an unenforced convention becomes an observable number.
6. **Measure the HOT ratio on `pitches`** (`n_tup_hot_upd / n_tup_upd`). If near zero, evaluate `fillfactor = 90`, but only alongside a planned rewrite (`04-bulk-write-patterns.md`).
7. **After any bulk load into `retro_events`, run `VACUUM ANALYZE` manually** (§6) — its insert trigger is ~2.98M inserts.
8. **Add `age(relfrozenxid)` to the monitor** (§5). Cheap, and it's the one failure mode that ends read-only.

**Anti-recommendation — do not run `VACUUM FULL pitches`.** It holds `ACCESS EXCLUSIVE` for the entire run, so every dashboard, report, and cron query against the table fails outright — they won't even queue, because `authenticator` carries `lock_timeout = 8s`. It needs a second full copy of a 9.7 GB relation *including all 29 indexes* on a disk-pressured plan, to reclaim maybe ~0.7 GB, and on Supabase the freed space doesn't shrink the disk anyway. Plain `VACUUM` plus corrected thresholds gets the query benefit at zero downtime; `REINDEX INDEX CONCURRENTLY`, one index at a time, recovers space if you truly need it.

**Anti-recommendation (second) — do not change `autovacuum_vacuum_scale_factor` globally.** A 0.02 global default would churn constantly over `players`, `system_metadata`, `work_tasks`, and every small table where 20% is genuinely right. Per-table only. Same for `autovacuum_max_workers`: raising it splits the same budget more ways.

**Highest-leverage next action:** run the four `ALTER TABLE` statements in §4.1, then one manual `VACUUM (VERBOSE, ANALYZE) pitches` over a direct connection, and log before/after `n_dead_tup` plus wall-clock duration to `docs/Queries.md`.

---

## Sources

1. PostgreSQL — [Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — dead-tuple quote, "will not return the space to the OS," freezing, wraparound WARNING/ERROR text.
2. PostgreSQL 17 — [Routine Vacuuming](https://www.postgresql.org/docs/17/routine-vacuuming.html) — verbatim threshold formulas.
3. PostgreSQL 17 — [Automatic Vacuuming parameters](https://www.postgresql.org/docs/17/runtime-config-autovacuum.html) — confirms `0.2`/`50`; no `max_threshold` in PG17.
4. PostgreSQL 18 — [Vacuuming parameters](https://www.postgresql.org/docs/18/runtime-config-vacuum.html) — `autovacuum_vacuum_max_threshold`; `vacuum_cost_*` defaults.
5. PostgreSQL — [VACUUM](https://www.postgresql.org/docs/current/sql-vacuum.html) — lock levels, FULL's disk note, "cannot be executed inside a transaction block."
6. PostgreSQL — [Visibility Map](https://www.postgresql.org/docs/current/storage-vm.html) — two bits per page, set only by vacuum.
7. PostgreSQL — [Index-Only Scans](https://www.postgresql.org/docs/current/indexes-index-only-scans.html) — the map check, "significant fraction" caveat.
8. PostgreSQL — [Heap-Only Tuples](https://www.postgresql.org/docs/current/storage-hot.html) — the two HOT conditions; fillfactor.
9. PostgreSQL — [CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html) / [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — per-table `autovacuum_*`; the `SHARE UPDATE EXCLUSIVE` quote.
10. PostgreSQL — [Monitoring Statistics](https://www.postgresql.org/docs/current/monitoring-stats.html) / [Progress Reporting](https://www.postgresql.org/docs/current/progress-reporting.html) — `n_dead_tup`/`n_tup_hot_upd`; vacuum phases.
11. PostgreSQL — [REINDEX](https://www.postgresql.org/docs/current/sql-reindex.html) — index-bloat quote; CONCURRENTLY caveats.
12. PostgreSQL — [pgstattuple](https://www.postgresql.org/docs/current/pgstattuple.html) — `pgstattuple_approx`, `pgstatindex` columns.
13. PostgreSQL — [MVCC Introduction](https://www.postgresql.org/docs/current/mvcc-intro.html) — snapshot model.
14. PostgreSQL Wiki — [Show database bloat](https://wiki.postgresql.org/wiki/Show_database_bloat) — the estimate query and its disclaimer.
15. EDB — [Autovacuum Tuning Basics](https://www.enterprisedb.com/blog/autovacuum-tuning-basics) — "if it hurts, you're not doing it often enough"; 0.01 + threshold 1000–10000; 800/400/40 MB/s; workers ≠ throughput.
16. Percona — [Tuning Autovacuum and Autovacuum Internals](https://www.percona.com/blog/tuning-autovacuum-in-postgresql-and-autovacuum-internals/) — the `(0.2 × 1000) + 50 = 250` example; pre-PG12 MB/s figures.
17. pganalyze — [5mins E12: tuning VACUUM and autovacuum](https://pganalyze.com/blog/5mins-postgres-tuning-vacuum-autovacuum) — 0.2 "problematic for large tables."
18. pganalyze — [Visualizing & Tuning Postgres Autovacuum](https://pganalyze.com/blog/visualizing-and-tuning-postgres-autovacuum) — phases; `scale_factor = 0.05`.
19. Crunchy Data — [Checking for PostgreSQL Bloat](https://www.crunchydata.com/blog/checking-for-postgresql-bloat) — the 9.6% vs 37.84% calibration; table vs index bloat.
20. Crunchy Data — [Managing Transaction ID Wraparound](https://www.crunchydata.com/blog/managing-transaction-id-wraparound-in-postgresql) — monitoring query; the 30–40% target.
21. Crunchy Data — [Insert-Only Tables and Autovacuum Prior to PG13](https://www.crunchydata.com/blog/insert-only-tables-and-autovacuum-issues-prior-to-postgresql-13) — the <1 ms → ~300 ms regression.
22. reorg — [pg_repack](https://reorg.github.io/pg_repack/) / Supabase — [pg_repack](https://supabase.com/docs/guides/database/extensions/pg_repack) — lock profile; "twice as large as the target table(s) and its indexes"; ≥ 1.5.2; `-k`.
23. Supabase — [Database and Disk Size](https://supabase.com/docs/guides/platform/database-size), [Postgres Bloat Minimization](https://supabase.com/blog/postgres-bloat), [`inspect db vacuum-stats`](https://supabase.com/docs/reference/cli/supabase-inspect-db-vacuum-stats) — autovacuum on by default; disks don't downsize; `vacuum full` from the SQL Editor.
24. ioguix — [pgsql-bloat-estimation](https://github.com/ioguix/pgsql-bloat-estimation), [Btree bloat part 4](https://blog.ioguix.net/postgresql/2014/11/03/Btree-bloat-query-part-4.html); Cybertec — [Tuning autovacuum](https://www.cybertec-postgresql.com/en/tuning-autovacuum-postgresql/), [VACUUM won't remove dead rows](https://www.cybertec-postgresql.com/en/reasons-why-vacuum-wont-remove-dead-rows/), [Why doesn't VACUUM shrink my table?](https://www.cybertec-postgresql.com/en/vacuum-does-not-shrink-my-postgresql-table/), [Stale statistics cause bloat](https://www.cybertec-postgresql.com/en/stale-statistics-cause-table-bloat/) — estimator failure modes; the four §7 blockers; 0.005 scale factors. *(Cybertec fetches 403'd; only search-surfaced claims attributed.)*

**Triton-internal evidence (measured 2026-08-11):** `n_dead_tup` and sizes for `pitches` (8.89M live / 1,437,923 dead / 9.7 GB / 4.8 GB indexes / 29 indexes), `retro_events` (14.9M / 194,912 / 19 GB), `milb_pitches` (2.54M / 112,916 / 2.4 GB), `pitch_videos` (1.48M / 51,024 / 430 MB), from `pg_stat_user_tables` via `Jo/context/triton-context.md`. The `authenticator` 8s `statement_timeout`/`lock_timeout` and the direct-connection bypass are at `docs/Queries.md:816`. The absence of any executed `VACUUM` is a repo-wide grep: matches only in `CLAUDE.md`, `.claude/agents/*.md`, and the `Jo/`+`Soto/` brain docs — zero in `app/`, `lib/`, `scripts/`, or any `.sql` file.
