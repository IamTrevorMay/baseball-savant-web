---
title: Triton Data Platform Context — Pipelines, Constraints, Failure History
domain: context
tags: [context, triton-platform, pipelines, cron, supabase, postgres, reliability]
last_updated: 2026-08-11
---

# The Platform Jo Serves

> Ground-truth context doc for Jo. Every `applied/` doc and every piece of Jo's advice should be
> framed against what's written here. Items marked *(assumption)* should be confirmed with Trevor
> and corrected in place. Items marked *(verify)* are point-in-time measurements that drift —
> re-measure before relying on them.

## The Operator

**Trevor May** — founder/operator. Former MLB pitcher (Twins, Mets, Athletics, 2014–2023), now
running Mayday Media and building Triton. He is simultaneously the product owner, the primary
analyst, and the person woken up by a bad number. Developer-level data literacy — do not
oversimplify, and do not hide uncertainty behind reassurance.

The platform is built and modified rapidly with AI assistance. Recommendations should be shippable
in that mode: incremental, high-value-per-change, and self-verifying where possible.

## The Stack

- **Next.js 16** on **Vercel**; **Supabase** (Postgres + Realtime + Storage), project
  `xgzxfsqwtemlcosglhzr`.
- Data access from app code goes through two RPCs — this is the single most important architectural
  fact for Jo:
  - `run_query(query_text)` — SELECT/WITH only, raises otherwise.
  - `run_mutation(query_text)` — INSERT/UPDATE/DELETE only; wraps the statement to capture a
    `RETURNING` clause if present, otherwise executes and returns `[]`.
  - `run_query_long(query_text)` — same as `run_query` but carries a **function-level
    `statement_timeout=120s`**. **There is no `run_mutation_long`.**
- `lib/supabase-admin.ts` exports `supabaseAdmin` (30s) and `supabaseAdminLong` (120s). These are
  **client-side fetch timeouts only**.

## Hard Constraints (memorize these)

| Constraint | Value | Consequence |
|---|---|---|
| `authenticator` `statement_timeout` | **8s** | Caps **every** `run_query`/`run_mutation` call. `service_role` has no override and `SET ROLE` does not re-apply rolconfig, so the session keeps 8s. |
| `authenticator` `lock_timeout` | **8s** | A blocked DDL/UPDATE aborts rather than queueing. |
| `anon` / `authenticated` `statement_timeout` | 3s / 8s | Front-end queries are tighter still. |
| `run_query_long` | 120s | The **read-side** escape hatch. No write equivalent. |
| Vercel `maxDuration` | 300s on cron routes | The outer ceiling; `/api/cron/pitches` was tuned down from ~280s. |
| Supabase disk | 8GB plan *(verify — current usage far exceeds this; confirm the actual plan)* | VACUUM between large batch updates. |

**The 8s cap is the defining constraint of this platform.** Raising a client timeout does not touch
it. Empirically on `pitches` (2026 data, ~29 indexes): **~8k rows per UPDATE statement passes,
~11k times out.** Anything larger must be chunked by an indexed column.

## Data Assets *(verify — measured 2026-08-11)*

| Table | Rows | Total size | Index size | Notes |
|---|---|---|---|---|
| `retro_events` | 14.9M | 19 GB | 2.5 GB | Retrosheet play-by-play, 1914+ |
| `pitches` | **8.89M** | 9.7 GB | **4.8 GB** | Statcast 2015–2026, 90+ cols, **29 indexes** |
| `milb_pitches` | 2.54M | 2.4 GB | 1.4 GB | MiLB 2023+; Title Case events (normalize!) |
| `pitch_videos` | 1.48M | 430 MB | 178 MB | Clip archive index |
| `bat_tracking_swing_miss` | 162k | 58 MB | 18 MB | Season-cumulative snapshot |
| `player_season_stats` | 79k | 13 MB | 5 MB | ERA/W/L/SV/IP, 1974+ |

Two numbers Jo should internalize:

1. **`pitches` indexes are ~50% of the table's total size** (4.8 GB of 9.7 GB). Every row UPDATE
   pays 29 index writes. This is why bulk writes on this table are so much more expensive than the
   row count suggests, and it is the mechanical reason the 8s cap bites.
2. **`pitches` was carrying 1.44M dead tuples on 2026-08-11**, immediately after a ~250k-row
   backfill. MVCC bloat from batch updates is a live concern on this table — VACUUM after large
   remediation, and watch `n_dead_tup`.

**Note:** `CLAUDE.md` still describes `pitches` as "7.4M+ rows" (it is 8.89M) and `players` as
"4,017 players" (it is **16,924**). `Soto/context/triton-context.md` describes an "8GB disk plan"
while the largest tables alone total ~32 GB. **Treat every number in the repo docs as stale until
re-measured.** This is a standing hazard, not a one-off.

**Normal ingest lag is 2 days, not 1.** Measured 2026-08-11: `max(pitches.game_date)` = 2026-08-09.
A naive `max(game_date) >= current_date - 1` freshness assertion would false-alarm every day — which
is precisely why the freshness SLI must be schedule-anchored (see
`data-reliability/02-data-freshness-slos.md` §4).

## The Pipelines

**18 cron entries across 16 distinct paths** in `vercel.json` (`roster` and `/api/game/warmup` each appear twice). Two cron *routes* exist on disk with **no `vercel.json` entry at all** — `app/api/cron/challenges/` and `app/api/cron/newsletter/`. The newsletter route appears superseded by the generalized, template-driven `/api/cron/emails` (which reads active `email_products` rows) rather than being a broken job, but this is *(verify with Trevor)*. A route that looks like a cron and never runs is exactly the thing that gets assumed to be working.

The pitch chain is the one that matters most:

```
09:00 UTC  /api/cron/pitches      fetch Savant → upsert → score stuff_plus (3-day window)
09:10 UTC  /api/cron/refresh      baselines → triton/deception → league_averages
                                  → percentiles → matviews → bat tracking → pitch videos
09:30 UTC  /api/cron/player-stats MLB Stats API season aggregates
```

- `/api/cron/pitches` syncs a **3-day window** (covers delayed Savant uploads) per game type, then
  writes a `pitches_last_run` marker into `system_metadata`.
- `/api/cron/refresh` reads that marker and gates its downstream work on `totalInserted > 0` and on
  whether the compute steps succeeded. Heavy work was deliberately moved here because
  `/api/cron/pitches` was hitting ~280s against the 300s ceiling and dying ~1 night in 3.
- Other crons: `abs`, `milb-pitches`, `roster` (×2), `briefs`, `daily-cards`, `daily-graphics`,
  `wbc`, `cleanup`, `janitor`, `emails`, `integrity`, `newsletter`, `sos-weekly`, `challenges`.
- `trackCronRun` (`lib/cronTracker.ts`) records runs; `reportError` (`lib/observability.ts`) emits
  structured errors. **`reportError` currently has a `TODO` for Sentry — errors are emitted but not
  yet routed to a paging destination.** *(This is the biggest open reliability gap.)*

## Failure History — Learn From These

### The 2026 Stuff+ outage (found 2026-08-11)

The canonical Jo case study. `pitches.stuff_plus` coverage decayed **Apr 99.5% → May 90% → Jun 18%
→ Jul 4% → Aug 0%** and nobody noticed for three months. It surfaced only because someone asked why
a pitcher's Stuff+ had declined — and the honest answer was *"there is no Stuff+ data."*

- **Root cause:** the nightly scoring UPDATE covered the ingest's full 3-day window (~12k rows ×
  29 indexes) in a single statement and crossed the 8s `statement_timeout` as the 2026 table grew.
- **Why it was silent:** the error was caught, `console.error`'d, and discarded; the cron still
  returned 200 and `trackCronRun` recorded success.
- **A wrong first diagnosis:** the initial read was "the full-season baseline refresh starves the
  UPDATE of the 300s function budget." That was wrong — `pitch_baselines` was fully current, which
  *proved* the baseline step was succeeding. The real cause was the 8s RPC cap. **Jo should treat
  "baselines are current" as evidence about which step ran, and should expect her first root cause
  to be wrong until re-measured.**
- **Fix:** `applyStuffPlusForDateRange` now issues **one statement per day** (~4k rows, ~1.4s each;
  a 3-day window completes in ~4.2s). Failures route through `reportError` and throw so
  `trackCronRun` records a failed run — ingested pitches still commit.

### The backfill route that never worked

`/api/admin/backfill-stuff-plus` was written to repair exactly this kind of gap and had **never
functioned**. Its `hasMore` probe was `SELECT COUNT(*) ... LIMIT 1 OFFSET n` — `COUNT` returns a
single row, so any `n > 0` yields zero rows and the loop always exited after one batch. That batch
tried to rewrite the whole year at once and timed out. Its `ctid = ANY(SELECT ctid ... LIMIT n
OFFSET m)` paging also had no `ORDER BY`, so batches could overlap or skip rows.

**Lesson:** repair tooling that is never exercised is decorative. Rewritten 2026-08-11 with
date chunking (default 1 day), `?mode=repair` (default, `stuff_plus IS NULL`, idempotent) vs
`?mode=rescore`, and per-chunk coverage accounting.

### The integrity cron — a monitor that exists and is being ignored

**Correction to an earlier version of this doc, which claimed no monitoring existed.** Triton has an
`integrity_checks` table and an `/api/cron/integrity` job (10:00 UTC daily). Measured 2026-08-11:

- **776 check rows over 95 distinct run days** (2026-05-08 → 2026-08-11) across 8 checks.
- **Zero rows with `status='fail'` — ever.**
- Chronic un-actioned warns: `materialized_views` ×56 since 2026-06-14, `new_pitch_names` ×54
  (max 8 unknown pitch names), `pitch_baselines` ×47 since 2026-06-26.

So the accurate diagnosis is not "Triton has no monitoring." It is **"Triton has a monitor whose
warnings have been ignored for two months, and which structurally cannot fail."** Jo should extend
and wire up `integrity_checks` rather than proposing a parallel system.

**Two verified code defects in `lib/dataIntegrity.ts` (confirmed 2026-08-11):**

1. **No check function can return `fail`.** The `CheckResult` type permits
   `'pass' | 'warn' | 'fail' | 'remediated'` (line 9), but the module's actual returns are
   10× `pass`, 8× `warn`, 1× `remediated` — **zero `fail`**. The only `'fail'` in the system is
   emitted at `app/api/cron/integrity/route.ts:52` when a promise *rejects*. A check that correctly
   detects a real problem returns `warn`, `warn` doesn't throw, and `trackCronRun` records success.
   That is why 776 results over 95 run days contain no failures.
2. **Two checks report `pass` on query error.** `lib/dataIntegrity.ts:108` and `:167`:
   ```ts
   if (error || !orphans || orphans.length === 0) {
     return { check_name: 'orphaned_pitchers', status: 'pass', found: 0, remediated: 0,
              details: error ? { queryError: error.message } : {} }
   }
   ```
   A timeout is reported as clean data. **This is the Stuff+ failure mode reproduced inside the tool
   built to detect that class of failure** — an error caught, stashed somewhere nobody reads, and a
   success returned.

The smallest edit that turns a suite which has never failed into one that can: give those error
branches a distinct status (`errored`), and make `/api/cron/integrity` throw on anything that isn't
`pass`/`warn`/`remediated`. Severity must be **three-way — pass / breached / could-not-evaluate**;
every hand-rolled suite forgets the third, and it is exactly the state Triton maps to `pass`.

### Assertion cost is dominated by cold buffer reads, not row counts

Measured 2026-08-11 with `EXPLAIN (ANALYZE, BUFFERS)` on `pitches`:

| Assertion | Window | Cold | Warm |
|---|---|---|---|
| `stuff_plus` coverage | 7 days | **9,923 ms** | 529 ms |
| natural-key duplicates | 7 days | **18,302 ms** | — |
| natural-key duplicates | 2 days | — | 16.4 ms |
| coverage + range, grouped | 3 days | — | 15.3 ms |

All used `idx_pitches_game_date` — these are good plans, and the 7-day forms still blow the 8s cap.
An 18.8× spread on identical logic comes from cold buffer reads, and **the 09:00 UTC cron is always
the cold case.** Therefore: **live assertion windows must be 2–3 days**; anything longer reads a
rollup (`stuff_plus_n`) instead of scanning. An assertion that times out is worse than none, because
it currently fails in a way that reports success.

Note also that the `materialized_views` and `pitch_baselines` warns are in the same dependency
chain that broke in 2026. Whether they were warning *about* the Stuff+ decay is unconfirmed and
worth investigating *(verify)*.

### The coverage detector already exists in the schema

`scripts/create-materialized-views.sql` defines **`stuff_plus_n` — `COUNT(p.stuff_plus)::int`** — on
the pitcher-season materialized views (lines 105, 323, 374). It is refreshed nightly. That means

```sql
SELECT SUM(stuff_plus_n)::float / NULLIF(SUM(pitches), 0) AS coverage
FROM mv_pitcher_season_stats WHERE season = <current>;
```

reproduces the exact 99.5% → 0% decay curve from a small, already-materialized table, with **zero new
infrastructure**. The instrument to detect Triton's worst outage was already built and simply never
read. This is the cheapest possible first monitor.

Relatedly: `/api/cron/integrity` (`lib/dataIntegrity.ts`) runs eight checks — `unknown_players`,
`orphaned_pitchers`, `orphaned_batters`, `new_pitch_names`, `season_constants`,
`materialized_views`, `pitch_baselines`, and one more. Every one tests **existence or referential
shape**; none tests **coverage of a derived column**. `checkPitchBaselines` passed correctly every
night of the outage — because baselines *were* current. Right instrument, wrong node.

### Ordering inversion introduced by the 2026-08-11 refactor *(known, low impact)*

Splitting `computeStuffPlusForDateRange` moved baseline refresh into `/api/cron/refresh` (09:10)
while scoring stayed in `/api/cron/pitches` (09:00). **Scoring therefore runs against baselines
written 23h50m earlier.** Numerically negligible — one night's ~4k pitches barely move a ~650k-row
season aggregate — and arguably better for reproducibility. Two caveats:

1. **Season start:** on the first day of a new `game_year`, no baseline row exists, so scoring
   no-ops and that day's coverage is 0 until the next night. The 3-day re-sync overlap then rescores
   it, so it self-heals within ~48h.
2. It is still an inverted dependency. The clean fix, if wanted, is to have `/api/cron/refresh` call
   `applyStuffPlusForDateRange` for the ingested window after refreshing baselines (~4s, idempotent).

### The unconditional upsert *(inferred — measure before acting)*

`app/api/update/route.ts:148` uses `{ onConflict: 'game_pk,at_bat_number,pitch_number',
ignoreDuplicates: false }` — an **unconditional `ON CONFLICT DO UPDATE`**. The ingest re-upserts a
3-day window nightly, so ~8k of the ~12k rows already exist and are almost always byte-identical.
Postgres still writes a new heap tuple, up to 29 index entries, and a dead old tuple for every one.

```
8,000 rewritten rows/night × ~180 game days ≈ 1,440,000 unnecessary row versions
observed n_dead_tup on pitches (2026-08-11):   1,437,923
```

**Treat that agreement as suggestive, not proven.** `n_dead_tup` is a cumulative estimator that
resets on vacuum, and the reading came immediately after a ~250k-row backfill plus rescore testing
that would contribute ~275k on its own. Jo's first Stuff+ root cause was wrong precisely because one
suggestive coincidence was trusted. **The test is one `n_dead_tup` reading on each side of a single
cron run.**

Two consequences either way:

1. **`totalInserted` does not mean what its name says.** `inserted += batch.length` counts every
   upserted row including no-op updates, so during the season it is always ~12k. The
   `skipDownstream = totalInserted === 0` gate in `/api/cron/refresh` therefore **can essentially
   never fire in-season** — the "skip if no new data" logic is effectively dead code.
2. PostgREST's `.upsert()` cannot express a `WHERE ... IS DISTINCT FROM` guard on the DO UPDATE, so
   suppressing no-op writes means a raw SQL upsert through `run_mutation` (feasible at the existing
   500-row batch size, well inside the 8s cap) — a real but bounded rewrite.

### Known-stale or unresolved

- `reportError` has no Sentry/paging sink wired (`lib/observability.ts` TODO). This is why the
  integrity warns go nowhere.
- No **coverage** assertion exists on any derived column. `integrity_checks` covers other ground.
- `errors` is counted in `syncPitches` (`app/api/update/route.ts`) and **never asserted on**.
- `app/api/update/route.ts` treats a short Savant response (`csv.length < 100`) as a successful
  zero-row fetch — an upstream error page and a no-games day are indistinguishable, and both gate
  `/api/cron/refresh` off entirely.
- Three jobs share the `0 9 * * *` slot (`pitches`, `milb-pitches`, `roster`) against one connection
  pool and one 8s-capped RPC path.
- **Vercel does not retry failed cron invocations** (confirmed against Vercel docs, 2026) and
  delivery is best-effort in both directions — runs can be missed *and* double-fired. Triton's
  compensating control is the 3-day re-sync overlap window.
- `export const maxDuration = 300` is now the platform **default**, not an increase — those
  declarations are no-ops on current Vercel plans.
- 5 pre-existing test failures in `__tests__/lib/queryCache.test.ts` (Supabase mock lacks
  `.maybeSingle()`), unrelated to app behavior but they mask new failures.
- `scripts/backfill-pitch-videos.ts` independently hit the same 8s wall and worked around it by
  switching to `run_query_long` — evidence other jobs sit near the ceiling.

## Conventions Jo Must Follow

- **Every ad-hoc DB query gets logged to `docs/Queries.md`** before returning results — date header,
  short description, fenced SQL, one-line result summary.
- Metric/param/schema changes update **`docs/VARIABLES.md`** in the same commit.
- Significant features, perf work, or architectural changes update **`planning.md`** ("Recently
  Completed", "Known Issues", "Architecture Notes").
- Mutations go through `run_mutation`. VACUUM between large batch updates.
- **Never push without explicit approval.** Commit when asked; branch first if on `main`.
- Ask clarifying questions (AskUserQuestion) before starting significant changes.

## Jo's Standing Priorities for This Platform

1. **Wire a real alerting sink.** `reportError` → Sentry (or equivalent). Everything else is
   secondary while failures can still be silent.
2. **Coverage monitors on derived columns.** `stuff_plus`, command, deception, `league_averages`
   freshness. Assert ≥95% coverage on the trailing window, daily.
3. **Audit the other 16 crons for the 8s cap.** Two jobs have already hit it independently.
4. **Dead-tuple/bloat watch on `pitches` and `retro_events`.**
5. **Make `trackCronRun` distinguish "ran" from "did the work."** Row counts in, row counts out.
