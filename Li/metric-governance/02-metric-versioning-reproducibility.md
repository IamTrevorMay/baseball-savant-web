---
title: Metric Versioning & Reproducibility — Which Definition and Which Inputs Produced This Number
domain: metric-governance
tags:
  - versioning
  - reproducibility
  - provenance
  - baseline-vintage
  - semver
  - dual-running
  - rescore-policy
  - as-of-correctness
sources_reviewed: 17
last_updated: 2026-08-11
---

# Metric Versioning & Reproducibility — Which Definition and Which Inputs Produced This Number

## TL;DR

- **Reproducibility needs two version axes; almost everyone builds one.** A derived value is fixed by its *definition version* (formula, weights, population — in git) and its *input version* (baseline vintage, constants — nowhere). Triton records neither. **(established)**
- **`pitches.stuff_plus` holds values computed under different inputs, with no column saying which.** `refreshPitchBaselines` overwrites `pitch_baselines` via `ON CONFLICT … DO UPDATE`, so last night's baseline is unrecoverable. **(computed — `app/api/update/route.ts:269`)**
- **The drift is directional: league Stuff+ should sag through a season even if stuff improves**, since April pitches are z-scored against a cold-weather mean and August pitches against a warm one. Magnitude ≈ **0.6–1.2 points** (Δmean/σ ≈ 0.2 × the 4.5 weight). **(estimated — §3.3 settles it)**
- **The 2026-08-11 repair made 2026 a two-vintage column with no marker.** `mode=repair` touches only `stuff_plus IS NULL`, so ≈**249,000** Apr–Aug rows got 2026-08-11 baselines while Feb–May kept their nightly vintages; no predicate separates them. The same day inverted the crons — `/api/cron/pitches` (09:00 UTC) scores, `/api/cron/refresh` (09:10) rebuilds — so scoring now runs ~24h behind. **(computed — Jo's coverage table, `vercel.json`)**
- **wRC+ silently restated every 2026 hitter by 5–6 points on 2026-05-08**, when commit `3297054` added `SEASON_CONSTANTS[2026]` and the `LATEST_SEASON_YEAR` fallback stopped serving 2025 constants: a .350 wOBA hitter read **125** before, **120** after. `checkSeasonConstants`, the only monitor watching, flipped warn → pass — logging the restatement as a *fix*. **(computed — git + arithmetic)**
- **The natural provenance grain is the day, not the row** — the scorer already runs one UPDATE per `game_date`, so a day-grain ledger is *lossless* at ~180 rows/season. **(computed — `app/api/update/route.ts:306`)**
- **`PARK_FACTORS` has no time dimension at all** — one 2024 vintage applied to 2015–2026, so park-adjusting a 2015 number uses 2024 information. **(computed — `lib/constants-data.ts:26–30`)**
- **Widening `pitches` is the wrong remedy and the arithmetic says so.** 8,891,054 rows, 29 indexes / 4,833 MB, **4.0% HOT**, 13.9% dead — nearly every UPDATE dirties all 29. And you cannot stamp a vintage you never recorded. **(computed — Jo, `docs/Queries.md`)**
- **The fix is three small tables, none of them `pitches`** — versioned baselines, immutable baseline values, a day-grain scoring ledger — plus a rescore against final baselines at season close. **(estimated)**
- **The cleanest structural fix is to stop the baseline moving: score against the prior completed season.** Zero drift, zero rescores — and a change to what Stuff+ *means*, so it is Soto's call. **(estimated)**

---

## 1. What "reproducible" requires

A stored derived value is reproducible only if you can name all of these **for that row**:

| Pin | Triton's Stuff+ | Recorded? |
|---|---|---|
| **Formula** | `100 + 4.5·z(velo) + 3.5·z(mvmt) + 2.0·z(ext)`, clamped 0–200, rounded | git only |
| **Population** | MLB pitches sharing `(pitch_name, game_year)` | implicit in a table name |
| **Input vintage** | whatever `pitch_baselines` held that night | **no** |
| **Row inputs** | `release_speed`, `pfx_x`, `pfx_z`, `release_extension` | stored, but mutable |
| **Code version / computed-at** | — | **no** |

Four of six are unrecorded. The consequence is not that values are wrong — each is individually defensible — it is that **the column is not a single measurement**. Averaging, ranking, or trending it mixes populations: the same error as putting MLB and Triple-A Stuff+ on one axis (`08-cross-level-comparability.md`), except invisible, because there is no column to group by. Version control gives the definition axis free and hides the input axis.

---

## 2. Where Triton loses provenance today

### 2.1 Stored value, mutable inputs — `stuff_plus`

`/api/cron/pitches` (09:00 UTC) calls `applyStuffPlusForDateRange()`, one UPDATE per `game_date`, joined to `pitch_baselines` *as it stands*; `/api/cron/refresh` (09:10) then calls `refreshPitchBaselines([year])`, which recomputes a **full-season-to-date aggregate** and overwrites via `ON CONFLICT DO UPDATE` — no `version`, no `computed_at`, no `source_max_game_date`. So an April pitch is z-scored against ~3 weeks of 2026 data (small n, cold mean) and an August pitch against ~5 months: same column, no discriminator. The 3-day re-sync compounds it — a pitch re-upserted on D+2 is re-scored against a newer baseline, so a row's vintage depends on when Savant delivered it.

**Ordering, post-2026-08-11.** Splitting the crons moved baseline refresh *downstream* of scoring — numerically small, but a real inversion with a hard edge: on the first game day of a new `game_year` no baseline row exists, the join matches nothing, and the day scores 0%.

### 2.2 Query-time value, mutable constants — `wRC+`

`computeWRCPlus(woba, constants, parkFactor)` (`lib/sql.ts:53–61`) is evaluated per request from `lib/constants-data.ts` and never stored, so **a June screenshot cannot be reproduced today if the constants moved** — and they did. Park-neutral, on the repo's own numbers:

| wOBA | 2025 constants (`woba .313`, scale `1.232`) | 2026 constants (`woba .320`, scale `1.256`) | Δ |
|---|---|---|---|
| .350 | **125** | **120** | −5 |
| .400 | **160** | **154** | −6 |

**Park factors are worse.** `PARK_FACTORS` is keyed by team only — "5-year rolling, 2024 FanGraphs" — and applies to 2015–2026 alike: no vintage, because no time dimension (`temporal-modeling/01-as-of-correctness.md`). There are also **two copies**: `/api/populate-constants` and `/api/populate-park-factors` push the TS objects into `season_constants` / `park_factors`, neither on a cron.

**Derived-from-derived compounds it.** `refresh_league_averages(p_season)` runs nightly over qualified players (`IP >= max(5, 0.20 · IP_leader_for_role)`); the bar rises daily as the leader accumulates innings and the metric may itself be mid-vintage, so every benchmark row stacks three unrecorded vintages (`05-baseline-normalization-design.md`).

---

## 3. The 2026-08-11 event, precisely

### 3.1 What the repair did

`backfill-stuff-plus?year=2026` defaults to `mode=repair`: only `stuff_plus IS NULL`, one `game_date` per statement (~8k rows fits the 8s cap, ~11k times out). Against Jo's measured coverage:

| Month | Pitches | Scored before | NULL → rescored 2026-08-11 |
|---|---|---|---|
| Apr | 117,333 | 116,795 (99.5%) | 538 |
| May | 121,779 | 109,911 (90.3%) | 11,868 |
| Jun | 115,920 | 20,676 (17.8%) | 95,244 |
| Jul | 109,421 | 4,504 (4.1%) | 104,917 |
| Aug | 36,621 | 0 (0%) | 36,621 |
| | | | **≈ 249,188** |

249,188 is arithmetic on measured coverage, not a run count, and some NULLs are unscoreable — an upper bound.

### 3.2 What that leaves

2026 `stuff_plus` now holds **at least two vintages** — Feb–May rows carry the season-to-date baseline of their own ingest night, the repaired rows the near-complete-season baseline — and the mix is **not clean by month** (April holds 538 August-vintage rows, May ~11.9k), so even a month-level caveat is wrong. Nothing separates them: the only trace of a scoring run was a `console.error`.

### 3.3 The measurement that should have preceded the repair

Every remedy scales with a magnitude nobody has measured. One day-chunked query settles it — stored value vs a re-score on the current baseline:

```sql
-- Vintage drift probe. One day per statement; ~4k rows stays well under the 8s cap.
SELECT p.game_date, count(*) AS n,
       round(avg(p.stuff_plus)::numeric, 2) AS stored_avg,
       round(avg(GREATEST(0, LEAST(200, ROUND(
            100
          + COALESCE((p.release_speed - b.avg_velo) / NULLIF(b.std_velo, 0), 0) * 4.5
          + COALESCE((SQRT(POWER(p.pfx_x*12,2) + POWER(p.pfx_z*12,2)) - b.avg_movement)
              / NULLIF(b.std_movement, 0), 0) * 3.5
          + COALESCE((p.release_extension - b.avg_ext) / NULLIF(b.std_ext, 0), 0) * 2.0
       )::numeric)))::numeric, 2)            AS current_baseline_avg
FROM pitches p
JOIN pitch_baselines b ON b.pitch_name = p.pitch_name AND b.game_year = p.game_year
WHERE p.game_date = '2026-04-15' AND p.release_speed IS NOT NULL
GROUP BY p.game_date;
```

**Prediction (estimated, falsifiable):** `stored_avg − current_baseline_avg` is positive, largest in April and shrinking toward zero in August, April magnitude ≈ **+0.6 to +1.2**. Jo's measured league averages fell monotonically 100.97 → 100.13 across Apr–Jul — *consistent*, but **not evidence**, since that window is confounded by the coverage collapse. The probe is unconfounded: both sides use identical rows. ≤0.5 points ⇒ forward-only versioning; >2 ⇒ a full historical rescore. **Do not choose a remedy before running this.**

---

## 4. Semantic versioning for a metric

Version the *contract*, not the file: **the version changes when a consumer's conclusion could change.**

| Bump | Meaning | Triton examples |
|---|---|---|
| **MAJOR** | existing values or rank order change | weights change; population changes (`pitch_name` → `pitch_type`); clamp or qualification changes; baseline scope moves to prior-season |
| **MINOR** | new values appear; existing ones unchanged | deception extended below 2017; a new `pitch_name` gets a baseline row |
| **PATCH** | a value moves toward its documented definition | the 2026-08-11 NULL repair; fixing a `NULLIF` that silently zeroed a division |

Two easy mistakes. **(1) A routine baseline refresh is not a definition bump** — it is an input-version increment; conflate them and you bump MAJOR nightly until the version means nothing. **(2) A silent fallback is a MAJOR change in disguise** — `LATEST_SEASON_YEAR` swaps definitions at runtime on data availability, so put fallbacks in the version string (`wrc_plus@1.0.0+fallback:2025`) or throw. Name versions in the identifier (`stuff_plus@1.0.0`), not a comment.

---

## 5. Proposed schema

Three small tables; none touch `pitches`.

```sql
-- 5.1 Append-only versions: one row per (scope, game_year, refresh).
CREATE TABLE pitch_baseline_versions (
  baseline_version_id  bigserial PRIMARY KEY,
  scope                text NOT NULL DEFAULT 'mlb',
  game_year            int  NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  source_max_game_date date NOT NULL,   -- as-of watermark
  source_row_count     bigint NOT NULL,
  formula_version      text NOT NULL,   -- 'stuff_plus@1.0.0'
  code_sha             text,
  is_final             boolean NOT NULL DEFAULT false
);
-- 5.2 Immutable values per version; replaces the ON CONFLICT target.
CREATE TABLE pitch_baseline_values (
  baseline_version_id bigint NOT NULL REFERENCES pitch_baseline_versions,
  pitch_name          text   NOT NULL,
  avg_velo numeric, std_velo numeric, avg_movement numeric, std_movement numeric,
  avg_ext  numeric, std_ext  numeric, pitch_count  int NOT NULL,
  PRIMARY KEY (baseline_version_id, pitch_name)
);

-- 5.3 Day-grain scoring ledger. The scorer already loops per game_date, so
--     this grain is LOSSLESS: ~180 rows/season, not 8.89M column values.
CREATE TABLE stuff_plus_scoring_runs (
  game_date           date NOT NULL,
  scope               text NOT NULL DEFAULT 'mlb',
  scored_at           timestamptz NOT NULL DEFAULT now(),
  baseline_version_id bigint REFERENCES pitch_baseline_versions,  -- NULL = unknown
  formula_version     text NOT NULL,
  code_sha            text,
  mode                text NOT NULL CHECK (mode IN ('nightly','repair','rescore','unknown')),
  rows_scored         int  NOT NULL,
  PRIMARY KEY (game_date, scope, scored_at)
);
```

**Cost:** ~20 `pitch_name` values × one refresh/day × ~180 game days ≈ **3,600 rows/season**; two columns on `pitches` would be 8.89M values each. A row's vintage is its `game_date`'s last ledger entry. **Constants get the same treatment:** move `SEASON_CONSTANTS`/`PARK_FACTORS` behind `metric_constant_versions (constant_set, season, effective_from, source, retrieved_at, code_sha, payload jsonb)` and give `computeWRCPlus` an explicit version. **Cheap interim (one line):** stamp `VERCEL_GIT_COMMIT_SHA` and the constants year used into every response — the constants live in git, so a SHA makes any wRC+ screenshot reproducible.

---

## 6. Choosing the remedy

| Option | Cost | Buys | Verdict |
|---|---|---|---|
| **(a)** `baseline_version` + `scored_at` on `pitches` | `ADD COLUMN` is instant, but the backfill is 8.89M UPDATEs at 4.0% HOT (all 29 indexes, 4,833 MB) on a table 13.9% dead — ~2,100 chunked statements | row-grain provenance, forward only | **Reject** — redundant with day grain; history would carry an invented value |
| **(b)** Version `pitch_baselines`, keep history | ~3,600 rows/season; one migration | any past value **recomputable** | **Adopt** — prerequisite for the rest |
| **(a′)** Day-grain scoring ledger | ~180 rows/season; one INSERT per UPDATE | records **which vintage scored which rows** | **Adopt** — (a)'s benefit at 0.002% of the cost |
| **(c)** Full rescore vs final baselines at season close | ~180 chunked statements/year | each **closed** season internally comparable | **Adopt as policy** — Statcast and FanGraphs recompute history |
| **(d)** Accept and document | free | nothing | **Reject as endpoint**; right as the interim caveat |
| **(e)** Score vs the **prior completed season** | definition change + one rescore | eliminates drift at the source | **Escalate to Soto** — cleanest, but changes the metric |

**Li's pick: (b) + (a′) now, (c) as standing policy, (d) as the caveat until they ship, (e) with Soto in the offseason.**

Three notes for (c). **Drop `idx_pitches_stuff_plus` first** — 261 MB at `idx_scan = 0`, the one index a rescore is guaranteed to dirty on every row. **Pin `baseline_version_id` for the whole run** — rescore mode is idempotent *only* if the baseline holds still between chunks. And `?year=2026` at the 1-day default is ~180 chunks × ~2s ≈ **360s against a 300s ceiling**, so the route needs a wall-clock budget and a cursor.

---

## 7. Dual-running, and when to rescore

**Expand / migrate / contract.** Never mutate a metric in place: add `stuff_plus_v2` alongside `stuff_plus`, both populated, consumers untouched. **Compare before switching** — the delta distribution, plus what matters for a plus-stat: **rank correlation and count of rank changes >10 places** on the leaderboards people read. A version that reshuffles the top 20 is a different metric wearing the same name. Cut over with a published `effective_from` and a `deprecation_date` for v1, and drop v1 only once `docs/VARIABLES.md` records both. Dual-running two UPDATEs on `pitches` is expensive — use a **date-scoped slice**.

**Rescore or preserve?** In priority order: **rescore** when the old value was wrong under its own definition (bug, NULL, timeout). **Rescore all history** when the definition changed and the metric describes a fixed population (Stuff+, wRC+), publishing the change and keeping old versions queryable. **Snapshot separately** anything published externally. **Preserve** a decision record — rescoring destroys the audit trail (`10-audit-trails-provenance.md`). **Preserve and label** when rescoring is impossible.

Triton is mostly case 2 with real case-3 exposure: the newsletter and overlays publish numbers that later change underneath, so they should snapshot the value *and its version* at publish time (`daily_cards`).

---

## 8. Reproducing a number from six months ago

With §5 in place, "what was his Stuff+ on 2026-06-15?" is answerable — as **recomputation as-of**, not retrieval. The stored column cannot answer it.

```sql
WITH v AS (   -- the vintage in force at 09:10 UTC on 2026-06-15
  SELECT baseline_version_id FROM pitch_baseline_versions
  WHERE scope='mlb' AND game_year=2026 AND computed_at <= '2026-06-15 09:10+00'
  ORDER BY computed_at DESC LIMIT 1
)
SELECT p.pitcher, count(*) AS n,
       round(avg(<the §3.3 expression, against b>)::numeric, 1) AS stuff_plus_asof
FROM pitches p JOIN v ON true
JOIN pitch_baseline_values b ON b.baseline_version_id = v.baseline_version_id
                           AND b.pitch_name = p.pitch_name
WHERE p.pitcher = 700249 AND p.game_date BETWEEN '2026-06-08' AND '2026-06-15'
GROUP BY p.pitcher;
```

**Three limits remain even so.** Row inputs are mutable, so a Savant restatement after 2026-06-15 yields today's inputs under June's baseline — a hybrid; true as-of needs bitemporal `pitches` (`temporal-modeling/02`, `09`), not worth it at 8.89M rows. `stuff_plus` is rounded and clamped, so it cannot be inverted to recover z-scores. And population membership drifts: percentiles and `league_averages` depend on who qualified *then* (`07-qualification-thresholds.md`).

---

## 9. What Triton should do, in order

1. **Run the §3.3 drift probe** — five days, one query each, logged to `docs/Queries.md`. Everything below scales to the answer.
2. **Stamp `VERCEL_GIT_COMMIT_SHA` + the constants year used into every stats API response**, and make the `LATEST_SEASON_YEAR` fallback log instead of substituting.
3. **Ship `pitch_baseline_versions` + `pitch_baseline_values`.** Convert `refreshPitchBaselines` to an append; keep `pitch_baselines` as a view over the newest version.
4. **Ship `stuff_plus_scoring_runs`** — one INSERT in the existing per-day loop and in `backfill-stuff-plus`; seed history as `mode='unknown'`.
5. **Record the 2026 mixture in `docs/VARIABLES.md`** under `stuff_plus`: drift mechanism, the two-vintage event, a "not comparable within season" flag. Hand display to **Cas** — the platform should say so on any within-season trend.
6. **Adopt the season-close rescore policy**, gated on (3)+(4) so the run pins one `baseline_version_id`, after dropping `idx_pitches_stuff_plus` and giving the backfill route a cursor.
7. **Give `PARK_FACTORS` a season dimension**, or stop applying it before 2020.
8. **Open (e) with Soto in the offseason** — prior-season baselines make most of this unnecessary.

Steps 3–7 change a metric or schema, so they **update `docs/VARIABLES.md` in the same commit.**

**Anti-recommendation — do not add `baseline_version` and `scored_at` columns to `pitches` and backfill them.** The obvious move is wrong three ways. (i) Historical vintages are unrecoverable, so 8.89M rows would carry a fabricated or NULL value — and fabricating invites confident wrong grouping. (ii) The write cost is real: 4.0% HOT means nearly every UPDATE dirties all 29 indexes (4,833 MB) on a table 13.9% dead, under an 8s cap. (iii) It is redundant — scoring is already per-`game_date`, so a ~180-row/season ledger is lossless. **And do not "fix" 2026 with a full-season rescore yet:** until §3.3 quantifies the drift that is 180 statements against a possibly sub-half-point effect, and it destroys the last evidence of the vintages.

**Single highest-leverage next action:** run the §3.3 probe on 2026-04-15, 05-15, 06-15, 07-15 and 08-05 and report `stored_avg − current_baseline_avg` by month. That turns the platform's top open hazard from "known but unquantified" into a number, and sizes every remedy above.

---

## Sources

1. [Semantic Versioning 2.0.0](https://semver.org/) — the breaking-change test.
2. dbt — [Model versions](https://docs.getdbt.com/docs/collaborate/govern/model-versions) — `latest_version` + `deprecation_date`.
3. dbt — [Model contracts](https://docs.getdbt.com/docs/collaborate/govern/model-contracts) — a stable shape makes a bump explicit.
4. dbt — [Metrics / MetricFlow](https://docs.getdbt.com/docs/build/metrics-overview) — metric-as-spec.
5. Delta Lake — [Batch reads/writes](https://docs.delta.io/latest/delta-batch.html) — `versionAsOf` snapshots.
6. Apache Iceberg — [Table spec](https://iceberg.apache.org/spec/).
7. PostgreSQL — [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — `ADD COLUMN` fast path vs rewrite.
8. PostgreSQL — [Heap-Only Tuples](https://www.postgresql.org/docs/current/storage-hot.html) — why an UPDATE dirties every index.
9. PostgreSQL — [Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — bloat from mass UPDATEs.
10. Fowler — [ParallelChange](https://martinfowler.com/bliki/ParallelChange.html) — expand/migrate/contract.
11. Kimball — [SCD Types 0–7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/) — Type 2 effective-dating.
12. Feast — [Docs](https://docs.feast.dev/) — point-in-time correctness.
13. MLflow — [Model Registry](https://mlflow.org/docs/latest/model-registry.html) — two-axis provenance.
14. FanGraphs — [Guts! constants](https://www.fangraphs.com/guts.aspx?type=cn) — what `lib/constants-data.ts` cites; revised in-season.
15. FanGraphs Library — [wRC+](https://library.fangraphs.com/offense/wrc/) — what `computeWRCPlus` implements.
16. Baseball Savant — [CSV field docs](https://baseballsavant.mlb.com/csv-docs) — mutable upstream fields.
17. MLB — [Statcast glossary](https://www.mlb.com/glossary/statcast) — tracking generations: a league-wide input-version change.

**Triton-internal evidence (code-verified 2026-08-11).** `refreshPitchBaselines` + the per-day scoring loop (`app/api/update/route.ts:241–352`); `mode=repair` and the 8k-row chunk measurement (`app/api/admin/backfill-stuff-plus/route.ts`); cron ordering (`vercel.json`); `computeWRCPlus` (`lib/sql.ts:53–61`); the 2026 constants row in `3297054` and `LATEST_SEASON_YEAR` (`lib/constants-data.ts`, `git log`); `lib/dataIntegrity.ts`. **Measured by Jo, quoted here:** coverage decay, league-average stability, 8,891,054 live / 1,437,923 dead rows, 29 indexes / 4,833 MB, 4.0% HOT, `idx_pitches_stuff_plus` 261 MB at `idx_scan = 0` (`docs/Queries.md`, `docs/reliability-findings-2026-08-11.md`).
