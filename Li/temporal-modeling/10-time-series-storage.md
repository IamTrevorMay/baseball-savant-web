---
title: Time-Series Storage — What Stops Being Measurable When You Save the Space
domain: temporal-modeling
tags:
  - time-series-storage
  - retention
  - archival
  - cold-storage
  - rollups
  - partitioning
  - timescaledb
  - supabase
sources_reviewed: 22
last_updated: 2026-08-12
---

# Time-Series Storage — What Stops Being Measurable When You Save the Space

## TL;DR

- **TimescaleDB is unavailable to Triton and will stay so.** Supabase: "deprecated in projects using Postgres 17… supported in projects using Postgres 15"; Triton is **PG 17.6**. Hypertables, compression, retention, continuous aggregates: hand-build or forgo. **(established)**
- **Partitioning is the only storage lever that changes no answer**; rollup, archival and deletion each edit the population plus-stats divide by. **(established)**
- **Archival plus an idempotent rebuild is erasure, not staleness.** `refresh_league_averages(p_season)` opens with an unconditional `DELETE … WHERE season = p_season`, then reinserts over `[Jan 1 y, Jan 1 y+1)` (`create-refresh-league-averages.sql:47–49`): archive 2017, re-run, and its benchmarks hit zero rows, no error. **(computed)**
- **The two fact tables are 12,077 MB of the ~12,107 MB surveyed — 99.75%**, and the only asset anything is recomputable *from*. **(computed)**
- **A rollup answers only what its sufficient statistics answer, and `n, Σx, Σx²` is the dividing line** — means and SDs do not pool, counts and sums do. **(established)**
- **No rollup survives a formula change:** `total_movement_in` is nonlinear, so the rollup freezes Soto's feature set at the archive date. **(established)**
- **Triton rescored its fact table twice in four months** (≈249,000 rows on 2026-08-11; wRC+ restated 5–6 points on 2026-05-08) — raw retention is what buys that. **(computed)**
- **`pitches` has no `created_at` and no index on `game_pk`**: an archive cannot be recorded, run game-by-game, or falsified after. **(computed)**
- **Triton's retention is inverted:** `daily_cards`/`briefs`, the only rows recording what was *published*, die at 5 days while 11,386,043 immutable fact rows live forever. **(computed)**
- **Do not benchmark a partitioning decision yet:** `last_analyze`/`last_autoanalyze` are NULL on every table inspected, so pruning results measure missing statistics. Remedy → `Jo/postgres-performance/05-vacuum-autovacuum-bloat.md`. **(computed)**
- **Cold storage is a type-system boundary, not a location** — Parquet has no `numeric`, no constraints, no NULL-versus-absent distinction. **(estimated)**

---

## 1. Four storage moves, ranked by measurement damage

Jo owns operational soundness (`Jo/postgres-performance/06-partitioning-large-tables.md`; `11-capacity-storage-planning.md` for bytes and cost). This ranks them by what they cost the *numbers*.

| Move | Frees on `pitches` | Edits the population? | Reversible | What stops being answerable |
|---|---|---|---|---|
| **Partition by season** | 0 bytes | **No** | Yes | Nothing — rows move, results identical |
| **Archive with fidelity** (verified export, rows removed) | ~3.6 GB for ≤2019 | Yes, in Postgres | Yes, if a restore is proven | Anything recomputing over the table unaware of the archive |
| **Roll up, keep the summary** | ~3.6 GB | Yes, permanently | **No** | Any metric not a function of the retained stats |
| **Delete** | ~3.6 GB | Yes | No | Everything |

Partitioning's zero measurement risk is why it goes first despite freeing nothing: it turns every *later* retention decision from a bulk `DELETE` into a `DETACH`. The bottom three are one byte saving at three information costs — rank by bytes freed per question destroyed.

---

## 2. TimescaleDB on Supabase: verified unavailable

Supabase carries the deprecation on its extension page and points migrations from hypertables to `pg_partman`-managed native partitioning. Triton is PG 17.6, past the cutoff.

| Timescale capability | What it does | Here | Plain-Postgres substitute | Measurement-neutral? |
|---|---|---|---|---|
| Hypertables, auto chunking | Chunks on insert | **No** | `PARTITION BY RANGE (game_date)` + yearly DDL job | Yes |
| `time_bucket()` | Any-width bucketing | **No** | `date_trunc`, or a generated bucket column | Yes |
| Continuous aggregates | Refresh changed buckets | **No** | Scoped matview refresh → `Jo/postgres-performance/08-aggregation-materialization.md` | **Only while the source lives** |
| Compression / hypercore | 90–97% on float series | **No** | Parquet export out of Postgres (§5) | No — crosses a type boundary |
| Retention (`drop_chunks`) | Automatic chunk expiry | **No** | `DETACH PARTITION` + `DROP TABLE` | **No — the policy *is* the decision** |
| Scheduler (`add_job`) | In-database cron | Substitutable | `pg_cron`, already running Triton's crons | Yes |

**Continuous aggregates** are a free lunch only while the raw chunks stay: drop the source and it is a rollup, so §4's test applies. Triton would rebuild it as a matview anyway — matview + aggressive base-table retention = a rollup nobody decided on.

`pg_partman` is absent from `pg_extension` (Supabase intends to ship it) and not worth it: twelve partitions a year is a calendar entry, not a workload — Jo's second anti-recommendation, `06-partitioning-large-tables.md`.

---

## 3. What declarative partitioning does and does not give you

Mechanics, pruning plans, index restrictions, migration cost: **Jo**, `06-partitioning-large-tables.md`. Three facts on top.

**Cheap retention.** `DETACH PARTITION` drops a season in constant time with none of a bulk `DELETE`'s vacuum debt — partition *before* archiving.

**No as-of axis.** The partition key is *valid-time* (`game_date`); nothing records when a row arrived or which baseline scored it → `02-bitemporal-modeling.md`, `07-snapshotting-vs-recompute.md`.

**One "season" definition is required; Triton has two.** `refresh_league_averages` scans `[make_date(p_season,1,1), make_date(p_season+1,1,1))` (`:47–48, :120, :308, :490, :641`); `refreshPitchBaselines` scans `game_year = ${year}` (`app/api/update/route.ts:265`), as do the command/deception joins (`:527, :535`). Both are calendar-year windows, agreeing **iff** `game_year = extract(year from game_date)` — unenforced, unchecked. Until checked, the Stuff+ baseline and league-average populations are two treated as one:

```sql
-- read-only; run before season-keyed storage work
SELECT game_year, count(*) FROM pitches
WHERE game_year IS DISTINCT FROM extract(year FROM game_date)::int
GROUP BY 1 ORDER BY 1;
```

A nonzero result is a comparability defect *today*, independent of storage — and it decides the partition key.

---

## 4. Rollups and the sufficient-statistic test

A rollup asserts its statistics are *sufficient* for every future question — checkable, and almost always false where metrics are still being designed.

| Retained grain | Rows/season | Re-derive a league baseline? | New feature? | Percentiles? | Split by count/handedness? |
|---|---|---|---|---|---|
| **Pitch (today)** | ~775,000 | Yes | Yes | Yes | Yes |
| Pitcher × game × pitch type | ~58,000 *(estimated)* | Via moments | No | No | Only if in the key |
| Pitcher × season × pitch type | ~2,400 | Via moments | No | No | No |
| Pitcher × season | ~900 | No | No | No | No |

Row three tempts: `pitcher_season_command` sits there, **27,119 rows over ~11 seasons**, **~320×** fewer than pitch grain — and where Triton stops being able to build new metrics for archived years.

**"Via moments," precisely.** Stuff+ z-scores three features against a `(pitch_name, game_year)` baseline of `AVG`/`STDDEV` (`app/api/update/route.ts:251–262`). Neither **pools**: a league mean is unrecoverable from per-pitcher means without weights, a league SD at all. `n`, `Σx`, `Σx²` are additive, so carrying those three per group rebuilds any coarser mean and variance *exactly*.

**Three things moments cannot buy.**

1. **A different feature.** `total_movement_in = sqrt((pfx_x·12)² + (pfx_z·12)²)` is nonlinear, so the rollup freezes *this* formula's moments; every future Soto feature — spin axis, seam effects, client-side VAA/HAA — is un-backfillable for archived seasons.
2. **Distribution shape.** Percentiles, `league_percentiles`' 99-element arrays, changepoint detection, tails: all need rows. Two moments describe a Gaussian; pitcher-season velocity is not one.
3. **Any split not already in the key** — count state, handedness, times-through-the-order, home/away. A rollup fixes the legal `GROUP BY`s forever, so unanticipated comparisons become category errors: Robinson/Simpson aggregation bias in storage form, where aggregate relationships need not hold in the units and the check dies with them.

**The test before any rollup:** name the statistics retained, then check three questions the platform asked this year. Triton's: 8.88M rows rescored in August, wRC+ restated in May, both pitch-grain.

---

## 5. The archival seam: five ways a boundary edits a number

Assume discipline — Parquet in object storage, per-season files, row counts verified (`Jo/postgres-performance/11-capacity-storage-planning.md` §8). Five failure modes survive it, all Li's.

1. **Population functions silently narrow.** `refresh_league_averages(2017)` post-archive deletes 2017's benchmarks and inserts nothing: the destructive open at `:49` runs whatever the scan finds. `refreshPitchBaselines(sb,[2017])` fails gently — a zero-row `INSERT … SELECT` upserts nothing, so its stale baseline survives *by accident*. Neither reports.
2. **Qualification floors move.** `qual_floor = max(hard_floor, 0.20 × leader_value)` is whole-population: fewer rows → new leader → new floor → new qualified set. A rebuilt leaderboard's membership differs from the published one, no diff to point at (`metric-governance/07-qualification-thresholds.md`).
3. **Nulls become indistinguishable from absence.** Deception is 2017+, `stuff_plus` unscored before the ledger; add "archived" and `AVG()`'s silent skip spans three meanings. Precedent: the 2026 Stuff+ outage, averages plausible while coverage collapsed.
4. **The type system changes underneath.** Parquet is physically typed: `numeric` round-trips as `double`, `CHECK` constraints do not exist, an absent column is not a column of NULLs. A mean over 2015–2019 from Parquet and one over 2020–2026 from Postgres are two computations: say so, or keep them off one axis.
5. **Nothing records what left.** No `created_at`, no index on `game_pk`: the boundary is unreconstructable from the data — the same gap that makes lateness unfalsifiable (`03-late-arriving-data.md`).

### 5.1 The archive contract that fixes 1, 2 and 5

Archival is safe when the denominators can *see* the archive — a manifest and a guard, not a policy:

```sql
CREATE TABLE archive_manifest (
  archive_id text PRIMARY KEY,
  relname text NOT NULL,
  season int NOT NULL,
  predicate text NOT NULL,        -- exact WHERE clause removed
  row_count bigint NOT NULL,
  min_game_date date NOT NULL, max_game_date date NOT NULL,
  column_list text[] NOT NULL,    -- schema as archived
  checksum text NOT NULL,
  object_url text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  restore_verified_at timestamptz -- NULL ⇒ not yet an archive
);
```

**No season is archived until `restore_verified_at` is set** by a trial restore reproducing `row_count` and `checksum`: an archive nobody has restored from is a deletion with paperwork. **Every population function guards on it**: a `RAISE EXCEPTION` atop `refresh_league_averages` when `[v_start, v_end)` overlaps an archived range turns item 1's silent erasure into a loud stop, for an `EXISTS`. OAIS in twelve lines — an archive is bytes *plus* enough information to interpret them.

---

## 6. Triton's retention policy, measured — and why it is backwards

| Object | Rows / size | Retention today | Recomputable if lost? | Verdict |
|---|---|---|---|---|
| `daily_cards`, `briefs` | small | **deleted at 5 days** | **Never** — they record what was *published* | Longest retention warranted; has the shortest |
| `pitch_baselines` | 206 / 72 kB | **overwritten nightly**, no timestamp | **Never** — the vintage dies on write | Append-only forever. ≤26 MB/season |
| `league_averages` | 1,806 / 616 kB | `DELETE` + reinsert per refresh | Only from `pitches`, only against the same baselines | Version it → `07-snapshotting-vs-recompute.md` |
| `pitches`, `milb_pitches` | 11,386,043 / 12,077 MB | forever | Partly — Savant restates: a re-fetch is a *different* dataset | Keep. The correct call |
| `retro_events` | 20.84 GB | forever | Yes, from Retrosheet | Archive first under real pressure → **Jo** |

**The three objects destroyed on a schedule are the three that cannot be rebuilt; the one kept forever is the closest to re-fetchable.** Not policy but an accident of whoever wrote the cleanup cron: `daily_cards`' 5-day window was storage hygiene and became the reproducibility horizon.

`pitch_baselines` is **0.0007%** of `pitches` — a year of daily vintages costs less than one day of ingest. No storage case exists against keeping them, only that the write path says `ON CONFLICT DO UPDATE`.

---

## 7. What Triton should do, in order

1. **Run the §3 `game_year` vs `game_date` invariant check.** One read-only query deciding whether the Stuff+ baseline and league-average populations are one. Log it to `docs/Queries.md`.
2. **Guard `refresh_league_averages` before anything is archived** — `RAISE EXCEPTION` when `[v_start, v_end)` overlaps `archive_manifest`. The `DELETE` at `:49` is armed today; the guard is free while the manifest is empty.
3. **Create `archive_manifest` (§5.1) and verify a restore** before the first export, not after.
4. **Extend `daily_cards`/`briefs` retention** past 5 days (`app/api/cron/cleanup/route.ts:23`) — the only irreplaceable rows, deleted fastest.
5. **Make `pitch_baselines` append-only** (`app/api/update/route.ts:269`) before any season is archived: losing raw rows *and* baseline vintage is unreproducible on both axes at once → `07-snapshotting-vs-recompute.md` step 2.
6. **Add `created_at` forward-only to both fact tables**, publish the start date, treat NULL as pre-instrumentation. Sequencing and rewrite cost → **Jo**.
7. **If storage pressure is real, in this order:** partition (zero measurement cost) → drop the 1,417 MB of zero-scan indexes and vacuum (zero cost, more bytes than any archive) → archive `retro_events` (20.84 GB, feeds no metric) → archive old `pitches` seasons under the §5.1 manifest → roll up only if 1–4 are exhausted, only with `n, Σx, Σx²`, and only where verified cold storage also holds the raw rows. A rollup that is *also* an archive is reversible; one replacing rows is not.
8. **Write the retention decision into `planning.md` with a trigger condition**, recording per object which reproducibility rung it is promised (`07-snapshotting-vs-recompute.md` §7). An undocumented retention policy decays like an undocumented metric.

Items 2, 5 and 6 change a metric's inputs or schema, so each **updates `docs/VARIABLES.md` in the same commit.**

**Anti-recommendation — do not roll up pre-2020 `pitches` to a pitcher × season × pitch-type summary and drop the raw rows.** The textbook move, ~320× fewer rows and ~3.6 GB, wrong three ways. **(i) It freezes the feature set.** `total_movement_in` is nonlinear, so the rollup keeps today's formula's moments; every future feature — spin axis, seam effects, VAA/HAA — is permanently un-backfillable before 2020, and Soto's model is not finished. **(ii) It removes the evidence for operations this platform performs.** The ≈249,000-row rescore of 2026-08-11 and May's wRC+ restatement are both pitch-grain; pre-2020 rows, scored against vintages nobody recorded, are likeliest to need rescoring. **(iii) The bytes are on the wrong table.** `retro_events` is 20.84 GB, 12 lifetime sequential scans, feeds no metric: 5.8× the saving at zero measurement cost. Rolling up `pitches` pays the maximum information price for a minority of the win.

Smaller don'ts: **no `CREATE EXTENSION timescaledb`** (deprecated on Supabase PG 17; this project is 17.6) and **no partition-pruning benchmark** before `ANALYZE` (`last_analyze`/`last_autoanalyze` NULL platform-wide).

**Single highest-leverage next action:** run the §3 invariant query: one statement, no writes, and it settles whether two live population functions have been scanning the same rows all along — what every season-keyed storage plan silently assumes.

---

## Sources

1. Supabase — [timescaledb: Time-Series data](https://supabase.com/docs/guides/database/extensions/timescaledb) — PG 17 unsupported, PG 15 grandfathered.
2. Supabase — [Postgres Extensions overview](https://supabase.com/docs/guides/database/extensions) — fixed managed catalog.
3. Supabase — [Storage size usage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size) — object-storage pricing.
4. Tiger Data — [About continuous aggregates](https://www.tigerdata.com/docs/use-timescale/latest/continuous-aggregates/about-continuous-aggregates) — only changed buckets recomputed.
5. Tiger Data — [Data retention](https://www.tigerdata.com/docs/use-timescale/latest/data-retention/) — `drop_chunks` policies.
6. PostgreSQL — [Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html) — bounded maintenance, cheap archival.
7. PostgreSQL — [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — `DETACH PARTITION`.
8. PostgreSQL — [BRIN Indexes](https://www.postgresql.org/docs/current/brin.html) — near-free on monotonic dates.
9. PostgreSQL — [Monitoring Statistics](https://www.postgresql.org/docs/current/monitoring-stats.html) — `last_analyze`/`last_autoanalyze` NULL here.
10. PostgreSQL — [COPY](https://www.postgresql.org/docs/current/sql-copy.html) — `COPY (SELECT …) TO STDOUT`.
11. PostgreSQL — [Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — bulk `DELETE` costs more than `DETACH`.
12. pgpartman — [pg_partman](https://github.com/pgpartman/pg_partman) — migration target; not installed.
13. Crunchy Data — [Incremental Archival from Postgres to Parquet](https://www.crunchydata.com/blog/incremental-archival-from-postgres-to-parquet-for-analytics) — measured 8.9 GB → 1.2 GB.
14. Crunchy Data — [pg_parquet](https://www.crunchydata.com/blog/pg_parquet-an-extension-to-connect-postgres-and-parquet) — `COPY … TO 's3://…' WITH (format 'parquet')`.
15. Apache Parquet — [Documentation](https://parquet.apache.org/docs/) — no `numeric`, no constraints (§5).
16. DuckDB — [Reading Parquet files](https://duckdb.org/docs/stable/data/parquet/overview) — archives stay queryable.
17. Apache Iceberg — [Spark queries: time travel](https://iceberg.apache.org/docs/latest/spark-queries/) — snapshot-per-commit over cold files.
18. R. A. Fisher (1922) — [On the mathematical foundations of theoretical statistics](https://royalsocietypublishing.org/doi/10.1098/rsta.1922.0009) — sufficiency (§4).
19. W. S. Robinson (1950) — [Ecological correlations and the behavior of individuals](https://academic.oup.com/ije/article/38/2/337/658252) — aggregate ≠ unit relationships (§4).
20. CCSDS — [Reference Model for an Open Archival Information System](https://public.ccsds.org/pubs/650x0m2.pdf) — content *plus* representation info.
21. Kimball Group — [Dimensional Modeling Techniques](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/) — aggregates derive from the grain.
22. Baseball Savant — [Statcast CSV documentation](https://baseballsavant.mlb.com/csv-docs) — restated fields: re-fetch ≠ restore.

**Triton-internal evidence.** Code read 2026-08-12. Destructive rebuild: `scripts/create-refresh-league-averages.sql:47–49` (`v_start`/`v_end` = `make_date(p_season,1,1)`/`make_date(p_season+1,1,1)`, then `DELETE FROM league_averages WHERE season = p_season`); `game_date >= %L AND game_date < %L` fact scans at `:120/:308/:490/:641`; `game_year = %L` joins to `pitcher_season_command`/`pitcher_season_deception` at `:527/:535` — §3's two season definitions. Baseline refresh: `app/api/update/route.ts:241–290`, aggregate `:251–262`, `game_year = ${year}` at `:265`, destructive `ON CONFLICT (pitch_name, game_year) DO UPDATE` at `:269`; current year only (`app/api/cron/refresh/route.ts:60`). Retention: `app/api/cron/cleanup/route.ts:23,27` deletes `briefs`/`daily_cards` older than 5 ET days. Stuff+ formula and `total_movement_in = sqrt((pfx_x*12)^2 + (pfx_z*12)^2)`: `Li/context/triton-context.md:42–53`. **Measured 2026-08-12:** `pitches` 8,877,621 / 9,711 MB / 623,662 pages, 2015-03-03→2026-08-10, 90+ cols, **no `created_at`/`updated_at`**, indexes pitcher/batter/game_date, **none on `game_pk`** (`CLAUDE.md`); `milb_pitches` 2,508,422 / 2,366 MB / 122,702 pages, 2023-03-31→2026-08-11; `player_season_stats` 79,061 / 13 MB; `pitcher_season_command` 27,119 / 9,488 kB; `pitcher_season_deception` 17,386 / 4,776 kB; `players` 16,931 / 1,632 kB; `league_averages` 1,806 / 616 kB; `compete_pitches` 443 / 496 kB; `pitch_baselines` 206 / 72 kB, no timestamp; `last_analyze`/`last_autoanalyze` NULL on every table inspected. **Derived:** 8,877,621+2,508,422 = 11,386,043 fact rows; 9,711+2,366 = 12,077 MB of ~12,107 MB surveyed = **99.75%**; 72 kB ÷ 9,711 MB = **0.0007%**; 27,119 ÷ ~11 seasons ≈ **2,400 rows/season** vs ~775,000 pitch rows/season ≈ **320×**; §4's game-grain row is estimated. Incidents from `metric-governance/02-metric-versioning-reproducibility.md`, `docs/reliability-findings-2026-08-11.md`: the 2026-08-11 rescore of ≈249,000 rows, the 2026-05-08 wRC+ restatement of 5–6 points, 46 days of stale `league_averages`. `retro_events` 20.84 GB / 12 lifetime sequential scans, `pitches` ≤2019 ~3.6 GB, 1,417 MB of zero-scan indexes and PG 17.6 are Jo's 2026-08-11 measurements: `Jo/postgres-performance/11-capacity-storage-planning.md` §1/§8, `06-partitioning-large-tables.md` §8.1.
