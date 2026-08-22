# Slice 08 — Display Fidelity

**Verdict.** The gap between the database and the screen in the `(research)` and `(milb)` surfaces is
wider than the number-correctness problems underneath it. Three defects are outright wrong-number
bugs that a user cannot detect: horizontal break renders with **opposite signs on three surfaces of
the same app** (verified: Skubal's changeup is `+13.7"` in the arsenal table and `−13.7"` in the
chart directly below it); the totals row labelled **"Career"** is an unweighted mean of season rates,
so a 200-IP/3.00 + 5-IP/12.00 pitcher renders **ERA 6.50** where the true career ERA is **3.22**
(verified by executing `calcTotalsFromRegistry`); and the same row on the Arsenal tab renders
**Avg Velo 90.1** where the true pitch-weighted average is **92.5** and **Usage% 20.0** where it
should be 100. Beneath those, nulls do not survive the trip to the screen: `Number(null) === 0`
slips past the guard in `getCellColor`, so a **missing Stuff+ renders as an orange (below-average)
dash**; career IP renders the literal string **`NaN.NaN`**; the percentile panel **fabricates a
50th-percentile bar** when its breakpoints fail to load; and the report heatmap **invents empty bins
from their neighbours, twice, then smooths, then quotes the result to three decimals**. Almost
nothing on these surfaces states the n or the coverage behind a number. The encouraging half: the
league-baseline API handles its percent/proportion conversion correctly, `scaleanchor` is applied on
every location and movement chart, the cluster centroid is correctly year-partitioned, and
`HistoricalOverviewTab` already contains the correct career-rate implementation the main dashboard
should be calling.

---

## F1. Horizontal break renders with the opposite sign on three surfaces of the same app

- **Impact:** critical — Player dashboard (Overview → Arsenal table and the Movement Profile chart
  directly beneath it), Reports Builder tiles, Mobile player dashboard. Metric: `HB` / `hBreak` /
  `HB"`. A user reading `HB +13.7"` in the arsenal table and looking six inches down the page sees
  that pitch plotted at `x = −13.7"`, on the opposite side of the crosshair from the annotation
  `← 1B`. Every arm-side/glove-side call made from the table is backwards relative to every chart.
- **Location:**
  - `lib/pitcherStats.ts:305` — `hBreak: f(avg(hb.map(v => v * 12)))` over raw `pfx_x` (catcher view)
  - `components/charts/MovementProfile.tsx:35` — `x: pts.map(d => toPitcherX(d.pfx_x) * 12)` (pitcher view)
  - `components/reports/TileViz.tsx:302` — `{ key: 'hb', label: 'HB"', compute: p => { const v = avg(p,'pfx_x'); return v !== null ? toPitcherX(v) * 12 : null } }` (pitcher view)
  - `components/mobile/MobilePlayerDashboard.tsx:149` — `hBreak: fmt(... toPitcherX(avg(hb)!) ...)` (pitcher view)
  - `lib/pitcherPerspective.ts:16` — `toPitcherX(v) { return -v }`
  - `lib/metricRegistry.ts:494-500` — `hBreak` tip reads *"Horizontal break from catcher view (in)"*
- **What's wrong:** `lib/pitcherPerspective.ts` was introduced to move all *display* values to
  pitcher's perspective, and its axis constants were deliberately changed so they "no longer
  reference 'Catcher View'". Three of the four consumers were converted. The player page's arsenal
  table — the densest, most-read table on the platform — was not. The registry tip still documents
  the old convention, which means the tooltip actively tells the user the table is right.
- **Evidence:** code read at the five sites above, plus a database check of the true values.
  Tarik Skubal (LHP, `pitcher = 669373`), 2026:

  | Pitch | n | `avg(pfx_x)*12` (arsenal table) | `toPitcherX(...)` (chart / reports / mobile) |
  |---|---|---|---|
  | 4-Seam Fastball | 681 | **+3.5"** | **−3.5"** |
  | Changeup | 501 | **+13.7"** | **−13.7"** |
  | Slider | 268 | **−3.1"** | **+3.1"** |

- **Expected vs actual:** one sign convention for `HB` across the platform. Actual: two, on the same
  page, with no indication which is which.
- **Fix:** change `lib/pitcherStats.ts:305` to `hBreak: f(avg(hb.map(v => toPitcherX(v) * 12)))` and
  update the `hBreak` tip in `lib/metricRegistry.ts` to "Horizontal break, pitcher's perspective
  (in); positive = toward 3B". Then add a Vitest case that asserts the arsenal `hBreak` and the
  `MovementProfile` x-value for the same fixture row have the **same** sign — and confirm it fails
  against the current code before trusting it.
- **Confidence:** verified.

---

## F2. The row labelled "Career" is an unweighted mean of season rates

- **Impact:** critical — Player dashboard Overview tab, Traditional and Advanced modes; MiLB player
  page. Metrics: `ERA`, `WHIP`, `BA`, `OBP`, `SLG`, `OPS`, `K%`, `BB%`, `K/9`, `BB/9`, `HR/9`,
  `FIP`, `xFIP`, `xERA`, `SIERA`, `wOBA`, `xBA`, `xwOBA`, `xSLG`, `Whiff%`, `CS%`, `Zone%` — every
  rate in the table. A single bad cameo season is weighted equally with a 200-inning workhorse
  season. The direction of the error is always the same: short, bad seasons pull the career number
  toward disaster.
- **Location:** `lib/metricRegistry.ts:657-666` (the `case 'avg'` branch of
  `calcTotalsFromRegistry`), consumed at `components/dashboard/OverviewTab.tsx:202-210`.
- **What's wrong:** `totals: 'avg'` computes `sum(seasonValues) / seasonValues.length`. Career rate
  stats must be recomputed from summed components (`9 × ΣER / ΣIP`), never averaged across seasons.
  The first column (`year`, `totals: 'none'`) is assigned the string `'Career'`, so the row makes an
  explicit claim about what it contains.
- **Evidence:** executed `calcTotalsFromRegistry` under Vitest against a three-season fixture:

  ```
  TOTALS ROW = {"year":"Career","ip":"NaN.NaN","era":"6.50","pitches":3090,"2b":32}
  rendered ERA cell = 6.50
  true career ERA (9*ΣER/ΣIP) for 200IP@3.00 + 5IP@12.00 = 3.22
  ```

  The correct implementation already exists in this repo:
  `components/dashboard/HistoricalOverviewTab.tsx:57-100` recomputes `ba`, `obp`, `slg`, `era`,
  `whip`, `k9`, `bb9` from summed `h`/`ab`/`bb`/`er`/`ipouts`. The main dashboard does not call it.
- **Expected vs actual:** `Career ERA 3.22`. Actual: `Career ERA 6.50`.
- **Secondary defect at the same site:** when the year selector is set to a single season, the query
  returns one year, `calcTraditionalByYear` produces one row, and the totals row still renders
  **"Career"** over a single season (`lib/hooks/usePlayerData.ts:143-153`, `OverviewTab.tsx:203`).
- **Fix:** add a `TotalsStrategy` of `'ratio'` to `lib/metricRegistry.ts` carrying numerator and
  denominator keys (`era → {num: 'er', den: 'ipouts', scale: 27}`), and fall back to `'—'` rather
  than a mean when the components are not present in the row. Label the row from the actual span:
  `Career (2019–2026)` or `2026 Total`.
- **Confidence:** verified.

---

## F3. The Arsenal tab's totals row averages across pitch types and calls it "Career"

- **Impact:** critical — Player dashboard Overview → Arsenal, and the MiLB equivalent. The Arsenal
  rows are **pitch types within the current filter**, not seasons, so the totals row is an unweighted
  mean across a pitcher's repertoire, presented under the word "Career".
- **Location:** `components/dashboard/OverviewTab.tsx:160,202` (`arsenalCols` fed to
  `calcTotalsFromRegistry`); `lib/metricRegistry.ts:471` (`avgVelo` `totals: 'avg'`), `:272-278`
  (`usagePct` `totals: 'avg'`), `:548-555` (`stuffPlus` `totals: 'avg'`), `:38-45` (`name`
  `totals: 'none'` → the literal string `'Career'` lands in the **Pitch** column).
- **What's wrong:** a five-pitch pitcher's totals row averages five pitch-type velocities with equal
  weight regardless of usage, and averages five usage percentages that sum to 100 — producing
  `100 / 5 = 20.0%` in a column labelled `Usage%`.
- **Evidence:** database values for Skubal 2026 (`pitcher = 669373`), compared against what
  `calcArsenal` + `calcTotalsFromRegistry` produce:

  | Cell | Renders | True value |
  |---|---|---|
  | Pitch (first column) | `Career` | *n/a — these are pitch types* |
  | `Avg Velo` | **90.1** | **92.5** (pitch-weighted) |
  | `Usage%` | **20.0** | **100.0** |
  | `EV` | **87.3** | **86.2** (batted-ball-weighted) |

  Per-pitch-type source: FF 681 @ 96.7, CH 501 @ 87.3, SI 392 @ 96.7, SL 268 @ 89.4, CU 87 @ 80.3.
- **Expected vs actual:** a totals row that is count-weighted, or no totals row at all on this tab.
  Actual: a 2.4 mph velocity error and a nonsensical 20% usage total, both bolded and set off by a
  double top border as the authoritative summary.
- **Fix:** shortest safe path is to suppress the totals row entirely when `mode === 'arsenal'`
  (`OverviewTab.tsx:202`). The correct path is a `'weightedAvg'` strategy in the registry that names
  its weight column (`count` for arsenal, `pitches` or `ip` for seasons) and a `'sum'` for
  `usagePct`.
- **Confidence:** verified (arithmetic traced through the code against DB-measured inputs).

---

## F4. The percentile panel renders a fabricated 50th percentile when its breakpoints are missing

- **Impact:** critical — "MLB Percentile Rankings" on the player dashboard Overview tab, all eleven
  metrics. When `/api/league-percentiles` returns nothing — a season not yet refreshed, a role with
  no rows, or any network failure — every bar renders exactly half-filled with a light-grey `50`
  badge, which is precisely how a genuinely league-average pitcher renders. There is no state in
  which the panel admits it does not know.
- **Location:** `components/charts/PercentileRankings.tsx:165` —
  `const pct = bp ? empiricalPercentile(v, bp.breakpoints, bp.higher_better) : 50`
  Combined with `:42` — `.catch(() => {})`, which swallows the fetch failure and leaves
  `percentileMap` as `{}`, making *every* lookup miss.
- **What's wrong:** the fallback is a plausible value rather than an absence. `percentileColor(50)`
  returns `rgb(200,200,200)` — the exact neutral grey a real 50 produces — so the failure is
  invisible by construction.
- **Evidence:** code read; `percentileColor` at `lib/leagueStats.ts:1301-1310` confirms the 50 case
  produces the same colour as a measured 50.
- **Expected vs actual:** an empty track with `—` in the badge, or the row omitted. Actual: a
  confident, correctly-styled "50th percentile" claim about a pitcher nobody measured.
- **Fix:** `if (!bp) continue` at `PercentileRankings.tsx:163`, and surface the fetch failure — set
  an `error` state in the `.catch` and render "League baselines unavailable" above the panel.
- **Confidence:** verified.

---

## F5. The report heatmap invents empty bins from their neighbours, twice, then quotes them to three decimals

- **Impact:** high — Reports Builder heatmap tiles (`ba`, `slg`, `woba`, `xba`, `xwoba`, `xslg`,
  `ev`, `la`, `whiff_pct`, `chase_pct`, `swing_pct`), and every downstream consumer of the same
  renderer. A 16×16 grid over the strike zone is 256 bins; a typical single-pitcher tile has far
  fewer batted balls than bins. The coloured region a user reads as "he gets hammered up and in" can
  be entirely manufactured.
- **Location:** `components/reports/TileViz.tsx:145` — the two-pass neighbour fill:
  ```
  for(let pass=0;pass<2;pass++){ ... if(z[r][c]===null){ ...
    const neighbors:number[]=[]; ...
    if(neighbors.length>=2) z[r][c]=neighbors.reduce((a,b)=>a+b,0)/neighbors.length }}}}
  ```
  plus `:147` — `zsmooth:"best", connectgaps:true, hovertemplate:"…: %{z:.3f}"`.
- **What's wrong:** three compounding problems.
  1. **Fabrication propagates.** Pass 1 fills bins adjacent to real data; pass 2 fills bins adjacent
     to *pass-1's inventions*, so invented values spread two rings out from any real observation.
  2. **Tiny bins are not guarded.** `calcMetric(cell, 'ba')` returns `h.length / ab.length` for a
     bin containing a single at-bat — `1.000` or `.000`, which lands at the extreme end of the
     spectrum and then bleeds into eight neighbours, and their neighbours. **One home run can paint a
     quarter of the strike zone dark red.** The only sample guard is `f.length < 5` for the entire
     tile (`TileViz.tsx:121`).
  3. **Precision overstates provenance.** The tooltip renders `%{z:.3f}` on every bin, real or
     invented, and `%{z:.3f}` on `ev` gives `Exit Velo: 88.312` on a quantity Statcast reports to
     0.1 mph. The colourbar min/max (`:148-150`) is computed from `zVals`, which includes the
     fabricated bins, so the legend range is partly derived from invented data.
- **Evidence:** code read. `connectgaps:true` and `zsmooth:"best"` are Plotly's own interpolation on
  top of the hand-rolled fill, so a bin can be smoothed from a smoothing of a fabrication.
- **Expected vs actual:** bins below a minimum sample render as a neutral "no data" colour distinct
  from every value in the spectrum, and the tooltip states `n` for the hovered bin. Actual: an
  unbroken, confident, fully-coloured zone map.
- **Fix:** carry `n` alongside `z` (`bins[yi][xi].length`), null out any bin with `n` below a floor
  (10 batted balls for `ba`/`slg`/`ev`/`la`, 15 pitches for the rate metrics), delete the two-pass
  neighbour fill, set `connectgaps:false`, and put `n` in the `hovertemplate` via `customdata`. Drop
  `%{z:.3f}` to the precision the metric actually supports.
- **Confidence:** verified (code); the visual consequence is *probable* until someone screenshots a
  low-sample tile.

---

## F6. `null` coerces to `0` before the guard, so a missing plus-stat renders in the below-average colour

- **Impact:** high — Player dashboard Overview → Advanced and Arsenal tables. Metrics: `Stuff+`,
  `Cmd+`, `RPCom+`, `Brink+`, `Cluster+`, `SOS`. A pitch type with no Stuff+ coverage renders as an
  **orange dash** — the same orange as a genuinely below-average pitch. `RE24` is worse: it renders
  **red for every value that is not strictly negative**, including exact zero and including missing.
- **Location:** `lib/metricRegistry.ts:618-641` (`getCellColor`); the `plus` branch at `:625-634`
  and the `inverted_value` branch at `:634-638`. Rendered at
  `components/dashboard/OverviewTab.tsx:195` and `:207`.
- **What's wrong:** the `plus` branch guards with `if (isNaN(n)) return 'text-zinc-400'`, but
  `Number(null)` is `0` and `Number('')` is `0`, neither of which is `NaN`. `0 < low` (100) is true,
  so the cell gets `color.below`. The `inverted_value` branch has no `NaN` guard at all: `NaN < 0` is
  `false`, so anything not strictly negative — including `null`, `undefined`, `''`, and `'—'` —
  returns `badClass`.
- **Evidence:** executed the real `getCellColor` under Vitest (`vitest run`, Vitest 4.1.3):

  ```
  getCellColor(stuffPlus,  null)      = text-orange-400  | formatMetric = "—"
  getCellColor(stuffPlus,  "")        = text-orange-400  | formatMetric = "—"
  getCellColor(stuffPlus,  0)         = text-orange-400  | formatMetric = "0"
  getCellColor(stuffPlus,  "—")       = text-zinc-400    | formatMetric = "—"
  getCellColor(commandPlus,null)      = text-orange-400  | formatMetric = "—"
  getCellColor(totalRE,    null)      = text-red-400     | formatMetric = "—"
  getCellColor(totalRE,    0)         = text-red-400     | formatMetric = "0"
  getCellColor(totalRE,    100)       = text-red-400     | formatMetric = "100"
  ```

  Today the `'—'` path is the common one because `calcArsenal` and `calcAdvancedByYear` pre-format
  to `'—'`, which lands in neutral grey. Raw `null` reaches `getCellColor` for any registry column a
  row simply does not carry — the Advanced table's `sos` and `deceptionScore` are merged in
  conditionally (`OverviewTab.tsx:70,146-149`), and any new call site passing raw values inherits
  the bug immediately. `RE24` is broken unconditionally today.
- **Expected vs actual:** every missing value renders in a neutral colour; only measured values get
  a judgement colour. Actual: missing plus-stats read as "below average"; every non-negative `RE24`
  reads as "bad".
- **Fix:** in `lib/metricRegistry.ts:618`, add a single top guard before the switch —
  `if (value == null || value === '' || value === '—') return 'text-zinc-500'` — and add
  `if (!Number.isFinite(n)) return 'text-zinc-500'` inside the `inverted_value` branch. Give `RE24` a
  neutral band (`|value| < 1 → text-zinc-300`) so a genuinely neutral run value is not painted red.
- **Confidence:** verified.

---

## F7. Career innings pitched renders the literal string `NaN.NaN`

- **Impact:** high — Player dashboard Overview → Traditional, for any pitcher with a pre-Statcast
  season whose Lahman `ipouts` is null. The `IP` cell of the bolded "Career" row displays the
  characters `NaN.NaN`.
- **Location:** `lib/metricRegistry.ts:672-678` (the `case 'ip'` branch):
  ```
  const outs = rows.reduce((s, r) => {
    const parts = String(r[key]).split('.')
    return s + parseInt(parts[0]) * 3 + parseInt(parts[1] || '0')
  }, 0)
  ```
  Fed rows produced at `components/dashboard/OverviewTab.tsx:29` —
  `ip: s.ipouts != null ? \`${Math.floor(s.ipouts/3)}.${s.ipouts%3}\` : '—'`.
- **What's wrong:** every other totals strategy filters non-numeric rows via
  `.filter(v => !isNaN(v))` (`:653`). The `ip` branch re-reads `rows` directly and skips that filter.
  `parseInt('—')` is `NaN`, `NaN * 3 + NaN` is `NaN`, and `NaN` is absorbing — one bad row destroys
  the whole sum. `formatMetric` then passes the string through untouched because it is neither
  `null` nor `'—'`.
- **Evidence:** executed under Vitest against a fixture containing one `ip: '—'` row:
  `TOTALS ROW = {"year":"Career","ip":"NaN.NaN", ...}` and
  `rendered IP cell = NaN.NaN`.
- **Expected vs actual:** `205.0` (summing only the parseable rows) with a footnote that some
  seasons are excluded. Actual: `NaN.NaN`.
- **Fix:** guard inside the reduce — `const a = parseInt(parts[0]); const b = parseInt(parts[1] || '0');
  return Number.isFinite(a) && Number.isFinite(b) ? s + a*3 + b : s`. Add a Vitest case with a `'—'`
  row and verify it goes red before the fix.
- **Confidence:** verified.

---

## F8. Pre-Statcast seasons hard-code doubles, triples, and pitch count to `0`

- **Impact:** high — Player dashboard Overview → Traditional for any pitcher with a career
  predating 2015. A 1998 season renders `2B 0`, `3B 0`, `Pitches 0` — reading as "he allowed zero
  doubles", not "we don't have pitch-level data for 1998". Those zeros then feed the `sum` totals
  strategy, so the career `2B`/`3B`/`Pitches` figures are silently Statcast-era-only while carrying
  a "Career" label.
- **Location:** `components/dashboard/OverviewTab.tsx:29` —
  `{ year: s.year, pitches: 0, games: s.g ?? 0, pa: s.bfp ?? 0, … h: s.h ?? 0, '2b': 0, '3b': 0, … }`
- **What's wrong:** the row correctly uses `'—'` for `ba`, `obp`, `slg`, `whiffPct`, `csPct` — the
  author clearly knew the distinction — but three counting columns were given literal `0` instead.
  Lahman has no doubles/triples-allowed for pitchers, so `'—'` is the honest value.
- **Evidence:** code read. The neighbouring `'—'` assignments on lines 32-33 and 38-39 establish
  that `'—'` is the intended convention on this exact row shape.
- **Expected vs actual:** `2B —`, `3B —`, `Pitches —`, and a career total that either excludes
  those seasons with a marker or is itself `—`. Actual: `0`, summed into the career line.
- **Fix:** change the three literals to `'—'` at `OverviewTab.tsx:29`. Separately, make
  `calcTotalsFromRegistry`'s `'sum'` branch mark partial coverage — if `vals.length < rows.length`,
  suffix the total (e.g. render `1,204*` with a tooltip naming the covered seasons).
- **Confidence:** verified.

---

## F9. `Stuff+` silently swaps to a different model at a 50% coverage threshold

- **Impact:** high — Player dashboard Overview → Arsenal `Stuff+` column, and every surface that
  reads `stuff_plus`. Two different models render under one label with nothing on screen naming
  which produced the number, and the switch is a step function of a coverage ratio the user cannot
  see. This is the exact shape of the failure this platform has already lived through once.
- **Location:** `lib/pitcherStats.ts:289-294`:
  ```
  const dbStuffPlusVals   = pitches.map(p => p.stuff_plus).filter(x => x != null)
  const clientStuffVals   = pitches.map(p => p.stuff_rv).filter(x => x != null)
  const stuffSrc = dbStuffPlusVals.length > pitches.length * 0.5 ? dbStuffPlusVals : clientStuffVals
  ```
  with `stuff_rv` produced at `lib/enrichData.ts:143-145` / `lib/enrichDerivedFields.ts` via
  `computeStuffRV` (`lib/leagueStats.ts:1176-1195`).
- **What's wrong:** four distinct problems in six lines.
  1. **Different quantities, one label.** `stuff_plus` is an XGBoost model output backfilled to the
     database; `stuff_rv` is a hand-weighted linear z-score,
     `100 + 4.5·veloZ + 3.5·moveZ + 2.0·extZ`. The inline comment calls them "same scale", which is
     true and beside the point — same scale is not same quantity.
  2. **The two populations are disjoint.** `enrichData` computes `stuff_rv` *only* when
     `p.stuff_plus == null`. At 60% coverage the display averages the 60% DB values and discards the
     40%; at 40% it averages the 40% client values and discards the 60%. Crossing the threshold
     swaps the entire underlying sample, so the rendered value can jump discontinuously between two
     adjacent filter states.
  3. **No coverage is stated.** Nothing on the tile or in the tooltip says how many of the pitches
     contributed.
  4. **Clamping is presented as measurement.** `computeStuffRV` returns
     `Math.max(0, Math.min(200, raw))` — an exceptional pitch renders `200` and a poor one renders
     `0`, and `0` reads as missing data.
- **Evidence:** code read, plus coverage measured from the database. Skubal (`pitcher = 669373`):

  | Season | Pitches | With `stuff_plus` | Coverage |
  |---|---|---|---|
  | 2021 | 2,837 | 2,547 | **89.8%** |
  | 2023 | 1,219 | 1,218 | 99.9% |
  | 2024 | 3,097 | 2,838 | **91.6%** |
  | 2026 | 1,930 | 1,834 | 95.0% |

  Coverage is currently well above the crossover for this pitcher, so the switch is not firing
  today — but 8–10% of his pitches are silently dropped from the average with no signal, and a
  pitcher or season on the wrong side of 50% gets a different model under the same header.
- **Expected vs actual:** the column states its source and its coverage — `Stuff+ 108 (91% cov.)`,
  with the linear-approximation variant labelled distinctly (`Stuff+ᵉ` or a different column). Actual:
  one unannotated integer.
- **Fix:** return `{ value, n, coverage, source }` from `calcArsenal`'s Stuff+ computation and render
  coverage in the cell tooltip; never mix the two models in one number; refuse to render below a
  coverage floor (`'—'` under 60%). This is the concrete first use of the coverage affordance the
  registry needs.
- **Confidence:** verified.

---

## F10. Average exit velocity and hard-hit% are biased downward by nulls summed as zero

- **Impact:** high — Player dashboard Overview → Advanced (`Avg EV`), Overview → Arsenal (`EV`), and
  the percentile panel (`Avg EV`, `Hard Hit%`). The bias is small league-wide and severe on the small
  per-pitch-type samples these surfaces actually display. Because low exit velocity is *good* for a
  pitcher, the error always flatters the pitcher — and in the percentile panel it converts directly
  into a better-looking bar.
- **Location:**
  - `lib/pitcherStats.ts:128` — `const evs = battedBalls.map(p => p.launch_speed)` (no null filter)
  - `lib/pitcherStats.ts:270` — `const evs = pitches.filter(p => p.bb_type != null).map(p => p.launch_speed)` (no null filter)
  - `components/charts/PercentileRankings.tsx:120` — same pattern; `:127` —
    `hardHits = battedBalls.filter(d => d.launch_speed >= 95)`
  - the `avg` helper at `lib/pitcherStats.ts:158` — `arr.reduce((a,b) => a+b, 0) / arr.length`
- **What's wrong:** `null` in the reduce contributes `0` to the numerator but `1` to the
  denominator, so every batted ball with a missing `launch_speed` is scored as a 0 mph batted ball.
  For `hardHits`, `null >= 95` is `false`, so the row lands in the denominator only — the same
  downward bias by a different route. Contrast `lib/pitcherStats.ts:263-269`, where `brinks`,
  `clusters`, `xwobas` and friends *are* filtered — the omission is inconsistent within the same
  function.
- **Evidence:** database, April 2026 league-wide batted balls:

  ```
  batted_balls              20199
  bb_null_launch_speed         51
  true avg EV               88.31
  app avg EV (null→0)       88.09
  ```

  0.22 mph league-wide. But the display unit is a pitch type in a season: **one null in a 20-batted-
  ball sample drops the rendered Avg EV by 4.4 mph**, and the Arsenal tab routinely shows pitch types
  with fewer than 20 batted balls (Skubal's 2026 curveball: 12).
- **Expected vs actual:** `avg` over non-null values only, with `n` shown. Actual: a silently
  deflated mean with no n.
- **Fix:** `const evs = battedBalls.map(p => p.launch_speed).filter((v): v is number => v != null)`
  at all three sites, and `hardHits = battedBalls.filter(d => d.launch_speed != null && d.launch_speed >= 95).length`
  with the denominator restricted to the same non-null set. Add a golden-file test over a fixture
  containing a null-EV batted ball.
- **Confidence:** verified.

---

## F11. "Lg Avg" always shows the 2026 baseline, whatever season is on screen

- **Impact:** high — Movement Profile arsenal legend on the player dashboard (and the MiLB
  equivalent). The column header is literally `Lg Avg` with no year, and it is the direct visual
  comparison a user makes against the `MPH` column beside it.
- **Location:** `components/charts/MovementProfile.tsx:52` — `const bl = STUFF_ZSCORE_BASELINES[name]`
  and `:58` — `lgAvg: bl ? bl.avg_velo.toFixed(1) : '—'`; with
  `lib/leagueStats.ts:1154` — `export const STUFF_ZSCORE_BASELINES = BL_BY_YEAR[2026]`.
- **What's wrong:** the year-aware accessor exists (`getStuffBaseline(pitchName, year)`,
  `lib/leagueStats.ts:1159-1169`) and `computeStuffRV` uses it correctly. `MovementProfile` reaches
  past it to the fixed 2026 export.
- **Evidence:** read `BL_BY_YEAR` directly:

  | Pitch | 2015 `avg_velo` | 2026 `avg_velo` (what renders) | Error |
  |---|---|---|---|
  | 4-Seam Fastball | 93.13 | **94.20** | 1.07 mph |
  | Curveball | 78.17 | **79.95** | 1.78 mph |
  | Changeup | 84.00 | **85.59** | 1.59 mph |
  | Knuckle Curve | 80.72 | **82.98** | 2.26 mph |

  A 2015 fastball averaging 93.8 renders next to `94.2` and reads as below league average. It was
  0.67 mph **above** the 2015 league average.
- **Expected vs actual:** the baseline for the season being displayed, and a header that names it
  (`Lg Avg '26`). Actual: 2026's baseline against every season, unlabelled.
- **Fix:** derive the season from the loaded rows (`Math.max(...data.map(d => d.game_year))`) and
  call `getStuffBaseline(name, season)` — export it from `lib/leagueStats.ts`, it is currently
  module-private. Put the resolved season in the column header. When the loaded set spans multiple
  seasons, render `—` rather than an arbitrary one.
- **Confidence:** verified.

---

## F12. Whiff%, Chase% and Swing% heatmaps show proportions under percent labels

- **Impact:** high — Reports Builder heatmap tiles. The hover tooltip reads `Whiff%: 0.345` and the
  colourbar reads `0.2 … 0.4`. A user reads a third of one percent where the true value is 34.5%.
  Every other surface in the app renders these three metrics as `34.5%`.
- **Location:** `components/reports/TileViz.tsx:56-66` — `calcMetric` returns
  `wh.length / sw.length` (a 0–1 proportion) for `whiff_pct`, `chase_pct`, `swing_pct`;
  `:147` — `hovertemplate: \`${METRIC_LABELS[metric]}: %{z:.3f}\`` with
  `METRIC_LABELS.whiff_pct = 'Whiff%'` (`:29`);
  `:150` — `fmtZ` sends everything outside the batting-average list to `v.toFixed(1)`.
  Compare `:71-78`, where `fmtMetric` — used elsewhere in the same file — correctly does
  `(v*100).toFixed(1)+'%'`.
- **What's wrong:** two formatters in one file disagree; the heatmap path uses the raw one. The
  label supplies the `%` and the value supplies a proportion, so they multiply into a 100× error in
  the reader's head.
- **Evidence:** code read. Confirmed the mismatch is display-only: `app/api/league-baseline/route.ts`
  **does** convert correctly (`whiff_pct: { metric: 'whiff_pct', scale: 1/100 }`, `:34-37`), and the
  database stores `whiff_pct = 22.5669` / `chase_pct = 29.9258` as percentages — so the colour scale
  itself is right. It is only the printed numbers that are wrong.
- **Expected vs actual:** `Whiff%: 34.5%` and a colourbar reading `18.0 … 41.0`. Actual:
  `Whiff%: 0.345` and `0.2 … 0.4`.
- **Fix:** in `TileHeatmap`, scale `z` to percent for the three percentage metrics before building
  the trace (multiply the `calcMetric` output by 100 and multiply the baseline `zmin`/`zmax` by 100
  to match), and route the tooltip through `fmtMetric` instead of `%{z:.3f}` by passing formatted
  strings in `customdata`.
- **Confidence:** verified.

---

## F13. The percentile panel's comparison population changes with the user's filter, silently

- **Impact:** medium-high — "MLB Percentile Rankings" on the player dashboard. Both the **role** and
  the **season** used to fetch breakpoints are derived from whatever rows are currently loaded, so a
  filter change re-baselines every bar without changing a single label. Nothing on the panel names
  the season, the role, or the sample.
- **Location:** `components/charts/PercentileRankings.tsx:17-28` (role) and `:31-34` (season):
  ```
  const gamesOver50 = Object.values(gamePitchCounts).filter(c => c >= 50).length
  return gamesOver50 >= 3 ? 'SP' : 'RP'
  ...
  const season = Math.max(...years)
  ```
- **What's wrong:**
  1. **Role flips on filter.** Narrow the view to two starts and `gamesOver50` drops below 3 — the
     pitcher is reclassified **RP** and every percentile is recomputed against relievers, who have
     materially different distributions (2026 MLB whiff%: SP 22.57 ± 3.91 vs RP 24.75 ± 5.44, from
     `league_averages`). The bars move; the header does not.
  2. **Value and baseline come from different populations.** The *values* (`k_pct`, `avg_ev`, …) are
     computed over **all loaded rows**, pooled across every season in the filter. The *breakpoints*
     come from `Math.max(...years)` alone. A career-pooled K% is ranked against 2026-only
     breakpoints.
  3. **No n anywhere.** `barrel_pct` over 12 batted balls renders with the same visual confidence as
     one over 400.
- **Evidence:** code read; role/season derivation traced; the SP/RP spread quantified from
  `league_averages` in the database.
- **Expected vs actual:** a subheader reading `vs 2026 MLB SP · 412 BBE · 1,930 P`, and a refusal
  to rank a pooled multi-season value against one season's breakpoints. Actual: an unqualified "MLB
  Percentile Rankings" title.
- **Fix:** render the resolved season, role, and per-metric `n` in the panel; when the loaded set
  spans multiple seasons, either restrict the value computation to the baseline season or suppress
  the panel with an explanatory empty state; grey out any bar whose `n` is below a floor.
- **Confidence:** verified (mechanism); the visual consequence is *probable* pending a screenshot.

---

## F14. Two incompatible colour-scale regimes render identically in the report grid

- **Impact:** medium-high — Reports Builder heatmap tiles. A tile whose metric has a
  `league_averages` row is scaled to **league mean ± 3σ** — an absolute, cross-player-comparable
  scale. A tile whose metric has no row is scaled to **its own data's min and max** — a relative
  scale on which every player's best bin is full red. The two look identical and sit side by side.
- **Location:** `components/reports/TileViz.tsx:147-150`:
  ```
  if (baseline) { trace.zmin = baseline.value - 3*baseline.stddev; trace.zmax = baseline.value + 3*baseline.stddev }
  ...
  const zMin = trace.zmin != null ? trace.zmin : (zVals?.length ? Math.min(...zVals) : 0)
  ```
  with the metric allow-list at `app/api/league-baseline/route.ts:26-38`.
- **What's wrong:** `swing_pct`, `la` (no `avg_la` row for most scopes) and any unmapped metric fall
  through to the data range; `ba`, `slg`, `woba`, `xba`, `xwoba`, `xslg`, `ev`, `whiff_pct`,
  `chase_pct` are league-anchored. Comparing two tiles is the whole point of a report grid, and here
  it is only sometimes valid.
- **Secondary:** the API averages `stddev` across SP and RP rows weighted by `n_qualified`
  (`route.ts:80-89`). A weighted mean of two standard deviations understates the pooled standard
  deviation of the combined population, so the ±3σ window is narrower than intended and more bins
  clamp to the extreme colours than should.
- **Evidence:** code read at both sites; `league_averages` metric coverage checked in the database
  (rows exist for `ba`, `slg`, `whiff_pct`, `chase_pct`; none for `swing_pct`).
- **Expected vs actual:** a one-glyph marker on the tile's colour legend distinguishing "league
  scale" from "own range", and identical scaling for tiles the user placed side by side. Actual: no
  distinction.
- **Fix:** render a small `LG` / `REL` badge next to the existing colourbar strip at
  `TileViz.tsx:152-156`; and pool the stddev properly in `route.ts` using
  `√(Σ nᵢ(σᵢ² + (μᵢ − μ̄)²) / Σ nᵢ)`.
- **Confidence:** verified (code); *probable* on the visual impact.

---

## F15. The leaderboard qualifier scales to today's date and never updates when the season changes

- **Impact:** medium-high — Explore (`(research)/explore`), WBC, MiLB Explore. The set of players on
  a leaderboard depends on the calendar date the user opens the page, and a historical season is
  qualified with a partial-season threshold.
- **Location:** `lib/leaderboardColumns.ts:483-500` (`defaultQualifier`) and
  `lib/hooks/useExploreData.ts:113` — `useState(defaultQualifier(initView))` — with the only reset at
  `:301`, `setQualifier(defaultQualifier(v))`, fired **on view change only**, never on year change.
  Applied at `:197`, `:226-227`.
- **What's wrong:** `defaultQualifier` computes `fraction = (dayOfYear − 91) / 182` from
  `new Date()` and scales a 500-pitch full-season threshold by it. On 22 August that is
  `500 × 0.786 ≈ 393`. Selecting **2019** in the year filter does not recompute it, so a completed
  season is qualified at 393 pitches — and the same page opened in October would qualify it at 500
  and show a different set of players. The threshold is displayed in the qualifier control but the
  leaderboard header does not restate it, and nothing indicates it was derived from today's date
  rather than the selected season's completeness.
- **Evidence:** code read; arithmetic from `dayOfYear = 234` on 2026-08-22.
- **Expected vs actual:** a completed season uses the full-season threshold; the current season
  scales; the active threshold is restated next to the results. Actual: today's fraction applied to
  every season.
- **Fix:** make `defaultQualifier(view, season)` return the full threshold when
  `season < currentYear`, and add `season` to the effect that resets the qualifier in
  `useExploreData.ts`.
- **Secondary at the same site:** `<span>{rows.length} rows</span>`
  (`app/(research)/explore/page.tsx:131`) is the current page's row count, not the size of the
  matching set — it reads as a result count.
- **Confidence:** verified.

---

## F16. The velocity-trend smoothing window varies with the user's filter, and short pitch types vanish

- **Impact:** medium — Player dashboard velocity trend chart. Three separate honesty problems on
  one 40-line component.
- **Location:** `components/charts/RollingAverages.tsx:10` —
  `const window = Math.min(25, Math.floor(f.length / 4))`; `:14` — `if (pts.length < window) return null`;
  `:31` — the title; `:35` — the y-axis.
- **What's wrong:**
  1. **The window is a function of the filter, not the data.** `f` is the filtered set, so filtering
     to 60 pitches produces a 15-pitch window and filtering to 3,000 produces a 25-pitch window. The
     title does interpolate the window (`Velocity Trend (${window}-pitch rolling avg)`), which is
     genuinely good — but the *sample* the window is drawn from is the all-pitch-type total, applied
     to each pitch type individually.
  2. **Pitch types below the window disappear with no trace.** `if (pts.length < window) return null`
     removes the trace *and* the legend entry. A curveball thrown 18 times is simply absent, which
     reads as "he does not throw one".
  3. **The line interpolates across the offseason.** The x-axis is `game_date` but the window is over
     *pitches*, so with multi-season data loaded a straight segment is drawn across a five-month gap,
     and windows straddling the year boundary average pitches from two seasons and plot them at the
     April date.
  4. **The y-axis autoscales.** With no explicit `range`, Plotly fits a 0.4 mph wobble to the full
     plot height, so normal noise renders as a cliff. This is the manufactured-trend failure mode in
     its purest form.
- **Evidence:** code read.
- **Expected vs actual:** a fixed window (or one derived from the pitch type's own count), dropped
  pitch types listed in a footnote, `connectgaps: false` with an explicit break between seasons, and
  a y-axis range with a sane floor (e.g. `[min − 2, max + 2]` with a minimum span of 4 mph).
- **Fix:** compute `window` per pitch type as `Math.min(25, Math.max(5, Math.floor(pts.length/4)))`,
  replace the `return null` with a rendered "not enough data" chip listing the omitted pitch types,
  and pin the y-axis span.
- **Confidence:** verified (code); *inferred* on the visual severity until profiled against a real
  player.

---

## F17. Whiff%, CSW% and Chase% use different definitions on the dashboard and in Reports

- **Impact:** medium — the same metric label carries different arithmetic on the player dashboard
  and the Reports Builder. Two surfaces of the same product will disagree on the same player.
- **Location:**
  - Dashboard — `lib/pitcherStats.ts:83-90` and `:271-279`: swings include
    `swinging_strike | foul | hit_into_play | missed_bunt | swinging_pitchout`; whiffs include
    `swinging_strike | missed_bunt | swinging_pitchout`.
  - Reports — `components/reports/TileViz.tsx:242-248`: swings include
    `swinging_strike | foul | hit_into_play | foul_tip`; whiffs include `swinging_strike` **only**.
  - Chase denominator — `TileViz.tsx:311` uses `d.zone > 9`; `PercentileRankings.tsx:113` uses
    `Number(d.zone) >= 11`.
- **What's wrong:** `missed_bunt` and `swinging_pitchout` are counted as whiffs on one surface and
  not the other. `foul_tip` is listed separately in Reports but is already matched by
  `includes('foul')`, so it is dead code that reads as a deliberate difference. The registry tip for
  `whiffPct` (`lib/metricRegistry.ts:239`) says "Swinging strikes divided by total swings" without
  resolving which events count.
- **Evidence:** code read at all four sites. The zone difference is likely inert (Statcast uses
  zones 1–9 and 11–14, with no zone 10) but the two expressions encode different intent.
- **Expected vs actual:** one exported predicate — `isSwing(row)`, `isWhiff(row)` — imported by
  every surface. Actual: four hand-rolled copies that have drifted.
- **Fix:** extract `isSwing` / `isWhiff` / `isCalledStrike` / `isOutOfZone` into `lib/pitchEvents.ts`,
  import them everywhere, and add a golden-file test pinning Whiff% for a fixture that includes a
  `missed_bunt` and a `foul_tip`.
- **Confidence:** verified.

---

## F18. Rate stats fall back to a literal zero, so "no at-bats" renders as `.000`

- **Impact:** medium — Player dashboard Overview → Traditional and Advanced, most visible when a
  filter narrows the set. `BA .000` reads as "unhittable"; the truth is "there were no at-bats".
- **Location:**
  - `lib/pitcherStats.ts:100-103` — `const ba = abs > 0 ? (hits/abs) : 0`, same for `obp` and `slg`;
    `ops` is then `(obp + slg).toFixed(3)` = `0.000`.
  - `lib/pitcherStats.ts:143` — `const bbT = battedBalls.length || 1`, so with zero batted balls
    `gbPct`, `fbPct`, `ldPct`, `puPct` all render `0.0` rather than `—`.
  - `components/dashboard/HistoricalOverviewTab.tsx:79-81` — `Number(totals.obp) || 0` means a career
    `OPS` renders `0.000` when `OBP` correctly rendered `—`.
- **What's wrong:** the same file demonstrates the right pattern one line away —
  `kPct: pas > 0 ? … : '—'` at `:105`. The batting-line trio was written with a numeric `0` fallback
  instead.
- **Evidence:** code read.
- **Expected vs actual:** `—` in all four cases. Actual: `.000` / `0.0` / `0.000`.
- **Fix:** return `'—'` from the `else` branches at `pitcherStats.ts:100-103`; change `bbT` to a
  guarded `battedBalls.length` with the four percentages returning `'—'` when it is zero; make the
  `ops` branch in `HistoricalOverviewTab` return `'—'` when either component is `'—'`.
- **Confidence:** verified.

---

## F19. `.filter(Boolean)` silently discards legitimate zero measurements

- **Impact:** medium — arm angle and launch angle averages on the player dashboard and Movement
  Profile. `0` is a real, meaningful value for both quantities and it is being treated as missing.
- **Location:**
  - `lib/pitcherStats.ts:257` — `const arms = pitches.map(p => p.arm_angle).filter(Boolean)`
  - `lib/pitcherStats.ts:130` — `const las = battedBalls.map(p => p.launch_angle).filter(Boolean)`
  - `components/charts/MovementProfile.tsx:46` — `pts.map(p => p.release_speed).filter(Boolean)`
    (inert for velocity, same anti-pattern)
- **What's wrong:** `arm_angle = 0` is a perfectly horizontal (true sidearm/submarine) release —
  exactly the pitchers whose arm angle a scout most wants to read. `launch_angle = 0` is a ball hit
  flat off the bat, and dropping it removes only values from the **bottom** of the distribution, so
  the rendered `Avg LA` is biased **upward**. Note the correct predicate is used two lines away for
  `hb` and `vb`: `.filter((v: any) => v != null)`.
- **Evidence:** database, April 2026 batted balls — **247 rows with `launch_angle = 0`** out of
  20,199 (1.2%), versus 45 rows with `launch_angle IS NULL`. Every one of the 247 is being discarded
  as though it were missing.
- **Expected vs actual:** `.filter((v): v is number => v != null)` in all three places. Actual: a
  systematically inflated average launch angle and a sidearmer's flattest pitches excluded from his
  arm-angle average.
- **Fix:** replace `.filter(Boolean)` with a null check at each site. Add a property test asserting
  `avg([0, 10]) === 5` through the real code path.
- **Confidence:** verified.

---

## F20. Derived movement is rounded per row before aggregation, and mobile and desktop round differently

- **Impact:** medium — a same-metric numeric disagreement between the mobile and desktop player
  dashboards, on top of the sign flip in F1.
- **Location:**
  - `lib/enrichDerivedFields.ts:24-25` and `lib/enrichData.ts:99-100` —
    `p.pfx_x_in = +(p.pfx_x * 12).toFixed(1)`; same pattern for `brink` (`:29`), `cluster`, `hdev`,
    `vdev`.
  - `components/mobile/MobilePlayerDashboard.tsx:129` — averages the **pre-rounded** `pfx_x_in`.
  - `lib/pitcherStats.ts:305` — averages the **raw** `pfx_x * 12`.
- **What's wrong:** rounding belongs at render, not at enrichment. Each row is quantised to 0.1"
  before it enters any mean, and the two dashboards choose different sides of that quantisation, so
  they can differ in the last displayed digit for identical input. `brink`, `cluster`, `hdev` and
  `vdev` are then fed into z-scores against league baselines (`computeYearWeightedPlus`), so the
  quantisation propagates into `Brink+`, `Cluster+`, `Cmd+` and `RPCom+`.
- **Evidence:** code read at all sites.
- **Expected vs actual:** full precision retained through aggregation; `toFixed` applied only in the
  formatter. Actual: a per-row round, with two surfaces disagreeing about which value to average.
- **Fix:** drop the `+(...).toFixed(1)` wrappers in both enrichment functions and let the registry's
  `FormatSpec` do the rounding at render. Point `MobilePlayerDashboard` at the same computation the
  desktop arsenal uses rather than a parallel implementation.
- **Confidence:** verified.

---

## F21. Two different Usage% values render on the same player page

- **Impact:** medium — the Arsenal table's `Usage%` and the Movement Profile legend's `Usage` are
  computed over different denominators and appear within one scroll of each other.
- **Location:** `lib/pitcherStats.ts:302` — `usagePct: pct(pitches.length, total)` where
  `total = data.length` (**all** loaded rows, including rows with a null `pitch_name`);
  `components/charts/MovementProfile.tsx:55` — `usage: ((pts.length / total) * 100)` where
  `total = filtered.length` (**only** rows with non-null `pfx_x`, `pfx_z` **and** `pitch_name`).
- **What's wrong:** the two denominators differ by every row missing movement or classification data,
  so the two figures diverge in proportion to that gap, and the Arsenal column does not sum to 100.
- **Evidence:** code read. For Skubal 2026 the classified rows total 1,929 against `data.length`
  — any unclassified pitches shift the Arsenal figure down while leaving the legend figure unchanged.
- **Expected vs actual:** one denominator, stated. Actual: two, unlabelled.
- **Fix:** define `Usage%` as "share of classified pitches" in `lib/metricRegistry.ts` and compute
  both from `data.filter(d => d.pitch_name).length`.
- **Confidence:** verified.

---

## F22. `xBA` treats a missing expected-BA estimate as a true zero

- **Impact:** medium-low — Player dashboard Overview → Advanced (`xBA`), Overview → Arsenal (`xBA`),
  and the percentile panel (`xBA`).
- **Location:** `lib/pitcherStats.ts:132` and `:273`, `components/charts/PercentileRankings.tsx:122`:
  `reduce((s, d) => s + (d.estimated_ba_using_speedangle || 0), 0)` divided by the at-bat count.
- **What's wrong:** `|| 0` is correct for a strikeout (xBA genuinely is 0) but wrong for a batted
  ball whose Statcast estimate is missing — that at-bat stays in the denominator and contributes
  zero, deflating `xBA`. It also discards `0` as a value indistinguishable from missing, which is the
  same category error as F19.
- **Evidence:** code read.
- **Expected vs actual:** the numerator should sum estimates for batted balls, add `0` explicitly for
  strikeouts, and **exclude** at-bats whose estimate is missing from both numerator and denominator
  — with the excluded count available as coverage.
- **Fix:** split the reduce into an explicit three-way branch on `bb_type` / `events` / `null`.
- **Confidence:** verified (mechanism); the magnitude is *suspected* — I did not measure the null
  rate for `estimated_ba_using_speedangle` on batted balls.

---

## F23. Smaller items worth one commit each

- **Percentiles clamp to 1–99 and present it as measured.** `lib/leagueStats.ts:1297` —
  `Math.max(1, Math.min(99, lo))`. A genuine best-in-league value renders `99`. Show `99+` or the
  true rank. *(verified, low)*
- **Enrichment overwrites `count`.** `lib/enrichData.ts:160` sets `p.count = "0-2"` (the ball-strike
  string) on every row, while `METRIC_REGISTRY.count` (`lib/metricRegistry.ts:98-104`) is labelled
  `#` and documented as "Number of pitches". The namespaces do not currently collide, but one
  registry lookup against an enriched row would render a count string in a numeric column. Rename
  the derived field to `count_str`. *(verified, low)*
- **Pitchouts and intentional balls enter the cluster centroid.**
  `lib/hooks/usePlayerData.ts:149-150` runs `enrichDerivedFields(allRows)` **before**
  `allRows.filter(r => r.pitch_type !== 'PO' && r.pitch_type !== 'IN')`, so pitches thrown far
  outside the zone by design contribute to each pitch type's centroid, then disappear from the
  display. Move the filter above the enrichment. *(verified, low)*
- **Axis units and tooltip units disagree on the location heatmap.**
  `components/charts/StrikeZoneHeatmap.tsx:25` labels the x-axis `Horizontal (ft)` while `:17`
  renders the tooltip in inches (`X: %{customdata[0]:.1f}"`). Both are labelled, so this is a
  consistency nit rather than an error — but the platform convention is inches. *(verified, low)*
- **Badge contrast on the percentile chips.** `components/charts/PercentileRankings.tsx:196` uses
  white text whenever `pct < 30 || pct > 70`; at `pct = 29` the background is a mid-blue around
  `rgb(137,150,208)`, which puts white text near 2.5:1 — below WCAG AA for small text. Widen the
  dark-text band or use a fixed dark chip with a coloured border. *(probable — I computed the colour
  from `percentileColor` but did not measure the rendered contrast)*

---

## What is displayed honestly

These are correct and should not be touched:

- **`app/api/league-baseline/route.ts` handles its unit conversion properly.** `HEATMAP_TO_LA_METRIC`
  (`:26-38`) carries an explicit `scale: 1/100` for `whiff_pct` and `chase_pct` because
  `league_averages` stores those as 0–100 while the heatmap compares against 0–1 fractions, and the
  role mapping resolves `pitching → ['SP','RP']` and `hitting → ['hitter']` to match the actual
  stored role values. I expected this to be broken and went to the database to prove it; it is right.
  Verified against `league_averages` rows: `whiff_pct` MLB/SP/2026 = `22.5669 ± 3.9100`.
- **`scaleanchor` is applied on every chart where the axes must share a scale** — strike-zone
  heatmaps, location cards, movement profiles, release-point plots, report tiles, TrackMan session
  review, and the umpire zone map. Fifteen call sites, no misses found. Movement and location plots
  are not distorted by container aspect ratio.
- **`lib/leaderboardColumns.ts:456-470` (`formatValue`) and `:471-476` (`getCellColor`) get
  null handling exactly right** — `if (v === null || v === undefined) return '—'`, and the colour
  helper guards with `value != null && !isNaN(Number(value))` before calling `conditionalColor`. This
  is the correct pattern and it is what `lib/metricRegistry.ts:618` should be copying (F6).
- **`components/dashboard/HistoricalOverviewTab.tsx:57-100` recomputes career rate stats from summed
  components** — `ERA` from `9 × ΣER / (Σipouts/3)`, `OBP` from summed `h`/`bb`/`hbp`/`ab`/`sf`. This
  is the correct implementation of the thing F2 gets wrong, already in the repo.
- **The cluster centroid is correctly year-partitioned.** `lib/enrichData.ts:32` and
  `lib/enrichDerivedFields.ts` key buckets as `${game_year}::${pitch_name}`, so selecting a single
  season produces the same centroid as an all-seasons fetch. I expected the year selector to move
  `Cluster+` and it does not.
- **The player page states its filtered pitch count and marks it as filtered.**
  `app/(research)/player/[id]/page.tsx:125` — `{resultCount} pitches{activeFilters.length > 0 ? " (filtered)" : ""}`.
  This is the right instinct; it just needs to descend from the page header to the individual tiles.
- **Charts refuse to render below a floor rather than drawing something misleading** —
  `RollingAverages.tsx:7` (`f.length < 10`), `TileViz.tsx:121` (`f.length < 5`),
  `MovementProfile.tsx:70`. The floors are too low, but the pattern exists.
- **`computeStuffRV` guards zero/NaN standard deviations explicitly** (`lib/leagueStats.ts:1187-1188`)
  rather than emitting `±Infinity`, with a comment explaining why.
- **`RollingAverages` interpolates its window size into its own title**
  (`Velocity Trend (${window}-pitch rolling avg)`, `:31`) — the label follows the computation. That
  is the discipline the rest of the platform needs.
- **The trends page reports change in sigma units** (`app/(research)/trends/page.tsx:326,353,438`)
  and exposes a `Min Pitches` qualifier control (`:390`), which is the only place in the research app
  that treats instability as a first-class display concern.

---

## What I could not determine

- **Whether any of these render as described in a browser.** Every finding here is traced through
  code, and the executable ones I ran under Vitest (F2, F6, F7). I did not launch the app, did not
  screenshot a tile, and did not profile a render. The visual severity claims in F5, F13, F14 and F16
  are graded *probable* or *inferred* for that reason. The single fastest way to close this gap is
  to load Skubal's page and photograph the arsenal table next to the movement chart — F1 will be
  visible in one frame.
- **The null rate of `estimated_ba_using_speedangle` on batted balls** — I ran out of query budget
  before measuring it, so F22's magnitude is unquantified.
- **Current league-wide `stuff_plus` coverage by month.** Two attempts to aggregate over
  `game_date`/`game_year` across the full `pitches` table timed out at 8 s (no usable index for that
  grouping — a `pitcher`-scoped query returned instantly). I measured coverage for one pitcher only
  (89.8–99.9%), so I cannot say how many pitcher-seasons currently sit below the 50% crossover that
  triggers F9's silent model swap. **This is a question for Jo** — a coverage-by-month rollup over
  `pitches.stuff_plus` would tell us whether F9 is latent or already firing, and the missing index
  is in Jo's lane too.
- **Whether the MiLB surfaces share these exact code paths.** `app/(milb)/milb/reports/page.tsx`
  calls the same `enrichData`, and the MiLB player page imports the same dashboard tabs, so I
  expect F1, F2, F3, F6, F7, F10 and F18 to reproduce there — but I read the MLB paths and inferred
  the MiLB ones. Worth 20 minutes to confirm.
- **Whether `hBreak`'s catcher-view convention is deliberate.** `lib/pitcherPerspective.ts`'s header
  comment and the deliberate renaming of its axis constants read as a completed migration with one
  site missed, and the registry tip was never updated. But if the arsenal table is intentionally
  catcher-view, the fix is to **label** it rather than flip it. **This needs Trevor's call before I
  change a sign** — it is the kind of change that silently inverts every scouting note written off
  that table.
- **Whether `league_averages`' documented-median-but-implemented-as-`AVG()` discrepancy affects the
  heatmap ±3σ window.** That is a metric-definition question, not a rendering one — **hand it to
  Li**. The display consequence (a mislabelled centre line on every league-anchored tile) is mine,
  but the correct definition is not.

---

**Highest-leverage next action:** fix F1 — one line at `lib/pitcherStats.ts:305` plus the registry
tip — and ship it with a Vitest case asserting the arsenal `hBreak` and the `MovementProfile`
x-value carry the same sign for one fixture row. Run that test against the current code first and
watch it fail. It is the cheapest fix on this list, it is the only one that is currently telling
users the opposite of the truth, and the test it comes with is the first cross-surface consistency
test this repo would have.
