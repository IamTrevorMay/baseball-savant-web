# VARIABLES — Stats Query Glossary

Canonical reference for every metric variable, filter parameter, and source column used in stats queries across Triton. Use these exact labels (the **key** column) when writing models, prompts, or new queries — they're the same strings the API and Scene Composer pass around internally.

**Canonical sources:**
- `lib/reportMetrics.ts` — `METRICS`, `SCENE_METRICS`, `GAME_METRICS`, `TRITON_PLUS_METRIC_KEYS`, `DECEPTION_METRIC_KEYS`, `ERA_METRIC_KEYS`, `COMPUTED_METRIC_KEYS`
- `lib/sql.ts` — `TRITON_COLUMNS`, `IP_ESTIMATE_SQL`, `ERA_COMPONENTS_SQL`, `computeFIP()`, `computeXERA()`, `computeWRCPlus()`
- `lib/sceneTypes.ts` — `DataSchemaType`, `GlobalFilterType`, `ElementType`
- `app/api/scene-stats/route.ts` — primary consumer of all of the above

If you need the math, see `docs/Formulas.md`. This file is just labels.

---

## 0. Maintenance — Keep This File in Sync

**This is a living glossary. Update it in the same commit that adds or changes a variable.** A stale entry here is worse than a missing one — models and prompts will be built against wrong labels.

### When to update

Update the matching section whenever you touch one of these files:

| You changed… | Update this section |
|---|---|
| A key in `METRICS` (lib/reportMetrics.ts) | §1 — pick the right sub-group |
| A key in `SCENE_METRICS` | §1 (and tag the group) |
| `TRITON_COLUMNS` (lib/sql.ts) | §2 |
| `TRITON_PLUS_METRIC_KEYS`, `DECEPTION_METRIC_KEYS`, `ERA_METRIC_KEYS` | §2 / §3 / §4 |
| A new ERA estimator helper (`computeFIP`, `computeXERA`, …) | §4 |
| `GAME_METRICS` (live-game variables) | §5 |
| A new query param read in `/api/scene-stats` (or any other stats route) | §6 |
| `league_averages` schema or qualification rule | §7 |
| `DataSchemaType`, `GlobalFilterType`, `ElementType`, format types | §8 |
| New stats source table | §9 |
| First time a new raw `pitches` column is referenced by an aggregation | §10 |

### What an entry needs

For a metric key (the most common case), every row should have:
- **Key** — exact string used in code (e.g. `avg_velo`, not "avg velocity")
- **Label** — display label from the metrics map
- **Source / SQL** — column name (e.g. `release_speed`) or a one-line SQL summary; for plus-stats, the source table
- **Group / Notes** — only if there's a non-obvious gotcha (units, exclusions, year availability)

For a query parameter (§6): name, type/values, which mode(s) read it, default if any.

### How to verify after edits

1. Search the codebase for the variable name to confirm spelling matches the constant: `grep -rn "<key>" lib/ app/api/`
2. If it's a metric key, confirm it appears in `SCENE_METRICS` (lib/reportMetrics.ts) — that's the user-facing whitelist.
3. If it's a Triton column, confirm it's listed in `TRITON_COLUMNS` (lib/sql.ts:7) — otherwise leaderboards won't pick it up via `backfillTritonMetrics()`.
4. Re-read the §10 raw-column list — if your new metric reads a column not yet listed, add it.

### Removals

If a metric is deprecated, remove the row outright rather than leaving it with a strikethrough. Stale labels mislead. Note the removal in the commit message.

---

## 1. Metric Keys — Aggregated from `pitches`

All keys below are aggregations defined in `METRICS` (lib/reportMetrics.ts). They run via the `run_query` RPC against the `pitches` table (or `milb_pitches`, with events normalized to lowercase). When used in a leaderboard, they accept an optional `secondaryMetric` / `tertiaryMetric` from the same set.

### 1.1 Counting

| Key | Label | Source / SQL | Notes |
|---|---|---|---|
| `pitches` | Pitch Count | `COUNT(*)` | Total pitches thrown / seen |
| `pa` | PA | distinct `(game_pk, at_bat_number)` where `events IS NOT NULL` | Plate appearances |
| `games` | Games | `COUNT(DISTINCT game_pk)` | Game appearances |
| `ip` | IP | filtered `events` count / 3 (rounded 0.1) | Outs ÷ 3; not the full innings calculus |
| `h` | Hits | `events IN (single, double, triple, home_run)` | |
| `singles` | Singles | `events = 'single'` | Not in SCENE_METRICS |
| `doubles` | Doubles | `events = 'double'` | |
| `triples` | Triples | `events = 'triple'` | |
| `hr_count` | Home Runs | `events = 'home_run'` | |
| `bb_count` | Walks | `events = 'walk'` | |
| `k_count` | Strikeouts | `events LIKE '%strikeout%'` | Includes `strikeout_double_play` |
| `hbp_count` | HBP | `events = 'hit_by_pitch'` | |
| `usage_pct` | Usage % | `100 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY player_name)` | Pitch-mix share |

### 1.2 Stuff / Arsenal

| Key | Label | Source column | Notes |
|---|---|---|---|
| `avg_velo` | Avg Velocity | `release_speed` | mph; `ROUND(.,1)` |
| `max_velo` | Max Velocity | `release_speed` | mph |
| `avg_spin` | Avg Spin Rate | `release_spin_rate` | rpm; `ROUND(.,0)` |
| `avg_ext` | Extension | `release_extension` | ft; `ROUND(.,2)` |
| `avg_hbreak_in` | H-Break (in) | `pfx_x * 12` | Inches (pfx_x stored in feet) |
| `avg_ivb_in` | IVB (in) | `pfx_z * 12` | Inches |
| `avg_arm_angle` | Arm Angle | `arm_angle` | Degrees |

### 1.3 Rates

| Key | Label | Definition |
|---|---|---|
| `k_pct` | K % | K / PA |
| `bb_pct` | BB % | BB / PA |
| `k_minus_bb` | K-BB % | `k_pct − bb_pct` |
| `whiff_pct` | Whiff % | swinging strikes ÷ swings |
| `swstr_pct` | SwStr % | swinging strikes ÷ pitches |
| `csw_pct` | CSW % | called + swinging strikes ÷ pitches |
| `zone_pct` | Zone % | pitches in `zone 1-9` ÷ pitches with non-null zone |
| `chase_pct` | Chase % | swings on `zone > 9` ÷ pitches in `zone > 9` |
| `contact_pct` | Contact % | contact ÷ swings (overall) |
| `z_swing_pct` | Z-Swing % | swings in `zone 1-9` ÷ pitches in `zone 1-9` |
| `o_contact_pct` | O-Contact % | contact in `zone > 9` ÷ swings in `zone > 9` |

### 1.4 Batting

| Key | Label | Definition |
|---|---|---|
| `ba` | AVG | hits / at-bats (3-decimal) |
| `obp` | OBP | reached / non-bunt PAs |
| `slg` | SLG | total bases / at-bats |
| `ops` | OPS | `obp + slg` |
| `wrc_plus` | wRC+ | Computed in JS: `(((wOBA - lgwOBA) / wOBA_scale + r_pa) / (parkFactor/100 * r_pa)) * 100`. Uses `SEASON_CONSTANTS` + `PARK_FACTORS`. In `COMPUTED_METRIC_KEYS`, not in `METRICS`. |

### 1.5 Expected (Statcast)

| Key | Label | Source column |
|---|---|---|
| `avg_xba` | xBA | `estimated_ba_using_speedangle` |
| `avg_xwoba` | xwOBA | `estimated_woba_using_speedangle` |
| `avg_xslg` | xSLG | `estimated_slg_using_speedangle` |
| `avg_woba` | wOBA | `woba_value` |
| `total_re24` | RE24 | `SUM(delta_run_exp)` |

### 1.6 Batted Ball

| Key | Label | Source / SQL |
|---|---|---|
| `avg_ev` | Avg Exit Velo | `launch_speed` |
| `max_ev` | Max Exit Velo | `MAX(launch_speed)` |
| `avg_la` | Avg Launch Angle | `launch_angle` |
| `avg_dist` | Avg Distance | `hit_distance_sc` |
| `hard_hit_pct` | Hard Hit % | `launch_speed >= 95` ÷ batted balls |
| `barrel_pct` | Barrel % | `launch_speed_angle = 6` ÷ batted balls |
| `gb_pct` | GB % | `bb_type = 'ground_ball'` |
| `fb_pct` | FB % | `bb_type = 'fly_ball'` |
| `ld_pct` | LD % | `bb_type = 'line_drive'` |
| `pu_pct` | PU % | `bb_type = 'popup'` |

### 1.7 Swing Tracking

| Key | Label | Source column / Threshold |
|---|---|---|
| `avg_bat_speed` | Bat Speed | `bat_speed` (mph) |
| `avg_swing_length` | Swing Length | `swing_length` (ft) |
| `avg_attack_angle` | Attack Angle | `attack_angle` (deg) |
| `avg_attack_direction` | Attack Direction | `attack_direction` (deg) |
| `avg_swing_path_tilt` | Swing Path Tilt | `swing_path_tilt` (deg) |
| `fast_swing_rate` | Fast Swing % | `bat_speed >= 75` |
| `squared_up_rate` | Squared Up % | `launch_speed >= 0.8 * (1.23*bat_speed + 0.23*release_speed)` |
| `blast_rate` | Blast % | squared up **and** `bat_speed >= 75` |
| `ideal_attack_angle_rate` | Ideal AA % | `attack_angle BETWEEN 5 AND 20` |

---

## 2. Pre-Computed Metrics — `pitcher_season_command`

These are NOT aggregated from `pitches` at query time. They live in `pitcher_season_command` (one row per pitcher × pitch_type × game_year) and are pivoted into per-pitcher season values via `pivotTritonRows()` in `lib/sql.ts`. Backfilled into leaderboards by `backfillTritonMetrics()`.

`TRITON_COLUMNS` (lib/sql.ts:7) — the canonical column list:

### 2.1 Triton+ (Plus Stats — normalized to 100)

| Key | Label | What it measures |
|---|---|---|
| `cmd_plus` | Cmd+ | Composite command score |
| `rpcom_plus` | RPCom+ | Repertoire command (cross-pitch consistency) |
| `brink_plus` | Brink+ | Borderline-zone exploitation |
| `cluster_plus` | Cluster+ | Location consistency (overall) |
| `cluster_r_plus` | ClusterR+ | Cluster vs. RHB |
| `cluster_l_plus` | ClusterL+ | Cluster vs. LHB |
| `hdev_plus` | HDev+ | Horizontal location deviation |
| `vdev_plus` | VDev+ | Vertical location deviation |
| `missfire_plus` | Missfire+ | Missed-target rate |
| `close_pct_plus` | Close+ | Close-to-target rate |

> **Note:** Any metric ending in `_plus` is excluded from `league_averages` because plus-stats already normalize to 100. (See CLAUDE.md → Plus-stats exclusion.)

### 2.2 Triton (Raw Command)

| Key | Label | Notes |
|---|---|---|
| `avg_brink` | Brink | Raw brink value |
| `avg_cluster` | Cluster | Raw cluster (overall) |
| `avg_cluster_r` | ClusterR | Raw cluster vs. RHB |
| `avg_cluster_l` | ClusterL | Raw cluster vs. LHB |
| `avg_hdev` | HDev | Raw horizontal dev |
| `avg_vdev` | VDev | Raw vertical dev |
| `avg_missfire` | Missfire | Raw missfire rate |
| `close_pct` | Close % | Close-to-target % |
| `waste_pct` | Waste % | Wasted-pitch % |

The full set is encoded as `TRITON_PLUS_METRIC_KEYS` in lib/reportMetrics.ts:224 (used to route `/api/scene-stats` to the pre-computed table instead of `pitches`).

---

## 3. Deception Metrics — `pitcher_season_deception`

| Key | Label | Source column |
|---|---|---|
| `deception_score` | Deception | `deception_score` |
| `unique_score` | Unique | `unique_score` |
| `xdeception_score` | xDeception | computed via `computeXDeceptionScore()` (lib/leagueStats) |

Membership set: `DECEPTION_METRIC_KEYS` (lib/reportMetrics.ts:230). Available 2017+.

---

## 4. ERA Estimators — Computed in Code

Not in `METRICS`. Built in `/api/scene-stats` via `backfillEraMetrics()` from `ERA_COMPONENTS_SQL` (k, bb, hbp, hr, ip, pa, xwoba) + `SEASON_CONSTANTS` (`woba`, `woba_scale`, `lg_era`, `cfip` from `lib/constants-data.ts`).

| Key | Label | Helper |
|---|---|---|
| `era` | ERA | `player_season_stats` table (populated by `/api/cron/player-stats`). Fallback: `computeFIP()`. |
| `fip` | FIP | `computeFIP({k, bb, hbp, hr, ip}, {cfip})` |
| `xera` | xERA | `computeXERA({ip, pa, xwoba}, {woba, woba_scale, lg_era})` |

Membership set: `ERA_METRIC_KEYS` (lib/reportMetrics.ts:231).
Also: `COMPUTED_METRIC_KEYS` — `wrc_plus` (see §1.4).

---

## 5. Game / Live-State Variables

`GAME_METRICS` (lib/reportMetrics.ts:91) — for live-game scene bindings, not stat queries. Sourced from MLB Stats API live feed.

| Key | Label | Group |
|---|---|---|
| `away_abbrev`, `home_abbrev` | Away/Home abbrev | Teams |
| `away_name`, `home_name` | Away/Home full | Teams |
| `away_abbrev_themed`, `home_abbrev_themed`, `matchup_themed` | Themed variants | Themed |
| `away_score`, `home_score` | Score | Score |
| `inning_display`, `inning_half`, `inning_ordinal`, `outs`, `game_state`, `detailed_state`, `state_line` | Game state | State |
| `on_first`, `on_second`, `on_third` | Runners | Runners |
| `pitcher_name`, `batter_name` | Current pitcher/batter | Players |
| `probable_away`, `probable_home` | Probable starters | Players |

---

## 6. Query / Filter Parameters — `/api/scene-stats`

These are the URL parameters the route reads off `req.nextUrl.searchParams`. Most leaderboard / stat fetches go through this endpoint.

### 6.1 Mode flags (mutually exclusive)

| Param | Effect |
|---|---|
| `leaderboard=true` | Top-N leaderboard mode (uses `metric`, `playerType`, etc.) |
| `percentile=true` | Returns percentile rankings for `playerId` |
| `kinematics=true` | Pitch trajectory rows for pitch-flight elements |
| `trends=true` | Surges & concerns from rolling averages |
| `topPitchers=true` | Daily top-pitcher highlights |
| `topPerformances=true` | Daily top-performance brief |
| `depthChart=true` | Team rotation depth chart |
| `bullpenChart=true` (with `depthChart=true`) | Team bullpen chart |
| `playerCheckin=true` | Multi-player check-in payload |
| `yesterdayScores=true` | Daily scores recap |

### 6.2 Common filters

| Param | Type / Values | Used by |
|---|---|---|
| `metric` | metric key (e.g. `avg_velo`) | leaderboard |
| `secondaryMetric`, `tertiaryMetric` | metric keys | leaderboard |
| `playerType` | `pitcher` \| `batter` | leaderboard, percentile |
| `playerId` | int | percentile, depthChart, kinematics |
| `pitcherRole` | `starter` \| `reliever` (else "all") | leaderboard, league_averages — see CLAUDE.md SP/RP convention |
| `pitchType` | Statcast code (`FF`, `SI`, `FC`, `SL`, `CU`, `CH`, `SW`, `KC`, `FS`, `ST`) | leaderboard |
| `gameYear` | 4-digit int (default 2026) | most modes |
| `dateFrom`, `dateTo` | `YYYY-MM-DD` | leaderboard custom range |
| `limit` | int (default 5 / 10) | leaderboard |
| `sortDir` | `asc` \| `desc` (default `desc`) | leaderboard |
| `minSample` | int — min `pitches` (pitcher) or PA (batter) qualifier | leaderboard |
| `team` | 3-letter abbrev (`NYY`, etc.) | depthChart |
| `date` | `YYYY-MM-DD` | yesterdayScores, live-game |

### 6.3 Default qualifier (when `minSample` not provided)

- pitcher: `300` pitches
- batter: `150` pitches (note: this is **pitches seen**, not PA)

---

## 7. League-Average Benchmarks — `league_averages`

50th-percentile values per qualified player, used for percentile rankings and heatmap midpoints.

**Primary key (logical):** `(season, level, role, metric)`

| Column | Values |
|---|---|
| `season` | year (e.g. 2026) |
| `level` | `mlb` \| `milb` |
| `role` | `sp` \| `rp` \| `hitter` |
| `metric` | any non-`_plus` metric key from above |
| `value` | numeric |

Refreshed nightly by `refresh_league_averages(p_season int)` (called from `/api/cron/pitches`). Plus-stats (`*_plus`) are excluded by design.

**Qualification** (canonical, see CLAUDE.md):
- hitter: `AB >= max(25, 0.20 * AB_leader)`
- SP/RP: `IP >= max(5, 0.20 * IP_leader_for_role)`

**SP/RP definition:** a pitcher is **SP** if they have ≥3 games with 50+ pitches thrown (excluding `pitch_type IN ('PO','IN')`) in the season; **RP** otherwise.

---

## 8. Schema Types — Scene / Imagine

From `lib/sceneTypes.ts`. These describe the **shape** of data flowing into rendered widgets, not the stats themselves.

### 8.1 `DataSchemaType`

Determines which row shape a custom template binds against:

| Value | Row fields |
|---|---|
| `leaderboard` | `rank`, `player_id`, `player_name`, `primary_value`, `secondary_value?`, `tertiary_value?` |
| `outing` | `pitcher_id`, `pitcher_name`, `game_date`, `opponent`, `game_line { ip, h, r, er, bb, k, pitches }`, command/arsenal arrays |
| `starter-card` | full pitcher bio + game line + grades + usage + movement + per-pitch metrics |
| `percentile` | `metric_name`, `percentile_value`, `raw_value` |
| `generic` | `player_id`, `player_name`, `stat_value`, `stat_label` |

### 8.2 `GlobalFilterType`

The filter family used by Scene Composer / Imagine widgets:

`single-player` · `team` · `leaderboard` · `live-game` · `matchup` · `depth-chart` · `bullpen-depth-chart` · `player-checkin` · `yesterday-scores` · `trends` · `top-pitchers` · `top-performances`

### 8.3 Format types

For value rendering: `raw` · `1f` · `2f` · `3f` · `integer` · `percent`

---

## 9. Source Tables — One-Liners

| Table | Grain | Years | Notes |
|---|---|---|---|
| `pitches` | one row per pitch (MLB) | 2015–2026 | 90+ columns; primary aggregation source |
| `milb_pitches` | one row per pitch (MiLB) | 2023+ | events in **Title Case** (`Strikeout`, `Home Run`, …) — normalize before queries |
| `players` | one row per player | — | id, name, position |
| `pitcher_season_command` | pitcher × pitch_type × year | — | Raw + plus command metrics; pitch-weighted aggregate for season |
| `pitcher_season_deception` | pitcher × pitch_type × year | 2017+ | `deception_score`, `unique_score` |
| `league_averages` | (season, level, role, metric) | — | 50th-percentile benchmarks for qualified players |
| `player_season_stats` | player × season × stat_group | 2015+ | ERA, W, L, SV, HLD, IP, ER, R, RBI, SB from MLB Stats API. Populated by `/api/cron/player-stats` nightly. |
| `glossary` | metric definitions | — | UI tooltips |
| `filter_templates` | saved filter configs | — | |

---

## 10. Raw `pitches` Columns Referenced by `METRICS`

When writing a new model or formula against the same labels, here are the raw columns the existing aggregations read:

**Identity / context** — `pitcher`, `batter`, `player_name`, `game_pk`, `at_bat_number`, `game_date`, `game_year`, `pitch_type`, `p_throws`, `stand`, `home_team`, `away_team`, `inning`, `inning_topbot`

**Release / movement** — `release_speed`, `release_spin_rate`, `release_extension`, `pfx_x`, `pfx_z`, `arm_angle`

**Plate / outcome** — `description`, `events`, `zone`, `woba_value`, `delta_run_exp`

**Statcast expected** — `estimated_ba_using_speedangle`, `estimated_woba_using_speedangle`, `estimated_slg_using_speedangle`

**Batted ball** — `launch_speed`, `launch_angle`, `launch_speed_angle`, `bb_type`, `hit_distance_sc`

**Swing (bat tracking)** — `bat_speed`, `swing_length`, `attack_angle`, `attack_direction`, `swing_path_tilt`

(See `pitches` schema in Supabase for the full 90+ columns. Anything outside this list is unused by the metric layer today.)

---

## Quick Lookup

- **"What's the variable for ___?"** → §1–§4 (alphabetical within group)
- **"What query param do I send?"** → §6
- **"What raw column does this come from?"** → column shown next to the metric in §1, or §10 for the full list
- **"Where does this metric live?"** → §2 (Triton), §3 (Deception), §4 (ERA), else aggregated from `pitches`/`milb_pitches`
