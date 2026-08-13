---
title: Small-Sample Communication — Saying an Unstable Number Out Loud Without Lying
domain: statistical-inference
tags:
  - small-samples
  - suppression-rules
  - uncertainty-communication
  - hedging
  - verbal-probability
  - trend-alerts
  - winners-curse
  - estimand
sources_reviewed: 21
last_updated: 2026-08-12
---

# Small-Sample Communication — Saying an Unstable Number Out Loud Without Lying

> Grades: **(established)** published/replicated; **(computed)** read at the cited Triton line;
> **(estimated)** arithmetic from stated assumptions; **(folk-sabermetrics)** repeated, unsupported.
>
> **Boundary with Cas.** Li owns what the instability *is*, what claim a number can bear, and the
> defensible wording; Cas owns every pixel carrying it — glyphs, de-emphasis, null-vs-zero, tooltips,
> the small-sample affordance: `Cas/analytics-ux/01-honest-data-presentation.md`,
> `04-uncertainty-visualization.md`, `09-comparative-display-benchmarks.md`. Handoff is by filename, not
> component. Resumes where `04-uncertainty-quantification.md` §8 stops — *when an interval misleads more
> than none* — and asks: **then what do you print?**

## TL;DR

- **Three outputs per number — value, denominator, licensed claim; Triton ships the first, the second on one screen, the third never.** (computed)
- **Suppression is not a sample-size decision: Povich clears every n threshold by 2.5–6× and his May→August move stays unsayable.** (computed / estimated)
- **Honest small-sample communication is usually a change of estimand, not a caveat** — census, not talent claim. (established)
- **NCHS fixed the rule *shape*: a compound test — minimum denominator, absolute CI width, relative CI width — not one threshold.** (established)
- **Hedging barely costs credibility — numeric ranges moved trust ~0.1 on a 7-point scale (n≈5,780) — but a vague hedge is no hedge: "small sample" spans multi-fold ranges.** (established / folk-sabermetrics)
- **Triton's only public statistical claim uses "significantly" for a quantity with no standard error** — `briefs/route.ts:526`. (computed)
- **The trend-alert `sigma` divides by a between-player SD, not the SE of the change, and `recent_pitches` is computed, filtered on, then dropped before display.** (computed / estimated)
- **Triton's one real gate loosens exactly when instability peaks, to *"prevent empty leaderboards."*** (computed)
- **Refusing to print is itself a claim — a blank cell reads as *not measured*, and two states cannot carry three facts — while `FormatSpec` stays blind to n.** (established / computed)

---

## 1. Three outputs, and the claim ladder

| Output | Question | Triton today |
|---|---|---|
| **Value** | what is the number | always shown |
| **Denominator** | over what, how many | one surface (`PercentileTab.tsx:420`) — the *pool's* n |
| **Licensed claim** | what may be said with it | never stated |

The third is what this doc governs — not a caveat bolted on but a property of the
**estimand**. Two sentences, same data:

- *"Over these 149 pitches he averaged 104."* — a **census**: the population *is* the 149 pitches,
  sampling error zero, true at any n.
- *"His four-seam is a 104."* — a **talent** claim: needs reliability, an interval, a population.

**The cheapest honest move is swapping the second sentence for the first** — no UI, nothing lost.

### 1.1 The ladder

| Regime (per *displayed* cell) | Licensed | Forbidden |
|---|---|---|
| Outside coverage (deception pre-2017, `stuff_plus` NULL) | "not measured" | any value, **including 0** |
| n > 0, below reliability | descriptive: "his 12 sliders averaged 96" | ranking, percentile, "his slider is" |
| Above reliability, below the effect's MDE | level **with** interval; "consistent with average" | "improved", "declined", peer ordering |
| Above the MDE | direction + magnitude + interval | causal attribution |
| **Any n, across a baseline-vintage seam** | nothing comparative | every within-season change claim |

No sample size reaches the last row: hence §2's compound rule.

---

## 2. The suppression rule — five independent grounds, none of them "n"

Public health has published rates over tiny denominators for fifty years and converged on a **compound**
rule: NCHS needs a minimum denominator *and* a Korn–Graubard CI narrow absolutely *and* narrow relative
to the estimate; Healthy People adds RSE > 30%. The lesson is the shape, not the constants: **one
threshold cannot express the distinct ways a number becomes unpublishable** — what
`02-reliability-stabilization.md`'s anti-recommendation kills.

| # | Ground | Test | Output when it fires |
|---|---|---|---|
| 1 | **Not measured** | row absent / NULL by coverage | explicit "not measured" — never blank, never 0 |
| 2 | **Below reliability** | n < `stabilizesAt.n` for the *cell's* denominator | value suppressed, **n in its place** |
| 3 | **Imprecise** | CI half-width > a set fraction of between-player SD | de-emphasised, interval mandatory |
| 4 | **Bias-dominated** | bias floor ≥ sampling SE (season Stuff+ ≈0.5 vs ±0.30) | value kept, **comparison** suppressed |
| 5 | **Post-selection** | row chosen for being extreme | shrink to the league prior |

Two grounds suppress the value, one the comparison, one the number itself: `n >= 100` gets three wrong.

**Not statistical disclosure control.** Census-style suppression protects identity at small counts; this
protects the *claim* — same mechanic, unrelated justification, only the second negotiable.

---

## 3. Hedging that still informs

### 3.1 Dead hedges and live replacements

| Dead hedge | Why it fails | Live replacement |
|---|---|---|
| "small sample size" | reader-dependent by multiples; implies no action | "12 sliders — enough to describe, not rank" |
| "grain of salt" | offloads quantification onto the reader | "±6.6 points; league spread is ~12" |
| "trending up" | direction, no magnitude, no noise scale | "+2.3; this window detects ≈3.0" |
| "significantly", no test | asserts a procedure never run | "recent 14 days vs. season; no test run" |
| `n = 1,806` | right number, wrong subject | name the denominator's subject |
| `.327` on 14 batted balls | precision theatre; digits imply an interval | round to the interval, not `FormatSpec` |

### 3.2 The verbal-probability trap

Three findings, fifty years apart: verbal probability terms carry **wide, individually stable,
mutually incompatible** numeric meanings (Wallsten 1986); readers regress extreme terms toward the
middle, so "very likely" lands weaker than intended; **a numeric range beside the word collapses the
spread** (Budescu 2009). Kent's 1964 CIA fix was the same — a lexicon binding each phrase to a
number. **A hedge without a number is not a weaker claim but an unspecified one**, resolved toward
what the reader already believed. (established)

IPCC's two axes are right — *confidence in the evidence* vs. *likelihood of the quantity*.
Triton's translation: **"how well measured" (coverage, vintage, n) vs. "how big" (effect vs. MDE)**, the
pair the Povich reading conflated.

### 3.3 Li's template

> **⟨metric⟩ ⟨value⟩ over ⟨n⟩ ⟨unit⟩ / ⟨G⟩ outings. ⟨Reliability verdict⟩. ⟨Interval or refusal⟩.
> ⟨Bias floor, if any⟩. ⟨The one claim this supports.⟩**

Worked: *"Four-seam Stuff+ 104 over 73 pitches / 2 starts. Above the ~40-pitch reliability point; ±6.6
at 1 df, too wide to rank; vintage bias ≈0.5 does not shrink with sample. Supports only that he threw
these 73 pitches at 104."* No clause is "small sample size."

---

## 4. "But hedging destroys credibility"

Across five experiments (n ≈ 5,780), **numeric** uncertainty ranges moved perceived trustworthiness
~0.1 on a 7-point scale; **verbal** hedges ("estimated at", "roughly") did more damage — the opposite of
the intuition Triton designs around. **Numbers reassure, weasel words corrode.**
(established)

Two corollaries: **prefer a number to a word every time**, newsletter included; and **"our users are
pros" is not a licence** — they cannot recover *this* cell's n from a screen that never sent it, and
where n is invisible experts anchor on the point estimate too.

---

## 5. Triton's small-sample surfaces, audited

| Surface | Shows | Missing | Ground (§2) | Verdict |
|---|---|---|---|---|
| Arsenal table (`GROUP_COLUMNS['pitcher:arsenal']`) | value **and** `count` | any use of it; Povich SL 14, SI 12 render like FF 73 | 2 | on screen, unread |
| `PercentileTab.tsx:420` | `n={pool.n_qualified}` | the **player's** n | 2 | right idea, wrong subject |
| Newsletter Surges/Concerns | season + recent value | n, window, sigma, any test | 2, 3, 5 | §6 — worst case |
| `defaultQualifier` (`leaderboardColumns.ts:486`) | `minPitches` × season fraction | — | 2 | **inverted** — loosens when noisiest |
| `useTrendsData.ts:110` | `minPitches` 50 pre-May, else 500 | rationale | 2 | ditto |
| Season Stuff+ anywhere | value | the vintage seam | 4 | comparison unblocked |
| `FormatSpec` (`metricRegistry.ts:341`) | fixed digits per metric | n-awareness | 3 | precision theatre at low n |

**Every gate here is an emptiness control, not an honesty control** — `leaderboardColumns.ts:482` says
so: thresholds drop early in the season to "prevent empty leaderboards." The fix is a third display
state (§8), not a lower bar. And **the denominators already exist** — `count`, `recent_pitches`,
`stuff_plus_n`, `n_qualified`, `stddev`, cited below — a plumbing gap, not a measurement gap.

---

## 6. The trend-alert engine — an unstable number that publishes itself

`lib/trendAlerts.ts` compares a player's last 14 days against his season to date on six metrics and
feeds the daily newsletter — Triton's only surface that turns a number into an **editorial claim**.

**Mechanism.** Qualify on ≥100 season and ≥30 recent pitches (`:87, 102`); `delta = recent − season`;
divide by the **SD of season values across players**, alert at `|sigma| ≥ 1.5`, sort desc, keep 200
(`:113-128, 156-158`); the brief takes the top 5 each way (`briefs/route.ts:1315-1316`).

**Defect.** That denominator is *between-player* spread, not the SE of the change: read as "how
surprising given noise", it measures "how unusual against player-to-player variation". The missing factor
is the window's own n.

**Consequence.** Whiff% (p ≈ 0.25): 14 days ≈ 2–3 starts, ~175 pitches, ~80 swings → SE ≈
√(0.25·0.75/80) ≈ **4.8 pp** against a between-player SD ≈ 5 pp, so alerts fire at delta ≥ 7.5 pp ≈
**1.56 SE** — ~12% per-cell daily false alarms under a pure-noise null. Over ~400 qualified pitchers ×
6 metrics ≈ 2,400 cells: ~290 noise alerts/day, and the published five are the **max of 2,400 draws**,
expected |sigma| ≈ 3.4 with nothing real happening. Winner's curse, on a mailing list. *(estimated: SDs
assumed, arithmetic exact.)*

One threshold also spans metrics with very different noise-to-spread ratios. Velocity, same window:
per-pitch SD ≈ 2.8 mph, deff ≈ 3, n_eff ≈ 58 → SE ≈ 0.37 mph against a between-player SD ≈ 2.2 mph,
null `sigma` SD ≈ 0.17, never crossing 1.5. **The list is sorted by which metric is noisiest, not by
news**: velo and spin, the mechanically meaningful changes, are excluded; Whiff%/K%/Hard-Hit% dominate.
*(estimated)*

**And it ships without its denominator.** `recent_pitches` is selected and filtered on (`:94, 102`) but
absent from `TrendAlertRow` (`:28-39`), so it cannot reach the email, which renders Player | Metric |
Season | Recent (`:1332-1340`) under the footnote *"deviates **significantly** from their season
average"* (`briefs/route.ts:526`). **That word does work no computation supports.** (computed)

**The fix needs no rebuild:** §9 items 1–3 plus shrinkage before selection
(`03-regression-to-mean-shrinkage.md`); "most changed" honestly describes a ranking, all this is.
Multiplicity belongs to `05-multiple-comparisons-leaderboards.md`.

---

## 7. Povich — above every threshold, still unsayable

| Question | Answer |
|---|---|
| n | 149 pitches, 2 starts |
| Above the estimated Stuff+ reliability point (~25–60/type) | **yes, 2.5–6×** |
| Effective n after clustering | deff 2–4 → n_eff **37–75** |
| Detectable difference at this n | MDE ≈ **2.5–3.5** points |
| Observed move | **2.3** points |
| Verdict | the sample could not detect the move it appears to show |

Two starts is **two clusters**: the honest denominator is 2, not 149. Add ≈0.5 points of vintage bias
across the 2026-08-11 rescore seam and the comparison fails on grounds 3, 4 *and* 5 of §2.

**"n is big enough" and "this claim is supported" are different tests, and only the first is easy** — a
platform gating on stabilization alone stamps this green. Defensible instead:

> *"Four-seam Stuff+ 104.2 over 73 pitches in 2 starts. Above the reliability point for a level; below
> the precision needed for a change. The 2.3-point difference vs. May is inside this window's detectable
> range (≈3), and May and August were scored against different baseline vintages (≈0.5 points,
> unrecorded). **The release-height drop of 0.18 ft is independent evidence** — Stuff+ has no
> release-position term — and it, not the Stuff+ delta, is what merits a look."*

Longer than "Stuff+ down 2.3," and the only version that survives being wrong: it names what would
change the conclusion. Hedging that informs points at the *next measurement*, not the reader's
patience.

---

## 8. When refusal is the wrong answer

| Refusal failure | Why it lies too | Fix |
|---|---|---|
| Blank cell | reads as *not measured* — a coverage claim about a value you have | print n in its place |
| Two states (show / hide) | three facts — absent, unstable, solid — will not fit two | three states on `n / stabilizesAt.n` |
| Global gate | too strict for Stuff+ (~40), too lax for BABIP (2,000 BIP) | per-metric spec |
| Gating the aggregate, displaying per-slice | protects nothing a user reads | gate the drawn cell's n |
| Suppressing the *level* at small n | the census statement was always valid | suppress the **comparison** |
| Empty leaderboard in April | drives removal of the gate entirely | n-first ordering, de-emphasis |

The last row is political: **a gate that empties the screen gets deleted** (§5, twice already).
Make the small-sample state *interesting* — n, interval, how much more is needed — and it survives
April. **Cas owns making that state legible** (`Cas/analytics-ux/04-uncertainty-visualization.md`); Li
owns which state a cell is in.

---

## 9. What Triton should do, in order

1. **Delete "significantly" from `briefs/route.ts:526`** for "the largest recent changes" — one string,
   and the only unbacked significance claim on the platform.
2. **Put `recent_pitches` on `TrendAlertRow` and render it** — four lines to carry a number already
   computed and trusted enough to filter on.
3. **Re-denominate the alert `sigma`** on SE(delta) from the recent window's own n, not the
   cross-sectional SD (§6): same threshold, defensible scale, velo/spin visible again.
4. **Write the claim ladder (§1.1) into `docs/VARIABLES.md`** beside the `stuff_plus` entry it still
   lacks, so licensed claims stop living in reviewers' heads.
5. **Implement the compound rule (§2), not a threshold** — reuse `MetricDef.stabilizesAt` and its bias
   floor from `02-reliability-stabilization.md`; ground 4 fires at every n, which no n-based rule
   expresses.
6. **Make significant digits n-aware** — cap by interval width, not the fixed per-metric `FormatSpec`
   (`metricRegistry.ts:341`).
7. **Ship denominators everywhere before any interval** (`04-uncertainty-quantification.md` §9): a
   denominator is unambiguous, an interval omitting vintage bias is not.

**Anti-recommendation: do not add a boilerplate "small sample size" disclaimer to short-window views.**
The obvious, cheap, virtuous move, wrong on three grounds. (a) **It does not inform**: the
phrase has no shared numeric meaning, so each reader resolves it toward the conclusion they already
held, where a numeric range moves interpretation. (b) **It is a verbal hedge** — the language measurably
worse for trust than the number it replaces: full credibility cost, none of the information. (c) **It attaches to the wrong cases**: Povich is *above* every sample threshold, so it
misses him, while a season Stuff+ comparison — the most bias-exposed claim on the platform — carries a
large n and is certified clean. A disclaimer keyed on n sees neither failure that matters, and makes the
screen feel audited. **Boilerplate hedging buys the look of rigour at the price of
the real thing.**

**Highest-leverage next action:** items 1–3 in one PR against `lib/trendAlerts.ts` and
`app/api/cron/briefs/route.ts` — the one place a Triton number becomes a public claim, today with an
unbacked significance word, no denominator, and a noise-selecting scale.

---

## Sources

1. Parker et al. (2017), [*NCHS Data Presentation Standards for Proportions*](https://pubmed.ncbi.nlm.nih.gov/30248016/) — §2's compound rule.
2. Klein et al. (2002), [*Healthy People 2010 Criteria for Data Suppression*](https://pubmed.ncbi.nlm.nih.gov/12117004/) — the RSE > 30% convention.
3. [Statistical disclosure control](https://en.wikipedia.org/wiki/Statistical_disclosure_control) — §2's confidentiality vs. reliability.
4. IPCC, [*Guidance Note on Consistent Treatment of Uncertainties*](https://www.ipcc.ch/site/assets/uploads/2017/08/AR5_Uncertainty_Guidance_Note.pdf) — §3.2's two axes.
5. Wallsten et al. (1986), [*Measuring the vague meanings of probability terms*](https://doi.org/10.1037/0096-3445.115.4.348) — §3.2's incompatible meanings.
6. Budescu, Broomell & Por (2009), [*Improving Communication of Uncertainty in the Reports of the IPCC*](https://doi.org/10.1111/j.1467-9280.2009.02284.x) — a printed range collapses spread.
7. Kent (1964), [*Words of Estimative Probability*](https://www.cia.gov/resources/csi/studies-in-intelligence/archives/vol-8-no-4/words-of-estimative-probability/) — §3.2's phrase-to-number lexicon.
8. van der Bles et al. (2020), [*The effects of communicating uncertainty on public trust in facts and numbers*](https://doi.org/10.1073/pnas.1913678117) — §4's five experiments.
9. van der Bles et al. (2019), [*Communicating uncertainty about facts, numbers and science*](https://doi.org/10.1098/rsos.181870) — *what* vs. *how* it is said.
10. Spiegelhalter (2017), [*Risk and Uncertainty Communication*](https://doi.org/10.1146/annurev-statistics-010814-020148) — §3's numbers-over-words rule.
11. Fischhoff & Davis (2014), [*Communicating scientific uncertainty*](https://doi.org/10.1073/pnas.1317504111) — hedge to the reader's decision.
12. Gelman & Carlin (2014), [*Beyond Power Calculations: Type S and Type M Errors*](https://doi.org/10.1177/1745691614551642) — §7's exaggeration near the MDE.
13. Ioannidis (2008), [*Why Most Discovered True Associations Are Inflated*](https://doi.org/10.1097/EDE.0b013e31818131e7) — §6's winner's curse.
14. [Winner's curse](https://en.wikipedia.org/wiki/Winner%27s_curse) — the max-of-many-draws arithmetic in §6.
15. Amrhein, Greenland & McShane (2019), [*Scientists rise up against statistical significance*](https://doi.org/10.1038/d41586-019-00857-9) — §9 item 1.
16. Wasserstein & Lazar (2016), [*The ASA Statement on p-Values*](https://doi.org/10.1080/00031305.2016.1154108) — a threshold crossing is not a claim.
17. Wasserstein, Schirm & Lazar (2019), [*Moving to a World Beyond "p < 0.05"*](https://doi.org/10.1080/00031305.2019.1583913) — §3.3's standard.
18. Hoekstra et al. (2014), [*Robust misinterpretation of confidence intervals*](https://doi.org/10.3758/s13423-013-0572-3) — experts misread intervals too (§4).
19. Manski (2015), [*Communicating Uncertainty in Official Economic Statistics*](https://doi.org/10.1257/jel.53.3.631) — the pull to error-free point estimates.
20. Broad et al. (2007), [*Misinterpretations of the "Cone of Uncertainty"*](https://doi.org/10.1175/BAMS-88-5-651) — an uncertainty display read backwards (§9).
21. [FanGraphs Library — Sample Size](https://library.fangraphs.com/principles/sample-size/) and the [Carleton stabilization series](https://www.baseballprospectus.com/author/russell-carleton/) — §7's baseball-side thresholds.

**Triton-internal evidence (read 2026-08-12; no DB queries this pass).** `lib/trendAlerts.ts`: `:66`
`minPitches = 100`, `:87` floored at 100, `:94` `recent_pitches` counted, `:102` `HAVING … >=
30`, `:113-121` `stddevs[m.key]` = population SD of **season values across players**, `:127`
`sigma = delta / stddevs[m.key]`, `:128` cutoff 1.5, `:156-158` sort desc, slice 200; `TrendAlertRow`
`:28-39` has **no n field** — `recent_pitches` / `total_pitches` selected, filtered on, discarded.
`app/api/cron/briefs/route.ts`: `:1282` `minPitches` 50 pre-May else 200 (floored to 100),
`:1315-1316` top-5 by `|sigma|`, `:1332-1340` renders Player | Metric | Season | Recent,
`:526` the "significantly" footnote. `lib/leaderboardColumns.ts:482` *"prevent empty leaderboards"*,
`:486-500` `defaultQualifier` scales `minPitches` by season fraction, floor 50.
`lib/hooks/useTrendsData.ts:110, 136` `minPitches` 50 (month ≤ 4) else 500.
`components/dashboard/PercentileTab.tsx:420` `n={pool.n_qualified}`, the only sample size displayed
anywhere. `lib/metricRegistry.ts:17-26` `MetricDef` (69 entries, no sample field), `:341` xwOBA
`{type:'dec',digits:3}` regardless of n. Unused denominators: `count` in
`GROUP_COLUMNS['pitcher:arsenal']`, `stuff_plus_n` (`scripts/create-materialized-views.sql:105, 323`),
`n_qualified` and `stddev` (`scripts/create-league-averages.sql:22, 38`; 1,806 rows). Povich figures from
`01-sampling-and-sample-size.md`, `02-reliability-stabilization.md` §5.4 and
`07-trend-detection-changepoints.md`, measured 2026-08-11; vintage bias ≈0.5 and the full-season ±0.30
interval from `04-uncertainty-quantification.md` §5.3/§7.1. That rescore covered ≈249k rows,
`league_averages` had been stale 46 days, wRC+ was restated 5–6 points on 2026-05-08 — three
restatements no displayed number records.
