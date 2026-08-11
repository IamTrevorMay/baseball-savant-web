---
title: Distribution Drift Detection — Telling a Changed World from Broken Data
domain: data-quality
tags:
  - drift-detection
  - statistical-process-control
  - psi
  - kolmogorov-smirnov
  - jensen-shannon
  - wasserstein
  - categorical-drift
  - seasonality
sources_reviewed: 19
last_updated: 2026-08-11
---

# Distribution Drift Detection — Telling a Changed World from Broken Data

## TL;DR

- **Drift detection answers "did the shape change," never "did something break."** Baseball's distributions genuinely move every year — the sweeper, the 2023 rule package, velocity creep — and a detector that can't separate that from corruption gets muted inside one season. (inferred)
- **The central limitation, stated plainly: drift detection on non-null values cannot see a completeness failure.** During the 2026 Stuff+ outage, monthly league-average Stuff+ over *populated* rows held at 100.97 → 100.13 while coverage fell 99.5% → 0%. **Every distribution monitor would have been GREEN for three months.** (measured)
- **PSI's 0.1 / 0.25 bands are a 1990s credit-scoring rule of thumb, not a test** — no sample-size adjustment, no distributional justification. A 2023 peer-reviewed review names the large-sample problem; Evidently ships different bands (0.1 / 0.2). (documented)
- **On Triton data PSI is far too coarse.** Pitch-mix PSI 2025→2026 = **0.0020** and 2022→2023 = **0.0082** — both "no substantial change" — while the sweeper went 3.89% → 5.50% of all pitches. Only 2020→2026 reaches **0.144**. (measured)
- **Hypothesis tests are useless at Triton's row counts.** The comparison PSI scores at 0.0020 gives **χ² = 720 on 5 df, p < 10⁻¹⁰⁰**. Evidently measured KS flagging a 0.5% change above 100,000 rows; Triton's seasons are ~800,000. Alert on effect sizes, never p-values. (measured + documented)
- **Control charts beat single-window comparisons for slow decay, and Triton's failures are slow decays.** Shewhart needs ~44 subgroups to catch a 1σ shift; CUSUM/EWMA need ~10. Coverage fell ~3%/week — a trailing baseline never fires; a CUSUM against a fixed healthy anchor does. (documented + measured)
- **Categorical drift in `pitch_type` is mostly the provider re-labelling history.** `ST` and `SV` appear in every season back to **2015** — impossible unless Savant retro-applied a newer classifier — and `FT`, a retired code, **reappeared in 2026 with 13 rows**. (measured)
- **Triton already has a new-category detector and it has been shouting into the void.** `checkNewPitchNames` (`lib/dataIntegrity.ts:215`) has warned **54 times**, and **no `integrity_checks` row has ever had `status='fail'`** in 95 run-days. A warn nobody actions is not a detector. (measured)
- **Reference-window choice is most of the design.** Trailing windows chase a decay until it becomes normal; year-over-year straddles rule changes. Compare same-phase-of-season windows and hold the population fixed. (inferred)
- **Testing 90+ columns nightly at α=0.05 gives ~4–5 false alarms per night before any real drift exists**, and a trailing-7-day scan of `pitches` measured **9,923 ms cold** against an 8s cap. Monitor share-of-drifted-columns off a persisted histogram snapshot. (measured + documented)

---

## 1. Three things "drift" conflates

| What moved | Name | Correct response |
|---|---|---|
| The world genuinely changed | real change / concept drift | update baselines, tell the analyst, **do not** page |
| The provider changed how it measures or labels | upstream restatement | reconcile, re-derive, restate history |
| Our pipeline broke, silently | artifact | page, fix, backfill, leave a detector |

Every metric below measures **only that the shape moved**. Assigning that movement to one of these rows is separate forensics (§6), and it is the part that matters. A drift score with no attribution procedure attached is an alert generator, not a monitor.

Most domains get one regime change every few years; baseball gets several per season, league-wide and large. **Pitch mix** — measured: sweeper (`ST`) share rose **1.06% (2020) → 3.89% (2022) → 5.50% (2023) → 7.79% (2026)** while `SL` fell 16.36% → 14.07%. **Rule packages** — 2023's pitch timer, shift restrictions and larger bases moved pace, BABIP and running-game distributions at one hard boundary; a step at Opening Day 2023 is *expected*. **Ball construction** — periodic changes move drag league-wide at a season boundary with no change in row counts. **Velocity creep** — a slow multi-year ramp, the archetype of a change any rolling baseline absorbs silently. **ABS** — Triton ingests automated ball-strike data (`/api/cron/abs`); adoption moves called-strike distributions at a rule boundary. A detector tuned tightly enough to catch a broken column fires on all five.

---

## 2. Control charts on data metrics

A pipeline *is* a repetitive process producing a measurable output each night. Monitor a scalar per run — a mean, a NULL rate, a coverage fraction, a category share — and ask whether the process is in control.

| Chart | Statistic | Detects | Cost |
|---|---|---|---|
| **Shewhart** | today's value vs μ ± kσ | large, abrupt shifts (≥3σ) | trivial |
| **CUSUM** | running sum of deviations beyond slack `k` | small, *sustained* shifts | needs state |
| **EWMA** | `z_t = λx_t + (1−λ)z_{t−1}` | small sustained shifts, smoother | needs state |

Numbers worth memorizing: Shewhart averages **~44 subgroups** to signal a 1σ shift, CUSUM and EWMA **~10**, and NIST states CUSUM is preferable for shifts "2 sigma or less." Standard settings: EWMA λ ≈ **0.2**; CUSUM `k` = **half the shift you want to catch**, `h` ≈ **4–5**σ. A 3σ Shewhart limit gives in-control ARL ≈ 370; EWMA/CUSUM designs commonly target ARL₀ ≈ 500. (documented)

**Why this matters here.** The Stuff+ coverage decay was ~3%/week — about a fifth of a σ per run, precisely where Shewhart is blind and CUSUM is not. Worse: with limits from a *trailing* 30-day baseline, the baseline chases the decay and the chart never fires at all. A CUSUM anchored to a **fixed verified-healthy reference** (April, coverage 99.5%) accumulates the deficit and crosses `h` in two to three weeks. (inferred — worth building and measuring)

Streaming detectors (ADWIN, default `delta = 0.002`; Page–Hinkley) suit high-frequency streams. One observation per metric per night does not justify the extra state.

---

## 3. The metric zoo, and how each one fails at Triton's scale

| Metric | Type | Range | Behaviour |
|---|---|---|---|
| **PSI** | both | [0, ∞) | symmetrized KL; conventional bands; binning-dependent |
| **KS** | continuous | [0, 1] | `D = sup\|F_ref − F_cur\|`; p-value degenerates at large n |
| **Chi-square** | categorical | [0, ∞) | statistic itself grows with n at constant drift |
| **Jensen–Shannon** | both | [0, 1] | bounded, symmetric; sensitive → more false alarms |
| **Wasserstein** | continuous | [0, ∞) | respects value *ordering*; outlier-sensitive |
| **Hellinger** | both | [0, 1] | bounded, symmetric, fine on sparse bins |
| **L∞** | categorical | [0, 1] | single worst category; best when categories are many |

`PSI = Σ_i (a_i − e_i) · ln(a_i / e_i)`, `e_i` the reference proportion in bin `i`, `a_i` the current. Bands: **< 0.10** no substantial change, **0.10–0.25** moderate, **≥ 0.25** action. Caveats: they carry no sample-size adjustment (du Pisanie et al. 2023 identify "problems associated with large samples"); vendors disagree on them; and PSI is fully determined by your binning, with zero-count bins patched by an epsilon that changes the answer.

### 3.1 Worked example on real Triton data

Pitch-type mix, `pitches`, six buckets (`SL`, `ST`, `SV`, `CU`, `KC`, all-other), full-season counts:

| Comparison | Sweeper share | PSI | Conventional reading |
|---|---|---|---|
| 2022 → 2023 | 3.89% → 5.50% | **0.0082** | no substantial change |
| 2025 → 2026 | 6.66% → 7.79% | **0.0020** | no substantial change |
| 2020 → 2026 | 1.06% → 7.79% | **0.144** | moderate change |

(measured 2026-08-11; 2026 partial, through 2026-08-09.)

**The largest change in pitch usage of the Statcast era — a pitch going from a rounding error to nearly one in twelve — does not register on PSI year-over-year, and only reaches "moderate" after six years.** PSI averages over all bins, so a category starting at 1% can grow eightfold while contributing little to a mixture dominated by fastballs. It is calibrated for broad re-weightings of a score distribution, not for a small category doing something dramatic. Monitor per-category shares directly, or use L∞.

The same data under a hypothesis test — two-sample χ², 6 categories, n₁ = 826,259, n₂ = 657,570:

```
χ² = 720.4,  df = 5,  p < 10⁻¹⁰⁰      versus      PSI = 0.0020, "no substantial change"
```

One method screams, the other shrugs. Evidently measured KS "raises flags even for a minor change of 0.5%, as soon as we have more than 100,000 objects," and switches away from KS above **1,000 reference observations**; NannyML's guidance cuts the other way, that below ~**10,000 observations** drift tests can't distinguish nearby distributions. Triton's *daily* windows (~5,000 pitches) sit in the unreliable zone; its *monthly* windows (~110,000) sit deep in the oversensitive one. **There is no window size where the p-value is informative here.** (measured + documented)

**Wasserstein is the right default for continuous columns.** JS and PSI treat bins as unordered labels — moving mass from the 92 mph bin to 93 scores the same as moving it to 78 — while Wasserstein charges for the *distance* moved. League-wide velocity creep produces a small value; a bimodal split where half the pitches suddenly read 0 produces a huge one. The second is corruption, the first is the league. Raw Wasserstein carries the variable's units, so normalize to σ and state thresholds in σ. (inferred + documented)

---

## 4. Categorical drift and new-category detection

Categorical drift has a failure mode continuous drift doesn't: **a value never seen before**. No distance metric handles it — a new category makes the reference proportion 0 and every log-ratio undefined. It needs its own check, and it's the cheapest high-yield check here.

All 21 distinct `pitch_type` values in `pitches`, first/last season observed (measured 2026-08-11):

| Observation | Evidence |
|---|---|
| `ST` (sweeper) and `SV` (slurve) have `MIN(game_year) = 2015` | 266,453 and 26,876 rows, spanning 2015–2026 |
| `FT` (two-seam, legacy code) has `MIN = MAX = 2026` | **13 rows, 2026 only** |
| `UN` (unknown) first appears **2025** | 5 rows total |
| `IN`, `AB` last seen **2016** | retired codes |

The `ST`/`SV` result is the important one: those classifications did not exist in the Statcast taxonomy in 2015, so their presence in 2015 rows means the **provider re-applied a newer classifier to history and Triton re-ingested it** — categorical drift originating upstream, affecting the *past*, with no pipeline bug involved. (Rows measured; the mechanism is *inferred* and should be confirmed against Savant's changelog.) `FT` is the opposite shape — a retired code returning with 13 rows, which is what a provider-side classifier regression looks like. Thirteen rows will never move a distribution metric; only set membership finds it.

**Triton's detector, and why it hasn't worked.** `checkNewPitchNames` (`lib/dataIntegrity.ts:215`) is structurally right — pull `DISTINCT pitch_name`, diff against `PITCH_NAME_TO_ABBREV`, report unknowns, nightly via `/api/cron/integrity`. Measured on `integrity_checks`: **776 rows over 95 run-days (2026-05-08 → 2026-08-11), `new_pitch_names` warned 54 times with up to 8 unknown names, and no row has ever carried `status='fail'`** (`materialized_views` ×56 and `pitch_baselines` ×47 are chronically warning too). **A severity level that never escalates is decoration.** Either an unknown category is worth acting on — fail the run, route through `reportError` — or delete the check.

Three checks worth running: **new-category** (set difference vs allow-list — exact, cheap, seasonality-immune); **disappeared-category** (in the reference, absent now — catches an upstream feed dropping a code); **L∞ on shares** (interpretable and sample-size stable). MiLB events are Title Case where MLB is lowercase, so allow-lists must be per-table.

---

## 5. Reference windows, seasonality, and testing many columns

| Reference | Breaks on | Use when |
|---|---|---|
| **Trailing N days** | slow decay; All-Star break; September call-ups | short-horizon shape checks |
| **Fixed anchor period** | genuine league evolution | detecting *decay* — the Stuff+ case |
| **Same window, prior season** | rule changes; roster turnover; partial season | year-over-year sanity |

**The decay trap, restated because it bit this platform.** A trailing-30-day reference absorbs a 3%/week decline: by the time coverage is 50%, "expected" is already ~60% and the deviation never crosses threshold. Stuff+ coverage went 99.5% → 0% over four months with no trailing-window monitor able to fire. **For metrics with a known-correct value, anchor the reference to a period you verified was healthy — not to the recent past.** (measured decay rate; inferred monitor behaviour)

Baseball hazards: the **off-season is a legitimate zero** (Nov–Feb the correct row count is 0 and drift is undefined — without a season-active gate you get four months of noise and a muted channel); **spring/regular/postseason are different populations** (`game_type` S/R/P); **September rosters expand** toward higher-variance arms; **unbalanced schedules** shift altitude/roof/dimension mix, producing drift that is pure scheduling. The rule: **compare same-phase-of-season windows and hold the population fixed.** Per-pitcher, per-pitch-type comparisons beat league aggregates because the population is constant by construction. See `Li/statistical-inference/07-trend-detection-changepoints.md` and `Jo/data-reliability/03-volume-completeness-monitoring.md`.

**Multiple testing.** `pitches` has 90+ columns; testing each nightly at α = 0.05 gives **~4–5 expected false positives per night with zero real drift** — ~800 noise alerts per season, which is how drift monitoring gets turned off. Bonferroni (α/m = 0.00056 at m=90) is safe and useless; it destroys power for the moderate drift you want. **Benjamini–Hochberg** (largest `k` with `p_(k) ≤ k·q/m`) controls the expected *proportion* of false discoveries with far better power. Best of all: **don't test 90 columns** — monitor a *share-of-drifted-columns* statistic over 10–15 nominated columns and report one number.

---

## 6. Real change vs data corruption — the decision procedure

Everything above produces a number. This produces an answer.

| Question | **Real change** | **Artifact** |
|---|---|---|
| **Scope** | league-wide, or a coherent subpopulation (one pitcher, one team) | aligned to an *ingest* boundary: one `game_type`, level, date range, cron window |
| **Shape** | ramp over weeks, or a step at a rule boundary | step at a deploy; or a ramp as a table grows into a timeout |
| **Boundary** | Opening Day, All-Star break, rule adoption, trade deadline | deploy, schema migration, provider API bump, backfill run |
| **Row counts** | unchanged — same rows, different values | often move too, or NULL/coverage rates move in lockstep |
| **Physical coherence** | correlated columns move together; the physics holds | one column moves while its physical partners sit still |
| **Independent sources** | MiLB / MLB Stats API / Retrosheet agree | only our table shows it |
| **History** | the past is stable | yesterday's 2019 answer changed |
| **Column type** | either | derived columns fail *our* way; ingested ones fail the *provider's* |

**The protocol, in order:**

0. **Check completeness first.** Establish rows are present, fresh and populated before explaining a moved number. This is where the 2026 outage was found; a drift score over a collapsing denominator is a fabrication.
1. **Partition the signal** by `game_type`, level, team, park, ingest date. Real change is diffuse or domain-coherent; artifacts concentrate on infrastructure seams.
2. **Localize the changepoint to a date.** Not a month — a date.
3. **Diff that date against the operational log**: `git log`, Vercel deployments, `cron_runs`, provider changelog, MLB calendar. A changepoint landing on a deploy date is an artifact until proven otherwise.
4. **Physical coherence check.** Release height down should mean induced vertical break down. Velocity down with spin, movement and extension untouched is a sensor or parsing problem, not a pitcher.
5. **Reconcile against an independent source** — `milb_pitches`, `player_season_stats`, `retro_events`. See `06-reconciliation-source-of-truth.md`.
6. **Check whether history moved.** Re-run last month's query for a closed season; if the 2019 answer changed, something restated the past.
7. **Only then call it real** — and record the call with its evidence grade.

**Case A — Cade Povich, August 2026. Verdict: real.** Four-seam release height fell **6.05 → 5.87 ft**, release side moved **1.08 → 1.29 ft**, FF IVB **19.5" → 18.0"**, SI IVB 15.0" → 12.2", SL IVB 7.6" → 4.6"; his cutter (12 pitches in April–May) disappeared. Stuff+ hit a season-low 97.7 on FF 98.4 → 95.8 at rising usage. Sample: 2 starts, **149 pitches**. Protocol read: scope is one pitcher, not ingest-shaped (✓); the step coincides with his return from Triple-A, not a deploy (✓); physical coherence is textbook — arm slot down, ride down, sweep up on the breaker (✓); MiLB data for him is independently populated and flat (✓). **Genuine mechanical change.** The remaining caveat belongs to `Li`: at 149 pitches the direction is well-evidenced, the magnitude is not. (measured)

**Case B — league Stuff+, April–August 2026. Verdict: artifact, invisible to drift monitoring.** Monthly league-average Stuff+ over populated rows: **100.97, 100.77, 100.46, 100.13** — 0.84 of drift across four months, so any Shewhart, EWMA, PSI, KS or Wasserstein monitor would have been green nightly. Coverage over the same window: **99.5% → 90.3% → 17.8% → 4.1% → 0%**, row counts perfect throughout. Step 0 catches it immediately. (measured)

---

## 7. The blind spot: drift on populated values cannot see missing values

`AVG(stuff_plus)` skips NULLs. So does every histogram built by binning non-null values, and therefore every drift metric computed from one. **A monitor over the populated subset is by construction blind to the size of the unpopulated subset.** No threshold fixes this. During the 2026 outage the surviving rows weren't even a random subset — they were whatever the timing-out UPDATE reached before the 8s cap — and their distribution still stayed stable enough to report health for three months.

1. **Coverage assertions are the primary control; drift is secondary.** `count(col)/count(*) >= floor` over the ingest window, nightly, failing the run — `Jo/data-reliability/03-volume-completeness-monitoring.md` §3. Worth more than everything in this document combined.
2. **Monitor the NULL rate as a first-class drift series.** Evidently's docs are explicit that empty values are filtered out of drift calculation and that separate quality tests are needed for missing data.
3. **Treat a stable distribution over a shrinking denominator as a red flag, not a green light.** See `07-null-semantics-missingness.md` — the missingness *mechanism*, not the rate, decides whether the visible mean still means anything.

---

## 8. Running this under the 8s ceiling

Every `run_query` call is capped at **8 seconds** by `authenticator`'s `statement_timeout`, which rules out the obvious implementation. Measured on `pitches` (2026-08-11, `EXPLAIN (ANALYZE, BUFFERS)`):

| Query | Cold | Warm |
|---|---|---|
| coverage, trailing 7 days | **9,923 ms** (exceeds the cap) | 529 ms |
| uniqueness, trailing 7 days | **18,302 ms** | 4,509 ms |
| coverage + range, trailing 3 days | — | **15.3 ms** |

All plans used `idx_pitches_game_date` — no sequential scans. **Cost is dominated by cold buffer reads, not row count.** A histogram is strictly more work than a coverage count, so anything scanning a multi-day window at alert time times out on a cold cache.

```sql
-- Nightly, scoped to the ingest window only (~3 days, the 15 ms class of work).
INSERT INTO metric_histograms (metric_date, table_name, column_name, bin, n)
SELECT game_date, 'pitches', 'release_speed',
       width_bucket(release_speed, 60, 105, 45) AS bin, count(*)
FROM pitches
WHERE game_date >= CURRENT_DATE - INTERVAL '3 days' AND release_speed IS NOT NULL
GROUP BY 1, 4;
-- PSI, JS, Wasserstein and CUSUM then run over metric_histograms (thousands of
-- rows), never over `pitches` (8.9M rows, 29 indexes).
```

The expensive step stays inside the cap; the reference becomes a stored, reproducible artifact instead of a re-scan; and comparing *any* two periods is then free. Bin edges must be fixed constants — quantile bins recomputed nightly make the reference move with the data, the same trap as a trailing baseline (§5).

---

## 9. What Triton should do, in order

1. **Do nothing on drift until coverage assertions exist.** `stuff_plus`, command, deception, `league_averages` freshness — `count(col)/count(*) >= 0.95` over the ingest window, failing the run. §7 is the argument: the one incident this platform has had was invisible to every technique here.
2. **Promote `new_pitch_names` from `warn` to `fail`, and add a disappeared-category check beside it.** One severity change converts 54 ignored warnings into an actionable signal. Then explain the 8 unknown pitch names sitting there since May. *(Cheapest real win.)*
3. **Build `metric_histograms` as a nightly snapshot table** (§8): 3-day ingest window, fixed bin edges, 10–15 nominated columns. Prerequisite for everything else and the only shape that fits the 8s cap.
4. **Put a CUSUM on coverage against a fixed healthy anchor**, not a trailing baseline. This is the detector that would have caught the 2026 outage in weeks rather than months.
5. **Add Wasserstein-on-histograms for the continuous physics columns**, normalized to σ, alerting on share-of-drifted-columns against a same-phase-of-season reference.
6. **Write the §6 protocol into the runbook.** The decision procedure is the durable asset; the metrics are commodity. Any alert from steps 4–5 must link to it.
7. **Record every drift verdict with its evidence grade.** "Real, league-wide, 2023 rule boundary" and "artifact, deploy on 2026-06-14" are both permanent knowledge.

**Anti-recommendation: do not deploy per-column statistical drift tests across `pitches` on a nightly schedule.** It is the most natural thing to build and it is wrong here for four independent reasons, any one disqualifying. (a) At ~800k rows/season every test is significant — the measured χ² for a year of ordinary league evolution was 720 on 5 df. (b) At 90 columns and α=0.05 you generate 4–5 false alarms nightly before any real drift exists. (c) Baseball produces several genuine league-wide regime changes per season, so even *correct* alerts will mostly say "the sport changed." (d) A trailing-7-day scan measured 9,923 ms cold and won't complete under the 8s cap. The outcome is an alert channel muted within a month — strictly worse than no monitoring, because it also consumes the attention budget the coverage assertions in step 1 need. **Effect sizes, on a snapshot table, over a shortlist of columns, with a written attribution procedure. Nothing else.**

---

## Sources

1. Evidently AI — [We compared 5 methods to detect data drift on large datasets](https://www.evidentlyai.com/blog/data-drift-detection-large-datasets) — KS flags a 0.5% change above 100k rows; PSI bands 0.1/0.2.
2. Evidently AI — [Data drift algorithm and defaults](https://docs.evidentlyai.com/metrics/explainer_drift) — the ≤1,000 vs >1,000 reference-size switch; share-of-drifted-columns; empty values filtered out.
3. Evidently AI — [Deep dive into data drift detection](https://learn.evidentlyai.com/ml-observability-course/module-2-ml-monitoring-metrics/data-drift-deep-dive) — test selection by type and cardinality.
4. NannyML — [Choosing Univariate Drift Detection Methods](https://nannyml.readthedocs.io/en/stable/how_it_works/univariate_drift_comparison.html) — JS vs Wasserstein ranges and sensitivities; chi² statistic grows with n.
5. NannyML — [Presenting Univariate Drift Detection Methods](https://nannyml.readthedocs.io/en/stable/how_it_works/univariate_drift_detection.html) — L∞ and Hellinger.
6. NannyML — [Comprehensive Guide to Univariate Drift Detection Methods](https://www.nannyml.com/blog/comprehensive-guide-univariate-methods).
7. NannyML — [Practical Data Drift](https://www.nannyml.com/blog/practical-data-drift-2) — ~10,000+ points needed for stable results.
8. du Pisanie et al. (2023) — [A critical review of population stability testing procedures in credit risk scoring](https://arxiv.org/abs/2303.01227) — PSI's large-sample problems; effect-size alternatives.
9. arXiv (2022) — [A proposed simulation technique for population stability testing](https://arxiv.org/pdf/2206.11344).
10. Journal of Risk Model Validation — [Statistical properties of the population stability index](https://www.risk.net/journal-of-risk-model-validation/7725371/statistical-properties-of-the-population-stability-index).
11. Credit Research Centre, Edinburgh — [A Sample-size Dependent Measure of Population Correspondence in Banking](https://crc.business-school.ed.ac.uk/sites/crc/files/2024-01/A-Sample-size-Dependent-Measure-of-Population-Correspondence-in-Banking-Improving-the-Population-Stability-Index-PSI.pdf).
12. Fiddler AI — [Measuring Data Drift with the PSI](https://www.fiddler.ai/blog/measuring-data-drift-population-stability-index) — formula, binning, epsilon handling.
13. YOU CANalytics — [PSI — Banking Case Study](https://ucanalytics.com/blogs/population-stability-index-psi-banking-case-study/) — origin of the 0.1/0.25 bands.
14. GeeksforGeeks — [Population Stability Index (PSI)](https://www.geeksforgeeks.org/data-science/population-stability-index-psi/) — the band table as taught.
15. NIST/SEMATECH — [CUSUM Control Charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc323.htm) — k = half the target shift, h ≈ 4–5, "better than Shewhart... 2 sigma or less."
16. JMP — [CUSUM and EWMA Control Charts](https://www.jmp.com/en/statistics-knowledge-portal/quality-and-reliability-methods/control-charts/cusum-and-ewma-control-charts) — 44 vs ~10 subgroups for a 1σ shift; λ = 0.2.
17. Taylor & Francis — [Design of EWMA and CUSUM charts subject to random shift sizes](https://www.tandfonline.com/doi/full/10.1080/07408170701315321) — ARL₀ targets of 370 / 500.
18. Towards Data Science — [Understanding KS Tests for Data Drift on Profiled Data](https://towardsdatascience.com/understanding-kolmogorov-smirnov-ks-tests-for-data-drift-on-profiled-data-5c8317796f78/) — rejection at n ≥ 5,000; D-statistic as effect size.
19. scikit-multiflow — [ADWIN](https://scikit-multiflow.readthedocs.io/en/stable/api/generated/skmultiflow.drift_detection.ADWIN.html) — variable-length window detection, default `delta = 0.002`.

**Triton-internal evidence (measured 2026-08-11, via `mcp__triton-tools__query_database` and `docs/Queries.md`):** pitch-type share by season 2020–2026 and the 21-value `pitch_type` first/last-season table (§3.1's PSI and χ² are computed from those counts); Stuff+ coverage decay and monthly-mean stability; Povich (`pitcher = 700249`) release-point and IVB deltas; `integrity_checks` history; `EXPLAIN (ANALYZE, BUFFERS)` assertion timings. Code: `lib/dataIntegrity.ts:215`, `app/api/cron/integrity/route.ts`, `vercel.json:4`.

> **Collection note:** the Supabase origin began returning Cloudflare **522** at 20:19 UTC after two concurrent full-column aggregates on `pitches`. League four-seam velocity by season (the "ramp" exemplar in §1) could not be measured and is graded *inferred*; re-measure and fold back in.
