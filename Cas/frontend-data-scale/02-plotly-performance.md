---
title: Plotly Performance — What It Costs to Draw 50,000 Pitches
domain: frontend-data-scale
tags:
  - plotly
  - render-cost
  - scattergl
  - bundle-size
  - memoization
  - webgl
  - downsampling
sources_reviewed: 13
last_updated: 2026-08-21
---

# Plotly Performance — What It Costs to Draw 50,000 Pitches

> Grades: **(verified)** read at `file:line` or measured on disk; **(documented)** vendor/research;
> **(inferred)** mechanism; **(cargo-cult)** unsupported. No production query run. Handoffs: *what* to
> draw → `Cas/analytics-ux/03-visualization-principles.md`; DOM rows → `01-rendering-large-datasets.md`;
> re-renders → `05-react-rendering-performance.md`; splitting → `07-bundle-size-code-splitting.md`.

## TL;DR

- **"Lazy-load Plotly" is done and is not the remaining win** — 5 of 6 importers use `dynamic(…, { ssr: false })`, but the deferred chunk is the whole 4,847,499-byte `plotly.min.js`. **(verified)**
- **Triton passes exactly 8 of Plotly's ~40 trace types**, so the shipped bundle is ~3.4× larger on disk than a cartesian build covering 7 of them. **(verified)**
- **`PlotWrapper` allocates a new `layout` and `config` every render**, defeating react-plotly.js's `===` guard and forcing a `Plotly.react` diff in all 29 importers. **(verified)**
- **13 of 15 files in `components/charts/` rebuild trace arrays inline with no `useMemo`**, so the inner arrays change identity too and Plotly re-reads every point. **(verified)**
- **`scattergl` appears twice in the repo, both on mobile**; every desktop chart that can receive 50,000 rows is SVG `scatter`. That is backwards. **(verified)**
- **`scattergl` is not a free upgrade** — browsers cap WebGL at 8–16 contexts per page (~4–8 figures), so a converted Reports grid blanks tiles past a user-set threshold. **(documented)**
- **The point cap Triton needs already exists, in the wrong directory** — `sampleData()` copy-pasted into four `visualize/templates` files; no analyst chart caps anything. **(verified)**
- **No broadcast overlay renders Plotly at all**, so the 1920×1080 OBS frame budget is a rule about what never to add. **(verified)**
- **Trace count and instance count are separate budgets and Triton sets neither** — one trace per pitch type, one DOM node per marker, one graph div per tile. **(inferred)**

---

## 1. Where the cost actually is

Plotly bills in **bytes**, **time** (`supplyDefaults` + diff + paint) and **nodes/contexts**. Triton
addressed the first, halfway.

### 1.1 The lazy chunk is the entire library

`react-plotly.js`'s default entry does `require('plotly.js/dist/plotly')` — every trace module, before
any Triton code runs. Published: full **4.6 MB min / 1.4 MB gz**; `cartesian` 1.4 MB / 464.8 kB;
`gl2d` 1.5 MB / 523.1 kB. **(documented)** On disk, `plotly.min.js` 4,847,499 B vs
`plotly-cartesian.min.js` 1,418,287 B. **(verified)**

Every `type:` Triton passes, across `components/ app/ lib/`: `scatter` 45, `heatmap` 4,
`histogram2dcontour` 3, `histogram` 3, `bar` 3, `histogram2d` 2, `scattergl` 2, `pie` 1. Seven of the
eight sit in `cartesian`; `scattergl` is `gl2d`-only. No 3-D, maps, finance or polar — yet `mapbox`,
`gl3d`, `geo-assets` and `d3-sankey` all ship. **(verified)**

`react-plotly.js/factory` exposes `createPlotlyComponent(Plotly)` so you can hand it a smaller object,
and plotly.js ships `npm run custom-bundle -- --traces …`. **(documented)** Neither string appears
here. **(verified)**

## 2. `Plotly.react` vs re-mount — Triton won this, then gave it back

`Plotly.react` "will update it far more efficiently than `Plotly.newPlot`, which would destroy and
recreate the plot." **(documented)** `react-plotly.js` calls it on every update and never `newPlot`
after mount, so nothing here pays remount cost. **(verified)** The saving is conditional on
identity: `factory.js:123-136` skips
the update only when `layout`, `data` and `config` are all `===` to the previous props and the
frame count is unchanged — no deep compare. The README adds a second gate: "Plotly.react itself only
refreshes plotted data if the identity of data arrays or `layout.datarevision` changes."
**(documented)** So reference stability is required twice over: the props, and the arrays inside each
trace. Triton breaks both, in the file every chart goes through:

| `PlotWrapper.tsx` | Effect |
|---|---|
| `:30` `const config = { ...props.config }` | new `config` ref |
| `:44` `config={{ responsive: true, …config }}` | second new `config` ref |
| `:45-48` `layout={{ ...props.layout, autosize: true }}` | new `layout` ref |
| no `React.memo` / `useMemo` | re-renders whenever its parent does |

`figureChanged` is therefore **always true**, for all 29 importers, forever. **(verified)**
`MobileChartWrapper.tsx:38-51` has the identical shape, and the leaves undo it again:
`PitchMovement.tsx:12-21` re-filters and re-maps per pitch type every render, and `TileScatter`
(`TileViz.tsx:165-190`) allocates a **two-element array per point** for `customdata`. `useMemo`
appears in 2 of 15 `components/charts/` files. **(verified)**

Not a Plotly bug — React reference discipline, buying a defaults-supply plus full-array diff on every
parent state change, which is how a filter-chip click becomes a long task. **(inferred)**
`grep -rn revision` returns **0**, so the `datarevision` hatch is unused too, and the React Compiler is
not an out — tried, disabled after state-reset bugs. **(verified)**

## 3. `scatter` vs `scattergl` at Triton's real point counts

`app/api/player-data/route.ts:44` ends `LIMIT 50000`, so one player view can hold 50,000 rows
client-side. A pitcher-season is ~2,500–3,000; multi-year approaches the cap. **(verified)**

| Points on one chart | SVG `scatter` | `scattergl` | Call |
|---|---|---|---|
| < 1,000 | fine, crisp, exportable | wasted context | **`scatter`** |
| 1,000–5,000 (season) | noticeable, survivable | faster, feature loss | `scatter` + memoize (§2) |
| 5,000–50,000 (multi-year) | thousands of DOM nodes | built for this | **`scattergl`** or downsample (§5) |
| > 50,000 | not viable | viable to ~1M | aggregate server-side |

Plotly Express switches to `scattergl` above **1,000 points** — the nearest vendor threshold.
**(documented)** The gl path is no drop-in: marker symbols differ, area fills and time-axis range
breaks are unsupported, and gl *lines* have measured slower than SVG. **(documented)** Triton's
scatters are markers-only, so the gap is narrow — but `scattergl` is absent from `cartesian`, so
choosing it forces §1.1 to a custom bundle. Today gl runs only on the two mobile EV/LA scatters, while
the desktop location scatter (`LocationTab.tsx:252`) is SVG and is fed the unsliced `data` prop from
`player/[id]/page.tsx:134` — up to 50,000 points. The weakest devices got the GPU path; the only
surface that can hold 50,000 points did not. **(verified)**

## 4. Trace count and instance count — the ceilings nobody set

| Limit | Mechanism | Where Triton meets it |
|---|---|---|
| Traces per chart | own defaults, legend entry, hit layer | `PitchMovement` = 1 per `pitch_name` (~5–9) |
| Markers per trace | SVG: one DOM node per point | unbounded; `LIMIT 50000` is the only cap |
| Plot instances per page | own div, resize listener, handlers | Reports grid, `effectiveTiles.map` × ≤4 cols |
| **WebGL contexts per page** | browser cap **8–16** → ~4–8 figures | would bite instantly if the grid went gl |

The last row turns a plausible optimization into an outage: exceeding the cap makes figures silently
fail to render. **(documented)** Tile count is user-set, so a blanket `scatter → scattergl` swap in
`TileViz.tsx` blanks tiles at a threshold chosen by the reader's layout — worse than a slow chart, and
a presentation failure Cas owns.

**Overlays:** grep for `PlotWrapper|react-plotly` under `app/overlay/`, `components/broadcast/`,
`components/producer/` returns **nothing** — broadcast output is hand-built DOM/SVG. **(verified)**
Keep it that way: a transparent 1920×1080 source composited live tolerates neither a 1.4 MB gz parse
nor a mid-show redraw storm. The one animated Plotly surface, `visualize/[template]/page.tsx`, renders
offline and does it right — `frame: { duration: …, redraw: false }`. **(verified)**

## 5. The point budget Triton already wrote, in the wrong directory

`lib/qualityPresets.ts` defines four tiers with an explicit `maxPitches`, "cap on how many pitch
trajectories to render per frame":

| Preset | draft | standard | high | ultra |
|---|---|---|---|---|
| `fps` | 15 | 30 | 30 | 60 |
| `maxPitches` | 50 | 200 | 500 | **2,000** |

Paired with a four-line stride sampler, `sampleData(arr, max)` keeping `arr[floor(i·len/max)]`,
**copy-pasted into four files** under `components/visualize/templates/`. **(verified)** So Triton
already decided 2,000 points is enough to render a pitcher, and enforces it where rendering goes
*offline to a file* — while the interactive charts, same data through the same 50,000-row pipe and
needing to survive a chip click, enforce nothing. Hoisting `sampleData` to `lib/` and calling it in
`PlotWrapper` bounds the worst case more cheaply than any library swap.

Cas's own caveat: **a downsampled scatter must say so.** Stride sampling is not outlier-preserving —
it can drop the 102 mph pitch — so the chart must state "showing 2,000 of 47,318," or it becomes the
manufactured-trend hazard in `Cas/context/triton-context.md` §1.

## 6. Alternatives, and the threshold that would justify one

| Option | Cost | Buys | Switch when |
|---|---|---|---|
| Custom Plotly bundle | 1 file + build step | ~3× smaller chunk, same API | **now** (§1.1) |
| `scattergl` selectively | per-chart flag | 10–100× points | one chart > 5k pts, ≤4 gl/page |
| `uPlot` (Canvas 2D) | rewrite per chart | ~50 kB, 166k pts in ~25 ms, no context cap | time-series only |
| Observable Plot / ECharts | full migration | smaller core | not justified |

`uPlot` is the honest comparison for `RollingAverages` and `VelocityDistribution` — but it is no
strike-zone heatmap library, and that output *is* the signature. **(inferred)**

## What Triton should do, in order

1. **Memoize in `PlotWrapper.tsx`** — `useMemo` the merged `layout`/`config`, wrap the export in
   `React.memo`. ~6 lines; fixes `figureChanged` for all 29 importers.
2. **Same edit in `MobileChartWrapper.tsx:38-51`**, where the device is slowest.
3. **`useMemo` the trace arrays** in the 13 `components/charts/` files lacking it, Movement tab first.
4. **Hoist `sampleData` to `lib/`** (delete the four copies); cap interactive scatters at 5,000 points
   with a visible "showing n of N" and a per-chart opt-out.
5. **Build a custom Plotly bundle** for the 8 trace types, via `react-plotly.js/factory` in
   `PlotWrapper`; verify with a bundle analyzer, absent from `next.config.ts`.
6. **Enable `scattergl` per chart, never globally** — desktop movement/location scatters above ~5,000
   points first, hard rule of ≤4 gl figures per page.

**Anti-recommendation: do not convert `TileViz.tsx` wholesale to `scattergl`.** Three independent
grounds. (a) *Hard ceiling* — tile count is user-set and browsers cap WebGL at 8–16 contexts (~4–8
figures); past that tiles render **blank**, trading a slow screen for a lying one. (b) *Wrong
bottleneck* — tile scatters are small; every tile redraws on every parent render because all three
prop identities change (§2). (c) *Bundle regression* — `scattergl` is `gl2d`-only, so committing to it
forecloses the cheap `cartesian` partial and drags `regl` back in.

**Highest-leverage next action:** memoize `layout` and `config` in `components/PlotWrapper.tsx` and
wrap it in `React.memo` — the smallest diff here, the only one that improves all 29 importing files at
once, and until `figureChanged` can be false every other optimization is measured against a chart that
redraws unconditionally.

## Sources

1. Plotly — [WebGL vs SVG](https://plotly.com/javascript/webgl-vs-svg/) — §4's 8–16-context ceiling and its silent non-render failure.
2. Plotly — [function reference](https://plotly.com/javascript/plotlyjs-function-reference/) — §2's `Plotly.react` vs `newPlot` semantics.
3. plotly.js — [dist/README.md](https://github.com/plotly/plotly.js/blob/master/dist/README.md) — §1.1's bundle sizes and trace lists.
4. plotly.js — [CUSTOM_BUNDLE.md](https://github.com/plotly/plotly.js/blob/master/CUSTOM_BUNDLE.md) — the `custom-bundle --traces` command, step 5.
5. [react-plotly.js README](https://github.com/plotly/react-plotly.js) — `factory`, `revision`, §2's data-array-identity rule.
6. Plotly — [scattergl reference](https://plotly.com/javascript/reference/scattergl/) — attributes sizing §3's gl feature gap.
7. Plotly — [performance guide](https://plotly.com/python/performance/) — §3's ">1,000 points → scattergl" default.
8. plotly.js — [issue #4401](https://github.com/plotly/plotly.js/issues/4401) — gl measured slower than SVG.
9. [uPlot](https://github.com/leeoniya/uPlot) — §6's ~50 kB / 166k-points-in-25 ms Canvas baseline.
10. [Observable Plot](https://observablehq.com/plot/) — §6's no-interaction-layer alternative.
11. Next.js — [Lazy loading](https://nextjs.org/docs/app/guides/lazy-loading) — what `dynamic(…, { ssr: false })` does not buy.
12. React — [`memo`](https://react.dev/reference/react/memo) — the reference-equality contract behind steps 1–3.
13. web.dev — [Optimize long tasks](https://web.dev/articles/optimize-long-tasks) — the 50 ms frame behind §2's long-task claim.

**Triton-internal evidence (repo read 2026-08-21 at commit `6555039`; no production query run).**
`plotly.js ^3.4.0` / `react-plotly.js ^2.6.0` (`package.json:35,38`). Six direct importers, five
already wrapped in `dynamic(() => import('react-plotly.js'), { ssr: false })`:
`app/(research)/umpire/[name]/page.tsx:9`, `matchups/page.tsx:10`, `abs/page.tsx:10`,
`components/PlotWrapper.tsx:5`, `compete/whoop/MetricTrend.tsx:5`, `mobile/MobileChartWrapper.tsx:6`.
`node_modules/react-plotly.js/react-plotly.js` requires `plotly.js/dist/plotly`; `factory.js:89` calls
`Plotly.react`, `:123-136` compares `layout`/`data`/`config` by `===` only. Wrapper defects
`PlotWrapper.tsx:30`, `:44`, `:45-48` (fresh objects each render), `:42` `useResizeHandler`, no
`memo`/`useMemo`; `MobileChartWrapper.tsx:38-51` same shape, its `:54-68` tap-to-load placeholder
worth copying. Traces rebuilt per render at
`charts/PitchMovement.tsx:12-21`, `charts/ExitVeloLaunchAngle.tsx:12-23`, `reports/TileViz.tsx:165-190`
(`customdata` `:177`); `useMemo` in **2 of 15** `components/charts/*.tsx`; SVG `LocationTab.tsx:252`
fed unsliced `data` from `player/[id]/page.tsx:134`. Zero hits over `components/ lib/ app/` for `revision`,
`react-plotly.js/factory`, `plotly.js-dist`, direct `Plotly.*` calls, or `React.memo` in the charts dir
or either wrapper. Trace census as in §1.1; gl at `mobile/MobilePlayerDashboard.tsx:573` and
`MobileHitterDashboard.tsx:582`; **46** `<Plot` sites in **35** files, **29** importing `PlotWrapper`.
Payload bound `app/api/player-data/route.ts:44` `LIMIT 50000`, memoized/debounced at
`lib/hooks/usePlayerData.ts:243-269`. `lib/qualityPresets.ts:22-58`; `sampleData` duplicated at
`visualize/templates/` `VelocityAnimation.tsx:18`, `ReleasePoint.tsx:34`, `ArsenalOverlay.tsx:51`,
`PitchCharacteristics.tsx:69`; `redraw: false` at `VelocityAnimation.tsx:135,202,214`. Zero Plotly
under `app/overlay/`, `components/broadcast/`, `components/producer/`; Reports grid
`app/(research)/reports/page.tsx:900-903`. No bundle analyzer in `next.config.ts`; React Compiler
disabled after state-reset bugs (packet, 2026-08-21).
