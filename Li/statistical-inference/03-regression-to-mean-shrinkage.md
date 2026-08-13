---
title: Regression to the Mean and Shrinkage — Estimating True Talent from a Small Window
domain: statistical-inference
tags:
  - regression-to-mean
  - shrinkage
  - empirical-bayes
  - beta-binomial
  - james-stein
  - reliability
  - marcel
  - leaderboard-selection
sources_reviewed: 19
last_updated: 2026-08-11
---

# Regression to the Mean and Shrinkage — Estimating True Talent from a Small Window

> Grades: **(established)** published · **(computed)** Triton source, read not queried ·
> **(estimated)** stated inputs · **(folk-sabermetrics)** unverified.

## TL;DR

- **Regression to the mean is a property of the estimator, not a force acting on players** — the observed mean was `true + noise`; noise doesn't repeat. **(established)**
- **The whole apparatus is one line: `shrunk = (n·x̄ + k·μ)/(n + k)`, `k = σ²_error/σ²_true`** — EB, James–Stein and Marcel differ only in picking `k` and `μ`. **(established)**
- **`k` *is* the stabilization point** — at `n = k` the observation gets weight 0.5; a reliability table is a shrinkage table. **(established)**
- **Triton shrinks nothing, anywhere** — no prior or sample gate in `metricRegistry`, `reportMetrics`, `sql`, `leagueStats`, `api/report`; every value shown is raw. The one exception, `SOS_REGRESSION_K = 60` (`app/api/update/route.ts:354`), is textbook leave-one-out EB — generalize it. **(computed)**
- **The unshrunk leaderboard is a noise-selection machine, and the damage scales with the metric's noise** — at the 5-IP floor small-sample pitchers are **~4× over-represented** on Whiff% (~1.2× on Stuff+), and two pitchers both at 40% carry posterior means of **39.0% vs 29.9%**. **(estimated)**
- **Shrinking an index already centered on 100 is coherent** (`100 + r·(x̄ − 100)`) **but Triton's 100 is pitch-weighted, drifts with vintage, and has no schema home** — `_plus` is excluded from `league_averages`. **(computed / estimated)**
- **Povich: shrinking both windows toward his own prior-months norm cuts the May→Aug move from 2.3 to ≈1.6 points**, against ±0.3–0.6 of vintage bias; 1.3–2.1 SE before. **(estimated, doc-08)**
- **"Regress it 50%" with no stated `k` is folk-sabermetrics** — the amount is measurable; guessing it is the same error class as guessing the formula. **(folk-sabermetrics)**

## 1. The phenomenon, stated so it can't be misused

With `x̄ = θ + ε`, `E[ε] = 0`, `ε ⟂ θ`, selecting on large `x̄` selects large `θ` *and* large `ε`; only
`θ` persists. Galton (1886) named it, believing heredity held a restoring force. It doesn't.
(established)

| Consequence | What it forbids |
|---|---|
| Symmetric | You can't explain only the decliners; a "most improved" list regresses identically. |
| Not causal | "He regressed" describes the estimator, not the pitcher — not a mechanism. |
| No talent change | Constant true talent still shows a drop after a hot window. |

**The right response to a noisy observation is not to caveat it, it is to move it.** A "small sample"
tooltip leaves the wrong number on screen.

## 2. The shrinkage constant and its identity with reliability

For sample mean `x̄` over `n`, prior mean `μ`, true variance `σ²_true`, error variance `σ²_error` per
observation:

```
shrunk = (n·x̄ + k·μ) / (n + k)          k = σ²_error / σ²_true
       = μ + r·(x̄ − μ)                   r = n / (n + k)     ← the reliability at n
       SE_shrunk = σ_true · √(1 − r)
```

At `n = k`, `r = 0.5` — half the observed variance is signal, exactly Carleton's stabilization
criterion. **A stabilization point *is* a shrinkage constant** under another name
(values: `02-reliability-stabilization.md`). (established)

**`k` is unit-bearing and cluster-sensitive**: 149 pitches over 2 starts carry less information than
149 over 12 relief outings, since within-outing noise is correlated. For outing-dominated metrics
(Stuff+, velocity), **state `k` in outings.** (estimated)

### 2.1 Estimating `k` by method of moments — real SQL

Observed cross-player variance of a rate = true variance + mean sampling variance. Subtract:

```sql
-- k for pitcher K%, MLB 2026. Re-run per season; do not hard-code the output.
WITH pf AS (
  SELECT pitcher, COUNT(*) FILTER (WHERE events IS NOT NULL) AS bf,
         COUNT(*) FILTER (WHERE events IN ('strikeout','strikeout_double_play')) AS k_n
  FROM pitches WHERE game_year = 2026 AND game_type = 'R'
  GROUP BY pitcher HAVING COUNT(*) FILTER (WHERE events IS NOT NULL) >= 50
), lg AS (SELECT SUM(k_n)::numeric / SUM(bf) AS p_bar FROM pf),
mom AS (SELECT lg.p_bar, VAR_SAMP(pf.k_n::numeric / pf.bf) AS var_obs,
               AVG(lg.p_bar * (1 - lg.p_bar) / pf.bf) AS var_binom
        FROM pf CROSS JOIN lg GROUP BY lg.p_bar)
SELECT p_bar, var_obs, var_binom, var_obs - var_binom AS var_true,
       p_bar * (1 - p_bar) / NULLIF(var_obs - var_binom, 0) AS k_bf FROM mom;
```

Three caveats: `VAR_SAMP` weights a 50-BF pitcher like a 700-BF one (ML beta-binomial is correct); the
`HAVING` floor truncates `σ²_true`; and `k` fit on qualified pitchers doesn't transfer to the
unqualified players you most want to shrink. (established)

## 3. Empirical Bayes and the beta-binomial for rate stats

For a binomial rate the conjugate prior is Beta(α, β), **fit to the population, not assumed** — what
makes it *empirical* Bayes (Robbins 1956). With `α + β = k`, `α/(α+β) = μ`:

```
posterior mean = (successes + α) / (trials + α + β)
```

That is `(n·x̄ + k·μ)/(n + k)` in counts: the prior literally adds `k` PA of league-average
performance — Marcel's operation (§6).

**Worked, inputs stated (estimated).** Pitcher K%: `μ = 0.220`, between-pitcher `σ_true = 0.045`.

```
σ²_true         = 0.045²        = 0.002025
σ²_error (1 BF) = 0.220 × 0.780 = 0.1716
k = 0.1716 / 0.002025 = 84.7 ≈ 85 BF  (Carleton's published K% figure ~70 BF — same order)
α = 0.220 × 85 = 18.7     β = 0.780 × 85 = 66.3
```

A reliever with **12 K in 40 BF** shows **30.0%**; posterior mean `= (18.7 + 12)/(85 + 40) = 30.7/125 =`
**24.6%**, weight `40/125 = 0.32`. He is not a 30% strikeout pitcher. Applying it is one SQL
expression: `(k_n + 18.7) / (bf + 85.0) AS k_pct_eb`, `bf::numeric / (bf + 85.0) AS reliability`.

Continuous metrics (Stuff+, velocity) use §2's Normal–Normal form — same algebra, no counts. Where
"trials" aren't exchangeable Bernoulli draws (RE24, xwOBA), measure `σ²_error` empirically.

## 4. James–Stein — what it adds, and where it stops

James & Stein (1961): for `p ≥ 3` simultaneous normal means the MLE — the raw average — is
**inadmissible**; shrinking toward any fixed point strictly dominates it in total squared error.

```
θ̂ᵢ = x̄ + (1 − (p − 3)·σ² / Σⱼ(x̄ⱼ − x̄)²)·(x̄ᵢ − x̄)      (p − 2 when shrinking to a fixed point)
```

Efron & Morris (1977) ran it on 18 hitters' first-45-AB averages against rest-of-season marks: a
**~3.5× cut in total squared error**. (established) The plain average is the provably worse column.

Two limits: dominance is over the *ensemble*, so an individual estimate can be worse — a shrunk value
is a good column, a bad answer to "how good is this guy" without its interval; and `(p−3)σ²` assumes
equal variances, so with unequal `n` (Triton's case) use parametric empirical Bayes (Morris 1983),
shrinking each by his own `r`.

## 5. Choosing the target

The constant gets attention; the target decides which question you answered.

| Target `μ` | Answers | Failure mode |
|---|---|---|
| **League mean** | "How good is he, absent evidence?" | A population he isn't in |
| **Role / level mean** | "How good *for a starter*?" | Season-terminal role (≥3 games of 50+ pitches): a June converter is retro-labeled |
| **Own prior season(s)** | "What to expect next?" — Marcel | Ignores injury/mechanical change; needs an age term |
| **Own prior *windows*** | "Did he change?" — Povich | Contaminated if those windows are themselves 2 starts |
| **Pitch-type mean** | "Good *as a slider*?" | Already in Stuff+ via `(pitch_name, game_year)` — shrinking again double-counts |

**Target-swapping is the platform's characteristic error**: asking "did his Stuff+ decline?" while
regressing toward the *league* mean answers "is he below average?" — a different question with a
different `σ²_true` (between-player σ ≈ 4.5 vs his own window-to-window σ ≈ 1.5), so `k` wrong by ~9×.
(estimated) Nested targets — league → role → pitcher — resolve it:
`08-bayesian-hierarchical-estimation.md`.

## 6. Marcel as the canonical simple projection

Tango's Marcel is the projection field's deliberate floor, and three ideas: **weight the last three
seasons 5 / 4 / 3**; **regress by adding a fixed block of league-average playing time** (1200 PA in the
batting implementation) — §3's `k·μ`, one `k` for all rate components; **one linear age adjustment**,
hinged near 29. Verify the constants against Tango's page; the structure is the durable part. Marcel
lands within a few percent of far more elaborate systems, because **most of a projection's value is
regressing correctly and weighting recency**, not the model on top. A Triton projection that can't beat
Marcel out-of-sample is decoration. (established)

## 7. Shrinking a metric that is already normalized to 100

Stuff+ is `100 + Σwᵢzᵢ` — an **interval** scale, not a ratio scale
(`05-baseline-normalization-design.md`), so shrinkage is clean:

```
stuff_plus_shrunk = 100 + r · (stuff_plus_obs − 100)
```

Cleaner than shrinking a rate: the target is the population center by construction, no prior to fit,
contraction preserves the scale. Four Triton wrinkles:

| Wrinkle | Consequence |
|---|---|
| **100 is pitch-weighted** (`pitch_baselines` runs over pitches) | The mean *pitcher's* Stuff+ isn't exactly 100; shrinking to 100 imports that gap as bias. (estimated) |
| **The prior has no schema home** (`_plus` excluded from `league_averages`) | Nothing to shrink toward: no pitcher-level mean, σ, or `n_qualified`. Right for *benchmarking*, wrong for *shrinkage*. (computed) |
| **100 drifts in-season** (~180 nightly season-to-date vintages) | A moving target carries the vintage problem into the shrunk column; shrinkage doesn't fix versioning. (computed) |
| **MiLB's 100 is a different 100** | Shrunk AAA 100 and shrunk MLB 100 stay different claims (`08-cross-level-comparability.md`). (computed) |

wRC+ is the contrast: a ratio scale where 150 means "50% better," so shrinking the *index* is wrong —
shrink the wOBA and recompute. **Shrink the input, not the output, whenever the output is non-linear in
the input.** Percentile rank survives monotone rescoring but **not** shrinkage, non-monotone across
`n`: recompute shrunk percentiles, never map them (`10-benchmarking-percentiles.md`).

## 8. What the absence of shrinkage actually costs

### 8.1 The state of the code (computed, 2026-08-11)

`shrink|regress|prior|empirical.?bayes|stabiliz` across `lib/metricRegistry.ts`,
`lib/reportMetrics.ts`, `lib/sql.ts`, `lib/leagueStats.ts` returns one hit:
`// xDeception regression coefficients` (`leagueStats.ts:1465`), OLS not shrinkage.
`app/api/report/route.ts` has no sample gate. All 69 `MetricDef` entries carry format, color and totals
strategy; **none carries an `n`, a reliability, or a prior.**

### 8.2 The one place it already works — credit where due

```ts
// app/api/update/route.ts:354, applied at :414 and :477
const SOS_REGRESSION_K = 60
(loo_n * loo_xwoba + ${SOS_REGRESSION_K} * l.lg_avg) / (loo_n + ${SOS_REGRESSION_K}) AS reg_xwoba
```

§2's formula verbatim, target = league-average xwOBA, correctly **leave-one-out**: opponent quality
excludes the matchup being scored, so a pitcher isn't scored against himself. Best statistics in the
stack. (computed)

Two corrections. **`k = 60` has no derivation, comment, or unit label**, and both passes (hitter,
pitcher) use it; wOBA stabilizes near 500 PA, and though xwOBA strips defensive and sequencing noise, 60
is unlikely to fit either. **It is also nearly inert**: `loo_n` (opponent season PA minus a matchup)
runs to several hundred, so at `n = 500` the observation gets `500/560 = 0.89` — it bites only for
September call-ups; intent undocumented. (estimated)

### 8.3 Leaderboards select on the noisiest players

`league_averages` qualifies on `IP >= max(5, 0.20 × IP_leader_for_role)`; **the 5-inning floor binds in
April and for relievers all season**, and display leaderboards apply none. Inputs (estimated): 400
pitchers, true Whiff% ~ N(25%, 5.5pp); 350 full-season (~900 swings,
`SE = √(.25×.75/900) = 1.44pp`), 50 near the floor (~30 swings, `SE = 7.9pp`).

| Group | Observed SD | P(observed ≥ 38%) | In a 38%+ list |
|---|---|---|---|
| Full season (350), SE 1.44 | √(30.25+2.07) = **5.69** | z = 2.29 → 0.0112 | **3.9** |
| At the floor (50), SE 7.9 | √(30.25+62.4) = **9.63** | z = 1.35 → 0.0885 | **4.4** |

Floor-sample pitchers are **12.5% of the population and 53% of the list — 4.2× over-represented.** Now
shrink two identical displays:

| Displayed | Group | `r = σ²_true/(σ²_true+SE²)` | Posterior mean |
|---|---|---|---|
| 40.0% | full season | 30.25/32.32 = **0.936** | 25 + 0.936×15 = **39.0%** |
| 40.0% | at the floor | 30.25/92.66 = **0.326** | 25 + 0.326×15 = **29.9%** |

**Ten points of true talent behind one identical pixel** — shrinkage plus a real floor fixes that, a
sample-size column doesn't. On Stuff+ (`σ_true ≈ 4.5`, floor `SE ≈ 1.4`) the same arithmetic gives SDs
4.51 vs 4.71 and ~1.2× over-representation. **The governance point**: the right amount is
metric-specific across an order of magnitude — "regress everything 30%" is as wrong as none.
(estimated)

### 8.4 The Povich case, shrunk

From `08-cross-level-comparability.md` (measured 2026-08-11): monthly MLB Stuff+ Feb 98.2, Mar 98.8,
Apr 98.2, May 100.0, Aug 97.7 (n = 149 over 2 starts); July's AAA 100.0 is a different population,
excluded. Raw claim: a **2.3-point** May→Aug drop, sized there at **1.3–2.1 SE**.

The question is "did *he* change," so the target is his own norm (§5). Inputs (estimated):
`σ_true ≈ 1.5` window-to-window, window `SE ≈ 1.0` at 2 starts (doc 08, design-effect adjusted).

```
r = 2.25 / (2.25 + 1.00) = 0.69
μ = his prior MLB months (Feb–May) = (98.2 + 98.8 + 98.2 + 100.0)/4 = 98.8
Aug shrunk = 98.8 + 0.69 × (97.7 − 98.8) = 98.04
May shrunk = 98.8 + 0.69 × (100.0 − 98.8) = 99.63
shrunk delta = 1.59 points vs a raw 2.3   → shrinkage removes 31% of the move
```

As a registry constant, `r = n/(n+k)` at `n = 149` implies **`k ≈ 67` pitches** — for an
outing-clustered metric, **`k ≈ 0.9 outings`, call it 1 start.**

Subtract the ±0.3–0.6 points of vintage bias across the 2026-08-11 rescore seam: defensible residual
**≈1.0–1.3 points**. **Li's call, unchanged from doc 08 and now quantified:** the composite move does
not survive shrinkage. What survives is the disaggregated FF pattern with its own mechanism (release
height −0.18 ft, release side +0.21 ft, usage 43%→49%) — Stuff+ has no release-position term. Grade
**estimated**, monitor, don't report a decline.

## 9. The registry extension

Shrinkage belongs beside the definition, not at the call site — the `TotalsStrategy` argument. Extend
`MetricDef` in `lib/metricRegistry.ts`:

```ts
export type ShrinkTarget =             // index_center = 100 for _plus
  | { to: 'index_center' }
  | { to: 'league_mean' }              // needs a league_averages row
  | { to: 'role_mean'; segment: 'SP' | 'RP' | 'hitter' }
  | { to: 'player_prior'; window: 'season' | 'prior_windows' }

export interface ShrinkageSpec {       // MetricDef gains: shrinkage?: ShrinkageSpec
  target: ShrinkTarget
  k: number; kUnit: 'pitches' | 'outings' | 'bf' | 'pa' | 'swings' | 'bip'
  source: 'measured' | 'literature' | 'assumed'  // never ship 'assumed' unlabelled
  measuredOn?: string                  // 'MLB 2024-2026, qualified SP'
}
```

Starting values — **re-measure every one with §2.1 first**; they are hypotheses:

| Metric key | Target | `k` | Unit | Grade |
|---|---|---|---|---|
| `stuff_plus` (cross-player) | `index_center` | 60 | pitches | estimated |
| `stuff_plus` (vs own norm) | `player_prior: prior_windows` | 1 | outings | estimated |
| `cmd_plus` | `index_center` | 250 | pitches | assumed |
| `k_pct` | `role_mean` | 70 | bf | Carleton |
| `bb_pct` | `role_mean` | 170 | bf | Carleton |
| `whiff_pct` | `role_mean` | 400 | swings | assumed |
| `gb_pct` | `role_mean` | 70 | bip | Carleton |
| `babip`, `hr_fb` | `league_mean` | ≫ season | bip / fb | established — near-total shrink |
| `wrc_plus` | — | — | — | **shrink wOBA, recompute** (§7) |

`sos`'s spec (`k = 60`, `league_mean`, PA) is hard-coded at a call site; move it here.

**Cas owns the display** — shrunk, raw, or both; how to show `r` without a statistics lecture; whether
the leaderboard sorts on shrunk or raw (`09-small-sample-communication.md`).

## 10. What Triton should do, in order

1. **Measure `k` for the §9 metrics and store the results** — §2.1 for rates, split-half across outings
   for Stuff+/command. Today's only shrinkage constant is the underived `SOS_REGRESSION_K = 60`.
   Prerequisite for everything below.
2. **Add `ShrinkageSpec` to `MetricDef`** and move `SOS_REGRESSION_K` into it — one field reaching all
   69 metrics and every consumer, as `TotalsStrategy` does, with `docs/VARIABLES.md` in the same
   commit: the contract now includes the prior.
3. **Store pitcher-level mean and σ for `_plus` metrics** in a `metric_diagnostics` row exempt from the
   `_plus` exclusion; shrinkage toward 100 has no schema support today.
4. **Apply shrinkage to leaderboard *ordering* first, display second** — sorting is where the selection
   damage happens (§8.3); the cell can stay raw meanwhile. Ship a real floor with it.
5. **Build Marcel and treat it as the acceptance bar** for any projection Soto designs.
6. **Never shrink toward a drifting center without saying so.** `baseline_version`
   (`metric-governance/01` §7 item 1) is a prerequisite for item 3 meaning anything.

**Anti-recommendation: do not ship a full Bayesian hierarchical model (Stan/PyMC partial pooling) as
the first shrinkage here.** Correct destination, wrong next step. There is none to be unsophisticated
about, so the whole gain sits in the first 90% §2's one line captures — while a hierarchical model adds
a fitting step, a convergence failure mode, serving latency in a Next.js request path, and a number
nobody can reproduce by hand, on top of a Stuff+ column *still not
internally comparable across a season*. **An elegant prior over a drifting likelihood produces
confident nonsense.** Do items 1–4, live with point-estimate empirical Bayes for a season, then revisit
`08-bayesian-hierarchical-estimation.md` — with one early exception, **partial pooling across a
pitcher's own pitch types**, where shared-pitcher structure is strong and per-cell samples tiny.

## Sources

1. [Galton (1886), "Regression Towards Mediocrity in Hereditary Stature"](https://galton.org/essays/1880-1889/galton-1886-jaigi-regression-stature.pdf) — the original; the misreading is in the name.
2. [Stigler (1997), "Regression towards the mean, historically considered"](https://doi.org/10.1177/096228029700600202) — why it is still taken for a force.
3. [James & Stein (1961), "Estimation with Quadratic Loss"](https://projecteuclid.org/euclid.bsmsp/1200512173) — inadmissibility of the MLE, p ≥ 3.
4. [Wikipedia — James–Stein estimator](https://en.wikipedia.org/wiki/James%E2%80%93Stein_estimator) — §4's forms.
5. [Efron & Morris (1977), *Scientific American*](https://efron.ckirby.su.domains/other/Article1977.pdf) — 18 hitters/45 AB; ~3.5× error cut.
6. [Robbins (1956), "An Empirical Bayes Approach to Statistics"](https://projecteuclid.org/euclid.bsmsp/1200501653) — fit the prior from data.
7. [Morris (1983), *JASA*](https://doi.org/10.1080/01621459.1983.10477920) — parametric EB; the unequal-`n` case.
8. [Casella (1985), *An Introduction to Empirical Bayes Data Analysis*, TAS 39(2)](https://doi.org/10.1080/00031305.1985.10479400) — readable derivation of `k`.
9. [Brown (2008), *Annals of Applied Statistics*](https://doi.org/10.1214/07-AOAS138) — EB tested across a season.
10. [Robinson — Empirical Bayes with baseball statistics](http://varianceexplained.org/r/empirical_bayes_baseball/) — §3 in R.
11. [Robinson — Beta distribution and baseball](http://varianceexplained.org/statistics/beta_distribution_and_baseball/) — α+β as prior sample size.
12. [Wikipedia — Beta-binomial distribution](https://en.wikipedia.org/wiki/Beta-binomial_distribution) — §2.1's identities.
13. [Stan — Hierarchical Partial Pooling](https://mc-stan.org/users/documentation/case-studies/pool-binary-trials.html) — §10's destination.
14. [Gelman et al., *Bayesian Data Analysis* (BDA3)](http://www.stat.columbia.edu/~gelman/book/) — Ch. 5; §5 formalized.
15. [Gelman & Hill, *ARM*](http://www.stat.columbia.edu/~gelman/arm/) — partial pooling as shrinkage.
16. [Tango — Marcel The Monkey Forecasting System](http://www.tangotiger.net/archives/stud0346.shtml) — 5/4/3, regression block, age term.
17. [Tango — Marcel forecasts](http://www.tangotiger.net/marcel/) — the constants.
18. [Carleton, "It's a Small Sample Size After All", *BP*](https://www.baseballprospectus.com/news/article/17659/baseball-therapy-its-a-small-sample-size-after-all/) — K%/BB%/GB% figures in §9.
19. [FanGraphs Library — Sample Size](https://library.fangraphs.com/principles/sample-size/) — stabilization table.

**Triton-internal evidence (verified against source, 2026-08-11; read, not queried):** every file and
line cited in §8.1–8.2, plus `app/api/update/route.ts:435`/`:498` and
`scripts/create-league-averages.sql`. Povich monthlies, pitch-level SD (≈6.5), design effect (2–4) and
window SE (0.8–1.1) from `metric-governance/08-cross-level-comparability.md` §5.1 and
`05-baseline-normalization-design.md`. Cross-refs: `02-reliability-stabilization.md`,
`08-bayesian-hierarchical-estimation.md`, `10-benchmarking-percentiles.md`.
