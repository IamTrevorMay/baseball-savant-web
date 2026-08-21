---
title: Rendering Large Datasets — When to Window, When to Paginate, When to Stop Rendering Rows
domain: frontend-data-scale
tags:
  - virtualization
  - windowing
  - dom-budget
  - pagination
  - incremental-rendering
  - plotly-scale
  - aggregation
  - payload-limits
sources_reviewed: 14
last_updated: 2026-08-21
---

# Rendering Large Datasets — When to Window, When to Paginate, When to Stop Rendering Rows

> Anchor doc for `frontend-data-scale/`. Grades: **(verified)** read at `file:line` or from the shared
> packet; **(documented)** vendor/spec docs; **(inferred)** mechanism; **(cargo-cult)** unsupported.
> No production query was run.

## TL;DR

- **Triton's tables are not the crisis; its charts are.** `LocationTab` gives Plotly one SVG marker per pitch from a 50,000-row array. (verified)
- **57 files render a `<tbody>` with no virtualization library installed — and that is mostly fine**: nearly all are bounded upstream by a `LIMIT`, a clamp or `.slice(0, 20)`, and `PitchLogTab` paginates at 50 while printing the full `data.length`. (verified)
- **The binding constraint is payload, not DOM.** `/api/player-data` ships up to 50,000 rows × ~71 columns before a node exists. (verified)
- **A window silently redefines a denominator.** `OverviewTab` totals the array it maps, and no `<tfoot>` exists in the repo — so windowing turns a season total into a viewport total, or drops it entirely. (verified)
- **Density is not the enemy of speed; row count is.** A 32-column, 50-row page is ~1,700 elements — past Lighthouse's 1,400-node error line, and instant. (verified)
- **Only 2 Plotly call sites use `scattergl`, both mobile.** The desktop dashboard — the surface holding 50,000 points — renders SVG. (verified)
- **Zero `loading.tsx` and zero `error.tsx` across 96 pages**: no route streams a shell while a list hydrates. (verified)
- **Below ~1,000 rows a virtualizer costs more than it returns**: measurement, scroll math and a broken `Ctrl-F` for nodes the browser was not straining on. (inferred)

---

## 1. The census: what Triton actually renders

Row counts, not file sizes, decide DOM cost: the packet's "largest table-rendering surfaces" lists the
largest *files*, a parse cost. `app/(research)/videos/page.tsx` is 67 KB of source, 200 rows.

| Surface | Rows reaching the `<tbody>` | Bound by |
|---|---|---|
| `components/dashboard/PitchLogTab.tsx:46` | 50 | client pagination, `perPage = 50` (`:29`) |
| `app/(research)/videos/page.tsx:1138` | ≤ 200 | `q.set('limit','200')` (`:312`); server clamp ≤ 1000 |
| `app/(research)/trends/page.tsx:584-637` | 20 per table | `.slice(0, 20)` after server aggregation (`:566-568`) |

`app/api/pitch-video/route.ts:328` is the clamp that matters —
`Math.min(Math.max(intParam('limit') || 50, 1), 1000)`: default, floor, ceiling. Its counter-example
is `app/api/player-data/route.ts:44`, `LIMIT 50000` with no clamp. **The finding is not "57
unvirtualized tables"**: row count is solved upstream almost everywhere, and where it is not the
excess is a 50,000-row payload and a 50,000-marker SVG chart, neither of which virtualization
touches. (verified)

---

## 2. The DOM budget, counted in nodes

Lighthouse warns above ~800 body nodes and errors above ~1,400 (Lighthouse 13 scores measured
style-recalc and layout cost over 40 ms instead). (documented) `PitchLogTab` renders 30 data columns
(`:6-13`) plus row-number and video cells: ~33 elements per row.

| Rows rendered | Elements | Verdict |
|---|---|---|
| 50 (today, `:29`) | ~1,650 | Past the 1,400 error line, imperceptible |
| 500 | ~16,500 | Noticeable sort/filter jank |
| 5,000 | ~165,000 | Layout thrash on every re-render |
| 50,000 (unpaginated) | ~1,650,000 | Tab hangs |

**The budget is spent on rows, not columns.** A 34-column advanced table
(`lib/metricRegistry.ts:571-581`) over 12 season rows is ~420 elements — TruMedia density is nearly
free, so thinning columns for speed trades the product for a metric that was never the problem.
(inferred) Density: `Cas/analytics-ux/07-dense-table-design.md`.

---

## 3. Four ways not to render 50,000 rows

| Technique | Nodes | Cost | Use when |
|---|---|---|---|
| **Bound at source** (`LIMIT`, clamp, top-N) | O(cap) | Rows below the cap vanish | Almost always; the repo default |
| **Pagination** | O(page) | No continuous scroll | Row-level logs read sequentially |
| **`content-visibility: auto`** | O(all) DOM, O(visible) layout | Scrollbar jump without `contain-intrinsic-size` | Bounded long list; `Ctrl-F` and export survive |
| **Virtualization** | O(visible + overscan) | Measurement, scroll math, a11y and find-in-page debt | Continuous scroll over thousands of unpageable rows |

`content-visibility: auto` is the underrated middle — one CSS line, no library, rows stay in the DOM;
TanStack Virtual is the right library *if the problem is real*. (documented)

---

## 4. What a window breaks — and the one Cas cares about

`components/dashboard/OverviewTab.tsx` shows the hazard exactly: the body maps `activeRows` (`:192`)
and the totals row calls `calcTotalsFromRegistry(activeRows, …)` (`:202`) on the same array (`:162`),
emitted *inside the same `<tbody>`* — there is no `<tfoot>` in the repo. Slice `activeRows` to
virtualize and the totals row sums the viewport, and is itself a windowed child that can scroll away.
`calcTotalsFromRegistry` (`lib/metricRegistry.ts:643-668`) attaches no `n`, so nothing downstream can
detect the swap. (verified)

> **Rule. The n and every total come from the full array, never the rendered one.**
> `PitchLogTab.tsx:69` already obeys it — `data.length`, not `pageData.length`, above a 50-row page.

Windowing also breaks find-in-page (unfixable — the rows are not in the DOM), print and select-all
export (needs a second render path), and screen-reader row counts: ARIA defines
`aria-rowcount`/`aria-rowindex` *because* windowing hides the real count, and indexing them to the
window announces "row 1 of 10,000" at every scroll position. (documented)

---

## 5. The chart is the real scale problem

Plotly's default `scatter` is SVG — one DOM node per marker. `scattergl` renders a whole trace to one
WebGL canvas; Plotly's comparison page demos 100k and 1M points with no SVG equal. (documented)

| Call site | Trace | Points it can receive |
|---|---|---|
| `MobilePlayerDashboard.tsx:573`, `MobileHitterDashboard.tsx:582` (both `components/mobile/`) | `scattergl` | filtered pitches |
| `components/dashboard/LocationTab.tsx:252` | `scatter` (SVG) | `data` — up to 50,000 (`app/(research)/player/[id]/page.tsx:134`) |
| `components/reports/TileViz.tsx:186, :231` | `scatter` (SVG) | the tile's pitch array |

The inversion is the finding: the weakest devices got the GPU path, the desktop analyst surface — the
only one that can hold 50,000 points — did not. But `scattergl` fixes speed, not **overplotting**: at
50,000 semi-transparent 3.5 px markers the ink saturates and the plot stops encoding density — a fast
lie instead of a slow one. Bin and render the aggregate, as `TileViz.tsx:126` does. (documented) Bin
soundness: `Li/statistical-inference/11-aggregation-bias-weighting.md`.

---

## 6. Incremental rendering: what Triton has and has not

| Mechanism | Status | Note |
|---|---|---|
| Route streaming (`loading.tsx`) | **0 / 96 pages** | No shell while data lands |
| Error boundaries (`error.tsx`) | **0 / 96 pages** | A throw on row 40,000 blanks the route |
| `useMemo` on the filter path | `lib/hooks/usePlayerData.ts:243,:256-259` | Filtering is already memoized; not the bug |
| Unmemoized full-array sort | `components/dashboard/PitchLogTab.tsx:37` | `[...data].sort(...)` copies and sorts up to 50,000 rows on **every** render to show 50 |

No Web Workers exist, so every filter and derived-field pass runs on the main thread, and the React
Compiler is disabled after state-reset bugs — not a free win. `PitchLogTab.tsx:37` is the table
layer's one genuine hazard and the canonical shape: **the expensive work is not painting 50 rows, it
is the O(n log n) pass over 50,000 that precedes them** — which a virtualizer would still
run. (verified) For work that must touch every row, `useDeferredValue` and `startTransition` mark the
update non-urgent so the keystroke paints first and a superseded render is abandoned;
`scheduler.yield()` does the same for imperative loops. (documented) Loading states:
`Cas/analytics-ux/08-loading-empty-error-states.md`.

---

## 7. When to stop rendering rows and start aggregating

Not a performance decision, but whether a reader can use a row.

| Rows returned | Right surface | Why |
|---|---|---|
| ≤ ~200 | render all | Under any node budget |
| ~200 – ~5,000 | paginate, or `content-visibility: auto` | A human still reads rows; keep `Ctrl-F` |
| ~5,000 – ~50,000 | aggregate, rows on drill-down | Nobody reads 5,000 rows; a top-N answers the real question |
| > ~50,000 | server-side aggregate only | Past the `/api/player-data` cap and any client's working set |

The bands are judgement calls, not measurements. (inferred) The rule under them is not: **once a
surface aggregates it owes an n and a coverage figure**, since an aggregate over a window the user
cannot see is the failure in `Cas/analytics-ux/01-honest-data-presentation.md` — a top-20 like
`trends/page.tsx:566-568` should say what it is the top 20 *of*. Rollups:
`Jo/postgres-performance/08-aggregation-materialization.md`; the 8 s cap:
`Jo/postgres-performance/03-timeouts-locks-concurrency.md`.

---

## 8. What Triton should do, in order

1. **Memoize the sort** at `components/dashboard/PitchLogTab.tsx:37` on `[data, sortCol, sortDir]` —
   ten minutes; drops a copy-and-sort of 50,000 rows from every unrelated re-render.
2. **Clamp `/api/player-data`.** Give `route.ts:44` the shape `app/api/pitch-video/route.ts:328` has —
   caller `limit`, default, ceiling — and return the applied cap, so the UI can say "showing 5,000 of
   12,431." Truncation that does not announce itself is a coverage lie.
3. **Switch the pitch-level SVG scatters to `scattergl`**: `LocationTab.tsx:252`, `TileViz.tsx:186`,
   `:231`. One word each; the largest visible win.
4. **Move every totals row into `<tfoot>`, computed from the unsliced array**, starting at
   `OverviewTab.tsx:202` — correctness today, precondition for ever windowing anything.
5. **Attach `n` to `calcTotalsFromRegistry`** (`lib/metricRegistry.ts:643`) so no total renders
   without its count.
6. **Add `loading.tsx` to the heaviest routes**: `app/(research)/player/[id]/`, `trends/`, `videos/`.
7. **Only then consider windowing**, for a table that passed steps 2 and 4 and still needs one
   continuous scroll over thousands of rows — try `content-visibility: auto` first.

**Anti-recommendation: do not add `react-window` (or any virtualizer) to the dense tables.** Three
independent grounds. *(a) The premise is false* — the tables are already bounded at 50, 200 and 20
rows (`PitchLogTab.tsx:46`, `videos/page.tsx:312`, `trends/page.tsx:566-568`), so virtualizing drops
nodes the browser never struggled with. *(b) It misses the actual cost* — the 50,000-row payload and
the unmemoized sort at `PitchLogTab.tsx:37`, both of which a virtualizer still pays in full. *(c) It
breaks the totals row on contact* — with no `<tfoot>` and `OverviewTab.tsx:202` totalling the mapped
array, the first virtualized table converts a season total into a viewport total: Triton's defining
failure mode, reintroduced by a fix for a problem it does not have.

**Highest-leverage next action:** clamp `app/api/player-data/route.ts:44` to a caller-supplied limit
and return the applied cap in the response body. It shrinks payload, parse, sort, filter and marker
count at once, and makes truncation something the surface can state instead of hide.

---

## Sources

1. TanStack Virtual — [Introduction](https://tanstack.com/virtual/latest/docs/introduction) — §3's headless virtualizer, the only shape that drives a real `<table>`.
2. TanStack Virtual — [Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer) — `overscan`/`measureElement`: §3's cost column.
3. bvaughn — [react-window](https://react-window.vercel.app/) — the library §8 rules out.
4. Chrome — [Excessive DOM size](https://developer.chrome.com/docs/lighthouse/performance/dom-size) — §2's ~800/~1,400 node thresholds.
5. web.dev — [DOM size and interactivity](https://web.dev/articles/dom-size-and-interactivity) — why §2's columns are cheap, rows are not.
6. MDN — [`content-visibility`](https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility) — §3's middle option; rows stay in the DOM.
7. web.dev — [content-visibility](https://web.dev/articles/content-visibility) — `contain-intrinsic-size`, §3's scrollbar caveat.
8. Plotly — [WebGL vs SVG](https://plotly.com/javascript/webgl-vs-svg/) — 100k/1M demos with no SVG counterpart; §5's basis.
9. Plotly — [`scattergl`](https://plotly.com/javascript/reference/scattergl/) — the trace §5 substitutes at three call sites.
10. Datashader — [Plotting Pitfalls](https://datashader.org/user_guide/Plotting_Pitfalls.html) — speed ≠ saturation (§5, §7).
11. React — [`useDeferredValue`](https://react.dev/reference/react/useDeferredValue) — §6's substitute for the disabled compiler.
12. Chrome — [`scheduler.yield()`](https://developer.chrome.com/blog/use-scheduler-yield) — §6's yielding, 50 ms long-task line.
13. Next.js — [`loading.js`](https://nextjs.org/docs/app/api-reference/file-conventions/loading) — absent from all 96 pages (§8 step 6).
14. W3C — [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/) — `aria-rowcount`/`aria-rowindex` for partially rendered grids (§4).

**Triton-internal evidence (repo read 2026-08-21 at commit `6555039`; no production query run).**
Packet counts: 96 `page.tsx`, 57 files with a `<tbody>`, **0** `loading.tsx`, **0** `error.tsx`, 121
`useMemo` / 358 `useCallback`, no `*.worker.ts`; `react-window|react-virtual|virtuoso|tanstack` in
`package.json` matches only `@tanstack/react-query` (`:24`). Unclamped payload
`app/api/player-data/route.ts:44` over 70-name `BASE_COLUMNS` (`:5`) plus deployed model columns
(`:8-16`) and a joined name column; correct clamp `app/api/pitch-video/route.ts:328`.
`components/dashboard/PitchLogTab.tsx`: `perPage = 50` `:29`, slice `:46`, 30-entry `BASE_COLS`
`:6-13` → 32 `<td>` per `<tr>` (`:96-124`), honest n `:69` (`data.length`), unmemoized
`[...data].sort(...)` `:37`. Totals: `components/dashboard/OverviewTab.tsx:162,:192,:202` all read
`activeRows` inside `<tbody>`; `grep -rn "<tfoot"` over `app/` and `components/` returns nothing;
`calcTotalsFromRegistry` `lib/metricRegistry.ts:643-668` filters `!isNaN` (`:654`), returns no count;
`GROUP_COLUMNS` `:564-590` = 25/34/19 columns. Memoized filtering `lib/hooks/usePlayerData.ts:243,:256-259`
over `applyFiltersToData` (`lib/filterEngineCore.ts:132`).
Server-bounded: `app/(research)/videos/page.tsx:312` (`:1138`),
`app/(compete)/compete/video/page.tsx:408` (`:1274`), `app/(research)/trends/page.tsx:566-568` →
`:584/:610/:637`, `app/(data)/data/console/page.tsx:50,:55`. `scattergl` only at
`components/mobile/MobilePlayerDashboard.tsx:573` and `MobileHitterDashboard.tsx:582`; SVG `scatter`
at `components/dashboard/LocationTab.tsx:252` (fed the unsliced `data` prop at
`app/(research)/player/[id]/page.tsx:134`) and `components/reports/TileViz.tsx:186,:231`; binned
`histogram2dcontour` `TileViz.tsx:126`. React Compiler disabled, and `pitches` ≈ 8.88M rows on stale
planner stats, are packet values (2026-08-12).
