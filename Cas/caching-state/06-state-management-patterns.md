---
title: State Management Patterns — Which Facts You Own and Which You Are Only Borrowing
domain: caching-state
tags:
  - server-state
  - client-state
  - derived-state
  - react-query
  - context
  - invalidation
  - state-duplication
sources_reviewed: 10
last_updated: 2026-08-21
---

# State Management Patterns — Which Facts You Own and Which You Are Only Borrowing

> Grades: **(verified)** read at `file:line` or from the shared packet; **(documented)** vendor docs;
> **(inferred)** mechanism, not measured; **(cargo-cult)** habit without support. No DB query was run.
> Render *cost* is `Cas/frontend-data-scale/05-react-rendering-performance.md`; this doc owns where
> state lives.

## TL;DR

- **`usePlayerData` exports `data`, `allData`, `seasonFilteredData`, `filteredData` and `resultCount`; the dashboard renders three of them at once, two of them 300 ms behind the third.** (verified)
- **`filteredData` — the synchronous, correct value — is exported by both player hooks and read by nothing outside them.** (verified)
- **Only 8 of 99 client files that fetch `/api/` use react-query; the other 91 hold server data in `useState` with no cache identity and no revalidation.** (verified)
- **`lib/queryKeys.ts` gives every server fact a typed key — genuinely good design — yet 24 `useQuery` sit beside 0 `useMutation`, 0 `setQueryData` and 1 `invalidateQueries`: a fetch-once memo, not a synchronizing cache.** (verified)
- **For immutable historical baseball data `staleTime: Infinity` is usually right — `useStandings.ts:25` proves the team knows it; the defect is that eight other sites made the call implicitly.** (verified)
- **12 of 29 `setX(prev => …)` updaters in `BroadcastContext` do a network write or a Realtime broadcast inside the updater, which StrictMode double-invokes in development.** (verified)
- **Derived state computed over "whatever the fetch returned" lets the cache hold two entries that disagree about the same pitch, neither wrong by its own definition.** (verified)
- **Adding a store library would solve none of this: Triton has no client-state problem, it has a server-state-copied-into-client-state problem.** (inferred)

---

## 1. The only three categories that matter

| | **Server state** | **Client state** | **Derived state** |
|---|---|---|---|
| Owns the truth | Postgres | the tab | nobody — it's a function |
| Can go stale | yes, silently | no | only if inputs do |
| Correct home | react-query cache | `useState` / context / URL | computed in render |
| Triton example | pitch rows, assets | `tab`, `selectedAssetId` | `seasonFilteredData` |

TanStack is explicit — it "is a **server-state** library" and "is not a replacement for local/client
state management" — and React's column-three rule is that anything calculable during rendering
"**should not**" go into state. (documented) Every finding below violates one of those two sentences.

---

## 2. Where Triton's state actually lives

| Home | Scale | What's in it |
|---|---|---|
| react-query | **24** `useQuery` in **8** files | pitches, standings, scores, trends, ABS, explore, baselines |
| `useState` in a client file that fetched `/api/` | **91 of 99** such files | everything else, including all of broadcast |
| React context | **9** providers | 4 with memoized values, 5 without |

**1,454 `useState` call sites** against 24 `useQuery`, **zero** store libraries in `package.json`, and
no `useMutation` or `setQueryData` at all — so no write path updates a read path. (verified)

---

## 3. The central defect: one fact, three copies, three clocks

`lib/hooks/usePlayerData.ts` fetches up to 50,000 pitch rows into react-query (`:142-154`), then:

```ts
const allData = pitchQueryData?.cleaned ?? []                       // :156  cache
const seasonFilteredData = useMemo(…, [allData, seasonType])        // :243  derived, sync
const filteredData      = useMemo(…, [seasonFilteredData, filters]) // :256  derived, sync
useEffect(() => { const t = setTimeout(() => {                      // :263
  setData(filteredData); setResultCount(filteredData.length)        // :265-266  copies, +300 ms
}, 300); return () => clearTimeout(t) }, [filteredData])
```

Lines 243 and 256 are correct. Line 263 copies a render-computable value into state through a timer,
and `:266` stores a **length** in state too. The hook exports all five (`:277-301`);
`useHitterData.ts:258-271` is verbatim identical and two MiLB pages re-implement it inline — four
copies. `app/(research)/player/[id]/page.tsx` then renders three of the five **simultaneously**:

| Element | Reads | Season filter | Chip filters | Lag |
|---|---|---|---|---|
| `:95-96` "N pitches / M games" | `seasonFilteredData` | yes | **no** | 0 ms |
| `:125` "N pitches (filtered)" | `resultCount` | yes | yes | **300 ms** |
| `:132-142` all 10 tab bodies | `data` | yes | yes | **300 ms** |
| `:103` report generation | `allData` | **no** | **no** | 0 ms |

For 300 ms after every filter change those disagree, and while a filter is active the header count
never agrees with the chip count at all — different populations, same unit, adjacent on screen. That
the report path silently ignores the analyst's filters is (verified); whether it should is a product
question. And `filteredData` — synchronous, filtered, correct — has **zero consumers outside the two
hooks**: the right answer is computed, exported, and discarded.

---

## 4. `staleTime: Infinity`: right answer, unwritten reasoning

Global config is one object — `staleTime` 5 min, `gcTime` 10 min, `retry` 1,
`refetchOnWindowFocus: false` (`lib/QueryProvider.tsx:12-15`). With focus refetch off,
`staleTime: Infinity` means **never revalidates for the life of the tab**. Nine sites set it.

| Site | Data | Verdict |
|---|---|---|
| `useStandings.ts:25` | `season < currentYear ? Infinity : 5 min` | **The correct shape** — immutable past, live present |
| `useTrendsData.ts:178,188` | trends tab for a **season** | Wrong for the current season — the bug `useStandings` avoids |
| `usePlayerData.ts:227` · `useHitterData.ts:228` | deployed model list | Wrong-ish: a new model needs a reload to appear |
| The other five sites | season and option lists, league averages | Defensible |

Four of the nine are arguably wrong and five defensible — not a bad ratio. What is missing is any
record of *which*: no comment, no shared constant, so a reader cannot distinguish "frozen because the
data cannot change" from "frozen because 5 minutes felt short." `useStandings.ts:25` is the pattern to
hoist — make the *reason* the code. (`Infinity` still honors `invalidateQueries()`, documented.)

**Where it bites hardest:** `planning.md:301` records `league_averages` 46 days stale, and
`useLeagueBaseline.ts:48` freezes that baseline per tab — a percentile against a frozen copy of an
already-stale denominator. The refresh is Jo's, the population's legitimacy Li's; mine is narrower —
**the UI could have known.** `mv_last_refreshed` is read in 3 server files and 0 components.

---

## 5. `BroadcastContext`: three kinds of state in one bag

56,083 B, 21 `useState`, 60 `useCallback`, **0** `useMemo`, an inline ~79-field object literal as the
provider value (`:1420-1440`), 22 consumers. React reserves context for theming, current account,
routing, and app-wide state; this is all four plus the broadcast data layer. (documented)

| What's in the bag | Category | Belongs in |
|---|---|---|
| `project`, `assets`, `segments`, `segmentAssets` (fetched `:266-332`) | **server** | react-query, keyed by `projectId` |
| `widgetState` — loaded `:299`, written back at 14 `fetch` sites | **server, mirrored** | query + mutation |
| `selectedAssetId`, `previewingAssetId`, `widgetPanelMode` | **client** | context (correctly) |
| `videoTimeRemaining` (4–66 Hz) · `obsState` | client, high-frequency · external | its own provider · an external-store subscription |

`:266-332` is the whole server layer: five endpoints, one `useEffect` keyed on `[projectId]`, results
pushed into five `useState`s, errors sent to `console.error`, and no revalidation path other than
three hand-rolled `reloadAssets` / `reloadSegments` / `reloadSegmentAssets` callbacks (`:334-378`) —
`invalidateQueries` with the dedup, retry, and shared-instance guarantees removed. **Zero `useQuery`
calls exist under `components/broadcast/` or `app/(broadcast)/`**: the surface TanStack's own docs
name as needing a client-state manager is the surface with neither. (verified)

### The impurity is a state bug, not a style nit

`goToTopic` (`:812-823`) is representative: inside `setWidgetState(prev => { … })` it calls
`sendEvent('widget:topic-change', …)` and `fetch('/api/broadcast/widget-state', { method: 'PUT' })`
before returning the next state. **12 of the 29 `setX(prev => …)` updaters here do this** (`:813`
through `:1077`). React documents updaters as pure, and StrictMode "calls some of your functions
(only the ones that should be pure) twice in development … functions that you pass to `useState`,
`set` functions, `useMemo`, or `useReducer`"; Next.js has had Strict Mode on by default under the App
Router since 13.5.1 and `next.config.ts` does not disable it, so in development each fires **two**
POSTs and **two** Realtime events per action. Production is single-invoked today, but this is the
violation class behind React Compiler's rejection here (`05-react-rendering-performance.md` §6).
Moving the calls after `setState` costs nothing.

---

## 6. Derived state whose definition depends on the payload

`lib/enrichDerivedFields.ts:38-52` computes `cluster` / `hdev` / `vdev` as distance from a centroid
accumulated over `allRows` — whatever the fetch returned — and `/api/player-data` caps at
`ORDER BY game_date DESC LIMIT 50000` (`route.ts:44`), so a career fetch can truncate a season a
`?year=` fetch returns whole. Same pitch, two centroids, two `cluster` values.

The state consequence is specific. `enrichDerivedFields` runs **inside the `queryFn`**
(`usePlayerData.ts:149`), so those values are baked into the cache entry, and
`queryKeys.playerPitches(id, year)` versus `(id, null)` are two entries (`lib/queryKeys.ts:19`) that
coexist in one tab after a year-selector change. **The cache can hold two entries that disagree about
the same pitch's derived value, neither wrong by its own definition.** Cache keys identify the
*request*; they cannot identify a value whose meaning depends on the request. Established in
`Cas/frontend-data-scale/03-client-vs-server-computation.md`; population legitimacy is Li's, and what
`cluster` should mean is Soto's.

---

## 7. What Triton should do, in order

1. **Delete the duplication in `usePlayerData` / `useHitterData`.** Remove `data`, `resultCount`, and
   the `setTimeout` effect; debounce `activeFilters` upstream; render `filteredData`. Two hooks,
   ~15 lines; kills §3's three-clock display and one render per keystroke.
2. **Encode the `staleTime` reason.** Export `immutableSeasonStaleTime(season)` from `lib/queryKeys.ts`
   and route all nine sites through it; fixes `useTrendsData.ts:178,188` as a side effect.
3. **Move `fetch` and `sendEvent` out of the 12 impure updaters** in `BroadcastContext.tsx`: purely
   mechanical, and it removes a StrictMode double-write.
4. **Move `project` / `assets` / `segments` / `segmentAssets` into react-query** keyed by `projectId`,
   replacing the three `reload*` callbacks with `invalidateQueries`; context then keeps only
   `selectedAssetId`, `previewingAssetId`, `widgetPanelMode`, and the OBS handle.
5. **Surface `mv_last_refreshed`** next to any number computed against `league_averages`.

**Anti-recommendation: do not add Zustand (or Redux, or Jotai) to "fix state management."** *It targets
a problem Triton does not have* — §2–§3 diagnose server data copied into client state, and a
client-state library is one more place to copy it to. *TanStack's own docs say so* — client-state
managers are for "substantial synchronous, client-only state," and their worked example of a surface
needing one is a visual designer, precisely the broadcast editor whose real problem is a hand-rolled
data layer. *It would cost the one asset this domain has* — `lib/queryKeys.ts` gives server state one
coherent identity scheme, and a second key space makes "which copy is current?" unanswerable, which
is exactly what §3 already cannot answer with a single cache.

**Highest-leverage next action:** delete `data`, `resultCount`, and the `useEffect` at
`usePlayerData.ts:263-269`, return `filteredData` under the name `data`, and confirm the pitcher
dashboard's header and chip counts agree at every instant during a filter change. One file, and it
turns this doc's central claim into a shipped fix.

---

## Sources

1. React — [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) — "avoid redundant state" / "avoid duplication in state," the rules §3 breaks.
2. React — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — why `usePlayerData.ts:263` is the wrong shape.
3. React — [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context) — the "before you use context" ladder §5 grades against.
4. React — [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context) — what `BroadcastContext` becomes minus its server state.
5. React — [`useState`](https://react.dev/reference/react/useState) — the updater purity contract §5's 12 calls violate.
6. React — [`StrictMode`](https://react.dev/reference/react/StrictMode) — the double-invoked list, `set` functions included.
7. Next.js — [`reactStrictMode`](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactStrictMode) — on by default since 13.5.1, so §5's doubling applies here.
8. TanStack Query — [Does This Replace Client State?](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state) — §1's split; the anti-recommendation's second ground.
9. TanStack Query — [Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) — refetch triggers; `Infinity` still honors invalidation (§4).
10. TkDodo — [React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager) — what copying cache into local state forfeits.

**Triton-internal evidence.** Read 2026-08-21; no database query, no profiler. Grepped across `app/ components/ lib/`: **24** `useQuery` in 8 files, **0** `useMutation`, **0** `setQueryData`, **1** `invalidateQueries` (`useABSData.ts:196`); **1,454** `useState` call sites; **99** `'use client'` files fetching `/api/`, **8** of them using react-query; **9** `createContext` modules; **45** `localStorage`, **0** `sessionStorage`, **8** `useSearchParams`; **0** store libraries in `package.json`. Read directly: `lib/QueryProvider.tsx:12-15`; `lib/queryKeys.ts:19`; `usePlayerData.ts:142-154, 149, 156, 243, 256-259, 263-269, 277-301`; `useHitterData.ts:258-271`; `app/(research)/player/[id]/page.tsx:32-37, 95-96, 103, 125, 132-142`; `components/mobile/MobilePlayerDashboard.tsx:292-296` — no `filteredData` in any destructure repo-wide; `app/(milb)/milb/player/[id]/page.tsx:93-105`; `app/api/player-data/route.ts:44`; `lib/enrichDerivedFields.ts:38-52`; the nine `staleTime` sites listed in §4; `BroadcastContext.tsx` (21 `useState`, 60 `useCallback`, 0 `useMemo`; `:266-332`, `:334-378`, 12 impure updaters of 29 spanning `:813`–`:1077`, value `:1420-1440`, 22 consumers), and `next.config.ts` has no `reactStrictMode` key. Packet-supplied: `planning.md:301`; `mv_last_refreshed` in 3 server files, 0 components.
