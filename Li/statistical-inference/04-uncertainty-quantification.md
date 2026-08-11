---
title: Uncertainty Quantification — Putting an Interval on a Number
domain: statistical-inference
tags:
  - confidence-intervals
  - credible-intervals
  - standard-errors
  - delta-method
  - bootstrap
  - clustered-data
  - stuff-plus
sources_reviewed: 17
last_updated: 2026-08-11
---

# Uncertainty Quantification — Putting an Interval on a Number

> Grades: **(established)** published/replicated; **(computed)** verified against Triton source at the
> cited line, read not queried; **(estimated)** from theory, assumptions stated.

## TL;DR

- **A confidence interval is a statement about the procedure, a credible interval about the parameter. Users always want the second and are always shown the first.** (established)
- **Triton displays zero intervals.** A repo-wide grep for `confidence interval` / `standard error` / `error bar` over `lib/`, `components/`, `app/` returns nothing, and one surface shows an n — `PercentileTab.tsx:420` prints `n={pool.n_qualified}`, the *pool's* n, not the player's. (computed)
- **The per-pitch SD in a *pitcher's* Stuff+ SE is ≈2.8, not the league's ≈6.04.** 6.04 = √(4.5²+3.5²+2.0²) is the SD across the baseline cell, where z has unit variance by construction; a pitcher's own inputs vary far less, so 6.04 overstates his SE ~2.2×. (estimated)
- **The three z-terms are correlated, and independence is wrong in an unknown direction, not conservative.** The cross term moves the composite SD between 5.7 and 7.0 — ±20% on every interval width. (estimated)
- **The honest denominator is outings, not pitches.** At m̄=48 same-type pitches/start and ICC 0.05, DEFF = 3.35, so a naive SE understates 1.83× — and a two-start window has **one degree of freedom**, t₁ = 12.71, giving **±6.6 points**. (estimated)
- **For a full season the sampling interval (±0.30) is smaller than the baseline-vintage bias (≈0.5).** Triton's binding constraint on Stuff+ is provenance, not sample size — no n fixes it. (estimated / computed)
- **Baseline error is common-mode: it cancels in a difference, never averages away in a level.** Delta method: Var(ẑ) ≈ 1/N + z²/2N per component — ±0.02 at N=2×10⁵, ±1.48 at N=50 — and the scoring join sets **no `pitch_count` floor** despite storing the column. (computed / estimated)
- **The [0,200] clamp is a σ-collapse alarm, not a truncation problem.** Binding it takes 16.6 composite SD; the bias toward 100 is below 10⁻⁵⁰ in a healthy cell. (estimated)
- **An interval that omits the dominant error term is worse than no interval**: it converts unquantified doubt into quantified false precision. (established)

---

## 1. What kind of interval, and what it claims

| | **Confidence interval** | **Credible interval** |
|---|---|---|
| Claims | 95% of intervals built this way cover the fixed true θ | Given prior + data, P(θ ∈ I) = 0.95 |
| Prior | None | Required |
| vs. league mean | Independent of it | Pulled toward it (shrinkage) |
| Answers | "Is this estimate precise?" | "What is his true talent?" |

**A 95% CI does not contain θ with probability 0.95** — once computed it either does or doesn't (Morey et al. 2016). The sentence a scout wants — *"95% chance his real Stuff+ is between X and Y"* — is a credible-interval claim requiring a prior. Triton has that prior in `league_averages` and uses it for none of this.

### 1.1 The two intervals disagree on the question that matters

A pitcher at 108 four-seam Stuff+ over two starts, SE = 0.517, 1 df (§4).

| Interval | Result | Verdict on "above average?" |
|---|---|---|
| Frequentist 95%: 108 ± 12.706 × 0.517 | **[101.4, 114.6]** | Excludes 100 → "significantly above" |
| Bayesian 95% credible, prior N(100, 5²) | **[95.1, 110.7]** | Includes 100 → "can't tell" |

Posterior precision = 1/6.57² + 1/5² = 0.06317; mean = (108×0.02317 + 100×0.04)/0.06317 = **102.9**; SD = 1/√0.06317 = **3.98**. *(estimated — the prior SD of 5 is assumed, not fitted.)*

Same data, opposite conclusions. **For a plus-stat with a known league distribution the credible interval is the correct default** — `03-regression-to-mean-shrinkage.md` is this arithmetic in another hat.

---

## 2. Standard errors: the three shapes you actually need

| Estimand | SE | Interval to use | Trap |
|---|---|---|---|
| **Mean** of x over n | s/√n | t, df = n−1 | the i.i.d. assumption (§4) |
| **Proportion** p̂ = k/n | √(p̂(1−p̂)/n) | **Wilson**, not Wald | Wald degenerates near 0/1 and small n |
| **Ratio** R = A/B | R·√(Var A/A² + Var B/B² − 2Cov/AB) | delta method (log scale) or bootstrap | Ignoring Cov(A,B) — both are usually counts off the same PAs |

**Worked, whiff rate 15/50 swings.** Wald: 0.30 ± 1.96√(0.21/50) = **[17.3%, 42.7%]**. Wilson: center = (0.30 + 1.96²/100)/(1 + 1.96²/50) = 0.3384/1.0768 = 0.3143; half = (1.96/1.0768)·√(0.21/50 + 1.96²/10⁴) = 1.8202 × 0.06771 = 0.1232 → **[19.1%, 43.8%]**. Asymmetric and shifted toward 0.5, correctly; Wald's coverage is erratic even at moderate n (Brown/Cai/DasGupta 2001). Every Triton rate — Whiff%, K%, BB%, Chase%, FPS% — is a proportion carrying no interval, and Whiff% over one start is ~10 swings. **(established / computed)**

---

## 3. The delta method — the workhorse for derived metrics

For smooth g, Var(g(θ̂)) ≈ ∇g(θ)ᵀ Σ ∇g(θ) — one line, and it produces every SE in this doc. **Applied to a z-score with estimated baseline**, z = (x − μ̂)/σ̂:

```
∂z/∂μ = −1/σ        ∂z/∂σ = −(x−μ)/σ² = −z/σ
Var(μ̂) = σ²/N       Var(σ̂) ≈ σ²/(2N)      (normal-theory)

Var(ẑ | x) ≈ (1/σ²)(σ²/N) + (z²/σ²)(σ²/2N) = 1/N + z²/(2N)
```

Two counterintuitive consequences: **baseline error grows with |z|** (the σ̂ term scales as z², so the pitches you most want to rank are placed least precisely), and **it does not shrink with the pitcher's n** — every pitch in a cell shares the same μ̂ and σ̂, so 3,000 pitches buy nothing against it.

---

## 4. Clustering: the denominator is outings, not pitches

Pitches in one outing share weather, opponent, fatigue, and that day's mechanics. Treating them as independent is the commonest way an interval comes out too narrow.

```
DEFF = 1 + (m̄ − 1)·ICC          n_eff = n / DEFF
Var(outing mean) = τ² + σ_w²/m   SE(season mean over G outings) = SD_outing/√G,  df = G − 1
```

**Worked, four-seam Stuff+, one starter's season.** With σ_tot = 2.77 (§5), ICC = 0.05, m̄ = 48 four-seams/start: τ² = 0.05 × 7.66 = 0.383, σ_w² = 7.28, Var(outing mean) = 0.383 + 7.28/48 = 0.535, SD_outing = **0.731**. *(estimated)*

| Window | G | n | SE | mult. | **95% half-width** | Verdict |
|---|---|---|---|---|---|---|
| 1 start | 1 | 48 | — | — | **not computable** | Refuse; show n only |
| 2 starts | 2 | 96 | 0.517 | t₁ = 12.71 | **±6.6** | Uninformative |
| 5 starts | 5 | 240 | 0.327 | t₄ = 2.78 | **±0.91** | Weak |
| 10 starts | 10 | 480 | 0.231 | t₉ = 2.26 | **±0.52** | Usable |
| Full season | 25 | 1,200 | 0.146 | t₂₄ = 2.06 | **±0.30** | Precise — *and now bias-dominated* |
| *Naive i.i.d., 25 starts* | — | 1,200 | *0.080* | *1.96* | *±0.16* | **Wrong by 1.83×** |

The last row is what a well-meaning `stddev/√n` implementation ships; √DEFF = 1.83. Cross-refs: `01-sampling-and-sample-size.md`, `09-small-sample-communication.md` (both planned). **(estimated)**

---

## 5. Propagating uncertainty through Stuff+ — the full derivation

Nobody has done this on Triton. The scorer (`app/api/update/route.ts:322-333`) is
`S = clamp(0, 200, round(100 + 4.5·z_v + 3.5·z_m + 2.0·z_e))`, each z against `pitch_baselines` on `(pitch_name, game_year)`.

### 5.1 League-scale composite SD, with the covariance term stated

Across a baseline cell each z has unit variance by construction, so with **w** = (4.5, 3.5, 2.0) and correlation matrix **R**:

```
σ_S² = wᵀRw = 36.5 + 2(4.5·3.5·ρ_vm + 4.5·2.0·ρ_ve + 3.5·2.0·ρ_me)
            = 36.5 + 31.5·ρ_vm + 18.0·ρ_ve + 14.0·ρ_me
```

Independence gives √36.5 = **6.04**. The cross terms are not small:

| Scenario | ρ_vm | ρ_ve | ρ_me | wᵀRw | **σ_S** |
|---|---|---|---|---|---|
| Independence (the usual assumption) | 0 | 0 | 0 | 36.50 | **6.04** |
| Fastball-like: velo↑ ⇒ less total pfx | −0.20 | +0.15 | −0.05 | 32.20 | **5.67** |
| Positively correlated throughout | +0.20 | +0.30 | +0.10 | 49.60 | **7.04** |

**Every ρ above is *(estimated)*** — from flight physics (higher velocity shortens flight time, reducing total `pfx` → ρ_vm < 0 for four-seamers) and anthropometry (longer levers → extension *and* velocity → ρ_ve > 0). Not folk numbers, not measurements. The honest output is the sensitivity: **independence sets every interval width within ±20% of truth, in a direction nobody has checked.** The three correlations per cell are one cheap query.

### 5.2 The SD in a *pitcher's* SE is ≈2.8, not 6.04

A pitcher's four-seam velocity varies pitch-to-pitch far less than the league's — the point of him having a fastball. This corrects `metric-governance/05-baseline-normalization-design.md` §7.

| Component | League σ (`BL_BY_YEAR`, 4-Seam) | Assumed within-pitcher SD | z-SD within | × w | contrib. |
|---|---|---|---|---|---|
| Velocity | `std_velo` 2.84 mph | ~1.2 mph | 0.42 | 4.5 | 1.89 |
| Movement | `std_move` 3.64 in | ~2.0 in | 0.55 | 3.5 | 1.93 |
| Extension | `std_ext` 0.49 ft | ~0.15 ft | 0.31 | 2.0 | 0.62 |

σ_within = √(1.89² + 1.93² + 0.62²) = √7.66 = **2.77 Stuff+ points per pitch**. *(estimated — league σ from `lib/leagueStats.ts:1008` (computed); the within-pitcher SDs are assumed, and are the most valuable thing here to replace with a measurement.)* Using 6.04 where 2.77 belongs inflates every SE 2.2×; using 2.77 where the *league* SD belongs ("how many SD above average is this pitch?") deflates it the same. **Different questions, different denominators, identical-looking formula.**

### 5.3 The four variance terms, and which ones an interval can fix

For a pitcher's mean Ŝ over n pitches in G outings:

| Term | Expression | Shrinks with the pitcher's n? | Healthy cell (N=2×10⁵) | Thin cell (N=500, \|z\|=2) | N=50, \|z\|=2 |
|---|---|---|---|---|---|
| **A. Pitch-to-pitch** | σ_within²/n_eff | **Yes** | 0.146 at G=25 | same | same |
| **B. Baseline μ̂ error** | Σwᵢ²/Nᵢ | No — common-mode | 0.014 | 0.270 | 0.854 |
| **C. Baseline σ̂ error** | Σwᵢ²zᵢ²/(2Nᵢ) | No — common-mode | 0.019 | 0.382 | 1.208 |
| **D. Vintage drift** | *bias*, not variance | No | ≈0.5 | ≈0.5 | ≈0.5 |
| **E. Rounding** | √(1/12)/√n | Yes | 0.008 | — | — |

B+C combined: healthy cell √(36.5/2×10⁵ + 36.5·4/(4×10⁵)) = **0.023**; N=500 → √(0.073 + 0.146) = **0.468**; N=50 → √(0.73 + 1.46) = **1.48**. *(estimated — delta-method closed form from §3.)*

**Three conclusions Triton can act on:**

1. **At full season, A (0.146) is smaller than D (≈0.5).** The dominant uncertainty in a season Stuff+ is *which nightly baseline vintage scored which pitch*, and no interval computed from the data can see it (`metric-governance/02-metric-versioning-reproducibility.md`).
2. **B and C explode on thin cells, and there is no floor.** `pitch_baselines` stores `pitch_count` (`app/api/update/route.ts:251`); the scoring join never reads it — the UPDATE's only completeness test is `p.release_speed IS NOT NULL`. A 40-row Screwball cell carries the authority of a 200,000-row four-seam cell. **(computed)**
3. **B and C are common-mode, so they cancel in a same-cell difference** (§7) — but D does not, and D *is* the within-season term.

### 5.4 The clamp: an alarm, not a bias source

`GREATEST(0, LEAST(200, …))` truncates both tails symmetrically about 100, so binding it takes |Σwᵢzᵢ| ≥ 100 = **16.6 composite SD** at σ_S = 6.04, and P(|Z| > 16.6) < 10⁻⁵⁰. The textbook claim — *any mean over clamped values is biased toward 100* — is **true and numerically irrelevant under a healthy baseline**. *(estimated)*

It becomes real in one situation: **a cell whose σ̂ has collapsed.** `BL_BY_YEAR` shows the mechanism in miniature — Sweeper `std_velo` = 1.91, Slurve 1.65, vs. four-seam's 2.84 (`lib/leagueStats.ts:1012, 1017`, computed). At std_velo = 0.5 a 6 mph deviation is z = 12, worth 54 points from velocity alone. **Treat any clamped `stuff_plus` row as a data-quality alert on its baseline cell, not a legitimate extreme** — a firing clamp is §5.3's B/C in the tail.

---

## 6. Bootstrapping — and the only version of it that's valid here

When the estimator has no closed form (a median, a percentile rank, a mix-weighted composite), resample. **The unit of resampling must be the unit of independence** — for Triton, the **outing**: draw the pitcher's G outings *with replacement*, recompute the mean over all pitches in the drawn outings, repeat 2,000×, take the 2.5/97.5 quantiles (BCa corrects skew and bias). That is the cluster (block) bootstrap; Künsch's moving-block variant handles serial dependence spanning clusters. A pitch-level bootstrap instead reproduces §4's naive SE exactly — rigorous-looking, understated 1.83×. **(established)**

| Situation | Method |
|---|---|
| Mean/proportion, independent units | Closed-form SE; t or Wilson |
| Clustered by outing/game | **Cluster bootstrap** or cluster-robust SE (Cameron & Miller 2015) |
| Ratio, composite, percentile rank | Delta method for intuition, BCa bootstrap for the number |
| Max/min (`maxEV`, `maxVelo` — `max` in `lib/metricRegistry.ts`), near a bound, or G < 5 | **Neither.** The bootstrap is *inconsistent* for a sample maximum (Bickel & Freedman 1981) — a resample can never exceed the observed max, so one side is guaranteed wrong. Report n, refuse the interval |

---

## 7. Intervals for differences — where the errors cancel and where they don't

For independent estimates SE_diff = √(SE₁² + SE₂²). Two Triton corrections:

**7.1 Common-mode terms cancel.** If both halves of a within-season comparison are scored against the *same* baseline cell, B and C (§5.3) are identical and drop out — a difference is a cleaner estimand than either level. **Except** Triton's baseline is recomputed nightly as a full-season-to-date aggregate, so the halves saw different vintages, converting a cancelling variance into a non-cancelling bias.

**Worked: first half vs. second half, 13 starts each.** SE each = 0.731/√13 = 0.203; SE_diff = √2 × 0.203 = 0.287; 95% CI = ±2.06 × 0.287 = **±0.59**. The estimated April-to-August vintage bias is **≈0.5 points, identically signed for every pitch in the cell** (`metric-governance/05-baseline-normalization-design.md` §6). **A +1.0-point half-to-half Stuff+ move is therefore roughly half interval and half artifact — and the artifact is not in the interval.** *(estimated)*

**7.2 Overlap is not a test.** For two independent estimates with equal SEs, non-overlapping 95% CIs need a gap > 2 × 1.96 × SE = **3.92 SE**; significance at α = 0.05 needs only 1.96√2 × SE = **2.77 SE**, so overlap misses real differences in that band (Schenker & Gentleman 2001; Cumming 2009). **Plot the interval on the difference, never two intervals and an eyeball** (`Cas/analytics-ux/04-uncertainty-visualization.md`, planned). **(established)**

---

## 8. When an interval is more misleading than no interval

| # | Situation | Why the interval lies | Do instead |
|---|---|---|---|
| 1 | **Bias exceeds variance** | A ±0.30 season Stuff+ interval beside a ≈0.5 vintage bias reads as *more* precise than the number is | Fix provenance first; show n |
| 2 | **Wrong denominator** | A pitch-level i.i.d. SE understates 1.83× — a narrow interval launders the error | Cluster by outing |
| 3 | **Post-selection** | The leaderboard leader's interval is not a 95% interval — he was picked for being extreme | Shrink (`05-multiple-comparisons-leaderboards.md`) |
| 4 | **Wrong estimand** | "He averaged 104 in 2026" over *all* his pitches is a census — sampling error is zero | Interval only a *true-talent* estimand |
| 5 | **Near a bound** | A symmetric interval on a clamped or 0–1 metric crosses it | Wilson / log scale / BCa |

---

## 9. What Triton should do, in order

1. **Measure the two quantities this doc is assumed on**, per `(pitch_name, game_year)`: the z-term correlations ρ_vm/ρ_ve/ρ_me, and the within-pitcher SD of each component for a qualified starter — converting §5.1/§5.2 from *(estimated)* to *(computed)*. **Log both to `docs/Queries.md`.**
2. **Add `AND b.pitch_count >= 500` to both scoring joins.** B and C fall from ±0.47 to ±0.02, the clamp stops firing, and excluded pitches get NULL plus a reason code rather than 100. One-line diff, cheapest correctness win in the stack.
3. **Carry `stuff_plus_n` and an outing count at the read grain**, not only in the two materialized views (`create-materialized-views.sql:105, 323` — nothing reads them). No interval renders without G, which reaches no UI today.
4. **Ship sample size everywhere before shipping any interval.** `n=1,180 pitches / 25 outings` is honest, cheap, and already the format at `PercentileTab.tsx:420`.
5. **Adopt one interval method platform-wide:** outing-cluster bootstrap for pitch-aggregated metrics, Wilson for every displayed rate. Two implementations, not per-metric ad-hockery.
6. **Add `minOutings` and `stabilization` to `MetricDef`** and have the UI structurally refuse an interval below G = 5, substituting the n and a small-sample state. §4's table is seed data.
7. **Then, and only then, display intervals — as credible intervals shrunk to the league prior** (§1.1). For a plus-stat that prior is already in the database.

**Anti-recommendation: do not ship error bars on Stuff+ before `baseline_version` exists.** It is the obvious move after reading this and it is wrong. At full-season n the sampling interval is ±0.30 while the unrecorded vintage bias is ≈0.5, so the first error bar Triton renders would be **smaller than the error it omits** — on the flagship metric, on every pitching surface, carrying the authority a rendered interval carries. Today's state is honestly ignorant; that one is confidently wrong and harder to walk back, because an interval reads as completed rigor. Sequence: `pitch_count` floor → `baseline_version` → n and G displayed → correlations measured → intervals.

**Highest-leverage next action:** run item 1's two queries and add the `pitch_count >= 500` guard in one PR, with the `stuff_plus` entry `docs/VARIABLES.md` still lacks — population, grain, clamp, and *now* its SE formula.

---

## Sources

1. [Confidence interval](https://en.wikipedia.org/wiki/Confidence_interval) / [Credible interval](https://en.wikipedia.org/wiki/Credible_interval) — §1's procedure-vs-parameter split.
2. Morey et al. (2016), [*The fallacy of placing confidence in confidence intervals*](https://doi.org/10.3758/s13423-015-0947-8) — the natural reading of a CI is unavailable.
3. Greenland et al. (2016), [*P values, confidence intervals, and power: a guide to misinterpretations*](https://doi.org/10.1007/s10654-016-0149-3) — §8's list.
4. Brown, Cai & DasGupta (2001), [*Interval Estimation for a Binomial Proportion*](https://doi.org/10.1214/ss/1009213286) — Wald's erratic coverage; Wilson as default.
5. [Binomial proportion CI](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval) — §2's Wilson formula.
6. [Delta method](https://en.wikipedia.org/wiki/Delta_method) — §3's ∇gᵀΣ∇g.
7. [Propagation of uncertainty](https://en.wikipedia.org/wiki/Propagation_of_uncertainty) — §5.3's decomposition.
8. [Taylor expansions for moments of functions of random variables](https://en.wikipedia.org/wiki/Taylor_expansions_for_the_moments_of_functions_of_random_variables) — §2's ratio variance.
9. [Design effect](https://en.wikipedia.org/wiki/Design_effect) and [intraclass correlation](https://en.wikipedia.org/wiki/Intraclass_correlation) — §4's DEFF = 1 + (m̄−1)·ICC.
10. Cameron & Miller (2015), [*A Practitioner's Guide to Cluster-Robust Inference*](https://doi.org/10.3368/jhr.50.2.317) — cluster-robust SEs; failure under ~5 clusters.
11. Efron (1979), [*Bootstrap Methods: Another Look at the Jackknife*](https://doi.org/10.1214/aos/1176344552) — the original.
12. Künsch (1989), [*The Jackknife and the Bootstrap for General Stationary Observations*](https://doi.org/10.1214/aos/1176347265) — moving-block bootstrap.
13. Bickel & Freedman (1981), [*Some Asymptotic Theory for the Bootstrap*](https://doi.org/10.1214/aos/1176345637) — inconsistency at the sample max (§6).
14. Schenker & Gentleman (2001), [*Judging Significance by Examining the Overlap Between Confidence Intervals*](https://doi.org/10.1198/000313001317097960) and Cumming (2009), [*Inference by eye*](https://doi.org/10.1002/sim.3471) — §7.2's 3.92-vs-2.77 SE arithmetic.
15. Gelman et al., [*Bayesian Data Analysis* 3e](http://www.stat.columbia.edu/~gelman/book/) — §1.1's conjugate update.
16. [NIST/SEMATECH — Confidence limits for the mean](https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm) — small-df t multipliers.
17. [FanGraphs Library — Sample Size](https://library.fangraphs.com/principles/sample-size/) — §4's baseball-side framing.

**Triton-internal evidence (read 2026-08-11; no DB queries run):** `app/api/update/route.ts:251-276` (`pitch_count` written) and `:322-333` (scoring UPDATE — `release_speed IS NOT NULL` the only completeness test, no `pitch_count` floor); `lib/leagueStats.ts:1008-1028` (`BL_BY_YEAR` league σ); `lib/metricRegistry.ts` (`max` totals, maxEV/maxVelo); `create-materialized-views.sql:105, 323` (`stuff_plus_n`, unread); `PercentileTab.tsx:420` (`n={pool.n_qualified}`); repo-wide grep for `confidence interval|standard error|margin of error|error bar` over `lib/`, `components/`, `app/` → **zero matches**.
