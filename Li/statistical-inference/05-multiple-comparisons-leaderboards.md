---
title: Multiple Comparisons & Leaderboards — Everyone Looks Extreme If You Look at Everyone
domain: statistical-inference
tags:
  - multiple-comparisons
  - false-discovery-rate
  - winners-curse
  - post-selection-inference
  - leaderboards
  - shrinkage-ranking
  - rank-uncertainty
sources_reviewed: 21
last_updated: 2026-08-12
---

# Multiple Comparisons & Leaderboards

> Grades: **(established)** published/replicated; **(computed)** verified against Triton source at the
> cited line, read not queried; **(estimated)** from theory, assumptions stated.
>
> Cross-refs: `07-trend-detection-changepoints.md` §4 (multiplicity across *candidate changepoints*),
> `metric-governance/07-qualification-thresholds.md` §6.3, `03-regression-to-mean-shrinkage.md`,
> `04-uncertainty-quantification.md` §8.

## TL;DR

- **Three multiplicities — rows, columns, per-pitch-type cells — sit on every board and Triton counts none:** 453 × 69 ≈ **31,000 comparisons**, whose top cell sits ≈ **4.0 SD** out under a pure null — extremeness is the *expected* state of a #1 row. **(computed / established)**
- **A leaderboard is estimation in a test's clothes: the fix is shrinkage *before* ranking, not a p-value correction.** **(established)**
- **Full-season Stuff+ barely needs correcting:** SE ≈ 0.146 vs SD ≈ 3.0 → reliability ≈ 0.998. **(estimated)**
- **Both leaderboard routes filter on *total* pitch count and sort on a *per-pitch-type* column.** **(computed)**
- **The nightly Surges/Concerns mailer divides every delta by one cross-sectional constant and calls it `sigma`** — no null distribution behind its |σ| ≥ 1.5 cut. **(computed)**
- **The recent window is a *subset* of the season — `delta = (1 − f)(recent − prior)`, `SD(delta) = σ√((1−f)/(f·n))`:** a season inside it can never surge, and a 5× noise spread is divided by one constant. **(computed / estimated)**
- **The gate is 30 *pitches* while xwOBA's denominator is batted balls (≈ 5), and "most improved" double-dips regression to the mean:** ≈ **97%** of a Whiff% surge is noise. **(computed / estimated)**
- **No multiplicity control and no shrinkage exist in the repo** — grep `bonferroni|benjamini|fdr|shrink` over `lib/`, `app/`, `components/` returns nothing. **(computed)**

---

## 1. Three families, and only one ever gets counted

Multiplicity is about **how many things you looked at before choosing what to show**, not about a
test. Triton counts none of these families.

| Family (what varies) | Size on Triton |
|---|---|
| **Rows** — one metric, all pitchers | 453 MLB pitchers, Aug 2026 |
| **Columns** — one pitcher, all metrics | 69 `MetricDef` in `lib/metricRegistry.ts` |
| **Cells** — pitcher × metric × pitch type | ×4–6 per pitcher (Triton/deception) |
| **Windows** — 7 / 14 / 30 days / season | unbounded, user-chosen |
| **Filters** — `FilterEngine`, 50+ combinable fields | unbounded, leaves no trace |

Rows × columns alone is **453 × 69 = 31,257** — at α = .05, **1,563 expected "notable" cells with
nothing real present** (computed counts, estimated implication). The last two rows make correction
impossible in principle: Bonferroni needs *m*, and six windows × four filter sets tried before
screenshotting the best story leave an *m* nobody recorded — Gelman & Loken's forking paths.

### 1.1 The arithmetic

Bonferroni's per-test threshold is α/m; E[max of *m* standard normals] ≈
√(2 ln m) − (ln ln m + ln 4π)/(2√(2 ln m)).

| Family | *m* | E[max] under the null | Bonferroni \|z\| at α=.05 | False flags at α=.05 |
|---|---|---|---|---|
| One metric, all pitchers | 453 | **2.88** | 3.87 | 22.7 |
| 6 trend metrics × 453 pitchers | 2,718 | **3.40** | 4.28 | 136 |
| 69 registry metrics × 453 pitchers | 31,257 | **4.02** | 4.79 | **1,563** |

(estimated — closed-form extreme-value arithmetic, independence assumed; real families correlate,
cutting effective *m* but never to 1.)

Rank carries almost nothing; only the **margin over #2 relative to the SE of that difference** does.

---

## 2. The winner's curse, and why Stuff+ escapes it

Taking the maximum of noisy estimates selects on talent **and** luck, so the leader's value is biased
up by the luck that selected it — corrected by the reliability identity of
`03-regression-to-mean-shrinkage.md`:

```
r = σ²_talent / (σ²_talent + SE²)        E[true | observed x] = μ + r·(x − μ)
```

**Overstatement of the leader ≈ (1 − r)·(x − μ)** — the number deciding whether a board needs fixing.
It splits Triton's surfaces:

| Board | SE of one row | σ across rows | r | Leader at x−μ = +10 overstates by |
|---|---|---|---|---|
| Season Stuff+, qualified SP | 0.146 (`04` §4) | ≈ 3.0 | **0.998** | **0.02 pts — ignore** |
| Two-start Stuff+ window | 0.517 (`04` §4) | ≈ 3.0 | 0.971 | 0.3 pts — tolerable |
| 12-pitch pitch-type cell | ≈ 0.88 | ≈ 3.0 | 0.92 | 0.8 pts — mark the n |
| Whiff% over a 14-day window | ≈ 11.6 pts | ≈ 6.0 pts | **0.21** | **7.9 pts — mostly noise** |

(estimated — σ across rows assumed; SEs from `04` §5.2's σ_within ≈ 2.77 and a binomial SE on ~14
swings/30 pitches.)

Season Stuff+ is among Triton's most trustworthy displays: three densely sampled continuous inputs,
precise relative to how much pitchers differ. Damage concentrates in **short windows** and
**small-event-count rate metrics** — what is mailed to subscribers every morning (§4).

---

## 3. Which correction, and when correcting is the wrong move

| Method | Controls | At m ≈ 3×10⁴ | Use on Triton |
|---|---|---|---|
| **Bonferroni** α/m | FWER, any dependence | \|z\| ≥ 4.79 — empty board | Never for display; ok for a pre-registered claim |
| **Holm** step-down | FWER, uniformly more powerful | still empty | Drop-in if FWER required |
| **Benjamini–Hochberg** | FDR under independence/PRDS | usable list at q = 0.10 | **Right control for an alert scan** |
| **Benjamini–Yekutieli** | FDR under *any* dependence | log(m) ≈ 10× price | Only if correlation sign unknown |
| **Storey q-value** | FDR, estimates π₀ | more power if most nulls are false | Better than BH on mixed pools |
| **Knockoffs** | FDR with a controlled variable set | needs a model | Not for displays |
| **Hierarchical shrinkage** | *bias*, not error rate | no rows removed; order changes | **Right tool for a ranking** |

The real decision is **what question is on the screen**:

| Question on screen | Object | Right tool |
|---|---|---|
| "Who is best at X?" | ranking / estimation | Shrink, then rank; show rank intervals |
| "Flag anyone who changed" | a scan of tests | **BH at q = 0.10** + a pre-registered window |
| "Is this player above average?" | one interval per row | Credible interval vs the league prior (`04` §1.1) |
| "Did *this* pitcher change?" | one pre-specified test | No correction — m = 1, and say so |

Gelman, Hill & Yajima carry the load: a multilevel model **partially pooling** the 453 estimates
toward the league mean handles multiplicity by making each less extreme, not by adjusting a p-value
nobody displays. The ingredient exists — `league_averages`, 1,806 rows of mean, `stddev`,
`n_qualified` per (season, level, role, metric) — and no leaderboard reads it.

**A subtlety.** Shrunken estimates minimise individual squared error but **under-disperse the
ensemble**, so ranking them ≠ estimating ranks (Louis 1984): rank-optimised estimates or a
rank interval for "the top 10", the posterior mean for "how good is this guy."

---

## 4. The "most improved" trap, on the live implementation

`lib/trendAlerts.ts` powers `/api/trends`, the `/trends` page, the daily `render-trends` graphic and
— via `app/api/cron/briefs/route.ts:1281` — the **Surges / Concerns block mailed to subscribers every
morning** as *"performance deviating significantly from their season average"* (`:526`), the
platform's highest-distribution statistical claim. Five defects, all in source.
**(computed unless noted.)**

### 4.1 `sigma` is not a standard error of anything

```ts
// lib/trendAlerts.ts:108-117 — one constant per metric, for every player
stddevs[m.key] = Math.sqrt(variance) || 1          // :116
const sigma = delta / stddevs[m.key]               // :126
if (Math.abs(sigma) < 1.5) continue                // :127
```

`stddevs[m.key]` is the **cross-sectional SD of season values across players**; `delta` is a
**within-player change**. Their ratio is in units of between-player dispersion — not a test
statistic, no null distribution, so the 1.5 cut is styling. Read as a z, p = 0.134 two-sided →
**≈ 363 expected false alerts** across 453 pitchers × 6 metrics with nothing real happening. Two
smaller traps: a population divisor on the variance (`:115`), and the `|| 1` fallback (`:116`, with
the `< 3` branch at `:113`) switching `sigma` to **raw metric units** — a 300 rpm spin delta would
rank first, forever.

### 4.2 The windows overlap, so the delta is attenuated — unevenly

`season_*` aggregates the season; `recent_*` is a `FILTER (WHERE game_date >= recent)` over the **same
rows** (`:89-97`). With *f* = the recent share of season pitches, `season = f·recent + (1−f)·prior`:

```
delta = recent − season = (1 − f)·(recent − prior)
SD(delta) = σ·√((1 − f) / (f·n))
```

**Signal scales by (1 − f)** — at *f* = 1 delta is zero: a September call-up with the best two weeks
in baseball cannot surge. **Noise scales by √((1−f)/f):** over the gate's range (*f* ≈ 0.12 for
a workhorse starter, ≈ 0.8 for one back from three months out), **√(7.33/0.25) ≈ 5.4×** — all
divided by one constant. (estimated — *f* range from the gate at
`:102-103`; the identity is exact.)

### 4.3 The gate counts pitches; denominators count something else

```sql
HAVING COUNT(*) >= ${mp}                                             -- :102, mp >= 100
   AND COUNT(*) FILTER (WHERE game_date >= '${recentDate}') >= 30    -- :103
```

Thirty pitches is one relief outing. In each metric's own event count
(`01-sampling-and-sample-size.md`'s central rule):

| Metric (`:11-18`) | Denominator | Events in 30 pitches | SE of the recent value |
|---|---|---|---|
| Avg Velo | pitches | 30 | ≈ 0.5 mph |
| Whiff% | swings | ≈ 14 | **≈ 11.6 pts** |
| K% | plate appearances | ≈ 7 | ≈ 17 pts |
| Zone% | pitches with a zone | ≈ 30 | ≈ 9 pts |
| **xwOBA** | **batted balls** | **≈ 5** | **≈ 0.14** |
| Avg Spin | pitches with spin | ≈ 30 | ≈ 35 rpm |

(estimated — standard swing/BIP rates; the gate is computed.) One gate, six different amounts of
information: a five-batted-ball xwOBA "surge" competes with a velocity delta measured on 30.

### 4.4 The two sides of the subtraction are different estimators

`seasonSQL` and `recentSQL` are written independently and disagree for Whiff% (`:13`, again `:26`):
the season numerator counts `swinging_pitchout`, the recent does not; the season denominator matches
`hit_into_play%` by `LIKE`, the recent `= 'hit_into_play'` plus a redundant `foul_tip`. Small,
but **fixed in sign** and inside `delta` — gate 2 of `07-trend-detection-changepoints.md` failing
**inside one number**.

### 4.5 Selecting on a difference double-dips regression to the mean

The list sorts by |sigma| desc (`:146`), truncates at 200 (`:148`), and the mailer takes the **top 5
per sentiment** (`:1316-1317`). A big positive delta is disproportionately a player
whose *earlier* period ran unluckily low **and** whose recent one ran high, so both halves regress.
Reliability of the improvement:

```
r_Δ = Var(true Δ) / (Var(true Δ) + SE²_recent)
```

At the 30-pitch gate with SE_recent ≈ 11.6 Whiff% points and a true-change SD of 2 points,
**r_Δ ≈ 0.03 — 97% of the ranked quantity is noise**; at SD 4, 0.06. (estimated.) Falsifiable
prediction: **this month's top-10 improvers should show ≈ zero or negative improvement next month** —
one query settles the feature's value.

---

## 5. The cell-grain defect: minimum n on the row, sort on the cell

Both routes pivot `pitcher_season_command` / `pitcher_season_deception` into one flat row per pitcher
with **per-pitch-type columns** (`ff_cmd_plus`, `sl_brink_plus`, `ch_deception`, …) at
`leaderboard-triton/route.ts:114-125`, while the row's `pitches` sums **across all pitch types**
(`:101`). The filter reads that sum:

```ts
rows = rows.filter(r => r.pitches >= safeMinPitches)   // :162 (default 500, :27)
rows.sort((a, b) => ...a[safeSort]...)                 // :164-173, safeSort may be 'ch_cmd_plus'
```

**Filter and estimand have different denominators:** 500 four-seams and 12 changeups clears the
500-pitch qualifier, then ranks the changeup-command board on 12. `leaderboard-deception/route.ts:120`
is identical, and the per-pitch-type `pitches` the fix needs is already selected in both queries — and
summed away.

Two knock-ons: this is `metric-governance/07` §6.3's two-stage selection with the stages **measuring
different things** (qualify on volume, rank on a thin slice), worse than qualifying and ranking
on the same noise; and thin cells in the population normalising `cmd_plus` inflate the reference σ,
**compressing every plus value toward 100** — the direction §5 there identifies for a loosened
threshold. (estimated; the code is computed.)

`lib/leaderboardColumns.ts:484-500` gets the *row-grain* rule right: `defaultQualifier` prorates 500
pitches / 200 PA by season fraction — on 2026-08-12 (day 224, fraction 0.731) **365 pitches / 146 PA**.
The concept exists; it never reached the cell.

---

## 6. Ranks are noisier than the values behind them

A rank depends on *every* other row, so its uncertainty tracks how crowded the neighbourhood is.
With N = 453 and cross-sectional SD 3.0 Stuff+ points, density is `N·φ(z)/σ` players per point, and an
interval of half-width *h* covers `h × density` places.

| Position | Density (players/pt) | Season SE 0.146 → 95% rank swing | Two-start SE 0.517 → swing |
|---|---|---|---|
| League average (z = 0) | 60.2 | **±17 places** | **±61 places** |
| z = +1 | 36.5 | ±10 | ±37 |
| z = +2 | 8.2 | ±2 | ±8 |
| z = +3 (the top) | 0.7 | ±0.2 | ±0.7 |

(estimated — normal cross-section; SEs from `04` §4.)

**Ranks are most stable where the board is read (the top), least stable in the middle.**
"He's 140th, up from 210th" says nothing: at league average, 70 places is barely one season SE.
Report **value with an interval** mid-board, keep rank language for the tails, or ship simultaneous
rank confidence sets (Mogstad et al.): "who could plausibly be top 10" as a *set*.

---

## 7. What you may say after you have looked

Post-selection inference: **an interval computed on a value chosen for being extreme is not a 95%
interval** (`04` §8, row 3). Four routes, cheapest first.

| Route | Costs | Buys | Fit for Triton |
|---|---|---|---|
| **Sample splitting** (Cox 1975) | half the data | fully valid, no theory | **Best default** — select on the first half, quote the second half |
| **Shrinkage / Tweedie** (Efron 2011) | a prior or EB fit | de-biased value, no rows lost | Right for displays; `league_averages` is the prior |
| **Conditional selective inference** (Lee 2016; Fithian 2014) | selection as a constraint | exact conditional intervals | Only if selection is programmatic |
| **Simultaneous / PoSI** (Berk 2013) | wide intervals | valid whatever you selected | When the path is unknowable — `FilterEngine` |

Li's rule: **a claim must record whether window and metric were chosen before or after the
result was seen** (`07` §1.4 demands the same of corroborating evidence). Provenance of the *analysis
path* is a governance artifact like baseline vintage, equally unrecorded.

---

## 8. What Triton should do, in order

1. **Fix the cell-grain filter in both leaderboard routes** (`leaderboard-triton/route.ts:162`,
   `leaderboard-deception/route.ts:120`): when the sort key is a per-pitch-type column, filter on that
   pitch type's own `pitches`, not the row sum. The value is already in the query — one line each, and
   the only unambiguous bug here.
2. **Rebuild `computeTrendAlerts`'s `sigma`** as `delta / SE(delta)` with
   `SE(delta) = σ_metric·√((1−f)/(f·n_events))` per player, and gate on **the metric's own event
   count** (≥ 25 swings for Whiff%, ≥ 20 batted balls for xwOBA, ≥ 30 PA for K%/BB%), not 30 pitches.
3. **Apply BH at q = 0.10** to the surviving alert family; print family size and discovery count in
   the newsletter caption. `07` §4 prescribes the same for changepoint scans; the one place a formal
   correction fits.
4. **Backtest the surge list before improving it:** correlate month *t* top-10 improvement with month
   *t+1*. If ≈ 0, §4.5 is settled empirically and the feature needs rebuilding around shrunken deltas,
   not tuning.
5. **Shrink before ranking on every short-window board:** `r = n/(n+k)` from
   `02-reliability-stabilization.md`, prior from `league_averages`; store `r` beside the value so both
   raw and regressed show.
6. **Add `minEvents` and `eventDenominator` to `MetricDef`**, so "30 pitches" can never again mean five
   batted balls and every board inherits its floor from the registry.
7. **Record the analysis path** — window, filter set, sort key — beside any exported or published
   number, so §7's before/after question is answerable.

**Anti-recommendation: do not apply a Bonferroni or BH correction to the leaderboards themselves and
bold only the survivors.** The move this doc seems to argue for is wrong three ways. **(i) Category
error.** A leaderboard reports estimates, not tests; no p-value is on screen to adjust, and the
implied null — "true Stuff+ is exactly 100" — is false for every row, so controlling its error rate
optimises nothing. **(ii) It cannot change the answer.** Monotone corrections
preserve the ordering, so the same low-n hot hand stays #1 at the same overstated value; at
m ≈ 31,257, Bonferroni's |z| ≥ 4.79 just empties the board, reproducing `07`'s unactioned-alert
failure mode. **(iii) m is not knowable.** `FilterEngine`'s 50+ combinable fields and
unrecorded window choices leave the searched family unbounded — and Bonferroni needs *m* as an input.
Shrinkage needs no *m*, fixes the reported **value** rather than a never-displayed error rate, and
reorders the board so the 12-changeup cell stops beating the 900-changeup one.

**Highest-leverage next action:** rewrite `computeTrendAlerts` (items 2 + 3, one PR) — per-player
standardised delta, event-count gate, BH at q = 0.10 — the only surface here that leaves the building,
going to subscribers every morning under the word *significantly*.

---

## Sources

1. [Multiple comparisons](https://en.wikipedia.org/wiki/Multiple_comparisons_problem) / [FWER](https://en.wikipedia.org/wiki/Family-wise_error_rate) — §1, §3.
2. [False discovery rate](https://en.wikipedia.org/wiki/False_discovery_rate) / [Holm–Bonferroni](https://en.wikipedia.org/wiki/Holm%E2%80%93Bonferroni_method) — §3's step-down row.
3. Benjamini & Hochberg (1995), [*JRSS-B* 57(1)](https://doi.org/10.1111/j.2517-6161.1995.tb02031.x) — BH; §3, item 3.
4. Benjamini & Yekutieli (2001), [*Ann. Statist.* 29(4)](https://doi.org/10.1214/aos/1013699998) — FDR under any dependence; log(m) price.
5. Storey (2002), [*JRSS-B* 64(3)](https://doi.org/10.1111/1467-9868.00346) — q-values, π₀.
6. Barber & Candès (2015), [*Ann. Statist.* 43(5)](https://doi.org/10.1214/15-AOS1337) — knockoffs; §3.
7. Gelman, Hill & Yajima (2012), [*J. Res. Educ. Eff.* 5(2)](https://doi.org/10.1080/19345747.2011.618213) — partial pooling over p-value adjustment; §3.
8. Efron & Morris (1975), [*JASA* 70(350)](https://doi.org/10.1080/01621459.1975.10479864) — Stein shrinkage; §2.
9. Louis (1984), [*JASA* 79(386)](https://doi.org/10.1080/01621459.1984.10478062) — ranking shrunken estimates ≠ estimating ranks; §3.
10. Efron (2011), [*JASA* 106(496)](https://doi.org/10.1198/jasa.2011.tm11181) — Tweedie; §7.
11. Goldstein & Spiegelhalter (1996), [*JRSS-A* 159(3)](https://doi.org/10.2307/2983325) — league tables; §6.
12. Hall & Miller (2009), [*Ann. Statist.* 37(6B)](https://doi.org/10.1214/09-AOS699) — bootstrap rank authority; §6.
13. Mogstad, Romano, Shaikh & Wilhelm, [arXiv:1810.02243](https://arxiv.org/abs/1810.02243) — rank confidence sets; §6.
14. Berk, Brown, Buja, Zhang & Zhao (2013), [*Ann. Statist.* 41(2)](https://doi.org/10.1214/12-AOS1077) — PoSI; §7.
15. Lee, Sun, Sun & Taylor (2016), [*Ann. Statist.* 44(3)](https://doi.org/10.1214/15-AOS1371) — conditional selective inference; §7.
16. Fithian, Sun & Taylor, [arXiv:1410.2597](https://arxiv.org/abs/1410.2597) — selective-inference framework; §7.
17. Cox (1975), [*Biometrika* 62(2)](https://doi.org/10.1093/biomet/62.2.441) — data splitting; §7.
18. Gelman & Loken, [*Garden of forking paths*](https://www.stat.columbia.edu/~gelman/research/unpublished/forking.pdf) — §1; multiplicity without p-hacking intent.
19. [Winner's curse](https://en.wikipedia.org/wiki/Winner%27s_curse) / [Extreme value theory](https://en.wikipedia.org/wiki/Extreme_value_theory) — §1.1's E[max].
20. [FanGraphs — Regression toward the mean](https://library.fangraphs.com/principles/regression/) — §2, §4.5.
21. [Baseball Savant — Custom Leaderboard](https://baseballsavant.mlb.com/leaderboard/custom) — user-set minimum; §5.

**Triton-internal evidence (read 2026-08-12; no database queries run).** Every `file:line` cited above
was read in source that day; family sizes (453 MLB pitchers in Aug 2026; **69** `MetricDef` in
`lib/metricRegistry.ts` → 31,257 cells) from the central measurement packet, 2026-08-12. Not
cited inline: `league_averages` also carries `leader_value` and `qual_floor` across its 1,806 rows,
unread by any leaderboard route; `lib/trendAlerts.ts:20-27` (6 hitter metrics beside the 6 pitcher
metrics at `:11-18`), `:16` (xwOBA on batted balls), `:87` (`mp = max(minPitches, 100)`);
`app/api/cron/briefs/route.ts:1281-1283` (minPitches 50 before May, 200 after);
`app/api/leaderboard-deception/route.ts:19` (500-pitch default, as `leaderboard-triton/route.ts:27`).
SEs from `04` §4 (0.146 season, 0.517 two-start) and §5.2 (σ_within ≈ 2.77); grep of `lib/`, `app/`,
`components/` for `bonferroni|benjamini|false discovery|fdr|shrink|p-value` → **zero** genuine
matches.
