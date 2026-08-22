---
title: Data Reliability — Applied Playbook
domain: applied
tags:
  - data-reliability
  - silent-failure
  - cron-observability
  - alerting
  - dead-man-switch
  - coverage-monitoring
  - triton-platform
last_updated: 2026-08-21
---

# Data Reliability — Applied Playbook

> Turns `Jo/data-reliability/` into sequenced work. Triton's defining defect is not that jobs break
> — it is that **broken jobs report success**. Ordered for dependency, not severity.

## TL;DR

- **`trackCronRun` is the keystone, not alerting.** `lib/cronTracker.ts:66-88` defines success as
  "the callback did not throw," and `app/api/cron/refresh/route.ts:167-192` returns `ok: true as
  const` while stuffing three timeout messages into `counts` — which is how 50 consecutive nightly
  failures were written as `status='success'`. (measured)
- **The alerting sink already exists in the repo.** `app/api/cron/janitor/route.ts:585-613` opens a
  GitHub issue and `:616-640` sends a Resend email, while `lib/observability.ts:35` terminates 9
  `reportError` call sites at a `TODO`. Cheaper than onboarding Sentry. (measured)
- **It is 9 of 17 crons that never write to `cron_runs`, not 8 — the ninth is the janitor**, which
  imports `cronTracker` zero times and whose `EXPECTED_JOBS` at `app/api/cron/janitor/route.ts:7`
  omits `refresh`. The chain that failed 50 nights sat outside the only detector Triton owns.
  (measured)
- **The dead-man switch must live outside Vercel and fire on success only.** The janitor's 20-hour
  `missing` check (`app/api/cron/janitor/route.ts:187-232`) is real, but it is itself a Vercel cron
  and Vercel skipped the 2026-08-14 `pitches` slot with no retry. The ping belongs in
  `lib/cronTracker.ts:71-86`. (measured + documented)
- **Audit finding A10 is still open — read the code, not the commit message.** Commit `f5e57c4`
  closed three unauthenticated SQL paths across 7 files; `app/api/update/milb/route.ts` was not one,
  and its `POST` at `:682-691` still writes `milb_pitches` unguarded while the MLB twin at
  `app/api/update/route.ts:520-521` calls `checkMachineAuth`. (measured)
- **Coverage monitoring would NOT have caught the Stuff+ failure.** `app/api/update/route.ts:322-332`
  `COALESCE`s three of four scoring inputs to 0, so losing `pfx_x`/`pfx_z` leaves `stuff_plus` 100%
  populated, in range, mean near 100. Assert **input** completeness and a variance floor. (measured)
- **Four code paths turn a failure into HTTP 200 and need one fix, not four.** A short Savant
  response (`app/api/update/route.ts:87`), an empty parse (`:136`), contract drift (`:152-168` →
  `:181`) and a missed invocation all end at the same green row, while `errors` is computed at
  `:145` and read by nothing. (measured)
- **The integrity suite cannot fail, and must not be made able to before the sink exists.**
  `lib/dataIntegrity.ts:9` permits `fail` and the module returns zero; two checks return `pass` on
  query error (`:108`, `:167`) and a third passes *because* data is missing (`:284-292`). Fixing
  severity first just converts 776 ignored warns into ignored errors. (measured)
- **The MiLB Stuff+ path is the unrepaired twin of the 2026 outage.**
  `app/api/update/milb/route.ts:497-510` still issues one `UPDATE` across a 4-day window under the
  8s cap and `:385-387` only `console.error`s — 13,702 pitches unscored on 2026-08-06/07/08. Two
  further routes, `challenges` and `newsletter`, have handlers and no `vercel.json` schedule at all.
  (measured)

## NOW (0–6 weeks)

### N1. Make `trackCronRun` prove work happened — everything depends on this

`lib/cronTracker.ts:66-88`. Four assertions, in this order:

1. **Reject a null `counts`.** `:79` writes `out.counts ?? null`, so a job reporting nothing is
   indistinguishable from a job reporting success. Make it required.
2. **Recursively scan `counts` for an `error` key**; set `status='partial'` with the joined messages
   in `error_message`. `cron_runs.status` is plain `TEXT` with no `CHECK`
   (`scripts/create-cron-runs.sql:6`), so a new value needs no migration — `trackCronRun` already
   writes an undocumented `'timeout'` at `lib/cronTracker.ts:32`.
3. **Require a declared expectation.** Widen the contract to
   `{ result, counts, expect?: { key, min }[] }`; if `counts[key] < min`, record `status='no-op'`.
   `pitches` declares `rowsChanged >= 1` on a day with games.
4. **Count changed rows, not upserted rows.** `app/api/update/route.ts:154` does
   `inserted += batch.length`, counting no-op `ON CONFLICT DO UPDATE` rewrites, so the
   `totalInserted` summed at `app/api/cron/pitches/route.ts:47-50` is ~12k every night in-season and
   can never hit the zero its own gate tests for. `applyStuffPlusForDateRange`
   (`app/api/update/route.ts:318-339`) returns `scoredDays`, not rows scored — add `RETURNING 1`
   and count; one narrow column at ~4k rows is cheap.

**Stop condition:** force a throw inside `applyStuffPlusForDateRange` and confirm `status='error'`;
stub `refresh_league_averages` to return `{error}` and confirm `'partial'`; run `pitches` over a
gameless range and confirm `'no-op'` — each read off the `cron_runs` row, not the HTTP response.
**Cost:** ~80 lines in one file, one field per caller, no migration. (measured)

### N2. Give `reportError` the sink already sitting in this repo

`lib/observability.ts:35` — 9 call sites across 6 files, all ending at a `TODO`, with Vercel Pro
retaining logs one day. But `app/api/cron/janitor/route.ts:585-613` (`postGitHubIssue`, gated on
`GITHUB_TOKEN`) and `:616-640` (`sendEmail` via Resend) are working channels with a fallback chain
already written. Lift both into `lib/observability.ts`, call them from `reportError` in production,
and dedupe on `(route, day)` so one bad night is one issue, not 500.

Sentry Developer at $0/5k errors is the better long-term destination
(`Jo/data-reliability/10-observability-tooling.md`) but needs an account, a DSN and a dependency.
Ship the in-repo path first. **Stop condition:** `reportError(new Error('canary'), { route: 'canary' })` from a deployed route
produces an issue within a minute; a second call inside 24h produces nothing. **Cost:** ~60 lines
moved plus dedupe. (measured)

### N3. Widen and wire the janitor — it is the ninth unwired cron

Two edits to `app/api/cron/janitor/route.ts`:

- `:7` — add `refresh`, `integrity` and `sos-weekly` to `EXPECTED_JOBS`. The P0 chain failed 50
  consecutive nights *outside* the only health check Triton owns.
- Wrap the handler in `trackCronRun('janitor', …)`. It has zero `cronTracker` imports, so the
  watchdog leaves no trace of its own runs. That is why the count is 9, not 8: `abs`, `briefs`,
  `challenges`, `cleanup`, `daily-cards`, `daily-graphics`, `emails`, **`janitor`**, `newsletter`.

Do **not** rebuild the escalation logic: `:533-536` already requires every job `ok` for `isClean`,
so a `missing` job does notify. **Stop condition:** a janitor run appears in `cron_runs`, its report
covering 8 jobs. **Cost:** under an hour. (measured)

### N4. Wire the six remaining scheduled crons; schedule or delete the two unscheduled ones

`abs`, `briefs`, `cleanup`, `daily-cards`, `daily-graphics` and `emails` are scheduled and write
nothing to `cron_runs` — copy `app/api/cron/sos-weekly/route.ts:24`. Each must return real counters;
`counts: {}` defeats N1. Separately, `vercel.json` has 18 entries of which
`/api/game/warmup` appears twice (`:28`, `:32`) and `/api/cron/roster` twice (`:20`, `:24`),
covering 15 of 17 directories: `app/api/cron/challenges/` and `app/api/cron/newsletter/` have
handlers and no entry, and `newsletter` looks superseded by `/api/cron/emails` (`vercel.json:64`)
but that is unconfirmed — ask, then schedule or delete. **Stop condition:** every directory under
`app/api/cron/` appears in `vercel.json` or is gone, and `/api/admin/cron-health` lists each with a
run inside 24h. (measured)

### N5. Install the dead-man switch, outside Vercel, on success only

N3 gives an internal absent-run detector, but it is itself a Vercel cron and Vercel skips slots
without retrying — the 2026-08-14 09:00 UTC `pitches` invocation never fired and nothing noticed.
The heartbeat must be external.

**Provider:** Healthchecks.io Hobbyist, $0, 20 checks against 15 scheduled paths
(`Jo/data-reliability/10-observability-tooling.md`). One check per scheduled job, cron expression
copied from `vercel.json:2-75`, grace ~2× the 7-day average duration
`app/api/cron/janitor/route.ts:210-221` already computes. **The ping lives inside `trackCronRun`'s
success branch, `lib/cronTracker.ts:71-86`**, after the status update — one edit covers every wired
job and inherits N1's stricter definition of success. **Ping on success only, never at entry:** an
unconditional ping degrades the switch into a "did the process boot" check and reintroduces the
exact silent-success mode it exists to catch (`Jo/data-reliability/04-alerting-oncall-design.md`).

**This is why N1 comes first:** a heartbeat pinged on today's definition of success would have gone
green through all 50 refresh timeouts. **Stop condition:** disable one cron entry in a preview
deployment overnight; the provider alerts within grace. (measured + documented)

### N6. Close `POST /api/update/milb` — A10 is open

`app/api/update/milb/route.ts:682-691` reads `start_date`, `end_date`, `game_type` from an
unauthenticated body and calls `syncMilbPitches`, which writes through the service-role client.
Commit `f5e57c4` touched `app/api/chat/route.ts`, `app/api/models/test/route.ts`,
`app/api/starter-card/route.ts` and four others — **not this file**. The MLB twin is guarded at
`app/api/update/route.ts:520-521`, and `lib/apiAuth.ts:5-7` states that middleware exempts every
`/api/*` path so each route must self-protect. **Stop condition:** unauthenticated `POST` returns
401, a `CRON_SECRET` bearer still ingests. **Cost:** two lines. (measured)

### N7. Assert `errors === 0`, and stop calling an empty fetch a success

Three small edits in `app/api/update/route.ts`:

- **`:145` / `:169`** — `errors` is incremented in the per-row retry loop and read by nothing. Throw
  after the batch loop when `errors > 0`; that one assertion closes schema drift, poison records and
  constraint violations at once, and with N1 it lands as a failed `cron_runs` row.
- **`:87` and `:136`** — `csv.length < 100` and `rows.length === 0` both return
  `{fetched: 0, inserted: 0, errors: 0}`, making an upstream error page byte-identical to an off-day
  and gating the downstream chain off entirely (`app/api/cron/refresh/route.ts:45-47`). Add a
  `reason` discriminator and record `csv.length`.
- **`app/api/cron/pitches/route.ts:47-50`** — surface `errors` and `reason` into `counts`.

**Stop condition:** feed the parser a saved Savant error page in a test; the cron records a
non-success status. **Cost:** under a day. (measured)

### N8. Give the integrity suite a third severity — after N2, never before

`lib/dataIntegrity.ts:9` permits `'pass' | 'warn' | 'fail' | 'remediated'`; actual returns are 10×
pass, 8× warn, 1× remediated, **zero fail**. The only `'fail'` is synthesized at
`app/api/cron/integrity/route.ts:50-56` when a promise rejects. `:108` and `:167` return `pass` when
`error` is truthy — a timeout reported as clean data — and `lib/dataIntegrity.ts:284-292` passes
*because* the probe finds no recent pitches.

Add `'errored'` to the union at `:9`; convert those three branches; make
`app/api/cron/integrity/route.ts:97-100` throw when `fail + errored > 0`. Promote `new_pitch_names`
(`lib/dataIntegrity.ts:227`, `:245`) from `warn` to `fail` — the repo's only set-membership
detector, warned 54 times unheeded — and lift the `LIMIT 200` at `:104` and `:163`.
**Stop condition:** a forced query error on `checkOrphanedPitchers` produces
`status='errored'` and a failed cron run. (measured)

### N9. Bring the MiLB Stuff+ path up to the MLB path's shape

`app/api/update/milb/route.ts:497-510` issues one `UPDATE` across the full 4-day window plus a
full-season baseline aggregate, both under the 8s cap, and `:385-387` only `console.error`s the
result. Measured: 2026-08-06/07/08 carry 13,702 pitches with zero scored, between neighbours at
100%. Port the repaired MLB shape verbatim — one statement per day
(`app/api/update/route.ts:318-339`), failures collected and rethrown by the cron
(`app/api/cron/pitches/route.ts:82-84`). **Stop condition:** 2026 MiLB coverage returns to the
99.9–100% band 2023–2025 hold, and a forced failure records a failed run. (measured)

## NEXT (6 weeks – 6 months)

### X1. Assert input completeness, not output coverage — the correction that matters

**Coverage alone is not the monitor.** `app/api/update/route.ts:322-332` guards rows on
`release_speed IS NOT NULL` only and wraps the other three terms in `COALESCE(…, 0)`. If Savant
stopped delivering `pfx_x`/`pfx_z`, `stuff_plus` would stay **100% populated**, inside `[0,200]`,
mean near 100 — every coverage assertion green while the metric silently became a
velocity-and-extension z-score. Compounding it, `refreshPitchBaselines` filters the same columns
`IS NOT NULL`, so its `INSERT … SELECT` returns zero rows and the baseline sits **stale rather than
absent**, passing `checkPitchBaselines` (`lib/dataIntegrity.ts:397-422`) — the only check on that
node.

What closes it, most direct first: (1) populated-fraction assertions on `pfx_x`, `pfx_z`,
`release_extension` and `pitch_name` over a 2–3 day window, in `lib/dataIntegrity.ts`; (2) a
standard-deviation floor on `stuff_plus`, since losing the movement term collapses variance — the
complement of the `Jo/data-quality/` finding that distribution monitoring was useless for the 2026
coverage failure, so you need both; (3) removing the `COALESCE` defaults, which changes scoring
semantics and is `Li/metric-governance/`'s call. **Stop condition:** null out `pfx_x` for one day
in a scratch copy; the assertion fires while a coverage-only check stays green. (measured)

**Then build the coverage monitor too**, since coverage is the right detector for "never written,"
which is what happened in 2026. `scripts/create-materialized-views.sql:105` and `:323` already
define `stuff_plus_n AS COUNT(p.stuff_plus)::int` on the pitcher-season matviews, refreshed nightly;
summing that reproduces the 99.5% → 0% decay curve with no new infrastructure. **Do not scan
`pitches` directly** — a 7-day coverage scan measured 9,923 ms cold against an 8s cap — and note the
audit's correction that `stuff_plus_n` is on the **matviews**, not `pitches`. (measured)

### X2. Monitor freshness of *data*, not of jobs

`app/api/admin/cron-health/route.ts:47-52` computes `age_minutes` for jobs, not assets, and the one
data marker it reads is written at `app/api/cron/refresh/route.ts:136-145` **only inside
`if (!error)`** — so `mv_last_refreshed` has never existed, and a monitor checking its age returns
zero rows and reads as healthy. Write a marker on every attempt with an outcome field, and add
asset-level freshness for `league_averages`, `league_percentiles` and each matview. Anchor
thresholds to observed cadence — normal ingest lag is 2 days, so `max(game_date) >= current_date -
1` false-alarms daily (`Jo/data-reliability/02-data-freshness-slos.md`). **Stop condition:** the admin
page shows a staleness age per asset and a skipped refresh turns one red. (measured)

### X3. One retry with full jitter, and a real gap-repair path

Of 91 external call sites, exactly one retries — `app/api/pitch-video/route.ts:95`. The nightly
ingest fetch at `app/api/update/route.ts:82` is a single unretried call, and two silent swallows sit
in the ingest path itself (`:55` and `app/api/cron/player-stats/route.ts:72`), each able to drop 50
players with no counter. Add bounded retry with full jitter; add a repair route that walks
`game_date` and re-fetches zero-row days, since any date currently gets ~2 attempts ever.
**Stop condition:** a forced 503 on the first attempt still yields a complete ingest, and an emptied
date is repaired by the next repair run. (measured)

## LATER (6+ months)

### Y1. Measure provider restatement before deciding whether it matters

The 3-day re-sync window (`app/api/cron/pitches/route.ts:36-38`) heals provider *lateness* — it is
why the ingest survived with no retry layer — but **any value Savant revises more than 72 hours
after a game is never seen**, and `pitch_name` is the join key to `pitch_baselines`
(`app/api/update/route.ts:328-330`), so a pitch reclassified later is scored against the wrong
baseline permanently. Re-fetch three completed dates from a prior season, diff on
`(game_pk, at_bat_number, pitch_number)`, report per-column change rates. Under 0.1% and this is a
footnote; at ~2% on `pitch_name` the Stuff+ history is measurably wrong. **Stop condition:** a
number exists and the build-or-skip decision is made against it. (inferred)

### Y2. Two known, low-impact ordering defects

Neither should displace N1–N9. (a) Scoring stayed in `/api/cron/pitches` (09:00, `vercel.json:8`)
while baseline refresh moved to `/api/cron/refresh` (09:10, `:12`), so scoring uses 24h-old
baselines — negligible except on a new `game_year`'s first day, which scores 0% until the overlap
window heals it; fix by calling `applyStuffPlusForDateRange` (`app/api/update/route.ts:306-311`)
from `refresh`. (b) `app/api/cron/daily-graphics/route.ts:327` reads briefs by
`.order('date').limit(1)` and runs at 12:30 UTC (`vercel.json:52`) while `/api/cron/briefs` runs at
14:00 (`:36`), so day D's graphic carries D−1's brief. **Stop condition:** with no brief for today,
the graphics job fails rather than publishing yesterday's. (measured)

## Standing Rules

- **Never assert on a window longer than 3 days inside a live cron.** A 7-day `stuff_plus` coverage
  scan measured 9,923 ms cold against an 8s cap, and the 09:00 UTC run is always the cold case. An
  assertion that times out is worse than none, because here it fails in a way that reports success.
  Anything wider reads a rollup.
- **Three-way severity, always: pass / breached / could-not-evaluate.** Any path returning `pass`
  because a query errored (`lib/dataIntegrity.ts:108`, `:167`) or because the data it wanted was
  absent (`:284-292`) is the platform's core defect reproduced inside the tool built to detect it.
- **Do not raise `authenticator`'s 8s `statement_timeout`** — it would hide this class of failure
  rather than surface it. Give the specific function a `proconfig` instead. There is no
  `run_mutation_long`, so the write path stays pinned at 8s.
- **Do not buy a data-observability platform.** Table-level freshness and volume — their default
  install — stayed green for all three months of the Stuff+ collapse, because ingest never missed a
  pitch. Of eight vendors surveyed in `Jo/data-reliability/10-observability-tooling.md` two publish
  a price, the cheapest $750/month. The detector that fires here is SQL.
- **Do not re-derive what a pending audit slice will measure.** Slice A of 8 is complete in
  `docs/research-app-audit-2026-08-14.md` (scope: `docs/research-app-audit-scope.md`); later slices
  supersede X1's coverage thresholds and Y1's materiality question.
- **Hand off at the border rather than absorbing.** `app/api/cron/pitches/route.ts:66-70`
  invalidates the cache twelve lines *before* the Stuff+ failure throws at `:82-84`, so that path
  empties the cache and then records an error, and the next reader repopulates from pitches known to
  be unscored. Jo owns the ordering and the gate; the cache semantics, the unreachable
  `.catch(() => {})` and the unused tag prefixes are
  `Cas/caching-state/11-pipeline-cache-invalidation.md`. The payload-whitelist / dead-letter work on
  `app/api/update/route.ts:139-141,157-168` is drift handling and belongs to `Jo/data-quality/`.
  Metric definitions — including removing the scoring `COALESCE`s — are `Li/metric-governance/`;
  test coverage is `Cas/testing-data-systems/`.
- **Re-measure before citing.** `CLAUDE.md` calls `pitches` "7.4M+ rows" and `players` "4,017", both
  years stale, and the repo's disk-plan numbers disagree by 4×. Treat every number in the repo docs
  as stale until re-measured, including the ones here.

**Triton-internal evidence.** Repo read at `ec2fc7a` on 2026-08-21; no database was queried for
this document. Read directly: `lib/cronTracker.ts:32,66-88` (success = "did not throw"; `counts`
optional at `:79`); `scripts/create-cron-runs.sql:6` (`status TEXT`, no `CHECK`);
`app/api/cron/refresh/route.ts:45-47,136-145,167-192` (`mv_last_refreshed` written only inside
`if (!error)`; `ok: true` returned beside `{error}` values in `counts`);
`app/api/cron/pitches/route.ts:36-38,47-50,66-70,82-84`;
`app/api/update/route.ts:82,87,136,145,150-172,181,318-339,322-332,328-330,520-521`;
`app/api/update/milb/route.ts:385-387,497-510,682-691` (no auth guard); `lib/apiAuth.ts:5-7,19-26`;
`lib/observability.ts:23-26,35,39-51` (9 `reportError` sites over 6 files; `logApiEvent` and
`withApiLogging` have zero); `lib/dataIntegrity.ts:9,104,108,163,167,227,245,284-292,397-422`;
`app/api/cron/integrity/route.ts:50-56,97-100`;
`app/api/cron/janitor/route.ts:7,187-232,210-221,533-536,585-613,616-640` (no `cronTracker` import
anywhere in the file); `app/api/admin/cron-health/route.ts:15-20,47-52`;
`scripts/create-materialized-views.sql:105,323`; `vercel.json:2-75` (18 entries, two paths
duplicated, 15 of 17 cron directories covered); `git show --stat f5e57c4` (7 files, none the MiLB
update route). Measured numbers reused rather than re-derived from
`docs/reliability-findings-2026-08-11.md` and `docs/research-app-audit-2026-08-14.md`: 52 `refresh`
runs / 50 timeouts / 0 successes / all logged `status='success'`; `league_averages` 46 days stale,
`league_percentiles` 69; 776 `integrity_checks` rows over 95 run days with zero failures;
`pitch_baselines` warned 47× since 2026-06-26, `materialized_views` 56×, `new_pitch_names` 54×;
13,702 MiLB pitches unscored on 2026-08-06/07/08; ingest upsert at 94.8% of the 8s cap; 7-day
coverage scan 9,923 ms cold vs 529 ms warm; `stuff_plus` coverage 99.5% → 0% Apr–Aug 2026. Two
corrections found while writing: the audit's **"8 of 17 crons never write to `cron_runs`" is 9 of
17** — the janitor is the ninth — and **A10 is still open**, not closed by `f5e57c4`.
