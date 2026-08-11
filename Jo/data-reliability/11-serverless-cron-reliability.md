---
title: Serverless Cron Reliability — Two Ceilings, One Killed Function
domain: data-reliability
tags:
  - vercel-cron
  - serverless
  - maxduration
  - function-timeout
  - statement-timeout
  - idempotency
  - job-decomposition
  - cold-starts
sources_reviewed: 21
last_updated: 2026-08-11
---

# Serverless Cron Reliability — Two Ceilings, One Killed Function

## TL;DR

- **Triton has two independent execution ceilings, 37× apart, and confusing them produced a wrong root cause during the 2026 Stuff+ investigation.** The Vercel ceiling is **300s per invocation**; the Postgres ceiling is **8s per statement**, from `authenticator`'s `statement_timeout`. A function with 295s of budget left still cannot run a 9-second UPDATE. The memorable form: **the 300s ceiling limits how *many* statements you run; the 8s ceiling limits how *big* each one is.** Neither buys the other. (measured)
- **`export const maxDuration = 300` is now a no-op — 300s is the platform default on every plan.** Vercel docs (updated 2026-07-01): Hobby 300s default *and* maximum; Pro/Enterprise 300s default, **800s maximum**, 1800s extended (beta). Triton's eleven `= 300` declarations request what they'd get anyway. (documented)
- **Vercel does not retry a failed cron invocation.** Verbatim: *"Vercel will not retry an invocation if a cron job fails."* This resolves the `(verify)` marker in `05-orchestration-scheduling.md`. (documented)
- **Cron delivery is best-effort in both directions: it can skip a run *and* double-fire one.** *"Cron job delivery is best effort... transient network errors can prevent a request from reaching your function"*; *"Cron delivery can also occasionally invoke the same scheduled run more than once."* Neither at-most-once nor at-least-once — design for zero-or-more. (documented)
- **Scheduling precision is plan-dependent, and on Hobby it breaks Triton's only pipeline dependency.** Hobby is per-hour (±59 min): `0 9 * * *` fires anywhere in 09:00:00–09:59:59, so `/api/cron/pitches` (09:00) and `/api/cron/refresh` (09:10) would be unordered — refresh could run first, read a stale marker, skip the night, and return 200. Pro/Ent fire within the specified minute. **Confirming the plan is the highest-value check in this doc.** (documented + inferred)
- **At the ceiling the invocation is killed with a 504 `FUNCTION_INVOCATION_TIMEOUT` — no graceful shutdown, no `finally`, no cleanup.** Committed statements stay committed; the run row never gets a terminal status. `lib/cronTracker.ts` already reconciles orphaned `running` rows to `status='timeout'` — the best serverless-aware instrumentation in the repo. (documented + measured)
- **`getDeadline()` from `@vercel/functions` is the missing primitive for chunked jobs, and Vercel's own docs example is a resumable pagination loop.** It returns the invocation deadline as a `Date`, so a loop can stop with headroom and return `{ resumeFrom }` instead of dying. Triton uses none of it. (documented)
- **The decomposition that saved `/api/cron/pitches` is the template.** ~280s against a 300s ceiling, killed ~1 night in 3, until the heavy downstream moved to `/api/cron/refresh`. Two ~150s functions beat one ~280s function: failure probability collapses, failures become attributable, each half becomes independently re-runnable. (measured, from the route comment)
- **Triton has 18 cron entries across 16 paths — and two cron routes nothing schedules.** `app/api/cron/challenges` (`maxDuration = 300`) and `app/api/cron/newsletter` (`= 120`) have no `vercel.json` entry. Dead code or undocumented trigger; both are reliability problems. (measured)
- **A cron route that returns 3xx does nothing and leaves no log line.** *"Cron jobs do not follow redirects"*; redirect and cached responses *"will not be shown in the logs."* One misapplied middleware redirect makes a nightly job vanish without a trace. (documented)
- **Moving off serverless is the wrong fix here, because the bottleneck isn't the function.** Every heavy Triton job is I/O-bound against Postgres and capped at 8s per statement. A VM removes the 300s ceiling and leaves the actual constraint untouched. (inferred)

---

## 1. The two ceilings

Reread this before diagnosing any Triton cron failure.

| | Vercel function ceiling | Postgres statement ceiling |
|---|---|---|
| **Value** | 300s (default, all plans) | **8s** |
| **Set by** | Platform default / `export const maxDuration` | `authenticator`'s `rolconfig` |
| **Scope** | One HTTP invocation, end to end | One SQL statement |
| **Symptom** | 504 `FUNCTION_INVOCATION_TIMEOUT`, killed, no response | `57014 canceling statement due to statement timeout`, returned to your code as a normal error |
| **Visible where** | Vercel runtime logs; `cron_runs` row stuck in `running` | The `run_mutation` promise rejects; your `catch` sees it |
| **Raised by** | Pro plan + `maxDuration` up to 800s | A new RPC with function-level `SET statement_timeout`. Nothing client-side |
| **Limits** | **How many statements** | **How big each statement is** |

Postgres documents `statement_timeout` as *"Abort any statement that takes more than the specified amount of time,"* measured from command arrival at the server. Supabase documents the per-role defaults: `anon` 3s, `authenticated` 8s, `service_role` *"none (defaults to the `authenticator` role's 8s timeout if unset)."* That last clause is the trap — the service key does not escape the cap, because PostgREST connects as `authenticator` and `SET ROLE`s from there.

### 1.1 The wrong diagnosis, preserved

The Stuff+ outage was first explained as *the full-season baseline refresh grew all year and starved the scoped `stuff_plus` UPDATE of the 300s function budget.* Coherent 300s story. Wrong. The evidence that killed it: `pitch_baselines` was fully current, proving the baseline step was completing rather than starving anything.

The real cause was the 8s ceiling — one UPDATE covering the ingest's 3-day window (~12k rows × 29 indexes) crossed `statement_timeout` as the 2026 table grew. The comment on `applyStuffPlusForDateRange` in `app/api/update/route.ts` now says so:

> `Runs ONE STATEMENT PER DAY. The PostgREST role (authenticator) carries statement_timeout=8s and service_role doesn't override it, so every run_mutation call is capped at 8s regardless of the client-side timeout.`

Note what changed and what didn't: **the function ran well under 300s the whole time.** The 300s ceiling was never involved. See `07-incident-response-forensics.md` for the discipline; this is the instance.

### 1.2 The budget arithmetic

One invocation gets 300s; every DB call is capped at 8s, so worst case is `300 / 8 ≈ 37` statements. Leave 20–30% for cold start, upstream fetches, and JSON, and **~25 worst-case statements is the real per-invocation budget.** The fixed scoring path uses 4 statements at ~1.4s each (~5.6s for a 3-day window) — about 2% of budget. That is what a correctly decomposed job looks like. (1.4s measured; arithmetic inferred.)

---

## 2. What Vercel Cron actually guarantees (as of 2026-08-11)

From `/docs/cron-jobs`, `/docs/cron-jobs/manage-cron-jobs` (docs `last_updated: 2026-07-15`), and `/docs/cron-jobs/usage-and-pricing`. All rows (documented). **Vercel's limits move — re-verify before relying on any of them.**

| Property | Behavior |
|---|---|
| Trigger | HTTP **GET** to the production deployment URL; UA `vercel-cron/1.0`; header `x-vercel-cron-schedule` |
| Auth | `CRON_SECRET` sent as `Authorization: Bearer …` |
| Timezone | **Always UTC.** No `MON`/`JAN` forms; no day-of-month + day-of-week together |
| Crons per project | **100** on all plans (disabled crons still count) |
| Minimum interval | Hobby **once per day** (more frequent fails deployment); Pro/Ent once per minute |
| Precision | Hobby **per-hour, ±59 min**; Pro/Ent within the specified minute |
| Retry on failure | **None** |
| Missed runs | Possible; *"no runtime log is created for that scheduled run"* |
| Duplicate runs | Possible |
| Concurrency | **No serialization.** Overlap is your problem; Vercel suggests an external lock |
| Redirects | **Not followed**, and not logged |
| Nonexistent path | Still executed; produces a 404 |
| Deployments / rollback | A new deployment doesn't interrupt a running cron; Instant Rollback does **not** update active crons |

### 2.1 The three that matter for Triton

**No retry.** The compensating control is the 3-day re-sync window in `/api/cron/pitches` — tonight repairs the previous two nights (`05-orchestration-scheduling.md` §4), now confirmed *necessary* rather than merely nice. It covers ingest only; a `/api/cron/refresh` failure self-heals only for the steps that recompute a whole season.

**Zero-or-more delivery.** Vercel's own test is idempotency: *"Good: 'Set user status to active'... Bad: 'Increment user credit by 10'."* Triton passes by construction — `pitches` upserts on `(game_pk, at_bat_number, pitch_number)`, and the Stuff+ UPDATE is a pure function of `(pitch row, baseline row)`. Audit the other 15 paths the same way; anything that appends rather than upserts will silently duplicate.

**Hobby's ±59 min destroys the pitches→refresh ordering.** Triton's only real DAG edge is a 10-minute time join. On Hobby the two jobs are effectively simultaneous in random order, and `/api/cron/refresh` would frequently read yesterday's `pitches_last_run`, compute `freshToday = false`, and skip the downstream chain **while returning 200** — the exact silent-failure shape of the Stuff+ outage.

---

## 3. `maxDuration`, and why Triton's declarations are stale

Fluid compute (default for projects created on/after 2025-04-23), per `/docs/functions/limitations` (`last_updated: 2026-07-01`):

| Plan | Default | Maximum | Extended maximum |
|---|---|---|---|
| Hobby | 300s | **300s** | — |
| Pro | 300s | **800s** | 1800s (beta) |
| Enterprise | 300s | **800s** | 1800s (beta) |

Extended max (>800s) is beta: per-function config only, `nodejs20/22/24.x` and `python3.12–3.14` only, excludes Secure Compute and Static IPs. Edge runtime differs — must *begin* responding within 25s, may stream to 300s.

Measured (`grep -rn maxDuration app lib scripts`): eleven routes at 300 (including every heavy cron), four at 120, three at 60, two at 30. No cron route declares `export const runtime`, so all run on Node.js. Two conclusions: every `= 300` is redundant, and **if Triton is on Pro, the ceiling that killed `/api/cron/pitches` can be raised to 800s with one line** — an option to know about, not to take (§9). Next.js documents `maxDuration`'s default as literally *"Set by deployment platform"*: the export is a request to Vercel, not a Next.js feature.

---

## 4. What happens when the function is killed

Exceeding the duration returns **504 `FUNCTION_INVOCATION_TIMEOUT`**. Vercel's error page covers causes but says nothing about in-flight semantics; the Lambda-family behavior underneath is well documented by practitioners — immediate termination, no graceful shutdown, no cleanup, no `finally`. Assume the same until measured otherwise. (documented for the error; inferred for termination.)

1. **Committed database work survives.** Each `run_mutation` is its own transaction. A kill at t=299s does not roll back the 40 statements already committed, leaving the table **partially applied and externally indistinguishable from complete.** This is why per-chunk progress accounting beats a monolith.
2. **The run row never reaches a terminal status.** `trackCronRun` inserts `status='running'` first and updates at the end. Triton reconciles this on the job's *next* invocation, marking rows `timeout` with `'orphaned running row — function likely killed (timeout/OOM)'`. The limitation is laziness: a job killed tonight isn't marked for up to 24h, and a job killed *then unscheduled* stays `running` forever.
3. **`waitUntil` / `after()` work dies too.** Verbatim: *"Promises passed to waitUntil() will have the same timeout as the function itself. If the function times out, the promises will be cancelled."* Same budget, measured from the response — not an escape hatch.
4. **Nothing is reported.** No `catch`, no `reportError`, no alert. The only artifacts are a Vercel log line and a stuck row — and `reportError` has no sink wired (`lib/observability.ts` TODO), so a Triton function kill is currently detected by nobody.

**Cold starts are inside this budget.** Fluid compute reduces them via instance reuse, bytecode caching, and pre-warmed production instances — *"the exception rather than a constant of the model"* — but a job finishing at 290s is not at 97% of budget; it is over budget on the night it starts cold. That is how `/api/cron/pitches` died 1 night in 3 rather than every night. (inferred). One related trap: functions are archived when not invoked **within 2 weeks** (production), and unarchiving *"can make the initial cold start time at least 1 second longer than usual."* Only `/api/cron/sos-weekly` (`0 11 * * 0`) is near that window. (documented)

---

## 5. Idempotency under best-effort delivery

`05-orchestration-scheduling.md` §3 covers the general patterns. Three serverless-specific additions:

**A killed function is indistinguishable from a duplicate delivery, from the table's point of view.** Both leave you re-running work that partially happened, and the same property fixes both: deterministic keys plus upsert, so the second pass converges instead of accumulating.

**Concurrency is not managed for you.** Vercel is explicit that a job outrunning its interval can be triggered again, causing *"race conditions, duplicate processing, or data corruption."* Triton's daily crons sit far from their 24h interval, so this is not live — but `/api/cron/roster` (09:00, 23:00) and `/api/game/warmup` (15:05, 16:05) each share a path with themselves and would collide if either grew. The cheapest lock is Postgres, not Redis: `SELECT pg_try_advisory_lock(hashtext('cron:refresh'))`, exiting early on `false`. **Grade: inferred, and do not ship it unmeasured** — advisory locks are session-scoped and PostgREST sessions are pooled and short-lived. A lease timestamp in `system_metadata` is less elegant and far more verifiable.

**"Reconciliation-based" is the phrase to internalize.** Vercel's guidance: *"Query and process all work since the last successful run to catch up after a missed invocation."* Strictly better than "process today," because a missed run becomes a non-event. Triton's 3-day window is a fixed-size approximation; the exact version — `WHERE game_date > (SELECT last_success …)` — self-heals a gap of any length. Bound it (`GREATEST(last_success, today - 10)`) and you get both properties.

---

## 6. Decomposing a long job — four patterns, ranked

Vercel's own advice when a job doesn't fit: *"split your cron jobs into different units or distribute your workload by combining cron jobs with regular HTTP requests with your API."*

### 6.1 Split by stage into separate crons — Triton's proven pattern

Per the comment at `app/api/cron/pitches/route.ts:11-19`:

> `The heavy downstream (compute-triton/deception, league_averages, percentiles, materialized-view refresh, bat-tracking) was moved to /api/cron/refresh — running it all here pushed this function to ~280s against the 300s ceiling and it was killed ~1 in 3 nights.`

Why it works beyond the obvious halving: **failure probability collapses non-linearly** (a job at 93% of budget fails whenever variance pushes it over; two at ~50% essentially never do); **failures become attributable** ("ingest succeeded, refresh failed" is a diagnosis, "the cron died" isn't); **each half becomes independently re-runnable** by hand. Cost: you trade a function call for a time-based join and inherit that join's weaknesses (§2.1).

### 6.2 Chunk the inner loop by an indexed column — the 8s-ceiling fix

Orthogonal to §6.1, and the one that actually fixed Stuff+: one statement per day, ~4k rows, ~1.4s each; a 3-day window completes in ~4.2s. Note the error handling — a bad day is collected and the loop continues, so one poisoned date can't strand the window, and `scoredDays` is returned so the caller can tell *how much* work happened. Chunk by an indexed column, never by `OFFSET` — see `data-quality/11-remediation-backfill-safety.md` and the backfill route that shipped with `COUNT(*) … LIMIT 1 OFFSET n` and consequently never looped.

### 6.3 Deadline-aware continuation — the pattern Triton is missing

`getDeadline()` *"Returns the shared invocation deadline for the current function invocation... based on the function's configured maxDuration. This includes request processing and asynchronous waitUntil tasks."* Vercel's own docs example is, near-verbatim, a resumable sync loop:

```ts
import { getDeadline } from '@vercel/functions'

function hasEnoughTimeLeft(marginMs = 20_000) {
  const deadline = getDeadline()
  if (!deadline) return true                      // not on Vercel — local dev
  return deadline.getTime() - Date.now() > marginMs
}

while (hasEnoughTimeLeft() && cursor <= endDate) {
  await scoreOneDay(cursor)
  cursor = addDaysUtc(cursor, 1)
}
return Response.json({ done: cursor > endDate, resumeFrom: cursor })
```

Set the margin to at least **one worst-case statement plus overhead — 20s is a sane floor at Triton's 8s cap** — because the loop must survive one full-cap statement after the last check. Drive the continuation three ways: return `resumeFrom` for the caller to re-invoke; persist the cursor and let tomorrow's run pick it up (self-healing, zero machinery, my preference here); or self-invoke via `fetch`. **Self-invocation carries a real hazard** — without a hard termination condition and a depth counter in the payload, a bug produces a function that invokes itself forever and bills for it; the Lambda literature is blunt that it *"will keep on invoking itself over and over till you remove it."*

### 6.4 Move the queue outside the function

Vercel Queues (at-least-once, 60s default visibility timeout configurable 0–3600s, forced exponential backoff after 32 attempts, no built-in DLQ) or Vercel Workflows (durable per-step checkpointing, `sleep()` from minutes to months, no duration limit). QStash, Inngest, and Trigger.dev occupy the same slot. Correct when work is unbounded or event-driven; **not Triton's answer**, whose work is bounded, time-triggered, and already fits. As one practitioner's field notes put it: *"Vercel Cron is correct only for time-triggered work. A job triggered by a user action belongs in a queue, not on a schedule."* All 16 Triton cron paths are time-triggered.

---

## 7. When to leave serverless entirely

| Trigger | Triton status |
|---|---|
| A single **statement** can't be chunked below the DB timeout | Not hit — every job decomposes by date or season |
| Work is CPU-bound, not I/O-bound | Not hit — `@napi-rs/canvas` in `daily-graphics` is the only real CPU load, and it fits |
| Memory > 4 GB | Not hit (Pro max 4 GB / 2 vCPU; Hobby 2 GB / 1 vCPU) |
| Long-lived connections | Not hit — Realtime is Supabase's problem |
| > 30 min even after decomposition | Not hit |
| Need a real scheduler with gating and replay | Approaching, but see `05-orchestration-scheduling.md` §6 |

**Triton's bottleneck is the 8s Postgres cap, and no compute change touches it.** Move `/api/cron/refresh` to a $10 VM with unlimited runtime and every `run_mutation` is still capped at 8s, because the cap lives on the `authenticator` role, not the caller. The only escapes are a new RPC with a function-level `SET statement_timeout` (read-side precedent exists — `run_query_long` at 120s; there is **no `run_mutation_long`**) or a direct connection bypassing PostgREST.

Relocating the *schedule* buys less than people expect. **GitHub Actions is worse**: GitHub's docs say *"The schedule event can be delayed during periods of high load... High load times include the start of every hour,"* with reported delays of 5–30 minutes, occasional dropped runs, and no retry. **Supabase `pg_cron` is genuinely attractive for pure-SQL work** — in-database, zero network latency, second-level granularity, every run recorded in `cron.job_run_details`, with guidance of *"no more than 8 Jobs run concurrently"* and *"no more than 10 minutes"* each. It won't help jobs that fetch from Savant, but for a nightly coverage assertion or a VACUUM it beats a Vercel function. (documented)

---

## 8. What Triton should do, in order

1. **Confirm the Vercel plan and record it in `Jo/context/triton-context.md`.** §2 and §3 both fork on it. Hobby ⇒ the `pitches` → `refresh` ordering is unenforced and needs an explicit gate (#4). Pro ⇒ 800s is available and the 300s declarations are stale.
2. **Resolve the two unscheduled cron routes.** `cron/challenges` and `cron/newsletter` have `maxDuration` exports and no `vercel.json` entry. Delete or schedule them — a route that looks like a cron and never runs is exactly what gets assumed to be working.
3. **Add a duration-margin monitor to `trackCronRun`.** It already records `duration_ms`. Assert `duration_ms < 0.6 × maxDuration` and warn above it — `01-pipeline-observability-fundamentals.md` §3's saturation signal applied to the *function* ceiling. It would have flagged `/api/cron/pitches` at 280s weeks before it started dying. Pair it with the 8s statement-margin monitor; different metrics, both needed.
4. **Gate `/api/cron/refresh` on marker *status*, not just presence.** Today `freshToday = info.date === today` and `skipDownstream = totalInserted === 0` render three situations identically: ingest found nothing, ingest failed, ingest hasn't run. Write the ingest's terminal status into `pitches_last_run` and emit a distinct reportable result for "upstream failed."
5. **Make the orphan reconciler eager.** `lib/cronTracker.ts` only reconciles a job's own stale rows when that job next runs. Add a sweep to `/api/cron/janitor` (already daily, `maxDuration = 120`) marking *any* `cron_runs` row `running` for >30 min as `timeout` and routing it through `reportError`.
6. **Assert every cron route returns 2xx and never 3xx.** One misapplied middleware redirect makes a job silently no-op *and* disappear from logs — a failure mode with no observable symptom, closed by a one-line test per route.
7. **Adopt `getDeadline()` in `/api/admin/backfill-stuff-plus` first, not in the crons.** The backfill legitimately wants more work than fits in one invocation and is already date-chunked. Returning `{ done, resumeFrom }` makes it restartable by construction and exercises the pattern where it can't break 09:00 UTC.
8. **Audit the remaining 14 cron paths against the two-ceiling checklist:** (a) is any statement unbounded in row count? (b) is the write idempotent under a double-fire? (c) does a skipped night self-heal? Two jobs have already hit the 8s cap independently — `applyStuffPlusForDateRange` and `scripts/backfill-pitch-videos.ts`, which worked around it via `run_query_long`. Assume more.

**Anti-recommendation — do not raise `maxDuration` to 800s to fix a slow cron.** One line, available on Pro, and the wrong instinct in nearly every case. Raising the ceiling converts a job that fails visibly at 300s into a job that fails invisibly at 790s two months later, having done 2.6× more partial work before the kill. It also does nothing for the 8s cap, which is what actually breaks Triton jobs. Raise it only after measuring that the job is *irreducibly* long — that it cannot be split by stage (§6.1), chunked by date (§6.2), or made resumable (§6.3) — and add the duration-margin monitor in the same commit. The 300s ceiling is not Triton's enemy; it is the only pressure that has ever forced a correct decomposition here.

**Second anti-recommendation:** do not add a Redis distributed lock. Vercel suggests it, but Triton's crons run daily against a 24h interval — the risk is theoretical, and a new stateful dependency guarding a theoretical risk is a net reliability loss. Revisit if any interval drops below an hour.

**Highest-leverage next action:** check the plan (#1). Every recommendation above is conditional on it, and one of the two answers means Triton's only pipeline dependency edge is currently unenforced.

---

## Sources

1. Vercel — [Cron Jobs](https://vercel.com/docs/cron-jobs) *(`2026-06-16`)* — GET trigger, `vercel-cron/1.0` UA, `x-vercel-cron-schedule`, UTC-only, expression limits.
2. Vercel — [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) *(`2026-07-15`)* — **the load-bearing source**: no retry, best-effort delivery with missed *and* duplicate runs, idempotency guidance, concurrency/locks, unfollowed-and-unlogged redirects, Hobby ±59 min.
3. Vercel — [Cron Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) *(`2026-07-15`)* — 100 crons/project; Hobby once-per-day + per-hour precision.
4. Vercel — [Functions Limits](https://vercel.com/docs/functions/limitations) *(`2026-07-01`)* — max-duration by plan, memory, 504 timeout, Edge 25s/300s.
5. Vercel — [Configuring Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration) *(`2026-07-01`)* — `maxDuration` semantics, extended-max beta requirements.
6. Vercel — [Runtimes](https://vercel.com/docs/functions/runtimes) *(`2026-07-29`)* — archiving at 2 weeks / 48 hours; unarchive adds ≥1s.
7. Vercel — [What is Compute?](https://vercel.com/docs/fundamentals/what-is-compute) *(`2026-08-04`)* — Fluid compute defaults, bytecode caching, pre-warming.
8. Vercel — [`FUNCTION_INVOCATION_TIMEOUT`](https://vercel.com/docs/errors/function_invocation_timeout) — 504 causes, and the *absence* of in-flight-work semantics.
9. Vercel — [`@vercel/functions` API Reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) *(`2026-07-27`)* — **`getDeadline()`** + resumable-pagination example, `waitUntil` cancellation.
10. Vercel — [Workflows](https://vercel.com/docs/workflows) *(`2026-07-15`)* — durable steps, sleep, no duration limit.
11. Vercel — [Queues concepts](https://vercel.com/docs/queues/concepts) *(`2026-06-30`)* — at-least-once, visibility timeouts, backoff after 32 attempts, no DLQ.
12. Next.js — [Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config) — `maxDuration` default "Set by deployment platform."
13. PostgreSQL — [Client Connection Defaults](https://www.postgresql.org/docs/current/runtime-config-client.html) — `statement_timeout` / `lock_timeout` semantics.
14. Supabase — [Timeouts](https://supabase.com/docs/guides/database/postgres/timeouts) — per-role defaults; `service_role` → `authenticator` 8s inheritance.
15. Supabase — [Cron](https://supabase.com/docs/guides/cron) — `pg_cron`, `cron.job_run_details`, ≤8 concurrent / ≤10 min guidance.
16. Ahmed Mahmoud — [Background Jobs on Vercel in 2026](https://dev.to/ahmed_mahmoud360/background-jobs-on-vercel-in-2026-field-notes-on-waituntil-queues-workflow-and-cron-1l6g) — field failures: duplicate sends, work lost in `waitUntil`, cron collisions.
17. Crontap — [Why GitHub Actions cron misses](https://crontap.com/blog/github-actions-cron-drift-problem) — GitHub's delay language, ~1 in 10 runs 5+ min late, no retry.
18. Aravind Vijayan — [Long Running Serverless Functions with AWS Lambda](https://medium.com/@vsaravind007/implementing-long-running-serverless-functions-with-aws-lambda-fe06d97120b2) — self-invoking continuation and its runaway failure mode.
19. OneUptime — [Fix Lambda 'Task Timed Out' Errors](https://oneuptime.com/blog/post/2026-02-12-fix-lambda-task-timed-out-errors/view) — forcible termination, no cleanup or `finally`.
20. Cadence — [Long Running Tasks in Vercel (2026)](https://cadence.withremote.ai/blog/long-running-tasks-vercel) — duration-tiered decision framework, anti-patterns.
21. Upstash — [Get Rid of Function Timeouts](https://upstash.com/blog/vercel-cost-workflow) — the external-queue alternative in §6.4.

**Triton-internal evidence (measured 2026-08-11):** 18 cron entries across 16 paths in `vercel.json` vs 17 route directories under `app/api/cron/` — `challenges` and `newsletter` unscheduled. `maxDuration` inventory from `grep -rn maxDuration app lib scripts`; no `export const runtime` in any cron route. The ~280s / 300s / "killed ~1 in 3 nights" history is the comment at `app/api/cron/pitches/route.ts:11-19`. The 8s explanation and one-statement-per-day fix are in `applyStuffPlusForDateRange`, `app/api/update/route.ts:294-352`. The orphan reconciler is `lib/cronTracker.ts:24-40`. The client-timeout-vs-DB-timeout distinction is at `app/api/cron/refresh/route.ts:56-59`.

**Related brain docs:** `05-orchestration-scheduling.md` (idempotency, self-healing windows, the retry `(verify)` this resolves) · `07-incident-response-forensics.md` (root-cause discipline; §1.1 is its worked example) · `01-pipeline-observability-fundamentals.md` (saturation as leading indicator) · `04-alerting-oncall-design.md` (dead-man switches) · `postgres-performance/03-timeouts-locks-concurrency.md` and `07-postgrest-supabase-architecture.md` (why `service_role` doesn't escape 8s) · `data-quality/11-remediation-backfill-safety.md` (chunk by indexed column, never OFFSET).
