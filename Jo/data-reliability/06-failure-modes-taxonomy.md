---
title: Failure Modes Taxonomy — The Catalogue, and How to Detect Each One
domain: data-reliability
tags:
  - failure-modes
  - silent-failure
  - schema-drift
  - late-arriving-data
  - poison-records
  - dead-letter-queue
  - retry-storms
  - detection-strategy
sources_reviewed: 22
last_updated: 2026-08-11
---

# Failure Modes Taxonomy — The Catalogue, and How to Detect Each One

## TL;DR

- **Sort failure modes by whether they self-report, not by which component broke.** A crash announces itself; a swallowed exception, an empty upstream response and a dropped parse row look identical to a healthy run. Each silent mode needs its own detector. (inferred)
- **Triton's entire failure history is in the silent class.** `stuff_plus` coverage decayed 99.5% → 90% → 18% → 4% → 0% across 2026; the error was caught, `console.error`'d, discarded, and the cron returned 200 nightly. (measured)
- **The most dangerous line in the ingest is a length check.** `app/api/update/route.ts:87` — `if (csv.length < 100) return { fetched: 0, inserted: 0, errors: 0, … }` — makes "Savant returned an error page" and "no games today" the same outcome, and calls both success. (measured)
- **Triton parses Savant CSV by trusting row 0 as the schema** (`update/route.ts:117–133`). A renamed column fails the batch, fails the per-row retry 500 times, increments `errors` — and nothing asserts on `errors > 0`. (measured)
- **`if (vals.length < numHeaders) continue` (line 125) drops records with no counter and no quarantine.** A quoting change breaking 5% of Savant rows would be 5% silent data loss. (measured)
- **Triton already has one correct dead-letter implementation — in a script, not a cron.** `scripts/download-pitch-videos.ts`: `pending → downloaded | missing | failed`, `MAX_ATTEMPTS = 6`, attempts persisted per row. The nightly pitch ingest has none. (measured)
- **Vercel Cron is best-effort, not at-least-once:** delivery "is best effort," it "can also occasionally invoke the same scheduled run more than once," and "Vercel will not retry an invocation if a cron job fails." A missed run creates **no log at all**. (documented)
- **`vercel.json` fires three jobs at `0 9 * * *`** — `pitches`, `milb-pitches`, `roster` — contending for one Supavisor pool and one 8s-capped RPC path. Google's SRE book names this the *moiré load pattern*. (measured / documented)
- **Two cron routes exist with no schedule:** `app/api/cron/challenges/` and `app/api/cron/newsletter/` have handlers but no `vercel.json` entry, while `.claude-memory/MEMORY.md` records the newsletter cron as `0 12 * * *`. An unscheduled job produces no error, no log, no failed run. *(verify)* (measured)
- **The 8s `authenticator` `statement_timeout` turns a capacity problem into a correctness problem.** Postgres aborts and rolls back the whole statement; on `pitches` (8.89M rows, 29 indexes, 4.8 GB of index) ~8k rows per UPDATE passes, ~11k times out. The job doesn't fail — it *ages into failing*. (measured / documented)
- **Retries are the mode most likely to turn a small outage into a large one.** AWS: no-jitter backoff "not only takes more work, but also takes more time than the jittered approaches." Triton has no shared retry policy — call-site timeouts run 8s to 120s, backoff appears once. (documented / measured)
- **You can't enumerate every failure, but you can enumerate the five signals they surface in:** run outcome, row delta, column coverage, value distribution, cross-source disagreement. Instrument those and the long tail is covered by construction. (inferred)

---

## 1. The organizing principle

Most taxonomies sort by component — source / transform / sink. Wrong axis for an operator: it doesn't tell you what to build. Sort by **what the failure does to your observability surface**.

| Class | Definition | Who finds it | What you must build |
|---|---|---|---|
| **Loud** | Throws, 500s, kills the process | The platform | Route the error to a human |
| **Silent-success** | Returns 200 having done nothing, or part of something | Nobody, for months | An assertion on the *data*, not the run |
| **Deferred** | Right at write time, wrong later (late data, drift, restatement) | A confused analyst | Reconciliation, as-of comparison |
| **Amplifying** | Failure that increases load (retry storms, overlapping runs) | Everything else, at once | Locks, jitter, circuit breakers |

Triton handles exactly one — Loud — and incompletely, because `lib/observability.ts:35` still reads `// TODO(observability): if (process.env.SENTRY_DSN) Sentry.captureException(...)`. Every mode below is graded against what would happen *today*.

---

## 2. Class A — Silent success

### 2.1 Silent partial write

**Mechanism.** A job completes step 1 (ingest), fails step 2 (derive), and returns step 1's result. Rows exist; the column that makes them useful does not.

**Triton (measured).** The 2026 Stuff+ outage. Row counts were perfect all season while `applyStuffPlusForDateRange` crossed the 8s cap, and the league average moved only ~0.8 because `AVG()` skips NULLs.

**Detection.** Don't monitor rows — monitor the **populated fraction of each derived column over a trailing window**, against a floor:

```sql
SELECT game_date, count(*) AS pitches, count(stuff_plus) AS scored,
       round(100.0 * count(stuff_plus) / count(*), 1) AS coverage_pct
FROM pitches WHERE game_date >= current_date - 7 GROUP BY 1 ORDER BY 1;
-- assert min(coverage_pct) >= 95 for every day older than the ingest lag
```

Two seconds on an indexed column, and the one assertion that would have caught the outage in April instead of August (`03-volume-completeness-monitoring.md` §3; NULL mechanism in `data-quality/07-null-semantics-missingness.md`). The applied fix — `/api/cron/pitches` inspects `results[gt].stuff_plus.ok` and throws so `trackCronRun` records red, while ingested pitches still commit — is the right shape: **fail loudly, commit what's good.** It fixes one instance; the detector generalizes.

### 2.2 Swallowed exception

**Mechanism.** `catch` that logs and continues — Wikipedia's *error hiding*; AWS CodeGuru treats "catch and swallow exception" as a named defect class.

**Triton (measured).** Not isolated to the Stuff+ path. Across `app/api/cron/*/route.ts`, `catch` blocks far outnumber `reportError` calls — `briefs` (13 catches / 10 `console.error`), `refresh` (8 / 0), `janitor` (7 / 4), `player-stats` (3 / 4). `/api/cron/integrity/route.ts` ends with a `catch` returning 500 **without** `reportError`, so total failure of the integrity job is itself silent.

**Detection.** (1) *Grep is a monitor:* a `catch` containing `console.error` but no `throw` and no `reportError` is the exact outage shape — make it a CI check. (2) *Runtime:* a caught-and-continued error should still increment a `soft_errors` key in the `counts` payload `trackCronRun` already accepts. Assert zero.

**The judgement call.** `trackCronRun`'s own tracking writes are correctly best-effort ("tracking must never break the actual job"), as is `purgeExpired()`. The rule: **a catch may swallow only if the swallowed work is not the job's product.** Scoring is the product; cache purging is not.

### 2.3 Empty-response-as-success

**Mechanism.** Upstream returns 200 with an empty or error body; zero records is treated as valid, so broken upstream and quiet day become indistinguishable.

**Triton (measured).** `update/route.ts:87` returns `errors: 0` → `totalInserted = 0` in `/api/cron/pitches` → `/api/cron/refresh` gates itself off. An upstream outage silently disables the whole downstream chain, and no schedule cross-check exists in the path.

**Detection.** Expected-vs-actual, not zero-vs-nonzero. The expectation is free — `/api/cron/player-stats` already calls the MLB Stats API, and `statsapi.mlb.com/api/v1/schedule?date=…` returns the games played. Assert `count(DISTINCT game_pk) FROM pitches WHERE game_date = D` equals the scheduled game count and fail listing the missing `game_pk`. Game-level completeness beats row-count anomaly detection because the expectation is **enumerable** — you know the names of the things that should exist (`03-volume-completeness-monitoring.md` §2).

### 2.4 Silent record drop in the parser

**Mechanism.** Defensive parsing that skips malformed input without counting it. Robustness and blindness are the same code.

**Triton (measured).** `update/route.ts:125` (`if (vals.length < numHeaders) continue`) and line 133 (`if (row.game_pk) rows.push(row)`) both drop rows to nowhere.

**Detection: quarantine, don't drop.** The Lakeflow expectations pattern is the reference — route failing records to a table carrying *what failed, when, and why* while the main flow continues. Minimum shape: `ingest_rejects(source, window_date, reason, raw, detail jsonb, created_at)` with `reason ∈ {field_count_mismatch, missing_game_pk, upsert_error}`. Assert empty daily, and keep the rows so the next incident starts with evidence instead of speculation.

---

## 3. Class B — Upstream contract failures

### 3.1 Schema drift

| Sub-mode | Example | Triton behavior today | Loud or silent? |
|---|---|---|---|
| **Additive** | Savant adds `bat_speed_v2` | New key → PostgREST rejects the batch | Loud-ish |
| **Rename** | `pfx_x` → `pfx_x_ft` | Old column stops filling; new one rejected | **Silent per-column** |
| **Type change** | numeric field ships `"12.3 mph"` | `!isNaN(Number(v))` fails → text → insert error | Mixed |
| **Semantic** | same column, changed units | Nothing rejects it. Values look fine and are wrong. | **Fully silent** |

**Exposure (measured).** The parser derives its schema from the CSV's own header row, with one defense (`if (k.startsWith('Unnamed')) delete r[k]`, line 141); everything else is adjudicated by Postgres on upsert. That is better than it sounds — **the database is the schema contract**, and an unknown column is a hard error rather than silent loss. The gap is what happens next: the batch fails, the per-row retry fails 500 times, `errors` climbs, and *nothing asserts on `errors`*.

**Detection, cheapest first.**

1. **Assert the error counter.** `syncPitches` already computes `errors` (line 145). Surface it in `cron_runs.counts`; fail the run when non-zero. One line, closing every sub-mode that reaches the database.
2. **Header-set hashing.** Persist a sorted hash of the CSV header set per run to `system_metadata`; diff nightly. A changed hash isn't a failure — it's notification that the contract moved. Additions are fine; disappearances are not.
3. **Semantic drift needs distribution monitoring, not schema monitoring.** Only a shift in `p01`/mean/`p99` against a trailing baseline catches a units change (`data-quality/04-distribution-drift-detection.md`).

**Live instance (measured).** `milb_pitches.events` uses Title Case (`Strikeout`, `Home Run`) where `pitches.events` uses lowercase (`strikeout`, `field_out`), normalized ad hoc per query — a semantic contract held in a human's head. It belongs in a CHECK constraint or a normalizing view.

### 3.2 Late-arriving data and restatement

**Mechanism.** A record for day D arrives after the job for D ran, and a "last processed timestamp" watermark never revisits it. Worse: upstream *revises* an already-ingested value and an `IS NULL`-guarded pipeline never picks it up.

**Triton's mitigation (measured, and it is good).** `/api/cron/pitches` syncs a **3-day trailing window** and upserts on `(game_pk, at_bat_number, pitch_number)` — the standard watermark-minus-buffer pattern with `buffer_days = 3`, the common default. With an idempotent upsert it makes the pipeline self-healing across missed runs, the property that makes Vercel's best-effort delivery survivable (`05-orchestration-scheduling.md` §4).

**Residual holes.** Data later than 3 days is never revisited, silently. And the repaired backfill route defaults to `?mode=repair` with a `stuff_plus IS NULL` guard — correct for gap-filling, but by construction it can never *correct* an already-scored row whose inputs changed. `?mode=rescore` exists for that and must be run deliberately.

**Detection.** Measure the arrival tail rather than assuming it: `max(created_at::date - game_date)` per `game_date` over 30 days sets `buffer_days` empirically. *(verify — assumes `pitches` carries an ingest timestamp; without one, `buffer_days = 3` is folklore, not a measurement.)* Then run a **weekly backward completeness sweep** over the trailing 30 days (game counts + coverage), closing the only real hole in an otherwise sound design.

---

## 4. Class C — Record-level failures

### 4.1 Poison records and partial-batch failure

**Mechanism.** One bad record fails the whole batch — the Kafka *poison pill*, where one malformed record blocks a partition. The database analogue: a 500-row upsert where one row violates a constraint and all 500 roll back.

**Triton (measured).** `update/route.ts:150–169` handles this correctly *and* incompletely:

```ts
const { error } = await supabase.from('pitches').upsert(batch, upsertOpts)
if (!error) { inserted += batch.length; continue }
// One bad row fails the whole batch. Isolate it: retry each row individually…
```

The isolation retry is the right instinct — 499 good rows still land. Three problems: **no dead-letter destination** (failed rows are `console.error`'d; Vercel logs rotate and the evidence is gone); **500× request amplification**, which under a systemic cause degrades *every* batch and explodes runtime against the 300s `maxDuration` ceiling; and **no circuit breaker** — after N consecutive whole-batch failures the right move is to stop and alert, not grind through 8,000 individual upserts.

**Detection.** Adopt the SQS/Kafka DLQ contract: bounded attempts, then *park* the record in a terminal state — "keeping the DLQ as a terminal state rather than another retry tier." Triton already has a correct implementation in the wrong place, `scripts/download-pitch-videos.ts`: `pending → downloaded` (file on disk), `pending → missing` (terminal, not retried), `pending → failed` (attempts++, up to `MAX_ATTEMPTS = 6`). Status column, attempt counter, terminal state, and a distinction between *retryable* and *permanently absent*. Port it to `ingest_rejects` (§2.4) and the detector is trivial: assert the table empty for the last day. **A DLQ you never query is a landfill.**

### 4.2 Referential orphans

**Triton status (measured) — covered.** `/api/cron/integrity` runs eight checks (`checkUnknownPlayers`, `checkOrphanedPitchers`, `checkOrphanedBatters`, `checkNewPitchNames`, `checkSeasonConstants`, `checkMaterializedViews`, `checkLeagueAverages`, `checkPitchBaselines`), writes to `integrity_checks`, several **self-remediate** against the MLB People API, and `Promise.allSettled` records a rejected check as `fail` rather than killing the run. Best-instrumented job in the repo; the template the others should follow.

**Its own subtle failure mode.** It finds its `run_id` by selecting the most recent `cron_runs` row with `status = 'running'` for job `integrity`. Under Vercel's documented duplicate invocations, two concurrent runs can attribute checks to each other's `run_id`; `.maybeSingle()` tolerates the ambiguity rather than resolving it. The clean fix is for `trackCronRun` to **hand the `run_id` to its callback**.

---

## 5. Class D — Resource, concurrency, amplification

### 5.1 Statement timeout — Triton's signature failure

**Mechanism (documented).** Postgres: *"Abort any statement that takes more than the specified amount of time."* The abort rolls back the whole statement — there is no partial-statement commit. Here the value is **8s on `authenticator`**, and because `SET ROLE` doesn't re-apply `rolconfig`, `service_role` inherits it: every `run_query` and `run_mutation` is capped at 8s regardless of client timeouts.

**Why it presents as a data problem.** A timeout on a read returns an error to a user who retries. A timeout on the nightly derive step returns an error to a `catch` block, and the *data* is what's missing. The ~8k-passes / ~11k-fails threshold is a function of table growth, so the job ages into failing.

**Detection — the one that predicts rather than detects.** Track statement duration as a fraction of the cap and alert on **margin**: `p95(statement_ms) / 8000 > 0.6` means weeks, not days. `cron_runs.duration_ms` exists; the missing piece is per-step timing inside the run. Highest-value monitor Triton doesn't have — it would have flagged the Stuff+ path around April. (inferred; worth building and measuring.)

Mitigations in place: one statement per day (~4k rows, ~1.4s each) in `applyStuffPlusForDateRange`; `run_query_long` (120s) adopted by `scripts/backfill-pitch-videos.ts` when it independently hit the same wall. There is **no `run_mutation_long`** — the read side has an escape hatch, the write side has only chunking.

### 5.2 Connection exhaustion

**Mechanism (documented).** Supavisor returns "Max client connections reached" past its cap; in session mode the ceiling is Pool Size per role+database, and pooler limits are tied to compute size. The two named causes are insufficient pool size and **slow queries that prevent connections from being released**.

**Exposure (inferred).** Serverless is the classic amplifier — each function instance opens its own connections, no pool shared across instances. Three crons at `0 9 * * *` (§5.4) plus user traffic plus a manually-kicked backfill is the realistic worst case. Nothing measures it.

**Detection.** Alert on the ratio, not the error — by the time you see the error you are already dropping work: `count(*) FROM pg_stat_activity` against `current_setting('max_connections')`, alerting at 0.7. Watch `idle in transaction` specifically: Postgres notes that an open transaction "prevents vacuuming away recently-dead tuples," tying connection hygiene to the bloat problem on `pitches` (1.44M dead tuples measured 2026-08-11).

### 5.3 Retry storms

**Mechanism (documented).** Naive retries add load to a system already failing. Google's SRE book: with too many or misconfigured workers, "the servers on which they run will be overwhelmed, as will the underlying shared cluster services." AWS's simulation is definitive — no-jitter backoff loses on both work and time, and full jitter (`sleep = random(0, min(cap, base * 2 ** attempt))`) more than halved call counts at 100 competing clients. Backoff fixes *how often* one client retries; only jitter fixes synchronization.

**Exposure (measured).** No shared policy. Call-site timeouts: 120s (`update/route.ts:82`), 60s (`lib/syncBatTracking.ts:118`), 30s (`app/api/update/milb/route.ts:117`), 20s (`lib/pitchVideos.ts:17`), 8s (`lib/dataIntegrity.ts:31`, `app/api/pitch-video/route.ts:99`). Backoff appears once in application code (`lib/useChatConnection.ts:179`, a WebSocket reconnect). The realistic storm here isn't a client stampede — it's §4.1 turning one systemic failure into 500× the requests inside a 300s budget.

**Detection.** Retries are invisible unless counted. Emit `attempts` alongside `rows_written` in `cron_runs.counts` and alert on **retry rate**, not retry failure — a climbing retry count reports upstream degradation before it becomes an outage. Pair bounded retry with a circuit breaker: retry transient faults, fail fast on persistent ones.

### 5.4 Overlapping runs and moiré load

**Mechanism (documented).** Vercel: *"If your cron job runs longer than the interval between invocations, Vercel can trigger a second instance while the first is still running. This can lead to race conditions, duplicate processing, or data corruption."* The multi-pipeline version is Google's **moiré load pattern** — pipelines whose executions "occasionally overlap, causing them to simultaneously consume a common shared resource."

**Triton (measured, from `vercel.json`).** Three jobs share `0 9 * * *`: `pitches`, `milb-pitches`, `roster`. Two more share `0 8 * * *` (`abs`, `cleanup`). `/api/cron/refresh` starts at `09:10` on a **fixed offset, not a completion signal**, while `/api/cron/pitches` carries `maxDuration = 300`. If pitches runs long, refresh starts mid-write and its gate reads a `pitches_last_run` marker from the *previous* night.

**Detection & prevention.** `cron_runs` already holds the evidence — `SELECT job, count(*) … WHERE status='running' GROUP BY 1 HAVING count(*) > 1`, plus a self-join on `started_at`/`finished_at` for cross-job overlap. Prevent by staggering the 09:00 crons 3–5 minutes apart (one file, zero risk) and taking an advisory lock per job — `download-pitch-videos.ts` already implements a PID-checked single-instance lock for exactly this reason. And fix the gate: `/api/cron/refresh` should require `pitches_last_run.date == today` plus a terminal status, not merely `totalInserted > 0`.

---

## 6. Class E — Scheduling and time

### 6.1 Missed invocation and the orphaned job

**Mechanism (documented).** Vercel Cron delivery "is best effort"; on a transient network error "your function does not execute, and **no runtime log is created for that scheduled run**." A missed run is invisible by construction — you cannot find it in logs, because there are none. Only a dead-man's switch catches it (`04-alerting-oncall-design.md` §2).

**The worse variant.** `app/api/cron/challenges/` and `app/api/cron/newsletter/` have route handlers and no `vercel.json` entry, while `.claude-memory/MEMORY.md` records the newsletter cron as `0 12 * * *`. If that schedule was removed rather than deliberately retired, the job has not run since — no error, no log, no failed run. *(verify with Trevor before calling it an incident.)* The inverse hazard is in the same docs: a typo'd path "generates a 404 error. However, **Vercel still executes your cron job**" — a green-looking invocation that does nothing.

**Detection.** (1) *Heartbeat per job:* `SELECT job, max(started_at) FROM cron_runs GROUP BY 1` against each job's expected cadence; anything older than 2× its interval is dead. One query catching missed runs, removed schedules and typo'd paths. (2) *Config-vs-code reconciliation:* a CI check that every directory under `app/api/cron/` appears in `vercel.json` and vice versa. Twenty lines; would have caught both orphans at commit time.

### 6.2 Clock skew, timezones, DST

**Mechanism.** Clock skew breaks ordering and boundary logic — "last N minutes" queries miss records, `created_at` ordering lies, last-write-wins picks the wrong write. Inside one Postgres instance, skew isn't the problem; **timezone boundary logic is**.

**Triton (measured / inferred).** `/api/cron/pitches` calls `ymdInTimeZone()` and computes its window on the **ET calendar, not UTC** — correct, since a "game date" is an ET concept and a UTC-derived date misclassifies West Coast night games. But the schedule is fixed at `0 9 * * *` UTC: 05:00 ET under EDT, 04:00 ET under EST. The run drifts an hour against Savant's publication schedule twice a year in opposite directions. The 3-day window absorbs it; a 1-day window would not. The buffer is doing more work than it appears to.

**Detection.** Monitor what clock errors *produce*, not clocks: boundary anomalies. Assert that no `game_date` in the trailing 30 days falls below 40% of the 30-day median for days with scheduled games.

### 6.3 Watermark drift

**Mechanism.** The job's "where I left off" diverges from reality — usually because the watermark is written before the work is confirmed, or a failed run advances it anyway.

**Triton (measured).** `/api/cron/pitches` upserts `pitches_last_run` into `system_metadata` with `.then(() => {}, () => {})` — marker-write errors discarded — and writes it *before* the Stuff+ outcome is evaluated. The marker can claim success for a night that then failed, and that marker is what `/api/cron/refresh` gates on.

**Detection.** Don't trust the watermark; **derive it.** `max(game_date)` plus per-day coverage in `pitches` is ground truth. Assert marker-vs-derived agreement daily; disagreement means one of them is lying and you want to know which.

---

## 7. Detection strategy summary

**Signal** is what changes when the mode fires. **Monitor today** is what would actually catch it as the repo stands on 2026-08-11.

| # | Failure mode | Class | Signal | Detection strategy | Monitor today |
|---|---|---|---|---|---|
| 1 | Silent partial write | A | Derived-column coverage falls; rows unchanged | Coverage floor ≥95%/day, trailing 7d | **None** |
| 2 | Swallowed exception | A | Nothing — unless counted | CI grep for `catch` w/o `throw`/`reportError`; `soft_errors` | **None** |
| 3 | Empty upstream response | A | `inserted = 0` on a day with games | Game count vs MLB schedule for D | **None** |
| 4 | Silent parse-row drop | A | Rows low vs expectation, no error | Quarantine to `ingest_rejects`, assert empty | **None** |
| 5 | Schema drift — additive/rename | B | `errors > 0`; a column stops filling | Assert `errors = 0`; header-set hash diff | **None** (`errors` computed, unasserted) |
| 6 | Schema drift — semantic/units | B | Distribution shift, no error | p01/mean/p99 vs trailing baseline | **None** |
| 7 | Late-arriving data | B | Days grow after the window closes | Arrival-lag histogram; weekly 30-day sweep | Partial — 3-day window mitigates, doesn't detect |
| 8 | Upstream restatement | B | Values change for ingested rows | Periodic `?mode=rescore` + checksum diff | **None** |
| 9 | Poison record / batch failure | C | `errors` climbs; duration spikes 500× | DLQ asserted empty; circuit-break after N | Partial — isolation retry, no DLQ |
| 10 | Referential orphan | C | Orphan count > 0 | Anti-join fact → dimension | ✅ `/api/cron/integrity` (self-remediating) |
| 11 | Statement timeout (8s cap) | D | Error at call site; missing derived data | **p95 duration ÷ 8000 > 0.6** (predictive) | Partial — `duration_ms`, unasserted |
| 12 | Connection exhaustion | D | "Max client connections reached" | `pg_stat_activity` total/max > 0.7; idle-in-txn | **None** |
| 13 | Retry storm | D | Attempts and duration climb together | Emit `attempts`; alert on rate, not failure | **None** |
| 14 | Overlapping runs / moiré | D | Two `running` rows; duration variance | Concurrency query; advisory lock; stagger | Partial — orphan reconciler infers it after 30 min |
| 15 | Missed invocation | E | **No log at all** | Dead-man switch on `max(started_at)` per job | **None** |
| 16 | Orphaned/unscheduled job | E | Nothing, ever | CI reconcile `app/api/cron/*` ↔ `vercel.json` | **None** — 2 live cases *(verify)* |
| 17 | Function killed (timeout/OOM) | E | Run never records terminal status | Orphaned-`running` reconciliation | ✅ `trackCronRun` → `status='timeout'` |
| 18 | Clock/DST boundary error | E | Dip in rows at day boundaries | Per-`game_date` floor at 40% of 30-day median | **None** |
| 19 | Watermark drift | E | Marker disagrees with derived state | Assert `pitches_last_run` vs `max(game_date)` | **None** |
| 20 | Repair tooling that doesn't work | — | Nothing until you need it | Exercise the backfill on a known gap, quarterly | **None** — one confirmed case, since fixed |

Two readings: **sixteen of twenty modes have no detector** — Triton is not under-alerted, it is un-instrumented. And **rows 1, 3, 11, 15 and 16 cover every failure the platform has actually suffered or is currently exposed to.** Five assertions. A weekend, not a platform migration.

---

## 8. What Triton should do, in order

1. **Wire `reportError` to a sink** (`lib/observability.ts:35`). Every item below produces an alert that currently goes to `console.error` (`01-pipeline-observability-fundamentals.md` §7).
2. **Ship the five assertions from §7 rows 1, 3, 11, 15, 16 as one `/api/cron/assertions` route** that writes to `integrity_checks` and throws on failure so `trackCronRun` records red. Reuse the `/api/cron/integrity` shape — `Promise.allSettled`, per-check rows, structured details. Don't invent a second pattern.
3. **Assert `errors = 0` from `syncPitches` and surface it in `cron_runs.counts`.** Already computed at `update/route.ts:145`. One line closing schema drift, poison records and constraint violations at once — the best ratio on this list.
4. **Reconcile `app/api/cron/*` against `vercel.json` in CI**, and confirm the status of `challenges` and `newsletter` before assuming either is broken.
5. **Stagger the `0 9 * * *` crons** to 09:00 / 09:03 / 09:06, and gate `/api/cron/refresh` on `pitches_last_run.date == today` rather than `totalInserted > 0`.
6. **Build `ingest_rejects` and route the three silent drops into it** (lines 125, 133, 164), porting the state machine from `scripts/download-pitch-videos.ts`. Assert empty daily.
7. **Instrument per-step statement duration; alert at 60% of the 8s cap.** The only monitor here that *predicts* rather than detects — and the failure it predicts already cost this platform three months.
8. **Make `trackCronRun` hand the `run_id` to its callback**, so `/api/cron/integrity` stops guessing via "most recent `running` row."

**Anti-recommendation: do not add automatic retries to the cron routes.** The obvious response to "the job failed," and wrong here for three reasons. (a) Vercel doesn't retry failed crons, so any retry lives in-process, inside the same 300s budget the job already strains against. (b) The dominant failure mode is `statement_timeout`, which is **not transient** — an 11k-row UPDATE that took 8.001s will take 8.001s again, so three retries turn one red run into a 24s hole and faithfully reproduce the failure. (c) The §4.1 per-row isolation loop is already a near-unbounded retry and the main amplification risk in the ingest. Retry transient faults; circuit-break persistent ones. Chunk smaller and fail loudly instead. Revisit only for genuinely transient upstream faults (Savant 5xx, connection resets) — and then use full jitter with a bounded attempt count persisted on the row, exactly as `download-pitch-videos.ts` already does.

**Second anti-recommendation: don't buy a data observability platform yet.** Sixteen of twenty modes are detectable with SQL over two tables Triton already has (`cron_runs`, `pitches`). A vendor sells anomaly detection, which needs 3–4 weeks of history and would be defeated by baseball seasonality anyway (`01-pipeline-observability-fundamentals.md` §4.3). Buy nothing until the five assertions exist and have caught something.

---

## Sources

1. Google SRE Book — [Managing Data Processing Pipelines](https://sre.google/sre-book/data-processing-pipelines/) — thundering herd, moiré load pattern, why tuned pipelines destabilize as data grows.
2. Google SRE Workbook — [Improve and Optimize Data Processing Pipelines](https://sre.google/workbook/data-processing/) — operational framing for pipeline SLOs.
3. Vercel — [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — best-effort delivery, duplicate invocations, no retry on failure, concurrency, 404-paths-still-execute. Load-bearing for §5.4 and §6.1.
4. Vercel — [Troubleshooting Vercel Cron Jobs](https://vercel.com/kb/guide/troubleshooting-vercel-cron-jobs) — logging behavior when a run never reaches the function.
5. AWS Architecture Blog — [Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — full-jitter formula; no-jitter loses on work *and* time.
6. AWS Well-Architected — [REL05-BP03 Control and limit retry calls](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_limit_retries.html) — why unbounded retry causes outages that won't self-resolve.
7. Microsoft Learn — [Circuit Breaker Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker) — fail fast on persistent faults; basis for §8's anti-recommendation.
8. Microsoft Learn — [Handling transient faults](https://learn.microsoft.com/en-us/azure/well-architected/design-guides/handle-transient-faults) — the transient/persistent split that decides whether retry applies.
9. AWS — [Using dead-letter queues in Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html) — `maxReceiveCount`, terminal parking, redrive.
10. Factor House — [Dead letter queues in Kafka: patterns and pitfalls](https://factorhouse.io/articles/dead-letter-queues-kafka/) — DLQ as terminal state, not another retry tier.
11. OneUptime — [How to Handle Poison Messages in Kafka](https://oneuptime.com/blog/post/2026-01-21-kafka-poison-messages/view) — poison-pill mechanics; one record blocking a partition.
12. Conduktor — [Dead Letter Topics: Handling Poison Pills](https://www.conduktor.io/blog/dead-letter-topics-handling-poison-pills) — serializer/deserializer mismatch as canonical cause.
13. PostgreSQL — [Client Connection Defaults](https://www.postgresql.org/docs/current/runtime-config-client.html) — exact `statement_timeout` / `lock_timeout` / `idle_in_transaction_session_timeout` semantics, incl. idle transactions blocking vacuum.
14. Crunchy Data — [Control Runaway Postgres Queries With Statement Timeout](https://www.crunchydata.com/blog/control-runaway-postgres-queries-with-statement-timeout) — role-level timeout config, the mechanism behind Triton's 8s cap.
15. Supabase — [Connection management](https://supabase.com/docs/guides/database/connection-management) — pooler modes, per-role pool sizing, serverless connection behavior.
16. Supabase — [Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI) — "Max client connections reached," compute-tied limits, slow queries as a cause.
17. dltHub — [Schema evolution in data pipelines](https://dlthub.com/blog/schema-evolution-guide) — additive vs. breaking change taxonomy.
18. Streamkap — [Schema Drift Detection](https://streamkap.com/resources-and-guides/schema-drift-detection) — baseline comparison and the halt/version/escalate triage.
19. Databricks — [Optimize stateful processing with watermarks](https://docs.databricks.com/aws/en/ldp/stateful-processing) — watermark semantics and the cost of data past the window.
20. ApX — [Handling Late Arriving Data](https://apxml.com/courses/building-scalable-data-warehouses/chapter-3-high-throughput-ingestion/late-arriving-data) — drop / divert / watermark-buffer strategies; source of the reprocess-recent-days pattern Triton uses.
21. Microsoft Learn — [Manage data quality with pipeline expectations](https://learn.microsoft.com/en-us/azure/databricks/ldp/expectations) — quarantine-table pattern with what/when/why metadata.
22. Wikipedia — [Error hiding](https://en.wikipedia.org/wiki/Error_hiding) and AWS CodeGuru — [Catch and swallow exception](https://docs.aws.amazon.com/codeguru/detector-library/python/swallow-exceptions) — the anti-pattern as a named defect class, with static-detection precedent for §2.2.

**Triton-internal evidence (measured 2026-08-11):** `app/api/update/route.ts` (lines 82, 87, 117–133, 141, 145, 150–169); `app/api/cron/pitches/route.ts`; `app/api/cron/integrity/route.ts`; `lib/cronTracker.ts`; `lib/observability.ts:29–36`; `lib/dataIntegrity.ts`; `scripts/download-pitch-videos.ts`; `vercel.json` (18 entries, 16 distinct paths, 15 of 17 `app/api/cron/*` routes scheduled); coverage-decay table and the 8k/11k UPDATE threshold from `Jo/context/triton-context.md` and `docs/Queries.md`.
