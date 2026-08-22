---
title: Analytics UX on Triton — Applied Playbook
domain: applied
tags: [analytics-ux, coverage, null-vs-zero, uncertainty, cross-level, overlays, metric-registry, honest-states]
last_updated: 2026-08-22
---

# Analytics UX on Triton — Applied Playbook

> Turns `Cas/analytics-ux/01..11` into sequenced work. **The organizing idea is that a screen cannot
> tell the truth about a number it cannot describe**, so the registry descriptor comes before every
> affordance that consumes it. Li fixes the thresholds and definitions
> (`Li/applied/statistical-inference-applied.md`, `Li/applied/metric-governance-applied.md`); Jo fixes
> the pipeline (`Jo/applied/`). This file owns the pixels. No database was queried.
>
> Grades: **(verified)** read at the cited line or run in this repo · **(documented)** established
> elsewhere and cited by filename · **(inferred)** reasoned from verified facts · **(cargo-cult)** a
> plausible move with no mechanism behind it.

## TL;DR

- **The defining hazard is not a wrong number, it is a smooth line over an evaporating denominator** — `stuff_plus` coverage went 99.5% → 0% between April and August 2026 and no surface changed by one pixel. (verified)
- **`lib/metricRegistry.ts:17-27` is the whole fix and the whole blocker**: `MetricDef` has eight fields, seven presentation, none about trust, so no tile *can* state its `n` without per-call-site work. (verified)
- **`lib/pitcherStats.ts:292` swaps `stuff_rv` in for `stuff_plus` under the label "Stuff+" below 50% coverage, evaluated against the *filtered* array** — narrowing a date range can change which metric the header names. Li rules on the substitution; Cas rules that the label moves with the quantity. (verified)
- **`getCellColor` paints NULL as below-average** — `Number(null) === 0` clears the `isNaN` guard at `lib/metricRegistry.ts:626-627`, so an em dash renders in `text-orange-400`. Null-vs-zero fails in the most-used code path on the platform. (verified)
- **`components/reports/TileViz.tsx:134-137` invents empty heatmap bins from ≥2 neighbours over two passes, then hovers them to three decimals** — fabricated data at invented precision, with `f.length<5` at `:123` the only gate. (verified)
- **`app/(research)/player/[id]/page.tsx:103` hands `allData` to `GenerateReportDropdown`**, so dashboard-generated reports silently ignore the season selector and every filter, while three disagreeing counts render above them. A correctness bug; it ships first. (verified)
- **Zero `loading.tsx` and zero `error.tsx` across 96 `page.tsx` files**, so every honest-state affordance must be built inside components, while 291 em dashes carry four different meanings. (verified)
- **"Grey out below n = 100" and "add a data-quality banner" are the two cargo-cult fixes to refuse** — one encodes a threshold nobody derived, the other trains the blindness it exists to prevent. (cargo-cult)

---

## NOW (0–6 weeks)

### 1. The report payload bug, and one denominator per screen

`app/(research)/player/[id]/page.tsx:103` renders
`<GenerateReportDropdown … playerData={allData} …>`. `allData` is the raw fetch, upstream of the
season selector at `:90-94` and every chip in `components/FilterEngine.tsx`, so a user reading
"1,204 pitches" generates a report over ~40,000 and nothing on it names the population. **(verified)**
Pass what the tabs render (`data`) — better, the synchronous `filteredData` memo
`lib/hooks/usePlayerData.ts` already computes and no component consumes
(`Cas/frontend-data-scale/`). This is the only item in this file that produces a *wrong artifact*
rather than an under-described one. **(inferred)**

Three counts render above it and none agree under an active filter: `:95-96` from
`seasonFilteredData` (season selector only, **not** chips, and it rebuilds a `Set` every render),
`:125` from `resultCount` (chips, 300 ms behind), the tabs from `data`. **(verified)** Reconcile to a
single `{ n, denom, asOf }` rendered once and delete the other two — the fix is subtraction.

**Stop condition:** a test that sets a season plus two chips, invokes report generation, and asserts
the row count handed down equals the on-screen count. It must fail against `main` first.

---

### 2. The keystone — a coverage descriptor in `lib/metricRegistry.ts`

Every remaining item consumes this. `MetricDef` at `:17-27` is `key`, `label`, `unit`, `format`,
`color`, `totals`, `higherBetter?`, `tip?`. `FormatSpec` (`:6-10`) knows the decimals, `ColorSpec`
(`:12-15`) teal vs orange, `TotalsStrategy` (`:4`) sum vs avg. **Nothing knows whether the number is
meaningful, what a null means, or how many rows produced it.** **(verified)**

Add two optional fields and one return type — optional means no migration and no edit to the other 60+
entries on day one:

```ts
type NullMeaning = 'zero' | 'not_measured' | 'not_applicable' | 'not_yet_covered'

interface CoverageSpec {           // MetricDef gains `coverage?: CoverageSpec`
  sourceColumn: string             // nullable column the aggregate consumes, e.g. 'stuff_plus'
  nullMeans: NullMeaning           // per-metric, not per-call-site
  minN?: number                    // Li supplies it; absent = no gate, never a default
  crossLevelComparable?: boolean   // false => refuse a shared axis across levels (item 9)
}

interface MetricValue {            // what every helper returns instead of a bare number
  value: number | null
  n: number; denom: number         // contributed / should have, same filtered window
  state: 'ok' | 'partial' | 'insufficient' | NullMeaning
  provenance?: string              // e.g. 'stuff_rv-fallback' (item 4)
}
```

Then three helper changes, all inside this one file:

| Helper | Line | Change |
|---|---|---|
| `formatMetric` | `:608-616` | Collapsing `null`, `''` and `'—'` into one output is the bug. Take `MetricValue`, return the glyph the `state` implies. |
| `getCellColor` | `:618-640` | `if (value == null) return 'text-zinc-600'` **before** the `switch`, ahead of any coercion. Fixes `plus` and `inverted_value` at once. |
| `calcTotalsFromRegistry` | `:643-690` | Already computes `vals.length` at `:657` and discards it. Attach `totals.__meta[key] = { n: vals.length, denom: rows.length }`. |

The totals change is safe: the function has **exactly one call site**,
`components/dashboard/OverviewTab.tsx:202`. The larger surprise is that the registry has **two
importers repo-wide** — `OverviewTab.tsx:9` and `lib/glossary.ts`. It is the designated chokepoint and
it reaches one table, which is why item 12 exists. **(verified)**

**Stop condition:** `describe('stuffPlus', rows)` over a 20%-non-null fixture returns
`{ n: 20, denom: 100, state: 'partial' }` and that fixture renders a coverage chip in `OverviewTab` —
both failing against `main` first.

---

### 3. Null is not zero — the one-line guard, then the glyph contract

`components/dashboard/OverviewTab.tsx:195-196` passes one raw value to both helpers. The text layer
knows it is missing and prints `—`; the colour layer coerces `Number(null) → 0`, `0 < 100`, and
returns `text-orange-400` — **a dash in the colour reserved for well-below-average**.
`inverted_value` at `:634-637` fails identically: `n < 0` and `n > 0` are both false, so unknown lands
in `badClass`. **(verified)** Ship item 2's guard immediately; it does not wait for the descriptor.

Then adopt the two-glyph contract from `Cas/analytics-ux/02-null-zero-unknown-ui.md` §5 — `—` = *we
should know and don't*, `·` = *there is nothing to know* — with the state in a `title`, because an
empty `<td>` announces as nothing to a screen reader. **(documented)** The null regions this serves
are permanent and legitimate, not defects: deception is 2017+, MiLB is 2023+, `stuff_plus` is NULL wherever `release_speed` is, IR/IRS is NULL
≤1970. Each is `not_yet_covered` or `not_applicable` — never `0`, never blank, never a dash that reads
as zero. The inverse bug ships with it: `components/models/HitterZoneMap.tsx:55` uses truthiness, so a
real .000 xwOBA renders as "no data." **(verified)**

**Stop condition:** `getCellColor('stuffPlus', null)` returns neither `above` nor `below`, and
`getCellColor('totalRE', null)` returns neither `goodClass` nor `badClass`. Both fail today.

---

### 4. Label the substitution at `lib/pitcherStats.ts:290-292`

`:292` is `dbStuffPlusVals.length > pitches.length * 0.5 ? dbStuffPlusVals : clientStuffVals`. A
coverage check existed throughout the outage and was wired to *hide* it: below 50% it returns a
different quantity under the same header. Worse, `pitches` is the **filtered** array, so the identity
of "Stuff+" flips when a user drags a date range — the metric becomes a function of UI state.
2015–2018 coverage sits near the 44% boundary, so this is not hypothetical. **(verified)**

Li owns whether the fallback is defensible (`Li/applied/metric-governance-applied.md` names this same
line). Cas owns the display consequence, and it is not negotiable: **return the provenance, render it,
and change the label when the quantity changes.** `stuffSrc === clientStuffVals` ⇒ the header reads
`Stuff+ (rv)`, tooltip naming the coverage and the switch. One afternoon, and it removes the exact
mechanism that concealed a three-month outage. **(inferred)**

### 5. Stop fabricating heatmap bins

`components/reports/TileViz.tsx:134-137` runs two passes filling every null 16×16 bin with the mean of
≥2 non-null neighbours; the trace at `:139` then sets `connectgaps:true`, `zsmooth:"best"` and
`hovertemplate: "%{z:.3f}"`. A bin with zero pitches takes a neighbour's value, is smoothed into the
surface, and reports three decimals on hover. The only gate is `f.length<5` at `:123` — five pitches
across 256 bins draws a full-colour surface. **(verified)** Triton already gets this right once: for
`chase_pct` at `:132-133` in-zone bins are nulled *and* protected from the fill. **Generalize that
guard; do not invent a new one.** **(verified)**

Kill the invented precision first — `%{z:.3f}` over an interpolated bin is the worst combination on
the platform, and hover should report the bin's own `n` first (`Whiff% 34.2 · n=17`). Then draw
imputation differently: interpolated bins at ~60% opacity, tooltip `interpolated from 3 neighbours`.
Imputation is allowed, silent imputation is not; Eurostat encodes exactly this as flag `i`.
**(documented)** Last, replace the global gate of 5 with a per-bin minimum.

### 6. Decouple the rolling window from the filter

`components/charts/RollingAverages.tsx:10` is `Math.min(25, Math.floor(f.length / 4))`. The smoothing
window is a function of how many rows survived the user's filter, so **apparent volatility tracks the
filter, not the pitcher**: narrow to 40 pitches and the line gets wigglier with nothing changed about
the arm. A pitch type with fewer rows than the window returns `null` and vanishes from the legend
without comment, and `f.length < 10` at `:7` prints "Not enough data" while 10 draws a confident line.
**(verified)** Fix: a fixed window in pitches or outings, printed on the chart ("15-pitch rolling").
Dropped types get a muted legend entry reading `— (n=8 < 15)`, not omission — omission is the display
equivalent of `AVG()` skipping NULLs. **(inferred)**

---

## NEXT (6 weeks – 6 months)

### 7. Render the coverage bands, starting from the denominator that already exists

With item 2 landed, adopt one rendering table across tables, tiles and charts
(`Cas/analytics-ux/08-loading-empty-error-states.md` §4):

| Coverage | Render |
|---|---|
| ≥ 0.95 | the number, plain |
| 0.60–0.95 | number + chip: `Stuff+ 104 · 78% cov · n=412` |
| 0.05–0.60 | number de-emphasised, chip amber, tooltip names the gap |
| < 0.05 | **no number** — "Insufficient coverage (4%) — 2026-06-01 onward" |

April 99.5 / May 90 / June 18 / July 4 / August 0 crosses three of those bands in three months,
unprompted, on every dashboard. That is the alarm nobody had to build. **(verified)** Wire
season-level coverage to `stuff_plus_n AS COUNT(p.stuff_plus)`, emitted nightly at
`scripts/create-materialized-views.sql:105` and read by no `.ts` or `.tsx` file — the instrument was
built and connected at neither end. **(verified)**

---

### 8. Uncertainty for short windows — de-emphasis, never suppression

`components/FilterEngine.tsx` makes a two-start window trivial to reach and gives no signal that the
sample is unstable. No stabilization threshold exists anywhere in the repo, and the platform's only
`n=` is `components/dashboard/PercentileTab.tsx:420` — which is the *pool's* n, not the player's.
**(verified)** Order of operations, which is not the intuitive one:

1. **Denominator glyph first** — `104 · 73 P / 2 G`. No statistical assumption, no new query, and
   already the format at `PercentileTab.tsx:420`.
2. **`minN` as a de-emphasis trigger, not a gate.** Reduced opacity plus the `n` keeps an April
   leaderboard populated and honest; a gate that empties a screen gets deleted.
3. **Intervals last**, and only where Li specified one: Wilson for rates, a detectable-difference band
   for comparisons, never a raw ± on a plus-stat.

`Li/applied/statistical-inference-applied.md` supplies every threshold. Cas supplies none, invents
none, and ships no placeholder. **(inferred)**

---

### 9. Cross-level axis policy, and the populations that move underneath it

MLB and MiLB plus-stats normalize against different baseline populations, and MiLB `league_averages`
is built with hardcoded MLB constants (`Li/applied/metric-governance-applied.md`). An AAA Stuff+ is an
unbiased estimate of a *different quantity*, so a shared axis is a category error, not an
approximation. **(documented)** Consume the field Li named rather than inventing a parallel one:
`crossLevelComparable === false` and more than one level in the series ⇒ refuse the shared axis.

Refuse means **structural separation, never a footnote**: separate panels, separate axes, a level chip
on every row, enforced in the tile and chart wrappers so `app/(milb)/milb/**` and `app/(research)/**`
cannot be composed into one trace by accident. **(inferred)**

The same rule catches a quieter case. `lib/enrichDerivedFields.ts:38-52` builds the
`cluster`/`hdev`/`vdev` centroid from `allRows` — whatever `app/api/player-data/route.ts:44` returned
under `ORDER BY p.game_date DESC LIMIT 50000` — so the comparison population is a truncation artifact
and **the same pitch scores differently on a career fetch and a season fetch**, unlabelled either way.
**(verified)** Move the centroid server-side against a declared population, or rename the display to a
payload-relative label (`Cluster (this view)`) with the row count in the tooltip. **(inferred)**

---

### 10. The overlay legibility spec

Trevor is on camera with these. Output is 1920×1080 transparent over live video at variable bitrate,
viewed at distance and often on a ~390 px phone — which scales the canvas 0.203×, putting a 14 px stat
label at **2.8 CSS px**. Ship `Cas/analytics-ux/11-broadcast-overlay-legibility.md` §7 in this order:

1. **A shared overlay text primitive**: stacked dark `text-shadow` halo (2–3 px),
   `paint-order: stroke fill`, `font-variant-numeric: tabular-nums`. Not one `text-shadow`,
   `-webkit-text-stroke` or `paint-order` exists in the overlay or producer trees today. **(verified)**
2. **Retire `#71717a` from overlay text** — 4.12:1 on the panel, ~3.48:1 once the 0.92 scrim
   composites over bright video, below WCAG AA at the 9–11 px it is used at. Labels to `#a1a1aa`,
   values to `#e4e4e7`; a find-and-replace in `components/producer/renderers/`. **(verified)**
3. **Type floor 18 px, target 24 px** for anything a viewer must read, ≤12 px for chrome only, and
   safe-area constants `SAFE_H = 96` / `SAFE_V = 54` (EBU R 95's 5% graphics-safe box) — both producer
   panels sit at 48 px and 28 px from the edge today. **(documented)**

One dead configuration belongs here: `app/overlay/[sessionId]/page.tsx:66` is
`fps={session.project_id ? 30 : 30}` — both branches 30, so the project's configured fps has never
been read. Wire it or delete the setting; a control that does nothing is a lie about the system.
**(verified)** On air the honest failure is **disappearing, not being wrong**: hold last-known, never
blank, never spin, escalate to the producer panel rather than the output, and fade an element past its
staleness budget instead of continuing to assert it. **(inferred)**

---

### 11. Build the honest states inside components — the framework slots are empty

There are **zero `loading.tsx` and zero `error.tsx` across 96 `page.tsx` files**, and the five
`Suspense` sites are `useSearchParams` CSR-bailout guards wrapping whole pages in blank
`min-h-screen` fallbacks, not streaming boundaries. **(verified)** So the seven real states
(`Cas/analytics-ux/08-loading-empty-error-states.md`) have no framework slot and must ship as one
component used by tiles, tables and charts alike. **Filtered-to-empty is not empty** — "No pitches
match these filters" with a clear-filters action, never the copy used for "this player has no data."
Staleness is the same obligation one layer down and is scoped to `Cas/caching-state/`: `asOf` in every
payload, an `As of …` footer thresholded against the surface's cadence. `league_averages` sat 46 days
stale while being a plus-stat denominator, with nothing on screen. Jo owns the repair (`Jo/applied/`);
**Cas owns whether the screen could have known.** **(verified)**

---

## LATER (6+ months)

### 12. Retire the second formatting implementation

`lib/leaderboardColumns.ts` carries its own format and colour helpers that agree with
`lib/metricRegistry.ts:608,618` on the em dash by coincidence, not contract, so every item above ships
twice or silently skips the leaderboards. Migrate it and the Reports tile path onto `METRIC_REGISTRY`,
deleting the duplicate rather than syncing it — large, mechanical, and worth doing only once items 2–3
have proven the descriptor shape in production. **(verified)**

### 13. "Why is this cell a dash?"

Click a `—` and get the reason: not covered before 2017, no `release_speed`, `n` below minimum,
benchmark 46 days stale. Every input exists once items 2 and 11 land, and
`lib/metricRegistry.ts:17-27` is where the reason is declared. A tooltip, not a modal. **(inferred)**

---

## Standing Rules

1. **A tile that cannot state its denominator does not render a number.** It renders the reason.
2. **The label must change when the quantity changes** — a fallback, a different source column or a
   different population all move the header text, not just a tooltip.
3. **`n` must be the denominator of the cell beside it**, never a row-level count spanning columns
   with different missingness. A shared `n` converts an unknown into a wrong known.
4. **Four null states, two glyphs, one tooltip** — `—` = we should know and don't, `·` = there is
   nothing to know. Colour never carries the distinction alone (WCAG 1.4.1).
5. **Imputation is allowed; silent imputation is not.** An interpolated value renders differently,
   says so on hover, and never at higher precision than the measurement it replaced.
6. **Smoothing windows, bin counts and comparison populations are declared, never derived from
   whatever the filter returned.** A parameter set by UI state describes the UI, not the player.
7. **Cross-level comparability is structural** — separate panels and axes, level chip on every row. A
   footnote is not a control. **Every regression test here is shown red against `main` first.**
8. **Killed: a global "data quality" banner.** The outage was one column of one metric, so page-level
   granularity cannot name the affected cell; the failure was a code-path change with intact data, so
   no data-quality monitor would have fired; and a persistent, usually-irrelevant warning trains the
   exact blindness that let a red suite run 53 days. The signal lives in the cell. **(cargo-cult)**
9. **Killed: a uniform "grey out below n = 100," and a confidence band on the rolling-average chart.**
   No reliability estimate exists for Stuff+, Cmd+, Brink+, deception or unique; the band would
   describe the smoothing window's own arithmetic (item 6) and reads as guaranteed containment.
   **(cargo-cult)**
10. **Retracted, do not resurrect:** an earlier briefing claimed red/green was load-bearing in the
    metric colours. It is not — 5 of 6 `plus` specs already use CVD-safe teal/orange
    (`lib/metricRegistry.ts:542-554`). Palette work is not on this list. **(verified)**

---

**Triton-internal evidence.** All `(verified)` claims were read in this repo on 2026-08-22; no
database was queried. Registry: `lib/metricRegistry.ts:17-27` is `MetricDef`'s 8 fields, with
`FormatSpec`, `ColorSpec` and `TotalsStrategy` at `:4,6-10,12-15`; `:542-554` are the teal/orange
`plus` specs; `:608-616` `formatMetric`; `:618-640` `getCellColor`, where
`:626-627` is the `Number(null) === 0` path and `:634-637` its `inverted_value` twin; `:643-690`
`calcTotalsFromRegistry`, which computes `vals.length` at `:657`, discards it, and divides at
`:663-670`. Registry importers repo-wide: two — `components/dashboard/OverviewTab.tsx:9` and
`lib/glossary.ts`; the sole totals call site is `OverviewTab.tsx:202`, and `:195-196` is where colour
and text disagree. Substitution: `lib/pitcherStats.ts:290-292`. Heatmap:
`components/reports/TileViz.tsx:123,132-133,134-137,139`. Rolling window:
`components/charts/RollingAverages.tsx:7,10`. Dashboard counts and report payload:
`app/(research)/player/[id]/page.tsx:95-96,103,125`. Payload-scoped centroids:
`lib/enrichDerivedFields.ts:38-52`, fed by `app/api/player-data/route.ts:44`. Unread denominator:
`scripts/create-materialized-views.sql:105`. Staleness for admins only:
`app/(admin)/admin/page.tsx:207-209`. Overlay fps: `app/overlay/[sessionId]/page.tsx:66`. Test
environment: `vitest.config.ts:11`; 96 `page.tsx`, 0 `loading.tsx`/`error.tsx`, counted 2026-08-22.
Contrast ratios, safe-area insets and the 0.203× phone scale carry from
`Cas/analytics-ux/11-broadcast-overlay-legibility.md`; the coverage series, the 46-day staleness and
the 291 em dashes from `Cas/analytics-ux/01-honest-data-presentation.md` and
`02-null-zero-unknown-ui.md`. Thresholds and the cross-level ruling are Li's, cited not restated.
