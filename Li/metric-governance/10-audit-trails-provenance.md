---
title: Audit Trails & Provenance — Knowing What Produced This Number
domain: metric-governance
tags:
  - provenance
  - lineage
  - audit-trail
  - w3c-prov
  - openlineage
  - append-only
  - reproducibility
  - run-ledger
sources_reviewed: 18
last_updated: 2026-08-11
---

# Audit Trails & Provenance — Knowing What Produced This Number

## TL;DR

- **Provenance, lineage, and audit trail are three artifacts, not three words.** Lineage is type-level and design-time (*which tables feed which*); provenance is instance-level and historical (*what produced this value*); an audit trail is action-level (*who did it, is the record trustworthy*). **(established)**
- **Provenance is the only one that cannot be reconstructed later.** Lineage lives in code and survives. `refreshPitchBaselines` does `ON CONFLICT … DO UPDATE`, so the input that scored last night's pitches ceased to exist at 09:10 UTC. **(computed — `app/api/update/route.ts`)**
- **`pitches.stuff_plus` is a stored number with no record of its baseline vintage, scoring time, or code version** — four of six reproducibility pins unrecorded (`02-metric-versioning-reproducibility.md` §1). **(computed)**
- **Consequence one: the 2026 column mixes at least two baseline vintages with no predicate separating them** — Feb–May nightly vintages plus ≈249k rows rescored 2026-08-11. Not wrong values; an incomparable column. **(computed)**
- **Consequence two: `stuff_plus IS NULL` means two different things** — structurally unscoreable (~0.4%, no `release_speed`) and "the pipeline failed to score this." Both are provenance failures, not quality failures: the *absence* of a value is a datum that needs a producer. **(computed)**
- **W3C PROV's load-bearing constraint is that an entity is immutable, and that is what Triton violates.** PROV cannot describe an overwritten row — nothing for `used` to point at. A destructive baseline upsert is un-PROV-able by construction. **(established)**
- **Row-grain provenance on `pitches` is the obvious move and it is wrong.** 8.89M rows, 29 indexes / 4,833 MB, 4.0% HOT ratio, 8s statement cap — and no true historical value to write. A ~180-row/season day-grain ledger is **lossless** here (the scorer's unit of work already *is* the `game_date`) and it disambiguates the NULL for free. **(computed — Jo, 2026-08-11)**
- **Append-only is a policy, not a type, and RLS will not enforce it here:** `service_role`, which every cron writes with, bypasses RLS — a `BEFORE UPDATE OR DELETE` trigger is what holds. And you cannot stamp a vintage you never recorded: `'unknown'` is the honest value for 2015–2026, and the provenance horizon is a date to publish, not hide. **(established)**

---

## 1. Three words, three artifacts

| | **Lineage** | **Provenance** | **Audit trail** |
|---|---|---|---|
| Grain | type-level: table, column, job | instance-level: this value, this run | event-level: the action |
| Question | what breaks if I change this? | what produced *this number*? | who did it, is the record trustworthy? |
| Recoverable later? | **yes** — regenerate from repo | **no** | **no** |
| Mutability | regenerated freely | append-only once written | append-only, tamper-evident |
| Owner | **Jo** (`data-reliability/08-lineage-impact-analysis.md`) | **Li** (this doc) | shared |

The distinction determines *when* you must act: on 2026-08-11 the lineage of `stuff_plus` was reconstructible from `app/api/update/route.ts` in twenty minutes, while the vintage of any given April row is permanently unknowable. Buneman and Cheney split provenance further into **where** (which input *value* was read in), **why** (which tuples justified it), and **how** (by what derivation). "Which baseline scored this row?" is a **where**-question with a **how** rider — Triton records neither — while the **why**, the pitch row itself, is stored but mutable, since Savant restates `pfx_x` and `pitch_name`.

---

## 2. W3C PROV as the model

PROV (W3C Rec., 2013) is three types and a few relations. Adopting the RDF stack here would be absurd; adopting the shape is free.

| PROV term | Meaning | Triton instance | Recorded? |
|---|---|---|---|
| **Entity** | a thing with *fixed* aspects | one `pitch_baselines` vintage; one day's `stuff_plus` values | no |
| **Activity** | something occurring over time on entities | one day-chunk `UPDATE`; one `refresh_league_averages(2026)` | partly |
| **Agent** | bears responsibility | the deploy SHA, the cron route, Trevor on an admin route | no |
| `used` | activity consumed entity | scoring `used` baseline vintage #41 | **no — the crux** |
| `wasGeneratedBy`, `wasDerivedFrom`, `wasAssociatedWith` + `hadPlan` | output ← run; vintage ← source pitches; run ↔ agent and *recipe* | 2026-06-15's values ← run #883 ← deploy `a79e0d2`, plan `stuff_plus@1.0.0` | no |

**Entities are immutable.** A change produces a **new** entity linked by `wasDerivedFrom` — which is what makes `used` meaningful, so a destructive upsert renders provenance *unrepresentable*, not just unrecorded. `pitch_baselines`' `ON CONFLICT DO UPDATE` is the single line that puts Triton outside the model; fixing it (append + a `latest` view) costs ~3,600 rows/season.

**OpenLineage** carries the same content as a `RunEvent` (`START`/`COMPLETE`/`FAIL`) with `run`, `job`, `inputs`, `outputs`, and extensible *facets* — `sourceCodeLocation` and `outputStatistics` are directly on point. Jo is right that Triton should adopt neither it nor Marquez: no producer exists for Next.js route handlers. But `cron_runs.counts` is already `JSONB` — a facet bag with no schema — so writing OpenLineage-shaped keys into it costs one convention and buys a migration path.

---

## 3. Triton's gap, precisely

### 3.1 The stored value with no producer

`pitches.stuff_plus` carries no `scored_at`, no `baseline_version`, no `code_sha`. With a nightly destructive baseline overwrite and a 3-day Savant re-sync that silently re-scores rows against newer baselines, the column is **a mixture of populations wearing one name**: Feb–May nightly vintages plus ≈249,000 rows rescored against near-final baselines on 2026-08-11 — and the mix is not clean by month (April alone holds ~538 August-vintage rows). Every value is correct under its own inputs, so this is a **governance defect, not a quality one**: the column cannot be averaged, ranked, or trended without pooling incomparable measurements.

### 3.2 NULL with no producer

`stuff_plus IS NULL` means "structurally unscoreable" (~0.4%) or "the pipeline failed"; Jo's `data-quality/07-null-semantics-missingness.md` §4 adds a third, "no `pitch_baselines` row for `(pitch_name, game_year)`." The instinct is to fix this *in* `pitches` — status column, generated column, sentinel — and all three are wrong. A day-grain ledger resolves it from outside:

| Ledger entry for the `game_date`? | Row inputs present? | Value | Meaning |
|---|---|---|---|
| absent | — | NULL | **pipeline failure** — page on it |
| present, `success` | `release_speed`/`pitch_name` NULL | NULL | **not applicable** — drop from numerator *and* denominator |
| present, `success` | present | NULL | **no baseline row** — new pitch name, or day 1 of a season |
| present | present | non-NULL | scored; vintage = run's `baseline_version_id` |

The whole disambiguation, at ~180 rows/season, with no `ALTER TABLE` — the strongest argument for run-grain provenance on this platform.

### 3.3 The marker that never fires

`/api/cron/refresh` upserts `system_metadata.mv_last_refreshed` **only inside the success branch**. The refresh has failed nightly since 2026-06-26, so the key has never been written — and a reader cannot distinguish "never succeeded" from "never deployed."

> **Rule:** write the record unconditionally with a status field. A marker that exists only on success encodes one bit and loses it exactly when it matters.

`cron_runs` earns a milder version of the same critique: `trackCronRun` inserts a `running` row then **UPDATEs** it, so it is a mutable status row rather than an append-only ledger.

---

## 4. What Triton already does well

| Asset | What it is | Gap |
|---|---|---|
| **`docs/Queries.md`** | 21 dated sections / 1,148 lines, every ad-hoc query with SQL + result; append-only by convention and **tamper-evident by git** — a commit history *is* a hash chain | Logs **reads**, not writes |
| **`integrity_checks`** | 776 rows / 95 run days, one row per check per run, never updated — a real append-only history (`run_id`, `status`, `found`, `details JSONB`) | Zero failures ever; no check yet capable of failing |
| **`cron_runs`** | `trackCronRun`: job, times, `status`, `duration_ms`, `counts JSONB` — the Activity table already exists, with a schemaless facet bag | Records that a run happened, not what it *used* or wrote; row is UPDATEd |

`system_metadata` belongs on the list too, with the harshest gap: single mutable rows, no history, `mv_last_refreshed` success-only (§3.3). Do not rebuild these — generalize the `docs/Queries.md` convention so **every value-changing run gets the same treatment.** It would have made the 2026-08-11 repair self-describing.

---

## 5. Append-only tables in Postgres

**RLS does not enforce append-only here.** Owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is set, and `service_role` — which `supabaseAdmin` uses for every cron write — bypasses it entirely. A policy with no `UPDATE`/`DELETE` clause protects against `anon`/`authenticated` and not at all against the writer you care about. A trigger fires regardless of role:

```sql
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only %: % forbidden', TG_TABLE_NAME, TG_OP
  USING ERRCODE = '42501'; END $$;

CREATE TRIGGER slr_no_mutate BEFORE UPDATE OR DELETE ON stuff_plus_scoring_runs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
```

Row triggers never see `TRUNCATE`; add a matching `BEFORE TRUNCATE … FOR EACH STATEMENT` trigger or the table is not truly append-only.

| Pattern | Verdict for Triton |
|---|---|
| **Trigger row-audit** (`audit.logged_actions`, OLD/NEW per change) | **Reject on `pitches`** — doubles write cost. Defensible on `season_constants` / `park_factors` |
| **SCD2 effective-dating** (`tstzrange` + btree_gist) | **Adopt implicitly** — a versions table *is* Type 2 |
| **Hash-chained tamper evidence** or **event sourcing** | **Reject.** This trail serves the operator, not a regulator |

---

## 6. Row-grain vs run-grain — the arithmetic, and the pick

| | **Row-grain** — `ALTER TABLE pitches ADD scored_at, baseline_version` | **Run-grain** — `stuff_plus_scoring_runs` |
|---|---|---|
| Schema change | `ADD COLUMN` nullable is catalog-only but takes `ACCESS EXCLUSIVE` on a hot 8.89M-row table | `CREATE TABLE`; no lock on `pitches` |
| Backfill | 8.89M `UPDATE`s. **4.0% HOT ratio** ⇒ nearly every update dirties all **29 indexes / 4,833 MB**; already **13.9% dead tuples**, one autovacuum since 2026-05-17 | none |
| Chunking | ~8k rows/statement under the 8s cap ⇒ ≈180 days × 12 seasons ≈ **2,100+ statements**, plus a cursor for the 300s Vercel ceiling | one INSERT in the existing loop |
| **Historical truth** | **none.** No vintage recorded for 2015 → 2026-08-11 ⇒ every row gets `NULL` (useless) or a guess (**fabrication**) | seed `mode='unknown'` — honest, queryable |
| Lossiness | none in principle | **none in practice** (below) |

**Pick: run-grain.** Not a compromise; the correct grain. Row-grain is only necessary when the producing activity is finer-grained than the record you would keep, and `applyStuffPlusForDateRange` issues **one UPDATE per `game_date`** — so every row it scores shares one vintage, one SHA, one timestamp. A per-row copy is 8.89M duplications of ~2,200 distinct tuples.

> **Record provenance at the grain of the activity, not of the output.** They coincide only when the job writes one row at a time.

**Where run-grain is genuinely lossy, said out loud:** the 3-day re-sync can score one `game_date` on D, D+1 and D+2, and the ledger records three runs without recording which rows each touched. Bounded, though — those vintages differ by ≤3 days of movement on a season-to-date aggregate, against a season-scale drift estimated at 0.6–1.2 Stuff+ points (`02` §3.3). Record `rows_scored` per pass and treat the latest run as authoritative.

---

## 7. Proposed schema — the practical minimum

`02` §5 specifies `pitch_baseline_versions` / `pitch_baseline_values`; this doc owns the ledger.

```sql
-- Day grain, append-only (enforce with the §5 triggers), ~180 rows/season.
CREATE TABLE stuff_plus_scoring_runs (
  id                  bigserial   PRIMARY KEY,
  game_date           date        NOT NULL,
  scope               text        NOT NULL DEFAULT 'mlb',   -- 'mlb' | 'milb'
  scored_at           timestamptz NOT NULL DEFAULT now(),
  cron_run_id         bigint,                                -- → cron_runs.id (the Activity)
  baseline_version_id bigint REFERENCES pitch_baseline_versions,  -- what it `used`; NULL = unknown
  formula_version     text        NOT NULL,                  -- 'stuff_plus@1.0.0'  (hadPlan)
  code_sha            text,                                  -- VERCEL_GIT_COMMIT_SHA
  triggered_by        text        NOT NULL DEFAULT 'cron'    -- the Agent
                        CHECK (triggered_by IN ('cron','admin','manual','backfill')),
  mode                text        NOT NULL
                        CHECK (mode IN ('nightly','repair','rescore','unknown')),
  status              text        NOT NULL CHECK (status IN ('success','error')),  -- on failure too
  rows_scored         int         NOT NULL DEFAULT 0,
  error_text          text
);
CREATE INDEX ON stuff_plus_scoring_runs (game_date, scope, scored_at DESC);
```

The §3.2 disambiguation then needs no new column on `pitches`: `LEFT JOIN LATERAL` the newest successful ledger row per `game_date` and split the NULLs with `count(*) FILTER (WHERE release_speed IS NULL OR pitch_name IS NULL)` as `not_applicable` against its complement as `unexplained`. `unexplained > 0` **with** a ledger row is a missing-baseline problem; **without** one it is an outage — today the same NULL. Keep windows to 2–3 days: Jo measured a 7-day coverage scan at 9.9s cold against an 8s cap.

### 7.1 Reproducible-pipeline practice, and the honest horizon

ACM's badging terminology (v1.1, realigned to NISO) separates **repeatable**, **reproducible** (different team, *same artifacts*), and **replicable** (different artifacts). A platform owes its users *reproducible*: value + code SHA + input version must yield the same number again. Five pins deliver that; Triton has one and a half — code (in git, **never stamped**), inputs (**absent**, overwritten nightly), parameters (unlogged), environment (`package-lock.json`), randomness (n/a).

**The provenance horizon.** With the ledger shipped on date *D*, everything from *D* forward is reproducible and everything before is not. That boundary belongs in `docs/VARIABLES.md` beside `stuff_plus`, phrased as a date; backfilling a fabricated vintage to erase it converts *known* unknowns into *confident wrong groupings*. See `temporal-modeling/11-reproducible-historical-queries.md` for numbers that cannot be reproduced and must be labelled instead.

---

## 8. What Triton should do, in order

1. **Stamp `VERCEL_GIT_COMMIT_SHA`, `computed_at`, and the resolved constants year into every stats API response and `cron_runs.counts` payload.** One line, no migration; the formula is in git, so a SHA alone makes any screenshot reproducible. *(Highest leverage.)*
2. **Make `mv_last_refreshed` — and every marker like it — write unconditionally with a `status`** (§3.3). The failing refresh itself goes to **Jo**; the marker semantics are Li's.
3. **Convert `refreshPitchBaselines` from `ON CONFLICT DO UPDATE` to an append** (`02` §5), with a `pitch_baselines` view over the newest version so nothing breaks. The PROV-entity fix, and a prerequisite for the rest.
4. **Ship `stuff_plus_scoring_runs` (§7)** with the §5 triggers — one INSERT inside the per-day loop that already exists. Seed history as `mode='unknown', baseline_version_id = NULL`.
5. **Register the §7 coverage split in `integrity_checks`** on 2–3 day windows. That table has 776 rows and zero failures ever; this gives it a check that can fail for an actionable reason.
6. **Extend the `docs/Queries.md` convention to writes** — every backfill, rescore, repair, and constants edit gets a dated entry with SQL and row count. Zero schema cost.
7. **Record the provenance horizon and the 2026 two-vintage mixture in `docs/VARIABLES.md`** under `stuff_plus`; any schema or metric change here **updates `docs/VARIABLES.md` in the same commit.** The display consequence — a "not comparable within season" marker — goes to **Cas**.
8. **Add a trigger row-audit to `season_constants` and `park_factors` only** — small, hand-edited, and they silently restated every 2026 hitter's wRC+ by 5–6 points on 2026-05-08 (`02` §2.2).

**Anti-recommendation — do not add `scored_at` and `baseline_version` columns to `pitches` and backfill them.** It fails three independent ways. **(i) There is nothing true to write:** no vintage was recorded for 2015 → 2026-08-11, so the backfill stamps 8.89M rows with `NULL` or an inferred value — fabrication that invites confident, wrong `GROUP BY`s, worse than the current known-unknown. **(ii) The cost is measured, not hypothetical:** a 4.0% HOT ratio means nearly every UPDATE dirties all 29 indexes / 4,833 MB, on a table at 13.9% dead tuples with one autovacuum since 2026-05-17, under an 8s statement cap and a 300s function ceiling. **(iii) It is redundant:** scoring is already a per-`game_date` activity, so a ~180-row/season ledger captures the same information losslessly at 0.002% of the write cost. Two smaller don'ts: do not adopt OpenLineage/Marquez, and do not rely on RLS to make an audit table append-only — `service_role` bypasses it, so use the trigger.

**Single highest-leverage next action:** ship item 1 today. Every number the platform serves from that moment becomes traceable to a formula, for one line and no migration. Item 3 is the structural fix; item 1 starts the clock on the provenance horizon.

---

## Sources

1. W3C — [PROV-DM](https://www.w3.org/TR/prov-dm/) (Rec., 2013) — Entity/Activity/Agent, `used`, `wasGeneratedBy`, `wasDerivedFrom`, `hadPlan`.
2. W3C — [PROV-CONSTRAINTS](https://www.w3.org/TR/prov-constraints/) — entities have *fixed aspects*; the rule a destructive upsert violates.
3. Buneman, Khanna & Tan (2001) — [Why and Where: A Characterization of Data Provenance](https://link.springer.com/chapter/10.1007/3-540-44503-X_20), ICDT — the why/where split in §1.
4. Cheney, Chiticariu & Tan (2009) — [Provenance in Databases: Why, How, and Where](https://doi.org/10.1561/1900000006), *FnTDB* — the standard survey; adds how-provenance.
5. OpenLineage — [Object Model](https://openlineage.io/docs/spec/object-model) — `RunEvent`; run/job/dataset; START/COMPLETE/FAIL.
6. OpenLineage — [Facets](https://openlineage.io/docs/spec/facets/) — `sourceCodeLocation`, `outputStatistics`; the shape to imitate in `cron_runs.counts`.
7. Marquez — [Project site](https://marquezproject.ai/) — the reference OpenLineage server, named to be declined.
8. PostgreSQL — [CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html) — `BEFORE UPDATE OR DELETE` is per-row; `BEFORE TRUNCATE` must be statement-level.
9. PostgreSQL — [Trigger Procedures](https://www.postgresql.org/docs/current/plpgsql-trigger.html) — `TG_OP`, `TG_TABLE_NAME`, raising from a trigger.
10. PostgreSQL — [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — owner bypass; `FORCE ROW LEVEL SECURITY`.
11. PostgreSQL — [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — `ADD COLUMN` fast path; the `ACCESS EXCLUSIVE` lock behind §9's anti-recommendation.
12. PostgreSQL — [Heap-Only Tuples](https://www.postgresql.org/docs/current/storage-hot.html) — why an UPDATE on a 29-index table dirties all of them.
13. PostgreSQL Wiki — [Audit trigger 91plus](https://wiki.postgresql.org/wiki/Audit_trigger_91plus) — the canonical `audit.logged_actions` OLD/NEW implementation.
14. Supabase — [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — `service_role` bypasses RLS.
15. ACM — [Artifact Review and Badging v1.1](https://www.acm.org/publications/policies/artifact-review-and-badging-current) — repeatable / reproducible / replicable, realigned to NISO.
16. National Academies (2019) — [Reproducibility and Replicability in Science](https://nap.nationalacademies.org/catalog/25303/reproducibility-and-replicability-in-science) — provenance as a precondition.
17. Sandve et al. (2013) — [Ten Simple Rules for Reproducible Computational Research](https://doi.org/10.1371/journal.pcbi.1003285), PLOS Comp Biol — record each result's producing step.
18. Kimball Group — [SCD Types 0–7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/) — Type 2 effective-dating, which a versions table already is.

**Triton-internal evidence.** Code-verified 2026-08-11: `refreshPitchBaselines`' `ON CONFLICT DO UPDATE` and the per-`game_date` loop in `applyStuffPlusForDateRange` (`app/api/update/route.ts:241–352`); `mv_last_refreshed` written only in the success branch (`app/api/cron/refresh/route.ts:135–148`); `pitches_last_run` upsert (`app/api/cron/pitches/route.ts:53–64`); `trackCronRun` insert-then-UPDATE plus `counts JSONB` (`lib/cronTracker.ts`, `scripts/create-cron-runs.sql`); `integrity_checks` DDL (`scripts/create-integrity-checks.sql`); `docs/Queries.md` at 1,148 lines / 21 dated sections. Measured by Jo: 8,891,054 live rows, 29 indexes / 4,833 MB, 4.0% HOT ratio, 13.9% dead tuples, one autovacuum since 2026-05-17, 8s `authenticator` cap, ~8k rows/statement scoring ceiling, `integrity_checks` 776 rows / 95 run days / zero failures, matview refresh failing nightly since 2026-06-26, Apr–Aug 2026 `stuff_plus` coverage 99.5% → 0%. The ≈249,000-row repair figure and 0.6–1.2-point drift estimate carry from `02-metric-versioning-reproducibility.md` §3.
