---
title: Reproducible Historical Queries — Getting the Same Answer Six Months Later, or Saying Why Not
domain: temporal-modeling
tags:
  - reproducibility
  - as-of-queries
  - baseline-vintage
  - determinism
  - seeds
  - provenance-horizon
  - query-envelope
  - restatement
sources_reviewed: 22
last_updated: 2026-08-12
---

# Reproducible Historical Queries — Getting the Same Answer Six Months Later, or Saying Why Not

> **Capstone of `temporal-modeling/`.** The other ten docs each fix one clock; this one answers the
> user's question — *"I ran this in February; why is it different now?"* — with a per-query
> verdict. Mechanisms by filename: `01-as-of-correctness.md` (four clocks, the ladder),
> `03-late-arriving-data.md` (grace window), `07-snapshotting-vs-recompute.md` (storage math),
> `09-retroactive-restatement.md` (facts moving),
> `metric-governance/02-metric-versioning-reproducibility.md` (as-of Stuff+ schema).

## TL;DR

- **A query replays only with five pins — facts, parameters, definition, environment, answer — Triton holds two and a half.** Definition is in git, the answer lasts 5 days, the rest is overwritten. **(computed)**
- **Four independent causes break Triton historical queries; fixing any three still leaves them irreproducible.** No baseline history, no row arrival time, query-time wRC+ constants, an unguarded rescore. **(computed)**
- **The least-known cause: the Stuff+ UPDATE has no `stuff_plus IS NULL` guard and the cron re-syncs four calendar dates**, so each row is re-scored ~3× and its *surviving* vintage is `game_date + 3`. **(computed — `update/route.ts:320–333`, `cron/pitches:36–38`)**
- **Drift is measured, not estimated, and the zeros are amnesia: Feb–May 2026 rows carry +0.29 to +0.59 points of upward `stuff_plus` bias, June and August exactly 0.000.** February replayed today is off by a bounded, sub-point amount; June and August match today's baselines only *because* 2026-08-11 overwrote them — the range that replays perfectly is the one whose history died. **(computed — `docs/Queries.md:1311–1316`)**
- **Reproducibility is a property of a query class, not a platform.** §3 gives every query shape one of four verdicts; three are already bit-identical. **(estimated)**
- **Frozen data is not enough — five mechanisms return different answers over identical rows:** `ORDER BY` with no total order, `MODE()` ties, parallel float summation, collation version, a cache no rescore invalidates. **(established)**
- **Seeds are the easy pin and Triton has nothing to seed:** no `setseed`, `random()`, or `TABLESAMPLE` in any SQL path. The real stochastic surface is LLM newsletter prose — snapshot it, never re-derive. **(computed)**
- **`PARK_FACTORS` has no time dimension — one 2024 vintage over 2015–2026 — so an edited constant restates twelve seasons with no trace.** wRC+ did that, by 5–6 points, on 2026-05-08. **(computed — `lib/constants-data.ts:25–28`)**
- **The honest verdict is a shippable deliverable worth more than any partial fix:** four labels per metric × date range — the only remedy for rows already stored. **(estimated)**


## 1. The five pins

A query replays only if every input is recoverable — five pins, each failing independently.

|Pin|What it fixes|Triton's carrier|Status|
|---|---|---|---|
|**P1 Facts**|which rows existed, at which values|`pitches` / `milb_pitches`|**absent** — no `created_at`, upsert overwrites|
|**P2 Parameters**|baselines, season constants, park factors, qual floors|`pitch_baselines`, `constants-data.ts`, `league_averages`|**absent** — destructive on all three|
|**P3 Definition**|formula + the code that ran it|git, `VERCEL_GIT_COMMIT_SHA`|**held**, never stamped on output|
|**P4 Environment**|session settings, collation, plan-dependent order, seeds|Postgres/PostgREST defaults|**unpinned** (§4)|
|**P5 The answer**|what was shown to a human|`daily_cards`, `briefs`|**5 days**, then deleted|

P3 is the only pin held outright, and the one teams over-invest in. P5 is the half-pin:
correct, then destroyed by a cleanup cron (`app/api/cron/cleanup/route.ts:23–27`) despite being
**the cheapest pin and the most asked about**; "what did the newsletter say" is retrieval, not
recompute.

## 2. The four causes, verified

|#|Cause|Evidence|What it makes irreproducible|
|---|---|---|---|
|**C1**|`pitch_baselines` = **206 rows**, keyed `(pitch_name, game_year)`, **no timestamp**, upserted `ON CONFLICT DO UPDATE`|`update/route.ts:251,269`|any past `stuff_plus` — the z-score denominators are gone|
|**C2**|`pitches` (~8,877,621) and `milb_pitches` (~2,508,422) carry **no `created_at`/`updated_at`**|schema|"which rows existed on D" — late arrivals, relabels|
|**C3**|wRC+ computed **at query time** from `SEASON_CONSTANTS`/`PARK_FACTORS` in `lib/constants-data.ts`|`lib/sql.ts` → `computeWRCPlus()`|every historical wRC+ — one edit restates all|
|**C4**|Stuff+ UPDATE has **no `stuff_plus IS NULL` guard**; cron window `[today−3, today]` = **four** dates|`update/route.ts:320–333`; `cron/pitches:36–38`|row → vintage; each row re-scored ~3×|

**C4 is the least internalised.** The comment says "last 3 days"; the arithmetic is four
dates. With no NULL guard, scoring is not "score once against that night's baseline" but "re-score
three times, keep the last" — *better* than it sounds (within-window jitter vanishes), *worse* than
it looks (vintage ≠ `game_date`, so even a rebuilt baseline history joins on the wrong day). A
`stuff_plus_scoring_runs` ledger must record the **scored** range, not the game date
(`metric-governance/02` §5).

Transaction time exists only on small tables — `players.updated_at`, `player_season_stats.updated_at`
(~79,061 rows), `league_averages.updated_at` (1,806 rows), `compete_pitches.created_at`,
`compete_pitch_sessions.uploaded_at` — and three of the five stamp destructive rewrites
(`refresh_league_averages` is DELETE + re-INSERT), recording *when the old answer died* (`01` §1.1).

## 3. A verdict per query class

|Verdict|Means|
|---|---|
|**R1 Bit-identical**|replays exactly, today and in a year|
|**R2 Bounded-error**|replays within a *measured* interval; state it|
|**R3 Re-derivable-in-principle**|needs a pin that exists but is unwired|
|**R4 Unreproducible**|inputs destroyed; only a label is honest|

|Query class|Verdict|Binding cause|Cheapest fix|
|---|---|---|---|
|Counts/rates, **closed** season (2015–2024)|**R1**|facts settled, no parameters|none|
|`compete_pitches` session recall|**R1**|`created_at` + immutable upload|none|
|Newsletter card **≤5 days** old|**R1**|`daily_cards` holds resolved values|stop deleting|
|Newsletter card **>5 days** old|**R4**|cleanup cron|retention change|
|`stuff_plus` leaderboard, **2026 Feb–May**|**R2 (+0.29…+0.59)**|C1 + C4|publish the interval|
|`stuff_plus` leaderboard, **2026 Jun–Aug**|**R1 by accident**|rescored 2026-08-11|none; note *why*|
|`stuff_plus`, **2015–2025**|**R4**|C1 — no vintage recorded|label the horizon|
|Cross-season `stuff_plus` trend|**R4**|C1 + per-season baselines|label; forbid the chart|
|wRC+ / any park-adjusted hitting line|**R4**|C3|version the constants|
|ERA / W-L from `player_season_stats`|**R3**|`updated_at`, no history|SCD2 (`06`)|
|`league_averages` benchmark on D|**R3**|timestamped, DELETE+INSERT|append + as-of key (`07` §8.3)|
|MiLB `events` spanning 2026-06-08|**R4**|vocabulary split at *ingest*|backfill is a semantic call|
|Anything with `LIMIT`, no total order|**R2 (unbounded)**|§4|add a PK tiebreak|

Three classes are already R1 and need nothing; four are R4 and need a *label*, not a migration; only
R2 and R3 are engineering. That is the whole triage.

## 4. Determinism the data cannot give you

Freeze every row and parameter and the same SQL still varies. **P4** failures: cheap to fix, on
nobody's list.

|Mechanism|Why it varies|Triton exposure|Fix|
|---|---|---|---|
|`ORDER BY` with no total order|ties broken by plan and physical row order|`ORDER BY primary_value ${sortDir} NULLS LAST` — leaderboard, no tiebreak (`scene-stats:1312,1334`)|append the entity ID|
|`ORDER BY … LIMIT` on a low-cardinality key|truncation boundary is arbitrary|`ORDER BY p.game_date DESC LIMIT 50000` — day-grain sort key, so which pitches survive is undefined (`player-data:44`)|tiebreak `(game_pk, at_bat_number, pitch_number)`|
|`MODE() WITHIN GROUP` ties|arbitrary among tied modes|`primary_team` for a traded player, even split (`scene-stats:336,358,1086,1666`)|`ORDER BY count DESC, team`|
|Parallel float aggregation|`float8` addition non-associative; worker split varies with settings and size|`AVG(release_speed)` over millions of rows — last-ulp drift|cast to `numeric` on publish|
|Collation version change|a Postgres/glibc/ICU upgrade reorders text|name sorts, text indexes after a Supabase upgrade|record `datcollversion`; `REINDEX`|
|Wall clock in the predicate|`now()` / `CURRENT_DATE` move|`lib/pitchVideos.ts`, `lib/dataIntegrity.ts`|bind `as_of` at the edge (`01` §7.3)|
|Cache|6-hour TTL; key has no as-of or SHA; invalidation fires only on `totalInserted > 0`, which counts no-op upserts|`lib/queryCache.ts:32`, `cron/pitches:68`|add `as_of` + SHA|

The last row is nastiest: it makes a query irreproducible *against itself within the same day* — a
rescore changes the numbers, the cache does not notice, two users get two answers. A live bug with
the historical one's root cause.

## 5. Seeds — the pin Triton already has

**No `setseed`, `random()`, or `TABLESAMPLE` exists in any SQL or query path in this repo.** The
`Math.random()` hits are broadcast scene-element IDs and template placeholders — presentation, not
analytics; nothing statistical is sampled. **(computed)** That asset needs *defending*: randomness
arrives from two directions.

1. **Bootstrap / permutation intervals.** When `statistical-inference` ships a bootstrap CI, the
   interval is irreproducible unless the seed is stored *with it* — same row as the number, not a
   config file. Postgres has `setseed(x)` before `random()` and `TABLESAMPLE SYSTEM (n) REPEATABLE
   (seed)`; in JS, an explicit PRNG.
2. **LLM-generated prose.** The briefs/newsletter path writes text with a model; that output is not
   re-derivable — not from a seed, temperature, or pinned model ID, because the model is a moving
   external dependency. **Correct treatment is P5: snapshot the rendered output, never regenerate
   it** — an LLM permanently turns recompute into retrieval. **(estimated)**

Rule: *seed what you can, snapshot what you cannot.*

## 6. The query envelope

The unit of reproducibility is a **request**, not a table. One JSON blob on every stats response,
persisted with every published artifact, pins P2–P4 with no migration:

```json
{ "as_of": "2026-08-12T09:10:00Z", "code_sha": "62ab288",
  "constants_year": 2026, "park_factors_vintage": 2024,
  "baseline_verdict": "R2:+0.29..+0.59",
  "session": { "TimeZone": "UTC", "collation": "en_US.utf8" },
  "sources": { "pitches_max_game_date": "2026-08-10", "league_averages_updated_at": "2026-08-11" },
  "seed": null }
```

Three properties make it the right first artifact. **Additive** — no schema change, no backfill,
nothing to fabricate. **Honest immediately** — `baseline_verdict` can read `R4` on day one and beat
silence. **The join key for everything later** — once `metric-governance/02` §5 ships versioned
baselines it becomes a real `baseline_version_id`, and old envelopes stay valid as `R4`. Iceberg,
Delta and Snowflake carry as-of as a snapshot ID *alongside* the query; the envelope is that idea at
Triton's scale.

## 7. What a 15 June 2026 query returns today — the measured answer

The drift probe (`docs/Queries.md:1288–1340`) recomputes the *same rows* under today's baselines —
unconfounded by construction: two vintages, one row set.

|Game date|n|stored avg|current-vintage avg|drift|Verdict|
|---|---|---|---|---|---|
|2026-04-15|4,330|100.50|99.91|**+0.594**|R2|
|2026-05-15|4,337|101.18|100.89|**+0.291**|R2|
|2026-06-15|2,788|100.87|100.87|**0.000**|R1 (accident)|
|2026-08-05|4,372|100.03|100.03|**0.000**|R1 (accident)|

**(a) The magnitude settles a long-open hazard.** Estimated 0.6–1.2 points; measured 0.29–0.59 —
*below* the ≤0.5-point threshold at which a historical rescore pays for itself. Correct policy:
**forward-only versioning**.

**(b) The seam sits where theory predicted.** June and August are 0.000 to three decimals because
the 2026-08-11 repair rescored ≈249k Apr–Aug rows against that day's baselines under a `stuff_plus
IS NULL` predicate — so Feb–May, already scored, kept their vintages. **2026 is a two-vintage column
with no predicate separating the halves**: not `game_date`; the seam is at repair time.

**(c) The uncomfortable inversion.** The ranges that replay perfectly are those whose history was
*destroyed*; the ones that replay imperfectly still hold evidence. Hence the case against rescoring:
it makes the past agree with the present and destroys the ability to tell the difference — why
`metric-governance/02` says not to rescore 2026. The +0.29 is the receipt.

## 8. Saying "no" precisely

An unreproducible number is a managed risk; an *unknowingly* unreproducible one is a confident
wrong answer. The gap is one sentence, and serious publishers write it: BEA archives every vintage
of the national accounts, the Philadelphia Fed runs a real-time dataset for "what did the number say
then," FanGraphs republishes wOBA/wRC+ constants yearly so restatements are attributable. Triton's
equivalent is four strings.

|Verdict|Published sentence|
|---|---|
|**R1**|"Reproducible: this replays exactly."|
|**R2**|"Reproducible within ±X: baselines have moved; measured bias +0.29 to +0.59."|
|**R3**|"Re-derivable but not wired up: the inputs exist, the as-of query does not."|
|**R4**|"Not reproducible: the baselines/constants behind this number were overwritten on DATE."|

Two rules on top. **Never fabricate a vintage to escape R4** — a NULL-or-guess `baseline_version`
backfilled over 8.9M rows turns a known unknown into a confident wrong grouping, worse than the
label (`metric-governance/02` §9). And **the horizon is data, not prose**: a per-metric constant
table, so a surface renders the caveat unprompted. Rendering is **Cas**'s; the verdict is Li's.

## 9. What Triton should do, in order

1. **Write the §3 verdict table into `docs/VARIABLES.md`** as a `## Reproducibility` section, with
   the measured 2026 seam and the pre-2026 horizon date. Free, retroactive, the only remedy for the
   *existing* 8.9M rows.
2. **Ship `lib/reproducibility.ts`** — one `asOfVerdict(metric, from, to)` returning
   `{ verdict, note }` from a constant table encoding §3 and §7. One file, no migration.
3. **Attach the §6 envelope to every stats API response**, persisted into `daily_cards` / `briefs`.
   Pins P3 and most of P4 in a day.
4. **Stop deleting P5** — `app/api/cron/cleanup/route.ts:23–27` archives instead of `DELETE`
   (`07` §8.1). A few hundred rows a season, and the only record of what Triton *said*.
5. **Fix the §4 leaks** — tiebreaks on the three ordering sites, `as_of` + SHA in the cache key,
   invalidation on value change, not `totalInserted > 0`.
6. **Give `SEASON_CONSTANTS`/`PARK_FACTORS` a recorded vintage**; stop applying 2024 park factors to
   2015 (`lib/constants-data.ts:25–28`). C3 has the widest blast radius — twelve seasons per commit —
   and the smallest fix.
7. **Then** the structural work specified elsewhere: append-only `pitch_baselines` + day-grain
   scoring ledger (`metric-governance/02` §5), as-of `league_averages` (`07` §8.3), `created_at` on
   new tables only (`01` §7.5). Sequencing → **Jo**.

Steps 1, 3, 5, 6 touch a metric, query surface or schema, so each **updates `docs/VARIABLES.md` in
the same commit**; queries run to size them go in `docs/Queries.md`.

**Anti-recommendation — do not solve this with database-level time travel: PITR, nightly logical
dumps, or "restore a branch to June and re-run the query."** The first move a database person
reaches for fails three ways. **(i) Wrong layer.** The numbers that moved most compute *outside*
Postgres — wRC+ is JS over `lib/constants-data.ts` at query time, so a database restored to June
still scores June's rows with **today's** constants and park factors: confidently wrong.
**(ii) Retention excludes the question.** PITR horizons run days to a few weeks; the title asks six
months. The one period a restore serves is the one 5-day `daily_cards` retention nearly covers, at a
millionth of the cost. **(iii) Unbounded per-question cost.** Restoring a ~10 GB database for one
leaderboard question is an incident, not a query — and it competes for the production origin taken
down twice this month by concurrent analytical scans (`docs/Queries.md:1148,1226`). Two smaller
don'ts: **`REPEATABLE READ` is not time travel** (it pins a transaction, not six months), and **a
matview or `lbCache` is not history** — a cache with no as-of key answers "recently," never "then."

**Single highest-leverage next action:** ship step 2 — `lib/reproducibility.ts` with the §3 table
and the measured `+0.29…+0.59` / `0.000` seam as constants. Under an hour, no database change; it
makes every other item *expressible* and is the only fix in `temporal-modeling/` that improves
numbers already stored instead of starting a clock for numbers not yet written.

## Sources

1. ACM — [Artifact Review and Badging v1.1](https://www.acm.org/publications/policies/artifact-review-and-badging-current) — §3's ladder.
2. Sandve et al. — [Ten Simple Rules for Reproducible Computational Research](https://doi.org/10.1371/journal.pcbi.1003285) — Rule 6 (seeds), Rule 4 (versioned intermediates).
3. Stodden et al. — [Journal policy effectiveness for computational reproducibility](https://doi.org/10.1073/pnas.1708290115) — artifacts without parameters fail; P2 binds.
4. SLSA — [Provenance spec](https://slsa.dev/spec/v1.0/provenance) — build-input records; §6's template.
5. dbt — [Snapshots](https://docs.getdbt.com/docs/build/snapshots) — SCD2 over daily copies (step 7).
6. Apache Iceberg — [Table spec](https://iceberg.apache.org/spec/) — snapshot IDs as query arguments; §6.
7. Delta Lake — [Time travel](https://docs.delta.io/latest/delta-batch.html) — `versionAsOf`/`timestampAsOf`; retention limits.
8. Snowflake — [Time Travel](https://docs.snowflake.com/en/user-guide/data-time-travel) — retention in days; anti-rec (ii).
9. Datomic — [Data model](https://docs.datomic.com/whatis/data-model.html) — immutable facts + transaction time; no C2.
10. PostgreSQL — [Continuous archiving / PITR](https://www.postgresql.org/docs/current/continuous-archiving.html) — what PITR buys, and its horizon.
11. PostgreSQL — [Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — pins a transaction, not months.
12. PostgreSQL — [LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html) — unpredictable without a total order.
13. PostgreSQL — [SELECT / TABLESAMPLE](https://www.postgresql.org/docs/current/sql-select.html) — `REPEATABLE (seed)`; §5 reserves it.
14. PostgreSQL — [Math functions](https://www.postgresql.org/docs/current/functions-math.html) — `setseed()`/`random()` for bootstraps.
15. PostgreSQL — [Parallel plans](https://www.postgresql.org/docs/current/parallel-plans.html) — aggregation reorders summation.
16. Goldberg — [Floating-Point Arithmetic](https://doi.org/10.1145/103162.103163) — `float8` addition non-associative; §4.
17. PostgreSQL — [Collation support](https://www.postgresql.org/docs/current/collation.html) — versioning; upgrades change sorts.
18. PostgreSQL wiki — [Locale data changes](https://wiki.postgresql.org/wiki/Locale_data_changes) — glibc 2.28: text reordered silently.
19. Philadelphia Fed — [Real-Time Data Set](https://www.philadelphiafed.org/surveys-and-data/real-time-data-research) — "what did the number say then"; §8.
20. BEA — [Historical vintage data](https://apps.bea.gov/histdata/) — archived vintages as a product.
21. FanGraphs — [Guts! (annual wOBA/wRC+ constants)](https://www.fangraphs.com/guts.aspx) — constants versioned by year; C3 is not.

**Triton-internal evidence.** C1: `pitch_baselines` = **206 rows**, keyed `(pitch_name, game_year)`, **no timestamp**, `ON CONFLICT … DO UPDATE` (`app/api/update/route.ts:251,269`). C2: `pitches` ≈ **8,877,621**, `milb_pitches` ≈ **2,508,422**, neither with `created_at`/`updated_at`; ingest upserts `(game_pk, at_bat_number, pitch_number)`, `ignoreDuplicates: false` (`:148`). C3: `computeWRCPlus()` (`lib/sql.ts`) reads `SEASON_CONSTANTS`/`PARK_FACTORS` from **`lib/constants-data.ts`** — not `lib/sql.ts`, contrary to `docs/VARIABLES.md` §1.4; `PARK_FACTORS` (`:25–28`) is team-keyed, one 2024 FanGraphs vintage over 2015–2026, and restated every 2026 hitter by **5–6 points** on **2026-05-08** (commit `3297054`). C4: no **`stuff_plus IS NULL` guard** in the scoring UPDATE (`app/api/update/route.ts:320–333`); `app/api/cron/pitches/route.ts:36–38` sets `start = today − 3`, `end = today` — **four** dates, not the commented three — surviving vintage = `game_date + 3`. Transaction-time columns and row counts: §2; `refresh_league_averages` is DELETE + re-INSERT, so its stamp carries no history. §4 sites: `app/api/scene-stats/route.ts:1312,1334` and `:336,358,1086,1666`, `app/api/player-data/route.ts:44`, `lib/queryCache.ts:32`, `app/api/cron/pitches/route.ts:68`. §5: repo-wide, **no** `setseed`, `TABLESAMPLE`, or SQL `random()`; `Math.random()` only in `lib/sceneTemplates.ts`, `lib/sceneTypes.ts`, `lib/slideshowTransitions.ts`. §7 drift measured **2026-08-12**, logged `docs/Queries.md:1288–1340` (figures in §7); 07-15 returned zero rows (no games). Incidents: the 2026-08-11 rescore of ≈**249,000** rows plus a 09:00/09:10 UTC cron inversion; **46 days** of stale `league_averages`; origin 522 outages (`docs/Queries.md:1148,1226`). P5: `app/api/cron/cleanup/route.ts:23–27` deletes `briefs`/`daily_cards` older than **5 days** (ET).
