---
title: Uncertainty Visualization — Drawing the Wobble Without Freezing the Reader
domain: analytics-ux
tags:
  - uncertainty-visualization
  - error-bars
  - confidence-bands
  - hypothetical-outcome-plots
  - quantile-dotplots
  - plotly
  - sample-size-display
  - broadcast-legibility
sources_reviewed: 14
last_updated: 2026-08-13
---

# Uncertainty Visualization — Drawing the Wobble Without Freezing the Reader

> Grades: **(verified)** read at `file:line` or grepped; **(documented)** vendor/published;
> **(inferred)** mechanism; **(cargo-cult)** repeated, unsupported. No production query this pass.
>
> **Boundary with Li.** Li owns *what claim an unstable number can bear*
> (`Li/statistical-inference/09-small-sample-communication.md`, `04-uncertainty-quantification.md`)
> and hands the pixels here. This doc treats Li's anti-recommendation — *no error bars on Stuff+
> before `baseline_version`* — as binding, and asks what may be drawn anyway.

## TL;DR

- **Triton renders 35 Plotly charts and zero uncertainty marks — no `error_y`, band, violin or box anywhere.** The starting state is silence, not bad error bars. **(verified)**
- **The obvious fix is blocked: at season n the Stuff+ sampling interval is ±0.30 against ≈0.5 of vintage bias — the bar would be smaller than the error it omits.** **(documented)**
- **That blocks one encoding, not the family** — denominators, detectable-difference bands and vintage seams assert no sampling distribution and are drawable today. **(inferred)**
- **Vintage bias is a level shift, not a width** — Feb–May 2026 rows carry +0.29 to +0.59, June/August 0.000, so the honest mark is a break in the line at the rescore date, not a fatter bar. **(documented)**
- **The error bar is the worst-performing standard encoding tested** — read categorically, ambiguous across four conventions, misread by experts; HOPs and quantile dotplots beat it at Triton's real question, "is he reliably above that one." **(documented)**
- **`RollingAverages.tsx:10` smooths over `min(25, n/4)` of the *filtered* set**, so the line's volatility is a property of the user's filter, and `:14` silently drops types below that window — uncertainty encoded backwards, twice. **(verified)**
- **The denominators exist and nothing reads them**: `stuff_plus_n` sits in two materialized views and no component, `MetricDef`'s 8 fields include no n — and on a transparent overlay, where a 1-px bar dies in compression, the denominator is the only mark that survives. **(verified / inferred)**
- **"Add error bars, they look rigorous" is the cargo-cult move** — a drawn interval reads as completed diligence, harder to walk back than an admitted gap. **(cargo-cult)**

---

## 1. What each encoding actually buys

| Encoding | Communicates | Fails at | Fit |
|---|---|---|---|
| Error bar (±SE/±CI) | one symmetric width | ambiguous; reads as a hard boundary | **poor** — blocked (§4) |
| Violin / density | full shape | fabricates a density at tiny n | poor at Triton's n |
| Confidence band / gradient | width over a continuum | the edge reads as a bound (fading avoids that); hides n changing along x | fair for rolling series |
| **Quantile dotplot** | outcome frequencies | needs ~20 dots of space | **good** — percentile view |
| **HOP** (animated draws) | ordering reliability | dead in print and on overlays | dashboard only |
| **Denominator glyph** | the sample itself | says nothing about spread | **best available now** |
| **VSUP palette** | value × confidence in one channel | needs a 2-D legend | good for zone heatmaps |
| **Detectable-difference band** | what the window *could* resolve | unfamiliar | **best for comparisons** |

The third column is the one that matters: each encoding is honest about *something*, and the question
is whether that something is what the reader is about to get wrong.

---

## 2. Why the error bar is the wrong default

Four problems, none fixable by drawing it better. **(documented)**

1. **Ambiguity.** ±1 SD, ±1 SE, ±95% CI and ±1 predictive SD are drawn identically; captions go unread.
2. **Categorical reading.** Correll & Gleicher's cliff effect — the whisker end is read as a hard
   in/out boundary, not a continuous fall in likelihood. Gradient and violin encodings reduced it.
3. **Expert failure.** Belia et al.: researchers who publish error bars misjudge what overlap implies
   and confuse the SE and CI cases.
4. **Within vs between.** Intervals around two means do not answer whether the two differ — and the
   comparison is almost always Triton's real question.

This makes the *bar* a poor carrier, not intervals wrong: move uncertainty into a channel the reader
cannot binarise — shading, dot frequency, motion.

---

## 3. Frequency framing: HOPs and quantile dotplots

Hullman, Resnick & Adar found animated **hypothetical outcome plots** — cycling through draws from the
estimate's distribution — beat error bars *and* violin plots at judging whether one quantity reliably
exceeds another; Kale et al. replicated it for trend judgement with untrained viewers. **Quantile
dotplots** (Kay et al.) do it statically: 20 dots, one outcome each. Both swap an *extent* judgement
for a *counting* one, and counting is what untrained readers do well. **(documented)**

Triton can use this in the percentile view, where the question is literally "is he above the pool";
HOPs animate, so they die on an overlay and in the newsletter's PNG.

**The catch:** every frequency framing needs a distribution, and Triton's is the one Li says is
mis-centred. Frequency framing is the right *encoding*; it does not fix the *quantity*.

---

## 4. Li is right, and it does not mean "draw nothing"

At full-season n the Stuff+ sampling interval is **±0.30** while unrecorded baseline-vintage bias is
**≈0.5** — a bar *narrower than the error it omits*, on the flagship metric, with all the authority a
drawn interval carries. **(documented)**

But the reflexive response — draw nothing until `baseline_version` ships — concedes too much: the
blocked object is specific, **a symmetric variance-only interval around a point estimate**. Three
other marks are drawable now, none asserting a sampling distribution.

| Draw this | Quantity | Why bias doesn't invalidate it |
|---|---|---|
| **`n=` / `G=` glyph** | the denominator | a count, not an inference |
| **Detectable-difference band** on a comparison | this window's MDE | a property of the design, not the calibration |
| **Vintage seam** on a time axis | where the baseline changed | it *is* the bias, located not sized |

The third is sharpest and most overlooked. Measured drift is **+0.29 to +0.59 for Feb–May 2026 rows,
0.000 for June/August** after the 2026-08-11 rescore: not a width, a **level shift at a known date**.
The defect is therefore not a missing error bar but *a line drawn across a discontinuity*. Break the
series and label a rule at the seam — cheaper than an interval, strictly more truthful. **(inferred)**

Povich: 149 pitches, deff 2–4, n_eff 37–75, MDE ≈2.5–3.5 against an observed 2.3. A CI on
each start invites eyeball overlap-testing, §2's fourth failure exactly. A band saying **this window
resolves ≈3 points; the move was 2.3** survives being uncalibrated — it describes what the chart can
see, not what the metric is.

---

## 5. Triton's surfaces, audited

| Surface | Shown | Hazard | Grade |
|---|---|---|---|
| 35 files rendering `<Plot>` | nothing | no `error_y`, band, violin or box in the repo — every chart reads as exact | (verified) |
| `RollingAverages.tsx:7,10,14` | nothing | window = `min(25, ⌊n/4⌋)` of the filtered set, so filtering to 40 pitches makes the line wigglier with no change in the pitcher; a type below that window returns `null` and vanishes; `<10` rows says "Not enough data", 10 draws a confident line | (verified) |
| Arsenal table | `count` column | on screen, drives nothing — no de-emphasis, no formatting change | (verified) |
| `PercentileTab.tsx:420` | `n=` | the platform's only sample size, and it is the *pool's* | (verified) |
| Producer / overlay panels | nothing | a live-pushed stat is Triton's most-viewed, least-qualified number | (verified) |
| `lib/metricRegistry.ts:17` | nothing | `MetricDef`'s 8 fields include no n, threshold or interval — no consumer *can* render one without per-call-site work | (verified) |

The pattern: **the denominators exist and nothing reads them** — `stuff_plus_n` in two materialized
views no component reads, `count` on screen changing nothing about its row, and strike-zone heatmaps
using one palette whether a cell holds 3 pitches or 300. Plumbing, not measurement:
hence a schema field, not a chart, at the top of §8.

---

## 6. Overlays: what survives compression

Broadcast output is 1920×1080, transparent, over live video, at variable bitrate, often re-encoded.
**Hairlines die** — a 1-px bar at streaming bitrate is gone, so a mark needs ≥3 px stroke or must not
be a stroke. **No hover** — every caveat living in a dashboard tooltip does not exist here. **Dwell is ~4
seconds** — a 2-D VSUP legend is unusable, a HOP animation actively harmful. **(inferred)**

What works is **type and opacity**: `104 · 73 P` at the value's own size, or the value dimmed below
threshold. An overlay carries a *licence*, not a *width* (`11-broadcast-overlay-legibility.md`): one
bit of uncertainty, the denominator.

---

## 7. Plotly 3.4 mechanics

What the installed version supports. `TileViz.tsx` builds single-trace charts, so a band roughly
doubles a tile's trace count — not the reason not to ship; that reason is §4. **(documented)**

| Want | Mechanism | Cost |
|---|---|---|
| Error bars | `error_y: {type:'data', array}` on scatter/bar | native, ~free |
| Confidence band | upper then lower trace, `fill:'tonexty'`, `line:{width:0}` | one extra trace per band |
| Seam marker | `layout.shapes` vertical line + `annotations` | free, no trace |
| Quantile dotplot / HOP | jittered scatter; `Plotly.react` on a timer | quantiles client-side; HOP re-renders, unusable at 35-chart scale |

---

## 8. What Triton should do, in order

1. **Carry `n` in the row shape every chart and table already receives.** Nothing below this can
   render; `stuff_plus_n` sits in the materialized views, reaching no component.
2. **Add `stabilizesAt` (and `minOutings`) to `MetricDef`** — Li specifies the numbers, Cas consumes
   them; one field makes 64 entries n-aware in one place.
3. **Ship the denominator glyph platform-wide** — `104 · 73 P / 2 G` — before any interval:
   unambiguous under every §4 objection, and already the format at `PercentileTab.tsx:420`.
4. **Draw the vintage seam:** a labelled rule at 2026-08-11 and a *break* in every Stuff+ series
   crossing it — shift +0.29–0.59 before, 0.000 after, and today the line runs straight through.
5. **Fix `RollingAverages`** — fix or label the window; mark dropped pitch types, don't omit them.
6. **De-emphasise below threshold instead of suppressing** — reduced opacity plus the n, so April
   leaderboards stay populated and honest. Li's §8 warns a gate that empties a screen gets
   deleted; a de-emphasis state cannot be.
7. **Then intervals** — Wilson for rates, a detectable-difference band for comparisons, never a raw ±
   on a plus-stat.

**Anti-recommendation: do not ship a confidence band on the rolling-average charts as the first
uncertainty feature.** The natural first move — two traces in Plotly, the chart is already a
time series, a shaded band looks like diligence — and wrong on three independent grounds.
(a) **Wrong quantity**: the wobble in `RollingAverages` is dominated by the smoothing window, itself
set by the user's filter (`:10`), so the band would describe the UI's own arithmetic. (b) **It
inherits Li's veto with worse optics than a bar**: a filled region reads as a guaranteed containment
zone, so a variance-only band beside a larger unmodelled bias is the ±0.30 problem drawn twice over.
(c) **Wrong surface**: it spends the first uncertainty affordance on the least-read chart, while the
arsenal table — already showing `count` and ignoring it — is where pitch-type comparisons happen. **A band on a smoothed line is decoration in the shape of rigour.**

**Highest-leverage next action:** add `n` to `MetricDef` and make `count` a de-emphasis trigger in the
arsenal table — the one surface where the denominator is already on screen, correct, and ignored. No
new query, no statistical assumption, no interval.

---

## Sources

1. Correll & Gleicher (2014), [*Error Bars Considered Harmful*](https://doi.org/10.1109/TVCG.2014.2346298) — §2's cliff effect.
2. Hullman et al. (2015), [*Hypothetical Outcome Plots Outperform Error Bars and Violin Plots*](https://doi.org/10.1371/journal.pone.0142444) — §3's ordering result.
3. Kale et al. (2019), [*HOPs Help Untrained Observers Judge Trends in Ambiguous Data*](https://doi.org/10.1109/TVCG.2018.2864909) — §3's replication.
4. Kay et al. (2016), [*When (ish) is My Bus?*](https://doi.org/10.1145/2858036.2858558) — the quantile dotplot.
5. Belia et al. (2005), [*Researchers Misunderstand Confidence Intervals and Standard Error Bars*](https://doi.org/10.1037/1082-989X.10.4.389) — §2's expert failure.
6. Correll et al. (2018), [*Value-Suppressing Uncertainty Palettes*](https://doi.org/10.1145/3173574.3174216) — §1's VSUP row.
7. Jackson (2008), [*Displaying Uncertainty With Shading*](https://doi.org/10.1198/000313008X370843) — §1's gradient row.
8. Hullman (2020), [*Why Authors Don't Visualize Uncertainty*](https://doi.org/10.1109/TVCG.2019.2934287) — why §5's state is the norm.
9. Plotly, [*Error Bars in JavaScript*](https://plotly.com/javascript/error-bars/) — §7's `error_y`.
10. Plotly, [*Continuous Error Bars*](https://plotly.com/javascript/continuous-error-bars/) — §7's band pattern.
11. Bank of England, [*Monetary Policy Report*](https://www.bankofengland.co.uk/monetary-policy-report/2025/november-2025) — the fan chart: a band shipped with an explicit unmodelled-risk caveat, §4's analogue.

**Triton-internal evidence (read 2026-08-13; no DB queries this pass).** Repo-wide grep for
`error_y|error_x` across all `.ts`/`.tsx` outside `node_modules`: **zero matches**; likewise
`tonexty`, `tozeroy`, `'violin'`, `type: 'box'`. 35 files render `<Plot>`, 15 in `components/charts/`.
`package.json:35` pins `plotly.js` `^3.4.0`, `:38` `react-plotly.js` `^2.6.0`.
`components/charts/RollingAverages.tsx:7` bails below 10 rows; `:10`
`const window = Math.min(25, Math.floor(f.length / 4))`, over *all* filtered pitches; `:12–14` maps per
pitch type, returning `null` when `pts.length < window`; `:33` titles the chart with the derived
window. `lib/metricRegistry.ts:17–26` defines `MetricDef` as
`key, label, unit, format, color, totals, higherBetter, tip` — no n, threshold or interval — across
**64** entries; `:105–106` the `count` metric (`label: '#'`), `:583` the arsenal `GROUP_COLUMNS` row
`'name', 'count', 'usagePct'`. `stuff_plus_n` appears only at
`scripts/create-materialized-views.sql:105, 323`, read by nothing.
`components/dashboard/PercentileTab.tsx:420` `n={pool.n_qualified}` — the only rendered sample size,
and it is the pool's. Heatmaps at `components/reports/TileViz.tsx:126, 138, 772` carry
`showscale:false` and no per-cell n. Statistical figures are Li's, not re-measured here (±0.30 season
sampling interval vs ≈0.5 vintage bias; drift +0.29–0.59 for Feb–May 2026 rows, 0.000 June/August
after the 2026-08-11 rescore; Povich 149 pitches / 2 starts, deff 2–4, n_eff 37–75, MDE ≈2.5–3.5 vs
observed 2.3): `Li/statistical-inference/04-uncertainty-quantification.md` §5.3/§7.1/§8–9 and
`09-small-sample-communication.md` §5–7.
