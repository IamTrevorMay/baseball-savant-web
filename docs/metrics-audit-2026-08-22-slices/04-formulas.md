# Slice 04 — Metric Formula Correctness

**Verdict.** The plate-discipline and batted-ball families are in good shape: whiff, CSW, SwStr,
chase, zone, Z-swing, O-contact, GB/FB/LD/PU, hard-hit and barrel all use the right numerator and
the right denominator, and their `description`/`events` string matches are exhaustive against the
vocabulary actually present in `pitches` (I enumerated it for June 2016 and June 2024). The damage
is concentrated elsewhere, in four clusters. **First, two metrics are simply wrong by large
margins**: SIERA carries an invented `−0.986·ln(IP)` term that drives the league-average SIERA
*negative* (`league_averages` 2024 MLB SP = **−0.871**), and `avg_xslg` averages a column that is
NULL on every strikeout, so it reports **.536** as the 2024 league xSLG against a true value of
**.409**. Both defects are replicated identically in the TypeScript and the SQL, so both are
single-source fixes. **Second, the same metric is computed differently in different places**: there
are **four** mutually inconsistent innings-pitched definitions, two of which disagree on the display
convention itself (203.7 decimal vs 204.1 base-3 for the same pitcher-season), and average exit
velocity differs by 0.5 mph between the leaderboard and the player page for the same pitcher.
**Third, no metric surface in the research app filters `game_type`**, so every counting stat pools
spring training with the regular season — Tarik Skubal's 2024 shows as 811 PA / 247 K / 203.7 IP
against a true 754 / 228 / 190.2 — while `pitcher_season_command` and `pitcher_season_deception` *do*
filter to `'R'`, so a single leaderboard row mixes two populations. **Fourth, the aggregation rules
are wrong in two specific spots**: `usage_pct`'s window partition does not match the GROUP BY key
(Skubal's 2023 four-seam usage displays **10.2%** against a true **36.0%**), and the player page's
"Career" row takes an unweighted mean of season rate stats. Everything below traces to code I read
or a query I ran in this session; nothing is carried over from prior findings.

Population for all DB work: `pitches`, MLB, chunked by month or by `pitcher × game_year`. Sample
sizes are stated inline with every number.

---

## F1. SIERA carries a fabricated `−0.986 × ln(IP)` term; the league average is negative

- **Impact:** critical — SIERA on the player page Advanced tab (`pitcher:advanced`), in
  `league_averages`, and in `league_percentiles`. Every qualified starter's SIERA is roughly **5
  runs too low**, and the league-average SIERA stored in production is a negative number. Any
  percentile, color scale, or comparison built on SIERA is meaningless.
- **Location:** `lib/expected-stats.ts:87` (and the comment that documents it as published, `:71`);
  `scripts/create-refresh-league-averages.sql:713`; `scripts/create-refresh-league-percentiles.sql:660`
- **What's wrong:** The published Swartz SIERA is an **eight-term** model in K/PA, BB/PA and
  net-GB/PA. It contains no innings term. Triton adds a ninth term, `−0.986 × ln(IP)`, which is not
  part of any published SIERA and is not a rate-stat correction — it makes SIERA a *monotonically
  decreasing function of workload*, so a 200-inning starter is penalised 5.22 runs and a 5-inning
  reliever 1.59 runs, purely for pitching more. The `Math.max(s.ip, 1)` / `GREATEST(p._ip, 1)` guard
  zeroes the term below 1 IP, creating a discontinuity at the bottom of the scale as well.
- **Evidence:**

  ```ts
  // lib/expected-stats.ts:79-87
  return 6.145
    - 16.986 * kRate
    + 11.434 * bbRate
    - 1.858 * netGB
    + 7.653 * kRate * kRate
    + 6.664 * netGB * netGB
    + 10.130 * kRate * netGB
    - 5.195 * bbRate * netGB
    - 0.986 * Math.log(Math.max(s.ip, 1))   // ← not in the published model
  ```

  Production values read from `league_averages` (one query, `season IN (2024, 2026)`):

  | season | level | role | n_qualified | stored `siera` | + 0.986·ln(mean IP) | recovered |
  |---|---|---|---|---|---|---|
  | 2024 | MLB | SP | 226 | **−0.871** | +4.94 (≈150 IP) | **4.07** |
  | 2024 | MLB | RP | 305 | **−0.261** | +3.86 (≈50 IP) | **3.60** |
  | 2024 | MiLB | SP | 276 | **−0.091** | — | — |
  | 2026 | MLB | SP | 214 | **−0.321** | +4.64 (≈110 IP) | **4.32** |

  Adding the spurious term back recovers 4.07 for 2024 MLB starters, which *is* the correct
  league-average SIERA for that population. That is the confirmation: the model is right, the ninth
  term is the entire error.
- **Expected vs actual:** League-average 2024 MLB SP SIERA — Triton stores **−0.871**, correct value
  is **≈4.07**. Worked single-pitcher case, Skubal 2024 on Triton's own inputs (PA 811, K 247, BB 39,
  GB 241, FB 125, PU 37, IP 204.33): the eight-term model gives **2.39**; Triton returns
  2.39 − 0.986·ln(204.33) = **−2.86**.
- **Fix:** delete the term in all three places.

  ```ts
  - 5.195 * bbRate * netGB          // last term; nothing follows it
  ```

  The `± 6.664 × netGB²` term in the published model is sign-conditional on the sign of netGB;
  Triton hardcodes `+`. Worth confirming against the source when you touch this line, but it is a
  second-order issue next to the ln(IP) term.
- **Confidence:** verified (production values read this session; the recovery arithmetic closes).

---

## F2. `avg_xslg` averages a column that is NULL on every strikeout — it is xSLG per batted ball

- **Impact:** critical — `xSLG` column on the pitching Advanced leaderboard, the hitting Advanced
  leaderboard, scene-stats/producer presets, the player page Advanced tab, and the `avg_xslg`
  benchmark in `league_averages`. The reported value is inflated by roughly **+.13** and makes elite
  contact suppression look below average.
- **Location:** `lib/reportMetrics.ts:38`; `lib/pitcherStats.ts:136`; `refresh_league_averages`
  (`e_xslg := 'AVG(estimated_slg_using_speedangle)'`)
- **What's wrong:** `estimated_slg_using_speedangle` is populated only for batted balls. `AVG()`
  skips NULLs, so strikeouts and walks — which contribute a zero to real xSLG through the AB
  denominator — are dropped from the calculation entirely. The result is "expected slugging per
  batted ball," not xSLG. Note the contrast one line up: `avg_xba` (`:36`) gets this exactly right,
  using `SUM(estimated_ba_using_speedangle) / AB`, and `avg_xwoba` (`:37`) is fine because
  `estimated_woba_using_speedangle` *is* populated for strikeouts (0.0000) and walks (0.6935).
  xSLG is the one column in the family that had to be written differently and was not.
- **Evidence:** coverage of the three expected-stat columns, June 2024 (116,355 rows):

  | bucket | rows | `xwoba` non-null | `xba` non-null | `xslg` non-null |
  |---|---|---|---|---|
  | batted ball | 20,622 | 20,455 | 20,532 | **20,532** |
  | strikeout | 6,619 | 6,619 | 0 | **0** |
  | walk / IBB / HBP | 2,732 | 2,661 | 0 | **0** |

- **Expected vs actual:**
  - League, June 2024 (n = 29,824 AB): Triton's `AVG()` gives **.5370**; `SUM(xslg)/AB` gives
    **.4092**. True MLB SLG that season was .399.
  - Skubal 2024 (n = 757 AB, 514 batted balls): Triton reports xSLG-against **.478**; correct value
    is **.323**.
  - `league_averages` 2024 MLB hitter (n = 431 qualified): stored **.536**.
- **Fix:**

  ```sql
  -- lib/reportMetrics.ts:38
  avg_xslg: "ROUND(SUM(estimated_slg_using_speedangle)::numeric / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','intent_walk','hit_by_pitch','sac_fly','sac_fly_double_play','sac_bunt','catcher_interf','truncated_pa')), 0), 3)"
  ```

  Mirror in `lib/pitcherStats.ts:136` and in `e_xslg` inside `refresh_league_averages`. Because the
  benchmark is wrong the same way, fixing only one side will make a previously-consistent comparison
  inconsistent — change both in one commit.
- **Confidence:** verified.

---

## F3. Four mutually inconsistent innings-pitched definitions, two display conventions

- **Impact:** high — IP appears on the leaderboard/report (`ip`), the player page Traditional and
  Advanced tabs, as the denominator of FIP/xFIP/xERA/SIERA, and as the *qualification threshold* for
  every `league_averages` benchmark. The four definitions disagree on which events record outs, on
  whether double plays count as one out or two, on whether to count rows or distinct plate
  appearances, and on how to render the result.
- **Location:** `lib/reportMetrics.ts:10`; `lib/sql.ts:19` (`IP_ESTIMATE_SQL`);
  `lib/pitcherStats.ts:71-83` and `:202-213`; `refresh_league_averages` `per_pitcher._ip`
- **What's wrong:**

  | # | Where | Rule | DP weight | Grain | Rendered as |
  |---|---|---|---|---|---|
  | 1 | `reportMetrics.ip` | whitelist of out events | 2 (TP 3) | row count | `ROUND(outs/3, 1)` → decimal |
  | 2 | `IP_ESTIMATE_SQL` | **blacklist** of non-out events | 2 (TP 3) | `COUNT(DISTINCT` PA`)` | decimal, feeds FIP/xERA |
  | 3 | `pitcherStats.ts` | blacklist, JS | 2 (TP 3) | row count | `floor(outs/3).(outs%3)` → base-3 |
  | 4 | `refresh_league_averages._ip` | whitelist of out events | **1** | row count | decimal |

  Definition 4 counts `double_play`, `grounded_into_double_play`, `strikeout_double_play`,
  `sac_fly_double_play` and `triple_play` as **one out each** — the `COUNT(*) FILTER (...)` has no
  ×2 or ×3 weighting. League-wide that undercounts outs by about **2.9%** (June 2024: 20,438 counted
  against 21,050 actual), and it undercounts by a *pitcher-dependent* amount, so ground-ball pitchers
  lose more innings than fly-ball pitchers. This is the number that sets `qual_floor` for every
  league benchmark and divides FIP/xFIP/SIERA inside `league_averages`.

  Definitions 2 and 3 are blacklists, so any event not on the exclusion list is scored as an out.
  In the 2024 vocabulary that means `intent_walk` and `truncated_pa` are both counted as outs (see F7).

  The display split is the part a user will actually notice. Definition 1 produces a decimal that
  `leaderboardColumns.ts` formats as `dec1` — "203.7" — which is not a legal value in baseball
  innings notation, where the fractional digit can only be 0, 1 or 2. Definition 3 produces genuine
  base-3 notation. `calcTotalsFromRegistry`'s `'ip'` strategy (`lib/metricRegistry.ts:678-685`)
  correctly parses base-3 back into outs, which confirms the player page's intent — and confirms that
  the leaderboard's decimal is a different unit wearing the same label.
- **Evidence:** one query over `pitcher = 669373 AND game_year = 2024`, all three code paths
  transcribed verbatim into SQL:

  | definition | outs | value shown |
  |---|---|---|
  | `reportMetrics.ip` | 611 | **203.7** (decimal) |
  | `IP_ESTIMATE_SQL` | 613 | 204.333 (FIP denominator) |
  | `pitcherStats.ts` | 613 | **204.1** (base-3) |

  Restricting to `game_type = 'R'` gives 572 outs = 190.2 IP against Skubal's official 192.0 — the
  remaining 4-out gap is caught-stealing and pickoff outs, which Statcast does not place in `events`
  at all, so no `events`-based rule can recover them. That residual is a legitimate ~0.7% floor on
  the accuracy of any of these definitions and should be documented, not chased.
- **Expected vs actual:** the same pitcher-season reads **203.7 IP** on the leaderboard and
  **204.1 IP** on the player page. Those look 0.4 innings apart; the real gap is 2 outs = 0.67
  innings, and neither equals the official 192.0 (see F4).
- **Fix:** one exported helper — `OUTS_SQL` (whitelist, DP ×2, TP ×3, row grain) and
  `formatIP(outs)` (base-3) — imported by `reportMetrics`, `sql.ts`, `pitcherStats.ts` and pasted
  into `refresh_league_averages`. Add a `FormatSpec` of `{ type: 'ip' }` to the leaderboard `ip`
  column so it stops rendering as `dec1`. Add `intent_walk` and `truncated_pa` to the blacklists.
- **Confidence:** verified.

---

## F4. No metric surface filters `game_type`; spring training is pooled into every season stat

- **Impact:** high — every counting stat and every rate on the reports builder, all leaderboards,
  the player page, and `league_averages`. Rates move only slightly; **counting stats are inflated by
  5–10% and IP by 13 innings for a full-season starter**. It also makes a single row internally
  inconsistent, because the Triton command/deception tables *do* filter to regular season.
- **Location:** `lib/reportQueryBuilder.ts:139` (the only WHERE clause the builder appends is
  `pitch_type NOT IN ('PO','IN')`); `app/api/player-data/route.ts:44`; `refresh_league_averages`
  (window is `make_date(season,1,1)` → `make_date(season+1,1,1)`, nothing else). Contrast
  `app/api/update/route.ts:384`, which builds `pitcher_season_command` / `pitcher_season_deception`
  with `AND game_type = 'R'`.
- **What's wrong:** `game_type` is available and indexed (`INDEXED_FILTER_COLS`, line 5) and is
  filterable *if the user asks*, but no default is applied. A user who selects "2024" gets spring
  training, the regular season and the postseason in one bucket, with no indication on screen.
- **Evidence:** `pitcher = 669373 AND game_year = 2024`, grouped by `game_type`:

  | game_type | pitches | PA | K | BB | outs |
  |---|---|---|---|---|---|
  | R | 2,868 | 754 | 228 | 35 | 572 |
  | S | 229 | 57 | 19 | 4 | 39 |

  There is a second, subtler version of this on the player page. `components/dashboard/OverviewTab.tsx:44-56`
  merges `w`, `l`, `era`, `sv`, `gs`, `whip` from the MLB Stats API (or Lahman) into a row whose
  `ip`, `h`, `bb`, `k`, `ba`, `obp`, `slg` come from Statcast. So one row carries official
  regular-season ERA and WHIP beside spring-inclusive Statcast hits, walks and innings. Skubal 2024
  displays H = 154, BB = 39, IP = 204.1 → an implied WHIP of 0.944, next to an official WHIP of 0.923.
  The row cannot be reconciled against itself.
- **Expected vs actual:** Skubal 2024 as Triton reports it — **811 PA, 247 K, 39 BB, 203.7 IP**;
  true regular season — **754 PA, 228 K, 35 BB, 190.2 IP**. K% 30.5% vs 30.2%.
- **Fix:** append `game_type = 'R'` in `buildReportQuery` unless the caller supplies an explicit
  `game_type` filter, add the same to `app/api/player-data/route.ts:44`, and add
  `AND game_type = 'R'` to the three `src` CTEs in `refresh_league_averages`. This is a
  **restatement**, not a bug fix: every stored `league_averages` row changes. Version it.
- **Confidence:** verified.

---

## F5. `usage_pct`'s window partition does not match the GROUP BY key

- **Impact:** high — Usage% on the reports builder wherever the grouping includes anything beyond
  `player_name`. The most common such grouping — player × pitch type × year — produces percentages
  that are wrong by a factor equal to the number of years in the window.
- **Location:** `lib/reportMetrics.ts:65`
- **What's wrong:**

  ```sql
  usage_pct: 'ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY player_name), 0), 1)'
  ```

  The partition is hardcoded to `player_name`, but `buildReportQuery` lets the caller group by
  `game_year`, `stand`, `balls`, `strikes`, `zone` and 18 other columns. The denominator is then the
  pitcher's total across *all* those slices, so the percentages sum to 100 over the whole result set
  instead of within each slice. A secondary consequence: `PARTITION BY player_name` is invalid
  whenever `player_name` is not itself in the GROUP BY (e.g. grouping by `pitcher` + `pitch_name`),
  which errors rather than misreports.
- **Evidence:** the generated SQL, run for `pitcher = 669373`, `game_year IN (2023,2024)`, grouped
  by `player_name, pitch_name, game_year`:

  | year | pitch | pitches | Triton usage% | true usage% |
  |---|---|---|---|---|
  | 2023 | 4-Seam Fastball | 439 | **10.2** | **36.0** (439/1218) |
  | 2023 | Changeup | 294 | 6.9 | 24.1 |
  | 2024 | 4-Seam Fastball | 1025 | **23.9** | **33.4** (1025/3067) |
  | 2024 | Changeup | 822 | 19.2 | 26.8 |

  All twelve rows sum to 100.0 across both seasons combined.
- **Expected vs actual:** Skubal's 2023 four-seam usage displays **10.2%**; the correct value is
  **36.0%** — a 3.5× understatement.
- **Fix:** the partition has to be the grouping key minus the usage dimension, which means
  `usage_pct` cannot live in a static `METRICS` map. Build it in `buildReportQuery` from the
  requested `groupBy`, excluding `pitch_name`/`pitch_type`:

  ```ts
  const usagePartition = groupBy.filter(g => g !== 'pitch_name' && g !== 'pitch_type')
                                .map(g => GROUP_COLS[g])
  // → SUM(COUNT(*)) OVER (PARTITION BY ${usagePartition.join(', ')})
  ```

  Reject the metric with a clear error when the grouping contains no pitch dimension.
- **Confidence:** verified.

---

## F6. The "Career" totals row averages rate stats unweighted

- **Impact:** high — the bottom row of the Traditional, Advanced and Arsenal tables on the player
  page. It is the row a scout reads first, and for a pitcher with any short season it is materially
  wrong. Applies to `ba`, `obp`, `slg`, `ops`, `era`, `whip`, `kPct`, `bbPct`, `kbbPct`, `whiffPct`,
  `swStrPct`, `csPct`, `fpsPct`, `zonePct`, `avgEV`, `avgLA`, `gbPct`, `fbPct`, `ldPct`, `xBA`,
  `xwOBA`, `xSLG`, `wOBA`, `fip`, `xfip`, `xera`, `siera`, `commandPlus`, `rpcomPlus`, `usagePct`.
- **Location:** `lib/metricRegistry.ts:648-660` (`calcTotalsFromRegistry`, `case 'avg'`); the
  `totals: 'avg'` declarations start at `:167`
- **What's wrong:**

  ```ts
  const vals = rows.map(r => parseFloat(r[key])).filter(v => !isNaN(v))
  const sum = vals.reduce((a, b) => a + b, 0)
  case 'avg': { const avg = sum / vals.length; … }
  ```

  This is the mean of the season values, each weighted equally. A career rate stat is a ratio of
  summed components, not a mean of ratios — the seasons have wildly different denominators. A
  pitcher with a 200-IP season at .240 BAA and a 5-IP September callup at .400 gets a "career" BAA of
  .320 where the correct value is .244. Same mechanism for ERA, WHIP, K% and every plus stat in the
  list.

  The internal contradiction is visible on screen without any external data: the same function
  computes career IP correctly by summing outs in base 3 (`case 'ip'`, `:678`) and career H, BB, K by
  summing (`case 'sum'`), so **the Career row's BA cannot be recomputed from the Career row's own H
  and AB**. Whatever the true career line is, the row is not self-consistent.

  Two secondary bugs in the same function: `case 'ip'` does not filter non-numeric rows the way
  `case 'avg'` does, so a single Lahman-only season with `ip: '—'` turns career IP into `NaN`; and
  `case 'max'` on `maxEV` is correct, but `max_velo` carries `totals: 'avg'` in some registry
  entries — worth an audit pass over the 69 `totals` declarations while you are in the file.
- **Evidence:** code read; the mechanism is arithmetic, not empirical.
- **Expected vs actual:** stated as a worked mechanism above rather than a measured pair — I did not
  spend a query on a multi-season pull. The magnitude scales with the variance in season IP, so it
  is largest for pitchers with partial seasons, which is most of them.
- **Fix:** add a `TotalsStrategy` of `'ratio'` carrying `{ num: string; den: string }` and compute
  `Σnum / Σden` from the component columns already present on each row (h/ab for BA, k/pa for K%,
  and so on). For metrics whose components are not on the row — `fip`, `xera`, `siera`, the plus
  stats — the honest answer is `totals: 'none'` and an em dash, not a mean of ratios.
- **Confidence:** verified (code); magnitude *estimated*.

---

## F7. `intent_walk` and `truncated_pa` are mis-bucketed across BB%, OBP, BA, SLG and IP

- **Impact:** medium-high — BB%, OBP, BA, SLG, OPS, AB, PA and IP on every surface, plus the
  hitter qualification floor in `league_averages`. Each individual error is 0.2–3% relative, but they
  are systematic, they point in different directions on different metrics, and two implementations
  disagree with each other about them.
- **Location:** `lib/reportMetrics.ts:8, 26, 32-34, 60`; `lib/sql.ts:19`;
  `lib/pitcherStats.ts:64, 76, 99, 207`; `refresh_league_averages` `per_hitter._ab` and `bb_pct`
- **What's wrong:** the 2024 `events` vocabulary contains **21 distinct values**. Two of them are
  handled wrong everywhere:

  - **`intent_walk`** (71 in June 2024, ≈3.0% of all walks). `bb_pct` and `obp` match
    `events = 'walk'` exactly, so intentional walks are excluded from both the walk count and the
    times-on-base count — but they are **not** excluded from the `ba`/`slg` AB denominator, which
    lists only `'walk'`. An intentional walk therefore counts as an at-bat and as an out. It is also
    counted as a *recorded out* by `IP_ESTIMATE_SQL` and by `pitcherStats.ts` (its skip list is
    `['walk','hit_by_pitch','single','double','triple','home_run','catcher_interf']`, which does not
    contain `intent_walk`, so it falls through to `outsFromEvents += 1`).
  - **`truncated_pa`** (55 in June 2024) — a plate appearance abandoned when the inning or game ended
    mid-count. It is not a PA, not an AB and not an out. Triton counts it as all three: as a PA in
    `pa` and in every K%/BB% denominator, as an AB in `ba`/`slg`, and as an out in `IP_ESTIMATE_SQL`
    and `pitcherStats.ts`.

  The two implementations also disagree with each other. `pitcherStats.ts:64` uses
  `p.events?.includes('walk')`, which **does** match `intent_walk`, while `reportMetrics.ts:26` uses
  `events = 'walk'`, which does not. Same for sacrifice flies: `pitcherStats.ts:97` uses
  `includes('sac_fly')` and so catches `sac_fly_double_play`; `reportMetrics.ts:32` lists only
  `'sac_fly'` and so counts a sac-fly double play as an at-bat. The player page is more nearly right
  than the SQL on both counts.
- **Evidence:** full `events` vocabulary, June 2024 (30,047 events over 116,355 rows) —
  `field_out` 12,262 · `strikeout` 6,603 · `single` 4,266 · `walk` 2,289 · `double` 1,320 ·
  `home_run` 921 · `grounded_into_double_play` 557 · `force_out` 551 · `hit_by_pitch` 372 ·
  `sac_fly` 218 · `field_error` 172 · `triple` 125 · `sac_bunt` 79 · **`intent_walk` 71** ·
  `fielders_choice_out` 60 · **`truncated_pa` 55** · `fielders_choice` 54 · `double_play` 37 ·
  `catcher_interf` 18 · `strikeout_double_play` 16 · `triple_play` 1.

  Worth recording as a *positive* result: the vocabulary contains **no** `caught_stealing_*`,
  `pickoff_*`, `stolen_base_*`, `wild_pitch` or `passed_ball` values. Triton's ingest stores only
  PA-terminating events, which is why the blacklist definitions in F3 are merely slightly wrong
  rather than catastrophically wrong.
- **Expected vs actual:** Skubal 2024 (a clean case — 0 IBB, 2 truncated PA): Triton PA 811 vs true
  809; Triton AB 759 vs true 757. League-wide, `bb_pct` understates walk rate by **3.0% relative**
  wherever intentional walks occur, and 71 of them are silently reclassified as at-bats.
- **Fix:** a single shared constant.

  ```ts
  export const NON_AB_EVENTS = "'walk','intent_walk','hit_by_pitch','sac_fly','sac_fly_double_play','sac_bunt','catcher_interf','truncated_pa'"
  export const NON_PA_EVENTS = "'truncated_pa'"
  export const WALK_EVENTS   = "'walk','intent_walk'"
  ```

  Then: `bb_pct`/`obp` numerators use `WALK_EVENTS`; `ba`/`slg` denominators use `NON_AB_EVENTS`;
  the `pa` expression and every K%/BB% denominator add `AND events <> 'truncated_pa'`;
  `pitcherStats.ts` skip lists gain `intent_walk` and `truncated_pa`. Note the wOBA weight for an
  intentional walk is zero, so `WALK_EVENTS` must **not** be applied to `avg_woba` (see F12).
- **Confidence:** verified.

---

## F8. `computePlus` normalises on SD = 15; `plusToPercentile` inverts it on SD = 10

- **Impact:** medium-high — every percentile derived from a Triton plus stat: Brink+, Cluster+,
  ClusterR/L+, HDev+, VDev+, Missfire+, Close+, Cmd+, RPCom+, and any Stuff+ passed through the same
  helper. Percentiles are pushed toward the extremes; a genuinely one-standard-deviation pitcher is
  reported at the 93rd percentile instead of the 84th.
- **Location:** `lib/leagueStats.ts:1320-1324` and `:1338-1342`
- **What's wrong:**

  ```ts
  export function computePlus(pitcherAvg, leagueMean, leagueStddev): number {
    if (!(leagueStddev > 0) || !Number.isFinite(leagueStddev)) return 100
    return ((pitcherAvg - leagueMean) / leagueStddev) * 15 + 100   // SD = 15
  }

  export function plusToPercentile(plus: number): number {
    const z = (plus - 100) / 10                                     // SD = 10
    return Math.max(1, Math.min(99, Math.round(normalCDF(z) * 100)))
  }
  ```

  The forward map and the inverse map use different scale constants, so `plusToPercentile` inflates
  every |z| by 50%. `valueToPercentile` (`:1344`) inherits the same defect because it recomputes the
  ×15 plus internally and then calls `plusToPercentile`.

  There is a third scale in circulation. Stuff+ is `100 + 4.5·z_velo + 3.5·z_move + 2.0·z_ext`
  (`lib/leagueStats.ts:1193`, `app/api/update/route.ts:322-327`), whose SD is
  `√(4.5² + 3.5² + 2.0²) ≈ 6.04` under independence and lower under the positive correlation that
  actually holds between velocity and extension. And SOS is built on a ×10 scale
  (`app/api/update/route.ts`, `100 + ((lg_avg − opp_xwoba)/lg_std) * 10`). All four scales share the
  one `plusColor` ramp in `lib/leaderboardColumns.ts:57-62`, whose 115/100/85 breaks are calibrated
  to ×15: on the ×15 scale 115 is the 84th percentile, on ×10 it is the 93rd, and on Stuff+'s ≈6 it
  is the 99th.
- **Evidence:** code read; the arithmetic is exact.
- **Expected vs actual:** a pitcher exactly 1.0 SD above the league mean gets `computePlus` = 115,
  and `plusToPercentile(115)` returns **93**. The correct percentile for z = 1.0 is **84**.
- **Fix:** put the scale in one place.

  ```ts
  export const PLUS_SD = 15
  export function computePlus(v, mean, sd) { …  return ((v - mean) / sd) * PLUS_SD + 100 }
  export function plusToPercentile(plus, sd: number = PLUS_SD) { const z = (plus - 100) / sd; … }
  ```

  Stuff+ and SOS must pass their own SD explicitly, and `plusColor` needs an SD argument (or the
  thresholds need to be expressed in z and converted per metric).
- **Confidence:** verified.

---

## F9. Average exit velocity and launch angle disagree between the SQL and the JS by 0.5 mph

- **Impact:** medium — Avg EV and Avg LA on the player page (Advanced and Arsenal tabs) do not match
  the same metric on the leaderboard or the reports builder for the same pitcher-season.
- **Location:** `lib/pitcherStats.ts:130-131` and `:270`; compare `lib/reportMetrics.ts:20, 22`
- **What's wrong:**

  ```ts
  const battedBalls = pitches.filter(p => p.bb_type != null)
  const evs = battedBalls.map(p => p.launch_speed)          // NULLs kept in the array
  const las = battedBalls.map(p => p.launch_angle).filter(Boolean)   // drops LA === 0
  const avg = (arr) => arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : null
  ```

  For EV, batted balls with no tracked exit velocity stay in the array. `0 + null === 0` in JS, so
  each untracked ball contributes 0 to the sum and 1 to the count — a hard downward bias. The SQL
  `AVG(launch_speed)` skips NULLs, so the two surfaces are computing different means over different
  populations. For LA, `filter(Boolean)` discards every batted ball with a launch angle of exactly
  0°, which is a legitimate and common value; the SQL `AVG(launch_angle)` keeps them.
  `.filter(Boolean)` is used the same way on `arm_angle` at `:259`, where 0° is also a real value
  (a fully horizontal slot).
- **Evidence:** `pitcher = 669373 AND game_year = 2024`, 514 batted balls, 511 with tracked EV,
  3 with LA exactly 0:

  | metric | SQL (`AVG`) | JS (`pitcherStats.ts`) |
  |---|---|---|
  | Avg EV | **86.79** | **86.29** |
  | Avg LA | **11.60** | **11.67** |

  League-wide the untracked-BBE rate is 90/20,622 = **0.44%** for June 2024, so the EV bias is
  roughly −0.4 mph in general and larger for pitchers with worse tracking coverage.
- **Expected vs actual:** Skubal 2024 average EV allowed — leaderboard **86.8 mph**, player page
  **86.3 mph**. The correct value over tracked batted balls is 86.79.
- **Fix:**

  ```ts
  const evs = battedBalls.map(p => p.launch_speed).filter((v: any) => v != null)
  const las = battedBalls.map(p => p.launch_angle).filter((v: any) => v != null)
  ```

  Replace every `.filter(Boolean)` on a numeric field in this file with `!= null`.
- **Confidence:** verified.

---

## F10. `league_averages` is a mean of per-player ratios, over a population that differs from the metrics it benchmarks

- **Impact:** medium — `league_averages` is the denominator of every plus stat, percentile and color
  scale on the platform. Three separate mismatches mean a player's value and its benchmark are not
  computed over the same population or with the same weighting.
- **Location:** `refresh_league_averages` — the `agg` CTEs (`AVG(k_pct)`, `AVG(ba)`, …); the
  `per_pitcher` CTE's WHERE clause; and `scripts/create-league-averages.sql:9`
- **What's wrong:**
  1. **Mean of ratios.** `AVG(k_pct)` over qualified pitchers is not the league K rate — it weights a
     40-inning reliever exactly as heavily as a 200-inning starter. The correct league rate is
     `ΣK / ΣPA`. The table's own column comment says "Mean of the metric across qualified players,"
     so the implementation matches its comment; but consumers treating it as *the league rate* are
     wrong, and the qualification floor of 20% of the leader means the population is a truncated,
     survivorship-selected sample rather than the league.
  2. **Population mismatch on the PO/IN filter.** `per_game`/`roles` filters
     `pitch_type NOT IN ('PO','IN')`, but `per_pitcher` — where `avg_velo`, `swstr_pct`, `csw_pct`,
     `zone_pct` are actually computed — does **not**. Meanwhile `buildReportQuery` unconditionally
     appends that filter. A pitcher's CSW% is therefore measured over a slightly different pitch
     population than the CSW% it is being compared against.
  3. **Population mismatch on game type.** The Triton command and deception values joined into
     `league_averages` come from `pitcher_season_command` / `pitcher_season_deception`, which are
     built with `game_type = 'R'` (`app/api/update/route.ts:384`). Every other metric in the same
     table is all-game-types (F4). Two different populations, one table.
  4. **Documentation.** `scripts/create-league-averages.sql:9` states the SP/RP rule as
     "first-inning game share > 0.5". The deployed function implements
     `COUNT(*) FILTER (WHERE pc >= 50) >= 3` — the canonical ≥3 games with 50+ pitches. The DDL
     comment is stale and contradicts the code beneath it.
- **Evidence:** function body read from `pg_get_functiondef` this session. Stored values,
  `season = 2024`, `level = 'MLB'`: hitter `ba` = **.242** (n = 431, `qual_floor` = 144.4 AB),
  SP `k_pct` = **21.737** (n = 226, floor 43.7 IP), RP `k_pct` = **24.741** (n = 305, floor 20.1 IP).
  The hitter `ba` is close to the true 2024 MLB .243 because BA is nearly symmetric across qualified
  hitters; the skewed rates will not behave as well.

  One more: **`stddev` is NULL on every 2024 row and populated on every 2026 row.** Historical
  seasons predate the column and were never re-run, so the documented "mean ± 3σ" consumer pattern
  silently has no σ before the current season.
- **Expected vs actual:** not quantified — separating the mean-of-ratios effect from the
  qualification-truncation effect would need a pooled-rate recomputation per season, which I did not
  spend a query on.
- **Fix:** compute pooled rates (`SUM(num) / SUM(den)` across qualified players) alongside the
  existing per-player mean, store both under distinct metric keys, and state in the column comment
  which one each plus stat uses. Add `pitch_type NOT IN ('PO','IN')` and `game_type = 'R'` to the
  `per_pitcher`/`per_hitter` CTEs so the benchmark and the metric share a population. Fix
  `scripts/create-league-averages.sql:9`.
- **Confidence:** verified (code and stored values); magnitude *estimated*.

---

## F11. Stuff+'s `COALESCE(…, 0)` scores a pitch with missing movement as league-average movement

- **Impact:** medium — `pitches.stuff_plus` on 8.9M rows, the Arsenal tab, and the Stuff+
  leaderboard. Pitches with missing `pfx_x`/`pfx_z` or `release_extension` are scored as if their
  movement or extension were exactly league average, pulling them toward 100. The client-side
  fallback refuses to score the same pitches, so the two implementations disagree on which pitches
  even *have* a Stuff+.
- **Location:** `app/api/update/route.ts:320-333` vs `lib/leagueStats.ts:1176-1195`
- **What's wrong:** the DB scorer's WHERE clause requires only `p.release_speed IS NOT NULL`. Each
  z-term is wrapped in `COALESCE(…, 0)`, so a NULL `pfx_x` makes the movement z-score NULL, which
  becomes 0, which reads as "exactly league-average movement":

  ```sql
  + COALESCE((SQRT(POWER(p.pfx_x * 12, 2) + POWER(p.pfx_z * 12, 2)) - b.avg_movement) / NULLIF(b.std_movement, 0), 0) * 3.5
  ```

  The comment in `computeStuffRV` says the guard exists for zero/NaN *baseline* stddev — a real and
  correct concern — but the `COALESCE` also swallows a NULL *input*, which is a different case with a
  different right answer.

  The client version takes the opposite position: it returns `null` when `pfx_x`/`pfx_z` are missing,
  and separately imputes `release_extension ?? bl.avg_ext`. So the two agree on extension imputation
  and disagree on movement.

  There is a related population defect one function up. `refreshPitchBaselines` (`:262-266`) computes
  baselines only over rows where release_speed, pfx_x, pfx_z **and** release_extension are all
  non-null; `applyStuffPlusForDateRange` scores every row with release_speed non-null. The scored
  population is a strict superset of the baseline population.

  Finally, `calcArsenal` (`lib/pitcherStats.ts:290-295`) picks between the two implementations by a
  coverage heuristic — `dbStuffPlusVals.length > pitches.length * 0.5` — so a single Arsenal cell can
  flip between the two conventions, and between two different baseline sources, based on whether DB
  coverage happens to clear 50%.
- **Evidence:** code read across the three sites. I did not run a coverage query; the *rate* of NULL
  movement given non-NULL velocity is unmeasured here.
- **Expected vs actual:** not quantified.
- **Fix:** decide once. Recommended: refuse to score. Add
  `AND p.pfx_x IS NOT NULL AND p.pfx_z IS NOT NULL AND p.release_extension IS NOT NULL` to the
  UPDATE's WHERE clause, which makes the scored population equal the baseline population and removes
  the need for input-level `COALESCE`. Keep the `NULLIF(std, 0)` guard — that one is right. Then
  remove the coverage heuristic in `calcArsenal` and use the DB value or nothing.
- **Confidence:** verified (code); impact *estimated*.

---

## F12. `avg_woba` uses the wrong wOBA denominator, and it feeds wRC+

- **Impact:** medium — wOBA on every leaderboard and in `league_averages`, and through it wRC+ in
  `app/api/scene-stats/route.ts` (four call sites). wOBA is understated by roughly 0.75% relative;
  wRC+ inherits a systematic bias of about **−1.6 points**.
- **Location:** `lib/reportMetrics.ts:39`; `app/api/scene-stats/route.ts:1668`; `lib/sql.ts:53-61`
- **What's wrong:** `AVG(woba_value)` divides by every row where `woba_value` is non-null. Statcast
  populates `woba_value` on all PA-terminating rows, including intentional walks, sacrifice bunts,
  catcher's interference and truncated PAs — all of which carry a `woba_denom` of 0 and are excluded
  from the published wOBA denominator (AB + uBB + SF + HBP). `pitches` has no `woba_denom` column in
  the selected column set, so the correct denominator has to be reconstructed from `events`.

  The consequence for wRC+ is the one that matters, because `computeWRCPlus` compares Triton's
  differently-denominated wOBA against FanGraphs' `SEASON_CONSTANTS.woba`, which uses the standard
  denominator. Both sides of the comparison are not computed the same way.

  Two smaller issues at the same call sites: `PARK_FACTORS[team]?.basic || 100` silently substitutes
  a neutral park for an unmapped team key, and `MODE() WITHIN GROUP (ORDER BY batting_team)` assigns
  a single park factor to a player traded mid-season.
- **Evidence:** June 2024 — 30,047 rows carry a non-null `woba_value`; the rows that should be
  excluded are `intent_walk` 71 + `catcher_interf` 18 + `truncated_pa` 55 + `sac_bunt` 79 = **223**,
  so the denominator is 0.75% too large. Confirming that the underlying values are sane:
  `AVG(woba_value)` for the walk/HBP bucket is 0.6922 over 2,732 rows, which reconciles with the
  2024 uBB weight of .689 and HBP weight of .720 once the 71 zero-valued intentional walks are
  accounted for.
- **Expected vs actual:** at a league wOBA of .310, the denominator inflation costs about 0.0023 of
  wOBA. Through `computeWRCPlus` with 2024 constants (`woba_scale` 1.242, `r_pa` .117), that is
  `(0.0023 / 1.242) / 0.117 × 100 = 1.58` points of wRC+, applied to every hitter in the same
  direction. `league_averages` 2024 MLB hitter `avg_woba` is stored as **.319** against a true league
  wOBA of **.310** — most of that 9-point gap is the qualification truncation in F10, not this.
- **Fix:**

  ```sql
  avg_woba: "ROUND((SUM(woba_value) / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('intent_walk','sac_bunt','catcher_interf','truncated_pa')), 0))::numeric, 3)"
  ```

  Apply the same shape at `scene-stats/route.ts:1668` before the value reaches `computeWRCPlus`.
- **Confidence:** verified for the denominator defect; the 1.58-point wRC+ figure is *computed* from
  the published formula, not measured against a reference wRC+ leaderboard.

---

## F13. `refresh_league_averages` uses 2025 constants for the 2026 season while the app uses 2026 constants

- **Impact:** medium — FIP, xFIP and xERA for the **current season** are computed in JS against one
  set of season constants and benchmarked in `league_averages` against another. The metric and its
  own league average are on different scales.
- **Location:** `refresh_league_averages` `CASE p_season … ELSE v_cfip := 3.135; v_lg_era := 4.10;
  v_lg_woba := 0.313; v_woba_scale := 1.232; v_lg_hr_fb := 0.110; END CASE` vs
  `lib/constants-data.ts:22`
- **What's wrong:** the DB `CASE` enumerates 2015 through 2024 and falls through for everything else.
  Those `ELSE` values are exactly the 2025 row, so 2025 is correct by coincidence. **2026 is not.**
  `lib/constants-data.ts` has a real 2026 row: `cfip 3.138, lg_era 4.18, woba .320, woba_scale 1.256,
  lg_hr_fb .109`. I verified 2015–2024 match the DB exactly, so this is a maintenance gap that opened
  when 2026 was added to the TypeScript and not to the SQL.

  Related: `lib/expected-stats.ts:19` falls back to `SEASON_CONSTANTS[2025]` for any unknown year, so
  2027 will silently use 2025 constants with no warning at either layer.
- **Evidence:** side-by-side read of both constant tables this session.
- **Expected vs actual:** for a pitcher with xwOBA .300 and PA/IP ≈ 4.0, xERA computed in JS with
  2026 constants is **3.61**; the same pitcher's benchmark inside `league_averages` is built with
  2025 constants, which for that input gives **3.72**. A **0.11-run** offset that is pure
  constants-vintage drift. FIP's offset is smaller — cfip differs by 0.003.
- **Fix:** stop maintaining two copies. Either add 2025 and 2026 branches to the DB `CASE` in the
  same commit that adds them to `constants-data.ts`, or — better — move `SEASON_CONSTANTS` into a
  `season_constants` table and have both the SQL function and the TypeScript read from it. Replace
  the silent `|| SEASON_CONSTANTS[2025]` fallback with a thrown error or a NULL result.
- **Confidence:** verified.

---

## F14. `total_re24`'s sign is inverted relative to the published pitcher convention

- **Impact:** low-medium — the RE24 column on the pitching Traditional and Advanced leaderboards, and
  in team views. The number is correct in magnitude but its sign is opposite to what a reader
  familiar with FanGraphs expects for a pitcher.
- **Location:** `lib/reportMetrics.ts:40`; the color helper at `lib/leaderboardColumns.ts:70-76`
- **What's wrong:** `SUM(delta_run_exp)` sums Statcast's run-expectancy delta, which is signed from
  the **batting team's** perspective. FanGraphs reports pitcher RE24 with the sign flipped so that
  positive means runs saved. Triton passes the raw sum through under the label "RE24."
  `re24Color` compensates by treating negative as good when `view === 'pitching'`, so the color is
  right and the number is upside down — which is arguably worse than both being wrong, because the
  color reassures the reader that the sign is intended.
- **Evidence:** Skubal 2024, all game types: `SUM(delta_run_exp)` = **−41.4**. He was the Cy Young
  winner; FanGraphs reports his RE24 as a large positive.
- **Expected vs actual:** Triton displays **−41.4**; the pitcher-convention value is **+41.4**.
- **Fix:** negate for the pitching view — `total_re24_pitching: 'ROUND(-SUM(delta_run_exp)::numeric, 1)'`
  — and flip `re24Color` to treat positive as good in both views. Alternatively keep the sign and
  relabel the column "RE24 (batter perspective)"; do not leave the label ambiguous.
- **Confidence:** verified (the sign is measured); the FanGraphs convention is *established*.

---

## F15. `squared_up_rate` and `blast_rate` use release speed and a non-standard coefficient

- **Impact:** low-medium — Sq Up% and Blast% on the hitting Batted Ball leaderboard and in
  `league_averages`. The rate is biased upward relative to Savant's published figure, and the
  denominator is a third population that Savant does not publish.
- **Location:** `lib/reportMetrics.ts:73-74`; identical expressions in `refresh_league_averages`
- **What's wrong:** three separate departures from the published definition, all in the same
  expression:

  ```sql
  launch_speed >= 0.8 * (1.23 * bat_speed + 0.23 * release_speed)
  ```

  1. Savant's maximum-possible-EV model uses the pitch speed **measured at the plate**, not at
     release. Release speed runs roughly 8–9% higher, so the threshold is set too high and the rate
     comes out too low — this one biases downward.
  2. The pitch-speed coefficient in the published collision model is 0.2116, not 0.23 — again a
     threshold set too high.
  3. The denominator is `bat_speed IS NOT NULL AND bb_type IS NOT NULL`, i.e. **batted balls**.
     Savant publishes squared-up rate per *swing* and per *bat contact*; contact includes fouls,
     which have a bat speed and no `bb_type`. Excluding fouls raises the rate, because fouls are
     disproportionately not squared up. This one biases upward and is the largest of the three.

  `blast_rate` compounds it: Triton defines a blast as squared-up ∧ `bat_speed >= 75`. The 75 mph
  fast-swing threshold is correct, but Savant's published blast is a sliding combination of
  squared-up rate and swing speed, not the intersection of two thresholds.
- **Evidence:** code read; I did not run a query against a reference Savant leaderboard.
- **Expected vs actual:** not quantified — establishing the direction and size of the net bias needs
  a comparison against Savant's published per-player values, which is a separate exercise.
- **Fix:** substitute the plate-speed coefficient and the correct denominator, and if `pitches` has
  no plate-speed column, derive it from `vx0/vy0/vz0` at `y = 17/12` rather than approximating with
  release speed. Whatever you choose, name the denominator in the column tip — "per batted ball" and
  "per swing" are different metrics and should not both be called Sq Up%.
- **Confidence:** probable (the coefficient and denominator differences are certain; the net
  direction is not).

---

## F16. `pitch_type NOT IN ('PO','IN')` silently drops NULL-pitch-type rows, including PA-terminating ones

- **Impact:** low — a small, invisible haircut on `pitches`, `pa`, `k_count`, `bb_count`, `h` and
  `ip` in every report and on the player page.
- **Location:** `lib/reportQueryBuilder.ts:139`; `app/api/player-data/route.ts:44`;
  `lib/sql.ts:122` and `:178`
- **What's wrong:** in SQL, `NULL NOT IN ('PO','IN')` evaluates to NULL, not TRUE, so the predicate
  excludes every row with a NULL `pitch_type`. That population is mostly `automatic_ball` and
  `automatic_strike` — pitch-clock and ABS-challenge outcomes that are not pitches, so excluding them
  from a *pitch* count is defensible. But some of those rows terminate a plate appearance (an
  automatic ball four is a walk), and dropping them removes the PA outcome as well.
- **Evidence:** June 2024, 116,355 rows — 416 with NULL `pitch_type`, of which **104 carry a non-null
  `events`**. Only 7 rows in the month have `pitch_type IN ('PO','IN')` at all, and **none** of those
  terminate a PA, so the filter's stated purpose costs nothing and its side effect costs 104 plate
  appearances (0.35% of the month's 30,047).
- **Expected vs actual:** report-level PA is low by roughly **0.35%** relative to the same window
  computed without the filter.
- **Fix:** `(pitch_type IS NULL OR pitch_type NOT IN ('PO','IN'))` for outcome metrics; keep the
  strict form only where the denominator is genuinely "pitches thrown." Simplest correct version is
  to make it explicit: `COALESCE(pitch_type, '') NOT IN ('PO','IN')`.
- **Confidence:** verified.

---

## F17. Signed movement and direction values are averaged across mixed handedness

- **Impact:** low for single-player views, high for any grouped view — `avg_hbreak_in` and
  `avg_attack_direction` cancel toward zero whenever the group mixes right- and left-handed pitchers
  or batters. Team rows and unfiltered leaderboards are the exposed cases.
- **Location:** `lib/reportMetrics.ts:16` (`AVG(pfx_x * 12)`) and `:70`
  (`AVG(attack_direction)`); same expressions in `refresh_league_averages`
- **What's wrong:** `pfx_x` is signed from the catcher's perspective, so a right-hander's arm-side
  run and a left-hander's are opposite in sign and equal in meaning. `AVG()` over a mixed group
  returns something near zero that is not the average horizontal break of anything.
  `attack_direction` has the same structure for batter handedness. `avg_ivb_in` (`pfx_z`) is not
  affected — vertical break is unsigned by handedness.
- **Evidence:** code read; the mechanism is definitional.
- **Expected vs actual:** not measured — the size depends entirely on the handedness mix of the
  group.
- **Fix:** store and average the handedness-normalised form,
  `AVG(pfx_x * 12 * CASE WHEN p_throws = 'L' THEN -1 ELSE 1 END)`, and relabel the column
  "Arm-side break." Where the raw catcher-perspective value is genuinely wanted, expose it as a
  separate key and require a `p_throws` filter.
- **Confidence:** verified (code); magnitude *estimated*.

---

## F18. `_sos` mixes expected and actual wOBA in one numerator and is scaled on ×10

- **Impact:** low-medium — the SOS column on the pitching and hitting Advanced leaderboards.
- **Location:** `app/api/update/route.ts:386-425`
- **What's wrong:** the leave-one-out construction is sound — opponent xwOBA excluding the matchup in
  question, regressed to league mean with a fixed constant, then usage-weighted. Two problems inside
  it. First, `SUM(COALESCE(estimated_woba_using_speedangle, woba_value))` substitutes the *actual*
  wOBA outcome whenever the expected value is missing, so the numerator is a mixture of two different
  quantities; the substitution fires on intentional walks, sacrifice bunts, catcher's interference,
  truncated PAs and untracked batted balls (167 of 20,622 batted balls in June 2024). Second, the
  denominator is `COUNT(*)` over rows with non-null `events`, which includes `truncated_pa` (F7).
  Third, the final scaling is `100 + (…/lg_std) * 10` — a ×10 plus stat — but the column is coloured
  by `plusColor`, whose thresholds assume ×15 (see F8).
- **Evidence:** code read; the 167/20,622 untracked rate is measured.
- **Expected vs actual:** not quantified.
- **Fix:** drop the `COALESCE` and divide by the count of rows where `estimated_woba_using_speedangle`
  is non-null, so the metric is unambiguously expected-wOBA-faced. Pass the ×10 scale explicitly to
  the color helper.
- **Confidence:** verified (code); impact *estimated*.

---

## Metrics I checked and found correct

Verified against the actual `events` and `description` vocabularies present in `pitches`
(enumerated for June 2016 and June 2024) unless noted.

**Plate discipline — all correct.**
- `whiff_pct` (`reportMetrics.ts:27`) — whiffs / swings. The swing denominator
  (`%swinging_strike%` ∪ `%foul%` ∪ `hit_into_play%` ∪ `missed_bunt` ∪ `swinging_pitchout`) is
  exhaustive: the only `foul`-containing descriptions in the data are `foul`, `foul_tip`,
  `foul_bunt` and `bunt_foul_tip`, and the only `hit_into_play` value is `hit_into_play` itself
  (`hit_into_play_no_out` / `hit_into_play_score` have been retired and cost nothing to keep).
  Numerator and denominator use *consistent* filters. This is the classic trap and it is not present.
- `swstr_pct` (`:57`) — swinging strikes / all pitches. Correctly distinct from whiff rate.
- `csw_pct` (`:28`) — (called strikes + swinging strikes) / pitches. Correctly excludes `foul_tip`.
- `zone_pct` (`:29`) — zone 1–9 over rows with non-null zone. Statcast codes in-zone as 1–9 and
  out-of-zone as 11–14; the `> 9` and `BETWEEN 1 AND 9` boundaries are both right.
- `chase_pct` (`:30`) — swings on out-of-zone pitches / **all** out-of-zone pitches. This is O-Swing%
  as published; the denominator trap (dividing by out-of-zone *swings*) is not present.
- `z_swing_pct` (`:62`), `contact_pct` (`:61`), `o_contact_pct` (`:63`) — correct. `contact_pct`'s
  explicit IN-list denominator resolves to exactly the same set as `whiff_pct`'s LIKE-based one in
  the observed vocabulary, so the two are consistent complements.

**Batted ball — all correct.**
- `gb_pct`, `fb_pct`, `ld_pct`, `pu_pct` (`:42-45`) — each over `bb_type IS NOT NULL`, i.e. as a
  share of batted balls, matching Savant. The four `bb_type` values are exactly
  `ground_ball`/`fly_ball`/`line_drive`/`popup`.
- `hard_hit_pct` (`:58`) — EV ≥ 95 over batted balls. Correct; note that untracked batted balls sit
  in the denominator and can never enter the numerator, which deflates the rate by the untracked
  rate (0.44% in June 2024).
- `barrel_pct` (`:59`) — `launch_speed_angle = 6` over non-null `launch_speed_angle`. Correct.
- `avg_ev`, `max_ev`, `avg_la`, `avg_dist` in **SQL** (`:20-23`) — correct. The JS copies are not
  (F9).

**Expected stats.**
- `avg_xba` (`:36`) — `SUM(estimated_ba_using_speedangle) / AB`. Correct construction: the column is
  NULL on strikeouts, so they contribute 0 through the denominator, which is exactly Savant's
  definition. (The AB denominator itself has the F7 defect.)
- `avg_xwoba` (`:37`) — `AVG(estimated_woba_using_speedangle)`. Correct, and correct for a
  non-obvious reason: unlike xBA and xSLG, this column *is* populated on strikeouts (0.0000) and on
  unintentional walks/HBP (0.6935), and is NULL on intentional walks — which is precisely the wOBA
  denominator convention. 167 of 20,622 batted balls are untracked and drop out of both sides.

**Rate stats.**
- `k_pct` (`:25`) — `events LIKE '%strikeout%'` over distinct plate appearances. The LIKE matches
  exactly `strikeout` and `strikeout_double_play`, which is the complete strikeout vocabulary. K/PA
  is the published definition; the trap of using batters-faced-minus-something or a pitch count is
  not present. Only defect is `truncated_pa` in the denominator (F7).
- `k_minus_bb` (`:56`) — same denominator on both terms. Correct.
- `pa` (`:8`) — distinct `game_pk * 10000 + at_bat_number`. Correct key construction, and the same
  expression is used in the `minPA` HAVING clause (`reportQueryBuilder.ts:148`), so the filter and
  the displayed value agree.
- `obp` (`:34`) — denominator correctly *excludes* sacrifice bunts and catcher's interference while
  *including* sacrifice flies. That is the published rule and it is easy to get wrong.
- `ip` in `refresh_league_averages` uses the right *event whitelist*; only the out-weighting is wrong
  (F3).
- `computeFIP` (`lib/sql.ts:35`) and `calcFIP` (`lib/expected-stats.ts:34`) — the 13/3/−2 coefficients
  and the cFIP constant are correct and match each other.
- `calcXFIP` (`:44`) — correct: expected HR = FB × league HR/FB, substituted into the FIP numerator.
- `computeXERA` / `calcXERA` — correct implementation of the FanGraphs run-value scaling; the two
  implementations agree with each other. Their inputs disagree (F13).
- `computeWRCPlus` (`lib/sql.ts:53-61`) — the formula
  `(((wOBA − lgwOBA)/scale + r_pa) / ((pf/100)·r_pa)) × 100` is correct as written. Its wOBA input is
  not (F12).

**Aggregation and helpers.**
- `pivotTritonRows` (`lib/sql.ts:64-90`) — pitch-weighted mean across pitch types, and the weight
  accumulator correctly only advances when the value is non-null (`:79`), so a pitch type with a
  missing metric does not dilute the average. This is the one weighted aggregation in the codebase
  that is done right.
- `getLeagueBaseline`'s no-year path (`lib/leagueStats.ts:1250-1256`) — pools stddev by averaging
  *variances* and taking the square root, with a comment explaining why averaging stddevs is wrong.
  Correct.
- `empiricalPercentile` (`:1287-1300`) — binary search over 99 breakpoints, clamped to [1, 99], with
  the `higherBetter` inversion as `100 - rawPct`, which stays inside the clamp. Correct.
- `normalCDF` (`:1327`) — standard Abramowitz & Stegun 7.1.26 approximation, correctly applied with
  `|z|/√2` and sign restoration. Correct.
- `computeStuffRV`'s `NULLIF(std, 0)` / `std > 0 && isFinite(std)` guards — correct treatment of a
  degenerate baseline. (Its treatment of degenerate *inputs* is F11.)
- `calcTotalsFromRegistry`'s `case 'ip'` (`lib/metricRegistry.ts:678-685`) — correctly converts
  base-3 IP strings to outs, sums, and converts back. The base-3 convention is handled properly in
  exactly this one place.
- `parseIP` (`lib/expected-stats.ts:23-28`) — correct base-3 → decimal conversion.
- The SP/RP rule as *implemented* in `refresh_league_averages`
  (`COUNT(*) FILTER (WHERE pc >= 50) >= 3`) matches the canonical convention. Only the DDL comment is
  wrong (F10.4).
- `fpsPct` (`lib/pitcherStats.ts:157-162`) — first-pitch strikes over `pitch_number = 1`, with a
  strike set that correctly includes fouls and balls in play and excludes HBP. Correct.
- `ideal_attack_angle_rate` (`reportMetrics.ts:75`) — attack angle in [5°, 20°] over swings with a
  tracked attack angle. Matches the published definition.
- `fast_swing_rate` (`:72`) — bat speed ≥ 75 mph. Threshold is correct; the denominator is all
  tracked swings rather than "competitive" swings, a minor departure.

---

## What I could not determine

- **The size of the Career-row error (F6).** I established the mechanism and the internal
  contradiction from code alone, but did not pull a multi-season player to produce a measured
  expected-vs-actual pair. That would be one query.
- **The NULL rate of `pfx_x`/`pfx_z` and `release_extension` given non-NULL `release_speed` (F11).**
  Without it I cannot say how many of the 8.9M `stuff_plus` values were scored with an imputed
  league-average movement or extension term. One query, chunked by `game_year`.
- **The net direction and size of the `squared_up_rate` bias (F15).** Three departures from the
  published definition push in two directions. Settling it requires comparing Triton's per-player
  values against Savant's published squared-up rate for the same players, which is an external
  reference exercise, not a SQL query.
- **Whether the pooled-rate vs mean-of-ratios gap in `league_averages` (F10) is material.** I
  confirmed the construction and read the stored values, but separating that effect from the
  qualification-truncation effect needs a per-season pooled recomputation.
- **`milb_pitches` formula parity.** `refresh_league_averages` normalises MiLB Title-Case events
  through a `CASE` map before applying the same expressions, and that map collapses
  `Groundout`/`Flyout`/`Lineout`/`Pop Out` into a single `field_out`. Whether the MiLB column
  currently holds Title Case, snake_case, or both is a data-state question I did not query — it
  belongs to **Jo**. The formula consequence, if both vocabularies are present, is that the `ELSE
  events` fallback passes snake_case straight through and the metrics are correct for those rows,
  while any *other* Title-Case value not in the map falls through unmapped and is silently excluded
  from every whitelist. That is worth a follow-up.
- **Two `Split-Finger` rows at 3 pitches each** appeared in the usage query for a pitcher who does
  not throw one. That is pitch-classification noise from Savant, not a formula defect, but it does
  mean `pitch_baselines` carries rows keyed on misclassified pitch names. Whether that materially
  moves a baseline is **Soto**'s call on the classification and mine on the resulting z-scores; I did
  not pursue it.

**Handoffs.** F4's `game_type` fix is a restatement of every stored `league_averages` row —
coordinate the backfill with **Jo**. The IP display-convention half of F3, the missing sample sizes
behind every rate in this report, and the `plusColor` ramp shared across four different scale
constants (F8) are presentation decisions for **Cas** once the formulas are settled. Whether SIERA
and xSLG should be on the platform at all, given how little either adds next to xwOBA, is a question
for **Soto**.

**Highest-leverage next action:** delete the `−0.986 × ln(IP)` term from all three SIERA
implementations and fix `avg_xslg` in all three places, in one commit, with `docs/VARIABLES.md`
updated in the same commit and a golden-file test that asserts league-average SIERA lands in
[3.0, 5.5] and league-average xSLG in [0.35, 0.45]. Those two metrics are currently displaying
values that are not merely imprecise but outside the range the statistic can take.
