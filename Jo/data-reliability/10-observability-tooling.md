---
title: Observability Tooling — The Landscape, Real Prices, and What a Solo Operator Should Buy
domain: data-reliability
tags:
  - tooling
  - vendor-evaluation
  - pricing
  - error-tracking
  - heartbeat-monitoring
  - opentelemetry
  - build-vs-buy
sources_reviewed: 24
last_updated: 2026-08-11
---

# Observability Tooling — The Landscape, Real Prices, and What a Solo Operator Should Buy

## TL;DR

- **Buy an error sink and a dead-man's switch; build the rest as SQL. $0/month today, $42/month once the free tiers run out.** Sentry Developer ($0, 5k errors, 30-day retention) + Healthchecks.io Hobbyist ($0, 20 checks — Triton has 18 crons) + assertions in the existing crons + the run-metadata table from `01-pipeline-observability-fundamentals.md` §4.1. (documented)
- **Data-observability platforms are the wrong shape here, and their pricing says so.** Of eight vendors, two publish a number: Soda Team at **$750/month** and Monte Carlo Scale at **$0.28/credit** (consumption unpublished). Bigeye, Sifflet, Elementary Cloud, Datafold, and Metaplane Pro are quote-only. (documented)
- **They also would not have caught the outage you'd buy them to prevent.** Table-level freshness and volume — their default install — stayed **green for all three months** of the Stuff+ collapse; ingest never missed a pitch. What fires is a NULL-rate check on one derived column. (measured)
- **Vercel's built-in observability is forensics, not detection, and retention is the trap.** Runtime logs are kept **1 hour on Hobby, 1 day on Pro, 3 days on Enterprise**, and `reportError` writes to `console.error` — so each night of a 90-night outage was deleted before the next ran. (documented + measured)
- **Vercel cron delivery is best-effort with no retry, and a missed invocation writes no log at all** — *"your function does not execute, and no runtime log is created for that scheduled run."* That settles the heartbeat question: `cron_runs` is written *by* the job, so it cannot record a job that never started. (documented)
- **Supabase gives away the one piece worth taking.** Pro ($25/mo) carries **7-day log retention** (7× Vercel Pro) plus a Prometheus endpoint of ~200 Postgres series and a `supabase-grafana` dashboard. Into Grafana Cloud Free, that is the disk-and-bloat watch, for $0. (documented)
- **OpenTelemetry is the right substrate and the wrong quarter.** A CNCF standard explicitly *"not an observability backend"* — it standardizes emission, not detection, and would not have fixed Stuff+ either: the exception was dropped before any exporter saw it. (documented + inferred)
- **`package.json` contains zero observability dependencies today.** No `@sentry/*`, `@opentelemetry/*`, Datadog, Rollbar, Axiom, Logtail, or Grafana client. The error path for 14 `reportError` call sites ends in a comment at `lib/observability.ts:35`. (measured, 2026-08-11)

---

## 1. Four markets that get confused

None subsumes another, and each has a blind spot that matters here.

| Category | Blind spot |
|---|---|
| **Error tracking / APM** — Sentry, Rollbar, Datadog APM | A caught-and-swallowed exception. A job that never ran. |
| **Heartbeat / cron** — Healthchecks.io, Cronitor, Better Stack, Sentry Crons | Whether the job *did anything* — a check-in after writing zero rows. |
| **Metrics & dashboards** — Grafana, Datadog, Better Stack | Anything you never thought to emit. |
| **Data observability** — Monte Carlo, Bigeye, Sifflet, Soda, Elementary, Metaplane | Failures inside application code; anything below table grain not explicitly configured. |

Scored against the 2026 Stuff+ outage: error tracking misses it as originally written (exception caught, `console.error`'d, discarded) but catches it *today*, after the fix made the scoring path `reportError` **and throw**; heartbeat misses it, because the cron ran nightly and returned 200; data observability at default install misses it, because freshness and volume on `pitches` were perfect all season (measured). **One NULL-rate assertion on `pitches.stuff_plus` catches it in June, at 82% NULL** — and it ships inside a cron route that already exists. See `03-volume-completeness-monitoring.md` and `01-pipeline-observability-fundamentals.md` §2.

---

## 2. Data-observability platforms

| Tool | Published pricing, checked 2026-08-11 |
|---|---|
| **Monte Carlo** | **$0.28/credit** (Scale order form); unlimited users, 1× BI + 1× orchestration integration, 50k API calls/day. Per-monitor **consumption rates not published**. |
| **Bigeye** | **Not published.** Demo/sales-led; trial limited to Snowflake/Claude Code. |
| **Metaplane by Datadog** | Free: **10 tables, 4 users, 3 custom SQL monitors**. Pro: per monitored table, **rate not published**; 100 tables, 12 users. |
| **Sifflet** | **Not published.** Entry ≤500 assets, Growth ≤1,000, Enterprise 1,000+. |
| **SYNQ → Coalesce Quality** | Acquired **2026-03-10**, folded into the Coalesce platform; terms undisclosed. |
| **Elementary** | OSS community edition; Cloud Scale/Enterprise/Unlimited + AI add-on, **no prices published**. |
| **Soda** | Free $0. **Team $750/month**, unlimited users, pay-as-you-go SPUs. |
| **Datafold** | **Not published** — `/pricing` redirects to `/contact-us`. Focus moved to AI-assisted migrations. |

**Six of eight publish nothing** — treat those as "five-figure annual minimum plus a procurement cycle." Soda is the most transparent and its number disqualifies it; Elementary is dbt-native and Triton has no dbt project; Metaplane's 3-custom-SQL-monitor free cap binds immediately, because Triton's needs are nearly all custom SQL. Third-party $30k–$80k ACV figures circulate for Monte Carlo; those are aggregator claims, not vendor-published. (folklore until there is a quote)

**Why the category mismatches this platform:** (1) priced per table/asset while the failure was per-column; (2) it watches the warehouse while the failure was in the application — an `UPDATE` crossing the `authenticator` 8s `statement_timeout` inside a Next.js route, and no warehouse-side monitor observes statement-duration margin against a role-level timeout; (3) its anomaly detection needs history and hates seasonality — baseball volume swings an order of magnitude February to July, off-season zeroes are correct, and naive baselines get muted within a month (`01-pipeline-observability-fundamentals.md` §4.3).

**Honest counter-argument:** they are good at what Triton lacks — generating monitors across hundreds of tables with nobody writing SQL. Real value once no one person holds the dependency graph; not real at 18 crons and one operator. (inferred)

---

## 3. Error tracking — the one purchase that isn't optional

| Tool | Free tier | Paid entry | Extras |
|---|---|---|---|
| **Sentry** | Developer **$0**, 1 user, **5k errors/mo**, **30-day lookback** | **Team $26/mo** annual, unlimited users, 50k errors, up to 90-day lookback; Business $80/mo | 1 cron + 1 uptime monitor per plan; extras $0.78 / $1.00, PAYG only. Team overage $0.00029/error. |
| **Rollbar** | Free **$0**, **5,000 occurrences/mo**, 30-day retention, **unlimited seats** | Essentials / Advanced — **price not published**; 90/180-day retention | Unlimited free seats is the one real edge, worth nothing to a one-person team. |

**Verdict: Sentry Developer, today, $0.** Triton is one user, so Developer's seat cap costs nothing and Rollbar's unlimited seats buy nothing. 30-day retention beats Vercel Pro's 1 day by 30×, free. And 5k errors/month is ~166/day — a cron platform exceeding that has a retry storm, which is itself the alert (`04-alerting-oncall-design.md`). The chokepoint already exists: `lib/observability.ts:35` carries the wiring instruction verbatim.

```
// TODO(observability): if (process.env.SENTRY_DSN) Sentry.captureException(error, { extra: context })
```

14 call sites across `cron/pitches`, `cron/refresh`, `cron/sos-weekly`, `api/update`, `api/explore/query`, and `api/admin/backfill-stuff-plus` light up on a one-line change. (measured)

**Move to Team ($26/mo)** the first time you must answer "when did this start?" about something older than 30 days. The last outage ran 90 days, so that day is coming.

---

## 4. Heartbeat monitoring — the purchase Vercel forces on you

This rests on one documented fact from Vercel's cron docs — *"Cron job delivery is best effort… your function does not execute, **and no runtime log is created for that scheduled run**"* — plus **"Vercel will not retry an invocation if a cron job fails."** The consequence:

> **A self-reported run table cannot report a run that never happened.** `cron_runs` is written by `trackCronRun` *from inside the job*. If Vercel never invokes `/api/cron/pitches`, there is no row, no log, no error, no alert — just a gap nobody queries.

`trackCronRun` is better than most: it reconciles orphaned `running` rows to `status='timeout'` after a 30-minute cutoff, so a function killed by timeout or OOM gets marked. But that reconciliation only runs **on the next invocation of the same job**, so a job that stops being invoked is never reconciled. (measured — `lib/cronTracker.ts`)

| Tool | Free tier | Paid entry |
|---|---|---|
| **Healthchecks.io** | Hobbyist **$0, 20 checks**, 100 log entries/check | Supporter $5/mo (still 20 checks); **Business $20/mo or $192/yr ($16/mo)**, 100 checks, 50 SMS + 20 phone credits; Business Plus $80/mo, 1,000 checks |
| **Cronitor** | Hacker **$0, 5 monitors** | **$2/monitor/mo** + $5/extra user, 12-month retention; Enterprise **from $6,000/yr**. 18 crons = **$36/mo**. |
| **Better Stack** | **$0**: 10 monitors & heartbeats, 3 GB logs at 3-day retention | Responder **$34/mo**; Telemetry from Nano **$45/mo**. The bundle is the product; heartbeats are the attachment. |
| **Sentry Crons** | 1 monitor per plan | **$0.78/monitor**, PAYG only — 18 crons ≈ **$13.26/mo** |

**Verdict: Healthchecks.io Hobbyist, free.** 20 checks against 18 `vercel.json` cron entries (measured) fits with two slots spare — which is also the upgrade trigger. At the 19th cron go to **Business at $16/mo annual**, not Supporter, which is still capped at 20.

**Why not Sentry Crons, despite one fewer vendor:** put the dead-man's switch on a *different* vendor from the error sink, so a Sentry outage or bad DSN still leaves something watching. Correlated failure between "the thing that reports errors" and "the thing that notices silence" is exactly what this category exists to prevent, and it costs $0 to avoid. (inferred — alert-path independence; `04-alerting-oncall-design.md`)

**Instrumentation note:** ping `/start` at handler entry and success at exit from inside `trackCronRun`, so one edit covers all 18 jobs and the monitor measures duration rather than liveness — the saturation signal from `01-pipeline-observability-fundamentals.md` §3, free.

---

## 5. Metrics and dashboards

| Tool | Free tier | Unit prices |
|---|---|---|
| **Grafana Cloud** | 10k active series, 50 GB each logs/traces/profiles, **14-day retention**, 3 users | **Pro $19/mo** platform fee; $6.50/1k series beyond 10k; logs $0.400/GB write, $0.100/GB retain; visualization $8.00/user; IRM $20/user. Enterprise from **$25,000/yr** commit. |
| **Datadog** | trial only | Infrastructure **Pro $15/host/mo** annual ($18 on-demand), Enterprise $23; logs **$0.10/GB**, indexing **$1.70/million events**; APM $31/host/mo. |
| **Better Stack** | 3 GB logs/traces, 3-day retention | Telemetry Nano **$45/mo** (40 GB) → Tera $750, 30-day retention; overage **$0.15/GB**. |

**Verdict: Grafana Cloud Free, for exactly one job** — not application logs, but the **Supabase Prometheus endpoint** at `https://<ref>.supabase.co/customer/v1/privileged/metrics` (Basic auth as `service_role`, 1-min scrape), exposing ~200 Postgres series across CPU, IO, WAL, connections, and query stats, with dashboard JSON in `supabase/supabase-grafana`. That covers two standing Triton priorities — **disk pressure on the 8GB plan** and **dead-tuple/bloat watch on `pitches` and `retro_events`** — inside 10k active series, for **$0**.

**Anti-pattern:** do not route application logs into any of these. Log volume is how all three make money, and Triton's detection need is an assertion over Postgres, not full-text search over stdout. $1.70 per million indexed events is a fine price and an irrelevant one when the answer lives in `count(*) FILTER (WHERE stuff_plus IS NOT NULL)`. (inferred)

---

## 6. What Vercel and Supabase already ship — is it enough?

| Built-in | Price | Detection value |
|---|---|---|
| Vercel **Observability** | Free, all plans | Triage only; no alerting on data conditions. |
| Vercel **Observability Plus** | **$1.20/1M events** | p75 latency, path breakdowns, **30-day retention**. Forensics, not detection. |
| Vercel **runtime log retention** | **Hobby 1h, Pro 1 day, Enterprise 3 days**; 30 days with Plus | The trap — see below. |
| Vercel **cron jobs** | Included | **No failure notification, no retry, no log on a missed invocation.** |
| Supabase **log retention** | Free 1 day, **Pro 7 days** ($25/mo), Team 28 days ($599/mo), Enterprise 90 days | 7× Vercel Pro, and Postgres logs live here — where `canceling statement due to statement timeout` is findable. |
| Supabase **metrics endpoint** (Prometheus, ~200 series) | Included (beta) | High — see §5. |
| Supabase **Log Drains** | **$60/mo per drain** + **$0.20/1M events** + egress | Low — $60/mo to forward logs to a platform you shouldn't buy. |
| Supabase **usage email alerts** | Included | Fires at 20% from plan limits. Weak, but the disk warning is relevant on 8GB. |

**The retention trap, as a receipt.** `reportError` emits to `console.error`, which on Vercel Pro lands in a store with **1-day retention**. The Stuff+ failure recurred for ~90 nights and each night's evidence was deleted before the next ran — not merely unmonitored, but unforensicable. Sentry Developer's 30-day retention, at $0, is a 30× improvement on the one dimension that mattered.

**Answer: no.** Neither platform has a concept of a data assertion or an alert on absence. Take Supabase's metrics endpoint and 7-day logs; **skip Log Drains** — the worst price-per-unit-of-detection here.

---

## 7. OpenTelemetry as the vendor-neutral substrate

OTel is a CNCF project (OpenTracing + OpenCensus merged) giving one SDK for traces, metrics, and logs over OTLP. Its docs draw the boundary: *"OpenTelemetry is **not** an observability backend itself… The backend (storage) and the frontend (visualization) of telemetry data are intentionally left to other tools."* The lock-in argument, verbatim: *"You own the data that you generate. There's no vendor lock-in."* On Vercel, `@vercel/otel` (`registerOTel({ serviceName })` in `instrumentation.ts`) is the supported path; custom spans are unsupported on the Edge runtime, and hand-rolling the SDK forfeits Session Tracing and Trace Drains.

**Verdict: not now, and not because of cost.** OTel standardizes *emission*; Triton's failure mode is that the events that matter are never emitted — the Stuff+ exception was dropped before any exporter could observe it. A telemetry standard layered on a swallowed exception produces beautifully structured silence. Preserve the option by keeping `reportError` and `trackCronRun` as the only chokepoints; adopting OTel later is a change inside two files (`01-pipeline-observability-fundamentals.md` §5.3). (inferred)

---

## 8. What Triton should do, in order

1. **Wire Sentry into `reportError` and delete the TODO.** `npm i @sentry/nextjs`, set `SENTRY_DSN`, replace the comment at `lib/observability.ts:35`. $0, ~10-line diff, lights up all 14 call sites. Then **prove it** — throw from `/api/cron/sos-weekly` and confirm the event lands. An unverified sink is the same as the TODO.
2. **Create 18 Healthchecks.io checks, one per `vercel.json` cron, free tier.** Ping `/start` and success from inside `trackCronRun`; grace ≈ 2× observed p95. The *only* mechanism that detects Vercel's documented non-delivery.
3. **Extend `trackCronRun`'s `counts` to rows-in/rows-out plus the processing window** (`01-pipeline-observability-fundamentals.md` §4.1). `cron_runs.counts` is already jsonb — zero schema change, and every later monitor queries this table.
4. **Write the coverage assertion as SQL in `/api/cron/refresh`**: populated-fraction of `stuff_plus`, command, and deception over the trailing 7 days, floor 0.95, `reportError` + throw on breach so the run goes red and Sentry pages (`03-volume-completeness-monitoring.md`).
5. **Point Grafana Cloud Free at the Supabase metrics endpoint** with the `supabase-grafana` dashboard; alert on disk headroom and `n_dead_tup` for `pitches`/`retro_events`.
6. **Add the saturation monitor — statement duration as a fraction of the 8s `authenticator` cap** — from `trackCronRun`. The only signal that *predicts* rather than detects, and none of these vendors sells it.

### Anti-recommendations

- **Do not buy a data-observability platform.** Two of eight were acquired inside 16 months, six publish no price, and the default monitor set of all of them stayed green through Triton's only known three-month outage. The revisit trigger is §8.1, and it is not "we had another incident."
- **Do not buy Vercel Observability Plus as a detection tool.** It buys retention and p75 breakdowns — a better debugger, with no assertions and no alerting on absence. It would not have fired once during the Stuff+ collapse.
- **Do not buy Supabase Log Drains at $60/mo/drain.** The problem was never log transport; nothing asserted on the data and the alert path ended in a comment.
- **Do not adopt OpenTelemetry this quarter.** It standardizes telemetry Triton isn't emitting.
- **Do not treat `cron_runs` as the dead-man's switch.** It is written by the job; a job that never starts writes nothing, and orphan reconciliation only runs on that job's *next* invocation.

### 8.1 Graduation triggers — buy when one is true, not before

- **>5k errors/month, or history needed past 30 days** → Sentry Team, **$26/mo** annual.
- **More than 20 scheduled jobs** → Healthchecks.io Business, **$16/mo** annual.
- **A second person on call, or alerts needing escalation** → a real on-call tool (`04-alerting-oncall-design.md`): Grafana IRM **$20/user/mo** or Better Stack Responder **$34/mo**.
- **Hand-written assertions exceed ~30 and start rotting** → checks-as-code (Soda Free, or dbt tests), *before* paying for a platform.
- **~50+ tables feed a product surface, or column-level lineage past three hops** → Metaplane's free tier (10 tables) is the cheapest real trial; see `08-lineage-impact-analysis.md`.

**Highest-leverage next action:** replace the comment at `lib/observability.ts:35` with a live Sentry call, then prove it by throwing from a cron route and watching the event arrive. Everything else is optional until failures stop being silent.

---

## Sources

1. [Sentry — Pricing](https://sentry.io/pricing/) — tier prices, error quotas, retention, seats.
2. [Sentry Docs — Pricing](https://docs.sentry.io/pricing/) — included monitors; $0.78/$1.00 extras; per-error rates.
3. [Rollbar — Pricing](https://rollbar.com/pricing/) — free-tier limits; paid prices unpublished.
4. [Healthchecks.io — Pricing](https://healthchecks.io/pricing/) — check counts and prices, four tiers.
5. [Cronitor — Pricing](https://cronitor.io/pricing) — free 5 monitors; $2/monitor/mo; Enterprise floor.
6. [Better Stack — Pricing](https://betterstack.com/pricing) — free heartbeats; Responder $34/mo; bundles, overage.
7. [Grafana — Pricing](https://grafana.com/pricing/) — free tier, Pro $19/mo + per-unit rates, Enterprise commit.
8. [Datadog — Pricing](https://www.datadoghq.com/pricing/) — per-host rates; log ingest and indexing prices.
9. [Monte Carlo — Scale Order Form](https://montecarlo.ai/pricing/scale-order-form/) — $0.28/credit; consumption rates unpublished.
10. [Metaplane — Pricing](https://www.metaplane.dev/pricing) — free-tier caps; Pro per-table rate unpublished.
11. [Datadog — acquires Metaplane](https://www.datadoghq.com/blog/datadog-acquires-metaplane/) — 2025-04-23; no terms.
12. [Bigeye](https://www.bigeye.com/) — positioning; no public pricing.
13. [Sifflet — Pricing](https://www.siffletdata.com/pricing) — asset-count tiers, no published prices.
14. [Coalesce — SYNQ acquisition](https://coalesce.io/company-news/coalesce-announces-acquisition-of-synq-and-launch-of-coalesce-quality/) — 2026-03-10 acquisition, terms undisclosed.
15. [Elementary — Pricing](https://www.elementary-data.com/pricing) — Cloud tiers, no USD prices; OSS edition.
16. [Soda — Pricing](https://www.soda.io/pricing) — Free $0, **Team $750/month**, Enterprise custom.
17. [Datafold](https://www.datafold.com/) — focus; `/pricing` redirects to `/contact-us`.
18. [Vercel — Observability Plus](https://vercel.com/docs/observability/observability-plus) — $1.20/1M events; retention table.
19. [Vercel — Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — no retry; no log for a missed scheduled run.
20. [Vercel — Instrumentation (`@vercel/otel`)](https://vercel.com/docs/tracing/instrumentation) — setup, Edge span limits, Trace Drains caveat.
21. [Supabase — Pricing](https://supabase.com/pricing) — plan prices; log retention by plan.
22. [Supabase — Log Drain usage](https://supabase.com/docs/guides/platform/manage-your-usage/log-drains) — $60/mo per drain, $0.20/1M events, egress.
23. [Supabase — Metrics](https://supabase.com/docs/guides/telemetry/metrics) — endpoint, auth, ~200 series, dashboard.
24. [OpenTelemetry — What is OpenTelemetry?](https://opentelemetry.io/docs/what-is-opentelemetry/) — CNCF scope; "not an observability backend"; no lock-in.

**Triton-internal evidence (measured 2026-08-11):** `lib/observability.ts:35` unwired Sentry TODO and 14 `reportError` call sites across `cron/pitches`, `cron/refresh`, `cron/sos-weekly`, `api/update`, `api/explore/query`, `api/admin/backfill-stuff-plus`; `lib/cronTracker.ts` `cron_runs` schema, `counts` jsonb, and 30-minute orphaned-`running` reconciliation; 18 cron entries in `vercel.json`; 9 files calling `trackCronRun`; `package.json` grep for `sentry|opentelemetry|datadog|rollbar|axiom|logtail|grafana` returning zero matches. Stuff+ coverage-decay figures from `Jo/context/triton-context.md`.
