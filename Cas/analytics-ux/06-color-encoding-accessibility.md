---
title: Color Encoding & Accessibility — Making the Palette Carry the Number
domain: analytics-ux
tags:
  - color-encoding
  - colorblind-safety
  - sequential-diverging
  - dark-theme
  - wcag
  - heatmaps
  - strike-zone
  - metric-registry
sources_reviewed: 14
last_updated: 2026-08-13
---

# Color Encoding & Accessibility — Making the Palette Carry the Number

> Grades: **(verified)** read at `file:line` or computed from repo values; **(documented)** spec or
> peer-reviewed; **(inferred)** mechanism; **(cargo-cult)** unsupported. No production query was
> run. Overlay-over-video legibility → `11-broadcast-overlay-legibility.md`.

## TL;DR

- **Triton's strike-zone rainbow has the same lightness at both extremes** — Y=0.050 low, Y=0.041 high, 1.03:1. In grayscale, a compressed screenshot, or for a monochromat, "coldest" and "hottest" are one pixel. **(verified)**
- **Its peak sits on league average.** With a baseline the scale is pinned to mean ± 3σ, so a value *equal to the mean* lands at t=0.50 → near-yellow, Y≈0.73, the loudest color on the plot. **(verified)**
- **Two different rainbow ramps exist for the same metrics** — `TileViz` `#1a3d7c`→`#7a0000` vs `LocationTab` `#2166ac`→`#9e0000` — and neither legend matches its plot: 8 hand-written even CSS stops against 12 non-uniform ones, so `#2166ac` sits at 5% of the scale, 14.3% of the legend. **(verified)**
- **`plus` mode is not red/green — that assumption is wrong.** Five of six use `teal-400`/`orange-400`, a blue–yellow pair that survives red-green CVD. Make it policy before someone "fixes" it. **(verified)**
- **Exactly one metric is genuinely unsafe: `totalRE`,** the sole `inverted_value`, `emerald-400`/`red-400` → two olives 1.21:1 apart under deuteranopia. Separately, "good" is two colors — `teal-400` and `emerald-400` — 1.04:1 apart and indistinguishable to everyone. **(verified)**
- **Text contrast is not the problem.** Every accent clears 4.5:1 on `zinc-950`, worst `red-400` at 6.88:1. The defects are all in encoding. **(verified)**
- **WCAG's 4.5:1 and 3:1 do not govern heatmap fills** — 1.4.11 names "color gradients that represent a measurement, such as heat maps" under its essential-presentation exception. The live gap is **1.4.1 Use of Color**: hue is the only channel carrying value on tiles with no numerals and no colorbar. **(documented)**
- **A diverging ramp already exists, reaches nothing the analyst sees, and dips darker at its neutral midpoint than at its flanks.** **(verified)**

---

## 1. The palette as it actually exists

Tailwind v4 with no config file (`app/globals.css:1` is just `@import "tailwindcss"`), so the stock OKLCH tokens are the whole design system. Plotly 3.4 ships its own colorscales, and every Triton chart overrides them explicitly. Color lives in two places: tile and table numbers, via a `ColorSpec` on 69 registry entries resolved by `getCellColor()` (`lib/metricRegistry.ts:12`, `:618`); and strike-zone heatmaps, via four hard-coded ramps plus two hand-written CSS legend gradients (`TileViz.tsx:21`, `LocationTab.tsx:41`, `serverRenderCard.ts:668`, `RCHeatmapRenderer.tsx:42`). The registry side is disciplined, the heatmap side copy-paste — that asymmetry explains what follows.

| `ColorSpec` mode | Count | Colors |
|---|---|---|
| `static` | 62 | `zinc-300/400` ×26, `emerald-400` ×8, `orange-400` ×7, `rose-400` ×7, other ×14 |
| `plus` | 6 | 5× `teal-400`/`orange-400`; `sos` uses `emerald-400`/`orange-400` with `high:105 low:95` |
| `inverted_value` | 1 | `totalRE` — `emerald-400` good / `red-400` bad |

`high`/`low` both default to `100` (`:628–629`), so for the five plus-stats the neutral branch fires only on an exact 100 — effectively binary. Defensible: `_plus` metrics are excluded from `league_averages` because 100 *is* the midpoint by construction, so the diverging center is never inferred from data — an advantage most dashboards lack.

---

## 2. Sequential, diverging, categorical — and which Triton needs

| Encoding | Right when | Lightness | Triton case |
|---|---|---|---|
| Sequential | One ordered quantity, no meaningful middle | Monotonic | `frequency`, whiff% |
| Diverging | A real neutral point exists | Symmetric about the center | Anything scaled to `baseline ± 3σ`; every `_plus` around 100 |
| Categorical | Unordered classes | Equal | Pitch types, teams |

`TileViz.tsx:140` makes diverging the *preferred* path: when `useLeagueBaseline` returns a value, `zmin/zmax` become `value ± 3·stddev` (`:141–142`, mirrored at `LocationTab.tsx:210–211`) and the plot stops meaning "how often" and starts meaning "how far from league average." Only the min/max fallback is sequential. Both get the same rainbow.

| t | Hex | Y | Meaning under a baseline |
|---|---|---|---|
| 0.00 | `#1a3d7c` | 0.050 | −3σ |
| 0.25 | `#4ba8c4` | 0.335 | −1.5σ |
| **0.50** | ≈`#dce73d` | **≈0.73** | **league average** |
| 0.75 | `#e06010` | 0.243 | +1.5σ |
| 1.00 | `#7a0000` | 0.041 | +3σ |

The visual peak is the null result: a pitcher exactly average in the outer third lights that region up more than one two sigma above — the rainbow's documented non-data-dependent gradient landing on the value that should be quietest. The sequential case fails at the other end: Y(0)=0.050 vs Y(1)=0.041, and Y(0.05)=0.128 vs Y(0.85)=0.134, are pairwise indistinguishable in grayscale or under compression.

### 2.1 The diverging ramp that already exists

`serverRenderCard.ts:680` / `RCHeatmapRenderer.tsx:50` define `HEATMAP_SPECTRUM_HOTCOLD` (blue → gray → red), selectable per overlay, default `rainbow` (`:825`). Neither analyst surface can reach it, and its lightness is inverted: neutral `#6b6b73` is Y=0.149 between flanks at Y=0.411 and Y=0.410. The center is *darker* than near-center, pulling the eye to slightly-above and slightly-below average — the rainbow's defect, smaller. A correct dark-theme diverging ramp is dark and desaturated at neutral, gaining lightness *and* chroma monotonically outward both ways.

`lib/imagine/widgets/heatMapOverlays.ts:13` notes the baseline deliberately does not apply there — the value is a unitless product of two normalized grids — so `hotcold` centers gray on the *data* midpoint, which means nothing. Diverging without a defined neutral is decoration.

### 2.2 Dark theme inverts the published advice

ColorBrewer, viridis and Moreland's maps were designed against white. On `zinc-950` (`#09090b`) three things flip: the low end must be dark-*but-saturated*, since viridis's purple floor nearly vanishes and makes "lowest value" and "no data here" one color (`02-null-zero-unknown-ui.md`, in pixels); diverging maps must be dark-centered, since RdBu's white middle becomes the loudest thing on screen; and the chroma budget shrinks to the `-400` tier, the only one where saturated hues stay readable on dark. Every registry accent already is `-400` — enforce it, don't just observe it.

---

## 3. Colorblind safety, simulated on Triton's own hexes

Machado et al. (2009) severity-1.0 matrices in linear RGB, on the exact Tailwind sRGB values:

| Pair | Normal | Deuteranopia | Y ratio | Verdict |
|---|---|---|---|---|
| `teal-400`/`orange-400` (5 plus-stats) | `#00d5be` / `#ff8904` | `#b4b7c0` / `#c9b300` | 1.06 | **Safe** — separates on the surviving blue–yellow axis |
| `emerald-400`/`orange-400` (`sos`) | `#00d492` / `#ff8904` | `#bcb496` / `#c9b300` | 1.02 | Marginal — hue gap narrows |
| `emerald-400`/`red-400` (`totalRE`) | `#00d492` / `#ff6467` | `#bcb496` / `#b2a463` | 1.21 | **Fails** — two olives |
| `emerald-400`/`teal-400` ("good" vs "good") | `#00d492` / `#00d5be` | `#bcb496` / `#b4b7c0` | 1.03 | Indistinguishable to *everyone* |

Two things the repo earned: the plus-stat pair is right, and near-zero luminance ratios don't matter for *numbers*, where the numeral carries the value and color is redundant. One it didn't: `totalRE`, the only spec where color alone signals a small signed value's sign.

Under deuteranopia the rainbow itself degrades to blue → gray (`#b3afa2` at t=0.35) → yellow → olive: monotonic in nothing, and neutral at 35% of range.

---

## 4. WCAG, stated precisely

| SC | Threshold | Applies to | Governs heatmap fills? |
|---|---|---|---|
| 1.4.3 Contrast (Minimum) | 4.5:1 (3:1 large) | **Text and images of text** | No |
| 1.4.11 Non-text Contrast | 3:1 vs adjacent | UI components; parts of graphics **required to understand the content** | **Exempted** where presentation is essential |
| 1.4.1 Use of Color | — | Color as the *only* visual means | **Yes — the live gap** |

The Understanding document for 1.4.11 names "color gradients that represent a measurement, such as heat maps" among cases where the essential-presentation exception applies, and tells testers to evaluate a gradient region's *central* color, not every adjacent pair. **There is no 3:1 obligation between neighbouring bins of a colormap.** What survives is 1.4.11 on the parts needed to read the graphic — zone outline, legend bar, axis labels — each 3:1 against its own background.

1.4.1 is the criterion Triton risks. `TileViz.tsx:151` sets `showticklabels:false` on both axes and `showscale:false` on the trace; the only numeric affordance is a hover tooltip and a 48px legend with two endpoint labels. Hover doesn't exist on touch, and `components/mobile/` renders these tiles. A value legible only by matching a hue to an inaccurate legend fails 1.4.1 in substance.

Measured contrast on `zinc-950` spans 6.88:1 (`red-400`) to 13.45:1 (`zinc-300`) — all pass AA, all but `red`/`rose`/`violet`/`purple-400` pass AAA, and on `zinc-900` cards each drops ~11%, still above 6:1. Nothing here needs fixing.

---

## 5. What Triton should do, in order

1. **Extract `lib/colorScales.ts`** — one module exporting the ramps plus a `legendGradientCSS(ramp)` generator built from the same stop array, imported by all four call sites. Kills the two-ramp divergence and the legend mismatch without changing a color value.
2. **Fix `totalRE`**: `badClass` → `text-orange-400`, matching every other "bad" in the registry. One line, `lib/metricRegistry.ts:425`.
3. **Unify "good" on `teal-400`** (`:448`); record the pairing as policy — teal above, orange below, zinc neutral.
4. **Default to a dark-centered diverging ramp whenever `baseline` is non-null**, sequential only for the data-min/max fallback. The branch already exists at `TileViz.tsx:140`; the ramp should follow it.
5. **Label the legend midpoint "LG AVG"** when a baseline is in play; the comparison population belongs to `09-comparative-display-benchmarks.md`.
6. **Add a non-hover value channel** for mobile — a `showscale` colorbar, or on-bin numerals above a size threshold — closing the 1.4.1 gap.
7. **Golden-file the ramps**: a Vitest snapshot of `sampleSpectrumRGB()` at t = 0, .25, .5, .75, 1 puts palette edits in a diff, not on a broadcast.

**Anti-recommendation: replace the rainbow with viridis everywhere.** The obvious move, wrong on three independent grounds. *First*, viridis is monotonic sequential and Triton's preferred path is diverging (`TileViz.tsx:140`); on a `mean ± 3σ` scale it erases the midpoint, trading a peak at the neutral value for no marker at all. *Second*, viridis buys uniformity by spending its whole range on lightness, costing local discriminability — and a 20×20 bin grid across a narrow ±3σ window is exactly where fine local contrast matters and the rainbow's defenders (Ware et al., 2023) are right. *Third*, "everywhere" is not one edit: four ramp constants plus two hand-authored CSS gradients that would not move, reproducing today's mismatch in a new palette. Do step 1 and the swap becomes a one-line experiment.

**Highest-leverage next action:** create `lib/colorScales.ts` with the current stops verbatim, generate both legend gradients from it, delete the three duplicate constants. Zero visual change on Reports, one convergence on the dashboard, and every later palette decision is a single-file edit.

---

## Sources

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — normative text for the §4 criteria.
- [Understanding SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) — names heat-map gradients under the essential exception; the "central color" rule §4 rests on.
- [Understanding SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) — 4.5:1 as a *text* threshold, the distinction this doc turns on.
- [Understanding SC 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) — the criterion Triton's label-free tiles risk failing.
- [Borland & Taylor, "Rainbow Color Map (Still) Considered Harmful" (2007)](https://doi.org/10.1109/MCG.2007.323435) — uncontrolled-luminance and false-gradient failures, measured in §2.
- [Ware et al., "Rainbow Colormaps Are Not All Bad" (2023)](https://ieeexplore.ieee.org/document/10128890) — the local-discriminability defense behind the anti-recommendation.
- [Crameri, Shephard & Heron (2020)](https://www.nature.com/articles/s41467-020-19160-7) — non-uniform maps change reader conclusions, not just aesthetics.
- [ColorBrewer 2.0](https://colorbrewer2.org/) — colorblind-safe families; the white-centered assumption dark theme breaks.
- [Moreland, Diverging Color Maps](https://www.kennethmoreland.com/color-maps/) — construction rules for a diverging ramp with a defined neutral; the `hotcold` fix.
- [viridis design talk (Smith & van der Walt)](https://bids.github.io/colormap/) — why monotonic lightness survives grayscale and CVD.
- [Machado, Oliveira & Fernandes, CVD simulation (2009)](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html) — matrices used in §3.

---

**Triton-internal evidence.** Computed 2026-08-13 from repo contents; no production query run. Ramps: `components/reports/TileViz.tsx:21–25` (`SPECTRUM`, 12 stops `#1a3d7c`→`#7a0000`); `components/dashboard/LocationTab.tsx:41–45` (`BLUE_RED_SCALE`, 12 *different* stops `#2166ac`→`#9e0000`); `lib/serverRenderCard.ts:668–675` and `components/report-cards/renderers/RCHeatmapRenderer.tsx:42–49` (identical copies of `SPECTRUM`). Legend gradients hand-written at `TileViz.tsx:155` and `:798`, 8 even stops; `#2166ac` legend@0.143 vs plot@0.05, `#9e0000` 0.857 vs 0.92. Relative luminance of `SPECTRUM` at t=0/.05/.15/.25/.35/.45/.55/.65/.75/.85/.92/1 = .050, .128, .218, .335, .452, .694, .765, .447, .243, .134, .073, .041 — peak t=.55, endpoints 1.03:1. Baseline scaling `TileViz.tsx:140–142`, `LocationTab.tsx:209–211` (`value ± 3·stddev`) puts the league mean at t=0.50. `HEATMAP_SPECTRUM_HOTCOLD` (`serverRenderCard.ts:680–688`, `RCHeatmapRenderer.tsx:50–55`) luminances .050/.202/.411/**.149**/.410/.168/.041; default `rainbow` at `serverRenderCard.ts:825` and `RCHeatmapRenderer.tsx:148`; baseline N/A per `lib/imagine/widgets/heatMapOverlays.ts:13–15`. Registry: `ColorSpec` `lib/metricRegistry.ts:12–15`; 69 entries = 62 `static`, 6 `plus` (`:434, :441, :448, :538, :545, :552`), 1 `inverted_value` (`:425`); `getCellColor` `:618–640`, `high`/`low` default 100 at `:628–629`. Tailwind v4 (`package.json` `"tailwindcss": "^4"`; `app/globals.css:1`), no config file; sRGB from `node_modules/tailwindcss/theme.css` OKLCH tokens — `zinc-950` `#09090b`, `teal-400` `#00d5be`, `orange-400` `#ff8904`, `emerald-400` `#00d492`, `red-400` `#ff6467`. Contrast on `zinc-950` (selected): `red-400` 6.88, `rose-400` 6.96, `violet-400` 6.98, `purple-400` 7.13, `zinc-400` 7.56, `orange-400` 8.36, `emerald-400` 10.29, `teal-400` 10.66, `amber-400` 11.58, `zinc-300` 13.45. CVD simulated with Machado severity-1.0 matrices in linear RGB. Plotly 3.4.0 per `package.json:35`.
