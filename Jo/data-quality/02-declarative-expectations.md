---
title: Declarative Expectations — Assertion Suites as Code, and the One That Fits Triton
domain: data-quality
tags:
  - expectations
  - great-expectations
  - dbt-tests
  - soda-core
  - pandera
  - deequ
  - elementary
  - assertions-as-code
sources_reviewed: 23
last_updated: 2026-08-11
---

# Declarative Expectations — Assertion Suites as Code, and the One That Fits Triton

## TL;DR

- **Every framework here reduces to one primitive: run a query, compare the result to a threshold, emit a structured pass/fail.** GX, dbt tests, SodaCL, Pandera, Deequ and Elementary differ almost entirely in the runtime you must host, not in what they can assert. (documented)
- **All of them assume infrastructure Triton does not have.** GX and Pandera need Python; dbt tests need a dbt project and a `dbt test` invocation; Soda needs a Python CLI plus a scan scheduler; Deequ needs Spark 3.1 + Scala 2.12 + Java 8; Elementary needs dbt *plus* a warehouse schema for its artifacts. (documented)
- **Triton already has an expectation suite and nobody has called it one.** `lib/dataIntegrity.ts` defines 8 checks against a `CheckResult` shape, persisted to `integrity_checks` by `/api/cron/integrity`. The abstraction is right; the implementation cannot fail. (measured, 2026-08-11)
- **In 95 run days and 776 results, `integrity_checks` has produced `fail` exactly zero times** — not because everything passed (`materialized_views` has warned 56 consecutive runs since 2026-06-14) but because no check *function* can return `fail`, and `warn` does not fail the cron run. (measured)
- **Two of the eight checks launder a query error into `pass`** (`lib/dataIntegrity.ts:108`, `:167`). A timeout is reported as clean data — the Stuff+ failure mode reproduced inside the tool built to detect it. (measured)
- **"Assertions run in milliseconds" is false here.** Trailing-7-day `stuff_plus` coverage — the exact assertion `data-reliability/01` §4.2 recommends — measured **9,923 ms cold / 529 ms warm**. The 7-day uniqueness check on `(game_pk, at_bat_number, pitch_number)` measured **18,302 ms cold / 4,509 ms warm**. Both blow the 8s `authenticator` cap. At 2 days: **16.4 ms**. (measured)
- **Cost tracks cold shared-buffer reads, not row count.** Identical plan, identical 25,506 rows: 5,536 disk reads → 9.9s; 67 reads → 0.53s. The nightly cron *is* the cold case. (measured)
- **The fix is a smaller window plus a metrics table, not a bigger timeout.** Scope live assertions to the 2–3 day ingest window (15–16 ms measured), persist one metric row per table per day, assert trailing-week rules against that ~7-row table. Deequ's Metrics Repository at 1/1000th the weight. (inferred from measured components)
- **Assertions catch known unknowns; only baselines catch unknown unknowns.** Elementary's z-score (default 3 SD, 2-day detection period) and Deequ's historical anomaly detection catch what nobody wrote a rule for — at the cost of weeks of history. Buy the cheap half first. (documented)
- **Build-time tests do not run continuously.** `dbt test` asserts when a model rebuilds; if nothing rebuilds, nothing re-asserts. dbt's own answer — a separate `dbt source freshness` run "at double your lowest SLA" — is an admission. Triton's version: assertions living only inside `/api/cron/pitches` never fire on nights that route dies at the 300s ceiling. (documented)
- **Severity must be three-way: `pass` / `breached` / `could-not-evaluate`.** GX encodes it as `raised_exception`, Soda as the `error` state. Every hand-rolled suite forgets it, and it is the state Triton's maps to `pass` today. (inferred)
- **Recommendation up front: adopt none of these tools; fix the suite Triton already has.** A typed `{name, sql, predicate, severity}` array, breaches that throw so `trackCronRun` records a failed run, `reportError` on the way out, every query date-scoped. ~200 lines, zero new infrastructure, and it would have caught the Stuff+ outage in April. (inferred)

---

## 1. What "declarative" actually buys you

A hand-written check and a declarative expectation compute the same thing. The difference is what surrounds it: a **stable name** you can trend on, a **versioned suite file** that shows up in diffs, a **uniform result shape**, an **enumerable** answer to "what do we actually assert?", and **persisted history** so you can tell *newly broken* from *broken since June*. That last one is why GX ships Data Docs, dbt ships `store_failures`, Elementary ships `elementary_test_results`, and Deequ ships a Metrics Repository. Triton's `integrity_checks` table already does it — the good half of what exists.

### 1.1 Known unknowns vs unknown unknowns

**Assertions** encode a threshold a human chose (`stuff_plus BETWEEN 0 AND 200`) and catch **known unknowns**: deterministic, no history required, no false positives if the threshold is right. **Anomaly detection** learns a baseline and flags deviation — **unknown unknowns**. Elementary uses a z-score over time-bucketed history (default 3 SD sensitivity, 2-day detection period); Soda offers `anomaly detection for row_count`; Deequ runs it over its metric store.

The asymmetry for a solo operator: assertions are cheap to write and impossible to write *enough* of; anomaly detection is expensive to trust and needs 21–28 days of history to mean anything (`data-reliability/01` §4.3). Buy assertions first. Both miss a third category — the assertion that exists but cannot run (§4).

### 1.2 Build-time tests don't run continuously

dbt's model, inherited by dbt-utils, dbt-expectations and Elementary, is that tests run when the DAG runs. Fine when every table is rebuilt nightly; a trap the moment a table is *ingested* rather than *built*, or when the job that would have run the tests is the job that died — the absence of a failure then being indistinguishable from a pass. Which is why `/api/cron/integrity` being its own route on its own schedule is right, and should stay that way.

---

## 2. The landscape, compared on the axis that decides it

The only question that matters: *what must be running for this check to execute?*

| Tool | Where it runs | Requires | How failures surface | Weight | Fits Triton? |
|---|---|---|---|---|---|
| **Great Expectations (Core 1.x)** | Python process; SQL pushed down via SQLAlchemy, or in-memory pandas/Spark | Python runtime, Data Context, scheduler to invoke Checkpoints | `ValidationResult` JSON; Checkpoint Actions; static-HTML Data Docs | High | **No** |
| **dbt data tests** | The warehouse — compiles to a `SELECT` of failing rows; 0 rows = pass | dbt project + profile + something invoking `dbt test` | `warn`/`error` per `severity`/`error_if`/`warn_if`; `--store-failures` → `dbt_test__audit` | Medium (nil if you run dbt) | **No (no dbt)** |
| **dbt-utils** | Same as dbt | `packages.yml` | Same | Low on dbt | No |
| **dbt-expectations** | Same as dbt — GX semantics in Jinja/SQL | dbt 1.7+ | Same | Low on dbt — **"no longer actively supported"** | No |
| **Soda Core / SodaCL** | Python CLI issuing SQL to the source | Python, data-source config, `soda scan` on a schedule | Per-check `pass`/`fail`/`warn`/`error`; optional Soda Cloud | Medium | **No** |
| **Pandera** | In-process, over a DataFrame | Python + pandas/polars/pyspark/ibis | `SchemaError`, or `SchemaErrors` + `failure_cases` frame under `lazy=True` | Low *if* Python exists | **No (no Python)** |
| **Deequ / PyDeequ** | Apache Spark cluster | Spark 3.1, Scala 2.12, Java 8 | `VerificationResult` per constraint; Metrics Repository; anomaly detection | Very high | **Absolutely not** |
| **Elementary** | dbt package + `edr` CLI | dbt project, warehouse schema, `on-run-end` hook | Fails like a dbt test; `elementary_test_results`; HTML report; Slack via `edr` | Med-high on dbt | **No** |

**Great Expectations** is the most complete model and the heaviest: Data Context → Data Source → Data Asset → Batch Definition → Expectation Suite → Validation Definition → Checkpoint → Actions. Its result object carries `success`, `element_count`, `unexpected_count`, `unexpected_percent` — and `raised_exception`. That last field is the point: **GX separates "the expectation was violated" from "the expectation blew up,"** the single idea here worth stealing wholesale. GX 1.0 simplified hard (Validator workflow, block-style Data Sources, `batch_request`/`batching_regex` all gone) and added `UnexpectedRowsExpectation`, which takes raw SQL as the check logic — a framework converging on what Triton would write by hand.

**dbt tests** are the cheapest model in the industry *if you already run dbt*, because a test is a `SELECT` and the warehouse does the work. Four generics ship in core (`unique`, `not_null`, `accepted_values`, `relationships`), configured per column with `severity`, `error_if: ">1000"`, `warn_if: ">10"` (defaults `error`, `!=0`, `!=0`); `unique` compiles to the `GROUP BY … HAVING count(*) > 1` any engineer would write. Singular tests are one-off `.sql` files whose filename is the test name. **dbt-utils** adds what core lacks — `unique_combination_of_columns`, `accepted_range`, `expression_is_true`, `recency`, `not_null_proportion`, `relationships_where`. That `not_null_proportion` exists is evidence "populated fraction ≥ X" is a recognized primitive, not a Triton invention. **dbt-expectations** ports 60+ GX expectations across seven categories and is explicitly unmaintained. dbt **unit tests** (v1.8+) are a different animal — static `given`/`expect` fixtures over SQL *logic*, not production data; Cas's territory, not Jo's.

**Soda Core / SodaCL** has the most readable syntax of the lot, and the closest to what Triton should write:

```yaml
checks for pitches:
  - missing_percent(stuff_plus) < 5
  - duplicate_count(game_pk) = 0
  - freshness(game_date) < 3d
  - schema
  - anomaly detection for row_count
  - failed rows:
      fail query: SELECT * FROM pitches WHERE stuff_plus NOT BETWEEN 0 AND 200
```

Results are `pass`/`fail`/`warn`/`error`, where `error` means *invalid syntax* — the three-state model again. Soda v4 moved to contract verification (`soda contract verify -ds ds_config.yml -c contract.yml`); Postgres is first-class. The blocker isn't the language, it's needing a second deployment target to run five queries `run_query` already runs.

**Pandera** validates DataFrames in memory — `pa.DataFrameSchema({"col": pa.Column(int, pa.Check.ge(0))})` or the class-based `DataFrameModel`, across pandas/polars/dask/pyspark/ibis, with `@check_input`/`@check_output`/`@check_types`. Under `lazy=True` it raises `SchemaErrors` carrying a `failure_cases` frame (`schema_context`, `column`, `check`, `failure_case`, `index`) — the best failure *report* here. Right tool for a payload mid-transform; Triton's transforms are TypeScript against an 8.89M-row Postgres table. The TS analogue is Zod at the ingest boundary — worth doing for the Savant payload, different doc.

**Deequ / PyDeequ**, from Schelter et al., *Automating Large-Scale Data Quality Verification* (VLDB 2018), contributes a declarative constraint API (`Check(CheckLevel.Error, …).hasSize(_ == 5).isComplete("id")`), analyzers computing reusable metrics, incremental computation over growing datasets, and anomaly detection on historical metric values. A non-starter as software here and a strong influence as design — **the Metrics Repository is the idea to steal** (§6.4).

**Elementary** is the unknown-unknowns layer bolted onto dbt: `on-run-end` parses run artifacts into warehouse tables, then `volume_anomalies`, `freshness_anomalies`, `dimension_anomalies`, `column_anomalies` and `schema_changes` run as native dbt tests, configured per model with a `timestamp_column`. The best answer here to "what about the failure I didn't anticipate" — and 100% contingent on running dbt.

---

## 3. Where failures surface, and why that's the real differentiator

| Tool | Failure lands in | Stops the pipeline? | Pages anyone? |
|---|---|---|---|
| GX | `ValidationResult` + Data Docs | Only if you branch on the Checkpoint result | `SlackNotificationAction` |
| dbt | non-zero exit; `dbt build` halts downstream on `error` | Yes, with `dbt build` | Only via your orchestrator |
| Soda | CLI exit code + scan output | Only if you check the exit code | Soda Cloud, or your scheduler |
| Pandera | raised exception, in-process | **Yes — it throws** | Whatever catches it |
| Deequ | `VerificationResult` status | No — you branch on it | No |
| Elementary | dbt test failure + `elementary_test_results` | Same as dbt | `edr` Slack integration |

**Pandera is the only one that fails by default.** Everything else returns a result object a human must remember to branch on — the mechanism behind almost every "we had tests and still shipped bad data" story, and exactly what neutered Triton's suite. The rule: **a breached expectation must throw, not return.** Returning is opt-in failure; throwing is opt-out.

---

## 4. Triton already has an expectation suite. It has never been able to fail.

All measured from the repo and the live database, 2026-08-11.

`lib/dataIntegrity.ts` exports 8 checks against a shared `CheckResult` type (`check_name`, `status: 'pass'|'warn'|'fail'|'remediated'`, `found`, `remediated`, `details`). `/api/cron/integrity` runs them under `Promise.allSettled` and writes each to `integrity_checks` (`scripts/create-integrity-checks.sql`). A real suite with a real results store. The findings:

**1 — No check function can return `fail`.** Every `return` uses `pass`, `warn`, or `remediated`. `fail` appears in exactly one place — `app/api/cron/integrity/route.ts:53`, when a check's *promise rejects*. A breach is a `warn`, a `warn` does not throw, so `trackCronRun` records `success`.

**2 — The history confirms it.** 776 results over **95 distinct run days**, 2026-05-08 → 2026-08-11:

| check_name | pass | warn | remediated | fail |
|---|---|---|---|---|
| `league_averages` | 97 | — | — | **0** |
| `materialized_views` | 2 | **56** | 39 | **0** |
| `new_pitch_names` | 43 | **54** | — | **0** |
| `orphaned_batters` | 97 | — | — | **0** |
| `orphaned_pitchers` | 97 | — | — | **0** |
| `pitch_baselines` | 50 | **47** | — | **0** |
| `season_constants` | 96 | 1 | — | **0** |
| `unknown_players` | 90 | — | 7 | **0** |

Zero `fail` rows, ever. `materialized_views` has warned every run since 2026-06-14, `pitch_baselines` since 2026-06-26, `new_pitch_names` 54 times with up to 8 unrecognized pitch names. **A `warn` with no escalation path is wallpaper.**

**3 — Query errors are laundered into `pass`.** At `lib/dataIntegrity.ts:108`, and identically at `:167`:

```ts
if (error || !orphans || orphans.length === 0) {
  return { check_name: 'orphaned_pitchers', status: 'pass', found: 0, remediated: 0,
           details: error ? { queryError: error.message } : {} }
}
```

A timeout reports **`pass`** and buries the reason in `details`. The 194 recorded passes across those two checks are indistinguishable from 194 failures-to-run.

**4 — The suite ran through the entire Stuff+ outage and could not see it.** `integrity_checks` starts 2026-05-08; coverage was already ~90% in May and 0% in August. Not one of the 8 checks looks at a derived column's populated fraction. Coverage is still the missing dimension (`data-reliability/01` §2).

**5 — Smaller defects.** `LIMIT 200` on the orphan checks caps `found`, so magnitude is unknowable. `checkLeagueAverages` asserts `COUNT(*) > 0` for the season — an *existence* check a stale-but-populated table passes forever. `checkMaterializedViews` probes with one player id, then calls `refresh_player_summary`/`refresh_batter_summary` *inside the check* — an assertion that remediates is no longer an assertion, and its 56-warn streak says the repair isn't working either. Two Supabase clients are imported into one file, so which timeout applies varies by check. `run_id` is recovered by re-querying `cron_runs` for a `running` row instead of being passed in — fragile under overlap, as the comments concede.

---

## 5. What an assertion actually costs here

`data-reliability/01` §4.2 says Tier-1 assertions "run in milliseconds and they never surprise you." **On `pitches` that is wrong.** All figures are `EXPLAIN (ANALYZE, BUFFERS)` against the live database, 2026-08-11.

| Assertion | Window | Rows | Buffers (hit / read) | Execution |
|---|---|---|---|---|
| `count(stuff_plus)/count(*)` coverage | 7 days | 25,506 | 351 / **5,536** | **9,923 ms** (cold) |
| same, immediately re-run | 7 days | 25,506 | 5,820 / 67 | **529 ms** (warm) |
| `(game_pk, at_bat_number, pitch_number)` duplicates | 7 days | 25,506 | 537 / **5,350** | **18,302 ms** (cold) |
| same, warm | 7 days | 25,506 | 5,887 / 0 | **4,509 ms** |
| same | **2 days** | 4,535 | 467 / 0 | **16.4 ms** |
| `pitcher` not in `players` (anti-join) | 7 days | 25,506 + 16,924 | 5,891 / 135 | **1,346 ms** |
| coverage + range + per-day, grouped | **3 days** | 9,078 | 1,166 / 0 | **15.3 ms** |

1. **Every plan used `idx_pitches_game_date`.** No seq scans on `pitches`. These are the *good* plans and they still blew the cap.
2. **Cost tracks cold buffer reads, not rows.** Same plan, same 25,506 rows: 5,536 reads → 9.9s; 67 reads → 0.53s. An 18.8× spread on identical work.
3. **The nightly cron is the cold case.** A 09:00 UTC job on an idle instance will not find `pitches` pages resident.
4. **7 days is not safely runnable through `run_query`; 2–3 days is, by three orders of magnitude.** A scoping decision, not a tuning problem.

Secondary: `players` is **16,924 rows**, not the 4,017 `CLAUDE.md` claims. `max(pitches.game_date)` is 2026-08-09 against a current date of 2026-08-11 — a normal **2-day** lag, so a naive `max(game_date) >= today - 1` rule would false-alarm nightly. Trailing-7-day `stuff_plus` coverage is **25,400 / 25,506 = 99.6%**: post-fix, healthy.

---

## 6. The shape that fits: a typed assertion suite in TypeScript

No new runtime, no new service. One file of expectations, one runner, one metrics table.

```ts
// lib/expectations/types.ts
export interface Expectation {
  name: string                       // stable trend key — never rename
  /** MUST be date-scoped and index-friendly: run_query is capped at 8s by authenticator's
   *  statement_timeout, and a 7-day scan of `pitches` measured 9.9s cold. Keep to <= 3 days. */
  sql: string
  predicate: (row: Record<string, any>) => string | null   // null = pass, string = breach message
  severity: 'warn' | 'error'
  skipIf?: () => boolean             // baseball has an off-season; assertions must not
  long?: boolean                     // escape hatch to run_query_long (120s) — justify every use
}

export interface ExpectationResult {
  name: string
  /** 'errored' = could not be evaluated. NEVER collapse this into 'pass'. */
  status: 'pass' | 'warn' | 'error' | 'errored' | 'skipped'
  observed: Record<string, any> | null
  message: string | null
  duration_ms: number
}
```

The three-state split — from GX's `raised_exception` and Soda's `error` state — is the whole point. `lib/dataIntegrity.ts:108` exists because that state had nowhere to go.

```ts
// lib/expectations/pitches.ts
const inSeason = () => { const m = new Date().getUTCMonth() + 1; return m >= 2 && m <= 11 }

export const PITCH_EXPECTATIONS: Expectation[] = [
  { // Freshness. Measured normal lag on 2026-08-11 is 2 days, so 3 is the alert line.
    name: 'pitches.freshness', severity: 'error', skipIf: () => !inSeason(),
    sql: `SELECT max(game_date)::text AS max_date, (CURRENT_DATE - max(game_date))::int AS lag_days
          FROM pitches WHERE game_date >= CURRENT_DATE - INTERVAL '30 days'`,
    predicate: (r) => r.max_date == null ? 'no pitches in the last 30 days'
      : r.lag_days > 3 ? `max(game_date)=${r.max_date}, ${r.lag_days}d behind (limit 3)` : null },

  { // Coverage AND range in one scan — 15.3 ms measured over the 3-day ingest window.
    // This is the assertion that would have caught the 2026 Stuff+ outage in April.
    name: 'pitches.stuff_plus.coverage_and_range', severity: 'error', skipIf: () => !inSeason(),
    sql: `SELECT count(*)::int AS n, count(stuff_plus)::int AS scored,
                 round(100.0*count(stuff_plus)/nullif(count(*),0),1)::float8 AS pct,
                 min(stuff_plus)::float8 AS lo, max(stuff_plus)::float8 AS hi
          FROM pitches
          WHERE game_date >= CURRENT_DATE - INTERVAL '3 days' AND pitch_type NOT IN ('PO','IN')`,
    predicate: (r) => r.n === 0 ? null              // no games; the volume check owns this
      : r.pct < 95 ? `stuff_plus coverage ${r.pct}% (${r.scored}/${r.n}), floor 95%`
      : (r.lo < 0 || r.hi > 200) ? `stuff_plus out of range [${r.lo}, ${r.hi}], expected [0,200]`
      : null },

  { // Natural-key uniqueness. 16.4 ms at 2 days, 18,302 ms at 7. Do not widen the window.
    name: 'pitches.natural_key.unique', severity: 'error',
    sql: `SELECT count(*)::int AS dupes FROM (
            SELECT game_pk, at_bat_number, pitch_number FROM pitches
            WHERE game_date >= CURRENT_DATE - INTERVAL '2 days'
            GROUP BY 1,2,3 HAVING count(*) > 1) d`,
    predicate: (r) => r.dupes === 0 ? null
      : `${r.dupes} duplicate (game_pk, at_bat_number, pitch_number) keys` },

  { // Referential integrity. 1,346 ms measured — the most expensive one that still fits.
    name: 'pitches.pitcher.fk_players', severity: 'warn',  // cron/integrity auto-creates these
    sql: `SELECT count(DISTINCT p.pitcher)::int AS orphans
          FROM pitches p LEFT JOIN players pl ON pl.id = p.pitcher
          WHERE p.game_date >= CURRENT_DATE - INTERVAL '3 days' AND pl.id IS NULL`,
    predicate: (r) => r.orphans === 0 ? null : `${r.orphans} pitcher ids missing from players` },

  { // Volume against the schedule, not a learned baseline. Cheap and seasonality-proof.
    name: 'pitches.volume_vs_schedule', severity: 'warn', skipIf: () => !inSeason(),
    sql: `SELECT count(DISTINCT game_pk)::int AS games, count(*)::int AS pitches
          FROM pitches WHERE game_date = CURRENT_DATE - INTERVAL '2 days'`,
    predicate: (r) => r.games === 0 ? 'no games ingested for D-2'
      : r.pitches / r.games < 200
        ? `${Math.round(r.pitches / r.games)} pitches/game (expect ~250-320) — partial ingest` : null },
]
```

Note what these deliberately are *not*: no `LIMIT 200` truncation, no full-season scan, no remediation inside a check, and no `game_year = 2026` predicate — use `game_date` ranges, which `idx_pitches_game_date` actually prunes.

```ts
// lib/expectations/run.ts  — sequential on purpose: /api/cron/integrity fires 8 checks
// concurrently at an instance where one 25k-row index scan measured 0.5s warm / 9.9s cold,
// and concurrency raises the odds that any single statement crosses the 8s cap.
export async function runExpectations(suite: Expectation[]): Promise<ExpectationResult[]> {
  const results: ExpectationResult[] = []
  for (const exp of suite) {
    if (exp.skipIf?.()) {
      results.push({ name: exp.name, status: 'skipped', observed: null, message: null, duration_ms: 0 })
      continue
    }
    const t0 = Date.now()
    try {
      const client = exp.long ? supabaseAdminLong : supabaseAdmin
      const { data, error } = await client.rpc(exp.long ? 'run_query_long' : 'run_query',
                                               { query_text: exp.sql })
      if (error) throw new Error(error.message)          // never launder into pass
      const row = (data as any[])?.[0]
      if (!row) throw new Error('assertion query returned no rows')
      const message = exp.predicate(row)
      results.push({ name: exp.name, status: message ? exp.severity : 'pass',
                     observed: row, message, duration_ms: Date.now() - t0 })
    } catch (err: unknown) {
      results.push({ name: exp.name, status: 'errored', observed: null,
                     message: err instanceof Error ? err.message : String(err),
                     duration_ms: Date.now() - t0 })
    }
  }
  return results
}

export function assertSuite(job: string, results: ExpectationResult[]): void {
  const breached = results.filter((r) => r.status === 'error' || r.status === 'errored')
  if (breached.length === 0) return
  const summary = breached.map((r) => `${r.name}: ${r.message}`).join('; ')
  reportError(new Error(`[${job}] ${breached.length} expectation(s) breached — ${summary}`), { job, results })
  throw new Error(`[${job}] expectations breached: ${summary}`)   // trackCronRun records 'error'
}
```

`errored` groups with `error`, not `warn`: an assertion that could not run is at least as alarming as one that failed, because you have no idea what the data looks like. Call it after ingest — `runExpectations` → persist results → `assertSuite('pitches', results)` — so the cron goes red while the ingested rows still commit. That is the *audit* half of Write-Audit-Publish (`data-reliability/01` §5.1), the only half that fits an upsert-in-place ingest.

### 6.4 The metrics table, so trailing-window assertions stop being expensive

The 7-day coverage assertion is desirable and measured at 9.9s cold. Don't widen the window — persist the metric.

```sql
CREATE TABLE data_quality_metrics (
  metric_date date NOT NULL, table_name text NOT NULL, metric_name text NOT NULL,
  value double precision, denom bigint,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_date, table_name, metric_name)
);
```

**Check what already exists before building this.** `scripts/create-materialized-views.sql:105` and `:323` already materialize `COUNT(p.stuff_plus)::int AS stuff_plus_n` on the pitcher-season views, refreshed nightly — so a season-level Stuff+ coverage assertion can read a small materialized table today, with no new infrastructure and no `pitches` scan at all. Build `data_quality_metrics` for the metrics that *aren't* already materialized (per-day granularity, other derived columns, other tables); don't duplicate `stuff_plus_n`.

The 3-day grouped query above already returns per-day counts — upsert one row per `(game_date, 'pitches', 'stuff_plus_coverage')`. The trailing-week rule then reads ~7 rows: `SELECT min(value), avg(value), count(*) FROM data_quality_metrics WHERE table_name='pitches' AND metric_name='stuff_plus_coverage' AND metric_date >= CURRENT_DATE - INTERVAL '7 days'`. Sub-millisecond, and it gains what the direct scan never had: **a trend**. "Coverage fell 99.5 → 90 → 18 over three months" becomes answerable — the query that would have made the Stuff+ decay visible as a slope rather than a cliff. Deequ's Metrics Repository, one table wide.

---

## 7. What Triton should do, in order

1. **Add the `errored` state; stop laundering query failures into `pass`.** Fix `lib/dataIntegrity.ts:108` and `:167` — a two-line change that turns 194 meaningless `pass` rows into honest ones. Nothing else matters while a timed-out check reports clean.
2. **Make breaches throw.** Add `assertSuite()` to `/api/cron/integrity` so `error`/`errored` fails the run via `trackCronRun` and routes through `reportError`.
3. **Ship the coverage-and-range expectation on `stuff_plus`** (§6). Measured 15.3 ms. This is the single check that closes the 2026 outage; extend the shape to command and deception once proven.
4. **Re-scope existing checks to `game_date` ranges.** The orphan checks filter `game_year = ${year}` and lean on `run_query_long` to survive it; a 3-day `game_date` window measured 1,346 ms and fits inside plain `run_query`. Drop the long-RPC dependency and the `LIMIT 200` truncation together.
5. **Read `mv_pitcher_season_stats.stuff_plus_n` before building anything** — `scripts/create-materialized-views.sql:105`, refreshed nightly, already reproduces the season coverage curve for free. Then create `data_quality_metrics` for the per-day and non-materialized metrics, and move every trailing-window assertion onto it. That is what makes 7-day, 30-day and season-long rules affordable.
6. **Triage the three chronic warns** — `materialized_views` (56), `new_pitch_names` (54), `pitch_baselines` (47). Either they are real, in which case they are `error` and should have been paging since June, or the thresholds are wrong. Fix these *before* adding checks, or the new ones inherit the same fate.
7. **Split assertion from remediation in `checkMaterializedViews`** — one expectation reporting staleness, one explicitly-named repair step. An assertion that heals itself hides its own failure rate.
8. **Only then consider anomaly detection** — season-aware, off `data_quality_metrics`, and not before ~30 days of rows exist in it.

**Anti-recommendation.** *Do not adopt Great Expectations, Soda Core, dbt tests, dbt-expectations, Pandera, Deequ, or Elementary.* None can run in Triton's deploy target. GX/Soda/Pandera/Deequ need a Python or JVM runtime Vercel's Next.js functions do not provide, so adopting any means a second deployment, a second secret store, and a second scheduler to execute five queries `run_query` already executes. dbt tests are the cheapest option in the industry *conditional on running dbt* — and Triton's transformations live in Postgres functions (`refresh_league_averages`), materialized views, and TypeScript route handlers, so adopting dbt means re-platforming the entire compute layer to gain `unique` and `not_null`. Elementary is strictly downstream of that decision, and dbt-expectations — the package that would carry GX semantics into it — is explicitly unmaintained. The expectation *concepts* are worth every minute; the runtimes are not.

**What would change the answer:** dbt entering the stack for real (remodel `league_averages`, `pitch_baselines`, `pitcher_season_command` and the matviews as dbt models and `dbt test` + dbt-utils + Elementary become nearly free — a platform decision, not a data-quality one); a Python worker appearing in the deploy path (a plausible outcome of the biomechanics C3D work, at which point Soda Core is a cheap add-on and Pandera is the right validator for C3D/TrackMan frames before they reach Postgres); table count crossing ~50 with more than one operator, where hand-maintained thresholds stop scaling; or someone other than Trevor needing to read the results, which is what Data Docs and the Elementary report exist for.

Cross-references: `01-data-quality-dimensions.md` for which dimension each assertion covers; `03-constraint-design-postgres.md` for the assertions that belong in `CHECK`/`UNIQUE`/`FK` constraints instead of nightly queries — a `UNIQUE (game_pk, at_bat_number, pitch_number)` index makes §6's duplicate expectation redundant and enforces it at write time, which is strictly better; `data-reliability/01-pipeline-observability-fundamentals.md` §4.2, whose "assertions run in milliseconds" claim §5 corrects with measured plans.

**Single highest-leverage next action:** change `status: 'pass'` to `status: 'errored'` in the two error branches of `lib/dataIntegrity.ts`, and make `/api/cron/integrity` throw on any non-`pass`/`warn` result. The smallest edit that converts an expectation suite which has never failed into one that can.

---

## Sources

1. Great Expectations — [GX Core overview](https://docs.greatexpectations.io/docs/core/introduction/gx_overview/) — the full component chain, Checkpoints and Actions.
2. Great Expectations — [Try GX Core](https://docs.greatexpectations.io/docs/core/introduction/try_gx) — quickstart; `ValidationResult` fields incl. `raised_exception`.
3. Great Expectations — [Create a Checkpoint with Actions](https://docs.greatexpectations.io/docs/core/trigger_actions_based_on_results/create_a_checkpoint_with_actions) — `SlackNotificationAction`, `UpdateDataDocsAction`.
4. Great Expectations — [Configure Data Docs](https://docs.greatexpectations.io/docs/core/configure_project_settings/configure_data_docs/) — static-site generation via `SiteBuilder`.
5. Great Expectations — [Changes to know for GX Core 1.0](https://greatexpectations.io/blog/changes-to-know-for-gx-core-1-0/) — what 1.0 removed; `UnexpectedRowsExpectation`.
6. dbt Labs — [Add data tests to your DAG](https://docs.getdbt.com/docs/build/data-tests) — singular vs generic, compiled SQL, `--store-failures`.
7. dbt Labs — [Test severity](https://docs.getdbt.com/reference/resource-configs/severity) — `severity`/`error_if`/`warn_if` defaults and threshold syntax.
8. dbt Labs — [Unit tests](https://docs.getdbt.com/docs/build/unit-tests) — `given`/`expect` fixtures, v1.8+, not for production runs.
9. dbt Labs — [Source freshness](https://docs.getdbt.com/docs/deploy/source-freshness) — `warn_after`/`error_after`, `loaded_at_field`, "double your lowest SLA".
10. dbt Labs — [dbt-utils](https://github.com/dbt-labs/dbt-utils) — `unique_combination_of_columns`, `accepted_range`, `not_null_proportion`, `recency`.
11. calogica — [dbt-expectations](https://github.com/calogica/dbt-expectations) — 60+ ported GX expectations, seven categories; **"no longer actively supported"**.
12. Soda — [SodaCL metrics and checks](https://docs.soda.io/soda-documentation/soda-v3/sodacl-reference/metrics-and-checks) — check catalogue, `failed rows`, anomaly detection, result states.
13. sodadata — [soda-core](https://github.com/sodadata/soda-core) — v4 contract verification, packaging, data sources.
14. Pandera — [Documentation home](https://pandera.readthedocs.io/en/stable/) — `DataFrameSchema` vs `DataFrameModel`, backends, validation decorators.
15. Pandera — [Lazy validation](https://pandera.readthedocs.io/en/stable/lazy_validation.html) — `lazy=True`, `SchemaErrors`, the `failure_cases` report.
16. awslabs — [deequ](https://github.com/awslabs/deequ) — constraints, analyzers, Metrics Repository; Spark/Scala/Java requirements.
17. awslabs — [python-deequ (PyDeequ)](https://github.com/awslabs/python-deequ) — the four modules and the Python `VerificationSuite` API.
18. Schelter et al. — [Automating Large-Scale Data Quality Verification](https://www.vldb.org/pvldb/vol11/p1781-schelter.pdf), PVLDB 11(12), 2018 — declarative constraints, incremental computation, historical-metric anomaly detection. Deequ's origin.
19. Elementary — [Data tests introduction](https://docs.elementary-data.com/data-tests/introduction) — the anomaly and schema test catalogue.
20. elementary-data — [dbt-data-reliability](https://github.com/elementary-data/dbt-data-reliability) — `on-run-end` artifact capture, `elementary_test_results`, `edr`.
21. Elementary — [freshness_anomalies](https://www.elementary-data.com/dbt-tests/freshness-anomalies) — YAML config and time-bucketed comparison mechanics.
22. Elementary — [Anomaly Detection Tests: A Comprehensive Guide](https://www.elementary-data.com/post/anomaly-detection-tests-a-comprehensive-guide) — training/detection/algorithm; z-score, 3 SD, 2-day detection.
23. Datafold — [7 dbt testing best practices](https://www.datafold.com/blog/7-dbt-testing-best-practices/) — known vs unknown unknowns; limits of build-time assertions.

**Triton-internal evidence (measured 2026-08-11):** `lib/dataIntegrity.ts` (8 checks, `CheckResult`, the `status: 'pass'`-on-error branches at `:108` and `:167`); `app/api/cron/integrity/route.ts` (`fail` produced only at `:53`, on promise rejection); `scripts/create-integrity-checks.sql`; `lib/cronTracker.ts`; `lib/observability.ts` (`reportError` Sentry TODO); `app/api/cron/pitches/route.ts`. Live-database measurements — `integrity_checks` history (776 rows, 95 run days, 0 `fail`), `players` row count (16,924), `max(pitches.game_date)` lag, trailing-7-day `stuff_plus` coverage (99.6%), and all `EXPLAIN (ANALYZE, BUFFERS)` timings in §5 — logged in `docs/Queries.md` under `## 2026-08-11`.
