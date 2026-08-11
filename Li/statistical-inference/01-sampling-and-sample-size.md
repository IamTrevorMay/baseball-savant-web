---
title: Sampling and Sample Size — What n Buys, and Why 149 Pitches Buys Less Than It Looks
domain: statistical-inference
tags:
  - sampling
  - sample-size
  - standard-error
  - design-effect
  - clustering
  - statistical-power
  - effective-sample-size
  - stuff-plus
sources_reviewed: 18
last_updated: 2026-08-11
---

# Sampling and Sample Size — What n Buys, and Why 149 Pitches Buys Less Than It Looks

> Grades: **(established)** published/replicated; **(computed)** arithmetic done here on figures
> verified elsewhere in the brain; **(estimated)** from theory with a stated assumption. §9's SQL is
> written to be run — the DB was off-limits this pass.

## TL;DR

- **"Sample size" is meaningless until you name the frame.** Triton holds a *census* of thrown pitches, so a descriptive question ("what was his August Stuff+?") has zero sampling error while a generalizing one ("is he worse now?") has a large one. Same rows, two denominators. **(established)**
- **The n that matters is almost never the pitch count.** Stuff+ uses pitches, Whiff% swings, Barrel% batted balls: 149 pitches is ~45 swings and ~25 batted balls — one window, three sample sizes. **(estimated)**
- **Pitches inside an outing are not independent draws, and the correction is large.** At ~75 pitches per start and an intra-outing ICC of 0.02–0.04, the design effect is **2.5–3.9**: 149 pitches behaves like **38–60**. Effective n is bounded below by the *cluster* count, so for an outing-level effect (a dropped arm slot) the real n is **2**. **(computed / established)**
- **Povich, Aug 2026: SE of the August mean is 0.53 under independence, 0.75–1.07 after the design effect; SE of the May→Aug difference ≈ 1.1–1.5, so the 2.3-point move is 1.5–2.1 SE** — the prior 1.3–2.1 range reproduced, top end tightened. **(computed, on an estimated σ)**
- **That design's minimum detectable effect is 3.0–4.2 points at 80% power** — the observed move is smaller than the smallest move the sample could reliably find. Not "no change"; *no verdict*. **(computed)**
- **Detecting a 2-point Stuff+ change at 80% power needs ~166 effective pitches per side ≈ 415 raw pitches ≈ 5–6 starts per side.** A pitch-type split (FF at ~49% usage) roughly doubles the starts. **(computed)**
- **Some of the Povich gap is bias, not variance, and bias does not shrink with n.** May and August sit on different `pitch_baselines` vintages, worth ±0.3–0.6 points — up to a quarter of the move. No sample size removes it. **(computed, per `metric-governance/05`)**
- **A pitcher-season is not a stationary process, which puts a *ceiling* on useful n as well as a floor.** Widen the window to shrink the SE and you start averaging over the mechanical change you were trying to detect. **(established)**
- **Report `n`, the cluster count `k`, and the metric's own denominator, or the number is an opinion.** `stuff_plus_n` already exists and nothing reads it. **(computed)**

---

## 1. What is a "sample" when you already have the population?

Triton's `pitches` table is a **census** of tracked MLB pitches, not a survey sample — a fact used
wrongly in both directions.

| Question | Frame | Sampling error? |
|---|---|---|
| "What was Povich's August Stuff+?" | The 149 pitches themselves | **No.** 97.7 is exact; SE = 0 |
| "What is his current true pitch quality?" | Pitches he *would* throw in August conditions | **Yes** — the whole ballgame |
| "What will he do in September?" | Future pitches, different process | Yes, plus non-stationarity (§8) |
| "How does he rank among MLB SP?" | Qualified-SP population | Yes, plus leaderboard multiplicity |

Row 1 is **design-based** inference over a finite population; rows 2–4 are **model-based**, treating
the pitches as one realization from a superpopulation this arm could throw. Only row 1 gets the
census discount, and the **finite-population correction** says why: over n draws from N units,
`SE_fpc = (σ/√n)·√((N−n)/(N−1))`, exactly 0 when n = N. Descriptive claims about the past are
certain. **The moment the sentence contains *is*, *has become*, or *will*,
the FPC no longer applies and you are back to σ/√n.** Nearly every question Trevor asks is row 2:
"did his stuff decline" is a claim about a latent process, evidenced by a census of its output.
Census ≠ certainty. (established)

---

## 2. Rate vs continuous — the denominator is not the pitch count

Two formulas cover almost everything here:

| Type | Statistic | SE | Triton examples |
|---|---|---|---|
| **Continuous mean** | x̄ | σ/√n | Stuff+, velo, spin, extension, VAA/HAA, movement |
| **Proportion** | p̂ | √(p(1−p)/n) | Whiff%, Chase%, Zone%, FPS%, Barrel% |

The trap is **which n goes in**. A "149-pitch sample" is a different size for every metric on the
same screen. League-typical event rates (estimated, not measured on Triton):

| Metric | Actual denominator | ≈ n at 149 pitches | 95% half-width |
|---|---|---|---|
| Stuff+ (composite) | pitches with `release_speed` + baseline row | ~149 | ±1.0 (indep.) / ±2.1 (clustered) |
| FF Stuff+ | four-seamers only (~49% usage) | ~73 | ±1.5 / ±3.0 |
| Strike% | pitches | ~149 | ±7.7 pp |
| Whiff% | **swings** (~30% of pitches) | ~45 | ±12.6 pp |
| Barrel% | **batted balls** (~17%) | ~25 | ±13 pp (Wald; use Wilson) |

Strike% at p=0.65, n=149: √(.65·.35/149) = 0.039 → ±7.7 pp. Whiff% at p=0.25, n=45 → ±12.6 pp.
**(computed)** Below ~100 events Wald's coverage fails — **use Wilson or Agresti–Coull**
(established). And §4's clustering correction applies to proportions too, so these are the
*optimistic* half of the story.

---

## 3. Standard error of a mean, honestly

`SE = σ/√n` needs σ at the **pitch grain**. Season-to-season Stuff+ SDs describe between-pitcher
spread and are the wrong input.

**Assumption used throughout: within-pitcher, within-pitch-type pitch-level SD of `stuff_plus`
≈ 6.5 points** — from `metric-governance/05-baseline-normalization-design.md`, which propagates
velo/movement/extension variability through the 4.5/3.5/2.0 z-composite. **(estimated)**; never
measured on Triton data, and every interval below scales linearly with it.

| n (pitches) | SE = 6.5/√n | 95% CI half-width |
|---|---|---|
| 50 | 0.92 | ±1.80 |
| 100 | 0.65 | ±1.27 |
| **149** | **0.53** | **±1.04** |
| 400 | 0.33 | ±0.64 |

The √n tax: halving the interval costs 4× the pitches. And this table is the **independence
fiction** — everything after it makes these numbers worse.

---

## 4. The design effect — pitches within outings within pitchers

Pitches arrive in clusters. One start is one warm-up, one arm state, one weather, one ball batch,
one catcher, one mechanical setting — whatever is shared inside a start is measured **once**, not 75
times. Kish's correction:

```
deff  = 1 + (m̄ − 1)·ρ        m̄ = mean cluster size, ρ = intraclass correlation
n_eff = n / deff
SE    = σ / √n_eff
```

For Povich's window: n = 149, k = 2 outings, m̄ = 74.5.

| ρ (intra-outing ICC) | deff | n_eff | SE of the Aug mean |
|---|---|---|---|
| 0.00 (fiction) | 1.00 | 149 | 0.53 |
| 0.01 | 1.74 | 86 | 0.70 |
| **0.02** | **2.47** | **60** | **0.84** |
| 0.03 | 3.21 | 46 | 0.95 |
| 0.04 | 3.94 | 38 | 1.06 |

**(computed** arithmetic; ρ **estimated** — no Triton ICC has ever been measured.) ρ = 0.02–0.04 is
my working prior: outing-to-outing velocity swings of ±0.5 mph against a within-outing SD of the
same order put a few percent of variance at the outing level. Two facts matter more than ρ:

1. **n_eff is bounded by k.** As ρ → 1, deff → m̄ and n_eff → k: two starts are worth at most 149
   and at least **2**. Once ρ is material, adding pitches to the *same* outings buys almost nothing;
   adding outings buys everything.
2. **The relevant ρ depends on the effect you're chasing.** A mechanical change — release height
   6.05 → 5.87 ft — is constant inside an outing, i.e. ρ = 1 for that component. **For an
   outing-level hypothesis the sample size is the number of outings, and Povich's is 2.** No
   pitch-level SE can rescue that. (established)

Clustering nests further (outings in a pitcher-season, pitchers in a league-season) — the argument
for `08-bayesian-hierarchical-estimation.md`. The scalar deff is a dashboard caveat; the model is an
estimate.

---

## 5. Worked example — Cade Povich, August 2026

**Setup.** May 2026 MLB Stuff+ 100.0; Aug 2026 MLB Stuff+ **97.7 on n = 149 pitches across 2
starts**; Δ = −2.3. Figures from `metric-governance/08-cross-level-comparability.md` §5.1. July's
AAA 100.0 is excluded — scored against `milb_pitch_baselines`, not on this scale.

**Step 1 — SE of the August mean, independence.** 6.5/√149 = **0.53**.

**Step 2 — design effect.** m̄ = 74.5, k = 2. At ρ = 0.02–0.04: deff = 2.47–3.94, n_eff = **38–60**,
SE = **0.75–1.07**. Clustering roughly **doubles** the SE; the 149 pitches carry the information of
about 50.

**Step 3 — SE of the difference.** May's denominator is not counted here (stating an unmeasured n is
the sin this doc exists to prevent), so bracket it. May as noisy as August → SE_diff = √(SE²+SE²) =
1.06–1.51; May a fully-clustered month (n_eff ≈ 160, SE ≈ 0.51) → 0.91–1.18. Conservatively:
**SE_diff ≈ 1.1–1.5, so the move is ≈ 1.5–2.1 SE.** Prior analysis put it
at **1.3–2.1 SE** on SE_diff 1.1–1.8. **Verdict: reproduced, with the top of the SE_diff range
corrected down** — 1.8 needs SE ≈ 1.27 on both sides, i.e. ρ > 0.06 on both. Conclusion unchanged,
arithmetic now traceable. **(computed)**

**Step 4 — what could this design detect?** MDE at 80% power, α = 0.05 two-sided, is 2.802 × SE_diff
= **3.0–4.2 points**. The observed 2.3 is **below the smallest effect the sample could reliably
find**. The honest statement is not "he didn't decline" — it's "this window cannot answer that."

**The honest interval: Δ = −2.3 Stuff+, 95% CI ≈ [−5.2, +0.6], n = 149 pitches / 2 starts
(n_eff ≈ 38–60), against a May denominator that has not been counted.** It contains zero.
**(computed, on an estimated σ and ρ)**

**Step 5 — what survives.** The composite is inconclusive, but the *mechanism* is not the same
evidence twice: Stuff+ has no release-position term, so FF release height −0.18 ft and side +0.21 ft
are an independent channel, and FF Stuff+ 98.4 → 95.8 at *rising* usage (43% → 49%) is coherent. At
k = 2 that is a **hypothesis with a monitoring plan**, graded *estimated*. See §6 for the part that
isn't a sampling question at all; `09-small-sample-communication.md` for how to surface it.

---

## 6. Bias does not shrink with n

The May value was scored against May-to-date `pitch_baselines`; the August value was scored after
the 2026-08-11 full-rescore, which repaired Jun–Aug against current baselines while Feb–May kept
their original nightly vintages. `metric-governance/05` puts the resulting offset at **±0.3–0.6
points**, up to ~26% of the observed 2.3. **(computed)**

This is a **systematic** term: `E[Δ̂] = Δ_true + b`, with `b` invariant to n. Ten thousand more
pitches scored against the wrong vintage give a tighter interval around the wrong center. It is not
inside the ±1.04 and must not be quoted as if it were. **So: before computing an SE, verify both
sides were computed the same way** — baseline vintage, level, qualification rule, weighting.
Comparability is a precondition of inference, not a component of it.

---

## 7. "How many pitches do I need?" — power and MDE

Fix four knobs — σ (pitch-level SD), Δ (effect worth detecting), α = 0.05 two-sided, power 0.80:

```
n_eff = 2σ²(z_{1−α/2} + z_{power})² / Δ²      z-sum = 1.960 + 0.842 = 2.802
n_raw = n_eff × deff
```

At σ = 6.5, two-sample, 80% power (**computed**):

| Δ to detect | n_eff / side | n_raw @ deff 2.5 | starts / side (~75 p) | n_raw @ deff 3.9 |
|---|---|---|---|---|
| **2.0 pt** | **166** | **415** | **~5.5** | **647** |
| 2.3 pt | 125 | 313 | ~4.2 | 488 |
| 3.0 pt | 74 | 185 | ~2.5 | 289 |

**Headline: detecting a 2-point Stuff+ change at 80% power needs ~166 effective pitches per side —
about 415 raw pitches, 5–6 starts per side, ~11 starts total.** Against a *fixed* reference (a stable
career or league baseline) it halves to ~83 effective ≈ 210 pitches ≈ 3 starts. A single pitch type
at ~49% usage doubles the starts. A reliever at ~15 pitches/outing carries a much smaller deff
(1 + 14ρ ≈ 1.3) but accumulates outings slowly — same arithmetic, different path.

**Do not run post-hoc power on the observed effect** — it is a monotone function of the p-value.
Reason instead about Gelman & Carlin's **Type S** (wrong sign) and **Type M** (inflated magnitude):
at 1.5–2.1 SE any effect clearing a significance filter is exaggerated ~1.3–1.6×. That is the case
for `03-regression-to-mean-shrinkage.md`. (established)

---

## 8. A season is not stationary — the ceiling on n

Every formula above assumes the 149 pitches are exchangeable draws from one distribution. They are
not. Within an outing: fatigue, times-through-order, count-dependent selection (the pitcher *chooses*
the pitch from the count, so the sample isn't self-weighting). Across outings: mechanics, weather,
opponent, workload, health.

**And here non-stationarity *is* the finding** — release height moved 6.05 → 5.87 ft. If the
generating process changed, a wider window doesn't estimate the current process better; it gives a
*precise estimate of a mixture*. Window length is a bias–variance tradeoff with an interior optimum:
2 starts is huge variance and no bias, a full season is small variance and large bias toward the
pre-change process, and the useful window sits between them.

This is the boundary with `07-trend-detection-changepoints.md`: when the process may have moved, the
question is not "how many pitches do I need" but "where did it move, and how much data exists *after*
the changepoint." Sample size can't be chosen independently of that answer — which is why
**post-changepoint or exponentially-weighted windows beat fixed-length ones for a current-form
read**, at an effective n smaller than their row count. (established)

---

## 9. SQL to make this measurable

Not run — the DB was off-limits this pass. Run it, log to `docs/Queries.md`, and replace this doc's
*estimated* σ and ρ with *computed* ones. One query returns both: `sd_pitch` is §3's σ (assumed 6.5),
`icc` is §4's ρ, `n`/`k`/`m_bar` the denominator every surface should print. One-way random-effects
ICC(1), unequal cluster sizes.

```sql
WITH p AS (
  SELECT game_pk, stuff_plus::numeric AS y
  FROM pitches
  WHERE pitcher = $1 AND game_year = $2 AND pitch_name = $3
    AND stuff_plus IS NOT NULL
    AND COALESCE(pitch_type,'') NOT IN ('PO','IN')
), grand AS (SELECT AVG(y) AS gm, STDDEV_SAMP(y) AS sd_pitch FROM p),
g AS (
  SELECT game_pk, COUNT(*)::numeric AS m, AVG(y) AS ybar, COALESCE(VAR_SAMP(y),0) AS v
  FROM p GROUP BY game_pk
), s AS (
  SELECT COUNT(*)::numeric AS k, SUM(m) AS n, SUM(m*m) AS sum_m2,
         SUM((m-1)*v) AS ss_within,
         SUM(m * POWER(ybar - (SELECT gm FROM grand), 2)) AS ss_between
  FROM g
)
SELECT n, k, n/k AS m_bar, (SELECT sd_pitch FROM grand) AS sd_pitch,
       ss_between/(k-1)        AS ms_between,
       ss_within/NULLIF(n-k,0) AS ms_within,
       (n - sum_m2/n)/(k-1)    AS m0,        -- effective cluster size, unequal m
       GREATEST(0,
         (ss_between/(k-1) - ss_within/NULLIF(n-k,0))
         / NULLIF(ss_between/(k-1) + ((n - sum_m2/n)/(k-1) - 1) * ss_within/NULLIF(n-k,0), 0)
       ) AS icc                              -- ρ; deff = 1 + (m_bar - 1) * icc
FROM s;
```

Run it across ~200 qualified starters and take the median ρ per metric: every sample-size caveat on
the platform then converts from *estimated* to *computed*. One-hour job.

---

## 10. What Triton should do, in order

1. **Measure σ and ρ — everything here is scaffolding until you do.** Run §9 across qualified
   pitcher-seasons; store it in a small
   `metric_dispersion (metric, level, role, sd_pitch, icc_outing, measured_at)` table. Every interval
   on the platform then becomes *computed* rather than *estimated*.
2. **Print `n` and `k` on every short-window surface** — a tile should read `97.7 · 149 p / 2 G`.
   `stuff_plus_n` already exists and nothing reads it. **Cas** owns the display; Li owns the rule.
3. **Encode `min_n` and `stabilization_n` per metric in `lib/metricRegistry.ts`** from §7's MDE
   table and `02-reliability-stabilization.md`, so short windows warn structurally. Standing
   priority #2 in `context/triton-context.md`.
4. **Make the denominator the metric's own event count** — swings for Whiff%, batted balls for
   Barrel% (§2). One "149 pitches" label across a tile row is wrong on most tiles.
5. **Never compute an SE before checking comparability** (§6) — bias first, variance second — and
   **switch proportion intervals to Wilson**, one helper with correct coverage at the small
   denominators this platform makes easy to reach.

**Anti-recommendation: do not adopt a minimum-sample gate that hides numbers below a threshold**
("don't show Stuff+ under 200 pitches"). It is the obvious move and it is wrong three ways. It
**encodes a false binary** — reliability is a continuous curve, not a switch
(`02-reliability-stabilization.md`; Soto's doc 09 agrees from the model side). It **destroys the
most valuable use case**: a two-start window is exactly when a coach needs to see a possible
mechanical change, and the answer is a wide interval with a denominator, not a blank tile. And it
**teaches the wrong lesson** — that a number above the gate needs no denominator, which is how a
600-pitch sample gets quoted to one decimal with no interval. Show the number, its n, and its
interval, and let the width do the arguing. Gate only where the denominator is *structurally*
uninterpretable (a 3-batted-ball Barrel%, a pre-2017 deception value), and there say "insufficient
data" rather than silently suppressing.

---

## Sources

1. [FanGraphs Library — Sample Size](https://library.fangraphs.com/principles/sample-size/) — Carleton-lineage stabilization table; the baseball-native "how many is enough."
2. [Baseball Savant — CSV docs](https://baseballsavant.mlb.com/csv-docs) — which fields are per-pitch vs per-event, i.e. which denominator applies (§2).
3. [Sampling frame](https://en.wikipedia.org/wiki/Sampling_frame) — the frame-vs-population distinction §1 rests on.
4. [Survey sampling](https://en.wikipedia.org/wiki/Survey_sampling) — design- vs model-based (superpopulation) inference; why a census still carries process uncertainty.
5. [Standard error](https://en.wikipedia.org/wiki/Standard_error) — σ/√n and the finite-population correction (§1, §3).
6. [Binomial proportion CI](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval) — Wald's coverage failure at small n; Wilson / Agresti–Coull (§2).
7. [Design effect](https://en.wikipedia.org/wiki/Design_effect) — deff = 1 + (m̄−1)ρ, from Kish's *Survey Sampling* (1965); §4's correction.
8. [Cluster sampling](https://en.wikipedia.org/wiki/Cluster_sampling) — why effective n is bounded below by the cluster count.
9. [Intraclass correlation](https://en.wikipedia.org/wiki/Intraclass_correlation) — the ICC(1) estimator and unequal-cluster m₀ term implemented in §9.
10. [Power (statistics)](https://en.wikipedia.org/wiki/Power_(statistics)) — the (z+z)² sample-size formula in §7.
11. [NIST/SEMATECH — Sample sizes required](https://www.itl.nist.gov/div898/handbook/prc/section2/prc222.htm) — the two-sample-mean derivation behind §7.
12. [Gelman & Carlin — Beyond Power Calculations (PDF)](http://www.stat.columbia.edu/~gelman/research/published/retropower_final.pdf) — Type S / Type M; §7's exaggeration argument.
13. [Gelman — 16× the sample size for an interaction](https://statmodeling.stat.columbia.edu/2018/03/15/need-16-times-sample-size-estimate-interaction-estimate-main-effect/) — the cost of a finer question; applies to pitch-type splits.
14. [Multilevel model](https://en.wikipedia.org/wiki/Multilevel_model) and [lme4](https://cran.r-project.org/package=lme4) — the principled alternative to a scalar deff.
15. [Exchangeable random variables](https://en.wikipedia.org/wiki/Exchangeable_random_variables) — the assumption count-dependent pitch selection violates (§8).
16. [Stationary process](https://en.wikipedia.org/wiki/Stationary_process) — the assumption a mid-season mechanical change breaks (§8).
17. [Bias of an estimator](https://en.wikipedia.org/wiki/Bias_of_an_estimator) — why §6's offset is invariant to n.
18. [PostgreSQL — Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — `VAR_SAMP`/`STDDEV_SAMP` and NULL skipping (§9).

**Triton-internal evidence (2026-08-11; brain docs and source reads — no queries run):** Povich
Stuff+, FF splits, usage and release-position figures from
`Li/metric-governance/08-cross-level-comparability.md` §5.1 (measured 2026-08-11, n = 149).
Pitch-level SD ≈ 6.5 and the ±0.3–0.6-point rescore-seam offset from
`Li/metric-governance/05-baseline-normalization-design.md`. Stuff+ formula from
`app/api/update/route.ts`; the `NOT IN` NULL hazard and `stuff_plus_n` from
`Li/metric-governance/01-metric-definition-semantics.md`.
**Cross-references:** `02-reliability-stabilization.md`, `03-regression-to-mean-shrinkage.md`,
`04-uncertainty-quantification.md`, `07-trend-detection-changepoints.md`,
`09-small-sample-communication.md`, and `Soto/algorithm-design/09-model-validation-stabilization.md`
— stuff models stabilizing at ~78–116 pitches is a **reliability** threshold (does the ranking
hold?), complementary to this doc's **precision** threshold (how tight is the interval?). No
conflict.
