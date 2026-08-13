---
title: Dashboard Information Architecture — Where the Answer Goes
domain: analytics-ux
tags:
  - information-architecture
  - dashboard-layout
  - visual-hierarchy
  - scanning-patterns
  - grouping
  - reports-builder
  - filter-scope
  - wayfinding
sources_reviewed: 15
last_updated: 2026-08-13
---

# Dashboard Information Architecture — Where the Answer Goes

> Grades: **(verified)** read or run at `file:line`; **(documented)** vendor/research literature;
> **(inferred)** mechanism; **(cargo-cult)** repeated, unsupported. No production query was run.
> Drill-down → `10-progressive-disclosure-drilldown.md`; table density → `07-dense-table-design.md`.

## TL;DR

- **IA answers "where does the answer go?" — a grid is a container, not an answer.** Triton has containers everywhere, almost no declared priority. **(inferred)**
- **The player dashboard shows two different numbers both labelled "pitches", and the one in the dominant position is the wrong one.** `:95` pre-filter; `:125` post-filter, 11px grey, far right. **(verified)**
- **Reports Builder cannot express hierarchy: up to 16 boxes, uniform size, append-only, no reorder, no span.** Tile 1 and tile 16 are indistinguishable. **(verified)**
- **The report's sample size lives in a *placeholder*, so typing a subtitle deletes it — including from the exported PDF.** `reports/page.tsx:355`, `:897`. **(verified)**
- **A 16-tile report carries up to 17 filter scopes, and the one printed `n` is their union, describing no tile.** `reports/page.tsx:322-330`. **(verified)**
- **The dashboard's one genuinely right IA decision is FilterEngine *above* the tabs: question persistent, view transient.** 59 filter defs, 14 categories, one scope. **(verified)**
- **Tabs are named after data types, not questions, so one analyst question spans three.** "Did the slider lose depth in August?" = Movement + Velocity + Game Log. **(verified)**
- **Two consumers, two correct architectures, both already built.** The 102-line producer page is a linear wizard; the dashboard a 10-tab workbench. Do not converge them. **(verified)**
- **Grouping is the cheapest hierarchy Triton isn't using: `GROUP_COLUMNS` orders 78 column slots; the grid has no equivalent.** **(verified)**
- **Shneiderman's overview→filter→details is 30 years old and the Reports grid runs it backwards — details first, overview never.** **(documented)**

---

## 1. What IA means when the unit is a number

Site IA asks *where does this page live*. Dashboard IA asks: **of the ~40 numbers on this screen, which is the answer, and does the layout say so?** Position, size, and grouping are the only channels that can say it, and they are read before any label — preattentive processing settles hierarchy in ~250 ms (documented). Three failure modes, in increasing cost:

| Failure | Triton instance |
|---|---|
| No declared priority — every element same size and weight | Reports grid: 16 uniform boxes **(verified)** |
| Priority declared *wrongly* — prominence to the less trustworthy value | Pre-filter `n` in the H1 block **(verified)** |
| Priority that decays — correct at build time, silently lost later | `n` stored as a placeholder **(verified)** |

The third is Cas's territory: not a taste problem but an integrity problem with a mechanism. The standing rule — *every aggregate owes you its n* — is enforced or abandoned by IA.

---

## 2. Triton already has three IA patterns; only one is chosen deliberately

| Surface | Pattern | Priority signal | Verdict |
|---|---|---|---|
| Player dashboard | Faceted workbench — persistent filter, 10 tabs | Tab selection | Right pattern, wrong emphasis inside it |
| Reports Builder | Free-form canvas — 4 default tiles, cap 16, grid 1–4 cols | **None** | Wall-of-tiles generator |
| Producer panel | Linear wizard — status → preset → config → push | Vertical order | Correct, and the smallest file of the three |

The producer page is **102 lines**, `max-w-2xl`, single column, one decision at a time, live action pinned at the bottom (verified) — right for someone pushing one number in under a second, the limit below which flow of thought holds (documented). The dashboard, serving an analyst sitting for twenty minutes, correctly does the opposite. **Do not converge them**; the mobile tree (`components/mobile/`, `useDevice()`) is a third whose IA transfers to neither.

---

## 3. The one decision the dashboard gets right

`app/(research)/player/[id]/page.tsx:108` renders `FilterEngine`, `:111` the tab bar. Filter above view. That ordering encodes the correct claim:

> **The filter is the question. The tab is the lens. Changing lens must not change question.**

It holds mechanically: `usePlayerData.ts:256-259` applies `activeFilters` once to `seasonFilteredData`; every tab consumes the same `data` array. All 59 filter defs across 14 categories resolve to one scope (verified); saved configs persist to `filter_templates`. Exactly what Shneiderman prescribes — *zoom and filter* global and persistent, *details on demand* transient (documented). Triton got the hard half right, then buried the evidence — §5.

---

## 4. Why Reports Builder manufactures a wall of tiles

Not a styling accident. Four individually defensible properties compose into an architecture that **cannot express importance**:

| Property | Code | Consequence |
|---|---|---|
| Uniform tile size | `minHeight: columns===1?320:columns===2?280:250` | No tile can be bigger than another |
| Uniform grid | `gridTemplateColumns: repeat(${columns}, 1fr)` | No spans, no asymmetry |
| Append-only add | `addTile()` appends, cap 16 | Reading order = creation order |
| No reorder | no drag handles or index controls | Order can never be corrected |

A 16-tile report at 4 columns is a 4×4 matrix of visually equal claims. Few's rule — a dashboard fits one screen and *ranks* what it shows — is unreachable by construction, not neglect (documented). And the grid *does* group, arbitrarily: by proximity, tiles 1–4 read as a set because they share a row, whatever they hold (documented).

Two honesty consequences, both verified:

1. **Per-tile filters, one printed `n`.** `ReportTile.tsx:105` applies `config.filters` *on top of* page-level `globalFilters` — 16 tiles, up to 17 scopes. `displayedPitchCount` (`reports/page.tsx:322-330`) is a `Set` union across tiles: it describes the report's coverage, not any tile's denominator. Every tile is silent about its own.
2. **The `n` is a placeholder.** The subtitle input's `placeholder` carries it (`:897`); the PDF path is `reportSubtitle || \`…pitches\`` (`:355`). Type a real subtitle and the sample size vanishes from screen *and* export. The default is honest; the customised version is not.

Both are IA problems, not label problems: no tile reserves a slot for its own denominator, so the page slot got overloaded.

---

## 5. Scanning: Triton's most prominent number is its least trustworthy

Dense screens are scanned in an F-shape: first line across, then shorter sweeps down the left (documented). The player header sits in that first sweep.

| Element | Position / type | Value shown |
|---|---|---|
| `:95` "N pitches" | H1 block beside the player name, 14px | `seasonFilteredData.length` — **before** FilterEngine |
| `:125` "N pitches (filtered)" | tab bar far right, `text-[11px] text-zinc-500` | `resultCount` — **after** FilterEngine |

Apply any filter and these disagree permanently. The larger, better-placed, first-scanned number is the one that does **not** describe the charts below it; the one that does is 11px grey in the weakest position, on a 300 ms debounce (`usePlayerData.ts:263-268`). Position is a stronger claim than a parenthetical `(filtered)`, and it is making the wrong one (inferred). The fix is IA, not copy: **one `n` slot per screen, next to what it describes, holding the post-filter value**, pre-filter total demoted to context ("1,204 of 3,880").

---

## 6. Grouping and the question-first flow

The ten tabs are named for **data categories**: Overview, Movement, Visualizations, Velocity, Results, Pitch Log, Splits, Game Log, Ranks, Pitch Level (verified). Analysts arrive with questions, not categories, and a question crosses tabs:

| Analyst question | Tabs required today |
|---|---|
| Did the slider lose depth in August? | Movement + Velocity + Game Log |
| Is he getting chased out of the zone less? | Results + Splits + Ranks |
| Which pitch carries the arsenal? | Overview (arsenal) + Ranks |

Chunking research says grouping by the user's task beats grouping by the data model (documented). The cheap move is **not** renaming ten tabs — it is adding question-shaped entry points that preset a filter+tab pair, leaving the category tabs for exploration. Scent improves when a link predicts what's behind it: "Movement" predicts a data type, "Slider depth by month" predicts an answer (documented).

The ingredient exists. `lib/metricRegistry.ts` defines **69** metrics; `GROUP_COLUMNS` orders them into three named sets (traditional 25, advanced 34, arsenal 19 — 78 slots), consumed via `getColumns()` at `OverviewTab.tsx:158-160`. Column IA is centralised and data-driven; **grid IA has no equivalent** — no presets, no sections, no tile weight. Within-row density → `07-dense-table-design.md`.

---

## 7. Wayfinding: accent-by-area is doing real work

Emerald = analytics, sky = broadcast/work, violet = messaging, amber = Compete: a persistent, preattentive "where am I" signal costing no screen space (inferred). Two cautions.

- **Amber is overloaded** — the Compete area, the Push-to-Compete button, *and* read-only injected filters in a report tile (`ReportTile.tsx:296`). The last is a status colour borrowing a wayfinding one.
- **The nav is not a map.** `ResearchNav.tsx` exposes 20 links in three tiers (7/7/6) against **28** pages under `app/(research)/` (verified); eight are reachable only by drill-down.

Colour is never the *only* channel → `06-color-encoding-accessibility.md`.

---

## 8. What Triton should do, in order

1. **Collapse the two "pitches" counts into one slot** holding the post-filter value, pre-filter total as context (`1,204 of 3,880`). Two lines in `player/[id]/page.tsx`; removes a live contradiction from the most-used screen.
2. **Make the report `n` a rendered element, not a placeholder** — out of the subtitle input (`:897`) and the `||` fallback (`:355`), so a custom subtitle can't delete it.
3. **Give every tile its own `n`.** `ReportTile.tsx:105` already computes `filtered`; render `filtered.length` in the header. Closes the 17-scopes gap.
4. **Add tile ordering and one size step** (`col-span-2`/`row-span-2`) — the minimum vocabulary for priority.
5. **Ship 3–5 question-shaped report presets** via the existing `report_templates` table.
6. **Introduce grid sections** — an optional heading row between tile groups — so proximity means something chosen.

**Anti-recommendation: do not adopt a drag-and-drop, freely-resizable dashboard grid (react-grid-layout or similar).** The obvious upgrade, wrong on three independent grounds. **Wrong problem:** Reports can't say which tile matters; arbitrary geometry adds expressiveness without adding *priority* — the same 16 boxes, scattered instead of aligned. **It fights the export path:** `exportPDF` rasterises `gridRef` into fixed A4 landscape (`:355`) and per-tile export writes a PNG from `tileRef` (`ReportTile.tsx:84-102`); free geometry makes both unpredictable, and the PDF is what a coach receives. **It costs more than the whole list above:** items 1–3 are small edits closing two verified honesty defects, while a layout engine means a dependency, a `tiles_config` schema change, and a mobile fork that gains nothing. `@hello-pangea/dnd` is already in the repo — item 4 needs no grid engine.

**Highest-leverage next action:** render `filtered.length` in the `ReportTile` header. One line in one file, and every tile in every exported report stops being an aggregate that cannot state its denominator.

---

## Sources

1. Shneiderman — [The Eyes Have It (1996)](https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf) — overview→filter→details; §3, §6.
2. Few — [Common Pitfalls in Dashboard Design](https://www.perceptualedge.com/articles/Whitepapers/Common_Pitfalls.pdf) — single-screen and ranking rules §4's grid can't satisfy.
3. NN/g — [Preattentive Visual Properties in Dashboards](https://www.nngroup.com/articles/dashboards-preattentive/) — the ~250 ms hierarchy read (§1).
4. NN/g — [F-Shaped Reading Pattern](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/) — why the header `n` is scanned first (§5).
5. NN/g — [Visual Hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) — position/size as priority channels (§1).
6. NN/g — [Gestalt Proximity](https://www.nngroup.com/articles/gestalt-proximity/) — why a uniform grid groups arbitrarily (§4).
7. NN/g — [Chunking](https://www.nngroup.com/articles/chunking/) — task-grouping beats data-model grouping (§6).
8. NN/g — [Information Scent](https://www.nngroup.com/articles/information-scent/) — why "Movement" is a weaker label than a question (§6).
9. NN/g — [Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/) — tabs as exclusive views of one scope (§3).
10. NN/g — [Filters vs. Facets](https://www.nngroup.com/articles/filters-vs-facets/) — scope model behind the 59-def FilterEngine (§3).
11. NN/g — [Response Times: 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) — the 1 s budget behind the producer wizard (§2).
12. Grafana — [Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/) — rows/sections and per-panel scope (§8.3, §8.6).
13. IBM Carbon — [Dashboards](https://carbondesignsystem.com/data-visualization/dashboards/) — hierarchy-first tile layout as a requirement (§4).

**Triton-internal evidence (repo read 2026-08-13; no production query).** `app/(research)/player/[id]/page.tsx` — 147 lines; `FilterEngine` `:108`, tab bar `:111`; `{seasonFilteredData.length} pitches` `:95` vs `{resultCount} pitches{" (filtered)"}` `:125`. Scope in `lib/hooks/usePlayerData.ts`: `seasonFilteredData` `:243-251`, `filteredData` `:256-259`, 300 ms debounce setting both `data` and `resultCount` `:263-268`; `BASE_TABS` = **10** at `:31-42`. `app/(research)/reports/page.tsx` — 934 lines; `defaultTiles()` = **4** `:31-38`; `addTile()` cap **16** `:334`; `repeat(${columns}, 1fr)` + `minHeight` 320/280/250 `:899-901`; `displayedPitchCount` `Set` union `:322-330`; PDF fallback `reportSubtitle || …pitches` `:355`; subtitle `placeholder` carrying the `n` `:897`; grid buttons `[1,2,3,4]`. `components/reports/ReportTile.tsx` — 383 lines; per-tile `applyFiltersToData(data, config.filters)` `:105`; amber read-only chip `:296`; `exportTile` html2canvas `:84-102`; 6 viz types `:191`. `lib/filterEngineCore.ts:33` — `FILTER_CATALOG` **59** entries, **14** categories (Location 9, Situational 8, Pitch 8, Swing 5, Expected 5, Release 4, Outcome 4, Count 3, Batted Ball 3, five more at 2). `lib/metricRegistry.ts` — 702 lines, **69** entries; `GROUP_COLUMNS` `:564` = traditional **25**, advanced **34**, arsenal **19** (78 slots); consumed at `components/dashboard/OverviewTab.tsx:158-160`. `components/ResearchNav.tsx` — 7+7+6 = **20** links; `find "app/(research)" -name page.tsx` = **28**. `app/(broadcast)/producer/[sessionId]/page.tsx` — **102** lines, `max-w-2xl`, linear status→preset→config→sticky-push. Accent conventions and the mobile split (`components/mobile/`, `useDevice()`) per `Cas/context/triton-context.md` (2026-08-11), not re-measured.
