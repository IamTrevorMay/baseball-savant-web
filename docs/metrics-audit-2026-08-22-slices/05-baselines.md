# Slice 05 — Baselines & Normalization

**Verdict.** The yardsticks are broken in three independent ways, and each one is invisible on
screen. First, they are stale: `league_averages` for 2026 was last written **2026-06-26** and
`league_percentiles` on **2026-06-03**, while `pitches` runs through **2026-08-21** — 29.7% of the
season (209,411 pitches) postdates the denominator that normalizes it, and no integrity check, API
payload, or UI surface exposes `updated_at`. Second, they are incomplete: `league_percentiles`
holds rows for **2026 only**, so every percentile display for 2015–2025 falls through to a
hardcoded `50`, and eight of the nine hardcoded plus-stat baseline tables in `lib/leagueStats.ts`
stop at **2025**, so every 2026 command plus-stat is silently normalized against a 2025 population
(measured Brink+ error: **−4.0 to −11.0 points league-wide**). Third, they are semantically wrong
in places: `league_averages` is an `AVG()` that the glossary calls a "50th-percentile" (measured
gap up to **+28.9%** on `fast_swing_rate`); the platform ships **three mutually incompatible "+"
scales** (Stuff+ 1 SD = 6.10 points measured, command plus-stats 1 SD = 15 points, and
`plusToPercentile` assuming 1 SD = 10 points, composed together in `PercentileTab`); the park
adjustment divides the **level** of a rate stat rather than its deviation from league average, so a
league-average .320 xwOBA hitter at Coors is displayed as **.283**; and `PARK_FACTORS` is keyed
`ARI` while every table in the database uses **`AZ`**, so Arizona gets no park adjustment at all.
The sign on the park adjustment is correct; the units are not.

Grades used below: *verified* = read in code and/or measured by a query run this session;
*probable* = one leg supported, the other inferred; *suspected* = reasoned, not measured.

---

## F1. `league_percentiles` exists for 2026 only — every other season silently renders as the 50th percentile

- **Impact:** critical — every percentile bar on the player dashboard Percentile tab, the
  `PercentileRankings` chart, and the Visualize `PercentileRankings` template, for **11 of 12
  seasons** (2015–2025). Affects both MLB and MiLB surfaces.
- **Location:** table `public.league_percentiles`; consumers
  `components/dashboard/PercentileTab.tsx:179`,
  `components/charts/PercentileRankings.tsx:167`,
  `components/visualize/templates/PercentileRankings.tsx:133` — all three:
  `const pct = bp ? empiricalPercentile(v, bp.breakpoints, bp.higher_better) : 50`
- **What's wrong:** `refresh_league_percentiles(p_season)` has apparently only ever been run for the
  current season. When `/api/league-percentiles?season=2024` returns an empty array, every consumer
  substitutes the literal `50`. The screen shows a perfectly average player with no error, no empty
  state, and no distinction from a genuine 50th percentile.
- **Evidence:** query over `league_percentiles` grouped by season returned rows for **season 2026
  only** (6 groups: MLB/MiLB × hitter/SP/RP, 23–48 metrics each, all `updated_at`
  `2026-06-03 18:53:56Z`). `league_averages`, by contrast, has 2015–2026. The three consumer call
  sites were read directly.
- **Expected vs actual:** expected 12 seasons × 6 groups of breakpoints; actual 1 season × 6 groups.
  A 2024 leaderboard percentile that should read e.g. 88 renders as 50.
- **Fix:** backfill `refresh_league_percentiles(y)` for 2015–2025 (and 2023–2025 MiLB), then change
  the three call sites to render an explicit "no baseline" state instead of `50`. The `: 50`
  fallback is the part that makes this silent and should go regardless — that surface belongs to
  **Cas**; the backfill is mine.
- **Confidence:** verified

---

## F2. Both baseline tables are frozen mid-2026 season; 29.7% of the data they normalize postdates them, and nothing detects it

- **Impact:** critical — every heatmap color scale (`mean ± 3σ`), every "vs league average" readout,
  every percentile, and every plus-stat that reads `league_averages`, for the current season. Pages:
  Reports `TileHeatmap`, Imagine Heat Maps, Visualize `StrikeZoneHeatmapViz`, `RCHeatmapRenderer`,
  dashboard `LocationTab`, `PercentileTab`.
- **Location:** `league_averages` / `league_percentiles`; refresh gating at
  `app/api/cron/refresh/route.ts:99–126`; the check that fails to catch it at
  `lib/dataIntegrity.ts:336–393`.
- **What's wrong:** three compounding problems.
  1. **Stale.** `MAX(updated_at)` for `league_averages` season 2026 = `2026-06-26 19:48:04Z`;
     `league_percentiles` season 2026 = `2026-06-03 18:53:56Z`. `MAX(game_date)` in `pitches` =
     `2026-08-21`. That is **57 and 80 days** of drift respectively.
  2. **Silent by design.** The cron skips the refresh under two conditions —
     `skipDownstream` ("no new pitches") and `allComputeFailed` — and on either path it leaves the
     old rows in place with their old `updated_at`. `checkLeagueAverages` (`lib/dataIntegrity.ts:337`)
     asserts only `SELECT COUNT(*) … WHERE season = year` and returns **`status: 'pass'`** when
     `count > 0`. A 57-day-old table passes the nightly integrity check. `league_percentiles` has no
     integrity check at all.
  3. **Unobservable downstream.** `/api/league-baseline` selects `value, stddev, n_qualified` and
     `/api/league-percentiles` selects `metric, breakpoints, higher_better, n_qualified`. Neither
     returns `updated_at`, so no consumer can detect the staleness even if it wanted to.
- **Evidence:**
  - Freshness/inventory query (above dates).
  - `SELECT MAX(game_date), COUNT(*) FILTER (game_date > '2026-06-26') …` over 2026 `pitches`:
    max `2026-08-21`; **209,411 of 704,119** pitches (**29.7%**) postdate the `league_averages` write.
  - The frozen rows carry their own timestamp: 2026 MLB SP `leader_value` = **117.00 IP**,
    `qual_floor` = **23.40 IP**; 2026 MLB hitter `leader_value` = **374 AB**, `qual_floor` =
    **74.80 AB**. For comparison the 2025 rows carry `leader_value` 212.67 IP / 698 AB — a complete
    season. 117 IP is a late-June leader.
  - **Measured consequence — the σ is inflated.** Because each player's own sample is roughly half a
    season, the cross-player SD absorbs roughly double the sampling variance. 2026 (half-season)
    stored `stddev` vs 2025 (full-season) stored `stddev`, MLB:

    | metric | role | 2026 σ | 2025 σ | inflation |
    |---|---|---|---|---|
    | `avg_brink` | SP | 0.6048 | 0.4645 | **+30.2%** |
    | `fip` | SP | 1.0885 | 0.8832 | **+23.2%** |
    | `ba` | hitter | 0.0372 | 0.0302 | **+23.2%** |
    | `barrel_pct` | SP | 2.4284 | 2.0483 | **+18.6%** |
    | `avg_woba` | hitter | 0.0419 | 0.0361 | **+16.1%** |
    | `whiff_pct` | SP | 3.9100 | 3.9211 | −0.3% |

    Heatmap color scales are built as `mean ± 3σ` (`components/reports/ReportTile.tsx:46`,
    `components/reports/TileViz.tsx:103`, `components/dashboard/LocationTab.tsx:12`). A σ that is
    ~20% too wide desaturates every 2026 heatmap by ~20%.
- **Expected vs actual:** expected a denominator covering 2026-03-01 → 2026-08-21; actual a
  denominator covering 2026-03-01 → ~2026-06-26 with a qualification bar set at 23.40 IP instead of
  the ~34 IP a current leader implies.
- **Fix:** three parts, all mine to specify.
  1. Add a freshness assertion to `checkLeagueAverages`: fail (not pass) when
     `MAX(updated_at) < MAX(game_date in pitches) - interval '2 days'`, and add the identical check
     for `league_percentiles`.
  2. Return `updated_at` from `/api/league-baseline` and `/api/league-percentiles` so the surface
     can show a vintage (**Cas** owns the display).
  3. Stop silently skipping: when `allComputeFailed` or `skipDownstream` blocks the refresh, that
     needs to raise, not log. **Why** the refresh stopped on 2026-06-26 is a pipeline question →
     **Jo**.
- **Confidence:** verified (staleness, the gate, the missing assertion, the 29.7%); *probable* on
  the σ-inflation mechanism — the 2026-vs-2025 comparison is confounded by any real year-over-year
  change in true between-player spread, though a consistent +16–30% across five unrelated metrics is
  the half-sample signature, not a league change.

---

## F3. Eight of nine hardcoded plus-stat baseline tables stop at 2025 — every 2026 command plus-stat is silently normalized against 2025

- **Impact:** critical — Brink+, Cluster+, Cluster R/L+, HDev+, VDev+, Missfire+, Close%+, and the
  composites Command+ and RPCom+, for all of 2026. Surfaces: player dashboard command tab,
  `PercentileTab`, `pitcher_season_command` writes (`/api/compute-triton`), outing-level command
  (`lib/outingCommand.ts`), `lib/pitcherStats.ts`.
- **Location:** `lib/leagueStats.ts:10` (`BRINK_LEAGUE_BY_YEAR`), `:89`, `:168`, `:247`, `:326`,
  `:405`, `:484`, `:563`, plus `CENTROIDS_BY_YEAR:647`, `CENTROIDS_R_BY_YEAR:749`,
  `CENTROIDS_L_BY_YEAR:828`. The silent substitution is `getLeagueBaseline` at
  `lib/leagueStats.ts:1218–1246`.
- **What's wrong:** enumerating the year keys of every table in the file:

  | table | last year present |
  |---|---|
  | `BRINK_LEAGUE_BY_YEAR` | **2025** |
  | `CLUSTER_LEAGUE_BY_YEAR` | **2025** |
  | `CLUSTER_R_LEAGUE_BY_YEAR` | **2025** |
  | `CLUSTER_L_LEAGUE_BY_YEAR` | **2025** |
  | `HDEV_LEAGUE_BY_YEAR` | **2025** |
  | `VDEV_LEAGUE_BY_YEAR` | **2025** |
  | `MISSFIRE_LEAGUE_BY_YEAR` | **2025** |
  | `CLOSE_PCT_LEAGUE_BY_YEAR` | **2025** |
  | `CENTROIDS_BY_YEAR` / `_R` / `_L` | **2025** |
  | `STUFF_LEAGUE_BY_YEAR` | 2026 |
  | `BL_BY_YEAR` (Stuff+ z-baselines) | 2026 |

  `AVAILABLE_YEARS` at `lib/leagueStats.ts:1211` includes 2026, and `getLeagueBaseline` walks it
  looking for the **nearest year that has the pitch type** — so a 2026 call resolves to 2025 and
  returns a value rather than `undefined`. Every caller passes `year` correctly
  (`app/api/compute-triton/route.ts:127`, `lib/outingCommand.ts:124–147`,
  `lib/pitcherStats.ts:176`), so nobody is doing anything wrong; the table just has no 2026 row and
  the lookup declines to say so. The centroid tables are worse than the baseline tables: centroids
  feed the **raw** Cluster/HDev/VDev computation, not just its normalization, so the 2026 raw
  numbers are measured against 2025 pitch-location centers.
- **Evidence:** recomputed the true 2026 and 2025 baselines from `pitcher_season_command`
  (`pitches >= 50`, matching the comment at `lib/leagueStats.ts:1`) and compared against the
  hardcoded 2025 values actually in use for 2026. Brink+ = `((avg − mean)/sd) × 15 + 100`:

  | pitch | 2026 true mean | 2025 mean in use | 2025 sd in use | Brink+ for a **league-average 2026 pitcher** |
  |---|---|---|---|---|
  | 4-Seam Fastball | −1.409 | −0.71 | 0.95 | **88.96** (error −11.0) |
  | Slider | −2.992 | −2.38 | 1.35 | **93.20** (−6.8) |
  | Cutter | −1.380 | −0.96 | 1.12 | **94.37** (−5.6) |
  | Sinker | −0.622 | −0.28 | 0.97 | **94.71** (−5.3) |
  | Curveball | −3.904 | −3.41 | 1.75 | **95.77** (−4.2) |
  | Changeup | −3.844 | −3.45 | 1.49 | **96.03** (−4.0) |
  | Sweeper | −3.159 | −2.77 | 1.47 | **96.03** (−4.0) |

  Corroborated at a different grain by `league_averages.avg_brink` MLB SP: 2025 = **−1.5034**,
  2026 = **−2.0469** — the same directional shift.

  The hardcoded 2025 table is *also* a pre-close snapshot: recomputed 2025 4-Seam mean is **−0.837**
  vs the hardcoded **−0.71**, a **−2.0 Brink+** offset for 2025 as well.
- **Expected vs actual:** expected the average 2026 pitcher to score 100. Actual: **89–96**,
  depending on pitch type. The entire 2026 league reads as below-average command, worst on
  fastballs.
- **Fix:** two steps. (a) Generate the 2026 rows for all eight tables and the three centroid tables
  from `pitcher_season_command` / `pitches` and re-run `/api/compute-triton?year=2026`. (b) Make the
  silent substitution impossible: have `getLeagueBaseline` return
  `{ mean, stddev, baselineYear }` and have callers refuse to emit a plus-stat when
  `baselineYear !== year`, or at minimum stamp the vintage. A hardcoded table that must be
  hand-extended every January is the root cause; the durable fix is to source these from a
  `command_baselines` table refreshed by the same cron that writes `league_averages`.
  Whether the 2025→2026 brink shift is a real league change (ABS challenge system?) or a measurement
  change is **Soto**'s question, not mine — either way the normalization is wrong today.
- **Confidence:** verified

---

## F4. Three incompatible "+" scales, and two of them are composed together

- **Impact:** high — every command percentile on the player dashboard Percentile tab; and any
  screen that puts Stuff+ next to Command+/Brink+ and invites the reader to compare them.
- **Location:** `lib/leagueStats.ts:1320` (`computePlus`, ×15), `:1338` (`plusToPercentile`, ÷10),
  `:1344` (`valueToPercentile`, ×15 then ÷10); composition at
  `components/dashboard/PercentileTab.tsx:222–233`; Stuff+ weights at
  `app/api/update/route.ts:322–326`.
- **What's wrong:** the platform has three different "points per standard deviation" conventions and
  no name distinguishes them.

  | family | points per 1 SD | source |
  |---|---|---|
  | Command plus-stats (Brink+, Cluster+, HDev+, VDev+, Missfire+, Close%+) | **15** | `computePlus`: `z * 15 + 100` |
  | `plusToPercentile` | **10** | `const z = (plus - 100) / 10` |
  | Stuff+ | **6.10** (measured) | `100 + 4.5·z_velo + 3.5·z_move + 2.0·z_ext` |

  `PercentileTab.tsx:222` does `plusToPercentile(brinkPlus)` where `brinkPlus` came from
  `computePlus`. The z is inflated by **1.5×** end to end. `valueToPercentile` has the same defect
  internally. The unit tests encode both conventions without noticing they conflict:
  `__tests__/lib/leagueStats.test.ts:25` asserts `computePlus(92, 90, 2) === 115` (σ = 15) and
  `:73` asserts `plusToPercentile(110) === 84` (σ = 10).
- **Evidence:**
  - Code and tests read directly.
  - Stuff+ scale **measured**: over 2026 `pitches`, `AVG(stuff_plus) = 100.465`,
    `STDDEV_SAMP(stuff_plus) = 6.099`, range 23–132, **0 rows clamped**. The theoretical value for
    three independent z-components at weights 4.5/3.5/2.0 is `sqrt(4.5² + 3.5² + 2²) = 6.04` — the
    empirical 6.099 matches, confirming the components are near-uncorrelated in aggregate and the
    scale is 6.1, not 10 or 15.
  - Worked error: a pitcher exactly **+1 SD** in Brink gets `computePlus` → 115 → `plusToPercentile`
    → z = 1.5 → Φ(1.5) = 0.933 → displayed **93rd percentile**. The correct answer is the **84th**.
    At +2 SD: 130 → z = 3.0 → 99.87 → clamped to **99**, versus a true **98th**.
  - Cross-family: a **Stuff+ of 115 is +2.46 SD (≈99th percentile)**; a **Brink+ of 115 is +1.00 SD
    (84th percentile)**. Same number, same suffix, same visual treatment, 15 percentile points apart.
- **Expected vs actual:** expected 84; actual 93 at +1 SD.
- **Fix:** (a) Make `plusToPercentile` take the scale explicitly —
  `plusToPercentile(plus, sdPoints)` — and pass 15 from `PercentileTab` and 6.1 from any Stuff+ call
  site. (b) Better: delete `plusToPercentile` from the command path entirely and read the empirical
  breakpoints from `league_percentiles`, which `PercentileTab` already does for its other rows at
  `:179` — the normal-CDF approximation is only there because the empirical table didn't exist when
  it was written. (c) Record the scale in `docs/VARIABLES.md` per plus-stat family; today it is
  documented nowhere. Whether Stuff+ *should* be rescaled to 15 is **Soto**'s call, not mine — but
  until it is, the two families must not share a visual axis.
- **Confidence:** verified

---

## F5. The park adjustment divides the level of a rate stat instead of its deviation from average

- **Impact:** high — the entire `/park-adjusted` page (`app/(research)/park-adjusted/page.tsx`),
  both the pitching and hitting views, all seasons.
- **Location:** `app/api/park-adjusted/route.ts:49–52`.
- **What's wrong:**
  ```ts
  adj_xwoba: row.xwoba != null ? Math.round(row.xwoba * (100 / pf.basic) * 1000) / 1000 : null,
  ```
  `pf.basic` is a **runs** park factor. Runs scale with `(wOBA − lgwOBA)`, not with wOBA itself —
  wOBA carries a ~.320 zero-offset that no park inflates. Multiplying the whole level by
  `100/PF` therefore applies the park correction to the offset as well as to the signal, over-
  correcting by roughly the ratio `lgwOBA / (wOBA − lgwOBA)`. The **direction is correct** in both
  roles (a hitter at Coors is penalized, a pitcher at Coors is credited); the **units are not**.
- **Evidence:** code read plus arithmetic. `PARK_FACTORS.COL.basic = 100 + 13`
  (`lib/constants-data.ts:50`).
  - A league-average hitter, xwOBA **.320**, at Coors: `adj = .320 × (100/113) = .283`. League
    average is .320. The page shows a perfectly average hitter at roughly the **10th percentile**.
  - The same hitter in Seattle (PF 94): `adj = .320 × (100/94) = .340` — a star.
  - Contrast with the wRC+ path in `lib/sql.ts:57–61`, which puts the park factor in the
    denominator of a ratio that already includes `r_pa`, and is directionally and dimensionally
    much closer to right (though still multiplicative where FanGraphs is additive — for a .420 wOBA
    hitter at Coors, Triton's form gives ~148 and the FanGraphs form ~155, a ~6-point
    over-correction at the extremes; that one is *medium*, not high).
  - `adj_k_pct` / `adj_bb_pct` have the same level-vs-deviation error but `pf_so` and `pf_bb` span
    only 96–104, so the damage is ~±4% rather than ±13%.
- **Expected vs actual:** a league-average Coors hitter should adjust to roughly **.320 → .312**
  (removing the ~2–3% wOBA park effect that corresponds to a 13% run effect); actual **.283**.
- **Fix:** adjust the deviation, not the level:
  `adj = lgwOBA + (xwoba − lgwOBA) × (100 / pf.basic)`, taking `lgwOBA` from
  `SEASON_CONSTANTS[season].woba`. Same pattern for `adj_k_pct` / `adj_bb_pct` against
  `lg_k_pct` / `lg_bb_pct`, which are already in `SEASON_CONSTANTS`.
- **Confidence:** verified

---

## F6. `PARK_FACTORS` is keyed `ARI`; every table in the database uses `AZ` — Arizona gets no park adjustment

- **Impact:** high for Arizona players (silently unadjusted on `/park-adjusted`, in `scene-stats`
  wRC+, and in broadcast overlays); medium platform-wide for the single-vintage problem below.
- **Location:** `lib/constants-data.ts:44` (`ARI: { basic: 101, pf_hr: 91, pf_so: 99, pf_bb: 99 }`);
  consumers `app/api/park-adjusted/route.ts:44–45`, `app/api/scene-stats/route.ts:136`, `:398`,
  `:1098`, `:1671`.
- **What's wrong:** two things in one constant.
  1. **Dead key.** `PARK_FACTORS['AZ']` is `undefined`. `/api/park-adjusted:45` returns the row
     unadjusted with `park_factor: 100`; `scene-stats` does `PARK_FACTORS[row.team]?.basic || 100`.
     Both fail closed and silently. `ARI` never matches anything.
  2. **One vintage across twelve seasons.** The comment at `lib/constants-data.ts:26` reads
     *"Park factors by team (5-year rolling, 2024 FanGraphs) — Using these as the baseline — they
     don't change dramatically year-to-year."* The table has no season key. A 2024-vintage 5-year
     rolling factor is being applied to 2015 games — which predates the 2017 ball change, the 2019
     ball, the 2023 rules package, and the humidor rollouts. It is also applied to 2026 Sutter
     Health Park (the Athletics' temporary park), which no 2024 5-year rolling figure can describe;
     the `ATH` entry is a copy of `OAK`'s Coliseum values.
- **Evidence:**
  `SELECT string_agg(DISTINCT team, ',') FROM mv_pitcher_season_stats WHERE game_year = 2026` and
  the same over `mv_batter_season_stats` both return:
  `ATH,ATL,AZ,BAL,BOS,CHC,CIN,CLE,COL,CWS,DET,HOU,KC,LAA,LAD,MIA,MIL,MIN,NYM,NYY,PHI,PIT,SD,SEA,SF,STL,TB,TEX,TOR,WSH`
  — 30 codes, including **`AZ`** and **no `ARI`**.
- **Expected vs actual:** an Arizona hitter should be adjusted by `basic = 101` and, more
  materially, `pf_hr = 91` (a 9% HR suppression). Actual: `park_factor` renders as **100** and
  `adj_hr_pct = hr_pct`, unadjusted.
- **Fix:** rename the key `ARI` → `AZ` (or key both). Then add a `season` dimension: a
  `park_factors` table already exists in the DB (`app/api/populate-park-factors/route.ts:35` upserts
  on `(season, team)`), so the fix is to read from the table rather than the constant, and populate
  it per-season from FanGraphs rather than broadcasting one vintage across 11 seasons. The route
  that populates it currently writes the same constant to all seasons
  (`app/api/populate-park-factors/route.ts:19–40`, "31 teams x 11 seasons"), which reproduces the
  defect in the table — fix the constant before trusting the table.
- **Confidence:** verified

---

## F7. SIERA carries an invented `ln(IP)` term; the league baseline is negative and enshrines it

- **Impact:** high — `siera` appears in `league_averages`, in `league_percentiles`
  (`higher_better = false`), in `lib/metricRegistry.ts:386`, and on every pitcher stat line via
  `lib/pitcherStats.ts:224`.
- **Location:** `lib/expected-stats.ts:73–87` and the mirrored copy at
  `scripts/create-refresh-league-averages.sql:704–714` / `create-refresh-league-percentiles.sql:645–661`.
- **What's wrong:** the final term is `− 0.986 × Math.log(Math.max(s.ip, 1))`. The published
  Swartz/Seidman SIERA model has **no innings term**; the −0.986 coefficient in the literature
  belongs to a batted-ball interaction, not `ln(IP)`. As implemented, SIERA falls by ~0.99 runs for
  every e-fold increase in innings, so it is a workload metric wearing an ERA's clothes.
- **Evidence:** the stored league baselines are the proof — a league-average ERA estimator cannot be
  negative.

  | season | level | role | stored `siera` mean | empirical p50 |
  |---|---|---|---|---|
  | 2026 | MLB | SP | **−0.3208** | **−0.1254** |
  | 2026 | MLB | RP | **+0.5571** | **+0.8169** |

  Hand-evaluating the formula at league-average inputs (K/PA ≈ .22, BB/PA ≈ .08, net GB/PA ≈ .03,
  IP = 150) gives `3.698 − 0.986·ln(150) = 3.698 − 4.941 = −1.243`. The polynomial part is a
  perfectly sensible **3.70**; the `ln(IP)` term is the entire defect. It also explains the RP > SP
  ordering: `−0.986 × (ln 100 − ln 25) = −1.367`, larger than the observed 0.878 SP/RP gap.
- **Expected vs actual:** expected a 2026 MLB SP SIERA baseline near **4.2** (the stored `fip`
  baseline is 4.2986); actual **−0.3208**.
- **Fix:** delete the `ln(IP)` term from `lib/expected-stats.ts:86` and from both SQL functions, then
  re-run `refresh_league_averages` and `refresh_league_percentiles` for every season. Update
  `docs/VARIABLES.md` in the same commit. Until then, `siera` should not be displayed. Whether to
  replace it with the true Swartz coefficients or drop SIERA in favour of xFIP is **Soto**'s design
  call.
- **Confidence:** verified

---

## F8. `league_averages` is a mean; three documentation surfaces call it a 50th percentile

- **Impact:** high — it is the denominator for every heatmap midpoint and every "vs league" readout,
  and the AI analyst is told the wrong thing about it.
- **Location:** implementation `scripts/create-refresh-league-averages.sql:200–236` (`AVG(...)` with
  `STDDEV_SAMP(...)`), correctly self-documented at `scripts/create-league-averages.sql:36`
  (`COMMENT ON COLUMN league_averages.value IS 'Mean of the metric across qualified players.'`).
  Contradicted by `docs/VARIABLES.md:302` and `:442` ("50th-percentile"), `CLAUDE.md:114`, and
  `mcp-server/src/server.ts:93` ("`league_averages`: 50th-percentile benchmarks per
  season/level/role/metric").
- **What's wrong:** most baseball rate stats are right-skewed, so the mean sits materially above the
  median. Anyone reading the docs — including the analyst LLM, which reads
  `mcp-server/src/server.ts` — believes a player at the stored `value` is exactly average by rank.
  They are not.
- **Evidence:** joined `league_averages` to `league_percentiles` on
  `(season, level, role, metric)` for 2026 MLB and compared `value` to `breakpoints[50]`:

  | role | metric | stored mean | empirical p50 | gap |
  |---|---|---|---|---|
  | hitter | `fast_swing_rate` | 22.6011 | 17.5342 | **+28.9%** |
  | hitter | `blast_rate` | 15.5403 | 12.1212 | **+28.2%** |
  | SP | `avg_hbreak_in` | −1.5513 | −2.8723 | +46.0% |
  | hitter | `barrel_pct` | 8.4039 | 7.9365 | +5.9% |
  | RP | `bb_pct` | 9.6032 | 9.0226 | +6.4% |
  | RP | `fip` | 4.1150 | 3.9532 | +4.1% |

  (`deception_score` and `siera` show larger percentage gaps but their values straddle zero, so the
  percentage is not meaningful; the absolute gaps are 0.015 and 0.195.)
- **Expected vs actual:** a hitter with a 17.5% `fast_swing_rate` is exactly median; the platform
  tells him he is **5.1 points below league average**.
- **Fix:** the cheap correct fix is documentation — change `docs/VARIABLES.md:302`/`:442`,
  `CLAUDE.md:114`, and `mcp-server/src/server.ts:93` to say "mean" and point percentile consumers at
  `league_percentiles`. If a median is genuinely wanted for heatmap midpoints, add a
  `median` column to `league_averages` (`PERCENTILE_CONT(0.5)`) rather than redefining `value` —
  redefining it silently restates every stored comparison.
- **Confidence:** verified

---

## F9. `league_averages` and `league_percentiles` describe different player pools for the same key

- **Impact:** medium-high — any screen showing "value vs league average" alongside "percentile"
  compares one number against two different leagues.
- **Location:** both refresh functions compute the qualification floor from the *current* leader at
  run time (`create-refresh-league-averages.sql:190–196, 388–405`;
  `create-refresh-league-percentiles.sql:180–184, 520–522`), and the cron runs them sequentially
  (`app/api/cron/refresh/route.ts:108, 121`) — so they agree only when both succeed on the same
  night.
- **What's wrong:** the floor is `max(25, 0.20 × AB_leader)` / `max(5, 0.20 × IP_leader)` — it rises
  monotonically through the season. Two runs 23 days apart admit different populations.
- **Evidence:** for 2026 MLB, `league_averages.n_qualified` vs `league_percentiles.n_qualified` on
  the same `(season, level, role, metric)`:

  | role | `league_averages` n | `league_percentiles` n | run dates |
  |---|---|---|---|
  | RP | **313** | **346** | 2026-06-26 vs 2026-06-03 |
  | SP | **214** | **212** | same |
  | hitter | **447** | **445** | same |

  The RP pool differs by **33 pitchers (10.5%)** because the RP floor moved between 2026-06-03 and
  2026-06-26. SP/hitter differ by 2 each.
- **Expected vs actual:** expected identical `n_qualified` for full-coverage metrics; actual 313 vs
  346 for RP.
- **Fix:** compute the floor once and pass it in — change both functions to accept an optional
  `p_floor` set, or add a single `refresh_league_baselines(p_season)` that computes the qualified
  pool once and writes both tables in one transaction. That also fixes the case where one refresh
  succeeds and the other fails.
- **Confidence:** verified

---

## F10. `n_qualified` means two different things in the two tables, and in `league_averages` it overstates the real denominator

- **Impact:** medium — every place `n_qualified` is used to justify trusting a baseline, including
  the `n`-weighted SP/RP pooling in `/api/league-baseline:80`.
- **Location:** `create-refresh-league-averages.sql:241` (`a.n` = `COUNT(*)` over the *qualified
  pool*, written identically to every metric row) vs `create-refresh-league-percentiles.sql:232`
  (`COUNT(*)` over the *non-null values of that metric*).
- **What's wrong:** `AVG()` silently skips NULLs, so for a partially-covered metric the stored
  `value` is a mean over a subset while `n_qualified` reports the full pool. The percentile table
  gets this right; the averages table does not; they share a column name.
- **Evidence:** 2026 MLB RP — every `league_averages` row reports `n_qualified = 313`. The matching
  `league_percentiles` rows report the true per-metric count: full-coverage metrics 346,
  `avg_arm_angle` 325, `waste_pct` 324, **`deception_score` and `unique_score` 273**. Scaling the
  79% coverage to the averages pool, `league_averages.avg_deception_score` for 2026 MLB RP averages
  roughly **247** pitchers while reporting **313** — a **~27% overstatement** of its own denominator.
- **Expected vs actual:** expected `n_qualified` = the count that entered the average; actual = the
  count that entered the *pool*.
- **Fix:** change `create-refresh-league-averages.sql` to emit
  `COUNT(m.val)` per metric instead of the pool-wide `a.n` — the `CROSS JOIN LATERAL (VALUES …)`
  shape makes this a small change. Document both columns in `docs/VARIABLES.md`.
- **Confidence:** verified

---

## F11. Stuff+ scores a superset of its own baseline population and imputes the missing component to league average

- **Impact:** medium — `stuff_plus` on `pitches`, everywhere it is shown.
- **Location:** baseline build `app/api/update/route.ts:250–276`; scorer
  `app/api/update/route.ts:308–333`.
- **What's wrong:** the baseline `SELECT` requires
  `release_speed IS NOT NULL AND pfx_x IS NOT NULL AND pfx_z IS NOT NULL AND release_extension IS NOT NULL`.
  The scoring `UPDATE` requires only `p.release_speed IS NOT NULL` and wraps each z in
  `COALESCE(…, 0)`. A pitch missing extension is therefore scored as if its extension were exactly
  league-average rather than being left NULL. Population(scored) ⊋ population(baseline), and the
  imputation is invisible.
- **Evidence:** over 2026 `pitches`: 704,119 rows, **689,512 scored** (97.9%); of those,
  **1,718 have `release_extension IS NULL`** and **2 have NULL `pfx`** — all credited with a
  league-average z on the missing component. `AVG(stuff_plus) = 100.465`, i.e. the column does not
  center on 100 as its definition claims. `MIN = 23`, `MAX = 132`, **0 rows clamped** at 0 or 200 —
  so the clamp is not the cause and is not currently binding.
- **Expected vs actual:** expected `AVG(stuff_plus) ≈ 100` over the season the baselines were built
  from; actual **100.465**. Expected 0 rows scored outside the baseline population; actual **1,720**.
- **Fix:** add `AND p.release_extension IS NOT NULL AND p.pfx_x IS NOT NULL AND p.pfx_z IS NOT NULL`
  to the scoring `UPDATE`'s `WHERE`, and drop the `COALESCE` wrappers so a missing component
  produces NULL rather than a fabricated average. Then decide explicitly whether 1,718 rows should
  be scored at all — that is a definition question, and the answer belongs in `docs/VARIABLES.md`,
  which today contains **zero** mentions of `stuff_plus` or `pitch_baselines`.
- **Confidence:** verified

---

## F12. `pitch_baselines` has no minimum sample floor; the 2026 table contains an n=1 row and an n=13 row

- **Impact:** medium — Stuff+ for rare pitch types in every season; catastrophic within those
  buckets.
- **Location:** `app/api/update/route.ts:250–276` (no `HAVING COUNT(*) >= k`); guard in the scorer at
  `:322–326` (`NULLIF(std, 0)` + `COALESCE(…, 0)`); integrity check at `lib/dataIntegrity.ts:395–425`.
- **What's wrong:** the baseline `GROUP BY pitch_name, game_year` emits a row for any pitch name with
  at least one qualifying pitch. `STDDEV()` on n=1 is NULL, so `NULLIF`/`COALESCE` collapse all three
  z-terms to 0 and every such pitch scores exactly **100**. At n=13 the σ is real but meaningless,
  and the z explodes.
- **Evidence:** `pitch_baselines` holds 206 rows across 2015–2026. 2026 rows below 500 pitches:

  | pitch_name | pitch_count | avg_velo | std_velo |
  |---|---|---|---|
  | `Unknown` | **1** | 55.90 | **NULL** |
  | `2-Seam Fastball` | **13** | 97.14 | **0.4874** |
  | `Screwball` | 23 | 85.87 | 2.6417 |
  | `Pitch Out` | 34 | 91.33 | 3.0255 |
  | `Slow Curve` | 131 | 69.34 | 5.8968 |
  | `Knuckleball` | 268 | 78.11 | 8.2637 |
  | `Forkball` | 308 | 83.95 | 2.0977 |

  A 92-mph two-seamer in 2026 scores `z_velo = (92 − 97.139) / 0.4874 = −10.54`, contributing
  **−47.4 points** before the other terms. 2025 has the same shape (`Unknown` n=4 with
  `std_velo = 8.4621`, `Screwball` n=14). Across all years, 12 of 206 baseline rows sit under 500
  pitches and 3 have a degenerate σ. `Pitch Out` gets a Stuff+ at all, which is a definitional
  choice nobody made — the *scorer* does not exclude `PO`/`IN`, although the SP/RP rule and
  `/api/compute-triton` both do.
- **Expected vs actual:** expected no baseline row below a stated floor; actual a floor of 1.
  `lib/dataIntegrity.ts:399` warns only at `pitch_count < 5 OR std_velo = 0`, so the n=13 two-seamer
  passes and the n=1 `Unknown` warns but is never remediated.
- **Fix:** add `HAVING COUNT(*) >= 200` to the baseline `INSERT` (200 gives σ within ~5% at 95%
  confidence for a normal), and add `AND p.pitch_name NOT IN ('Pitch Out','Unknown','Other')` to the
  scorer so those pitches are left NULL rather than assigned a meaningless 100. Raise the integrity
  threshold from 5 to the same floor.
- **Confidence:** verified

---

## F13. The client Stuff+ fallback and the DB scorer use different baselines and different pitch populations; the client reads +0.9 to +2.6 points high

- **Impact:** medium — the 2.1% of 2026 pitches (14,607) that are not yet scored, which is
  disproportionately the most recently ingested and therefore the most-viewed.
- **Location:** frozen constants `lib/leagueStats.ts:1006` (`BL_BY_YEAR`), fallback
  `lib/leagueStats.ts:1176` (`computeStuffRV`); DB path `app/api/update/route.ts:250, 308`.
- **What's wrong:** `computeStuffRV` reproduces the DB formula exactly but against a hand-frozen
  copy of `pitch_baselines` that was snapshotted early in the 2026 season. It also covers only 10
  pitch names; `pitch_baselines` 2026 has **19**, so pitches of the other 9 names return `null` from
  the fallback and a number from the DB.
- **Evidence:** hardcoded `BL_BY_YEAR[2026]` vs live `pitch_baselines` for `game_year = 2026`, and
  the resulting Stuff+ for a pitch sitting exactly at the *live* league mean (which should score
  exactly 100):

  | pitch | TS `avg_velo` | DB `avg_velo` | TS `avg_move` | DB `avg_move` | client Stuff+ for a DB-average pitch |
  |---|---|---|---|---|---|
  | Split-Finger | 85.33 | 86.48 | 11.61 | 12.17 | **102.61** |
  | 4-Seam Fastball | 94.20 | 94.67 | 17.55 | 17.87 | **101.66** |
  | Knuckle Curve | 82.98 | 82.69 | 10.92 | 12.52 | **101.50** |
  | Curveball | 79.95 | 80.10 | 13.64 | 14.49 | **101.09** |
  | Slider | 85.32 | 86.05 | 6.92 | 6.42 | **100.93** |

  The bias is **always positive** (the frozen means are early-season and therefore low), so a fresh
  outing renders systematically hotter than the same outing after the nightly scorer runs, with
  nothing on screen marking the transition. Separately, the client `std_velo` for Slider is 3.17 vs
  the live 3.55, so the client path spreads slider Stuff+ **12% wider** than the DB path.
  Coverage measured: 689,512 of 704,119 2026 pitches scored → **14,607 unscored** rows eligible for
  the fallback.
- **Expected vs actual:** expected 100.00 for a league-average pitch on either path; actual 100.00
  (DB) vs **100.9–102.6** (client).
- **Fix:** delete `BL_BY_YEAR` and serve `pitch_baselines` from a cached endpoint
  (206 rows total — trivially cacheable), so both paths read one table. Failing that, stamp the
  fallback values so the surface can mark them provisional (**Cas** owns the marking).
- **Confidence:** verified

---

## F14. `avg_hbreak_in` pools right- and left-handed pitchers into one baseline, so its percentile measures handedness

- **Impact:** medium — `avg_hbreak_in` in `league_averages` and `league_percentiles` for SP and RP,
  every season, both levels.
- **Location:** `create-refresh-league-averages.sql:334` (`AVG(pfx_x * 12) AS avg_hbreak_in`, no
  `p_throws` split); direction flag `create-refresh-league-percentiles.sql:391`
  (`('avg_hbreak_in', q.avg_hbreak_in, true)`).
- **What's wrong:** `pfx_x` is signed and its sign flips with handedness. Pooling RHP and LHP
  produces a bimodal distribution; the mean falls in the empty valley between the modes and the σ is
  dominated by the handedness split rather than by pitcher skill. `higher_better = true` then asserts
  that arm-side run is *bad* for a left-hander.
- **Evidence:** 2026 MLB SP — stored mean **−1.5513**, empirical p50 **−2.8723**. A unimodal
  distribution does not put its mean 1.32 units above its median with this shape; the gap is the
  signature of two modes with unequal population (more RHP than LHP). RP shows the same:
  mean −1.5038 vs p50 −2.2273.
- **Expected vs actual:** expected a baseline that separates `p_throws`; actual one pooled row whose
  percentile ladder ranks lefties by handedness.
- **Fix:** either store `AVG(ABS(pfx_x * 12))` (magnitude, handedness-neutral, and consistent with
  how `pitch_baselines` already handles total movement as `SQRT(pfx_x² + pfx_z²)`), or add `p_throws`
  to the `league_averages`/`league_percentiles` key for this metric. `avg_ivb_in` is unaffected —
  `pfx_z` does not flip with handedness.
- **Confidence:** verified

---

## F15. `higher_better` direction flags are internally contradictory

- **Impact:** medium — every percentile that inverts on a wrong flag is displayed exactly backwards,
  on the Percentile tab and both `PercentileRankings` components.
- **Location:** `create-refresh-league-percentiles.sql:214–215` (hitters) and `:407–408` (pitchers).
- **What's wrong:** `gb_pct` and `fb_pct` are both flagged `true` — for hitters *and* for pitchers.
  A single batted ball is either a grounder or a fly ball; the two rates are near-complementary, so
  they cannot both improve together in either role. For hitters, `avg_la` is also `true`, which
  directly contradicts `gb_pct = true` (higher launch angle means fewer ground balls). Two more are
  claims with no basis: `avg_attack_direction` (`:196`, `true`) is a *signed* angle where neither
  extreme is better, and `avg_arm_angle` (`:390`, `true`) asserts that a higher arm slot is better.
  `empiricalPercentile` (`lib/leagueStats.ts:1287`) applies these flags with `100 - rawPct`, so a
  wrong flag is a full inversion, not a small error.
- **Evidence:** the two `VALUES` lists read directly; the arithmetic of complementary batted-ball
  rates does the rest. Downstream inversion confirmed at `lib/leagueStats.ts:1300`.
- **Expected vs actual:** for a pitcher at the 80th percentile in `gb_pct`, `fb_pct` should land near
  the 20th; today both display near the 80th.
- **Fix:** set `fb_pct` to `false` for pitchers and hitters (or drop it and keep only `gb_pct`); set
  `avg_la` and `gb_pct` to a consistent pair for hitters; set `avg_attack_direction` and
  `avg_arm_angle` to a new third state — the `higher_better boolean` column cannot express
  "neither," so these should be excluded from the percentile table entirely rather than assigned an
  arbitrary direction. Whether a higher arm angle *is* better is **Soto**'s question; my position is
  that a metric with no monotone direction must not carry a percentile.
- **Confidence:** verified

---

## F16. `max_velo` and `max_ev` are baselined and percentiled with no sample-size control

- **Impact:** medium — `max_velo` (SP/RP) and `max_ev` (hitter) in both baseline tables, all seasons,
  both levels.
- **Location:** `create-refresh-league-averages.sql:129, 330`;
  `create-refresh-league-percentiles.sql:190, 387`.
- **What's wrong:** the maximum of a sample is an extreme order statistic whose expectation grows
  monotonically with `n`. Two pitchers with identical velocity distributions but 3,000 vs 500
  pitches will show materially different `max_velo`. The qualification floor sets a *minimum* n, not
  a common n, and 2026's floor is 23.40 IP against a 117.00 IP leader — a **5:1 spread** in exposure
  inside one pool. The percentile ladder therefore ranks workload as much as arm speed.
- **Evidence:** 2026 MLB SP `max_velo` breakpoints span p1 = 93.100 to p99 = 101.300 across 212
  qualified pitchers, with the pool's IP ranging from 23.4 to 117.0. The stored `qual_floor` and
  `leader_value` columns document the exposure spread directly.
- **Expected vs actual:** a percentile that reflects arm speed; actual one confounded with innings.
- **Fix:** replace `MAX(release_speed)` with a high quantile that is n-stable —
  `PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY release_speed)` is the standard substitute and is
  what most public "top velo" figures actually report. Same for `max_ev` → 95th-percentile exit
  velocity, which is also what Statcast's own "max EV" leaderboards regress toward. Document the
  change in `docs/VARIABLES.md`.
- **Confidence:** verified (mechanism established; the *magnitude* of the confound on Triton's pool
  was not measured this session)

---

## F17. The IP used for qualification undercounts double and triple plays, and NULL `pitch_type` rows drop out of role classification

- **Impact:** low-medium — shifts the qualification floor and the SP/RP split slightly; affects who
  is in every baseline pool.
- **Location:** `create-refresh-league-averages.sql:323–327` (and the identical block at `:505–509`,
  `:656–660`; mirrored in `create-refresh-league-percentiles.sql`); role filter at `:313`, `:495`,
  `:646`.
- **What's wrong:** two small things.
  1. `_ip` counts **one out per out-event**, so `double_play` and `sac_fly_double_play` (2 outs) and
     `triple_play` (3 outs) are each credited with 1. A groundball pitcher's IP — and therefore his
     qualification and the leader-proportional floor derived from it — is systematically understated.
  2. `WHERE pitcher IS NOT NULL AND pitch_type NOT IN ('PO','IN')` — SQL `NOT IN` returns NULL for a
     NULL `pitch_type`, which is not TRUE, so those rows are **excluded** from the per-game pitch
     count that decides SP vs RP. A start with unclassified pitches can fall under the 50-pitch
     threshold.
- **Evidence:** SQL read directly; `NOT IN` NULL semantics are standard Postgres. This also means
  the platform now carries **three** IP definitions — this one, `lib/pitcherStats.ts`'s, and the MLB
  Stats API's in `player_season_stats` — which is a governance problem in its own right.
- **Expected vs actual:** expected `outs = 1×(single-out events) + 2×(DP) + 3×(TP)`; actual
  `outs = 1×(all)`.
- **Fix:** weight the `COUNT(*) FILTER` into a `SUM(CASE …)` with 2 for the DP events and 3 for
  `triple_play`; change the role filter to
  `(pitch_type IS NULL OR pitch_type NOT IN ('PO','IN'))`. Pick one canonical IP definition and put
  it in `docs/VARIABLES.md`.
- **Confidence:** verified

---

## F18. `/api/league-baseline` averages the SP and RP σ instead of pooling them

- **Impact:** low — heatmap color-scale width when `role=pitching` is requested.
- **Location:** `app/api/league-baseline/route.ts:76–90`.
- **What's wrong:** the route computes `sSum += s * n; stddev = sSum / totalW` — an n-weighted
  average of the two group SDs. A pooled SD must also carry the between-group term
  `Σ nᵢ(mᵢ − m)²`. The mean it produces is correct; the σ is understated whenever the SP and RP
  means differ.
- **Evidence:** computed from the stored 2026 MLB rows.
  - `whiff_pct`: SP (214, 22.5669, 3.9100), RP (313, 24.7509, 5.4382). Route σ = **4.8177**; true
    pooled σ = **4.9885**. Understated **3.4%**.
  - `avg_velo`: SP (214, 89.3637, 2.2807), RP (313, 89.9429, 2.8113). Route σ = **2.5959**; true
    pooled σ = **2.6221**. Understated **1.0%**.
- **Expected vs actual:** 4.9885 vs 4.8177.
- **Fix:** `stddev = sqrt( (Σ(nᵢ−1)sᵢ² + Σnᵢ(mᵢ−m)²) / (N−1) )`. The larger question is whether a
  "pitching" heatmap should pool SP and RP at all — the player being displayed is one or the other,
  and `refresh_league_averages` already classifies him. Passing the resolved role would be better
  than pooling.
- **Confidence:** verified

---

## F19. MiLB baselines pool every level into one population

- **Impact:** low today (MiLB surfaces are secondary), high the moment a MiLB Stuff+ or percentile is
  put on the same axis as an MLB one.
- **Location:** `milb_pitch_baselines` (keyed `(pitch_name, game_year)` only — see the `INSERT`
  column list at `app/api/update/milb/route.ts:469`); `league_averages` / `league_percentiles`
  `level` domain is `CHECK (level IN ('MLB','MiLB'))` (`scripts/create-league-averages.sql:18`).
- **What's wrong:** there is no level dimension below "MiLB." A Low-A pitcher and a Triple-A pitcher
  share one baseline, one qualification pool, and one percentile ladder.
- **Evidence:** `milb_pitch_baselines` holds exactly **16 rows per year** for 2023–2026 — one per
  pitch name, no level partition. `league_percentiles` 2026 MiLB has 212 qualified SP and 394
  qualified RP in a single pool spanning all affiliated levels.
- **Fix:** add `level` to the key of `milb_pitch_baselines` and to the `level` domain of both
  baseline tables (`'A' | 'A+' | 'AA' | 'AAA'` rather than one `'MiLB'`), gated on `milb_pitches`
  actually carrying a level column. Until then, MiLB and MLB values must not share an axis — that
  display rule is **Cas**'s to enforce.
- **Confidence:** verified (structure); *suspected* on magnitude — I did not measure the between-level
  spread this session.

---

## F20. Documentation defects in the baseline layer

- **Impact:** low individually, compounding — every one of these makes a correct query return the
  wrong thing or no thing, with no error.
- **Locations and facts, each verified this session:**
  1. **Casing trap.** DDL is `CHECK (level IN ('MLB','MiLB'))` and `CHECK (role IN ('hitter','SP','RP'))`
     (`scripts/create-league-averages.sql:18–19`, `create-league-percentiles.sql:12–13`).
     `docs/VARIABLES.md:309–310` documents `level` as `mlb | milb` and `role` as `sp | rp | hitter`.
     A query written from the glossary returns **zero rows with no error**.
  2. **Wrong cron named.** `docs/VARIABLES.md:314` says `refresh_league_averages` is "called from
     `/api/cron/pitches`." It is called from `/api/cron/refresh` (`app/api/cron/refresh/route.ts:108`);
     `/api/cron/pitches` only comments about it (`app/api/cron/pitches/route.ts:14`). `CLAUDE.md:113`
     repeats the wrong attribution.
  3. **Superseded rule still documented.** `scripts/create-league-averages.sql:9` states
     "SP/RP classification: first-inning game share > 0.5 -> SP else RP." The function that populates
     the table implements the ≥3-games-with-50+-pitches rule
     (`create-refresh-league-averages.sql:318`). The DDL comment describes a rule nothing implements.
  4. **Absent from the canonical glossary.** `grep -c` on `docs/VARIABLES.md`: `stuff_plus` → **0**,
     `pitch_baselines` → **0**, `league_percentiles` → **0**. Three load-bearing baseline objects,
     zero glossary entries, in a repo whose stated top convention is that metric and schema changes
     update `docs/VARIABLES.md` in the same commit.
  5. **Metric-set asymmetry.** `league_percentiles` carries `avg_ev` for SP and RP;
     `league_averages` does not (verified by an anti-join: `RP:avg_ev, SP:avg_ev` are the only two
     keys present in one table and not the other for 2026 MLB). A pitcher's exit-velocity-allowed has
     a percentile but no mean/σ, so the heatmap path returns `null` while the percentile path works.
- **Fix:** one commit — correct §7, add a §7b for `league_percentiles` and a §for `pitch_baselines`,
  add `stuff_plus`, fix the casing and the cron attribution, delete the stale DDL comment, and add
  `avg_ev` to the pitcher block of `refresh_league_averages`. Then make it stick with a Vitest drift
  test that asserts the glossary's metric keys match `metricRegistry` and the two refresh functions
  (**Cas** owns the test).
- **Confidence:** verified

---

## Baselines I checked and found sound

- **`_plus` exclusion holds.** `SELECT COUNT(*) … WHERE metric LIKE '%\_plus'` returns **0** for both
  `league_averages` and `league_percentiles`. The convention is enforced in practice, not just
  documented.
- **Percentile breakpoint arrays are well formed.** All 2026 rows are strictly ascending
  (`breakpoints[99] > breakpoints[1]` everywhere) and non-degenerate; the worst tie-density is
  `max_velo` at 63 distinct values across 99 breakpoints, which is expected for a 0.1-mph-granular
  measurement, not a defect.
- **The nearest-rank percentile formula is correct.**
  `vals[GREATEST(1, LEAST(n, ceil(p * n / 100.0)))]` is a legitimate nearest-rank definition and the
  clamp handles the p1/p99 edges properly.
- **`empiricalPercentile` is correct.** The binary search counts breakpoints `<= value`, clamps to
  [1,99], and inverts as `100 - rawPct` for lower-is-better — symmetric about 50 and correct at both
  edges (`lib/leagueStats.ts:1287–1299`).
- **Qualification formulas match the stated convention.** Hitter
  `GREATEST(25.0, 0.20 * AB_leader)` and SP/RP `GREATEST(5.0, 0.20 * IP_leader_for_role)` are
  implemented exactly as `CLAUDE.md` documents, computed per role, in both refresh functions.
- **The SP/RP rule in the function matches the canonical rule.** `≥3 games with 50+ pitches excluding
  `PO`/`IN`` at `create-refresh-league-averages.sql:318` and `create-refresh-league-percentiles.sql`
  matches `app/api/scene-stats/route.ts`. (Only the DDL *comment* is stale — F20.3 — and the NULL
  `pitch_type` edge in F17.)
- **Historical `league_averages` rows are full-season.** 2015–2025 carry complete-season
  `leader_value`s (2025: 698 AB, 212.67 SP IP), so the staleness in F2 is confined to season 2026.
- **The Stuff+ clamp is not binding.** 2026 `stuff_plus` ranges 23–132 with **0 rows** at 0 or 200.
  The `GREATEST(0, LEAST(200, …))` is dead code today, not a truncation source.
- **`getLeagueBaseline`'s no-year pooling branch pools variance, not σ.**
  `Math.sqrt(sum_var / count)` at `lib/leagueStats.ts:1245` is the correct way to combine SDs — the
  one place in the codebase that gets this right, and the code even says why. (F18's route does not.)
- **The MiLB `events` normalization is present in both refresh functions.** The Title-Case →
  lowercase `CASE` runs in every block of both functions, and passes MLB rows through unchanged via
  `ELSE events`, so the MLB path is unaffected. (Whether the map's category collapse — `Groundout`,
  `Flyout`, `Lineout`, `Pop Out` all → `field_out` — is the right semantics for MiLB batted-ball
  rates is a separate question and belongs to **Jo**/**Soto**.)
- **The wRC+ park-factor direction is correct.** `lib/sql.ts:58` puts `parkFactor/100` in the
  denominator, so a hitter-friendly park lowers wRC+. The sign is right; only the multiplicative-vs-
  additive form is approximate (~6 points at the extremes, noted under F5).
- **`league_averages` is genuinely idempotent.** `DELETE FROM league_averages WHERE season = p_season`
  then re-`INSERT` (`create-refresh-league-averages.sql:49`); same for percentiles at `:37`. Re-running
  is safe. The cost is that `updated_at` is a stamp with no history — which is what makes F2
  undetectable after the fact.

---

## What I could not determine

- **The exact magnitude of the staleness error on the stored means.** Two attempts to recompute a
  `league_averages` cell directly from `pitches` for 2026 timed out at the MCP layer (a full-season
  two-pass aggregation over ~704k rows exceeds the tool's limit). The F2 staleness is therefore
  established from `leader_value` / `qual_floor` / `updated_at` and from the σ comparison against
  2025, not from a direct side-by-side recomputation of `value`. Running
  `SELECT refresh_league_averages(2026)` and diffing before/after would settle it in one step, but
  that is a write and outside this audit's remit. **Recommend Jo or Trevor run it.**
- **Why the refresh stopped on 2026-06-26.** The gate is at `app/api/cron/refresh/route.ts:99–126`
  (`skipDownstream` or `allComputeFailed`), and `league_percentiles` stopped 23 days earlier than
  `league_averages`, which suggests two separate failures rather than one. Diagnosing the cron is
  **Jo**'s lane; I established only that it stopped, that nothing detected it, and what it costs.
- **Whether the 2025→2026 brink shift is a real league change or a measurement change.** The shift is
  0.26–0.74 SD across every pitch type in the same direction, which is large for one season. 2026
  introduced an `abs` cron, and brink is computed from location relative to the strike-zone edge, so
  a change in `sz_top`/`sz_bot` or in pitcher behaviour under ABS are both live hypotheses. Either
  way F3's normalization defect stands. The causal question is **Soto**'s.
- **The between-level spread inside MiLB.** F19's structure is verified; I did not measure how far
  apart Low-A and Triple-A actually sit, so I cannot size the pooling error.
- **`max_velo` / `max_ev` confound magnitude.** The mechanism (F16) is established from first
  principles and the exposure spread is documented in the stored `qual_floor`/`leader_value`, but I
  did not regress `max_velo` on pitch count to quantify the slope.
- **Whether `league_percentiles` was ever populated for 2015–2025 and later deleted.** The refresh is
  `DELETE … WHERE season = p_season` then re-`INSERT`, and the table has no history, so a past
  population is unrecoverable. The absence is a fact; the reason is not.

---

## The single highest-leverage next action

Backfill `refresh_league_percentiles(y)` for 2015–2025 and re-run both refresh functions for 2026 in
the same session — one command each, no schema change — then add the freshness assertion to
`checkLeagueAverages` so this cannot recur silently. That closes F1 and F2, which between them
account for every percentile on the platform for 11 seasons and every current-season heatmap scale.
F3 (the 2026 command baselines) is the next one and needs a data generation step, not a re-run.
