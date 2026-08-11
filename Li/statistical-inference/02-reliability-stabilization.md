---
title: Reliability & Stabilization — When Is the Number on Screen Defensible?
domain: statistical-inference
tags:
  - reliability
  - stabilization
  - split-half
  - cronbach-alpha
  - spearman-brown
  - predictive-validity
  - small-samples
  - metric-registry
sources_reviewed: 18
last_updated: 2026-08-11
---

# Reliability & Stabilization — When Is the Number on Screen Defensible?

> Grades: **(established)** published/replicated; **(computed)** run on Triton data; **(estimated)**
> theory or arithmetic on published values; **(folk-sabermetrics)** repeated, unsupported.
>
> **Boundary with Soto.** `Soto/algorithm-design/09-model-validation-stabilization.md` owns the
> *model-building* side — grouped/temporal splits, leakage, the team-switcher test, and the published
> settling points (tjStuff+/aStuff+ ~78–116 pitches; location/command ~330–1,050+). This doc **cites
> those figures rather than re-deriving them** and asks the consumption question: **given a value
> already on screen, is it defensible, and what does the UI do when it isn't?**

## TL;DR

- **"Stabilization" is a threshold crossing on a reliability curve, not a moment when a number becomes true.** Reliability is continuous in n; the published point is wherever someone's chosen α landed. **(established)**
- **The threshold choice dominates: n(α=0.7) = 2.33 × n(α=0.5) for the same metric.** Carleton-lineage figures are quoted at r≈0.70, Driveline's pitch-level figures at α≈0.50 — routinely compared as if they were one scale. **(established)**
- **A stabilization point is a property of a *population*, not of a metric.** r = σ²_T/(σ²_T+σ²_E): restrict range to qualified SPs and the same metric "stabilizes" later. Any encoded threshold must carry its population string. **(established)**
- **Stabilization is a variance criterion and is silent on bias.** Stuff+ carries a baseline-vintage bias of ≈0.5 points that n never reduces. Clearing 149 pitches does not make a May→August comparison legal. **(established / computed via doc 05)**
- **Reliability caps predictive validity: ρ_xy ≤ √(r_xx·r_yy).** With Judge's Stuff+ reliability .74 and ERA reliability .13, the ceiling on Stuff+→next-year ERA is ≈.31 and his observed .33 sits at it. **The binding constraint is ERA's unreliability, not the model.** **(estimated — attenuation arithmetic)**
- **Stuff+ is three physical measurements of the pitch, so per-pitch reliability is already high; per pitch type it should reach α≈0.7 in roughly 25–60 pitches.** Never measured on Triton data. **(estimated)**
- **Povich, 149 pitches: the aggregate is comfortably *above* a defensible Stuff+ threshold, and the May→Aug comparison is still not defensible.** The blockers are vintage bias and a 1.3–2.1 SE effect, not sample size. **(computed via doc 08 / estimated inference)**
- **The displayed cells are an order of magnitude smaller than the aggregate.** `pitcher:arsenal` renders per-pitch-type rows — Povich's August FF 73, SL 14, SI 12 — so a threshold on the season aggregate protects nothing a user reads. **(computed — registry read; counts from the 2026-08-11 pass)**
- **`lib/metricRegistry.ts` has 69 `MetricDef` entries and no sample field of any kind** — no `n`, no threshold, no gate — while the arsenal group already renders `count` beside `stuffPlus`. The denominator is on screen and nothing reads it. **(computed — verified 2026-08-11)**
- **"Small sample size" offered without a number is folk-sabermetrics**, as is assuming a published stabilization point transfers across populations, thresholds, and grains unchanged. **(folk-sabermetrics)**

---

## 1. What reliability actually is

Classical test theory splits an observed value into signal and noise: `X = T + E`, and

```
r = σ²_T / (σ²_T + σ²_E)                       # share of observed variance that is true
r(n) = σ²_T / (σ²_T + σ²_w/n) = n / (n + k),   k = σ²_w / σ²_T
```

**k is the sample size at which reliability equals 0.5.** It is also, exactly, the regression constant
in shrinkage: the empirical-Bayes weight on the league mean is `k/(n+k)`
(`03-regression-to-mean-shrinkage.md`). **Reliability and shrinkage are one parameter read two ways** —
which is why a stabilization point is best consumed as "how much do I regress this?", the reframing
Pemstein & Dolinar pushed in 2015. Inverting for any threshold: `n(α) = k·α/(1−α)`.

| α | n(α) as a multiple of k |
|---|---|
| 0.5 | 1.00 k — half the variance is signal |
| 0.6 | 1.50 k |
| **0.7** | **2.33 k — r² ≈ 0.5, the psychometric convention** |
| 0.8 | 4.00 k |
| 0.9 | 9.00 k |

### 1.1 The estimators

| Estimator | Formula | Note |
|---|---|---|
| Split-half | correlate two halves of one sample | halves are half-length, so it *understates* |
| Spearman–Brown | `r_full = k·r/(1+(k−1)r)`; halves `2r/(1+r)` | corrects split-half back to full length |
| Cronbach's α | `(k/(k−1))·(1 − Σσ²ᵢ/σ²_T)` | mean of all corrected splits |
| KR-21 | `(k/(k−1))·(1 − μ(k−μ)/(k·σ²_T))` | binary trials — **Carleton's actual estimator** |
| ICC | between-group / total variance | for pitches nested in games |

Two consumption-relevant properties. **α is a lower bound on reliability** unless items are
tau-equivalent, so published α-derived stabilization points are **conservative — too large, not too
small** (McDonald's ω is the modern replacement). And **odd/even split-half ≠ first-half/second-half
split-half**: chronological splits count genuine mid-season talent change as error and inflate the
apparent threshold. State which split produced any number you quote. (established)

---

## 2. The Carleton methodology and its real limits

The canonical pipeline — Carleton at Baseball Prospectus, tabulated in the FanGraphs sample-size
library — takes players above a playing-time floor, computes split-half/KR-21 reliability at increasing
n, and reports where it crosses r ≈ 0.70. Still the right starting point. Four limits govern how far
those numbers travel.

**1. The threshold is a convention** — r=0.70 because r²≈0.5. Report the curve, or the regression
weight. (established)

**2. Reliability is population-conditional.** k = σ²_w/σ²_T has the *true-talent spread* in its
denominator, so narrowing the population — qualified only, SPs only, one pitch type, one level — lowers
σ²_T, raises k, and makes the same metric "stabilize" later. A threshold imported from FanGraphs and
applied to Triton's qualified-SP population is **not the same threshold**. (established)

**3. Selection and survivorship.** A 2,000-BIP threshold can only be estimated on players who reached
2,000 BIP; Nestico's tjStuff+ figure used pitchers with 250+ pitches. Published points describe
*established* players and are optimistic for the fringe and prospect populations Triton serves.
(established)

**4. Stabilization says nothing about bias.** The framework partitions *variance*. A metric can be
perfectly reliable and systematically wrong — Triton's Stuff+ exactly so: doc 05's propagation table
isolates baseline-mean error, baseline-σ error and vintage as **common-mode and n-independent**, with
vintage ≈ 0.5 points across the 2026-08-11 rescore seam. **"It cleared the stabilization threshold" is
not an answer to "is this comparison legal?"** (established / computed via doc 05)

---

## 3. Published thresholds — two lanes, one scale

Outcome stats (Carleton lineage, FanGraphs library, r ≈ 0.70):

| Pitcher stat | n at r≈0.70 | implied k |
|---|---|---|
| K rate | 70 BF | 30 |
| BB rate | 170 BF | 73 |
| HR/FB | 400 FB | 172 |
| HR rate | 1,320 BF | 566 |
| BABIP | 2,000 BIP | 858 |

Pitch-level (Driveline 2018, 7M+ pitches, α ≈ 0.50 — **these are k, not n(0.7)**):

| Metric | n at α≈0.50 | equivalent n at α=0.70 |
|---|---|---|
| Contact% | 40 | ≈ 93 |
| O-Swing% | 55 | ≈ 128 |
| Zone-Swing%, SwStr% | 70 | ≈ 163 |

The right-hand column is the correction nobody applies (estimated — arithmetic on Driveline's published
α). Read across: **at a common threshold, pitch-level plate-discipline metrics sit near K rate, not near
BABIP.** "Stuff stabilizes fast" is true, but the gap is smaller than the raw numbers imply. For model
outputs — tjStuff+, aStuff+/aLocation+, intrinsic run value — **defer to Soto §3**.

---

## 4. Two criteria wearing one word: reliability vs precision

This is where Li extends Soto rather than repeating him. The figures above are **not the same kind of
number.**

- A **reliability** criterion (α=0.5/0.7) asks what fraction of the spread *between pitchers* is real;
  it depends on the population's true-talent variance.
- A **precision** criterion (Nestico's rolling ±0.5; Salorio's ±0.25/±0.15/±0.05) asks how tight the
  half-width of *this pitcher's* estimate is on the metric's own scale; it is population-free.

They convert only if you know the between-pitcher SD. For a plus-stat a ±0.25 band is far stricter than
α=0.5 — which is why Salorio's 78 pitches is not comparable to Driveline's 40, though both read as
"stabilization."

**Li's rule: precision criterion for composite z-score metrics (Stuff+, Cmd+, Brink+, Cluster+),
reliability criterion for rate stats (K%, Whiff%, GB%).** A plus-stat lives on an interpretable scale,
so "±1.2 points" is usable where "α=0.63" is not; and a precision band composes additively with the
irreducible bias floor (§2.4), which a reliability coefficient does not.

**Use n_eff, not n.** Pitches within an outing share weather, fatigue, ball, and umpire; doc 05's
working figure is that at m ≈ 90 and ρ = 0.05 the honest SE is ≈2.3× the naive `sd/√n`, so any
threshold in raw pitches is optimistic. (established mechanism / estimated magnitude)

---

## 5. Where Triton's metrics actually sit

### 5.1 Stuff+ — fast, and faster than the platform admits

`stuff_plus = 100 + 4.5·z(velo) + 3.5·z(movement) + 2.0·z(extension)`, z'd against
`pitch_baselines(pitch_name, game_year)`. Every input is a **physical property of the pitch**, not an
outcome mediated by a hitter, defense, and park — the whole reason it outruns outcome stats. Velocity is
the clearest case: pitch-to-pitch FF velo SD is the same order as the league SD of pitcher *average* FF
velo, so `k = σ²_w/σ²_T ≈ 1` and even a **single pitch** carries reliability near 0.5 for true average
velocity.

**Estimated: per pitch type, Triton Stuff+ reaches α≈0.7 in roughly 25–60 pitches**, with a ±1-point
precision band nearby. Consistent with — and slightly faster than — Soto's cited 78–116 for aStuff+, as
expected of a three-term linear z-composite versus a boosted run-value surface. **This is theory. It
has never been computed on Triton data; doing so is §7 item 1.** (estimated)

### 5.2 The aggregate has no threshold at all

The Stuff+ a user sees is `AVG(stuff_plus)` across pitch types — a **mix-weighted** mean of within-type
z-scores (doc 05 §8) — so it moves on component change *or* mix change. Mix share is binomial: at
n ≈ 150, `SE(p) = √(p(1−p)/n) ≈ 0.041`, so a usage difference between two ~150-pitch windows has
SE ≈ 0.058. Povich's FF usage 43% → 49% is therefore **≈1.0 SE — inside noise**. Doc 08 reads that
shift as part of a coherent mechanism; the reading survives on the release-position evidence (height
6.05 → 5.87 ft, side 1.08 → 1.29 ft), which Stuff+ has no term for and which is genuinely independent.
**The usage number is not corroboration; it is a third noisy quantity.** (estimated — extends doc 08,
does not contradict it)

### 5.3 Command and deception

`pitcher_season_command` is grained pitcher × pitch_type × year, pitch-weighted at season level.
Against Soto's cited ~330–1,050-pitch location bands: an SP's primary fastball (~45% of ~2,800 ≈ 1,260)
clears even the strict band; an SP secondary (~20% ≈ 560) clears only the loose one; **a reliever's
typical per-type count (~30% of ~900 ≈ 270) is below every published band.** Reliever command cells are,
as a class, below threshold at the grain Triton stores them — a structural statement about the table,
not about any pitcher. (estimated — arithmetic on typical workloads against Soto's bands)

`pitcher_season_deception` (2017+) has **no published stabilization point and none computed
internally.** The honest label is *unknown*; rendering it with Stuff+'s visual confidence is the
folk-sabermetrics default. Its 2017 boundary is a **coverage** floor, not a stability floor — absent
and unstable need different UI treatments.

### 5.4 The Povich verdict — 149 pitches, 2 starts

| Question | Answer |
|---|---|
| 149 above a defensible Stuff+ reliability threshold? | **Yes, comfortably** — ~2.5–6× the estimated per-type α=0.7 point |
| The May→Aug 2.3-point move defensible? | **No.** SE of the difference 1.1–1.8 ⇒ 1.3–2.1 SE, before ≈0.5 of vintage bias (docs 05, 08) |
| Do the *displayed* arsenal cells clear it? | **FF 73 yes; SL 14 no; SI 12 no** |

**The aggregate passed the sample test and the claim still fails**, for reasons — bias and effect size
— no stabilization threshold addresses. Meanwhile the cells a user actually reads are 5× smaller than
the aggregate and two of three are unusable at any threshold: a gate on the season aggregate would have
shown all three green.

---

## 6. Descriptive reliability ≠ predictive validity

Reliability is a metric's correlation **with itself** (split-half, or year-over-year stickiness);
validity is its correlation with **something else, later**. Attenuation binds them:

```
ρ_observed(X, Y) ≤ √( r_XX · r_YY )
```

Judge's 2023 BP benchmark gives Stuff+ reliability .74, ERA reliability .13 ⇒ ceiling
`√(.74 × .13) ≈ .31`. His observed Stuff+ → next-year ERA is **.33 for all pitchers** — at the ceiling,
inside his reported bootstrap SD of .05–.07.

**The limiting factor on stuff-model predictiveness of ERA is ERA's own unreliability, not the model** —
a metric cannot out-predict the reliability of its target. So never grade a Triton metric against a
noisy target without stating that target's reliability; validate against reliable ones (K-BB%,
next-year Stuff+). This is also the honest defense of Stuff+ against "it doesn't predict ERA": correct,
and nothing could. The converse trap is Soto's — tjStuff+ r≈.85 and Stuff+ .74 are *stickiness*, and a
metric can be perfectly sticky and predict nothing. (estimated — established arithmetic, Judge's
inputs)

---

## 7. What Triton should do, in order

1. **Compute the split-half reliability curve for `stuff_plus` on Triton data**, per pitch type,
   odd/even split within outing, game-clustered n_eff. Every threshold in §5 is *estimated*; one script
   makes the flagship metric a number with a population string. Do this before encoding anything.
2. **Extend `MetricDef` with a `stabilizesAt` spec** — the registry is the display layer and this is a
   display problem:

```ts
export type StabilitySpec = {
  unit: 'pitches' | 'BF' | 'PA' | 'BIP'
  criterion: 'reliability' | 'precision'  // §4 — never mix them in one column
  threshold: number     // α value, or ± half-width on the metric's own scale
  n: number             // sample at which the criterion is met
  population: string    // 'MLB SP, per pitch_name, 2024-2026' — mandatory, §2.2
  biasFloor?: number    // n-independent error, e.g. stuff_plus vintage ≈ 0.5
  source: 'triton' | 'carleton' | 'driveline' | 'vendor'
  grade: 'computed' | 'established' | 'estimated' | 'unknown'
}
// MetricDef gains:  stabilizesAt?: StabilitySpec
```

   `grade: 'unknown'` must be representable — that is deception's honest value, and a field that cannot
   express ignorance will be filled with a guess.
3. **Gate the arsenal table on the `count` it already renders.** Three states keyed on
   `row.count / def.stabilizesAt.n`: ≥1 normal; ≥⅓ de-emphasized with the interval shown; <⅓
   **suppress the value and show the n instead**. Refusing to render is legitimate
   (`09-small-sample-communication.md`). **Cas owns the surface behavior**; Li owns the spec.
4. **Never gate on the aggregate when the display is per-slice.** The threshold applies to the
   denominator of the cell drawn — per pitch type, and per pitch type *within the active filter*.
5. **Ship the bias floor with the threshold, both in the tooltip.** "n = 149, above the ~40-pitch
   reliability point; ±1.4 total, of which ±0.5 does not shrink with sample" is the sentence that would
   have stopped the Povich reading. A threshold alone would have endorsed it.
6. **Convert every imported threshold to one convention before storing it** (§1, ×2.33), keeping the
   source's original threshold so the conversion is auditable.

**Anti-recommendation: do not adopt a single global minimum-sample gate — an `n >= 100` rule applied
platform-wide.** It is the obvious move, it is one line, and it is wrong in both directions at once:
far too strict for Stuff+ per pitch type (~25–60), suppressing defensible values and training users to
ignore the gate; far too lenient for reliever command (~270 against 330–1,050) and every outcome rate
on the dashboard (BABIP: 2,000 BIP), stamping "sufficient" on noise. Worse, it teaches the exact false
belief this doc exists to kill — that clearing a sample bar makes a number true — while doing nothing
about what actually broke the Povich comparison: an n-independent bias term and an effect size inside
its own interval. **A uniform gate converts a measurement problem into a green checkmark.** Per-metric
specs or nothing.

**Highest-leverage next action:** run item 1 — the split-half curve for `stuff_plus` by pitch type —
and log it to `docs/Queries.md`. Every other item waits on an *estimated* number one query would make
*computed*.

---

## Sources

1. [FanGraphs Library — Sample Size](https://library.fangraphs.com/principles/sample-size/) — the Carleton-lineage threshold table in §3.
2. [FanGraphs — Pemstein & Dolinar, "A New Way to Look at Sample Size" (2015)](https://blogs.fangraphs.com/a-new-way-to-look-at-sample-size/) — report the curve, not the crossing.
3. [Baseball Prospectus — Russell Carleton archive](https://www.baseballprospectus.com/author/russell-carleton/) — the KR-21 stabilization series behind the FanGraphs table.
4. [Baseball Prospectus — Judge, "An Updated Evaluation of Hitting and Pitching (Including Stuff) Metrics" (2023)](https://www.baseballprospectus.com/news/article/82426/prospectus-feature-an-updated-evaluation-of-hitting-and-pitching-including-stuff-metrics/) — the reliability/predictiveness table §6 uses.
5. [Driveline — "Sample Sizes at the Major League Level" (2018)](https://www.drivelinebaseball.com/2018/08/sample-sizes-major-league-pitch-level/) — pitch-level α≈0.50 figures, 7M+ pitches.
6. [Driveline — Asel, "Rethinking the True Run Value of a Pitch" (2021)](https://www.drivelinebaseball.com/2021/09/rethinking-the-true-run-value-of-a-pitch-with-a-pitch-model/) — per-pitch-type run-value stabilization at α=.7.
7. [Nestico — "Modelling tjStuff+ v3.0"](https://medium.com/@thomasjamesnestico/modelling-tjstuff-v3-0-10b48294c7fb) — the rolling ±0.5 *precision* criterion (§4).
8. [Salorio — "Introducing aStuff+ v2"](https://adamsalorio.substack.com/p/introducing-astuff-v2) — the ±0.25/±0.15/±0.05 bands; aLocation+ 330/540/1,050.
9. [FanGraphs — Rosen, "Introducing the Kirby Index" (2024)](https://blogs.fangraphs.com/introducing-the-kirby-index/) — a command proxy stabilizing in 1–2 appearances.
10. [Wikipedia — Classical test theory](https://en.wikipedia.org/wiki/Classical_test_theory) — X = T + E; the §1 reliability ratio.
11. [Wikipedia — Spearman–Brown prediction formula](https://en.wikipedia.org/wiki/Spearman%E2%80%93Brown_prediction_formula) — split-half length correction.
12. [Wikipedia — Cronbach's alpha](https://en.wikipedia.org/wiki/Cronbach%27s_alpha) — definition; tau-equivalence lower-bound caveat.
13. [Wikipedia — Kuder–Richardson formulas](https://en.wikipedia.org/wiki/Kuder%E2%80%93Richardson_formulas) — KR-21 for binary-trial rate stats.
14. [Wikipedia — Congeneric reliability (McDonald's ω)](https://en.wikipedia.org/wiki/Congeneric_reliability) — why α under-estimates.
15. [Wikipedia — Correction for attenuation](https://en.wikipedia.org/wiki/Correction_for_attenuation) — the ρ ≤ √(r_xx·r_yy) bound in §6.
16. [Wikipedia — Design effect](https://en.wikipedia.org/wiki/Design_effect) — n_eff and the ~2.3× SE inflation.
17. [Wikipedia — Regression toward the mean](https://en.wikipedia.org/wiki/Regression_toward_the_mean) — the r = n/(n+k) ↔ shrinkage identity.
18. [Revelle — `psych` package](https://personality-project.org/r/psych/) — α/ω/split-half implementation for §7 item 1.

**Triton-internal evidence (read 2026-08-11; no DB queries this pass):** `lib/metricRegistry.ts` — 69
`MetricDef` entries, fields `key/label/unit/format/color/totals/higherBetter/tip` (**no sample or
stabilization field**); `GROUP_COLUMNS['pitcher:arsenal']` renders `count` alongside
`stuffPlus`/`brinkPlus`/`clusterPlus`. Stuff+ formula, composite SD ≈ 6.0–6.5, the propagation table,
the ≈0.5 vintage-bias floor and the n_eff design effect from
`Li/metric-governance/05-baseline-normalization-design.md` §7. Povich figures and n = 149 from
`Li/metric-governance/08-cross-level-comparability.md` §5.1 — measured in a prior 2026-08-11 pass, as
were the August per-type counts FF 73 / SL 14 / SI 12; **not re-queried here.** Command/deception grain
from `Li/context/triton-context.md`.

**Cross-references:** `01-sampling-and-sample-size.md` (power and MDE — the prior question);
`03-regression-to-mean-shrinkage.md` (the `k/(n+k)` weight this doc's `k` feeds);
`09-small-sample-communication.md` (what the caveat says once a cell is ruled below threshold);
`Soto/algorithm-design/09-model-validation-stabilization.md` (cited throughout, extended in §4,
contradicted nowhere).
