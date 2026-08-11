---
title: Volume & Completeness Monitoring — Counting What Should Be There
domain: data-reliability
tags:
  - volume-monitoring
  - completeness
  - row-counts
  - anomaly-detection
  - gap-detection
  - z-score
  - seasonality
  - coverage
sources_reviewed: 18
last_updated: 2026-08-11
---

# Volume & Completeness Monitoring — Counting What Should Be There

## TL;DR

- **Volume monitoring and completeness monitoring are different disciplines and Triton needs the second one.** Volume asks *"is the row count normal?"* Completeness asks *"is every expected thing present?"* Triton's row counts were perfect for the entire 2026 Stuff+ outage; the completeness of a derived column was zero. (measured)
- **There are three families of detection — static thresholds, statistical baselines, and ML forecasting — and they fail in that order as seasonality increases.** Static thresholds work only for stable metrics; they break on anything with weekend/seasonal structure. Baseball is the most seasonal data most engineers will ever monitor. (documented)
- **The z-score is the workhorse statistical method; z=±3 is the standard conservative starting threshold** (≈0.135% of a normal distribution in each tail). Some practitioners use ±2, which flags ~2.3% per tail and will bury a small team in false positives. Start at 3, measure your false-positive rate, then tune. (documented)
- **Use a *robust* z-score (median + MAD), not the classical one, for row counts.** The classical z-score's mean and standard deviation are themselves corrupted by the outliers you are trying to detect — one doubleheader-heavy day inflates σ and hides the next real anomaly. (documented)
- **Rolling baselines are mandatory, but the window length is the whole design.** Too short and a slow decay becomes the new normal; too long and legitimate change looks like an anomaly forever. Triton's Stuff+ decay was ~3%/week — **a 7-day rolling baseline would have absorbed it entirely and never fired.** This is the single most important tuning insight in this doc. (measured/inferred)
- **Gap detection beats anomaly detection whenever the expected set is knowable.** If you can enumerate what *should* be there — every date on which games were played, every game_pk in the schedule — a `LEFT JOIN` against the expected set is exact, cheap, seasonality-immune, and doubles as the repair worklist. Prefer it. (documented + inferred)
- **The canonical SQL shapes are `generate_series` + `LEFT JOIN` for "which dates are missing" and `LAG()` for "where are the discontinuities."** The first requires knowing the expected cadence; the second only needs the data itself. (documented)
- **Completeness must be measured per *column*, not per table, for derived data.** `count(col)/count(*)` over a trailing window is the assertion that would have caught Triton's outage in June. There is no substitute at the table level. (measured)
- **Volume monitors need an absolute floor as well as a relative one.** Nordnet's production system requires both a 25% relative deviation *and* an absolute significance floor of 0.1% of peak volume before alerting — otherwise tiny tables generate constant noise. (documented)
- **Anomaly detection needs 3–4 weeks of history to be trustworthy** and should be the *last* thing Triton builds, not the first. Exact gap detection and column-coverage assertions cover most of the real risk at a fraction of the complexity. (documented)

---

## 1. Three questions that get conflated

| Question | Name | Method | Seasonality-sensitive? |
|---|---|---|---|
| Is the row count in the normal range? | **Volume** | statistical baseline | Very |
| Is every expected item present? | **Completeness / gap detection** | set difference vs expected | No |
| Of the rows present, what fraction has this column populated? | **Coverage** | `count(col)/count(*)` | No |

Most vendor tooling markets all three as "volume monitoring." They have materially different cost, precision, and failure modes, and **Triton's risk concentrates in the two that aren't statistical.**

The 2026 outage makes the point cleanly. Volume monitoring would have been green every night — ingest never missed a pitch. Completeness at the *game* level would also have been green. Only **coverage of a derived column** was failing, from 99.5% down to 0%.

---

## 2. Completeness / gap detection — prefer this when you can

The principle: **if you can enumerate the expected set, don't do statistics.** Set difference is exact, cheap, immune to seasonality, needs no training window, and its output is directly actionable.

### 2.1 The expected-set join

The general shape, using Postgres `generate_series` to build the expected calendar:

```sql
-- Which dates in the last 30 days have no pitches at all?
SELECT d::date AS missing_date
FROM generate_series(current_date - 30, current_date - 1, '1 day') d
LEFT JOIN (
  SELECT DISTINCT game_date FROM pitches
  WHERE game_date >= current_date - 30
) p ON p.game_date = d::date
WHERE p.game_date IS NULL;
```

**This naive version is wrong for baseball** — it will list every off-day, every All-Star break day, and the entire off-season. The expected set is not "every calendar day," it is "every day on which games were completed." That set has to come from the schedule (MLB Stats API) or a games table, which is why `02-data-freshness-slos.md` §4 builds the expected-games comparator first. Once it exists, gap detection at the *game* grain is strictly better than at the date grain:

```sql
-- Which completed games are missing from pitches entirely?
SELECT e.game_pk, e.game_date
FROM expected_games e
LEFT JOIN (SELECT DISTINCT game_pk FROM pitches
           WHERE game_date >= current_date - 14) p USING (game_pk)
WHERE p.game_pk IS NULL;
```

### 2.2 The `LAG()` discontinuity scan

When the expected set is *not* knowable, window functions find discontinuities in what you have:

```sql
-- Where are the unexpected gaps between consecutive game dates?
SELECT prev_date, game_date, game_date - prev_date AS gap_days
FROM (
  SELECT game_date,
         LAG(game_date) OVER (ORDER BY game_date) AS prev_date
  FROM (SELECT DISTINCT game_date FROM pitches WHERE game_year = 2026) d
) g
WHERE game_date - prev_date > 1
ORDER BY gap_days DESC;
```

Cheaper (no external schedule dependency) but weaker: it cannot distinguish "no games were played" from "we failed to ingest," and it cannot detect a *partially* ingested day at all. Use it for exploratory forensics, not as the standing monitor.

### 2.3 Sequence integrity within a game

Triton has a natural sequence key — `(game_pk, at_bat_number, pitch_number)` — with a unique index on it. That enables a stronger completeness check than either of the above: are there holes *inside* a game?

```sql
-- At-bats with non-contiguous pitch numbering (suggests partial ingest)
SELECT game_pk, at_bat_number,
       COUNT(*) AS pitches, MAX(pitch_number) AS max_pitch
FROM pitches
WHERE game_date >= current_date - 7
GROUP BY game_pk, at_bat_number
HAVING COUNT(*) <> MAX(pitch_number);
```

See `Li/temporal-modeling/08-event-sequencing-integrity.md` for the modeling side of this.

---

## 3. Coverage — the assertion Triton actually needed

For every derived column, the monitor is one query — but **the window must be 2–3 days, not 7**:

```sql
SELECT
  COUNT(*)                                        AS rows_total,
  COUNT(stuff_plus)                               AS rows_scored,
  ROUND(100.0 * COUNT(stuff_plus) / COUNT(*), 1)  AS pct_scored
FROM pitches
WHERE game_date >= current_date - 3;
```

Assert `pct_scored >= 95`. Run daily. Fail the cron run on breach.

**Why 3 days and not 7** (corrected by measurement, 2026-08-11): the identical query over a 7-day
window took **9,923 ms cold** — past the 8s `authenticator` `statement_timeout` — versus **15.3 ms**
for a 3-day grouped scan. Both used `idx_pitches_game_date`; the difference is cold buffer reads
(5,536 vs 0), and the 09:00 UTC cron always runs cold. An assertion that times out is worse than no
assertion, because it fails in a way that currently reports success. See
`Jo/data-quality/02-declarative-expectations.md` §5 for the full `EXPLAIN (ANALYZE, BUFFERS)` table.

**For trailing-week and season figures, don't scan — read the rollup.**
`scripts/create-materialized-views.sql` already materializes `stuff_plus_n = COUNT(p.stuff_plus)`
nightly (lines 105, 323, 374), so season coverage is:

```sql
SELECT SUM(stuff_plus_n)::float / NULLIF(SUM(pitches), 0) AS coverage
FROM mv_pitcher_season_stats WHERE season = 2026;
```

One small table, no scan, and it reproduces the entire 99.5% → 0% decay curve.

Three design points that matter:

1. **Trailing window, not lifetime.** A lifetime coverage figure on `pitches` would still read ~96% today despite August having been 0% — the historical mass drowns the recent failure. The window must be short enough that a new failure dominates it. Seven days is a reasonable default.
2. **The floor must account for legitimately unscoreable rows.** ~0.4% of Triton pitches lack `release_speed`/`pitch_name` and can never be scored. A 99% floor would flap; 95% has real margin. Set floors from measured healthy-period behavior (Apr 2026: 99.5%), not from 100%.
3. **Coverage must be asserted per derived column separately.** `stuff_plus`, command, deception, and bat-tracking all have different eligible populations and different legitimate NULL regions (deception is 2017+ only). A blended "NULL rate" across the table is meaningless.

---

## 4. Statistical volume monitoring — when you can't enumerate

### 4.1 The z-score and why the classical form is a trap

The standard approach computes a rolling mean μ and standard deviation σ, then flags points where |x − μ|/σ exceeds a threshold. Thresholds in practice:

| Threshold | Tail probability (normal) | Practical effect |
|---|---|---|
| z = ±2 | ~2.3% per tail | ~1 false positive every 3 weeks on a daily metric — too noisy for one person |
| z = ±3 | ~0.135% per tail | ~1 per 2 years on a daily metric — the standard conservative start |

Guidance is consistent: **without labeled data, start at ±3 and track the false-positive rate.**

**The classical z-score has a structural flaw for this use case**: μ and σ are computed from data that *includes* the anomalies you're hunting. One extreme day inflates σ, which raises the detection threshold, which hides the next anomaly — a masking effect that gets worse exactly when things are going wrong.

Use the **robust z-score** instead, built on median and Median Absolute Deviation:

```
robust_z = 0.6745 × (x − median) / MAD
```

The 0.6745 factor rescales MAD to be consistent with σ for normal data, so familiar thresholds still apply. Median and MAD have ~50% breakdown points — half the data can be garbage before they move.

### 4.2 Relative AND absolute thresholds

A purely relative threshold makes small tables scream. Nordnet's production system requires **both**:

- relative deviation > **25%**, **and**
- absolute significance > **0.1% of peak volume**

Triton needs this because table volumes span four orders of magnitude — 8.9M-row `pitches` and 79k-row `player_season_stats` cannot share a threshold policy.

### 4.3 Rolling windows and the slow-decay blind spot

Rolling baselines adapt to legitimate change. That adaptation is also their central weakness, and it is *the* reason volume monitoring alone would not have saved Triton.

**Worked example (measured).** Stuff+ coverage decayed roughly:

| Week | Coverage | Week-over-week change |
|---|---|---|
| late May | ~90% | — |
| early Jun | ~60% | −30% |
| mid Jun | ~25% | −35% |
| early Jul | ~8% | −17% |
| late Jul | ~4% | −4% |

The steep middle weeks would have tripped a 25%-deviation monitor. But the *shoulders* — the first slide from 99.5% to 90%, and the long tail from 8% to 0% — are each within a few percent per day. Against a 7-day rolling baseline, **each day's value looks normal relative to the previous seven.** The baseline chases the decay down.

**Mitigations, in order of value:**

1. **Assert against a fixed floor, not a rolling baseline**, for anything with a known healthy value. Coverage should be ≥95% *always*, not "≥95% of last week's coverage." This alone solves it.
2. **Compare against the same period last season**, not last week, for seasonal volume metrics.
3. **Trend the metric over 4 weeks** and alert on sustained slope, not just level.

This is the concrete form of the general principle from `02-data-freshness-slos.md` §6: **Triton's characteristic failure is a slope, not a spike.** Monitoring tuned for spikes will miss it.

### 4.4 Seasonality

Static thresholds fail on anything with seasonal structure, and baseball is extreme — February pitch volume is roughly one third of May's, and November–January are legitimately zero.

Options, worst to best for this platform:

- **Static threshold** — unusable outside a single month.
- **Rolling baseline** — handles gradual seasonal change, blind to slow decay (§4.3).
- **Same-period-last-year comparison** — handles seasonality well, needs a year of history and breaks on schedule changes (2020, WBC years, expansion).
- **Schedule-anchored expected sets** — immune to seasonality because "expected" comes from the actual schedule. **Strongly preferred wherever the expected set is knowable.**

---

## 5. What Triton should build, in order

1. **Coverage assertions on derived columns** (§3). One query per column, fixed floor, daily, fails the cron run. Would have caught the 2026 outage in early June. Highest value, lowest effort.
2. **Game-level gap detection** against the schedule (§2.1). Exact, seasonality-immune, and its output is the re-ingest worklist.
3. **Sequence-integrity check** within games (§2.3). Catches partial-game ingest that game-level checks miss.
4. **Row-count trend recording** in the run-metadata table (`01-pipeline-observability-fundamentals.md` §4.1) — record it now even if nothing alerts on it yet, because statistical methods need 3–4 weeks of history before they can be turned on at all.
5. **Robust-z volume monitoring** with relative + absolute thresholds, *only* on tables where the expected set is genuinely unknowable. On current evidence that is a short list.

**Anti-recommendations:**

- **Do not start with ML/forecasting anomaly detection.** It needs 21+ days of history per table, needs noise characterization to avoid crying wolf, and would still have missed the slow decay. Exact methods cover more of Triton's real risk.
- **Do not put coverage on a rolling baseline.** Fixed floors only. §4.3 explains why.
- **Do not monitor table-level NULL rate as a proxy for column coverage.** `pitches` has 90+ columns with wildly different legitimate NULL regions; the blended number is noise.

---

## Sources

1. iblaine — [Data Anomaly Detection: The Complete Guide for Data Engineers](https://dev.to/iblaine/data-anomaly-detection-the-complete-guide-for-data-engineers-3ifk) — volume anomaly definition; static vs statistical vs ML tradeoffs; seasonality failure of static thresholds.
2. MCP Analytics — [Z-Score Anomaly Detection: Thresholds and Robust Z-Scores](https://mcpanalytics.ai/articles/z-score-anomaly-detection-practical-guide-for-data-driven-decisions) — z=±3 conservative start, robust z-score with median/MAD, 0.6745 scaling.
3. JumpCloud — [Understanding Statistical Anomaly Detection](https://jumpcloud.com/it-index/understanding-statistical-anomaly-detection) — z-score thresholds, ±2 vs ±3 tradeoffs.
4. Tinybird — [Simple statistics for anomaly detection on time-series data](https://www.tinybird.co/blog/anomaly-detection) — rolling window baselines.
5. Booking.com Engineering (Ivan Shubin) — [Anomaly Detection in Time Series Using Statistical Analysis](https://medium.com/booking-com-development/anomaly-detection-in-time-series-using-statistical-analysis-cc587b21d008) — production statistical detection at scale.
6. ADGEfficiency — [Anomaly Detection](https://adgefficiency.com/lessons/anomaly-detection/)
7. OneUptime — [How to Implement Anomaly Detection Integration](https://oneuptime.com/blog/post/2026-01-30-anomaly-detection-integration/view)
8. Robert Sahlin — [Your Pipeline Succeeded. Your Data Didn't.](https://robertsahlin.substack.com/p/your-pipeline-succeeded-your-data) — 25% relative + 0.1%-of-peak absolute thresholds; coefficient of variation; 28-day training, 21-day eligibility.
9. End Point Dev — [Detecting gaps in time-series data in PostgreSQL](https://www.endpointdev.com/blog/2020/10/postgresql-finding-gaps-in-time-series-data/) — `generate_series` + LEFT JOIN pattern.
10. QuestDB — [Three SQL Keywords for Finding Missing Data](https://questdb.com/blog/three-sql-keywords-for-finding-missing-data/)
11. OneUptime — [How to Identify Gaps in Date Sequences](https://oneuptime.com/blog/post/2026-03-31-mysql-identify-gaps-in-date-sequences/view) — LAG() discontinuity pattern.
12. OneUptime — [How to Find Gaps in Sequential Data](https://oneuptime.com/blog/post/2026-03-31-mysql-find-gaps-in-sequential-data/view)
13. Microsoft Learn — [Filling time gaps and imputing missing values (Azure SQL Edge)](https://learn.microsoft.com/en-us/azure/azure-sql-edge/imputing-missing-values) — expected-calendar join pattern.
14. Monte Carlo — [What Is Data Observability?](https://montecarlo.ai/blog-what-is-data-observability) — volume as a pillar.
15. Acceldata — [Metadata-Driven Observability](https://www.acceldata.io/blog/metadata-observability-your-guide-to-data-architecture-monitoring) — 2–4 week baseline learning period.
16. Alation — [Mastering Data Quality Monitoring](https://www.alation.com/blog/mastering-data-quality-monitoring/)
17. Validio — [Freshness Validator](https://docs.validio.io/docs/freshness) — seasonality suppression via learned cadence.
18. Anomaly Armor — [Data Pipeline Monitoring: How to Stop Silent Failures](https://blog.anomalyarmor.ai/data-pipeline-monitoring-how-to-stop-silent-failures-before-they-hit-production/) — volume monitoring catching zero-row writes.

**Triton-internal evidence (measured 2026-08-11):** coverage decay by month and the ~0.4% unscoreable-row floor from `docs/Queries.md`; sequence key and index list from the `pitches` schema.
