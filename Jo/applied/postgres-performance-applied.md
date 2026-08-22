---
title: Postgres Performance on Triton — Applied Playbook
domain: applied
tags: [postgres, statement-timeout, vacuum-bloat, indexing, partitioning, capacity, bulk-writes, triton-platform]
last_updated: 2026-08-21
---

# Postgres Performance on Triton — Applied Playbook

> Turns `Jo/postgres-performance/01..11` into sequenced work. **The organizing idea is the timeout
> hierarchy** — which layer actually binds Postgres and which only looks like it does.

| Layer | Value | Binds the DB? |
|---|---|---|
| `authenticator` role `statement_timeout` | **8 s** | **Yes** — every plain `run_query` / `run_mutation` |
| `authenticator` role `lock_timeout` | 8 s | Yes — a blocked DDL aborts rather than queues |
| function-level `proconfig` (`run_query_long`) | **120 s** | **Yes** — overrides the role cap |
| `supabaseAdminLong` fetch timeout (`lib/supabase-admin.ts:20`) | 120 s | **No** — client-side `AbortSignal` |
| `supabaseAdmin` fetch timeout (`lib/supabase-admin.ts:17`) | 30 s | No — client-side |

`SECURITY DEFINER` changes privileges, not timeouts. There is **no `run_mutation_long`**, so the
write path is pinned at 8 s — which is why day-chunking exists (`planning.md:46`).

## TL;DR

- **The P0 is three `ALTER FUNCTION` statements and everything else here is downstream of it**, because half the platform is currently dividing by a 46-day-old denominator (measured).
- **The three broken refresh functions carry no `SET statement_timeout` in their own DDL** — visible in the repo at `scripts/create-materialized-views.sql:334` — so they inherit the 8 s role cap and cannot finish (measured).
- **Do not add `run_mutation_long`.** It would raise the ceiling for all 16 `run_mutation` call sites at once, and the 8 s cap is the only thing that has ever forced correct chunking here (inferred).
- **Two shipped integrity checks test existence where they should test age**, and both passed green through all 46 days of the outage (measured).
- **Refresh statistics before auditing anything.** `last_analyze` was NULL on every table checked; an index audit against a never-analyzed table measures the planner's mistakes, not the workload (measured + inferred).
- **Nine of 29 indexes on `pitches` have `idx_scan = 0` (~1.42 GB), and dropping one is not free** — the reversal is `CREATE INDEX CONCURRENTLY` over 8.88M rows, and a failed CIC leaves an INVALID index that costs writes and returns nothing (measured + documented).
- **The ingest sits at 94.8% of the 8 s cap and rewrites ~8,000 unchanged rows a night; those are the same fact.** Every no-op row still pays a heap tuple plus up to 29 index entries (measured + inferred).
- **Do not partition `pitches`; `retro_events` cannot be time-partitioned at all** — it has no date, year, or season column, only `game_id` text with the year at characters 4–7 (measured).

---

## NOW (0–6 weeks)

### 1. Give the three refresh functions their own `statement_timeout` — P0

`scripts/create-refresh-league-averages.sql:24` declares `RETURNS void LANGUAGE plpgsql` with no
`SET` clause; `scripts/create-refresh-league-percentiles.sql:14` and
`scripts/create-materialized-views.sql:334` are identical in that respect, and `pg_proc.proconfig`
is `NULL` for all three, so each inherits `authenticator`'s 8 s cap. 52 runs since 2026-06-26, 50
timeouts, 2 skips, **zero successes, all 52 logged `status='success'`** (`planning.md:301`,
findings #1). `league_averages` 46 days stale, `league_percentiles` 69, six matviews frozen.
**(measured)**

```sql
ALTER FUNCTION refresh_materialized_views()    SET statement_timeout = '600s';
ALTER FUNCTION refresh_league_averages(int)    SET statement_timeout = '600s';
ALTER FUNCTION refresh_league_percentiles(int) SET statement_timeout = '600s';
```

Metadata-only, `RESET`-reversible, ten minutes including verification.

**Two traps.** (a) `ALTER FUNCTION … SET` works here only because PostgREST hoists `proconfig` into
a transaction-scoped `SET LOCAL`; a direct `psql` call gets the *caller's* session timeout and will
look like the fix failed — **verify through the RPC path, not the SQL editor**
(`Jo/postgres-performance/03-timeouts-locks-concurrency.md`). (b) 600 s exceeds
`app/api/cron/refresh/route.ts:11`'s Vercel ceiling, so the wall clock becomes the binding limit —
the right place for it to bind, provided the route surfaces the failure.

**Stop condition:** `refresh_league_averages(2026)` invoked via `app/api/cron/refresh/route.ts:108`
returns without error and `max(updated_at)` on `league_averages` moves to today.

### 2. Assert freshness, not existence, on the assets item 1 unblocks

The check named `league_averages` (`lib/dataIntegrity.ts:336`) runs
`SELECT COUNT(*) FROM league_averages WHERE season = year` and returns `pass` on `count > 0`. Rows
have existed since 2026-06-26, so **it passed green through all 46 days of the outage**. The check
named `materialized_views` (`lib/dataIntegrity.ts:273`) probes `player_summary` and, on staleness,
calls `refresh_player_summary` — the two functions that already work. It never touches an `mv_*`
view. Right instrument, wrong node, twice. **(measured)**

Replace each existence predicate with a maximum-age predicate on `max(updated_at)`, and treat an
absent `mv_last_refreshed` (`app/api/cron/refresh/route.ts:140`) as infinitely stale rather than
skippable — the marker is written only on success and there has never been one. **Stop condition:**
roll one asset's `updated_at` back three days in a scratch row and confirm a breach, not a `pass`.
**(inferred)**

### 3. `ANALYZE` the three large tables — before any index or plan work

`last_analyze` was NULL on every table checked. At the default
`autovacuum_analyze_scale_factor = 0.1`, `pitches` needs `50 + 0.1 × 8.89M ≈ 889,050` modifications
before autoanalyze fires; at ~12k rows touched a night that is ~74 days, and on new rows alone it
approaches a full season (findings #10). The mechanism is specific: `game_date`'s histogram ends
where the last ANALYZE saw it, so `WHERE game_date >= CURRENT_DATE - 7` falls off the end, the
planner estimates ~1 row, picks a Nested Loop, and the statement dies at 8 s. **A bad plan here is
not a slow page — it is a feature returning nothing.** **(measured defaults + inferred mechanism)**

This precedes the whole index audit for one reason: `idx_scan` records which indexes the *planner
chose*, and a planner working from a year-old histogram chooses badly. An index at zero scans today
may be one the planner could never justify. Auditing first measures the mistake, not the workload.

`ANALYZE` is sample-based, takes seconds, needs no exclusive lock, and unlike `VACUUM` may run
inside a transaction — but not through `run_mutation`, which accepts DML only, so run it in the SQL
editor. In the same pass add `CREATE STATISTICS` for four functional dependencies the planner does
not know — `game_date → game_year`, `pitch_type ↔ pitch_name`, `pitcher → p_throws`,
`game_pk → game_date` — which cost **zero at write time** and take effect at this same ANALYZE
(findings #12e). **Stop condition:** `last_analyze` non-NULL on `pitches`, `milb_pitches`,
`retro_events`.

### 4. Per-table autovacuum overrides, then one plain `VACUUM (VERBOSE, ANALYZE) pitches`

`pitches`: 8,891,054 live / 1,437,923 dead (13.9%), `autovacuum_count = 1`, `last_autovacuum`
2026-05-17. The default `scale_factor = 0.2` puts the trigger at ~1,778,261, so it sits at **80.9%**
and will stay there. The cost is already measured: an index-only scan returning 1,063 rows reported
`Heap Fetches: 914` from a stale visibility map, 6,574 ms cold (findings #9). **(measured)**

```sql
ALTER TABLE pitches SET (autovacuum_vacuum_scale_factor = 0.02,
                         autovacuum_vacuum_threshold    = 10000,
                         autovacuum_analyze_scale_factor = 0.02,
                         autovacuum_analyze_threshold    = 10000);
```

`SHARE UPDATE EXCLUSIVE`, no downtime, `RESET`-reversible. Then one manual plain `VACUUM` from the
SQL editor, off-peak — **not `VACUUM FULL`** (Standing Rules). The repo convention "VACUUM between
large batch updates" has never been implemented and cannot be: `VACUUM` may not run inside a
transaction block, and every PostgREST RPC call is one. Leave a detector behind or this only resets
the clock — alert when `n_dead_tup / n_live_tup > 0.10` on any table over 1 GB or `last_autovacuum`
exceeds 14 days. **Stop condition:** re-run the `Heap Fetches: 914` query and expect ~0.

### 5. Make `auto_explain` able to fire, and fix the measurement protocol

`auto_explain` is in `shared_preload_libraries` with `log_min_duration = 10000` ms — *above* the 8 s
cap, so no `run_query` statement can survive long enough to be logged — and
`log_nested_statements = off` hides RPC bodies (findings #12). Two dashboard settings:
`log_min_duration = 3000`, `log_nested_statements = on`. It is the only instrument that could have
caught the Stuff+ UPDATE while it was slow but still succeeding. **(measured)**

Hand captures cannot go through `run_query` (SELECT/WITH only), so they run in the SQL editor, where
two rules make a plan resemble production
(`Jo/postgres-performance/01-query-planning-explain.md`): `SET LOCAL statement_timeout = '8s'`,
because the editor does not inherit the cap; and wrap the statement in the same
`jsonb_agg(row_to_json(t))` the RPC applies — unwrapped, 5,000 `pitches` rows measured **11.9 ms**;
wrapped at 90 columns, **849 ms**; at 4 columns, 33.4 ms, so column count, not row count, is the
variable (findings #12c).

**Nothing here runs from a route, a script, or a subagent** — one human-driven session, statements
issued sequentially, each logged to `docs/Queries.md`. ~20 concurrent readers took this project down
for roughly an hour, against `max_connections = 60` and 256 MB of `shared_buffers`.

### 6. Measure the upsert instead of arguing about it

`app/api/update/route.ts:148` uses `{ onConflict: 'game_pk,at_bat_number,pitch_number',
ignoreDuplicates: false }` — an unconditional `ON CONFLICT DO UPDATE` over a 3-day re-sync window,
so ~8k of each night's ~12k rows are rewritten unchanged. 8k × ~180 game days ≈ 1.44M row versions
against an observed `n_dead_tup` of 1,437,923. **Treat the agreement as suggestive, not proven** —
the estimator resets on vacuum and a 250k-row backfill ran the same day, and Jo's first Stuff+ root
cause was wrong precisely because one suggestive coincidence was trusted. **(inferred)** The test is
two `n_dead_tup` readings either side of one `/api/cron/pitches` run, and it gates NEXT item 2.

### 7. Read the provisioned disk ceiling off the dashboard

`pg_database_size` = 34,703,805,587 B = **32.3 GiB**, while `CLAUDE.md` and `planning.md:115` still
describe an 8 GB plan under disk pressure. 8 GB is the *included allowance* on Pro, not the
provisioned volume; Supabase auto-expands by +50% at 90% usage, so the disk plausibly walked
8 → 12 → 18 → 27 → 40.5 GB unattended. **The ceiling is not readable from SQL.** Every headroom
claim here — including how urgent the `VACUUM FULL` prohibition is — is gated on that number
(findings #16b). Thirty minutes. **(measured; ceiling unresolved)**

The compute side is a separate decision and does not reconcile: the instance reports Micro-class
settings (`shared_buffers = 256 MB`, `work_mem = 3.5 MB`, `max_connections = 60`) against ~35 GB of
relations, yet `pitches` and `retro_events` each exceed Micro's disk ceiling (findings #12g). 40 GB
of gp3 is ~$4/month while caching the working set means Large (~$110) or XL (~$210) — **27–52× the
marginal disk cost**. Decide it on measured latency after NOW items 3–4, never on the 38.51%
cache-hit ratio, which counts OS page-cache hits as `blks_read`. **(measured)**

---

## NEXT (6 weeks – 6 months)

### 1. Drop the zero-scan indexes — after a post-`ANALYZE` window, one at a time

First snapshot the undo: every `pg_get_indexdef()` string for `pitches` and `retro_events`, each
index's `idx_scan`, and the database's stats-reset time, written to `docs/Queries.md`. Then wait 3–4
weeks after NOW item 3 and re-read `idx_scan`, taking the **delta**, not the lifetime total. An
index at zero scans across a window in which the planner had fresh statistics is a real candidate;
an index at zero before that is only a hypothesis. **(inferred)**

Of ~1.42 GB, **~1.02 GB is genuinely droppable**: `pitches_pkey` (370 MB, also zero scans) backs a
constraint and stays. Add ~905 MB on `retro_events` (`event_type_idx` 96 MB / 0 scans,
`batter_game_idx` 378 MB / 2 scans). Expected gain: ~31% less write amplification per `pitches` row
UPDATE — direct headroom under the 8 s cap. Take `idx_pitches_stuff_plus` (261 MB) first: its
predicate column is `stuff_plus`, and Postgres counts predicate columns as indexed for HOT
purposes, so a never-scanned index disabled HOT on the very UPDATE that broke. **(measured)**

**Cost the operation honestly.** `DROP INDEX CONCURRENTLY` takes only `SHARE UPDATE EXCLUSIVE` and
blocks neither reads nor writes, but it cannot run inside a transaction block — so not through
`run_mutation`; it waits on the oldest transaction that might use the index; and it cannot be rolled
back. The reversal is `CREATE INDEX CONCURRENTLY` over 8.88M rows on Micro-class compute: minutes,
not seconds, spilling to disk, and a CIC that fails leaves an **INVALID** index carrying full write
cost while returning nothing — with a low `statement_timeout` its most common cause
(`Jo/postgres-performance/02-indexing-strategy.md`). One index per session; verify `indisvalid`
after each. **(documented + inferred)** **Stop condition:** 29 → 21 indexes on `pitches`, every
`pg_get_indexdef()` preserved, and the ingest upsert's `max_exec_time` re-read.

### 2. Replace the unconditional upsert with a change-guarded raw-SQL upsert

Only if NOW item 6 confirms the attribution. PostgREST's `.upsert()` cannot express a
`WHERE … IS DISTINCT FROM` guard on the `DO UPDATE`, so this means raw
`INSERT … ON CONFLICT DO UPDATE … WHERE ROW(target.*) IS DISTINCT FROM ROW(excluded.*)` through
`run_mutation` at the existing 500-row batch (`app/api/update/route.ts:150`). The guard suppresses
the *write*, not the row lock — Postgres locks conflicting rows before evaluating the `WHERE` — so
the saving is heap tuples, index entries, and WAL. **(documented)**

One consequence lands regardless: `inserted += batch.length` (`app/api/update/route.ts:154`) counts
no-op updates, so `totalInserted` is always ~12k in-season and the `skipDownstream = totalInserted
=== 0` gate at `app/api/cron/refresh/route.ts:47` can essentially never fire. A guarded upsert makes
that gate live for the first time — a behaviour change the cache-invalidation call at
`app/api/cron/pitches/route.ts:68` is gated on, so coordinate with `Cas/caching-state/`.
**Stop condition:** `n_dead_tup` growth across one cron run falls by roughly the unchanged-row
fraction measured in NOW item 6, and the upsert's `max_exec_time` drops below ~6 s.

### 3. Settle `run_mutation_long`: do not build it

The manifest asks for a position. **No**, on four grounds. **(inferred)**

1. **It loosens the wrong scope.** `run_mutation` executes arbitrary SQL text, so one new RPC raises
   the write ceiling for all 16 existing call sites and every future one. The read side already
   shows the drift: `run_query_long` was added for one heavy route and is now used at 8, including
   `lib/dataIntegrity.ts` — the module whose assertions are supposed to be cheap.
2. **The cap is the only thing that has ever forced correct chunking here.** The Stuff+ fix
   (`app/api/update/route.ts:306` — one statement per day, ~4k rows, ~1.4 s) and the rewritten
   backfill (`app/api/admin/backfill-stuff-plus/route.ts:52`) are correct *because* 8 s made the
   alternative impossible. A 120 s write path would have let the original ~12k-row statement pass
   for a season or two and moved the failure somewhere bigger and later. Cost is superlinear: ~4k
   rows ≈ 2,900 rows/s, ~8k ≈ 1,000 rows/s. **(measured)**
3. **A long write is worse than a long read.** Two minutes of UPDATE on `pitches` holds row locks
   and pins the xmin horizon on a table that has autovacuumed once in its life, then rolls back
   everything on timeout.
4. **The legitimate need already has the right pattern** — a *named* function with its own
   `proconfig`, which is exactly NOW item 1. Raise the ceiling for one reviewed body of SQL, never
   for an `EXECUTE` of arbitrary text.

**What would change the answer:** a mutation with no stable indexed column to chunk on. The known
examples are DDL, which `run_mutation` refuses anyway. Record the decision in `planning.md`.

---

## LATER (6+ months)

### 1. Close the partitioning question in writing — the answer is "no", with a trigger

**`pitches`: do not partition by `game_year`.** It is the obvious move and wrong at this size. It
buys pruning that 14 of the 29 existing indexes already deliver — measured plan: `Index Only Scan`,
`Index Cond: ((game_year = 2026) AND (pitch_type = 'FF'))`, no seq scan. It costs ~348 index builds
that cannot use `CONCURRENTLY`; it needs ~19.4 GB of transient disk on a plan whose ceiling is still
unread; `ATTACH PARTITION` scans unless a valid `CHECK` exists and building that `CHECK` exceeds
8 s, so **no part of the DDL can run through `run_mutation`**; and a unique constraint on a
partitioned table must include the partition key, so the ingest's
`UNIQUE (game_pk, at_bat_number, pitch_number)` — 13.9M scans, the busiest index on the table —
would go 4-column and could no longer prevent the same pitch existing under two different years.
That reintroduces the silent-duplicate failure mode this platform has already been burned by.
**(measured + documented)**

**`retro_events`: cannot be range-partitioned by time at all** — no date, year, or season column
exists, only `game_id` text with the year at characters 4–7. Adding `season int` (derived from
`substring(game_id, 4, 4)`, backfilled chunked by `game_id`) is the prerequisite for any retention
work, and even then its case is archival, not partitioning. **(measured)**

**Revisit trigger:** `pitches` exceeds ~25 GB, or per-partition VACUUM becomes the only way to hold
bloat under 10%. Record the decision in `planning.md` so it stops being re-proposed
(`Jo/postgres-performance/06-partitioning-large-tables.md`).

---

## Standing Rules

1. **Never raise `authenticator`'s `statement_timeout`.** It would hide this entire class of failure
   rather than surface it, across every route at once. Raise ceilings per named function via
   `proconfig` only (`planning.md:304`).
2. **Never add a generic long-running mutation RPC.** See NEXT item 3.
3. **Size write chunks against ~4 s, not 8 s.** `run_mutation`'s `EXCEPTION WHEN OTHERS` fallback
   re-issues `EXECUTE query_text`, so a failing statement runs twice — no double-write, the
   subtransaction rolls back, but double cost and half the apparent margin (findings #12b).
   **(documented)**
4. **Never run `VACUUM FULL` on `pitches` or `retro_events`.** It needs a second full copy — 9.5 GB
   and 19.4 GB — under `ACCESS EXCLUSIVE`, near the auto-expand line, with `pg_repack` unavailable.
   The likely outcome is a long exclusive lock followed by an out-of-disk failure. Plain `VACUUM`
   reclaims in place and is what is wanted; the distinction is load-bearing.
5. **Every production measurement is one session, sequential, human-driven** — no subagent, no
   route, no script fan-out — and every ad-hoc query is logged to `docs/Queries.md` before its
   result is reported.
6. **Existence is not freshness.** Two shipped checks conflate them (`lib/dataIntegrity.ts:336`,
   `:273`) and both stayed green through a 46-day outage. Any new assertion states a maximum age.
7. **Compression, column reordering, and RLS `(SELECT auth.uid())` rewrites are dead ends on the big
   tables.** TOAST relation size on all five is 8,192 bytes — one empty page, nothing to compress —
   and `pitches` carries a `USING (true)` policy that ORs the auth check into a constant (identical
   plans, 43.6 vs 43.5 ms). Named here so they stop being proposed.
8. **Boundaries.** Removing the `COALESCE` defaults from the Stuff+ formula changes scoring
   semantics and belongs to `Li/metric-governance/`. Cache behaviour downstream of NEXT item 2
   belongs to `Cas/caching-state/`. Alert severity and routing for every detector above belongs to
   `Jo/data-reliability/`.

---

**Triton-internal evidence.** The P0 is verifiable from the repo without a query: no
`SET statement_timeout` clause appears in `scripts/create-refresh-league-averages.sql:24`,
`scripts/create-refresh-league-percentiles.sql:14`, or `scripts/create-materialized-views.sql:334`,
and the three are invoked at `app/api/cron/refresh/route.ts:108`, `:121`, `:134`. Every
live-database number above — the 52-run / 50-timeout / 0-success record, the 46- and 69-day
staleness figures, `n_dead_tup = 1,437,923` against 8,891,054 live rows, `autovacuum_count = 1` with
`last_autovacuum` 2026-05-17, `Heap Fetches: 914` at 6,574 ms cold, nine `idx_scan = 0` indexes
totalling ~1.42 GB, the 94.8% / 99.96% / 99.94% timeout margins, `pg_database_size` =
34,703,805,587 B, the Micro-class GUCs, the 8,192-byte TOAST relations — was measured on 2026-08-11
and is recorded in `docs/reliability-findings-2026-08-11.md` (findings 1, 7–12g, 16b) with its SQL
in `docs/Queries.md`; the timeout hierarchy is at `planning.md:40`, `:46`, `:304` and the P0 at
`planning.md:301`. Code claims were read 2026-08-21 at repo `ec2fc7a`:
`app/api/update/route.ts:148` (unconditional upsert), `:154` (`inserted += batch.length`), `:306`
(per-day Stuff+ chunking), `app/api/cron/refresh/route.ts:47` (`skipDownstream`),
`app/api/cron/pitches/route.ts:68` (cache-invalidation gate), `lib/supabase-admin.ts:17,20`
(client-side fetch timeouts), `lib/dataIntegrity.ts:273` and `:336` (the existence-not-freshness
checks — found this session), and `app/api/admin/backfill-stuff-plus/route.ts:52` (`chunkDays`).
**No query was run against the database while writing this playbook**, and each borrowed number
carries the command that would re-confirm it.
