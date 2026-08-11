---
title: Data Freshness SLOs — Committing to a Number Without Crying Wolf
domain: data-reliability
tags:
  - freshness
  - slo
  - sli
  - sla
  - error-budget
  - burn-rate
  - staleness
  - seasonality
sources_reviewed: 20
last_updated: 2026-08-11
---

# Data Freshness SLOs — Committing to a Number Without Crying Wolf

## TL;DR

- **SLI is what you measure, SLO is the target you hold it to, SLA is the promise with money attached.** Triton has no external customers for its data, so it needs SLIs and SLOs and explicitly **no** SLAs. Skipping the SLA is not a gap — inventing one would be theater. (documented)
- **Google's SRE Workbook names three data-processing SLI types: freshness, correctness, and coverage.** This independently confirms the Coverage pillar argued in `01-pipeline-observability-fundamentals.md` — coverage is canonical SRE vocabulary for pipelines, not an invention. (documented)
- **Canonical freshness definition: "the proportion of the data that was updated more recently than some time threshold."** Note it is a *proportion*, not a timestamp. For batch systems Google permits the approximation "time since the last successful run" — which is precisely the approximation that would have hidden Triton's Stuff+ outage, since the run *did* succeed every night. **Prefer the proportion form.** (documented)
- **The single most common freshness mistake is setting a threshold unconnected to the source's actual update cadence.** A one-hour threshold on a nightly table produces constant false positives that the team learns to ignore, which defeats the entire purpose. Derive `warn_after`/`error_after` from observed cadence plus a buffer. (documented)
- **Baseball freshness is schedule-driven, not clock-driven, and this breaks every off-the-shelf freshness check.** A naive "`max(game_date)` within 24h" assertion on `pitches` is correct in July and fires every single day from November through February. Triton's freshness SLI must be defined against **the baseball calendar** — "do we have every date on which games were played?" — not against wall-clock lag. This is the most important design decision in this doc. (inferred)
- **Separate source freshness from derived freshness.** "Did Savant give us pitches?" and "did the downstream chain score and aggregate them?" are different SLIs with different failure modes. Triton's outage was a *derived* freshness failure while *source* freshness was perfect. (measured)
- **Set the initial target from current measured performance, not aspiration.** Google's guidance: if you have no other information, start with what you actually do today, round down to two significant figures, and iterate. Never target 100% — it removes all room to ship. (documented)
- **Error budget = 100% − SLO, and its job is to force a prioritization conversation.** At a 99.5% freshness SLO you get 0.5% of measurement windows to be late. Burn-rate alerting (page at 2×/5×/10× consumption) is the mature form; for a one-person team, a simpler "two misses in a week means stop building and go fix" rule captures most of the value. (documented)
- **A four-week rolling window containing whole weeks is the standard SLO period.** Whole weeks matter because weekday/weekend variance otherwise leaks into the number — and in baseball, day-of-week schedule density is real. (documented)
- **Triton should start with four SLIs, not forty.** Source freshness on `pitches`, derived freshness on the refresh chain, coverage on `stuff_plus`, and staleness of `mv_last_refreshed`. Everything else is a later iteration. (inferred)

---

## 1. The vocabulary, and which parts Triton actually needs

| Term | Definition | Triton relevance |
|---|---|---|
| **SLI** | A quantitative measure of some aspect of service behavior. *What you measure.* | **Yes** — build these |
| **SLO** | A target value or range for an SLI over a window. *Internal commitment.* | **Yes** — commit to these |
| **SLA** | A contract with a customer, with financial penalties for breach. *External promise.* | **No** — no external data customers |

The standard advice that "your SLO should be stricter than your SLA to create a buffer" is irrelevant here and should not be cargo-culted. Triton's consumers are Trevor, the dashboards, the newsletter, and the broadcast overlays. The SLO's job is not contractual protection — it is to **convert a vague sense of "the data should be current" into a number that can be violated**, so that violation can trigger something.

### 1.1 SLI specification vs implementation

Google draws a distinction worth internalizing:

- **Specification** — the outcome you care about, independent of measurement. *"Yesterday's games are in the database."*
- **Implementation** — the specification plus a measurement method. *"`SELECT max(game_date) FROM pitches` equals the most recent date on which MLB games were completed."*

One specification can have several implementations that differ in accuracy, coverage, and cost. This matters because Triton's *easy* implementation ("time since cron last ran") and its *correct* implementation ("do we have all of yesterday's games") diverge exactly at the failure mode that has already bitten this platform once.

---

## 2. The three data-processing SLI types

From the SRE Workbook, applied to a pitch database:

### 2.1 Freshness
> *"The proportion of the data that was updated more recently than some time threshold."*

Read that carefully: it is a **proportion**, not a lag. The naive reading — "how old is the newest row" — is a much weaker signal, because a single fresh row makes the whole table look fresh. The proportional form asks what fraction of the *expected* recent data is present.

For batch systems Google explicitly allows approximating freshness as *time since the last successful batch run*. **Jo's warning: this is the approximation that hides the Triton failure mode.** `/api/cron/pitches` completed successfully every night for three months while producing nothing useful. Any freshness SLI defined as "the job ran recently" would have been green throughout.

### 2.2 Correctness
> *"The proportion of records coming into the pipeline that resulted in the correct value coming out."*

Requires a source of truth to compare against. Triton has partial ones: the MLB Stats API for game-level aggregates, Retrosheet for historical play-by-play. See `data-quality/06-reconciliation-source-of-truth.md`.

### 2.3 Coverage
> For batch systems: *the proportion of jobs meeting data-processing targets*; for streaming: *the proportion of records processed within a timeframe*.

This is the Triton-critical one. Generalized to derived columns: **the proportion of eligible rows that actually received the derived value.** That is exactly the `count(stuff_plus)/count(*)` assertion.

---

## 3. Designing freshness thresholds without generating noise

### 3.1 Calibrate to observed cadence

The dominant failure is arbitrary thresholds. The reference implementation is dbt's `source freshness`, which is worth understanding even though Triton doesn't use dbt:

```yaml
freshness:
  warn_after:  {count: 12, period: hour}
  error_after: {count: 24, period: hour}
loaded_at_field: ingested_at
```

dbt queries `max(loaded_at_field)`, compares to now, and evaluates the gap. `warn_after` and `error_after` are both optional but **at least one must be set or freshness is not calculated at all** — a quiet trap worth knowing.

The mechanism is trivial; the discipline is in threshold selection:

- Derive thresholds from the source's *actual* update frequency plus a buffer for normal variation.
- Tight thresholds only for genuinely continuous sources (event streams: 15-min warn, 60-min error).
- A nightly table gets a threshold in the tens of hours, never one hour.

### 3.2 Two tiers: source freshness vs derived freshness

Triton's dependency chain makes this distinction load-bearing:

```
Savant  →  pitches           (source freshness)
        →  pitch_baselines   (derived)
        →  stuff_plus        (derived)
        →  league_averages   (derived)
        →  matviews          (derived)  → dashboards, newsletter, overlays
```

**Source freshness** answers "did the provider deliver and did we ingest it." **Derived freshness** answers "did our own post-processing keep up." The 2026 outage was a *pure derived-freshness failure with perfect source freshness* — which is why a single blended freshness metric would have been useless.

Triton already has the raw material for derived freshness in `system_metadata`: `pitches_last_run` and `mv_last_refreshed`. Neither is asserted on.

### 3.3 Seasonality — where generic tooling fails on baseball

Mature freshness tooling learns arrival patterns and suppresses expected silence (e.g. no weekend loads). Vendors describe seasonality analysis that separates cyclical patterns — weekday/weekend, end-of-month — from genuine incidents.

**Baseball's seasonality is far more extreme than the patterns these tools are designed for.** Triton's own 2026 monthly pitch volumes:

| Month | Pitches |
|---|---|
| Feb | 39,967 |
| Mar | 116,529 |
| Apr | 117,333 |
| May | 121,779 |
| Jun | 115,920 |
| Jul | 109,421 |

February is **one third** of May, spring training and regular season have different game types, and November–January are legitimately zero. A learned baseline trained on July will alert continuously in February; a baseline trained across the year will be too wide to catch anything.

**The fix is to stop treating freshness as a time-series problem and treat it as a schedule-completeness problem.** (inferred — this is Jo's design recommendation, not a documented industry practice)

---

## 4. The Triton freshness SLI — schedule-anchored, not clock-anchored

### 4.1 Specification

> *For every date on which MLB games were completed, `pitches` contains those games' pitches, within 36 hours of the last game ending.*

### 4.2 Implementation sketch

The correct comparator is not `now()` — it is **the most recent date on which games were actually played**. Sources for that: the MLB Stats API schedule endpoint (already used by the roster/player-stats crons), or `max(game_date)` from a games table.

```sql
-- Source freshness: are we missing any recently-played game?
-- expected_games: (game_pk, game_date) for completed games in the last 7 days,
-- from the MLB schedule API.
SELECT e.game_date,
       COUNT(*)                                   AS expected_games,
       COUNT(*) FILTER (WHERE p.game_pk IS NOT NULL) AS ingested_games
FROM expected_games e
LEFT JOIN (SELECT DISTINCT game_pk FROM pitches
           WHERE game_date >= current_date - 7) p USING (game_pk)
GROUP BY e.game_date
ORDER BY e.game_date;
```

Properties that make this the right shape:

- **Off-season safe.** No completed games → nothing expected → passes trivially. No winter false positives, no muted alert.
- **Catches partial ingest.** 14 of 15 games is a failure, not a pass — a `max(game_date)` check would go green on the one game that landed.
- **Matches the actual SLI definition** (a proportion of expected data), not the weak "newest row" proxy.
- **Doubles as a repair worklist.** The failing rows *are* the games to re-ingest.

### 4.3 Derived freshness

```sql
-- Did the downstream chain keep up with the ingest?
SELECT
  (SELECT max(game_date) FROM pitches)                            AS latest_pitch_date,
  (SELECT max(game_date) FROM pitches WHERE stuff_plus IS NOT NULL) AS latest_scored_date,
  (SELECT value FROM system_metadata WHERE key = 'mv_last_refreshed') AS mv_refreshed_at;
```

If `latest_scored_date` lags `latest_pitch_date` by more than one day, the scoring step is failing — **which is exactly the outage, expressible in one query, and it would have fired in early June.** (measured against the historical coverage data)

---

## 5. Choosing the target number

Google's practical guidance, which applies cleanly here:

1. **Start from current measured performance.** If you have no other information, measure what you do today and set that as the initial SLO. Do not start from aspiration.
2. **Use the good-events/total-events ratio form.** Consistency makes budgets composable.
3. **Never target 100%.** It leaves no room to ship and guarantees the SLO gets ignored the first time it is inconvenient.
4. **Round down to two significant figures.** 99.2%, not 99.17%.
5. **Four-week rolling window, containing whole weeks.** Partial weeks let day-of-week variance leak into the number.

### 5.1 Proposed starting SLOs for Triton

Set from measured 2026 behavior, deliberately unambitious so they mean something:

| SLI | Definition | Proposed SLO | Basis |
|---|---|---|---|
| Source freshness | % of completed games ingested within 36h | **99%** | Ingest never missed a game in 2026 (measured); leaves room for Savant outages |
| Derived freshness | % of days where scored date ≥ pitch date − 1 | **98%** | Currently would have been ~50% for Jun–Aug |
| `stuff_plus` coverage | % populated of eligible rows, trailing 7d | **95%** | Healthy months run 99.5–99.7%; residual gaps are rows with null `release_speed` |
| Matview staleness | % of days `mv_last_refreshed` < 26h old | **98%** | Refresh is gated on ingest, so it inherits ingest failures |

The coverage floor is deliberately 95% rather than 99% because **~0.4% of rows legitimately cannot be scored** (missing `release_speed`/`pitch_name`), and that fraction varies. A 99% floor would flap.

---

## 6. Error budgets and when to alert

**Error budget = 100% − SLO.** At 99.5% freshness, 0.5% of measurement windows may fail. The budget's real function is not accounting — it is to convert reliability into a prioritization rule that does not require a judgment call each time.

**Burn-rate alerting** is the mature form: define responses at 2×, 5×, and 10× normal budget consumption, page only on the fast burns, ticket the slow ones. This is genuinely valuable at team scale.

**For a one-person platform, Jo recommends the simplified form:**

- **Any derived-freshness or coverage breach → fail the cron run and report the error.** These are rare enough to be individually actionable and are exactly the class of failure that has already gone unnoticed for 90 days.
- **Two source-freshness breaches in a rolling week → stop feature work, investigate.** Single misses are usually Savant being late.
- **Slow-burn detection matters more than fast-burn here.** The Triton failure mode is not a page-worthy spike; it is a 3%-per-week decay. A monitor that only fires on sudden change would have missed it entirely. **Trend the SLI, don't just threshold it.**

That last point is the main place Jo departs from standard SRE alerting guidance. Classic burn-rate alerting is tuned for outages measured in minutes. Triton's characteristic failure is measured in months and looks like a gentle slope. Alert on the slope. (inferred)

---

## 7. Applying this to Triton — ordered

1. **Build the expected-games comparator.** Everything in §4 depends on knowing which games *should* be present. The MLB schedule API is already called by other crons.
2. **Implement the derived-freshness query** from §4.3 as a daily assertion. One query, three numbers, catches the exact 2026 failure.
3. **Add the four SLIs from §5.1 to the run-metadata table** described in `01-pipeline-observability-fundamentals.md` §4.1 — SLIs are only useful if their history is queryable.
4. **Assert, don't just record.** A breach fails the cron run so `trackCronRun` goes red and `reportError` fires. (Blocked on wiring a real sink — see `04-alerting-oncall-design.md`.)
5. **Trend the SLIs weekly.** A 4-week rolling view catches slope; a daily threshold does not.
6. **Do not build seasonality-aware baselines.** The schedule-anchored formulation in §4 makes them unnecessary, and they are the part most likely to produce noise and get muted.

**Anti-recommendation:** do not adopt a freshness SLI of the form "time since last successful run." It is the documented batch approximation, it is the easiest thing to build, and on this platform it is precisely wrong.

---

## Sources

1. Google SRE Workbook — [Implementing SLOs](https://sre.google/workbook/implementing-slos/) — SLI specification vs implementation; freshness/correctness/coverage as data-processing SLI types; target-setting guidance; error budgets; four-week rolling window.
2. Rootly — [SLA vs SLO vs SLI: The Full Breakdown](https://rootly.com/blog/sla-vs-slo-vs-sli-the-full-breakdown-for-reliable-systems)
3. Gatling — [SLO vs SLA vs SLI: what's the difference](https://gatling.io/blog/slo-vs-sla-vs-sli)
4. Splunk — [SLA vs. SLI vs. SLO: Understanding Service Levels](https://www.splunk.com/en_us/blog/learn/sla-vs-sli-vs-slo.html)
5. Dash0 — [SLA vs. SLO vs. SLI: What's the Difference?](https://www.dash0.com/faq/sla-vs-slo-vs-sli-what-s-the-difference)
6. Shuchismita Sahu — [Understanding SLI, SLO, and SLA in Data Platforms](https://ssahuupgrad-93226.medium.com/understanding-sli-slo-and-sla-in-data-platforms-a-framework-for-service-reliability-d073fdd06290)
7. Nobl9 — [A Complete Guide to Error Budgets](https://www.nobl9.com/resources/a-complete-guide-to-error-budgets-setting-up-slos-slis-and-slas-to-maintain-reliability) — burn-rate thresholds.
8. CTO Craft — [Data-driven negotiation with SLIs, SLOs, and Error Budgets](https://ctocraft.com/blog/data-driven-negotiation-with-slis-slos-and-error-budgets-part-one/)
9. Dawiso — [What Is a Data SLA?](https://www.dawiso.com/glossary/data-sla)
10. beefed.ai — [How to Design Data Products with SLAs](https://beefed.ai/en/design-data-products-with-slas) — `dataset_freshness_seconds` style SLI emission; symptom-based paging.
11. dbt Labs — [freshness (resource property)](https://docs.getdbt.com/reference/resource-properties/freshness) — `warn_after`/`error_after`/`loaded_at_field` semantics.
12. dbt Labs — [Add sources to your DAG](https://docs.getdbt.com/docs/build/sources)
13. Paradime — [dbt Source Freshness: Best Practices](https://www.paradime.io/guides/blog-dbt-source-freshness-best-practices) — cadence-derived thresholds; the one-hour-on-a-nightly-table false-positive trap.
14. Datafold — [How to use dbt source freshness tests to detect stale data](https://www.datafold.com/blog/dbt-source-freshness/)
15. Secoda — [Guide to Using dbt Source Freshness](https://www.secoda.co/learn/dbt-source-freshness)
16. npblue — [dbt Source Freshness: Catching Stale Data Before Your Users Do](https://npblue.com/data/dbt/dbt-source-freshness/)
17. Sifflet — [What Is Data Freshness in Data Observability?](https://www.siffletdata.com/blog/data-freshness)
18. Validio — [Freshness Validator](https://docs.validio.io/docs/freshness) — learned-cadence and seasonality suppression.
19. Datatrail — [Data Pipeline Monitoring: Catch Stale Data](https://datatrail.ai/features/freshness-monitoring)
20. Manik Hossain — [Monitoring Data Freshness Across Large Analytics Platforms](https://medium.com/@manik.ruet08/monitoring-data-freshness-across-large-analytics-platforms-5632fd0e5722)

**Triton-internal evidence (measured 2026-08-11):** monthly pitch volumes and coverage history from `docs/Queries.md`; `system_metadata` markers and cron schedule from `app/api/cron/` and `vercel.json`.
