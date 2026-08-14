# Research App — Data Integrity & Statistical Accuracy Audit (Scope)

**Status:** scoped, not started · **Drafted:** 2026-08-14 · **Owners:** `jo` (integrity), `li` (accuracy)

The standard this audit is written against: **every number the Research App displays must be correct,
or visibly marked as not being correct.** A wrong number shown confidently is the failure mode; a
missing number is not.

---

## 1. Boundary

**In scope — 35 pages and everything behind them.**

| Layer | What |
|---|---|
| Pages | `app/(research)/` — 28 pages · `app/(milb)/` — 7 pages |
| Routes | `player-data`, `milb/player-data`, `report`, `milb/report`, `explore/query`, `explore/insights`, `league-percentiles`, `league-baseline(s)`, `leaderboard-triton`, `leaderboard-deception`, `leaderboard-defence`, `movement-percentiles`, `park-adjusted`, `pitch-area-stats`, `pitcher-outing`, `pitchers`, `sequencing`, `sequencing-atbats`, `team-tendencies`, `trends`, `hot`, `umpire`, `sos`, `standings`, `milb/standings`, `scores`, `milb/scores`, `boxscore`, `bat-tracking`, `abs`, `data-export`, `lahman/*`, `wbc/*`, `compute-triton`, `compute-deception` |
| Compute | `lib/leagueStats.ts` (93 KB), `lib/pitcherStats.ts`, `lib/sql.ts`, `lib/reportMetrics.ts`, `lib/metricRegistry.ts`, `lib/leaderboardColumns.ts`, `lib/constants-data.ts`, `lib/filterEngineCore.ts`, `lib/trajectoryPhysics.ts`, `lib/dataIntegrity.ts` |
| Data | `pitches`, `milb_pitches`, `players`, `player_season_stats`, `pitch_baselines`, `league_averages`, `league_percentiles`, `pitcher_season_command`, `pitcher_season_deception`, the six matviews, and the crons that write them (`pitches`, `milb-pitches`, `player-stats`, `refresh`, `integrity`, `sos-weekly`) |

**Out of scope.** Broadcast, Work, Compete, Design, Imagine, Game, Newsletter, Models, Mechanics.
Exception: when one of those reads an in-scope `lib/` module, **the module is audited, the consuming
surface is not** — a defect in `lib/leagueStats.ts` gets reported once, not once per consumer.

**Also out of scope, deliberately:**
- **Presentation honesty** — whether a correct number is *displayed* misleadingly. That is Cas's
  territory and Cas already has 11 findings open from the `analytics-ux` batch.
- **Metric merit** — whether Stuff+ should weight velocity 4.5. That is Soto's.
- **Fixes.** This audit produces findings only. You decide what gets changed.

---

## 2. Why slices are by layer, not by page

A wrong stat on `/player/123` and a wrong stat on `/leaders` are usually the *same* defect surfacing
twice, because both read the same lib module and the same table. Auditing page-by-page would find the
same bug 12 times and still miss the layer nobody renders directly. So the work is cut along the path
a number actually travels:

```
source rows → ingest/refresh → derived tables → query layer → compute layer → identity joins → display
   Jo A          Jo B             Jo B            Jo C          Li D/E          Li F        (Cas, later)
```

---

## 3. Slices

Run in order. Each closes before the next opens — you chose sequential with me driving, so each
slice's findings are verified and written down before the next agent is dispatched.

### Slice A — Source data completeness · **Jo**
`pitches` and `milb_pitches`: per-season and per-day row coverage, gap/hole detection, current ingest
lag, duplicate rows, and null rates on the columns every downstream metric depends on
(`release_speed`, `pfx_x`, `pfx_z`, `pitch_name`, `stand`, `p_throws`, `game_year`). Also: the
`csv.length < 100` guard in the Savant ingest that treats an upstream error page as a no-games day.
**Question answered:** is the raw input actually there, for every day the app will let you select?

### Slice B — Refresh chain & derived-table freshness · **Jo**
Confirm the current state of the P0 refresh-chain outage (`refresh_materialized_views`,
`refresh_league_averages`, `refresh_league_percentiles` — `proconfig = NULL` under an 8s cap). Then
per-object staleness for `league_averages`, `league_percentiles`, all six matviews, `pitch_baselines`,
`pitcher_season_command`, `pitcher_season_deception`, `player_season_stats`.
**Question answered:** which Research App pages are, right now, dividing by a stale denominator — and
does anything on screen say so?

### Slice C — Query-layer correctness · **Jo**
Every in-scope route: does it silently truncate? The 8s `authenticator` cap applies to every
`run_query`, and `run_mutation` executes a failing statement twice. Audit for implicit `LIMIT`s,
unpaginated fetches, swallowed timeouts, and any path that returns a partial result set with a
success status.
**Question answered:** when the query doesn't finish, what does the page show?

### Slice D — Stored-vs-computed divergence · **Jo → Li handoff**
The same metric exists twice and the two can disagree:
- `pitches.stuff_plus` (DB, written by the scoring path) vs `computeStuffRV()`
  (`lib/leagueStats.ts:1176`, client-side, reads hardcoded `BL_BY_YEAR`).
- `lib/pitcherStats.ts:290-293` picks between them on a **50% coverage threshold** and labels both
  "Stuff+".
- `STUFF_ZSCORE_BASELINES = BL_BY_YEAR[2026]` (`:1154`) is the fallback for unknown years, and
  `getStuffBaseline()` falls back to the *nearest* year when a pitch type is missing.
- ~93 KB of frozen per-year league constants in `lib/leagueStats.ts` (`BRINK_`, `CLUSTER_`, `HDEV_`,
  `VDEV_`, `MISSFIRE_`, `CLOSE_PCT_`, `STUFF_LEAGUE_BY_YEAR`, `CENTROIDS_BY_YEAR`) vs the live
  `league_averages` table.
**Question answered:** do the two paths produce the same number today, and which one is each page
showing you?

### Slice E — Metric definitions & internal consistency · **Li**
Reconcile `lib/reportMetrics.ts` ↔ `lib/metricRegistry.ts` ↔ `lib/sql.ts` ↔ `docs/VARIABLES.md` ↔
`docs/Formulas.md` ↔ the SQL that populates the derived tables. Known entry points: only **9 of 69**
registry keys have a counterpart in `reportMetrics.METRICS`; **three different IP definitions**;
`league_averages` documented as a median and implemented as `AVG()`; the SP/RP rule in
`create-league-averages.sql`'s DDL differing from the function that populates it; unversioned
4.5/3.5/2.0 Stuff+ weights; `COALESCE→0` league-average imputation; no `pitch_count` floor.
**Question answered:** does each metric compute what its label and its glossary entry claim?

### Slice F — Identity & joins · **Li**
`players` has `team` populated on **0 rows**, `lahman_id` on 19%, mixed `"Last, First"` / `"First Last"`
name forms, and 513 names shared by 2+ players. Audit every join that resolves a name or crosses an ID
space: `batter_name` derivation, `umpire/[name]` (name-keyed route), `historical/[lahmanId]`,
`lahman/*` routes, and MLBAM↔Lahman↔Retrosheet crossings.
**Question answered:** is the stat attached to the right person?

### Slice G — MiLB correctness & cross-level comparability · **Li**
2026 `milb_pitches.events` is **53.5% Title Case / 46.5% lowercase** after `EVENT_NORMALIZE_MAP`
shipped 2026-06-08 with no backfill — so an equality match drops ~46.5% of rows, and the map is also a
category collapse (Groundout/Flyout/Lineout → `field_out`), which changes what the stat *means*. Then:
do the MiLB pages apply MLB-derived baselines, and is a plus-stat even defined at that level?
**Question answered:** are the 7 MiLB pages showing MLB math on MiLB data?

### Slice H — Temporal correctness & reproducibility · **Li**
`game_year` vs `game_date` disagreement, ET-vs-UTC day boundaries, season rollover, late-arriving
Savant restatement, and as-of reproducibility — `pitch_baselines` is destructively upserted with no
timestamp column, so a Stuff+ value from last week cannot be recomputed from retained inputs.
**Question answered:** if the same query is run twice a month apart, does it return the same history?

---

## 4. Carry-in — re-confirm, don't re-discover

`docs/reliability-findings-2026-08-11.md` holds **24 verified findings**; only the Stuff+ scoring path
was fixed (`cf345e2`). The Cas `analytics-ux` batch added ~6 more on the presentation side. Those are
**inputs**, not output. Each in-scope carry-in gets one line in the report — *still open / now fixed /
was wrong* — and is not re-investigated from scratch. New findings must be genuinely new.

---

## 5. Central measurement pass

Approved: I run it, read-only, sequentially, before dispatching Slice A. **No subagent touches the
database** — ~20 concurrent readers took Supabase down for roughly an hour. Every query is logged to
`docs/Queries.md` per the repo convention, and results become a briefing packet pasted into each
agent's prompt.

Every query must survive the 8s `authenticator` cap — day- or season-chunked where needed, and never
a `COUNT(*)` over all 8.88M `pitches` rows.

Planned queries:
1. `pg_class.reltuples` + `pg_total_relation_size` for all in-scope tables (planner stats are stale —
   `last_analyze` was NULL everywhere on 2026-08-12; treat counts as approximate and say so).
2. Max `game_date` and row count for the last 14 days, `pitches` and `milb_pitches` (ingest lag).
3. Per-season row counts, both tables (gap detection).
4. Null-rate on the metric-critical columns, current season only.
5. `stuff_plus` coverage by season — the column that went dark for 3 months.
6. `updated_at` extremes for `league_averages`, `league_percentiles`, `pitch_baselines`,
   `pitcher_season_command`, `pitcher_season_deception`, `player_season_stats`.
7. Matview last-refresh times, all six.
8. `cron_runs` outcomes for the last 30 days for the in-scope crons (the "logged success while timing
   out" pattern).
9. `proconfig` for the three refresh functions — is the P0 still live?
10. `league_averages` for the current season: is it a mean or a median, checked against a direct
    percentile computation on a single metric.
11. `milb_pitches.events` casing split, 2026.
12. `players` key quality: name-form mix, duplicate-name count, `lahman_id` fill rate.
13. Sample-level stored-vs-computed Stuff+ comparison on ~2 000 recent pitches (Slice D input).

---

## 6. Evidence rules

Every finding ships with all four or it does not enter the report:

1. **`file:line`** or the exact DB object.
2. **A reproduction** — a runnable query, a URL with parameters, or a failing test.
3. **Expected vs actual**, stated as numbers.
4. **An evidence grade** in that agent's vocabulary — Jo: `measured` / `documented` / `inferred` /
   `folklore` · Li: `established` / `computed` / `estimated` / `folk-sabermetrics`. Grades do not mix
   across agents.

**Verification:** I re-derive each finding independently before it enters the report. This is not
optional — in the last batch, one of my own briefing assumptions was wrong and the agent corrected it.
Anything I cannot reproduce goes to an **Unconfirmed** appendix with what would settle it, never into
the ranked list.

---

## 7. Severity ladder

| | Meaning |
|---|---|
| **P0** | A number the Research App displays is **wrong right now**, and nothing on screen indicates it. |
| **P1** | Correct today, wrong under a reachable input — a particular season, pitch type, filter, or player. |
| **P2** | Correct, but nothing would catch it breaking. No test, no monitor, no constraint. |
| **P3** | Definition drift — docs, glossary, and implementation disagree; no user-visible error yet. |

Ranked P0 → P3, and within a rank by how many of the 35 pages the defect reaches.

---

## 8. Deliverable

`docs/research-app-audit-2026-08-14.md`:
- One-paragraph verdict — what you can trust today and what you cannot.
- Ranked findings table with severity, affected pages, and evidence grade.
- Per-finding detail: reproduction, expected vs actual, blast radius, and the fix *stated but not made*.
- Carry-in status table.
- Unconfirmed appendix.
- The measurement packet, so the numbers are auditable later.

Then: `planning.md` Known Issues updated, and the P0/P1 set is the natural input to Jo's and Li's
7 applied playbooks — which is why those are being written after this, not before.

---

## 9. Sequence & checkpoints

| # | Step | Checkpoint |
|---|---|---|
| 0 | Central measurement pass | You see the packet before any agent is dispatched |
| 1 | Slice A → B → C (Jo) | Findings verified and written after each slice |
| 2 | Slice D (Jo → Li handoff) | The divergence question is the hinge — stop and read it |
| 3 | Slice E → F → G → H (Li) | Same per-slice verification |
| 4 | Assemble, rank, verdict | Report delivered |

Stop points are real: if Slice B shows the refresh chain is still dead, several later slices change
meaning, because half the app is dividing by a 46-day-old denominator and every accuracy finding
downstream inherits that.
