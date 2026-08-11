---
title: Incident Response & Forensics — Diagnosing Data Incidents Without Fooling Yourself
domain: data-reliability
tags:
  - incident-response
  - root-cause-analysis
  - five-whys
  - blameless-postmortem
  - bisection
  - data-vs-world
  - corrections-protocol
sources_reviewed: 18
last_updated: 2026-08-11
---

# Incident Response & Forensics — Diagnosing Data Incidents Without Fooling Yourself

## TL;DR

- **The first question in a data incident is never the question that was asked.** "Why did Cade Povich's Stuff+ decline?" hides a prior question — *is there Stuff+ data at all?* In August 2026 there wasn't, for any pitcher, for three months. (measured)
- **"Data is wrong" vs "the world changed" is decided by population shape, not magnitude.** Bugs carve along *ingest* structure — a date range, a game type, a NULL column — and are suspiciously uniform. Real changes carve along *baseball* structure and have variance. If your slice boundary is midnight UTC, it is you. (inferred)
- **There is a third bucket: upstream restatement.** Savant added the sweeper in Feb 2023 and retroactively re-tagged prior seasons. Nothing broke; nothing changed on the field. Undetectable unless you kept last month's answer. (documented)
- **Your first root cause is usually wrong, because it was *consistent* rather than *tested*.** Triton's first diagnosis — "the baseline refresh starves the scoped UPDATE of the 300s Vercel budget" — fit every observation and named a real constraint. The actual cap was the 8s `authenticator` statement timeout. (measured)
- **The falsifying evidence was in hand and misread.** Budget starvation predicts a function killed at ~300s; what happened was a Postgres cancellation at ~8s, SQLSTATE `57014` — a string that existed nightly for three months and was `console.error`'d into the void. (measured)
- **Single-root-cause attribution is nearly always wrong** — failure requires multiple faults, each necessary but only jointly sufficient. This outage needed six conditions; 5 Whys yields one. (documented)
- **Bisecting a resource-exhaustion decay gives a fuzzy boundary, not a first bad commit.** A statement near an 8s ceiling passes some nights and fails others. A step points at a deploy; a sigmoid at growth crossing a fixed limit. (inferred)
- **Build two timelines — the data clock (`game_date`) and the system clock (`cron_runs`, deploys, DDL).** The gap is time-to-detection: ~90 days here. And you cannot date rows without a write timestamp; `pitches` has none *(verify)*. (measured)
- **Blameless, on a one-person team, means the unit of analysis is the system that let AI-assisted code ship without a detector.** Ban counterfactuals ("should have caught it") — hindsight bias in a lab coat. (documented)
- **A published wrong number makes the correction its own data product,** with the wrong value restated explicitly, as newsrooms do. Dashboards self-heal; newsletters do not. (documented)
- **Every incident ends with a detector or it did not end.** The Stuff+ fix shipped without a coverage monitor. Not closed. (measured)

---

## 1. The premise check: answer the question under the question

Every Triton incident so far entered through an analytical question, not an alert — the expected shape when `reportError` still carries a Sentry `TODO` (`lib/observability.ts:35`).

The 2026 outage entered as *"Why did Cade Povich's Stuff+ decline?"* "He lost ride and the baseline moved" requires nothing, is always plausible, and produces a fabricated narrative a former MLB pitcher then acts on. "Small sample" sounds rigorous and still assumes the data exists. The honest answer cost one query.

```sql
SELECT date_trunc('month', game_date) AS mon,
       count(*) AS pitches, count(stuff_plus) AS scored,
       round(100.0 * count(stuff_plus) / count(*), 1) AS pct
FROM pitches WHERE game_year = 2026 GROUP BY 1 ORDER BY 1;
```

Run it through `run_query_long` — a full-season scan of an 8.89M-row table will not finish inside the 8s cap. Log it to `docs/Queries.md`.

**Rule:** never explain a movement in a derived metric before establishing coverage of that metric over the same window. See `01-pipeline-observability-fundamentals.md` §2 on coverage as a pillar, and `06-failure-modes-taxonomy.md` for the classes this screens.

---

## 2. Is the data wrong, or did the world change?

The two hypotheses predict different *shapes*. That makes this decidable rather than a coin flip.

| Signal | "Our data is wrong" | "The world changed" |
|---|---|---|
| **Population boundary** | Ingest structure: a `game_date` range, one `game_type`, one level, a NULL column | Baseball structure: pitch type, handedness, role, team |
| **Onset** | Step at midnight UTC, a deploy SHA, a season rollover; or decay tracking table growth | Ramp from a rule's effective date; ragged onset |
| **Rows vs values** | Rows present, column NULL — or rows missing | Column populated, *value* moved |
| **Co-movement** | Everything one job writes moves together, physically related or not | Coupled metrics move coherently: spin ↓ → movement ↓ → whiff ↓ |
| **Cross-source** | Savant and the MLB Stats API disagree | Both agree; Retrosheet agrees where it overlaps |
| **Reproducibility** | Re-running the job changes the number | Re-running reproduces it exactly |
| **Dispersion** | Suspiciously uniform league-wide | Some players move a lot, some not at all |

### 2.1 A real change that looked like a bug

June 2021, the foreign-substance crackdown. MLB informed clubs **June 3**; in-game inspections began **June 21**. League four-seam spin fell from **2,316 rpm (Apr 1 – Jun 5) to 2,260 rpm (Jun 6–14)**, then to near-2015 levels after enforcement. Gerrit Cole on June 22 sat **215 rpm** below his season fastball average and **326** below on his sinker. The league line moved from **.237/.312/.396 at a 24.2% K rate** to **.248/.320/.416 at 23%**.

Four discriminators, four *world* answers: pitcher-and-pitch-type boundary with heavy dispersion; two-step onset on the announcement and enforcement dates; physically coherent co-movement; every provider saw it. A distribution monitor on `release_spin_rate` would have paged and been a **true anomaly and a false incident** — drift alerts on baseball-facing columns need a rule-change annotation layer (`data-quality/05-anomaly-detection-timeseries.md`). 2022 repeats it: humidors expanded from 10 parks to all 30 alongside a ball change, a league-wide downturn no pipeline caused.

### 2.2 The third bucket: upstream restatement

Savant announced sweeper classification in **February 2023** and retroactively attributed sweepers to earlier seasons — **0.3% of breaking balls in 2017, 2.3% by 2022** under the new classifier. Nothing about those 2017 pitches changed physically, yet a cached 2017 slider-usage figure is now inconsistent with the source and *neither side is broken*.

Signature: **the same query over the same closed historical window returns a different answer than it did last month.** Undetectable without the old answer. Cheap fix: a `metric_snapshots` table capturing a few stable per-season aggregates weekly. Detection is Jo's; restatement semantics are **Li**'s.

---

## 3. The forensic sequence

Gregg's two **anti-methods** translate directly. *Blame-someone-else* ("Savant must have changed something") defers work to a party you cannot page and needs no evidence. *Streetlight* means investigating the layer you have tooling for — Triton has `cron_runs` and `git log`, so investigations drift toward deploys, exactly where this outage was invisible because the cron was green.

The order that works: **contain before you explain** (gate an imminent newsletter send); **quit thinking and look** at real error text, row counts, durations; build the timelines (§5) and bisect (§4); **state competing hypotheses and their distinguishing predictions** (§6) — the step that gets skipped; then change one thing at a time and leave a detector.

---

## 4. Bisecting a decay

**Time** — find the transition window:

```sql
SELECT game_date, count(*) AS pitches, count(stuff_plus) AS scored,
       round(100.0 * count(stuff_plus) / count(*), 1) AS pct
FROM pitches
WHERE game_date BETWEEN '2026-05-01' AND '2026-07-15'
GROUP BY 1 ORDER BY 1;
```

**Entity** — regroup that window by `pitch_name, game_type`. Uniform collapse across every pitch type ⇒ the boundary is ours. Collapse confined to `game_type = 'S'` ⇒ a per-game-type loop.

**Code** — only now: `git log --since=2026-05-01 --until=2026-07-15 -- app/api/update/route.ts`. First is the streetlight anti-method; here it finds **nothing**. The code did not change; the *table* changed.

**Why the boundary is fuzzy.** `git bisect` works because the predicate is monotone. **Resource-exhaustion failures violate that** — a statement drifting toward an 8s ceiling fails on a *distribution*, not a date, since duration varies with row count, plan choice, cache state, and autovacuum. Hence 99.5% → 90.3% → 17.8% → 4.1% → 0%: a sigmoid, not a step. So **pick the coverage threshold before you bisect** ("first day under 50%") and say you picked it, or you will unconsciously choose the one supporting your hypothesis. And treat the shape as evidence: a sharp step points at a deploy or schema change; a sigmoid points at growth crossing a fixed limit — which alone should have pointed at the timeout in June. CUSUM over the daily coverage series states the changepoint statistically if needed.

---

## 5. Building the timeline

Two clocks, and conflating them is the most common forensic error. The **data clock** is `game_date` — "when did the data go bad" — from `pitches.game_date`, `system_metadata.pitches_last_run`, `mv_last_refreshed`. The **system clock** is wall time — "what changed around then" — from `cron_runs` (`app/api/admin/cron-health/route.ts`), `git log`, and Vercel deployments. The gap between the first data-clock entry and the first human observation is **time-to-detection**; write it as a number. Triton's was ~90 days.

**The missing instrument.** `pitches` records when a game happened, not when a row was written *(verify — no `updated_at` column found)*. "Which rows were scored on which night" is unanswerable, and a retroactive re-score is indistinguishable from an original write.

**Hygiene:** record what was *believed* at each point, not only what was true. "2026-08-11 10:40 — hypothesized Vercel budget starvation" belongs in the timeline.

---

## 6. Root-cause discipline — the extended case study

### 6.1 What happened

| Month | Ingested | With `stuff_plus` | Coverage | League avg shown |
|---|---|---|---|---|
| Apr | 117,333 | 116,795 | 99.5% | 100.97 |
| May | 121,779 | 109,911 | 90.3% | 100.77 |
| Jun | 115,920 | 20,676 | 17.8% | 100.46 |
| Jul | 109,421 | 4,504 | 4.1% | 100.13 |
| Aug | 36,621 | 0 | **0%** | *(null)* |

Ingest never missed a pitch. `AVG()` skips NULLs, so the displayed league average drifted 0.8 points across a total collapse. Every freshness and volume monitor that could have existed would have stayed green.

### 6.2 The wrong first diagnosis

**H1:** *the full-season baseline refresh starves the scoped Stuff+ UPDATE of the 300s Vercel function budget.*

It named a **real** constraint (`maxDuration` is 300s and `/api/cron/pitches` had genuinely run at ~280s before heavy work moved to `/api/cron/refresh`); it explained the **timing** (baseline cost grows with the season's row count, so failure begins mid-season — right prediction, wrong mechanism); and it was **consistent with every observation available.** That last property is the trap. **Consistency is not confirmation.** H1 was never given a test it could have failed.

### 6.3 The falsification that was already on the table

| | H1 — 300s Vercel budget starvation | H2 — 8s `authenticator` statement timeout |
|---|---|---|
| Predicted duration | ~300s, function killed by the platform | run completes fast; the *statement* aborts at ~8s |
| Predicted signature | `FUNCTION_INVOCATION_TIMEOUT`, no PG error | `canceling statement due to statement timeout`, SQLSTATE `57014` |
| Predicted `pitch_baselines` | current (runs first, consumes budget) | current (runs under `run_query_long`, 120s) |
| Effect of splitting the UPDATE | **none** — same total work | **fixes it** — each statement clears the ceiling |
| Observed | ✗ run returned 200 well inside budget | ✓ matches |

**`pitch_baselines` being current does not discriminate** — both hypotheses predict it. "Baselines were current, which proved the baseline step was succeeding" is right about *which step ran* and was over-read as a refutation of H1. Suggestive, not decisive.

**The row that settles it is the error string, and it had been thrown away.** The scoring failure was caught, `console.error`'d, discarded; the cron returned 200. The most discriminating datum in the incident — `57014` versus a platform timeout — existed at the moment of failure every night for three months and was never persisted. A design defect, not an analysis defect.

The measurement that closed it: time one whole-window UPDATE in isolation. It aborted at ~8s, not ~300s. Empirically on 2026 `pitches`, **~8k rows per UPDATE passes and ~11k times out**; the 3-day window was ~12k rows against 29 indexes on a table whose indexes are 4.8 GB of 9.7 GB. `service_role` could not save it: Supabase sets `statement_timeout` on `authenticator` (8s default) and `service_role` does not override it, while PostgreSQL's `SET ROLE` *does not* apply the target role's `ALTER ROLE SET` config — role settings apply at login only (`postgres-performance/07-postgrest-supabase-architecture.md`).

**The fix confirms H2.** `applyStuffPlusForDateRange` (`app/api/update/route.ts:306`) now issues **one statement per day** — ~4k rows, ~1.4s each, ~4.2s for a 3-day window — and routes failures through `reportError` and throws, so `trackCronRun` records a failed run while ingested pitches still commit. Under H1 that change would have done nothing.

### 6.4 Where 5 Whys dead-ends

Why is `stuff_plus` NULL? → the UPDATE didn't apply. Why? → statement timeout. Why? → ~12k rows × 29 indexes exceeded 8s. Why? → the statement was sized to the ingest window, and the table grew. Why? → nobody sized it against the cap.

**Root cause: "no statement-sizing discipline." One action item.** That is the only condition the chain surfaces. The failure required **all six**, each necessary and only jointly sufficient:

1. The statement was sized to the ingest window, not the timeout budget.
2. `pitches` grew past the point where that window fit in 8s.
3. The exception was caught and discarded instead of thrown.
4. `trackCronRun` recorded success because the function returned.
5. `reportError` had no sink (`lib/observability.ts:35`).
6. No coverage monitor existed on any derived column.

Remove any one and the outage is hours or days. Remove #3 or #6 and it is *minutes*. This is Cook's point, and it is why Allspaw pushes **"how"** over **"why"**: "how did the system end up in a state where a swallowed exception was invisible" surfaces conditions 3–6; "why did the UPDATE fail" surfaces only #1.

**Practice:** use 5 Whys to find the *mechanism*, then stop and enumerate conditions. The mechanism is one chain. The incident is a set.

---

## 7. Post-mortems when the team is one person and a fleet of agents

Blamelessness came from healthcare and avionics, where punishing individuals destroys the reporting that makes systems safer. Triton has no one to blame, so the discipline gets repointed, not dropped: **the unit of analysis is the system that allowed AI-assisted code to ship without a detector.**

- **Ban counterfactuals** — "should have caught it," "obviously it was the timeout." Replace with what was *known and available* at each timeline entry.
- **Record the wrong hypothesis.** Omitting it implies the diagnosis was obvious. It wasn't.
- **Separate mechanism from conditions** (§6.4) and give every action item an owner and a detector — Amazon's Correction of Error process is deliberately action-oriented rather than documentation-oriented, the right bias here. Google's template also asks *what went well*; keep it, because "ingested pitches still committed while scoring failed" is a property the fix preserved on purpose.
- **Six headings, no more** — impact, timeline, mechanism, contributing conditions, what we did, what detects it next time. A 12-section template on a one-person team produces zero post-mortems.
- The IMAG split (incident commander / communications lead / operations lead) still earns its keep when one person wears all three hats: it names what solo responders drop first, **communications**.

---

## 8. Correction and communication when published numbers were wrong

Reversibility differs by surface. Dashboards and Reports Builder self-heal on the next query. Broadcast overlays are already gone; `daily_cards` and `/api/daily-graphics` are regenerable; exported CSV/PDF reports are frozen in unknown hands. The newsletter (`/api/cron/newsletter`) is **irreversible — it is in inboxes**.

1. **Establish the exact window and magnitude first.** "Stuff+ was missing for some pitchers in June" is worse than silence. "Stuff+ was absent for 82% of pitches in June, 96% in July, 100% in August; published values described a shrinking non-random subset" is a correction. State direction and size — here the league average moved only 0.8 points while the population collapsed, the part a reader cannot infer.
2. **Restate the wrong value.** NYT/WSJ practice includes the incorrect figure so readers can judge magnitude. Same for a metric: old value, new value, window.
3. **Distinguish a correction from a revision.** Agencies separate *scheduled revisions* (Savant late uploads, the 3-day window, sweeper reclassification) from *errata* (we were wrong). BLS publishes a dated errata page so each correction is on the record. `docs/Queries.md` logs what was run; `docs/Corrections.md` should log what was wrong. *(BLS's numeric threshold is unverified — the page 403s to automated fetch.)*
4. **Never silently backfill a published number.** The silence destroys trust: the next reader diffs their saved copy against live and finds an unexplained change — indistinguishable from upstream restatement (§2.2).
5. **Hand off the surface.** How a correction *renders* — stale-data banner, coverage badge, chart footnote — is **Cas**. Whether the restated series is comparable to the original is **Li**.

---

## 9. What Triton should do, in order

1. **Persist the error string, not just the error.** The most valuable artifact here was a SQLSTATE that was logged and lost. Add `error_code` and the verbatim message to `cron_runs` for every caught-and-continued failure. `applyStuffPlusForDateRange` already collects per-day failures (`app/api/update/route.ts:335-349`) — persist that array instead of `console.error`-ing it.
2. **Wire `reportError` to a sink** (`lib/observability.ts:35`). Same top priority as in `01-pipeline-observability-fundamentals.md` and `04-alerting-oncall-design.md`; second here only because #1 is two lines in a file you are already editing.
3. **Add the daily coverage assertion** on `stuff_plus`, command, and deception over a trailing 7 days, failing the run below 95%. The detector the incident still lacks; without it, it is not closed.
4. **Add a statement-duration margin metric** to `cron_runs` — max statement ms as a fraction of 8000. Drift from 20% to 90% of the cap *predicts* the next outage; coverage collapse is only its obituary.
5. **Add `updated_at` to `pitches`**, set by the scoring UPDATE going forward. Nullable, no backfill — free on rows that statement already touches, and it makes system-clock reconstruction possible. Blast radius: a nullable column with no default is catalog-only in modern Postgres, but takes `ACCESS EXCLUSIVE` and `lock_timeout` is 8s — run it when no cron is active.
6. **Create `docs/Corrections.md`** (append-only, Stuff+ as record one) and **snapshot stable per-season aggregates weekly** so upstream restatement (§2.2) becomes detectable.
7. **Write the Stuff+ post-mortem with the wrong hypothesis in it.** Six headings. Worth more than the fix.

**Anti-recommendation — do not raise the `authenticator` `statement_timeout`.** (a) It is the shared PostgREST login role; raising it lifts the guardrail for every front-end query, including `anon` at 3s, and the first symptom is connection saturation, not a faster job. (b) The 8s cap made this failure *cheap* — an aborted statement instead of a 300-second UPDATE holding locks and bloating a table already carrying 1.44M dead tuples. The timeout did its job. (c) It fixes nothing about conditions 3–6 in §6.4. Chunk the statement; keep the ceiling.

**Anti-recommendation — do not adopt a formal RCA framework or an incident-management platform.** Severity matrices, on-call rotations, and 12-section templates answer a coordination problem Triton does not have. Triton has a *detection* problem and an *evidence-retention* problem; items 1, 3, and 4 address both in under an afternoon.

**Highest-leverage next action:** item 3, the coverage assertion. Until it exists, the 2026 Stuff+ outage can recur identically and would again be found by a human asking about one pitcher.

---

## Sources

1. Google SRE Book — [Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) — blameless definition; timeline and "what went well".
2. Google SRE Book — [Managing Incidents](https://sre.google/sre-book/managing-incidents/) — IMAG roles; living incident document.
3. Google SRE Workbook — [Incident Response](https://sre.google/workbook/incident-response/) — the three Cs; ICS lineage.
4. Allspaw — [Each Necessary, But Only Jointly Sufficient](https://www.kitchensoap.com/2012/02/10/each-necessary-but-only-jointly-sufficient/) — 5 Whys assumes one sufficient cause per symptom.
5. Allspaw — [The Infinite Hows](https://www.kitchensoap.com/2014/11/14/the-infinite-hows-or-the-dangers-of-the-five-whys/) — "how" surfaces conditions; "why" surfaces blame.
6. Cook — [How Complex Systems Fail](https://www.adaptivecapacitylabs.com/HowComplexSystemsFail.pdf) — multiple contributors, each insufficient alone; hindsight bias.
7. PagerDuty — [Howie: The Post-Incident Guide](https://howie-guide.pagerduty.com/) — narrative contributing factors; learning over action items.
8. PagerDuty — [The Blameless Postmortem](https://postmortems.pagerduty.com/culture/blameless/) — counterfactual language; psychological safety.
9. ThinkReliability — [Top Criticisms of the 5-Why Approach](https://blog.thinkreliability.com/top-criticisms-of-the-5-why-approach) — disasters carry five-plus simultaneous causes.
10. Gregg — [Thinking Methodically about Performance](https://queue.acm.org/detail.cfm?id=2413037) — blame-someone-else and streetlight anti-methods.
11. Wheeler — [Review of "Debugging" (Agans)](https://dwheeler.com/essays/debugging-agans.html) — the nine rules; "if you didn't fix it, it ain't fixed."
12. Git — [git-bisect](https://git-scm.com/docs/git-bisect) — binary search over history; `run` exit codes; `skip` precision cost.
13. AWS — [Correction of errors document](https://aws.amazon.com/blogs/mt/creating-a-correction-of-errors-document/) — COE anatomy; action-oriented, non-punitive.
14. Monte Carlo — [Data Incident Management](https://www.montecarlodata.com/blog-how-to-conduct-incident-management-on-your-data-pipelines/) — severity as stakeholder impact × count.
15. Supabase — [Timeouts](https://supabase.com/docs/guides/database/postgres/timeouts) — `authenticator` 8s default; `service_role` inherits when unset.
16. PostgreSQL — [SET ROLE](https://www.postgresql.org/docs/current/sql-set-role.html) — does not process `ALTER ROLE` settings; those apply at login only.
17. ESPN — [Sticky stuff 101](https://www.espn.com/mlb/story/_/id/31660574/sticky-stuff-101-everything-need-know-mlb-foreign-substance-crackdown-begins) — June 3 / June 21 dates; 2,316 → 2,260 rpm; slash-line move.
18. Pitcher List — [A Sweeping Sensation](https://pitcherlist.com/a-sweeping-sensation-what-we-know-about-baseballs-hot-new-pitch/) — Savant's Feb 2023 sweeper announcement, applied retroactively; 0.3% → 2.3%.

**Triton-internal evidence (measured 2026-08-11):** coverage decay and league-average stability from `docs/Queries.md`; outage narrative and wrong first diagnosis from `Jo/context/triton-context.md`; per-day scoring implementation and the 8s rationale comment at `app/api/update/route.ts:295-352`; missing Sentry sink at `lib/observability.ts:35`; `cron_runs` schema and freshness surfacing at `app/api/admin/cron-health/route.ts`; table size, index count, and dead-tuple figures from `Jo/context/triton-context.md`.
