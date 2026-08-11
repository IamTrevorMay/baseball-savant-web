---
title: Alerting & On-Call Design — Making Failure Impossible to Ignore
domain: data-reliability
tags:
  - alerting
  - on-call
  - alert-fatigue
  - dead-mans-switch
  - heartbeat
  - runbooks
  - symptom-based
  - solo-operator
sources_reviewed: 17
last_updated: 2026-08-11
---

# Alerting & On-Call Design — Making Failure Impossible to Ignore

## TL;DR

- **Triton's alerting problem is not noise, it is silence.** Most alerting literature is written for teams drowning in pages — one study cites teams receiving **2,000+ alerts weekly with only ~3% needing immediate action**. Triton's error path currently terminates in a `TODO` in `lib/observability.ts`. **The prescription for a noisy system is the opposite of the prescription for a silent one**, and most of the standard advice must be inverted before applying it here. (measured/documented)
- **Wiring `reportError` to a real sink is the single highest-leverage change available in Jo's entire domain.** Every monitor, SLO, and assertion in the other docs is inert until an alert can reach a human. Do this before building anything else. (inferred)
- **A dead man's switch is the one monitor that survives total failure.** Every other check runs *inside* the system it monitors — if the cron never fires, nothing evaluates the assertion. A heartbeat inverts this: silence is the alarm. For a Vercel-cron platform with no external scheduler, this is the only way to detect "the job never ran at all." (documented)
- **Ping the heartbeat on success only, at the very end of the job.** Pinging at the start, or unconditionally, converts the dead man's switch into a "did the process boot" check and reintroduces the exact silent-success failure mode it exists to catch. (documented)
- **Alert on symptoms, not causes.** "Yesterday's games are missing" is a symptom; "the third retry of the Savant fetch returned 502" is a cause. Symptoms are stable, few, and map to user impact; causes are numerous and change whenever you refactor. (documented)
- **Every page-level alert needs a runbook, and a good runbook is a decision tree that gets from alert to resolution in under ~10 minutes.** For a solo operator the runbook is not a courtesy to a teammate — it is a message to yourself in eight months, when you have forgotten that `statement_timeout` is 8s and not 120s. (documented + inferred)
- **Three severity tiers is the right number for this platform: Page / Ticket / Trend.** Page = data is actively wrong and someone is looking at it. Ticket = degraded, fix this week. Trend = a slope worth watching, reviewed weekly, never interrupts. Triton's characteristic failure is a *slope*, so the Trend tier is not optional. (inferred)
- **Deduplicate and aggregate before delivery, not after.** A per-day coverage failure across 60 backfill days should be one alert with a count, not 60 alerts. Alert storms are how a real signal gets muted. (documented)
- **Google's sustainable baseline is no more than 2–3 actionable incidents per on-call shift.** Triton should target far fewer — an alert that fires monthly and is always real is vastly more valuable than a daily one that is usually noise. **Budget: ≤1 page per month in steady state.** (documented + inferred)
- **Route by severity, not by source.** Page → phone. Ticket → email/Slack digest. Trend → a weekly review query. One destination for everything guarantees either fatigue or missed pages.

---

## 1. Invert the standard advice: this system is silent, not noisy

Almost all alerting guidance is remediation for over-alerting. The canonical symptoms of a broken alerting strategy — redundant notices, pages that self-resolve before acknowledgement, unrewarding rotations — describe a system generating too much signal.

**Triton generates none.** The measured state as of 2026-08-11:

- `reportError` in `lib/observability.ts` emits a structured event and has a `TODO` where a Sentry call belongs. **Errors go nowhere.**
- `trackCronRun` records run status to the database. **Nothing reads it and alerts.**
- The 2026 Stuff+ failure was caught, `console.error`'d, and discarded. Time to detection: **~90 days**, via a human asking an unrelated question.

So Jo reads the alert-fatigue literature *defensively* — as a description of the failure mode to avoid on the way up — rather than as a prescription. The immediate work is not filtering; it is **building the first wire from failure to human.**

### 1.1 The ordering that matters

1. **A destination exists** (an alert can reach a human).
2. **Failures reach it** (`reportError` actually fires; cron failures are surfaced).
3. **Assertions exist** that define failure beyond "the process threw."
4. **Severity routing** so the important ones stay loud.
5. **Deduplication and tuning** once volume justifies it.

Steps 4–5 are where the standard literature applies. Triton is at step 1. Skipping ahead to sophisticated routing before anything can page is the most common way this work stalls.

---

## 2. The dead man's switch — the only monitor that survives total failure

Every assertion described in docs 02 and 03 has the same structural weakness: **it runs inside the job it monitors.** If the cron never fires — Vercel scheduling failure, deploy that dropped the route, an expired `CRON_SECRET` — the coverage check never executes, and its silence is indistinguishable from success.

A **dead man's switch** (heartbeat monitor) inverts the logic: the job pings an external service on completion, and **the external service alerts when the ping does not arrive.** Silence becomes the alarm.

### 2.1 What it catches that nothing else does

- The whole platform being down
- The scheduler not firing (deploy config, expired secret, quota)
- The job hanging past its window (Vercel kill at `maxDuration`)
- The job crashing before it can report its own failure

That last one matters: a job that dies at second 299 of a 300-second budget cannot report anything. Its own error handler never runs.

### 2.2 The implementation rule that people get wrong

> **Ping on success only, at the very end of the job.**

If you ping at the start, or unconditionally in a `finally` block, the heartbeat degrades into a "did the process boot" check — and you have rebuilt the exact silent-success failure that caused the 2026 outage, with extra steps.

For Triton specifically, the ping should be placed **after the assertions pass**, not merely after the work completes:

```
fetch → upsert → score → assert coverage/freshness → ping heartbeat
```

With that ordering, a coverage breach withholds the ping, and the heartbeat service alerts even if `reportError` is still unwired. It is a second, independent path to a human. (inferred)

### 2.3 Tooling

Healthchecks.io is the reference implementation (also self-hostable); UpDog, AppStatus, Crontap, and Drumbeats occupy the same niche. The mechanics are universal: create a check with an expected interval plus a grace period; the check transitions **up → late → down** and fires notifications on `down`.

Grace period should exceed normal runtime variance. Triton's pitch cron is scheduled at 09:00 UTC; a 60-minute grace is comfortable given the 300s `maxDuration` ceiling and Vercel's scheduling jitter.

---

## 3. Symptom-based alerting

**Alert on symptoms, not causes.** Users care that the data is wrong, not which layer failed.

| Cause-based (avoid as pages) | Symptom-based (prefer) |
|---|---|
| `run_mutation` returned a statement timeout | Yesterday's pitches are unscored |
| Savant fetch returned 502 on retry 3 | Yesterday's completed games are missing |
| `refresh_materialized_views` RPC errored | Dashboards are serving data >26h old |

Symptoms are few, stable across refactors, and map to impact. Causes are numerous and churn constantly.

**The important nuance for Triton:** causes should still be *captured*, just not *paged*. When the symptom alert fires, the cause is what makes the runbook fast. The distinction is delivery tier, not whether to record it. Ship the cause as alert context; page on the symptom.

### 3.1 The Triton symptom set

The full page-worthy list, which should stay this short:

1. Completed games missing from `pitches` beyond the grace window.
2. Derived-column coverage below floor on the trailing window.
3. Scored date lagging ingested date by >1 day.
4. Any cron heartbeat missed.
5. Matview staleness beyond 26h.

Five symptoms. Everything else is a ticket or a trend.

---

## 4. Severity tiers for a one-person platform

Standard on-call design assumes a rotation. Triton has one person who is also the product owner, the analyst, and sometimes live on camera. The tiering must respect that.

| Tier | Meaning | Delivery | Response |
|---|---|---|---|
| **Page** | Data is actively wrong and being looked at | Push/phone | Same day |
| **Ticket** | Degraded but not misleading | Email or Slack digest | This week |
| **Trend** | A slope worth watching | Weekly review query | Review, don't interrupt |

### 4.1 The Trend tier is not optional here

This is where Jo departs from conventional guidance. Standard alerting is tuned for step changes — a service goes down, latency spikes, error rate jumps. Triton's characteristic failure is a **slope**: coverage decayed ~3% per week for three months, and no single day's change would have tripped any reasonable threshold.

Burn-rate alerting at 2×/5×/10× is designed for exactly the wrong timescale. The Trend tier — a weekly review of 4-week SLI slopes — is the mechanism that catches Triton's actual failure mode. It costs one query and five minutes a week. (inferred — see `03-volume-completeness-monitoring.md` §4.3 for the worked decay numbers)

### 4.2 Alert budget

Google's SRE Workbook suggests **no more than 2–3 actionable incidents per on-call shift** as a sustainable ceiling for a team. For a solo operator with no rotation, Jo's target is far stricter:

> **≤1 page per month in steady state, and every one of them real.**

An alert that fires monthly and is always genuine will be trusted and acted on. A daily alert that is usually noise will be muted within two weeks, and the mute will outlive the reason for it. **The failure mode of a solo operator is not burnout from paging — it is quietly turning off the notification and forgetting.**

---

## 5. Runbooks

Every page-level alert should link a runbook. The standard: a **decision tree that moves from alert to resolution in under ~10 minutes**, not a prose essay.

For a solo operator the purpose is different from a team's. It is not knowledge transfer to a colleague — it is **a message to yourself in eight months**, when you have forgotten that `authenticator` carries an 8s `statement_timeout`, that `supabaseAdminLong` doesn't change it, and that there is no `run_mutation_long`.

### 5.1 Runbook template

```markdown
## Alert: stuff_plus coverage below 95%

**Symptom:** count(stuff_plus)/count(*) < 0.95 over trailing 7 days.

**First check — is it the pipeline or the data?**
  SELECT game_date, COUNT(*), COUNT(stuff_plus)
  FROM pitches WHERE game_date >= current_date - 10
  GROUP BY 1 ORDER BY 1;
  - Whole days at 0 scored → scoring step failing. Continue.
  - Partial coverage every day → likely legitimate (rows without
    release_speed). Check the floor, not the pipeline.

**Second check — did the statement time out?**
  Remember: every run_query/run_mutation call is capped at 8s by
  authenticator's statement_timeout. service_role does NOT override it.
  supabaseAdminLong (120s) is client-side only and does NOT help.
  ~8k rows/statement passes; ~11k times out.
  → If rows-per-statement grew, reduce the chunk size.

**Repair:**
  GET /api/admin/backfill-stuff-plus?year=YYYY
  (repair mode, idempotent, skips already-scored rows; chunk default 1 day)

**Verify:** re-run the first check. Expect ≥99% on healthy days.

**Escalate to:** Li if coverage is fine but values look wrong.
```

Note the runbook encodes the **non-obvious constraint** prominently. That single paragraph is what took the longest to discover during the original incident.

---

## 6. Noise control (for later, but design for it now)

Techniques that matter once volume justifies them:

- **Deduplication** — one alert per distinct problem, not per affected row. A 60-day backfill failure is one alert with a count of 60, not 60 alerts. This is the most likely way Triton generates its first alert storm.
- **Grouping** — related failures from one root cause collapse into one notification.
- **Dynamic thresholds** — for genuinely seasonal metrics, though §4 of doc 03 argues Triton should prefer schedule-anchored expected sets over learned baselines wherever possible.
- **SLO-based alerting** — alert on error-budget consumption rather than individual breaches, so a single blip doesn't page.
- **Auto-resolution** — an alert that clears itself when the condition clears, so the inbox reflects current state rather than history.

**Design-now implication:** make alerts carry a **stable dedup key** (e.g. `job_name + assertion_name`) from day one. Retrofitting dedup keys after the fact is the annoying part.

---

## 7. What Triton should build, in order

1. **Wire `reportError` to a real sink.** Sentry is the path of least resistance; the TODO is already in `lib/observability.ts`. Nothing else in Jo's domain functions until this exists.
2. **Add a dead man's switch on `/api/cron/pitches`**, pinging *after assertions pass* (§2.2). Independent second path to a human, and the only thing that catches "never ran."
3. **Make assertion breaches fail the cron run** so `trackCronRun` records red — already the pattern for Stuff+ scoring failures after the 2026 fix.
4. **Write runbooks for the five symptoms** in §3.1, each encoding the non-obvious constraints (§5.1).
5. **Set up the three-tier routing** (§4) — page/ticket/trend to genuinely different destinations.
6. **Establish the weekly Trend review.** One query over the SLI history table, five minutes. This is what catches the slope.
7. **Only then** consider dedup, grouping, and dynamic thresholds — and add stable dedup keys now so it's cheap later.

**Anti-recommendation:** do not route everything to email. It is the default and it is where alerts go to be ignored. Page-tier must use a channel that interrupts; trend-tier must use one that never does. If both land in the same inbox, the tiering is decorative.

---

## Sources

1. Healthchecks.io — [How to Monitor Cron Jobs](https://healthchecks.io/docs/monitoring_cron_jobs/) — heartbeat mechanics, up→late→down states, grace periods, ping-on-success-only.
2. Healthchecks.io — [Documentation](https://healthchecks.io/docs/)
3. UpDog — [What is a Dead Man's Switch? Heartbeat Monitoring Explained](https://updog.watch/learn/what-is-dead-mans-switch) — silence-as-alarm model.
4. Crontap — [Dead man's switch, explained for developers](https://crontap.com/blog/dead-man-switch-explained-for-developers) — failure modes detected.
5. Nurbak — [Dead Man's Switch for Cron Jobs & Backups (2026 Guide)](https://nurbak.com/en/blog/dead-mans-switch/)
6. AppStatus — [Heartbeat Monitoring — Cron Job & Scheduled Task Checks](https://appstatus.io/docs/heartbeats)
7. Drumbeats — [Heartbeat Monitoring — Dead-Man Switch for Workers, Daemons & Sync Loops](https://drumbeats.io/heartbeat-monitoring)
8. Watchflow — [10 Critical Cron Jobs You Should Be Monitoring](https://www.watchflow.io/blog/10-critical-cron-jobs-to-monitor/)
9. OneUptime — [How to Monitor Cron Job Execution and Alerting](https://oneuptime.com/blog/post/2026-03-02-how-to-monitor-cron-job-execution-and-alerting-on-ubuntu/view)
10. beefed.ai — [Design Low-Noise Actionable Alerts](https://beefed.ai/en/low-noise-actionable-alerting) — symptom-vs-cause, runbook-as-decision-tree, <10-minute standard.
11. beefed.ai / DEV — [Designing Low-Noise, Actionable Alerts](https://dev.to/beefedai/designing-low-noise-actionable-alerts-2ng8)
12. incident.io — [On-call best practices: handoffs, schedules, and alert fatigue](https://incident.io/blog/on-call-best-practices-guide-2026) — broken-strategy symptoms; small-team rotation models; Google's 2–3 incidents/shift baseline.
13. PagerDuty — [Understanding Alert Fatigue & How to Prevent It](https://www.pagerduty.com/resources/digital-operations/learn/alert-fatigue/)
14. LogicMonitor — [Preventing Alert Fatigue in Network Monitoring and Observability](https://www.logicmonitor.com/blog/network-monitoring-avoid-alert-fatigue) — 2,000+ weekly alerts, ~3% actionable.
15. SquareOps — [Reducing Alert Fatigue: A Practical On-Call Framework](https://squareops.com/blog/reducing-alert-fatigue-framework/)
16. UptimeLabs — [How to Reduce On-Call Burnout in SRE Teams](https://www.uptimelabs.io/learn/reduce-on-call-burnout)
17. OneUptime — [How to Build Alert Rule Design](https://oneuptime.com/blog/post/2026-01-30-alert-rule-design/view) — SLO-based alerting, dedup, routing.

**Triton-internal evidence (measured 2026-08-11):** `reportError` TODO in `lib/observability.ts`; `trackCronRun` behavior in `lib/cronTracker.ts`; 90-day TTD and detection mechanism from the 2026 Stuff+ post-mortem in `planning.md`.
