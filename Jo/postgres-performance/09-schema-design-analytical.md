---
title: Schema Design for Analytical Workloads — Row Width, Alignment, and TOAST
domain: postgres-performance
tags:
  - schema-design
  - column-types
  - alignment-padding
  - tuple-layout
  - toast
  - null-bitmap
  - denormalization
  - jsonb
sources_reviewed: 23
last_updated: 2026-08-11
---

# Schema Design for Analytical Workloads — Row Width, Alignment, and TOAST

## TL;DR

- **On a row store the only physical quantity that matters for a scan is rows-per-page.** Postgres reads 8 kB whether you wanted 3 columns or 90. Every decision below reduces to that number. (documented)
- **Column ordering is worth ~20% of the heap and it is free.** 300k rows alternating `int8, int4` measured **5,770 pages**; identical columns ordered widest-first measured **4,616** — 51.99 → 64.99 rows/page, seq scans hitting exactly 5,770 vs 4,616 buffers. pganalyze reports 135 → 112 MB, Braintree ~10% fleet-wide, GitLab 610 MB on one 80M-row table. (measured + documented)
- **`double precision` for sensor measurements is the most expensive habit in analytical schemas.** 200k rows × 20 measurement columns: `float8` = **4,928 pages / 40.6 rows per page**; the same data as `real` = **2,880 / 69.4** — **41.6% smaller**. TrackMan and Statcast carry 3–4 significant figures; `real` guarantees ≥6 decimal digits. (measured, documented)
- **`numeric` in a hot analytical column is a CPU tax, not a storage tax.** 2M rows, identical 12,800 pages and buffers: `sum()+avg()` took **4,889 ms on `numeric` vs 2,001 ms on `float8`** — 2.4×. **`pitches.stuff_plus` is `numeric`.** (measured, documented)
- **NULLs are nearly free, but the *first* one costs the whole bitmap.** `pitches` has 121 columns → a 16-byte bitmap on every row and `t_hoff` = MAXALIGN(23+16) = **40 bytes** before a single value. Its 35 mostly-NULL columns cost bits, not bytes. And **dropping an unused column reclaims nothing** — the docs: "dropped columns also count toward the maximum column limit, and their null bitmaps occupy additional space." (documented + measured)
- **TOAST fires on the tuple, not the column, at ~2 kB.** Triton's encrypted Whoop `raw_data` averages **1,207 bytes** stored (max 1,246) and every `whoop_*` TOAST relation is **8,192 bytes — empty**. Nothing is out of line; headroom is ~40%. (measured)
- **Encrypted blobs defeat TOAST compression, measurably.** On sampled `whoop_sleep` rows `pg_column_size(raw_data)` = **1,088–1,092 B** against `octet_length(raw_data::text)` of **932–941** — the stored form is *larger* than its text form. pglz needs ≥25% reduction to accept a result; AES-256-GCM in base64 has nothing to give. (measured + documented)
- **`pitches` costs 575.5 bytes of heap per live row against a ~440-byte ideal, and alignment is the small part of that gap.** Identifiable padding is ~15–20 B/row (~3%). The dominant term is **13.9% dead tuples** — 1.44M, last autovacuum **2026-05-17**. Reordering would not fix this table; VACUUM would. (measured + inferred)
- **Triton is already one-big-table and should stay that way.** The risk is not normalization — it is column creep, because adding a column is a one-line migration. (inferred)
- **This doc is prospective, not retroactive.** Rewriting a live 9.7 GB table with 29 indexes to save 3% is a bad trade. Rewriting `compete_pitches` — **47 `double precision` columns, 27 of them 100% NULL, `pitch_time` stored as `text`** — while it holds 443 rows is a free lunch. (inferred)

---

## 1. The physical unit of analytical cost is the page

Postgres is a row store with a fixed 8,192-byte page carrying a 24-byte header and a 4-byte line pointer per tuple, so `rows per page = (8192 − 24) / (MAXALIGN(tuple_size) + 4)`. Seq-scan time, cache hit rate, autovacuum duration, backup size, and the planner's seq-vs-index choice are all functions of that number. Triton runs `shared_buffers = 256MB` against a 4,872 MB `pitches` heap — **the working set is ~5% cacheable** — so row width converts directly into physical reads.

Measured, `pitches`: 623,662 pages, 8,877,621 rows, 4,872 MB heap, 4,833 MB indexes → **575.5 bytes of heap per live row, 14.23 live rows/page.** A full scan is 623,662 buffer reads; at the ~18.4 rows/page a clean rewrite would give (§7), ~483,000.

`HeapTupleHeaderData` is **23 bytes** (`t_xmin` 4, `t_xmax` 4, `t_cid` 4, `t_ctid` 6, `t_infomask2` 2, `t_infomask` 2, `t_hoff` 1), plus an optional null bitmap of `ceil(natts/8)` bytes, with `t_hoff` rounded to MAXALIGN (8 here). So `players` (6 cols) pays 24 bytes of header, `retro_events` (59) pays 32, and `compete_pitches` (79) and `pitches` (121) both pay **40** — 7% of a `pitches` row before a single measurement is stored. That is the price of 121 columns.

---

## 2. Column types and what they cost

Measured on Triton (PG 17.6, aarch64) via `pg_column_size(row(x)) - 24`:

| Type | Bytes | `typalign` | Notes |
|---|---|---|---|
| `boolean` | 1 | c (1) | no alignment requirement |
| `smallint` | 2 | s (2) | |
| `integer` / `real` / `date` | 4 | i (4) | `real` ≥6 decimal digits |
| `bigint` / `double precision` | 8 | d (8) | `float8` ≥15 digits |
| `timestamp` / `timestamptz` | 8 | d (8) | **identical size** |
| `uuid` | 16 | **c (1)** | never needs padding |
| `numeric` | 5–7 typical | i (4) | 2 B per 4 digits + 3–8 B overhead |
| `text` / `varchar(2)` / `char(2)` `'FF'` | 3 | i (4) | **byte-identical** |

### 2.1 `real` vs `double precision`

200,000 rows, `id int4` plus 20 measurement columns:

| Layout | `relpages` | Rows/page | Heap |
|---|---|---|---|
| 20 × `double precision` | 4,928 | 40.58 | 39 MB |
| 20 × `real` | **2,880** | **69.44** | **23 MB** |

**41.6% fewer pages, 71% more rows per page**, same data. The precision argument is settled by the source, not by taste: a release speed is `92.4`, a spin rate is `2438`, an induced vertical break is `16.7`. The *sensor* does not carry 15 significant figures, so `float8` stores measurement noise at 8 bytes apiece. Statcast already agrees — `pitches` uses `real` for 96 of its 99 fixed 4-byte columns. **`compete_pitches` does not: 47 of its 79 columns are `double precision`**, and it holds 443 rows.

### 2.2 `numeric` is a CPU decision

2,000,000 rows in one table, 12,800 pages, the same values stored as three types — identical buffer counts, so identical I/O:

| Aggregate | Time |
|---|---|
| `sum(v_num), avg(v_num)` — `numeric(6,2)` | **4,889 ms** |
| `sum(v_f4), avg(v_f4)` — `real` | 2,485 ms |
| `sum(v_f8), avg(v_f8)` — `float8` | **2,001 ms** |

**2.4× slower for identical rows and pages.** The docs: "calculations on `numeric` values are very slow compared to the integer types, or to the floating-point types" — it is software arbitrary-precision arithmetic where floats use the FPU. Crunchy measures ~3× on a division benchmark.

`pitches.stuff_plus` is `numeric` with `avg_width` 5 — ~1 byte more than `real`, irrelevant. What is not: every leaderboard, `league_averages` refresh, percentile computation, and dashboard aggregate over Stuff+ pays this tax on up to 6.3M non-NULL values. Stuff+ is a normalized index centred on 100 with one or two decimals of meaning; it has no business being exact-decimal.

**Honest caveat:** `ALTER COLUMN stuff_plus TYPE real` rewrites 4.9 GB *and all 29 indexes* under `ACCESS EXCLUSIVE`, needs ~double the table size in free disk, and under an 8s `lock_timeout` will not acquire the lock through an RPC at all. See §8.4.

### 2.3 Strings and timestamps

`text`, `varchar(2)`, and `char(2)` holding `'FF'` all occupy 3 bytes; the docs confirm "no performance difference among these three types." The rule that *does* matter is the varlena header: **strings ≤126 bytes carry a 1-byte header and need no alignment padding; longer strings carry 4 bytes and must start on a 4-byte boundary** — which is why text→fixed-width transitions are where padding appears (§3.3). Use `text` plus a `CHECK` if you need a length rule.

`timestamptz` and `timestamp` are both 8 bytes; `timestamptz` stores a UTC instant, `timestamp` a wall-clock reading with no instant attached. For anything that *happened*, `timestamptz` is correct at zero extra cost. **`compete_pitches.pitch_time` is `text`** — variable width instead of 8 fixed bytes, no range-scan-friendly ordering, no defense against a TrackMan export changing format. (As-of and timezone *semantics* are Li's lane; the *type* is Jo's.)

---

## 3. Alignment padding and column order

Postgres pads before a datum so it begins on its type's boundary, so **the declared order of columns changes the size of the table** with no change to the data.

### 3.1 The measured result

Identical columns, 300,000 rows. `_jo_align_bad` alternates `int8, int4` eight times; `_jo_align_good` declares all eight `int8` then all eight `int4`.

| | `relpages` | Rows/page | Heap | Seq-scan buffers |
|---|---|---|---|---|
| interleaved | 5,770 | 51.99 | 45 MB | 5,770 |
| widest-first | **4,616** | **64.99** | **36 MB** | **4,616** |
| delta | **−20.0%** | +25% | −9 MB | **−20.0%** |

The arithmetic checks out. Interleaved, each `int4` followed by an `int8` forces 4 bytes of padding: 8 × (8+4+4) = **128 B**. Grouped: 8×8 + 8×4 = **96 B**. Header `MAXALIGN(23)` = 24 (no NULLs, no bitmap). Predicted rows/page 8168/156 = 52.4 and 8168/124 = 65.9, against 51.99 and 64.99 measured.

**Honest caveat: this buys buffers, not necessarily milliseconds.** Execution time was **128.5 ms (bad) vs 137.6 ms (good)** — the "worse" table was nominally faster, because one run recruited a parallel worker and the other did not, and both were fully cached. The saving is real and it is in I/O; it converts to wall-clock only when you are I/O-bound. Triton *is*, on its big tables — but quote 20% fewer buffers, less disk, less to back up, less for autovacuum to walk. Not "20% faster queries."

### 3.2 The ordering rule

Descending by alignment, then width, variable-length last: (1) `d`-aligned 8-byte — `bigint`, `double precision`, `timestamptz`; (2) `i`-aligned 4-byte — `integer`, `real`, `date`; (3) `smallint`; (4) `c`-aligned — `boolean`, `char`, **`uuid`**; (5) variable-length — `text`, `numeric`, `jsonb`, arrays.

`uuid` is the trap: 16 bytes but `typalign = c`, so it never needs padding and can sit anywhere. Braintree's refinement is worth stealing — within a class, put `NOT NULL` and primary-key columns first, since attribute extraction walks the tuple left to right.

```sql
-- Generate the packed column order for any table
SELECT string_agg(quote_ident(a.attname), E',\n  ' ORDER BY
         CASE WHEN t.typlen = -1 THEN 2 ELSE 1 END,  -- varlena last
         t.typlen DESC,                              -- then widest first
         a.attnum)
FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
WHERE a.attrelid = 'public.compete_pitches'::regclass
  AND a.attnum > 0 AND NOT a.attisdropped;
```

### 3.3 Where padding actually appears in `pitches`

`pitches` is 1 × `int8`, 99 × 4-byte fixed, 21 varlena, ordered as the Savant CSV happened to be. Padding appears at each **varlena → fixed-width transition**: a short varlena ends at an arbitrary offset and the next `int4`/`real` must round up. Counting those in `attnum` order gives roughly **ten** — `pitch_type→game_date`, `player_name→batter`, `description→spin_dir`, `type→hit_location`, `bb_type→balls`, `inning_topbot→hc_x`, `sv_id→vx0`, `pitch_name→home_score`, `of_fielding_alignment→spin_axis`, `stuff_plus→miss_distance` — at 0–3 bytes each: **~15–20 bytes per row, about 3%.**

That is why §8 does *not* recommend reordering `pitches`. The textbook 20% win comes from interleaving 8-byte and 4-byte *fixed* types; `pitches` has exactly one 8-byte column, so it was accidentally well-behaved.

---

## 4. NULLs, the null bitmap, and dropped columns

The bitmap exists only if the row has at least one NULL, and it is `ceil(natts/8)` bytes — sized by the table's column count, not by how many NULLs the row has. **The first NULL costs the whole bitmap; every subsequent NULL is free.** And **a NULL fixed-width column stores nothing and needs no padding**, so a naive `sum(avg_width)` overstates reality — `pg_stats.avg_width` averages *non-NULL* values only. Weighting by presence gives the true payload:

| Table | `sum(avg_width)` | Null-weighted payload | Columns >70% NULL |
|---|---|---|---|
| `retro_events` | 1,165 | **1,104.6** | 8 |
| `compete_pitches` | 692 | **524.8** | 28 (27 are 100% NULL) |
| `pitches` | 540 | **397.6** | 35 |
| `milb_pitches` | 337 | **202.4** | 36 (28 are 100% NULL) |

`NOT NULL` only becomes a storage decision if it makes the row *fully* non-null, which a 121-column table never will. Choose it for data quality (→ `Jo/data-quality/03-constraint-design-postgres.md`), not space.

**`DROP COLUMN` reclaims nothing.** `pitches` carries **seven 100%-NULL legacy columns** (`spin_dir`, `spin_rate_deprecated`, `break_angle_deprecated`, `break_length_deprecated`, `tfs_deprecated`, `tfs_zulu_deprecated`, `umpire`). Dropping all seven takes 121 → 114 columns and the bitmap 16 → 15 bytes **only after a full rewrite** — 8.9 MB out of 4,872 MB. Do it for schema hygiene, not space. The ceiling is **1,600 columns**, further limited by fitting one 8 kB page; `pitches` is nowhere near it, but every added column widens the bitmap for every historical row and the cost is paid silently on rewrite.

---

## 5. TOAST, and why encrypted JSONB is a special case

When a tuple exceeds `TOAST_TUPLE_THRESHOLD` (**normally 2 kB**), Postgres compresses `EXTENDED`/`MAIN` attributes and, if still over, moves the largest out of line in ~2,000-byte chunks, leaving an 18-byte pointer in the heap. Strategies: `PLAIN`, `EXTENDED` (default), `EXTERNAL` (out-of-line, no compression), `MAIN`.

Two things get missed: **the threshold applies to the whole tuple, not a column** — a 900-byte JSONB in a narrow row stays inline, the same value in a 1.5 kB row is evicted — and **`toast_tuple_target` is settable per table** (minimum 128), the lever for deliberately pushing an archive column out of the heap so queries that never select it read a narrower table.

### 5.1 Triton's Whoop tables, measured

`lib/compete/whoop.ts:252,273,294` writes `raw_data: whoopEncrypt(JSON.stringify(...))` — an AES-256-GCM `iv:tag:ciphertext` string (all base64) from `lib/encryption.ts` — into a `jsonb` column.

| Table | Rows | avg `pg_column_size(raw_data)` | max | TOAST relation |
|---|---|---|---|---|
| `whoop_sleep` | 483 | **1,207 B** | 1,246 B | **8,192 B (empty)** |
| `whoop_cycles` | 489 | 952 B | 1,002 B | 8,192 B (empty) |
| `whoop_workouts` | 257 | 904 B | 982 B | 8,192 B (empty) |

Nothing is out of line — every payload sits in the heap, ~40% below the threshold. On five sampled `whoop_sleep` rows, `octet_length(raw_data::text)` vs `pg_column_size(raw_data)`: 932 → 1,088 (116.7%), 940 → 1,092 (116.2%), 941 → 1,092 (116.0%). **The stored form is consistently larger than the text form; compression is buying nothing.** (measured)

The mechanism (inferred, well-supported): AES-GCM ciphertext is computationally indistinguishable from random; base64 expands it 4/3; the only compressible structure left is that base64 uses 6 bits of every byte — a ceiling of 25% reduction. Triton's `default_toast_compression` is **`pglz`**, which **requires at least 25% reduction before accepting a compressed result**. The column sits exactly on the rejection boundary.

Two consequences. **Encryption roughly doubles the effective storage of a JSON archive** — you pay the base64 expansion *and* forfeit the compression plaintext JSON would have got. A real cost of the security posture, not a bug, but a known one (→ `11-capacity-storage-planning.md`). And **switching to `lz4` will not help**: lz4 only requires output ≤ input, so it attempts compression on every ciphertext and achieves nothing, at CPU cost. For incompressible columns the correct setting is `STORAGE EXTERNAL`, which skips the attempt.

### 5.2 The rule for archive columns

For a large, opaque, rarely-read payload — an encrypted API response, a C3D blob, a raw CSV row — keep it **out of the hot table**:

```sql
-- Preferred: separate table, joined only when needed
CREATE TABLE whoop_sleep_raw (sleep_id bigint PRIMARY KEY, raw_data text);

-- Or, if it must stay: force it out of line, skip pointless compression
ALTER TABLE whoop_sleep ALTER COLUMN raw_data SET STORAGE EXTERNAL;
ALTER TABLE whoop_sleep SET (toast_tuple_target = 256);
```

At 483 rows this is worth nothing today, and I won't pretend otherwise. It is worth writing down before `whoop_*` holds five years of daily rows for a roster, and before `biomech_throws` is designed with a marker-trajectory column on the hot table.

---

## 6. Wide table vs star schema, JSONB, and generated columns

For analytical reads, denormalized wide tables beat star schemas on latency (25–50% on Redshift/BigQuery/Snowflake, ~49% on BigQuery) and lose on flexibility and single-definition governance. Treat them as layers, not rivals.

**Triton is already, unambiguously, one-big-table** — correctly. `pitches` is a fact table at pitch grain with dimensions flattened in (`home_team`, `player_name`, `pitch_name` are denormalized strings, not FKs); queries are single-table scans on `pitcher`, `game_date`, `game_year`; and there is one operator, so star-schema governance solves a coordination problem Triton doesn't have. Do not normalize it. The genuine OBT risks are elsewhere, and both are live:

1. **Column creep.** 121 columns, 35 >70% NULL, 7 entirely dead — because adding a column is a one-line migration, and each widens the null bitmap for all 8.89M historical rows. The discipline needed is **a policy that new derived measures go in a side table keyed on the pitch**, the pattern `pitcher_season_command` and `pitcher_season_deception` already follow.
2. **Drift between wide tables.** `pitches` and `milb_pitches` are the same concept at two levels, already diverged in column set and in `events` casing — the "same measure computed in a dozen wide tables that quietly drift apart" failure the OBT critique names. → `Jo/data-quality/06-reconciliation-source-of-truth.md`.

**JSONB is for the tail, not the hot path** — optional attributes, varying shapes, raw payloads; promote a key to a real column the moment it becomes hot, typed, or reported on. And **JSONB is not compact**: measured here, a 4,361-character JSON document was 4,365 bytes as `text` and **7,046 bytes as `jsonb`**, 61% larger. If the payload is opaque and never queried into (Whoop `raw_data`, TrackMan `raw`), **`text` is correct and JSONB is a pure loss.**

**Generated columns: Triton is on PG 17, so STORED only.** `VIRTUAL` — computed at read, zero storage, no rewrite to add — landed in **PG 18** and is the default there; Triton runs **17.6**. A `STORED` column for `pfx_x_in` (today computed client-side in `fetchData`) would add ~34 MB, require a full rewrite, and be recomputed on every UPDATE touching its inputs, on a table where write amplification across 29 indexes is already the binding constraint. **Not worth it on `pitches`.**

---

## 7. Anatomy of `pitches`: where 575.5 bytes per row goes

Measured composition: **1** `bigint`, **99** fixed 4-byte columns, **21** varlena (20 `text` + 1 `numeric`).

```
Fully-populated, perfectly-packed payload
  bigint 8 + (99 × 4) 396 + varlena (avg widths) 136 = 540
  + t_hoff (23 + 16 → 40)                              40
  = 580 bytes   (every column present)

Average payload actually present  Σ avg_width × (1 − null_frac) = 397.6
  + t_hoff 40  ≈ 438 → MAXALIGN → 440 bytes/row ideal
               → 8168 / 444 = 18.4 rows/page
```

Against that, measured: **14.23 live rows/page, 575.5 bytes per live row.** The ~135-byte gap decomposes:

| Contributor | Estimate | Grade |
|---|---|---|
| Dead tuples (1,437,923 of 10.33M physical = 13.9%) | ~68 B/row | measured |
| Alignment padding (~10 varlena→fixed transitions) | ~15–20 B/row | inferred |
| Page free space, fillfactor, `pg_stats` sampling error | remainder | inferred |

**Column reordering is not the problem here** — ~3%; `pitches` dodged the classic interleaving penalty by having exactly one 8-byte column. **The dead tuples are.** 13.9% dead, and **`last_autovacuum` was 2026-05-17 — nearly three months ago** — on a table taking a nightly upsert plus periodic backfills. That is ~680 MB of heap holding nothing. A vacuum finding surfaced by a schema audit; it belongs to `05-vacuum-autovacuum-bloat.md`, and it is a bigger, cheaper win than anything in this document.

**`retro_events`, the wider case:** 14,915,507 rows, 59 columns, 17 GB heap over 2,225,874 pages → **1,222.5 bytes/row, 6.70 rows/page**, against a null-weighted payload of 1,104.6 and only **1.3% dead tuples**. It is clean — ~10% overhead including a 32-byte header — just genuinely wide, and any full scan is 2.2M buffer reads against 256 MB of cache. This is the table where **partitioning**, not repacking, is the answer: immutable, time-ordered from 1914, almost always queried by era (→ `06-partitioning-large-tables.md`). That migration is also the *only* cheap moment to fix column order and types, because the data is being rewritten anyway.

---

## 8. What Triton should do, in order

1. **Fix `compete_pitches` now, while it holds 443 rows.** 47 `double precision` → `real`; `pitch_time` `text` → `timestamptz`; `raw jsonb` → side table or `text`; drop the 27 columns that are 100% NULL unless a TrackMan export populates them; emit the column list in packed order via §3.2. Update `docs/VARIABLES.md` in the same commit.

2. **Write these rules into `biomech_throws` before it exists.** Kinematic series `real`; capture timestamps `timestamptz`; marker trajectories and C3D payloads in a side table or object storage, never on the throw-grain table; 8-byte types first, varlena last.

3. **VACUUM `pitches`.** 1.44M dead tuples, no autovacuum since 2026-05-17 — ~680 MB recoverable for one statement. **Blast radius:** plain `VACUUM` takes `SHARE UPDATE EXCLUSIVE` and blocks neither reads nor writes, but runs for many minutes and cannot go through `run_mutation` under the 8s cap — use a direct session. Do **not** use `VACUUM FULL`: `ACCESS EXCLUSIVE` plus ~4.9 GB of free disk to rewrite into.

4. **Convert `pitches.stuff_plus` to `real` — as a new column, not an `ALTER TYPE`.** `ALTER COLUMN TYPE` rewrites 4.9 GB plus 29 indexes under `ACCESS EXCLUSIVE` and will not survive the 8s `lock_timeout`. Instead: add `stuff_plus_r real`, backfill in date chunks (the ~4k-rows-per-day pattern proven by `applyStuffPlusForDateRange`), cut readers over, drop the old column. Reversible, no outage.

5. **Adopt the side-table policy** for new derived measures (§6). 121 columns, 35 mostly NULL, is what happens without it.

6. **Set the archive-column pattern for `whoop_*` now; apply it when the tables get big** — `text` in a side table, or `STORAGE EXTERNAL` + `toast_tuple_target = 256` in place. Fold column ordering into the `retro_events` partition migration if that happens, never as a standalone project.

7. **Leave a detector behind.** A weekly assertion over `pg_stat_user_tables` flagging any table where `n_dead_tup / (n_live_tup + n_dead_tup) > 0.15` or `last_autovacuum` is older than 30 days, routed through `reportError`. Three months of un-vacuumed `pitches` should not have needed a schema audit to surface.

**Anti-recommendation: do not reorder or rewrite `pitches` for alignment.** Identifiable padding is ~15–20 B/row (~3%). Capturing it means rewriting a 4,872 MB heap and rebuilding 4,833 MB of indexes — `ACCESS EXCLUSIVE`, ~10 GB of transient free disk on an instance already carrying ~35 GB, under an 8s `lock_timeout`. The payoff is smaller than a single VACUUM and the risk is an unavailable primary table. **Column ordering is a discipline for tables you are creating, and a free rider on rewrites you are already doing for another reason. It is never, by itself, a reason to rewrite a live table.** Braintree reached the same conclusion: apply it at creation time via tooling; reorder existing tables only during a logical-replication cutover.

**Single highest-leverage next action:** rewrite `compete_pitches` with `real`, `timestamptz`, and packed column order while it still holds 443 rows.

---

## Sources

1. PostgreSQL — [Database Page Layout](https://www.postgresql.org/docs/current/storage-page-layout.html) — 24-byte page header, 4-byte item pointers, 23-byte tuple header, `t_hoff` MAXALIGN rule.
2. PostgreSQL — [TOAST](https://www.postgresql.org/docs/current/storage-toast.html) — threshold/target normally 2 kB, `toast_tuple_target`, the four storage strategies, 1-byte varlena header under 127 bytes.
3. PostgreSQL — [Numeric Types](https://www.postgresql.org/docs/current/datatype-numeric.html) — "calculations on `numeric` values are very slow"; `real` ≥6 digits, `float8` ≥15.
4. PostgreSQL — [Character Types](https://www.postgresql.org/docs/current/datatype-character.html) — "no performance difference among these three types"; ≤126-byte strings take a 1-byte header.
5. PostgreSQL — [Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html) — `timestamp`/`timestamptz` both 8 B; timestamptz stores UTC and discards the input zone.
6. PostgreSQL — [Generated Columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html) — STORED vs VIRTUAL, immutability restrictions.
7. PostgreSQL — [Appendix K: Limits](https://www.postgresql.org/docs/current/limits.html) — 1,600 columns; 18-byte TOAST pointer; **"dropped columns also count toward the maximum column limit, and their null bitmaps occupy additional space."**
8. Cybertec — [Type alignment and padding bytes](https://www.cybertec-postgresql.com/en/type-alignment-padding-bytes-no-space-waste-in-postgresql/) — alignment mechanics, widest-first ordering.
9. Percona — [Column Alignment and Padding](https://www.percona.com/blog/postgresql-column-alignment-and-padding-how-to-improve-performance-with-smarter-table-design/) — 32 vs 22 B/row; `pg_column_size(t.*) - 24`.
10. EDB — [Data Alignment in PostgreSQL](https://www.enterprisedb.com/postgres-tutorials/data-alignment-postgresql) — 126-char varchar = 127 B, 127-char = 131 B.
11. GitLab — [Ordering Table Columns](https://docs.gitlab.com/ee/development/database/ordering_table_columns.html) — events 48 → 40 B/row; **610 MB on 80M rows**.
12. pganalyze — [Reducing table size with optimal column ordering](https://pganalyze.com/blog/5mins-postgres-reducing-table-size) — **135 → 112 MB (20%)**; "column tetris."
13. PayPal / Braintree — [Saving Space (Basically) for Free](https://medium.com/paypal-tech/postgresql-at-scale-saving-space-basically-for-free-d94483d9ed9a) — **~10% fleet-wide**; reordering live tables needs a logical-replication cutover.
14. Atlas — [Optimal data alignment (PG110)](https://atlasgo.io/guides/postgres/pg-110) — 2M rows, 24 → 16 B/row.
15. Renato Ena — [Optimizing Postgres table layout](https://r.ena.to/blog/optimizing-postgres-table-layout-for-maximum-efficiency/) — 10M rows: heap 498 → 422 MB, index 386 → 300 MB.
16. Crunchy Data — [Choosing a PostgreSQL Number Format](https://www.crunchydata.com/blog/choosing-a-postgresql-number-format) — **~3× float-over-numeric on 10M divisions**.
17. Fujitsu FAST/ware — [LZ4 TOAST compression in PG 14](https://www.postgresql.fastware.com/blog/what-is-the-new-lz4-toast-compression-in-postgresql-14) — pglz 2.23 vs lz4 2.07; **"PGLZ requires a compression ratio of at least 25%."**
18. EDB — [Configurable LZ4 TOAST compression](https://www.enterprisedb.com/blog/configurable-lz4-toast-compression) — `default_toast_compression`.
19. Crunchy Data — [Using PostgreSQL for JSON Storage](https://www.crunchydata.com/blog/using-postgresql-for-json-storage) — "if you feel like you are struggling to make JSON work with Postgres, consider using a table instead."
20. sqlpad — [JSONB vs Columns](https://sqlpad.io/tutorial/postgresql-jsonb-vs-columns-performance-guide/) — promote hot/typed keys to columns.
21. dataarchitect.studio — [One Big Table vs the Star Schema](https://dataarchitect.studio/essays/one-big-table-vs-star-schema/) — OBT fails on rigidity, SCDs, measure drift.
22. CloudQuery — [3NF vs Star Schema](https://www.cloudquery.io/blog/explainer-3nf_vs_star-schema) — 25–50% wide-table advantage; ~49% on BigQuery.
23. depesz — [PG18 virtual generated columns](https://www.depesz.com/2025/02/28/waiting-for-postgresql-18-virtual-generated-columns/) — VIRTUAL is **PG 18** and default there. Corroborated by [Neon](https://neon.com/postgresql/18/virtual-generated-columns).

**Triton-internal evidence (measured 2026-08-11; PG 17.6 aarch64, `block_size` 8192, `default_toast_compression` = pglz, `shared_buffers` 256MB):** table geometry from `pg_class`; `typalign`/`typlen`/`avg_width`/`null_frac` from `pg_attribute` × `pg_type` × `pg_stats`; dead tuples from `pg_stat_user_tables`; three scratch experiments (`_jo_align_*`, `_jo_f8`/`_jo_f4`, `_jo_num`); per-type sizes from `pg_column_size(row(x)) - 24`; Whoop sizing from `pg_column_size(raw_data)` vs `octet_length(raw_data::text)`, encryption shape from `lib/encryption.ts` and `lib/compete/whoop.ts:252,273,294`. Full SQL in `docs/Queries.md`.

*Scratch tables `_jo_align_bad`, `_jo_align_good`, `_jo_f8`, `_jo_f4`, `_jo_num`, `_jo_p_actual`, `_jo_p_packed` were created for these measurements and must be dropped.* **(verify — cleanup was interrupted by a Supabase edge outage mid-session.)**
