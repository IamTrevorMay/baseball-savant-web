---
title: React Rendering Performance — Memoizing the Cheap Things, Very Thoroughly
domain: frontend-data-scale
tags:
  - react-19
  - re-renders
  - memoization
  - context
  - list-keys
  - react-compiler
  - profiling
sources_reviewed: 14
last_updated: 2026-08-21
---

# React Rendering Performance — Memoizing the Cheap Things, Very Thoroughly

> Grades: **(verified)** read at `file:line` or from the packet; **(documented)** vendor docs;
> **(inferred)** mechanism, not profiled; **(cargo-cult)** unsupported. No profiler, no DB query.

## TL;DR

- **358 `useCallback` sites, 121 `useMemo` sites, zero `memo()` components, and 272 of 396 `useCallback` declarations sit in no dependency array.** (verified)
- **`useCallback` pays only for a `memo`'d consumer, a Hook dependency, or a ref callback, and Triton has none of the first; `memo` itself only compares props, so it cannot stop a context-driven render.** (documented)
- **`BroadcastContext` writes a fresh 79-field object literal into its Provider every render, voiding all 59 of its own `useCallback`s for every consumer at once.** (verified)
- **A countdown writes to it at 1 Hz and a video at 4–66 Hz; 21 unmemoized consumers re-render on each write, on the live-production surface.** (verified)
- **The expensive work is the unmemoized part** — 50,000 rows filtered synchronously in a `useMemo` on the render path with the debounce *after* it, and `PitchLogTab.tsx:37` sorting 50,000 rows every render to show 50. (verified)
- **Seven components are declared inside another component's body and rendered as JSX, so every parent render unmounts them and their inputs lose focus — a state reset with no compiler in sight.** (verified)
- **React Compiler's documented failure mode is memoization-for-correctness plus undetected Rules-of-React violations, which points at Triton's code; its analyzer is already installed, so the evidence costs one lint run.** (inferred)
- **"Memoize everything by default" is the expensive kind of wrong: cost every render, no cap on anything.** (cargo-cult)

---

## 1. What memoization can and cannot buy

| Tool | Caches | Pays off only when | Triton |
|---|---|---|---|
| `useMemo` | a **value** | recomputing is slow, or identity feeds a Hook/`memo` | 121 sites |
| `useCallback` | a **function identity** | consumer is `memo`'d, it's a Hook dep, or it's a ref callback | 358 sites |
| `memo` | a **subtree**, on prop equality | props are stable *and* the subtree is expensive | **0 sites** |

React's docs are blunt: `useCallback` "is only valuable in a few cases," and "a single value that's *always new* is enough to break memoization for an entire component." Only `memo` *stops* a render; the hooks cap the cost of one that happens anyway, and 479 memo-hook sites with no `memo` boundary spend it all on the second kind. (verified) And the fact people skip: **`memo` compares props**, so a context consumer re-renders on every context change whatever its props are. (documented)

---

## 2. The inventory, and what a sample of it does

| Site | Pattern | Verdict |
|---|---|---|
| `StreamDeckGrid.tsx:423` | `measRef` — ref callback, `[]` deps, attaches a `ResizeObserver` | **Earns it.** Unmemoized, the observer rebuilds every render |
| `StreamDeckGrid.tsx:626` | `onClick={handleResetAll}` on a DOM `<button>` | No-op; React reuses the listener |
| `StreamDeckGrid.tsx:610` | `makeAnimEndHandler` — memoized factory returning a **fresh closure per call**, body a no-op | Memoizes the wrapper, defeats itself one level down |
| `StreamDeckGrid.tsx:616` | `[...assets].sort(...)`, **not** memoized | The one O(n log n) line, below nine memoized functions |

Row four is the finding in miniature: the free thing memoized, the expensive thing not. **272 of 396 `useCallback` declarations never appear in a dependency array in their own file**, and with zero `memo()` components their only remaining justification is a child's effect. (verified)

### Memoization density is inverse to component size

State count approximates re-render *frequency*; `useMemo` count caps their *cost*. In the five largest client components `useState`/`useMemo`/`useCallback` runs 33/**0**/27 (`scene-composer/page.tsx`, 80,991 B), 36/1/8 (`compete/video/page.tsx`), 20/**0**/59 (`BroadcastContext.tsx`), 20/**0**/0 (`AssetLibrary.tsx`), 19/2/1 (`TileViz.tsx`) — 128 state hooks, 3 memos. Point the profiler there (`11-profiling-measurement.md`). (verified)

---

## 3. Context-induced renders: the live-production hazard

`BroadcastContext.tsx:1420` opens `<BroadcastCtx.Provider value={{` and inlines **~79 fields** — 20 pieces of state plus 59 `useCallback`-wrapped functions — rebuilt every provider render, so by §1's always-new rule all 59 buy consumers nothing. **21 components consume it**, `AssetLibrary.tsx` and `TemplateDataPanel.tsx` (51,745 B) among them; none is `memo`'d, and `memo` would not help. (verified)

| Writer | `file:line` | Rate | Effect |
|---|---|---|---|
| Countdown tick | `BroadcastContext.tsx:961-963` | 1 Hz while running | `setWidgetState` → new object → provider render |
| Video `onTimeUpdate` | `LivePreview.tsx:89` → `BroadcastContext.tsx:1107` | **4–66 Hz** per playing video | allocates a **new `Map`** per event → provider render |

MDN documents `timeupdate` as firing "between about 4Hz and 66Hz," so while a video plays, 21 components re-render several times a second on the surface where a dropped frame is visible on air. The millisecond cost is (inferred) until profiled; the mechanism is not.

**Four of nine contexts already do it right** — `AuthProvider.tsx:70`, `Toast.tsx:33`, `useTheme.tsx:39`, `useDeviceContext.tsx:30` build `const value = useMemo(...)`. The five that do not (`BroadcastContext:1420`, `ProducerContext:137`, `EmailEditorContext:358`, `StyleContext:29`, `QualityContext:18`) are the large, fast-changing ones: the pattern is known here, applied where it mattered least. (verified) Context vs. store: `caching-state/06`.

---

## 4. The render path nobody memoized

`app/api/player-data/route.ts:44` ships up to **50,000 pitch rows** to the browser; `lib/hooks/usePlayerData.ts` then:

```ts
const filteredData = useMemo(() => applyFiltersToData(seasonFilteredData, activeFilters),
  [seasonFilteredData, activeFilters])            // :256 — synchronous, in render
useEffect(() => {                                 // :262 — 300 ms debounce
  const t = setTimeout(() => setData(filteredData), 300)
  return () => clearTimeout(t)
}, [filteredData])
```

1. **The debounce is on the wrong side of the cost.** The 50k-row scan runs eagerly in render on every filter change; the timeout delays only the copy into state. A debounce after the work has blocked paint is decoration. (verified)
2. **Derived state stored in state.** React's docs reject mirroring a render-computable value into state via an effect. It costs a second render per filter change and exports two copies of the list. (documented)

**Zero `useDeferredValue`, `useTransition`, `startTransition` or `useSyncExternalStore` call sites repo-wide.** (verified) Off-thread: `08-web-workers-offthread.md`; rows: `03-client-vs-server-computation.md`.

---

## 5. Per-row cost and list keys

57 files render a `<tbody>` and no virtualization library exists, but row counts are mostly bounded upstream — `PitchLogTab.tsx:29` paginates at `perPage = 50`, `trends/page.tsx:566-568` slices to 20. Virtualization is `01-rendering-large-datasets.md`; what survives here is the work *above* the table. `PitchLogTab.tsx:37` runs an unmemoized `[...data].sort(...)` — up to 50,000 rows copied and sorted on **every** render, to display 50 — with `sortCol`, `sortDir`, `page` in local state, so every header click redoes it. `StreamDeckGrid.tsx:616`'s shape, an order of magnitude worse. Sort the page, or memoize on `[data, sortCol, sortDir]`. (verified)

**29 sites render `<tr key={i}>`**, binding React's identity to *position* — a documented hazard once a list reorders or filters:

| Consequence | Where it bites |
|---|---|
| Reconciliation rewrites text into existing cells instead of moving rows | `explore/page.tsx:163` — `<tr key={i}>`, sorting at `:154`; `PitchLogTab.tsx:97` |
| Per-row DOM state (focus, scroll, video position) follows the slot, not the row | Any keyed row that later gains an input |

Keying by real identity (`pitch_id`, `game_pk`+`at_bat`+`pitch_number`) is free. Index keys on static lists — skeletons, `**bold**` fragments at `work/channels/page.tsx:21-23` — are fine; 139 of 1,023 keyed elements use an index and only the data rows matter. (verified)

---

## 6. React Compiler: a rejected fix, and what would reopen it

Triton disabled React Compiler because it caused **state-reset bugs**; `next.config.ts` carries no `reactCompiler` key and `babel-plugin-react-compiler` is pinned at exactly `1.0.0`. (verified) Settled, unless the following changes.

React's debugging guide names one primary failure mode — code "written to rely on memoization for correctness … effects over-firing, infinite loops, or missing updates" — and says runtime issues "typically happen when your code violates the Rules of React in subtle ways the compiler couldn't detect." (documented)

Triton has such a violation shipping now. `components/visualize/template-builder/InputSectionsPanel.tsx` declares **seven components inside its own body** (`:166`–`:372`) and renders them as JSX (`:282-284`, `:525`). Each parent render yields a new function identity, React treats it as a different component type, and the subtree unmounts and remounts — **state reset, and the controlled `<input type="date">` at `:381` loses focus mid-keystroke.** `GlobalFilterPanel.tsx:124,134`, same directory, adds two more. (verified) It is (inferred), not proven, that this violation class is what the compiler surfaced — nobody kept the failing component name — but it fits the documented failure mode better than the alternative does. What would justify revisiting:

1. Run `npx eslint` with the compiler-powered rules in **`eslint-plugin-react-hooks` 7.0.1**, already installed via `eslint-config-next` 16.1.6 — zero runtime risk. Flags on the nested-component or purity rules mean the compiler was reporting a real bug.
2. Fix them: hoist the nine nested components to module scope — worth doing regardless.
3. Re-enter via **`reactCompiler: { compilationMode: 'annotation' }`**, compiling only functions marked `"use memo"`. Annotate one leaf, ship, watch; Babel `overrides` and runtime `gating` are the documented alternatives.
4. Only then consider global enablement, never as step one: stable in Next 16 but off by default, Babel-based, slower to build, and pinned to an exact version as the compiler team advises when tests are weak. (documented)

---

## 7. What Triton should do, in order

1. **Profile first** — the broadcast editor with a countdown running and a video playing, and the player page during a filter change (`11-profiling-measurement.md`). Everything below is a hypothesis until it exists.
2. **Fix the nine nested component declarations** (`InputSectionsPanel.tsx`, `GlobalFilterPanel.tsx`). Lost focus and reset state is a correctness bug; it does not wait on the profile.
3. **Move the debounce in front of the work** at `usePlayerData.ts:256-269`: debounce `activeFilters` or defer the list with `useDeferredValue`, and delete the effect copying a memoized value into state.
4. **Split the high-frequency writers out of `BroadcastContext`** — `videoTimeRemaining`, `widgetState.countdown.remaining` — so a 4–66 Hz event stops re-rendering a 79-field object read by 21 components.
5. **Memoize the four remaining provider values** as `useTheme.tsx:39` does, and `PitchLogTab.tsx:37` on `[data, sortCol, sortDir]`.
6. **Key the 29 index-keyed data tables by row identity**, sortable ones first.
7. **Run the compiler lint rules** (§6); record the result in `planning.md`.

**Anti-recommendation: do not wrap the 21 `BroadcastContext` consumers in `React.memo` and call the cascade fixed.** *It does not work* — `memo` compares props, and a context update re-renders consumers regardless of props; documented, and the commonest misconception about `memo`. *It would not survive the data* — even with a memoized value, a 79-field object holding a field that changes at 4–66 Hz yields a new value every tick; frequency, not identity, is the problem. *It spends the wrong budget* — 21 prop comparisons on a never-profiled codebase optimizes a guess, and 358 `useCallback`s are what that habit produced.

**Highest-leverage next action:** record one React DevTools Profiler session on `app/(broadcast)/broadcast/[projectId]` with a countdown running and a video playing, and report commits per second plus the top three components by render time. That trace promotes §3 to (verified), or kills it.

---

## Sources

1. React — [`useCallback`](https://react.dev/reference/react/useCallback) — the three cases where it pays; the "always new value" rule.
2. React — [`useMemo`](https://react.dev/reference/react/useMemo) — the "is this expensive?" test §4's filter never faced.
3. React — [`memo`](https://react.dev/reference/react/memo) — props-only comparison; why §7's anti-recommendation fails.
4. React — [`useContext`](https://react.dev/reference/react/useContext) — objects and functions in a value; §3's fix.
5. React — [`useDeferredValue`](https://react.dev/reference/react/useDeferredValue) — the primitive §4's `setTimeout` imitates.
6. React — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — `usePlayerData.ts:262`'s pattern.
7. React — [Rendering Lists](https://react.dev/learn/rendering-lists) — why index keys break on reorder; §5.
8. React — [Keeping Components Pure](https://react.dev/learn/keeping-components-pure) — the rule §6's components break.
9. React — [Rules of React](https://react.dev/reference/rules) — the contract the compiler assumes; §6.
10. React — [React Compiler debugging](https://react.dev/learn/react-compiler/debugging) — the failure mode reframing the bug.
11. React — [React Compiler adoption](https://react.dev/learn/react-compiler/incremental-adoption) — annotation mode; §6.
12. React — [React Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1) — the analyzer as lint rules; pinning advice.
13. Next.js — [`reactCompiler`](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler) — stable, off by default.
14. MDN — [`timeupdate`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/timeupdate_event) — the 4–66 Hz figure in §3.

**Triton-internal evidence (repo read 2026-08-21 at commit `6555039`; no profiler run, no production query).** Packet: 358 `useCallback`, 121 `useMemo`, 355 `'use client'`, 57 `<tbody>` files, 0 virtualization libraries, 0 Web Workers; React **19.2.3** on Next **16.1.6**; suite 5 failed / 24 skipped of 122; `LIMIT 50000` at `app/api/player-data/route.ts:44`. Counted by reading the repo: `memo(` across `app/ components/ lib/` = **0**; 396 `useCallback` declarations, **272** in no dependency array in their own file; `useDeferredValue|useTransition|startTransition|useSyncExternalStore` = **0**; 1,023 `key={` sites, **139** index-keyed, **29** `<tr key={i}>`; 9 `createContext` modules, 4 with a memoized value; `BroadcastContext.tsx` 20 `useState` / 59 `useCallback` / 0 `useMemo`, value `:1420-1439` (~79 fields; interface `:15-115`, 76 members), 21 `useBroadcast()` consumers. Every other `file:line` above was read on the same date. No millisecond claim here is (verified); §7 step 1 is how one would become so.
