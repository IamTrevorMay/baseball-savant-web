---
title: Bulk Write Patterns — COPY, Upsert, and Chunked UPDATE Without Breaking the Table
domain: postgres-performance
tags:
  - bulk-writes
  - copy
  - upsert
  - chunking
  - keyset-pagination
  - hot-updates
  - write-amplification
  - mvcc-bloat
sources_reviewed: 22
last_updated: 2026-08-11
---

# Bulk Write Patterns — COPY, Upsert, and Chunked UPDATE Without Breaking the Table

## TL;DR

- **The unit of bulk-write cost is "a row × the number of indexes."** One UPDATE on `pitches` writes a new heap tuple, 29 index entries, and WAL for all of it — ~551 B heap and ~540 B index per row version. Row counts understate cost on wide, heavily-indexed tables. (measured)
- **COPY beats multi-row INSERT by ~3.5–8x and single-row INSERT by 100–600x, and it doesn't evict your cache.** TigerData: 100M rows in 316s vs 2,653s vs 94,623s. pganalyze measured COPY's `bulkwrite` ring buffer using 2,000 shared buffers where INSERT used 16,000. (documented)
- **`INSERT ... ON CONFLICT DO UPDATE` writes even when it changes nothing.** Postgres locks every conflicting row *before* evaluating the `DO UPDATE ... WHERE` — xid assigned, `LOCK` WAL record, commit flush. Datadog measured IOPS doubling and WAL syncs quadrupling from an upsert that updated zero rows. (documented)
- **Triton's nightly ingest probably pays that tax.** It upserts a 3-day window with `ignoreDuplicates: false`; ~8k of ~12k rows/night already exist unchanged and are rewritten anyway. Over ~180 game days that is ~1.44M gratuitous row versions — indistinguishable from the **1.44M dead tuples** measured on `pitches`. (inferred — a hypothesis to test, not a diagnosis; §3.2)
- **Unordered `LIMIT`/`OFFSET` paging is not "slightly wrong," it is undefined.** Without an `ORDER BY` constraining rows into a *unique* order, the docs promise "an unpredictable subset" and "inconsistent results." (documented)
- **`ctid` paging over a table you are UPDATEing is self-corrupting.** A row's `ctid` changes when updated, so batch 1 relocates its own rows and batch 2's `OFFSET` lands on a different physical set. `/api/admin/backfill-stuff-plus` did exactly this. (documented mechanism, measured in Triton)
- **Chunk by an indexed column the job does not modify.** `game_date` is stable under the job's own writes and under concurrent ingest, and the cursor is a date you can print in an error message. Keyset pagination on a stable key is the equally-correct alternative. (inferred)
- **HOT updates are the difference between 1 page written and 30, and Triton's HOT rate is unmeasured.** HOT needs no *indexed* column to change and the tuple to fit on the same page; `fillfactor` defaults to 100. Adyen measured HOT 63.9%→92.2% and WAL 3.15→2.80 TB/day from fillfactor 100→85. (documented; Triton's figure unknown — §6)
- **The 8s cap already picked a side of the transaction-size tradeoff, and it picked right.** Big transactions hold locks, pin the xmin horizon against vacuum, and lose everything on timeout. The cap forced per-day chunks, which is what made the Stuff+ job *correct*, not merely faster. (documented + measured)
- **Every bulk UPDATE is also a bulk DELETE.** A 250k-row repair leaves ~273 MB of dead heap + index until VACUUM, and at `scale_factor = 0.2` autovacuum ignores `pitches` until ~1.78M dead tuples — above the 1.44M actually observed. (documented formula, measured magnitudes)
- **Resumability should be derived from the data, not stored.** `WHERE stuff_plus IS NULL` makes the repair idempotent *and* self-resuming. A stored cursor is a second thing that can be wrong, and after a crash it usually is. (inferred)

---

## 1. The write-cost model

Price the operation before choosing a pattern. One logical row change produces a new heap tuple, a dead old tuple, one index entry **per index** on any non-HOT update, WAL for every one of those writes, and — for the first touch of a page after a checkpoint — a **full 8 kB page image**. That last item is the one people miss. The docs: *"the first modification of a data page after each checkpoint results in logging the entire page content."* A bulk UPDATE scattered across many pages, straddling a checkpoint, writes 8 kB of WAL per page before it writes anything about the rows. That is how WAL volume ends up exceeding the changed data by an order of magnitude.

Triton's derived figures (`triton-context.md`, measured 2026-08-11):

```
pitches: 8.89M rows | 9.7 GB total | 4.8 GB index | 29 indexes
heap  = 9.7 − 4.8 = 4.9 GB → ~551 B/row
index = 4.8 GB / 8.89M      → ~540 B/row across all 29 (≈18.6 B each)
```

**Indexes are ~50% of this table.** A row UPDATE writes about as many bytes into indexes as into the heap and touches up to 30 pages. Measured throughput follows: **~4,000 rows in ~1.4s ≈ 2,860 rows/s**, against TigerData's ~316,000 rows/s for COPY into a fresh table. The ~110x gap is index maintenance and MVCC, not Postgres being slow. (measured Triton figure, documented comparator; the ratio is inferred — different hardware.)

Two consequences: **a full rescore of `pitches` is ~52 minutes of pure statement time**, so no design may assume it fits in one request; and while 8s *arithmetically* buys ~23,000 rows, the **measured** cliff is ~8k passing / ~11k failing, because throughput isn't linear and the plan shifts with predicate selectivity. Trust the measured cliff.

---

## 2. Getting rows *in*: COPY vs multi-row INSERT vs single INSERT

TigerData, seconds (lower is better):

| Rows | Single INSERT | Batched INSERT | COPY | `UNNEST` |
|---|---|---|---|---|
| 1M | 1,067 | 32.5 | 4.31 | 4 |
| 25M | 23,964 | 566 | 73.1 | 128 |
| 100M | 94,623 | 2,653 | 316 | 533 |

At 100M rows: COPY ≈ **316k rows/s**, batched ≈ **38k/s**, single ≈ **1.06k/s**. pganalyze independently measured 10M rows at 9,000s / ~50s / 14s; Citus measured 1,075/s, ~3,000/s, 10,000+/s. Different hardware, same shape. The docs: *"loading a large number of rows using COPY is almost always faster than using INSERT, even if PREPARE is used."*

COPY wins for a reason beyond parse overhead: it runs in a `bulkwrite` I/O context with a **ring buffer**, consuming 2,000 shared buffers where the same INSERT consumed 16,000. On a live system that matters more than raw speed, because a big INSERT evicts everyone else's cached pages. Batch sizing: TigerData found INSERT optimal at **20,000–40,000** rows, degrading beyond; Citus saw gains from 100 up. Triton uses **500**, inside the useful band — PostgREST round-trips dominate anyway, so raising it is a modest win at best.

What COPY costs you: it is one statement, so it fails on the first bad row and leaves already-inserted rows as dead space needing VACUUM (PG16+ offers `ON_ERROR ignore` with `REJECT_LIMIT n` — the right escape hatch for a third-party feed). Triggers and CHECK constraints still fire. And **COPY cannot upsert**: the idiom is COPY into staging, then one `INSERT ... SELECT ... ON CONFLICT`.

**Triton reality check:** app code cannot issue `COPY FROM STDIN`. The only write path is `run_mutation(query_text)` over PostgREST, and supabase-js `.upsert()` compiles to `INSERT ... ON CONFLICT`. **For any one-off load >1M rows, use `psql` + `\copy` into staging and merge in SQL — don't push it through the API.** (inferred)

---

## 3. Upsert: `INSERT ... ON CONFLICT` and the cost of doing nothing

`conflict_target` is optional for `DO NOTHING`, **required** for `DO UPDATE`. `EXCLUDED` holds the proposed row. The command **will not affect any single existing row more than once** — duplicate keys within one statement raise a **cardinality violation**. Triton's key is `(game_pk, at_bat_number, pitch_number)` and Savant re-emits corrected rows, so dedupe with `DISTINCT ON` before any wide re-ingest. `MERGE` (PG15+) needs no unique constraint and supports `RETURNING merge_action()`, but the docs explicitly steer you back to `ON CONFLICT` when concurrent INSERTs are the concern.

### 3.1 `DO UPDATE` locks rows it will not update

From the docs, on the `DO UPDATE ... WHERE` clause:

> Only rows for which this expression returns `true` will be updated, although **all rows will be locked** when the `ON CONFLICT DO UPDATE` action is taken.

Datadog built the query you'd expect to be free — update a timestamp at most once a day — and watched **disk IOPS double and WAL syncs quadruple** while zero rows changed. `pg_walinspect` gave the chain: row located → **locked** → xid assigned → `LOCK` WAL record written → `WHERE` evaluates false → but because an xid exists, a `COMMIT` record must be written **and synced**. Their fix avoided the lock entirely:

```sql
WITH insert_attempt AS (
  INSERT INTO host_last_ingested (host_id) VALUES (:host_id)
  ON CONFLICT DO NOTHING RETURNING *
)
UPDATE host_last_ingested SET last_ingested = now()
 WHERE host_id = :host_id
   AND last_ingested < now() - '1 day'::interval
   AND NOT EXISTS (SELECT * FROM insert_attempt);
```

Afterward, "the increase in WAL syncs closely matched the actual row updates."

### 3.2 The Triton hypothesis

`app/api/update/route.ts:146–169` upserts a **3-day window** nightly with `ignoreDuplicates: false` — unconditional `DO UPDATE`, all columns. Day 1 is genuinely new (~4k rows). **Days 2–3 (~8k rows) already exist and are almost always byte-identical**, yet each gets a new heap tuple, 29 index entries, and a dead old tuple.

```
8,000 rewritten rows/night × ~180 game days ≈ 1,440,000 unnecessary row versions
observed n_dead_tup on pitches, 2026-08-11:   1,440,000
```

That agreement is striking and it is **not proof**. `n_dead_tup` is an eventually-consistent cumulative estimate that resets on vacuum; the reading came immediately after a ~250k-row backfill that would itself contribute; the season isn't over. Jo has already been wrong once about a Stuff+ root cause by reasoning from a suggestive coincidence. **Grade: inferred.** The test is cheap — record `n_dead_tup` before and after one nightly ingest and see whether the delta is ~12k or ~4k.

If confirmed, the fix is a suppression predicate — `ON CONFLICT (...) DO UPDATE SET ... WHERE (pitches.*) IS DISTINCT FROM (EXCLUDED.*)` — which removes the heap and index writes but, per the docs and Datadog, **not** the lock, xid, or commit flush. Removing those too requires Datadog's CTE. Start with the predicate; it necessarily moves off supabase-js `.upsert()`, which cannot emit a `DO UPDATE ... WHERE`.

---

## 4. Getting rows *changed*: chunked UPDATE

An unbounded `UPDATE big_table SET ...` is the most dangerous statement in an analytics codebase. It takes `ROW EXCLUSIVE` (which does *not* block readers — writers never block readers in Postgres), but it also holds one snapshot for its whole duration, **pinning the xmin horizon and stalling vacuum database-wide**; accumulates the entire rollback surface in WAL and dead tuples before a byte is reclaimable; has no partial progress, so a timeout at 99% loses 100%; and on Triton **cannot exceed 8 seconds regardless of any client timeout**. Crunchy Data's framing: batching *"minimizes lock holding or contention,"* and *"operating on many rows simultaneously requires keeping old versions around for potential rollback, effectively doubling on-disk size."*

The Triton fix (`app/api/update/route.ts:306–340`) is the canonical shape — **one statement per day**:

```
before: one UPDATE over the ingest's 3-day window (~12k rows) → >8s → timeout → silence
after:  three UPDATEs, one per day (~4k rows, ~1.4s each)     → ~4.2s total
```

Total work: identical. Total time: roughly the same. Failure behavior: from "all-or-nothing, silently nothing" to "two days committed, one day reported failed." **Chunking is a reliability change first and a performance change second.** (measured)

---

## 5. How to chunk — four options, ranked

This is the section that matters. Getting it wrong produces a job that *appears* to work.

| Strategy | Stable under concurrent writes? | Stable under the job's **own** writes? | Cost per chunk | Resumable? |
|---|---|---|---|---|
| **Range on an indexed, job-immutable column** (`game_date`) | yes | **yes** | index range scan | yes — cursor is a date |
| **Keyset pagination on a stable key** | yes | yes, if the key isn't updated | index seek, O(1)/page | yes — cursor is the last key |
| **`ctid` ranges** | no | **no, for UPDATE** | TID range scan, sequential I/O | fragile |
| **`LIMIT` / `OFFSET`** | **no** | **no** | O(offset), grows every page | **no** |

### 5.1 Range on an indexed column — the default answer

```sql
UPDATE pitches p
   SET stuff_plus = ...
  FROM pitch_baselines b
 WHERE p.pitch_name = b.pitch_name
   AND p.game_year  = b.game_year
   AND p.game_date >= '2026-06-01'
   AND p.game_date <  '2026-06-02'   -- half-open: adjacent chunks can't double-count
   AND p.release_speed IS NOT NULL
   AND p.stuff_plus IS NULL;         -- idempotency guard
```

**`game_date` is not modified by this statement.** The predicate defining chunk *n+1* is unaffected by having executed chunks 1..*n*. That property — the chunk key is immutable *with respect to this job* — is the whole ballgame. Concurrent ingest can add rows to a past date; the `IS NULL` guard catches them next run rather than corrupting this one. Half-open bounds are not stylistic: `BETWEEN` double-counts the boundary day, and a double-counted day in a rescore is a double bloat charge.

### 5.2 Keyset pagination

Equally correct when there is no natural range column. Use a row-value comparison with a unique tiebreaker: `WHERE (updated_at, id) > ('2026-06-01', 123) ORDER BY updated_at, id LIMIT 20000`. Sequin's measured OFFSET degradation on one table — **468 µs** at offset 0, **1 ms** at 1,000, **87 ms** at 100,000 — is the performance half. The correctness half is that keyset positions each row by *its own* key rather than by how many rows precede it. Caveat: if the sort key can itself be updated, a row can still be visited twice or skipped.

### 5.3 `ctid` ranges — legitimate, narrow, lethal here

TID range scans give sequential I/O and need no index, which is why they appear in DELETE-heavy jobs — an 80M-record case study used `ctid` batching with `pg_sleep(1)` and finished in ~3h at 18% average CPU. But the docs are unambiguous:

> a row's `ctid` will change if it is updated or moved by `VACUUM FULL`. Therefore `ctid` should not be used as a row identifier.

**For an UPDATE job this is fatal, not cosmetic.** Updating batch 1 gives those rows *new* ctids; the heap's physical ordering no longer matches the one the paging assumed. `ctid` chunking for UPDATE is safe only if you snapshot the target ctids into a work table first — at which point you have a keyset scheme with extra steps.

### 5.4 `LIMIT` / `OFFSET` — never, and here is the receipt

> When using `LIMIT`, it is important to use an `ORDER BY` clause that constrains the result rows into a unique order. Otherwise you will get an unpredictable subset of the query's rows.
>
> ... using different `LIMIT`/`OFFSET` values to select different subsets of a query result **will give inconsistent results** unless you enforce a predictable result ordering with `ORDER BY`.

### 5.5 Worked example: the backfill route that never worked

`/api/admin/backfill-stuff-plus` existed specifically to repair the Stuff+ gap. It had **never functioned once**. Two independent defects.

**Defect 1 — the loop that could not loop.** The `hasMore` probe was `SELECT COUNT(*) FROM pitches WHERE ... LIMIT 1 OFFSET n`. `COUNT(*)` without `GROUP BY` returns **exactly one row**; `OFFSET n` for any `n ≥ 1` discards it. The probe returned zero rows, `hasMore` was false, and **the loop exited after batch 1, every time.** That first batch tried to rewrite the whole year — 657k rows against 29 indexes — and hit the 8s cap. The route returned an error nobody read, on a page nobody visited, for a repair nobody had run.

**Defect 2 — paging that was undefined before it was wrong.**

```sql
UPDATE pitches p SET stuff_plus = ...
 WHERE p.ctid = ANY (
   SELECT ctid FROM pitches WHERE game_year = 2026 LIMIT 50000 OFFSET n  -- no ORDER BY
 );
```

Three failures stacked: **no `ORDER BY`** (undefined subset, inconsistent across offsets); **`ctid` + UPDATE** (batch 1 relocates its own rows, so batch 2 scans a reshuffled heap — rows written twice, rows missed, silently); **`OFFSET n` over 657k rows** (O(n) cost growing every page, on an 8-second budget).

Defect 1 masked defects 2 and 3 completely. Had the loop ever worked, it would have produced *plausible partial coverage* — the worst outcome, because partial coverage renders and nobody questions it (`data-reliability/01`).

**Jo's rule, earned here: repair tooling that has never been exercised is decorative.** The rewrite (`app/api/admin/backfill-stuff-plus/route.ts:99–162`) chunks by `game_date` at `chunkDays = 1`, guards on `stuff_plus IS NULL`, uses half-open intervals, and returns `failed_chunk` with a resume hint.

---

## 6. HOT updates, fillfactor, and index write amplification

A **Heap-Only Tuple** update skips index maintenance entirely. Both conditions must hold: **no indexed column is modified** (BRIN excepted), and **the new tuple fits on the same heap page**. When they do, the old line pointer becomes a redirect to the newest visible version, indexes are untouched, and intermediate versions can be pruned during ordinary page access — *including by plain `SELECT`s* — without waiting for VACUUM. Adyen's framing: *"an ordinary update [writes] at least 11 different pages [with 10 indexes]... in the case of a HOT update, PostgreSQL only writes to a single page."* On `pitches` with 29 indexes, that ratio is **30 pages vs 1**.

`fillfactor` defaults to **100** (range 10–100). Below 100, INSERT packs pages only to that percentage, *"which gives UPDATE a chance to place the updated copy of a row on the same page as the original... and makes heap-only tuple updates more likely."* Adyen's production measurement, fillfactor 100 → 85:

| Metric | ff 100 | ff 85 |
|---|---|---|
| HOT update rate | 63.9% | **92.2%** |
| WAL/day | 3.15 TB | **2.80 TB** (−10%) |
| Peak dead rows | ~70M | ~40M |
| Table size (week 1) | 30 GB | 24 GB |

**Triton's HOT rate on `pitches` has not been measured.** The mechanism gives a strong prior that it is near zero — 29 indexes make condition (1) hard, an append-mostly table at fillfactor 100 makes condition (2) nearly impossible — but a prior is not a measurement. One query settles it:

```sql
SELECT n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd, 0), 1) AS hot_pct,
       n_dead_tup, n_live_tup, last_autovacuum
  FROM pg_stat_user_tables WHERE relname = 'pitches';
```

If `hot_pct` ≈ 0 **and `stuff_plus` is indexed**, HOT is unreachable by rule (1) and fillfactor cannot help — the lever is **index count** (`02-indexing-strategy.md`), where an unused-index audit against 4.8 GB beats any storage parameter. If `stuff_plus` is *not* indexed, rule (2) binds and fillfactor is genuinely on the table. **Do not lower it reflexively:** `SET (fillfactor = 85)` only affects pages written *after* the change, so realizing the benefit means rewriting a 4.9 GB heap on a disk-constrained plan. Measure first. (inferred)

---

## 7. Transaction size, lock duration, WAL

| Bigger transactions | Smaller transactions |
|---|---|
| Fewer commit flushes, less overhead | More commits, more overhead |
| Longer `ROW EXCLUSIVE` hold | Locks released promptly |
| **One snapshot held throughout — pins xmin, stalls vacuum globally** | Vacuum reclaims between batches |
| Rollback surface grows monotonically | Space reclaimable between chunks |
| Timeout at 99% loses everything | Committed chunks stay committed |

DML takes `ROW EXCLUSIVE`, conflicting with `SHARE`, `SHARE ROW EXCLUSIVE`, `EXCLUSIVE`, and `ACCESS EXCLUSIVE` — **not** `ACCESS SHARE`, so readers are never blocked. What a long bulk write *does* block is DDL and non-concurrent index builds, and `authenticator`'s **8s `lock_timeout`** means such a blocked statement aborts rather than queueing (`03-timeouts-locks-concurrency.md`).

Checkpoints fire every `checkpoint_timeout` (default 5 min) or when `max_wal_size` (default 1 GB) is about to be exceeded, and the docs warn that shortening the interval *increases* total WAL — the intuitive fix makes it worse. For a one-off load driven from `psql`, the docs' tuning list applies: raise `maintenance_work_mem` and `max_wal_size`, drop indexes and FK constraints before and rebuild after (*"creating an index on pre-existing data is quicker than updating it incrementally"*), and **`ANALYZE` afterwards**. None of it is reachable from a Vercel cron — which is exactly why chunking discipline carries the whole load there.

---

## 8. MVCC bloat: every bulk UPDATE is also a bulk DELETE

From the docs: *"an UPDATE or DELETE of a row does not immediately remove the old version of the row."* Percona's illustration: 10 rows, 3 updates to one of them → **13 heap tuples**, CTID chain 5 → 11 → 12 → 13. Applied to Triton's ~250k-row repair of 2026-08-11:

```
250,000 dead heap tuples   × ~551 B ≈ 138 MB dead heap
250,000 dead index entries × ~540 B ≈ 135 MB dead index
                                    → ~273 MB unreclaimed until VACUUM
```

Measured aftermath: **`pitches` carrying 1.44M dead tuples** ≈ ~790 MB of dead heap alone. On a plan where disk is the constraint, that is a capacity event caused by a maintenance action. Autovacuum will not necessarily rescue you on its own schedule — its trigger is `min(autovacuum_vacuum_max_threshold, autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor × reltuples)`, and at the historical default `scale_factor = 0.2` an 8.89M-row table needs **~1.78M dead tuples** before it is even considered. Triton's 1.44M sat *below* that line: the bloat was real and autovacuum was, correctly by its own rules, ignoring it. That argues for a per-table override, not for waiting.

Two rules: **VACUUM (not FULL) between large batch phases** — it marks space reusable for subsequent chunks, though it rarely returns disk to the OS; and **`VACUUM FULL` takes `ACCESS EXCLUSIVE`**, blocking even `SELECT`, which on a 9.7 GB live table is an outage — use `pg_repack` if you need the space back. The `pg_sleep(1)`-between-batches pattern is really "give autovacuum an opening"; a targeted `VACUUM pitches;` is more deterministic than hoping. Full treatment in `05-vacuum-autovacuum-bloat.md`.

---

## 9. Making a bulk write resumable and idempotent

1. **Idempotency guard in the predicate.** `AND p.stuff_plus IS NULL` makes a re-run a cheap no-op and makes the remaining work a *query* rather than a state variable.
2. **Progress derived from data, not stored.** A stored cursor is a second source of truth that can diverge from the first — and after a crash, usually has.
3. **A separate, explicit destructive mode.** `?mode=repair` (guarded) vs `?mode=rescore` (rewrites everything eligible). Conflating them means a formula change either can't be applied or gets applied by accident. `rescore` is a full non-HOT rewrite plus 29 index entries per row; schedule and vacuum around it.
4. **Half-open chunk boundaries.** `>= start AND < end`, never `BETWEEN`.
5. **Fail forward with a usable cursor.** The rewritten route returns `failed_chunk` plus `"Chunks before 2026-06-12 are committed. Re-run with &start=2026-06-12"`. Contrast the pre-rewrite behavior: one giant statement, timeout, zero rows, no cursor, no signal.
6. **Prove it moved something.** Per-chunk coverage accounting (`total`, `scored`, `pct`) is the difference between "returned 200" and "did the work." The route also refuses to start if `pitch_baselines` is empty for the year — a precondition check that turns a silent no-op into a 400 with an instruction. It exists because the failure it prevents cost three months.

---

## 10. Decision table

| Situation | Use | Why |
|---|---|---|
| New table / historical season / >1M fresh rows | **`\copy` via `psql` into staging, then `INSERT ... SELECT ... ON CONFLICT`** | 100–600x faster; ring buffer preserves cache; unreachable from the API |
| Nightly ingest of a few thousand rows via the app | **Multi-row `INSERT ... ON CONFLICT`**, batch 500–20k | COPY unavailable over PostgREST; batching is the dominant win |
| Lookback window where most rows are unchanged | **`DO UPDATE ... WHERE (t.*) IS DISTINCT FROM (EXCLUDED.*)`**, or Datadog's `DO NOTHING` + guarded-UPDATE CTE | Suppresses no-op row versions; the CTE form also avoids the row lock and its WAL |
| Populating a derived column over a bounded window | **Chunked UPDATE on an indexed, job-immutable column**, one chunk per statement | Fits the 8s cap with margin; per-chunk failure isolation |
| Repairing a derived column across a whole season | **Same + `IS NULL` guard + resume cursor + VACUUM between phases** | Idempotent, resumable, bounded bloat |
| Rewriting >30–50% of a large table | **New table + `CREATE INDEX` + swap**, or COPY into a fresh partition and `ATTACH` | Avoids MVCC doubling; `ATTACH PARTITION` takes only `SHARE UPDATE EXCLUSIVE` if a matching CHECK constraint pre-exists |
| Dropping a season / large time slice | **`DETACH PARTITION` (`CONCURRENTLY` where possible) or `DROP TABLE` on the partition** | Metadata operation; a chunked DELETE costs orders of magnitude more |
| Any chunking scheme at all | **Range on an indexed immutable column, or keyset** | `OFFSET` is undefined without a unique `ORDER BY`; `ctid` moves when you UPDATE |

The 30–50% threshold is a rule of thumb, not a measurement — at that fraction MVCC means you are writing a second copy of most of the table anyway, so write it somewhere you can index cheaply. Codacy's blunt version: *"the fastest way to update a large table is to create a new one."* (folklore, sound mechanism behind it)

---

## 11. What Triton should do, in order

1. **Test the upsert-bloat hypothesis (§3.2).** Record `n_dead_tup` on `pitches` before and after one `/api/cron/pitches` run. Delta ≈ 12k confirms ~8k unchanged rows are rewritten nightly; ≈ 4k refutes it. Log both to `docs/Queries.md`.
2. **If confirmed, add the suppression predicate** — `WHERE (pitches.*) IS DISTINCT FROM (EXCLUDED.*)` on the lookback days, routed through `run_mutation`.
3. **Measure `n_tup_hot_upd / n_tup_upd`** before touching any storage parameter (§6). It decides whether the lever is `fillfactor` or index count — very different projects.
4. **Give `/api/admin/backfill-stuff-plus` a wall-clock budget and a `next_start` cursor.** At ~2s per day-chunk (one count + one UPDATE + one coverage count), a full `?year=2026` run is **~360s against a 300s Vercel ceiling**. Today it dies mid-season with committed work and a `hint` — recoverable, but only if someone is watching. Stop at ~240s and return `next_start`.
5. **Set a per-table autovacuum override on `pitches`.** The default puts the trigger at ~1.78M dead tuples; the observed 1.44M sat under it. `ALTER TABLE pitches SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 5000)` moves it to ~183k. Coordinate with `05-vacuum-autovacuum-bloat.md` first.
6. **Explicit `VACUUM pitches;` between phases of any repair >100k rows,** and report `n_dead_tup` before/after in the route's response. Bloat should be a reported output of a backfill, not a discovery.
7. **Audit the remaining 16 crons for single-statement writes over an unbounded window.** Two jobs have already hit the 8s cap independently (`applyStuffPlusForDateRange`, `scripts/backfill-pitch-videos.ts`). Grep for any `run_mutation` whose predicate is a date *range* or a whole `game_year`.
8. **Monitor statement duration as a fraction of 8s** for the chunked writers. A chunk creeping from 1.4s to 3s is the early warning that 2027 needs half-day chunks — this metric would have *predicted* the Stuff+ outage rather than detecting it 90 days late.

### Anti-recommendation: do not build `run_mutation_long`

The obvious response to "the write timed out at 8s" is a write-side twin of `run_query_long` at 120s. **Don't.**

- It doesn't remove the ceiling, it moves it. The growth curve that took the Stuff+ UPDATE from 6s to 9s takes it from 90s to 130s in a season or two — and you'll have deleted the forcing function that made anyone notice.
- A 120s write holds `ROW EXCLUSIVE` and one snapshot for 120 seconds, pinning the xmin horizon and stalling vacuum **across the whole database**, on a platform already fighting 1.44M dead tuples and a disk ceiling.
- It converts a fast, cheap, total failure into a slow, expensive one. A 120s statement aborting at 118s has produced 118 seconds of WAL and dead tuples and zero committed rows.
- The 8s cap is the only reason `applyStuffPlusForDateRange` became per-day statements — which is what made it **correct**, not merely faster. Per-day chunks are independently committable, reportable, and resumable.

**Keep the ceiling. Shrink the chunks.** If a unit of work genuinely cannot be decomposed below 8s — a `CREATE INDEX`, a `VACUUM FULL`, a whole-table rewrite — it does not belong in an HTTP request; run it from `psql` with a stated blast radius.

**Highest-leverage next action: run the before/after `n_dead_tup` measurement in step 1.** One query on each side of one cron run. It either identifies ~1.44M unnecessary row versions per season with a one-statement fix, or it kills a plausible-sounding theory before it becomes repo folklore. Jo's first root cause for the Stuff+ outage was wrong; measuring is how that got caught.

---

## Sources

1. PostgreSQL Docs — [Populating a Database](https://www.postgresql.org/docs/current/populate.html) — the COPY-vs-INSERT claim; drop indexes/FKs; `max_wal_size`; ANALYZE after.
2. PostgreSQL Docs — [COPY](https://www.postgresql.org/docs/current/sql-copy.html) — single-statement semantics, dead space on failure, `ON_ERROR ignore`/`REJECT_LIMIT`.
3. PostgreSQL Docs — [INSERT](https://www.postgresql.org/docs/current/sql-insert.html) — conflict targets, `EXCLUDED`, cardinality violation, the "all rows will be locked" clause.
4. PostgreSQL Docs — [MERGE](https://www.postgresql.org/docs/current/sql-merge.html) — `merge_action()`, and the steer back to `ON CONFLICT` under concurrency.
5. PostgreSQL Docs — [LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html) — the warnings quoted verbatim in §5.4.
6. PostgreSQL Docs — [System Columns](https://www.postgresql.org/docs/current/ddl-system-columns.html) — ctid changes on UPDATE; not a row identifier.
7. PostgreSQL Docs — [Heap-Only Tuples](https://www.postgresql.org/docs/current/storage-hot.html) — the two enabling conditions, redirects, page pruning.
8. PostgreSQL Docs — [CREATE TABLE: Storage Parameters](https://www.postgresql.org/docs/current/sql-createtable.html) — `fillfactor` default/range and its role in enabling HOT.
9. PostgreSQL Docs — [WAL Configuration](https://www.postgresql.org/docs/current/wal-configuration.html) — full-page images after checkpoints; 5 min / 1 GB defaults.
10. PostgreSQL Docs — [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) — `ROW EXCLUSIVE` for DML; readers never blocked.
11. PostgreSQL Docs — [Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — the autovacuum threshold formula; `n_dead_tup` semantics.
12. PostgreSQL Docs — [Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html) — load-then-`ATTACH`, its lock level, `DETACH CONCURRENTLY`.
13. pganalyze — [Optimizing bulk loads in Postgres, and how COPY helps with cache performance](https://pganalyze.com/blog/5mins-postgres-optimizing-bulk-loads-copy-vs-insert) — 9,000s / ~50s / 14s; the ring buffer, 2,000 vs 16,000 buffers.
14. TigerData — [Testing Postgres Ingest: INSERT vs. Batch INSERT vs. COPY](https://www.tigerdata.com/learn/testing-postgres-ingest-insert-vs-batch-insert-vs-copy) — the timing matrix; the 20k–40k batch-size finding.
15. Citus Data — [Faster bulk loading in Postgres with copy](https://www.citusdata.com/blog/2017/11/08/faster-bulk-loading-in-postgresql-with-copy/) — 1,075/s, ~3,000/s, 10,000+/s.
16. Datadog Engineering — [When upserts don't update but still write](https://www.datadoghq.com/blog/engineering/debugging-postgres-performance/) — the no-op upsert incident, `pg_walinspect` trace, CTE fix.
17. Crunchy Data — [Simulating UPDATE or DELETE with LIMIT in Postgres](https://www.crunchydata.com/blog/simulating-update-or-delete-with-limit-in-postgres-ctes-to-the-rescue) — CTE batching and the "doubling on-disk size" argument.
18. Crunchy Data — [Checking for PostgreSQL Bloat](https://www.crunchydata.com/blog/checking-for-postgresql-bloat) — `pgstattuple`; VACUUM vs `VACUUM FULL` vs `pg_repack`.
19. Adyen — [Fighting PostgreSQL write amplification with HOT updates](https://www.adyen.com/knowledge-hub/postgresql-hot-updates) — the fillfactor 100→85 table; "11 pages vs 1."
20. Percona — [Basic Understanding of Bloat and VACUUM in PostgreSQL](https://www.percona.com/blog/basic-understanding-bloat-vacuum-postgresql-mvcc/) — UPDATE as insert+delete.
21. Percona — [An Illustration of PostgreSQL Bloat](https://www.percona.com/blog/an-illustration-of-postgresql-bloat/) — the `pageinspect` walkthrough and CTID chain.
22. Sequin — [Keyset Cursors, Not Offsets, for Postgres Pagination](https://blog.sequinstream.com/keyset-cursors-not-offsets-for-postgres-pagination/) — 468 µs / 1 ms / 87 ms; the row-value keyset pattern.

Also consulted, not load-bearing: [Codacy — How to update large tables in PostgreSQL](https://blog.codacy.com/how-to-update-large-tables-in-postgresql) and [Massive Data Updates in PostgreSQL: 80M Records](https://medium.com/@nikhil.srivastava944/massive-data-updates-in-postgresql-how-we-processed-80m-records-with-minimal-impact-20babd2cfe6f).

**Triton-internal evidence (measured 2026-08-11 unless noted):** table/index sizes, the 29-index count, the ~8k-passes/~11k-fails cliff, the ~4k-rows/~1.4s per-day chunk timing, and the 1.44M dead-tuple reading from `Jo/context/triton-context.md` and `docs/Queries.md`. Code: `app/api/update/route.ts:146–169, 306–340` (the 3-day `batchSize = 500` upsert; the per-day scoring UPDATE); `app/api/admin/backfill-stuff-plus/route.ts:18–34, 99–162` (the rewritten date-chunked repair, and its header comment documenting the original `COUNT(*) ... LIMIT 1 OFFSET n` and unordered `ctid = ANY(... LIMIT n OFFSET m)` defects).

**See also:** `02-indexing-strategy.md` (the cost of 29 indexes) · `03-timeouts-locks-concurrency.md` (why the 8s ceiling is unavoidable) · `05-vacuum-autovacuum-bloat.md` (reclaiming what these patterns generate) · `data-reliability/01-pipeline-observability-fundamentals.md` (why a silently-failed bulk write is worse than a loud one).
