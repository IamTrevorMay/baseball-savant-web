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
sources_reviewed: 23
last_updated: 2026-08-11
---

# Regression to the Mean and Shrinkage — Estimating True Talent from a Small Window

> Grades: **(established)** published/replicated; **(computed)** verified against Triton source, read
> not queried (the DB was off-limits this pass); **(estimated)** from stated inputs;
> **(folk-sabermetrics)** widely repeated, unverified.

## TL;DR

- **Regression to the mean is a property of the estimator, not a force acting on players.** Nothing pulls a hot pitcher back; the observed mean was always `true + noise`, and noise doesn't repeat. **(established)**
- **The whole apparatus is one line: `shrunk = (n·x̄ + k·μ)/(n + k)`, `k = σ²_error/σ²_true`.** Empirical Bayes, James–Stein and Marcel are three ways of choosing `k` and `μ`. **(established)**
- **`k` *is* the stabilization point** — at `n = k` the weight on the observation is exactly 0.5. A reliability table and a shrinkage table are the same table. **(established)**
- **Triton shrinks nothing, anywhere.** No shrinkage, prior, or sample gate in `lib/metricRegistry.ts`, `lib/reportMetrics.ts`, `lib/sql.ts`, `lib/leagueStats.ts`, or `app/api/report/route.ts`. Every displayed value is a raw observed mean. **(computed)**
- **One exception deserves credit: `SOS_REGRESSION_K = 60` (`app/api/update/route.ts:354`)** is textbook empirical Bayes, correctly leave-one-out. Generalize the pattern; don't invent it. **(computed)**
- **The unshrunk leaderboard is a noise-selection machine, and the damage scales with the metric's noise.** At the 5-IP floor, small-sample pitchers are **~4× over-represented** in a Whiff% top list; the same arithmetic on Stuff+ gives ~1.2×. **(estimated)**
- **Two pitchers displaying 40% Whiff% carry posterior means of 39.0% and 29.9%** — ten points of true talent behind one identical pixel. **(estimated)**
- **Shrinking an index already centered on 100 is coherent** (`100 + r·(x̄ − 100)`) **but Triton's 100 is pitch-weighted, drifts with baseline vintage, and has no home in the schema** — `_plus` metrics are excluded from `league_averages`. **(computed / estimated)**
- **Povich: shrinking both windows toward his own prior-months norm cuts the May→Aug move from 2.3 to ≈1.6 points**, against ±0.3–0.6 of vintage bias. It was 1.3–2.1 SE before shrinkage. **(estimated, from doc-08 inputs)**
- **"Regress it 50%" with no stated `k` is folk-sabermetrics.** The amount is measurable; guessing it is the same class of error as guessing the formula. **(folk-sabermetrics)**

---

## 1. The phenomenon, stated so it can't be misused

If `x̄ = θ + ε` with `E[ε] = 0` and `ε ⟂ θ`, selecting on large `x̄` selects jointly on large `θ` *and*
large `ε`, and only `θ` persists. Galton (1886) named it and believed heredity contained a restoring
force. It doesn't. (established)

| Consequence | What it forbids |
|---|---|
| RTM is symmetric | You cannot explain only the decliners. A "most improved" list regresses identically. |
| RTM is not causal | "He regressed" describes the estimator, not the pitcher. It is not a mechanism. |
| No talent change required | A pitcher whose true talent is *constant* still shows a drop after a hot window. |

The corollary that runs this doc: **the right response to a noisy observation is not to caveat it, it
is to move it.** A "small sample" tooltip leaves the wrong number on screen and asks the reader to do
Bayes in their head.

---

## 2. The shrinkage constant and its identity with reliability

For a sample mean `x̄` of `n` observations, prior mean `μ`, between-player true variance `σ²_true`, and
single-observation error variance `σ²_error`:

```
shrunk = (n·x̄ + k·μ) / (n + k)          k = σ²_error / σ²_true
       = μ + r·(x̄ − μ)                   r = n / (n + k)     ← the reliability at n
       SE_shrunk = σ_true · √(1 − r)
```

At `n = k`, `r = 0.5` — half the observed variance is signal, which is exactly Carleton's
stabilization criterion. **A stabilization point *is* a shrinkage constant**, published under a
different name (`02-reliability-stabilization.md` owns the measured values). (established)

**`k` is unit-bearing and cluster-sensitive.** 149 pitches across 2 starts carries far less information
than 149 across 12 relief appearances, because within-outing noise is correlated. For outing-dominated
metrics (Stuff+, velocity), **state `k` in outings.** (estimated)

### 2.1 Estimating `k` by method of moments — real SQL

Observed cross-player variance of a rate = true variance + mean sampling variance. Subtract:

```sql
-- k for pitcher K%, MLB 2026 regular season. Re-run per season; do not hard-code the output.
WITH pf AS (
  SELECT pitcher,
         COUNT(*) FILTER (WHERE events IS NOT NULL)                              AS bf,
         COUNT(*) FILTER (WHERE events IN ('strikeout','strikeout_double_play')) AS k_n
  FROM pitches
  WHERE game_year = 2026 AND game_type = 'R'
  GROUP BY pitcher
  HAVING COUNT(*) FILTER (WHERE events IS NOT NULL) >= 50
),
lg  AS (SELECT SUM(k_n)::numeric / SUM(bf) AS p_bar FROM pf),
mom AS (
  SELECT lg.p_bar,
         VAR_SAMP(pf.k_n::numeric / pf.bf)      AS var_obs,
         AVG(lg.p_bar * (1 - lg.p_bar) / pf.bf) AS var_binom
  FROM pf CROSS JOIN lg GROUP BY lg.p_bar
)
SELECT p_bar, var_obs, var_binom,
       var_obs - var_binom                                  AS var_true,
       p_bar * (1 - p_bar) / NULLIF(var_obs - var_binom, 0) AS k_bf
FROM mom;
```

Three caveats: `VAR_SAMP` weights a 50-BF pitcher equally with a 700-BF one (ML beta-binomial is the
correct estimator); the `HAVING` floor truncates `σ²_true`; and `k` fit on qualified pitchers doesn't
transfer to the unqualified population you most want to shrink. (established)

---

## 3. Empirical Bayes and the beta-binomial for rate stats

For a binomial rate the conjugate prior is Beta(α, β), **fit to the population rather than assumed** —
the move that makes it *empirical* Bayes (Robbins 1956). With `α + β = k` and `α/(α+β) = μ`:

```
posterior mean = (successes + α) / (trials + α + β)
```

which is `(n·x̄ + k·μ)/(n + k)` in counts. The prior is literally "add `k` plate appearances of
league-average performance" — the operation Marcel performs (§6).

**Worked, inputs stated (estimated).** Pitcher K%: `μ = 0.220`, between-pitcher `σ_true = 0.045`.

```
σ²_true          = 0.045²          = 0.002025
σ²_error (1 BF)  = 0.220 × 0.780   = 0.1716
k = 0.1716 / 0.002025 = 84.7 ≈ 85 BF     (Carleton's published K% figure ~70 BF — same order)
α = 0.220 × 85 = 18.7      β = 0.780 × 85 = 66.3
```

A reliever with **12 K in 40 BF** shows **30.0%**. Posterior mean `= (18.7 + 12)/(85 + 40) = 30.7/125 =`
**24.6%**; weight on the observation `40/125 = 0.32`. He is not a 30% strikeout pitcher. Applying it is
one expression, not a pipeline:

```sql
SELECT pitcher, bf, k_n::numeric / bf AS k_pct_raw,
       (k_n + 18.7) / (bf + 85.0)     AS k_pct_eb,
       bf::numeric / (bf + 85.0)      AS reliability
FROM pf ORDER BY k_pct_eb DESC LIMIT 25;
```

Continuous metrics (Stuff+, velocity) use §2's Normal–Normal form — same algebra, no counts. Metrics
whose "trials" aren't exchangeable Bernoulli draws (RE24, xwOBA) need `σ²_error` measured empirically.

---

## 4. James–Stein — what it adds, and where it stops

James & Stein (1961) proved that for `p ≥ 3` simultaneous normal means the MLE — the raw average — is
**inadmissible**: shrinking toward any fixed point strictly dominates it in total squared error.

```
θ̂ᵢ = x̄ + (1 − (p − 3)·σ² / Σⱼ(x̄ⱼ − x̄)²)·(x̄ᵢ − x̄)      (p − 2 when shrinking to a fixed point)
```

Efron & Morris (1977) demonstrated it on 18 hitters' first-45-AB averages against rest-of-season marks
and reported roughly a **3.5× reduction in total squared error**. (established) The most useful
published result for a leaderboard product: the estimator that looks neutral is provably worse.

Two limits. Dominance is over the *ensemble* — an individual estimate can be worse, so a shrunk value
is a good column and a bad answer to "how good is this one guy" without its interval. And `(p−3)σ²`
assumes equal variances; with wildly unequal `n` per player — Triton's exact case — the correct
generalization is parametric empirical Bayes (Morris 1983), which shrinks each player by his own `r`.

---

## 5. Choosing the target

The constant gets the attention; the target decides which question you answered.

| Target `μ` | Answers | Failure mode |
|---|---|---|
| **League mean** | "How good is he, absent evidence?" | Regresses toward a population he isn't in |
| **Role / level mean** | "How good is he *for a starter*?" | Role is season-terminal (≥3 games of 50+ pitches), so a June converter is retro-labeled |
| **Own prior season(s)** | "What should we expect next?" — Marcel's target | Ignores injury/mechanical change; needs an age term |
| **Own prior *windows*** | "Did he change?" — the Povich question | Contaminated if the prior windows are themselves 2 starts |
| **Pitch-type mean** | "Is this slider good *as a slider*?" | Already in Stuff+ via `(pitch_name, game_year)` — shrinking again double-counts |

**Target-swapping is the platform's characteristic error**: asking "did his Stuff+ decline?" while
regressing toward the *league* mean. That answers "is he below average?" — a different question with a
different `σ²_true` (between-player σ ≈ 4.5 vs a pitcher's own window-to-window σ ≈ 1.5), so the wrong
`k` by ~9×. (estimated) Nested targets — league → role → pitcher — are the honest resolution:
`08-bayesian-hierarchical-estimation.md`.

---

## 6. Marcel as the canonical simple projection

Tango's Marcel is the deliberate floor of the projection field, and it is three ideas: **weight the
last three seasons 5 / 4 / 3**; **regress by adding a fixed block of league-average playing time**
(1200 PA in the batting implementation) — literally §3's `k·μ` term, with one `k` for all rate
components; and **one linear age adjustment**, hinged near 29. Verify the constants against Tango's
page before copying; the structure is the durable part, and it is a shrinkage estimator with a
player-history target. (established)

Marcel routinely lands within a few percent of far more elaborate systems, because **most of a
projection's value is regressing correctly and weighting recency**, not the model on top. A Triton
projection that can't beat Marcel out-of-sample is decoration. (established)

---

## 7. Shrinking a metric that is already normalized to 100

Stuff+ is `100 + Σwᵢzᵢ` — an **interval** scale, not a ratio scale
(`05-baseline-normalization-design.md`). So shrinkage is clean:

```
stuff_plus_shrunk = 100 + r · (stuff_plus_obs − 100)
```

More defensible than shrinking a rate: the target is the population center by construction, no prior
needs fitting, and the contraction preserves the scale's meaning. Four Triton wrinkles:

- **100 is a pitch-weighted center.** `pitch_baselines` is built over pitches, so the mean *pitcher's*
  Stuff+ isn't exactly 100. Shrinking to 100 imports that gap as a constant bias. (estimated)
- **The prior has no home in the schema.** `_plus` metrics are excluded from `league_averages`, so
  there is no stored pitcher-level mean, σ, or `n_qualified` to shrink toward. The rule is right for
  *benchmarking* and wrong for *shrinkage*. (computed)
- **100 drifts within a season** — ~180 nightly full-season-to-date vintages. Shrinking toward a moving
  target carries the vintage problem into the shrunk column; shrinkage does not fix versioning.
  (computed)
- **MiLB shrinks toward a different 100.** A shrunk AAA 100 and a shrunk MLB 100 remain different
  claims (`08-cross-level-comparability.md`). (computed)

wRC+ is the contrast: a ratio scale where 150 means "50% better," so shrinking the *index* linearly is
wrong — shrink the underlying wOBA and recompute. **Shrink the input, not the output, whenever the
output is non-linear in the input.** And percentile rank survives monotone rescoring but **not**
shrinkage, which is non-monotone across players with different `n`: shrunk percentiles must be
recomputed, never mapped (`10-benchmarking-percentiles.md`).

---

## 8. What the absence of shrinkage actually costs

### 8.1 The state of the code (computed, 2026-08-11)

Grepping `shrink|regress|prior|empirical.?bayes|stabiliz` across `lib/metricRegistry.ts`,
`lib/reportMetrics.ts`, `lib/sql.ts`, `lib/leagueStats.ts` returns one hit — the comment
`// xDeception regression coefficients` at `leagueStats.ts:1465`, which is OLS, not shrinkage.
`app/api/report/route.ts` carries no sample gate. All 69 `MetricDef` entries have format, color and
totals strategy; **none carries an `n`, a reliability, or a prior.**

### 8.2 The one place it already works — credit where due

```ts
// app/api/update/route.ts:354, applied at :414 and :477
const SOS_REGRESSION_K = 60
(loo_n * loo_xwoba + ${SOS_REGRESSION_K} * l.lg_avg) / (loo_n + ${SOS_REGRESSION_K}) AS reg_xwoba
```

§2's formula verbatim, target = league-average xwOBA, and correctly **leave-one-out**: opponent quality
excludes the matchup being scored, so a pitcher isn't scored partly against himself. Best statistics in
the metric stack. (computed)

Two corrections. **`k = 60` has no derivation, comment, or unit label** and is applied identically to
the hitter and pitcher passes; wOBA's published stabilization is on the order of 500 PA, and while
xwOBA strips defensive and sequencing noise, 60 is unlikely to be right for either. **And it is nearly
inert**: `loo_n` is an opponent's season PA minus one matchup — typically several hundred — so at
`n = 500` the weight on the observation is `500/560 = 0.89`. It bites only for September call-ups:
possibly the intent, but undocumented intent. (estimated)

### 8.3 Leaderboards select on the noisiest players

`league_averages` qualifies on `IP >= max(5, 0.20 × IP_leader_for_role)`. **The 5-inning hard floor
binds in April and for relievers all season**, and the display leaderboards apply no floor at all.
Worked with stated inputs (estimated): 400 pitchers, true Whiff% ~ N(25%, 5.5pp); 350 at full-season
samples (~900 swings, `SE = √(.25×.75/900) = 1.44pp`), 50 near the floor (~30 swings, `SE = 7.9pp`).

| Group | σ_true | SE | Observed SD | P(observed ≥ 38%) | Expected in a 38%+ list |
|---|---|---|---|---|---|
| Full season (350) | 5.5 | 1.44 | √(30.25+2.07) = **5.69** | z = 2.29 → 0.0112 | **3.9** |
| At the floor (50) | 5.5 | 7.9 | √(30.25+62.4) = **9.63** | z = 1.35 → 0.0885 | **4.4** |

Floor-sample pitchers are **12.5% of the population and 53% of the list — 4.2× over-represented.** Now
shrink two identical displayed values:

| Displayed | Group | `r = σ²_true/(σ²_true+SE²)` | Posterior mean |
|---|---|---|---|
| 40.0% | full season | 30.25/32.32 = **0.936** | 25 + 0.936×15 = **39.0%** |
| 40.0% | at the floor | 30.25/92.66 = **0.326** | 25 + 0.326×15 = **29.9%** |

**Ten points of true talent behind one identical pixel.** A sample-size column doesn't fix this — it
delegates the Bayes to the reader. Shrinkage plus a real floor does. Run it on Stuff+ instead
(`σ_true ≈ 4.5`, floor `SE ≈ 1.4`): observed SDs 4.51 vs 4.71, over-representation ~1.2×. **That is the
governance point** — the right amount of shrinkage is metric-specific across an order of magnitude, so
"regress everything 30%" is as wrong as none. (estimated)

### 8.4 The Povich case, shrunk

From `08-cross-level-comparability.md` (measured 2026-08-11): monthly MLB Stuff+ Feb 98.2, Mar 98.8,
Apr 98.2, May 100.0, Aug 97.7 (n = 149 over 2 starts); July's AAA 100.0 is a different population and is
excluded. The raw claim is a **2.3-point** May→Aug drop, sized there at **1.3–2.1 SE**.

The question is "did *he* change," so the target is his own norm (§5). Inputs (estimated): own
window-to-window true SD `σ_true ≈ 1.5`; effective window SE `≈ 1.0` at 2 starts (doc 08's
design-effect-adjusted figure).

```
r = 2.25 / (2.25 + 1.00) = 0.69
μ = mean of his prior MLB months (Feb–May) = (98.2 + 98.8 + 98.2 + 100.0)/4 = 98.8

Aug shrunk = 98.8 + 0.69 × (97.7 − 98.8) = 98.04
May shrunk = 98.8 + 0.69 × (100.0 − 98.8) = 99.63
shrunk delta = 1.59 points vs a raw 2.3    → shrinkage removes 31% of the move
```

As a registry constant, `r = n/(n+k)` at `n = 149` implies **`k ≈ 67` pitches** — or, in the better unit
for an outing-clustered metric, **`k ≈ 0.9 outings`, call it 1 start.**

Subtract the ±0.3–0.6 points of vintage bias across the 2026-08-11 rescore seam and the defensible
residual is **≈1.0–1.3 points**. **Li's call, unchanged from doc 08 and now quantified:** the composite
move does not survive shrinkage as a finding. What survives is the disaggregated FF pattern with an
independent mechanism (release height −0.18 ft, release side +0.21 ft, usage 43%→49%), because Stuff+
has no release-position term. Grade **estimated**, monitor, do not report a decline.

---

## 9. The registry extension

Shrinkage belongs beside the definition, not at the call site — the same argument as `TotalsStrategy`.
Extend `MetricDef` in `lib/metricRegistry.ts`:

```ts
export type ShrinkTarget =
  | { to: 'index_center' }                                       // 100 for _plus metrics
  | { to: 'league_mean' }                                        // needs a league_averages row
  | { to: 'role_mean'; segment: 'SP' | 'RP' | 'hitter' }
  | { to: 'player_prior'; window: 'season' | 'prior_windows' }

export interface ShrinkageSpec {
  target: ShrinkTarget
  k: number
  kUnit: 'pitches' | 'outings' | 'bf' | 'pa' | 'swings' | 'bip'
  source: 'measured' | 'literature' | 'assumed'   // never ship 'assumed' unlabelled
  measuredOn?: string                             // 'MLB 2024-2026, qualified SP'
}
// MetricDef gains:  shrinkage?: ShrinkageSpec
```

Starting values — **re-measure every one with §2.1 first**; they are the hypothesis:

| Metric key | Target | `k` | Unit | Grade |
|---|---|---|---|---|
| `stuff_plus` (cross-player) | `index_center` | 60 | pitches | estimated |
| `stuff_plus` (vs own norm) | `player_prior: prior_windows` | 1 | outings | estimated |
| `cmd_plus` | `index_center` | 250 | pitches | assumed |
| `k_pct` | `role_mean` | 70 | bf | literature (Carleton) |
| `bb_pct` | `role_mean` | 170 | bf | literature (Carleton) |
| `whiff_pct` | `role_mean` | 400 | swings | assumed |
| `gb_pct` | `role_mean` | 70 | bip | literature (Carleton) |
| `babip`, `hr_fb` | `league_mean` | ≫ season | bip / fb | established — shrink to near-total |
| `wrc_plus` | — | — | — | **shrink wOBA, recompute** (§7) |

`sos` already has its spec (`k = 60`, `league_mean`, PA) hard-coded at a call site; move it here.

**Cas owns the display behavior** — shrunk value, raw value, or both; how to show `r` without a
statistics lecture; whether the leaderboard sorts on shrunk or raw. The wrong answer is a footnote.
See `09-small-sample-communication.md`.

---

## 10. What Triton should do, in order

1. **Measure `k` for the metrics in §9 and store the results** — §2.1 for rates, split-half across
   outings for Stuff+/command. Until then the platform's only shrinkage constant is
   `SOS_REGRESSION_K = 60`, a literal nobody derived. Prerequisite for everything below.
2. **Add `ShrinkageSpec` to `MetricDef`** and move `SOS_REGRESSION_K` into it. One field reaches all 69
   metrics and every consumer, as `TotalsStrategy` does — with `docs/VARIABLES.md` in the same commit,
   since the contract now includes the prior.
3. **Store pitcher-level mean and σ for `_plus` metrics** in a `metric_diagnostics` row exempt from the
   `_plus` exclusion. Shrinkage toward 100 has no schema support today.
4. **Apply shrinkage to leaderboard *ordering* first, display second.** Sorting is where the selection
   damage happens (§8.3); the cell can stay raw during the transition. Ship a real floor with it.
5. **Build Marcel and treat it as the acceptance bar** for any projection Soto designs.
6. **Never shrink toward a drifting center without saying so.** `baseline_version`
   (`metric-governance/01` §7 item 1) is a prerequisite for item 3 meaning anything.

**Anti-recommendation: do not ship a full Bayesian hierarchical model (Stan/PyMC partial pooling) as
the first shrinkage in this platform.** It is the correct destination and the wrong next step. The
problem is not that Triton's shrinkage is unsophisticated — there is none, so the entire gain sits in
the first 90%, which §2's one-line formula captures. A hierarchical model adds a fitting step, a
convergence failure mode, serving latency in a Next.js request path, and a number nobody can reproduce
by hand — on top of a Stuff+ column *still not internally comparable across a season*. **An elegant
prior over a drifting likelihood produces confident nonsense.** Do items 1–4, live with point-estimate
empirical Bayes for a season, then revisit `08-bayesian-hierarchical-estimation.md`. One exception
worth making early: **partial pooling across a pitcher's own pitch types**, where the shared-pitcher
structure is strong and per-cell samples are tiny.

---

## Sources

1. [Galton (1886), "Regression Towards Mediocrity in Hereditary Stature"](https://galton.org/essays/1880-1889/galton-1886-jaigi-regression-stature.pdf) — the original, and the causal misreading in the name.
2. [Stigler (1997), "Regression towards the mean, historically considered"](https://doi.org/10.1177/096228029700600202) — why it is still mistaken for a force.
3. [Wikipedia — Regression toward the mean](https://en.wikipedia.org/wiki/Regression_toward_the_mean) — the §1 argument.
4. [James & Stein (1961), "Estimation with Quadratic Loss"](https://projecteuclid.org/euclid.bsmsp/1200512173) — inadmissibility of the MLE, p ≥ 3.
5. [Wikipedia — James–Stein estimator](https://en.wikipedia.org/wiki/James%E2%80%93Stein_estimator) — the §4 forms.
6. [Wikipedia — Stein's example](https://en.wikipedia.org/wiki/Stein%27s_example) — why shrinkage dominates.
7. [Efron & Morris (1977), *Scientific American*](https://efron.ckirby.su.domains/other/Article1977.pdf) — the 18-hitter/45-AB demo; ~3.5× error reduction.
8. [Efron & Morris (1975), *JASA*](https://doi.org/10.1080/01621459.1975.10479864) — technical companion to #7.
9. [Robbins (1956), "An Empirical Bayes Approach to Statistics"](https://projecteuclid.org/euclid.bsmsp/1200501653) — fitting the prior from the population.
10. [Morris (1983), *JASA*](https://doi.org/10.1080/01621459.1983.10477920) — parametric EB; the unequal-`n` generalization.
11. [Casella (1985), *The American Statistician*](https://doi.org/10.1080/00031305.1985.10479118) — readable derivation of `k`.
12. [Brown (2008), *Annals of Applied Statistics*](https://doi.org/10.1214/07-AOAS138) — EB shrinkage field-tested across a season.
13. [Robinson — Empirical Bayes with baseball statistics](http://varianceexplained.org/r/empirical_bayes_baseball/) — §3 in R.
14. [Robinson — The beta distribution with baseball statistics](http://varianceexplained.org/statistics/beta_distribution_and_baseball/) — α+β as prior sample size.
15. [Robinson — *Introduction to Empirical Bayes*](http://varianceexplained.org/r/empirical-bayes-book/) — intervals and FDR on shrunk rates.
16. [Wikipedia — Beta-binomial distribution](https://en.wikipedia.org/wiki/Beta-binomial_distribution) — the §2.1 identities.
17. [Stan — Hierarchical Partial Pooling for Repeated Binary Trials](https://mc-stan.org/users/documentation/case-studies/pool-binary-trials.html) — §10's destination.
18. [Gelman et al., *Bayesian Data Analysis* (BDA3)](http://www.stat.columbia.edu/~gelman/book/) — Ch. 5; §5 formalized.
19. [Gelman & Hill, *ARM*](http://www.stat.columbia.edu/~gelman/arm/) — partial pooling as shrinkage, applied.
20. [Tango — Marcel The Monkey Forecasting System](http://www.tangotiger.net/archives/stud0346.shtml) — 5/4/3, regression block, age term.
21. [Tango — Marcel forecasts](http://www.tangotiger.net/marcel/) — constants; verify before copying.
22. [Carleton, "It's a Small Sample Size After All", *BP*](https://www.baseballprospectus.com/news/article/17659/baseball-therapy-its-a-small-sample-size-after-all/) — the K%/BB%/GB% figures in §9.
23. [FanGraphs Library — Sample Size](https://library.fangraphs.com/principles/sample-size/) — consolidated stabilization table.

**Triton-internal evidence (verified against source, 2026-08-11; read, not queried):**
`app/api/update/route.ts:354`, `:414`/`:477`, `:435`/`:498`; `lib/metricRegistry.ts` (69 keys, no
shrinkage/`n` field); `lib/reportMetrics.ts`, `lib/sql.ts`, `lib/leagueStats.ts:1465`;
`app/api/report/route.ts` (no sample gate); `scripts/create-league-averages.sql`. Povich monthlies,
pitch-level SD (≈6.5), design effect (2–4) and window SE (0.8–1.1) from
`metric-governance/08-cross-level-comparability.md` §5.1 and `05-baseline-normalization-design.md`.
Cross-refs: `02-reliability-stabilization.md`, `08-bayesian-hierarchical-estimation.md`,
`10-benchmarking-percentiles.md`.
