---
title: Bitemporal Modeling — Two Clocks, and Which Triton Tables Deserve Both
domain: temporal-modeling
tags:
  - bitemporal
  - valid-time
  - transaction-time
  - sql-2011
  - postgres-ranges
  - btree-gist
  - system-versioning
  - supabase
sources_reviewed: 17
last_updated: 2026-08-12
---

# Bitemporal Modeling — Two Clocks, and Which Triton Tables Deserve Both

## TL;DR

- **A bitemporal row answers two questions; Triton can answer neither on its most important table.** *Valid time* = when the fact held; *transaction time* = when the DB believed it. `pitches` has `game_date` and **no `created_at`/`updated_at`**. **(computed)**
- **Postgres implements almost none of SQL:2011's temporal syntax, and Supabase less than that.** No `PERIOD FOR`, no `WITH SYSTEM VERSIONING`, no `FOR SYSTEM_TIME AS OF`; PG 18 added `WITHOUT OVERLAPS` keys and temporal FKs, `FOR PORTION OF` lands in **PG 19**, and Supabase's default is **PG 17** — so Triton has *zero* standard temporal DDL today. **(established)**
- **The portable answer is a range column plus an exclusion constraint, available since 9.4:** `sys_period tstzrange` + `EXCLUDE USING gist (key WITH =, sys_period WITH &&)` after `CREATE EXTENSION btree_gist` — what every "temporal tables" extension generates underneath. **It also forces a write-path rewrite, which is the feature:** `ON CONFLICT DO UPDATE` cannot arbitrate on an exclusion constraint, so `refreshPitchBaselines`' destructive upsert (`app/api/update/route.ts:269`) *cannot run* against a versioned baseline table. **(established + computed)**
- **Bitemporalizing `pitches` costs ≈2.33M history rows and ≈1.3 GB of heap per season to record that nothing changed** — the 3-day re-sync rewrites each row ~4×, and Savant restatements are rare. **(computed + estimated)**
- **The same discipline on `pitch_baselines` costs ≈3,100 rows and ≈1.1 MB per season — ~1,200× cheaper — and answers the question that matters,** since "which baseline scored this row?" is about the *baseline*. `metric-governance/10-audit-trails-provenance.md`'s verdict, reached from the temporal side: version the small mutable dimensions, ledger the runs, leave the fact table alone. **(computed)**
- **`updated_at` is not transaction time unless something enforces it, and on `players` nothing does** — no `BEFORE UPDATE` trigger outside eight `work_*` tables; the roster cron sets it by hand, the backfill route doesn't. **(computed)**
- **A transaction-time column plus a destructive refresh is a timestamp, not a history:** `refresh_league_averages` does `DELETE … WHERE season = p_season` then re-inserts, so the July 3rd benchmark is gone, not stale. **(computed)**
- **`compete_pitch_sessions` is the platform's only accidentally bitemporal table** (`session_date` beside `uploaded_at`); and with `last_analyze`/`last_autoanalyze` NULL everywhere inspected, benchmark nothing temporal until Postgres has statistics → **Jo**. **(computed)**

---

## 1. Two clocks, four table shapes

A **snapshot** answers "what is true now?"; a **valid-time** table "what was his role in July?"; a **transaction-time** table "what did the query return on July 3rd?"; a **bitemporal** table "on July 3rd, what did we believe about July 1st?" The last two cost a row per write. The clocks are independent: a Savant restatement changes what we believe *about a past date*, so valid time holds still while transaction time advances.

**Triton's live example.** The 2026-08-11 rescore changed `stuff_plus` on ≈249k rows with `game_date` spanning April–August. Valid time unchanged — those pitches were still thrown in April; transaction time, a new belief recorded nowhere. So April and August rows are indistinguishable today (`metric-governance/02-metric-versioning-reproducibility.md` §3.2). *Lookahead* and *retroactive erasure* are one defect from either side, owned by `01-as-of-correctness.md` and `09-retroactive-restatement.md`.

---

## 2. SQL:2011 vs. what Postgres actually ships

SQL:2011 defines *application-time period tables* (`PERIOD`, `WITHOUT OVERLAPS`, `FOR PORTION OF`) and *system-versioned tables* (`WITH SYSTEM VERSIONING`, `FOR SYSTEM_TIME AS OF`); Postgres has taken it in pieces over a decade.

| SQL:2011 feature | PG ≤17 | PG 18 | PG 19 (dev) | Supabase |
|---|---|---|---|---|
| `PERIOD FOR p (start, end)` | ✗ | ✗ (**range column** instead) | ✗ | ✗ |
| `PRIMARY KEY`/`UNIQUE (k, p WITHOUT OVERLAPS)`; `FOREIGN KEY (…, PERIOD p)` | ✗ | ✓ | ✓ | ✗ |
| `UPDATE/DELETE … FOR PORTION OF` | ✗ | ✗ | ✓ | ✗ |
| `WITH SYSTEM VERSIONING` / `FOR SYSTEM_TIME AS OF` | ✗ | ✗ | ✗ | ✗ |
| `EXCLUDE USING gist (k WITH =, r WITH &&)` | ✓ (9.4+) | ✓ | ✓ | **✓** |

Two corrections to the folklore. **(1)** PG 18's `WITHOUT OVERLAPS` takes a real range column, not a standard `PERIOD`, so a PG 18 temporal key is not portable SQL. **(2)** System versioning — the transaction-time half Triton needs — is **in no released or in-development Postgres**, only extensions or hand-rolled triggers. "PG 18 added temporal tables" means temporal *constraints*: the valid-time half.

**Supabase pins the ceiling lower:** the platform default is PG 17 (the self-hosted image only moved 15 → 17 in June 2026), so `WITHOUT OVERLAPS` is unavailable regardless of the standard. Everything in §3 works on 15, 17 and 18 alike.

---

## 3. The Postgres-native toolkit that works today

### 3.1 Ranges and the exclusion constraint

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- lets GiST carry `=` on scalar keys

CREATE TABLE pitch_baseline_values (
  pitch_name text NOT NULL,
  game_year  int  NOT NULL,
  source_max_game_date date NOT NULL,  -- VALID time: as-of watermark of the source data
  avg_velo numeric, std_velo numeric, avg_movement numeric, std_movement numeric,
  avg_ext numeric, std_ext numeric, pitch_count int NOT NULL,
  sys_period tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),   -- TRANSACTION time, [start,end)
  origin     text NOT NULL DEFAULT 'observed'
               CHECK (origin IN ('observed','unknown','backfilled')),
  EXCLUDE USING gist (pitch_name WITH =, game_year WITH =, sys_period WITH &&)
);
CREATE INDEX ON pitch_baseline_values USING gist (sys_period);
```

Four choices carry it. **`tstzrange` over two `timestamptz` columns:** `&&`, `@>` and the exclusion operator exist only for range types; plain columns force hand-written bounds that get boundaries wrong. **`btree_gist`:** GiST indexes `&&` natively but not `=` on `text`/`int`, so without it the constraint cannot include the business key. **Half-open `[)` and `now()`, never `clock_timestamp()`:** adjacent versions meet exactly — no gap, no shared instant, where closed-closed double-counts — and `now()`, the *transaction* timestamp, gives every row a run closes and opens one shared instant. **`origin` beside the range:** an unbounded lower bound cannot distinguish "true since forever" from "we don't know" — `metric-governance/10`'s `mode='unknown'`, which keeps a backfill honest.

### 3.2 The `AS OF` query Postgres has no syntax for

```sql
-- SQL:2011 would be:  SELECT … FOR SYSTEM_TIME AS OF TIMESTAMP '2026-07-03 09:10+00'
-- Bitemporal: what we believed on Jul 3 about data valid through Jun 30.
SELECT DISTINCT ON (pitch_name) *
FROM   pitch_baseline_values
WHERE  sys_period @> timestamptz '2026-07-03 09:10+00'   -- transaction time; GiST-indexable
  AND  source_max_game_date <= DATE '2026-06-30'         -- valid time
ORDER  BY pitch_name, source_max_game_date DESC;
```

Drop the second predicate for the plain transaction-time `AS OF`. Either form makes "what did we know on July 3rd?" answerable; today it is unanswerable at any price, the row having been overwritten.

### 3.3 Three implementation routes, ranked

- **Adopt:** hand-rolled `sys_period` + `EXCLUDE` + a small trigger (§3.1) — ~40 lines per table, no dependency, identical on PG 15/17/18. Below a few thousand rows keep one table and a `WHERE upper_inf(sys_period)` view; above that, split closed rows into `t_history`.
- **Adopt if more than ~3 tables need it:** `nearform/temporal_tables`, a PL/pgSQL port of the classic `versioning()` trigger for managed Postgres — two functions, one trigger per table; `_nochecks` trades validation for ~2× speed.
- **Reject:** `arkhipov/temporal_tables` (C) and Vik Fearing's `xocolatl/periods`. `CREATE EXTENSION` needs files on the server, so a hosted project can install neither, C or not.

---

## 4. What Supabase actually permits

| Capability | Status | Consequence |
|---|---|---|
| `CREATE EXTENSION btree_gist` | **Allowed** — on Supabase's list | §3.1 buildable today |
| `temporal_tables` / `periods` extensions | **Not available** | Paste PL/pgSQL, don't `CREATE EXTENSION` |
| `moddatetime` (contrib) | Available — stock `updated_at` trigger | The §5 fix |
| PostgREST `.upsert()` on a temporal table | **Breaks** — emits `ON CONFLICT DO UPDATE`, which cannot arbitrate on an exclusion constraint | Temporal writes go through an RPC; reads are fine, PostgREST exposes range operators (`cs`, `cd`, `ov`, `sl`, `sr`, `adj`) |
| RLS as append-only enforcement | **No** — `service_role` bypasses RLS, and every cron writes with it | Use a `BEFORE UPDATE OR DELETE` trigger (`metric-governance/10` §5) |

The `ON CONFLICT` incompatibility is load-bearing: Triton's baseline refresh *is* `ON CONFLICT (pitch_name, game_year) DO UPDATE SET …` (`app/api/update/route.ts:269`), and an exclusion constraint makes it fail loudly rather than silently destroy a vintage — the cheapest enforcement available for the platform's biggest open governance hazard.

---

## 5. Triton's temporal inventory, measured

| Table | Rows / size | Valid time | Transaction time | History? |
|---|---|---|---|---|
| `pitches` | 8,877,621 / 9,711 MB / 623,662 pages | `game_date` 2015-03-03 → 2026-08-10 | **none** | no |
| `milb_pitches` | 2,508,422 / 2,366 MB / 122,702 pages | `game_date` 2023-03-31 → 2026-08-11 | **none** | no |
| `pitch_baselines` | 206 / 72 kB | `game_year` (coarse) | **none** | no — destructive upsert |
| `league_averages` | 1,806 / 616 kB | `season` | `updated_at` | no — `DELETE` + re-`INSERT` |
| `player_season_stats` | 79,061 / 13 MB | `season` | `updated_at` | no |
| `players` | 16,931 / 1,632 kB | **none** (current only) | `updated_at`, hand-maintained | no |
| `compete_pitch_sessions` | — | `session_date` | `uploaded_at` | append-only |

**The fact tables have one clock.** With no load timestamp, "which rows arrived after the 3-day window closed?" is unaskable — `03-late-arriving-data.md`'s question, fixed by one column (§8, item 3), which is *not* bitemporality. **And a transaction-time column is not a history:** `league_averages.updated_at` stamps only the surviving generation, so a historical plus-stat recomputed today silently uses today's denominator.

**`updated_at` without a trigger is a convention, and conventions decay.** The repo's only `set_updated_at` triggers cover eight `work_*` tables; `players` has none. The roster cron sets it by hand, `backfill-players` updates `name` without it, and the ingest upsert's `ignoreDuplicates: true` never touches an existing row — leaving a *creation* stamp on most rows, a *modification* stamp on some, and nothing to tell them apart.

---

## 6. Where bitemporality is free, and where not

Assume system versioning as normally implemented: each logical `UPDATE` closes the row's `sys_period` and inserts a successor. Heap B/row from measured page counts.

| Table | B/row | Writes/row/season | New history rows/season | Added heap/season |
|---|---|---|---|---|
| `pitches` / `milb_pitches` | 575 / 401 | ~4 (daily cron, 3-day window, `ignoreDuplicates: false`) | **≈2.33M / 2.2M** | **≈1.3 GB / 0.9 GB** |
| `pitch_baselines` | 358 | 1/night × ~17 `pitch_name` values | **≈ 3,100** | **≈ 1.1 MB** |
| `league_averages` | 349 | nightly, current season (~150 rows) | ≈ 27,000 | ≈ 9.5 MB |
| `player_season_stats` / `players` | 172 / 99 | nightly / roster, change-filtered | ≈ 10⁴–10⁵ | ≈ 10–20 MB |

**`pitches` versus `pitch_baselines` is a ≈1,200× ratio for strictly less information**, and storage is the cheap part; §8's anti-recommendation gives all four grounds. **Nearly every version would be a no-op:** Savant restates `pfx_x`/`pitch_name` rarely while the re-sync rewrites every row 3–4× regardless, so a change-filtered (`IS DISTINCT FROM`) trigger leaves a residue small enough for a run ledger. **The mutation grain is the day:** `applyStuffPlusForDateRange` runs one `UPDATE` per `game_date`, so per-row transaction time is ~2,200 distinct tuples duplicated 8.88M times.

`02` reached this from the versioning side, `10` from the provenance side — three routes, one answer. **The asymmetry flips at `pitch_baselines`:** 206 rows, and the *input* whose vintage is the real unknown; versioning it makes every `stuff_plus` recomputable as-of.

---

## 7. Traps that bite specifically here

- **Timezone.** `tstzrange` fits transaction time (an instant); valid time in baseball is an **ET calendar date**, so `game_date`'s range type is `daterange`. Mixing them in a predicate is the commonest bitemporal bug. → `04-timezone-calendar-handling.md`.
- **The planner has no statistics** — `last_analyze`/`last_autoanalyze` are NULL everywhere inspected, so range selectivity is a default guess. `ANALYZE` before benchmarking `sys_period @> ts`. → **Jo**.
- **Exclusion constraints are not free on write** and cannot be added `CONCURRENTLY` — plan a window even for a 206-row table in the cron path, and audit `.upsert()` call sites *before* migrating (§4).
- **Deleting from a bitemporal table is a contradiction.** Close the range; never `DELETE` — upper bound equal to lower bound honestly encodes "inserted in error." Append-only needs a trigger, not RLS (§4).
- **Never show two clocks as one** — a July value silently recomputed with August inputs is a presentation defect regardless of storage. → **Cas**.

---

## 8. What Triton should do, in order

1. **Confirm the server version** (`SHOW server_version;` → `planning.md`; every §2 decision hangs on 17-vs-18), then **`CREATE EXTENSION btree_gist` and ship `pitch_baseline_values` (§3.1)** with the exclusion constraint: the whole bitemporal recommendation at ~1.1 MB/season, and the temporal DDL for `02` §5's schema.
2. **Rewrite `refreshPitchBaselines` as an append** (`app/api/update/route.ts:241–290`), keeping `pitch_baselines` as a view over `WHERE upper_inf(sys_period)` so no consumer changes.
3. **Add `ingested_at` to both pitch tables, forward-only, seeded NULL** (`DEFAULT NULL` supplied by the upsert; a volatile default rewrites the table), publish the date it starts, and pair it with `10` §7's run ledger. Prerequisite for `03-late-arriving-data.md`.
4. **Put `moddatetime` on `players` and `player_season_stats`** so `updated_at` means one thing across all four write paths.
5. **Version `league_averages` instead of deleting it** — at 1,806 rows / ~9.5 MB per season, a range-close + insert makes every historical plus-stat reproducible against its own denominator.
6. **Snapshot published values with their version** at newsletter/overlay/`daily_cards` publish time: a snapshot is a valid-time record of a belief, the pattern Snowflake's Time Travel automates. → `07-snapshotting-vs-recompute.md`.
7. **Revisit `WITHOUT OVERLAPS` when Supabase ships PG 18**: it collapses §3.1's constraint into a primary key, and nothing above needs rewriting.

Items 1, 4 and 5 change a metric's inputs or schema, so each **updates `docs/VARIABLES.md` in the same commit.**

**Anti-recommendation — do not make `pitches` a system-versioned bitemporal table.** The topic taken to its natural conclusion is wrong four independent ways. **(i) The volume records nothing:** the 3-day re-sync writes each row ~4×, so versioning accrues ≈2.33M history rows and ≈1.3 GB of heap per season — 575 B/row × 8,877,621 rows is not a table you version to log no-ops. **(ii) The constraint is unaffordable:** a temporal key needs a GiST exclusion index over 8.88M rows on a table already at 29 indexes / 4,833 MB under an 8s statement cap, replacing a 3-column btree on the hottest write path. **(iii) There is no history to write:** no `created_at` has ever existed on either pitch table, so every row's start would be fabricated or `-infinity` — `10` §6's objection to row-grain `baseline_version` columns. **(iv) It aims at the wrong table:** the unknown vintage belongs to the *baseline*, 206 rows, where full history costs ~1.1 MB/season. Two smaller don'ts: do not wait on PG 18, and do not attempt `CREATE EXTENSION temporal_tables`, not installable on a hosted project.

**Single highest-leverage next action:** run `CREATE EXTENSION IF NOT EXISTS btree_gist;` and create `pitch_baseline_values` with the §3.1 exclusion constraint — empty, alongside the existing table, writing nothing yet. Reversible, costs kilobytes, and turns the top open hazard from "no schema can express this" into "one cron function needs rewriting."

---

## Sources

1. Kulkarni & Michels (2012) — [Temporal features in SQL:2011](https://sigmodrecord.org/publications/sigmodRecord/1209/pdfs/07.industry.kulkarni.pdf), *SIGMOD Record* 41(3) — what the standard mandates; §2's column headings.
2. Snodgrass (1999) — [Developing Time-Oriented Database Applications in SQL](https://www2.cs.arizona.edu/~rts/tdbbook.pdf) — the valid/transaction split; closed-closed bounds double-count.
3. PostgreSQL Wiki — [SQL2011Temporal](https://wiki.postgresql.org/wiki/SQL2011Temporal) — application- and system-time pursued separately; system versioning still a proposal.
4. PostgreSQL — [18.0 Release Notes](https://www.postgresql.org/docs/release/18.0/) — the scope of `WITHOUT OVERLAPS` and temporal `FOREIGN KEY`.
5. depesz (2026) — [Waiting for PG 19 — UPDATE/DELETE FOR PORTION OF](https://www.depesz.com/2026/04/02/waiting-for-postgresql-19-add-update-delete-for-portion-of/) — dates `FOR PORTION OF` to PG 19.
6. PostgreSQL — [Range Types](https://www.postgresql.org/docs/current/rangetypes.html) — `tstzrange`, half-open default, NULL bounds; §3.1's pattern.
7. PostgreSQL — [Range Functions and Operators](https://www.postgresql.org/docs/current/functions-range.html) — `@>`, `&&`, `upper_inf`: §3.2's stand-ins for `FOR SYSTEM_TIME`.
8. PostgreSQL — [btree_gist](https://www.postgresql.org/docs/current/btree-gist.html) — lets a GiST exclusion constraint carry `=` on scalar keys.
9. PostgreSQL — [Constraints § Exclusion](https://www.postgresql.org/docs/current/ddl-constraints.html) — `EXCLUDE USING gist`, enforced by an index.
10. PostgreSQL — [INSERT](https://www.postgresql.org/docs/current/sql-insert.html) — `ON CONFLICT DO UPDATE` needs a unique arbiter; §4's incompatibility.
11. PostgreSQL — [spi contrib § moddatetime](https://www.postgresql.org/docs/current/contrib-spi.html) — the stock `updated_at` trigger item 4 wants.
12. Supabase — [Postgres Extensions](https://supabase.com/docs/guides/database/extensions) — `btree_gist` present, `temporal_tables`/`periods` absent.
13. Supabase — [Self-hosted: upgrading PG 15 → 17](https://github.com/orgs/supabase/discussions/46080) — PG 17 is the platform default as of June 2026; §2's ceiling.
14. PostgREST — [Tables and Views](https://docs.postgrest.org/en/stable/references/api/tables_views.html) — range operators; `.upsert()`'s `ON CONFLICT`.
15. arkhipov — [temporal_tables](https://github.com/arkhipov/temporal_tables) — the reference C `versioning()` trigger and history-table split.
16. nearform — [temporal_tables (PL/pgSQL)](https://github.com/nearform/temporal_tables) — the managed-Postgres port; the `_nochecks` tradeoff.
17. Snowflake — [Time Travel](https://docs.snowflake.com/en/user-guide/data-time-travel) — transaction-time-only history on a retention window; item 6's model.

**Triton-internal evidence.** Code-verified 2026-08-12, in `app/api/update/route.ts` unless noted: the destructive `ON CONFLICT (pitch_name, game_year) DO UPDATE SET …` in `refreshPitchBaselines` (`:241–290`, clause at `:269`); the pitch upsert on `game_pk,at_bat_number,pitch_number`, `ignoreDuplicates: false` (`:148–152`); the 3-day re-sync `start = addDaysToYmd(today, -3)` (`app/api/cron/pitches/route.ts:36–38`); the `players` ingest upsert, `ignoreDuplicates: true` (`:60`); `players.updated_at` set by hand at `app/api/cron/roster/route.ts:49–52` but not at `app/api/backfill-players/route.ts:54`; the repo's only `set_updated_at BEFORE UPDATE` triggers, on eight `work_*` tables (`scripts/create-work-tables.sql:265–283`); `DELETE FROM league_averages WHERE season = p_season` opening `refresh_league_averages` (`scripts/create-refresh-league-averages.sql:49`; re-inserts `:239`, `:445`, `:580`, `:725`), whose DDL pairs PK `(season, level, role, metric)` with `updated_at` (`scripts/create-league-averages.sql:15–27`); `player_season_stats.updated_at` (`create-player-season-stats.sql:18`); `compete_pitch_sessions.session_date` + `uploaded_at` (`create-compete-pitches.sql:27–37`). **Measured centrally 2026-08-12** — every row count, size, page count and date range in the §5 and §6 tables, plus: no `created_at`/`updated_at` on either pitch table, no timestamp column on `pitch_baselines`, `last_analyze`/`last_autoanalyze` NULL everywhere inspected. **Derived here:** heap B/row = pages × 8192 ÷ rows → `pitches` 575, `milb_pitches` 401; from measured sizes, `pitch_baselines` 358, `league_averages` 349, `player_season_stats` 172, `players` 99. ~775k `pitches` rows/season over 11.45 seasons × 3 redundant versions ≈ 2.33M rows ≈ 1.31 GB/season, against ~17 `pitch_name` values × ~180 baseline refreshes ≈ 3,100 rows ≈ 1.1 MB/season — ≈1,200×. The ≈249,000-row 2026-08-11 rescore, 29 indexes / 4,833 MB, and the 8s statement cap carry from `metric-governance/02-metric-versioning-reproducibility.md` §3 and `10-audit-trails-provenance.md` §6.
