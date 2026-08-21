---
title: Web Workers & Off-Thread Work — When the Transfer Costs More Than the Compute
domain: frontend-data-scale
tags:
  - web-workers
  - structured-clone
  - transferable-objects
  - comlink
  - main-thread
  - derived-fields
  - client-filtering
  - turbopack
sources_reviewed: 14
last_updated: 2026-08-21
---

# Web Workers & Off-Thread Work — When the Transfer Costs More Than the Compute

> Grades: **(verified)** read at `file:line`; **(documented)** vendor/spec docs; **(inferred)**
> mechanism. No production query was run and **nothing was profiled** — see §7.

## TL;DR

- **Triton has zero Web Workers, and for these surfaces that is the right number.** (verified)
- **The workload is ~16 passes over up to 50,000 rows at load, then one per keystroke.** (verified)
- **Per-row cost is dominated by string formatting, not math** — six `toFixed(1)` number→string→number trips per row. (verified)
- **The filter loop re-allocates per row**: `f.values.map(Number)` sits inside it — 50,000 allocations where 3 do. (verified)
- **The payload is far past where `postMessage` is free**: ≤10 KiB risk-free, ≤100 KiB per 100 ms; Triton's is 50,000 × 71 fields. (documented)
- **A worker helps only if the rows *live* in it**; ship-in/ship-out clones the array twice. (inferred)
- **Transferables need columnar typed arrays, and ~16 filterable fields are strings** — that rewrites every `d[col]` consumer. (verified)
- **A debounce exists and debounces the wrong thing**; `useDeferredValue`/`useTransition` have zero call sites on React 19.2.3. (verified)
- **"Put the filter in a worker" is the cargo-cult move**: it relocates cost, keeps what makes the data expensive, adds a clone. (cargo-cult)

## 1. Baseline: nothing is off-thread

No `new Worker(` call site exists in `app/`, `lib/`, `components/`, or `scripts/`; no `*.worker.ts`
file exists; `comlink`/`workerize`/`partytown` are absent from `package.json`. The only extra thread
is `public/sw.js` via `components/ServiceWorkerRegistration.tsx:9` — a service worker, which caches
and computes nothing. (verified) Every cost below runs on the main thread.

## 2. The workload, counted

`GET /api/player-data` ends `LIMIT 50000` (`app/api/player-data/route.ts:44`) over 70 columns plus
a joined name column — 71 fields per row, up to **3.55M values** per response. Then:

| Stage | `file:line` | Passes |
|---|---|---|
| VAA/HAA, movement, brink, `vs_team` | `lib/enrichDerivedFields.ts:8-35` | 1 |
| Centroid reduce (year × pitch type) | `:39-47` | 1 |
| Cluster/HDev/VDev apply | `:53-63` | 1 |
| Drop `PO`/`IN` | `lib/hooks/usePlayerData.ts:150` | 1 |
| `buildOptionsCache` — 11 `buildOpts`, each `map`+`filter`+`Set` | `:85-87` | **11** |
| Season-type filter | `:243-252` | 1 |
| User filters | `:256-259` | 1 **per change** |

**~16 traversals at load, one more per keystroke.** (verified)

### Arithmetic, lookup join, or both?

| Component | Evidence | Weight |
|---|---|---|
| Float math | 2 `sqrt`, 2 `atan2`, a `min`, a third `sqrt` in the cluster pass | Small |
| Redundant math | Identical `t` computed twice, `enrichDerivedFields.ts:11`, `:18` | 1 `sqrt`/row |
| **String formatting** | Six `+(x).toFixed(1)`/row → ~300,000 allocations at 50k | **Dominant** |
| Key allocation | `` `${p.game_year}::${p.pitch_name}` `` built twice, `:41`, `:55` | 100k strings |
| Lookup join | Already in SQL: `LEFT JOIN players pl`, `route.ts:44` | ~Zero |
| Shape churn | Up to 11 properties added conditionally per row | See below |

The lookup join is the part everyone assumes is expensive and the part already eliminated. The
unnamed part is `toFixed`: **display rounding done in the data model**. (verified) Shape churn
matters for §3 — rows arrive from `JSON.parse`, then gain up to 11 null-guarded properties, so rows
with different missingness end with different hidden classes. V8 documents that a site caching more
than four shapes goes **megamorphic** and that dynamic properties can force dictionary mode;
`applyFiltersToData` reads `d[col]`, a dynamic keyed load, across that population. (inferred, on
documented V8 behavior)

## 3. The filter cost is hoistable, not thread-bound

```ts
// lib/filterEngineCore.ts:141-147, inside data.filter(d => …)
const val   = f.def.numberCast ? Number(d[col]) : String(d[col])
const check = f.def.numberCast ? f.values.map(Number) : f.values
if (!(check as any[]).includes(val)) return false
if (f.min && (d[col] == null || d[col] < parseFloat(f.min))) return false
```

`f.values.map(Number)` allocates a **fresh array per row**: a three-value season filter over 50,000
rows does 50,000 allocations and 150,000 conversions where 3 would do; `parseFloat(f.min)` re-parses
per row per bound; `includes` is a linear scan where a `Set` is O(1). (verified) Compiling each
`ActiveFilter` once into a closure is ~20 lines and *removes* work rather than relocating it. **A
worker built on this loop carries all of it across unchanged.** (inferred)

## 4. Pricing the transfer, and what columnar would cost

`postMessage` cost tracks stringified payload size: **≤10 KiB is risk-free**, **≤100 KiB** fits a
100 ms budget, past that size dominates. (documented) Triton's array-of-objects payload — 50,000 ×
71, the *worst* shape for cloning, since every key is walked per row — is orders of magnitude past
it.

| Topology | What crosses | Verdict |
|---|---|---|
| Ship rows in, results out | Full array **twice** per interaction | Worse than the main thread |
| Rows live in worker; chips in, summaries out | Bytes | The only viable shape |
| Columnar + `Transferable` | `ArrayBuffer` handles, O(1) | Viable, but a migration |

Row two means the worker *owns* the dataset: React Query stops holding `allData`, and every memo in
`components/mobile/MobilePlayerDashboard.tsx:300-304` goes async. (inferred) **Structured clone
also destroys object identity**, and one surface depends on it:
`app/(research)/reports/page.tsx:322-330` filters `filteredData` once per tile (16-tile cap `:334`)
and inserts surviving **row references** into a `Set` to count distinct pitches — cloned rows are
new objects, so the same code in a worker returns a count up to 16× too large. (verified)

Row three is a data-model change. Transferring an `ArrayBuffer` is O(1) and size-independent, but
the source is **detached** — unusable (documented), and `allData` is React Query cache state read
synchronously during render. `FILTER_CATALOG` (`lib/filterEngineCore.ts:33-102`) exposes 56 filter
fields of which ~16 are string-valued (`pitch_name`, `events`, `home_team`, …), none fitting a
`Float64Array` without dictionary encoding, and every consumer of `d[col]` then changes. (verified)
Arrow's JS implementation is the honest way to do it. **Restructure to columnar first, workers
second, and quite possibly never** — that rewrite removes §2's shape churn and makes filtering a
typed scan. (inferred)

## 5. The competing option: the server, not a thread

The strongest alternative is deleting the client-side work. That boundary is
`03-client-vs-server-computation.md`'s, and the constraint that pushed work clientward is real:
every `run_query` runs under an **8-second `authenticator` statement cap**. Two facts sharpen it.
`/api/player-data` does not use `run_query` — it uses `run_query_long` via `supabaseAdminLong`
(`route.ts:2,45`), so a longer-budget path already exists on the route shipping 50,000 rows. And it
accepts `&year=`, its comment reading "dramatically reduces rows (50K → ~5K)" (`:31`), which
`usePlayerData` passes only when a year is selected (`:146`). **A 10× payload reduction is
implemented and is not the default.** (verified)

## 6. Cheaper than a worker, in cost order

| Mitigation | Cost | Buys |
|---|---|---|
| Hoist per-filter predicates (§3) | ~20 lines | ~50k fewer allocations per interaction |
| Round at render, not in enrich | ~10 lines | ~300k fewer string round trips |
| One pass for `buildOptionsCache` | ~15 lines | 10 fewer traversals at load |
| Fix the misplaced debounce | ~5 lines | The scan stops running per keystroke |
| `useDeferredValue(activeFilters)` | 1 line | Typing stays responsive during the scan |
| `scheduler.yield()` chunking of enrich | ~30 lines | Long task → <50 ms slices |
| Worker owning the dataset | Architectural | Parallelism, inheriting all the above |

Two deserve naming. The debounce at `lib/hooks/usePlayerData.ts:263-269` wraps
`setData(filteredData)` in a 300 ms `setTimeout` — but `filteredData` is a `useMemo` (`:256-259`)
recomputed **synchronously during render** whenever `activeFilters` changes, so the scan already ran
and only its commit is delayed. And `useDeferredValue`/`useTransition`/`startTransition` have **zero
call sites repo-wide** on React 19.2.3. React Compiler is disabled (state-reset bugs), so automatic
memoization is out — concurrent rendering is not, and it targets this shape. (verified)

## 7. If you build one anyway

Turbopack lists `new Worker()` beside dynamic `import()` and `require()` as expressions its magic
comments apply to, so worker entrypoints are recognized, and current docs expose
`turbopackWorkerAssetPrefix` for worker entrypoint and chunk URLs. **That page documents 16.3.2;
Triton pins `next@16.1.6`** (`package.json:32`), so the behavior of
`new Worker(new URL('./x.worker.ts', import.meta.url))` here is **not confirmed** — verify with a
throwaway worker first. (documented) Comlink turns `postMessage` into an ES-Proxy RPC in ~1.1 kB
brotli; its risk is its virtue, making a 3.55M-value clone look like a call.

This argues from code, not from a trace, so **no claim about Triton's main-thread time is graded
above (inferred)**. What would settle it: a Chrome trace of one filter-chip toggle on a 50,000-row
player, `performance.mark` around `enrichDerivedFields` and `applyFiltersToData`, plus an INP
reading on the mobile split — that protocol is `11-profiling-measurement.md`'s, weaker CPUs
`09-mobile-performance-constraints.md`'s, stale rows `Jo/`'s, sample defensibility `Li/`'s.

## 8. What Triton should do, in order

1. **Hoist the per-filter predicates** out of the row loop in `lib/filterEngineCore.ts:132-155`.
2. **Move `toFixed` rounding to render.** Store full precision; let `lib/metricRegistry.ts` format.
   Removes the dominant per-row cost and the worst contributor to shape churn.
3. **Fix the debounce** at `lib/hooks/usePlayerData.ts:263-269` so the *scan* is debounced, not
   the commit, and wrap `activeFilters` in `useDeferredValue`.
4. **Collapse `buildOptionsCache` to one pass** (`:85-87`) — 11 traversals become 1.
5. **Profile.** Only now is a measurement meaningful; before it you'd be profiling waste.
6. **Re-ask the boundary question** with doc 03: default `&year=`, or filter in SQL — either
   deletes the workload a worker would have hosted.

**Anti-recommendation: do not move `applyFiltersToData` into a Web Worker.** Three grounds.
*Transfer* — 50,000 × 71 values in the worst shape for cloning, far past where `postMessage` is
free, so the clone costs more than the filter it offloads. *Portability* — the expensive parts are
`toFixed` formatting and megamorphic keyed loads over ragged shapes, both of which follow the data
into the worker unchanged, and `app/(research)/reports/page.tsx:322-330` depends on object identity,
which cloning breaks silently. *Sequencing* — a debounce sits in the wrong place, React's concurrent
APIs are unused, and `&year=` cuts the payload 10× without being the default; a thread first
optimizes the fifth-cheapest thing.

**Highest-leverage next action:** hoist the predicates in `lib/filterEngineCore.ts:132-155` so
`f.values.map(Number)` and `parseFloat(f.min)` run once per filter, not once per row.

## Sources

1. Surma — [Is postMessage slow?](https://surma.dev/things/is-postmessage-slow/) — the benchmark behind §4's thresholds.
2. InfoQ — [postMessage study](https://www.infoq.com/news/2019/08/postMessage-performance-study/) — second source for §4's KiB figures.
3. MDN — [Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) — what transfers vs clones (§4).
4. MDN — [Structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) — why object identity is not preserved (§4).
5. MDN — [`ArrayBuffer.transfer()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/transfer) — the detach-on-transfer rule §4 turns on `allData`.
6. web.dev — [Overview of web workers](https://web.dev/learn/performance/web-worker-overview) — the case *for* workers, which §4 bounds.
7. web.dev — [Optimize long tasks](https://web.dev/articles/optimize-long-tasks) — the 50 ms long-task definition (§6).
8. Chrome for Developers — [Use `scheduler.yield()`](https://developer.chrome.com/blog/use-scheduler-yield) — the alternative §6 ranks above a worker.
9. MDN — [`Scheduler.yield()`](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield) — availability for that row.
10. React — [`useDeferredValue`](https://react.dev/reference/react/useDeferredValue) — the mitigation with zero call sites in Triton (§6).
11. V8 — [Fast properties in V8](https://v8.dev/blog/fast-properties) — hidden classes and the >4-shape megamorphic threshold (§2).
12. GoogleChromeLabs — [Comlink](https://github.com/GoogleChromeLabs/comlink) — size and RPC model quoted in §7.
13. Next.js — [Turbopack reference](https://nextjs.org/docs/app/api-reference/turbopack) — `new Worker()` as an entrypoint expression; §7's version mismatch.
14. Apache Arrow — [Arrow JS docs](https://arrow.apache.org/docs/js/) — the columnar layout §4 prices.

**Triton-internal evidence (repo read 2026-08-21 on `main`; no production query, no profiling).**
Zero workers: no `new Worker(` in `app/`, `lib/`, `components/`, `scripts/`; no `*.worker.*`; no
`comlink`/`workerize`/`partytown` in `package.json`; only extra thread `public/sw.js` via
`components/ServiceWorkerRegistration.tsx:9`; `OffscreenCanvas` synchronous at
`lib/streamDeckProfile.ts:53-57,137-141`. Payload `app/api/player-data/route.ts`: `LIMIT 50000`
`:44`, `BASE_COLUMNS` `:5` = **70** columns plus one joined name column (`LEFT JOIN players pl`,
`:44`) = 71 fields × 50,000 = 3.55M values; year comment "50K → ~5K" `:31`; `run_query_long` via
`supabaseAdminLong` `:2,45`; per-row Zod validation `lib/schemas/playerData.ts:61-68`.
`lib/enrichDerivedFields.ts` (64 lines): pass 1 `:8-35`, centroid reduce `:39-47`, apply `:53-63`;
duplicate `t` `:11,18`; six `toFixed(1)` `:24,25,30,58,59,60`; key literal twice `:41,55`; older
`lib/enrichData.ts` (181 lines) adds four fields `:129-177`. `lib/hooks/usePlayerData.ts` (302
lines): enrich `:149`, `cleaned` `:150`, `buildOptionsCache` `:151` with `buildOpts` `:86-87` run
11× over `:89-113`, `seasonFilteredData` `:243-252`, `filteredData` `:256-259`, 300 ms debounce on
the commit only `:263-269`, year `:146`. `lib/filterEngineCore.ts` (156 lines / 8,332 B):
`FILTER_CATALOG` `:33-102` (56 entries), `applyFiltersToData` `:132-155`, per-row `map(Number)`
`:142`, per-row `parseFloat` `:146-147`, `includes` `:143`; `components/FilterEngine.tsx` (14,539 B)
range inputs fire per keystroke `:206-208`. Reports identity `Set`
`app/(research)/reports/page.tsx:322-330`, 16-tile cap `:334`; mobile memos
`components/mobile/MobilePlayerDashboard.tsx:300-304`. Zero `useDeferredValue`/`useTransition`/
`startTransition` repo-wide. `package.json:24,32,36`: `next@16.1.6`, `react@19.2.3`. The 8 s
`authenticator` cap and React Compiler being disabled come from the shared packet (2026-08-21).
