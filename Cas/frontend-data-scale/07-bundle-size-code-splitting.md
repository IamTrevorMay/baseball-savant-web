---
title: Bundle Size & Code Splitting — What Ships to the Browser, and What Only Looks Like It Does
domain: frontend-data-scale
tags:
  - bundle-size
  - code-splitting
  - dynamic-import
  - tree-shaking
  - plotly
  - turbopack
  - client-boundary
sources_reviewed: 13
last_updated: 2026-08-21
---

# Bundle Size & Code Splitting — What Ships to the Browser, and What Only Looks Like It Does

> Grades: **(verified)** read at `file:line` or measured on disk here; **(documented)** vendor docs;
> **(inferred)** mechanism; **(cargo-cult)** unsupported. **No build run, no query issued.**
> Plotly's *render* cost is `02-plotly-performance.md`; this is its *download* cost.

## TL;DR

- **The repo's largest first-party module, `lib/sceneTemplates.ts` at 181,514 bytes, is statically imported by six `'use client'` modules and reaches three route bundles.** (verified)
- **It is not data — it is 3,133 lines of executable layout code** whose entries end in closures, so no JSON-extraction or lazy-fetch trick applies. (verified)
- **`lib/leagueStats.ts` (93,617 B) is pinned into client bundles by six dead exports** — zero references repo-wide, each initialized by a live `_buildPooled(...)` call at module scope. (verified)
- **The classic advice is already taken**: 20 `dynamic(` sites, 5 of 6 Plotly importers wrapped, `html2canvas-pro` / `@ffmpeg` / Stream Deck behind `await import()`. Deleting those six dead lines is the cheapest win left. (verified)
- **Splitting Plotly did not shrink Plotly**: `react-plotly.js` requires `plotly.js/dist/plotly`, a prebuilt UMD file of 4,847,499 B / 1,469,854 gzipped, opaque to every tree-shaker — while Triton uses six trace types that all fit `plotly-cartesian` at 470,973 B gzipped, 3.1× smaller. (verified)
- **`app/api/*` weight is not bundle weight** — two of the ten largest files are route handlers that never reach a browser. (documented)
- **Nothing measures any of this, and Next 16.1 ships the tool**: `next experimental-analyze`, Turbopack-native, on the minor Triton runs. (documented)
- **"Split the big page component" is the wrong instinct** — the composer page is 80,991 B of its own source, but the 181 KB it drags in is the problem; and `lucide-react` / `recharts` are default-optimized, so barrel-file advice is a no-op here. (documented)

---

## 1. Which big files reach a browser

A module ships if a `'use client'` module reaches it through the import graph — the directive marks a
boundary, not a file — and `app/api/` handlers are never in it. (documented)

| File | Bytes | Client? |
|---|---:|---|
| `lib/sceneTemplates.ts` | 181,514 | **yes** — 6 client importers |
| `lib/leagueStats.ts` | 93,617 | **yes** — 6 client importers + transitive |
| `app/(design)/design/scene-composer/page.tsx` | 80,991 | **yes** — `'use client'` |
| `components/broadcast/BroadcastContext.tsx` | 56,083 | **yes** — pulls `obs-websocket-js` |

Also client: `compete/video/page.tsx` (74,112), `research/videos/page.tsx` (67,329),
`scene-composer/exportScene.ts` (54,574), `scene-composer/PropertiesPanel.tsx` (54,391); server-only:
`api/scene-stats/route.ts` (84,147), `api/cron/briefs/route.ts` (69,360). Eight of the packet's ten
largest reach a browser; only two are route handlers. The two `lib/` modules on top are the ones a
reader misfiles as harmless — neither carries `'use client'`, and neither needs to. (verified)

---

## 2. The 181 KB module

181,514 bytes, 3,133 lines, dominated by two exports: `SCENE_TEMPLATES` (`:147`–`:1246`, 96,067 B)
and `DATA_DRIVEN_TEMPLATES` (`:1275`–`:3133`, 79,812 B). All six client importers:

| Importer (`'use client'`) | Line | Imports |
|---|---|---|
| `design/scene-composer/page.tsx` | `:7` | `DATA_DRIVEN_TEMPLATES` |
| `design/template-builder/page.tsx` | `:15` | `DATA_DRIVEN_TEMPLATES` |
| `visualize/scene-composer/ElementLibrary.tsx` | `:5` | **both** + 4 helpers |
| `visualize/scene-composer/PropertiesPanel.tsx` | `:10` | `saveElementPreset` |
| `broadcast/AssetLibrary.tsx` `:7`, `TemplateDataPanel.tsx` `:11` | — | `DATA_DRIVEN_TEMPLATES` |

Two server-only importers (`api/cron/daily-graphics/route.ts:4`, `lib/autoComposeTools.ts:8`) are
free. `ElementLibrary` is imported by both design pages, `AssetLibrary` by
`app/(broadcast)/broadcast/[projectId]/page.tsx:6` — so composer, template builder, **and broadcast
project editor** each carry it. (verified)

### Why the obvious fixes do not apply

"181 KB of template *data*, move it to JSON" is wrong: every entry ends in a function,
`build: () => Scene` (`:20`) or `rebuild: (config, rows)` (`:1257`), calling module-local `el()`
(`:23`) and `scene()` (`:33`) and mutating `let _z = 100` (`:22`). Serializing that is a rewrite.
Tree-shaking is also weaker than it looks: five of six importers want only `DATA_DRIVEN_TEMPLATES`,
so 96 KB could in principle drop from three routes — but that turns on export-level granularity
nobody here has observed. **Do not assume it is gone; go look.** (inferred)

**The load-bearing fix is a boundary, not a split.** These importers render a gallery and rebuild
scenes on demand, post-first-paint, so wrapping `ElementLibrary`, `AssetLibrary`, and
`TemplateDataPanel` in `dynamic(…)` moves the subtree into a lazy chunk. (inferred)

---

## 3. The tree-shaking failure underneath it

`lib/sceneTemplates.ts:9` imports one function: `import { gradeColor } from './leagueStats'`.
`gradeColor` (`:1536`) is trivial; the module around it is 93,617 bytes of frozen per-year constants,
twelve tables from `BRINK_LEAGUE_BY_YEAR` (`:10`) to `STUFF_LEAGUE_BY_YEAR` (`:910`). One small
import should cost one small function. It does not, because of six lines:

```ts
// lib/leagueStats.ts:1255-1262
// These are used nowhere now but kept for safety during migration
export const BRINK_LEAGUE = _buildPooled(BRINK_LEAGUE_BY_YEAR)
…five more, same shape…
```

The comment is accurate — `grep` finds **zero** references to any of the six. (verified) But each is
an exported binding whose initializer is a *function call*, and a bundler drops an unused export only
if it can prove that initializer side-effect-free. An un-annotated call is the canonical case where it
cannot: what `/*#__PURE__*/` and `sideEffects` exist to resolve. Six dead exports keep six large
tables reachable. (documented / inferred)

Nor is this confined to the design tools. `leagueStats` reaches the client via
`charts/MovementProfile`, `charts/PercentileRankings`, `dashboard/OverviewTab`, `PercentileTab`,
`PitchLevelTab`, `reports/TileViz`, and transitively through `lib/pitcherStats.ts`,
`lib/enrichData.ts`, `lib/sceneTemplates.ts` — none carrying `'use client'` — so it lands on the
**player dashboard and Reports Builder**. Whether these are the right baselines is
`Li/metric-governance/`; Cas's claim is narrower: **they ship to browsers that never read them.**
(verified)

---

## 4. Plotly: split, and still 4.8 MB

Five of six importers wrap it in `dynamic(() => import('react-plotly.js'), { ssr: false })`, where
`ssr: false` is both required (Plotly touches `window` at module scope) and what creates the chunk.
(documented) That chunk is the problem:

```js
// node_modules/react-plotly.js/react-plotly.js:10
var _plotly = _interopRequireDefault(require("plotly.js/dist/plotly"));
```

Not `plotly.js`, not an ESM entry — a **prebuilt UMD dist** via CommonJS `require`. (verified) Every
trace type (gl3d, mapbox, geo, finance) is inside it, no named exports remain to shake, and
`optimizePackageImports` cannot touch it. (inferred) From `node_modules`, 2026-08-21:
`dist/plotly.min.js`, what ships, is 4,847,499 B minified / **1,469,854 gzipped**;
`dist/plotly-cartesian.min.js` is 1,418,287 / **470,973**.

Every `type:` literal in `app/`, `components/`, `lib/` yields six traces in use: `scatter` (44),
`histogram` (3), `heatmap` (3), `bar` (3), `scattergl` (2), `pie` (1) — all in `plotly-cartesian`
except `pie`, one `register()` away. (verified) The fix is `createPlotlyComponent` from
`react-plotly.js/factory` over a core build, via Plotly's `lib/core` + `register` path or its
`npm run custom-bundle --traces=…` generator: roughly **1.0 MB gzipped off every charting route** —
arithmetic on two files on disk, not an observed build. (inferred)

### What is already right (do not "fix" it)

| Pattern | Sites | Status |
|---|---:|---|
| `dynamic(() => import(...))` | 20 | 12 visualize templates, 6 Plotly, pitch-lab, mechanics |
| `await import('html2canvas-pro')` / `@ffmpeg/…` | 6 / 3 | correct: export-only, user-triggered |

Also correct: `three` / `@react-three/*` (37 MB installed, 7 files) behind two `dynamic()`
boundaries, `@elgato-stream-deck/webhid` device-gated, and 11 default-optimized `lucide-react` named
imports. `recharts` — 8.5 MB installed — has one importer,
`components/design/ExploreCharts.tsx` (17,455 B), which **nothing in the repo imports**: zero bundle
bytes, pure dependency-surface risk. Remaining static heavies (`obs-websocket-js` at
`lib/useOBSWebSocket.ts:4`, reached from `BroadcastContext`, so every broadcast route pays it;
`mp4-muxer`; `papaparse`; `fflate`) are small next to §2–§4. (verified)

---

## 5. Measuring it

`next.config.ts` is 16 lines with no `@next/bundle-analyzer`. (verified) It needs no plugin: Next
**16.1** shipped a Turbopack-native analyzer and Triton runs **16.1.6**.

```bash
npx next experimental-analyze           # interactive treemap
npx next experimental-analyze --output  # .next/diagnostics/analyze — copy it, then diff
```

It filters by route, splits client vs server, and — what matters here — **shows the import chain
explaining why a module is present**. It is explicitly experimental. `@next/bundle-analyzer` is the
webpack-era fallback and Turbopack is Next 16's default, so wiring it here would measure a build
Triton does not run. **Do not install it.** (documented)

Every inferred claim has a confirming command. *181 KB reaches three route bundles* and *is
`SCENE_TEMPLATES`' 96 KB shaken out*: analyze, filter by route, read the import chain. *Six dead
exports pin `leagueStats`* and *a Plotly custom bundle saves ~1.0 MB gz*: make the change,
`--output` before and after, diff the dirs.

`turbopack.root = __dirname` (`next.config.ts:7-9`) pins module resolution here — a fix for a stray
`~/package-lock.json`, unrelated to size. `serverExternalPackages: ['@napi-rs/canvas']` (`:13`) is
the real bundling directive: it keeps that native `.node` binary out of the server build as a runtime
`require`, since bundling would break it. (documented)

---

## 6. What Triton should do, in order

1. **Delete `lib/leagueStats.ts:1255-1262`** — six dead exports, zero references, behaviour-neutral,
   plausibly unpins ~90 KB from the dashboard and Reports Builder. Ten minutes.
2. **Run `npx next experimental-analyze --output` and commit the treemap**, so steps 3–5 are measured
   rather than argued — the missing instrument.
3. **Wrap `ElementLibrary`, `AssetLibrary`, `TemplateDataPanel` in `dynamic(…)`** — 181 KB off first
   paint on three routes, the pattern already used 20 times here.
4. **Build the custom Plotly bundle** (`react-plotly.js/factory` over `plotly.js/lib/core`, six
   traces registered), changing only `components/PlotWrapper.tsx` and
   `MobileChartWrapper.tsx` — together 28+ chart components.
5. **Split `sceneTemplates.ts` on its export seam** so single-export importers cannot drag the other
   96 KB in, whatever the shaker's granularity.
6. **Delete `components/design/ExploreCharts.tsx` and `recharts`**, or wire it up — an orphaned chart
   library is a future accident.

**Anti-recommendation: do not convert the heavy pages to Server Components to shrink the bundle.**
*Interactivity* — composer, broadcast editor, and dashboard are canvas-drag, keyboard-shortcut,
Realtime surfaces; the `'use client'` at `scene-composer/page.tsx:1` is load-bearing. *Locus* — the
weight sits in two `lib/` modules with no directive at all, so moving a page boundary relocates the
problem without removing a byte. *Architecture* — single-player views filter client-side by design
(the 50,000-row `LIMIT`); server-rendering the shell trades one download for per-interaction
round-trips under an 8-second statement cap. Next's guidance targets *transform-only* client
libraries, which none of these three is.

**Highest-leverage next action:** delete the six dead exports at `lib/leagueStats.ts:1255-1262`, then
run `npx next experimental-analyze --output` before and after — the first bundle measurement this repo
has taken.

---

## Sources

1. Next.js — [Optimizing package bundling](https://nextjs.org/docs/app/guides/package-bundling) — §5's analyzer commands; the pattern §6 rejects.
2. Next.js — [16.1 release notes](https://nextjs.org/blog/next-16-1) — dates the analyzer to 16.1.
3. Next.js — [`optimizePackageImports`](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports) — the default list, holding `lucide-react`.
4. Next.js — [`next/dynamic`](https://nextjs.org/docs/app/guides/lazy-loading) — `ssr: false` semantics, §4.
5. Next.js — [`serverExternalPackages`](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages) — what `next.config.ts:13` does.
6. Next.js — [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — §1's reachability rule.
7. Next.js — [Turbopack in 16.2](https://nextjs.org/blog/next-16-2-turbopack) — why §2 won't assume the 96 KB drops.
8. Vercel — [How we optimized package imports](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) — why barrel flattening can't help §4.
9. plotly.js — [CUSTOM_BUNDLE.md](https://github.com/plotly/plotly.js/blob/master/CUSTOM_BUNDLE.md) — the `--traces` generator §4 uses.
10. plotly.js — [dist/README.md](https://github.com/plotly/plotly.js/blob/master/dist/README.md) — what each partial dist holds.
11. react-plotly.js — [README](https://github.com/plotly/react-plotly.js) — the `factory` entry, §4's fix.
12. webpack — [Tree Shaking](https://webpack.js.org/guides/tree-shaking/) — `sideEffects` / `/*#__PURE__*/`, §3's mechanism.
13. web.dev — [Reduce JavaScript payloads with code splitting](https://web.dev/articles/reduce-javascript-payloads-with-code-splitting) — the cost model behind §4.

**Triton-internal evidence (repo read 2026-08-21 at commit `6555039`; no production query, no build).**
`lib/sceneTemplates.ts` 181,514 B / 3,133 lines: `gradeColor` import `:9`, `build` `:20`, `_z` `:22`,
`el()` `:23`, `scene()` `:33`, `SCENE_TEMPLATES` `:147`–`:1246` (96,067 B), `rebuild` `:1257`,
`DATA_DRIVEN_TEMPLATES` `:1275`–`:3133` (79,812 B); importers in §2, broadcast reach at
`app/(broadcast)/broadcast/[projectId]/page.tsx:6`. `lib/leagueStats.ts` 93,617 B / 1,556 lines, 44
exports: `gradeColor` `:1536`, twelve constant tables `:10`–`:910`, dead exports `:1255-1262` with 0
grep references. `node_modules/react-plotly.js/react-plotly.js:10` →
`require("plotly.js/dist/plotly")`; dist bytes via `ls -l` + `gzip -c|wc -c` here: 4,847,499 /
1,469,854 full, 1,418,287 / 470,973 cartesian. Trace grep: scatter 44, histogram 3, heatmap 3, bar 3,
scattergl 2, pie 1. `next.config.ts` 16 lines: `turbopack.root` `:7-9`, `serverExternalPackages`
`:13`, no analyzer. `package.json`: Next 16.1.6, React 19.2.3, `plotly.js`
^3.4.0, `recharts` ^3.8.1, `three` ^0.183.2. `ExploreCharts.tsx` 17,455 B, `recharts` `:7`, 0
importers repo-wide. Repo-scale counts (355 `'use client'`, 96 pages, 20 `dynamic(`, 196 API routes)
and the 50,000-row `LIMIT` at `app/api/player-data/route.ts:44` are the shared packet's.
