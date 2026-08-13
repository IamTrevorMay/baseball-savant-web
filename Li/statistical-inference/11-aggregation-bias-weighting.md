---
title: Aggregation Bias & Weighting — Why Two Surfaces Disagree for Defensible Reasons
domain: statistical-inference
tags:
  - aggregation
  - weighting
  - simpsons-paradox
  - ratio-estimators
  - mix-effects
  - totals-strategy
  - reconciliation
  - effective-sample-size
sources_reviewed: 22
last_updated: 2026-08-12
---

# Aggregation Bias & Weighting — Why Two Surfaces Disagree for Defensible Reasons

> Grades: **(established)** published/replicated; **(computed)** verified against Triton source at the
> cited line (read, not queried); **(estimated)** theory or arithmetic; **(folk-sabermetrics)**
> repeated, unsourced.

## TL;DR

- **The weight vector *is* the question, not an implementation detail.** Four estimands live here; Triton ships three, labels none. **(established)**
- **48 of 69 `MetricDef` entries carry `totals: 'avg'` — `sum / vals.length` over *rows***, so every rate's career row averages seasons unweighted. **(computed)**
- **One route computes the same team stat two ways depending on the SP/RP filter**, so SP and RP never recombine into All. **(computed)**
- **And when it weights, it weights by the wrong denominator**: K% per-PA, Whiff% per-swing, BA per-AB, all weighted by pitch count. **(computed / estimated)**
- **Simpson's paradox is the default hazard of every split the platform offers** — SP/RP, pitch type, level, month. **(established)**
- **The reversal that will bite Triton is pitch mix**: improve every pitch type, watch aggregate Stuff+ fall (`metric-governance/05` §8). **(established / computed)**
- **Weighting chooses the effective sample size, not just the location**: deff = 2.5–3.9, so two starts give an honest n of **2**. **(computed)**
- **`league_averages` is a mean of player rates, not a league rate** — a 60-IP reliever weighs as much as a 200-IP starter. **(computed)**
- **The career-OPS sum bug was caught because it was absurd; the career-BA average bug survives because it is plausible**: ~5–10% error, inside the range a reader expects. **(computed / estimated)**
- **Two surfaces disagreeing for defensible reasons is the expensive failure**: a bug gets fixed, a weighting gap gets argued over with both sides right. **(established)**
- **The fix is a declared weight per metric plus an identity that fails loudly**: `'avg'` → `{avg, weighted_by: <denominator column>}`. **(estimated)**
- **Direct standardization is the fix epidemiology adopted and baseball never did**: one reference mix for both pitchers, not each his own. **(established)**

---

## 1. Four estimands wearing one column name

Aggregation is a choice of weights `wᵢ` in `Σwᵢvᵢ / Σwᵢ`. Four are live here.

| Weight basis | Estimator | Question it answers | Where in Triton |
|---|---|---|---|
| **Denominator-weighted** (ratio-of-sums) | `Σ numᵢ / Σ denᵢ` | "the pooled-event rate" | `METRICS.*` SQL over a pooled window; team `GROUP BY` (`scene-stats:243-250`) |
| **Pitch-weighted** | `Σ vᵢ·pitchesᵢ / Σ pitchesᵢ` | "across all his pitches" | `pivotTritonRows` (`lib/sql.ts:78-85`); filtered team branch (`scene-stats:228,237`) |
| **Unit-weighted** (mean of rows) | `Σ vᵢ / n_rows` | "the typical season / outing" | `calcTotalsFromRegistry` `case 'avg'` (`metricRegistry:663-670`); `refresh_league_averages` `AVG()` over players |
| **Additive** | `Σ vᵢ` | counting stats | 15 registry `'sum'` entries; `ADDITIVE = new Set(['ip'])` (`scene-stats:209`) |

They coincide only when every group contributes equal denominator events — never true here: seasons
differ 30× in AB, pitch types 10× in usage, SP and RP 4× in IP. Each estimates a *different* quantity, so
"which is correct?" is malformed. What is incorrect: (a) not saying which one a number is, (b)
weighting by neither the metric's denominator nor a deliberate choice. Triton does both.
**(established)**

---

## 2. Simpson's paradox, and the four places it lives here

Reversal happens when a comparison is pooled across a variable tied to both the outcome and group
sizes. Jeter vs Justice, 1995–96: Justice hit for a higher average in each season and a lower one
combined, because Jeter's at-bats concentrated in the year hits were easier. Pooling gives
`Σpᵢnᵢ / Σnᵢ`; reversal needs only `n` covarying with `p` oppositely for the two entities —
common, needing no adversarial data, and **undetectable from the pooled number alone.** **(established)**

| Triton split | Lurking variable | Why it reverses | Grade |
|---|---|---|---|
| **SP vs RP** (≥3 games of 50+ pitches) | Role drives velocity, usage, leverage; RP velo exceeds SP velo; swingman innings split unevenly | A pitcher can trail both cohorts yet lead the pooled population, or the reverse. Canonical for `league_averages`; Stuff+ baselines pool roles (`metric-governance/05` §3) | (established / computed) |
| **Pitch type** | Usage mix; `pitcher_season_command`/`_deception` are grained pitcher × pitch_type × year, so a season value collapses it | §3.3 — per-type values improve while the aggregate falls | (computed) |
| **Level (MLB/MiLB)** | Separate baseline tables and populations | A promoted pitcher's combined line mixes two scales in different units (`metric-governance/08`) | (computed) |
| **Month / vintage seam** | Nightly `pitch_baselines`; the 2026-06-01 repair seam | Feb–May and Jun–Aug are two scoring regimes with month-unequal pitch counts (`metric-governance/05` §6) | (computed) |

**The rule:** where a surface shows a pooled number *and* a split of the same population, the two are a
Simpson pair and the reader is owed the pooled figure's weights. Epidemiology's remedy is **direct
standardization**: score every entity against one reference mix instead of absorbing mix differences.
For Stuff+: per-pitch-type values primary, every aggregate labeled mix-dependent.

---

## 3. Weighted means of ratios

### 3.1 Mean-of-ratios ≠ ratio-of-sums

For `v = num/den`, `mean(vᵢ) ≠ Σnumᵢ/Σdenᵢ` unless all `denᵢ` are equal. The pooled form is the **ratio
estimator**; the unweighted mean estimates the average *unit's* rate, at higher variance:

| Season | H | AB | BA |
|---|---|---|---|
| A | 150 | 500 | .300 |
| B | 2 | 20 | .100 |
| **Unweighted mean of season BAs** | | | **.200** |
| **Pooled (ratio-of-sums)** | 152 | 520 | **.292** |

92 points of batting average from nothing but the weight vector — exactly what `case 'avg'` in
`calcTotalsFromRegistry` does to the career row for `ba`, `obp`, `slg`, `ops`, `whip`,
`era` and the rest of the 48. **(computed)**

### 3.2 Ratios of ratios and Jensen

`ops`, `whip`, `era` and the `_plus` family compound it — ratios whose parts are rates. By Jensen, a
non-linear function of a mean ≠ the mean of the function, sign set by convexity: `ERA = 9·ER/IP`
is convex in `1/IP`, so averaging season ERAs is biased **upward** against pooled ERA when the low-IP
seasons are the bad ones — the usual pattern, as bad seasons get shortened. Team wRC+ is the standard done
right: FanGraphs recomputes from aggregated components rather than averaging player wRC+, and
`computeWRCPlus()` (`lib/sql.ts`) runs at query time off `SEASON_CONSTANTS`/`PARK_FACTORS`
(`lib/constants-data.ts`) — so a team rollup averaging player values is wrong at the averaging step, not
the computing step. **(established / computed)**

### 3.3 The mix effect: improving everywhere, getting worse

A pitcher's displayed Stuff+ is a mix-weighted mean of z-scores computed *within* pitch type:

| Pitch | Stuff+ 2025 | usage 2025 | Stuff+ 2026 | usage 2026 |
|---|---|---|---|---|
| Four-seam | 112 | 60% | 115 | 45% |
| Slider | 92 | 40% | 95 | 55% |
| **Aggregate** | **104.0** | | **104.0** | |

Both pitches gained three points and the aggregate did not move; shift ten more points of usage and it
falls. The aggregate is a *usage statement wearing a stuff label* — as is Cmd+ (pitch-weighted across
types in `pivotTritonRows`), so any "he's declining" claim on a season plus-stat must first rule out a
mix change: `GROUP BY pitch_type` with usage shares, not a t-test. **(computed / established)**

### 3.4 Extremes are not means

`maxEV` and `maxVelo` use `totals: 'max'`, a recorded fix: both were previously averaged, yielding a
"career max" that was no player's max and biased low. `max` is right for the estimand, with one caveat
worth a tooltip — a career max is an extreme order statistic growing with exposure, so a 12-year max
velo beats a 3-year one at equal true ability, making cross-player comparisons partly exposure ones. **(computed / established)**

---

## 4. The `TotalsStrategy` audit

`lib/metricRegistry.ts:4` declares `type TotalsStrategy = 'sum' | 'avg' | 'max' | 'ip' | 'totalRE' | 'none'`.
Across the 69 `MetricDef` entries:

| Strategy | Count | Correct for | Assessment |
|---|---|---|---|
| `'avg'` | **48** | plus-stats and per-pitch means (velo, spin, break, ext) — *if* pitch-weighted | Wrong estimator for every ratio in the set; unweighted even where the right weight sits on the row |
| `'sum'` | 15 | W, L, SV, G, GS, PA, pitches, H, HR, BB, K, HBP | Correct |
| `'max'` | 2 | `maxEV`, `maxVelo` | Correct (§3.4) |
| `'ip'` | 1 | `ip` | Thirds-aware outs arithmetic — but see below |
| `'totalRE'` | 1 | `totalRE` | Correct (a sum with inverted coloring) |
| `'none'` | 2 | `year`, `name` | Correct |

Two structural faults, both in the registry not the call sites, so one file fixes every consumer
(`OverviewTab.tsx:202` today).

**Fault 1 — `'avg'` conflates three estimands.** A plus-stat, a physical mean and a ratio want pitch-,
pitch- and denominator-weighting; one enum covers all three and delivers unit-weighting to all three.

**Fault 2 — the weight column is present and unused.** Rows fed to `calcTotalsFromRegistry` carry
`pitches` and `pa`, but `const vals = rows.map(r => parseFloat(r[key]))` keeps only the metric column,
discarding the weight one line before it is needed. **(computed)**

`case 'ip'` is a third hazard: it reads `"12.2"` as 12 innings + 2 outs, right for MLB-API thirds in
`player_season_stats`, wrong for `METRICS.ip`, which emits true decimal `ROUND(outs/3, 1)` — so `"12.7"`
becomes 12 innings **plus 7 outs** = 14.1 IP (`metric-governance/01` §2.4). No aggregation is correct
while the unit is ambiguous.

---

## 5. The disagreement you can reproduce today

`app/api/scene-stats/route.ts` computes team pitching stats on two exclusive branches:

```ts
// No role filter (route.ts:243-250): pooled ratio-of-sums in SQL
SELECT (team) as team, ${METRICS[m]} as ${m} FROM pitches p ... GROUP BY (team) HAVING COUNT(*) >= 100

// SP/RP filter (route.ts:209-239): per-pitcher rates re-aggregated in JS
const ADDITIVE = new Set(['ip'])   // cnt = pitch count; a.n = Σ pitches
agg.sums[m] += ADDITIVE.has(m) ? Number(row[m]) : Number(row[m]) * cnt
r[m] = ADDITIVE.has(m) ? a.sums[m] : a.sums[m] / a.n
```

Three defensible disagreements follow, none surfaced:

| # | Disagreement | Mechanism | Grade |
|---|---|---|---|
| 1 | **All ≠ SP ⊕ RP** | Different estimators, not populations: pooled ratio-of-sums vs pitch-weighted mean of player rates | (computed) |
| 2 | **The weight is the wrong denominator** | K% is per-PA, Whiff% per-swing, BA per-AB, all weighted by pitch count. Pitches/PA runs ~3.5–4.3, so high-pitch/PA (high-K, high-BB) pitchers are over-weighted ~10–20% vs their PA share, biasing team K% up | (estimated) |
| 3 | **The 100-pitch floor moves** | `HAVING COUNT(*) >= 100` filters in SQL on the pooled branch, `a.n >= 100` after the JS role filter, so a team can qualify on one branch and not the other | (computed) |

Disagreement 2 generalizes: **a rate may only be weighted by its own denominator** — weighting a per-PA
rate by pitches estimates a quantity with no name. Where the denominator is missing at the rollup grain,
pool from the base table or refuse the rollup; never substitute a correlated column.

---

## 6. Weighting also chooses your effective n

Weights set precision as well as location. Pitches within an outing are correlated: at ~75 pitches per
start and ICC ρ ≈ 0.02–0.04, deff = **2.5–3.9** (`statistical-inference/01`), so 149 pitches act like 38–60
independent observations.

| Aggregation | Nominal n (2 starts) | Honest n | Consequence |
|---|---|---|---|
| Pitch-weighted | ~149 pitches | 38–60 | Precision overstated 2.5–3.9× if SE uses √n |
| Outing-weighted | 2 outings | **2** | Honest, and honestly useless at this window |
| Season-weighted (career row) | n_seasons | n_seasons | Right for "typical season," wrong for "career rate" |

Three consequences. `stddev/√n_pitches` is never the right SE for a pitcher-level claim — use
outing-clustered SEs or a bootstrap over outings. **The variance-minimizing estimator is not automatically the
one you want**: pitch-weighting is efficient for the pooled-pitch estimand, a different question from
outing-weighting. And efficient weights in a mixed sample are inverse-variance, not size (Horvitz–Thompson) — so `league_averages`' unweighted `AVG()` is defensible as "the average qualified
pitcher," indefensible as "the league rate." **(computed / established)**

---

## 7. Reconciliation as a discipline

The goal is not that every surface agrees but that **every disagreement is predicted, bounded and
tested**. Three artifacts.

**7.1 Declare the weight in the type**, so it is data not convention:

```ts
type TotalsStrategy =
  | { kind: 'sum' | 'max' | 'none' }
  | { kind: 'avg'; weightedBy: 'pitches'|'pa'|'ab'|'bf'|null }  // null = deliberate unit-weight
  | { kind: 'ratio'; num: string; den: string }                 // recompute, never average
```

`ba`/`obp`/`slg`/`ops` become `ratio`, recomputed from components; `kPct` becomes `avg weightedBy 'pa'`;
plus-stats `avg weightedBy 'pitches'`. Crucially, `calcTotalsFromRegistry` should **render `—` and a
reason when the declared weight column is absent** — convention becomes mechanism.

**7.2 Write the identity as a test** — in CI against a fixture, never production:

```sql
-- The pa-weighted rollup of per-pitcher K% must equal the pooled K%
WITH pp AS (SELECT COUNT(*) FILTER (WHERE events IS NOT NULL) AS pa,
                   COUNT(*) FILTER (WHERE events LIKE '%strikeout%') AS k
            FROM fixture_pitches GROUP BY pitcher)
SELECT abs(SUM(100.0*k/NULLIF(pa,0) * pa)/SUM(pa) - 100.0*SUM(k)/SUM(pa)) < 0.01 AS ok FROM pp;
```

Weighting by `pa` reproduces the pooled rate exactly; weighting by pitch count does not. The test is
that difference, and it fails today. Cas owns making the failure visible; Li owns declaring which
identity must hold.

**7.3 Keep a disagreement ledger** — one row per pair of surfaces sharing a metric name: weight basis,
population, filter, the *expected* relation (equal / pooled ≥ unit-weighted / documented offset), and
the test enforcing it. A disagreement in the ledger is a design decision; one absent from it is a defect.

---

## 8. What Triton should do, in order

1. **Adopt the §7.1 `TotalsStrategy` shape**: the weight column declared per metric, and
   `calcTotalsFromRegistry` refusing to render a weighted metric when it is absent — one file, every
   consumer, and a missing denominator becomes structurally impossible.
2. **Reclassify the ratios as `ratio`, recomputed from components**: `ba`, `obp`, `slg`, `ops`, `whip`,
   `era`, `kPct`, `bbPct`, `kbbPct`, `whiffPct`, `swStrPct`, `csPct`, `fpsPct`, `zonePct`. The career row
   is wrong for all 14 today — ~5–10% routinely, ~90 BA points pathologically.
3. **Fix the `scene-stats` team rollup: weight by each metric's own denominator, or pool from `pitches`
   on both branches.** Pooling kills disagreements 1 and 3 at once, and the role filter is an
   `IN (subquery)` SQL can apply first.
4. **Publish per-pitch-type plus-stats as primary; label every aggregate mix-weighted** (§3.3), with
   usage shares beside the values so a mix change is visible.
5. **State each metric's weight basis, per aggregation path, in `docs/VARIABLES.md`**, same commit as the
   type change: an undocumented weight change is an undocumented metric change.
6. **Add the ledger and its fixture tests (§7.2, §7.3)**, starting with the metric names on the most
   surfaces.
7. **Relabel `league_averages.value` "mean of qualified-player rates,"** then decide whether the
   plus-stat denominator should be that or the pooled league rate. Both are defensible and they
   differ; only one can be documented.

**Anti-recommendation: do not standardize on ratio-of-sums everywhere.** The obvious response to §3, wrong
three ways. **(a) Wrong estimand** — "how does he do in a typical outing?" is
outing-weighted; pooling answers something else and hides the between-outing variance a scout is buying.
**(b) Not computable at the stored grain** — `pitcher_season_command`, `pitcher_season_deception`,
`player_season_stats` and `league_averages` store rates and plus-stats *without* numerators and
denominators, so mandating it forces every rollup back to an 8.9M-row scan of `pitches`, on a platform that already
day-chunked Stuff+ scoring to clear an 8s statement timeout. **(c) Undefined for
most metrics** — a z-composite has no numerator/denominator pair, so "ratio of sums" is meaningless for
Stuff+, Cmd+, Brink+, Cluster+, Deception and Unique, the bulk of the 48 `'avg'` entries. A rule that
cannot apply to most of the surface is a slogan, not a standard.

**Highest-leverage next action:** items 1–2 together — `weightedBy` on `MetricDef`, populated for the
~14 ratio metrics, `calcTotalsFromRegistry` returning `—` plus a reason code when it is missing, with
the §7.2 fixture test so the identity is enforced, not asserted.

---

## Sources

1. [Simpson's paradox](https://en.wikipedia.org/wiki/Simpson%27s_paradox) — reversal mechanism; Jeter/Justice (§2).
2. [Pearl — Understanding Simpson's Paradox](https://ftp.cs.ucla.edu/pub/stat_ser/r414.pdf) — pooled tables can't adjudicate (§2).
3. [SEP — Simpson's Paradox](https://plato.stanford.edu/entries/paradox-simpson/) — reversal conditions (§2).
4. [Confounding](https://en.wikipedia.org/wiki/Confounding) — the lurking variable (§2).
5. [Ecological fallacy](https://en.wikipedia.org/wiki/Ecological_fallacy) — a team rate ≠ its pitchers (§5).
6. [Modifiable areal unit problem](https://en.wikipedia.org/wiki/Modifiable_areal_unit_problem) — grain choice (§1).
7. [Ratio estimator](https://en.wikipedia.org/wiki/Ratio_estimator) — ratio-of-sums vs mean-of-ratios (§3.1).
8. [Weighted arithmetic mean](https://en.wikipedia.org/wiki/Weighted_arithmetic_mean) — the `Σwv/Σw` framing (§1).
9. [Jensen's inequality](https://en.wikipedia.org/wiki/Jensen%27s_inequality) — bias direction, convex ratios (§3.2).
10. [Standardized rate](https://en.wikipedia.org/wiki/Standardized_rate) — standardization to a common mix (§2).
11. [Design effect](https://en.wikipedia.org/wiki/Design_effect) — deff = 1 + (m−1)ρ (§6).
12. [Intraclass correlation](https://en.wikipedia.org/wiki/Intraclass_correlation) — the ρ inside deff (§6).
13. [Cluster sampling](https://en.wikipedia.org/wiki/Cluster_sampling) — the outing as sampling unit (§6).
14. [Effective sample size](https://en.wikipedia.org/wiki/Effective_sample_size) — the honest-n column (§6).
15. [Horvitz–Thompson estimator](https://en.wikipedia.org/wiki/Horvitz%E2%80%93Thompson_estimator) — inverse-probability weights (§6).
16. [FanGraphs — wRC+](https://library.fangraphs.com/offense/wrc/) — team wRC+ from components (§3.2).
17. [FanGraphs — wOBA](https://library.fangraphs.com/offense/woba/) — rebuild rates from num/den (§3.2).
18. [FanGraphs — Sample Size](https://library.fangraphs.com/principles/sample-size/) — per-metric event counts (§7.1).
19. [MLB Glossary — Qualified](https://www.mlb.com/glossary/rules/qualified) — fixed vs proportional floor (§6).
20. [Baseball Savant — CSV docs](https://baseballsavant.mlb.com/csv-docs) — `events`/`pitch_name` fields (§7.2).
21. [PostgreSQL — Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — `AVG` NULLs, `FILTER` (§7.2).
22. [dbt — Measures](https://docs.getdbt.com/docs/build/measures) — `agg` declared per measure (§7.1).

**Triton-internal evidence.** Read from source 2026-08-12; no DB queries this pass — row counts
from that date's central measurement pass. `lib/metricRegistry.ts:4` (`TotalsStrategy`), `:643-688`
(`calcTotalsFromRegistry`: `:654` drops weight columns, `:663-670` `'avg'`, `:671-675` `'max'`,
`:676-683` thirds-parsing `'ip'`). Census of the 69 `MetricDef` entries:
**48 `'avg'`, 15 `'sum'`, 2 `'max'` (`maxEV:288`, `maxVelo:479`), 1 `'ip'` (`ip:84`), 1 `'totalRE'`
(`:422`), 2 `'none'`**; only 9 keys join to `reportMetrics.METRICS`; sole consumer
`components/dashboard/OverviewTab.tsx:202`. `lib/sql.ts:64-90` (`pivotTritonRows`, pitch-weighted at `:79`,
`p[k+'_s'] += Number(row[k]) * n`), 19 `TRITON_COLUMNS` at `:7-13`.
`app/api/scene-stats/route.ts:209` (`ADDITIVE = new Set(['ip'])`), `:228` (`* cnt`), `:233`
(`a.n >= 100`), `:237` (`a.sums[m] / a.n`), `:243-250` (pooled `GROUP BY`, `HAVING COUNT(*) >= 100`),
`:844` (SP/RP subquery, ≥3 games of 50+ pitches). `lib/reportMetrics.ts:10` (`METRICS.ip`), `:25`
(`k_pct`, PA denominator), `:27` (`whiff_pct`, swing denominator), `:32` (`ba`, AB denominator).
`scripts/create-refresh-league-averages.sql:200-207` (`AVG(...)`/`STDDEV_SAMP(...)` over per-player
aggregates built at `:128-133`, `:183-185`) — the mean-of-player-rates finding, over **1,806** rows. Grain sizes (§6, anti-rec): `pitches` **8,877,621**;
`pitcher_season_command` **27,119**; `pitcher_season_deception` **17,386**; `player_season_stats`
**79,061** keyed `(player_id, season, stat_group)`; `pitch_baselines` **206** keyed
`(pitch_name, game_year)`. Clustering constants (~75 pitches/start, ICC ρ ≈ 0.02–0.04, deff 2.5–3.9)
from `statistical-inference/01`. Day-chunked Stuff+ scoring: commit
`cf345e2`, "fix(stuff+): day-chunk scoring to clear the 8s RPC statement timeout." Prior fixes on record: `maxEV`/`maxVelo` averaged → `max`; career OPS summed → averaged, the latter
still wrong per §3.1.
