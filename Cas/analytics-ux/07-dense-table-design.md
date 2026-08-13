---
title: Dense Table Design — Thirty-Four Columns That Still Read Like a Sentence
domain: analytics-ux
tags:
  - dense-tables
  - numeric-formatting
  - tabular-figures
  - sticky-headers
  - sorting-affordances
  - conditional-coloring
  - metric-registry
sources_reviewed: 13
last_updated: 2026-08-13
---

# Dense Table Design — Thirty-Four Columns That Still Read Like a Sentence

> Grades: **(verified)** read at `file:line`; **(documented)** vendor/standards docs; **(inferred)** mechanism; **(cargo-cult)** unsupported. No production query was run.

## TL;DR

- **One registry declares order, format, color and totals for 69 metrics — and two files import it.** Solved in the abstract, unenforced in practice. **(verified)**
- **`formatMetric()` never applies the precision it declares.** `digits` is read only inside `calcTotalsFromRegistry`, so only the totals row's precision is guaranteed. **(verified)**
- **That gap is why a rival formatter lives in the broadcast renderer**, stripping leading zeros (`.312`), which the registry cannot express. **(verified)**
- **The densest table scrolls both axes with nothing pinned:** 34 columns, no sticky `thead`, no frozen year column, while six other surfaces pin. **(verified)**
- **Nothing in the dashboard's main table is sortable, and `aria-sort` appears zero times repo-wide.** **(documented)**
- **`font-mono` is the wrong fix for digit alignment; `tabular-nums` is the right one.** **(documented)**
- **62 of 69 entries color statically: color carries category, not value**, so a bad number looks like a good one — and `higherBetter`, which would fix it, has zero consumers. **(verified)**
- **The totals row averages ratios unweighted**, so a 12-pitch season weighs the same as a 3,000-pitch one. **(verified)**
- **Compact labels bought density and cost a duplicated tooltip dictionary**: four identical tip pairs exist only because arsenal renames four columns. **(verified)**
- **The sample-size column, the thing that makes density honest, is hardcoded to `0` on Lahman-only rows.** **(verified)**

---

## 1. What density costs, and the four affordances that buy it back

TruMedia density bets that an analyst comparing 34 numbers across 12 seasons scans faster in one grid than through twelve cards. It pays only if four affordances hold.

| Affordance | Prevents | Triton status |
|---|---|---|
| Stable numeric alignment | Decimal drift; 9.5 read as 95 | Partial — `font-mono`, not tabular figures **(verified)** |
| Persistent row/column anchors | "Which season is this row?" | **Absent on the main table** **(verified)** |
| Sort by any column | Scanning by eye for the max | Absent here; on 11 other surfaces **(verified)** |
| Value-encoded color | Every cell reading as fine | 7 of 69 metrics **(verified)** |

Row height and font size are not on the list: `text-[12px]`/`px-3 py-2` is already tight and legible; every failure below is structural. Render cost and windowing: `Cas/frontend-data-scale/01-rendering-large-datasets.md`; palettes: `06-color-encoding-accessibility.md`.

---

## 2. Numeric formatting: precision declared, never applied

`MetricDef.format` is a real spec: `int | dec(1|2|3) | pct(1) | ip`. `formatMetric()` is close to a no-op: it maps `null`/`''`/`—` to an em dash, appends `%` when the type is `pct`, otherwise returns `String(value)`. `digits` is never consulted — except inside `calcTotalsFromRegistry`, making the **totals row the only row whose precision the registry guarantees**, an inversion of what a formatting layer is for **(verified)**. It survives only because `lib/pitcherStats.ts` `toFixed()`s consistently; the failure mode is the next contributor returning a raw float.

So the broadcast leaderboard formats the same metric differently from the dashboard, `LeaderboardRenderer` carrying its own `<1 → toFixed(3)` rule; and `.312`, the convention that renderer implements by hand, is unexpressible in `FormatSpec`, which has no `stripLeadingZero`.

**Alignment.** Right-align numerals, left-align the label column — `OverviewTab` gets this right with `text-right first:text-left`, then reaches for `font-mono` to equalise digit widths. The correct tool is `font-variant-numeric: tabular-nums`: same UI typeface, corrected digit advance width, and lining tabular figures are the table default **(documented)**. Tailwind ships it; three Triton files use it **(verified)**. Separating "no data" from "zero" is `02-null-zero-unknown-ui.md`'s; §7 is where this table breaks it.

---

## 3. Sticky headers and the frozen first column

A wide table in a scrolling container has two orientation problems: scroll down, the column names leave; scroll right, the row's identity leaves. Two fixes — `position: sticky` with `top: 0` on `thead` and `left: 0` on the identity cell — each needing an opaque background, since sticky elements paint over content **(documented)**.

| Surface | Header pinned | Identity column pinned |
|---|---|---|
| `OverviewTab` (25/34/19 cols) | ✗ | ✗ |
| `PitchLogTab` | ✗ | ✓ |
| `MobileDataTable` | ✗ | ✓ (`pinned` flag) |
| `research/explore`, `research/wbc`, `milb/explore` | ✓ | ✗ |
| `research/sequencing` | ✓ | ✓ |

The repo knows how; the densest table never got it **(verified)**. NN/g's caution about headers eating short viewports argues for a compact pinned row, not none **(documented)**. Semantics ride along: `<th scope="col">` appears zero times repo-wide, so a screen reader cannot name the column a cell belongs to **(documented)**.

---

## 4. Sorting: absent where it matters most

Eleven files carry sort state; `OverviewTab` is not one. Its rows are pre-sorted year-descending, the only order available, so "which season had the best K-BB%" is answered by eye **(verified)**. The affordance has three parts, and shipping fewer is worse than none:

1. **Discoverability** — the header looks interactive before it is clicked (cursor, hover, neutral glyph).
2. **State** — the active column shows direction, the arrow pointing at the *result*, not the action, under one app-wide convention.
3. **Announcement** — `aria-sort="ascending|descending|none"` on the sorted `th`. Zero occurrences repo-wide **(verified)**.

On a 12-row table sorting is pure client state. Stability matters — equal values must not reshuffle — with year as tiebreaker, so the order is always nameable **(inferred)**.

---

## 5. Conditional coloring at density

| Mode | Entries | Encodes |
|---|---|---|
| `static` | 62 | Category — velocity amber, batted-ball orange, deception violet |
| `plus` | 6 | Magnitude vs 100 (`sos` alone has a 95/105 band) |
| `inverted_value` | 1 | `totalRE`, negative is good |

62 of 69 metrics color by *what the number is about*, not *how good it is* **(verified)**. Defensible — category color turns a 34-column row into scannable blocks — but it must be a stated choice, because a reader trained on the six plus-stats reads amber and orange as judgments.

`getCellColor`'s `plus` branch compares strictly against `high ?? 100` / `low ?? 100`, so exactly 100 falls to neutral — the registry's only expression of uncertainty **(verified)**. Extending that band to the other five would stop 101 reading as a win. Two bounds: color may never be a distinction's sole carrier (WCAG 1.4.1), so at 12px on `zinc-950` the numeral must work in greyscale **(documented)**; and `higherBetter`, which would generalize coloring, sits on 18 entries with **no consumer**, while `PercentileTab.tsx` keeps its own direction list **(verified)**.

---

## 6. The totals row

`calcTotalsFromRegistry` builds the career line by dispatching on `TotalsStrategy`: 48 `avg`, 15 `sum`, 2 `max`, 2 `none`, 1 `ip`, 1 `totalRE`.

**Presentational.** The row is emitted inside `<tbody>` by an inline IIFE with a heavier top border. Visually a summary; structurally a data row, so it sorts, exports and is announced as one. `<tfoot>` exists for this **(documented)**.

**Arithmetic.** `'avg'` computes `sum / vals.length` — an unweighted mean of ratios, so a 12-pitch September and a 3,000-pitch season contribute equally to career K% **(verified)**. Two cousins were already fixed (career max EV/Velo averaged not maxed; OPS summed not averaged): the vocabulary is under-specified, not misapplied. The missing member is a weighted mean, `sum(value × n) / sum(n)`, and `pitches`/`count` already sits in all three groups as the weight column. Which weight a rate deserves is `Li/metric-governance/09`'s call; Cas's claim is narrower: **the registry cannot express the question.**

---

## 7. Two things density breaks, and both are honesty problems

**Compact labels cost the tooltip.** `{ k, l }` overrides let arsenal print `Velo`, `Max`, `Spin`, `EV` rather than `Avg Velo`, `Max Velo`, `Avg Spin`, `Avg EV` — a real win at 19 columns. But `OverviewTab` renders `<Tip label={c.l} />` and `getTip` resolves by string, while the registry's `tip` is keyed by `k`; the renamed columns miss it, and `lib/glossary.ts` compensates with four byte-identical duplicates in a 92-entry hand-maintained map **(verified)**. `Tip` already accepts `col`; `col={c.k}` restores registry tips and deletes the duplicates. Abbreviation is honest only when expansion is one hover away.

**The sample-size column lies.** Traditional and advanced carry `pitches`, arsenal carries `count` — the coverage affordance `context/triton-context.md` demands, every row stating its n. But Lahman-only (pre-Statcast) seasons are built with `pitches: 0`, `'2b': 0`, `'3b': 0`, while every genuinely unavailable field in the same object correctly gets `'—'` **(verified)**. The rows most likely to be misread announce a sample size of zero plus two fabricated counts, and those zeros flow into the career totals.

Mobile compounds both: `MobileDataTable`'s `pinned`/`format`/`colorFn` is a second, incompatible column model, and which 6 of 34 columns a phone shows belongs in the registry as a `GROUP_COLUMNS` variant, not there **(inferred)**.

---

## 8. What Triton should do, in order

1. **Make `formatMetric` apply `FormatSpec.digits`**; add `stripLeadingZero`.
2. **Fix the three fabricated zeros** at the Lahman merge (`pitches`, `2b`, `3b` → `'—'`). The n column is the honesty mechanism.
3. **Pass `col={c.k}` to `Tip`**; delete the four duplicate `METRIC_TIPS` pairs.
4. **Pin `thead` and the first column in `OverviewTab`** with opaque backgrounds, per `research/sequencing`; add `scope="col"`.
5. **Swap `font-mono` for `tabular-nums`** across dashboard tables.
6. **Add `totals: 'weighted_avg'` with a `weightKey`**; move rate metrics onto it, weights chosen with Li.
7. **Add column sorting** with `aria-sort`, year as tiebreaker.
8. **Adopt the registry in a third consumer** — `LeaderboardRenderer` — deleting its private formatter.

**Anti-recommendation — do not begin by building a "proper data grid" (sorting, filtering, resizing, column-picking, or installing TanStack Table to get them).** The most requested-looking work here, wrong on three grounds. **Wrong layer:** every defect above is in the *cell*, not the *grid* — a resizable sortable table renders the same fabricated `0`, unweighted average and unformatted float, with more chrome. **Wrong direction:** a grid library owns column definitions, so adopting one creates a *third* column model beside `GROUP_COLUMNS` and `MobileDataTable`'s `Column`, when the problem is that the existing model has two consumers, not fifty-six. **Wrong cost:** items 1–3 are twenty-odd lines against a 12-row table with no performance problem; a migration is days, and buys interaction this surface has lived without.

**Highest-leverage next action:** in one commit, make `formatMetric` honor `digits` and replace the three hardcoded Lahman zeros with `'—'` — the smallest change that makes the registry load-bearing and stops the table asserting a sample size it doesn't have.

---

## Sources

1. W3C WAI — [Tables Tutorial](https://www.w3.org/WAI/tutorials/tables/) — `scope`/header association; §3.
2. WAI-ARIA APG — [Table Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/) — the `aria-sort` contract §4 requires.
3. MDN — [`aria-sort`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-sort) — values, one-sorted-column rule; §4.
4. MDN — [`font-variant-numeric`](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric) — `tabular-nums` vs monospacing the cell; §2.
5. Tailwind — [font-variant-numeric](https://tailwindcss.com/docs/font-variant-numeric) — the class replacing `font-mono`; §8.5.
6. MDN — [`position`](https://developer.mozilla.org/en-US/docs/Web/CSS/position) — sticky paint order; §3's opaque-background rule.
7. MDN — [`<tfoot>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/tfoot) — why §6's totals row is structurally a data row.
8. Butterick — [Alternate figures](https://practicaltypography.com/alternate-figures.html) — tabular figures as table default; §2.
9. NN/g — [Data Tables: Four Major User Tasks](https://www.nngroup.com/articles/data-tables/) — the tasks §1's table derives from.
10. NN/g — [Sticky Headers](https://www.nngroup.com/articles/sticky-headers/) — the viewport-cost caveat qualifying §3.
11. Carbon — [Data Table usage](https://carbondesignsystem.com/components/data-table/usage/) — density tiers, sort states; §1, §4.
12. Chen Hui Jing — [Table Design Patterns](https://www.smashingmagazine.com/2019/01/table-design-patterns-web/) — pin-a-column; §3, §7.
13. W3C — [WCAG 2.2 §1.4.1 Use of Color](https://www.w3.org/TR/WCAG22/#use-of-color) — color not the sole carrier; bounds §5.

**Triton-internal evidence (repo read 2026-08-13; no production query).** `lib/metricRegistry.ts` (702 lines), **69** `MetricDef` entries — colors **62 static / 6 plus / 1 inverted_value**; totals **48 avg / 15 sum / 2 max / 2 none / 1 ip / 1 totalRE**; `higherBetter` on **18**. `GROUP_COLUMNS` `:564-590` = **25**/**34**/**19** columns covering 68 of 69 keys (orphan `puPct`); `{k,l}` overrides `:584-587`. `formatMetric` `:608-615` returns `String(value)` + `%` only; `digits` read solely at `:665-667`/`:672-674`. `getCellColor` `:618-640` compares strictly vs `high ?? 100`/`low ?? 100`; `sos` `:448` the only `105/95` band, `totalRE` `:425` the only inverted. `calcTotalsFromRegistry` `:663-669`: `sum / vals.length`. Consumers: `grep -rn metricRegistry` → **2** files (`lib/glossary.ts:2`, `components/dashboard/OverviewTab.tsx:9`) against **56** containing `<table`. `OverviewTab.tsx`: `text-[12px]` `:183`, `overflow-x-auto` `:182`, cells `font-mono text-right first:text-left` `:195`, no `sticky`, totals row an IIFE in `<tbody>` `:201-213`, `<Tip label={c.l} />` `:187`; Lahman merge `:29` `pitches: 0`, `:31` `'2b': 0, '3b': 0` beside `ba/obp/slg: '—'` `:32`. Tip chain `lib/glossary.ts:129`; `METRIC_TIPS` **92** entries with 4 identical pairs, `:49-66`. Rival formatter `components/producer/renderers/LeaderboardRenderer.tsx:13-14` (`toFixed(3).replace(/^0/,'')` else `toFixed(1)`), `tabular-nums` `:48,:104`. Sticky correct in 6 files, e.g. `PitchLogTab.tsx:83,98`, both axes at `app/(research)/sequencing/page.tsx:214,228`. `aria-sort` and `scope="col"`: **0** across `app/` + `components/`; **11** files carry sort state, none `OverviewTab`. `higherBetter` outside the registry: only `PercentileTab.tsx:330-337` and a parameter at `lib/leagueStats.ts:1288`. `tabular-nums` in 3 further files, e.g. `app/(data)/data/trackman/page.tsx:117`. Career max-EV/Velo and OPS fixes from the 2026-08-11/12 packet.
