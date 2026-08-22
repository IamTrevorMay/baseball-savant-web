# Research App — Metrics Accuracy Audit

**Run 2026-08-22 · clean room** — eight parallel specialists, no prior audit or finding available to
any of them. 131 findings, 19 critical, 36 high. Every claim below traces to code read or a query run
during the audit; the ones marked ✅ were re-verified independently by the orchestrator against the
production database or the source.

---

## Verdict

**The MLB pitching dashboard's raw per-pitch data is trustworthy. Almost everything derived from it
is not.**

Ingest fidelity is exact — a live Savant fetch replayed through the repo's own parser matched the
database row-for-row on every physics column, with no unit drift. That is the floor, and it holds.

Above that floor, four independent systems are each silently wrong: **the league baselines are
frozen or missing**, so every normalized stat compares against the wrong yardstick; **every totals
row is an unweighted mean**, so career and arsenal lines are arithmetic nonsense; **two formulas are
outright defective** (SIERA carries an invented term, xSLG averages nulls); and **the MiLB app reads
its own event vocabulary wrong**, so its rate stats render zero. None of these announce themselves.
Every one produces a plausible-looking number.

The single most consequential structural fact: **the postseason has never been ingested, in eleven
seasons**, and the same bug silently disables the entire nightly derived-stat chain from October
through January.

---

# Ranked findings

## Tier 1 — Wrong on screen right now, with no indication

### 1. MiLB rate metrics render zero or half their true value ✅
**Impact: critical — all 7 MiLB pages, every rate metric, every season.**

`milb_pitches.events` is stored in Title Case (`Strikeout`, `Groundout`); `lib/reportMetrics.ts`
matches MLB's lowercase (`LIKE '%strikeout%'`). Measured:

| Season | Event rows | Matched by Triton | True strikeouts |
|---|---|---|---|
| 2025 | 171,545 | **0** | 38,717 |
| 2026 | 142,572 | 15,737 | 31,611 |

2025 MiLB K% renders **0.0** against a true 22.6. BA renders **.000** against .257. IP renders
**0.0** against 38,035.7. 2026 renders K% 11.0 against 22.2 — because the vocabulary changed
mid-season (Mar–May 100% Title Case, June split, Jul–Aug 100% lowercase), so any 2026 season-spanning
MiLB rate is a 50/50 blend of correct and zero.

The error is **directional, not noisy**: numerators are vocabulary-sensitive, denominators are not.

**Fix:** the correct normalizer already exists at `scripts/create-refresh-league-averages.sql:88-118`
— which is why `league_averages.k_pct` for MiLB reads a sane 22.26 while `/api/milb/report` returns
0.0 for the same key. Port it into `lib/reportMetrics.ts`, then backfill `events`. The backfill is
non-destructive: `bb_type` preserves the granularity the Title-Case→`field_out` collapse would lose.

### 2. SIERA is negative for every pitcher, every season ✅
**Impact: critical — every pitching surface that shows SIERA.**

`lib/expected-stats.ts:87` ends the formula with `− 0.986 × ln(max(IP, 1))`. Real SIERA has no
innings term; it is a rate estimator. For a 200-inning starter this subtracts ~5.2 runs.

Stored `league_averages` MLB SP SIERA: **−0.832** (2023), **−0.871** (2024), **−0.847** (2025),
against FIP 4.25 and xFIP 3.54 in the same rows. An ERA estimator cannot be negative. Mirrored in
both SQL functions. `higher_better = false` then *rewards* innings pitched.

**Fix:** delete the term in all three places, re-run `refresh_league_averages`.

### 3. Every "Career" and "Total" row is an unweighted mean of rates ✅
**Impact: critical — pitcher dashboard, hitter dashboard, Arsenal tab.**

`lib/metricRegistry.ts:643` (`calcTotalsFromRegistry`) and `HitterOverviewTab.calcTotals:160` average
across sub-rows instead of recomputing from summed components. **48 of 69 `MetricDef` entries use
`totals:'avg'`.** The correct weight is on the row and discarded at `:654`.

| Case | Displayed | True |
|---|---|---|
| Fixture career ERA | **6.50** | 3.22 |
| Senga career BA (n=1,432 PA) | .199 | **.218** |
| Senga career K% | 30.5% | **26.4%** |
| Senga 2025 Arsenal velo | 79.7 mph | **87.8** |
| Senga 2025 Arsenal Usage% | 12.5% | **100%** |

A 20-PA injury season — 1.4% of career PA — carries 25% of the weight. On the Arsenal tab the
sub-rows are *pitch types*, so a 12-pitch cutter counts equally with a 1,200-pitch fastball. Across
406 pitchers with ≥500 pitches in 2026: mean signed velo error **−1.22 mph**, max **6.98**.

**A correct implementation already exists** at `HistoricalOverviewTab.tsx:57-100`. The dashboards
don't call it.

### 4. Every percentile for 2015–2025 is a fabricated 50 ✅
**Impact: critical — every percentile display outside the current season.**

`league_percentiles` contains **one season: 2026**, 216 rows, last written 2026-06-03. Seasons
2015–2025 have zero rows. All three consumers read
`bp ? empiricalPercentile(...) : 50` — `PercentileTab.tsx:179`,
`charts/PercentileRankings.tsx:167`, `templates/PercentileRankings.tsx:133`.

A missing percentile renders as a grey 50 identical to a real 50. Neither
`/api/league-percentiles` nor `/api/league-baseline` returns `updated_at`, so nothing downstream can
tell the difference. `PercentileRankings.tsx:165` additionally swallows the fetch failure with
`.catch(() => {})`.

### 5. Horizontal break renders with opposite signs on the same page ✅
**Impact: critical — pitcher dashboard, reports, mobile.**

`lib/pitcherPerspective.ts:16` is `toPitcherX(v) => -v`. **22 components apply it.**
`lib/pitcherStats.ts` imports it **zero times** and maps raw `pfx_x` at `:256`.

So the arsenal table (catcher perspective) and the movement chart directly beneath it (pitcher
perspective) disagree in sign for the same pitch. Skubal's changeup: **+13.7"** in the table,
**−13.7"** in the chart.

**Requires your decision before fixing** — flipping the table inverts the sign on every scouting note
written off it.

### 6. Postseason has never been ingested, and October kills the nightly chain ✅
**Impact: critical — 11 seasons of playoff data absent; all derived stats stall Oct–Jan.**

`game_type` in `pitches` contains only `R` (7,999,704) and `S` (952,344). **Zero postseason pitches,
ever.**

`GAME_TYPE_MAP.P = 'P|'` (`app/api/update/route.ts:13`) is not a valid Savant token — it is `PO|`.
And `app/api/cron/pitches/route.ts:33` pushes **only** `'P'` for months 10–11, never `'R'`, so
October regular-season games are missed too:

| Season | October regular-season pitches |
|---|---|
| 2021–2023 | 13,147 / 22,327 / 4,402 (historical backfill) |
| **2024, 2025** | **0** (cron era) |

Downstream: the empty October fetch yields `totalInserted = 0` → `/api/cron/refresh` sets
`skipDownstream` → baselines, compute-triton, compute-deception, `league_averages`,
`league_percentiles` and matview refresh are **all skipped every night, October through January**,
with both crons reporting green.

**Fix:** `'P|'` → `'PO|'`, and add `'R'` to the October/November game-type list. Two lines.

### 7. `avg_xslg` averages a column that is NULL on every strikeout ✅
**Impact: critical — every surface showing xSLG.**

`lib/reportMetrics.ts:38` is a bare `AVG(estimated_slg_using_speedangle)`. `AVG()` skips NULLs, and
that column is NULL whenever there is no batted ball — so xSLG is computed **per batted ball**, not
per at-bat. `avg_xba` one line above does it correctly with a filtered denominator.

Skubal 2024: **.478** displayed, **.323** true. League June 2024: **.537** vs **.409**.

### 8. Nothing filters `game_type`, so spring training is inside season totals ✅
**Impact: critical — every leaderboard, player page, and Explore result.**

952,344 spring-training rows sit in `pitches` and no metric query excludes them. Skubal 2024
displays **811 PA / 247 K / 203.7 IP** against a true regular-season **754 / 228 / 190.2**.

Worse, it is inconsistent: `pitcher_season_command` *does* filter to `'R'`, so a single leaderboard
row blends two different populations. `scene-stats:869` and `refresh_league_averages:527` are also
unfiltered — 2026 `league_averages` mixes in 638 spring rows.

### 9. MiLB movement is 7× too large ✅
**Impact: critical — every MiLB movement chart and IVB/HB number.**

The two tables use different units and shared code assumes MLB's:

| | avg abs `pfx_x` | avg `pfx_z` |
|---|---|---|
| MLB (feet) | 0.800 | 0.559 |
| MiLB (inches) | 5.071 | 4.082 |

Shared display code multiplies both by 12. MLB: 0.559 × 12 = 6.7" ✓. MiLB: 4.082 × 12 ≈ 49". The
dashboard plots AAA four-seamers at ~103" IVB against reference circles at 6/12/18/24".
`league_averages` stores a MiLB SP IVB benchmark of **47.86 inches** (MLB: 6.80).

The error **cancels inside the Stuff+ z-score**, so MiLB Stuff+ is unaffected — but every displayed
movement value is wrong.

### 10. The 2026 baselines froze mid-season ✅
**Impact: critical — every plus-stat, percentile and heatmap scale for the current season.**

`league_averages` 2026 last written **2026-06-26**; `league_percentiles` **2026-06-03**; data runs
through **2026-08-21**. **209,411 pitches — 29.7% of the season — postdate their own denominator.**

Stored 2026 σ runs **16–30% wider** than 2025, the signature of a half-sample, so every heatmap
scaled to `mean ± 3σ` is roughly 20% too wide. `checkLeagueAverages` passes on `COUNT(*) > 0`, so it
has been green throughout.

---

## Tier 2 — Wrong under reachable conditions, or stale

### 11. `pitcher_season_command` is frozen at mid-June 2026 ✅
2026 max pitches **741** vs 1,386 in the sibling deception table and 1,685 in a full 2025; 663
pitchers vs 765. Every Cmd+/Brink+/Cluster+/RPCom+ for 2026 is ~2 months stale, and the table feeds
`refresh_league_averages`. Mechanism: `/api/compute-triton` returns 500 when a 50-pitcher batch trips
the 8 s cap, and `cron/refresh:96` tests `r.error` — only set when `fetch` throws — so an HTTP 500
reads as success, with `computeResults` excluded from `cron_runs.counts` entirely.

### 12. 1.45M rows have every input and were never scored ✅

| Season | Eligible | Scored | % |
|---|---|---|---|
| 2015–2018 | ~712k each | ~350k each | **47.3 / 48.7 / 49.3 / 50.6** |
| 2019–2025 | ~708k each | all | 100.0 |
| 2026 | 568,040 | 556,357 | 97.9 |

The discontinuity is a backfill that ran out of wall clock, not missing data. **It collides with a
display bug:** `lib/pitcherStats.ts:290-292` substitutes a different quantity (`stuff_rv`) under the
"Stuff+" label below 50% coverage — and 2015–2018 straddle that line exactly, so the metric silently
changes identity by season and by filter.

2026's 11,683-row hole is live: `canceling statement due to statement timeout` on 4 of the last 15
nights, plus a run that never fired on 08-14. A timed-out day is never retried once it leaves the
3-day window.

### 13. `usage_pct`'s window partition doesn't match its GROUP BY
Skubal 2023 four-seam displays **10.2%**; true value **36.0%**.

### 14. Three incompatible "+" scales feed one converter
Stuff+ measures 1 SD = **6.099** points (over 704k rows); command plus-stats use **15**;
`plusToPercentile` assumes **10**. `PercentileTab` composes the 15 into the 10, inflating z by 1.5× —
a genuine +1 SD pitcher displays at the **93rd** percentile instead of the 84th.

### 15. Park factors: wrong key and wrong units
`PARK_FACTORS` is keyed `ARI`; every table uses **`AZ`**, so Arizona silently gets PF 100. And
`/api/park-adjusted:50` multiplies the **level** of xwOBA by `100/PF` instead of its deviation from
league average — a league-average .320 hitter at Coors displays as **.283**. One vintage ("2024
FanGraphs 5-yr") is applied across 2015–2026 with no season key.

### 16. The MiLB Ranks tab ranks AAA pitchers against MLB percentiles
`PercentileTab.tsx:47` omits `level`; `/api/league-percentiles` defaults to `'MLB'` — while MiLB 2026
breakpoints exist in the table. The Movement view is hardcoded `FROM pitches`. Combined with #9, this
pegs every AAA pitcher at the 99th percentile for movement.

### 17. `SplitsTab.tsx:46` divides hits by PA and labels it BA
21–33 points low, and it compresses Senga's true 27-point platoon split to 15.

### 18. Traded players show only their first stint
`mlbStats.find()` returns the first team row. Rich Hill 2023 renders **4.76 ERA, 7-10**; truth is
**5.41, 8-14** — displayed beside Statcast columns covering all 146.1 IP.

### 19. Trend alerts compare a window against a superset containing it
14-day window vs a season baseline that includes it. Measured attenuation on 1,740 rows: median
13.3%, mean 19.6%, p90 40.5%, **max 100%** — the alert cannot fire for a call-up.

### 20. Four incompatible innings-pitched definitions
The same pitcher-season reads **203.7** on the leaderboard (decimal) and **204.1** on the player page
(base-3); another pair reads 110.7 vs 111.33. `league_averages` weights double plays as **1 out**
(2.9% undercount) — and it sets every qualification floor.

### 21. Stuff+ scores rows outside its own baseline population
`COALESCE(...,0)` treats missing movement as league-average rather than skipping the row: 1,720 such
rows in 2026, and the resulting distribution averages **100.465**, not 100. `pitch_baselines` holds
an n=1 2026 row (all σ NULL) and an n=13 two-seamer whose σ of 0.4874 scores a 92-mph pitch at
z = −10.5.

### 22. Eight of nine hardcoded plus-stat tables stop at 2025
`lib/leagueStats.ts` silently substitutes the nearest year. The league-average 2026 pitcher scores
**Brink+ 88.96** on four-seamers — an error of −11.0. Centroid tables stop at 2025 too, so 2026 raw
cluster/hdev/vdev are off-vintage.

### 23. `league_averages` is a mean documented everywhere as a median
`docs/VARIABLES.md:302,442`, `CLAUDE.md:114` and `mcp-server/src/server.ts:93` all say 50th
percentile; the function uses `AVG()`. Measured gap on `fast_swing_rate`: **22.60 mean vs 17.53
median (+28.9%)**.

---

## Tier 3 — Infrastructure, efficiency, and silent failure

### 24. The `query_cache` table does not exist ✅
`to_regclass('public.query_cache')` returns **null**. `getCached` folds the `42P01` error into
`if (error || !data) return null` — indistinguishable from a cache miss — and every `setCache` has
`.catch(() => {})`. **The DB cache layer has never stored a byte**, and every "cached" heavy route
recomputes on every request.

**This masks a second bug.** `/api/trends:15` builds its cache key without `tab` and reads it before
dispatching, so Stuff/Arsenal would be served the Overview payload. Keys collide exactly today.
**Creating the table without fixing the key first activates the bug.**

### 25. The Explore leaderboard query is 2.4× over its own ceiling
Measured `EXPLAIN ANALYZE`: **18,905 ms** for 4 of 20 metrics over 22 days (82,831 rows, external
merge sort to disk). `app/api/report/route.ts:11` uses `run_query`, whose `proconfig` is NULL — so it
inherits `authenticator`'s 8 s cap. The full-season version never returned.

### 26. Failures render as empty results, not errors
- `lib/hooks/useExploreData.ts:230` does `data.rows || []` with no `res.ok` check;
  `explore/page.tsx:128` then prints `{rows.length} rows`. **A cancelled query is pixel-identical to
  an empty result.**
- `/api/leaderboard-triton:70-78` never reads `stuffRes.error`, so its Stuff+ scan fails and every
  `*_stuff_plus` column renders null at HTTP 200, beside correct `cmd_plus`.
- `/api/explore/query:169` truncates to 5,000 rows and returns `count: rows.length` — **the truncated
  length reported as the count**, with no `truncated` flag.
- Five Explore stat sets reference columns absent from `milb_pitches`; the SQL 500s and the page
  renders an empty table with no error.

### 27. Ingest counters do not mean what the pipeline thinks
`inserted` counts payload rows, not changed rows — 10,965 reported for 2026-08-16 against 4,443 rows
that exist for that date. That counter is what the whole downstream `skipDownstream` gate hangs off.
`errors` is returned and never read, so a 100%-rejection night records `success`. The
`csv.length < 100` guard is inert because an empty Savant response is 1,825 bytes.

### 28. The nightly cron runs at 88% of its ceiling
234–264 s against `maxDuration = 300`, median 248 s, every night. The 2026-08-14 run never
happened — no `cron_runs` row of any status — and nothing detects an absent run.

### 29. A second, unsanctioned Stuff+ writer exists
`scripts/stuff_model/backfill.py` (XGBoost) writes the same column through the SELECT-only
`run_query`, and swallows every exception while printing success.

### 30. Smaller confirmed defects
`pfx_x`/`pfx_z` documented as inches in `app/api/chat/route.ts:109` and
`app/api/data-export/route.ts:21` but stored in feet — a 12× error in any SQL those LLM surfaces
generate (`chat/route.ts:59` gets it right, so the file contradicts itself) · career IP renders the
literal string `NaN.NaN` when a Lahman season has null `ipouts` · `getCellColor` colours NULL as
below-average because `Number(null) === 0` clears the `isNaN` guard, and `RE24` returns red for every
value · report heatmaps invent empty bins from neighbours in two passes then quote `%{z:.3f}` ·
Whiff%/Chase% heatmaps print proportions under percent labels · `gb_pct` and `fb_pct` are both
flagged `higher_better = true` · hitter career Max EV is a mean because the `max` branch is dead code
· `intent_walk`/`truncated_pa` are mis-bucketed across BB%/OBP/BA/IP, and the JS and SQL disagree
with each other · `player_name` in the Explore group-by split 5 pitcher-seasons in 2026 ·
`milb_sos_scores` is empty, so `/milb/explore` joins the **MLB** `sos_scores` table.

---

# What is working

Worth protecting, and worth knowing the audit went looking and found these sound:

- **Ingest value fidelity is exact.** A live Savant CSV for 2026-08-10 and 08-18…21 replayed through
  the repo's own parser matched the database row-for-row: 3,001→3,001 and 16,033→16,033, identical
  non-null counts and identical min/max/mean on every physics column. No unit transformation at
  ingest.
- **~30 metrics verified correct**, including the entire plate-discipline and batted-ball family;
  their string matches are exhaustive against the actual vocabulary.
- `/api/report`'s pooled SQL rates, `HistoricalOverviewTab`'s career totals, and every
  `COUNT(DISTINCT …)` dedup are correct.
- **Split partition integrity holds**: vs-LHH + vs-RHH = overall exactly, in 2025.
- `app/api/league-baseline/route.ts` handles percent/proportion scaling and SP/RP role mapping
  correctly. `scaleanchor` is correct at all 15 chart sites. `leaderboardColumns.ts` null handling is
  the pattern `metricRegistry` should copy.
- Percentile arrays are strictly ascending and non-degenerate; the nearest-rank formula and
  `empiricalPercentile` are correct — the data feeding them is the problem, not the maths.
- The `_plus` exclusion from `league_averages` holds (0 rows in both tables). Qualification and SP/RP
  formulas match the canonical convention. `pitch_baselines` is complete. The cluster centroid is
  properly year-partitioned. MiLB Stuff+ genuinely uses a MiLB baseline.
- `parsePlayerDataRows` is all-or-nothing, so it never silently drops rows. `umpire`,
  `matchup-lookup`, `sequencing` and `team-tendencies` all check errors in their `Promise.all`
  fan-outs.
- The `LIMIT 50000` player-data cap is **not** binding — measured max career is 29,904 pitches, ~1.6×
  headroom.

---

# How to fix the ingest and processing

Ordered so that each step makes the next one measurable. Steps 1–3 are hours, not weeks.

**1 — Stop losing data (2 lines).** `'P|'` → `'PO|'`, and add `'R'` to the October/November game-type
list. This recovers the postseason going forward and stops October killing the derived-stat chain.
Backfill 2015–2025 postseason separately.

**2 — Unfreeze the baselines.** Re-run `refresh_league_averages` and `refresh_league_percentiles` for
2026, and **backfill `league_percentiles` for 2015–2025** — it has never been populated. Then delete
the SIERA `ln(IP)` term before re-running, so the rebuild doesn't re-store a negative estimator.

**3 — Make the derived chain fail loudly.** Three changes, each small: have `cron/refresh` read HTTP
status rather than `r.error`; add `computeResults` to `cron_runs.counts`; replace
`checkLeagueAverages`'s `COUNT(*) > 0` with a freshness assertion (`max(updated_at)` within N days of
`max(game_date)`). Today a 500, a timeout and a success are indistinguishable.

**4 — Fix the formulas.** SIERA's invented term, `avg_xslg`'s denominator, `usage_pct`'s window
partition, and a single canonical IP definition adopted by all four call sites.

**5 — Fix aggregation at the one place it lives.** Give `TotalsStrategy` a weight column per metric,
recompute ratios from components, render `—` plus a reason when the weight is absent, and delete
`HitterOverviewTab.calcTotals`. One change to `lib/metricRegistry.ts` fixes the career line, the
arsenal line, and the header-count mismatch together.

**6 — Filter `game_type` everywhere, consistently.** Either exclude spring training from every metric
query or expose it as a first-class filter. The current split — some paths filter, most don't — is
the worst of both.

**7 — Port the MiLB event normalizer**, then backfill `milb_pitches.events`. Fix the pfx unit
mismatch at the same time, and pass `level` through to `/api/league-percentiles`.

**8 — Then, and only then, create `query_cache`** — after fixing the `/api/trends` key, since the
missing table is currently the only thing suppressing that collision. Expect a large latency win:
nothing has ever been cached.

**Efficiency, separately:** the nightly cron sits at 88% of its 300 s ceiling every night, and the
Explore leaderboard query is 2.4× over the 8 s statement cap. Both need the work chunked or moved to
`run_query_long` (which carries a real 120 s function-level `proconfig`), not a larger client
timeout — `supabaseAdminLong`'s 120 s is a fetch timeout and does not extend the database limit.

---

**Method.** Eight specialists — three `jo` (ingest, derived scoring, query layer), four `li`
(formulas, baselines, aggregation, MiLB), one `cas` (display) — run in parallel with no access to
prior findings, `planning.md`, or any `applied/` playbook. Each ran its own production queries
read-only. Full per-slice reports with reproductions are in the audit scratch directory; findings
marked ✅ above were re-verified by the orchestrator.
