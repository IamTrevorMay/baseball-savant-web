---
title: Indexing Strategy for a Large Analytical Table — What 29 Indexes Actually Cost
domain: postgres-performance
tags:
  - indexing
  - write-amplification
  - hot-updates
  - index-only-scans
  - partial-indexes
  - index-bloat
  - create-index-concurrently
  - unused-indexes
sources_reviewed: 24
last_updated: 2026-08-11
---

# Indexing Strategy for a Large Analytical Table — What 29 Indexes Actually Cost

## TL;DR

- **`pitches` carries 29 indexes totalling 4.8 GB against a 9.7 GB total relation size — roughly half the table's storage is indexes, not data.** Heap ≈ 4.9 GB for 8.89M rows: ~570 B/row, **~14 rows per 8 KB page**, ~165 MB and ~20 B/row per index. (measured, 2026-08-11)
- **Write amplification is the mechanical cause of the 2026 Stuff+ outage, not a contributing factor.** The nightly scoring UPDATE covered the ingest's 3-day window — ~12k rows × 29 indexes ≈ **348,000 index-tuple insertions in one statement** — and crossed the 8s `authenticator` `statement_timeout`. The fix was chunking to one day (~4k rows, ~1.4s). (measured)
- **Cost scales superlinearly, so "it fits today" is not a margin.** **~8k rows/statement passes, ~11k times out**; 4k runs in ~1.4s. Doubling 4k → 8k more than doubles wall time. (measured thresholds; inferred mechanism)
- **HOT (Heap-Only Tuple) updates are the only thing that makes an UPDATE cheap, and this one can never be HOT.** HOT needs no indexed column changed *and* room on the page; `stuff_plus` is indexed, so it fails by construction. With HOT, 29 index writes become 0. (documented)
- **A partial index blocks HOT for *every* row, not just those it contains — the predicate column counts as indexed.** Samokhvalov measured HOT **99.85% → 0%** swapping a full index for a partial one on the updated column, −14% UPDATE throughput. `idx_pitches_stuff_plus (stuff_plus) WHERE stuff_plus IS NOT NULL` trips both clauses at once. (documented)
- **Index count degrades writes measurably.** Percona, PG 17.4, 200 GB: **7 indexes ≈ 1,400 TPS / 11 ms; 39 ≈ 600 TPS / 26 ms** — ~58% loss — at >99.7% cache hit ratio throughout. A warm cache does not rescue you. (documented)
- **Only a leftmost prefix bounds a B-tree scan**; trailing constraints filter, they do not seek. Hence `idx_pitches_game_pk` is strictly redundant against the unique `(game_pk, at_bat_number, pitch_number)`. (documented)
- **Index-only scans are a VACUUM feature wearing an index costume** — they pay only when visibility-map all-visible bits are set, and every batch UPDATE clears them. `pitches` carried 1.44M dead tuples on 2026-08-11. (documented + measured)
- **At least 7 of the 29 are strong drop candidates on structure alone** — `game_pk`, `game_year`, `pitcher`, `pitch_type`, `pitch_name`, `game_type`, `balls_strikes` — worth ~1 GB and ~24% of per-row index-write cost, all gated on `pg_stat_user_indexes.idx_scan` first. (inferred — *verify*)
- **A failed `CREATE INDEX CONCURRENTLY` leaves an invalid index: full write cost, blocks HOT, returns nothing — and a low `statement_timeout` is its most common cause.** With an 8s cap on `authenticator`, assume it has happened here until proven otherwise. (documented)
- **Keeping an index is a recurring tax; dropping is a one-time reversible bet** — reversible only if you saved the DDL first. Save the DDL first. (inferred)

---

## 1. The number that governs everything

| Metric | Value |
|---|---|
| Rows / total size / index size | 8.89M / 9.7 GB / **4.8 GB (≈49%)** (measured) |
| Implied heap | ~4.9 GB → ~640k pages → **~14 rows/page** (derived) |
| Indexes / per index | **29** / ~165 MB, ~20 B per row (measured, derived) |

Twenty bytes is an unremarkable `(key, TID)` pair. The problem is paying it **29 times per row**, across 29 relations with 29 root-to-leaf descents, 29 buffer working sets, 29 WAL streams.

`applyStuffPlusForDateRange` (`app/api/update/route.ts:306`) issues one statement per day:

```sql
UPDATE pitches p SET stuff_plus = GREATEST(0, LEAST(200, ROUND( … )))
FROM pitch_baselines b
WHERE p.pitch_name = b.pitch_name AND p.game_year = b.game_year
  AND p.game_date = '2026-08-10' AND p.release_speed IS NOT NULL
```

One column changes. That column is indexed. So: no HOT → new heap tuple → new TID → **new index entries in all 29 indexes**, including the 28 whose keys did not change. Postgres has no per-index update path. (The WARM proposal would have changed this. It was never merged.)

| Window | Rows | Index-tuple insertions | Outcome |
|---|---|---|---|
| 1 day | ~4,000 | ~116,000 | ~1.4s — comfortable |
| ~2 days | ~8,000 | ~232,000 | passes, near the edge |
| ~2.75 days | ~11,000 | ~319,000 | **times out at 8s** |
| 3 days (old code) | ~12,000 | ~348,000 | **timed out; killed Stuff+ silently for 3 months** |

4k rows in 1.4s is ~2,860 rows/s; 11k fails inside 8s, i.e. <1,375 rows/s. Per-row throughput falls as the statement grows — page splits, buffer eviction, and full-page-image WAL compound. (measured thresholds; inferred mechanism — confirm with `EXPLAIN (ANALYZE, BUFFERS)`, `01-query-planning-explain.md`)

**Rule:** the rows you can move per statement is not a property of the row count. It is `rows × indexes × superlinear_penalty`. Budget **~4,000 rows per statement** on `pitches`, and re-measure when the index set or table size changes.

---

## 2. Index types, and which ones matter here

| Type | Supports | IOS | Verdict for `pitches` |
|---|---|---|---|
| **B-tree** | `< <= = >= >`, `BETWEEN`, `IN`, `IS NULL`, anchored `LIKE` | yes | The only type that belongs; all 29 are B-trees |
| **Partial** | as above, over a subset | yes | Great on skewed nullability — HOT hazard (§4) |
| **Covering (`INCLUDE`)** | keys searchable; payload returned only | yes | In use (`idx_pitches_year_name_loc`) |
| **Expression** | `f(col)` | yes | Underused; also carries planner statistics |
| **Hash** | `=` only, single column | **no** | Skip — lossy, unshrinkable, no ordering |
| **GIN** | `@> <@ && =` on composites | **no** | Only for `jsonb`/array/FTS columns |
| **BRIN** | `< <= = >= >` | no | One real case, below |

**Covering.** `INCLUDE` adds payload columns that satisfy an index-only scan without widening the search key or the uniqueness scope. `idx_pitches_year_name_loc` took `/api/pitch-area-stats` from **~3s → ~5 ms warm / ~600 ms cold**. Cost: **B-tree deduplication is never used on `INCLUDE` indexes** — the posting-list compression that has kept low-cardinality B-trees small since PG 13 is disabled outright, and `(game_year, pitch_name, …)` is exactly the repetitive shape it targets. Correct here because the alternative was 600× worse; not free.

**Partial.** The canonical win is a mostly-NULL column: Haki Benita took a >99%-NULL foreign-key index from **769 MiB to <5 MiB**, part of 20 GiB freed. Triton does this for batted balls (`WHERE bb_type IS NOT NULL`, ~30% of rows). The planner uses a partial index only when it can prove the query's `WHERE` implies the predicate — plan-time syntactic matching, and **parameterized queries do not work**. `run_query`/`run_mutation` interpolate literals, so that trap is dodged for free. `idx_pitches_events` is the unexploited candidate: `events` is set only on the terminal pitch of a plate appearance. *(verify `null_frac` in `pg_stats`.)*

**BRIN.** Min/max summary per block range instead of an entry per row — far smaller, but lossy (the executor rechecks every tuple in a candidate range) and useful only when the column correlates with physical order. `pitches` is append-only by date, so a BRIN on `game_date` would be a few MB against `idx_pitches_game_date`'s ~165 MB. **Do not swap them:** the recheck is fine for a month, terrible for one day, and **autosummarization is off by default**, so a BRIN on a live append table degrades between vacuums. A candidate for cold seasons after partitioning (`06-partitioning-large-tables.md`), not a B-tree replacement. (documented + inferred)

---

## 3. Column ordering and the leftmost-prefix rule

A multicolumn B-tree sorts by column 1, then column 2 within ties — a phone book by surname then given name.

- **Equality on leading columns + a range on the first non-equality column bounds the scan.** Everything after that filters rows the index already returned: saves heap fetches, not index pages.
- `(a, b, c)` serves `(a)`, `(a, b)`, `(a, b, c)`; **not** `(b)` or `(c)` alone. So **a single-column index on `a` is structurally redundant with any index whose leading column is `a`** — modulo size (§6.2).
- Postgres docs: use multicolumn indexes sparingly; **more than three columns is rarely helpful** unless the workload is highly stylized. `idx_pitches_seq` (5 cols) and `idx_pitches_movement` (4) are that exception — each built for one named query.
- **Version caveat:** PG 18 added B-tree **skip scan**, usable on non-leading columns when the leading column has few distinct values. Check `SHOW server_version` first. *(verify)*

**Ordering heuristic, in precedence order:** (1) equality columns before range columns — a range ends the useful prefix; (2) among equality columns, most-frequently-filtered first; (3) prefer the ordering that lets one index replace two; (4) selectivity, a distant fourth — it changes cost, not usability. "Most selective column first" is folklore relative to rules 1–2.

---

## 4. Write amplification, HOT, and the fillfactor arithmetic

MVCC never updates in place: a new version gets a new TID and every index must learn it. **HOT** is the escape hatch — when no indexed column changed *and* the page has room, the new version chains on the same page behind a redirect line pointer and **no index is touched at all**. Adyen: with 10 indexes an ordinary update writes 11 pages, a HOT update writes 1. Their 50 TB production result, fillfactor 100 → 85 on two tables:

| Metric | ff 100 | ff 85 |
|---|---|---|
| HOT update ratio | 63.9% | **92.2%** |
| Peak dead rows | ~70M | ~40M |
| Daily WAL | 3.15 TB | 2.80 TB |

A **10% cluster-wide WAL reduction** from a storage parameter. That is the prize when HOT is reachable.

**Why it is unreachable here.** *Blocker 1:* `stuff_plus` is an indexed column — `idx_pitches_stuff_plus` keys on it, so HOT fails non-negotiably while that index exists. *Blocker 2:* it is also a partial-index **predicate** column, which is worse — Postgres counts "columns tested in a partial-index predicate" as indexed for HOT, and Samokhvalov isolates that effect at 99.85% → 0%. *Blocker 3, the one that closes the door:* drop the index and HOT still needs free space. At ~14 rows/page with default `fillfactor = 100` there is none; `fillfactor = 90` frees ~800 B ≈ **1.4 rows** per page. But the UPDATE rescores an entire game date and ingest is append-ordered by date, so essentially *every* row on a freshly-written page is in the update set. You need headroom for all ~14 — `fillfactor ≈ 50`, roughly **+4.9 GB of heap** on a database already under disk pressure.

**Conclusion: HOT is structurally unreachable for a whole-day rescore of an append-ordered table. Stop trying to make the UPDATE cheap; stop doing the UPDATE.** Compute `stuff_plus` inside the ingest INSERT — the row and all 29 index entries are being written anyway, so the second pass disappears. Prior-night `pitch_baselines` suffice at insert time. (inferred — a design recommendation, not a measurement)

```sql
SELECT relname, n_tup_upd, n_tup_hot_upd, n_tup_newpage_upd,
       round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd, 0), 1) AS hot_pct, n_dead_tup
FROM pg_stat_user_tables WHERE relname IN ('pitches','milb_pitches','retro_events');
```

`n_tup_newpage_upd` (PG 16+) is the sharpest diagnostic — always non-HOT, because the successor landed on a different page: the fillfactor-starvation signature. Prediction for `pitches`: `hot_pct` near 0. *(verify — one query, never run.)*

---

## 5. Index-only scans are a VACUUM feature

An index-only scan skips the heap only when the visibility-map bit for the candidate row's page is set; otherwise Postgres visits the heap anyway. The docs: index-only scans win only when "a significant fraction of the table's heap pages have their all-visible map bits set."

Every batch UPDATE clears all-visible on the pages it touches, and `pitches` carried **1.44M dead tuples on 2026-08-11** right after a ~250k-row backfill — so a covering index built for index-only scans degrades to a plain index scan until autovacuum catches up. Two consequences: **VACUUM after every large remediation before measuring anything** (a benchmark on a freshly-updated table measures the visibility map, not the index — `05-vacuum-autovacuum-bloat.md`), and **`idx_tup_fetch` is not incremented by index-only scans**, so an index serving pure IOS shows `idx_scan > 0`, `idx_tup_fetch = 0` — do not read that as unused. `EXPLAIN (ANALYZE, BUFFERS)` prints `Heap Fetches:`; `Heap Fetches: 0` is the only proof.

---

## 6. Auditing the 29

```sql
SELECT s.indexrelname, pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
       s.idx_scan, s.idx_tup_read, s.idx_tup_fetch, i.indisvalid, pg_get_indexdef(s.indexrelid)
FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.relname = 'pitches' ORDER BY s.idx_scan, pg_relation_size(s.indexrelid) DESC;

SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();
```

`idx_scan` is meaningless without its epoch — capture both, and log the run in `docs/Queries.md` per repo convention.

### 6.1 Inventory and structural read

Names drop the `idx_pitches_` prefix. "→ drop N" points at the ranked list in §6.3.

| # | Index | Definition | Read |
|---|---|---|---|
| 1 | `pitches_pkey` | PK | Keep — constraint |
| 2 | *(unique)* | `(game_pk, at_bat_number, pitch_number)` | Keep — natural key, enforces dedup |
| 3 | `game_pk` | `(game_pk)` | **Exact prefix of #2** → drop 1 |
| 4 | `game_date` | `(game_date)` | Serves the Stuff+ UPDATE; removable if it gains a literal `game_year` (§7) |
| 5 | `game_year` | `(game_year)` | **Prefix of #6, #18, #24–29** → drop 2 |
| 6 | `year_date` | `(game_year, game_date DESC)` | Keep — workhorse date-range index |
| 7 | `pitcher` | `(pitcher)` | **Prefix of #8–10, #22** → drop 3. `idx_pitches_batter` went for this reason in June; this was missed |
| 8 | `pitcher_pitch` | `(pitcher, pitch_type)` | Most routes also filter `game_year` → drop 11 |
| 9 | `pitcher_stand` | `(pitcher, stand)` | `stand` is 50/50, ~1 bit → drop 10 |
| 10 | `pitcher_year_date` | `(pitcher, game_year, game_date)` | Keep — pitcher pages |
| 11 | `batter_date` | `(batter, game_date DESC)` | Superseded by #12 → drop 9 |
| 12 | `batter_year_date` | `(batter, game_year, game_date DESC)` | Keep — 182 ms → 34 ms |
| 13 | `away_date` | `(away_team, game_date DESC)` | Keep — deliberate June retention |
| 14 | `home_date` | `(home_team, game_date DESC)` | Keep |
| 15 | `balls_strikes` | `(balls, strikes)` | ~12 combos over 8.9M rows → drop 6 |
| 16 | `events` | `(events)` | Low cardinality **and** mostly NULL → drop 12 (make partial) |
| 17 | `game_type` | `(game_type)` | 5 values, `'R'` ≈ 90%; 2nd col of #28/#29 → drop 5 |
| 18 | `movement` | `(game_year, p_throws, pitch_type, release_speed)` | Keep — 3 equality + trailing range |
| 19 | `pitch_name` | `(pitch_name)` | ~18 values, `FF` ≈ 35% → drop 7 |
| 20 | `pitch_type` | `(pitch_type)` | Same column, coded — redundant with #19 → drop 4 |
| 21 | `player_name` | `(player_name)` | Matchup route moved to the 4k-row `players` table → drop 8 |
| 22 | `seq` | `(pitcher, game_year, game_pk, at_bat_number, pitch_number)` | Keep — 5 cols, one named query |
| 23 | `stuff_plus` | `(stuff_plus) WHERE stuff_plus IS NOT NULL` | **The expensive one** (§4) |
| 24 | `year_batter_bb` | `(game_year, batter) WHERE bb_type IS NOT NULL` | Keep — good partial |
| 25 | `year_pitcher_bb` | `(game_year, pitcher) WHERE bb_type IS NOT NULL` | Keep |
| 26 | `year_name_loc` | `(game_year, pitch_name, plate_x, plate_z) INCLUDE (p_throws, stand)` | Keep — 3s → 5 ms |
| 27 | `year_name_throws_stand` | `(game_year, pitch_name, p_throws, stand)` | 2-col prefix shared with #26 → drop 13 (test first) |
| 28 | `year_type_batter` | `(game_year, game_type, batter)` | Keep |
| 29 | `year_type_pitcher` | `(game_year, game_type, pitcher)` | Keep |

### 6.2 The honest counter-argument

A narrow single-column index is smaller and lighter on cache than the composite that subsumes it, so a plan needing only `game_year` could win on I/O. On this table it loses anyway: a season is ~700k of 8.9M rows (~8% selectivity), where the planner picks a bitmap or sequential scan. The prefix argument holds — but it is a judgement, not a theorem, which is why every drop is gated on `idx_scan`. (inferred)

### 6.3 Prioritized drop candidates

**Nothing here gets dropped without first confirming `idx_scan` and the `stats_reset` epoch.** Structural analysis, from definitions, not usage. *(verify all.)*

| Rank | Index | Reason | Confidence |
|---|---|---|---|
| 1 | `game_pk` | Exact prefix of an undroppable unique index | Very high |
| 2 | `game_year` | Prefix of 8+ composites | Very high |
| 3 | `pitcher` | Prefix of 4 composites; sibling dropped in June | Very high |
| 4 | `pitch_type` | ~18 values; duplicates `pitch_name` semantically | High |
| 5 | `game_type` | 5 values, 90% skew; 2nd col of two composites | High |
| 6 | `balls_strikes` | 12 combos over 8.9M rows | High |
| 7 | `pitch_name` | ~18 values, 35% modal | High |
| 8 | `player_name` | Route already migrated to `players` | Medium |
| 9 | `batter_date` | Superseded by `batter_year_date` | Medium |
| 10 | `pitcher_stand` | `stand` adds ~1 bit of selectivity | Medium |
| 11 | `pitcher_pitch` | Superseded by year-scoped composites | Medium |
| 12 | `events` | Convert to partial rather than drop | Medium |
| 13 | `year_name_throws_stand` | Only if consolidated into #26 and re-`EXPLAIN`ed | Low |

Ranks 1–7 at ~165 MB average are on the order of **~1 GB of storage and 7 of every 29 index writes** — about a 24% cut to write amplification on every non-HOT write. *(verify — narrow single-column indexes run below average, `player_name` well above.)*

### 6.4 Detecting redundancy mechanically

Postgres-checkup's redundant-index query (source 17) compares `pg_index.indkey` prefixes within an access method. Caveats it does not handle, which you apply by hand: unique/constraint-backing indexes are excluded (undroppable concurrently anyway); partial indexes compare only when predicates match **exactly**; operator classes and collations must match or the prefix is not a prefix; **`INCLUDE` columns are unmodelled** (an open TODO upstream); and expression indexes carry planner statistics, so pganalyze warns that dropping one can regress plans even at `idx_scan = 0` — replace with `CREATE STATISTICS`.

### 6.5 Invalid indexes — check this first, it is free

```sql
SELECT indexrelid::regclass AS index_name, indisvalid, indisready
FROM pg_index WHERE NOT indisvalid;
```

An invalid index is the worst object in a database: **full write cost, zero read benefit.** postgres.ai showed they accumulate B-tree leaf items on every INSERT/UPDATE, are still processed by VACUUM, still generate WAL, and **still block HOT** — 96.8% HOT → 0% purely from an invalid index covering the updated column. Since a low `statement_timeout` is the most common cause of a failed CIC, and `authenticator` here carries 8s, **assume this has happened at least once** until the query says otherwise.

---

## 7. `CREATE INDEX CONCURRENTLY` and the economics of dropping

CIC allows reads *and* writes during the build, at the price of **two table scans in separate transactions**, two waits for concurrent transactions to drain, no transaction block, parallel workers on the first scan only, no support on partitioned tables — and, on failure, **an invalid index left behind** where a plain `CREATE INDEX` would have rolled back cleanly. Failure modes: statement/lock timeout, deadlock, disk exhaustion, and — for unique indexes — a violation found during the second scan, after which the invalid index *keeps enforcing uniqueness* while being useless for reads.

Triton-specific: run DDL from the SQL editor or a direct `postgres` connection, **never through `run_mutation`** (it accepts INSERT/UPDATE/DELETE only, and the 8s cap would guarantee an invalid index — `scripts/create-pitch-area-stats-indexes.sql:15` already warns about transaction wrapping). Raise `maintenance_work_mem`. Budget disk for the finished index *plus* the in-progress build (`11-capacity-storage-planning.md`). Verify `indisvalid` as the last line of every script.

**The economics.** *Keeping* is recurring and invisible: ~20 B/row of storage; an extra index insertion plus WAL on every non-HOT write; an extra relation per autovacuum index-cleanup pass; cache occupancy competing with the heap (Percona degraded at 99.7% cache hits — warmth does not save you); planner work proportional to the candidate set on every compile. *Dropping* is one-time and bounded: a plan regression on a query you didn't know about, and a CIC rebuild if you're wrong — **provided you saved `pg_get_indexdef()` first.** The asymmetry favours dropping: *save the DDL, drop concurrently, watch for a week, rebuild if wrong* — not *leave it, just in case*.

**Test before committing.** Simulate the drop and roll it back:

```sql
BEGIN;
DROP INDEX idx_pitches_game_year;     -- ACCESS EXCLUSIVE, but rolled back
EXPLAIN (ANALYZE, BUFFERS) SELECT …;  -- the queries you're worried about
ROLLBACK;
```

Run off-hours, keep it short, run as `postgres`. `authenticator`'s 8s `lock_timeout` means anything blocked aborts rather than queues — the safe failure. Then do it for real with `DROP INDEX CONCURRENTLY`: one index per statement, no `CASCADE`, not in a transaction block, never on a constraint-backing index.

Two structural changes worth more than any drop: **score `stuff_plus` at INSERT time**, and **add a literal `game_year` to any remaining date-scoped UPDATE** — `p.game_date = '2026-08-10' AND p.game_year = 2026` lets `idx_pitches_year_date` serve it, which makes `idx_pitches_game_date` droppable. Confirm with `EXPLAIN` that the planner switches (`04-bulk-write-patterns.md`).

---

## 8. What Triton should do, in order

1. **Run the invalid-index check (§6.5) today.** One query, zero risk, and the 8s cap makes a past CIC failure genuinely likely.
2. **Capture the full inventory with `idx_scan` and `stats_reset` (§6).** Without the epoch, `idx_scan = 0` is uninterpretable.
3. **Run the HOT-ratio query (§4).** Prediction: `hot_pct ≈ 0`, `n_tup_newpage_upd ≈ n_tup_upd`. Never measured — measure it and this doc stops being partly inferred.
4. **Move `stuff_plus` computation into the ingest INSERT.** Deletes the second write pass and the statement that caused the outage, making the 8s ceiling permanently irrelevant to Stuff+. Keep `applyStuffPlusForDateRange` as the *repair* path only, still one day per statement.
5. **Drop ranks 1–3 after confirming `idx_scan`.** Save `pg_get_indexdef()` into a rollback script first. `DROP INDEX CONCURRENTLY`, one statement each, off-hours. Then `VACUUM (ANALYZE) pitches` and re-measure the per-day Stuff+ timing — that number is the regression detector.
6. **Then ranks 4–7 a week later.** Two batches, not one, so any regression is attributable.
7. **Convert `idx_pitches_events` to `WHERE events IS NOT NULL`** — the 769 MiB → 5 MiB pattern on the last obviously-skewed column.
8. **Leave a detector behind.** Nightly: (a) assert no invalid indexes on `pitches`; (b) record per-day Stuff+ UPDATE duration and alert above **50% of the 8s budget** — the saturation signal that would have predicted the outage weeks early (`10-monitoring-postgres.md`); (c) snapshot `pg_stat_user_indexes` weekly so `idx_scan` deltas survive a stats reset.
9. **Re-run this audit whenever index count or table size moves materially.** Safe batch size is a function of `rows × indexes`; both drift.

**Anti-recommendation — do not lower `fillfactor` on `pitches` to chase HOT updates.** §4 has the arithmetic: at ~14 rows/page, with the Stuff+ UPDATE touching essentially every row on each freshly-written page, you would need `fillfactor ≈ 50` — roughly **+4.9 GB of heap** on a volume already under disk pressure, to optimize a statement that should not exist. Adyen's 10% WAL win is real for *scattered single-row updates on a table with spare page capacity*. `pitches` is neither. Eliminate the UPDATE instead.

**Second anti-recommendation — do not "drop all 29 and rebuild what hurts."** Rebuilding a wide composite on 8.9M rows is a CIC run needing disk headroom you may not have, and you would spend a week discovering which pages got slow. Two small attributable batches beat one heroic one.

---

## Sources

1. PG docs — [Index Types](https://www.postgresql.org/docs/current/indexes-types.html) — operators per access method.
2. PG docs — [Multicolumn Indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html) — leftmost prefix; ">3 cols rarely helpful"; PG 18 skip scan.
3. PG docs — [Index-Only Scans / Covering](https://www.postgresql.org/docs/current/indexes-index-only-scans.html) — visibility-map dependency; `INCLUDE`.
4. PG docs — [Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html) — plan-time predicate implication; no parameterized queries.
5. PG docs — [Heap-Only Tuples](https://www.postgresql.org/docs/current/storage-hot.html) — the two HOT conditions; fillfactor.
6. PG docs — [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html) — CONCURRENTLY two-scan protocol; invalid index on failure.
7. PG docs — [DROP INDEX](https://www.postgresql.org/docs/current/sql-dropindex.html) — CONCURRENTLY locks and restrictions.
8. PG docs — [B-Tree Indexes](https://www.postgresql.org/docs/current/btree.html) — dedup (PG 13); bottom-up deletion (PG 14); "never with INCLUDE."
9. PG docs — [BRIN](https://www.postgresql.org/docs/current/brin.html) — correlation, lossy recheck, autosummarize off by default.
10. PG docs — [GIN](https://www.postgresql.org/docs/current/gin.html) — fastupdate pending list; update-vs-search tradeoff.
11. PG docs — [Hash Index Implementation](https://www.postgresql.org/docs/current/hash-index.html) — equality-only, lossy, no IOS.
12. PG docs — [Monitoring Statistics](https://www.postgresql.org/docs/current/monitoring-stats.html) — `idx_scan`/`idx_tup_fetch`; `n_tup_hot_upd`/`n_tup_newpage_upd`.
13. Percona — [The Hidden Cost of Over-Indexing](https://www.percona.com/blog/benchmarking-postgresql-the-hidden-cost-of-over-indexing/) — 7 idx 1,400 TPS vs 39 idx 600 TPS at >99.7% cache hits.
14. Percona — [PostgreSQL Indexes Can Hurt You](https://www.percona.com/blog/postgresql-indexes-can-hurt-you-negative-effects-and-the-costs-involved/) — per-INSERT multiplier; resident index pages; autovacuum cost.
15. PostgresAI — [Why Keep Your Index Set Lean](https://postgres.ai/blog/20251110-postgres-marathon-2-013-why-keep-your-index-set-lean) — six costs; B-tree pages never merge back.
16. PostgresAI — [Hidden Cost of Invalid Indexes](https://postgres.ai/blog/20260106-invalid-index-overhead) — full write cost; blocks HOT (96.8% → 0%).
17. PostgresAI — [How to Find Redundant Indexes](https://postgres.ai/docs/postgres-howtos/performance-optimization/indexing/how-to-find-redundent-indexes) — the postgres-checkup query and its caveats.
18. Adyen — [Write Amplification and HOT Updates](https://www.adyen.com/knowledge-hub/postgresql-hot-updates) — 11 pages vs 1; ff 85 raised HOT to 92.2%; ~10% WAL cut.
19. Samokhvalov — [Partial Indexes and UPDATE Performance](https://medium.com/@samokhvalov/how-partial-indexes-affect-update-performance-in-postgres-d05e0052abc) — predicate columns count as indexed: 99.85% → 0% HOT.
20. Haki Benita — [Freeing 20 GB of Unused Index Space](https://hakibenita.com/postgresql-unused-index-size) — 769 MiB → <5 MiB partial; `null_frac` detection.
21. pganalyze — [Unused Indexes check](https://pganalyze.com/docs/checks/schema/index_unused) — 35-day window; exclusions; expression-index caveat.
22. pganalyze — [Index Advisor 3.0](https://pganalyze.com/blog/index-advisor-v3) — avoids indexes on updated columns to preserve HOT.
23. Crunchy Data — [Checking for PostgreSQL Bloat](https://www.crunchydata.com/blog/checking-for-postgresql-bloat) — `pgstattuple` vs estimation (missed ~4× the waste).
24. Use The Index, Luke — [Concatenated Keys](https://use-the-index-luke.com/sql/where-clause/the-equals-operator/concatenated-keys) — ordering model; most-frequently-filtered first.

**Triton-internal evidence (measured 2026-08-11):** sizes and the 8k/11k threshold from `Jo/context/triton-context.md`; the per-day Stuff+ fix and ~1.4s timing from `app/api/update/route.ts:294–352`; the June 2026 Tier-2 build, eight single-column drops, +57 MB net, 182 ms → 34 ms from `scripts/create-tier2-indexes.sql` and `planning.md`; the covering-index result (3s → 5 ms warm, built 2026-06-02 at 7.7M rows) from `scripts/create-pitch-area-stats-indexes.sql`.

**Siblings:** `01-query-planning-explain.md` (reading `Heap Fetches`), `04-bulk-write-patterns.md` (chunk sizing, keyset paging), `05-vacuum-autovacuum-bloat.md` (visibility map, bloat, `REINDEX CONCURRENTLY`), `10-monitoring-postgres.md` (what to alert on).
