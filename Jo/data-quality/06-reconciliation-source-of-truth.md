---
title: Reconciliation & Source of Truth — Making Independent Sources Agree, and Deciding Who Wins
domain: data-quality
tags:
  - reconciliation
  - system-of-record
  - cross-source-agreement
  - tolerance-design
  - retrosheet
  - statcast
  - break-investigation
  - data-contracts
sources_reviewed: 18
last_updated: 2026-08-11
---

# Reconciliation & Source of Truth

## TL;DR

- **Reconciliation is two things: "do these sources agree?" (a query) and "when they don't, who wins?" (a written decision).** The second must exist before the first break lands or it gets re-litigated under pressure. (inferred)
- **Triton holds seven overlapping sources of baseball fact and reconciles zero of them.** `pitches` (8.89M), `retro_events` (14.9M), `player_season_stats` (79k), `lahman_*`, `milb_pitches` (2.54M), `wbc_pitches`, `compete_pitches`. Statcast and Retrosheet overlap on 2015–2026 and have never been compared. (measured, 2026-08-11)
- **The existing monitor is the right home and currently cannot express this.** `/api/cron/integrity` runs 8 checks nightly; **776 rows over 95 run days contain zero `status='fail'` ever.** All eight test referential *shape*; none tests whether two sources agree on a *number*. (measured)
- **The check you'd most want is impossible today because the column isn't there.** `player_season_stats` has ERA/W/L/SV/HLD/IP/ER/R/RBI/SB and **no strikeouts, no walks** (`scripts/create-player-season-stats.sql:4-20`), so K/BB can't be checked against the MLB Stats API until two columns are added. (measured)
- **`milb_pitches.events` is Title Case (`Strikeout`); `pitches.events` is lowercase (`strikeout`).** A cross-level check without normalization returns *zero* MiLB strikeouts and reports perfect agreement — the failure mode where the check itself lies. (documented — CLAUDE.md; silent-zero consequence inferred)
- **Statcast restates history** — pitch types reclassified, metrics recomputed retroactively. A break may mean *the provider changed*, not that you lost data, and only a stored source version tells them apart. (documented)
- **TrackMan and Hawk-Eye are different instruments, so `compete_pitches` vs `pitches` can never use an equality tolerance.** Bland–Altman: bias plus 95% limits of agreement, alert on *drift of the bias*. Zero disagreement would be evidence of a bug. (documented)
- **MLB Stats API `inningsPitched` is base-3, not decimal: `62.1` means 62⅓,** and `app/api/cron/player-stats/route.ts:88` `parseFloat`s it into a NUMERIC. Comparing it decimally is wrong by up to 0.23 IP per pitcher, always in one direction. (documented)
- **Scope mismatch causes more breaks than data loss does, and it's the last thing anyone checks.** Triage scope → vocabulary → identity → grain → restatement → *then* our pipeline; causes 1–4 mean the check is wrong. (inferred)
- **Season-wide reconciliation cannot run under the 8s cap** (doc 02 measured a 7-day coverage assertion at 9.9s cold); route it through `run_query_long`, one season per call. (measured/inferred)

---

## 1. Agreement vs authority

An **agreement check** is a query producing a signed delta between two independently-produced measurements of the same fact; symmetric, no opinion. A **system of record** is a written, per-question declaration of which source is authoritative — a governance artifact, not code, and the thing that turns a break from an argument into a work item. Checks without an SoR produce breaks nobody can action ("Savant says 214 K, Retrosheet says 213 — which do we show?"); an SoR without checks is a policy nobody verifies.

The third artifact, usually skipped: **the exclusion list.** Every real reconciliation accumulates known, explained differences, and they must live in the check as *code with a comment* — an undocumented exclusion is indistinguishable from a bug you stopped noticing.

---

## 2. Triton's source map

| Source | Grain | Span | Can answer | Cannot answer |
|---|---|---|---|---|
| `pitches` (Savant) | pitch | 2015–2026 | measurement, location, pitch type, PA outcome | official IP/ER; outs-on-play; pre-2015 |
| `retro_events` | play (PA + SB/CS/balk) | 1914+ | event truth, outs, base state, lineups | measurement; in-season lag |
| `player_season_stats` (MLB API) | player×season×group | 1974+ | official ERA/IP/ER/W/L/SV/HLD/IR | K, BB, HR — **columns don't exist** |
| `lahman_pitching`/`_batting` | player×season×stint | all history | season K/BB/IPouts/ER, any era | in-season (annual release) |
| `milb_pitches` | pitch | 2023+ | minor-league measurement | nothing to reconcile against |
| `wbc_pitches` | pitch | tournament | WBC measurement | — |
| `compete_pitches` (TrackMan) | pitch | facility | facility measurement | comparability to `pitches` |

**The only genuine three-way overlap is 2015–2023 pitching season totals** — `pitches` × `retro_events` (both derived) × `lahman_pitching` (given), with `player_season_stats` covering IP/ER over the same window. That overlap is the entire reconciliation opportunity, and it is unexploited.

**Identity is a prerequisite, not part of this doc.** `retro_events` keys on `retro_id`, `pitches` on MLBAM int, Lahman on `lahman_id`; the crosswalk is `retro_id_map` (`retrosheet.planning.md:83-108`), whose spec flags known Chadwick ambiguities → **`Li/entity-resolution/01-identity-in-baseball-data.md`**. Report *unjoined* entities separately from *disagreeing* ones.

---

## 3. Choosing the grain

| Grain | Catches | Cost on Triton | Verdict |
|---|---|---|---|
| Row / pitch | missing or duplicated individual pitches | full outer join of 8.89M × 14.9M; hopeless under any timeout | **No** — only a bounded dive on one `game_pk` |
| Game | which *games* are missing or short | ~2.4k games/season, aggregate both sides first | **Yes — the workhorse** |
| Season / player | drift in totals; what a user sees | ~1.5k pitchers/season | **Yes — the headline** |

**Detect at season grain, localise at game grain, inspect at row grain** — each step bounded by the previous one's output. Anyone who starts at row grain builds a check that times out and then gets disabled.

```sql
-- Games in Retrosheet but not Statcast, and vice versa. Expect zero rows.
WITH sc AS (SELECT game_date, COUNT(DISTINCT game_pk) n FROM pitches
            WHERE game_year = 2025 AND game_type = 'R' GROUP BY 1),
     rs AS (SELECT game_date, COUNT(*) n FROM retro_games
            WHERE season = 2025 GROUP BY 1)
SELECT COALESCE(sc.game_date, rs.game_date) AS game_date, sc.n AS statcast,
       rs.n AS retro, COALESCE(sc.n,0) - COALESCE(rs.n,0) AS delta
FROM sc FULL OUTER JOIN rs USING (game_date)
WHERE COALESCE(sc.n,0) <> COALESCE(rs.n,0) ORDER BY 1;
```

`FULL OUTER JOIN` is load-bearing: an inner join silently drops the case you most care about — a date present in one source and absent from the other — and returns zero rows, which reads as success.

---

## 4. Tolerance design

Choose the class from the *production mechanism* of the two numbers.

| Class | Applies when | Rule | Triton example |
|---|---|---|---|
| **Exact** | both sides count discrete events, shared definition | `delta = 0` | HR, `pitches` vs `retro_events` |
| **Exact + exclusions** | discrete, one source has documented scope differences | `delta = 0` after a code-resident exclusion list | BF, filtering `game_type='R'` |
| **Epsilon** | same integers, different rendering/rounding | `abs(a-b) <= unit`, unit = rounding granularity | IP outs vs `innings_pitched` |
| **Relative + floor** | magnitudes span orders of magnitude | `abs(a-b)/GREATEST(a,b) <= p` **AND** `abs(a-b) > k` | season pitch counts (5 vs 3,000) |
| **Statistical** | different instruments, same physical quantity | Bland–Altman bias + 95% LoA; alert on drift | `rel_speed` vs `release_speed` |

One rule prevents most self-inflicted wounds: **always pair a relative tolerance with an absolute floor.** A pitcher with 4 season strikeouts and a delta of 1 is a 25% break; without a floor the break list is all garbage and gets ignored — the exact fate of the `new_pitch_names` warn (54 firings, no action).

### 4.1 The base-3 innings trap

```sql
-- Correct conversion: base-3 IP -> outs
SELECT FLOOR(innings_pitched)::int * 3
     + ROUND((innings_pitched - FLOOR(innings_pitched)) * 10)::int AS ip_outs
FROM player_season_stats WHERE season = 2025 AND stat_group = 'pitching';
```

The fractional digit must be `0`, `1`, or `2`. **A value with fractional digit 3–9 means someone did decimal arithmetic on it upstream** — a cheap, high-signal validity check worth adding on its own merits.

---

## 5. Concrete checks for Triton

### 5.1 Season K/BB/BF: `pitches` vs `retro_events` (2015+)

The flagship check, runnable today with no schema change. Retrosheet's `event_type` is the Chadwick `EVENT_CD`: **3 = strikeout, 14 = walk, 15 = IBB, 16 = HBP, 20/21/22/23 = 1B/2B/3B/HR** (documented).

```sql
-- Statcast vs Retrosheet, 2025 regular season. Tolerance: EXACT. Triage per §7.1.
WITH sc AS (
  SELECT pitcher AS mlbam_id,
    COUNT(*) FILTER (WHERE events IN ('strikeout','strikeout_double_play')) AS k,
    COUNT(*) FILTER (WHERE events = 'walk')    AS bb,
    COUNT(*) FILTER (WHERE events IS NOT NULL) AS bf
  FROM pitches WHERE game_year = 2025 AND game_type = 'R' GROUP BY 1
), rs AS (
  SELECT m.mlbam_id,
    COUNT(*) FILTER (WHERE e.event_type = 3)        AS k,
    COUNT(*) FILTER (WHERE e.event_type IN (14,15)) AS bb,
    COUNT(*) FILTER (WHERE e.bat_event_flag)        AS bf
  FROM retro_events e
  JOIN retro_games  g ON g.game_id  = e.game_id
  JOIN retro_id_map m ON m.retro_id = e.pitcher_id
  WHERE g.season = 2025 GROUP BY 1
)
SELECT COALESCE(sc.mlbam_id, rs.mlbam_id) AS mlbam_id,
       COALESCE(sc.k,0)  - COALESCE(rs.k,0)  AS k_delta,
       COALESCE(sc.bb,0) - COALESCE(rs.bb,0) AS bb_delta,
       sc.bf, rs.bf,
       (sc.mlbam_id IS NULL OR rs.mlbam_id IS NULL) AS unjoined
FROM sc FULL OUTER JOIN rs USING (mlbam_id)
WHERE COALESCE(sc.k,0)  IS DISTINCT FROM COALESCE(rs.k,0)
   OR COALESCE(sc.bb,0) IS DISTINCT FROM COALESCE(rs.bb,0)
ORDER BY ABS(COALESCE(sc.k,0) - COALESCE(rs.k,0)) DESC LIMIT 50;
```

- **`game_type='R'` vs `g.season` is a scope guess** — Retrosheet event files are regular-season by default with postseason separate. Confirm before treating any break as real.
- **`bf` is a cross-check on the cross-check.** BF agrees but K doesn't → classification difference; BF disagrees too → coverage. Two counters cost nothing and halve the triage tree.
- **BF as `events IS NOT NULL` is inferred, not verified.** Enumerate the Savant `events` vocabulary against a known season before trusting it as a PA counter.

### 5.2 IP/ER, and the two missing columns

Because `player_season_stats` is authoritative for IP/ER (§6), reconciling it against `retro_events` — same shape as 5.1, `ip_outs` (§4.1) vs `SUM(outs_on_play)`, epsilon 0 — validates the *Retrosheet* ingest, not the MLB API. **The gap worth fixing first:** add `strikeouts` and `base_on_balls` to `player_season_stats`. The MLB API response already carries `strikeOuts`/`baseOnBalls` in the same `stat` object parsed at `app/api/cron/player-stats/route.ts:83-94`. Two nullable INTs give Triton a *three-way* K/BB reconciliation — Statcast-derived, Retrosheet-derived, league-official — which turns "which is wrong?" into a majority vote.

### 5.3 The MiLB casing trap

```sql
-- WRONG. Returns 0 for every pitcher, and 0 = 0 looks like agreement.
SELECT COUNT(*) FROM milb_pitches WHERE events = 'strikeout';

-- Necessary but not sufficient: normalize at the edge.
SELECT COUNT(*) FROM milb_pitches
WHERE lower(replace(events,' ','_')) IN ('strikeout','strikeout_double_play');
```

`Home Run` → `home_run` under that transform, but `Groundout` does **not** map to `field_out`. The durable fix is a stored `event_vocab(source, raw_value, canonical_value)` table with an assertion that the mapping is *total* — an unmapped value is a break. Same shape as `new_pitch_names`, which already proves Triton can detect unfamiliar vocabulary and already proves nobody acts on it.

**A normalization bug and perfect agreement produce identical output**, so every reconciliation must assert both sides are non-empty and of plausible magnitude *before* comparing.

### 5.4 TrackMan vs Statcast — statistical only

Different hardware, release-point conventions, and pitches — no row-level join, no equality tolerance. Compute **bias** = mean(TrackMan) − mean(Statcast) over comparable pitch types and **LoA** = bias ± 1.96·SD of differences (Bland & Altman, 1986), then **alert on drift of the bias, not its magnitude**: a stable +0.6 mph offset is a calibration fact for `docs/VARIABLES.md`; a jump to +2.1 mph in a week is a device event. Sample size and pitch-mix confounding → **Li**.

---

## 6. Declaring the system of record

Write this down in `docs/VARIABLES.md` and stop re-deciding.

| Question | Authoritative source | Why |
|---|---|---|
| Official season IP, ER, ERA, W/L/SV/HLD | `player_season_stats` (MLB API) | league's own record; scoring rules we must not re-derive |
| Season totals before 1974 | `lahman_pitching`/`_batting` | `player_season_stats` starts 1974 |
| What happened in a PA, any era | `retro_events` | human-audited over decades; only source pre-2015 |
| Pitch measurement (velo, spin, movement) | `pitches` | only tracking source |
| Pitch classification | `pitches.pitch_type`, **as-of ingest** | provider-owned and restated; §7.1 cause 5 |
| Minor-league anything | `milb_pitches` | no second source; treat as unverified |
| Facility/bullpen measurement | `compete_pitches` | different instrument; never merged in |
| Player identity | `players` (MLBAM) via `retro_id_map` | → `Li` |

The consequence people resist: **K/BB derived from `pitches` is *not* authoritative** even though it is more granular — granularity is not authority, and when Statcast and the official record disagree the official record wins, the delta being our ingest bug. The other half of the artifact is a **decision log**: when a break is resolved, record which source was believed, why, and the evidence, in `docs/Queries.md` at minimum. Today's "Savant was wrong about that game" is next year's unexplained exclusion.

---

## 7. Break investigation

### 7.1 Triage order — deliberately the reverse of everyone's instinct

| # | Cause | Signature | Fix |
|---|---|---|---|
| 1 | **Scope mismatch** | clusters on specific dates, or hits nearly all entities | fix the filter (`game_type`, season boundary, level) |
| 2 | **Vocabulary mismatch** | one side's count is exactly 0, or a category absent | `event_vocab` normalization |
| 3 | **Identity mismatch** | high `unjoined`; traded or same-named players | crosswalk repair → `Li` |
| 4 | **Grain mismatch** | consistent proportional offset (SB/balks inflate plays) | correct the aggregate definition |
| 5 | **Upstream restatement** | no deploy on our side; hits historical rows | re-ingest, record source version |
| 6 | **We lost rows** | localises to a contiguous date range | backfill → `11-remediation-backfill-safety.md` |

Causes 1–4 mean **the check is wrong**; only 5–6 mean the data is wrong, and 6 — the one everyone assumes on sight — is the rarest. A first run reporting 900 breaking pitchers is almost certainly a scope or vocabulary bug, and treating it as an incident burns credibility the monitor will need later.

**On cause 5:** Statcast reclassifies pitch types and recomputes metrics retroactively, so a break with no code change on our side is *expected provider behaviour* — but only if you can prove it, which requires storing source version / fetch date alongside the result. `retro_events` already carries `source_version` per row (`retrosheet.planning.md:275`); `pitches` does not, so causes 5 and 6 are currently indistinguishable. Contract drift → **`09-schema-evolution-contracts.md`**, **`Jo/data-reliability/09-external-api-ingestion.md`**.

### 7.2 Reporting: extend `integrity_checks`, don't build a parallel system

`integrity_checks` already has the right shape — `check_name`, `status`, `found`, `remediated`, `details jsonb` (`lib/dataIntegrity.ts:8-14`) — so a reconciliation check fits with **no DDL**: `found` = breaking entities, `status` = `pass` at 0 / `warn` at ≤5 / `fail` above, `details` = `{ year, unjoined, top }`.

Three requirements the existing suite violates and this one must not: **a query error is `fail`, never `pass`** (two of the eight get this wrong at `:108`/`:167` — a check that could not run is not one that agreed); **it must be able to emit `fail`**, since 776 rows / 95 days / zero fails is a monitor with no failure path; and **`details.top` must carry the offenders**, because a count with no exemplars cannot be investigated tomorrow, which is when someone will look.

**Cost.** Season-grain reconciliation aggregates ~700k `pitches` rows and ~190k plays and will not finish inside the 8s `authenticator` `statement_timeout`. Run it through **`run_query_long`** (120s), one season per call, exactly as `checkOrphanedPitchers` already does (`lib/dataIntegrity.ts:98`) — never all seasons in one statement. Backfill history a season at a time and store the results; only the current season needs a nightly re-run.

---

## 8. What Triton should do, in order

1. **Add the game-count check (§3) to `lib/dataIntegrity.ts`, wired into `/api/cron/integrity`.** One `run_query_long` query, current season, exact tolerance — the cheapest cross-source assertion Triton can own, and it detects an ingest gap in `pitches`, the failure class that already cost three months.
2. **Add `strikeouts` and `base_on_balls` to `player_season_stats`.** Two nullable INTs; the API response already carries them at the parse site. Unlocks three-way K/BB reconciliation.
3. **Ship the §5.1 reconciliation for the current season, expecting the first run to be all false positives.** Resolve triage 1–2 until the break list is small and explicable, then write the survivors into a commented exclusion list.
4. **Fix the error-handling defect while you're in the file** — `lib/dataIntegrity.ts:108`/`:167` return `pass` on query error. Two lines, and it makes every other item trustworthy.
5. **Write the §6 system-of-record table into `docs/VARIABLES.md`**; start a break decision log in `docs/Queries.md`.
6. **Build `event_vocab` and assert totality** across `pitches`, `milb_pitches`, `wbc_pitches` — kills the Title Case trap permanently instead of per-query.
7. **Add `source_version`/`fetched_at` to `pitches` ingest metadata** so a restatement (cause 5) is distinguishable from data loss (cause 6).
8. **Only then** the TrackMan↔Statcast bias monitor (§5.4), design reviewed by Li first.

**Anti-recommendation: do not build row-level pitch-to-play reconciliation between `pitches` and `retro_events`, and do not adopt a data-diff tool to do it for you.** A full outer join across 8.89M and 14.9M rows, on a platform whose read escape hatch is 120s and whose top tables already total ~32 GB, is not a monitor — it is an outage generator. It also answers a question nobody asked: the sources have different grains by construction (Retrosheet rows include SB, balks, and wild pitches that are not PAs), so a large share of "breaks" would be definitional. Season-grain detection plus game-grain localisation gets every actionable signal for ~0.1% of the cost.

---

## Sources

1. Retrosheet — [Event File Description](https://www.retrosheet.org/eventfile.htm) — play-by-play layout; play vs plate appearance.
2. Retrosheet — [Game Logs](https://www.retrosheet.org/gamelogs/index.html) — the file behind `retro_games` and §3.
3. Retrosheet — [Data Use Notice](https://www.retrosheet.org/notice.txt) — the project's own completeness/corrections statement.
4. Chadwick Bureau — [`cwevent` docs](http://chadwick.sourceforge.net/doc/cwevent.html) — the `EVENT_CD` table (3=K, 14/15=BB/IBB, 16=HBP, 20–23=1B/2B/3B/HR), `BAT_EVENT_FL`.
5. Chadwick Bureau — [chadwick tools](https://github.com/chadwickbureau/chadwick) — the extractor producing `retro_events`.
6. Chadwick Bureau — [register](https://github.com/chadwickbureau/register) — the crosswalk behind `retro_id_map`, and its ambiguity caveats.
7. Baseball Savant — [Statcast CSV docs](https://baseballsavant.mlb.com/csv-docs) — column definitions for the `pitches` feed.
8. MLB — [Statcast glossary](https://www.mlb.com/glossary/statcast) — metric definitions; the Hawk-Eye basis (2020+).
9. pybaseball — [jldbc/pybaseball](https://github.com/jldbc/pybaseball) — issues documenting Savant schema changes and altered historical values.
10. toddrob99 — [MLB-StatsAPI](https://github.com/toddrob99/MLB-StatsAPI) — de facto docs for endpoints and `stats=season` semantics.
11. SABR — [Lahman Database](https://sabr.org/lahman-database/) — season-grain historical totals; annual release cadence.
12. Bland & Altman (1986), *Lancet* — [Assessing agreement between two methods](https://pubmed.ncbi.nlm.nih.gov/2868172/) — the frame for TrackMan vs Hawk-Eye.
13. Lin (1989), *Biometrics* — [Concordance correlation coefficient](https://pubmed.ncbi.nlm.nih.gov/2720055/) — single-number agreement statistic.
14. PostgreSQL — [Comparison operators](https://www.postgresql.org/docs/current/functions-comparison.html) — `IS DISTINCT FROM`, for NULL-safe deltas.
15. PostgreSQL — [Combining queries](https://www.postgresql.org/docs/current/queries-union.html) — `EXCEPT`, the minimal row-set primitive.
16. Datafold — [data-diff](https://github.com/datafold/data-diff) — checksum row-level diffing; what §8 declines to adopt.
17. dbt — [Data tests](https://docs.getdbt.com/docs/build/data-tests), [dbt-utils `equality`](https://github.com/dbt-labs/dbt-utils#equality-source) — declarative "these relations must match".
18. Andrew Jones — [Data Contracts](https://datacontract.com/) — the governance layer behind provider restatement.

**Triton-internal evidence (measured 2026-08-11):** `scripts/create-player-season-stats.sql:4-20` (no K/BB); `app/api/cron/player-stats/route.ts:83-94` (parse site; base-3 IP at `:88`); `lib/dataIntegrity.ts:8-14, 98, 108, 167`; `app/api/cron/integrity/route.ts:26-85`; `retrosheet.planning.md:60-108, 206-283`; `scripts/create-compete-pitches.sql:73`; table sizes and the 776/95/zero-fails finding from `Jo/context/triton-context.md`.
