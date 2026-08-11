---
title: Baseline & Normalization Design — Choosing the Denominator
domain: metric-governance
tags:
  - normalization
  - z-score
  - plus-stats
  - baselines
  - rebaselining
  - vintage-drift
  - percentiles
  - reference-population
sources_reviewed: 22
last_updated: 2026-08-11
---

# Baseline & Normalization Design — Choosing the Denominator

## TL;DR

- **A normalized metric stacks two claims — a measurement and a reference population — and only the first is in the column.** `stuff_plus = 118` means nothing until you name the pitch type, season, level, grain, and baseline vintage. Triton stores none of those. **(established)**
- **Triton's Stuff+ composite has a pitch-to-pitch SD near 6, not 10, and the [0,200] clamp is a thin-cell alarm rather than a truncation problem.** √(4.5²+3.5²+2.0²) = √36.5 ≈ 6.04 under independence, realistically 6.5–7.5 with velo/extension correlation — so "+10 Stuff+" is ~1.5 SD, and binding the clamp would take ±100 ≈ 16 SD. It fires only on a cell with collapsed σ, and **the scoring join sets no floor on `pitch_count`.** **(estimated)**
- **`stuff_plus` centers on 100 only over the full-season, pitch-weighted, all-cells population**, so a month, role, team, or pitcher has no claim on 100. And **plus-stats do not average linearly**: a pitcher's Stuff+ is a mix-weighted mean of within-pitch-type z-scores, so he can improve every pitch and drop the aggregate by throwing more of the weaker one. **(established)**
- **Within-season vintage drift is a ±0.3–0.6-point bias no sample size removes, and the σ half is worse than the μ half.** A 0.3 mph April-to-date vs. full-season gap in `avg_velo` against the repo's `std_velo = 2.84` is 0.106 z × 4.5 = 0.48 points, identically signed for every April four-seam. An April-to-date σ is also *smaller*, so April Stuff+ is stretched, not merely shifted — and a scale change does not cancel in a paired difference. **(estimated)**
- **The 2026-08-11 repair fixed comparability inside June–August and built a structural break at the seam.** Feb–May keep ~100 expanding vintages; Jun–Aug share one. A changepoint detector on 2026 `stuff_plus` will find June 1, and it will be an artifact. **(computed — from the repair's own scope)**
- **Baseline-estimation error is common-mode and never averages away:** √(Σwᵢ²/Nᵢ + Σwᵢ²zᵢ²/2Nᵢ) — ~0.02 for a 10⁵-pitch cell, ~0.5 at N = 500, |z| = 2 — and it **grows with |z|**, so elite pitches carry the most baseline-induced uncertainty. **(estimated)**
- **`league_averages` is documented as 50th-percentile and implemented as an unweighted mean.** `docs/VARIABLES.md` L302/L442 say "50th-percentile"; `scripts/create-refresh-league-averages.sql` computes `AVG(...)`/`STDDEV_SAMP(...)` over qualified players, with no `percentile_cont` in the file. Mean ≠ median for skewed rates; mean-of-ratios ≠ ratio-of-sums. **(computed)**
- **Two incompatible σ grains share one namespace, and the stale one is 46 days old.** `pitch_baselines.std_*` is pitch-level; `league_averages.stddev` is player-level and far smaller, so an identical-looking formula on the second lands on a different scale — while every benchmark today pairs an August numerator with a late-June denominator. **(computed)**

---

## 1. What a baseline must pin down

A six-field contract. Leave one implicit and the number means something different next month.

| Field | Question | Triton Stuff+ |
|---|---|---|
| **Population** | Whose distribution is average? | All MLB pitches with non-null velo/movement/extension in the `(pitch_name, game_year)` cell |
| **Grain** | Pitch, player-season, team? | **Pitch** — the field most often misread |
| **Statistic** | Mean, median, ratio-of-sums? | Arithmetic mean + `STDDEV`, unweighted over pitches |
| **Qualification** | Who is in? | Everyone — no IP or cell-size floor |
| **Vintage** | *When* was it computed? | **Unrecorded** — whatever `pitch_baselines` held that night |
| **Scale** | z, index-100, percentile? | Index-100 weighted z-composite, clamped [0,200], rounded |

Vintage is the row Triton is missing, and it is what makes a column non-comparable while every value stays individually defensible (`02-metric-versioning-reproducibility.md`).

---

## 2. Three normalization families, three failure modes

| Family | Form | Preserves | Fails when |
|---|---|---|---|
| **z-score** | (x−μ)/σ | Distance in SD; averages cleanly *within a cell* | σ unstable (thin cells), skew, μ/σ drift |
| **Index-100** | 100 + k·z **or** 100·(x/μ) | Readability, fixed reference | The two forms are different metrics |
| **Percentile** | rank/n | Monotone-invariant; immune to scale drift | Membership changes, ties, discretization (60 qualified SPs ⇒ 1 rank = 1.7 pts), tail instability |

wRC+/ERA+/OPS+ are **ratios**: 150 means "50% better," asymmetric, non-linear under averaging. Stuff+ is `100 + Σwᵢzᵢ`, an **interval** scale where 150 would mean "8+ composite SD above average," which does not occur. Not interchangeable — and `docs/VARIABLES.md` should record which family each `_plus` metric belongs to. Percentile rank is invariant to any monotone rescoring, including a baseline refresh, *provided the reference population is fixed*, making `league_percentiles` more robust to the vintage problem than `stuff_plus` itself (`statistical-inference/10-benchmarking-percentiles.md`).

---

## 3. Choosing the reference population

| Axis | Triton's choice | Assessment |
|---|---|---|
| **Season** | Same year, expanding | Worst for comparability, best for "relative to today's league" |
| **Level** | Separate MLB/MiLB tables | Right separation, missing translation (`08-cross-level-comparability.md`) |
| **Role** | Pooled (Stuff+); SP/RP split (`league_averages`) | Inconsistent — RP velo exceeds SP velo, so pooling flatters relievers |
| **Qualification** | All pitches; qualified players for `league_averages` | Correct — qualifying a *pitch-level* baseline induces survivorship bias |
| **Bucket key** | `pitch_name` | The reclassification hazard (§4.3) |
| **σ grain** | Pitch- and player-level, both unlabeled | Fix in naming |

**Compute a baseline on the population you want to describe, a leaderboard on the population you want to rank.** Qualifying a baseline drags μ upward, which makes everyone look worse against it (`07-qualification-thresholds.md`).

---

## 4. Triton's Stuff+, dissected

`applyStuffPlusForDateRange` in `app/api/update/route.ts`, one statement per game date:

```sql
UPDATE pitches p
SET stuff_plus = GREATEST(0, LEAST(200, ROUND(
  100
  + COALESCE((p.release_speed - b.avg_velo) / NULLIF(b.std_velo, 0), 0) * 4.5
  + COALESCE((SQRT(POWER(p.pfx_x*12,2) + POWER(p.pfx_z*12,2)) - b.avg_movement)
             / NULLIF(b.std_movement, 0), 0) * 3.5
  + COALESCE((p.release_extension - b.avg_ext) / NULLIF(b.std_ext, 0), 0) * 2.0
)::numeric))
FROM pitch_baselines b
WHERE p.pitch_name = b.pitch_name
  AND p.game_year  = b.game_year
  AND p.game_date  = '<day>'
  AND p.release_speed IS NOT NULL
```

**4.1 The weights are unexplained and unvalidated.** 4.5 / 3.5 / 2.0 appear in three places — this SQL, the MiLB scorer, and `computeStuffRV` in `lib/leagueStats.ts` — with no derivation, no fit to run value, no sensitivity analysis in the repo. They are a prior, not an estimate. Whether they *should* be run-value coefficients is Soto's (`Soto/algorithm-design/01-stuff-models.md`); Li's point is that **they are part of the definition and are not versioned.**

**4.2 `COALESCE(..., 0)` imputes league-average, not missing.** The join requires `release_speed IS NOT NULL` but not `pfx_x`, `pfx_z`, or `release_extension`, so a pitch with untracked movement gets a contribution of exactly 0 — it is *asserted* average. That inflates density at 100 and biases poorly-tracked subgroups toward the mean (`Jo/data-quality/07-null-semantics-missingness.md`).

**4.3 `pitch_name` keying makes Savant reclassification a silent rebaselining event.** When Savant relabels a Slider as a Sweeper — retroactively, in bulk — those pitches move to a cell with different μ and σ. The pitch did not change; the number did; nothing records it. `pitch_type` or a movement cluster keys more stably (`temporal-modeling/09-retroactive-restatement.md`).

**4.4 Movement magnitude discards direction.** `√((pfx_x·12)² + (pfx_z·12)²)` treats 18" of arm-side run and 18" of drop as one input, but IVB and horizontal run carry opposite run-value signs on a four-seamer. The term measures distance from zero, not goodness — two identical Stuff+ values can be a plus riding fastball and a flat two-seam.

**4.5 No minimum cell size, so the clamp guards the wrong thing.** `pitch_baselines` carries `pitch_count`; the scoring join ignores it. Forty Screwballs give an unstable `std_velo` — a 3 mph deviation against σ = 0.6 is z = 5, or +22.5 points from velo alone. Fix: `AND b.pitch_count >= 500`, excluded pitches getting NULL and a reason code, not 100. **(estimated — arithmetic from the formula and repo σ values)**

**4.6 A third, undiscussed vintage.** `lib/leagueStats.ts` hardcodes `BL_BY_YEAR`, a frozen in-source copy of per-year baselines (`'4-Seam Fastball': { avg_velo: 93.13, std_velo: 2.84, … }`) used by `computeStuffRV()` as a client fallback. Client-computed and DB-stored Stuff+ diverge whenever the live baseline moves off that snapshot, and the UI never says which.

---

## 5. Fixed vs. rolling vs. expanding

| Scheme | Within season | Across seasons | As-of reproducible | Cost |
|---|---|---|---|---|
| **Expanding (Triton today)** | **No** | No | No | Grows all season |
| **Fixed, prior-season final** | **Yes** | Yes — drift stays visible | **Yes** | One rebuild/year |
| **Fixed, same-season final** | Yes | Yes | Once frozen | One full rescore |
| **Rolling window (30d)** | No — measures relative-to-recent | No | Only if versioned | Continuous |
| **Multi-year pooled** | Yes | Yes, era signal smoothed | Yes | Cheap |

Expanding baselines are the default because they are the easiest thing to write and the worst choice for a column anyone compares over time. Rebasing a price index is a *documented, dated, published* event for exactly this reason (BLS).

**Li's recommendation: fixed prior-season-final in-season, plus an optional versioned same-season rescore at close.** Immutable in-season, so the column is comparable April–October; **no lookahead**, so as-of queries become answerable (`temporal-modeling/01-as-of-correctness.md`); and 100 shifts from "average this year" to "average last year" — a feature, since a league-wide velocity gain then shows up as the mean drifting above 100 rather than normalized into invisibility.

---

## 6. The vintage problem, quantified

`refreshPitchBaselines` recomputes each `(pitch_name, game_year)` cell as a **full-season-to-date aggregate** and upserts in place, so each night's pitches are scored against whatever the cell held that night: ~180 vintages per season, with no record of which scored which row. The ~0.5-point mean bias is small against a ~6-point pitch-to-pitch SD but large against a pitcher's season-mean SE — exactly where within-season comparisons live.

| 2026 window | Vintage state | Comparability |
|---|---|---|
| Feb–May | ~100 expanding vintages | Poor, smoothly degrading |
| Jun–Aug | One vintage (2026-08-11 repair) | **Good** |
| Across the seam | Two regimes | **Broken — a step, not a trend** |

The repair improved most of the season and sharpened the artifact at the boundary (`statistical-inference/07-trend-detection-changepoints.md`). The minimum fix is small:

```sql
ALTER TABLE pitch_baselines ADD COLUMN IF NOT EXISTS computed_at timestamptz DEFAULT now();
ALTER TABLE pitch_baselines ADD COLUMN IF NOT EXISTS baseline_version int;
ALTER TABLE pitches        ADD COLUMN IF NOT EXISTS stuff_plus_baseline_version int;
CREATE INDEX IF NOT EXISTS pitches_stuff_baseline_ver_idx
  ON pitches (stuff_plus_baseline_version) WHERE stuff_plus IS NOT NULL;
```

plus `SET stuff_plus_baseline_version = b.baseline_version` in the scoring UPDATE. One integer turns "is this column comparable?" from unanswerable into a `GROUP BY`. The 2026 backfill is cheap: `1` for `game_date < '2026-06-01'` (*unknown, expanding*), `2` for the repaired window. Pair it with a nightly rollup of monthly `count(*)`/`avg(stuff_plus)`/`stddev_samp(stuff_plus)` by `pitch_name` — written to a table, not run ad-hoc against the loaded DB. Monthly SD falling from April onward is the stretch effect, not a story about pitchers.

---

## 7. Normalization × sample size: error through a z-composite

For `Ŝ = 100 + Σᵢ wᵢ (xᵢ − μ̂ᵢ)/σ̂ᵢ`, the variance of a pitcher's mean over n pitches splits into four terms with **different denominators**.

| Term | Expression | Shrinks with pitcher's n? | 4-seam, N≈10⁵ | Thin cell, N=500, \|z\|=2 |
|---|---|---|---|---|
| **A. Pitch-to-pitch** | (Σwᵢ² + 2Σᵢ<ⱼwᵢwⱼρᵢⱼ)/n_eff | Yes | SD ≈ 6.0 ⇒ 0.13 at n = 2000 | same |
| **B. Baseline mean error** | Σ wᵢ²/Nᵢ | **No** — common-mode | 0.019 | 0.27 |
| **C. Baseline σ error** | Σ wᵢ² zᵢ²/(2Nᵢ) | **No** | ~0.02 | 0.38 |
| **D. Vintage** | bias, not variance | **No** | ≈0.5 | ≈0.5 |

**(estimated — closed-form delta-method propagation)**

**B and C are irreducible:** every pitch in a cell shares the same μ̂ and σ̂ error, so "he's up 0.4 Stuff+" is not rescued by 3,000 pitches. **C grows with |z|**, so elite arms carry the most baseline-induced uncertainty — the opposite of intuition. **Use n_eff, not n:** pitches within a game share weather and fatigue, so n_eff ≈ n/(1 + (m−1)ρ); at m = 90, ρ = 0.05 the honest SE is 2.3× the naive one. Report game-clustered SEs, never `stddev/√n_pitches`.

Working rule: **a within-season Stuff+ delta under ~1.5 points for a starter is not defensible today** — measure it rather than assume it. On stabilization proper (tjStuff+/aStuff+ settle within ~78–116 pitches) cross-reference `Soto/algorithm-design/09-model-validation-stabilization.md`: fast stabilization of the *pitcher-level signal* is compatible with an irreducible *baseline-level* error floor.

---

## 8. Why plus-stats do not average linearly

**Mix dependence.** A pitcher's displayed Stuff+ is `AVG(stuff_plus)` — a mix-weighted mean of z-scores computed *within* pitch type. Improve the four-seam by 3 and the slider by 3, shift 15% of usage from four-seam (115) to slider (95), and the aggregate falls. Nothing got worse (`statistical-inference/11-aggregation-bias-weighting.md`).

**Ratio-form plus-stats are non-linear by construction.** Where a plus-stat is `100·x/μ`, the average of the ratios is not the ratio of the averages (Jensen). Team wRC+ is a *recomputation* from aggregated components, never a mean of player wRC+ — and `computeWRCPlus()` in `lib/sql.ts` runs at query time, so this constrains every team rollup live.

**100 is the mean of exactly one population.** μ = 100 holds over the full-season, pitch-weighted, all-cells set — *if* the scored set equals the baseline set, which it does not (§4.2, §6). Hence the UI rule Li specifies and Cas builds: **never label a plus-stat "vs. league average" without naming the population.**

---

## 9. Population boundaries: cross-level and `league_averages`

**Cross-level.** `milb_pitch_baselines` is a different population scored by a different code path (`app/api/update/milb/route.ts` uses a whole-range UPDATE, not the per-day loop). A 100 in Triple-A and a 100 in MLB are the same sentence about very different populations, and no translation factor exists — so a shared axis is a category error, fixed by hard visual separation (`08-cross-level-comparability.md`).

**Documented ≠ implemented.** `docs/VARIABLES.md` L302 ("50th-percentile values per qualified player"), L442, and CLAUDE.md describe a median. `scripts/create-refresh-league-averages.sql` computes `AVG(metric)` with `STDDEV_SAMP(metric)` over qualified players and contains no `percentile_cont`. **Mean vs. median:** for right-skewed rates (barrel%, HR/FB, max velo) the mean sits above the median, so heatmap centers and above/below coloring are wrong in a known direction. **Mean-of-ratios vs. ratio-of-sums:** `AVG(k_pct)` weights a 60-inning reliever equally with a 200-inning starter — legitimate as "the average qualified pitcher," but **not the league rate**. Fix the docs or the aggregate; **changing the aggregate is itself a rebaselining event** (`11-metric-deprecation-migration.md`).

**Two σ grains, one namespace** (TL;DR): pitch-level in `pitch_baselines`, player-level in `league_averages`, nothing distinguishing them in schema or glossary. Likewise the **`_plus` exclusion**: right in intent, but keyed on name suffix, so a plus-stat named without it leaks in and a raw metric ending in `_plus` is wrongly dropped — and it deletes the one artifact that makes vintage drift visible, which belongs in a `metric_diagnostics` table if not here.

---

## 10. What Triton should do, in order

1. **Add `baseline_version` to `pitch_baselines` and `pitches`, stamped in the scoring UPDATE.** Until it exists, no within-season Stuff+ comparison is defensible.
2. **Add `AND b.pitch_count >= 500` to both scoring joins**; excluded pitches get NULL and a reason, not 100.
3. **Switch to a fixed prior-season-final baseline in-season** (§5) — immutable, no lookahead, drift visible instead of normalized away.
4. **Reconcile `league_averages`: mean or median, pick one, docs and SQL agreeing in the same commit.** Label the σ grain (`stddev_player` vs `stddev_pitch`) wherever both appear.
5. **Record mean/SD/n of `stuff_plus` per (season, level, role)** in a `metric_diagnostics` row exempt from the suffix rule — the drift alarm.
6. **Propagate NULLs instead of coalescing to zero**, with a component-coverage flag, and **publish per-pitch-type Stuff+ as primary** with the aggregate derived and the mix stated (§8).
7. **Delete or version-stamp `BL_BY_YEAR` in `lib/leagueStats.ts`** — two scorers with independently drifting baselines writing one column name is an undocumented metric change by definition.
8. **Write the population string into `docs/VARIABLES.md` for every `_plus` metric** — family, population, grain, qualification, vintage policy. §1's table is the template.

**Anti-recommendation: do not rescore the full 2026 season against a final baseline right now.** Without `baseline_version` first, a rescore destroys the only remaining evidence of the mixture — the Feb–May/Jun–Aug discontinuity is *diagnosable* today and afterward is simply gone, along with the ability to reproduce any number published this season. The season is also not over (an August rescore is vintage #3; October brings #4), and it would be a lookahead rebaselining — April pitches scored with August information — making the column *look* consistent while making every as-of query wrong. Version first, freeze the scheme second, rescore once at season close under a new version. **A consistent-looking column with untracked provenance is worse than an inconsistent one that admits it.**

**Highest-leverage next action:** ship the `baseline_version` columns and the `pitch_count >= 500` guard in one migration, with the `docs/VARIABLES.md` entry for `stuff_plus` — absent today — in the same commit.

---

## Sources

1. FanGraphs — [wRC+](https://library.fangraphs.com/offense/wrc/) — ratio-form index-100, recomputed not averaged.
2. FanGraphs — [Stuff+/Location+/Pitching+](https://library.fangraphs.com/pitching/stuff-location-and-pitching/) — public stuff models, scale conventions.
3. FanGraphs — [ERA-, FIP-, xFIP-](https://library.fangraphs.com/pitching/era-fip-xfip/) — minus-scale variants, adjustment order.
4. FanGraphs — [Park Factors](https://library.fangraphs.com/principles/park-factors/) — regression and sample.
5. FanGraphs — [Sample Size](https://library.fangraphs.com/principles/sample-size/) — outcome-stat stabilization.
6. FanGraphs — [Seasonal Constants](https://www.fangraphs.com/guts.aspx) — published, dated constants.
7. Baseball-Reference — [Batting Glossary](https://www.baseball-reference.com/about/bat_glossary.shtml) — OPS+ normalization.
8. Baseball-Reference — [Pitching Glossary](https://www.baseball-reference.com/about/pitch_glossary.shtml) — ERA+ as ratio index.
9. Baseball Prospectus — [Glossary](https://www.baseballprospectus.com/glossary/) — DRA, MLE translation.
10. Baseball Savant — [Percentile Rankings](https://baseballsavant.mlb.com/leaderboard/percentile-rankings) — percentiles, stated population.
11. Baseball Savant — [Statcast CSV docs](https://baseballsavant.mlb.com/csv-docs) — `pfx_x`/`pfx_z`, `pitch_name` vs `pitch_type`.
12. MLB — [Pitch Types](https://www.mlb.com/glossary/pitch-types) — the `pitch_name` vocabulary's instability.
13. Tom Tango — [Inside The Book](http://tangotiger.com/index.php) — the mean-of-ratios trap.
14. TJStats — [tjStuff+](https://www.tjstats.com/) — documented stabilization figures.
15. Wikipedia — [Standard score](https://en.wikipedia.org/wiki/Standard_score) — z-scores with estimated μ/σ.
16. Wikipedia — [Propagation of uncertainty](https://en.wikipedia.org/wiki/Propagation_of_uncertainty) — the §7 decomposition.
17. Wikipedia — [Jensen's inequality](https://en.wikipedia.org/wiki/Jensen%27s_inequality) — bias in averaging ratios.
18. Wikipedia — [Simpson's paradox](https://en.wikipedia.org/wiki/Simpson%27s_paradox) — the §8 mechanism.
19. Wikipedia — [Quantile normalization](https://en.wikipedia.org/wiki/Quantile_normalization) — monotone-rescoring invariance.
20. US BLS — [CPI Q&A](https://www.bls.gov/cpi/questions-and-answers.htm) — rebasing done properly.
21. PostgreSQL — [Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — `stddev_samp`, `percentile_cont`.
22. NIST/SEMATECH — [e-Handbook](https://www.itl.nist.gov/div898/handbook/) — σ̂ behavior at small n.

**Triton-internal evidence (read 2026-08-11; no DB queries run):** `app/api/update/route.ts` (`refreshPitchBaselines`, `applyStuffPlusForDateRange`); `app/api/update/milb/route.ts`; `lib/leagueStats.ts` (`computeStuffRV`, `BL_BY_YEAR`); `scripts/create-refresh-league-averages.sql`; `docs/VARIABLES.md` L302/L442; `Li/context/triton-context.md`.
