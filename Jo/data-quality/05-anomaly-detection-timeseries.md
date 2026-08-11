---
title: Anomaly Detection on Data-Quality Metrics — Why It Would Not Have Caught Triton's Outage
domain: data-quality
tags:
  - anomaly-detection
  - time-series
  - robust-statistics
  - seasonality
  - drift-vs-spike
  - alert-fatigue
  - forecasting
  - false-positives
sources_reviewed: 22
last_updated: 2026-08-11
---

# Anomaly Detection on Data-Quality Metrics

> **Scope.** Anomalies in the *metrics that describe your data* — row counts, coverage, NULL rate,
> freshness lag, job duration. Not anomalous baseball events (**Li**). Companions:
> `data-reliability/03-volume-completeness-monitoring.md`, `04-distribution-drift-detection.md`,
> `10-quality-metrics-scorecards.md`.

## TL;DR

- **Anomaly detection would not have caught Triton's 2026 Stuff+ outage, and it is not close.** Against a 7-day rolling mean with a 25% deviation rule, the April→May decay sits **1.2 percentage points (≈1.3% relative)** below baseline; the rule needs 23.75 points. Firing would require a **~157-day window**. (measured inputs, computed)
- **A rolling baseline chases a slow decay down and re-learns the failure as normal.** By August, coverage was 0% *and* the trailing mean was 0%. There is no anomaly in 0 vs 0. (inferred, arithmetically forced)
- **A fixed floor (`coverage ≥ 95%`, trailing 7 days) fires around 2026-05-10, ~93 days before a human found it.** For any metric with a *known healthy value*, a constant beats a learned baseline — the doc's central claim. (monthly coverage measured; crossing date interpolated)
- **Triton's characteristic failure is a slope, not a spike.** Under linear drift of slope `s`, deviation from a trailing-`w` mean is exactly `s·(w+1)/2` — bounded by the window, not by how bad things get. Spike detectors are structurally blind to ramps. (documented mechanism, computed)
- **Classical mean/σ self-masks twice.** Max attainable z-score on `n` points is `(n−1)/√n`, so a 3σ rule **cannot fire at all** for `n ≤ 10`; and drift inflates its own σ — a 28-day window over Triton's decay has σ ≈ 2.4 pts, so ±3σ (±7.3 pts) exceeds the month's damage. Use median/MAD (breakdown 50% vs 0%). (documented — Shiffler 1988, Leys 2013, NIST; computed)
- **Baseball seasonality breaks every learned baseline.** February pitch volume ≈ ⅓ of May's; Nov–Jan are legitimately zero; October collapses ~95% while being correct. Annual seasonality in STL/Prophet needs **≥2 seasons (730 days)** of the DQ metric — Triton has that for nothing. (documented + measured)
- **Triton already has a live alert-fatigue case: `integrity_checks`.** 776 results over 95 run days across 8 checks since 2026-05-08, **zero `status='fail'` ever**, plus chronic ignored warns — `materialized_views` ×56 (56 of 58 days since 2026-06-14 = **96.6%**), `new_pitch_names` ×54, `pitch_baselines` ×47. ~11 warns/week, ignored 56 times running: the revealed budget is below what already ships. Design for **one actionable alert per fortnight**. (measured)
- **Freshness thresholds must encode real lag.** Normal Statcast lag is **2 days** (`max(game_date)` = 2026-08-09 on 2026-08-11), so a "within 24h" rule false-alarms daily and is muted in week one. (measured)
- **Build this last, and hold anything statistical to Nordnet's production bar: 21+ days history for eligibility, a 28-day training window, and a dual gate of 25% relative deviation AND 0.1%-of-peak absolute significance.** Anomaly detection is Tier 2 in `data-reliability/01`; Triton has not finished Tier 0 (`reportError` has no sink) or Tier 1 (no coverage floor exists). (documented + inferred)

---

## 1. What counts as an anomaly here

Chandola, Banerjee & Kumar (2009) give the taxonomy; all three types appear in DQ metrics:

| Type | Definition | DQ example | Triton relevance |
|---|---|---|---|
| **Point** | One instance deviates | A day ingests 0 rows | Savant outage, missed cron |
| **Contextual** | Anomalous only *in context* | 40k pitches/day: normal in June, impossible in January | Every seasonal metric |
| **Collective** | No point is odd; the *sequence* is | 90 straight days of −0.3 pts/day coverage | **The Stuff+ outage** |

The Stuff+ outage is **collective and contextual**: no individual day was an outlier, which is the entire problem. Off-the-shelf detectors (z-score, MAD, Elementary's spike/drop test, `ML.DETECT_ANOMALIES`) evaluate points per timestamp — the wrong instrument. Twitter named the split by shipping two packages: `AnomalyDetection` for *point-in-time anomalous data points*, `BreakoutDetection` for *a ramp from one steady state to another*. **Triton needs the second; everyone ships the first.**

---

## 2. Three shapes, three detectors, zero transfer

| Shape | Signature | Catches it | Structurally misses it |
|---|---|---|---|
| **Spike / dip** | One day, large residual, reverts | MAD / modified z-score; rolling mean w=7–28 | Long-window means (diluted) |
| **Level shift** | Permanent jump to a new plateau | Week-over-week ratio; CUSUM; PELT | Rolling z-score — fires once, re-baselines within `w` days, then goes quiet while data is still broken |
| **Gradual drift** | Small daily delta, compounding | **Fixed floor**; slope test; changepoint | Every rolling-window detector, by construction |

The load-bearing arithmetic. For a metric drifting linearly at slope `s`/day, the mean of the previous `w` days sits above today by exactly:

```
deviation(w, s) = s · (w + 1) / 2        →  to detect slope s at threshold T:  w ≥ 2T/s − 1
```

The deviation depends on the **window length**, not on how long the failure has run or how much damage it has done. A drift can destroy a metric over three months and never exceed `s·(w+1)/2` on any single day. That is not a tuning problem — it is what a rolling baseline *is*. CUSUM and PELT (Killick et al. 2012; `ruptures`) instead find the *segment boundary* and keep it.

---

## 3. The Triton arithmetic — showing the work

Measured 2026 `stuff_plus` coverage (`Jo/context/triton-context.md`, `docs/Queries.md`):

| Month | Coverage | Δ from prior | Implied slope | Weekly relative decay |
|---|---|---|---|---|
| Apr | 99.5% | — | — | — |
| May | 90.3% | −9.2 pts / 31d | **−0.30 pts/day** | ≈ −2.1 pts/wk (**shoulder**) |
| Jun | 17.8% | −72.5 pts / 30d | −2.42 pts/day | −31.5%/wk (**steep middle**) |
| Jul | 4.1% | −13.7 pts / 30d | −0.46 pts/day | −29%/wk |
| Aug | 0% | −4.1 pts / 31d | −0.13 pts/day | — (**shoulder**) |

### 3.1 Rolling-7-day mean, 25% deviation rule

At the April→May shoulder (`s = 0.30 pts/day`, `w = 7`):

```
deviation = 0.30 · (7+1)/2 = 1.2 percentage points
level ≈ 95%  →  relative deviation = 1.2/95 = 1.26%      threshold = 25% of 95 = 23.75 points
```

**Miss factor ≈ 20×.** Required window: `w ≥ 2(23.75)/0.30 − 1 =` **157 days**. A 157-day rolling window on a 6-month season is a fixed floor with extra steps.

**Does the steep middle fire?** For a smooth exponential decay, a 25%-of-trailing-7-mean rule needs a weekly ratio below **≈0.615 (−38.5%/wk)**; June's measured rate is −31.5%/wk, so **it does not fire either**. Only a *lag-7 seasonal-naive* baseline (today vs same day last week) trips the 25% rule, since that needs only >25%/wk — and it then fires in **June and July only**, after coverage has already fallen 99.5% → 18%. An alert at 18% coverage is an obituary.

**By August it goes quiet again.** Coverage 0%, trailing mean 0%, ratio undefined or 1.0. The detector has re-learned the outage as normal — which is precisely why a 90-day silent failure is the class rolling baselines cannot see.

### 3.2 What a fixed floor does

```sql
-- fails, not warns
count(stuff_plus)::float / count(*) >= 0.95   -- trailing 7 days, game days only
```

Interpolating Apr(99.5%)→May(90.3%) at −0.30 pts/day, trailing-7 coverage crosses 95% around **2026-05-10**. Discovery was **2026-08-11**. The floor buys **~93 days**; the rolling baseline buys **zero**. *(Monthly figures measured; crossing date interpolated — inferred. The gap is three months either way.)*

### 3.3 The rule this establishes

> **For any metric with a known healthy value, a fixed floor strictly dominates a learned baseline.**

You do not need to *learn* normal when you can *state* it. Learned baselines are only for metrics whose healthy value genuinely varies and cannot be written down — daily pitch volume, job duration, distinct-pitcher counts. That set is small. Same through-line as `data-reliability/01` (partial degradation renders), `03` (coverage beats row counts), `04` (alert on symptoms you can name): Triton's failure mode is a slope, and slopes are caught by floors.

---

## 4. Robust statistics, and why the textbook method self-destructs

**Failure 1 — the bound.** For `n` points the largest attainable standardized score is `(n−1)/√n` (Shiffler, 1988): `n=7 → 2.27`, `n=10 → 2.85`, `n=11 → 3.02`, `n=28 → 5.10`. **A 3σ detector on a 7-day window is not strict — it is disabled.** For z-scores, `n ≥ 11` is a hard floor, `n ≥ 28` the practical one.

**Failure 2 — self-masking.** Sustained drift inflates the σ it is measured against. Triton's April→May drift over 28 days spans 8.4 points; the sample SD of a linear ramp is ≈ `s·n/√12` = `0.30·28/3.46` ≈ **2.4 points**, so ±3σ is **±7.3 points** — wider than the whole month's degradation. The anomaly widens its own tolerance until it fits inside.

The robust alternative:

```
MAD = median(|xᵢ − median(x)|)
z_m = 0.6745 · (xᵢ − median(x)) / MAD        flag |z_m| > 3.5     [NIST / Iglewicz–Hoaglin]
```

`0.6745` rescales MAD to estimate σ consistently under normality; Leys et al. argue for a stricter 2.5×MAD. **MAD's own failure mode on DQ metrics is real:** if more than half the window is identical, `MAD = 0` and every other point gets `z_m = ±∞` — which happens constantly, with coverage pinned at 100% or orphan counts pinned at 0. **Guard `MAD > 0`, and prefer a fixed floor for pinned metrics.** (inferred, but a near-certain implementation trap.)

On Triton, coverage, freshness, and orphan counts are all fixed floors/ceilings, and **daily row count is the only DQ metric that needs statistics at all**.

---

## 5. Seasonality — where baseball breaks the tooling

**STL** (`statsmodels.tsa.seasonal.STL`) splits a series into trend + seasonal + residual via iterated LOESS; `robust=True` re-weights observations so outliers don't distort the fit, and you detect on the **residual** only. Twitter's S-H-ESD is the same idea — decompose, take the **median** as trend, run Generalized ESD on the remainder. **STL needs ≥2 full periods:** weekly → 21 days; annual → **730 days**.

Baseball's profile is not a mild sinusoid, and a detector trained on July and evaluated in October pages you daily for a month:

| Window | Character | Effect on a learned baseline |
|---|---|---|
| Nov–Jan | **Legitimately zero rows** | Volume detector fires daily, then gets muted |
| Feb | Spring training, ≈⅓ of May volume | A 67% drop; the late-March ramp is a 200% spike |
| Apr–Sep | Stable, day-of-week structure | The only usable training region |
| Oct | Postseason: volume −95%, data correct | Guaranteed false positive |

**The workable compromise (inferred):** gate every volume detector on `MLB games were scheduled today` and compare against the **same weekday**, not a 7-day mean — the seasonal-naive forecast `ŷ(t) = y(t−7)` (FPP3 §5.2) is one line of SQL and handles day-of-week structure free.

---

## 6. Forecast-based detection: Prophet, ARIMA, foundation models

| Approach | Handles drift? | Verdict for Triton |
|---|---|---|
| Rolling mean/MAD | **No** | Cheap and right — but not for coverage |
| **Seasonal naive (lag-7)** | Only >25%/wk | Best value/effort; pure SQL |
| STL + MAD on residual | On the trend, yes | Right architecture, wrong history budget |
| ARIMA / ETS | Differencing **absorbs** the decay as trend | Counterproductive here |
| Prophet | Fits changepoints — **absorbs** the break | Use the changepoint list, not the residual |
| TimesFM / `AI.DETECT_ANOMALIES` | Point detection on residuals | Requires BigQuery; wrong stack |

**The trap worth naming.** ARIMA and Prophet are *forecasting* models: their job is to explain trend and changepoints, so a model that fits Triton's decay reports **low residuals** — it has explained the outage away. Prophet's docs say it "is able to handle outliers in the history by fitting them with trend changes." If you use Prophet here, **make the changepoint list the alert** — *"changepoint in `stuff_plus` coverage on 2026-05-14, δ = −0.31/day"* is what you wanted, and that is PELT semantics. To compare detectors, score them NAB-style: earlier detection scores higher and FPs are penalised by distance, whereas point-label precision/recall rewards the wrong thing.

---

## 7. How much history a detector needs

| Method | Minimum viable | Trustworthy | Basis |
|---|---|---|---|
| **Fixed floor / ceiling** | **0 days** | 0 days | you already know the healthy value |
| Median/MAD z-score | 11 d (max-z bound) | 28+ d | Shiffler; Elementary defaults |
| Nordnet / TimesFM production | **21 d eligibility, 28 d training** | + CoV, liveness, max-gap gating | Sahlin |
| STL weekly / annual | 21 d / **730 d** | 60 d / 3 seasons | ≥2 periods |

**Triton's position:** the only persisted DQ-metric history is `integrity_checks`, from **2026-05-08** — **95 run days**. That clears Nordnet's 21-day bar and STL-weekly, and is nowhere near 730 days. Any annual-seasonality model on Triton DQ metrics today is fitting noise. (measured)

---

## 8. False-positive economics for a solo operator

A two-person rotation absorbs a 20% false-positive rate. A solo operator cannot, and Triton has receipts.

### 8.1 `integrity_checks` is already a fatigued monitor

Measured 2026-08-11 (`app/api/cron/integrity/route.ts:27-34`): **776 check-results over 95 run days across 8 checks.**

| Fact | Value | Reading |
|---|---|---|
| `status='fail'` ever | **0** | Nothing has ever been wrong, or the checks cannot express failure |
| `materialized_views` warns | 56, since 2026-06-14 | 58 elapsed days → **96.6% warn rate** |
| `new_pitch_names` / `pitch_baselines` | 54 / 47 | permanently on |
| Warns/week | ~11 | response to date: none |

A signal present on 96.6% of days carries ≈0.2 bits. **This is what any anomaly detector added today converges to within a month**, on a monitor that is already deployed, writing to a table, and ignored. Per Ewaschuk, alerts must be **urgent, important, actionable, and real**; a warn that has fired 56 times running is none of those.

### 8.2 The freshness trap, quantified

On 2026-08-11, `max(pitches.game_date)` = **2026-08-09**: **normal lag is 2 days**, from Savant's upload delay plus the ingest's 3-day catch-up window. So `>= today − 1` **false-alarms every single day** and is muted within a week; `>= today − 3` fires only on a genuinely late run; adding `AND games_were_scheduled(today − 3)` also survives the off-season. Pick thresholds from the measured lag distribution, not from what you wish the lag were.

### 8.3 The budget

- **Target ≤1 actionable alert per 2 weeks.** With 8 daily checks that is a per-check FP rate under **0.2%** — far stricter than any z-score default.
- **Two-tier it.** Page on fixed-floor breaches; log statistical anomalies to a weekly digest that is *read*, not alerted (`10-quality-metrics-scorecards.md`).
- **Require 2 consecutive breaches** — squares the FP rate for one day of latency; on a 90-day-tail failure that day is free.
- **Adopt Nordnet's dual gate: 25% relative AND 0.1%-of-peak absolute.** Relative-only rules are endless noise on small denominators (MiLB, spring training, one team).

---

## 9. What Triton should do, in order

1. **Fix `integrity_checks` semantics before adding any detector** (§8.1). Give each check a real `fail` threshold; fix or delete the three chronic warns. *A new detector added to an ignored table is a new ignored row.*
2. **Add fixed floors for every derived column, as `integrity_checks` entries with `status='fail'`** — `stuff_plus`, command, deception at `>= 0.95` over the trailing 7 game days (§3.2). This buys back the 93 days, with zero history and zero statistics.
3. **Set the freshness ceiling from measured lag: 3 days, not 1**, gated on `games_were_scheduled(date)` so it survives October–February.
4. **Persist DQ metrics daily so a detector becomes *possible* later** — one row per (metric, date): row count, coverage, null rate, lag, duration. The Tier-0 table from `data-reliability/01 §4.1`. You cannot backfill history you never wrote down.
5. **Add exactly one statistical detector, seasonal-naive.** Today vs same weekday last week, median/MAD over 28 days, dual-gated at 25% relative **and** an absolute floor. Weekly digest, not a page. Daily pitch volume only.
6. **Add a slope detector for the failure mode you actually have.** `regr_slope()` over the trailing 28 days of each coverage metric; alert if negative and projecting to breach the floor within 14 days. This is the only thing here that catches a Stuff+-style decay *early* rather than at the floor.
7. **Revisit annual-seasonality models no earlier than 2028**, at two full seasons of history.

### Anti-recommendation

**Do not deploy a rolling-baseline anomaly detector on `stuff_plus` coverage, and do not buy an observability product to get one.** It is the intuitive response to the outage and it is the wrong one: a 7-day baseline with a 25% rule needs a **157-day window** to see the shoulder decay, stays silent through April, May, and August, and by August has re-learned 0% coverage as normal. A vendor detector configured the standard way reproduces this exactly — passing the outage that motivated buying it, then emitting off-season false positives until it is muted. Nor should you reach for ARIMA or Prophet residuals; they exist to *explain* trend changes, so a model that fits the decay reports it as signal.

**The correct response to a three-month silent decay is a constant, not a model.** `coverage >= 0.95` — no training window, no seasonality, no tuning, and it fires 93 days earlier than anything statistical.

---

## Sources

1. [Anomaly Detection: A Survey](http://cucis.ece.northwestern.edu/projects/DMS/publications/AnomalyDetection.pdf) — Chandola 2009; the §1 taxonomy.
2. [Evaluating Real-time Anomaly Detection Algorithms — NAB](https://arxiv.org/abs/1510.03336) — Lavin & Ahmad; early detection scores higher, FPs penalised by distance.
3. [NAB corpus](https://github.com/numenta/NAB) — 58 labelled series, 0–100 scale.
4. [Do not use standard deviation around the mean, use absolute deviation around the median](https://dipot.ulb.ac.be/dspace/bitstream/2013/139499/1/Leys_MAD_final-libre.pdf) — Leys 2013; 2.5×MAD.
5. [NIST e-Handbook §1.3.5.17 Detection of Outliers](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm) — Iglewicz–Hoaglin modified z-score, threshold 3.5.
6. [statsmodels STL](https://www.statsmodels.org/stable/examples/notebooks/generated/stl_decomposition.html) — `robust=True` re-weighting; period requirements.
7. [Practical and robust anomaly detection in a time series](https://blog.x.com/engineering/en_us/a/2015/introducing-practical-and-robust-anomaly-detection-in-a-time-series) — X Eng; S-H-ESD, anomaly vs breakout.
8. [Twitter AnomalyDetection (R)](https://github.com/twitter/AnomalyDetection) — decompose + median + Generalized ESD.
9. [Forecasting at Scale](https://peerj.com/preprints/3190v2.pdf) — Taylor & Letham 2017; Prophet changepoints, the `τ` prior.
10. [Prophet: Outliers](https://facebook.github.io/prophet/docs/outliers.html) — outliers absorbed as trend changes.
11. [Prophet: Uncertainty Intervals](https://facebook.github.io/prophet/docs/uncertainty_intervals.html) — 80% `interval_width`; trend uncertainty dominates.
12. [FPP3 §5.2 Simple forecasting methods](https://otexts.com/fpp3/simple-methods.html) — the seasonal-naive baseline recommended here.
13. [FPP3 §12.2 Prophet model](https://otexts.com/fpp3/prophet.html) — Hyndman's critique of Prophet.
14. [ruptures: PELT](https://centre-borelli.github.io/ruptures-docs/user-guide/detection/pelt/) — Killick 2012, pruned exact linear time.
15. [ruptures: change point detection in Python](https://arxiv.org/pdf/1801.00826) — linear-penalty segmentation for level shifts.
16. [BigQuery TimesFM anomaly detection](https://docs.cloud.google.com/bigquery/docs/timesfm-anomaly-detection-tutorial) — foundation-model detection, no trained model.
17. [`ML.DETECT_ANOMALIES`](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/bigqueryml-syntax-detect-anomalies) — `ANOMALY_PROB_THRESHOLD` default 0.95.
18. [Your Pipeline Succeeded. Your Data Didn't.](https://robertsahlin.substack.com/p/your-pipeline-succeeded-your-data) — Nordnet; 21-day eligibility, 28-day training, CoV, liveness, 25% + 0.1%-of-peak gate.
19. [Most data quality issues are caught by accident](https://robertsahlin.substack.com/p/your-metrics-are-only-as-good-as) — Sahlin; metric-level monitoring is the layer that matters.
20. [Elementary: data anomaly detection method](https://docs.elementary-data.com/data-tests/data-anomaly-detection) — z-score range, `training_period`, `detection_period`.
21. [Elementary: anomaly tests troubleshooting](https://docs.elementary-data.com/data-tests/anomaly-detection-tests/Anomaly-troubleshooting-guide) — longer training ⇒ fewer FPs.
22. [My Philosophy on Alerting](https://gist.github.com/msgodf/86a3fc7fcd3ce663ff37) — Ewaschuk; urgent, important, actionable, real.

*Not linked (no open URL): Shiffler (1988), "Maximum Z Scores and Outliers," Amer. Statistician 42(1) — the `(n−1)/√n` bound in §4.*

**Triton-internal evidence (measured 2026-08-11):** `stuff_plus` monthly coverage from `docs/Queries.md` and `Jo/context/triton-context.md`; `integrity_checks` (776 rows / 95 run days / 8 checks / 0 fails; warns ×56/×54/×47); check inventory at `app/api/cron/integrity/route.ts:27-34`; `max(pitches.game_date)` = 2026-08-09. All §3 slopes and thresholds are computed from those monthly aggregates.
