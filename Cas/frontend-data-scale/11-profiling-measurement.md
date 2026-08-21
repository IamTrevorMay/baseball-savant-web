---
title: Profiling & Measurement — Proving a Frontend Change Helped Before You Ship It
domain: frontend-data-scale
tags:
  - profiling
  - inp
  - core-web-vitals
  - react-devtools
  - chrome-traces
  - rum
  - benchmarking
  - overlay-frame-budget
sources_reviewed: 14
last_updated: 2026-08-21
---

# Profiling & Measurement — Proving a Frontend Change Helped Before You Ship It

> Enforcement doc for `frontend-data-scale/`. The siblings grade unmeasured perf claims `(inferred)`;
> the measurements that settle them live here. Grades: **(verified)** read at `file:line` or from the
> 2026-08-21 packet; **(documented)** vendor docs; **(inferred)** mechanism; **(cargo-cult)** ritual.

## TL;DR

- **Triton ships a RUM script on every page that cannot answer a performance question** — `<Analytics />` reports visitors, not Web Vitals; `@vercel/speed-insights` is absent. (verified)
- **INP, not LCP, is Triton's metric**: the defining interaction re-filters up to 50,000 in-memory rows on a chip click. Good ≤ 200 ms, poor > 500 ms, p75. (documented)
- **A Lighthouse pass proves nothing here, and "90+" as a bar is cargo-cult** — a lab load audit with no INP term, on a route that needs a session and a player id. (cargo-cult)
- **The client filter runs inside the click's render; the 300 ms debounce only delays showing the result** — `usePlayerData.ts:256` memoizes, `:262` debounces. One trace settles it. (inferred)
- **A perf gate bolted onto a suite with 5 permanently red tests will be ignored.** Fixing the `.maybeSingle()` mock is a precondition, not a parallel task. (verified)
- **121 `useMemo` and 358 `useCallback` sites exist and nobody knows which help** — that ratio is the argument for profiling first. (verified)
- **Overlays have a frame budget, not a load budget** — 30 fps hardcoded by a ternary returning 30 on both branches, `overlay/[sessionId]/page.tsx:66`: 33.3 ms/frame. (verified)
- **A threshold that has never gone red is not a gate.** Trip it against a deliberately slow build first. (inferred)

---

## 1. What is measured today, and why the one exception misleads

| Instrument | Present? | Note |
|---|---|---|
| Vercel **Web Analytics** | **Yes** — `app/layout.tsx:11,60` | Visitors, page views, events |
| Vercel **Speed Insights** | No — package absent | The product that reports Core Web Vitals |
| `useReportWebVitals` | No call site | Built-in Next hook, unused |
| Bundle analyzer | No — not in `next.config.ts` | Turbopack analyzer available, unconfigured |
| Lighthouse CI / `PerformanceObserver` | None | No `performance.mark` or `measure` |

Triton is not un-instrumented. It has one RUM script, on all 96 pages, and it is the one that cannot say whether anything is fast. So every sibling claim — Plotly dominates the bundle (`02`, `07`), a worker fixes filter latency (`08`), the unmemoized `[...data].sort(...)` at `components/dashboard/PitchLogTab.tsx:37` (a full copy and sort of up to 50,000 rows per render, to show `perPage = 50`, `:29`) costs real time — is unfalsifiable today. (verified)

---

## 2. INP is the metric; Lighthouse is looking elsewhere

INP runs from an interaction (click, tap, keypress — not scroll or hover) to the next frame fully presented, across input delay, processing, and presentation: good ≤ 200 ms, poor > 500 ms, p75. LCP (≤ 2.5 s) and CLS (≤ 0.1) complete the set; INP replaced FID as a Core Web Vital in 2024. (documented)

Triton's expensive moment is not the load. `app/api/player-data/route.ts:44` ends `LIMIT 50000`, so one player view can hold 50,000 rows in the browser; `lib/enrichDerivedFields.ts:7` walks all of them computing VAA/HAA/brink; each chip change runs `applyFiltersToData` (`lib/filterEngineCore.ts:132`) over the survivors. All post-load, main-thread, and invisible to a lab load metric. The server half — latency under the 8 s statement cap — is **`Jo/postgres-performance/`**. (inferred)

**The mechanism worth one trace.** `usePlayerData.ts:256-259` computes `filteredData` in a `useMemo` keyed on `activeFilters`, so it runs during the render the click triggers — same task as the handler. `:262-268` then waits 300 ms before `setData(filteredData)`. If so, the debounce removes no work from the INP window and adds 300 ms before the body updates: worst of both. One trace decides it; until then it stays `(inferred)`, and `05-react-rendering-performance.md` must say so.

---

## 3. Five instruments, five different questions

| Instrument | Answers | Does **not** answer | Cost |
|---|---|---|---|
| **Chrome Performance trace** | Which function blocked which frame, once | Whether real users hit it | Free, manual |
| **React DevTools Profiler** | Which components re-rendered, why, commit cost | Non-React work (Plotly draw, parse, layout) | Free, prod build |
| **`useReportWebVitals`** / Speed Insights | p75 INP/LCP/CLS per route, real machines | Which line caused it | ~20 lines |
| **LoAF** observer | Blocking duration + script attribution: URL, function, position | Non-Chromium browsers | Chrome 123+ |
| **`vitest bench`** | Cost of a pure function vs baseline | Anything touching DOM or React | Zero new deps |

Narrow in that order: RUM names the route, the trace names the task, the Profiler says whether React caused it. (inferred)

**The two benchmarkable functions.** `lib/enrichDerivedFields.ts` is documented at its top as a pure in-place enricher; `lib/filterEngineCore.ts:132` is a pure `data.filter`. `vitest.config.ts` sets `environment: 'node'` — which blocks component-render benchmarks without jsdom and is right for these two, so a `bench` over 50,000 synthetic rows runs deterministically in the existing runner today. (verified)

---

## 4. The before/after protocol

Cas's rule: **never present an inferred win as a measured one.** What enforces it:

1. **Freeze the subject** — one surface, one interaction, one fixture: player id, year, row count. "The dashboard feels slow" is not one.
2. **Build for production** (`next build && next start`). `next dev` re-renders differently and React's dev build is slower; a dev-mode number is not a number.
3. **Fix the environment** — fresh incognito profile (§5), extensions off but React DevTools, 4× CPU throttle; record device and SHA.
4. **Five runs, keep the median**, and write the baseline down with SHA, date, device, throttle — otherwise the after-number has nothing to be after. Whether a 12% shift is signal is `Li/statistical-inference/`.
5. **Change one thing**, re-record identically, report both numbers including what got worse, and keep the artifact: `npx next experimental-analyze --output`, then `cp -r .next/diagnostics/analyze ./analyze-before-<sha>`.

| Surface | Interaction | Instrument | Pass/fail |
|---|---|---|---|
| `app/(research)/player/[id]` | Add one filter chip, full career | Trace, 4× throttle | Click task < 200 ms; `applyFiltersToData` **not** in it |
| `app/(research)/reports/page.tsx:287,326` | Change a global filter, N tiles | Trace + Profiler ranked chart | Filter passes = 1, not 1+N |
| `app/(research)/trends` (41,981 B) | Route change to first useful paint | RUM, LCP by route | p75 LCP ≤ 2.5 s |
| `components/reports/TileViz.tsx` (53,836 B) | Re-render one tile after a metric change | Profiler, "why did this render" | Only that tile commits |
| `design/scene-composer` (80,991 B) | Drag one element across the canvas | LoAF blocking duration | No frame blocking > 50 ms |
| `broadcast/BroadcastContext.tsx` (56,083 B) | Toggle one asset's visibility | Profiler | Commits O(1) in assets |
| `app/overlay/[sessionId]` | 60 s hold, one entering asset | Frames track + OBS stats | 0 dropped frames; ≤ 33.3 ms |

Field thresholds are fixed by the platform; lab thresholds are Triton's, and the honest choice is **relative** — fail a PR that regresses the recorded median by over 10%, not an absolute budget nothing supports. (inferred)

---

## 5. What corrupts a measurement here

**The service worker.** `public/sw.js:29-42` serves `/_next/static/` cache-first, registered at `components/ServiceWorkerRegistration.tsx:8`. On any profile that has visited the site JS comes from Cache Storage, so local load numbers understate first-load cost and a bundle regression hides from whoever shipped it. Measure loads in fresh incognito. (verified)

**Profiler overhead and dev builds.** The React Profiler instruments every commit, so numbers inside a session run high: compare profiled to profiled, never profiled to unprofiled. With step 2 that kills the commonest bad measurement, a `next dev` Profiler number quoted as production latency. (documented)

**And caching.** `staleTime` is 5 min (`lib/QueryProvider.tsx:12-15`) and `lib/queryCache.ts` a 6 h TTL, so a "faster" second run may be a cache hit — vary the player (`caching-state/07-stale-while-revalidate.md`).

---

## 6. A gate nobody trusts is worse than no gate

`npm test`, 2026-08-21 (Vitest 4.1.3): **7 files, 122 tests — 93 passing, 5 failing, 24 skipped, 306 ms**. All 5 failures are `TypeError: … .maybeSingle is not a function` at `lib/queryCache.ts:22` — production code calls `.maybeSingle()` correctly, the **mock** lacks it. Broken test, working code, red since at least 2026-08-11. (verified)

Attaching a perf harness to that suite guarantees it is ignored. Fix the mock chain first (`testing-data-systems/11-vitest-nextjs-patterns.md`), then benchmark.

**Prove the gate can fail.** Before trusting a `bench` threshold, run it against a deliberately slowed build — insert an O(n²) scan in `applyFiltersToData`, confirm it trips, revert. Tolerances: `09-numeric-regression-detection.md`.

One guardrail: **React Compiler is disabled here because it caused state-reset bugs** — rejected on correctness grounds, and no profile reopens it. A perf protocol that can override a correctness regression is a rationalization, not a protocol. (verified)

---

## 7. Overlays are a frame-rate problem

`app/overlay/[sessionId]/page.tsx:66` passes `fps={session.project_id ? 30 : 30}` — both branches return 30, so the project's configured fps is never read and every overlay animates on a 30 fps assumption: **33.3 ms per frame**. OBS browser sources also default to 30 fps ("Use custom frame rate" off), so the two agree by accident, not by wiring. (verified / documented)

Profile these differently. `components/overlay/OverlayAssetRenderer.tsx:154-183` injects CSS keyframes and sets `willChange: 'transform, opacity'` — compositor work, so a JS profile can look idle while frames drop. Use the frames track and FPS meter plus OBS's frame counters during a real session, on the broadcast machine, which is also encoding video. Ordering: `caching-state/04-realtime-sync-consistency.md`.

---

## 8. What Triton should do, in order

1. **Fix the 5 `queryCache` mock failures.** Precondition for everything below.
2. **Add `useReportWebVitals` beside `<Analytics />`** — a `'use client'` component POSTing `{name, value, rating, pathname}` to a route handler. ~20 lines, INP by route.
3. **Record one baseline trace** of the filter-chip interaction per §4, checking whether `applyFiltersToData` sits in the click's task. Unblocks `03`, `05`, `08`.
4. **Run `npx next experimental-analyze --output`** and keep the result as the bundle baseline for `07-bundle-size-code-splitting.md`.
5. **Add `vitest bench` for `enrichDerivedFields` and `applyFiltersToData`** at 50,000 rows, then prove the threshold trips against a slow variant.
6. **Only then touch the 121 `useMemo` / 358 `useCallback` sites**, one profiled surface at a time, reporting both numbers.
7. **Measure the overlay** on the broadcast machine; fix the dead `fps` ternary.

**Anti-recommendation: do not adopt Lighthouse CI as the performance gate.** Three grounds. *Wrong metric class* — a lab load audit, while Triton's cost is a post-load interaction over rows already in memory, which the score does not contain. *Wrong population* — the analyst surfaces need a session and a player id, so an unauthenticated crawl profiles a login screen and calls it healthy. *Wrong failure economics* — it adds a second always-on red signal to a repo that has left 5 tests red for months, and an overridden gate trains the blindness it exists to prevent. Lighthouse is fine as a manual check on the landing route, but not as the gate.

**Highest-leverage next action:** add the `useReportWebVitals` component next to `<Analytics />` at `app/layout.tsx:60`, reporting INP by pathname. It is the smallest change that turns "the dashboard feels slow" into a route name and a number, and every other doc here waits on that number.

---

## Sources

1. web.dev — [Interaction to Next Paint](https://web.dev/articles/inp) — §2's 200/500 ms p75 thresholds and phases.
2. web.dev — [Web Vitals](https://web.dev/articles/vitals) — the CWV set, p75 rule, INP's 2024 promotion over FID.
3. web.dev — [Optimize INP](https://web.dev/articles/optimize-inp) — yield-to-main-thread, behind §2.
4. Chrome — [Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames) — blocking duration and script attribution, §3.
5. Chrome DevTools — [Performance panel](https://developer.chrome.com/docs/devtools/performance/) — §4/§7's trace and frames workflow.
6. Chrome — [Lighthouse overview](https://developer.chrome.com/docs/lighthouse/overview/) — what a lab audit covers; the anti-recommendation.
7. Chrome — [CrUX](https://developer.chrome.com/docs/crux/) — field vs lab divergence; why §4 records the device.
8. React — [`<Profiler>`](https://react.dev/reference/react/Profiler) — commit timing and §5's overhead caveat.
9. React — [React DevTools](https://react.dev/learn/react-developer-tools) — the Profiler tab §4 uses.
10. Next.js — [`useReportWebVitals`](https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals) — the shape of action #2.
11. Next.js — [Package bundling](https://nextjs.org/docs/app/guides/package-bundling) — `next experimental-analyze --output`, §4.
12. Vercel — [Speed Insights](https://vercel.com/docs/speed-insights) — what the missing package gives: p75 CWV by route.
13. Vercel — [Web Analytics](https://vercel.com/docs/analytics) — confirms `@vercel/analytics` reports visitors, not Web Vitals.
14. Vitest — [Benchmarking](https://vitest.dev/guide/features) — `bench` via Tinybench, §3's CI-runnable check.

**Triton-internal evidence (repo read 2026-08-21, commit `6555039`; no production query).** RUM: `@vercel/analytics` `^1.6.1` in `package.json`, imported `app/layout.tsx:11`, mounted `:60`; no `@vercel/speed-insights`, `useReportWebVitals`, `web-vitals`, `PerformanceObserver`, `performance.mark`, or `.measure` in first-party code; no analyzer in `next.config.ts`. Payload boundary `app/api/player-data/route.ts:44` (`… LIMIT 50000`). Filter path `lib/hooks/usePlayerData.ts:149,243,256-259,262-268` and `lib/filterEngineCore.ts:132`; per-tile re-filter `app/(research)/reports/page.tsx:287,326`; unmemoized sort `components/dashboard/PitchLogTab.tsx:37`, `perPage` `:29`. Bench target `lib/enrichDerivedFields.ts:1-7`; runner `vitest.config.ts`. SW `public/sw.js:29-42` via `components/ServiceWorkerRegistration.tsx:8`. Caches `lib/QueryProvider.tsx:12-15`, `lib/queryCache.ts`. Overlay `app/overlay/[sessionId]/page.tsx:66`, `components/overlay/OverlayAssetRenderer.tsx:154-183`. `npm test`: 122 tests, 93/5/24, 306 ms, all 5 failures at `lib/queryCache.ts:22` from the mock in `__tests__/lib/queryCache.test.ts`. Repo scale, file sizes, hook counts (121 `useMemo`, 358 `useCallback`), stack versions (Next 16.1.6, React 19.2.3, Vitest 4.1.3), and the React Compiler rejection are from the 2026-08-21 packet.
