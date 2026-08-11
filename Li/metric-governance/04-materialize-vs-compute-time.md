---
title: Materialize vs Compute-Time — Where a Derived Number Should Live
domain: metric-governance
tags:
  - materialization
  - derived-columns
  - reproducibility
  - provenance
  - backfill
  - denominators
  - schema-coupling
sources_reviewed: 19
last_updated: 2026-08-11
---

# Materialize vs Compute-Time — Where a Derived Number Should Live

## TL;DR

- **The choice is not "fast vs fresh." It is *which failure mode you are buying*: stored values fail silently and stay wrong; computed values fail loudly and stay unreproducible.** Pick the failure you can detect. **(established)**
- **Triton has made this call both ways and both have now failed — an unusually complete case study.** `pitches.stuff_plus` is stored and went to 0% coverage for three months with no visible symptom; `wRC+` is computed at read time and cannot be reproduced for any past date. **(computed)**
- **Store-vs-compute is *orthogonal* to reproducibility, and conflating them is the most common governance error.** Storing a value does not preserve how it was made; computing one does not guarantee you can remake it. Both Triton metrics failed on provenance, by opposite routes. **(established)**
- **A stored derived column on a hot, heavily-indexed table is the most expensive materialization available, and the repair bill — not the write cost — is the real number.** `pitches` is 8.89M rows × 29 indexes (~8k rows per UPDATE fits the 8s cap, ~11k does not); the Stuff+ rescore cost ~250k row rewrites and left 1.44M dead tuples. A compute-time metric's equivalent repair is a deploy. **(computed — Jo, 2026-08-11)**
- **A computed metric becomes irreproducible the moment any input is mutable and unversioned.** `computeWRCPlus()` reads `SEASON_CONSTANTS` / `PARK_FACTORS` from `lib/constants-data.ts` — editable, no vintage recorded — so a wRC+ in a March screenshot cannot be re-derived today. **(computed)**
- **The correct default: store the *inputs*, compute the *outputs*, materialize only the aggregate grain people actually read.** Per-pitch derived columns are the worst of all worlds unless the inputs are genuinely unrecoverable. **(estimated)**
- **Store the denominator beside every stored average, always — `AVG()` skips NULLs and will report a confident number over a collapsing subset.** The single highest-value line in this doc. **(established)**
- **Triton was already doing that and nobody read it.** `scripts/create-materialized-views.sql` materializes `avg_stuff_plus` and `stuff_plus_n = COUNT(p.stuff_plus)` side by side (lines 104–105, 322–323). The number that would have exposed the outage in April was computed nightly, beside the misleading average, unread. **(computed)**

---

## 1. The question, stated precisely

Every derived number is a function `f(inputs, parameters, code)`, paid once on write or every time on read. That framing is correct but shallow: it prices two of six axes.

| Axis | Stored (materialized) | Computed at read |
|---|---|---|
| **Cost** | Once per row at write; on a wide indexed table, × index count. | Per query; scales with read volume and scan size. |
| **Staleness** | Up to one refresh interval — or *forever*, if the writer dies. | Always current with respect to inputs. |
| **Reproducibility** | Preserves the *value*, not the *recipe*, unless you store the recipe's version too. | Preserves nothing. Reproducible only if every input and parameter is versioned. |
| **Backfill burden** | Definition change ⇒ rewrite N rows; on `pitches`, a chunked job plus vacuum. | Definition change ⇒ deploy. History silently changes with it. |
| **Schema coupling** | The metric is DDL. Adding/renaming/widening is a migration on a 9.7 GB table. | The metric is a function. Zero schema surface. |
| **Auditability** | Inspectable, diffable, monitorable *as data* — if you recorded what produced it. | Invisible. No artifact to audit; you can only re-run and hope the world hasn't moved. |

The last row gets skipped, and it decides most real cases. **Auditability is the only axis where storing has a structural advantage computing cannot buy back.** A stored column can be counted, NULL-rate-monitored, diffed against a prior vintage. A computed metric can only be re-evaluated — and if its parameters drifted, that reproduces today, not the past.

`Jo/postgres-performance/08-aggregation-materialization.md` owns the mechanics (refresh strategy, `CONCURRENTLY`, rollups, timeouts). This doc owns what the choice does to the number's *meaning*.

---

## 2. The decision table

Four inputs — **write frequency**; **read frequency** (and whether a read-time scan fits the timeout); **reproducibility need** (must a past value be re-derivable exactly — anything screenshotted, published, or said to a player: yes); **repair cost** (rows × indexes, under the lock/timeout regime).

| Write | Read | Reprod. | Repair | Verdict | Why |
|---|---|---|---|---|---|
| High | High | Low | Low | **Materialize at row grain** | Rare here: repair cost is never low on `pitches`. |
| High | High | Low | **High** | **Materialize at aggregate grain, not row grain** | Store the rollup, compute the fine grain. Where `stuff_plus` belongs. |
| High | Low | Any | Any | **Compute on read** | Write cost for reads that don't happen. |
| Low | High | Low | Any | **Materialize (rollup / matview)** | Season aggregates, league averages, leaderboards. |
| Low | Low | Any | Any | **Compute on read** | No infrastructure for a number nobody asks for. |
| Any | Any | **High** | Any | **Version-stamp the stored value — or version the inputs and compute** | A separate decision (§6); an unlabelled stored value does *not* satisfy it. |
| Any | Any | Any | **inputs destroyed on write** | **Materialize — mandatory** | Overwritten input (nightly baseline, API response) ⇒ the derived value is the only record. |

Two rules fall out, and matter more than the table:

> **Rule 1 — Materialize at the coarsest grain that answers the question.** "What was his Stuff+ this season" lives at ~27k pitcher-seasons, not 8.89M pitches. Grain choice dominates the store/compute choice: `pitcher_season_command` holds the same *family* of answers at 27,152 rows that `pitches.stuff_plus` holds at 8.89M.

> **Rule 2 — Store a derived value only when its inputs will not survive.** *Can I recompute this row tomorrow from data still in the database plus code still in git?* If yes, the stored column is a cache — monitor it or delete it. If no, it is the record of truth and must carry provenance.

`stuff_plus` fails Rule 2 in a way worth naming: `pitch_baselines` is **rebuilt nightly as a full-season-to-date aggregate**, so the April baseline that scored an April pitch no longer exists. The stored value is the *only* surviving record of that computation, and carries no label saying so — irreplaceable and unlabelled at once, the worst combination available.

---

## 3. Case A — the stored value that became a liability

`pitches.stuff_plus`: a column on an 8.89M-row, 29-index, 9.7 GB table, written by a nightly UPDATE scoped to the ingest window. The six axes, measured 2026-08-11:

| Axis | Observed |
|---|---|
| Cost / backfill | ~8k rows per UPDATE fits the 8s cap, ~11k times out; each row = 1 heap tuple + up to 29 index entries. The partial repair: ~250k rewrites, 1.44M dead tuples. |
| Staleness | Unbounded. The writer stopped and the column just stayed as it was — coverage 99.5% (Apr) → 90.3% → 17.8% → 4.1% → **0%** (Aug). |
| Reproducibility | Zero. No `baseline_version`, no `scored_at`, no model version. April rows and August-repair rows are indistinguishable *and were scored against different baselines*. |
| Auditability | **The axis that should have paid off, and didn't** — auditable in principle, audited by nobody. |

The failure is instructive because nothing looked wrong. `AVG(stuff_plus)` stayed in the 100.1–101.0 band throughout — `AVG()` ignores NULLs, so the average silently narrowed onto a shrinking, non-random subset while staying plausible. Row counts were perfect; the cron returned 200.

**The lesson is not "don't materialize."** It is: *a stored derived column is a cache with no invalidation protocol, and an unmonitored cache converges on being wrong.* Two cheap fixes were missing. **No coverage assertion** — one count would have caught it in May. **No provenance stamp** — even post-repair the column is not internally comparable, because the June–August rescore used current baselines while Feb–May kept their originals, leaving 2026 holding at least two vintages with no discriminator (`05-baseline-normalization-design.md` on drift, `02-metric-versioning-reproducibility.md` on the fix).

---

## 4. Case B — the computed value that became irreproducible

`wRC+` is the mirror image. From `lib/sql.ts`:

```ts
// lib/sql.ts — every input arrives as an argument, and nothing records their vintage.
export function computeWRCPlus(
  woba: number,
  constants: { woba: number; woba_scale: number; r_pa: number },
  parkFactor: number, // e.g. 100 = neutral
): number | null
```

`constants` and `parkFactor` come from `SEASON_CONSTANTS` / `PARK_FACTORS` in `lib/constants-data.ts`. (Note the drift: `docs/VARIABLES.md` §1.4 and `Li/context/triton-context.md` both attribute the constants to `lib/sql.ts` — the function is there, the tables are not. Small, but exactly the divergence that compounds.)

- **It cannot silently stop.** No writer, no silent failure — genuinely underrated: the entire Stuff+ failure mode is structurally impossible here.
- **It cannot be reproduced.** FanGraphs revises league constants and park factors (multi-year regressed, restated as seasons roll in). Editing `constants-data.ts` retroactively changes every historical wRC+ on the platform, with no record. A wRC+ in a March newsletter is not re-derivable in August.
- **The exposure is small and enumerated** — `COMPUTED_METRIC_KEYS` is exactly `['wrc_plus', 'runs']`. That enumeration is a governance asset; most platforms cannot name their compute-time metrics at all.

The fix is not to materialize wRC+. It is to **version the inputs**: give the constants a vintage identifier, persist which vintage a rendered number used, let as-of queries pin it. Materializing without versioning would inherit the Stuff+ defect and buy nothing.

---

## 5. The third way — store the inputs, compute the outputs, materialize the aggregate

The hybrid that resolves both cases is standard practice under three names — dbt's staging→mart split, feature-store point-in-time correctness, Kimball fact-grain discipline — and Triton already has it:

```sql
-- scripts/create-materialized-views.sql, mv_pitcher_season_stats (L104-105)
  ROUND(AVG(p.stuff_plus)::numeric, 1) AS avg_stuff_plus,
  COUNT(p.stuff_plus)::int            AS stuff_plus_n,
```

...repeated in the matview `mv_pitcher_pitch_stats` (L322–323) and in the rollup rebuild inside `refresh_materialized_views()` (~L374, current year and prior only).

**`COUNT(p.stuff_plus)` counts non-NULLs; `AVG` skips them.** Adjacency means the average always ships with its denominator. During the outage `stuff_plus_n` was collapsing toward zero *every night*, in a column that already existed, beside the average that looked fine. No human read it; no assertion read it.

This doc's strongest recommendation, and it generalizes:

> **Every stored average ships with its `n`. Every surface displaying the average has access to the `n`. At least one assertion reads the `n`.**

Three parts; Triton had one. The monitor is trivial once the column exists, and reads the small rollup rather than the 8.89M-row table — so it fits the 8s cap where a direct scan does not:

```sql
-- Coverage guard over the rollup, not over `pitches`. Cheap enough to run nightly.
SELECT SUM(stuff_plus_n) AS scored, SUM(pitches) AS thrown,
       ROUND(100.0 * SUM(stuff_plus_n) / NULLIF(SUM(pitches), 0), 1) AS coverage_pct
FROM   mv_pitcher_season_stats
WHERE  game_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
HAVING 100.0 * SUM(stuff_plus_n) / NULLIF(SUM(pitches), 0) < 95.0;
```

**One non-optional caveat.** The guard is only as good as the rollup, and `refresh_materialized_views()` has failed on the 8s cap for 52 straight nights while recording `status='success'` (Jo, 2026-08-11). A stale rollup yields a *stale denominator* — worse than none, because it reports some night in June forever. Gate on `system_metadata.mv_last_refreshed`, and treat an **absent** marker as infinitely stale (`COALESCE(..., '-infinity')`), never as "skip."

The pattern: **immutable versioned inputs → derived values computed in one place → materialize only the read grain → `n` and a freshness marker on everything materialized.**

---

## 6. How the choice interacts with versioning

Materialization decides *where* a number lives; versioning decides *whether it means the same thing twice*. Four combinations, one of them safe:

| | Unversioned | Versioned |
|---|---|---|
| **Stored** | Values are mixed vintages in one column, indistinguishable. **`pitches.stuff_plus` today.** | Stored value + `definition_version` + `baseline_version` + `scored_at`. Auditable, diffable, re-derivable. **The target state.** |
| **Computed** | History silently changes on every deploy or constant edit. **`wRC+` today.** | Function version pinned, parameter tables effective-dated, as-of query resolves both. Reproducible without storage. |

Three consequences:

1. **Materializing does not create provenance; it creates the *opportunity* for it.** A stored column with no version stamp is worse than a computed one — it *looks* like a record and isn't.
2. **The versioning cost is asymmetric, and favors compute-time.** Versioning a computed metric costs a parameter table and an as-of join. Versioning `pitches.stuff_plus` costs a column plus an 8.89M-row backfill under an 8s cap — see `Jo/postgres-performance/04-bulk-write-patterns.md` (chunk by an indexed column the job does not modify; never `ctid`).
3. **A definition change becomes a backfill only if you materialized.** Price it at design time: *how often will this definition change over three seasons?* For a model as young as Stuff+, honestly "several" — which argues hard against row-grain storage.

Detail: `02-metric-versioning-reproducibility.md` (schemes, dual-running, migration) and `10-audit-trails-provenance.md` (what to record alongside an output).

---

## 7. Triton's metrics, classified

| Metric | Today (grain) | Verdict → action |
|---|---|---|
| `stuff_plus` | **Stored** on `pitches`, per pitch (8.89M × 29 idx) | **Wrong grain** — highest repair cost on the platform, reproducibility zero. Keep the column, add `baseline_version`, move *reads* to the season rollup, assert on `stuff_plus_n`. |
| `avg_stuff_plus` / `stuff_plus_n` | **Stored**, rollup table + matview, pitcher-season | **Correct** — coarse grain, high read, cheap repair. Fix the refresh (Jo), then point the assertion at it. |
| `wRC+` | **Computed**, batter-season | **Right choice, missing versioning.** Version the constants; persist the vintage on anything published. |
| `pitcher_season_command` | **Stored**, 27k rows, pitcher × pitch × year | **Correct** — small table, costly computation, natural read grain. Display pitch count first-class: values are pitch-weighted, and the weight *is* the denominator. |
| `pitcher_season_deception` | **Stored**, 2017+ only | **Correct**, with a coverage boundary: pre-2017 absence is a fact, not a zero, and must be representable (display half → `Cas`). |
| `league_averages` | **Stored**, nightly, season × level × role × metric | **Correct** — definitionally a snapshot. Refresh is currently failing (Jo); as a *baseline* it needs vintage stamping most of all. |
| ERA / W / L / IP | **Stored** from MLB API, player-season | **Mandatory storage** — the input is an API response nobody retains (Rule 2). Record fetch time; treat restatements as restatements. |
| FIP / xERA | **Computed** from stored components | **Correct.** Textbook hybrid — this is the pattern to copy. |

---

## 8. What Triton should do, in order

1. **Add a coverage assertion that reads `stuff_plus_n`, gated on rollup freshness.** The data already exists (L104–105); this is a `HAVING` clause plus an alert destination. Highest leverage on the platform.
2. **Fix `refresh_materialized_views()`'s timeout so the denominator is trustworthy** (Jo — one `SET statement_timeout` in `proconfig`). Until then the rollup is stale and step 1 lies.
3. **Add `baseline_version` to `pitch_baselines` and `pitches`; stamp it at scoring time.** Backfill lazily — NULL means "pre-versioning, not internally comparable," which is honest and useful.
4. **Version `SEASON_CONSTANTS` and `PARK_FACTORS`.** Effective-dated vintage key; `computeWRCPlus` takes a vintage, not a bare constants object; record the vintage on anything published.
5. **Write the `stuff_plus` entry in `docs/VARIABLES.md` §1.2** — formula, `(pitch_name, game_year)` baseline keying, clamp range, NULL semantics, vintage caveat. An undocumented metric change is a defect; an undocumented metric is worse.
6. **Standing rule for new metrics:** *store the inputs, compute the output, materialize the read grain, always store `n`.* Apply it forward before retrofitting it backward.

**Anti-recommendation — do not materialize wRC+.** It is the obvious symmetry move ("Stuff+ is stored, so store wRC+ too") and it is wrong on every axis. wRC+ is cheap arithmetic over already-aggregated season totals; read cost is negligible. Storing it adds a column, creates a backfill obligation on every constants revision, and — while the constants stay unversioned — freezes values whose recipe is unrecoverable. It converts a *loud, correctable* problem (history changes on deploy) into a *silent, permanent* one (history frozen wrong, mixed vintages, no discriminator). **Version the constants first; you will find you never needed to store it.**

Related: **do not backfill `baseline_version` across all 8.89M rows.** The information needed to do it correctly no longer exists — the April baselines were overwritten. A backfill would fabricate provenance, which is worse than admitting there is none.

---

## Sources

1. PostgreSQL — [Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — `avg`/`count(expr)` ignore NULLs, `count(*)` does not: the basis for storing the count beside the average.
2. PostgreSQL — [CREATE MATERIALIZED VIEW](https://www.postgresql.org/docs/current/sql-creatematerializedview.html) — matviews are snapshots, not live views; no automatic maintenance.
3. PostgreSQL — [REFRESH MATERIALIZED VIEW](https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html) — `CONCURRENTLY` requirements and locking.
4. PostgreSQL — [Generated Columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html) — the only stored derivation Postgres maintains for you; immutable same-row expressions only, which excludes every metric here.
5. PostgreSQL — [Heap-Only Tuples](https://www.postgresql.org/docs/current/storage-hot.html) — why updating an *indexed* derived column costs so much more.
6. PostgreSQL — [Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — dead tuples after bulk repair: a backfill's hidden half.
7. dbt — [Materializations](https://docs.getdbt.com/docs/build/materializations) — a reversible per-model decision, not a schema commitment.
8. dbt — [Incremental models](https://docs.getdbt.com/docs/build/incremental-models) — watermark-based partial rebuild; the pattern behind "rollup, not matview."
9. dbt — [Snapshots](https://docs.getdbt.com/docs/build/snapshots) — capturing mutable source state so past values stay derivable; applies to `pitch_baselines` and `SEASON_CONSTANTS`.
10. dbt — [About MetricFlow](https://docs.getdbt.com/docs/build/about-metricflow) — define once, compute at query time; the case against baking definitions into columns.
11. Cube — [Using pre-aggregations](https://cube.dev/docs/product/caching/using-pre-aggregations) — materialization as a cache *under* one definition, with explicit refresh keys.
12. Maxime Beauchemin — [Functional Data Engineering](https://maximebeauchemin.medium.com/functional-data-engineering-a-modern-paradigm-for-batch-data-processing-2327ec32c42a) — immutable inputs and idempotent recomputation; why in-place mutation destroys reproducibility.
13. Martin Fowler — [Bitemporal History](https://martinfowler.com/articles/bitemporal-history.html) — "when was it true" vs "when did we record it": the model for vintage stamping.
14. Kimball Group — [Design Tip #152: SCD Types 0–7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/) — effective-dated parameter tables; the shape versioned constants should take.
15. Google — [Rules of ML](https://developers.google.com/machine-learning/guides/rules-of-ml) — training/serving skew; log features *as served*.
16. Tecton — [What is a Feature Store?](https://www.tecton.ai/blog/what-is-a-feature-store/) — point-in-time correctness; the industrial analogue of store-inputs/compute-outputs.
17. Apache Iceberg — [Time travel](https://iceberg.apache.org/docs/latest/spark-queries/#time-travel) — snapshot reproducibility as infrastructure, not discipline.
18. FanGraphs Library — [wRC and wRC+](https://library.fangraphs.com/offense/wrc/) — the definition `computeWRCPlus` implements and its dependence on league constants and park factor.
19. FanGraphs — [Guts!](https://www.fangraphs.com/guts.aspx?type=cn) — league constants and park factors get revised and regressed, which is why unversioned compute-time wRC+ rewrites history.

**Triton-internal evidence (read 2026-08-11):** `scripts/create-materialized-views.sql` L104–105, L322–323, `refresh_materialized_views()` ~L374; `lib/sql.ts`; `lib/constants-data.ts`; `lib/reportMetrics.ts:235`; `docs/VARIABLES.md` §1.2 (zero occurrences of `stuff_plus`) and §1.4; `app/api/update/route.ts`. Sizes, index counts, chunk limits, dead tuples, coverage decay and the 52-night refresh failure are Jo's — `Jo/context/triton-context.md`, `Jo/postgres-performance/08-aggregation-materialization.md`, `.../04-bulk-write-patterns.md`.
