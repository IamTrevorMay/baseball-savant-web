---
title: Null, Zero, Unknown — What the Cell Should Say When There Is No Number
domain: analytics-ux
tags:
  - null-semantics
  - missing-data
  - table-design
  - glyphs
  - tooltips
  - heatmaps
  - accessibility
  - metric-registry
sources_reviewed: 13
last_updated: 2026-08-13
---

# Null, Zero, Unknown — What the Cell Should Say When There Is No Number

> Grades: **(verified)** read at `file:line`; **(documented)** vendor/standards docs; **(inferred)** mechanism;
> **(cargo-cult)** unsupported. No production query was run. Boundary: *is the column null* →
> `Jo/data-quality/07-null-semantics-missingness.md`; *what it means* → `Li/metric-governance/03`.
> **This doc owns what the pixel says.**

## TL;DR

- **Four states exist in Triton's data — measured-zero, not-measured, not-applicable, not-yet-covered — and three render as the same em dash.** **(verified)**
- **A NULL Stuff+ renders as an *orange* em dash, the below-average color** — `Number(null) === 0` falls through `getCellColor`'s `plus` branch to `below`. **(verified)**
- **Worse than a dash is a plausible number**: `PARK_FACTORS[team]?.basic || 100` renders an unmatched key as exactly-league-average, at 4 call sites. **(verified)**
- **The inverse bug is live too**: six sites use truthiness (`bz?.xwoba ? … : '—'`), so a real .000 xwOBA renders as "no data." **(verified)**
- **Statistical agencies use *distinct* symbols** — Eurostat `:` not available, `-` not applicable, `0` real zero; the UK Analysis Function warns off "NA". **(documented)**
- **Codd argued in 1986 that one null mark is insufficient** — applicable- and inapplicable-missing are different claims. Triton has four kinds. **(documented)**
- **The strike-zone heatmap fabricates bins**: empty cells get a two-pass neighbor average, then `connectgaps:true` blends the rest. Interpolated and measured pixels look identical. **(verified)**
- **Chase% is the one place Triton gets not-applicable right** — in-zone bins nulled *and* protected from fill. Generalize that guard, don't invent one. **(verified)**
- **`formatMetric` is the right chokepoint and exists**, but collapses `null`, `''`, and `'—'` into one output at `metricRegistry.ts:609`. It needs a state, not a value. **(verified)**
- **Totals rows silently rebase**: `calcTotalsFromRegistry` averages `sum / vals.length` after filtering NaN, so 3-of-8 seasons looks like 8-of-8. **(verified)**

---

## 1. Four states, one glyph

| State | Means | Triton example | Correct claim |
|---|---|---|---|
| **Measured zero** | We looked, the answer is 0 | 0 barrels on 40 BBE; xwOBA .000 in a zone | `0` |
| **Not measured** | Should exist, doesn't | `stuff_plus` NULL on 100% of Aug 2026 rows | "unknown" |
| **Not applicable** | Cannot exist by definition | Chase% in-zone; IR/IRS for a starter | "doesn't apply" |
| **Not yet covered** | Outside the data's reach | deception starts 2017; MiLB 2023 | "out of range" |

Errors run both ways: *unknown* as `0` invents a fact, *zero* as unknown destroys one. Codd's 1986 argument was that one null mark cannot express applicable-vs-inapplicable missing; Triton needs four, since "the scorer broke" and "the season predates the model" demand different actions. Two cases are total: `players.team` populated on **0 of 16,931** rows, `compete_pitches.athlete_profile_id` NULL on **all 443** because `upload/route.ts:45` never passes it.

---

## 2. The glyph inventory Triton actually ships

| Rendering | Sites | Currently means |
|---|---|---|
| `'—'` em dash | **291** | null, undefined, 0-ms, empty string, "already a dash" |
| `'-'` hyphen / `'–'` en dash | 10 / 7 | same thing, different pixels |
| `'N/A'` | 6 | ambiguous by construction (§5) |
| `?? ''` blank | 55 | invisible; reads as "nothing here" |
| `\|\| 0` / `?? 0` | **207 / 73** | unknown promoted to a real zero |
| `"Not enough data"` | `TileViz.tsx:122` | the only *n*-aware empty state in the viz layer |

Four glyphs for one meaning, and one meaning (`|| 0`) with no glyph. Two independent format/color implementations — `metricRegistry.ts:608/618` and `leaderboardColumns.ts:454/471` — agree on the em dash by coincidence, not contract.

### 2.1 The orange dash

`OverviewTab.tsx:195-196` passes the same raw value to both helpers — `getCellColor(c.k, r[c.k])` for the class, `formatMetric(c.k, r[c.k])` for the text. `formatMetric` returns `'—'` for null; `getCellColor` does `Number(value)`, and `Number(null)` is **0**, not `NaN`, so the `isNaN` guard never fires. For `stuffPlus` (`above: 'text-teal-400', below: 'text-orange-400'`), `0 < 100` → **`text-orange-400`**: a dash in the color reserved for well-below-average. `inverted_value` fails identically — `n < 0` and `n > 0` are both false, so unknown lands in `badClass`. The text layer knows the value is missing; the color layer does not.

---

## 3. Both conflations, live

| Direction | Mechanism | Sites | Reader believes |
|---|---|---|---|
| unknown → number | `PARK_FACTORS[team]?.basic \|\| 100` | `scene-stats/route.ts:136, 398, 1098, 1671` | park-neutral, measured |
| unknown → bad color | `Number(null) === 0` in `getCellColor` | every `plus`/`inverted_value` metric | the pitcher is bad |
| unknown → 0 | 207 `\|\| 0` + 73 `?? 0` | mixed | a real count of zero |
| zero → unknown | `bz?.xwoba ? …toFixed(3) : '—'` | `HitterZoneMap:55,57`, `DamageZoneMap:56,58`, `videos:1155`, `compete/video:1291` | no data here |
| unknown → blank | `?? ''` | 55 | nothing to show |

`|| 100` is the canonical anti-pattern because the fallback is *plausible*: `NaN` gets caught in review, `100` looks like a finding. The fix is not a better fallback — a lookup miss must produce a value formatting can catch, and be counted where Jo can alert on it.

The truthiness bugs are the same class, operator reversed. `bz?.avg_ev ? …` treats `0` as absent; 0 mph is impossible so that stays latent, but **xwOBA .000 is a real cell** — the zone where the hitter did nothing — rendered as "no data." Use `!= null` on any numeric that can legitimately be zero.

---

## 4. Charts lie differently than tables

A table gives every missing value a cell to sit in. A chart must render it as *absence*, and absence in a continuous encoding looks like interpolation. `components/reports/TileViz.tsx:127-138`, the strike-zone heatmap, does three things in order:

1. Bins pitches 16×16, metric per bin; empty bins → `null`.
2. **For `chase_pct` only**, nulls all in-zone bins *and* skips them during fill. **Correct, and the model to copy.**
3. For every metric, runs **two passes** filling each null bin with the mean of ≥2 non-null neighbors.

The trace then sets `connectgaps: true`, `zsmooth: "best"`, `hovertemplate: "%{z:.3f}"`. A bin with zero pitches takes a neighbor value, is smoothed into the surface, and reports three decimals on hover. Nothing distinguishes 40 pitches from 0, and the only gate is `f.length < 5` at :122 — five pitches across 256 bins draws a full-color surface.

| Library | Default for null | Honest option |
|---|---|---|
| Plotly heatmap | `connectgaps` defaults **false**; Triton sets **true** | `connectgaps:false`, `hoverongaps:false` (set), visible gap color |
| Vega-Lite | none unless asked | `impute` is a named transform — imputation is a *decision*, not a default |

**Rule: imputation is allowed; silent imputation is not.** An interpolated bin must be drawn differently — reduced opacity or hatching, plus a tooltip reading `interpolated from 3 neighbors`. Eurostat encodes this as flag `i`.

---

## 5. The conventions to adopt

Statistical agencies converged on distinct marks decades ago, and the Government Analysis Function guidance is blunt: **do not use "NA"** — it reads as both *not applicable* and *not available*. Triton's 6 `'N/A'` sites are that defect; its 291 em dashes are worse.

| State | Glyph | Color | Tooltip (required) |
|---|---|---|---|
| Measured zero | `0`, formatted normally | normal | none |
| Not measured | `—` | `zinc-600`, never a scale color | "No value recorded — expected here" |
| Not applicable | `·` middle dot | `zinc-700` | "Chase rate is undefined in-zone" |
| Not yet covered | `·` | `zinc-700` | "Deception starts 2017" |
| Imputed | value at 60% opacity | normal | "interpolated from 3 neighbors" |

- **A non-color cue is mandatory.** WCAG 1.4.1 forbids color as the sole carrier of meaning, and `zinc-600` vs `zinc-700` is two steps apart. The *glyph* does the work.
- **Two glyphs, not four.** `—` = we should know and don't; `·` = there is nothing to know. Four marks is a legend nobody reads; the four states survive in the tooltip, which screen readers reach via `title`/`aria-label` — an empty `<td>` announces as nothing.

Table mechanics → `analytics-ux/07-dense-table-design.md`; coverage and *n* → `01-honest-data-presentation.md`; the same taxonomy at 4× type size → `11-broadcast-overlay-legibility.md`.

---

## 6. Where the state has to come from

The UI cannot infer which state a null is — that lives in the metric's definition. `lib/metricRegistry.ts` has **69** `MetricDef` entries and no field for it: `FormatSpec` is `int|dec|pct|ip`, `ColorSpec` is `static|plus|inverted_value`, and nothing says *what a null here means*. `Li/metric-governance/03` proposes a coverage/`nullMeans` descriptor; **Cas is the consumer** — with it, `formatMetric(key, value)` becomes `formatMetric(key, value, ctx)` and all 291 dash sites are fixed at one chokepoint. Until it lands, the interim is one guard: `getCellColor` returns a missing class when `value == null`, before coercion. The registry also owes the display a canonical form for `milb_pitches.events` (Title Case vs lowercase in `pitches.events`), which currently splits `Strikeout`/`strikeout` into two rows of one grouped table.

Aggregates need the same. `calcTotalsFromRegistry:654-665` filters NaN then divides `sum / vals.length`: correct arithmetic, dishonest presentation — a career row averaging 3 of 8 seasons is pixel-identical to one averaging 8 of 8. **Any totals cell whose denominator differs from its row count must show it.**

---

## 7. What Triton should do, in order

1. **Kill the orange dash.** In `getCellColor`, return `'text-zinc-600'` when `value == null || value === ''`, *before* `Number()`. Two lines; fixes every `plus` and `inverted_value` metric.
2. **Replace the four `|| 100` park-factor fallbacks** with an explicit miss that formats as unknown, and log it (`scene-stats/route.ts:136, 398, 1098, 1671`).
3. **Fix the six truthiness sites** — `bz?.xwoba ?` → `bz?.xwoba != null ?`. A .000 zone is a finding.
4. **Turn off silent interpolation.** `connectgaps:false` at `TileViz.tsx:138`; draw interpolated bins at reduced opacity; generalize the `chase_pct` guard.
5. **Standardize on two glyphs** (`—`, `·`) via one constant shared by `formatMetric` and `formatValue`. Delete the hyphen, en-dash, and `'N/A'` variants.
6. **Add `nullMeans` to `MetricDef`** once `Li/metric-governance/03` lands, thread it through `formatMetric`, backfill the 69 entries.
7. **Show the denominator** in totals rows where it differs from the row count.

**Anti-recommendation — do not "fix" this by coalescing nulls to 0 in SQL so the UI always has a number.** Tempting — one `COALESCE` per column, no view-layer work — and wrong on three grounds. **It destroys information irreversibly:** once `NULL → 0` crosses the API boundary nothing downstream can tell a measured zero from a missing one. **It corrupts every aggregate:** `AVG()` skips NULLs but averages zeros, so coalescing changes the *number*, not the rendering — Aug 2026's 100%-NULL `stuff_plus` would report a league Stuff+ of 0. **It hides the incident class Triton has already suffered:** a failed scorer shows up as a shrinking denominator; coalesced to zero it shows up as a plausible decline, which is how four months of Stuff+ decay went unnoticed. The null is the signal.

**Highest-leverage next action:** add the `value == null` guard at the top of `getCellColor` (`lib/metricRegistry.ts:618`) plus a test asserting `getCellColor('stuffPlus', null)` is not `text-orange-400`. Ten minutes, and it removes the one case where the UI states a false conclusion rather than omitting a true one.

---

## Sources

1. Codd — [Missing Information (Applicable and Inapplicable)](https://sigmodrecord.org/publications/sigmodRecord/8612/pdfs/16301.16303.pdf) — 1986: one null mark is insufficient; §1.
2. Wikipedia — [Null (SQL)](https://en.wikipedia.org/wiki/Null_(SQL)) — three-valued logic; §2.1's failing guard.
3. PostgreSQL — [Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — `avg()` ignores nulls; the denominator §6 mirrors.
4. Eurostat — [Symbols and abbreviations](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Tutorial:Symbols_and_abbreviations) — `:` not available, `-` not applicable, `0` real zero; §5's table.
5. Eurostat — [Glossary: Flag](https://ec.europa.eu/eurostat/statistics-explained/index.php/Glossary:Flag) — `obs_status` codes incl. `i` imputed, `m` cannot exist; the mark §4 wants.
6. UK Gov Analysis Function — [Symbols in tables](https://analysisfunction.civilservice.gov.uk/policy-store/symbols-in-tables-definitions-and-help/) — `[x]` vs `[z]`; the warning against "NA".
7. SDMX — [Cross-domain code lists](https://sdmx.org/?page_id=3215) — `CL_OBS_STATUS`; the shape `nullMeans` wants.
8. W3C — [WCAG 2.2: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) — why §5 rides the glyph, not the color.
9. W3C WAI — [Tables Tutorial](https://www.w3.org/WAI/tutorials/tables/) — empty-cell announcement; §5's `aria-label`.
10. Plotly — [Heatmap reference](https://plotly.com/javascript/reference/heatmap/) — `connectgaps`, `hoverongaps`, `zsmooth`, the options `TileViz.tsx:138` sets.
11. Vega-Lite — [Impute transform](https://vega.github.io/vega-lite/docs/impute.html) — imputation as an explicit named transform; §4.
12. Tableau — [Work with missing values](https://help.tableau.com/current/pro/desktop/en-us/missing_values.htm) — show-missing as a toggle.
13. Nielsen Norman Group — [Empty-State Interface Design](https://www.nngroup.com/articles/empty-state-interface-design/) — empty vs filtered-to-empty; what `TileViz.tsx:122` half-does.

**Triton-internal evidence (repo read 2026-08-13; no production query).** Glyph counts, `grep -rn` over `components/`+`app/`: **291** `'—'`, 10 `'-'`, 7 `'–'`, 6 `'N/A'`, 55 `?? ''`, **207** `|| 0`, **73** `?? 0`. `lib/metricRegistry.ts`, 702 lines, **69** `key:` entries; `FormatSpec`/`ColorSpec` at :6-15, no `nullMeans`; `formatMetric` :608-609; `getCellColor` :618, `plus` :625, `inverted_value` :634; `stuffPlus` :549-553 (`below: 'text-orange-400'`); `calcTotalsFromRegistry` :654 filter, :664 `sum / vals.length`. `components/dashboard/OverviewTab.tsx:195-196` passes raw `r[c.k]` to both helpers; parallel impl `lib/leaderboardColumns.ts:454`/`:471` (explore, MiLB explore, WBC). Park-factor fallbacks `app/api/scene-stats/route.ts:136, 398, 1098, 1671`; the one non-fallback read is `app/api/park-adjusted/route.ts:44`. Truthiness-zero refs are in §3; heatmap `TileViz.tsx:122` `f.length<5`, `:132` chase null, `:134-137` two-pass fill (chase guarded at :136), `:138` trace options. `app/api/compete/performance/upload/route.ts:45` builds rows as `rowToDb(r, { session_id, uploaded_by })` — no `athlete_profile_id`. Row counts (`players.team` 0/16,931; `compete_pitches.athlete_profile_id` 0/443), the Aug 2026 100%-NULL `stuff_plus` figure, the 2017 deception start, and the MiLB Title-Case `events` mismatch come from the central measurement pass of 2026-08-12 and `Cas/context/triton-context.md`; not re-measured.
