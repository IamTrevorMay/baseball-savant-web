---
title: NULL Semantics & Missingness — One Marker, Five Meanings, Zero Warnings
domain: data-quality
tags: [null-semantics, three-valued-logic, missingness, mcar-mar-mnar, imputation, coverage, sentinel-values]
last_updated: 2026-08-11
sources_reviewed: 17
---

# NULL Semantics & Missingness — One Marker, Five Meanings, Zero Warnings

## TL;DR

- **SQL collapses five real states into one NULL — unknown, not-applicable, not-yet-collected, not-covered-in-this-era, genuinely-zero-written-blank.** Treating them alike is a claim nobody checked. (documented)
- **`AVG()` silently ignores NULLs, and that is the mechanism behind Triton's worst incident.** `stuff_plus` coverage fell 99.5% → 0% Apr→Aug 2026 while dashboards rendered plausible numbers over a shrinking, non-random subset; the monthly league average moved ~0.8 across the whole collapse, because Stuff+ is normalized to 100 and *any* subset averages near 100. (measured; the normalization argument is inferred)
- **The denominator that would have exposed the outage was already computed nightly beside it** — `stuff_plus_n = COUNT(p.stuff_plus)::int`, `scripts/create-materialized-views.sql:105,323,374`. Nobody read it. **Store the count beside every average, then assert on it.** (measured)
- **`pitches.stuff_plus` is NULL for three indistinguishable reasons:** not-applicable (~0.4% lacking `release_speed`/`pitch_name`), no-matching-baseline, and pipeline-failure — a fixable schema defect. (measured)
- **Inequality is not null-safe: `NULL <> 'x'` is NULL, and `NOT IN (subquery)` returns zero rows if the subquery yields one NULL.** Triton's SP/RP rule excludes `pitch_type IN ('PO','IN')` via `NOT IN`, silently dropping NULL rows. (documented)
- **SQL contradicts itself on NULL equality: `=` says unknown, `GROUP BY`/`DISTINCT` treat NULLs as identical, `UNIQUE` treats them as all-different** — a nullable key column permits unlimited duplicates, and `ORDER BY ... DESC` leads with NULLs. (documented)
- **Missingness is ignorable only if MCAR, and Triton's is not.** Unscoreable pitches track tracking failures, which track parks and conditions: MNAR, so the surviving subset is biased — an accuracy problem, not just a coverage one. (inferred)
- **Imputation must never happen implicitly, and sentinels are worse than NULL.** `COALESCE(x,0)` and `Number(null) === 0` turn missing into a confident zero; `-1`/`9999`/`'N/A'` corrupt aggregates NULL would have excluded. Use a companion status column. (documented)

---

## 1. Five things NULL means, and why the database knows none of them

Codd introduced the null marker and by 1979 had conceded one was insufficient — his *Version 2* model proposed two, A-marks (*missing-but-applicable*) and I-marks (*missing-but-inapplicable*). SQL shipped one, so every distinction below is application knowledge, not database knowledge.

| Meaning | Triton example | Correct treatment |
|---|---|---|
| **Unknown** — exists, we lack it | Tracking dropped `release_speed` on a real pitch | Exclude; report `n`; never impute |
| **Not applicable** — cannot exist | `stuff_plus` on a pitchout; ERA for a position player | Exclude from the *denominator too* |
| **Not yet collected** | Tonight's game before the 09:00 UTC ingest; a late Savant restatement | A freshness problem, not a quality one |
| **Not covered in this era** | Deception 2017+; `milb_pitches` 2023+; inherited runners NULL ≤1970 | Structural — clip the query window, don't filter |
| **Genuinely zero, written blank** | Upstream CSV emitting an empty field for a real 0 | A parser bug; fix at ingest, not at read time |

A sixth NULL is *manufactured by the query*: `LEFT JOIN` emits "no match" NULLs that never existed in storage, making `COUNT(joined_col)` after an outer join a classic accidental-denominator bug (`01-data-quality-dimensions.md`). "Is this NULL a gap or a legitimate absence?" is the first question in every quality investigation, and a schema that cannot answer it forces a human to answer it by reading pipeline code — as Triton's schema does (§4).

---

## 2. Three-valued logic: the surprises, with SQL

Comparisons return TRUE, FALSE, or UNKNOWN; `WHERE` keeps only TRUE. That one rule generates most of what follows. (All `documented`.)

### 2.1 Inequality silently drops NULLs

```sql
-- These do NOT agree when pitch_type is nullable.
SELECT count(*) FROM pitches WHERE game_year = 2026 AND pitch_type NOT IN ('PO','IN');
SELECT count(*) FROM pitches WHERE game_year = 2026 AND pitch_type IS DISTINCT FROM 'PO';
```

`NULL NOT IN ('PO','IN')` is UNKNOWN, so the first discards every NULL-`pitch_type` row. Triton's canonical SP/RP rule carries exactly that exclusion (`CLAUDE.md`, `refresh_league_averages`, `app/api/scene-stats/route.ts`) — the undercount may be small, but nobody chose it. `IS DISTINCT FROM` is total: NULL rows are kept.

### 2.2 `NOT IN (subquery)` collapses to zero rows

`SELECT count(*) FROM players p WHERE p.id NOT IN (SELECT pitcher FROM pitches WHERE game_year = 2026)` returns **0 rows** if any `pitches.pitcher` is NULL, regardless of the data. `x NOT IN (a, b, NULL)` expands to `x<>a AND x<>b AND x<>NULL`; the last conjunct is UNKNOWN, so it can never be TRUE. The result is not slightly wrong — it is empty. `NOT EXISTS (SELECT 1 FROM pitches x WHERE x.pitcher = p.id AND x.game_year = 2026)` is null-safe and plans better.

### 2.3 Aggregates skip NULLs, changing the denominator

```sql
SELECT count(*)                     AS rows_,     -- 8,000
       count(stuff_plus)            AS scored,    -- 320
       avg(stuff_plus)              AS avg_,      -- ~100.1  ← what dashboards showed
       avg(coalesce(stuff_plus, 0)) AS avg_wrong  -- ~4.0    ← the other wrong answer
FROM pitches WHERE game_date BETWEEN '2026-07-01' AND '2026-07-31';
```

`avg()` divides by 320, not 8,000; `sum()` over an all-NULL set returns NULL while `count()` returns 0; `COALESCE(...,0)` "fixes" it into a number worse than either. **The only honest output is the pair `(avg, n)`** — and the ratio of those counts *is* coverage, making `count(stuff_plus)::float / nullif(count(*),0)` the cheapest quality instrument in existence.

### 2.4 SQL uses three different NULL-equality rules

| Construct | NULLs are… | Consequence |
|---|---|---|
| `WHERE a = b`, join conditions | never equal (UNKNOWN) | joins silently drop NULL keys |
| `GROUP BY`, `DISTINCT`, `UNION`, `ORDER BY` | all equal to each other | one tidy NULL bucket per breakdown |
| `UNIQUE` constraint/index | all distinct | **unlimited duplicate NULL rows permitted** |

The `UNIQUE` row is the dangerous one: Triton's ingest key is `(game_pk, at_bat_number, pitch_number)` (`app/api/update/route.ts:148`). **If any component is ever NULL, uniqueness does not apply and the upsert cannot match that row — every nightly re-run inserts another copy.** PG 15+ offers `UNIQUE NULLS NOT DISTINCT`; the better fix is `NOT NULL` on all three (`08-duplicate-detection-idempotency.md`).

### 2.5 Three more, briefly

- **`CHECK` passes on NULL.** It fails only on FALSE, never UNKNOWN, so `CHECK (stuff_plus BETWEEN 0 AND 200)` accepts NULL forever: a range constraint is not a coverage constraint (`03-constraint-design-postgres.md`).
- **`ORDER BY ... DESC` leads with NULLs.** PostgreSQL defaults to `NULLS LAST` for `ASC` but **`NULLS FIRST` for `DESC`**; leaderboards must write `DESC NULLS LAST`.
- **NULL propagates, then JavaScript coerces.** `'Stuff+ ' || stuff_plus` is NULL, so the string vanishes; across the app boundary the failure inverts, since `Number(null) === 0` and `[100, null, 102].reduce((a,b)=>a+b) === 202` over `length` 3 gives 67.3 (`Cas/analytics-ux/02-null-zero-unknown-ui.md`).

---

## 3. The centerpiece: `AVG()` over a shrinking subset

Triton's worst incident; the mechanism is one line of the aggregate documentation. Measured 2026-08-11:

| Month | Pitches ingested | With `stuff_plus` | Coverage | League avg Stuff+ displayed |
|---|---|---|---|---|
| Apr | 117,333 | 116,795 | 99.5% | **100.97** |
| May | 121,779 | 109,911 | 90.3% | 100.77 |
| Jun | 115,920 | 20,676 | 17.8% | 100.46 |
| Jul | 109,421 | 4,504 | 4.1% | **100.13** |
| Aug | 36,621 | 0 | **0%** | *(NULL)* |

**Row counts were perfect all season** — ingest never missed a pitch, so freshness and volume monitors stayed green. A derived column decayed and `AVG()` quietly changed its denominator every night: April's average divided by 116,795, July's by 4,504 — a 96%-smaller, non-random subset. Drift across a complete collapse of the data: **~0.8 of a Stuff+ point.** No chart broke; no number looked wrong.

### 3.1 Why a plus-stat is the worst column for this to happen to

Stuff+ is `100 + weighted z-scores` against `pitch_baselines` (`app/api/update/route.ts:320-333`), so its mean is pinned to 100 **by construction**. Therefore:

> Any subset of a normalized metric — biased, tiny, or arbitrary — averages near its normalization constant. The metric's own design destroys the signal you would use to notice the subset is wrong.

A raw column leaks: average `release_speed` over only well-tracked parks drifts detectably. `avg_stuff_plus` cannot — the construction re-centres whatever it is given. **That inverts the usual intuition — plus-stats need coverage monitoring more than raw columns.** (inferred)

### 3.2 The instrument was already built

`scripts/create-materialized-views.sql` lines **105, 323, 374** materialize `COUNT(p.stuff_plus)::int AS stuff_plus_n` beside `avg_stuff_plus`, refreshed nightly by `/api/cron/refresh`. The decay curve above is reproducible from it with zero new infrastructure: `sum(stuff_plus_n)::float / nullif(sum(pitches),0)` by season.

**The denominator that would have exposed a three-month outage was computed, materialized, and stored next to the misleading average for its whole duration.** Nothing read it; nothing asserted on it. *Storing the count is necessary and nowhere near sufficient — it must be on the read path or in an assertion.* `04-distribution-drift-detection.md` treats NULL-rate as a distribution signal, the same measurement from the other side.

---

## 4. Triton's overloaded NULL — a fixable schema defect

`pitches.stuff_plus IS NULL` means one of **three** mutually exclusive things, and nothing records which.

`applyStuffPlusForDateRange` (`app/api/update/route.ts:306-352`) runs one statement per day: `UPDATE pitches p ... FROM pitch_baselines b WHERE p.pitch_name = b.pitch_name AND p.game_year = b.game_year AND p.game_date = '<day>' AND p.release_speed IS NOT NULL`. Three distinct paths leave a row unscored:

| Why it's NULL | Mechanism | Class | Counts toward coverage? |
|---|---|---|---|
| No `release_speed`, or `pitch_name IS NULL` | Excluded by the `WHERE`; the join drops NULL `pitch_name` (§2.4) | **not applicable** (~0.4%) | **No** — drop from the denominator |
| No `pitch_baselines` row for `(pitch_name, game_year)` | Join finds no match: new pitch name, or day 1 of a season | **not yet computed** | **Yes**, after a grace period |
| The `UPDATE` threw (8s `statement_timeout`) | Caught per-day into `failures[]`; row never touched | **pipeline failure** | **Yes — page on it** |

All three write the same absence. During the 2026 outage, "how many pitches are unscored?" could not separate the 0.4% never scoreable from the 96% the pipeline failed to score. The honest denominator is *scoreable* rows.

**The fix — cheap, reversible:** put scoreability in an index and in the assertion, not in the table.

```sql
CREATE INDEX CONCURRENTLY idx_pitches_unscored ON pitches (game_date)  -- SHARE UPDATE EXCLUSIVE only
  WHERE stuff_plus IS NULL AND release_speed IS NOT NULL AND pitch_name IS NOT NULL;
```

Coverage is then `count(stuff_plus) / count(*) FILTER (WHERE release_speed IS NOT NULL AND pitch_name IS NOT NULL)` over a trailing window ending ~2 days back, clear of ingest lag.

**Blast radius.** The tempting alternative — a `STORED` generated column `stuff_plus_scoreable` — is a full rewrite of an 8.89M-row / 29-index table: it holds `ACCESS EXCLUSIVE` throughout, trips the 8s `lock_timeout`, and is not runnable through `run_mutation`. If the predicate spreads past three call sites, use a narrow `pitch_scoring_status` sidecar.

---

## 5. Triton's legitimate NULL regions — four different problems

| Region | Boundary | Class | Correct handling |
|---|---|---|---|
| `pitcher_season_deception` | 2017+ | era-not-covered | Clip to `year >= 2017`; 2015 returns *"not available"*, not an average |
| `milb_pitches` | 2023+ | era-not-covered | Never blend a 2019 MLB line with an implied-zero MiLB term |
| `player_season_stats` `IR`/`IRS` | NULL ≤1970 | not-collected | A career IR total over 1968–1978 is a partial sum, not a total |
| `pitches.stuff_plus`, no `release_speed` | ~0.4% | not-applicable | Drop from **both** numerator and denominator |
| `pitches.stuff_plus`, unscored | Jun–Aug 2026 | pipeline-failure | Alert; `/api/admin/backfill-stuff-plus?mode=repair` |

The code treats all five identically, as absence. **One pattern fixes the first three:** store era boundaries as *data* rather than inferring them from NULL counts — `metric_coverage(metric, level, first_season, last_season)`, with `last_season IS NULL` meaning "ongoing". Query builders clip windows against it and render *"deception unavailable before 2017"* rather than a blank cell: an honest gap, not an implied zero.

---

## 6. MCAR / MAR / MNAR — and why Triton's is the bad one

Rubin's 1976 taxonomy answers one question: *can I ignore this missingness?*

| Class | Definition | Ignorable? | Triton example |
|---|---|---|---|
| **MCAR** | P(missing) independent of all values | Yes — complete-case is unbiased, less precise | A network blip dropping one Savant row |
| **MAR** | P(missing) depends only on *observed* variables | Conditionally, if you condition on them | Deception NULL depends on `game_year` |
| **MNAR** | P(missing) depends on the *unobserved value* or unmeasured causes | **No.** Complete-case is biased, and the bias is not estimable | Unscoreable pitches |

**Triton's Stuff+ missingness is MNAR, and that matters more than the coverage number.** (inferred — mechanism, not measured)

The ~0.4% lacking `release_speed`/`pitch_name` are not a random sample: they come from tracking failures, which cluster by **park** (camera install, calibration), **conditions** (rain, lighting, shadows), and **pitch characteristics** (unusual release points and rare pitch types are what a classifier fails to name) — all correlated with the thing being measured. The surviving subset **over-represents well-tracked parks and conventional pitches**, so a pitcher in a poorly-tracked park has his Stuff+ built from a different slice of his own pitches. **That is an accuracy problem, not a completeness one: restoring coverage to 99.5% shrinks it, it does not remove it.** The outage added a larger mechanism: the timeout dropped whole days, and which days depended on row volume.

The coverage figures are measured; the MNAR claim is inferred and **untested**. The test is cheap: compare park, `pitch_name`, and pitcher distributions for scoreable vs unscoreable rows — if they match, that slice is nearer MCAR and Jo should say so. Whether the residual bias moves a downstream number is Li's call (`Li/statistical-inference/11-aggregation-bias-weighting.md`).

---

## 7. Imputation and sentinel hazards

| Method | Effect on the data | Verdict for Triton |
|---|---|---|
| **Complete-case** (drop NULL rows) | Unbiased under MCAR only; less precise | Correct default **if `n` is reported** |
| **Mean/zero fill** (`COALESCE(x,0)`) | Shrinks variance to zero, destroys correlations | **Never.** The `avg ≈ 4.0` in §2.3 is what it looks like |
| **Multiple imputation** (`mice`) | Draws pooled with between-imputation variance | Research, not a dashboard |

Regression, kNN, and LOCF sit between: they treat imputed values as observed, and LOCF fabricates trends — model-internal only.

Three rules independent of method: (1) **never write an imputed value into the same column as an observed one** — once merged the distinction is unrecoverable; if stored, it gets its own column plus a flag. (2) **Imputation cannot rescue MNAR** — every method above assumes MAR at minimum, so filling Triton's unscored pitches yields a *more confident* wrong answer. (3) **`COALESCE` in a display query is statistics done by someone who did not know they were doing statistics.**

**Sentinels** (`-1`, `0`, `9999`, `'N/A'`, `''`) are worse than NULL on every axis: they are **included** in `AVG`/`SUM` and corrupt the mean, they are undetectable without knowing the magic value, and the next consumer reads `-1` as a real velocity. Their one advantage — encoding *why* a value is missing — is better delivered by NULL plus a `_status` column (§4). They also arrive from upstream: `app/api/update/route.ts` treats a short Savant response (`csv.length < 100`) as a successful zero-row fetch, so an error page and a no-games day look identical (`09-schema-evolution-contracts.md`).

---

## 8. Modelling patterns that preserve the distinction

1. **`NOT NULL` on every key column** — or the unique constraint has holes (§2.4).
2. **Store `n` beside every aggregate, on the read path.** An API returning a mean without an `n` will eventually lie.
3. **Separate value from reason.** NULL says "no value"; a `_status` column says why — in a narrow sidecar, not a widened `pitches`.
4. **Encode era boundaries as data** (`metric_coverage`, §5), and index the missing set partially so repair and assertion queries stay cheap.

---

## 9. What Triton should do, in order

1. **Read the instrument you already have.** One `integrity_checks` entry computing trailing-7-day `stuff_plus` coverage (from `stuff_plus_n`, or date-scoped off `pitches`), failing below 0.95. That table holds 776 rows over 95 run days with **zero failures ever**; this would be its first check capable of failing.
2. **Disambiguate the `stuff_plus` NULL.** Add the §4 partial index; define coverage against *scoreable* rows. Skip the generated column.
3. **`NOT NULL` the ingest key columns** on `pitches`/`milb_pitches` — added `NOT VALID`, `VALIDATE`d later, to avoid a long `ACCESS EXCLUSIVE` hold.
4. **Return `n` with every mean** from `/api/scene-stats`, `/api/report`, `/api/player-data`. Rendering it is Cas's; the wire is Jo's.
5. **Create `metric_coverage`** and clip query windows against it, so 2015 deception and 2019 MiLB return "not available", not an empty average.
6. **Audit `NOT IN` and bare `<>` over nullable columns** in `lib/sql.ts`, `app/api/report/route.ts`, and the SP/RP path.
7. **Test the MNAR hypothesis** (§6), then record NULL semantics, era boundary, and coverage floor per metric in `docs/VARIABLES.md`.

**Anti-recommendation — do not do these:**

- **Do not add `NOT NULL`, or a NULL-forbidding `CHECK`, to `stuff_plus`.** The not-applicable rows are legitimate; it would break the nightly upsert on ~0.4% of pitches, turning a monitoring gap into a hard outage.
- **Do not backfill unscored rows with a default, a league average, or 100.** It makes the 2026 gap permanently invisible and mixes measurement with fabrication in one unflagged column.
- **Do not adopt a sentinel** (`-1`, `0`) for "unscoreable", and **do not add the `STORED` generated column** from §4 — the first destroys NULL's automatic exclusion from aggregates; the second is a full table rewrite bought for readability.

**Single highest-leverage next action:** item 1 — a coverage check in `integrity_checks` capable of returning `fail`. Everything else refines a signal that does not yet exist.

---

## Sources

1. PostgreSQL — [Comparison Functions and Operators](https://www.postgresql.org/docs/current/functions-comparison.html) — `IS DISTINCT FROM`; `= NULL` never true.
2. PostgreSQL — [Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — NULL is ignored; `count(*)` vs `count(expr)`.
3. PostgreSQL — [Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — CHECK passes on NULL; UNIQUE nulls distinct.
4. PostgreSQL — [CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html) — `UNIQUE NULLS NOT DISTINCT`; generated columns.
5. PostgreSQL — [SELECT](https://www.postgresql.org/docs/current/sql-select.html) — GROUP BY NULL equality; `NULLS FIRST|LAST`.
6. PostgreSQL — [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html) — partial indexes.
7. PostgreSQL Wiki — [Don't Do This](https://wiki.postgresql.org/wiki/Don%27t_Do_This) — the case against `NOT IN`.
8. Wikipedia — [Null (SQL)](https://en.wikipedia.org/wiki/Null_(SQL)) — 3VL tables; criticism survey.
9. Wikipedia — [Missing data](https://en.wikipedia.org/wiki/Missing_data) — mechanisms; listwise deletion.
10. Codd (1979) — [Extending the Relational Model](https://dl.acm.org/doi/10.1145/320107.320109), ACM TODS 4(4) — the null marker.
11. C.J. Date — [Database in Depth](https://www.oreilly.com/library/view/database-in-depth/0596100124/) — nulls considered harmful.
12. Darwen & Date — [The Third Manifesto](https://www.dcs.warwick.ac.uk/~hugh/TTM/) — eliminating nulls entirely.
13. Fabian Pascal — [Database Debunkings](https://www.dbdebunk.com/) — critique of NULL handling in practice.
14. Rubin (1976) — [Inference and Missing Data](https://doi.org/10.1093/biomet/63.3.581), Biometrika 63(3) — MCAR/MAR/MNAR.
15. Little & Rubin — [Statistical Analysis with Missing Data, 3rd ed.](https://onlinelibrary.wiley.com/doi/book/10.1002/9781119482260) — complete-case bias.
16. van Buuren — [Flexible Imputation of Missing Data](https://stefvanbuuren.name/fimd/) — §1.2-1.3; mean-fill and LOCF distortion.
17. van Buuren & Groothuis-Oudshoorn (2011) — [mice](https://www.jstatsoft.org/article/view/v045i03), JSS 45(3) — multiple imputation.

**Triton-internal evidence (measured 2026-08-11):** coverage decay and league-average stability from `docs/Queries.md`; `stuff_plus_n` at `scripts/create-materialized-views.sql:105,323,374`; scoring SQL and its NULL-producing predicates at `app/api/update/route.ts:306-352`; ingest upsert key at `app/api/update/route.ts:148`; `integrity_checks` history (776 rows / 95 run days / zero failures) and table/index sizes from `Jo/context/triton-context.md`.
