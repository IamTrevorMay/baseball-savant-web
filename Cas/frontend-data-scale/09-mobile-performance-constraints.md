---
title: Mobile Performance Constraints — The Split Saves Pixels, Not Work
domain: frontend-data-scale
tags:
  - mobile
  - memory-pressure
  - touch-targets
  - main-thread
  - network-variability
  - device-split
  - compete
sources_reviewed: 12
last_updated: 2026-08-21
---

# Mobile Performance Constraints — The Split Saves Pixels, Not Work

> Grades: **(verified)** read at `file:line` or from the central packet; **(documented)** vendor spec;
> **(inferred)** mechanism or arithmetic. No device was profiled, so every device-level claim is
> (documented) or (inferred) by construction. No production query was run.

## TL;DR

- **The split changes layout, not workload: the desktop hook fetches and enriches, *then* the component branches** (`player/[id]/page.tsx:29` vs `:42`). (verified)
- **A phone can be handed 50,000 rows × 71 fields — ~3.55M scalar values, plus ~450k added by enrichment** (`route.ts:5,44`; `enrichDerivedFields.ts:7`), and the failure mode that follows is **termination, not slowness**. (documented)
- **Mobile bounds the pixels, not the arithmetic: it renders 10 and 30 rows (`MobilePlayerDashboard.tsx:172,589`) derived from up to 50,000, via five `useMemo`s and 95 array passes.** (verified)
- **The service worker's offline fallback cannot fire**: `caches.match()` returns a Promise so the `||` is dead, `/offline` is never precached, `/api/` is excluded (`public/sw.js:3-5,21-27,45-49`). (verified)
- **Targets are sized for a mouse and no device signal is read**: 99 `text-[10px]`, zero `min-h-[44`, zero `touch-action`, zero `deviceMemory`. (verified)
- **`MobileChartWrapper`'s tap-to-load is the only pattern in `components/mobile/` that reduces work instead of rearranging it — used twice.** (verified)
- **Compete — athletes, phones, facility — has no mobile path**: 0 `useDevice`, 0 `components/mobile` imports, 21 responsive utilities in 4,735 lines. (verified)
- **"Ship a mobile component" is where this platform stopped, and it is the half that helps least.** (inferred)

---

## 1. What `useDevice()` actually switches

`DeviceProvider` is one `matchMedia('(max-width: 767px)')` listener defaulting to
`{ isMobile: false, isLoading: true }` and resolved only inside `useEffect`
(`lib/hooks/useDeviceContext.tsx:10,18-28`). The server render is therefore always desktop-shaped, and
consumers gate on `isLoading` with `return null` — a blank frame, not a skeleton
(`app/(research)/player/[id]/page.tsx:40`). **18 of 96** `page.tsx` files call `useDevice`; the other
78 render the desktop tree at whatever width the phone reports. (verified)

The order is the whole story: `const player = usePlayerData(pitcherId)` runs at `:29`, unconditional
fetch and enrich; the `isMobile` branch that returns `<MobilePlayerDashboard player={player} />` is at
`:42`. `MobileTrends` has the same shape (`MobileTrends.tsx:13`). Both are **presentation layers over
the desktop data hook** — a rendering decision made after the expensive one already was. (verified)

---

## 2. The payload is device-blind

`app/api/player-data/route.ts:5` lists **70 columns**; `:44` ends `LIMIT 50000`; the join adds
`batter_name`. Worst case ≈ **3.55M scalar fields** in one response, after which
`lib/enrichDerivedFields.ts:7-35` mutates every row in place with up to nine more (`vaa`, `haa`,
`pfx_x_in`, `pfx_z_in`, `brink`, `vs_team`, `cluster`, `hdev`, `vdev`) — ~**4.0M fields** resident,
then re-walked by `buildOptionsCache` (`usePlayerData.ts:151`). None of it is device-conditional. (verified)

What that costs in bytes is arithmetic, not measurement. Each row is a V8 object of ~79 named
properties plus strings; at 16–24 bytes amortized per field the array alone lands in the **tens of
megabytes, plausibly 50–150 MB**, held ten minutes past the last observer by `gcTime`
(`QueryProvider.tsx:13`). `performance.measureUserAgentSpecificMemory()` on-device would settle it.
(inferred) One mitigation ships already — the `year` parameter (`route.ts:32-36`), documented as
taking 50K rows to ~5K. Nothing makes it the mobile *default*. (verified)

---

## 3. Memory pressure is a termination question

On iOS Safari and WKWebView a content process exceeding its limit is killed by **jetsam**: "A problem
repeatedly occurred", then a full reload. On Chrome for Android, **Page Lifecycle** freezes background
tabs and then **discards** them. Neither vendor publishes a per-tab byte ceiling a page can plan
against. (documented)

Android bites hardest, and as a *composition* failure rather than a memory one. A discarded tab
restarts the page, re-running `/api/player-data` — a fetch with `retry: 1` (`QueryProvider.tsx:14`),
**no `loading.tsx` and no `error.tsx` anywhere in the App Router tree** (packet: 0 of 96 pages), and a
service worker that declines `/api/`. (verified) Loading states are `10-perceived-performance.md`;
the narrower point is that **a missing loading state is a mobile availability problem, not a polish
problem**, because mobile is the only place the page restarts itself unasked. (inferred)

---

## 4. CPU: everything competes with the scroll

There are **no Web Workers** — no `*.worker.ts`, no `new Worker(` (packet) — so all of it runs on the
thread that services touch (`08-web-workers-offthread.md`), and a phone's big core is roughly a third
of a laptop's. (inferred) `MobilePlayerDashboard.tsx` concentrates the cost: five `useMemo` blocks at
`:300-304` (`computeSummary`, `computeArsenal`, `computeResults`, `computeGameLog`, `computeRanks`),
all keyed `[data]`; `computeSummary` alone (`:40-113`) makes ~15 full passes; **95** array-iteration
call sites file-wide. All five invalidate together on every season toggle (`:377-390`), so a tap on a
10-px chip triggers five full re-derivations — a mobile-authored component doing *more* per-row work
than the desktop tabs it replaces, because each desktop tab derives only its own slice. (verified) The
Long Animation Frames API on-device, or field INP, would settle it. (documented)

`MobileChartWrapper` is the exception and the template: `:6` loads Plotly via
`dynamic(..., { ssr: false })`, `:54-68` renders a *tap-to-load* placeholder so neither chunk nor
chart cost is paid until asked, `:16-21` disables the mode bar and `scrollZoom` — used in two files
(`:566`, `MobileHitterDashboard.tsx:575`). Plotly's weight is `02-plotly-performance.md`;
**tap-to-load is the only pattern in `components/mobile/` that reduces work rather than rearranging
it.** (verified)

---

## 5. Touch and density

TruMedia density on `zinc-950` is right for the analyst surface and at odds with a fingertip
(presentation is `Cas/analytics-ux/`):

| Guideline | Minimum | Triton mobile |
|---|---|---|
| Apple HIG | 44 × 44 pt | **0** `min-h-[44` |
| Material Design | 48 × 48 dp | **0** `min-h-[48` |
| WCAG 2.2 SC 2.5.8 (AA) | 24 × 24 CSS px | Season chips (`:379`): `px-2 py-0.5 text-[10px]` → **~18 px** |

Also across `components/mobile/*.tsx`: **99** `text-[10px]`, **28** `text-[11px]`, **0** each of
`touch-action`, `touch-manipulation`, `overscroll`, `will-change`. (verified) WCAG's 24 px is a floor;
both vendors set nearly double it. (documented)

Row count is *not* the mobile problem, worth saying plainly because it is the obvious guess.
`MobilePlayerDashboard` caps its results table at `.slice(0, 10)` (`:172`) and its game log at
`.slice(0, 30)` (`:589`); the one generic dense table, `MobileDataTable.tsx`, maps every row handed to
it (`:41`) inside an `overflow-x-auto` wrapper with two `position: sticky` columns (`:24,29,48`) — and
has **zero call sites**. **The phone renders tens of rows derived from tens of thousands: the split
bounds the pixels and not the arithmetic.** (verified) Windowing is `01-rendering-large-datasets.md`;
per the packet's correction most Triton tables are bounded upstream already, so `content-visibility:
auto` is the only escalation this side needs. (documented)

---

## 6. Network variability

`route.ts:55` sets `Cache-Control: public, max-age=300, stale-while-revalidate=3600` — right instinct,
helps a warm return, does nothing for the cold load in a dugout. Three gaps compound. **The service
worker excludes `/api/`** (`public/sw.js:21-27`), so the platform's largest response is never
offline-available. **The offline fallback is unreachable**: `install` precaches nothing (`:3-5`),
navigations are network-first and never cached (`:45-49`), and
`caches.match('/offline') || new Response('Offline', {status:503})` never reaches its right-hand side,
because `caches.match` returns a Promise and a Promise is always truthy. And **`retry: 1` with no
error boundary** turns one transient failure into an unhandled state. (verified)

Nothing in `app/`, `components/` or `lib/` reads `connection.effectiveType`, `saveData`,
`deviceMemory` or `hardwareConcurrency`. The browser will volunteer that it is on a `2g` link or a
2 GB device; Triton never asks — which makes "cap the rows on mobile" a guess, not a policy. (verified)

---

## 7. Compete has the least mobile code and the most mobile users

Compete is athlete-facing and reached from the global `MobileTabBar` (`:8-18`). It has **0**
`useDevice` call sites, **0** imports from `components/mobile/`, **21** responsive utilities across 13
files and 4,735 lines, and **5** `<tbody>` files, one of them 74,112 B. (verified) **The surface with
the most phone-native audience got the least phone-native engineering** — what happens when the mobile
strategy is a fork someone has to remember to make. (inferred)

---

## 8. What Triton should do, in order

1. **Make the payload device-aware at the hook, not the component.** Pass `isMobile` into
   `usePlayerData`; default mobile to the current season via the existing `year` parameter
   (`route.ts:32-36`, documented as 50K → ~5K). ~10× less to transfer, parse and retain — the only
   item here that reduces memory.
2. **Fix the offline fallback**: `await caches.match('/offline')`, precache `/offline` in `install`,
   and decide whether `/api/player-data` gets a SWR entry.
3. **Add `loading.tsx` and `error.tsx` on the 18 split routes**, not all 96 — the post-eviction
   recovery path, which only mobile takes.
4. **Collapse the five memos at `MobilePlayerDashboard.tsx:300-304`** into one pass over `data`,
   computing only the active tab's.
5. **Raise the tap targets**: `min-h-[44px]` on the chips at `:379` and the tab bar; keep
   `text-[10px]` and buy the size with padding. Delete `MobileDataTable.tsx` while you are there —
   zero call sites, and its sticky-columns-in-horizontal-scroll pattern is the one not to copy.
6. **Instrument before the next change**: a LoAF observer plus one
   `measureUserAgentSpecificMemory()` sample per session into `@vercel/analytics` — what would convert
   this doc's (inferred) device claims.

**Anti-recommendation: do not build more `components/mobile/*` forks, starting with a
`MobileCompete`.** Three independent grounds. *It misses the constraint* — the fork happens downstream
of fetch and enrichment, so it inherits the same 50,000 rows and 4.0M resident fields, and §4–§5 show
a fork can raise CPU cost while lowering pixel cost. *It doubles the honesty surface* — null and
coverage rules already diverge across the two trees (`Cas/analytics-ux/01-honest-data-presentation.md`
found `MobilePlayerDashboard.tsx:79,107` dropping nulls where desktop substitutes a different metric),
so each fork is another place a fix must be applied twice and will not be. *It scales the wrong way* —
18 of 96 pages have a split, which is the fork model's demonstrated adoption rate.

**Highest-leverage next action:** thread `isMobile` into `usePlayerData` and default mobile to the
current season. One argument against a parameter that already exists; the only step that reduces
memory rather than rescheduling CPU; and it removes the condition — a 50,000-row array resident on a
phone — that makes termination and discard likely at all.

---

## Sources

1. Apple — [Jetsam event reports](https://developer.apple.com/documentation/xcode/identifying-high-memory-use-with-jetsam-event-reports) — §3's iOS termination mechanism.
2. Chrome — [Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) — §3's discard path and the refetch it forces.
3. MDN — [`measureUserAgentSpecificMemory()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory) — what turns §2's MB range into a number.
4. Chrome — [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames) — attributing §4's passes to dropped frames.
5. Apple — [HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — §5's 44 pt minimum.
6. Material Design — [Accessibility](https://m2.material.io/design/usability/accessibility.html) — §5's 48 dp counterpart.
7. W3C — [SC 2.5.8 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — the 24 px AA floor §5's chips miss.
8. MDN — [`content-visibility`](https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility) — the fallback if §5's rows grow.
9. MDN — [`NetworkInformation.effectiveType`](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/effectiveType) — the signal §6 shows Triton never reads.
10. MDN — [`Navigator.deviceMemory`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory) — the RAM signal behind §8 step 1.
11. TanStack Query — [Network mode](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode) — `retry: 1` when signal drops; §6.
12. Plotly.js — [Configuration options](https://plotly.com/javascript/configuration-options/) — the keys `MobileChartWrapper.tsx:16-21` sets.

**Triton-internal evidence (repo read 2026-08-21 at commit `6555039`; no production query, no device profiled).** Every `file:line` in §1–§8 was read directly; the counts behind them: **18 of 96** `page.tsx` call `useDevice` (`lib/hooks/useDeviceContext.tsx:10,12,18-28`; `app/layout.tsx:49`; `app/(research)/player/[id]/page.tsx:29,40,42`; `components/mobile/MobileTrends.tsx:13`). Payload **70** columns (`app/api/player-data/route.ts:5`) × `LIMIT 50000` (`:44`) + a joined `batter_name` = **3.55M** fields, plus up to **9**/row (~**450k**) from `lib/enrichDerivedFields.ts:7-35` and its centroid pass at `:38`, re-walked at `usePlayerData.ts:151`; caching `lib/QueryProvider.tsx:12-15`. `components/mobile/MobilePlayerDashboard.tsx` is 672 lines / 28,460 B, **95** array-iteration call sites (22 in `MobileTrends.tsx`), rows bounded at `:172`, `:589`. Across `components/mobile/*.tsx`: **99** `text-[10px]`, **28** `text-[11px]`, **0** each of `min-h-[44`, `min-h-[48`, `touch-action`, `touch-manipulation`, `overscroll`, `will-change`; `MobileDataTable.tsx` has **0** call sites. `app/offline/page.tsx` exists; SW at `components/ServiceWorkerRegistration.tsx:9`. Absent throughout `app/`, `components/`, `lib/`: `navigator.deviceMemory`, `navigator.connection`, `hardwareConcurrency`, `content-visibility`, `IntersectionObserver`. Compete: 13 `.tsx` / **4,735** lines, **0** `useDevice`, **0** `components/mobile` imports, **21** responsive utilities, **5** `<tbody>` files; `MobileTabBar.tsx:8-18`. From the packet, with its 2026-08-21 virtualization correction: 96 pages, **0** `loading.tsx`, **0** `error.tsx`, **57** `<tbody>` files but no unvirtualized-table crisis, no virtualization library, no Web Workers. The `MobilePlayerDashboard.tsx:79,107` null-dropping divergence comes from `Cas/analytics-ux/01-honest-data-presentation.md`, not re-measured.
