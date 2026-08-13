---
title: Loading, Empty, Error, Partial, Stale — States That Don't Lie
domain: analytics-ux
tags:
  - loading-states
  - empty-states
  - error-recovery
  - partial-data
  - stale-data
  - skeleton-screens
  - realtime-degradation
  - nextjs-app-router
sources_reviewed: 10
last_updated: 2026-08-13
---

# Loading, Empty, Error, Partial, Stale — States That Don't Lie

> Grades: **(verified)** read at `file:line`; **(documented)** vendor docs; **(inferred)** mechanism; **(cargo-cult)** unsupported repetition. No production query was run.

## TL;DR

- **Triton's defining outage had no state for it.** `stuff_plus` fell 99.5% → 0% coverage Apr→Aug 2026 and every dashboard rendered a confident number, because the code knows only *loading* and *loaded*. **(verified)**
- **The missing state is `partial`, and it goes first.** Loading, empty, and error are visible failures; partial is invisible. `loaded` is a claim about the denominator, not the HTTP status. **(inferred)**
- **Zero `loading.tsx` and zero `error.tsx` files exist** in the App Router tree, spinners outnumber skeletons 70 files to 23, and the one Retry button re-renders the same failing children without refetching. **(verified)**
- **All 24 "No data" strings are ambiguous** between *empty dataset* and *your filter excluded everything* — and `FilterEngine` already computes `totalActive`, so this is threading, not invention. **(verified)**
- **Staleness is instrumented and unread**: `mv_last_refreshed`, `stuff_plus_n`, four `updated_at` columns, none reaching an analyst. `league_averages` sat 46 days stale in silence. **(verified)**
- **A 6h `queryCache` TTL plus a rescore-only job means stale can mean *contradicted*, not just old.** **(verified)**
- **On air a spinner is worse than a stale number** — the overlay's disconnect signal is an 8×8px dot on 1920×1080: right instinct, wrong size. **(verified)**
- **"Skeletons feel 30–50% faster" is cargo-cult** — repeated across UX blogs with no study behind it; NN/g warns a content-free skeleton reads as *broken*. **(cargo-cult)**

---

## 1. Seven states, not three

Most React code has three — `loading`, `error`, `data` — which cannot express the Stuff+ outage: a hollow response is `data`.

| State | Question it answers | Triton today |
|---|---|---|
| `loading` | We asked; nothing back | Yes — 70 files of spinners |
| `empty` | Query ran; the dataset has nothing | Ambiguous (§3) |
| `filtered-empty` | Query ran; *your inputs* excluded everything | Absent |
| `partial` | We have rows, but the denominator is short | **Absent — the outage** |
| `stale` | Real numbers, old ones | Absent (§5) |
| `degraded` | Live channel dropped; last-known shown | Overlay only, 8px (§6) |
| `error` | We failed; here is the way back | Present, non-recovering (§6) |

One rule makes that implementable: **the state is decided server-side and rides with the payload, as `{ value, n, coverage, asOf }` rather than a bare number.** A component cannot infer `partial` from an array — the route knows `COUNT(metric)` vs `COUNT(*)`, the component only knows `rows.length`. That envelope is what makes `partial` renderable.

Handoffs: *is the data there* is Jo's; *is `n` big enough* is Li's; null-vs-zero glyphs are `02-null-zero-unknown-ui.md`. **`Li/temporal-modeling/09-retroactive-restatement.md` hands "how do we tell the user the past changed" here: the surface obligation is a `stale` → `revised` transition with the prior value still legible, never a silent overwrite.**

---

## 2. Loading: skeleton, spinner, or nothing

NN/g's thresholds are duration-based, not taste **(documented)**:

| Wait | Treatment |
|---|---|
| < 1s | Nothing — a flashing indicator is worse than none |
| 1–2s | Spinner or nothing; below the attention-shift limit |
| 2–10s | Skeleton for full screens, spinner for a single module |
| > 10s | Determinate progress or streamed partial results; indeterminate spinners read as hung |

Triton inverts it: `app/(research)/player/[id]/page.tsx:46-50` gates the *entire* dashboard behind one full-screen spinner, then `:124` adds a second inline `dataLoading` spinner **(verified)**.

**Skeletons must be shaped like the content** — NN/g warns a header-and-blank-space skeleton reads as broken, and a dense table needs the right row count and column widths **(documented)**. And never skeleton a *number*: skeleton the chrome, state the value. Next.js 16 supplies `loading.tsx` (per-segment `<Suspense>` sugar) and `error.tsx` (a per-segment client boundary); Triton uses **neither, anywhere** **(verified)**.

---

## 3. Empty vs filtered-to-empty

| | Genuinely empty | Filtered to empty |
|---|---|---|
| Cause | Season not started; MiLB pre-2023 | Filter conjunction excludes all rows |
| Copy | "No pitches recorded for 2026 yet." | "No pitches match 4 active filters." |
| Action | Change season, or none | **Clear all (4)** — one click back |
| Misread as | "The tool is broken" | "This player has no data" |

The second is the dangerous one: a scout concludes a pitcher never threw a slider when a `release_speed` filter is still active from three players ago. `components/FilterEngine.tsx` already computes `totalActive`/`clearAll()` at `:95` and renders "Clear all (n)" at `:261-264` **(verified)** — the empty states just never receive that number. A props change, not a feature.

Carbon and NN/g agree on the payload — **say what happened, what would fill the space, and the one action that changes it** — which a centred grey "No data" satisfies in none of the three parts. A changing result count is also WCAG 2.2 SC 4.1.3's case: `role="status"`, present in the DOM from first paint **(documented)**.

---

## 4. Partial — the state that would have caught the outage

Every aggregate should answer *how many rows did you average, of how many you should have*: `coverage = COUNT(metric) / COUNT(*)` over the same filtered window.

| Coverage | Render |
|---|---|
| ≥ 0.95 | The number, plain |
| 0.60–0.95 | Number + coverage chip: `Stuff+ 104 · 78% cov · n=412` |
| 0.05–0.60 | Number de-emphasised, chip amber, tooltip names the gap |
| < 0.05 | **No number.** "Insufficient coverage (4%) — 2026-06-01 onward" |

April 99.5% / May 90% / June 18% / July 4% / August 0% crosses three of those bands in three months, on every dashboard, unprompted — the alarm nobody had to build.

The precomputation exists — `scripts/create-materialized-views.sql:105,323` emit `stuff_plus_n AS COUNT(p.stuff_plus)`, and nothing in any `.ts`/`.tsx` reads it **(verified)**. The measurement was built; the wire to the screen never run.

**Coverage is a display obligation, not a data-quality alert** — Jo pages on the decay; Cas's rule is that a tile cannot render a number whose denominator it can't state.

**The class of bug that manufactures hollow responses.** `app/api/update/route.ts:87` returns a clean success with `inserted: 0` whenever the Savant CSV is under 100 bytes — indistinguishable from a real zero-row day; `:154` counts no-op upserts as inserts; `app/api/roster/route.ts:20` does `data.roster || []`, so a shape change at MLB becomes an empty roster with a 200 **(verified)**. A silent success is a `partial` wearing a `loaded` badge.

The repair pattern is already here: `app/api/cron/pitches/route.ts:71-84` collects Stuff+ scoring failures and **throws** **(verified)**. A subsystem failure inside a successful outer operation must escalate, not `console.error`.

---

## 5. Stale — instrumented, unread

Triton can already tell you how old almost everything is: `system_metadata.mv_last_refreshed` (written `app/api/cron/refresh/route.ts:140`, read only by `api/admin/cron-health:44`), `league_averages.updated_at`, `players.updated_at`, `player_season_stats.updated_at`, `query_cache` expiry (`lib/queryCache.ts:32`, 21600s). **None reaches a user surface** **(verified)**.

`league_averages` sat **46 days** stale with nothing on screen **(verified)** — and it is a plus-stat denominator, so every Stuff+ was normalised against a six-week-old population.

The cache case is sharper than "old": `invalidateBySource('pitches')` fires when rows land, but a **pure rescore writes no new rows**, so a corrected Stuff+ can sit behind a 6h TTL holding the superseded value. Stale here means contradicted **(inferred)**.

Minimum treatment: `asOf` in every payload, an `As of 2026-08-13 09:34 UTC` footer thresholded against the surface's cadence (daily crons → >36h amber, >7d red), and background revalidation that keeps the old number visible under a subtle indicator rather than a panel-wide spinner **(documented)**. `stale-while-revalidate` is the right default for analyst surfaces and the wrong one for a number a broadcaster is about to say out loud **(inferred)**.

---

## 6. Error, recovery, and the live-broadcast exception

`components/ui/ErrorBoundary.tsx:30-32` implements Retry as `this.setState({ hasError: false, error: null })` — identical children, no refetch **(verified)** — so a persistent cause throws again instantly and the button reads as decorative. A real retry re-runs the fetch and, after two failures, offers a way around it. The boundary is mounted in only three layouts — broadcast, data, work **(verified)** — so on analytics routes a render throw yields a blank screen.

The 8s statement timeout on `authenticator` helps — slow paths *fail* rather than hang, so error is reachable — and copy should name cause and escape: "Query exceeded 8s: narrow the date range" beats "Something went wrong" **(documented)**.

**Live broadcast inverts the priorities.** `lib/useOverlaySession.ts:303-304` sets `connected` from `status === 'SUBSCRIBED'`, collapsing `CHANNEL_ERROR`, `TIMED_OUT`, and `CLOSED` into one boolean; `app/overlay/[sessionId]/page.tsx:76-88` renders disconnection as an 8×8px red dot on the 1920×1080 canvas **(verified)**. The instinct — never a spinner or error panel on air — is right; the execution is invisible at broadcast scale and to the producer. The overlay should **hold last-known, never blank, never spin**, escalate to the *producer* panel rather than the output, and after a staleness budget (~30s for live game state) fade the element out rather than keep asserting it. On air the honest failure is disappearing, not being wrong.

---

## 7. Where the decision lives

| Layer | Decides |
|---|---|
| SQL / route | `n`, `coverage`, `asOf` — the only place that sees the denominator |
| Shared envelope | `{ value, n, coverage, asOf }` — one shape, every consumer |
| `lib/metricRegistry.ts` | Thresholds, and how a degraded cell renders |
| Component | Which of the seven states to show — a pure function of the envelope |

---

## 8. What Triton should do, in order

1. **Add `n` + `coverage` to the aggregate envelope** in `/api/report` and `/api/player-data`. Nothing else here works without it.
2. **Add a `CoverageSpec` to `lib/metricRegistry.ts`** with §4's four bands and the hard "no number below 5%" floor — the same lever as `ColorSpec`, so one entry serves every tile.
3. **Thread `FilterEngine.totalActive` into every empty renderer**, splitting the 24 "No data" strings into `empty` vs `filtered-empty` with a "Clear all (n)" action — the cheapest real win here.
4. **Surface `asOf`** — `mv_last_refreshed` plus the relevant `updated_at`, in a footer with an age threshold. The 46-day incident's antidote.
5. **Make Retry refetch**; mount `ErrorBoundary` on the analytics routes; adopt `error.tsx` per segment, then `loading.tsx` with content-shaped skeletons wherever the wait exceeds 2s.
6. **Give the overlay a degraded state**: hold last-known, escalate to the producer panel, fade after a staleness budget.

**Anti-recommendation: do not build a "data health" admin dashboard first.** The obvious move: the signals exist, `cron-health` already reads `mv_last_refreshed`, and one page beats touching 23 surfaces. It fails three ways. (a) **Wrong audience**: the person harmed is the analyst reading Stuff+ on the player page, and a health page they must remember to open is one they won't. (b) **It already existed and didn't work** — `cron-health` was live through the Stuff+ decay *and* the 46-day staleness and caught neither, because the cron reported success; the same self-report feeds the same blind spot. (c) **Wrong layer** — that is Jo's surface; Cas's obligation is that a number cannot render without its denominator, and a separate page leaves the lying tile lying.

**Highest-leverage next action:** add `n` and `coverage` to one route — `/api/player-data` — and render the §4 chip on the single Stuff+ tile of the pitching dashboard. That tile, on the outage's own metric, proves the pattern earns the other 68 entries.

---

## Sources

1. NN/g — [Response Times: 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) — §2's 0.1/1/10s thresholds.
2. NN/g — [Visibility of System Status](https://www.nngroup.com/articles/visibility-system-status/) — heuristic #1; a hollow "loaded" violates it.
3. NN/g — [Skeleton Screens](https://www.nngroup.com/articles/skeleton-screens/) — full-screen vs module rule; empty skeletons read as broken.
4. NN/g — [Empty States in Application Design](https://www.nngroup.com/articles/empty-state-interface-design/) — the three guidelines §3 applies.
5. Carbon — [Empty states pattern](https://carbondesignsystem.com/patterns/empty-states-pattern/) — copy/action structure for §3.
6. Next.js — [`loading.js`](https://nextjs.org/docs/app/api-reference/file-conventions/loading) — the Suspense sugar Triton has none of.
7. Next.js — [`error.js`](https://nextjs.org/docs/app/api-reference/file-conventions/error) — per-segment error boundary; rec. 6.
8. TanStack Query — [Background Fetching Indicators](https://tanstack.com/query/latest/docs/framework/react/guides/background-fetching-indicators) — `isFetching` vs `status`; §5.
9. SWR — [Understanding SWR](https://swr.vercel.app/docs/advanced/understanding) — `isLoading` vs `isValidating`; §5.
10. W3C — [Understanding SC 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — announce result counts without a focus move (§3).

**Triton-internal evidence (repo read 2026-08-13; no production query).** Conventions: `find app \( -name loading.tsx -o -name error.tsx \)` → **0** files; `animate-spin` in **70** files vs `animate-pulse` in **23**. Empty states: **24** literal "No data" strings (`app/(research)/explore/page.tsx:198`, `app/(research)/wbc/page.tsx:306,348,625`, …); `components/FilterEngine.tsx:95` computes `totalActive`/`clearAll()`, `:261-264` renders "Clear all (n)", consumed by no empty renderer. Loading: `app/(research)/player/[id]/page.tsx:46-50` spinner gate, `:124` a second inline `dataLoading` spinner. Errors: `components/ui/ErrorBoundary.tsx:30-32` sets `{hasError:false,error:null}` with no refetch; mounted only in the broadcast, data, and work layouts (`app/(broadcast)/layout.tsx` et al). Realtime: `lib/useOverlaySession.ts:303-304`; `app/overlay/[sessionId]/page.tsx:76-88`. Staleness: `lib/queryCache.ts:32` TTL **21600s**; `mv_last_refreshed` written `app/api/cron/refresh/route.ts:140`, read only `app/api/admin/cron-health/route.ts:44`; `stuff_plus_n` at `scripts/create-materialized-views.sql:105,323`, **zero** `.ts`/`.tsx` readers. Silent success: `app/api/update/route.ts:87`, `:154`, `app/api/roster/route.ts:20`; repayment at `app/api/cron/pitches/route.ts:71-84`. **Not re-measured here** — the 99.5%/90%/18%/4%/0% decay (Apr–Aug 2026), the 46-day `league_averages` staleness, the 8s `authenticator` timeout, and `metricRegistry`'s 69 entries come from the 2026-08-12/13 briefing packet and `Cas/context/triton-context.md`.
