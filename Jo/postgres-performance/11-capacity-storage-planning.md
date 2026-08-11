---
title: Capacity & Storage Planning — What Growth Costs and When the Volume Fills
domain: postgres-performance
tags:
  - capacity-planning
  - storage-growth
  - disk-headroom
  - retention
  - archival
  - compression
  - toast
  - supabase-pricing
sources_reviewed: 23
last_updated: 2026-08-11
---

# Capacity & Storage Planning — What Growth Costs and When the Volume Fills

## TL;DR

- **Every capacity claim in this repo is stale by roughly 4×.** `CLAUDE.md`, `Soto/context/triton-context.md:47` and `planning.md:115` describe an "8 GB Pro plan" under "disk pressure." The database measured **34,703,805,587 bytes — 32.3 GiB**. **8 GB is the *included allowance*, not the provisioned disk**, which isn't readable from SQL and must be confirmed in the dashboard *(verify — confirm with Trevor)*. (measured)
- **Five tables are 99.2% of the database:** `retro_events` 20.84 GB, `pitches` 10.18 GB, `milb_pitches` 2.48 GB, `retro_games` 467 MB, `pitch_videos` 451 MB = 34.42 GB of 34.70 GB. (measured)
- **Growth is not the risk; the base is.** `pitches` gains ~810k rows/season at 1,146.5 B/row → **0.91 GiB/yr**; the platform totals **~1.8 GiB/yr**, ~5.6% — a 13-year doubling time. (inferred)
- **Index growth is half of all growth on `pitches`, and a fifth of the index is dead.** Heap 575.5 B/row, 29 indexes 570.8 B/row; **9 of 29 have `idx_scan = 0` (~1.02 GB droppable)**. Dropping them also removes 9 index writes per row UPDATE — the amplification that broke Stuff+. (measured)
- **`retro_events` is 60% of the disk and has essentially never been read.** Lifetime **12 sequential scans**; its only busy index (15.1M scans) is the **ingest upsert probe**, not a query path. `event_type_idx`: **0 scans, 96 MB**. `batter_game_idx`: **2 scans, 378 MB**. (measured)
- **A full volume is much worse than "writes fail."** If `pg_wal` fills, Postgres **PANICs, shuts down, and refuses to restart until space is freed** — and cannot free it itself, because `VACUUM` writes WAL too. Deleting WAL by hand turns an outage into a restore-from-backup. (documented)
- **You cannot afford a `VACUUM FULL` on either big table.** It "requires extra disk space for the new copy" — ~9.5 GB for `pitches`, ~19.4 GB for `retro_events` — under `ACCESS EXCLUSIVE`, near the 90% auto-expand line. `pg_repack` is unavailable. **Do not run it.** (inferred)
- **Supabase disk increases but never decreases.** Archiving `retro_events` buys headroom and I/O relief, **not a lower bill**. (documented)
- **TOAST and compression settings will save Triton exactly zero bytes.** Measured TOAST size on all five big tables: **8,192 bytes — one empty page.** Rows at 575 B and 1,222 B sit far under the ~2 kB `TOAST_TUPLE_THRESHOLD`, so `pglz`→`lz4` changes nothing; `wal_compression` is already `zstd`. (measured)
- **The real cost curve is compute, not disk.** gp3 is $0.125/GB-month past the included 8 GB — 40 GB is ~$4/month. But RAM is a separate ladder: 256 MB of `shared_buffers` against ~35 GB of relations gives a measured **38.51% table cache hit ratio**, and caching the working set means Large ($110/mo) or XL ($210/mo) — **27–52× the marginal disk cost**. (measured)
- **Object storage is 5.9× cheaper per GB and Parquet compresses ~7×.** Supabase Storage $0.0213/GB-month vs $0.125 for gp3; Crunchy measured **8.9 GB in Postgres → 1.2 GB as Parquet**. (inferred)
- **"VACUUM between large batch updates" is right advice for the wrong reason** — not disk pressure, but **1.17 GB of dead tuples** and the index write amplification around them. (measured)

---

## 1. Ground truth: what is on disk

Measured 2026-08-11 against `xgzxfsqwtemlcosglhzr` (PostgreSQL 17.6, `us-east-2`). `pg_database_size` = **34,703,805,587 B**.

| Table | Rows | Total | Heap | Indexes | TOAST | Heap B/row | Total B/row |
|---|---:|---:|---:|---:|---:|---:|---:|
| `retro_events` | 14,915,507 | **20.84 GB** | ~17 GB | 2,480 MB | 8 kB | 1,222.5 | 1,397.2 |
| `pitches` | 8,877,621 | **10.18 GB** | 4,874 MB | **4,833 MB** | 8 kB | 575.5 | 1,146.5 |
| `milb_pitches` | 2,508,422 | 2.48 GB | 959 MB | 1,406 MB | 8 kB | 400.7 | 988.8 |
| `retro_games` | 233,579 | 467 MB | 416 MB | 30 MB | 8 kB | 1,865.0 | 1,999.3 |
| `pitch_videos` | 1,478,458 | 451 MB | 252 MB | 178 MB | 8 kB | 178.6 | 305.0 |
| **top-5** | | **34.42 GB** | | | | | **99.2% of the DB** |

### 1.1 The discrepancy, stated plainly

`planning.md:115` still reads *"Upgrade Supabase plan to Pro 25 GB or Team (current 8 GB Pro plan + ~7.3 GB pitches + ~18 GB retro = overflow)"* — filed as an action item **before initial seed**. The seed completed in June. `retro_events` is 20.84 GB right now and the database is healthy, because **Supabase auto-expands the disk +50% at 90% usage**: an 8 GB volume walks 8 → 12 → 18 → 27 → 40.5 → 60.75 with nobody approving anything.

**SQL cannot tell you the provisioned ceiling.** `pg_database_size()` reports the database; the *disk* also holds WAL and system logs, and the ceiling appears only in the dashboard (Project Settings → Compute and Disk). Confirm it before acting on any headroom figure below.

Units trap: `pg_size_pretty` is binary, so "32 GB" is 32.3 **GiB** = 34.7 decimal GB. Supabase bills the latter — a ~7% gap that surfaces on the invoice.

---

## 2. What a row actually costs

The physical floor per the storage docs: a **24-byte page header**, a **4-byte line pointer** per tuple, and a **23-byte tuple header** plus null bitmap, MAXALIGN-padded.

Measured from `pg_attribute`: `pitches` has **121 columns / 404 bytes of fixed-width types / 20 varlena**; `milb_pitches` 82 / 260 / 17; `retro_events` 59 / 94 / 29; `retro_games` 36 / 40 / 26.

`pitches`' 121 columns give a 16-byte null bitmap and `t_hoff` at 40, so 40 + 404 + 4 ≈ **448 bytes of irreducible structure** against 575.5 measured; the remaining ~127 B is 20 text columns, padding, and page free space. **The row is wide because the table is 121 columns, not because of any one field.** `retro_events` is the opposite shape — 94 B fixed-width but **1,222.5 B/row**, almost all text: exactly what compresses well as Parquet and not at all as a Postgres heap (§9).

**Alignment padding is real but not worth chasing here.** Percona's example: 32 B/row → 22 B/row on reorder, 45% was padding; Braintree/PayPal recovered **~10% of disk across 100+ TB**. On `pitches` that is ~490 MB — unreachable, because capturing it needs a full rewrite you have no headroom for (§6.2). Keep it as a rule for *new* tables: 8-byte-aligned columns first, then 4, 2, 1, then varlena.

---

## 3. Modelling growth

| 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 YTD |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 747,843 | 788,314 | 807,099 | 795,336 | 807,039 | *311,024* | 791,457 | 746,360 | 817,151 | 810,047 | 826,259 | 657,570 |

Mean of the ten full non-COVID seasons **793,691**; last three **817,819** → forward estimate **810,000 rows/season**. 2026 YTD confirms the rate: **657,570 pitches over 168 game days = 3,914/day**, across 2,224 `game_pk` (≈296/game).

| Component | B/row | × 810,000 | share |
|---|---:|---:|---:|
| Heap | 575.5 | **466 MB** | 50.2% |
| Indexes (29) | 570.8 | **462 MB** | 49.8% |
| **Total** | 1,146.5 | **929 MB ≈ 0.91 GiB/yr** | |

**Half of every new season is index, not data** — the number that should govern every "should we add an index?" conversation here (`02-indexing-strategy.md`).

Platform-wide: `pitches` 0.91 + `milb_pitches` ~0.67 GiB/yr (~697k rows at 988.8 B) + `pitch_videos` ~0.23 GiB/yr + `retro_events` ~0 (static load) = **~1.8 GiB/yr on a 32.3 GiB base ≈ 5.6%/year.**

**One-time risk not in that figure:** `pitch_videos` holds 1,478,458 rows against 8,877,621 pitches — **16.7% coverage**, with `scripts/backfill-pitch-videos.ts` modified in the working tree. Completing it adds ~7.4M rows × 305 B = **+2.26 GB in one campaign**, more than a year of organic growth at once. Check headroom before running it.

Growth modelling is not where the risk lives. §6 is.

---

## 4. The storage overhead of indexes

`pitches` carries **29 indexes at 4,833 MB against 4,874 MB of heap** — 0.99:1. A prior Jo session (`docs/Queries.md`, 2026-08-11) found **9 at `idx_scan = 0` totalling ~1.48 GB, of which ~1.02 GB is droppable** (the 9th is `pitches_pkey`). Largest dead: `idx_pitches_seq` **367 MB**, `idx_pitches_stuff_plus` **261 MB**.

`retro_events` is worse in proportion:

| Index | Size | `idx_scan` | Verdict |
|---|---:|---:|---|
| `retro_events_natural_key` | 1,041 MB | 15,109,674 | **ingest upsert probe** — one per row loaded, not a read path |
| `retro_events_game_inning_idx` | 431 MB | 112 | dead |
| `retro_events_batter_game_idx` | 378 MB | 2 | dead |
| `retro_events_pkey` | 324 MB | 5 | constraint — keep |
| `retro_events_pitcher_game_idx` | 210 MB | 302,568 | one script (`build-starter-outings.ts`) |
| `retro_events_event_type_idx` | 96 MB | **0** | dead |

**905 MB of `retro_events` index has served 114 lifetime scans.** With the `pitches` set, **~1.9 GB is droppable today**, one `DROP INDEX CONCURRENTLY` at a time, with no product impact.

The point that reaches past bytes: dropping the 9 dead `pitches` indexes removes **9 index writes from every row UPDATE** — the write amplification that pushed the nightly Stuff+ UPDATE across the 8s `statement_timeout`. **A capacity action that pays out in latency headroom.**

```sql
SELECT relname, indexrelname, pg_size_pretty(pg_relation_size(i.indexrelid)) AS sz, idx_scan
FROM pg_stat_user_indexes ui JOIN pg_index i ON ui.indexrelid = i.indexrelid
WHERE NOT indisunique AND idx_scan < 50 AND pg_relation_size(i.indexrelid) > 100*1024*1024
ORDER BY pg_relation_size(i.indexrelid) DESC;
```

---

## 5. Bloat is recoverable space, not growth

| Table | `n_live_tup` | `n_dead_tup` | Dead % | Recoverable |
|---|---:|---:|---:|---:|
| `pitches` | 8,891,054 | **1,437,923** | 16.2% | **827 MB** |
| `retro_events` | 14,915,507 | 194,912 | 1.3% | 238 MB |
| `retro_games` | 233,579 | 26,723 | 11.4% | 50 MB |
| `milb_pitches` | 2,535,599 | 112,916 | 4.5% | 45 MB |
| `pitch_videos` | 1,478,458 | 51,024 | 3.5% | 9 MB |
| | | | | **≈ 1.17 GB** |

`pitches` last autovacuumed **2026-05-17 — 86 days ago**. With `autovacuum_vacuum_scale_factor = 0.2` the trigger is 50 + 0.2 × 8.89M = **1,778,261**, so it sits at **80.9% of threshold** and won't fire for another ~340k dead tuples.

The governing distinction, verbatim: plain `VACUUM` *"removes dead row versions… and marks the space available for future reuse. However, it will not return the space to the operating system."* It stops the table growing; it does not shrink the disk. For Triton that is the right trade — §6.2 says why the alternative is off the table. Detail in `05-vacuum-autovacuum-bloat.md`.

`pgstattuple` is **not installed** (extensions: `plpgsql`, `pg_stat_statements` 1.11, `uuid-ossp`, `pgcrypto`, `supabase_vault`, `pg_trgm`), so `n_dead_tup` × measured bytes-per-row is the best estimate available — and it is good enough.

---

## 6. What happens when the volume fills

### 6.1 The failure sequence

1. **Ordinary writes fail** — `could not extend file` / `No space left on device` (SQLSTATE 53100). Reads still work. Survivable.
2. **`pg_wal` fills.** Crunchy: *"the database [is] unable to make any more changes… because it can't record the WAL changes. Then Postgres has no choice but to issue a PANIC and shut down."* It then refuses to restart — it cannot attempt crash recovery without WAL write capacity.
3. **`VACUUM` cannot save you**, because `VACUUM` writes WAL. The tool you'd reach for is disabled by the condition you'd reach for it in.
4. **Deleting WAL by hand makes it permanent.** Netdata: *"removing them causes data inconsistency that forces a restore from backup."* Crunchy's recovery is not "free some space" — it is **stop Postgres, back up the whole data directory including `pg_wal`, restore onto larger infrastructure.**

Corollary: **`DELETE` makes disk-full worse.** It writes new tuple versions and WAL — spending space to mark space reclaimable — and plain `VACUUM` never returns it to the OS.

### 6.2 The `VACUUM FULL` trap — Triton-specific and urgent

Docs, verbatim: `VACUUM FULL` *"requires an `ACCESS EXCLUSIVE` lock"* and *"requires extra disk space for the new copy of the table, until the operation completes."*

| Target | Copy required | Feasible at ~8 GB free? |
|---|---:|---|
| `pitches` | ~9.5 GB | **No** |
| `retro_events` | ~19.4 GB | **No** |
| `milb_pitches` | ~2.3 GB | Marginal |
| `retro_games` | ~0.45 GB | Yes |

(Assumes auto-expansion to 40.5 GB — the smallest rung fitting 32.3 GiB under 90%. *(inferred)*; confirm per §1.1.)

**`VACUUM FULL pitches;` would lock the primary analytics table `ACCESS EXCLUSIVE` for many minutes and then likely fail on disk**, on a volume already near the 90% auto-expand line with a 95% read-only tripwire behind it. `pg_repack`, which avoids both problems, is unavailable. If a table must be compacted: `DROP`/detach (partitioning makes this trivial — `06-partitioning-large-tables.md`), or rebuild-and-rename after confirming free space.

### 6.3 Supabase's guardrails

| Threshold | Behavior |
|---|---|
| **90% disk usage** | Auto-expand **+50%** (8 → 12 GB), capped at +200 GB per resize |
| **4 resizes / rolling 24 h** | Auto-scaling quota |
| **95%, quota exhausted** | **Project enters read-only mode** |
| Free plan only | Read-only at 500 MB *database* size |

Documented recovery: `SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE;` → delete data → `VACUUM;` → `SET default_transaction_read_only = 'off';`

And the fact that reframes archival: **"You can increase disk size but cannot decrease it."** Freeing 19 GB buys headroom, cache relief, and faster backups — not a smaller volume or a smaller bill.

---

## 7. The managed-Postgres cost curve

| Item | Price (verified 2026-08-11) |
|---|---|
| Pro plan | **$25/mo**, includes **8 GB disk** + **$10/mo compute credits** (covers one Micro) |
| Disk — gp3 | **$0.125/GB-month** beyond 8 GB; includes 3,000 IOPS + 125 MB/s |
| Disk — io2 | **$0.195/GB-month**, billed **from the first byte** |
| Extra IOPS / throughput | **$0.024 per IOPS** / **$0.95 per MB/s** |
| Object Storage | **$0.0213/GB-month** (100 GB included on Pro) |
| Read replica disk | **1.25× the primary** "to account for WAL archives" |
| Compute ladder | Micro 1 GB $10 · Small 2 GB $15 · Medium 4 GB $60 · Large 8 GB $110 · XL 16 GB $210 |

Comparisons: Neon charges **$0.35/GB-month** (2.8× gp3). AWS publishes no extractable per-GB EBS rate; its own example uses **$0.08/GB-month** illustratively — the wholesale floor Supabase's $0.125 sits above.

Measured settings imply **Micro compute** (`shared_buffers = 256 MB`, `effective_cache_size = 768 MB`, `work_mem = 3,500 kB` — consistent with 1 GB RAM, *(inferred)*). At a probable 40.5 GB volume: $25 + $0 + (40.5 − 8) × $0.125 ≈ **$29/month** *(inferred)*.

**Thirty dollars a month is not a problem. The 38.51% table cache hit ratio is.** With 256 MB of `shared_buffers` against ~35 GB of relations, roughly three in five heap reads hit the gp3 volume and draw on the 3,000 included IOPS. Every dashboard query, every nightly UPDATE, and the 8s `statement_timeout` margin pay for it.

**The curve people expect — disk grows, bill grows linearly — is not the curve that bites.** The one that bites is the step function on the compute ladder: caching a working set the size of `pitches`' heap (4.9 GB) means **Large ($110/mo) or XL ($210/mo)**, 27–52× the marginal disk cost of the same data. **Storage growth is billed in disk and paid in I/O.** Which reframes archival: removing `retro_events` saves no disk dollars (§6.3), but it removes 20.84 GB from **everything that scales with database size** — backup duration, PITR volume, restore time, `pg_dump` runtime, replica disk at 1.25×.

---

## 8. Retention, archival, and cold storage

| Candidate | Size | Read evidence | Verdict |
|---|---:|---|---|
| **`retro_events`** | **20.84 GB** | 12 seq scans lifetime; read-path index scans ≈302k, dominated by one script; `event_type_idx` 0 scans; one app route (a generic SQL-explorer allowlist) | **Archive. Biggest win by 2×.** |
| Dead indexes | ~1.9 GB | `idx_scan = 0` | **Drop now.** Zero risk. |
| Dead tuples | ~1.17 GB | n/a | **Plain `VACUUM`.** Reuse, not return. |
| `pitches` ≤ 2019 | ~3.6 GB | Actively queried (career views, baselines) | **Keep.** Partition, don't archive. |
| `pitch_videos` | 451 MB | 4.09M index scans — live | Keep; size the backfill (§3). |
| `retro_games` | 467 MB | 15.3M pkey scans (ingest-driven) | Keep — small, joined from `retro_events`. |

**Honest caveat on `retro_events`:** it is exposed through the MCP server's eight `retro_*` tools (`planning.md:110`), so "nobody queries it" is a claim about measured scan counts, not intent. The measurement says the *platform* doesn't depend on it; it does not say *Trevor* doesn't. **Confirm before archiving.**

**Partition first, archive second.** The docs are explicit: *"Dropping an individual partition using `DROP TABLE`, or doing `ALTER TABLE DETACH PARTITION`, is far faster than a bulk operation. These commands also entirely avoid the `VACUUM` overhead caused by a bulk `DELETE`"* — and *"seldom-used data can be migrated to cheaper and slower storage media."* On a partitioned table, "archive 2015–2019" is export → `DETACH` → `DROP`; on the current monolith it is a chunked `DELETE` producing ~3.6 GB of dead tuples that plain `VACUUM` never returns. **Partitioning is what makes retention cheap; without it, retention costs more than it saves.** (`pg_partman` — unavailable here — automates this via `retention`, `retention_keep_table`, `retention_schema`.)

**Cold format: Parquet in object storage.** Crunchy measured 100M rows at **8.9 GB in Postgres → 1.2 GB as compressed Parquet/Iceberg** — **7.4×**, with better analytical scan performance than the source. Applied to `retro_events`: 20.84 GB → **~2.8 GB** *(inferred by analogy)*, ~$0.06/month at $0.0213/GB — though per §6.3 that is headroom, not a saving.

`pg_parquet` is not available on Supabase, so the path is a script: `COPY (SELECT … WHERE season BETWEEN a AND b) TO STDOUT` → Parquet writer → Supabase Storage or S3, one file per season, **with a row-count assertion per file before anything is dropped.** An archive nobody has restored from is not an archive — the same mistake as the backfill route that never worked.

---

## 9. Compression: what works, what does nothing

| Option | Applies here? | Expected saving |
|---|---|---|
| **TOAST compression** (`pglz`/`lz4`), per-column `COMPRESSION` | **No** | **0 bytes** |
| `wal_compression` | Already `zstd` | already captured |
| Column reordering | In principle | ~490 MB — **not achievable** (§2) |
| Filesystem compression (ZFS/Btrfs) | Not available on Supabase | n/a |
| In-database columnar (hypercore) | Availability **unverified** | 90–97% documented on float series |
| **Parquet in object storage** | **Yes** | **~7×** |

TOAST only engages when *"a row value to be stored in a table is wider than `TOAST_TUPLE_THRESHOLD` bytes (normally 2 kB)."* **Measured TOAST relation size on every one of the five largest tables: 8,192 bytes** — one empty page. Not a single row here has ever been TOASTed; the widest (`retro_games`, 1,865 B/row) is still under the threshold. Switching `default_toast_compression` from `pglz` to `lz4` saves nothing; per-column `SET COMPRESSION` saves nothing. TigerData puts it correctly: *"TOAST never fires on the rows where it's needed most: narrow rows with small scalar values."* `pitches` — 121 columns of `float8` — is the canonical table Postgres cannot compress at all.

**The counterintuitive result: Triton's tables are too *narrow* to compress in Postgres despite being enormous in aggregate.** The only compression that works on this shape is columnar, and the only columnar path available is exporting out of Postgres. TigerData documents 90–97% for hypercore on float time-series, but `timescaledb` availability here is **unverified** (the catalog query failed when the database became unreachable mid-survey), and converting a live 10 GB table with 29 indexes under an 8s ceiling is large and hard to reverse anyway. **Parquet export is the same win with a fraction of the blast radius.**

---

## 10. Detectors to leave behind

**1. A daily capacity snapshot table** — everything else is SQL over it.

```sql
CREATE TABLE IF NOT EXISTS capacity_history (
  captured_at timestamptz NOT NULL DEFAULT now(),
  relname     text        NOT NULL,
  total_bytes bigint NOT NULL, heap_bytes bigint NOT NULL, index_bytes bigint NOT NULL,
  n_live_tup  bigint, n_dead_tup bigint, db_bytes bigint NOT NULL,
  PRIMARY KEY (captured_at, relname)
);
```

Populate nightly from `pg_class` + `pg_stat_user_tables` for tables over 100 MB. After ~30 days, GB/week per table is a window function and "when do we hit 90%?" is a linear fit instead of a guess.

**2. Headroom alert at 80%**, not 90% — know before the platform decides for you. Needs the provisioned disk figure (§1.1) stored in `system_metadata`.

**3. A `VACUUM FULL` feasibility assertion:** `free_disk < 1.2 × pg_total_relation_size(largest_table)` → warn. The check that would stop §6.2 before it locks the table.

**4. Dead-index and dead-tuple sweeps.** Monthly: any index >100 MB with `idx_scan = 0`. Weekly: any table >1 GB with `n_dead_tup / n_live_tup > 0.15` — `pitches` is at 16.2% and would fire today.

None of these need a vendor. They need the table in (1) and four `SELECT`s.

---

## 11. What Triton should do, in order

1. **Read the provisioned disk size off the Supabase dashboard, then correct the record** — `CLAUDE.md`, `Soto/context/triton-context.md:47`, `Jo/context/triton-context.md:48`, and the obsolete `planning.md:115`. Everything below is gated on the real number, and the 8 GB claim has been misdirecting effort for months. *(30 minutes; unblocks the rest.)*
2. **Drop the dead indexes** — ~1.02 GB on `pitches` (9 at `idx_scan = 0`, excluding `pitches_pkey`) and ~905 MB on `retro_events` (`event_type_idx`, `batter_game_idx`, `game_inning_idx`), `DROP INDEX CONCURRENTLY` one at a time, re-verified first. **Blast radius:** `CONCURRENTLY` avoids the `ACCESS EXCLUSIVE` lock but cannot run inside a transaction and needs a direct connection — the 8s cap applies to `run_mutation`. Highest-value action after (1): frees ~1.9 GB *and* removes 9 index writes per `pitches` row UPDATE, widening the margin that broke Stuff+.
3. **Plain `VACUUM` on `pitches` and `retro_games`** — ~877 MB back to the freelist; `pitches` hasn't autovacuumed in 86 days and sits at 80.9% of trigger. **Not `VACUUM FULL`.**
4. **Build the capacity snapshot table and the four detectors (§10)** *before* archival, so the effect is measurable.
5. **Confirm whether `retro_events` is used interactively via the MCP tools.** If not: export per-season Parquet to Supabase Storage, verify row counts against `retro_games` totals, then drop. ~20.8 GB out of the hot database — headroom and I/O relief, not a bill reduction.
6. **Partition `pitches` by season before the next index build or bulk campaign.** It turns every future retention decision into a `DETACH` and makes the `pitch_videos` backfill safer (`06-partitioning-large-tables.md`).
7. **Decide the compute question separately from the disk question.** The 38.51% cache hit ratio is a RAM problem with a $110–$210/month answer, not a storage problem with a $4/month answer. Decide it on measured query latency.

**Anti-recommendation — do not do these:**

- **Do not run `VACUUM FULL` on `pitches` or `retro_events`.** It needs 9.5 GB / 19.4 GB of free disk for the table copy under `ACCESS EXCLUSIVE`, and near the 90% auto-expand line the likely outcome is a long lock followed by an out-of-disk failure. `pg_repack` is not available as an alternative.
- **Do not change `default_toast_compression` or set per-column `COMPRESSION`.** Measured TOAST size across all five large tables is 8,192 bytes — one empty page, zero rows TOASTed. These settings cannot save a byte. The most common "obvious" storage win, and here it is pure motion.
- **Do not reorder columns on `pitches`.** The ~490 MB is real but needs a full rewrite you have no headroom for; (2) and (3) free more with less risk.
- **Do not upgrade the plan for disk reasons.** Disk auto-expands and 40 GB of gp3 is ~$4/month. If a plan change is warranted it will be for RAM.
- **Do not `DELETE` from `retro_events` to save space.** It writes new tuple versions and WAL, generating ~20 GB of bloat that plain `VACUUM` marks reusable and never returns. Under disk pressure it is strictly worse. Partition-and-drop, or don't.

---

## Sources

1. Supabase — [Manage Disk size usage](https://supabase.com/docs/guides/platform/manage-your-usage/disk-size) — 8 GB included; gp3 $0.125/GB-mo, io2 $0.195/GB-mo from the first byte.
2. Supabase — [Understanding Database and Disk Size](https://supabase.com/docs/guides/platform/database-size) — database vs disk; read-only at 95%; recovery SQL.
3. Supabase — [`database-size.mdx` source](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/platform/database-size.mdx) — verbatim auto-expand rules: 90%, +50%, +200 GB cap, four resizes / 24 h.
4. Supabase — [Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk) — compute ladder; gp3 3,000 IOPS / 125 MB/s included; **"You can increase disk size but cannot decrease it."**
5. Supabase — [Pricing](https://supabase.com/pricing) — Pro $25/mo, 8 GB disk, $10/mo compute credits; Team from $599/mo.
6. Supabase — [Storage size usage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size) — object storage $0.0213/GB-month.
7. Supabase — [Read Replicas usage](https://supabase.com/docs/guides/platform/manage-your-usage/read-replicas) — replica disk **1.25× the primary** "to account for WAL archives."
8. PostgreSQL 17 — [Database Page Layout](https://www.postgresql.org/docs/17/storage-page-layout.html) — 24-byte page header, 23-byte tuple header, 4-byte item pointer, MAXALIGN.
9. PostgreSQL 17 — [TOAST](https://www.postgresql.org/docs/17/storage-toast.html) — `TOAST_TUPLE_THRESHOLD`/`TARGET` normally 2 kB; storage strategies; 1 GB logical limit.
10. PostgreSQL 17 — [Client Connection Defaults](https://www.postgresql.org/docs/17/runtime-config-client.html) — `default_toast_compression`: `pglz` and `lz4`, default `pglz`.
11. PostgreSQL 17 — [Routine Vacuuming](https://www.postgresql.org/docs/17/routine-vacuuming.html) — plain VACUUM "will not return the space to the operating system"; VACUUM FULL needs `ACCESS EXCLUSIVE` and "extra disk space for the new copy."
12. PostgreSQL 17 — [Table Partitioning](https://www.postgresql.org/docs/17/ddl-partitioning.html) — DROP/DETACH "far faster than a bulk operation"; cheaper-storage migration; partition past server memory.
13. Crunchy Data — [Postgres is Out of Disk and How to Recover](https://www.crunchydata.com/blog/postgres-is-out-of-disk-and-how-to-recover-the-dos-and-donts) — full WAL → PANIC and shutdown; recover by backing up the data directory and restoring onto larger infrastructure.
14. Netdata — [PostgreSQL disk full: emergency recovery](https://www.netdata.cloud/guides/postgres/postgres-disk-full/) — failure sequence; VACUUM blocked; never delete WAL by hand.
15. Crunchy Data — [Cleaning Up Your Postgres Database](https://www.crunchydata.com/blog/cleaning-up-your-postgres-database) — unused-index SQL (`idx_scan < 50`) and hit-ratio targets.
16. Crunchy Data — [Checking for PostgreSQL Bloat](https://www.crunchydata.com/blog/checking-for-postgresql-bloat) — pgstattuple vs estimation; VACUUM FULL vs pg_repack.
17. Crunchy Data — [pg_parquet](https://www.crunchydata.com/blog/pg_parquet-an-extension-to-connect-postgres-and-parquet) — `COPY … TO 's3://…' WITH (format 'parquet')` for archival.
18. Crunchy Data — [Incremental Archival from Postgres to Parquet](https://www.crunchydata.com/blog/incremental-archival-from-postgres-to-parquet-for-analytics) — **measured: 100M rows, 8.9 GB Postgres → 1.2 GB Parquet/Iceberg**, >10× aggregation speedup.
19. TigerData — [PostgreSQL Compression: Every Option](https://www.tigerdata.com/learn/postgresql-compression) — pglz ~2.23× / LZ4 ~2.07×; **"TOAST never fires on the rows where it's needed most"**; hypercore 90–97% on float series.
20. Percona — [Column Alignment and Padding](https://www.percona.com/blog/postgresql-column-alignment-and-padding-how-to-improve-performance-with-smarter-table-design/) — 32 B/row → 22 B/row on reorder; 45% was padding.
21. PayPal/Braintree — [PostgreSQL at Scale: Saving Space (Basically) for Free](https://medium.com/paypal-tech/postgresql-at-scale-saving-space-basically-for-free-d94483d9ed9a) — ~10% of disk recovered across 100+ TB by column reordering.
22. pg_partman — [Documentation](https://github.com/pgpartman/pg_partman/blob/master/doc/pg_partman.md) — `retention`, `retention_keep_table` (default TRUE = detach), `retention_schema`.
23. Neon — [Pricing](https://neon.com/pricing) — $0.35/GB-month storage; snapshots $0.09/GB-month. Comparison point.

*Attempted and blocked:* CYBERTEC's [Detecting](https://www.cybertec-postgresql.com/en/detecting-table-bloat/) and [Estimating table bloat](https://www.cybertec-postgresql.com/en/estimating-table-bloat/) return **HTTP 403** to automated fetch — pointers only; **no figure here is sourced from them**. [AWS EBS](https://aws.amazon.com/ebs/pricing/) and [RDS PostgreSQL](https://aws.amazon.com/rds/postgresql/pricing/) publish **no extractable per-GB regional rate**; AWS's own example uses $0.08/GB-month illustratively.

**Triton-internal evidence (measured 2026-08-11, `xgzxfsqwtemlcosglhzr`, PG 17.6, `us-east-2`):** sizes and bytes-per-row from `pg_class`; season counts and the 2026 daily rate from `pitches`; dead tuples, scans and autovacuum timestamps from `pg_stat_user_tables`; per-index scans/sizes from `pg_stat_user_indexes`; column counts and `attstorage` from `pg_attribute`; `pg_settings`; `pg_extension`. The `pitches` index audit (**9 of 29 at `idx_scan = 0`, ~1.02 GB droppable**) and the **38.51% cache hit ratio** come from the prior Jo session in `docs/Queries.md`. Stale-guidance citations: `CLAUDE.md`, `Soto/context/triton-context.md:47`, `Jo/context/triton-context.md:48`, `planning.md:115`. Cross-refs: `05-vacuum-autovacuum-bloat.md`, `06-partitioning-large-tables.md`, `02-indexing-strategy.md`. **Not measured — the database became unreachable mid-survey:** `pg_ls_waldir()` WAL size and `pg_available_extensions` (`timescaledb`/`pg_repack`/`pgstattuple` availability *unverified*; only their absence from `pg_extension` is confirmed).
