---
title: Visualization Principles — Picking the Encoding That Can't Lie
domain: analytics-ux
tags:
  - visualization
  - graphical-perception
  - chart-selection
  - axis-truncation
  - data-ink
  - small-multiples
  - plotly
  - strike-zone
sources_reviewed: 13
last_updated: 2026-08-13
---

# Visualization Principles — Picking the Encoding That Can't Lie

> Grades: **(verified)** read at `file:line`; **(documented)** research/vendor docs; **(inferred)**
> mechanism; **(cargo-cult)** unsupported. No production query run. Handoffs: uncertainty →
> `04-uncertainty-visualization.md`; palettes → `06-color-encoding-accessibility.md`; tables →
> `07-dense-table-design.md`; overlays → `11-broadcast-overlay-legibility.md`; render cost →
> `frontend-data-scale/02-plotly-performance.md`.


## TL;DR

- **Position beats length beats angle beats area beats color, and Triton's signature chart puts its payload in the weakest.** Fine for a spatial field, wrong for comparing pitchers. **(documented)**
- **The strike-zone heatmap renders values it never measured** — empty 2.6″×2.9″ cells are filled from ≥2 neighbours, twice, then smoothed again by Plotly, and the color-bar endpoints are read off that interpolated `z` rather than the data (`TileViz.tsx:134-147`). **(verified)**
- **Movement is drawn on unequal axes in the main dashboard chart** — both are inches, yet `PitchMovement.tsx:26-27` sets no `scaleanchor`, so break *shape* follows panel width. **(verified)**
- **Only the frequency heatmap gates on sample size** (`f.length < 5`); every other tile renders on n=1. **(verified)**
- **`rangemode` appears zero times in the repo** — every axis outside the fixed strike zone is Plotly autorange, truncated by default rather than by decision. **(verified)**
- **Truncation isn't a binary sin; it's a claim about which range matters** — for plus-stats the honest range is neither 0-based nor `[95,105]` but a band centered on 100. **(inferred)**
- **Bars encode length, so a velocity bar chart lies whichever baseline you pick** — `TileBar` offers `velo`/`spin`, which have no meaningful zero and want a dot plot. **(verified)**
- **The Reports grid looks like small multiples and isn't** — each tile computes its own z-range, and the overlay normalizes each player *separately* before multiplying. **(verified)**

---

## 1. The channel ranking, and where Triton's charts sit on it

Cleveland & McGill ranked perceptual tasks by measured accuracy; Heer & Bostock replicated at scale.
The surviving order: **position on a common scale → position on non-aligned scales → length →
angle/slope → area → color**. Bertin and Munzner add: put the attribute you most want compared in the
highest channel that can carry it. **(documented)**

| Triton chart | `file:line` | Channel (rank) | Verdict |
|---|---|---|---|
| Location / strike zone | `TileViz.tsx:165`,`:224` | 2-D position (1) | Right — position *is* the data |
| Movement scatter | `TileViz.tsx:165` | 2-D position (1) | Right channel, broken scale (§3.1) |
| Bar tile (rates) | `TileViz.tsx:201` | Length (3) | Right, given a zero baseline |
| Bar tile (`velo`,`spin`) | `TileViz.tsx:209-210` | Length (3) | Wrong — no zero (§3.2) |
| Metric heatmap | `TileViz.tsx:138` | Color on position grid (6) | Right for *where*, not *how much* |
| Overlay heatmap | `TileViz.tsx:769` | Color, doubly normalized (6) | Wrong — unitless (§5) |

The heatmap deserves defense: the question is **"where in the zone?"**, a 2-D field, so position is
spent on the field and color is the only channel left. The rule: **color-encoded value locates; it
never compares magnitude across tiles.** Any "how much" question must leave the heatmap for a
common-scale position or length chart. **(inferred)**

Select by question, not dropdown: *where does he live* → density over fixed geometry; *how do pitches
separate* → equal-aspect scatter; *how much* → bar from zero; *how hard* → dot plot; *better than
league?* → position against a benchmark, which nothing here draws
(`09-comparative-display-benchmarks.md`).

## 2. The heatmap manufactures data — this doc's severity-1 finding

`TileHeatmap`'s non-frequency path bins pitches into a 16×16 grid over x ∈ [−1.76, 1.76] ft,
z ∈ [0.24, 4.06] ft — cells of **2.64″ × 2.87″**. `calcMetric` returns `null` for an empty cell; then
`TileViz.tsx:134-137` runs two passes filling every `null` from the mean of any **≥2** non-null
neighbours, `zsmooth:'best'` resamples, and `connectgaps:true` bridges the rest. **(verified)** Three
consequences compound. A cell with zero observations shows a confident color, and since
interpolation runs twice a filled cell can seed another. `hoverongaps:false` stops protecting the
reader: it suppresses hover on `null` cells, but interpolation already removed the nulls, so the
tooltip prints a synthesized number to three decimals as though measured. And the legend misstates
the range — `zVals` flattens `trace.z` *after* interpolation (`:145-147`), so the printed endpoints
can be values no pitch produced. **(verified)**

Chase% is the tell that the author knows the principle: `:133` and `:136` null in-zone cells *and*
refuse to interpolate into them, an in-zone chase being undefined — right instinct, applied to one
metric of eleven. **(verified)** The fix is not deleting smoothing but **making support visible**: a
minimum cell count before a value renders, a mark on interpolated cells, a hover saying observed vs
inferred. `04-uncertainty-visualization.md` owns how to draw that; the claim here is only that the
chart cannot distinguish the two states. **(inferred)**

## 3. Scale honesty: aspect, baselines, truncation

### 3.1 Equal units demand equal scales

Unequal scales on same-unit axes rotate every relationship. HB and IVB are both inches, so a slider
14″ glove-side and 2″ down should *look* nearly horizontal. `charts/MovementProfile.tsx:98` and
`SessionReview.tsx:185` (`scaleratio: 1`) lock the aspect; `charts/PitchMovement.tsx:26-27` and
`TileViz.tsx:195` (anchored only for `location`) do not. Thirteen of 35 Plot files set `scaleanchor`,
and the two omitting it are the two most-seen movement charts — so break shape changes with browser
width. **(verified)**

### 3.2 Bar baselines and proportional ink

A bar means its length, so its area must be proportional to its value — forcing a zero baseline.
`usage`, `whiff`, `csw`, `zone`, `chase`, `swing` qualify (true zero, bounded 0–100). `velo`/`spin`
do not: no pitch has 0 mph, so a zero-baseline velocity chart renders indistinguishable bars and a
truncated one violates proportional ink. Change the **mark**, not the axis — a dot plot encodes
position on a common scale, outranks length, and may start at 85 mph. **(documented)** `TileBar`
declares no `rangemode`, so its zero baseline is Plotly's bar default, not an assertion in code;
`rangemode:'tozero'` costs a line and makes intent reviewable. **(inferred)**

### 3.3 Truncation ethics and the plus-stat case

Correll, Bertini & Franconeri measured truncation and found the effect real, persistent, and not
cured by labeling; Pandey et al. quantified how far axis choice moves judgment. Neither concludes
"always start at zero." The reframing: **the y-range is itself a claim about which differences
matter.** **(documented)** Triton's live instance is the plus family, built to center on 100 —
`refresh_league_averages` excludes `_plus` metrics from `league_averages` for that reason.

| Y-range for a Stuff+/Cmd+ chart | Failure |
|---|---|
| `[0, …]` | Wastes ~95% of the range; a 12-point gap — large — reads flat |
| `[95, 105]` | Turns league-average noise into a mountain range |
| Autorange (**today**) | Varies per player; two charts are silently incomparable |
| `[100 ± k·σ]` + line at 100 | The claim is stated and constant across players |

Autorange is worst because it is invisible: nobody chose it, and it moves. Same for
`RollingAverages`, whose y-axis inherits `BASE_LAYOUT.yaxis` with no range — a starter in
92.5–94.2 mph gets 1.7 mph stretched over a 400px panel. Its smoothing window is also
`min(25, floor(n/4))` (`RollingAverages.tsx:10`), so **two players' velocity charts are drawn at
different smoothing levels and neither says so.** **(verified)**

## 4. Data-ink: Triton overshot the optimum

Tufte's data-ink ratio argues for erasing non-data ink; the tiles took it to the limit —
`showticklabels/showgrid/zeroline/showscale: false`, `margin:{t:5,r:5,b:5,l:5}` (`TileViz.tsx:151`).
Two costs: killing Plotly's colorbar forced a hand-built substitute (48×6px gradient, 8px labels,
`:152-157`) carrying less than what it replaced, and an axis-free chart cannot show a benchmark —
the thing that makes a scouting number mean anything. The rule is **erase non-data ink, not scale**:
gridlines are decoration; a tick label, a zero line and a benchmark rule are data. **(inferred)**
Calling "no axes" house style because dense dashboards look like that is **(cargo-cult)**.

## 5. Small multiples need a shared scale; the Reports grid has none

Tufte's small-multiple argument depends on panels being identical but for the data — same scale,
axes, encoding — so the eye can difference them. The Reports grid meets every condition but one.
Each `TileHeatmap` computes `zmin`/`zmax` from **its own** data unless a league baseline resolves
(`:140-147`), so two heatmaps side by side can paint identical color fields from different value
ranges, and the reader must compare two 8px labels to notice. The baseline path (`useLeagueBaseline`
→ mean ± 3σ) is the fix already in the file — it just isn't the default and skips `frequency`.
**(verified)**

`TileHeatmapOverlay` is worse: `normalize()` (`:630-636`) min-max scales each player's grid to [0,1]
**independently**, then multiplies element-wise. The rendered "Overlap: 0.83" is a product of two
separately rescaled fields — the two 1.0s mean different things, and the value is invariant to how
good either player is. **(inferred)** Sorting compounds it: `TileBar` sorts
categories alphabetically (`:202`) while `TileTable`'s arsenal mode sorts by descending count
(`:379-381`) — same data, two orders, one screen. **(verified)**

## 6. What Triton should do, in order

1. **Gate the metric heatmap on cell support** — a minimum observation count before `calcMetric`
   contributes, interpolating only into cells with ≥3 real neighbours (`TileViz.tsx:134-137`).
2. **Compute the legend from observed values** — snapshot `z` before interpolation (`:145-147`).
3. **Make the league baseline the default z-scale**, `frequency` included via a rate, so two tiles
   are comparable without reading their labels.
4. **Add `scaleanchor:'x'` + `scaleratio:1`** to `PitchMovement.tsx:26-27` and `TileScatter`'s
   movement mode (`:195`) — two lines, matching the three charts that already do it.
5. **Move `velo`/`spin` off bars** onto a dot plot; set `rangemode:'tozero'` on the rate bars left.
6. **Fix `RollingAverages`' window** to a constant 25 and pin the y-range to a stated band.
7. **Give `metricRegistry.ts` an `axis` hint** — `zeroBaseline`, `centeredOn`, `preferredMark` — so
   scale decisions become data like `FormatSpec` already is.

**Anti-recommendation: do not "fix" the heatmap by turning off `zsmooth` and interpolation.** Three
independent grounds. (a) *Statistical* — a raw 16×16 count grid on 400 pitches is mostly 0s and 1s;
the unsmoothed chart isn't more honest, only noisier in a way readers still pattern-match.
(b) *Product* — the smoothed zone map is the house signature and matches every surface analysts
compare against; removing it makes Triton look wrong rather than rigorous. (c) *Diagnostic* — it
treats a **support** problem as a **smoothing** problem, so the real defect (n=0 indistinguishable
from n=40) survives, now with worse output.

**Highest-leverage next action:** in `TileViz.tsx`, capture the pre-interpolation `z` grid and use it
for both the minimum-support gate and the color-bar endpoints — the smallest edit here, it removes
the two claims the chart cannot support, and it precedes everything in
`04-uncertainty-visualization.md`.

## Sources

1. Cleveland & McGill 1984 — [Graphical Perception](https://doi.org/10.1080/01621459.1984.10478080) — §1's channel ranking.
2. Heer & Bostock 2010 — [Crowdsourcing Graphical Perception](https://doi.org/10.1145/1753326.1753357) — replication, adds area/luminance.
3. Munzner — [Visualization Analysis and Design](https://www.cs.ubc.ca/~tmm/vadbook/) — effectiveness; §1's selection rule.
4. Wilke — [Proportional ink](https://clauswilke.com/dataviz/proportional-ink.html) — zero baselines on bars, §3.2.
5. Wilke — [Overlapping points](https://clauswilke.com/dataviz/overlapping-points.html) — scatter overplotting.
6. Correll et al. — [Truncating the Y-Axis](https://arxiv.org/abs/1907.02035) — truncation effects, §3.3.
7. Pandey et al. 2015 — [Deceptive Visualizations](https://doi.org/10.1145/2702123.2702608) — axis choice moves judgment.
8. Franconeri et al. 2021 — [Visual Data Communication](https://doi.org/10.1177/15291006211051956) — review behind §1.
9. [Semiology of Graphics](https://en.wikipedia.org/wiki/Semiology_of_Graphics) — Bertin's visual variables, §1.
10. [Data-ink ratio](https://en.wikipedia.org/wiki/Data-ink_ratio) — Tufte's rule, bounded in §4.
11. [Small multiple](https://en.wikipedia.org/wiki/Small_multiple) — shared-scale requirement, §5.
12. Plotly — [heatmap](https://plotly.com/javascript/reference/heatmap/) — `zsmooth`, `connectgaps`, `hoverongaps`, `zmin`/`zmax`.
13. Plotly — [layout.yaxis](https://plotly.com/javascript/reference/layout/yaxis/) — `rangemode`, `scaleanchor`, `scaleratio`.

**Triton-internal evidence (repo read 2026-08-13; no production query).**
`components/reports/TileViz.tsx` (807 lines): `TileHeatmap:100`, `TileScatter:165`, `TileBar:201`,
`TileStrikeZone:224`, `TileTable:369`, `TileHeatmapOverlay:531`, wrapped by `ReportTile.tsx:366-372`.
Plotly **3.4.0** / `react-plotly.js` **2.6.0** (`package.json:35,38`); **35** files import the Plot
wrapper, **15** in `components/charts/`. Grid `nb=16`, `xR=[-1.76,1.76]`, `yR=[0.24,4.06]` ft
(`:128`) → 3.52/16 = 0.220 ft = **2.64″** × 3.82/16 = 0.239 ft = **2.87″** cells. Interpolation
`:134-137`, two passes, threshold `neighbors.length >= 2`; chase% carve-out `:133`,`:136`;
`zsmooth:'best'`, `connectgaps:true`, `hoverongaps:false` `:138`. Legend from post-interpolation `z`
`:145-147`; gradient chip `w-12 h-1.5`, `text-[8px]` labels `:152-157`. Baseline
`zmin/zmax = value ± 3·stddev` `:140-143` via `useLeagueBaseline` (`:121`); `_plus` excluded from
`league_averages` per `scripts/create-league-averages.sql:12` and
`create-refresh-league-averages.sql:10`. Sample gates: `f.length<5` only at `:123`; `TileScatter:172`,
`TileBar:203`, `TileStrikeZone:227` gate on empty only. `velo`/`spin` bars `:200,209-210`; `.sort()`
`:202` vs usage-descending `:379-381`; overlay `normalize()` then element-wise multiply `:630-642`.
`scaleanchor` in **13** of 35 Plot files — present `charts/MovementProfile.tsx:98` and
`data/trackman/[sessionId]/SessionReview.tsx:185` (`scaleratio:1`), absent
`charts/PitchMovement.tsx:26-27` and `TileViz.tsx:195`. `grep -rn rangemode` over
`components/ lib/ app/` = **0**. Window `Math.min(25, Math.floor(f.length/4))`
`charts/RollingAverages.tsx:10`; y-axis inherits `BASE_LAYOUT.yaxis` (`components/chartConfig.ts`),
no `range`/`rangemode`. `lib/metricRegistry.ts` = **69** entries / 702 lines; `ColorSpec` `plus` band
`:14`,`:448`, resolver `:625-633`. Inches convention and `pitches` scale (~8,877,621 rows) from
`Cas/context/triton-context.md` and the 2026-08-12 packet.
