# Slice 06 — Aggregation Grain & Weighting

**Verdict.** Triton has two career-totals implementations that disagree with each other, and the wrong
one is on the two most-visited pages. `HistoricalOverviewTab.careerTotals` recomputes every rate from
summed numerators and denominators — correct, and the model to copy. `calcTotalsFromRegistry`
(`lib/metricRegistry.ts:643`) and `HitterOverviewTab.calcTotals`
(`components/dashboard/HitterOverviewTab.tsx:160`) instead take an unweighted mean across rows, so
every rate on the pitcher and hitter dashboards' "Career" line is a mean-of-ratios where a
ratio-of-sums is required. Verified on Kodai Senga (MLBAM 673540, 2023–26 regular season, n = 1,432
PA): the page shows a career BA-against of **.199** and a career K% of **30.5%**; the correct pooled
values are **.218** and **26.4%** — 19 points of batting average and 4.1 points of K% created by a
20-PA injury season carrying 25% of the weight. The same function is reused for the Arsenal tab,
where the rows are pitch types rather than seasons, and the damage is larger: Senga's 2025 arsenal
totals row reads **79.7 mph** against a true pitch-weighted **87.8 mph**, and its Usage% column reads
**12.5%** instead of 100%. Across all 406 pitchers with ≥500 pitches in 2026 the arsenal velocity
error averages **−1.22 mph** (p90 3.07, max 6.98). Three further grain defects are live: the Splits
tab divides hits by plate appearances and calls it BA (27 points low, and it compresses Senga's true
27-point platoon split to 15); the percentile panel ranks a career-pooled value against
single-season breakpoints that exist only for 2026, silently rendering every other season at exactly
the 50th percentile; and the traditional table's W/L/ERA/SV/GS/WHIP come from `mlbStats.find()`,
which for a mid-season trade returns only the first stint — Rich Hill's 2023 renders as **4.76 ERA,
7-10** instead of **5.41, 8-14**. The pooled SQL path (`/api/report`) is correct; the JavaScript
rollups are not.

Evidence grades: **verified** = read in source this session and/or computed on Triton data this
session; **probable** = mechanism read in source, magnitude estimated; **suspected** = mechanism
read, reachability not confirmed. 14 read-only queries run against project `xgzxfsqwtemlcosglhzr`.

---

## F1. Career rate stats are an unweighted mean of season rates, not a recomputed rate

- **Impact:** critical — every rate on the "Career" row of the pitcher dashboard (Overview →
  Traditional and Advanced) and the hitter dashboard (Traditional, Advanced). Affected keys:
  `ba`, `obp`, `slg`, `ops`, `whip`, `era`, `kPct`, `bbPct`, `kbbPct`, `whiffPct`, `swStrPct`,
  `csPct`, `fpsPct`, `zonePct`, `xBA`, `xwOBA`, `xSLG`, `wOBA`, `gbPct`, `fbPct`, `ldPct`, `puPct`,
  `k9`, `bb9`, `hr9`, `fip`, `xfip`, `xera`, `siera`, plus every plus-stat. Measured error on a real
  pitcher: **19 points of BA, 18 points of OBP, 19 points of OPS, 4.1 points of K%.**
- **Location:** `lib/metricRegistry.ts:643-691` (`calcTotalsFromRegistry`), specifically the
  `case 'avg'` at `:663-670`; consumed at `components/dashboard/OverviewTab.tsx:202`.
  Parallel implementation at `components/dashboard/HitterOverviewTab.tsx:160-178`, consumed at `:287`.
- **What's wrong:** `calcTotalsFromRegistry` does
  `const vals = rows.map(r => parseFloat(r[key])).filter(v => !isNaN(v))` (`:654`) and then
  `sum / vals.length`. The weight column the metric needs — `pa`, `ab`, `pitches`, `ip` — is present
  on the very row object one line earlier and is discarded. 48 of the 69 `MetricDef` entries carry
  `totals: 'avg'`; for the ~29 that are ratios, the estimator is wrong whenever the season
  denominators differ, which is always. `HitterOverviewTab.calcTotals` reproduces the same logic
  with a hardcoded `pctFields` list.
- **Evidence:** source read this session (line numbers above). Computed on `pitches`, `pitcher =
  673540`, `game_type = 'R'`, `pitch_type NOT IN ('PO','IN')`, grouped by `game_year`, using the
  page's own definitions (`AB = PA − BB − HBP − SF − SH`, `PA = COUNT(*) FILTER (events IS NOT
  NULL)`, `bb = events LIKE '%walk%'`, `k = events LIKE '%strikeout%'`).

  | Season | PA | AB | BA | OBP | SLG | OPS | K% |
  |---|---:|---:|---:|---:|---:|---:|---:|
  | 2023 | 696 | 609 | .207 | .300 | .325 | .625 | 28.9 |
  | 2024 | **20** | **18** | .111 | .200 | .278 | .478 | **45.0** |
  | 2025 | 482 | 423 | .222 | .315 | .392 | .707 | 22.4 |
  | 2026 | 234 | 195 | .256 | .376 | .492 | .868 | 25.6 |

- **Expected vs actual (Kodai Senga, 673540, 2023–26 regular season, n = 1,432 PA / 1,245 AB):**

  | Metric | Triton "Career" row | Correct (pooled) | Error |
  |---|---:|---:|---:|
  | BA against | **.199** | .218 | −19 pts (−8.7%) |
  | OBP against | **.298** | .316 | −18 pts |
  | SLG against | **.372** | .373 | −1 pt |
  | OPS against | **.670** | .689 | −19 pts |
  | K% | **30.5%** | 26.4% | +4.1 pts (+15.5%) |
  | BB% | **10.6%** | 11.7% | −1.1 pts |

  The driver is the 2024 injury season: 20 PA, **1.4% of career PA, given 25% of the weight.**
  The error is not bounded by anything — it grows with the ratio of the largest to smallest season
  denominator. A control case with uniform seasons (Aaron Nola, 605400, 12 seasons, 7,617 PA) shows
  BA .239 vs .237 and K% 26.4 vs 26.4, i.e. the bug is invisible on exactly the players who would
  expose it least.
- **Fix:** change `TotalsStrategy` from a bare enum to a discriminated union that names the weight:
  `{ kind: 'ratio'; num: string; den: string }` for `ba`/`obp`/`slg`/`ops`/`whip`/`era`/`kPct`/
  `bbPct`/`kbbPct`/`whiffPct`/`swStrPct`/`csPct`/`fpsPct`/`zonePct`, and
  `{ kind: 'avg'; weightedBy: 'pitches' | 'pa' | 'ab' | null }` for the physical means and plus-stats.
  `calcTotalsFromRegistry` must render `—` plus a reason code when the declared weight column is
  absent from the row, so a missing denominator becomes structurally impossible instead of silently
  substituted. `HistoricalOverviewTab.careerTotals` (`components/dashboard/HistoricalOverviewTab.tsx:48-107`)
  already does this correctly for the Lahman page and is the reference implementation. One file
  fixes both dashboards. `docs/VARIABLES.md` gets the weight basis per metric in the same commit.
- **Confidence:** verified.

---

## F2. The Arsenal / vs-Pitch-Type totals row averages across pitch types with equal weight

- **Impact:** critical — the pitcher dashboard's Arsenal tab totals row and the hitter dashboard's
  vs-Pitch-Type totals row. Affected columns: `usagePct`, `avgVelo`, `avgSpin`, `hBreak`, `vBreak`,
  `ext`, `armAngle`, `whiffPct`, `csPct`, `avgEV`, `xBA`, `brink`, `cluster`, `brinkPlus`,
  `clusterPlus`, `stuffPlus` (pitcher); `facedPct`, `avgVelo`, `whiffPct`, `ba`, `avgEV`, `avgLA`,
  `xBA`, `xwOBA` (hitter). Measured error on a real pitcher-season: **8.1 mph of average velocity,
  3.0 points of Stuff+, and a Usage% column that reads 12.5% where it must read 100%.**
- **Location:** `components/dashboard/OverviewTab.tsx:202` feeding `calcTotalsFromRegistry` with
  `arsenalRows` from `lib/pitcherStats.ts:246-311` (`calcArsenal`, one row per `pitch_name`);
  `components/dashboard/HitterOverviewTab.tsx:287` with `vsPitchRows`.
- **What's wrong:** the same `case 'avg'` from F1, but the sub-rows are pitch types rather than
  seasons, and pitch-type usage spans two orders of magnitude within one pitcher. A single Eephus
  weighs the same as a 599-pitch four-seamer. Three compounding faults:
  1. `usagePct` has `totals: 'avg'` (`lib/metricRegistry.ts:273-279`), so the totals row shows the
     mean of the usage shares — mathematically `100 / n_pitch_types`, never 100%.
  2. `hBreak` averages a signed quantity across pitch types whose break signs oppose, so arm-side
     and glove-side movement cancel at the wrong ratio.
  3. Each column's mean is taken over a *different* row count, because `vals` filters NaN per column
     — Senga's Eephus has no swings, so Whiff% averages over 7 pitch types while Velo averages over 8.
  4. The `name` column is `totals: 'none'`, which prints the literal string **"Career"** on a table
     whose rows are pitch types inside one selected season.
- **Evidence:** source read this session; computed on `pitches` for `pitcher = 673540`,
  `game_year = 2026 … 2025`, `game_type = 'R'`.

  | Pitch | n | Usage% | Velo | HB (in) | Spin | Stuff+ | Whiff% |
  |---|---:|---:|---:|---:|---:|---:|---:|
  | 4-Seam Fastball | 599 | 31.5 | 94.7 | −7.6 | 2380 | 99.9 | 17.6 |
  | Forkball | 540 | 28.4 | 82.5 | −10.0 | 1193 | 100.0 | 39.7 |
  | Cutter | 386 | 20.3 | 89.6 | −1.0 | 2470 | 99.4 | 14.2 |
  | Sweeper | 118 | 6.2 | 79.6 | 9.3 | 2553 | 90.9 | 12.5 |
  | Sinker | 114 | 6.0 | 88.6 | −15.8 | 2210 | 90.6 | 12.5 |
  | Slider | 111 | 5.8 | 83.2 | 1.5 | 2460 | 93.1 | 42.2 |
  | Curveball | 32 | 1.7 | 68.5 | 4.7 | 2440 | 83.9 | 60.0 |
  | Eephus | **1** | 0.1 | 50.7 | −5.4 | 1105 | 103.0 | — |

- **Expected vs actual (Kodai Senga, 673540, 2025 regular season, n = 1,901 pitches):**

  | Column | Triton totals row | Correct (pitch-weighted / pooled) | Error |
  |---|---:|---:|---:|
  | Usage% | **12.5%** | 100.0% | −87.5 pts |
  | Velo | **79.7 mph** | 87.8 mph | −8.1 mph |
  | Stuff+ | **95.1** | 98.0 | −2.9 |
  | Whiff% | **28.4%** | 25.4% | +3.0 pts |
  | HB | **−3.0 in** | −5.6 in | +2.6 in |
  | Spin | **2101 rpm** | 2067 rpm | +34 rpm |

  Population check, `game_year = 2026`, `game_type = 'R'`, 406 pitchers with ≥500 pitches
  (mean 5.2 pitch types each): mean **signed** velocity error **−1.22 mph**, mean absolute error
  1.49 mph, p90 3.07 mph, max **6.98 mph**. Mean signed Stuff+ error −0.22, max absolute 7.15. The
  bias is systematically negative because rarely-thrown pitches are slower.
- **Fix:** in the arsenal/vs-pitch-type context every `'avg'` column must be weighted by `count`
  (the row already carries it), `usagePct` must be `'sum'` (which yields 100.0 and is a real
  identity check), rate columns must be recomputed from their own numerators and denominators, and
  the first-column label must read "All Pitches", not "Career". Per `Li/statistical-inference/11`,
  publish the per-pitch-type values as primary and label any aggregate as mix-weighted — the
  aggregate is a usage statement wearing a stuff label.
- **Confidence:** verified.

---

## F3. Splits tab divides hits by plate appearances and labels the column BA

- **Impact:** high — every BA cell on the pitcher dashboard's Splits tab (platoon, count, inning,
  times-through-order). Understated by **21–33 points**, and it compresses the platoon split — the
  entire purpose of the tab — by **44%**.
- **Location:** `components/dashboard/SplitsTab.tsx:46` —
  `ba: pas > 0 ? f(hits / pas, 3) : '—'`.
- **What's wrong:** `pas` is `pitches.filter(p => p.events).length`, i.e. plate appearances. Batting
  average requires at-bats: `PA − BB − HBP − SF − SH`. Every other surface in the repo uses AB
  (`lib/pitcherStats.ts:101`, `lib/reportMetrics.ts:32`), so the Splits tab disagrees with the
  Overview tab for the same player, same filter, same season — a fast identity failure.
- **Evidence:** source read this session; computed on `pitches`, `pitcher = 673540`,
  `game_year = 2025`, `game_type = 'R'`, `pitch_type NOT IN ('PO','IN')`, grouped by `stand`.
- **Expected vs actual (Kodai Senga, 673540, 2025):**

  | Split | PA | AB | H | Splits tab shows | Correct BA | Error |
  |---|---:|---:|---:|---:|---:|---:|
  | vs LHH | 263 | 226 | 53 | **.202** | .235 | −33 pts |
  | vs RHH | 219 | 197 | 41 | **.187** | .208 | −21 pts |
  | Overall | 482 | 423 | 94 | **.195** | .222 | −27 pts |

  The displayed platoon split is .202 − .187 = **15 points**; the true split is .235 − .208 =
  **27 points**. The error is not a constant offset — it scales with each split's walk rate, so it
  distorts the comparison the table exists to support.
- **Fix:** compute `abs = pas - bbs - hbps - sacFlies - sacBunts` inside `calcSplitStats` and divide
  by it; add the AB column beside BA so the denominator is visible. Add a Vitest fixture asserting
  `BA(vsL) × AB_L + BA(vsR) × AB_R == H_total` (Cas owns making the failure visible).
- **Confidence:** verified.

---

## F4. Percentile panel: career-pooled value ranked against a single-season population that exists for only one season

- **Impact:** high — the Percentile Rankings panel on every pitcher dashboard. Three independent
  defects stack: (a) a career-pooled numerator is ranked against a one-season distribution;
  (b) the SP/RP population is decided from the *filtered* data, so a user filter silently changes
  which league the player is compared to; (c) `league_percentiles` holds rows for **season 2026
  only**, so for every other season the panel renders **all 11 metrics at exactly the 50th
  percentile** with no empty state.
- **Location:** `components/charts/PercentileRankings.tsx:18-27` (role), `:30-44` (season lookup),
  `:167` (`const pct = bp ? empiricalPercentile(...) : 50`), `:56` (deception SQL);
  `app/api/league-percentiles/route.ts`.
- **What's wrong:**
  - The player page defaults to `selectedYear = null` → "All Seasons"
    (`lib/hooks/usePlayerData.ts:123`, `app/(research)/player/[id]/page.tsx:77`), so `data` is the
    pitcher's whole Statcast career. The panel computes K%, Whiff%, Chase%, Barrel%, Avg EV,
    Extension and IVB pooled over 2015–2026, then looks up breakpoints for
    `season = Math.max(...years)` — one season. Career numerator, single-season denominator.
  - `role` is derived by applying the canonical ≥3-games-with-50+-pitches rule to `data` — which is
    `filteredData`, post-FilterEngine. Filtering to "vs LHH" roughly halves per-game pitch counts,
    so a starter at ~90 pitches/game falls under 50 and is reclassified **RP**. The comparison
    population changes as a side effect of a filter that was meant to change the numerator only.
    The canonical rule is also a per-season rule; applying it to a 12-season pool makes any pitcher
    who ever made three starts a career "SP".
  - When the breakpoint fetch returns `[]`, `pct` falls back to `50` and is pushed into `results`
    identically to a real value. A 50 that means "no population" is indistinguishable from a 50 that
    means "exactly league average".
- **Evidence:** source read this session. Query against `league_percentiles`: the table contains
  rows for **season 2026 only** — SP 78 metrics (n_qualified 205–212), RP 78 (273–394), hitter 60
  (427–445). No rows for 2015–2025. Any player whose most recent season predates 2026 — every
  retired pitcher — renders an all-50th-percentile chart.
- **Expected vs actual:** for a pitcher last active in 2023, all eleven bars render at the 50th
  percentile regardless of the underlying values. For an active pitcher on "All Seasons", the
  displayed percentile answers "where does this pitcher's 2015–2026 pooled rate sit in the 2026
  distribution", which is not the question the label asks.
- **Fix:** (1) pass the selected season explicitly and refuse to render when
  `selectedYear === null` or when no breakpoint row exists — return an empty state, never `50`;
  (2) compute `role` from `seasonFilteredData`, not `filteredData`, and per season;
  (3) backfill `league_percentiles` for 2015–2025 or hard-gate the panel to seasons that have rows.
  Item (3) is a pipeline coverage question → **Jo**. Item (1)'s presentation half → **Cas**.
- **Confidence:** verified (mechanism and the 2026-only coverage); the all-50 render is a direct
  read of `:167` with an empty map.

---

## F5. Season stats for a mid-season trade show only the first stint, beside full-season Statcast columns

- **Impact:** high — `w`, `l`, `era`, `sv`, `gs`, `whip` on the Traditional table and `k9`, `bb9`,
  `hr9` on the Advanced table, for any pitcher who changed MLB teams mid-season. Verified error on a
  real season: **0.65 runs of ERA and a 7-10 record shown where the true line is 8-14.**
- **Location:** `components/dashboard/OverviewTab.tsx:46` and `:62` —
  `const mlb = mlbStats.find((s: any) => Number(s.year) === r.year)`;
  data from `app/api/mlbstats/route.ts:9` (`stats=yearByYear&group=pitching`).
- **What's wrong:** MLB StatsAPI `yearByYear` returns **one split per season per team plus a
  combined split**. `.find()` returns the first match. For a traded pitcher that is his first team's
  partial line. It is then rendered in the same row as `ip`, `pa`, `h`, `k`, `bb`, `ba`, `kPct`
  computed by `calcTraditionalByYear` over *all* of that season's pitches — so ERA and IP in one row
  have different denominators — and the wrong ERA is then fed into the F1 career average.
- **Evidence:** source read this session. `GET
  https://statsapi.mlb.com/api/v1/people/448179/stats?stats=yearByYear&group=pitching` (Rich Hill)
  returns 3 MLB splits for 2023, and 3 each for 2014, 2016 and 2021:

  | 2023 split order | IP | ERA | W-L |
  |---|---:|---:|---:|
  | 1st (what `.find()` returns) | 119.0 | **4.76** | **7-10** |
  | 2nd | 27.1 | 8.23 | 1-4 |
  | 3rd (combined) | 146.1 | **5.41** | **8-14** |

- **Expected vs actual:** the player page shows Rich Hill 2023 as **ERA 4.76, 7-10**; his actual
  2023 was **5.41, 8-14**. The Statcast columns in that same row cover all 146.1 innings.
- **Fix:** aggregate the splits for a season before merging — sum `er`, `ipouts`, `w`, `l`, `sv`,
  `gs` across all `sport.id === 1` splits for that year and recompute ERA/WHIP/K9 from the sums, or
  select the combined split explicitly when the API supplies one. Never `.find()` on a
  non-unique key.
- **Confidence:** verified.

---

## F6. Trends alerts compare a window against a baseline that contains it

- **Impact:** high — every row of the Trend Alerts page (Stuff+ and Arsenal tabs). Every delta is
  attenuated toward zero by a factor that varies per pitcher, so both the magnitudes and the
  *ranking* are wrong. Measured on today's data: median attenuation **13.3%**, mean **19.6%**,
  p90 **40.5%**, max **100%**.
- **Location:** `app/api/trends/route.ts:57-58` and `:65`:
  `season_stuff = AVG(stuff_plus)` over the whole season,
  `recent_stuff = AVG(stuff_plus) FILTER (WHERE game_date >= recentDate)`,
  `delta = recent_stuff − season_stuff`. Same shape at `:84-94` for velo/IVB/HB/spin/usage.
- **What's wrong:** the recent window is a subset of the season baseline. Writing `w = n_recent /
  n_season`, the pooled season mean is `w·μ_recent + (1−w)·μ_prior`, so
  `displayed_delta = (1 − w) × true_delta`. The attenuation is not a constant — it is larger for
  pitchers who have thrown more recently, which is precisely the population the page is trying to
  surface. At `w = 1` (a pitcher whose entire season falls inside the window — a call-up) the
  displayed delta is exactly **0**, so the alert is structurally incapable of firing for the newest
  arms. Early in a season the effect is worse by design: `:38` sets
  `recentWindowDays = floor(seasonSpan / 2)` when the season is under 21 days old, giving `w ≈ 0.5`
  and halving every delta.
- **Evidence:** source read this session; computed on `pitches`, `game_year = 2026`,
  `game_type = 'R'`, `pitch_type NOT IN ('PO','IN')`, grouped by `(pitcher, pitch_name)` with the
  route's own `HAVING COUNT(*) >= 20 AND COUNT(*) FILTER (recent) >= 5`. Latest game date
  2026-08-21; 1,740 rows qualify. `n_recent / n_season`: mean **19.6%**, median **13.3%**,
  p90 **40.5%**, max **100.0%**.
- **Expected vs actual:** a pitcher whose Stuff+ genuinely fell 3.0 points in the last 14 days and
  who is at the median overlap displays as **−2.6**; at the p90 overlap he displays as **−1.8**. Two
  pitchers with identical true declines sort in overlap order, not decline order.
- **Fix:** make the baseline exclude the window —
  `AVG(stuff_plus) FILTER (WHERE game_date < '${recentDate}')` — and relabel the column "vs prior".
  Report `n_recent` and `n_prior` beside the delta. Note separately that a 14-day window is 2–3
  starts, which per `Li/statistical-inference/01` is 2–3 clusters, not 250 independent pitches; the
  MDE at that sample is larger than most of the deltas being alerted on.
- **Confidence:** verified (mechanism and attenuation factor); the ranking claim follows from the
  measured spread in `w`.

---

## F7. "IP" means three different things across three code paths, and the totals parser assumes a fourth

- **Impact:** medium-high — IP is the denominator of ERA, WHIP, K/9, BB/9, HR/9, FIP and xERA, so the
  disagreement propagates. Measured spread on one real pitcher-season: **110.7 vs 111.33 IP** for the
  same pitcher, same season, same filters.
- **Location:**
  - A — `lib/reportMetrics.ts:10` (`METRICS.ip`): `ROUND(outs / 3, 1)`, a **true decimal**, counting
    only `strikeout, field_out, force_out, fielders_choice, fielders_choice_out, sac_fly, sac_bunt`
    (+2 for double plays, +3 for triple plays). Used by `/api/report` → Explore, Reports,
    `/api/scene-stats`.
  - B — `lib/pitcherStats.ts:69-82` and `:202-212`: JS, **baseball thirds notation** (`"111.1"` =
    111⅓), treating anything that is not a hit / walk / HBP / CI / error as an out — so caught
    stealing, pickoffs and `other_out` count. Used by the player dashboard.
  - C — `lib/sql.ts:19` (`IP_ESTIMATE_SQL`): `COUNT(DISTINCT game_pk*10000 + at_bat_number)` over
    the same "not a hit/walk/HBP/CI/error" rule, decimal. Used by the FIP/xERA leaderboard backfill.
  - D — `lib/metricRegistry.ts:676-683` (`case 'ip'`) parses `"12.2"` as `12 × 3 + 2` outs, i.e. it
    assumes notation B.
- **What's wrong:** A undercounts outs relative to B and C by omitting the baserunning outs; A and C
  also differ from each other on `field_error` handling and on pitch-row vs distinct-at-bat counting.
  Separately, A emits decimals in the same visual format as B's thirds, so "110.7" and "111.1" look
  0.4 apart when they are 0.63 apart in the opposite direction. If a METRICS.ip value ever reaches
  `calcTotalsFromRegistry`, D reads "110.7" as 110 innings **plus 7 outs** = 112.33 — no aggregation
  is correct while the unit is ambiguous.
- **Evidence:** source read this session; all three expressions computed side by side on `pitches`,
  `game_year = 2025`, `game_type = 'R'`, `pitch_type NOT IN ('PO','IN')`:

  | Pitcher | A `METRICS.ip` | B player page (outs) | C `IP_ESTIMATE_SQL` |
  |---|---:|---:|---:|
  | Senga (673540) | **110.7** | 334 outs = 111.1 (111.33) | **111.33** |
  | Nola (605400) | **93.0** | 281 outs = 93.2 (93.67) | **93.67** |

- **Fix:** one shared out-counting expression, one stored unit (outs, an integer), and formatting to
  thirds notation only at the display layer. Pick B/C's out set — it is the one that matches the
  official definition — and mark `METRICS.ip` deprecated in `docs/VARIABLES.md` in the same commit.
  Path D becomes unnecessary once IP is carried as outs.
- **Confidence:** verified for A/B/C; D's reachability is **suspected** (no current caller feeds
  METRICS.ip into `calcTotalsFromRegistry`).

---

## F8. The n printed beside an aggregate is not always the n that was aggregated

- **Impact:** medium — three distinct instances on the pitcher dashboard and one on the Triton
  leaderboard.
- **Location / mechanism:**
  1. `app/(research)/player/[id]/page.tsx:95-96` prints
     `{seasonFilteredData.length} pitches` and `{new Set(seasonFilteredData.map(r => r.game_pk)).size} games`
     in the page header, while every table on the page aggregates `filteredData`
     (`lib/hooks/usePlayerData.ts:256-266`). With any FilterEngine filter active, the header n is
     larger than the aggregated n. The tab bar at `:130` prints the correct `resultCount` with a
     "(filtered)" suffix, so the page shows **two different pitch counts simultaneously**.
  2. `components/dashboard/OverviewTab.tsx:180` prints `{data.length} pitches` in the table header —
     correct — but the Arsenal totals row's `count` column sums to the same value while the
     value columns beside it are unweighted means (F2). The row asserts "1,901 pitches averaged
     79.7 mph", which is false by 8.1 mph.
  3. `app/api/leaderboard-triton/route.ts:96` accumulates `p.pitches` from every
     `pitcher_season_command` row, while `:127-131` accumulates `_cmd_weight` only from rows where
     `cmd_plus IS NOT NULL`, and `:163` gates on `r.pitches >= minPitches`. The qualification
     threshold and the displayed n are therefore evaluated against a superset of the denominator
     that produced `cmd_plus`.
  4. `calcTotalsFromRegistry:654` filters NaN per column, so a totals row's columns can each be a
     mean over a different number of rows, with a single n printed beside them.
- **Evidence:** source read this session. For (3), the divergence is currently **latent, not live**:
  in `pitcher_season_command` for `game_year = 2025` all 2,677 rows are unique on
  `(pitcher, game_year, pitch_name, game_type)`, and across 765 pitchers **0** have any pitches
  outside the `cmd_plus` weight (max uncovered = 0). It becomes live the first time a `cmd_plus`
  row is written NULL.
- **Fix:** the page header should read `filteredData`; the totals row should carry the denominator
  actually used per column, or refuse the column; `leaderboard-triton` should gate `minPitches` on
  `_cmd_weight` for `cmd_plus` and `_rpcom_weight` for `rpcom_plus`. Display half → **Cas**.
- **Confidence:** verified (1, 2, 4); verified-latent (3).

---

## F9. Hitter career "Max EV" is the mean of season maxima — the `max` branch is unreachable

- **Impact:** medium — the hitter dashboard's Advanced and vs-Pitch-Type career rows. Understates
  the career maximum, and understates it *more* the longer the career.
- **Location:** `components/dashboard/HitterOverviewTab.tsx:161-175`.
- **What's wrong:** `pctFields` at `:161` includes `"maxEV"`, and the `if (pctFields.includes(c.k))`
  branch at `:168` runs before the `else if (c.k === "maxEV")` branch at `:173`. The `Math.max`
  branch is dead code. This is the same defect the pitcher registry already fixed —
  `lib/metricRegistry.ts:289-295` correctly carries `totals: 'max'` for `maxEV`, and `:480-486` for
  `maxVelo` — so the two dashboards disagree on the meaning of the same column label.
- **Evidence:** source read this session; branch order confirmed by reading `:161-176`. A hitter with
  season maxima of 116.5 / 114.2 / 115.8 mph shows a "career" Max EV of 115.5, which is no season's
  maximum. `avgVelo` in vs-Pitch-Type mode is in the same list and is averaged across pitch types
  unweighted (F2 again): the "career average velocity faced" is the mean of pitch-type velocities,
  not of pitches. `facedPct` likewise averages to `100 / n_pitch_types`.
- **Fix:** delete `"maxEV"` from `pctFields`, or better, replace `HitterOverviewTab.calcTotals`
  entirely with `calcTotalsFromRegistry` once F1 lands, so there is one totals implementation.
- **Confidence:** verified.

---

## F10. Usage percentages are renormalized over the post-HAVING row set

- **Impact:** medium — `season_usage` / `recent_usage` on the Trends Arsenal tab; latent in
  `METRICS.usage_pct`.
- **Location:** `app/api/trends/route.ts:92-94` —
  `SUM(COUNT(*)) OVER (PARTITION BY p.pitcher)` combined with
  `HAVING COUNT(*) >= 20 AND COUNT(*) FILTER (recent) >= 5` at `:98`.
  `lib/reportMetrics.ts:65` — `SUM(COUNT(*)) OVER (PARTITION BY player_name)`.
- **What's wrong:** Postgres evaluates window functions after `GROUP BY`/`HAVING`, so the usage
  denominator is the sum over *surviving* pitch types only. A pitcher who throws a 12-pitch curveball
  has it dropped by the HAVING, and every remaining usage share is inflated so the visible shares
  still sum to 100%. The displayed usage is therefore conditional on the threshold, not on the
  pitcher. `usage_delta` at `:107` differences two quantities normalized over the same filtered set,
  so the delta is less distorted than the levels — but the levels are what is shown.
  `METRICS.usage_pct` has the additional problem of partitioning by `player_name` while
  `/api/report`'s pitching group-by is `['player_name','pitcher']` — one row per player means it
  always evaluates to 100.0 there, and it would fail outright if `player_name` were dropped from the
  group-by. The single-pitcher routes get this right with `OVER ()`
  (`app/api/sequencing/route.ts:59`, `app/api/matchup-lookup/route.ts:40`,
  `app/api/models/{matchup,gamecall}/route.ts`).
- **Evidence:** source read this session; Postgres evaluation order per the documented aggregate/
  window semantics.
- **Fix:** compute the denominator in a subquery over the unfiltered pitch set, then apply the
  threshold as an outer filter. Change `METRICS.usage_pct` to partition by the actual group key or
  remove it from the report metric set.
- **Confidence:** verified.

---

## F11. The Explore leaderboard groups by `player_name` as well as `pitcher`, so a name-string change splits one pitcher into two rows

- **Impact:** low (prevalence) / high (per-affected-row) — a split pitcher appears twice with
  partial totals, and each partial row is separately tested against the `minPitches` HAVING, so he
  can vanish from the leaderboard entirely despite qualifying in total.
- **Location:** `lib/leaderboardColumns.ts:424` — `case 'pitching': return ['player_name','pitcher']`;
  the group-by is emitted verbatim at `lib/reportQueryBuilder.ts:120`. The qualification gate is
  `HAVING COUNT(*) >= ${mp}` at `:141`.
- **What's wrong:** `pitches.player_name` is a free-text Statcast field. Adding `pitcher` to the
  group-by protects against two players merging, but including `player_name` introduces the opposite
  failure: one pitcher whose name string is restated mid-season (accent added, suffix changed)
  produces two GROUP BY keys.
- **Evidence:** computed on `pitches`, `pitch_type NOT IN ('PO','IN')`, grouped by
  `(game_year, pitcher)` counting `COUNT(DISTINCT player_name)`:

  | Season | Pitcher-seasons | With >1 name string |
  |---|---:|---:|
  | 2024 | 1,247 | 1 |
  | 2025 | 1,439 | 1 |
  | 2026 | 1,602 | **5** |

- **Fix:** group by `pitcher` alone and resolve the display name with
  `MAX(player_name)` (or a `players` lookup) in the SELECT. `lib/reportQueryBuilder.ts` already
  supports non-grouped expressions via the `AS` path.
- **Confidence:** verified.

---

## F12. Two smaller aggregation faults in the deception path

- **Impact:** low.
- **Location / mechanism:**
  1. `components/charts/PercentileRankings.tsx:56` —
     `SELECT ... FROM pitcher_season_deception WHERE pitcher = ${id} AND game_year IN (${yearList})`
     carries **no `game_type` filter**, while the page it renders on is filtered to regular season by
     default (`lib/hooks/usePlayerData.ts:246`). Where a pitcher has both regular and spring rows for
     the same `(pitcher, game_year, pitch_type)`, both are pulled and both contribute to the
     pitch-weighted mean. Measured: `pitcher_season_deception` for 2026 holds 1,926 `game_type='R'`
     rows **and 59 `game_type='S'` rows**; 2025 holds `R` only. So the defect is live for 2026 and
     affects a small number of pitchers.
  2. `app/api/leaderboard-deception/route.ts:91` —
     `bucket.ext += (row.z_ext != null ? Number(row.z_ext) : 0) * ptPitches` while `bucket.w`
     increments unconditionally at `:92`. A missing extension z-score is imputed as **0** (exactly
     league average) rather than excluded, diluting the aggregate extension z toward the mean and
     making a coverage gap indistinguishable from a league-average pitcher.
- **Evidence:** source read this session; `pitcher_season_deception` game_type census computed this
  session.
- **Fix:** add `AND game_type = 'R'` (or thread the page's `seasonType` through); accumulate `ext`
  and its own weight separately so NULLs are skipped rather than zeroed.
- **Confidence:** verified.

---

## F13. `calcTotalsFromRegistry`'s `'ip'` strategy reduces over `rows`, not the NaN-filtered `vals`

- **Impact:** low — a single Lahman-only season with a null `ipouts` renders the career IP cell as
  `"NaN.NaN"`.
- **Location:** `lib/metricRegistry.ts:676-683`.
- **What's wrong:** every other branch operates on `vals` (NaN-filtered at `:654`); the `'ip'` branch
  re-reduces over the raw `rows`. `components/dashboard/OverviewTab.tsx:29` emits `ip: '—'` for a
  Lahman season with null `ipouts`; `parseInt('—')` is `NaN`, which poisons the running total.
- **Evidence:** source read this session.
- **Fix:** guard with `if (isNaN(...)) return s` inside the reduce, or move IP to an integer-outs
  representation per F7.
- **Confidence:** suspected — the mechanism is verified, but I did not confirm that any Lahman
  pitching season in the database carries a null `ipouts`.

---

## Rollups I checked and found correct

- **`/api/report` → Explore leaderboard rates.** `lib/reportQueryBuilder.ts:107-155` emits the
  `METRICS` expressions directly into a single `GROUP BY`, so every rate is a genuine
  ratio-of-sums computed in SQL over the pooled event set — the correct estimator, and the one the
  JS rollups should imitate. No client-side re-averaging happens on this path.
- **`HistoricalOverviewTab.careerTotals`** (`components/dashboard/HistoricalOverviewTab.tsx:48-107`).
  BA, OBP, SLG, OPS, ERA, WHIP, K/9 and BB/9 are each recomputed from summed components
  (`h`/`ab`, `er`/`ipouts`, …), and IP is summed as outs and reformatted. This is correct and is the
  reference implementation for F1. One ordering caveat worth a comment: `ops` at `:79-81` reads
  `totals.obp` and `totals.slg`, so it is correct only because `obp` and `slg` precede `ops` in the
  column array.
- **Deduplication.** `pa` is `COUNT(DISTINCT game_pk::bigint * 10000 + at_bat_number)` throughout
  (`lib/reportMetrics.ts:8`, `lib/sql.ts:19`), `games` is `COUNT(DISTINCT game_pk)`; `at_bat_number`
  never approaches 10,000 so the composite key is injective. The only join in the player path is
  `LEFT JOIN players pl ON pl.id = p.batter` (`app/api/player-data/route.ts:44`), which is on a
  primary key and cannot multiply rows.
- **`pitcher_season_command` grain and its pitch-weighted rollup.** For `game_year = 2025`: 2,677
  rows, 2,677 distinct `(pitcher, game_year, pitch_name, game_type)` keys — no duplication feeding
  the pivot. `app/api/leaderboard-triton/route.ts:127-148` weights `cmd_plus` and `rpcom_plus` by
  pitch count, which is the right weight for a plus-stat, and across 765 pitchers in 2025 every
  pitch is covered by a non-null `cmd_plus` (0 uncovered).
- **Split partition integrity.** For `game_year = 2025`, `game_type = 'R'`,
  `pitch_type NOT IN ('PO','IN')` (708,730 rows): `stand` is non-null and always `L`/`R`;
  `pitch_name`, `n_thruorder_pitcher` and `inning` are 100% populated; no row has `balls > 3` or
  `strikes > 2`; `zone` and `stuff_plus` are null on 3 rows each. **vs-LHH + vs-RHH = overall
  exactly**, and the count / inning / times-through-order splits partition the season completely.
  The split-identity failures in this report are all in the *aggregation*, not the partition.
- **Extremes on the pitcher registry.** `maxEV` (`lib/metricRegistry.ts:289`) and `maxVelo` (`:480`)
  correctly carry `totals: 'max'`. `totalRE` (`:423`) correctly carries `totalRE` (a sum). The 15
  `'sum'` entries — W, L, G, GS, SV, PA, pitches, H, 2B, 3B, HR, BB, K, HBP, count — are all counting
  stats and are correctly additive across seasons.
- **The 50,000-row cap is not currently binding.** `app/api/player-data/route.ts:44` truncates to the
  most recent 50,000 pitches with `ORDER BY game_date DESC`, which would silently drop the oldest
  seasons and leave one partial season in the career line. The heaviest career workloads in the
  table are Nola 31,272, Cole 30,277, Verlander 27,430, Greinke 24,519 — roughly **1.6× headroom**.
  Latent, not live. Worth a guard, not a fix.
- **Pitch-level `AVG(stuff_plus)`** in `/api/trends`, `/api/daily-highlights`, `/api/cron/briefs`,
  `/api/leaderboard-triton` operates on the raw per-pitch column at the correct grain (it is a
  mix-weighted aggregate, which is a labelling question, not an averaging-an-average bug).

---

## What I could not determine

- **Population-wide magnitude of F1.** The cross-season query needed to compute the mean-of-seasons
  vs pooled gap for all pitchers requires a full scan of the 8.9M-row / 9.7 GB `pitches` table and
  timed out twice through the MCP path. F1 is therefore quantified exactly on two named
  pitcher-careers (Senga: large gap; Nola: negligible gap) and by mechanism, not on the population.
  The correct next measurement is a chunked per-`game_year` materialization of season components,
  then a single pass over that.
- **Career ERA and WHIP error magnitude.** `pitches` carries no earned-run column, so the F1 error on
  `era` and `whip` — the two most-read cells on the traditional table — could not be computed. The
  mechanism is identical to BA and the leverage is worse, because ERA is convex in `1/IP` and short
  seasons are usually bad seasons, so the unweighted career ERA is biased **upward**. Getting the
  number requires the MLB Stats API `er`/`ipouts` per season, which F5 shows is itself unreliable for
  traded pitchers.
- **Whether `league_percentiles` covering only 2026 is intentional.** The table is populated and
  internally sensible for 2026 (n_qualified 205–445 by role). Whether 2015–2025 was never built or
  was dropped is a pipeline-ownership question → **Jo**.
- **Prevalence of F5.** Confirmed for Rich Hill (4 seasons with 3 splits each) via a live call to the
  MLB Stats API. Enumerating how many pitcher-seasons on the platform are affected requires bulk
  calls to that API, which was outside this session's budget. Roughly one in six to one in eight
  pitchers changes MLB teams mid-season.
- **MiLB mirror.** `app/(milb)/**` reuses several of these components but was out of scope; the
  `milb_pitches.events` vocabulary differs, so the out-counting expressions in F7 may fail
  differently there.
- **Query logging.** The 14 ad-hoc queries run this session have **not** been appended to
  `docs/Queries.md` — the clean-room instruction forbade opening that file. They need to be logged
  under a `## 2026-08-22` header before this work is considered complete under repo convention.

---

## Highest-leverage next action

Land F1 and F2 together as one change to `lib/metricRegistry.ts`: replace the `TotalsStrategy` enum
with a union that names the weight column per metric, reclassify the ~29 ratio metrics as
`{ kind: 'ratio', num, den }`, make `calcTotalsFromRegistry` render `—` plus a reason code when the
declared weight is missing from the row, and delete `HitterOverviewTab.calcTotals` in favour of it.
That single file corrects both dashboards' career lines and both arsenal totals rows, and it turns
the convention into a mechanism. Ship it with the identity test — pooled rate must equal the
denominator-weighted rollup to within 0.01 on a fixture — so the failure is enforced rather than
asserted, and update `docs/VARIABLES.md` with the weight basis per metric in the same commit.
