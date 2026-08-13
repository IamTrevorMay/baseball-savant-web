---
title: Comparative Display & Benchmarks — Naming the Crowd You're Beating
domain: analytics-ux
tags:
  - benchmarks
  - plus-stats
  - percentile-bars
  - rank-badges
  - comparison-population
  - reference-lines
  - cross-level-display
sources_reviewed: 11
last_updated: 2026-08-13
---

# Comparative Display & Benchmarks — Naming the Crowd You're Beating

> Grades: **(verified)** read at `file:line`; **(documented)** vendor/standards docs; **(inferred)**
> mechanism; **(cargo-cult)** repeated, unsupported. No production query was run.

`Li/statistical-inference/10-benchmarking-percentiles.md` owns which estimator is correct;
`Li/metric-governance/07` owns who qualifies. This doc owns the last inch: what the screen must say so
the number the reader sees is the number Li computed.

## TL;DR

- **A comparison is only honest if its population is visible. Triton has four comparison surfaces and names the population on none.** **(verified)**
- **`league_averages` fully describes its own population — `n_qualified`, `leader_value`, `qual_floor`, `stddev`, keyed `(season, level, role)` over 1,806 rows — and the API strips all of it** (`route.ts:64` selects `n_qualified`; `:93` returns `{ value, stddev }`). **(verified)**
- **The benchmark is a mean wearing a median's label** — documented 50th-percentile, implemented `AVG()`, so on right-skewed rates the heatmap's neutral colour sits above the true midpoint. **(verified)**
- **The floor is leader-proportional (`AB ≥ max(25, 0.20×AB_leader)`), so the population shifts mid-season** — a plus-stat can move because someone else got hot. MLB's own qualifier is fixed per team game. **(verified / documented)**
- **The comparison is already encoded as colour and still never labelled:** `ColorSpec` mode `plus` colours 6 metrics against a hardcoded 100 (`metricRegistry.ts:628-629`; 4 of 6 explain it in a tooltip), and three heatmaps centre a diverging scale on the league mean at ±3σ, silently blending the SP and RP pools when `role=pitching`. **(verified)**
- **One component ships both conventions: `PercentileTab`'s movement view prints `n=…`, its rankings view a bar and badge with nothing.** `teamStats` computes rank *and* total, then renders only `(3rd)`. **(verified)**
- **A 99th-percentile badge over 453 pitchers rests on ~4–5 observations, and the bar width repeats that overprecision.** Band the tails. **(verified / inferred)**
- **Mixing MLB and MiLB on one axis is a category error the UI can render today**; this surface enforces `Li/metric-governance/08`'s prohibition via `baseline.crossLevelComparable`. And `_plus` metrics, excluded from `league_averages` because they self-normalize, sit beside benchmarked ones on the same row with different provenance and one visual language. **(documented / verified)**

---

## 1. What a comparison claims

A plus-stat, a percentile bar, a rank badge and a benchmark line are one claim in four costumes: *this
value, against that group.* Five commitments compress into the pixels; leave one implicit and the claim
is unfalsifiable — the reader cannot tell whether it moved because the player changed or the crowd
did.

| Commitment | Reader's question | Triton's on-screen answer |
|---|---|---|
| **Population** | Compared to whom? | none |
| **Size** | How many of them? | `n=…` on 1 of 8 `PercentileTab` views |
| **Statistic** | Mean, median, breakpoint? | none, and mislabelled (§3) |
| **Vintage** | Computed when? | none; `updated_at` exists, `staleTime: Infinity` |
| **Scale** | What is 100 / 50%? | 4 tooltips of 6 `plus` metrics |

Savant is the counter-example: its percentile leaderboard states its qualifier (2.1 PA per team game
for batters, 1.25 for pitchers) *on the page*, beside the bars. **(documented)** The bar is not the hard
part; the sentence under it is.

---

## 2. The four surfaces

| Surface | Mechanism | Population used | What it says about it |
|---|---|---|---|
| **Plus-stat cell** | `ColorSpec` `plus`, threshold 100 | the metric's own unversioned baseline | 4 of 6 tooltips say "100 = league avg" |
| **Percentile bar + badge** | `PercentileTab` rankings | `league_percentiles` breakpoints | nothing — no n, season, role |
| **Rank badge** | `teamStats` `(3rd)` | 30 MLB teams | drops the `of 30` it holds |
| **Benchmark / heatmap midpoint** | `useLeagueBaseline` → `mean ± 3σ` | `league_averages`, roles pooled | nothing; API discards `n_qualified` |

Row four does what the others don't: it makes the comparison **the colour scale itself**. Every cell of
a strike-zone heatmap is coloured against a league mean the reader was never told about, over a
population they cannot see, at a vintage they cannot check. It looks like a description of the pitcher;
it is a difference from an unnamed crowd.

---

## 3. The mean labelled a median

`CLAUDE.md` and `docs/VARIABLES.md` call `league_averages` "50th-percentile benchmarks"; the refresh
computes `AVG()` with `STDDEV_SAMP()`. On right-skewed rates the mean sits above the median, so every
above/below decision against it — the heatmap's neutral colour above all — is wrong in a **known
direction**. **(verified)** The arithmetic is Li's; the *label* makes it a display bug. Three fixes,
routinely confused for one:

| Fix | Cost | Buys |
|---|---|---|
| Relabel the UI "league mean" | one string | the screen stops lying today |
| Emit `median_cont` beside `mean_val` | one SQL line (Li §8) | the choice becomes visible and selectable |
| Swap the benchmark to the median | rebaselining event | needs a version stamp; every plus-stat shifts |

Row 1 first. **A relabel is not a workaround but the correct minimal repair**: the number was never
wrong, only its name. **(inferred)**

---

## 4. The population that moves

Triton's floor is leader-proportional: hitters `AB ≥ max(25, 0.20 × AB_leader)`, SP/RP
`IP ≥ max(5, 0.20 × IP_leader_for_role)`, SP being ≥3 games of 50+ pitches. **(verified)** MLB's own
rate-stat qualifier is `3.1 PA` / `1.0 IP` per **team game** — indexed to schedule, not to a person.
**(documented)** That bites twice on screen:

- The floor **rises when the leader gets hot**, so players drop out mid-season and everything built on
  the pool moves for reasons no player caused — a selection filter that tightens over time.
- It is displayable *now*: `qual_floor` and `leader_value` are stored, so a tooltip reading
  `MLB SP, 2026 · n=142 · IP ≥ 27.4 (20% of 137.0)` needs no new computation.

Compounding it, `/api/league-baseline` resolves `role=pitching` to `['SP','RP']` and returns one
`n_qualified`-weighted mean. The weighting is thoughtful; the result is still **a midpoint of a
population that does not exist** — no pitcher is 60% starter. A reliever's heatmap is compared partly
against starters and nothing says so. Render the role-specific baseline, or label the blend. **(inferred)**

---

## 5. Tail resolution

453 distinct MLB pitchers threw in August 2026, so a 99th-percentile breakpoint is about the 4th-or-5th
largest observation; over a 60-player SP pool it *is* the maximum. **(verified)** The badge renders two
confident digits over that and the bar width encodes it again. The rule follows from the estimate, not
from taste: **resolution of the encoding must not exceed resolution of the estimate.**

| Region | Estimate quality | Render |
|---|---|---|
| p10–p90 | many observations per breakpoint | integer percentile + bar |
| p90–p99 / p1–p10 | 1–5 observations | band (`90+`, `95+`), bar clipped at the edge |
| below the min-n gate | none | raw value + `7th of 22`, never a percentile |

Value-suppressing uncertainty palettes give the principle: as certainty falls, **collapse the visual
channel's range** rather than let a saturated colour imply precision the estimate lacks.
**(documented)** Cheapest dark-theme version: desaturate the badge fill below the gate.

---

## 6. The comparison the UI must refuse

`Li/metric-governance/08-cross-level-comparability.md` classifies MLB↔MiLB Stuff+ as a **category
error, not an approximation**: the AAA value is an unbiased estimate of a *different quantity*. Its
instruction here is explicit — **structural separation, never a footnote**: separate panels, separate
axes, a level chip on every row. **(documented)** Enforceable only if the display can read the fact, so
consume the fields Li named rather than inventing parallel ones:

```ts
baseline: { …, versioned: boolean, crossLevelComparable: boolean }
coverage: { nullMeans: 'zero' | 'not_measured' }
stabilization?: { n: number; unit: 'pitches' | 'BF' | 'PA' | 'IP' }
```

One guard — `crossLevelComparable === false` and >1 level in the series ⇒ refuse a shared axis — turns
a judgement call into a lint rule. The other two carry the rest: `nullMeans === 'not_measured'` stops a
missing benchmark rendering as zero on a diverging scale, where zero reads *below average*, not absent;
`stabilization.n` decides whether §5 shows a percentile or a rank-of-n. **(inferred)**

---

## 7. One component, four surfaces

Every gap above is the same missing object. Define it once beside the number, not per call site:

```ts
type PopulationRef = {
  label: string        // "MLB SP · 2026"
  n: number            // n_qualified
  statistic: 'mean' | 'median' | 'breakpoint'
  floor?: string       // "IP ≥ 27.4 (20% of 137.0)"
  asOf: string         // updated_at — the vintage
  level: 'MLB' | 'MiLB'
}
```

Render it three ways from one source: a **subscript** under the value (`n=142`), a **tooltip** with the
full sentence, and an **absence state** — null `PopulationRef` ⇒ withhold the comparative encoding and
show the raw value alone. That last is the real product decision: today a missing baseline degrades to
*no colour* on a heatmap and *nothing* on a bar, both of which read as "fine." **A comparison with no
known population should not render as a comparison.** **(inferred)**

Two constraints ride along, since `plus` mode is colour-only: WCAG 1.4.1 forbids colour as the sole
carrier of information (add an above/below glyph or the delta in text), and 1.4.11 wants 3:1 contrast
for bar fills and benchmark rules on `zinc-900` — a dashed `zinc-600` does not clear it. **(documented)**

---

## 8. What Triton should do, in order

1. **Stop discarding `n_qualified`:** return it from `/api/league-baseline`, add it to
   `LeagueBaseline`. One line each; every fix below depends on it.
2. **Relabel the benchmark "league mean" wherever it is called a median** — `CLAUDE.md`,
   `docs/VARIABLES.md`, tooltips. The number stays; the sentence becomes true.
3. **Print the denominator you already have:** `teamStats` → `(3rd of 30)`, and `PercentileTab`'s
   rankings view gets the `n=…` its movement view already has.
4. **Add a `PopulationRef` tooltip to the `plus` cells and the heatmap colourbar**, from `qual_floor` /
   `leader_value` / `updated_at` — where the leader-proportional floor stops being invisible.
5. **Band the tails:** above p90 / below p10 render `90+`, not `94`; below the min-n gate render
   `7th of 22` and no bar.
6. **Add the cross-level guard** on `baseline.crossLevelComparable`, with a test that a mixed MLB/MiLB
   series throws rather than renders.
7. **Withhold the comparative encoding when `PopulationRef` is null**, and give `plus` colouring a
   redundant non-colour channel.

**Anti-recommendation — do not fix this with a methodology page and a link to it.** Obvious, cheap,
wrong on three independent grounds. **Wrong locus:** the defect is that a *specific* number on a
*specific* screen cannot name *its own* population — varying by season, level, role and metric — and a
static page describes only the scheme, never the instance. **Wrong latency:** the reader forms the
belief the moment the colour renders; a link is consulted afterwards, if ever. **Wrong failure mode:**
the page drifts from the implementation and then certifies the wrong thing — exactly how "50th
percentile" survived in `CLAUDE.md` over an `AVG()`. Documentation is the right home for the scheme and
no home at all for the instance.

**Highest-leverage next action:** return `n_qualified` from `/api/league-baseline` and render it under
the heatmap colourbar as `league mean · n=…`. Ten lines, and it kills the mislabel and the missing
denominator in one pass on the surface where the comparison is most invisible.

---

## Sources

1. [Statcast Percentile Rankings](https://baseballsavant.mlb.com/leaderboard/percentile-rankings) — percentile bars that state their qualifier on the page.
2. [MLB Glossary — Rate Stats Qualifiers](https://www.mlb.com/glossary/standard-stats/rate-stats-qualifiers) — the fixed per-team-game rule §4 contrasts with.
3. [FanGraphs Library — Stuff+/Location+/Pitching+](https://library.fangraphs.com/pitching/stuff-location-and-pitching-primer/) — the "100 = league average" convention and its implied population.
4. [Correll, Moritz & Heer — Value-Suppressing Uncertainty Palettes](https://www.domoritz.de/papers/2018-VSUPs-CHI.pdf) — collapse the channel's range as certainty falls; §5.
5. [Wilke — Visualizing Uncertainty](https://clauswilke.com/dataviz/visualizing-uncertainty.html) — a band around a benchmark rather than a hairline.
6. [Munzner — Visualization Analysis and Design](https://www.cs.ubc.ca/~tmm/vadbook/) — the population belongs to the *what*, not an annotation.
7. [WCAG 2.2 — Use of Color (1.4.1)](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) — why `ColorSpec` `plus` needs a non-colour channel.
8. [WCAG 2.2 — Non-text Contrast (1.4.11)](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) — the 3:1 floor for bar fills and rules.
9. [Datawrapper — line charts](https://www.datawrapper.de/blog/line-charts) — grey context series, labelled comparison lines.
10. [Wikipedia — Standard score](https://en.wikipedia.org/wiki/Standard_score) — plus-stats are z×15+100; the multiplier is a display convention.
11. [Wikipedia — Survivorship bias](https://en.wikipedia.org/wiki/Survivorship_bias) — a floor that tightens as the leader improves (§4).

**Triton-internal evidence (repo read 2026-08-13; no production query).** Population discarded:
`app/api/league-baseline/route.ts:64` selects `value, stddev, n_qualified`, `:74-90` uses `n_qualified`
only as a weight, `:92-94` returns `{ baseline: { value, stddev } }`; `lib/useLeagueBaseline.ts:22-25`
declares `LeagueBaseline { value, stddev }`, `:47` sets `staleTime: Infinity`; `:57-58` of the route
maps `pitching` → `['SP','RP']`. Benchmark line: `components/dashboard/LocationTab.tsx:210-211`,
`components/reports/TileViz.tsx:141-142` and `StrikeZoneHeatmapViz.tsx:213-214` all set
`zmin/zmax = baseline.value ∓ 3 * baseline.stddev`. Registry: `lib/metricRegistry.ts` holds **69**
`key:` entries (64 in `METRIC_REGISTRY`), **6** with `color.mode === 'plus'` — `:434, :441, :448, :538,
:545, :552`; `getCellColor` `:618-633` defaults `high`/`low` to **100** with no
population reference; only 4 tips mention it (`:450, :540, :547, :554`), not `commandPlus`/`rpcomPlus`.
`components/dashboard/PercentileTab.tsx:363-376` renders a bar plus badge with no n, `:420` sets
``nLabel = `n=${pool.n_qualified}` `` for movement. `lib/imagine/widgets/teamStats.ts:198-200` uses
`total` for colour, `:328` builds `rankText` from `ordinal(rank)` alone. `coverage.nullMeans`,
`stabilization` and `baseline.crossLevelComparable` are verbatim from
`Li/metric-governance/03-semantic-layers-metric-stores.md:162-175`. The 1,806 `league_averages` rows,
the documented-median/implemented-`AVG()` defect, the `_plus` exclusion, the leader-proportional
floor and the 453-pitcher August 2026 figure were measured centrally 2026-08-12/13 and are cited here,
not re-measured.
