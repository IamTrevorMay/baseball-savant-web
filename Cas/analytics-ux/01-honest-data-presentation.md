---
title: Honest Data Presentation — How a Correct Number Becomes a Lie on Screen
domain: analytics-ux
tags:
  - honest-presentation
  - sample-size
  - coverage
  - provenance
  - denominators
  - missing-data
  - metric-registry
  - stuff-plus
sources_reviewed: 13
last_updated: 2026-08-13
---

# Honest Data Presentation — How a Correct Number Becomes a Lie on Screen

> Anchor doc for `analytics-ux/`. Grades: **(verified)** read at `file:line`; **(documented)** vendor
> docs; **(inferred)** mechanism; **(cargo-cult)** unsupported. No production query was run.

## TL;DR

- **Every aggregate makes four claims — n, coverage, provenance, comparison population — and Triton's surfaces state at most one.** (verified)
- **The Stuff+ outage was a presentation failure as much as a pipeline one.** Coverage went 99.5% → 90% → 18% → 4% → 0%, Apr–Aug 2026; the dashboard drew a smooth line throughout. (verified)
- **A coverage check existed during the outage and was wired to hide it.** `lib/pitcherStats.ts:292` swaps in a *different metric* below 50% coverage, under the same "Stuff+" header. (verified)
- **Three surfaces average `stuff_plus` three ways under one label** — source switch, per-pitch blend, drop-nulls-and-vanish — disagreeing most when coverage was worst. (verified)
- **Triton shows a sample size in one place and it is the wrong n for the cell beside it.** Arsenal `#` counts all pitches of a type; `Stuff+` averages only non-null ones. (verified)
- **The right denominator was computed nightly, free, all season, unread**: `stuff_plus_n = COUNT(p.stuff_plus)`. (verified)
- **`lib/metricRegistry.ts` has 69 entries and eight fields, seven presentation, none about trust.** (verified)
- **Normalized metrics camouflage missingness better than raw ones** — any subset of a 100-centred stat re-centres on 100, so plus-stats need a visible n most and have it least. (inferred)
- **Missing inputs render as plausible values.** `PARK_FACTORS[team]?.basic || 100` yields a neutral park for an unmatched key (`ARI` vs `AZ`), inflating Arizona wRC+ ~1%. (verified)
- **The benchmark line is a mean labelled a median** — `league_averages` documented as a 50th percentile, implemented with `AVG()`. (verified)
- **"Grey out below n = 100," with no reliability estimate for that metric, is cargo-cult honesty.** (cargo-cult)
- **The cheapest honest surface is a denominator, not an error bar.** (inferred)

---

## 1. The four claims

| Claim | Question | Cost of silence |
|---|---|---|
| **n** | How many rows? | A two-start window reads like a season |
| **Coverage** | What fraction of rows that *should* have contributed did? | A shrinking denominator renders as a trend |
| **Provenance** | Which source and code path? | A metric swap reads as a performance change |
| **Population** | Compared to whom? | "108" vs which pool? |

Coverage and provenance cannot be reconstructed by a reader — nothing rendered recovers *what fraction of rows were NULL* or *which code path ran*. Those are Triton's two drops. Intervals: `04-uncertainty-visualization.md`; comparison pool: `09-comparative-display-benchmarks.md`.

---

## 2. The outage, read as a presentation bug

`pitches.stuff_plus` decayed to zero coverage over four months: a nightly `UPDATE` crossed the 8s `authenticator` statement timeout and failed with a bare `console.error` while the cron reported success (`planning.md:37-44`). The pipeline half is `Jo/data-quality/07-null-semantics-missingness.md`. Cas owns why nobody saw it — three properties held at once:

| Property | Mechanism |
|---|---|
| `AVG()` skips NULLs | The mean of survivors is a valid mean of *something*, not of the season |
| Plus-stats re-centre | Any subset of a 100-centred metric averages near 100, so the value barely moved |
| No denominator on screen | Nothing rendered the count the average was taken over |

The combination is worse than any part: a raw metric losing coverage drifts visibly, a **normalized** one does not, because normalization is what makes any subset resemble the population. It generalizes to any surface averaging a nullable column over a user-chosen window — deception is 2017+, MiLB 2023+, IR/IRS NULL at or before 1970, all legitimate NULL regions that render identically to an outage. Cell-level separation: `02-null-zero-unknown-ui.md`.

---

## 3. The provenance failure: a coverage check wired backwards

```ts
// lib/pitcherStats.ts:292
const stuffSrc = dbStuffPlusVals.length > pitches.length * 0.5 ? dbStuffPlusVals : clientStuffVals
```

Above 50% coverage the arsenal table shows database Stuff+; below it, the table silently switches to `stuff_rv` — a client-computed z-score (`lib/leagueStats.ts:1176`), a **different metric on a nominally similar scale** — while header, tooltip and colour rule stay identical. So when coverage crossed 50% between May (90%) and June (18%), the dashboard changed what it measured, and the only visible evidence was that the number stayed plausible. The check that could have raised the alarm was the mechanism that suppressed it. **A fallback without a provenance badge is a lie with a fail-safe.** (verified)

Three paths, three policies, one label:

| Surface | Policy | At 18% coverage |
|---|---|---|
| `lib/pitcherStats.ts:292` | All-or-nothing switch at 50% | Shows `stuff_rv`, labelled Stuff+ |
| `app/api/pitcher-outing/route.ts:168-171` | Per-pitch coalesce | Averages the two metrics **together**, row by row |
| `components/mobile/MobilePlayerDashboard.tsx:79,107` | Drop nulls, no fallback | Averages 18% of pitches; hides the card at 0% |

Desktop, mobile and the outing API would have printed three different "Stuff+" values for one pitcher on one day. The coalesce is worst: one integer blending two scales, which no n can describe. (verified)

**Rule.** A metric with more than one computation path must carry the path. PROV-O formalizes the triple; the practical minimum is a glyph — `Stuff+ · db` vs `Stuff+ · est`. (documented)

---

## 4. n is not n

`GROUP_COLUMNS['pitcher:arsenal']` puts `count` (label `#`) near the left and `stuffPlus` at the far right of the same row (`lib/metricRegistry.ts:586-590`). Readers assume `#` is the sample behind the row. It is not: `count: pitches.length` is all pitches of that type, while `stuffPlus` averages `stuffSrc`, whose length is unrelated. In June a row could read `# 412` beside a Stuff+ over ~74 rows — or over 412 rows of a *different* metric, per §3. (verified)

> **A sample size is honest only if it is the denominator of the cell beside it.** A row-level n spanning columns with different missingness converts an unknown into a wrong known.

Per-cell denominators are cheap: the count is computed wherever the average is, and at season level it is already materialized nightly as `stuff_plus_n = COUNT(p.stuff_plus)::int` (`scripts/create-materialized-views.sql:105,323,374`) and read by nothing — the instrument exists, unwired at both ends. (verified) Density mechanics: `07-dense-table-design.md`.

---

## 5. The registry knows how to colour a number, not whether to show it

`MetricDef` has eight fields — `key`, `label`, `unit`, `format`, `color`, `totals`, `higherBetter?`, `tip?` (`lib/metricRegistry.ts:18-27`). Seven are presentation; **none describes when the number is meaningful.** (verified)

| Missing field | Carries | Buys |
|---|---|---|
| `sourceColumn` | The nullable column averaged | Auto-derived coverage |
| `minN` | Suppress or de-emphasize below this | Small-sample discipline |
| `provenance` | Which code path produced it | §3's badge |
| `nullMeans` | Not-applicable vs not-covered vs unknown | `02-null-zero-unknown-ui.md` |

Only **9 of 69** registry keys join `reportMetrics.METRICS` (registry camelCase, SQL map snake_case, no join key), so 87% of the presentation layer has no programmatic link to how its number is computed; **67 of 69** are absent from `docs/VARIABLES.md`, so the glossary cannot supply provenance either. (verified) Honesty is therefore per-call-site today — which is how §3's three policies happened. **A registry-level coverage affordance is the only version that scales**, since adding a metric is already one registry entry and nothing else. (inferred)

---

## 6. Defaults that manufacture plausibility

**Park factors.** `PARK_FACTORS[row.team]?.basic || 100` appears four times in `app/api/scene-stats/route.ts` (`:136, :398, :1098, :1671`). An unmatched key — `ARI` where the table holds `AZ` — yields a neutral park indistinguishable from a genuine one, inflating Arizona hitters' wRC+ ~1%; `|| 100` also swallows a legitimate `0`. Honest form: `?? undefined`, render `—`. (verified)

**A mean labelled a median.** `league_averages` is documented as "50th-percentile benchmarks" (`CLAUDE.md:153`) and implemented with `AVG()`; the DDL comment (`scripts/create-league-averages.sql:36`) correctly says "Mean of the metric." Those differ materially on skewed distributions, and a `league_percentiles` table with true nearest-rank breakpoints exists, unused. Which benchmark is right is Li's call; Cas's is narrower — **the label must match the computation.** (verified)

**Line continuity.** Plotly's `connectgaps` and Datawrapper's "connect all points" both default to a visible break, treating connection as deliberate. Triton pre-aggregates before plotting, so a 4%-coverage month yields a *present, plausible point* — pre-aggregation defeats a library's honest default without touching chart config. (documented)

---

## 7. The minimum honest surface

Not error bars, not a redesign. Four affordances, increasing cost: **denominator** (the count behind this cell); **coverage ratio** (that count over the count that should have contributed — one division, and the only one that catches §2 on day one); **provenance mark** (one glyph); **suppression threshold** (below some n, render `—` with a reason).

The last is where cargo-cult creeps in: a uniform "n ≥ 100" looks rigorous and encodes nothing, since stabilization points differ per metric by an order of magnitude and deriving them is `Li/statistical-inference/`. Ship the first two first. (inferred)

---

## 8. What Triton should do, in order

1. **Label the fallback.** Return a provenance flag from `lib/pitcherStats.ts:292`, render it on the Stuff+ cell. One afternoon; removes the mechanism that hid a three-month outage.
2. **Unify the three policies** on *drop nulls, always report n, never substitute a metric*; delete the per-pitch coalesce at `app/api/pitcher-outing/route.ts:168-171`, unreportable by construction.
3. **Add `sourceColumn` + `minN` to `MetricDef`** — optional, no migration — so one helper returns `{ value, n, coverage }` for any metric.
4. **Render coverage where it already exists**: surface `stuff_plus_n` before building anything new.
5. **Kill the plausible defaults.** `|| 100` → `?? undefined` → `—`; fix the `league_averages` label or repoint it at `league_percentiles`.
6. **Add a golden-file test** that a 20%-coverage fixture renders an indicator, not a bare number — `Cas/testing-data-systems/01-testing-strategy-data-apps.md`.

**Anti-recommendation: do not add a global "data quality" banner.** Three independent grounds. *Granularity* — the outage was one column of one metric; a page-level banner cannot say which cell is affected. *Provenance* — a banner reports data state, but §3's failure was a code-path change with intact data; no data-quality monitor would have fired. *Behaviour* — a persistent, usually-irrelevant warning trains the exact blindness it exists to prevent, the dynamic that let a red test suite run 53 days. The signal must live in the cell.

**Highest-leverage next action:** add the provenance flag at `lib/pitcherStats.ts:292` and render it — the smallest change that makes the platform's defining incident visible where it happened.

---

## Sources

1. Datawrapper — [Missing data in line charts](https://academy.datawrapper.de/article/321-patchy-data) — gaps as the honest default; §6.
2. Datawrapper — [Empty cells shown as zeros](https://academy.datawrapper.de/article/271-my-empty-cells-get-displayed-as-zeros-in-tooltips) — a vendor treating null-as-zero as a bug, not taste.
3. Plotly — [scatter reference (`connectgaps`)](https://plotly.com/javascript/reference/scatter/) — the knob Triton's pre-aggregation bypasses, in Triton's own chart layer.
4. Vega-Lite — [Impute](https://vega.github.io/vega-lite/docs/impute.html) — the cost of explicit rather than incidental gap-filling.
5. Hullman & Gelman — [Theories of Graphical Inference](https://hdsr.mitpress.mit.edu/pub/w075glo6/release/1) — why an interface making any window viewable owes an inferential frame.
6. Wikipedia — [Misleading graph](https://en.wikipedia.org/wiki/Misleading_graph) — §1's taxonomy; "shrinking denominator" is absent from it.
7. Wikipedia — [Survivorship bias](https://en.wikipedia.org/wiki/Survivorship_bias) — the general form of averaging over surviving rows.
8. Wikipedia — [Missing data](https://en.wikipedia.org/wiki/Missing_data) — MCAR/MAR/MNAR; Triton's is MNAR, making §2 an accuracy problem too.
9. W3C — [PROV-O](https://www.w3.org/TR/prov-o/) — entity/activity/agent, the formal shape of §3's badge.
10. UK Analysis Function — [Communicating quality, uncertainty and change](https://analysisfunction.civilservice.gov.uk/policy-store/communicating-quality-uncertainty-and-change/) — a statistics office publishing numbers of known limited quality; §7's nearest standard.
11. FanGraphs — [Sample Size](https://library.fangraphs.com/principles/sample-size/) — why per-metric stabilization defeats §7's global threshold.
12. MLB — [Statcast glossary](https://www.mlb.com/glossary/statcast) — upstream definitions and coverage caveats for §3's provenance strings.
13. Carbon Design System — [Data visualization](https://carbondesignsystem.com/data-visualization/getting-started/) — missing-value states, which `08-loading-empty-error-states.md` builds on.

**Triton-internal evidence (repo read 2026-08-13; no production query).** Stuff+ decay 99.5% (Apr) → 90% → 18% → 4% → 0% (Aug 2026), 8s `authenticator` `statement_timeout` failing via `console.error` while the cron reported success: `planning.md:37-44`, `:304`. Source switch `lib/pitcherStats.ts:289-295` (threshold `:292`); fallback `computeStuffRV` `lib/leagueStats.ts:1176`; `count: pitches.length` beside `stuffPlus`, `:298`/`:308`. Per-pitch coalesce `app/api/pitcher-outing/route.ts:162-174`. Mobile drop-nulls `components/mobile/MobilePlayerDashboard.tsx:79,107,141,152`, card hidden `:443-446`. Registry `lib/metricRegistry.ts`, 702 lines, **69** `MetricDef` entries, fields `:18-27`; `pitcher:arsenal` `:586-590` pairs `count` (`:105-111`) with `stuffPlus` (`:549`); **9 of 69** keys join `reportMetrics.METRICS`, **67 of 69** absent from `docs/VARIABLES.md`. Park default `?.basic || 100`, `app/api/scene-stats/route.ts:136,398,1098,1671`; `PARK_FACTORS` in `lib/constants-data.ts`, team-keyed, one frozen 2024 vintage for 2015–2026. Benchmark: `CLAUDE.md:153` says 50th percentile, implementation `AVG()` throughout `scripts/create-refresh-league-averages.sql`, DDL comment `scripts/create-league-averages.sql:36` "Mean of the metric"; unused breakpoints `scripts/create-league-percentiles.sql`. Unread denominator `stuff_plus_n = COUNT(p.stuff_plus)::int`, `scripts/create-materialized-views.sql:105,323,374`. `pitches` ≈ 8,877,621 rows / 9,711 MB (packet, 2026-08-12). The 53-day red suite in §8 is from `Cas/testing-data-systems/01-testing-strategy-data-apps.md`, not re-measured.
