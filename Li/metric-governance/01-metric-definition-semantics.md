---
title: Metric Definition Semantics — What a Definition Must Pin Down to Be a Contract
domain: metric-governance
tags:
  - metric-definition
  - semantics
  - data-contracts
  - population
  - grain
  - aggregation
  - adjustment-stack
  - time-basis
sources_reviewed: 17
last_updated: 2026-08-11
---

# Metric Definition Semantics — What a Definition Must Pin Down to Be a Contract

> Grades: **(established)** published/replicated; **(computed)** verified against Triton source at the
> cited line, read rather than queried (the DB was off-limits this pass); **(estimated)** from theory.

## TL;DR

- **A metric definition is a contract with seven clauses: population, filter, grain, unit, aggregation, adjustment stack, time basis. One missing clause makes it ambiguous everywhere, not at the margin.** (established)
- **Triton writes strong six-clause contracts and omits the seventh.** Every metric names its formula; none names the vintage of the reference data it scored against. That is the Stuff+ problem. (computed)
- **Two surfaces disagreeing for *defensible* reasons is under-specification's signature failure, and worse than a bug**: a bug gets fixed, a gap gets argued about with both sides right. (established)
- **Triton has three live definitions of Innings Pitched**, disagreeing on double plays, triple plays, and caught stealing — and the qualification floor uses the third. (computed)
- **`league_averages` is documented as 50th-percentile but implemented as `AVG()`, and its CHECKs take `'MLB'`/`'SP'` while the glossary says `mlb`/`sp`** — so a glossary-derived query silently returns zero rows. (computed)
- **Stuff+ scores a wider population than its baselines were built from.** Baselines need velo, movement *and* extension; scoring needs only `release_speed`, missing z-terms `COALESCE`d to 0 — imputed to average. A 108 may rest on one component. (computed)
- **Aggregation weighting is definitional, and Triton does it two ways**: `pivotTritonRows` is pitch-weighted, `calcTotalsFromRegistry`'s `'avg'` unweighted. Mean of ratios ≠ ratio of sums. (computed)
- **wRC+ has no version record because mutable constants sit inside its definition** — `computeWRCPlus()` reads `SEASON_CONSTANTS`/`PARK_FACTORS` at query time; revise either and every historical value changes, untracked. (computed)
- **Definitions survive a year through version, owner, and review trigger — not prose quality**; `NOT IN ('PO','IN')` quietly excluding NULL `pitch_type` is what an unwritten clause costs. (estimated / computed)

---

## 1. The seven clauses

Every metric answers: *this quantity, over these things, at this resolution, in these units, combined
this way, relative to this reference, as of this moment.* Drop a clause; the reader supplies one.

| Clause | Question | Under-specified symptom |
|---|---|---|
| **Population** | What's in scope *before* filtering? | Leaderboards with different row counts |
| **Filter predicate** | What's excluded — including NULLs? | Two "same" numbers off by a few percent |
| **Grain** | One row per what? | Double-counting; distinct-vs-count drift |
| **Unit & representation** | Units, decimals, notation, category spellings | `12.7` vs `12.2` IP; empty result sets |
| **Aggregation rule** | How do children become a parent? | Career totals that don't match season rows |
| **Adjustment stack** | What reference, population, order? | "Compared to what?" has no answer |
| **Time basis** | Valid time of inputs; transaction time of reference | Same query, new answer next month |

The first six say how it's computed. **The seventh says whether it stays comparable.** That's the one
Triton is missing, and this doc's thesis: six-clause contracts produce columns individually correct
and collectively incomparable. See `02-metric-versioning-reproducibility.md` and
`05-baseline-normalization-design.md`.

---

## 2. The clauses against Triton's code

### 2.1 Population — name it before you filter it

`league_averages` is the good example: it stores its denominator beside the value — `n_qualified`,
`leader_value`, `qual_floor`, `stddev`, keyed `(season, level, role, metric)`. Few metric stores do
this; it should be the pattern elsewhere. (computed)

Stuff+ is the counter-example. Baselines are built only from pitches with **all four** inputs present
(`app/api/update/route.ts:263-267`). Scoring admits any pitch with a velocity:

```sql
-- app/api/update/route.ts:322-333, joined to pitch_baselines on (pitch_name, game_year)
SET stuff_plus = GREATEST(0, LEAST(200, ROUND(100
  + COALESCE((p.release_speed - b.avg_velo)/NULLIF(b.std_velo,0), 0) * 4.5
  + ...movement * 3.5 + ...extension * 2.0)))  -- same COALESCE(...,0) shape
WHERE ... AND p.release_speed IS NOT NULL      -- the only input-completeness test
```

**The scored population is a strict superset of the reference population**, and each `COALESCE(…, 0)`
imputes a missing component to exactly league-average — so a three-component 108 and a one-component
108 are indistinguishable. Two more facts the formula hides: the clamp censors both tails, biasing the
column mean inward by an unrecorded amount; and `pitch_baselines.pitch_count` is never used as a
minimum-n floor, so a rare `pitch_name` is z-scored against a tiny mean and a tiny σ. (computed)

### 2.2 Filter predicate — NULL is a third value and it wins silently

The canonical role rule reads "excluding `pitch_type IN ('PO','IN')`," and the implementation
(`app/api/scene-stats/route.ts:844`) is `AND pitch_type NOT IN ('PO','IN') GROUP BY pitcher, game_pk
HAVING COUNT(*) >= 50`. But `NULL NOT IN ('PO','IN')` is NULL, not TRUE, so unclassified pitches drop
and the threshold is judged on a shrunken count. `NOT IN (…)`, `(IS NULL OR NOT IN (…))`, and
`COALESCE(col,'') NOT IN (…)` are three different metrics: "excluding X" must also say **what happens
to unknowns**. (established / computed)

The mirror image is `AVG()`, which skips NULLs, so a partly populated derived column averages an
unrepresentative subset — the 2026 Stuff+ collapse, where league averages stayed plausible as coverage
fell to zero (`Jo/data-reliability/01-pipeline-observability-fundamentals.md`). (established)

### 2.3 Grain — one row per what

`pitcher_season_command` and `pitcher_season_deception` are grained **pitcher × pitch_type × year**,
so any season number collapses a dimension — a definitional act (§2.5). Grain drifts inside single
expressions too: `METRICS.ip` counts **pitch rows** on an event allowlist, `IP_ESTIMATE_SQL` counts
**distinct PAs**. They agree only because Statcast sets `events` on a PA's terminal pitch: an
invariant of the source, not the metric, and nothing asserts it. (computed)

### 2.4 Unit & representation — including how categories are spelled

Baseball writes thirds as `.1`/`.2`; `METRICS.ip` emits `ROUND(outs/3, 1)`, true decimal, so 12⅔
innings renders **12.7** in a report and **12.2** in notation. The registry compounds it:
`calcTotalsFromRegistry`'s `case 'ip'` parses each value as `whole * 3 + fractional` outs — correct
for thirds, so fed `"12.7"` it reads 12 innings **plus 7 outs** = 14.1 IP. `format: {type:'ip'}` is
right for MLB-API values in `player_season_stats` and wrong for `METRICS.ip`: one key, two
incompatible representations. (computed)

Category spellings are units too. Glossary §7 documents `level` as `mlb | milb` and `role` as
`sp | rp | hitter`; the CHECKs take `'MLB' | 'MiLB'` and `'hitter' | 'SP' | 'RP'`, so a
glossary-derived query returns an empty set with no error. And `METRICS` hard-codes MLB lowercase
event strings with no normalization layer — only `refresh_league_averages` has one, a 26-branch `CASE`
(`events_n`) — so §1's claim that these keys run against `milb_pitches` "with events normalized to
lowercase" describes something that doesn't exist. (computed)

### 2.5 Aggregation rule — Triton does it two ways

Season command values are **pitch-weighted** — `pivotTritonRows` accumulates
`sum += value * row.pitches` and `weight += row.pitches` across a pitcher's pitch types, then divides.
The dashboard totals row is not: `calcTotalsFromRegistry`'s `case 'avg'` is `sum / vals.length`, one
value per row. A career Whiff% totals cell is thus the unweighted mean of season Whiff percentages, a
12-pitch September counting equally with a 3,000-pitch season. For ratios that's the wrong estimator,
and Simpson's-paradox territory (`Li/statistical-inference/11-aggregation-bias-weighting.md`).
(computed / established)

**The weight vector is part of the definition.** "Cmd+ for the season" and "career Whiff%" are
different metrics under different weights, and no consumer can tell which they got. `TotalsStrategy`
should name a weight column (`avg_weighted_by: pitches`), not just `'avg'`.

### 2.6 Adjustment stack — reference population, statistic, and order

Each layer must name its reference population, the statistic used (mean? median? σ?), and the order of
application. Triton's two adjusted metrics fail differently. **Stuff+** specifies its reference well —
`pitch_baselines` keyed `(pitch_name, game_year)` fixes the comparison to same-pitch-type,
same-season — but leaves open that `pitch_name` is *Savant's classification*, restated retroactively
and gaining categories (Sweeper, Slurve): a pitch reclassified Slider→Sweeper changes baseline group
with no measurement changing. (computed)

**wRC+** puts mutable constants inside the definition:

```ts
// lib/sql.ts — computeWRCPlus
const denom = (parkFactor / 100) * constants.r_pa
return Math.round((((woba - constants.woba) / constants.woba_scale + constants.r_pa) / denom) * 100)
```

Both tables are read at query time, and FanGraphs revises league constants and park factors as seasons
close and multi-year windows roll (established, per Guts!). Every revision silently rewrites all
historical wRC+ on the platform, and since the metric isn't stored there's no prior value to compare
against — the tradeoff in `04-materialize-vs-compute-time.md`: query-time computation buys
correctness-on-refresh, pays in reproducibility.

### 2.7 Time basis — the missing clause

Two timestamps belong in every definition: **valid time** (the period the inputs describe) and
**transaction time** (when the reference data was computed — baseline vintage, constants version,
classification vintage). Triton pins the first everywhere and the second nowhere: `pitch_baselines` is
recomputed nightly as a full-season-to-date aggregate and each night's pitches are scored against it —
April pitches against April-to-date, August against a nearly complete season. With no
`baseline_version` column, `stuff_plus` mixes vintages while presenting as one scale: every value
individually correct, the column not internally comparable (`Li/context/triton-context.md` §Hazards 1).
`league_averages.updated_at` is the nearest transaction-time stamp in the stack, and idempotent
refresh overwrites it — recording *when*, never *what changed*. (computed)

**The rule:** if re-running the same query next month can return a different number, the definition is
incomplete until it names the reference vintage it used.

---

## 3. Triton's three canonical rules — what each pins down, what each leaves open

| Rule | Pins down | Leaves open |
|---|---|---|
| **SP/RP:** ≥3 games with 50+ pitches, excluding `pitch_type IN ('PO','IN')` → SP else RP | Grain (pitcher×game), threshold, filter, exhaustive binary outcome, season scope | NULL `pitch_type` (§2.2); season-terminal, so a June-converted starter is retro-labeled SP for April |
| **Qualification:** hitter `AB >= max(25, 0.20 × AB_leader)`; SP/RP `IP >= max(5, 0.20 × IP_leader_for_role)` | Proportional-with-floor design, per-role leader, floor *stored* in `qual_floor` | **Which IP** (§4.1); the leader is computed *after* role assignment, so one reclassification moves everyone's floor, which also rises daily in-season |
| **Plus-stat exclusion:** any `_plus` metric excluded from `league_averages` | The right invariant — a metric centered on 100 shouldn't get a league mean | A *naming* convention doing a *semantic* job: a future `stuff_index` slips through, a raw `foo_plus` is wrongly excluded. Use `normalized: true` |

---

## 4. The disagreement catalogue

### 4.1 Three definitions of Innings Pitched

| Event | `METRICS.ip` | `IP_ESTIMATE_SQL` | `refresh_league_averages._ip` |
|---|---|---|---|
| `field_out`, `strikeout`, `force_out`, `sac_fly` | 1 | 1 | 1 |
| any `*double_play*` | 2 | 2 | **1** |
| `triple_play` | 3 | 3 | **1** |
| `caught_stealing_*`, `other_out` | **0** | **1** | **0** |
| Grain / output / MiLB casing | pitch rows; `ROUND(outs/3,1)`; casing unhandled | distinct PA; `outs/3.0`; unhandled | pitch rows; `outs/3.0`; normalized via `events_n` |

All three are called "IP," and the floor deciding leaderboard membership uses the third. A pitcher
near the cutoff is qualified under one and not another, both dashboards internally consistent — the
defensible disagreement in one table. (computed)

### 4.2 `league_averages.value` — mean or median?

`docs/VARIABLES.md` §7 opens *"50th-percentile values per qualified player."* The DDL header agrees;
`Li/context/triton-context.md` inherited the claim. The function computes `AVG(...)` with
`STDDEV_SAMP`, and the column COMMENT says *"Mean of the metric across qualified players."* **The code
is the mean** — for symmetric metrics the gap is small, for right-skewed ones (spin, RE24, rates near
a bound) it isn't. Separately, `create-refresh-league-percentiles.sql:239` fills a *different* table
by nearest-rank (`vals[ceil(p * n / 100)]`, no interpolation) — legitimate but non-default, since
`percentile_cont` and R's type-7 interpolate. The fix isn't to change the code: decide, record the
decision with a date and rationale, and make all three documents agree in one commit.
(computed / established)

### 4.3 A DDL header documenting a rule the function doesn't implement

`scripts/create-league-averages.sql:9` reads `-- SP/RP classification: first-inning game share > 0.5
-> SP else RP`; the function implements `CASE WHEN COUNT(*) FILTER (WHERE pc >= 50) >= 3 THEN 'SP'
ELSE 'RP' END`, a rule borrowed from `app/api/game/puzzle/route.ts`. **Stale documentation is worse
than none, because it is trusted** (`09-metric-documentation-glossary.md`). (computed)

---

## 5. Baseball-specific ambiguity generic governance misses

**Pitch classification is a model output**, not a measurement — Savant reclassifies history and adds
names mid-era — so name the classification vintage. **The season isn't a fixed frame and role is
emergent**: state game-type scope (spring/regular/post/WBC, 2020's 60 games), whether `game_date` is
ET-anchored, whether role is as-of-date or season-terminal, and the as-of date of a proportional floor,
since it rises daily. **Levels are separate populations**: a shared MLB/MiLB axis needs a translation
factor or a hard break. And **outs are thirds while feeds differ in case** — state notation, not unit.

---

## 6. Writing a definition that survives a year

Structure and change-control endure; prose doesn't. The minimum record, one per key, beside its
registry entry:

```yaml
key: stuff_plus
version: 2          # bump on any semantic change
owner: Li
grain: pitch
unit: index (100 = reference mean); integer; clamped [0, 200]
population: pitches with release_speed IS NOT NULL joined to a baseline row
filter: none beyond the join; NULL components imputed to z = 0
aggregation: unweighted mean over pitches unless stated   # must be explicit
adjustment: {layer: z vs pitch_baselines(pitch_name, game_year),
             weights: {velo: 4.5, movement: 3.5, extension: 2.0},
             reference_population: same pitch_name + season, all 4 inputs non-null}
time_basis: {valid_time: game_date, transaction_time: baseline_version}  # ← no such column
known_limits: [nightly baseline mixes vintages, MLB/MiLB baselines separate]
review_trigger: formula, weights, baseline query, clamp
```

What makes it durable: **versioned, not edited**, so an old screenshot stays explicable
(`02-metric-versioning-reproducibility.md`); **executable, not prose**, because prose and SQL diverge
on a timescale of months (§4.3 is that divergence caught at roughly twelve); and **machine-checkable**
— a test asserting `docs/VARIABLES.md` lists every `METRIC_REGISTRY`/`METRICS` key beats a style
guide. State the negative space too: what a metric excludes is the half that decays.

### 6.1 Definition review as a practice

Not a committee. Three triggers: any PR touching `lib/reportMetrics.ts`, `lib/sql.ts`,
`lib/metricRegistry.ts`, or a `refresh_*` function; any time two surfaces disagree; an annual
pre-season sweep when constants and park factors update.

Fixed agenda: walk §1's clauses as questions — population (is it the one the reference was built
from?), NULL handling, grain and what collapses it, units and the exact spelling of every category,
the weight vector in *every* aggregation path, and the reference/population/order of each adjustment.
Then the seventh: **if I re-run this in three months, what could make the answer different?** That's
the one Triton's metrics currently fail.

---

## 7. What Triton should do, in order

1. **Add `baseline_version` (or `scored_at`) to `pitch_baselines` and `pitches.stuff_plus`.** Highest
   leverage change in the stack: until it exists no within-season Stuff+ comparison is defensible, and
   no tooltip caveat fixes that. If versioning is too invasive now, commit to a full-season rescore
   against a frozen baseline at season close — and say so in the glossary.
2. **Resolve mean-vs-median in `league_averages`, fixing all three documents in one commit** —
   `docs/VARIABLES.md` §7, the DDL header, `Li/context/triton-context.md` — and in the same commit fix
   the `level`/`role` casing and delete the stale comment at `create-league-averages.sql:9`.
3. **Pick one IP definition, express it as `ip_outs` at the outs grain, derive the rest from it.**
   Three definitions isn't a rounding difference — it moves the qualification floor; integer outs
   formatted at the edge also kills the `12.7`-vs-`12.2` parser hazard.
4. **Make weighting explicit in `TotalsStrategy`** — replace `'avg'` with a variant naming its weight
   column. One registry change fixes every consumer.
5. **Replace `_plus` suffix-matching with a `normalized: true` flag** on `MetricDef`, read by
   `refresh_league_averages` — naming shouldn't carry semantics — and **version `SEASON_CONSTANTS` /
   `PARK_FACTORS`** with a vintage label stamped on exported wRC+.
6. **CI-check that every `METRICS`/`METRIC_REGISTRY` key appears in `docs/VARIABLES.md`** — makes the
   repo's strongest convention an invariant instead of a habit.

**Anti-recommendation: do not adopt a semantic layer or metrics store (dbt Semantic Layer/MetricFlow,
Cube, a homegrown YAML DSL) to solve this.** It's the obvious move and it's wrong here. Triton's
disagreements aren't caused by SQL living in too many places — a central `METRICS` map and a central
registry already exist, which is most of what a semantic layer provides. They're caused by
**unrecorded time basis and undocumented aggregation weights**, and a semantic layer fixes neither: it
serves one consistent, *unversioned* definition scored against a drifting baseline, raising confidence
in a number still not comparable to last month's, while forking definitions a third way. Revisit after
items 1-4: over versioned definitions a semantic layer is useful; over unversioned ones it's
scaffolding around the wrong problem.

---

## Sources

1. [FanGraphs Library — wRC+](https://library.fangraphs.com/offense/wrc/) — canonical formula and its league/season constants.
2. [FanGraphs — Guts!](https://www.fangraphs.com/guts.aspx) — the wOBA-scale/R-PA/cFIP table `SEASON_CONSTANTS` mirrors, and that gets revised.
3. [MLB Glossary — Innings Pitched](https://www.mlb.com/glossary/standard-stats/innings-pitched)
4. [MLB Glossary — Qualified](https://www.mlb.com/glossary/rules/qualified) — fixed-rate alternative to a proportional floor.
5. [Baseball Savant — CSV docs](https://baseballsavant.mlb.com/csv-docs) — Statcast field definitions and units.
6. [pybaseball](https://github.com/jldbc/pybaseball)
7. [PostgreSQL — Row and Array Comparisons](https://www.postgresql.org/docs/current/functions-comparisons.html) — `NOT IN` with NULL; the §2.2 trap.
8. [PostgreSQL — Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — `AVG` skips NULLs.
9. [NIST/SEMATECH — Percentiles](https://www.itl.nist.gov/div898/handbook/prc/section2/prc252.htm) — why percentile estimators disagree.
10. [Simpson's paradox](https://en.wikipedia.org/wiki/Simpson%27s_paradox)
11. [Data Contract Specification](https://datacontract.com/) — schema, semantics, quality, terms in one artifact.
12. [Bitol — Open Data Contract Standard](https://bitol-io.github.io/open-data-contract-standard/) — §1 parallels its clause structure.
13. [PayPal — Data Contract Template](https://github.com/paypal/data-contract-template) — production YAML template.
14. [dbt — Metrics and MetricFlow](https://docs.getdbt.com/docs/build/metrics-overview) — aggregation declared, not implied.
15. [dbt — Semantic models](https://docs.getdbt.com/docs/build/semantic-models) — closest analogue to Triton's registry.
16. [Cube — Data modeling](https://cube.dev/docs/product/data-modeling/overview)
17. [Airbnb — Standardizing Metric Computation at Scale (Minerva)](https://medium.com/airbnb-engineering/how-airbnb-standardized-metric-computation-at-scale-f23cc53dea70) — dashboards disagreeing defensibly; versioning as the fix.

**Triton-internal evidence (verified against source, 2026-08-11; read, not queried):**
`lib/reportMetrics.ts` (`METRICS.ip`); `lib/sql.ts` (`IP_ESTIMATE_SQL`, `computeWRCPlus`,
`pivotTritonRows`); `lib/metricRegistry.ts` (`TotalsStrategy`, `calcTotalsFromRegistry`);
`app/api/update/route.ts:251-333`; `app/api/scene-stats/route.ts:844, 1199`;
`scripts/create-league-averages.sql` (DDL, CHECKs, comments, stale line 9);
`scripts/create-refresh-league-averages.sql:274-405`;
`scripts/create-refresh-league-percentiles.sql:239`; `docs/VARIABLES.md` §1, §2, §7.
