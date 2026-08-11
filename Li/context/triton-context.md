---
title: Triton Metric Context — Definitions, Baselines, Identity, Known Semantic Hazards
domain: context
tags: [context, triton-platform, metrics, baselines, identity, stuff-plus, governance]
last_updated: 2026-08-11
---

# The Metric Stack Li Serves

> Ground-truth context doc for Li. Every `applied/` doc and every piece of Li's advice should be
> framed against what's written here. Items marked *(assumption)* should be confirmed with Trevor
> and corrected in place. Items marked *(open)* are unresolved semantic hazards Li owns.

## The Operator

**Trevor May** — founder/operator. Former MLB pitcher (Twins, Mets, Athletics, 2014–2023), now
running Mayday Media and building Triton. He designs the metrics; he has pro-level feel *and*
developer-level data literacy. He has seen every flavor of baseball bro-science and will discount
an ungraded claim. Give him the interval, not just the point estimate.

## Canonical Sources of Truth

| Question | Source |
|---|---|
| What does this metric key mean? | **`docs/VARIABLES.md`** — the canonical glossary |
| How is it formatted/colored/totaled? | `lib/metricRegistry.ts` (**69** `MetricDef` entries, verified 2026-08-11) |
| How is it computed in SQL? | `lib/sql.ts`, `lib/reportMetrics.ts` |
| Which metrics are computed in JS, not SQL? | `COMPUTED_METRIC_KEYS` in `lib/reportMetrics.ts` |
| Stuff+ client fallback | `lib/leagueStats.ts` → `computeStuffRV()` |
| Stuff+ authoritative scoring | `applyStuffPlusForDateRange` in `app/api/update/route.ts` |

**Convention above all others:** any change to `lib/reportMetrics.ts`, `lib/sql.ts`,
`lib/sceneTypes.ts`, or a new query param in a stats route **updates `docs/VARIABLES.md` in the
same commit** (see its §0 Maintenance section). An undocumented metric change is a defect.

When the glossary and the code disagree, say so out loud and reconcile them — don't silently
prefer one.

## The In-House Metrics

### Stuff+
```
stuff_plus = clamp(0, 200,
  round(100
    + z(release_speed)      * 4.5
    + z(total_movement_in)  * 3.5
    + z(release_extension)  * 2.0))
```
- `z()` is against `pitch_baselines`, keyed **(pitch_name, game_year)** — not pitch_type, not
  pitcher, not level.
- `total_movement_in = sqrt((pfx_x*12)^2 + (pfx_z*12)^2)`.
- MiLB has a parallel `milb_pitch_baselines`.
- Stored on `pitches.stuff_plus`; scored nightly for the ingest window.

### Command
`pitcher_season_command` — per pitcher × pitch_type × year. Raw Triton command metrics plus
plus-stats. Season-level values are **pitch-weighted aggregates**.

### Deception
`pitcher_season_deception` — per pitcher × pitch_type × year. `deception_score`, `unique_score`.
**2017+ only** — earlier seasons have no data, which is a coverage fact, not a zero.

### League averages
`league_averages` — benchmarks per **(season, level, role, metric)** for qualified players. Rebuilt
by `refresh_league_averages(p_season)`, called nightly for the current season.

> **⚠️ It is a MEAN, not a 50th percentile.** *(Corrected 2026-08-11.)* `CLAUDE.md:114`,
> `docs/VARIABLES.md` §7, and an earlier version of this doc all describe it as a "50th-percentile
> benchmark." The implementation computes `AVG(...)` with `STDDEV_SAMP`, and the table's own column
> comment is unambiguous: `'Mean of the metric across qualified players.'` The `stddev` column
> comment adds *"consumers use mean ± 3σ for color-scale extremes."*
>
> This matters because most baseball rate stats are skewed, so mean ≠ median — and this is the
> **denominator of every plus-stat on the platform**. A metric benchmarked against a mean behaves
> differently in the tails than one benchmarked against a median, and every consumer reading the
> docs currently believes it's the latter.
>
> Two related casing traps in the same table: the DDL is
> `CHECK (level IN ('MLB','MiLB'))` and `CHECK (role IN ('hitter','SP','RP'))`, while the glossary
> documents `mlb | milb` and `sp | rp | hitter`. **A query written from the glossary returns zero
> rows with no error.** And `scripts/create-league-averages.sql:9` still documents a superseded
> SP/RP rule ("first-inning game share > 0.5") that the function does not implement.

### wRC+
Computed **at query time** in JS via `computeWRCPlus()` in `lib/sql.ts`, using `SEASON_CONSTANTS`
and `PARK_FACTORS` — which live in **`lib/constants-data.ts`**, not in `lib/sql.ts`. *(Corrected
2026-08-11; `docs/VARIABLES.md` §1.4 and `.claude-memory/MEMORY.md` both state the wrong file.)*
Not stored. This means it changes if the constants change, with no record of which vintage produced
a past screenshot.

### ⚠️ `stuff_plus` is absent from the canonical glossary

**Measured 2026-08-11: `grep -c "stuff_plus" docs/VARIABLES.md` returns 0.** The platform's flagship
derived metric — stored on 8.89M rows, surfaced on every pitching surface, and the subject of a
three-month silent outage — has **no entry in the glossary that repo convention designates as
canonical**. §1.2 "Stuff / Arsenal" lists `avg_velo`, `avg_spin`, `avg_ext`, and break, but not the
metric itself.

This is a governance defect by the repo's own stated rule, and it is the cleanest possible
illustration of why a convention enforced only by discipline decays. The fix is a test, not a
reminder — see `metric-governance/09-metric-documentation-glossary.md`.

## Canonical Definitional Rules

- **SP/RP classification** (used by `app/api/scene-stats/route.ts` and `refresh_league_averages`):
  a pitcher is **SP** if they have **≥3 games with 50+ pitches** thrown (excluding `pitch_type` in
  `'PO','IN'`) in the season; **RP** otherwise.
- **Qualification for league averages:** hitter `AB >= max(25, 0.20 * AB_leader)`;
  SP/RP `IP >= max(5, 0.20 * IP_leader_for_role)`.
- **Plus-stat exclusion:** any metric name ending in `_plus` is excluded from `league_averages` —
  these already normalize to 100.
- **⚠️ MiLB event casing — THIS RULE IS NOW WRONG AND DESTROYS DATA.** `CLAUDE.md` still says
  `milb_pitches.events` is Title Case and to normalize accordingly. Measured 2026-08-11: 2023–2025
  are 100% Title Case, but **2026 is 53.5% Title Case / 46.5% lowercase** — both vocabularies in one
  column (`field_out` 23,457 beside `Groundout` 11,209). Commit `410212b` (2026-06-08) added
  `EVENT_NORMALIZE_MAP` at `app/api/update/milb/route.ts:244` with **no backfill**, splitting the
  column on an *ingest-date* seam no `game_date` filter can see. Matching `'Strikeout'` or calling
  `initcap()` now silently drops ~46.5% of 2026 MiLB events — **fewer rows, no error**.
  Worse, the map is a **category collapse**, not case normalization: `Groundout`/`Flyout`/`Lineout`/
  `Pop Out`/`Forceout` → `field_out`. Pre-June rows carry batted-ball granularity post-June rows do
  not, so a backfill is a semantic decision, not a mechanical one. See
  `docs/reliability-findings-2026-08-11.md` #12l.

## Known Semantic Hazards — Li Owns These

### 1. Baseline vintage drift *(open — highest priority)*

`pitch_baselines` is recomputed nightly as a **full-season-to-date aggregate**, and each night's
new pitches are scored against whatever the baseline was *that night*. Consequence: an April pitch
was scored against April-to-date baselines, an August pitch against a nearly-complete season. Every
individual value is "correct," but **the `stuff_plus` column is not internally comparable across
the season**, and nothing records which vintage scored which row.

This is invisible in the data. There is no `baseline_version` column. Li's standing recommendation
is to add one, or to rescore the full season against a final baseline at season close — and until
then, to caveat any within-season Stuff+ comparison.

*(Discovered 2026-08-11 during the Stuff+ outage investigation. The full-season rescore run that
day partially masked it for 2026 — the June–August repair used current baselines while Feb–May
retained their original vintages.)*

### 2. Cross-level incomparability

MLB `pitch_baselines` and `milb_pitch_baselines` are separate populations. A 100 Stuff+ in Triple-A
and a 100 in MLB are **not the same claim**. Any chart or table placing both on one axis needs an
explicit translation factor or a hard visual separation. *(No translation factor currently exists —
open.)*

### 3. Null-vs-zero in derived columns

`stuff_plus`, deception (`2017+`), command, and bat-tracking all have legitimate NULL regions —
pre-coverage seasons, pitches missing `release_speed`, unscored rows. `AVG()` silently skips NULLs,
so a partially-populated column produces a confident average over an unrepresentative subset. The
2026 outage produced exactly this: averages looked plausible the whole time coverage was collapsing.

### 4. Small-sample interpretation

The platform makes it trivially easy to view a two-start window. Stuff+ stabilizes fast relative to
outcome stats, but Li should attach a stabilization threshold to any pitch-level metric shown over
a short window. *(No stabilization thresholds are currently encoded anywhere in the repo — open.)*

### 5. Aggregation weighting

Season-level command values are **pitch-weighted**. Mixing pitch-weighted, game-weighted, and
simple averages across surfaces produces numbers that disagree with each other for defensible
reasons — which is worse than disagreeing for indefensible ones. `calcTotalsFromRegistry` in
`lib/metricRegistry.ts` encodes per-metric `TotalsStrategy`; that registry is the place to fix
weighting, not the call site.

## Identity — The Seven ID Spaces

| Source | ID space | Where |
|---|---|---|
| MLBAM / Statcast | `pitcher`, `batter` (MLBAM ID) | `pitches`, `milb_pitches`, `players.id` |
| MLB Stats API | same MLBAM IDs | `player_season_stats`, roster routes |
| Retrosheet | Retrosheet player ID | `retro_people`, `retro_events`, `retro_rosters` |
| Lahman | `playerID` (bbref-style) | `lahman_people`, `lahman_batting`, … |
| TrackMan (Compete) | facility-local athlete | `compete_pitches`, `compete_pitch_sessions` |
| Captury / mocap | capture subject | `biomech_captures`, `biomech_throws` |
| Whoop | Whoop user | `whoop_cycles`, `whoop_sleep`, `whoop_workouts` |

Platform users/athletes live in `profiles` / `athlete_profiles`. **`players` holds ~16,924 rows** *(the "4,017" in `CLAUDE.md` is stale)*
with id/name/position; the pitch ingest inserts missing players on the fly from `player_name`, and
the season-stats backfill inserts historical players from the league-wide MLB API.

**Li's standing concern:** more Triton numbers are wrong because of a bad identity match than
because of a bad formula. There is no maintained crosswalk table between the Retrosheet/Lahman
spaces and MLBAM *(open — the Chadwick Bureau register is the standard solution)*.

## Temporal Facts

- `pitches` spans **2015–2026**; `milb_pitches` **2023+**; Retrosheet PBP **1914+**;
  `player_season_stats` **1974+** for IR/IRS completeness (≤1970 null).
- The pitch cron re-syncs a **3-day window** because Savant delivers late; game dates can fall
  outside the requested window (TZ/late West Coast games), which is why the scoring step keys off
  the min/max of *ingested* dates rather than the request window.
- Cron scheduling uses ET calendar via `ymdInTimeZone()`, not UTC — game dates are ET.
- `system_metadata` holds `pitches_last_run` and `mv_last_refreshed` markers.

## Conventions Li Must Follow

- **`docs/VARIABLES.md` in the same commit** as any metric/param/schema change.
- Every ad-hoc DB query logged to **`docs/Queries.md`** before returning results.
- `docs/Ideas.md` gets exploratory metric entries **only when Trevor explicitly asks**.
- Significant work updates `planning.md`.
- Never push without explicit approval; ask clarifying questions (AskUserQuestion) first.

## Boundary With Soto

Soto **designs** models (Stuff+ architecture, command quantification, biomech features, projection
systems). Li **governs and validates** them (comparability, versioning, sample size, uncertainty,
identity, reproducibility). They overlap on stabilization and validation — read
`Soto/algorithm-design/09-model-validation-stabilization.md` and cross-reference rather than
contradict it.

## Li's Standing Priorities for This Platform

1. **Add baseline versioning** to `pitch_baselines` / `stuff_plus`, or commit to an end-of-season
   full rescore. The column is currently not internally comparable.
2. **Encode stabilization thresholds** per metric in `lib/metricRegistry.ts` so short-window views
   can warn structurally instead of relying on the analyst.
3. **Build a real ID crosswalk** (Chadwick register) for MLBAM ↔ Retrosheet ↔ Lahman.
4. **Define cross-level translation** for MLB↔MiLB Stuff+, or forbid mixed-axis display.
5. **Reconcile `docs/VARIABLES.md` against `lib/metricRegistry.ts`** and keep them in lockstep.
