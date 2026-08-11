---
title: Constraint Design in Postgres — The Cheapest Validation Layer
domain: data-quality
tags: [constraints, check-constraints, foreign-keys, not-valid, zero-downtime-ddl, locking, domains, deferrable]
sources_reviewed: 18
last_updated: 2026-08-11
---

# Constraint Design in Postgres — The Cheapest Validation Layer

## TL;DR

- **A constraint is the only validation every write path must obey.** Application code binds one path; a `CHECK` binds the SQL editor, the backfill script, the cron, and next year's migration. (documented)

- **Triton clamps `stuff_plus` to [0,200] in application SQL and enforces it nowhere.** `route.ts:322` wraps the score in `GREATEST(0, LEAST(200, …))`. A rescore, a backfill, or an ad-hoc `run_mutation` can write 350 and nothing objects. (measured)
- **Triton's posture is bimodal: new small tables get constraints, analytics tables get none.** `create-work-tables.sql` and `create-league-averages.sql` are full of `CHECK`/`REFERENCES`; `pitches`, `players`, `milb_pitches` carry nothing past the natural-key unique index. `integrity_checks.status` even documents its four legal values in a comment instead of a `CHECK` (`create-integrity-checks.sql:8`). (measured)
- **Every constraint on `pitches` (8.89M rows, 29 indexes) must be added `NOT VALID`**, because a validating `ADD CONSTRAINT` scans the whole table and blows both the 8s `statement_timeout` and the 8s `lock_timeout` on `authenticator`. (documented + inferred)
- **DDL cannot go through `run_mutation`** (DML only). Triton's DDL path is the SQL editor or `psql "$DATABASE_URL" -f scripts/*.sql` (`docs/retrosheet.md:40-41`) *(verify its role and timeout)*. (measured)
- **A `pitches.pitcher → players.id` FK is unsafe today for one fixable reason.** `syncNewPlayers(rows)` runs at `route.ts:172` — **after** the pitch upsert loop at 150–169. A debutant's pitches would be rejected, counted into `errors`, and lost permanently. A statement reorder fixes it. (measured)
- **Triton already does the FK's job in application code, badly.** `checkOrphanedPitchers`/`checkOrphanedBatters` heal orphans nightly, but they `LIMIT 200` and **return `status: 'pass'` when the query itself errors** (`dataIntegrity.ts:108-116`) — one reason 776 check rows over 95 days contain zero `fail`s. (measured)
- **Deferrable constraints cannot arbitrate `ON CONFLICT`.** The pitch ingest upserts on `(game_pk, at_bat_number, pitch_number)`; making that key `DEFERRABLE` breaks the nightly ingest. (documented)
- **Constraints are wrong when the rule is cross-row, cross-table, or time-varying.** A `CHECK` sees one row and must be immutable (`02-declarative-expectations.md`). (documented)

---

## 1. The catalogue, with the cost that matters

A constraint binds every writer forever for one-time DDL; application code binds one path and breaks the moment a second appears. Triton's `stuff_plus` clamp is the second impersonating the first. The bimodality is mechanical, not philosophical: the analytics tables were already large when someone thought about it, and constraining a large table *looks* dangerous. §5 is why it isn't. (Dimensions: `01-data-quality-dimensions.md`.)

| Constraint | Enforces | Backing index | Add-time lock | Write cost |
|---|---|---|---|---|
| `NOT NULL` | presence | none | `ACCESS EXCL` + scan (PG ≤17, unless a proving `CHECK` exists) | ~zero |
| `CHECK` | row-local predicate | none | `ACCESS EXCL` + scan (skippable) | one expression eval |
| `UNIQUE`/`PK` | no duplicates | **creates one** | `ACCESS EXCL` + build (avoidable, §5.2) | full index maintenance |
| `FOREIGN KEY` | referential integrity | needs one on parent, wants one on child | `SHARE ROW EXCL` + scan (skippable) | lookup + row lock per write (§6) |
| `EXCLUDE` | pairwise row conflict | **creates a GiST/btree index** | `ACCESS EXCL` + build | index maintenance + conflict search |

Three things that bite. **`CHECK` passes on NULL** — "satisfied if the check expression evaluates to true **or the null value**" — so `CHECK (stuff_plus BETWEEN 0 AND 200)` does not require the column present, right for Triton where an unscored pitch is legitimate. **`UNIQUE` treats NULLs as distinct** unless declared `NULLS NOT DISTINCT` (PG 15+). And **`EXCLUDE` generalizes `UNIQUE` to any operator**, canonically for non-overlapping ranges — Triton's candidate is `broadcast_sessions`, not worth DDL yet.

**PG 18:** `NOT NULL` specs now live in `pg_constraint` and can be set `NOT VALID`, removing the reason for GitLab's `CHECK (col IS NOT NULL) NOT VALID` workaround. Confirm Supabase's version first. *(verify)*

---

## 2. Enum vs lookup table vs CHECK

| | `CHECK (col IN (…))` | Native `enum` | Lookup table + FK |
|---|---|---|---|
| Add a value | `ALTER TABLE`, cheap when small | `ALTER TYPE … ADD VALUE` | `INSERT`, no DDL |
| Remove / reorder | trivial | **impossible** short of recreating the type | `DELETE`; order column |
| Metadata | no | no | **yes** |
| Gotcha | none | a value added in a transaction is unusable until commit | join cost |

**Rule.** `CHECK` when the set is small, stable, and metadata-free (`integrity_checks.status`, `league_averages.role`); lookup table when it grows at runtime; **native enums basically never** — losing the ability to remove or reorder values is a permanent liability for a marginal storage win.

Triton's choices here are right, including leaving its two biggest value-set columns (`pitches.pitch_type`, `pitch_name`) as unconstrained text: Statcast adds pitch names mid-season, and a `CHECK` would reject legitimate new data and fail the ingest. Triton uses a detector instead (`checkNewPitchNames`) — **the canonical case of a constraint being the wrong tool** (§7).

---

## 3. Domains

A domain is "a data type with optional constraints," good for "abstracting common constraints into a single location." Triton's candidate: MLBAM player IDs, which appear as `pitcher`, `batter`, `fielder_2..9`, and `on_1b/2b/3b` across `pitches`, `milb_pitches`, and `players.id`.

```sql
CREATE DOMAIN mlbam_id AS integer CHECK (VALUE > 0);
```

**Not on existing tables** — converting a column to a domain type is `ALTER COLUMN … TYPE`, rewriting 9.7 GB plus a 4.8 GB index rebuild on a disk-pressured plan. Use domains on the next new table with player IDs (`biomech_captures`, `compete_pitches`) and let the pattern spread forward. Documented trap: never put `NOT NULL` in a domain — those constraints are checked at cast time, so the column can still read as NULL. Allow NULL in the domain, apply column-level `NOT NULL` separately.

---

## 4. Deferrable constraints, and the trap Triton must avoid

Only `UNIQUE`, `PRIMARY KEY`, `EXCLUDE`, and `REFERENCES` accept `DEFERRABLE`; "`NOT NULL` and `CHECK` constraints are not deferrable." Deferral solves one problem: mutually-dependent writes in one transaction where the intermediate state is invalid but the final state is fine.

**It cannot solve Triton's ordering problem** (§6). PostgREST issues each upsert batch in its own transaction, so there is no transaction spanning the pitch and player writes to defer *to*. And fatally:

> Note that deferrable constraints cannot be used as conflict arbiters in an `INSERT` statement that includes an `ON CONFLICT` clause.

Triton's ingest is `upsert(batch, { onConflict: 'game_pk,at_bat_number,pitch_number' })` (`route.ts:148`). Make that key `DEFERRABLE` and every batch fails with *no unique or exclusion constraint matching the ON CONFLICT specification*. Same for `players.id` (`onConflict: 'id'`, line 60) and every other upsert target.

---

## 5. Adding constraints to `pitches` without an ACCESS EXCLUSIVE stall

`pitches`: 8.89M rows, 9.7 GB, 4.8 GB across 29 indexes. The naive `ADD CONSTRAINT` takes `ACCESS EXCLUSIVE` — which "conflicts with locks of all modes," so it blocks reads too — and holds it for a full-table scan. Under the 8s cap that statement dies; from a privileged session it stalls the platform for minutes.

### 5.1 CHECK / FK / NOT NULL — `NOT VALID`, then `VALIDATE` separately

> "Normally, this form will cause a scan of the table to verify that all existing rows in the table satisfy the new constraint. But if the `NOT VALID` option is used, this potentially-lengthy scan is skipped."

Step 1 is a catalog change, `ACCESS EXCLUSIVE` held for microseconds. **From that moment every new write is checked**; only pre-existing rows stay unverified.

```sql
-- Step 1: instant. From psql or the SQL editor — never through run_mutation.
SET lock_timeout = '3s';   -- fail fast rather than queue behind a long read
ALTER TABLE pitches
  ADD CONSTRAINT pitches_stuff_plus_range
  CHECK (stuff_plus IS NULL OR (stuff_plus >= 0 AND stuff_plus <= 200))
  NOT VALID;
```

Step 2 is the deferred scan, cheap in the way that matters: it "does not need to lock out concurrent updates, since it knows that other transactions will be enforcing the constraint … only pre-existing rows need to be checked."

```sql
-- Step 2: minutes of scanning; readers and writers proceed. Needs a session without the
-- 8s cap, and clear of the 09:00–09:30 UTC crons (conflicts with VACUUM/ANALYZE).
SET lock_timeout = '3s';
SET statement_timeout = 0;
ALTER TABLE pitches VALIDATE CONSTRAINT pitches_stuff_plus_range;
```

Prove it will succeed first; a failed `VALIDATE` wastes the whole scan:

```sql
SELECT count(*) FROM pitches
WHERE stuff_plus IS NOT NULL AND (stuff_plus < 0 OR stuff_plus > 200);
```

**Leaving a constraint `NOT VALID` forever is legitimate** and usually right here: new writes are protected, and the only loss is constraint exclusion on an unvalidated `CHECK` — irrelevant on a non-partitioned table. Zero above → validate. A few legacy rows → fix, then validate. Thousands → stay `NOT VALID` and open a repair ticket (`11-remediation-backfill-safety.md`).

### 5.2 UNIQUE / PRIMARY KEY — build concurrently, then adopt the index

```sql
-- No transaction block. SHARE UPDATE EXCLUSIVE, not ACCESS EXCLUSIVE: builds "without
-- taking any locks that prevent concurrent inserts, updates, or deletes." Two table
-- scans — slower in wall-clock, invisible to users.
CREATE UNIQUE INDEX CONCURRENTLY pitches_natural_key_uidx
  ON pitches (game_pk, at_bat_number, pitch_number);

-- MANDATORY: a failed build "leave[s] behind an 'invalid' index" ignored by queries
-- but "still consume[s] update overhead."
SELECT indisvalid FROM pg_index WHERE indexrelid = 'pitches_natural_key_uidx'::regclass;

-- Instant: "In all other cases, this is a fast operation."
ALTER TABLE pitches
  ADD CONSTRAINT pitches_natural_key UNIQUE USING INDEX pitches_natural_key_uidx;
```

`USING INDEX` has one scan trap: specify `PRIMARY KEY` and, if the columns aren't already `NOT NULL`, Postgres runs `SET NOT NULL` on each, which "requires a full table scan." Use `UNIQUE`, or set `NOT NULL` first via §5.1. Triton already has this index — the nightly `ON CONFLICT` could not resolve without it — but confirm it is a named constraint.

### 5.3 Rules for every DDL statement here

- **`SET lock_timeout` before any `ALTER TABLE`.** An `ACCESS EXCLUSIVE` request queued behind one long read blocks *every subsequent query* on the table; failing at 3s beats a 60s pileup.
- **Verify `indisvalid` after any concurrent build**, and keep DDL out of 09:00–09:30 UTC — the pitch → refresh → player-stats chain runs then, and both `VALIDATE` and `CREATE INDEX CONCURRENTLY` conflict with `VACUUM`/`ANALYZE`.
- **Every constraint gets a `scripts/*.sql` file** — that directory is the de facto migration log; uncommitted DDL is a schema change nobody can reproduce.

Full lock-conflict matrix: `Jo/postgres-performance/03-timeouts-locks-concurrency.md`.

---

## 6. The `pitches.pitcher → players.id` question

Highest-stakes constraint decision on the platform. Honest answer: **not yet — fix the write ordering first.**

### 6.1 Write cost is not the objection

FKs are enforced by system triggers: each insert of `pitches.pitcher` does an index lookup on `players` (16,924 rows — a few cache-resident pages) and takes a row-level `KEY SHARE` lock on the parent. Ingest is ~1,300 pitches/night and each row already pays 29 index writes, so two lookups are noise. The larger FK cost is on the *parent* side — deleting a `players.id` seq-scans 8.89M rows unless `pitches.pitcher` is indexed — but it is, and player rows are never deleted. (inferred; mechanism documented, magnitude from row counts)

### 6.2 The actual blocker: write ordering

```
app/api/update/route.ts:150-169   for (batch of 500) → supabase.from('pitches').upsert(batch)
app/api/update/route.ts:172       await syncNewPlayers(rows)
```

Pitches land **before** their players, so on any night a debut player appears the FK rejects that row. The 500-row batch fails wholesale (line 157: *"One bad row fails the whole batch"*), the recovery path at 160–168 retries individually so the 499 good rows land, and the debutant's rows fail again, increment `errors`, and get `console.error`'d. The cron returns 200, `trackCronRun` records success, and **those pitches are never retried by anything** — the Stuff+ failure mode in a new costume.

Today an orphan row simply exists and `checkOrphanedPitchers` backfills the player next morning. The FK would convert a self-healing problem into silent permanent data loss.

### 6.3 The fix is a statement reorder

Move `await syncNewPlayers(rows)` **above** the upsert loop — Cybertec's "foreign keys and insertion order" problem in its most literal form. `syncNewPlayers` already collects every pitcher and batter ID before any write, so it needs no new information.

Two residual risks: `syncNewPlayers` swallows People API failures (`catch { /* skip batch on error */ }`, line 55), so insert a `name: 'Unknown'` placeholder instead — `checkUnknownPlayers` heals those; and MiLB/Retrosheet ingests write player IDs too, so audit every writer.

Then add it `NOT VALID` — `SHARE ROW EXCLUSIVE`, no scan:

```sql
SET lock_timeout = '3s';
ALTER TABLE pitches
  ADD CONSTRAINT pitches_pitcher_fk FOREIGN KEY (pitcher) REFERENCES players(id) NOT VALID;
-- Validate later, or never. New rows are protected either way.
```

### 6.4 Meanwhile, the existing detector is lying

Do not read "`orphaned_pitchers` has never failed" as evidence there are no orphans:

```ts
// lib/dataIntegrity.ts:108-116
if (error || !orphans || orphans.length === 0) {
  return { check_name: 'orphaned_pitchers', status: 'pass', found: 0, remediated: 0,
           details: error ? { queryError: error.message } : {} }
}
```

**A query error returns `status: 'pass'`**, error text filed into `details` where nothing reads it; both checks also `LIMIT 200`, so `found` saturates. Zero `status='fail'` across 776 rows over 95 run days is a measurement artifact, not a health signal. Fix it before adding the FK — the pre-flight "are there orphans?" answer comes from this function.

---

## 7. When constraints are the wrong tool

| Situation | Why a constraint fails | Use instead |
|---|---|---|
| Value set grows upstream (`pitch_name`) | a new Statcast pitch would fail the ingest | detector (`checkNewPitchNames`) |
| Rule spans rows or tables | `CHECK` sees one row, cannot subquery | assertion suite, or a wider FK |
| Rule is time-varying or statistical | `CHECK` must be immutable and per-row | `04-distribution-drift-detection.md`, `05-anomaly-detection-timeseries.md` |
| History already violates it | validation fails | `NOT VALID` forever, or `11-remediation-backfill-safety.md` |
| Rejecting the row loses it forever | ingest has no dead-letter queue | quarantine table, then constrain |

The last row governs Triton. **A constraint is only safe on an ingest path that can survive a rejection**, and the pitch ingest cannot — a rejected row increments a counter and disappears. Constraints on values *our own code* produces (`stuff_plus` range) are safe; constraints depending on external ordering or external data (the FK) are not, until the path is fixed.

---

## 8. What Triton should do, in order

1. **`CHECK` on `integrity_checks.status`.** 776 rows, validates inline in milliseconds. Turns a SQL comment into an invariant, on the table whose job is telling the truth about data.
   ```sql
   ALTER TABLE integrity_checks ADD CONSTRAINT integrity_checks_status_check
     CHECK (status IN ('pass','warn','fail','remediated'));
   ```
2. **Make `checkOrphanedPitchers`/`checkOrphanedBatters` return `fail` on query error**, and raise the `LIMIT 200`. A detector that reports pass on its own failure manufactures confidence. Prerequisite for step 5.
3. **`CHECK (stuff_plus IS NULL OR stuff_plus BETWEEN 0 AND 200) NOT VALID` on `pitches`**, then the pre-check count; validate only if it returns 0. Same for other clamped derived columns. Fixes the `route.ts:322` gap.
4. **Move `syncNewPlayers(rows)` above the upsert loop** and insert an `'Unknown'` placeholder when the People lookup fails. Unlocks step 5, defensible on its own.
5. **Then** add `pitches_pitcher_fk` and `pitches_batter_fk` as `NOT VALID` FKs — validate in a quiet window once the orphan check is trustworthy, or never.
6. **Constrain every new table's status/enum column as a standing habit** (`create-work-tables.sql` is the model), and audit the `pitches` natural key: a named `UNIQUE` constraint, not a bare index, and **not** `DEFERRABLE` (§4).

**Anti-recommendation — do not add `NOT NULL` to `pitches` columns, and do not validate constraints on `pitches` just because you can.** Statcast legitimately omits `release_speed`, `pfx_x`, and `release_extension` on a meaningful fraction of pitches; `NOT NULL` there rejects real data with no dead-letter path to recover it, and on PG ≤17 it demands a full-table scan under `ACCESS EXCLUSIVE`. And validation *feels* like finishing the job, but on 8.89M rows it is a multi-minute `SHARE UPDATE EXCLUSIVE` scan conflicting with autovacuum on a table already carrying 1.44M dead tuples. `NOT VALID` forever protects every future write — the entire point; validation only buys planner optimizations Triton doesn't use.

**Highest-leverage next action: step 2.** Everything else depends on knowing whether `pitches` has orphaned player IDs, and the function that answers that currently reports success when it fails.

---

## Sources

1. PG — [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — load-bearing: `NOT VALID` skips the "potentially-lengthy scan"; `VALIDATE` takes `SHARE UPDATE EXCLUSIVE`; `ADD FOREIGN KEY` needs "only a SHARE ROW EXCLUSIVE lock"; `USING INDEX` is fast unless it must `SET NOT NULL`.
2. PG — [Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — all six types; `CHECK` satisfied by "true or the null value".
3. PG — [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html) — `CONCURRENTLY`: two scans, no transaction block, "invalid" index on failure that "still consume[s] update overhead".
4. PG — [CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html) — deferrable constraints "cannot be used as conflict arbiters" (§4's trap); `NULLS NOT DISTINCT`.
5. PG — [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) — `ACCESS EXCLUSIVE` "conflicts with locks of all modes"; §5's conflict sets.
6. PG — [CREATE DOMAIN](https://www.postgresql.org/docs/current/sql-createdomain.html) — §3's rule against `NOT NULL` in a domain.
7. PG — [Enumerated Types](https://www.postgresql.org/docs/current/datatype-enum.html) — values "cannot be removed … nor can the sort ordering … be changed"; the core §2 argument.
8. PG — [ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html) — `ADD VALUE` in a transaction is unusable until commit.
9. PG — [18 Release Notes](https://www.postgresql.org/docs/current/release-18.html) — `NOT NULL` now in `pg_constraint`, settable `NOT VALID`.
10. PG wiki — [Don't Do This](https://wiki.postgresql.org/wiki/Don%27t_Do_This) — `char(n)`, unzoned `timestamp`, `serial`, `NOT IN`; no anti-enum entry, so §2's stance is Jo's.
11. Crunchy Data — [Postgres Constraints for Newbies](https://www.crunchydata.com/blog/postgres-constraints-for-newbies) (Christensen) — the "safety net against application code that isn't working quite right" case.
12. Xata — [Introducing pgroll](https://xata.io/blog/pgroll-schema-migrations-postgres) — expand/contract via views; `NOT NULL` added "using the NOT VALID clause".
13. ankane — [strong_migrations](https://github.com/ankane/strong_migrations) — "Adding a check constraint blocks reads and writes"; codifies §5.1's split.
14. GitLab — [Avoiding downtime in migrations](https://docs.gitlab.com/development/database/avoiding_downtime_in_migrations/) — `with_lock_retries`; batched background migrations.
15. GitLab — [Adding NOT NULL constraints](https://docs.gitlab.com/development/database/not_null_constraints/) — three-release backfill → add-invalid → async-validate.
16. Cybertec — [Foreign keys and insertion order](https://www.cybertec-postgresql.com/en/postgresql-foreign-keys-and-insertion-order-in-sql/) — parent-before-child; exactly §6.2.
17. Cybertec — [Foreign key indexing and Performance](https://www.cybertec-postgresql.com/en/index-your-foreign-key/) (Albe) — unindexed cascading delete >300 ms, sub-ms once indexed. *(URL search-confirmed; site 403s fetches — verify before quoting.)*
18. Percona — [Should I Index Foreign Keys?](https://www.percona.com/blog/should-i-create-an-index-on-foreign-keys-in-postgresql/) (Batista) — "we should not indiscriminately create indexes on all FKs" (§6.1); no benchmarks.

**Triton-internal evidence (measured 2026-08-11):** `stuff_plus` clamp at `app/api/update/route.ts:322`; upsert-then-`syncNewPlayers` ordering at `:148-172`; batch-failure comment `:157`; People-API swallow `:55`; `status`-without-`CHECK` at `scripts/create-integrity-checks.sql:8`; orphan-check pass-on-error at `lib/dataIntegrity.ts:108-116`; DDL path at `docs/retrosheet.md:40-41`. `players` = 16,924 rows (`CLAUDE.md`'s "4,017" is stale). `integrity_checks`: 776 rows / 95 run days since 2026-05-08 / 8 checks, zero `fail` ever, chronic un-actioned warns (`materialized_views` ×56, `new_pitch_names` ×54, `pitch_baselines` ×47). `pitches` sizing and 1.44M dead tuples from `Jo/context/triton-context.md`.
