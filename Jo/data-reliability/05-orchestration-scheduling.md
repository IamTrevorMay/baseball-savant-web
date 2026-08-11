---
title: Orchestration & Scheduling — What Plain Cron Costs You
domain: data-reliability
tags:
  - orchestration
  - airflow
  - dagster
  - temporal
  - cron
  - idempotency
  - retries
  - backfill
  - dag-gating
sources_reviewed: 19
last_updated: 2026-08-11
---

# Orchestration & Scheduling — What Plain Cron Costs You

## TL;DR

- **Triton has no orchestrator. It has 17 independent Vercel cron entries with an ad-hoc dependency marker between two of them.** That is a legitimate architecture at this scale, but it is a *choice with known costs*, and those costs should be named rather than discovered during an incident. (measured)
- **The four capabilities an orchestrator provides that cron does not: dependency gating, automatic retry, backfill/replay, and run-level observability.** Triton has hand-built a partial version of the first (`pitches_last_run` in `system_metadata`) and a partial version of the third (`/api/admin/backfill-stuff-plus`). It has none of the second and only the shell of the fourth. (measured)
- **Idempotency is the property that makes everything else safe, and it is a design decision, not a framework feature.** Every orchestrator's retry story assumes your tasks are idempotent; none of them provide it. Temporal's "exactly-once" applies to workflow *logic*, not to activity *side effects* — those are at-least-once and must be made idempotent in your application code. (documented)
- **"Exactly-once at the table level, even though compute runs at-least-once" is the correct goal.** You achieve it with deterministic keys and upserts, not with delivery guarantees. Triton already does this well: `pitches` upserts on `(game_pk, at_bat_number, pitch_number)`, so re-ingesting a day is safe. (documented + measured)
- **The simplest reliable idempotency pattern for batch is full partition replacement**; the second simplest is MERGE/upsert on a natural key. Triton uses the latter, correctly, because full replacement of a day would be prohibitively expensive against 29 indexes. (documented)
- **A backfillable pipeline accepts a date parameter and processes exactly that date.** This is the single most useful structural property a data job can have — it makes replay, repair, and testing all fall out for free. Triton's scoring path now has it (`applyStuffPlusForDateRange`); its ingest path has it (`syncPitches(start, end, gameType)`); its admin backfill now has it. (documented + measured)
- **Retry is where Triton is genuinely exposed.** Vercel cron does not retry a failed invocation *(verify against current Vercel docs — this is the assumption the architecture rests on)*, and the design compensates with a 3-day re-sync window: tonight's run repairs the previous two nights. That is a real and elegant mitigation, but it only covers *ingest*. A scoring or refresh failure has no equivalent self-heal. (inferred)
- **The 3-day re-sync window is Triton's most underrated reliability feature.** It converts "a failed night" from an incident into a non-event for ingest. The general principle — **overlapping windows make missed runs self-healing** — should be applied deliberately to the other crons, not just inherited accidentally by one. (inferred)
- **Do not adopt Airflow/Dagster/Temporal for this platform today.** The operational cost (a scheduler to run, a database to maintain, a deployment story) exceeds the benefit at 17 simple jobs. The graduation triggers are named in §6. (inferred)
- **Do adopt the cheap parts: explicit dependency gating, self-healing overlap windows, and per-job idempotency documentation.** These deliver most of the orchestration benefit at near-zero operational cost. (inferred)

---

## 1. What Triton actually has

Seventeen entries in `vercel.json`, each an independent HTTP GET on a schedule, authenticated with `CRON_SECRET`. There is no DAG, no scheduler process, and no shared run state beyond what the jobs write themselves.

The one real dependency in the system is expressed manually:

```
09:00 UTC  /api/cron/pitches   → writes system_metadata['pitches_last_run']
                                  { date, year, gameTypes, totalInserted }
09:10 UTC  /api/cron/refresh   → reads that marker, gates downstream work on
                                  freshToday && totalInserted > 0
```

This is a **hand-rolled DAG edge with a time-based join**: the downstream job runs ten minutes later and checks whether the upstream one produced anything today. It works, and it degrades sensibly — if ingest produced nothing, refresh skips rather than recomputing on stale data.

Its weaknesses are the ones every time-based join has:

- **The 10-minute gap is a guess.** If ingest ever exceeds 10 minutes, refresh reads a stale marker and skips a day's downstream work. The comment in `/api/cron/pitches` records that this job previously ran ~280s against the 300s ceiling — the margin is real but not enormous.
- **Skipping is silent.** `skipDownstream` produces a `{skipped: 'no new pitches'}` result. Correct behavior, but indistinguishable in the response from a healthy no-op day.
- **There is no propagation of *failure*, only of *emptiness*.** If ingest fails after inserting some rows, refresh sees `totalInserted > 0` and proceeds on a partial day.

---

## 2. The four things orchestrators give you

### 2.1 Dependency gating

Run B when A succeeds — not "ten minutes after A was scheduled." Airflow, Dagster, and Prefect all express this natively; Dagster's software-defined assets go further and model the *data* dependency rather than the *task* dependency, which makes lineage automatic.

**Triton's version:** the `pitches_last_run` marker. Cheap, works, has the time-join weakness above.

**Cheap improvement without an orchestrator:** have `/api/cron/refresh` check marker *freshness and status*, not just presence — and report a distinct result when it skips because the upstream failed versus because there was genuinely nothing to do. Two different situations currently render identically.

### 2.2 Retry

Airflow supports task-level retries with configurable attempts, delay, and exponential backoff. Dagster has retry policies on ops/assets and can rerun a failed step while skipping already-successful work (contingent on persisted outputs). Temporal provides automatic retry at both workflow and activity level with configurable policies.

Every one of these carries the same caveat in its own documentation: **tasks must be idempotent or retries corrupt data.**

**Triton has no retry layer.** Its compensating control is the 3-day re-sync window (§4), which is a genuinely good pattern but covers ingest only.

### 2.3 Backfill and replay

Airflow and Dagster provide scheduler-level controls for selective reruns — clear and rerun one task, its downstream, or a date range. This is the capability people miss most when they leave an orchestrator.

**Triton's version:** hand-built admin routes. `/api/admin/backfill-stuff-plus` is now date-chunked with repair/rescore modes. This is fine, but it is one route per repair scenario, each of which must be written and — critically — **exercised** (see `data-quality/11-remediation-backfill-safety.md` and the route that shipped broken).

### 2.4 Run-level observability

A place where run history, durations, statuses, and logs live and are queryable.

**Triton's version:** `trackCronRun` records runs. As established in `01-pipeline-observability-fundamentals.md`, it records *that* a run happened, not *what it moved* — which is the gap that let a three-month outage stay invisible.

---

## 3. Idempotency — the property that makes retries safe

> An idempotent operation produces the same result whether executed once or ten times.

The framing that matters: **idempotency is not about preventing retries. It is about making retries safe.** Orchestrators retry, backfills reprocess, networks deliver at-least-once, and engineers rerun jobs while debugging. All four assume idempotency and none provide it.

### 3.1 The delivery-semantics hierarchy

| Semantics | Meaning | Practical status |
|---|---|---|
| At-most-once | may lose data, never duplicates | almost never acceptable |
| **At-least-once** | may duplicate, never loses | **the default in essentially every system** |
| Exactly-once (compute) | neither | expensive, often illusory |
| **Exactly-once (table state)** | end state is correct regardless of retries | **the achievable goal** |

The goal is exactly-once *at the table level* even though compute runs at-least-once. You get there with deterministic keys and idempotent writes, not with delivery guarantees.

### 3.2 The four batch idempotency patterns

1. **Full partition replacement** — delete-and-rewrite the whole date partition. Simplest and most reliable.
2. **MERGE / upsert on a natural key** — write with `ON CONFLICT DO UPDATE`.
3. **Deduplication store** — track processed record IDs.
4. **Deterministic inputs** — same input always yields same output, enabling safe recompute.

**Triton uses pattern 2, correctly.** `pitches` has a unique index on `(game_pk, at_bat_number, pitch_number)`, so re-ingesting a date is safe and convergent. Pattern 1 would be actively harmful here — deleting and rewriting a day means ~4k rows × 29 index deletions plus ~4k × 29 insertions, roughly doubling the write cost on a platform whose binding constraint is an 8s statement timeout.

The scoring path is idempotent by construction: the UPDATE is a pure function of `(pitch row, baseline row)`, so rescoring converges. This was verified during the 2026 repair — rescoring 2026-08-04..06 reproduced identical monthly averages. (measured)

### 3.3 Where Triton's idempotency is *not* clean

`refresh_league_averages(p_season)` is documented as idempotent. `refresh_materialized_views()` is idempotent by nature. But **`refreshPitchBaselines` is idempotent in mechanism and non-deterministic in result** — it recomputes a full-season aggregate, so running it on different days produces different baselines from the same code.

That is not a bug in the function; it is the baseline-vintage-drift hazard that `Li` owns (`Li/context/triton-context.md` §1). Jo's concern is narrower: **a "rerun the pipeline" repair does not restore the previous state here.** Replaying June's ingest today scores those pitches against August baselines. Any replay of historical data must decide explicitly whether it wants historical or current baselines — and today there is no way to express the former. (inferred)

---

## 4. Self-healing overlap windows — Triton's best reliability property

`/api/cron/pitches` syncs `[today − 3, today]` every night, ostensibly to cover delayed Savant uploads. The second-order effect is more valuable than the stated one:

> **A missed or failed run repairs itself on the next two nights, with no retry mechanism, no alerting, and no human involvement.**

This is why Triton's *ingest* has been reliable despite having no retry layer at all. It is a genuinely good pattern and deserves to be named and applied deliberately:

- **Ingest:** 3-day window. Covered.
- **Scoring:** now scores the ingested window (min/max of ingested dates), so it inherits the overlap. Covered.
- **`refresh_league_averages`:** recomputes the whole current season. Self-healing by construction. Covered.
- **Materialized views:** full refresh. Covered.
- **`/api/cron/player-stats`, `daily-cards`, `briefs`, `newsletter`, `sos-weekly`:** *(unverified — audit needed)*. A daily job that processes only "today" has no overlap and does not self-heal a missed run.

**Jo's general rule:** for any scheduled job, ask *"if this run is skipped entirely, does the next one fix it?"* If no, either widen the window or add a heartbeat (`04-alerting-oncall-design.md` §2). Widening the window is usually cheaper than building retry.

The cost of overlap is redundant work — Triton re-processes ~3× the necessary pitches nightly. At ~4k pitches/day and an upsert that's a no-op for unchanged rows, that is a good trade. It stops being a good trade when the redundant work approaches the statement-timeout ceiling, which is the mechanism that broke scoring in 2026: the *scoring* step was covering a 3-day window in one statement while the *ingest* step handled it row-by-row. Overlap windows are cheap for upserts and expensive for bulk UPDATEs. (measured)

---

## 5. The orchestrator landscape, briefly

For the record, since the question recurs:

| Tool | Model | Strength | Cost |
|---|---|---|---|
| **Airflow** | Python DAGs, task-centric | De facto standard; huge ecosystem; strong backfill/rerun controls | Heavy operationally; scheduler + metadata DB |
| **Dagster** | Software-defined *assets* | Data-centric; lineage and audit trails automatic; good local dev | Younger ecosystem; still a service to run |
| **Prefect** | Python-native flows | Lightest developer experience of the three | Less mature scheduler-level backfill |
| **Temporal** | Durable execution, workflow-as-code | Best-in-class reliability and state durability; replay-based recovery | Not a data-orchestration tool; different mental model |

A 2026 market assessment scored Temporal highest on reliability (9.4) with Airflow second (8.4), Prefect (7.7), and Dagster (7.3) — though these composite scores mix reliability, ops burden, ecosystem, and momentum, and should be read as directional rather than decisive.

A commonly cited hybrid: **Airflow for scheduling and dependencies, Temporal for durability inside each unit of work.** Noted for completeness; wildly disproportionate for Triton.

---

## 6. Should Triton adopt an orchestrator? No — and here's when that changes

**Current recommendation: no.** Seventeen mostly-independent jobs with one real dependency edge do not justify running a scheduler, a metadata database, and a deployment pipeline for it. The Vercel-cron-plus-marker architecture is appropriate, and the gaps it leaves are cheaper to close directly.

**Graduation triggers — revisit when any two become true:**

1. **More than ~3 real dependency edges.** Time-based joins stop being manageable when the graph branches.
2. **A job that genuinely needs retry with backoff**, where widening the window is not viable.
3. **Backfill becomes routine** rather than incident-driven — i.e. you're writing a third bespoke admin repair route.
4. **A job exceeds the 300s ceiling** and must be decomposed into coordinated steps rather than one request.
5. **Fan-out appears** — per-team, per-player, or per-season parallel work that needs coordination.

Trigger 4 is the closest. `/api/cron/pitches` was already refactored once to move heavy work into `/api/cron/refresh` because it was hitting ~280s and dying ~1 night in 3. **A second such split would mean three time-joined crons, which is where hand-rolled dependency management starts to hurt.**

---

## 7. What Triton should do instead, in order

1. **Audit every cron for self-healing overlap** (§4). For each: "if this run is skipped, does the next one fix it?" Widen windows where the answer is no. Cheapest reliability win available.
2. **Make `/api/cron/refresh` distinguish upstream-failed from upstream-empty.** Two very different situations currently produce the same skip.
3. **Document idempotency per job** — a one-line note in each cron route stating what makes re-running safe, and what it converges to. This is the knowledge that evaporates first.
4. **Record the replay caveat for baselines** (§3.3): replaying historical dates uses *current* baselines. Until `Li`'s baseline-versioning work lands, any historical repair should state this explicitly.
5. **Keep the marker pattern but add status**, not just counts, to `pitches_last_run`.
6. **Do not adopt an orchestrator** until two graduation triggers fire.

---

## Sources

1. Airbyte — [Idempotency in Data Pipelines: A Complete Guide](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines) — definition, why retries assume it.
2. dataskew.io — [Data Pipeline Design Patterns: Idempotency, DLQ, CDC and 5 More (2026)](https://dataskew.io/blog/data-pipeline-design-patterns/) — the four batch idempotency patterns.
3. Alex Merced — [Idempotent Pipelines: Build Once, Run Safely Forever](https://dev.to/alexmercedcoder/idempotent-pipelines-build-once-run-safely-forever-2o2o)
4. OneUptime — [How to Use Idempotent Data Pipelines to Handle Retry-Safe Processing](https://oneuptime.com/blog/post/2026-02-17-how-to-implement-idempotent-data-pipelines-in-gcp-to-handle-retry-safe-processing/view)
5. Manjinder Singh — [Designing Robust Data Pipelines: Idempotency, Replays & Backfills Explained](https://medium.com/@manjindersingh_10145/designing-robust-data-pipelines-idempotency-replays-backfills-explained-640c9920f7b9) — date-parameterized backfill principle.
6. Streamkap — [Idempotency in Streaming Pipelines: Exactly-Once Without the Headaches](https://streamkap.com/resources-and-guides/idempotency-streaming-pipelines) — at-least-once as universal default; exactly-once at table level.
7. ApXML — [Idempotency in Data Pipelines](https://apxml.com/courses/building-scalable-data-warehouses/chapter-3-high-throughput-ingestion/idempotency-pipelines)
8. Racholsan Raj Nirmal — [Idempotent Data Pipelines with Delta Lake & CDC](https://medium.com/@racholsanraj/idempotent-data-pipelines-with-delta-lake-cdc-no-more-duplicates-61a6c22aecc7)
9. dataskew.io — [Apache Airflow for Data Engineers: DAGs, Operators, and Production Patterns (2026)](https://dataskew.io/blog/apache-airflow/) — task retries, backoff, idempotency requirement.
10. ZenML — [Dagster vs Airflow vs ZenML](https://www.zenml.io/blog/dagster-vs-airflow) — software-defined assets, retry policies.
11. npow — [The Workflow Orchestration Landscape — March 2026](http://npow.github.io/posts/workflow-orchestration-market-quadrant-2026/) — comparative scoring.
12. Automation Atlas — [Temporal vs Apache Airflow 2026](https://automationatlas.io/guides/temporal-vs-apache-airflow-2026-comparison/) — durable execution vs DAG ETL.
13. CodeWords — [Temporal vs Airflow: workflow orchestration compared](https://www.codewords.ai/blog/temporal-vs-airflow) — exactly-once applies to workflow logic, not activity side effects.
14. FuturePicker — [Temporal vs Airflow vs Prefect vs Dagster 2026](https://futurepicker.com/en/temporal-airflow-prefect-dagster-workflow-2026/)
15. Coding Protocols — [Best AI Workflow Orchestration Tools 2026](https://codingprotocols.com/blog/best-ai-workflow-orchestration-tools) — Airflow+Temporal hybrid pattern.
16. Hevo — [Common Data Pipeline Failures: Causes, Impact, and Solutions](https://hevodata.com/learn/data-pipeline-failures/)
17. SD Course — [Dead Letter Queues for Failed Log Processing](https://sdcourse.substack.com/p/day-36-dead-letter-queues-for-failed) — graduated retry classification.
18. HST Solutions — [8 Common Causes of Data Flow Failures in Production Systems](https://www.hst.ie/blog/common-causes-data-flow-failures-live-production-systems/)
19. OneUptime — [How to Fix Data Pipeline Failures](https://oneuptime.com/blog/post/2026-01-24-fix-data-pipeline-failures/view) — retry-storm thresholds.

**Triton-internal evidence (measured 2026-08-11):** `vercel.json` cron list; `pitches_last_run` marker contract in `app/api/cron/pitches/route.ts` and `app/api/cron/refresh/route.ts`; the ~280s/300s comment documenting the prior split; upsert key from the `pitches` unique index; rescore-idempotency verification in `docs/Queries.md`.
