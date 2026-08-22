---
title: Frontend at Data Scale on Triton — Applied Playbook
domain: applied
tags: [frontend-performance, plotly, bundle-size, virtualization, inp, profiling, mobile, triton-platform]
last_updated: 2026-08-22
---

# Frontend at Data Scale on Triton — Applied Playbook

> Sequences `Cas/frontend-data-scale/01..11` into work, **ordered by leverage per hour rather than
> by architectural interest.** The first five items are deletions and two-line edits; the
> architecture waits until something measures it. No claim here was taken with a profiler
> attached, so every assertion about time is graded `(inferred)` and names the instrument that would
> settle it: a hypothesis with an address, not a result.

## TL;DR

- **The cheapest available win is a delete.** `lib/leagueStats.ts:1257-1262` — six exports, zero references repo-wide, self-documented "used nowhere now but kept for safety during migration", each a module-scope `_buildPooled(...)` call pinning a 93,617 B module. (verified)
- **The 300 ms debounce debounces the wrong thing, in four places.** `lib/hooks/usePlayerData.ts:256-259` runs the filter synchronously in a `useMemo`; `:263-269` delays only the commit. It removes no work from the INP window and adds 300 ms to the most-used interaction on the platform. The correct value it hides, `filteredData`, is exported by both hooks and read by nothing — the fix is pure subtraction. (verified)
- **One file fixes 29.** `components/PlotWrapper.tsx:30` allocates a fresh `config` and `:44-48` passes inline literals into a library that gates redraws on strict `===`. `memo(` appears **0** times repo-wide, against 121 `useMemo` and 358 `useCallback`. (verified)
- **The GPU renderer is on backwards, and the point cap is in the wrong directory.** `scattergl` exists at two call sites, both mobile, while `components/dashboard/LocationTab.tsx:251` renders SVG `scatter` over the unsliced 50,000-row prop; `lib/qualityPresets.ts:22-58` caps points only for offline file rendering. (verified)
- **Filtering is the cheap half; the one-time passes and the transfer are not.** At 50,000 rows: filtering with 5 predicates 7–12 ms, `enrichDerivedFields` 93 ms, `buildOptionsCache` 47 ms. That inverts the intuitive fix — the boundary should stay, and the payload should shrink. (inferred)
- **Virtualization is not the obvious win and is unsafe today.** Most `<tbody>` surfaces are bounded upstream (`components/dashboard/PitchLogTab.tsx:29` paginates at 50), and **no `<tfoot>` exists repo-wide** — totals sit inside `<tbody>`, so naive windowing turns a season total into a viewport total. (verified)
- **Mobile branches after the work, and the surface that needs it most has none.** `app/(research)/player/[id]/page.tsx:29` fetches and enriches before `:42` picks a component; Compete has 0 `useDevice` and 0 `components/mobile` imports, for users who are athletes on phones. (verified)
- **Nothing is measured, INP is the metric a load audit cannot contain, and the machine that ships a regression is least likely to see it.** `app/layout.tsx:60` mounts Web Analytics, not Speed Insights, and `public/sw.js:29-42` serves `/_next/static/` cache-first. (documented)

---

## NOW (0–6 weeks)

Items 1–5 are behaviour-neutral or close to it and need no number to justify themselves. Item 6 is
the boundary decision; item 7 is the instrument, last on purpose, because profiling to decide
whether to delete code that provably does nothing is ceremony.

### 1. Delete the six dead exports in `lib/leagueStats.ts`

`lib/leagueStats.ts:1257-1262` exports `BRINK_LEAGUE`, `CLUSTER_LEAGUE`, `HDEV_LEAGUE`,
`VDEV_LEAGUE`, `MISSFIRE_LEAGUE`, `CLOSE_PCT_LEAGUE`. A `grep` over `app/ components/ lib/` finds no
reference outside their own declaration; the comment above them cites a migration with no end date
and no remaining caller. **(verified)** Each is *executed* at module scope rather than merely
declared, which is what defeats tree-shaking on a module the player dashboard and the Reports
Builder both import. Whether the delete unpins 93,617 B from those bundles is **(inferred)** —
`npx next experimental-analyze --output` before and after is the proof.

**Stop condition:** the build succeeds, `npm test` matches baseline, and the treemap shows
`leagueStats` gone from those two bundles.

### 2. Put the debounce in front of the work, or delete it

```ts
// lib/hooks/usePlayerData.ts:256-269 — the shape, verbatim in four places
const filteredData = useMemo(() => applyFiltersToData(seasonFilteredData, activeFilters), [...])
useEffect(() => { const t = setTimeout(() => setData(filteredData), 300); ... }, [filteredData])
```

The `useMemo` recomputes during the render the click triggers, so the scan has finished before the
timer starts; the 300 ms delays only publication. A debounce earns its latency by *preventing* work.
This one prevents none and pushes a completed local operation past INP's 200 ms threshold by
construction. **(verified)** Four copies, not two: `lib/hooks/usePlayerData.ts:263-269`,
`lib/hooks/useHitterData.ts:265-271`, `app/(milb)/milb/player/[id]/page.tsx:98-105`,
`app/(milb)/milb/hitter/[id]/page.tsx:73-79`. Fix all four in one commit or the next author copies
the third. The edit is to delete the state and the effect and return the memo. If the scan later proves slow enough to
hurt typing, the right tool is `useDeferredValue(activeFilters)` — **zero call sites** on React
19.2.3 — which defers rendering without delaying the value. **(documented)**

**Stop condition:** no filter-commit timers remain, and a trace of one chip toggle shows the table
repainting in the same task. Removing 300 ms of self-imposed delay is arithmetic; whether the
interaction then lands under 200 ms is **(inferred)** until traced.

### 3. Delete the orphans

Three unrelated deletions, one commit, all pure subtraction. **(verified)**

| Orphan | Where | Evidence |
|---|---|---|
| `filteredData` on the hook's public type | `lib/hooks/usePlayerData.ts:54,284`; `lib/hooks/useHitterData.ts:50,286` | No consumer destructures it; item 2's edit makes `data` *be* it |
| `recharts`, 8.5 MB installed | `components/design/ExploreCharts.tsx` | Sole importer — and nothing imports the importer |
| `MobileDataTable.tsx` | `components/mobile/MobileDataTable.tsx:18` | Zero call sites; its sticky-column pattern is the one not to copy |

Do item 2 first or the edits collide. **Stop condition:** `recharts` is gone from `package.json` and
no `grep` finds the other two names.

### 4. Memoize `PlotWrapper`, once, for 29 files

`components/PlotWrapper.tsx:30` builds `const config = { ...props.config }` every render, and
`:44-48` passes `config={{…}}` and `layout={{…}}` as fresh inline literals. `react-plotly.js`
compares `data`, `layout` and `config` by strict `===` to decide whether to call `Plotly.react`, so
all three identities change unconditionally and the diff runs on every parent render — for all 29
importers. No `React.memo` exists in the file, or anywhere.
`components/mobile/MobileChartWrapper.tsx:38-51` has the identical defect on the slower device.
**(verified)** The edit is `useMemo` on the merged `layout` and `config` plus `React.memo` on the
default export: about six lines per file, no API change. It caps redraw cost rather than eliminating
it — 13 files under `components/charts/` still build trace arrays inline and need their own
`useMemo`, Movement tab first. **(verified)** The same file is where the bundle win lands later:
`react-plotly.js` requires `plotly.js/dist/plotly`, **4,847,499 B** of prebuilt UMD opaque to every
tree-shaker, where `plotly-cartesian` is **1,418,287 B** and covers 7 of the 8 trace types Triton
passes. Lazy-loading is already done, so the deferred chunk is simply the whole thing; the
`react-plotly.js/factory` swap belongs here once item 5 has decided whether `scattergl` must be
registered. **(verified)**

**Stop condition:** the Profiler shows the Plot component absent from the commit when an unrelated
sibling state changes. That this saves wall-clock time is **(inferred)** until that profile exists.

### 5. Memoize the sort, and turn the GPU renderer around

`components/dashboard/PitchLogTab.tsx:37` runs `[...data].sort(...)` — a full copy and comparison
sort of up to 50,000 rows — on every render, to display `perPage = 50` rows (`:29`), unmemoized.
Wrap it in `useMemo` keyed on `[data, sortCol, sortDir]`. **(verified)**

`components/dashboard/LocationTab.tsx:251` sets `type: 'scatter'` — SVG, one DOM node per marker —
on traces built from the unsliced `data` prop handed in at
`app/(research)/player/[id]/page.tsx:134` — the one interactive surface able to hold 50,000 points
and the one *not* using WebGL, while `scattergl` sits at exactly two call sites, both mobile
(`components/mobile/MobilePlayerDashboard.tsx:573`, `components/mobile/MobileHitterDashboard.tsx:582`).
**(verified)** Reverse it in two halves. First, hoist the stride sampler and `maxPitches` out of
`lib/qualityPresets.ts:22-58` into a shared `lib/` helper — copy-pasted across four
`components/visualize/templates/` files and enforced only where rendering goes offline to a file —
and cap interactive scatters at ~5,000 points **with a visible "showing 5,000 of 41,207"**, because a
silent sample is a coverage lie. Second, switch `LocationTab` to `scattergl` above that cap, per
chart, never globally: browsers cap WebGL at 8–16 contexts per page, so a wholesale Reports-grid
conversion renders blank tiles past a user-set tile count — a slow screen traded for a lying one.
**(documented)**

**Stop condition:** a trace of the Viz tab on a full-career pitcher shows no task over 50 ms, and the
chart states its own sample size. **(inferred)** until traced.

### 6. Where the client-filter boundary belongs: keep it, shrink what crosses it

The measurement points the opposite way from the intuition. Repo functions transcribed and run over
50,000 synthetic rows under Node 22 — shape trustworthy, absolute values not: **(inferred)**

| Work | Runs | 50,000 rows |
|---|---|---|
| `applyFiltersToData`, 5 predicates | every filter change | **7–12 ms** |
| `enrichDerivedFields` | once per fetch | **93 ms** |
| `buildOptionsCache`, 11 traversals (`lib/hooks/usePlayerData.ts:85-87`) | once per fetch | **47 ms** |

Filtering is ~5% of the 200 ms INP budget. **The expensive things are the one-time passes and the
payload, neither of which moves if you push filtering to the server.** Do not move the boundary.
Three grounds: 11 of the 59 `FILTER_CATALOG` entries have no column in `pitches` — VAA, HAA,
`pfx_x_in`, `brink`, `cluster`, `hdev`, `vdev` are produced in the browser at
`lib/enrichDerivedFields.ts:10-63`, and they are what an analyst reaches for first; the
server-aggregate path discards its own denominator by construction while the client path states `n`
for free; and the database is the scarce resource here, not the browser — roughly 20 concurrent
readers took the instance down for an hour. **(verified)**

What should change is the size of what crosses. `app/api/player-data/route.ts:44` ends
`ORDER BY p.game_date DESC LIMIT 50000` — a bare truncation, no cursor — over 70 columns plus a
joined name, on `run_query_long` (120 s), not the 8 s path. Its own comment at `:31` documents a
`year` parameter that cuts rows "50K → ~5K", and `lib/hooks/usePlayerData.ts:123` initializes
`selectedYear` to `null`, so **the default page load is the maximum payload.** Default it to
`info.latest_season`, which the hook already fetches: roughly a 10× byte reduction for one line. Then
cut the per-row cost that remains: `lib/filterEngineCore.ts:141-147` runs `f.values.map(Number)`
*inside* the row loop, allocating a fresh array per row where three would do, and
`lib/enrichDerivedFields.ts:10-25` does six `toFixed(1)` number→string→number trips per row that
belong in `lib/metricRegistry.ts` at render time. **(verified)**

Same commit, make the truncation speak. The route returns `{ rows, count: validated.length }` at
`:54`, so a truncated career reports `count: 50000` — a ceiling that reads as a count — while
`player_summary.total_pitches` sits in memory unread and
`app/(research)/player/[id]/page.tsx:125` renders the bare number. Add `truncated: rows.length >= LIMIT`
and render "50,000 of 61,204, most recent first". **Do not raise `LIMIT 50000` instead** — it changes
which queries truncate, never whether the screen can tell. **(cargo-cult)**

**Stop condition:** first paint issues a year-scoped request, and a fixture at exactly `LIMIT` rows
makes the UI say so — proved to fail against today's code first
(`Cas/testing-data-systems/09-numeric-regression-detection.md`).

### 7. Stand up the measurement, in this order

| Gap | Evidence | Fix |
|---|---|---|
| Wrong RUM product | `app/layout.tsx:60` mounts `<Analytics />` — visitors, not Web Vitals | Add `useReportWebVitals` POSTing `{name, value, rating, pathname}`; ~20 lines |
| No bundle baseline | No analyzer in `next.config.ts` | `npx next experimental-analyze --output`, commit the treemap |
| The local machine lies | `public/sw.js:29-42` serves `/_next/static/` cache-first | Measure loads in a fresh incognito profile, always |

**INP is the metric** — good ≤ 200 ms, poor > 500 ms, at p75. The defining interaction is a chip
toggle re-filtering rows already in memory: post-load, main-thread, entirely outside what a
Lighthouse load audit contains. Lighthouse is blind twice over, since the analyst surfaces need a
session and a player id, so an unauthenticated crawl profiles a login screen and calls it healthy.
**(documented)** Two preconditions: `@next/bundle-analyzer` is the wrong tool on Next 16.1, where
`next experimental-analyze` is Turbopack-native and already shipped; and the five red tests in
`__tests__/lib/queryCache.test.ts` must be fixed before any gate attaches to the suite
(`Cas/testing-data-systems/`), or it is ignored by day two.

**Stop condition:** p75 INP by pathname exists for `(research)/player/[id]`, and a `vitest bench`
over `enrichDerivedFields` and `applyFiltersToData` has been **proved to trip** against a
deliberately slowed variant. `vitest.config.ts:11` sets `environment: 'node'`, so those two benches
run in the existing runner today; a component-render benchmark needs jsdom first. **(verified)**

---

## NEXT (6 weeks – 6 months)

### 8. Make windowing safe before windowing anything

Virtualization is the reflex answer to "50,000 rows" and close to the wrong one here. Most `<tbody>`
surfaces are already bounded upstream by a `LIMIT`, a clamp or a `.slice(0, 20)`, and the pitch log
paginates at 50 (`components/dashboard/PitchLogTab.tsx:29`). Below ~1,000 rendered rows a virtualizer
costs scroll math and a broken `Ctrl-F` for nodes the browser was not straining on. **(inferred)**

The blocking hazard is structural: **`<tfoot>` appears zero times in the repo.** Totals are emitted
as a final `<tr>` inside `<tbody>`, computed from the same array being mapped —
`components/dashboard/OverviewTab.tsx:192,202`. A window over that `<tbody>` silently converts a
season total into a viewport total, or drops it, and the number keeps rendering with full authority.
**(verified)** So: move every totals row into a `<tfoot>` computed from the *full* array, then
measure which tables are genuinely unbounded, then virtualize only those.

**Stop condition:** a test asserts a totals row equals the full-array aggregate while only a window
of rows renders. It must fail against today's markup first.

### 9. Move the mobile split upstream of the work, and give Compete one

`app/(research)/player/[id]/page.tsx:29` calls `usePlayerData` unconditionally; the `isMobile` branch
is at `:42`. The fork therefore happens *after* the fetch, the enrich and the options build, so it
saves pixels and not one millisecond of CPU — mobile caps rendered rows at `.slice(0, 10)` and
`.slice(0, 30)`, and row count was never the mobile problem. **(verified)** Thread `isMobile` into
the hook and default mobile to the current season via the `year` parameter item 6 wires up: the only
change on this surface that reduces *memory* rather than rescheduling CPU, and memory is the mobile
failure mode — a phone handed 50,000 rows × 71 fields risks tab termination, not slowness.
**(documented)**

Compete is the larger gap: 0 `useDevice`, 0 `components/mobile` imports, on the surface whose users
are athletes on phones. **Do not fix it by forking `MobileCompete`** — the fork model has an
18-of-96-page adoption rate here, inherits the payload anyway, and doubles the honesty surface, since
null and coverage rules already diverge between the two existing trees (`Cas/analytics-ux/`). Fix it
responsively. **(inferred)** Nothing in the repo reads any device signal — no
`navigator.deviceMemory`, `connection.effectiveType` or `saveData`. **(verified)**

### 10. Fix the two React-level defects that are correctness, not performance

`components/visualize/template-builder/InputSectionsPanel.tsx` declares six components inside its own
body and renders them as JSX: `:166`, `:185`, `:237`, `:261`, `:277`, `:372`. Every parent render
creates new component types, so React unmounts and remounts the subtree — inputs lose focus, local
state resets. That is a **plain-React** cause of exactly the symptom that got React Compiler
disabled, and worth fixing on its own terms either way. **(verified)**

`components/broadcast/BroadcastContext.tsx:1420` passes an inline object literal — ~79 fields, 59
`useCallback`s, no `useMemo` — as the context value to 21 consumers, voiding all of them every
render, while a countdown writes at 1 Hz and a video at 4–66 Hz on the live broadcast surface.
**(verified) Do not answer that with `React.memo`** — it compares props, and a context update
re-renders regardless of props. Split the high-frequency fields into their own provider first.
**(cargo-cult)**

---

## LATER (6+ months)

### 11. Keyset paging and columnar transport, in that order

`app/api/player-data/route.ts:44` truncates rather than pages, and column *names* cost ~1,009 B per
row — roughly 48 MiB of repeated JSON keys in a full payload before a single value. Keyset paging on
`(game_date, game_pk, at_bat_number, pitch_number)` with an opaque cursor and an explicit
`complete: boolean` fixes the truncation and the serialization ceiling together; a columnar encoding
pays each key name once. Both are real. Neither is worth starting before item 7 can show what item
6's year default already recovered. **(inferred)**

It is also the precondition for the only Web Worker topology worth building — zero exist today, and
that is right, because cloning an array-of-objects payload costs two clones per interaction to
offload a 7–12 ms filter and destroys the object identity `app/(research)/reports/page.tsx:322-330`
relies on to count distinct pitches. **(verified)**

---

## Standing Rules

1. **Never present an inferred win as a measured one.** Byte counts and call-site counts are
   `(verified)`; everything about time is `(inferred)` until a trace, a bench or a p75 field number
   exists, and the claim must name which. This rule outranks every item above.
2. **A silent cap is a coverage lie.** Any sampling, truncation or `LIMIT` reaching a screen must be
   stated on that screen — "showing 5,000 of 41,207", never a bare number.
   `app/api/player-data/route.ts:54` is the standing counterexample.
3. **Never window a `<tbody>` that contains its own totals row.** Totals move to `<tfoot>` and are
   computed from the full array first (`components/dashboard/OverviewTab.tsx:192,202`).
4. **Delete before you optimize, and fix every copy in the same commit.** A dead export cannot
   regress. The misplaced debounce exists four times and the Plotly identity defect twice; a fix
   applied to one copy trains the next author to copy the broken one.
5. **Measure on a production build, in a fresh incognito profile, five runs, keep the median, record
   the SHA and the device.** `public/sw.js:29-42` serves static assets cache-first, so a regression
   is least visible to whoever shipped it, and `next dev` is not a number.
6. **Correctness rejections are not reopened by performance evidence.** React Compiler stays off
   until the state-reset class of item 10 is closed on its own terms; a perf protocol that can
   override a correctness regression is a rationalization.
7. **Not doing:** moving analyst filtering to the server (item 6), raising `LIMIT 50000`,
   virtualizing before item 8, forking `MobileCompete`, `React.memo` on the broadcast consumers, and
   Lighthouse CI as the performance gate. Each is killed above on independent grounds; reopening one
   needs new evidence, not a new preference.

Handoffs: row presence and freshness is `Jo/data-reliability/`, query latency
`Jo/postgres-performance/`, metric meaning `Li/metric-governance/`. What a screen says while it
waits, truncates or samples is Cas's.

**Triton-internal evidence.** Every `file:line` above was re-read against the working tree on
2026-08-22, branch `docs/cas-frontend-data-scale`, including `lib/leagueStats.ts:1255-1262`,
`lib/hooks/usePlayerData.ts:54,85-87,123,256-269,284` with its verbatim twin
`lib/hooks/useHitterData.ts:50,258-271,286` and the inline copies at
`app/(milb)/milb/player/[id]/page.tsx:93-105` and `app/(milb)/milb/hitter/[id]/page.tsx:67-79`,
`components/PlotWrapper.tsx:30,44-48`, `components/dashboard/PitchLogTab.tsx:29,37`,
`components/dashboard/LocationTab.tsx:247-256`, `components/dashboard/OverviewTab.tsx:191-206`,
`app/api/player-data/route.ts:29-56`, `public/sw.js:29-49` and
`components/broadcast/BroadcastContext.tsx:1419-1425`. Counts run this session over
`app/ components/ lib/`: `scattergl` = 2, both under `components/mobile/`; `<tfoot` = 0; `memo(`
excluding `useMemo` = 0; `recharts` importers = 1, importers of that file = 0; `MobileDataTable` call
sites = 0. Bundle sizes, the 1,009 B/row key cost and the 93 / 47 / 7–12 ms timings carry over
unchanged from `Cas/frontend-data-scale/02`, `03` and `07`; those timings came from repo functions
transcribed and run on synthetic rows under Node 22, **not from a browser profile**, which is why
every latency claim here is graded `(inferred)`. The 5 failing tests in
`__tests__/lib/queryCache.test.ts` were confirmed red on 2026-08-22. The database was not queried at
any point in this build.
