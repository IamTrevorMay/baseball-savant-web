---
title: Benchmarking & Percentiles — What "88th Percentile" Actually Claims
domain: statistical-inference
tags:
  - percentiles
  - quantile-estimation
  - rank-statistics
  - tie-handling
  - tail-instability
  - population-definition
  - benchmarking
sources_reviewed: 22
last_updated: 2026-08-12
---

# Benchmarking & Percentiles — What "88th Percentile" Actually Claims

`metric-governance/05-baseline-normalization-design.md` owns the choice *between* normalization
schemes; this doc owns the mechanics after it — which quantile definition runs, how ties break, how
many observations back a tail breakpoint, when a rank beats a value.

## TL;DR

- **Five percentile estimators run and none is named on screen** — nearest-rank, `percentile_cont`, `PERCENT_RANK()`, normal-CDF, piecewise-linear (§3). **(computed)**
- **Nine standard sample-quantile definitions exist; Triton uses two, in adjacent surfaces, keyed to nothing** — Hyndman–Fan Type 1 (`percentile_disc`) and Type 7 (`percentile_cont`), up to one order-statistic gap apart. **(established)**
- **`plusToPercentile` is a unit error, not a modelling choice:** `lib/leagueStats.ts:1351` builds a plus at 15 points per SD, `:1339` reads it back at 10 — a true 84th renders **93rd**. **(computed)**
- **At n=453 the 99th percentile is the 5th-largest observation; at n=60 it is the maximum.** **(computed)**
- **Below n=99 the stored grid is partly fabricated:** a fixed `numeric[99]` over a 60-player SP pool leaves **39 of 99 values duplicating a neighbour**. **(computed)**
- **Tail breakpoints are ~3× noisier than the median in the same pool, at every n** — 0.48σ vs 0.16σ at n=60; a p99 line moving half a population SD is not a threshold. **(estimated)**
- **A simultaneous 95% band on the whole percentile curve is ±6.4 points at n=453 and ±17.5 at n=60** (DKW, √(ln(2/α)/2n)) — an "88th" is not separable from the 70th. **(established)**
- **Value noise and pool noise have opposite gradients, so rank and value are not interchangeable:** dp/dx = f(x) — ~4 percentile points per 0.1σ near the median, ~0.27 in the tail, 15×. **(established)**
- **`refresh_league_percentiles` has no minimum-n gate** (zero `HAVING` in 703 lines) while `/api/movement-percentiles` gates at 20 pitchers — the stricter rule guards the smaller surface. **(computed)**
- **The repo's two tie conventions point opposite ways:** `empiricalPercentile` gives ties the *highest* rank, `PERCENT_RANK()` the *lowest*. **(computed)**
- **Percentile rank is immune to baseline-vintage drift, not at all to population drift** — `league_percentiles` is frozen at 2026-06-03. **(computed)**
- **`league_averages` is documented as a 50th-percentile benchmark and implemented as `AVG()`** over 1,806 rows — the docs' one percentile promise is the one place none is computed. **(computed)**

---

## 1. What a percentile claims

Five commitments compressed into two digits; leave one implicit and the number is unfalsifiable.

| Commitment | Question | Triton's answer |
|---|---|---|
| **Population** | Ranked against whom? | Qualified players per `(season, level, role)` — `metric-governance/07` |
| **Estimator** | Which of the nine? | Two, unlabelled (§2–3) |
| **Tie rule** | Equal values, which rank? | Three conventions, contradictory (§4) |
| **Direction** | Is high good? | `higher_better` — the one thing done right |
| **Vintage** | Computed when? | `updated_at` exists; nothing displays it |

Only Direction surfaces. `lib/metricRegistry.ts` (69 `MetricDef` entries, 9 joining
`reportMetrics.METRICS`) already makes rank-like claims via `ColorSpec` `plus` mode (above/below
threshold, high/low band) from a registry with no link to the computation.

---

## 2. The nine definitions, and the two that matter

Hyndman & Fan (1996) catalogued software's estimators as types 1–9: three discontinuous, six
continuous.

| Type | Rule | Plateaus | Real observation? | Where |
|---|---|---|---|---|
| **1 — inverse ECDF** | `x[⌈p·n⌉]` | Jumps ranks | **Yes** | `percentile_disc`; **Triton `league_percentiles`** |
| 2 | Type 1, averaged at jumps | Smoother | Sometimes | SAS default |
| 3 | Nearest even order statistic | Jumps | Yes | SPSS |
| 6 | `p(n+1)` position, linear | Smooth | No | Excel `PERCENTILE.EXC`, Minitab |
| **7 — the default** | `1+p(n−1)` position, linear | Smooth | No | `percentile_cont`, R/NumPy; **Triton movement** |
| 8 | Median-unbiased, distribution-free | Smooth | No | Hyndman's pick |
| 9 | Approx. unbiased under normality | Smooth | No | — |

**Type 1 vs Type 7 is no rounding detail at Triton's pool sizes.** Type 7 interpolates and can
report a p99 velocity nobody threw; Type 1 always returns a posted value, the honest object for
bounded or lumpy metrics (whiff% on a thin denominator, max velo, integer counts), while Type 7 is
lower-variance for smooth metrics with adequate n. Both defensible; **running both unlabelled is
not.** Hyndman recommends Type 8; Triton has none, and adopting it is a rebaselining event (§9).

---

## 3. Triton's five estimators, inventoried

| # | Surface | Code | Estimator | Range | Min n |
|---|---|---|---|---|---|
| 1 | `league_percentiles` (Ranks tab, charts) | `create-refresh-league-percentiles.sql:239` | `vals[ceil(p·n/100)]`, clamped — **HF Type 1** | 1–99 | **none** |
| 2 | Velo-matched movement | `app/api/movement-percentiles/route.ts:74,78` | `percentile_cont` — **HF Type 7** | 1–99 | 20 pitchers / 10 pitches |
| 3 | Puzzle stat cards | `app/api/game/puzzle/route.ts:140` | `PERCENT_RANK()` = (rank−1)/(n−1) | **0–100** | none |
| 4 | Command / deception rows | `lib/leagueStats.ts:1338` | `Φ((plus−100)/10)` — **parametric** | 1–99 | none |
| 5 | Mechanics report | `lib/mechanics/percentile.ts:11` | Piecewise-linear over p10/p25/p50/p75/p90 | 1–99 | static norms |

Five estimators, three ranges, three tie conventions, one word on screen.

### 3.1 The `plusToPercentile` unit error

```ts
computePlus(v, mean, sd) => ((v - mean) / sd) * 15 + 100  // :1320 — 15 pts/SD
plusToPercentile(plus) => clamp(normalCDF((plus - 100) / 10) * 100)  // :1338 — read at 10
```

`valueToPercentile` (`:1344`) holds both halves in one eleven-line function — not two authors'
conventions colliding. The map is monotone but wrong:

| True percentile | Plus (15/SD) | z assumed (÷10) | Displayed |
|---|---|---|---|
| 84th | 115 | 1.5 | **93rd** |
| 75th | 110 | 1.0 | **84th** |
| 50th | 100 | 0.0 | 50th |
| 25th | 90 | −1.0 | **16th** |
| 16th | 85 | −1.5 | **7th** |

Peak distortion is ~9 points near the quartiles; tails saturate against the 1/99 clamp ~1.5σ early.
`app/api/compute-triton/route.ts:211–220` builds every command plus, `PercentileTab.tsx:222–233`
renders it. It is also the five's one **parametric** estimator, assuming a normality right-skewed
command residuals lack.

### 3.2 The mechanics extrapolation is dimensionally wrong

`percentileOf` interpolates five anchors, then beyond p90 returns `90 + (value − p90)/p90 × 10` —
denominator *the breakpoint value*, not the spread. Hip–shoulder separation (p90 = 55°): 5.5° buys
10 points; peak pelvis velocity (p90 = 860°/s): 86°/s. Tail slope is an accident of each metric's
zero point. The bands are an OpenBiomechanics stand-in until in-house capture: express tail
extrapolation in (p90 − p50) units, cap at 95.

---

## 4. Ties, and the three ways Triton breaks them

| Convention | Definition | Where | Effect on a tied player |
|---|---|---|---|
| **Weak / max rank** | P(X ≤ x) | `empiricalPercentile`: `breakpoints[mid] <= value` | Best rank — **flatters** |
| **Strict / min rank** | P(X < x) | `PERCENT_RANK()` uses `rank()` | Worst rank — **penalises** |
| **Mean rank** | ½[P(X<x)+P(X≤x)] | nowhere | The unbiased choice |

scipy's `percentileofscore` exposes all four (`rank`/`weak`/`strict`/`mean`); the choice is
consequential. It bites where ties cluster: rounded and discrete metrics (max velo to 0.1 mph across
60 SPs, any integer count) and wherever stored breakpoints repeat (§5), which manufactures
*artificial* ties — a value equal to a duplicated breakpoint clears every copy.

Worked: n=60, p94 = p95 = p96 = 96.4 mph, pitcher sits there. `empiricalPercentile` returns
**96**, min-rank **93**, mean-rank 94.5 — three points of pure convention, invisible.

Ranges disagree too: `empiricalPercentile` clamps to [1,99]; `PERCENT_RANK()` emits a literal
**0 and 100**.

---

## 5. Discretization: 99 breakpoints from fewer than 99 players

`league_percentiles.breakpoints` is `numeric[99] NOT NULL`, filled by `generate_series(1,99)` against
`ceil(p·n/100)`. When n < 99 the map is not injective:

| Pool | n | Distinct reachable ranks | Duplicated grid points | Resolution |
|---|---|---|---|---|
| MLB hitters | ~140 | 99 | 0 | 1.0 pt/rank |
| MLB SPs | ~60 | 60 | **39** | 1.7 pt |
| MLB RPs | ~180 | 99 | 0 | 1.0 pt |
| MiLB thin metric cells | 15–40 | 15–40 | **59–84** | 2.5–6.7 pt |

*(Pool sizes estimated from `metric-governance/07`'s floors against 453 MLB pitchers in Aug 2026 and
444 MiLB batters; duplication arithmetic is exact given n.)*

At n=17 the table stores 99 numbers describing 17 facts; nothing downstream can tell which 82 are
artefacts, and `empiricalPercentile` still returns "88th percentile" where one rank is worth 5.9.
The gate exists elsewhere: `/api/movement-percentiles` returns NULL below `COUNT(*) >= 20`.

---

## 6. Tail instability: why the 99th percentile of 453 is a rumour

Two independent problems, usually conflated.

**6.1 The breakpoint rests on almost nothing.** At n=453, `ceil(0.99 × 453) = 449`: p99 is the 449th
of 453 — **four observations above the line**, five at or above; p98 sits at 444, making the 98–99
band five players wide. At n=60, `ceil(0.99 × 60) = 60`: **p99 is the league maximum**, one draw with
no upper neighbour.

**6.2 Quantile SE scales as 1/f, and f collapses in the tail.** SE(q̂_p) ≈ √(p(1−p)/n)/f(q_p); under
normality f(0)=0.399/σ, f(2.326)=0.0267/σ:

| n | SE at p=.50 | SE at p=.99 | Ratio |
|---|---|---|---|
| 453 | 0.059σ | **0.175σ** | 3.0× |
| 180 | 0.094σ | 0.277σ | 3.0× |
| 60 | 0.162σ | **0.481σ** | 3.0× |

**(estimated — asymptotic SE against a normal reference; real tails are heavier, so these are
optimistic.)** A p99 line on a 60-player pool wanders half a population SD between refreshes with
nobody's ability changing. EVT says so structurally: tail quantiles turn on a shape parameter the
sample barely identifies — hence fitting a tail model, not reading an order statistic.

**6.3 The uniform bound.** DKW gives a simultaneous 95% ECDF band of √(3.689/2n): n=453 → **±6.4
points**; n=180 → ±10.1; n=60 → **±17.5**. Conservative pointwise (covers every percentile at
once) but it sets the display grain: an integer "88" from a 60-player pool asserts ~17× the
resolution present.

**6.4 The ranked value is noisy too.** It has its own SE (`04-uncertainty-quantification.md`: a
Stuff+ season mean, ±0.30 sampling plus ≈0.5 vintage bias), and value→percentile conversion uses the
density again, running *oppositely*: 0.1σ ≈ **4 points** near the median, **0.27** at z=2.33 — the
tail pairs an unstable breakpoint with a stable rank, the middle the reverse. "Percentiles are
unreliable at the edges" is half right.

---

## 7. Rank versus value

| Property | Percentile rank | Raw value / plus-stat |
|---|---|---|
| Monotone rescoring (baseline refresh) | **Invariant** | Shifts every row |
| Population change | **Shifts every row** | Invariant |
| Cross-metric comparison | Native | Needs σ or a plus form |
| Cross-level (MLB↔MiLB) | Valid within level only | Same restriction |
| Distance information | **Destroyed** | Preserved |
| Small-n behaviour | Degrades to a grid (§5) | Widens the interval |
| Skew | Absorbed | Exposed |

**What rank buys.** `metric-governance/05` establishes `stuff_plus` is not internally comparable
across 2026 — ~100 baseline vintages scored it — while a percentile *within a fixed population* is
invariant to any monotone rescoring, so `league_percentiles` is more vintage-robust than the column
it ranks. **The condition does all the work**: Triton's population is not fixed (§8).

**What rank destroys.** Equal percentile steps are unequal value steps: under normality 50→55 spans
0.125σ, 90→95 0.36σ, 95→99 0.68σ — a 90th→95th mover gained ~3× a 50th→55th mover, both displayed
"+5". **Never ship a percentile without its raw value adjacent**: Savant prints both, plus the
qualification rule (2.1 PA/team game for batters, 1.25 for pitchers).

---

## 8. Population definition — the error percentiles cannot fix

**Staleness is a population error, not a freshness error.** `league_percentiles` last refreshed
**2026-06-03 — 69 days stale** at 2026-08-11, part of the P0 refresh-chain outage. The Ranks tab
puts an August value against **June breakpoints from a June-qualified pool**: the distribution
moved, and the `0.20 × leader` floor was ~40% lower in June, so that pool held marginal players it
now would not.

**The population moves by design.** Leader-proportional qualification (`metric-governance/07`) shifts
the reference set weekly as the leader accumulates, so a percentile is not reproducible as of a past
date: same player, value and season, different rank in June and September because the *denominator's
membership* moved (`temporal-modeling/01-as-of-correctness.md`).

**The documented median does not exist.** `CLAUDE.md:114`, `docs/VARIABLES.md:302` and `:442` call
`league_averages` "50th-percentile benchmarks"; the implementation is `AVG()` with `STDDEV_SAMP()`
over 1,806 rows, column comment *"Mean of the metric across qualified players."* For right-skewed
rates the mean sits above the median, so heatmap midpoints and above/below colouring are wrong in a
known direction. Emitting both, labelled, is one line; swapping them is a rebaselining event needing
a version stamp:

```sql
SELECT metric,
       avg(val) AS mean_val,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY val) AS median_cont,  -- HF type 7
       percentile_disc(0.5) WITHIN GROUP (ORDER BY val) AS median_disc,  -- HF type 1
       count(*) AS n_qualified
FROM qualified GROUP BY metric;
```

---

## 9. What Triton should do, in order

1. **Fix the `plusToPercentile` denominator** (`lib/leagueStats.ts:1339`, ÷10 → ÷15) with a test
   asserting `plusToPercentile(computePlus(μ+σ, μ, σ)) === 84` — the one outright arithmetic error.
2. **Add `HAVING count(*) >= 30` to `refresh_league_percentiles`**, writing NULL breakpoints plus a
   reason, matching the `>= 20` gate in `/api/movement-percentiles`. Below it show the raw
   value and rank-of-n ("7th of 22"), never a percentile.
3. **Surface `n_qualified` and `updated_at` beside every percentile.** Both exist; neither reaches
   the UI. Rendering is Cas's (`Cas/analytics-ux/09-comparative-display-benchmarks.md`).
4. **Unify on mean-rank ties** in `empiricalPercentile` and the puzzle route, both ranges [1,99].
5. **Add `estimator text NOT NULL`** to `league_percentiles` (`'hf1_nearest_rank'`) and the movement
   cache (`'hf7_percentile_cont'`).
6. **Coarsen the tails.** Above p90 / below p10 show a band (90+, 95+) not an integer (§6), or fit
   a KDE/EVT tail.
7. **Ship the refresh-chain fix** (`ALTER FUNCTION refresh_league_percentiles(int) SET
   statement_timeout = '600s'`) — Jo's lane; until it lands every rank uses a June pool.
8. **Pair rank with value everywhere**, and write into `docs/VARIABLES.md` per percentile-bearing
   metric: population, estimator, tie rule, min n, vintage policy.

### Anti-recommendation

**Do not "fix" `league_percentiles` by switching nearest-rank to `percentile_cont`.** The obvious
move — Type 7 is the R/NumPy/Excel default and it erases the visible duplicate-breakpoint artefact —
and wrong on three grounds:

- **It targets the smallest error term.** Type 1↔Type 7 disagreement is bounded by one order-statistic
  gap, ~1.7 points at n=60; the DKW band there is **±17.5**. Polishing the estimator while sampling
  error is ten times larger buys nothing.
- **It hides the small-n problem rather than fixing it.** Duplicated breakpoints are the *symptom
  revealing* an undersized pool; interpolation smooths them into a plausible grid, so a 17-player
  pool emits 99 invented numbers — the table looks trustworthy exactly where it is least so.
- **It is an unversioned rebaselining of every stored rank.** Every percentile changes, no formula
  changes, nothing records it, prior screenshots stop reproducing — the `pitch_baselines` vintage
  defect again (`metric-governance/05`, `02-metric-versioning-reproducibility.md`) — and the
  consumer-side tie convention, where the visible asymmetry lives, stays untouched.

Gate the pool size, label the estimator, change it later under a version stamp.

**Highest-leverage next action:** fix `plusToPercentile`'s ÷10 → ÷15 with the regression test, in the
same commit as a `docs/VARIABLES.md` percentile row naming the estimator — two tokens, nine points of
quartile error on every command and deception percentile, and the only item with no design question
attached.

---

## Sources

1. [Hyndman & Fan (1996), "Sample Quantiles in Statistical Packages"](https://doi.org/10.1080/00031305.1996.10473566) — types 1–9; the type 8 case.
2. [Hyndman — "Sample quantiles 20 years later"](https://robjhyndman.com/hyndsight/sample-quantiles-20-years-later/) — who ships which type.
3. [R `stats::quantile`](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html) — the nine position formulas.
4. [NumPy `quantile`](https://numpy.org/doc/stable/reference/generated/numpy.quantile.html) — `method=` names ↔ HF types.
5. [SciPy `percentileofscore`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.percentileofscore.html) — §4's tie conventions.
6. [PostgreSQL — Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — `percentile_cont` vs `_disc`.
7. [PostgreSQL — Window Functions](https://www.postgresql.org/docs/current/functions-window.html) — `percent_rank()` = (rank−1)/(n−1).
8. [Wikipedia — Percentile](https://en.wikipedia.org/wiki/Percentile) — nearest-rank vs interpolation.
9. [Wikipedia — Quantile](https://en.wikipedia.org/wiki/Quantile) — the SE(q̂) ≈ √(p(1−p)/n)/f result (§6.2).
10. [Wikipedia — Order statistic](https://en.wikipedia.org/wiki/Order_statistic) — p99 of n=60 is one draw.
11. [Wikipedia — Empirical distribution function](https://en.wikipedia.org/wiki/Empirical_distribution_function) — the step `empiricalPercentile` approximates.
12. [Wikipedia — DKW inequality](https://en.wikipedia.org/wiki/Dvoretzky%E2%80%93Kiefer%E2%80%93Wolfowitz_inequality) — §6.3's ±6.4 / ±17.5 band.
13. [Wikipedia — Ranking](https://en.wikipedia.org/wiki/Ranking) — competition/modified/fractional ranks (§4).
14. [Wikipedia — Extreme value theory](https://en.wikipedia.org/wiki/Extreme_value_theory) — tails want a fitted model.
15. [Wikipedia — Kernel density estimation](https://en.wikipedia.org/wiki/Kernel_density_estimation) — rec 6's smoothing; §6.4's f(x).
16. [Wikipedia — Binomial proportion CI](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval) — a rank is Binomial(n,p).
17. [Baseball Savant — Percentile Rankings](https://baseballsavant.mlb.com/leaderboard/percentile-rankings) — rank beside value, qualification printed (§7).
18. [Baseball Savant — Custom Leaderboard](https://baseballsavant.mlb.com/leaderboard/custom) — min-PA control exposes pool size.
19. [FanGraphs — Sample Size](https://library.fangraphs.com/principles/sample-size/) — stabilization points (rec 2).
20. [FanGraphs — Stuff+/Location+/Pitching+](https://library.fangraphs.com/pitching/stuff-location-and-pitching/) — a public model's stated population.
21. [NIST/SEMATECH e-Handbook §1.3.5.2](https://www.itl.nist.gov/div898/handbook/prc/section2/prc252.htm) — interpolation; small-n tails.
22. [Microsoft — `PERCENTILE.EXC`](https://support.microsoft.com/en-us/office/percentile-exc-function-bbaa7204-e9e1-4010-85bf-c31dc5dce4ba) — type 6; failure when n is too small for k: estimator choice has a minimum-n precondition.

**Triton-internal evidence.** Read 2026-08-12; **no database queries run**. Pool sizes: 453 MLB
pitchers (Aug 2026), 444 MiLB batters, `league_averages` 1,806 rows, `pitches` ~8,877,621 rows /
9,711 MB, `players` 16,931. §3 — `scripts/create-refresh-league-percentiles.sql:9` nearest-rank
comment, `:231` `array_agg(val ORDER BY val)`, `:239/:432/:551/:687` four identical
`vals[GREATEST(1, LEAST(n, ceil(p·n/100)))]` inserts, `grep -c HAVING` = **0** of 703 lines;
`app/api/movement-percentiles/route.ts:70` `HAVING COUNT(*) >= 10` pitches, `:73–78` `>= 20`
pitchers + `percentile_cont`; `app/api/game/puzzle/route.ts:140–141`, `:248–249` `PERCENT_RANK()`,
`1 − PERCENT_RANK()`; `lib/mechanics/percentile.ts:11–25` five anchors +
`90 + (value − p90)/p90 × 10`; `lib/mechanics/norms.ts:38–72` OpenBiomechanics norms (hip–shoulder
p90 = 55, pelvis p90 = 860). §3.1 — `lib/leagueStats.ts:1320–1323` `× 15 + 100`, `:1338–1341`
`(plus−100)/10`, `normalCDF` at `:1327`, `:1344–1354` `valueToPercentile`; producer
`app/api/compute-triton/route.ts:211–220`, consumer
`components/dashboard/PercentileTab.tsx:222–233`. §4 — `lib/leagueStats.ts:1287–1299`
`breakpoints[mid] <= value`, clamp `[1,99]`. §5 — `scripts/create-league-percentiles.sql:15`
`breakpoints numeric[99] NOT NULL`, `:26` "use nearest-rank", `:27` `higher_better`. §8 —
`CLAUDE.md:114`, `docs/VARIABLES.md:302`, `:442` "50th-percentile" vs
`scripts/create-league-averages.sql` `COMMENT ON COLUMN league_averages.value` *"Mean of the metric
across qualified players"*; `docs/reliability-findings-2026-08-11.md:19,28,45` — last refreshed
**2026-06-03, 69 days stale**, `proconfig = NULL` under the 8s `authenticator` timeout. §1 —
`lib/metricRegistry.ts`, 69 `MetricDef` entries, `ColorSpec` `plus` mode, 9 of 69 joining
`reportMetrics.METRICS`.
