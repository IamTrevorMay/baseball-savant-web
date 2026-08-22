---
title: Data Quality Engineering — Applied Playbook
domain: applied
tags:
  - data-quality
  - expectations
  - constraints
  - vocabulary-drift
  - reconciliation
  - backfill-safety
  - schema-contracts
  - triton-platform
last_updated: 2026-08-21
---

# Data Quality Engineering — Applied Playbook

> Turns `Jo/data-quality/01..11` into sequenced work on the Triton spine. Scope is narrow on
> purpose: **does the stored value match its declared type, range, and vocabulary, and does it agree
> with the source it came from.** Whether the metric *means* what its label claims is Li's
> (`Li/metric-governance/`); whether a correct number is shown honestly is Cas's
> (`Cas/analytics-ux/`). Nothing here has shipped. `docs/research-app-audit-scope.md` §3 assigns MiLB
> cross-level correctness to Slice G and stored-vs-computed divergence to Slice D — if those run
> first, their findings supersede the MiLB and baseline-vintage items here; Slice A is folded in.

## TL;DR

- **A documented convention is currently destroying data.** `CLAUDE.md:147` tells every query author
  to match MiLB events as Title Case; 2026 `milb_pitches.events` is ~47% lowercase and the share is
  still moving (53.5/46.5 on 08-11 → 52.6/47.4 on 08-14), so the documented query silently drops
  roughly half the season and returns fewer rows rather than erroring. (measured)
- **The MiLB break is a category collapse, not a casing bug, and that decides the fix.**
  `EVENT_NORMALIZE_MAP` (`app/api/update/milb/route.ts:74-98`) folds Groundout/Flyout/Lineout/Pop
  Out/Forceout into one `field_out`. Pre-June rows carry batted-ball granularity post-June rows do
  not, so "normalize in queries" is unachievable in one direction and lossy in the other. (measured)
- **Coverage monitoring would not have caught the platform's worst incident, and this playbook does
  not resurrect that advice.** The scoring UPDATE guards only `release_speed IS NOT NULL` and
  `COALESCE`s three inputs to zero (`app/api/update/route.ts:322-332`), so losing `pfx_x`/`pfx_z`
  leaves `stuff_plus` 100% populated, in range, and centred near 100. Assert **inputs and
  dispersion**, not output presence. (documented)
- **Additive schema drift is the catastrophic case here and subtractive is the silent one — one line
  of whitelist projection fixes both.** Rows are stripped of `id` and `Unnamed*` only
  (`app/api/update/route.ts:139-141`), so a new Savant column fails the 500-row batch and drops into
  ~12,000 doomed per-row retries. (documented)
- **`pitches` enforces almost nothing.** Exactly two constraints — the primary key and
  `UNIQUE (game_pk, at_bat_number, pitch_number)` — and zero `CHECK`s, while `[0,200]` is asserted in
  three separate SQL strings and no schema. (measured)
- **The obvious hardening step is currently destructive.** `syncNewPlayers` runs at
  `app/api/update/route.ts:172`, after the upsert loop at `:150-169`, so a `pitcher → players.id`
  foreign key would reject every debutant's pitches into an unread `errors` counter. Two lines of
  reordering unblock it. (measured)
- **Two correctness bugs would each have been caught by a constraint at write time.**
  `parseFloat("62.1")` on a base-3 innings value (`app/api/cron/player-stats/route.ts:88`), and a
  `player_season_stats` schema with no strikeouts or walks
  (`scripts/create-player-season-stats.sql:4-20`) that makes the most natural reconciliation
  unwritable. (measured)
- **Provider reclassification is already in the data and only set-membership finds it.** `ST`/`SV`
  carry `MIN(game_year) = 2015`; retired `FT` reappeared in 2026 with 13 rows. The detector exists,
  returns `warn`, and has warned 54 times into a void. (measured)
## NOW (0–6 weeks)

Ordered for dependency: 1–3 stop active harm, 4–6 make it detectable, 7–8 are cheap correctness
fixes that unblock NEXT.

### 1. Correct the convention, then arm a detector — before touching any data

`CLAUDE.md:147` and `Jo/data-quality/06-reconciliation-source-of-truth.md` both state the pre-2026
rule, and the damage is done by whoever *follows* them, so the doc edit is the fastest mitigation
available and costs minutes. Replace it with: `milb_pitches.events` holds two vocabularies with an
ingest-date seam at 2026-06-08; match `lower(replace(events,' ','_'))` on both sides until item 4
lands; never `initcap()`. Then ship the detector — one query, no baseline, no history, and it would
have fired on 2026-06-09:

```sql
SELECT game_year,
       count(DISTINCT events) > count(DISTINCT lower(replace(events,' ','_'))) AS mixed_vocabulary
FROM milb_pitches WHERE events IS NOT NULL GROUP BY game_year;
```

Add it beside `checkNewPitchNames` (`lib/dataIntegrity.ts:243-248`). The module cannot currently
return `fail`, and two checks launder a query error into `pass` (`lib/dataIntegrity.ts:108`, `:167`),
so this check carries its own three-way status (`pass` / `breached` / `errored`) from day one. The
route change that makes `breached` throw is `Jo/data-reliability/`'s; do not wait for it, and do not
pretend the check is armed without it.

**Stop condition:** `grep -n "Title Case" CLAUDE.md` returns nothing on the `milb_pitches` line, and
an `integrity_checks` row appears with `status='breached'` for `milb_event_vocabulary` on the next
nightly run, returning to `pass` after item 4. (documented)

### 2. Whitelist the Savant payload at the boundary

`app/api/update/route.ts:139-141` deletes `id` and `Unnamed*` and forwards everything else. Replace
it with a projection against a known column list: unknown keys dropped and counted, missing expected
keys counted. One line of intent, both drift directions closed, which is why it outranks every other
schema-contract item. Pair it with redirecting the per-row failure branch at `:160-168` into an
`ingest_rejects` table instead of `console.error` — that loop already isolates the failing row and
knows why, so the quarantine table is half-built.

While you are at this boundary: `app/api/update/milb/route.ts:682-690` exports a `POST` that runs the
full MiLB ingest with **no auth guard**, unlike `app/api/cron/pitches/route.ts:21-22` and
`app/api/admin/backfill-stuff-plus/route.ts:36`. Commit `f5e57c4` closed three other unauthenticated
paths and missed this one, so anyone can trigger arbitrary-range writes as `service_role`. Every
expectation below assumes a known set of writers. (measured)

**Stop condition:** a fixture CSV carrying one invented column upserts cleanly with `errors = 0` and
a non-zero `unknown_columns` count; a fixture missing `pfx_x` upserts cleanly and trips item 3.
(documented)

### 3. Assert scoring **inputs** and dispersion, not `stuff_plus` coverage

This is the correction that matters most. Over the 2–3 day ingest window (the 7-day form measured
9,923 ms cold against an 8s cap, so it is not runnable live):

| Assertion | Expression | Threshold |
|---|---|---|
| Input completeness | populated fraction of `pfx_x`, `pfx_z`, `release_extension`, `pitch_name` | ≥ 0.97 |
| Output dispersion | `stddev_samp(stuff_plus)` | ≥ 4.0 (pitch-level SD measured 5.0–7.0) |
| Output coverage | populated fraction of `stuff_plus` | ≥ 0.95 |

Coverage stays on the list — necessary, not sufficient. The dispersion floor is what fires when the
movement term silently drops out of `app/api/update/route.ts:322-332`, the failure coverage is
structurally blind to. Removing the `COALESCE` defaults is the correct long-term fix, changes scoring
semantics, and is therefore Li's (`Li/metric-governance/`), not this playbook's.

**Stop condition:** in a test, null `pfx_x`/`pfx_z` over one day's fixture rows, rescore, and confirm
coverage stays green while both the input assertion and the dispersion floor breach. (inferred)

### 4. Preserve, then collapse: the MiLB `events` backfill

Do not run this before item 5. The order is what makes it safe:

1. `ALTER TABLE milb_pitches ADD COLUMN events_raw text` — nullable, no default, so it is
   metadata-only in PG 17 and never holds a lock past `lock_timeout = 8s`.
2. In the same commit, change `app/api/update/milb/route.ts:244` to write the provider's original
   label to `events_raw` **and** the mapped value to `events`.
3. Backfill pre-seam rows chunked by `game_date` (confirm that index exists first), half-open ranges,
   guard predicate `WHERE events ~ '^[A-Z]'`. Copy to `events_raw` *before* applying the map, in one
   statement; reversing that order destroys the granularity the column exists to keep. The guard
   makes it idempotent — after the update no row matches.
4. Post-seam 2026 rows get `events_raw IS NULL`. That is honest: it puts the seam in the schema
   instead of hiding it in a value.

~587k rows across 2023–2026 at ~4–5k per MiLB game day is ~600 chunks, well past the 300s Vercel
ceiling — which is why item 5 comes first. The end state this unlocks is an `event_types` table
referenced by FK from both pitch tables, turning an unknown event from a silent zero-row result into
a rejected write; attempting that before the backfill would refuse half of 2026.

**The alternative, stated so it can be chosen deliberately:** accept the collapse, skip `events_raw`,
rewrite `events` in place. Correct if nothing downstream needs Groundout vs Flyout at the MiLB level
— a question about what the stat means, so settle it with `Li/metric-governance/` first.
(measured on the split; inferred on the migration mechanics)

**Stop condition:** the item-2 detector returns `mixed_vocabulary = false` for every `game_year`, and
`SELECT count(*) FROM milb_pitches WHERE events ~ '^[A-Z]'` is zero.

### 5. Give the backfill runner a wall-clock budget and a cursor

`app/api/admin/backfill-stuff-plus/route.ts` is the reference implementation and is close: guard
predicate at `:91`, half-open date chunks at `:100-102`, machine auth at `:36`, per-chunk coverage
accounting. It is missing the one thing that killed the last full-year run — a deadline. Add a
`DEADLINE_MS` budget checked before each chunk and a `next_start` cursor in the response so a caller
resumes rather than restarts, then extract the loop so item 4 reuses it instead of growing a second.

**Stop condition:** a regression test that runs the pager with `n > 0` and asserts the loop
continues — the exact `SELECT COUNT(*) … LIMIT 1 OFFSET n` failure that made the original route
decorative through the whole outage it was built for. Every future backfill gets that test; test
design is `Cas/testing-data-systems/`, the invariant is this playbook's. (measured)

### 6. Move `syncNewPlayers` above the pitch upsert loop

Two lines: `app/api/update/route.ts:172` moves ahead of `:150-169`. The ordering is harmless today —
an orphan exists briefly and `checkOrphanedPitchers` heals it overnight — but it makes the FK in NEXT
actively destructive: a debutant's rows fail the batch, fail the per-row retry, increment an unread
`errors` counter, and are never retried by anything while the cron returns 200. Ship the reorder
alone; do **not** add the constraint in the same change.

**Stop condition:** a debut-player fixture lands with the `players` row written before the pitch
upsert, and `checkOrphanedPitchers` finds zero orphans on the following run. (measured)

### 7. Fix `player_season_stats`: outs, and the two missing columns

`app/api/cron/player-stats/route.ts:88` does `parseFloat(stat.inningsPitched)` on a base-3 value —
`"62.1"` means 62⅓. Add `outs_pitched INT`, populated as `floor(x)*3 + round((x % 1) * 10)`, plus
`CHECK (innings_pitched IS NULL OR round((innings_pitched % 1) * 10) IN (0,1,2))`, which would have
rejected the bad write on day one. In the same migration add nullable `strikeouts` and `walks` to
`scripts/create-player-season-stats.sql:4-20` — the MLB Stats API already returns them in the object
parsed at `app/api/cron/player-stats/route.ts:74-94`, and their absence is the only reason item 8
cannot be written. At 79k rows this is a cheap validating migration, unlike anything on `pitches`.
Which column the `IP >= max(5, 0.20 × IP_leader)` floor reads is a definition question →
`Li/metric-governance/`.

**Stop condition:** the CHECK is `VALID` on 79k existing rows, and K/BB are populated for the current
season after one nightly run. (measured)
## NEXT (6 weeks – 6 months)

### 8. Reconcile K and BB against the MLB Stats API

With item 7 shipped, the check is K/BB derived from `pitches.events` against
`player_season_stats.strikeouts/walks`, one season per call through `run_query_long` — season-wide
aggregation cannot run under the 8s cap. Until that column has a season of data,
`retro_events.event_type` (Chadwick `EVENT_CD`: 3 = K, 14/15 = BB) is a comparator runnable today.

Write the tie-breaker **before** the first disagreement or it gets re-litigated under pressure: the
MLB Stats API wins on official season totals, `pitches` wins on pitch-level detail, a mismatch inside
tolerance is logged rather than alerted. The tolerance is a metric judgement → `Li/metric-governance/`.

**Stop condition:** one `integrity_checks` row per season per stat_group with an absolute and
relative delta, and a documented tolerance band. (inferred)

### 9. Measure provider restatement, then decide the re-ingest policy

The 3-day sync window heals provider *lateness* and is blind to *restatement*: any value Savant
revises more than 72 hours after first pitch is never seen, so `pitches` is a frozen snapshot of what
MLBAM believed within three days. It matters because `pitch_name` is the join key to
`pitch_baselines` (`app/api/update/route.ts:328-330`) — a pitch reclassified later is scored against
the wrong baseline permanently. Measure it: re-fetch three completed dates from a prior season, diff
on `(game_pk, at_bat_number, pitch_number)`, report per-column change rates. Decide the rule in
advance — `pitch_name` under 0.1% is a footnote, over ~1% justifies an annual `game_year` re-ingest,
which then needs the item-6 runner.

**Stop condition:** the change-rate table lands in `docs/Queries.md` and the policy is written into
`planning.md` either way. (inferred; the reclassification itself is measured)

### 10. Promote set-membership checks from `warn` to `breached`

`checkNewPitchNames` (`lib/dataIntegrity.ts:243-248`) is the only detector Triton has in this class
and has warned 54 times with no action. Promote it, and extend the same shape to the `events`
vocabularies on `pitches` and `milb_pitches`. Set-membership is the only method that finds
reclassification: measured PSI on pitch mix stayed at 0.002–0.008 across the sweeper's rise from
1.06% to 7.79%, while χ² on the same buckets returned p < 10⁻¹⁰⁰. At these row counts, p-values are
noise and effect sizes are mandatory — see `Jo/data-quality/04-distribution-drift-detection.md`.

**Stop condition:** an unknown `pitch_name` produces a breach, not a warn, on the next run. (measured)

### 11. Add the `pitches.pitcher → players.id` foreign key

Only after item 6 has run through a full ingest cycle. Add `NOT VALID` — a validating
`ADD CONSTRAINT` scans 8.89M rows and blows both the 8s `statement_timeout` and the 8s
`lock_timeout` — then `VALIDATE CONSTRAINT` over a direct connection, not `run_mutation` (DDL is not
DML). `players` is ~16.9k rows and cache-resident, so the per-row FK probe is negligible against the
29 index writes already paid.

**Do not make the natural key `DEFERRABLE`.** The Postgres `CREATE TABLE` docs are explicit that
deferrable constraints cannot arbitrate `ON CONFLICT`, and the entire ingest upserts on
`game_pk,at_bat_number,pitch_number` (`scripts/create-tier2-indexes.sql:38`). That would break every
night's ingest. Commit the reconstructed DDL for `pitches` and `milb_pitches` in the same change —
neither table's `CREATE TABLE` exists in the repo, and a constraint you cannot see is one you will
drop by accident.

**Stop condition:** the constraint reads `convalidated = true` and one nightly ingest, including a
debut player, completes with `errors = 0`. (documented)
## LATER (6+ months)

### 12. A daily metrics table, so assertions stop scanning `pitches`

Persist one row per table per day — row count, per-column populated fractions and dispersion,
distinct-value counts on the vocabulary columns. Trailing-week rules then evaluate ~7 rows instead of
re-scanning the base table, which is the only way a 7-day assertion becomes affordable against the
9,923 ms cold measurement. Deequ's Metrics Repository at a thousandth of the weight, no new
infrastructure — `Jo/data-quality/02-declarative-expectations.md`, `10-quality-metrics-scorecards.md`.

It also replaces the tempting shortcut of reading `stuff_plus_n` off the matviews
(`scripts/create-materialized-views.sql:105,323`): they have not refreshed since 2026-06-26, so that
number is a two-month-old constant. Building a monitor on a dead refresh chain is how you get a green
dashboard during an outage.

**Stop condition:** 30 consecutive days of metric rows exist and one assertion runs entirely off
them. (inferred)
## Standing Rules

**Constrain what we author; monitor what the provider sends.** `stuff_plus` has a legal range because
Triton's own SQL defines it — that belongs in a `CHECK`. `release_speed` is a provider measurement;
198 rows in 2026 sit outside 40–110 mph, and a constraint there converts Savant's outlier into our
failed ingest. Provider values get expectations with thresholds, not constraints.

**Never add a constraint before the write ordering that satisfies it.** Item 6 before item 11, always
in that order. A constraint added to a pipeline that violates it converts a self-healing gap into
silent permanent loss, because the failure lands in a counter nobody reads.

**Every constraint on `pitches` is `NOT VALID` first.** 8.89M rows, 29 indexes, 8s
`statement_timeout` and 8s `lock_timeout`. A validating `ADD CONSTRAINT` cannot finish. DDL does not
go through `run_mutation` at all — it is DML-only.

**Backfills follow one shape or they do not ship:** an indexed, immutable chunk column; half-open
ranges; a guard predicate that makes re-runs idempotent *and* narrows the work; a wall-clock budget
and a resume cursor; verification by an invariant, not a row count. The Stuff+ repair moved May
90.2% → 99.7% and Jun 17.8% → 99.6% while monthly league-average Stuff+ held ~100.2–101.0 — the
stable mean is the proof it was not skewed. Never page an UPDATE by `ctid`: the update writes a new
tuple at a new address, so the pager mutates what it pages over.

**Severity is three-way — `pass` / `breached` / `could-not-evaluate` — with no exceptions.** Every
hand-rolled suite forgets the third and maps it onto `pass`; Triton does this in at least three
places. A timeout reported as clean data is the same bug as the outage the suite exists to catch.

**Coverage is necessary and never sufficient.** An earlier version of this analysis recommended
coverage monitoring as the answer and was wrong; that recommendation is retracted and must not come
back. Presence, inputs, and dispersion are three different detectors and Triton needs all three.

**Do not "fix" the RLS `auth.uid()` wrapping on `pitches`, `players`, or `milb_pitches`.** Measured
identical plans, 43.6 vs 43.5 ms, because a `USING (true)` policy ORs the auth check into a constant.
`pitch_videos`' deny-all is likewise correct as written (`scripts/create-pitch-videos.sql:36-37`) —
the work is keeping it service-role-only on purpose and making any future user-token read fail loudly
instead of returning an empty set.

**Definitions are Li's; storage is Jo's.** "Should this metric collapse Groundout into field_out,"
"which IP definition is canonical," and "what tolerance counts as agreement" go to
`Li/metric-governance/`. "Does the stored value match its declared type, range, and vocabulary" stays
here. Hand off by filename, do not absorb.

**Re-measure before citing any number in this repo.** `CLAUDE.md` says `pitches` is 7.4M rows
(8.89M) and `players` 4,017 (16,931); ingest lag is 2 days, not 1; the MiLB split moved in three
days. Every number above carries its date, and every ad-hoc query gets logged to `docs/Queries.md`.

**Triton-internal evidence.** MiLB vocabulary: `CLAUDE.md:147`, `app/api/update/milb/route.ts:74-98`
(the map), `:244` (application), `:497-510` (the un-fixed 4-day scoring UPDATE); splits measured
2026-08-11 (2023/2024/2025 = 100.0% Title over 172,713 / 172,435 / 171,545 rows; 2026 = 70,266 Title
/ 61,044 lower) and re-measured 2026-08-14 (52.6% / 47.4%), seam at commit `410212b`, 2026-06-08.
Scoring path: `app/api/update/route.ts:322-332` (clamp, three `COALESCE`s, one `release_speed`
guard), `:328-330` (`pitch_name` join to `pitch_baselines`), `:139-141`, `:150-169`, `:160-168`,
`:172`, `:87`, `:136`. Constraints measured 2026-08-14: `pitches` carries only `pitches_pkey` and
`pitches_game_pk_at_bat_number_pitch_number_key`, zero `CHECK`s; 2026 holds 657,570 rows, 99.58%
`stuff_plus`, 0 outside [0,200], 198 `release_speed` outside 40–110, 2,733 NULL `pitch_type`;
pitch-level `stuff_plus` SD 5.0–7.0. Assertion cost measured 2026-08-11 on `idx_pitches_game_date`:
7-day coverage 9,923 ms cold / 529 ms warm; 7-day uniqueness 18,302 ms cold (25,506 rows, 0
duplicates); 2-day uniqueness 16.4 ms. Integrity suite: `lib/dataIntegrity.ts:108`, `:167`,
`:243-248`; 776 rows over 95 run days, zero `fail` ever, `new_pitch_names` ×54. Reclassification
2026-08-11: `ST`/`SV` `MIN(game_year) = 2015`, `FT` 13 rows in 2026 only. Correctness:
`app/api/cron/player-stats/route.ts:88` and `:74-94`, `scripts/create-player-season-stats.sql:4-20`.
Backfill: `app/api/admin/backfill-stuff-plus/route.ts:36`, `:91`, `:100-102`; ~180 chunks × ~2s
≈ 360s against a 300s ceiling. RLS: `scripts/create-pitch-videos.sql:36-37` on 1.48M rows, read only
via `supabaseAdmin` at `app/api/play-video/route.ts:39` and `app/api/pitch-video/route.ts:195`. Auth
gap `app/api/update/milb/route.ts:682-690` re-checked 2026-08-21 and still open. `league_averages`
49.0 days and `league_percentiles` 72.1 days stale on 2026-08-14, which is why
`scripts/create-materialized-views.sql:105,323` cannot back a live monitor. All row counts derive
from `reltuples` with `last_analyze` NULL on all 11 audited tables — treat as approximate.
