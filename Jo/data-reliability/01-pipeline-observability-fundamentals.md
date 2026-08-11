---
title: Pipeline Observability Fundamentals — Proving the Job Did the Work
domain: data-reliability
tags:
  - observability
  - data-downtime
  - silent-failure
  - five-pillars
  - golden-signals
  - instrumentation
  - opentelemetry
  - write-audit-publish
sources_reviewed: 24
last_updated: 2026-08-11
---

# Pipeline Observability Fundamentals — Proving the Job Did the Work

## TL;DR

- **The central distinction: "the job ran" and "the job did the work" are different claims, and only the first is instrumented by default.** An orchestrator reports success when the *process* exits cleanly. A pipeline that fetches an empty upstream response, writes zero rows, and returns 200 is indistinguishable from a healthy one at that layer. (documented)
- **Triton has already lost three months to exactly this.** `pitches.stuff_plus` coverage decayed Apr 99.5% → Aug 0% while `/api/cron/pitches` returned 200 every night and `trackCronRun` recorded success. The error was caught, `console.error`'d, and discarded. **No monitor in the repo would catch a repeat today.** (measured, 2026-08-11)
- **Partial degradation is far more dangerous than total failure, because it renders.** A complete outage produces an empty dashboard that someone reports within hours. A 20% volume drop produces a plausible-looking chart that nobody questions. Triton's Stuff+ averages stayed in the 100.1–101.0 band the entire time coverage collapsed to zero — the number never looked wrong. (measured)
- **Industry time-to-detection is measured in hours at best, and humans usually find it first.** Monte Carlo's Wakefield survey found 68% of respondents report average TTD of four hours or more, average time-to-resolution rose 166% to ~15 hours per incident, and **74% said business stakeholders find issues first "all or most of the time"** (up from 47% in 2022). Triton's Stuff+ TTD was ~90 days, and a human found it. (documented)
- **The five pillars — freshness, volume, schema, distribution, lineage — are the standard decomposition** (Barr Moses/Monte Carlo, 2019). They are a checklist for *what to instrument*, not a product you buy. Triton currently instruments none of them. (documented)
- **Coverage is the pillar Triton needs most, and it is not in the canonical five.** "Volume" asks *did rows arrive*; Triton's failure was rows arriving with a derived column left NULL. The assertion that matters is **populated-fraction of a derived column over a trailing window**, which is a distribution/completeness hybrid. Add it explicitly. (inferred)
- **Tests catch known unknowns; observability catches unknown unknowns.** Assertions encode what you thought of. Baseline-and-anomaly-detect catches what you didn't. You need both, and the cheap one (assertions) should come first. (documented)
- **The cheapest useful instrumentation is rows-in/rows-out per job run, persisted.** Not logs — a table. Once run-level row counts exist, freshness, volume, and coverage monitors are all trivial SQL over that table. Triton's `trackCronRun` records that a run happened but not what it moved. (inferred)
- **Write-Audit-Publish is the structural fix for "bad data reached production."** Stage → validate → promote, with a circuit breaker on failed validation. Expensive to retrofit onto an upsert-in-place ingest like Triton's, but the *audit* step can be adopted alone. (documented)
- **Anomaly detection needs ~3–4 weeks of history before it is trustworthy.** Nordnet's production system requires 21+ days of history for a table to be eligible and trains on a 28-day window. Don't expect ML-driven baselines to protect a brand-new pipeline. (documented)

---

## 1. The distinction that defines the discipline

Every scheduled job has two success conditions, and conventional tooling only checks one.

**Process success:** the function returned, the exit code was 0, the HTTP response was 200, the DAG task went green. This is what Vercel Cron, Airflow, and `trackCronRun` observe.

**Data success:** the expected rows arrived, in the expected volume, with the expected columns populated, within the expected time window, and downstream consumers can trust them.

The gap between these is where data downtime lives. Barr Moses coined **data observability** in 2019 to name the practice of closing it: *"full visibility into the health of your data and systems so you are the first to know when the data is wrong, what broke, and how to fix it."* The associated failure state is **data downtime** — periods when data is partial, erroneous, missing, or otherwise untrustworthy.

The framing matters because it reassigns responsibility. A pipeline that succeeds while writing nothing is not a monitoring gap — it is a **design defect in the job's definition of done**. Jo's standing position: a job that cannot assert what it moved has not finished being written.

### 1.1 Why partial failure is worse than total failure

Total failure is self-reporting. The table is empty, the dashboard is blank, someone files a ticket within hours.

Partial failure renders. This is the load-bearing insight of the whole discipline:

> A 20% volume drop does not break the dashboard. It changes the numbers slightly, and everyone keeps making decisions on them.

Triton's 2026 Stuff+ outage is a textbook case, and worse than the standard example because the degradation was in a *column* rather than in *rows*:

| Month | Pitches ingested | With `stuff_plus` | Coverage | League avg Stuff+ shown |
|---|---|---|---|---|
| Apr | 117,333 | 116,795 | 99.5% | 100.97 |
| May | 121,779 | 109,911 | 90.3% | 100.77 |
| Jun | 115,920 | 20,676 | 17.8% | 100.46 |
| Jul | 109,421 | 4,504 | 4.1% | 100.13 |
| Aug | 36,621 | 0 | **0%** | *(null)* |

Row counts were **perfect all season** — ingest never missed a pitch. Any volume monitor would have stayed green. And because `AVG()` skips NULLs, the displayed league average drifted only ~0.8 across the entire collapse. The number never looked wrong; it just described a shrinking, non-random subset. (measured)

This is why Jo treats **coverage of derived columns** as a first-class signal rather than a subtype of volume.

---

## 2. The five pillars, and the one Triton is missing

The canonical decomposition (Monte Carlo, now near-universal; some vendors market 6–7 by splitting these):

| Pillar | Question | Typical assertion |
|---|---|---|
| **Freshness** | How current is this table, and does it update on cadence? | `max(game_date) >= today - 1` |
| **Volume** | Did the right *number* of records arrive? | row delta within ±25% of trailing mean |
| **Schema** | Did the structure change unexpectedly? | column set/type hash unchanged |
| **Distribution** | Are the values still in a plausible range/shape? | NULL rate, min/max, mean drift |
| **Lineage** | What is upstream and what breaks downstream? | dependency graph |

**What Triton needs that this list under-serves.** Freshness and volume both passed during the Stuff+ outage. The failing signal was: *of the rows that arrived, what fraction have the derived column populated?* That lives awkwardly between distribution (NULL rate) and volume (completeness).

Jo names it explicitly as a sixth working pillar:

> **Coverage** — for every *derived* column, the populated fraction over a trailing window, asserted against a floor.

The distinction matters operationally because derived columns fail differently from ingested ones. Ingested columns fail when the upstream provider changes. Derived columns fail when *our own* post-processing step breaks — which is exactly the failure mode that returns 200. (inferred)

### 2.1 Distribution monitoring would also have caught it

A NULL-rate monitor on `pitches.stuff_plus` — canonical Distribution — would have fired in June at 82% NULL. Jo should not over-claim novelty here: the standard pillar set *does* cover this case if you apply distribution monitoring to derived columns specifically. The failure at Triton was not a gap in the framework; it was that **no pillar was instrumented at all**. (measured)

---

## 3. Golden signals: what transfers from SRE and what doesn't

Google's four golden signals — **latency, traffic, errors, saturation** — are the minimum viable metric set for a user-facing service. Data engineering borrows them with real but incomplete fit:

| Golden signal | Service meaning | Data pipeline analogue | Fit |
|---|---|---|---|
| Latency | request duration | end-to-end data freshness / lag | strong |
| Traffic | requests/sec | rows or bytes processed per run | strong |
| Errors | 5xx rate | failed runs / rejected records | **weak — this is the trap** |
| Saturation | resource headroom | queue depth, warehouse slots, disk, timeout margin | strong |

**The Errors signal is where the analogy breaks.** In a request/response service, a failure produces a 5xx that the client sees. In a batch pipeline, a failure can produce a 200 and a silently unwritten column. Error rate is necessary but nowhere near sufficient — it was 0% for Triton's entire three-month outage. (measured)

Saturation deserves special attention on this platform. Triton's real saturation metric is **statement-timeout margin**: how close the nightly scoring UPDATE runs to the 8s `authenticator` cap. That number degraded silently all season as `pitches` grew, crossed the threshold around June, and nothing watched it. A saturation monitor on *statement duration as a fraction of the timeout* is arguably the single highest-value metric Triton could add — it would have predicted the outage weeks before it happened, rather than detecting it after. (inferred — worth building and measuring)

---

## 4. What to instrument, in priority order

### 4.1 Tier 0 — run-level operational metadata (do this first)

The cheapest instrumentation with the highest leverage is a persisted table of job-run facts. Not logs — logs get rotated, aren't queryable, and nobody reads them. A table.

Minimum useful schema:

```
run_id, job_name, started_at, finished_at, status,
rows_fetched, rows_written, rows_updated,
window_start, window_end,
error_text, duration_ms
```

Once this exists, **freshness, volume, and coverage monitors are all trivial SQL over one table**, and trend analysis ("this job has been slowing 4%/week") becomes possible. Observability vendors are, at their core, selling a managed version of this table plus anomaly detection on top.

Triton already has `trackCronRun` (`lib/cronTracker.ts`) and a `counts` payload — the bones are there. The gap is that it records **that a run happened**, not **what it moved**, and nothing asserts on the values. Jo's first structural recommendation for this platform is to extend it to rows-in/rows-out and to make the Stuff+ path report `scoredDays` and coverage. (inferred)

### 4.2 Tier 1 — assertions on the things you already know

Cheap, deterministic, no baseline required. Encode what a human would notice:

- freshness: `max(game_date)` within expected lag
- coverage: `count(stuff_plus)::float / count(*) >= 0.95` over trailing 7 days
- range: `stuff_plus between 0 and 200`
- referential: every `pitches.pitcher` exists in `players`
- uniqueness: `(game_pk, at_bat_number, pitch_number)` unique

These catch **known unknowns** and they never surprise you semantically. But an earlier version of
this doc claimed they "run in milliseconds," and **that is false on `pitches`** — corrected by
measurement on 2026-08-11 (`EXPLAIN (ANALYZE, BUFFERS)`, see `data-quality/02-declarative-expectations.md` §5):

| Assertion | Window | Cold | Warm |
|---|---|---|---|
| `stuff_plus` coverage | 7 days | **9,923 ms** | 529 ms |
| natural-key duplicates | 7 days | **18,302 ms** | — |
| natural-key duplicates | 2 days | — | 16.4 ms |
| coverage + range, grouped | 3 days | — | 15.3 ms |

Every one of these used `idx_pitches_game_date` — these are *good* plans, and the 7-day versions
still exceed the 8s `authenticator` cap. Cost tracks **cold buffer reads, not row counts** (an 18.8×
spread on identical logic), and the 09:00 UTC cron is precisely the cold case.

**Consequence: assertion windows must be 2–3 days, not 7.** For trailing-week figures, read a rollup
table rather than scanning. Triton gets the season-level version free — `stuff_plus_n` is already
materialized nightly (see `Jo/context/triton-context.md`).

dbt tests, Great Expectations suites, and plain SQL assertions all occupy this tier — see
`data-quality/02-declarative-expectations.md` and `data-quality/03-constraint-design-postgres.md`.

### 4.3 Tier 2 — baselines and anomaly detection

Catches **unknown unknowns** — the things nobody thought to assert. This is where statistical/ML approaches earn their keep, and where the honest caveats live:

- **They need history.** Nordnet's production system (200+ BigQuery tables, TimesFM 2.5 via `AI.DETECT_ANOMALIES`) requires **21+ days of history** before a table is eligible and trains on a **28-day window**. Vendor guidance broadly says a system learns normal patterns over **2–4 weeks**.
- **They need noise-awareness or they cry wolf.** Nordnet's model computes a *coefficient of variation* (how noisy is this table normally), a *liveness score* (write-frequency ratio), and *max gap hours* (how long silence is normal) before deciding whether a deviation is meaningful — then requires a **25% relative deviation** AND an absolute significance floor of **0.1% of peak volume** before alerting.
- **Seasonality will destroy a naive baseline.** Baseball data is violently seasonal: a February row count and a July row count differ by an order of magnitude, and an off-season zero is correct. Any volume baseline on Triton must be season-aware or it will alert every October and be muted by November. (inferred)

### 4.4 Tier 3 — lineage and impact analysis

Answers "what breaks if this breaks." Genuinely valuable at scale; for a single-operator platform with a known dependency graph, it is the lowest-priority tier. Triton's lineage is short and legible — `pitches` → `pitch_baselines` → `stuff_plus` → dashboards/reports/newsletter — and can live in a document. See `08-lineage-impact-analysis.md`.

---

## 5. Structural patterns

### 5.1 Write-Audit-Publish

WAP decomposes ingestion into three explicit stages:

1. **Write** — land data in a staging area/branch, not production.
2. **Audit** — run validation (schema, completeness, anomaly, consistency) against staging.
3. **Publish** — promote to production only if the audit passes; otherwise halt and alert (the **circuit breaker**).

Iceberg branches, Dagster asset checks, and dbt+Airflow staging schemas are common implementations. The value is that bad data is structurally prevented from reaching consumers rather than detected afterward.

**Applicability to Triton (honest assessment):** low as a whole, moderate in part. Triton upserts Statcast rows directly into `pitches` keyed on `(game_pk, at_bat_number, pitch_number)`; introducing a staging table for an 8.9M-row target with 29 indexes would roughly double the write cost of the nightly ingest — on a platform where the binding constraint is already an 8s statement timeout. But the **audit step is separable**: run the assertion suite immediately after ingest, and gate the *downstream* chain (`/api/cron/refresh`) on it rather than gating the write. That is a cheap approximation of the circuit breaker and fits the existing two-cron split. (inferred)

### 5.2 Fail loudly, commit what's good

The Stuff+ fix illustrates the pattern Jo prefers when WAP is impractical: **ingested rows still commit, but the run is marked failed and the error is reported.** Losing the ingest because scoring failed would be worse; hiding the scoring failure was what caused the outage. The two concerns get separated, and the run goes red.

### 5.3 OpenTelemetry for pipelines

OTel provides one SDK for traces, metrics, and logs with vendor-neutral export via OTLP. The idiomatic data-pipeline mapping is: **a run is a root trace, each stage is a child span**, with attributes like `job_name`, `run_id`, `window_start`, `rows_written`, and metrics for stage duration histograms and success/error counters.

For Triton this is likely over-engineering today. `lib/observability.ts` already emits structured events; the binding gap is that **`reportError` has a `TODO` where a Sentry sink should be and errors currently go nowhere**. Wiring an existing sink is worth more than adopting a new telemetry standard. Revisit OTel if the cron count grows or if pipeline stages start spanning services. (inferred)

---

## 6. What this costs when you skip it

Industry figures, useful for calibration rather than precision — most come from Monte Carlo's Wakefield Research surveys and carry obvious vendor incentive:

- Average **time-to-detection ≥4 hours for 68%** of respondents (up from 62% in 2022).
- Average **time-to-resolution rose 166% to ~15 hours** per incident.
- Monthly incidents rose from **59 (2022) to 67 (2023)** per respondent organization.
- **31% of revenue** on average was subject to data-quality issues, up from 26%.
- **74%** report business stakeholders find issues first, all or most of the time — up from **47%** in 2022. This is the statistic that should sting: detection is regressing toward humans, not automation.
- Data teams spend **30–40% of their time** on data-quality firefighting.
- Gartner projected **50% of enterprises** with distributed data architectures would adopt data observability tooling by 2026, up from 20% in 2024.

**Triton's own numbers, for comparison:** TTD ≈ **90 days**. Detection mechanism: **a human asking an unrelated question**. Incidents caught by automation to date: **0**. (measured)

---

## 7. Applying this to Triton — the ordered list

1. **Wire `reportError` to a real sink.** Nothing else matters while failures can be silent. `lib/observability.ts` has the TODO; Sentry or equivalent closes it. *(Highest leverage single change.)*
2. **Extend `trackCronRun` to record rows-in/rows-out and the processing window.** This is the Tier-0 table. Everything else is SQL on top of it.
3. **Add coverage assertions on derived columns** — `stuff_plus`, command, deception — asserting ≥95% populated over the trailing 7 days, run daily, reported as a failed run when breached.
4. **Add a saturation monitor on statement-duration margin** against the 8s cap. This is the metric that would have *predicted* the Stuff+ outage rather than detected it.
5. **Make `/api/cron/refresh` gate on ingest assertions**, not just on `totalInserted > 0` — the cheap half of Write-Audit-Publish.
6. **Season-aware volume baselines** before any anomaly detection. A naive baseline will be muted within a month.
7. **Audit the other 16 crons** for the same swallow-and-return-200 pattern. Two jobs have already independently hit the 8s cap; assume more.

The through-line: Triton does not need a data observability platform. It needs **one table of run facts, five assertions, and an alert destination.** Buy nothing until those exist and have caught something.

---

## Sources

1. Monte Carlo — [What Is Data Observability? 5 Key Pillars](https://montecarlo.ai/blog-what-is-data-observability) — Barr Moses definition, five pillars, data downtime, TTD/TTR figures, Gartner projection.
2. Monte Carlo — [The Annual State of Data Quality Survey](https://montecarlo.ai/blog-data-quality-survey) — Wakefield Research survey statistics.
3. Monte Carlo — [The Alarming Cost of Poor Data Quality](https://montecarlo.ai/blog-the-cost-of-poor-data-quality/) — revenue impact, team time.
4. Robert Sahlin — [Your Pipeline Succeeded. Your Data Didn't.](https://robertsahlin.substack.com/p/your-pipeline-succeeded-your-data) — Nordnet production anomaly detection: `WRITE_API_TIMELINE_BY_PROJECT`, TimesFM 2.5, 28-day training window, 21-day eligibility, coefficient of variation, liveness score, 25% deviation threshold.
5. SeattleDataGuy — [The 5 Silent Failures in Data Pipelines](https://seattledataguy.substack.com/p/the-5-silent-failures-in-data-pipelines).
6. Anomaly Armor — [Data Pipeline Monitoring: How to Stop Silent Failures](https://blog.anomalyarmor.ai/data-pipeline-monitoring-how-to-stop-silent-failures-before-they-hit-production/) — zero-row-write failure mode, detection latency.
7. Chu Ngwoke — [Silent Failures in Data Pipelines: Why They're So Dangerous](https://medium.com/@chu.ngwoke/silent-failures-in-data-pipelines-why-theyre-so-dangerous-7c3c2aff8238).
8. João Ramos — [Catching Silent Failures with Forecasting, Metadata, and an LLM](https://medium.com/@jooramos_37651/catching-silent-failures-in-data-pipelines-with-forecasting-metadata-and-an-llm-d316e1666bb6).
9. Databricks — [What is Data Observability?](https://www.databricks.com/blog/what-is-data-observability)
10. Kestra — [What Is Data Observability? Pillars & Benefits](https://kestra.io/resources/data/data-observability) — instrumentation four-step model.
11. Actian — [What is Data Observability? Definition, Pillars, and How it Works](https://www.actian.com/what-is-data-observability/)
12. DataCamp — [Data Observability Explained: Concepts, Tools & Best Practices](https://www.datacamp.com/blog/data-observability)
13. DQLabs — [The 7 Pillars of Data Observability for 2026](https://www.dqlabs.ai/blog/the-5-pillars-of-data-observability-and-the-2-more-that-define-it-at-enterprise-scale/)
14. SYNQ — [Data Observability Guide](https://www.synq.io/blog/data-observability-guide)
15. Splunk — [Data Observability 101](https://www.splunk.com/en_us/blog/learn/data-observability.html)
16. Metaplane — [Data quality vs data observability](https://www.metaplane.dev/blog/data-quality-vs-data-observability)
17. Acceldata — [Metadata-Driven Observability](https://www.acceldata.io/blog/metadata-observability-your-guide-to-data-architecture-monitoring) — operational metadata collection, 2–4 week baseline learning.
18. Cisco DevNet — [What are the Golden Signals?](https://developer.cisco.com/articles/what-are-the-golden-signals/what-are-the-golden-signals-that-sre-teams-use-to-detect-issues/)
19. Digital CxO — [What Data Engineers Can Learn from SRE](https://digitalcxo.com/article/what-data-engineers-can-learn-from-site-reliability-engineering-sre/)
20. OneUptime — [How to Monitor Data Pipeline ETL Jobs with OpenTelemetry](https://oneuptime.com/blog/post/2026-02-06-monitor-data-pipeline-etl-jobs-opentelemetry/view) — run-as-trace, stage-as-span mapping.
21. OpenTelemetry — [Collector Architecture](https://opentelemetry.io/docs/collector/architecture/)
22. Dagster — [Write-Audit-Publish Pattern in Pipelines](https://dagster.io/blog/python-write-audit-publish)
23. Telm.ai — [What is Write–Audit–Publish?](https://www.telm.ai/blog/what-is-write-audit-publish-in-apache-iceberg-and-why-it-matters-for-data-quality/) — circuit breaker on failed data contract.
24. Datafold — [7 dbt testing best practices](https://www.datafold.com/blog/7-dbt-testing-best-practices/) — known vs unknown unknowns, limits of build-time assertions.

**Triton-internal evidence (measured 2026-08-11):** coverage decay table and league-average stability from `docs/Queries.md`; outage post-mortem in `planning.md` and `Jo/context/triton-context.md`.
