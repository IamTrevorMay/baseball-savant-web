---
title: Quality Metrics & Scorecards — Query the History, Skip the Score
domain: data-quality
tags:
  - quality-metrics
  - scorecards
  - data-slas
  - trust-badges
  - severity-model
  - trend-reporting
  - time-to-detection
  - vanity-dashboards
sources_reviewed: 23
last_updated: 2026-08-11
---

# Quality Metrics & Scorecards — Query the History, Skip the Score

## TL;DR

- **For a one-person platform a composite "data quality score" is ceremony; the load-bearing artifact is a queryable history of individual check results.** A score is a device for negotiating across teams. Triton has no one to negotiate with. (inferred)
- **Triton already has that table, and it proves the point rather than solving the problem.** `integrity_checks`: **776 rows over 95 distinct run days** (2026-05-08 → 2026-08-11), 8 checks, read by nothing. A quality history nobody queries is a slower log file. (measured)
- **Zero `status='fail'` rows have ever been written, and that is structural.** `lib/dataIntegrity.ts` returns 10× `pass`, 8× `warn`, 1× `remediated`, **never `fail`**; the only `'fail'` is synthesized at `app/api/cron/integrity/route.ts:52` on a *rejected promise*. A real breach returns `warn`, which doesn't throw, so `trackCronRun` records success. (measured)
- **Severity must be three-way — `pass` / `breached` / `could-not-evaluate` — and Triton maps the third onto the first in three places.** `:108` and `:167` return `pass` on query error; `checkMaterializedViews` (`:284`) returns `pass` when *no recent pitches exist*, so an ingest outage turns that check green. (measured)
- **A warning nobody escalates is a log line with extra steps.** `materialized_views` ×56 since 2026-06-14, `new_pitch_names` ×54, `pitch_baselines` ×47. Warn is valid only if something promotes it. (measured)
- **Composite scores hide the one check that matters:** 7 of 8 green reads as 87.5% healthy whichever one is red. (documented)
- **Triton's characteristic failure is a slope, not a spike, so a trend beats a current-state badge.** Stuff+ coverage went 99.5% → 90% → 18% → 4% → 0%. A same-day 95% threshold fires once then gets muted; a 4-week slope shows the decline from May. (inferred, from measured decay)
- **The season coverage trend costs zero new infrastructure today.** `stuff_plus_n = COUNT(p.stuff_plus)::int` is already materialized nightly (`create-materialized-views.sql:105,323,374`); writing it into the history each night turns an existing number into a slope. (measured)
- **Honest baseline before any scorecard: TTD ≈ 90 days, detection by a human asking an unrelated question, incidents caught by automation = 0.** A scorecard published during the outage would have read 8/8 green. (measured)
- **Certification badges are a social contract, not a measurement.** Airbnb's Midas gates its "gold standard" on human review, by an owner who can revoke it; without that human a badge is decoration. (documented)

---

## 1. Two artifacts, one of which earns its keep

Measuring quality over time produces two things, routinely conflated. A **check history** is one row per (check × run) carrying the observed value; its audience is the engineer debugging at 11pm, and Triton half-owns one — **build it**. A **scorecard** is a weighted rollup into one number; its audience is stakeholders who don't run queries, of whom Triton has none — **skip it**.

The history answers questions ("has this ever passed?", "when did it start sliding?"). The score answers a *status* question a solo operator answers better by reading the four checks he cares about. Everything downstream — SLOs, trends, badges — derives from the history; nothing derives from the score. That is also the vendor architecture with the marketing removed: Deequ persists metric values per run in a **MetricsRepository**, dbt's `store_failures` writes to `_dbt_test__audit`, Elementary charts persisted dbt results.

---

## 2. Triton's quality history, audited

`/api/cron/integrity` runs 8 checks daily at 10:00 UTC into `integrity_checks` (`run_id, check_name, status, found, remediated, details, created_at`). What each check can actually emit, read off the source:

| Check | Could-not-evaluate maps to → |
|---|---|
| `orphaned_pitchers`, `orphaned_batters` | **`pass`** (`:108`, `:167`) |
| `materialized_views` | **`pass`** (`:284`, empty probe / ignored `error`) |
| `new_pitch_names`, `league_averages`, `pitch_baselines` | `warn` (correct) |
| `unknown_players`, `season_constants` | n/a |

**No check can emit `fail`.** Three defects worth naming precisely:

1. **The severity ceiling.** 776 results, 95 run days, zero failures — failure is unreachable from inside a check. The route's `fail` branch triggers only on a *rejected promise*, and every check body catches its own errors.
2. **`could-not-evaluate` is scored as `pass`.** `checkMaterializedViews` is sharpest: it destructures only `{ data: recent }`, ignores `error`, and returns `pass` when the probe finds nothing. **The day the ingest dies is the day that check reports clean** — the Stuff+ failure mode reproduced inside the tool built to catch it.
3. **The history is lossy.** `route.ts:81–86` writes nothing if the `cron_runs` `status='running'` lookup misses (`maybeSingle()` tolerates 0 rows) — what happens when three jobs share a slot, or a prior run was reconciled to `timeout`. **The record of "we couldn't record" is a `console.warn`.** And `checkUnknownPlayers:88` has a dead ternary, so partial and complete remediation are indistinguishable.

> **Jo's diagnosis:** the problem is not the absence of a scorecard. It is *a quality history nobody queries, feeding a severity model that cannot escalate, dropping rows when it fails.* Fix those three, in that order, and the scorecard question dissolves.

---

## 3. The three-state severity model

Every hand-rolled check suite converges on two states and forgets the third.

| State | Meaning | Correct response |
|---|---|---|
| `pass` | Evaluated, within threshold | Record the observed value |
| `breached` | Evaluated, outside threshold | Alert; mark the run failed |
| `errored` | **Not evaluated** — timeout, query error, empty probe | Alert *differently*; never treat as evidence of health |

The third state matters most here, because the 8s `authenticator` cap makes timeouts routine — a 7-day coverage assertion on `pitches` measures **9,923 ms cold** vs 529 ms warm, and the 10:00 UTC cron is the cold case (`02-declarative-expectations.md` §5). *An assertion that times out and reports `pass` is worse than no assertion:* it manufactures evidence.

Tooling gets this half right. dbt's `severity: warn | error` with `warn_if`/`error_if` is the right primitive for "10 unknown pitch names is a ticket, 500 is a page" — but dbt's *execution* errors are runner failures, structurally distinct from test results, and a hand-rolled suite loses that distinction because everything is a return value. Recover it with a fourth status. `remediated` is a legitimate fifth, used well here, but must be **counted**: a check that self-heals nightly is a broken upstream with a bandage.

Cross-reference: page-vs-ticket economics in `Jo/data-reliability/04-alerting-oncall-design.md`; freshness SLIs must be schedule-anchored, not `current_date - 1` (`Jo/data-reliability/02-data-freshness-slos.md` §4).

---

## 4. Scorecards and their failure modes

The canonical scorecard aggregates dimension scores — Collibra markets nine (accuracy, completeness, timeliness, duplication, validity, consistency, uniqueness, availability, lineage), Atlan nine similar, DAMA-DMBOK the upstream vocabulary. Useful as a *checklist for what to test*; as inputs to a weighted average they fail predictably:

| Failure mode | Mechanism | Symptom |
|---|---|---|
| **Dilution** | 1 of 8 red → 87.5% "healthy" | The check that gates the product is invisible |
| **Weight theater** | Weights are unfalsifiable guesses | Arguing about weights replaces fixing data |
| **Denominator gaming** | Adding easy checks raises the score | Score improves while data doesn't |
| **Cross-asset blindness** | Each table scored alone | "A green table fed data by a red one" |
| **Slope invisibility** | A level, not a derivative | Triton's exact failure — a decline that crosses the line only once it's over |

Monte Carlo's own position (Barr Moses, 2024) is that DQ "resists standardization" and isolated scores lose the interconnection that matters. Take it seriously *even though it is a vendor arguing for its own product*.

**The vanity-dashboard anti-pattern.** A dashboard that is (a) always mostly green, (b) off everyone's daily path, and (c) has no action attached to any cell manufactures a feeling of coverage. Google's SRE filter generalizes: *"if a page merely merits a robotic response, it shouldn't be a page"* — if a cell can never change what you do, it shouldn't be a cell. GX's Data Docs are the canonical artifact that quietly stops being opened. **Test:** had the dashboard existed all summer, would it ever have looked different? For Triton: no — 8/8 green through a total outage.

**Trust badges and certification.** Airbnb's Midas is the serious version: a "gold standard" tier awarded after validation, documentation and architecture review across six dimensions, with an owner who can revoke it. It works because a *human* grants it; a badge minted from an always-green suite inherits its blind spots and adds false confidence. Triton's honest badge scheme is two words per derived column in `docs/VARIABLES.md`: **monitored** or **unmonitored** — today, every one is `unmonitored`.

---

## 5. SLAs and SLOs for data quality, sized for one person

**SLI** = the measurement, **SLO** = the internal target, **SLA** = the externally-promised consequence. Triton has no consumer with contractual leverage, so **there is no SLA — only SLOs**, and the error budget is a personal commitment device. Starter set (each over a **2–3 day** window; anything longer reads a rollup rather than scanning):

| SLI | SLO | Breach action |
|---|---|---|
| `stuff_plus` coverage, trailing 3 days | ≥ 95% | Alert + fail the run |
| `stuff_plus` coverage 28-day **slope** | ≥ −0.5 pp/week | Ticket — the Stuff+ detector |
| `pitches` freshness vs schedule anchor | ≤ 2 days lag | Alert |
| Integrity suite completion | 8/8 evaluated (`errored` = 0) | Alert |
| `integrity_checks` write coverage | ≥ 1 run-day per day | Weekly ticket |

Error budget framing that works solo: **breach-days per month.** A 95% SLO over 30 days = 1.5 breach-days; the second breach is the signal to stop feature work. Skip burn-rate math.

---

## 6. The schema, as an extension of what exists

Do not build a parallel table. `integrity_checks` is the right one; it only lacks the columns that make history *analyzable* rather than merely *present*. It is the natural sibling of the run-metadata table in `Jo/data-reliability/01-pipeline-observability-fundamentals.md` §4.1 — `cron_runs` one row per run, `integrity_checks` one per assertion, joined on `run_id`.

**Blast radius:** ~776 rows. `ADD COLUMN` with no volatile default is metadata-only in PG 11+, the backfill is far inside the 8s cap, and `DROP COLUMN` reverses it. Cheapest schema change on this platform.

```sql
ALTER TABLE integrity_checks
  ADD COLUMN target_table   text,        -- 'pitches'
  ADD COLUMN target_column  text,        -- 'stuff_plus'
  ADD COLUMN observed_value numeric,     -- 0.9412 ← the number that makes trends possible
  ADD COLUMN threshold      numeric,     -- 0.95
  ADD COLUMN window_start   date,
  ADD COLUMN window_end     date,
  ADD COLUMN checked_at     timestamptz;
UPDATE integrity_checks SET checked_at = created_at WHERE checked_at IS NULL;

-- widen severity ('fail' kept for the route's promise-rejection path)
ALTER TABLE integrity_checks ADD CONSTRAINT integrity_checks_status_chk
  CHECK (status IN ('pass','breached','errored','remediated','warn','fail'));

-- double-fired crons become idempotent instead of duplicating history
CREATE UNIQUE INDEX IF NOT EXISTS integrity_checks_run_check_uidx
  ON integrity_checks (run_id, check_name) WHERE run_id IS NOT NULL;
```

No trend index: at ~800 rows growing ~3k/year, §7's queries are seq scans — correctly.

The code change matters more than the DDL: **every check returns `observed_value` and `threshold`, even when it passes.** Passing values *are* the baseline; a history of only failures cannot produce a slope. `observed_value` turns `found=200` (censored) into `0.9412` (comparable across nights) — Deequ's MetricsRepository move, and the reason the history is worth keeping.

---

## 7. The queries that make the history worth having

All run over a few thousand rows — no 8s-cap exposure.

**7.1 Coverage trend and slope, 4 weeks** — what would have caught Stuff+ in May:

```sql
SELECT date_trunc('week', checked_at)::date AS wk,
       round(avg(observed_value)::numeric, 4) AS coverage, count(*) AS n
FROM integrity_checks
WHERE check_name = 'stuff_plus_coverage' AND checked_at >= now() - interval '28 days'
GROUP BY 1 ORDER BY 1;

-- alerting form: percentage points per week
SELECT round((regr_slope(observed_value, extract(epoch FROM checked_at)/86400)
              * 7 * 100)::numeric, 2) AS pp_per_week
FROM integrity_checks
WHERE check_name = 'stuff_plus_coverage' AND checked_at >= now() - interval '28 days';
```

**7.2 Hygiene** — checks that never pass (decorative monitors), and days the monitor never ran:

```sql
SELECT check_name, count(*) AS runs, min(checked_at)::date AS since
FROM integrity_checks
GROUP BY 1 HAVING count(*) FILTER (WHERE status = 'pass') = 0 ORDER BY runs DESC;

SELECT d::date AS missing_day
FROM generate_series(current_date - 30, current_date - 1, interval '1 day') d
WHERE NOT EXISTS (SELECT 1 FROM integrity_checks WHERE checked_at::date = d::date);
```

**7.3 Checks that flipped this week** — the only "what changed" view worth a daily glance:

```sql
WITH s AS (
  SELECT check_name, checked_at::date AS day, status,
         lag(status) OVER (PARTITION BY check_name ORDER BY checked_at) AS prev
  FROM integrity_checks WHERE checked_at >= now() - interval '14 days')
SELECT check_name, day, prev || ' → ' || status AS transition
FROM s WHERE prev IS DISTINCT FROM status AND day >= current_date - 7
ORDER BY day DESC, check_name;
```

**7.4 Mean time between breaches, per check:**

```sql
WITH b AS (
  SELECT check_name, checked_at,
         lag(checked_at) OVER (PARTITION BY check_name ORDER BY checked_at) AS prev
  FROM integrity_checks WHERE status IN ('breached','warn','fail','errored'))
SELECT check_name, count(*) AS breaches,
       round(avg(extract(epoch FROM checked_at - prev))/86400.0, 1) AS mtbf_days,
       max(checked_at)::date AS last_breach
FROM b GROUP BY 1 ORDER BY mtbf_days NULLS FIRST;
```

`mtbf_days` near 1.0 means chronic — `materialized_views`, `new_pitch_names` and `pitch_baselines` will all land there. **Chronic breaches are not incidents; they are an unfixed threshold or an unfixed bug, and must be resolved or retired.** Three permanent warns train you to ignore all warns.

**Meta-metrics** grade the monitoring, not the data — compute quarterly, by hand, from incident notes: time-to-detection, detection source (automation/human/consumer), escape rate (found downstream ÷ all incidents), incidents caught by automation. Triton 2026: **~90 days, human asking an unrelated question, 100%, 0.** Calibration, vendor incentive noted: Monte Carlo's Wakefield surveys put TTD ≥4 hours for 68% of respondents, with **74%** saying stakeholders find issues first — Triton is worse on both by orders of magnitude. The history table's first job is to move that detection-source figure from "human" to "automation" exactly once.

---

## 8. What Triton should do, in order

1. **Give `could-not-evaluate` its own status.** `lib/dataIntegrity.ts:108` and `:167` `pass` → `errored`; `checkMaterializedViews` (`:284`) `errored` when the probe is empty or errors. Three literals turn a suite that structurally cannot fail into one that can.
2. **Make the run go red, and stop dropping history.** Throw *after* inserting results when any status is `breached`/`errored`/`fail`; remove the `if (runId)` gate (`route.ts:81`) and throw on insert failure. Insert first, throw second — keep the evidence.
3. **Add the §6 columns; populate `observed_value`/`threshold` on every check, pass or fail.**
4. **Add one check — `stuff_plus_coverage`:** `SUM(stuff_plus_n)::float / NULLIF(SUM(pitches),0)` from `mv_pitcher_season_stats` for the current season. Materialized nightly already, costs nothing, and it is the detector for the outage that actually happened.
5. **Run §7.1 and §7.3 by hand, weekly, for four weeks.** No UI. If neither changes a decision in a month, the checks are wrong — fix the checks, not the presentation.
6. **Resolve or retire the three chronic warns.** Two months of ignored `materialized_views` is a wrong threshold or an untriaged bug; leaving it is what makes the next real warn invisible.
7. **Only then**, if a glance-view is wanted: §7.1–7.3 on one page. Three tables, no score.

**Anti-recommendation: do not build a composite data quality score, a letter grade, a 0–100 "trust score," or a certification badge for Triton.** Not now, and probably not at this size ever. Each compresses away the two things that would have caught the 2026 outage — *which* check moved and *in which direction* — for a number whose only audience already knows the answer. If one is ever built it must be a **minimum, never a mean** (one red is red) and sit beside the trend, not replace it. Nor should you buy Monte Carlo, Soda Cloud, Collibra DQ or Elementary here: they are managed versions of the table Triton owns, and none fix a check that returns `pass` on error.

**Highest-leverage next action:** change those three `'pass'` literals to `'errored'` and make the integrity route throw on them — six lines, and the difference between a suite that has never failed and one that *can*.

---

## Sources

1. Monte Carlo / Barr Moses — [Most Data Quality Initiatives Fail Before They Start](https://montecarlo.ai/blog-data-quality-score/) — DQ "resists standardization"; "one person's 'yellow' … another person's 'green'"; green-table-fed-by-a-red-one.
2. Monte Carlo — [State of Data Quality Survey](https://montecarlo.ai/blog-data-quality-survey) — Wakefield TTD/TTR; who finds incidents first.
3. Monte Carlo — [Cost of Poor Data Quality](https://montecarlo.ai/blog-the-cost-of-poor-data-quality/) — incident counts; calibration only.
4. Airbnb — [Data Quality at Airbnb (Midas)](https://medium.com/airbnb-engineering/data-quality-at-airbnb-870d03080469) — certification: six dimensions, human-granted, revocable.
5. DAMA International — [DAMA-DMBOK](https://www.dama.org/cpages/body-of-knowledge) — upstream vocabulary for every vendor dimension list.
6. Collibra — [Data Quality & Observability](https://www.collibra.com/us/en/products/data-quality) — nine dimensions; rules-and-thresholds framing.
7. Atlan — [Data Quality Metrics](https://atlan.com/data-quality-metrics/) — metrics as "quantifiable indicators … over time."
8. dbt Labs — [`store_failures`](https://docs.getdbt.com/reference/resource-configs/store_failures) — writes failing rows to `_dbt_test__audit` but *replaces* prior results: **not** a history.
9. dbt Labs — [`severity`/`warn_if`/`error_if`](https://docs.getdbt.com/reference/resource-configs/severity) — the two-tier severity primitive worth copying.
10. dbt Labs — [Data tests](https://docs.getdbt.com/docs/build/data-tests), [Source freshness](https://docs.getdbt.com/docs/deploy/source-freshness) — `warn_after`/`error_after` as an SLO in config.
11. Schelter et al., VLDB 2018 — [Automating Large-Scale Data Quality Verification](https://www.vldb.org/pvldb/vol11/p1781-schelter.pdf) — the MetricsRepository; the case for `observed_value` per run.
12. AWS Labs — [Deequ](https://github.com/awslabs/deequ) — the implementation.
13. Elementary — [Data tests](https://docs.elementary-data.com/data-tests/introduction), [anomaly detection](https://docs.elementary-data.com/data-tests/data-anomaly-detection) — results persisted and charted; the productized §7.
14. Great Expectations — [Data Docs](https://docs.greatexpectations.io/docs/core/configure_project_settings/configure_data_docs/) — exhibit A for the vanity-dashboard test.
15. Soda — [Docs](https://docs.soda.io/), [SodaCL checks](https://docs.soda.io/soda-documentation/soda-v3/sodacl-reference/metrics-and-checks) — checks-as-config; warn/fail thresholds.
16. Google SRE Book — [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) — "if a page merely merits a robotic response, it shouldn't be a page."
17. Google SRE Workbook — [Implementing SLOs](https://sre.google/workbook/implementing-slos/) — error-budget mechanics behind the breach-day budget.
18. Rootly — [SLA vs SLO vs SLI](https://rootly.com/blog/sla-vs-slo-vs-sli-the-full-breakdown-for-reliable-systems), Dawiso — [Data SLA](https://www.dawiso.com/glossary/data-sla) — promise/target/measurement split.
19. Datafold — [7 dbt testing best practices](https://www.datafold.com/blog/7-dbt-testing-best-practices/) — known vs unknown unknowns; build-time results are no substitute for history.

**Triton-internal evidence (measured 2026-08-11):** `integrity_checks` volume/status distribution and chronic warn counts, `Jo/context/triton-context.md`; terminal statuses, `lib/dataIntegrity.ts:88,108,167,284`; history-write gate, `app/api/cron/integrity/route.ts:52,81–86`; DDL, `scripts/create-integrity-checks.sql`, `scripts/create-cron-runs.sql`; `stuff_plus_n`, `scripts/create-materialized-views.sql:105,323,374`; assertion costs, `02-declarative-expectations.md` §5.
