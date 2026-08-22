---
title: Statistical Inference — Applied Playbook
domain: applied
tags:
  - statistical-inference
  - stabilization
  - shrinkage
  - leaderboards
  - multiplicity
  - weighting
  - change-detection
last_updated: 2026-08-22
---

# Statistical Inference — Applied Playbook

> Grades: **(established)** published and replicated · **(computed)** read at the cited Triton line,
> or arithmetic on figures verified elsewhere in this brain · **(estimated)** derived from theory
> with stated inputs · **(folk-sabermetrics)** repeated without provenance. No database was queried.
> Cas owns every pixel that carries a result (`Cas/analytics-ux/04-uncertainty-visualization.md`).

## TL;DR

- **No stabilization threshold, shrinkage constant, or multiplicity correction exists anywhere in the platform** — grep `stabiliz|shrink|bonferroni|benjamini|fdr|posterior` over `app/`, `lib/`, `components/`, `docs/VARIABLES.md` returns zero statistical hits — while `components/FilterEngine.tsx:212-224` lets any user cut an arbitrary date range with no `n` on screen. **(computed)**
- **M8 is one line and one call site.** `lib/metricRegistry.ts:664` is `sum / vals.length`; 48 of 69 `MetricDef` entries carry `totals: 'avg'`, seven of them rate stats, so a 20-PA September counts equally with a 600-PA season. The correct weight is already in the same row — `count` carries `totals: 'sum'` at `:105-111`. **(computed)**
- **Published thresholds cover outcome rates and do not cover Triton's in-house metrics.** Stuff+, Cmd+, Brink+, deception and unique have no reliability curve; quoting a "100 PA for BABIP"-style number at them is the archetypal **(folk-sabermetrics)** move. A threshold belongs to a population *and* an α: `n(α=0.7) = 2.33 × n(α=0.5)`. **(established)**
- **"Did X decline?" has no null.** `lib/trendAlerts.ts:126` divides a within-player change by a *between-player* SD and calls it `sigma`; `:96-103` compares the recent window against a season aggregate containing it, so an identical real change registers smaller in September than in April. **(computed)**
- **Regression to the mean is the default explanation for every alert on that list and is encoded nowhere** — except `SOS_REGRESSION_K = 60` (`app/api/update/route.ts:354`), correct leave-one-out empirical Bayes that adjusts nothing outside `sos_scores`. **(computed)**
- **Two of three leaderboards have no floor that binds**: `app/api/leaderboard-defence/route.ts:49-53` sorts and `LIMIT`s with no minimum sample, and `lib/leaderboardColumns.ts:481-497` loosens to 50 pitches to *"prevent empty leaderboards."* Shrink before ranking; do not correct p-values. **(computed / established)**
- **A population-dependent comparison is not a statistic.** `lib/enrichDerivedFields.ts:38-52` builds the `cluster`/`hdev`/`vdev` centroid from whatever `LIMIT 50000` returned (`app/api/player-data/route.ts:44`), so one pitch takes different values on a career fetch and a season fetch. **(computed)**
- **The denominator has been frozen since 2026-06-26, and no sample size fixes a stale reference population** — the error is bias: it cancels partly in differences, never in levels. **(established / computed)**

---

## NOW (0–6 weeks)

### 1. Weight the totals row — M8, one line, three surfaces

`lib/metricRegistry.ts:663-670` implements `case 'avg'` as `sum / vals.length`. Its only call site is
`components/dashboard/OverviewTab.tsx:202`, passing `activeRows` — per-season rows in traditional and
advanced mode, **per-pitch-type rows in arsenal mode**. So the "Career" line averages seasons
unweighted, and the arsenal total averages a 12-pitch cutter equally with a 1,200-pitch fastball.
Seven registry rates are affected: `ba` `:163`, `obp` `:170`, `slg` `:177`, `ops` `:184`, `whip`
`:191`, `era` `:199`, `kPct` `:209`. **(computed — `docs/reliability-findings-2026-08-11.md:704`)**

The fix needs no new query. Add `weightBy?: string` to `MetricDef` (`lib/metricRegistry.ts:17-26`)
and compute `Σ(vᵢ·wᵢ)/Σwᵢ` when set; the weight columns are already in `rows` — `pitcher:traditional`
carries `pa` and `ip`, `pitcher:advanced` `pitches` and `ip`, `pitcher:arsenal` `count` (`:582-589`).
Where numerator and denominator both exist — `era`, `whip`, `kPct` — recompute the pooled ratio
instead (`Li/statistical-inference/11-aggregation-bias-weighting.md` §4). **(established)**

**Stop condition:** a pitcher with a ≥400-PA season and a ≤30-PA season shows a career `ba` matching
`SUM(h)/SUM(ab)` to 3 decimals, and the arsenal `stuffPlus` total equals the `count`-weighted mean of
its rows — both as Vitest cases (`Cas/testing-data-systems/`).

### 2. Encode a stabilization threshold per metric — the core deliverable

Add to `MetricDef` (`lib/metricRegistry.ts:17-26`) a field carrying the *whole* claim, because a bare
integer is what turns a real threshold into folklore:

```ts
stabilizesAt?: { n: number; unit: 'pitch'|'bf'|'pa'|'ab'|'bip'|'fb'|'swing'|'bbe';
                 alpha: 0.5 | 0.7; population: string; grade: 'established'|'estimated'|'none' }
```

`population` is a string like `'MLB SP, 2015-2024, qualified'`. Without it the number transfers
silently across populations — per `Li/statistical-inference/02-reliability-stabilization.md` §2, the
commonest way a correct threshold becomes a wrong one.

| Registry key | Stabilizes in | Threshold @ r≈0.70 | Grade |
|---|---|---|---|
| `kPct` | batters faced | 70 BF | (established) |
| `bbPct` | batters faced | 170 BF | (established) |
| `ba` (opponent) | batters faced | 630 BF | (established) |
| `obp` (opponent) | batters faced | 540 BF | (established) |
| `slg` (opponent) | at-bats | 550 AB | (established) |
| `ops` | — | none published; ≥ max(OBP, SLG) | (estimated) |
| `gbPct`, `fbPct` | balls in play | 70 BIP (`ldPct` 650, HR/FB 400 FB) | (established) |
| `babip` | balls in play | 2,000 BIP — **exceeds a full season** | (established) |
| `era`, `whip` | — | **never at season scale**; ERA year-to-year reliability ≈ 0.13 | (established) |
| `whiffPct`, `swStrPct`, `zonePct`, `csPct` | pitches | 55–70 @ α=.50 ⇒ ≈128–163 @ α=.70 | (established / computed) |
| `stuffPlus` | pitches, **per pitch type** | ≈25–60 | (estimated) |
| `commandPlus`, `brinkPlus`, `clusterPlus` | pitches, per type | 330–1,050+, by analogy to published location models | (estimated) |
| `deceptionScore`, `uniqueScore` | unknown | **none exists — compute it (item 10)** | (folk-sabermetrics if quoted) |

Everything from `stuffPlus` down is **(estimated)** — Triton constructions with no published
reliability curve, and the 330–1,050 band is transferred from a different model's location metric.
And `ba` on a pitching dashboard is an *opponent* rate taking the 630-BF pitcher figure, not the
910-AB hitter figure: a 1.4× error if reversed.

**Stop condition:** all 69 `MetricDef` entries carry either a populated `stabilizesAt` or an explicit
`grade: 'none'`, with a Vitest case failing the build when a new entry omits both.

### 3. Make the threshold do something at the three gates

| Gate | Site | Change |
|---|---|---|
| Display | `lib/metricRegistry.ts:608` `formatMetric`, `:618` `getCellColor` | Below threshold: keep the value, drop the plus-stat colour ramp. Colour is the claim, not the digits. |
| Leaderboard | `lib/leaderboardColumns.ts:484-500` `defaultQualifier` | Floor per *sorted column* from its `stabilizesAt`, not one floor per view. |
| Report | `lib/reportQueryBuilder.ts:143-149` | `HAVING` appears only when a caller passes `minPitches > 0`; default it from the sort column. |

The unit mismatch is the point: `defaultQualifier` gates in **pitches** while users sort on `kPct`
(batters faced) and `whiffPct` (swings). **(estimated)**

### 4. Give the trend alert a real null

`lib/trendAlerts.ts` is the platform's only shipped "did it change?" claim and is wrong four
independent ways. **(computed)**

1. `:114-116` computes the SD of season values *across players*; `:126` divides a *within-player*
   change by it. Different variances — the quotient is not a z-statistic, and the 1.5 cut at `:127`
   carries no false-positive rate.
2. `:96-103` builds `season_*` over every row including the recent window; with recent ⊂ season the
   difference is attenuated by `(1 − f)`.
3. `:102-103` gates on 100 total and 30 recent **pitches**, while `xwoba` and `hard_hit` are
   batted-ball rates — 30 pitches is roughly 5 batted balls.
4. `:146` sorts by `|sigma|`, `:148` keeps 200, and `app/api/cron/briefs/route.ts:1316-1317` prints
   the top 5 each way. Sorting on an estimate selects on its error — the winner's curse — and
   `app/api/cron/briefs/route.ts:526` calls the result *"significantly"* deviating.

Fix in order: disjoint windows (`prior` = season minus recent); replace the denominator with
`SE(recent − prior)` from each player's own dispersion, clustered on **outings**; move each gate to
its own denominator using item 2's `unit`; shrink each delta before sorting (item 7). Then report a
false-discovery rate for the *printed set* — ~400 pitchers × 6 metrics is on the order of 240 expected
false "declines" per run at α=.05 — replacing the adjective at `:526` with *"5 rows shown; ~1 expected
by chance."* **Stop condition:** rerun with each player's recent window shuffled within player and the
false-positive rate lands within 2× of nominal. **(established)**

### 5. Put a binding floor on the three leaderboards

Every leaderboard is a max over hundreds of noisy estimates.
`Li/statistical-inference/05-multiple-comparisons-leaderboards.md` gives the scale: 453 players × 69
metrics ≈ 31,000 comparisons, whose top cell sits ≈4.0 SD out **under a pure null**. Extremeness is
the expected state of a #1 row, not evidence. **(computed / established)**

| Route | Floor today | Sorted quantity |
|---|---|---|
| `app/api/leaderboard-triton/route.ts:163` | `pitches >= 500` default, client-settable to 0 | per-pitch-type `*_plus` columns |
| `app/api/leaderboard-deception/route.ts:121` | same pattern, `minPitches = 500` at `:19` | `deception_score` |
| `app/api/leaderboard-defence/route.ts:49-53` | **none** | `outs_above_average` and 40+ others |

Cheapest first. (a) Floor `leaderboard-defence` on its own denominator — `tot_pa` and `outs_total`
are already in its allow-list at `:19`. (b) Make the floor **per sorted column** from item 2, since
both Triton routes filter on *total* pitches and sort on a *per-pitch-type* value. (c) Rank on the
shrunk estimate (item 7) while displaying the raw one. At the 5-IP qualification floor
(`scripts/create-refresh-league-averages.sql:394`) a small-sample pitcher is ~4× over-represented on
Whiff%, and two pitchers both displaying 40% carry posterior means of 39.0% and 29.9%. **(estimated)**

**On the cost in surprise.** Shrinkage moves the interesting name *down*; that is the objection.
Quantify it before arguing: publish once the median `n` of the rows that leave the top 10. If those
are mostly 60-pitch samples, the board was showing sampling error with a name attached; if not, `k`
is too strong. **(computed)**

---

## NEXT (6 weeks – 6 months)

### 6. Write down the "did X actually decline?" procedure, then implement it

This is the question the platform exists to answer and cannot currently answer defensibly. Four gates
in cost order, from `Li/statistical-inference/07-trend-detection-changepoints.md`; the cheapest kills
the most stories. **(established)**

| Gate | Kill condition |
|---|---|
| 1. Coverage | Was the metric *written* for both windows? A column that stopped being populated looks exactly like a decline. Escalate to Jo, do not model. |
| 2. Comparability | Same definition, baseline vintage, population? Within-2026 Stuff+ spans multiple `pitch_baselines` vintages worth ≈0.3–0.6 points. |
| 3. Magnitude vs noise | Two starts is **two clusters**, not 149 observations; design effect 2.5–3.9. Is the move bigger than the smallest this design could find? |
| 4. Corroboration | Did the inputs move coherently, or only the composite? |

Three things the procedure must state, because the current answer omits all three. **Window and null
are chosen before looking** — the honest null is "true talent is unchanged and the gap is sampling
error plus vintage bias," not "the two means are equal." **The player was selected because he looked
different**; that selection is part of the design, so the prior for the second window is the *shrunk*
first window, not the raw one, or the test conditions on the noise it is testing. **Regression to the
mean is the default explanation and must be said out loud** — with constant true talent a hot window
is *expected* to be followed by a worse one, and claiming a decline without first showing the move
exceeds what regression predicts is the commonest inferential error this platform will make.
**Stop condition:** a two-start question asked through the UI returns *"underpowered — no verdict"*,
with n, cluster count and minimum detectable effect attached. **(established)**

### 7. Estimate shrinkage constants instead of assuming them

The apparatus is one line: `shrunk = (n·x̄ + k·μ)/(n + k)`, `k = σ²_error/σ²_true`, and **`k` is the
stabilization point** — at `n = k` the observation gets weight 0.5. A reliability table is a shrinkage
table, so item 2 is a prerequisite, not a parallel effort;
`Li/statistical-inference/03-regression-to-mean-shrinkage.md` §11 proposes per-metric `k` and targets.

Two Triton-specific blockers. `μ` has no schema home for plus-stats: any metric ending `_plus` is
excluded from `league_averages` by convention — right for *benchmarking*, wrong for *shrinkage*, since
there is nothing to shrink toward. And `league_averages.stddev` is the SD of *observed* player means,
τ² plus mean sampling variance, so as a prior SD it under-shrinks; one subtraction fixes it
(`Li/statistical-inference/08-bayesian-hierarchical-estimation.md`). Both need the refresh chain
alive, and **Jo owns that fix** (`Jo/applied/postgres-performance-applied.md` item 1) — do not
estimate `k` from a table frozen since 2026-06-26. Generalize what exists:
`SOS_REGRESSION_K = 60` (`app/api/update/route.ts:354`, applied at `:414`) is leave-one-out empirical
Bayes done correctly; lift it into a helper taking `k` and `μ` as arguments. **(computed)**

### 8. Decide whether the payload-scoped derived fields are statistics at all

`lib/enrichDerivedFields.ts:38-52` accumulates a `(game_year, pitch_name)` centroid over `allRows` and
`:53-60` scores every pitch as a distance from it. `allRows` is whatever
`app/api/player-data/route.ts:44` returned under `ORDER BY game_date DESC LIMIT 50000`. So `cluster`,
`hdev` and `vdev` measure distance from *the mean of the rows currently loaded*: career and season
fetches give the same pitch different values. `lib/enrichData.ts:22-58` implements the same idea a
second time for reports, MiLB and Compete, and the two can disagree. **(computed)**

Li's ruling: **a comparison whose reference population is a side effect of a `LIMIT` is not a statistic
and must not be ranked, averaged, or compared across players.** It is a within-payload descriptive —
"how far is this pitch from the centre of what you are looking at" — and nothing more. Cas owns the
display consequence (`Cas/frontend-data-scale/03-client-vs-server-computation.md`); Li owns the fact
that the quantity has no fixed estimand. The fix is a fixed stored population per
`(pitch_name, game_year)` — the grain `pitch_baselines` already uses — computed server-side once;
failing that, drop the three fields from every cross-player surface. **Stop condition:** the same
pitch, fetched two ways, returns the same `cluster`. **(established)**

### 9. Decide, in writing, what to do about the frozen denominator

`league_averages` has been stale since 2026-06-26 and `league_percentiles` since 2026-06-03. Every
plus-stat, z-score and colour ramp computed since normalized against a population that stopped moving
while the league did not. The effect is **bias, not variance**: it does not shrink with n, does not
average out across players, and is common-mode within a rendering — so it partly cancels in
*differences* between two players benchmarked the same day and not at all in *levels*. **(computed)**

Li's call: **annotate, do not restate.** Recomputing history needs the inputs that produced each past
value, and `pitch_baselines` has no timestamp column and is destructively upserted, so a past Stuff+
cannot be reproduced from retained inputs — `Li/applied/temporal-modeling-applied.md` owns that
blocker, and a restatement that cannot be verified against the original is a second unversioned
vintage, not a correction. Instead: once Jo's fix lands, record the gap as a dated note in
`docs/VARIABLES.md` §7 and treat any cross-player comparison spanning 2026-06-26 as
level-incomparable, exactly as an MLB/MiLB comparison is. Leaderboards are the one exception worth
recomputing — they regenerate anyway. **(estimated)**

---

## LATER (6+ months)

### 10. Compute Triton's own stabilization curves

Every threshold in item 2 from `stuffPlus` down is transferred from another population or another
model. `pitches` holds ~8.88M rows across 2015–2026 — enough to measure the curves rather than import
them. Method: split-half within pitcher-season by **odd/even outing** (never odd/even pitch, which
leaks the within-outing correlation the design effect exists to capture), Spearman–Brown correct back
to full length, report `n(α=0.5)` and `n(α=0.7)` with the population string attached. **(established)**

Run it for `stuff_plus` per pitch type, `pitcher_season_command`'s raw metrics, and `deception_score`
/ `unique_score` (2017+ only — earlier seasons are a coverage fact, not a zero). Deception needs it
most: it is ranked at `app/api/leaderboard-deception/route.ts:121` and has **no reliability evidence
of any kind**. **Stop condition:** `stabilizesAt.grade === 'computed'` on `stuffPlus`, `commandPlus`
and `deceptionScore`.

### 11. State the reproducibility ceiling on every retrospective claim

`pitches` has no `created_at` or `updated_at`, so ingest time and late arrivals are unrecoverable and
Savant restates. Any claim of the form "as of date D, X had declined" is unverifiable against what
the table held on D — a hard ceiling on retrospective inference, and the reason item 7's `k` cannot be
validated on history until it lifts. `Li/applied/temporal-modeling-applied.md` owns the fix; this
playbook owns the consequence: **until it lands, no inference here may assert a state of knowledge at
a past date.** The same argument blocks hierarchical modelling: a fit over the un-versioned
`stuff_plus` column charges baseline drift to true talent. **(computed)**

---

## Standing Rules

1. **Every threshold carries its population and its α, or it is not a threshold** — `n(α=0.7) =
   2.33 × n(α=0.5)`, so an unlabelled integer can be wrong by 2.3× before anyone has erred. Grade the
   transferred numbers honestly: everything about Stuff+, command, brink, cluster, deception and
   unique is **(estimated)** until item 10 measures it, and a number quoted at a Triton metric with no
   derivation behind it is **(folk-sabermetrics)**, labelled so and never quietly promoted.
2. **The denominator is the metric's own, never the pitch count, and the honest unit is outings.**
   149 pitches is ~45 swings and ~25 batted balls, and effective n is bounded below by the cluster
   count — a two-start window has one degree of freedom for an outing-level effect.
3. **Shrink before you rank; never correct after.** The leaderboard problem is estimation, not
   testing. Rank the shrunk value, display the raw one — and never widen a gate to fill a page
   (`lib/leaderboardColumns.ts:481-497`). An empty leaderboard is a true statement about April.
   **(computed)**
4. **Bias and variance are not interchangeable, and this platform's binding constraint is bias.**
   Baseline vintage drift, the frozen denominator and the frozen park-factor vintage do not shrink
   with n. No sample size, shrinkage constant, or interval fixes any of them. Restatement is a
   governance decision, made once and written down: default to annotation.
5. **Stay inside the boundary.** Pipeline health and query performance are Jo's
   (`Jo/applied/data-reliability-applied.md`, `Jo/applied/postgres-performance-applied.md`); display,
   wording placement and tests are Cas's (`Cas/analytics-ux/`, `Cas/testing-data-systems/`). Li
   specifies the rule and the claim it licenses, and hands off by filename. Anything added to
   `lib/metricRegistry.ts` or `lib/sql.ts` updates `docs/VARIABLES.md` in the same commit — enforce
   that with a test, since `stuff_plus` appears zero times in that glossary today.

**Where this differs from the audit's "Suggested order"**
(`docs/reliability-findings-2026-08-11.md:728-742`). That list is entirely Jo's and correct as
written; its items 1–5 should land first where `league_averages` is involved. But it places M8
nowhere, and M8 is the cheapest correctness fix in the document — one line, one call site, a ~5–10%
error plausible enough to survive indefinitely. Do item 1 alongside Jo's items 1–5, not after. Items
2 and 4 need no refresh chain; items 7 and 9 must wait for it.

**Triton-internal evidence.** Every `(computed)` claim was read on 2026-08-22, repo at `6679363`, at
the `file:line` cited beside it in the item that makes it — principally
`lib/metricRegistry.ts:663-670` and `:17-26` with its 48 `totals: 'avg'` entries;
`lib/trendAlerts.ts:96-148`; the three leaderboard routes and `lib/leaderboardColumns.ts:481-497`;
`lib/enrichDerivedFields.ts:38-60` against `app/api/player-data/route.ts:44`; and
`app/api/update/route.ts:354`. Absence claims come from a grep over `app/`, `lib/`, `components/` and
`docs/VARIABLES.md` on 2026-08-22 returning zero statistical hits. Row counts and refresh-chain dates
come from the 2026-08-12 measurement pass, taken with planner statistics NULL on every table checked,
so they are approximate. M8 is `docs/reliability-findings-2026-08-11.md:704`. Published thresholds
are the Carleton-lineage r≈0.70 table and Driveline's α≈0.50 pitch-level figures as catalogued in
`Li/statistical-inference/02-reliability-stabilization.md` §3.
