---
title: Bayesian Hierarchical Estimation — When Partial Pooling Beats a Shrinkage Constant
domain: statistical-inference
tags:
  - hierarchical-models
  - partial-pooling
  - multilevel
  - variance-components
  - posterior-intervals
  - empirical-bayes
  - stuff-plus
  - command
sources_reviewed: 23
last_updated: 2026-08-12
---

# Bayesian Hierarchical Estimation — When Partial Pooling Beats a Shrinkage Constant

> Grades: **(established)** published/replicated; **(computed)** verified against Triton source or the
> 2026-08-12 packet; **(estimated)** derived from stated inputs; **(folk-sabermetrics)** unverified.
>
> `03-regression-to-mean-shrinkage.md` owns empirical Bayes and the `r = n/(n+k)` identity. This doc
> owns the **full model**: what estimating the variance components buys, and what it costs here.

## TL;DR

- **Partial pooling isn't "better shrinkage": the constant is estimated, not assumed, and aimed at more than one target.** (established)
- **Doc 03's `r = n/(n+k)` *is* the two-level model with τ², σ² fixed and known; the hierarchical model's job is to stop pretending you know them.** (established)
- **Pooling strength across a pitcher's pitch types differs ~6,800× between Stuff+ (`k_within ≈ 0.23 pitches`) and Cmd+ (`≈ 1,562`) — same table, same grain, opposite answer.** (estimated)
- **Pooling Stuff+ across an arsenal is inert:** fitted τ ≈ 5.8 dwarfs every within-cell SE, so a 40-pitch cutter moves 0.3 points — correcting `03` §10's exception. (estimated)
- **Pooling *command* is not inert — a 4th pitch shrinks ~99% toward the pitcher's own arsenal mean** — where a real model pays. (estimated)
- **Triton's league prior is half-materialised:** `league_averages` carries `value`, `stddev`, `n_qualified` over 1,806 rows — literally (μ, τ̂, J) per key. (computed)
- **But `stddev` is the SD of *observed* player means — τ² + mean sampling variance, not τ; as a prior SD it under-shrinks, and one subtraction fixes it.** (computed)
- **`app/api/league-baseline/route.ts:76-90` pools SP and RP by n-weighting two standard deviations.** Variances add, SDs don't — and the between-role mean gap is dropped. (computed)
- **The natural top level is tiny: `pitch_baselines` is 206 rows (~17 pitch names × 12 years), so τ there is fit from ~17 numbers.** (computed)
- **No Stan, PyMC, or numeric Python in this stack, and the platform can't finish a plain league aggregate inside its 8s PostgREST budget.** Any fit is an offline script writing a table. (computed)
- **A hierarchical fit over the un-versioned `stuff_plus` column charges nightly baseline drift to true talent,** since the likelihood has no term for it. (estimated)
- **`model_version` on a posterior is as mandatory as `baseline_version` on a z-score** — a posterior mean is derived-from-derived, unreproducible from its own row. (established)

---

## 1. Three pooling regimes

| Regime | Estimator for group *j* | Assumes | Fails when |
|---|---|---|---|
| **No pooling** | `ȳⱼ` | groups share nothing | small `nⱼ` → noise; every Triton leaderboard today |
| **Complete pooling** | `ȳ` (grand mean) | groups are identical | real between-group spread is erased |
| **Partial pooling** | `μ + rⱼ(ȳⱼ − μ)`, `rⱼ = τ²/(τ² + σ²/nⱼ)` | groups are draws from one distribution | exchangeability is false |

`τ²` places you on the continuum: `τ² → ∞` = no pooling, `τ² → 0` = complete. The data chooses, not
you, and the resulting `rⱼ` distribution is the most informative diagnostic a fit can print
(§9.3). (established)

---

## 2. The model, and how doc 03 is a special case

Two levels, Normal–Normal, `j` = group (pitcher, or pitcher × pitch type):

```
ȳⱼ | θⱼ ~ N(θⱼ, σ²/nⱼ)        # likelihood — within-group noise
θⱼ | μ, τ ~ N(μ, τ²)          # prior — population of true talents
μ, τ ~ hyperpriors            # Bayesian, vs. empirical Bayes
```

Marginalising `θⱼ` gives `μ̂ + rⱼ(ȳⱼ − μ̂)` — doc 03's formula verbatim, `k = σ²/τ²` in units of one
observation. Differences that matter:

| | Point shrinkage (doc 03) | Hierarchical model |
|---|---|---|
| `k` | supplied by you | estimated from between-group spread |
| `μ` | supplied by you | estimated jointly, with its own uncertainty |
| Uncertainty in `μ`, `τ` | ignored | propagated into every `θⱼ` interval |
| Levels | one target | nested: pitch type → pitcher → role → league |
| Output | a point | a posterior — `P(θᵢ > θⱼ)`, rank distributions, intervals |

Row four cannot be faked: **a point estimator pulls a thin cell toward the pitcher's mean *or* the
pitcher toward the league — not both, at the right strength each** (§6: real for command, absent for
Stuff+).

Row five matters for anything ordinal: in Rubin's eight schools the largest observed effect had well
under 50% posterior probability of being best — "best slider in baseball" is the same question.
(established)

---

## 3. Triton's actual group structure

Counts from the 2026-08-12 packet. **Uncountable level = unfittable level.**

| Level | Table | Groups (J) | Verdict for a fit |
|---|---|---|---|
| Season × level × role × metric | `league_averages` | 1,806 rows | already materialised (§4) |
| Pitch name × year | `pitch_baselines` | **206** | natural top level, far too small |
| Pitcher × pitch type × year | `pitcher_season_command` | 27,119 | **the right fit unit** |
| Pitcher × pitch type × year | `pitcher_season_deception` | 17,386 | same, 2017+ only |
| Player × season × stat group | `player_season_stats` | 79,061 | season counting stats |
| Pitcher (active, Aug 2026) | `pitches` | 453 MLB | ample J for a pitcher level |
| Outing | from `pitches` (8.88M) | ~30/starter-season | ICC 0.02–0.04, DEFF 2.5–3.9 |

**206 is the constraint at the top.** ~17 pitch names/season means τ there is fit from ~17 numbers;
τ̂'s relative SD `1/√(2(J−1))` ≈ **17.7%** at J = 17 — pooling strength itself ±18% before data
noise. Gelman: below J ≈ 5 fix the variance; at 17 estimate it, but don't report three digits.
(established / estimated)

**Pitch-type-within-pitcher has J = 4–6, the small-J case.** Don't drop the level — estimate
τ_within as **one parameter shared across all 453 pitchers**, on 27,119 cells rather than one
pitcher's five: partial pooling of the variance component itself, which per-pitcher arithmetic
cannot do. (established)

The outing level is real but expensive: at ICC 0.02–0.04 and ~75 pitches/start, DEFF is 2.5–3.9, so
a pitch-level likelihood overstates `nⱼ` by that factor, inflating every `rⱼ`. **Use
`n_eff = n/DEFF` or model the outing as a level — not neither.** (computed, via `01-sampling`)

---

## 4. The prior Triton already has, and what's wrong with it

`league_averages`: 1,806 rows keyed `(season, level, role, metric)` carrying `value`, `stddev`,
`n_qualified`, `leader_value`, `qual_floor` (`scripts/create-league-averages.sql:21-24`) — a nightly
role-level prior, served by an API route. Four defects block it:

1. **`stddev` is not τ.** Its comment reads *"Sample stddev across qualified players"* (`:37`) — SD
   of *observed* player means, `√(τ² + mean sampling variance)`. Too wide as a prior SD: every
   metric under-shrinks. Fix `τ̂² = var_obs − avg(σ²/nᵢ)`, doc 03 §2.1's method of moments.
   (computed / established)
2. **The SP/RP pool is wrong twice.** `app/api/league-baseline/route.ts:76-90` does `sSum += s * n`
   then `stddev = sSum/totalW` — an n-weighted mean of two **standard deviations**. Variances
   average, SDs do not (Jensen: biased low), and the between-role term `Σnⱼ(μⱼ − μ̄)²/Σnⱼ` is
   dropped. Pooled variance is within + between; this returns neither. It feeds ±3σ heatmap scales,
   so those come out too tight. (computed)
3. **Every `_plus` metric is excluded by design** — Stuff+, Cmd+, Brink+, the thinnest per-cell
   samples, have no prior row. Right for *benchmarking* (they centre at 100), wrong for *pooling*,
   which needs a σ. (computed)
4. **It is a mean, not the 50th percentile the docs claim, and it has been stale.** 50 of 52 nightly
   refreshes timed out at 8s from 2026-06-21 to 2026-08-11 while recording `status='success'`,
   leaving 2026 rows 46 days old — provenance, not just precision. (computed)

**A prior is a metric:** it needs the governance any derived number needs — population, vintage,
qualification rule — and none is written down.

---

## 5. Priors on τ, briefly, because the default is a trap

A flat hyperprior on μ is harmless. **On τ it is not.** The default `InvGamma(ε, ε)` is not weakly
informative — the posterior is sensitive to ε exactly when τ is near zero, the interesting case. Use
half-Normal or half-Cauchy in the metric's units; half-Normal(0, 10) is generous for a plus-stat.
(established)

Using "Bayesian model" to mean "we were careful" is **folk-sabermetrics**: the prior on τ has a
numeric consequence and belongs in the metric's definition beside the weights.

---

## 6. Worked: the same arsenal, two metrics, opposite answers

One starter, five pitch types, 2026. Within-pitch SD `σ = 2.77` Stuff+ points
(`04-uncertainty-quantification.md` §5.2), `n_eff = n/3` for outing clustering; **estimated**
throughout.

| Pitch | n | n_eff | Stuff+ ȳ | Stuff+ SE | Cmd+ SE |
|---|---|---|---|---|---|
| FF | 900 | 300 | 104.0 | 0.160 | 9.1 |
| SL | 520 | 173 | 99.0 | 0.211 | 12.0 |
| CH | 180 | 60 | 93.0 | 0.357 | 20.4 |
| CU | 95 | 32 | 108.0 | 0.489 | 27.9 |
| FC | 40 | 13 | 118.0 | 0.768 | 43.8 |

**Stuff+.** Precision-weighted grand mean `μ̂ = 101.9`; DerSimonian–Laird gives `Q = 1579`, `df = 4`,
`τ̂² = (Q − df)/(Σw − Σw²/Σw) = 1575/47.2 = 33.4`, so **τ̂ = 5.78**. Then `r_FF = 0.999`, and even the
40-pitch cutter gets `r_FC = 33.4/33.99 = 0.983`: 118.0 → **117.7**. In `k` units,
`k_within = σ²/τ² = 7.67/33.4 =` **0.23 pitches**.

The honest result: **Stuff+ is already normalised per pitch type, so between-type variance within a
pitcher is enormous and there is nothing to borrow** — a cutter is evidence about a different thing,
not weak evidence about a changeup. Doc 03 §10 floated pitch-type pooling as the hierarchical
exception worth shipping early; on these inputs it does nothing.

**Cmd+, same rows.** Command is pitcher-general — locate the fastball, tend to locate the slider —
and per-pitch miss distance is far noisier than velocity. Doc 03's `k = 250` against a
between-pitcher SD of 10 gives `σ² = 25,000` per pitch; a between-type-within-pitcher `τ = 4.0`
gives `k_within = 25,000/16 =` **1,562 pitches**:

| Pitch | `r = n_eff/(n_eff + 1562)` | Weight kept on the cell |
|---|---|---|
| FF | 0.161 | 16% |
| SL | 0.100 | 10% |
| CH | 0.037 | 4% |
| CU | 0.020 | 2% |
| FC | **0.008** | **<1%** |

The cutter's command is ~99% the pitcher's arsenal mean. **Same table, same grain, same five
rows — `k_within` differs by 6,800×.** No judgement-chosen constant survives that spread. Corollary:
**build the pooling machinery on `pitcher_season_command` and `pitcher_season_deception`, not
`stuff_plus`.**

---

## 7. Fitting it on this stack — what it actually costs

`package.json`: Next.js 16.1.6, React 19.2.3, `supabase-js`, Plotly, Vitest. **No Stan, no
PyMC, no `lme4`, no numeric Python** — `scripts/` holds two Python files, neither importing numpy or
scipy. `run_query`/`run_mutation` are `SECURITY DEFINER` but still inherit `authenticator`'s **8s**
`statement_timeout` — why `refresh_league_averages` cannot finish, and why the recent Stuff+ fix
chunks scoring by day.

| Tier | What it is | Effort | Runs where | Buys | Gives up |
|---|---|---|---|---|---|
| **1. Closed form** | Two-level Normal–Normal, τ̂² by moments (DL), `rⱼ` per row | ~1 day, ~40 lines TS or 1 SQL pass | nightly script or hoisted function | 90% of the gain, auditable by hand | one level; τ̂ pins at 0; no uncertainty on τ |
| **2. EM / REML in TS** | Nested random intercepts, pre-aggregated table | ~1 week incl. tests | offline `scripts/*.ts`, service-role | nesting; proper `n_eff`; shared τ_within | normal approx; hand-rolled numerics; no posterior |
| **3. MCMC (Stan/brms/PyMC)** | Full posterior, non-normal likelihoods, crossed effects | new runtime + deploy target + fit artifact | *nowhere in this stack today* | exact intervals, `P(A>B)`, binomial counts | a 2nd language, unwatched diagnostics, an unreproducible number |

Three constraints decide it:

- **27,119 rows is small.** `pitcher_season_command` fits a Node process in single-digit MB; tiers
  1–2 are memory-trivial. The scale problem is `pitches` (8.88M rows / 9,711 MB) — fit the
  pre-aggregated table, not the pitch table.
- **Nothing iterative goes in a request path.** Vercel functions are duration-capped and stateless;
  the 8s RPC ceiling is stricter. Fit offline → write summaries → app reads a table.
- **The output is a new derived table — a new governance surface.** Minimum columns:
  `(season, level, role, pitcher, pitch_type, metric, post_mean, post_sd, r, tau, sigma,
  model_version, fit_date)`. `model_version` is not optional: a posterior depends on the fit, which
  depends on the population *and* its inputs' vintage — without it, the `stuff_plus` drift problem
  returns one layer up, harder to see.

---

## 8. Failure modes, ranked by likelihood here

| Failure | Symptom | Guard |
|---|---|---|
| **Vintage in the likelihood** | Drift absorbed as talent; a pitcher "improves" April→August | Don't fit `stuff_plus` until `baseline_version` exists |
| **`stddev` used as τ** | Under-shrinkage everywhere; looks conservative, is wrong | Subtract mean sampling variance (§4.1) |
| **τ̂ pinned at 0** | Complete pooling — everyone shows the league mean; reads as a UI bug | Report τ̂ and its interval; handle the boundary |
| **Pitch-level `n` in the likelihood** | `rⱼ` inflated 2.5–3.9×; barely shrinks | `n_eff = n/DEFF`, or model the outing level |
| **Fit on qualified, used on unqualified** | τ̂ truncated by the `IP ≥ max(5, 0.20×leader)` floor; prior misses the players you most want to pool | Fit the full population, qualify only for display |
| **Small J at a level** | τ̂ swings between refits with no data change | J < 5: fix τ. J ≈ 17 (`pitch_baselines`): one digit |
| **Centered parameterisation, small τ** | MCMC divergences, Neal's funnel | Non-centered reparameterisation (tier 3 only) |
| **Posterior with no `model_version`** | Two screenshots disagree; nobody can say which fit made which | Version column written at fit time |

---

## 9. What Triton should do, in order

1. **Repair the prior first.** Store `stddev_true` on `league_averages` (`var_obs − avg(σ²/nᵢ)`),
   fix the SP/RP pooling at `app/api/league-baseline/route.ts:76-90` to combine variances plus the
   between-role gap, unstick the nightly refresh (Jo owns the timeout).
2. **Ship tier 1 against `pitcher_season_command`,** two levels: pitch-type cell → arsenal mean →
   role mean. 27,119 rows, no new runtime, one nightly script; §6 says the pooling is real here.
3. **Print the `rⱼ` distribution before building any consumer.** If it clusters above 0.95, stop:
   the model is saying the raw means were fine.
4. **Estimate τ_within as one shared parameter across all pitchers,** not per pitcher: J = 4–6 per
   arsenal isn't a fittable level alone.
5. **Add `metric_posteriors` with `model_version` and `fit_date`,** register the target in
   `MetricDef` beside doc 03's `ShrinkageSpec` so definition and pooling live together.
6. **Grant a `_plus` exemption in `league_averages`** so Stuff+/Cmd+ have a stored pitcher-level μ
   and σ at all.
7. **Revisit tier 3 only for what tiers 1–2 cannot do:** binomial likelihoods on tiny denominators
   (a reliever's chase rate), crossed pitcher × batter-hand × season effects. Offline script,
   versioned artifact, never a request path.

**Anti-recommendation: do not fit one large hierarchical model over the `pitches` table and let it
sort everything out.** It is the move this doc appears to argue for; it fails three ways.
**(a) The likelihood has no term for baseline vintage.** 8.88M rows were scored against ~180 nightly
full-season-to-date vintages with no `baseline_version` column; a model handed that column charges
the drift to pitcher talent, with a *tight* posterior, since the drift is systematic, not noisy. An elegant prior over a drifting likelihood produces confident nonsense. **(b) It has nowhere
to run.** 8.88M rows / 9,711 MB, on a platform that could not finish a plain `AVG`/`STDDEV` league
aggregate inside its 8s PostgREST budget on 50 of 52 consecutive nights, with no
Stan/PyMC/numeric-Python and a duration-capped, stateless serverless host. **(c) It
answers a question the data says isn't there.** §6's fitted `k_within ≈ 0.23 pitches` means
pitch-type pooling on Stuff+ moves a 40-pitch cell by 0.3 points — the expensive model hands back the
raw means it was given, at four decimals of borrowed authority. Do items 1–3, on command, 27,119
rows.

**Highest-leverage next action:** write `scripts/fit-command-pooling.ts` — read
`pitcher_season_command`, estimate σ² and τ² by moments, compute `rⱼ` per row, print the `rⱼ`
histogram **and write nothing back**. That histogram decides whether items 4–7 are a roadmap or a
distraction — one day, not one quarter.

---

## Sources

1. [Multilevel model](https://en.wikipedia.org/wiki/Multilevel_model) — §1's regimes.
2. Gelman & Hill, [*Regression and Multilevel/Hierarchical Models*](http://www.stat.columbia.edu/~gelman/arm/) — Ch. 12; §1.
3. Gelman et al., [*Bayesian Data Analysis* 3e](http://www.stat.columbia.edu/~gelman/book/) — Ch. 5; §2.
4. Gelman (2006), [*Multilevel Modeling: What It Can and Cannot Do*](https://doi.org/10.1198/004017005000000661) — §3's small-J rule.
5. Gelman (2006), [*Prior distributions for variance parameters*](https://doi.org/10.1214/06-BA117A) — §5's `InvGamma` trap.
6. Rubin (1981), [*Estimation in Parallel Randomized Experiments*](https://doi.org/10.3102/10769986006004377) — eight schools; §2.
7. Efron & Morris (1975), [*Data Analysis Using Stein's Estimator*](https://doi.org/10.1080/01621459.1975.10479864) — Stein ensemble gain.
8. Morris (1983), [*Parametric Empirical Bayes Inference*](https://doi.org/10.1080/01621459.1983.10477920) — unequal-`nⱼ` shrinkage; §6.
9. DerSimonian & Laird (1986), [*Meta-analysis in clinical trials*](https://doi.org/10.1016/0197-2456(86)90046-2) — DL moments; §6, §7 tier 1.
10. Dempster, Laird & Rubin (1977), [*ML from Incomplete Data via EM*](https://doi.org/10.1111/j.2517-6161.1977.tb01600.x) — §7 tier 2.
11. Bates et al. (2015), [*Linear Mixed-Effects Models Using lme4*](https://doi.org/10.18637/jss.v067.i01) — REML; tier 2's target.
12. Bürkner (2017), [*brms: Bayesian Multilevel Models Using Stan*](https://doi.org/10.18637/jss.v080.i01) — tier 3.
13. Carpenter, [*Hierarchical Partial Pooling for Repeated Binary Trials*](https://mc-stan.org/users/documentation/case-studies/pool-binary-trials.html) — baseball example; §7's binomial.
14. Stan User's Guide, [Reparameterization](https://mc-stan.org/docs/stan-users-guide/reparameterization.html) — §8's funnel guard.
15. Betancourt & Girolami (2013), [*HMC for Hierarchical Models*](https://arxiv.org/abs/1312.0906) — small τ breaks centered MCMC.
16. Vehtari et al. (2021), [*An Improved R̂ for Assessing Convergence*](https://doi.org/10.1214/20-ba1221) — §7's unwatched diagnostics.
17. Jensen, McShane & Wyner (2009), [*Hierarchical Bayesian modeling of hitting performance*](https://doi.org/10.1214/09-BA424) — nested player/season precedent.
18. Albert (1992), [*Poisson Random Effects Model for Home Run Hitters*](https://doi.org/10.1080/00031305.1992.10475898) — early baseball random effects.
19. Brown (2008), [*In-season prediction of batting averages*](https://doi.org/10.1214/07-AOAS138) — hierarchical vs. point-EB; §9.3.
20. Mahr, [*Plotting partial pooling in mixed-effects models*](https://www.tjmahr.com/plotting-partial-pooling-in-mixed-effects-models/) — §9.3's `rⱼ` histogram.
21. PyMC, [*Bayesian Methods for Multilevel Modeling*](https://www.pymc.io/projects/examples/en/latest/generalized_linear_models/multilevel_modeling.html) — radon build; tier-3 effort.
22. PostgreSQL, [`statement_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html) — the 8s ceiling.
23. Vercel, [Configuring function duration](https://vercel.com/docs/functions/configuring-functions/duration) — why no fit in a request path.

**Triton-internal evidence (read 2026-08-12; no database queried — counts from the 2026-08-12
packet).** Sizes: `pitcher_season_command` 27,119,
`pitcher_season_deception` 17,386, `player_season_stats` 79,061, `pitch_baselines` **206** keyed
`(pitch_name, game_year)`, `league_averages` 1,806 keyed `(season, level, role, metric)`, `pitches`
8,877,621 rows / 9,711 MB, 453 distinct MLB pitchers in Aug 2026. Prior columns/comments:
`scripts/create-league-averages.sql:21-24`, `:37`. SP/RP σ pooling defect:
`app/api/league-baseline/route.ts:76-90` (`sSum += s * n`; `stddev = sSum/totalW`). Pitch-weighted
command/deception aggregation: `scripts/create-refresh-league-averages.sql:481-520`. Stuff+ scorer and its `(pitch_name, game_year)`
join `app/api/update/route.ts:322-333`; nightly full-season-to-date baseline rebuild `:250-276`;
only shrinkage constant `SOS_REGRESSION_K = 60` at `:354`. Stack: `package.json`
(Next 16.1.6, React 19.2.3, no Stan/PyMC/lme4); `scripts/*.py` — two files, neither importing
numpy/scipy. The 8s `authenticator` `statement_timeout`, 50-of-52 refresh failures 2026-06-21 →
2026-08-11, 46-day-stale `league_averages`: `docs/reliability-findings-2026-08-11.md:14-45`;
day-chunked workaround, commit `cf345e2`. Clustering inputs (~75 pitches/start, ICC 0.02–0.04,
DEFF 2.5–3.9) from `01-sampling-and-sample-size.md`; σ = 2.77 from
`04-uncertainty-quantification.md` §5.2; `k = 250` for `cmd_plus` and the `_plus`-exclusion
consequence from `03-regression-to-mean-shrinkage.md` §7, §9.
