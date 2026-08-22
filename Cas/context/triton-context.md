---
title: Triton Surface Context — Stack, Screens, Testing, Known Presentation Hazards
domain: context
tags: [context, triton-platform, frontend, testing, ux, caching, realtime, overlays]
last_updated: 2026-08-21
---

# The Surfaces Cas Serves

> Ground-truth context doc for Cas. Every `applied/` doc and every piece of Cas's advice should be
> framed against what's written here. Items marked *(assumption)* should be confirmed with Trevor
> and corrected in place. Items marked *(open)* are unresolved presentation hazards Cas owns.

## The Operator

**Trevor May** — founder/operator. Former MLB pitcher (Twins, Mets, Athletics, 2014–2023), now
running Mayday Media and building Triton. He is the primary user of most of these screens, an
on-camera broadcaster using the overlay system live, and a developer. He has strong visual taste
(TruMedia density, dark theme) and will notice a half-pixel misalignment and a dishonest axis with
equal speed.

The platform is built and modified rapidly with AI assistance — recommendations should be
incremental and shippable.

## The Stack

- **Next.js 16** (App Router) + **React** + **Tailwind CSS**, deployed on **Vercel**.
- **Plotly.js** for visualization; **@hello-pangea/dnd** for drag-and-drop (Work Kanban).
- **Supabase** Postgres + **Realtime** (one channel per broadcast session) + Storage.
- **Vitest** is the test runner — `npm test` → `vitest run`. **Not Jest.** Running `npx jest` fails
  with a Babel parse error and means nothing.
- `useDevice()` hook splits mobile/desktop; separate components live in `components/mobile/`.

## Design System

- Dark theme, `zinc-950` background. Accent by product area:
  **emerald** = analytics · **sky** = broadcast + work nav · **violet** = messaging ·
  **amber** = Compete.
- TruMedia-style UI: chip filters, spectrum heatmaps, compact dense data tables.
- **All movement values in inches, never feet.**
- Broadcast overlays are **1920×1080 with transparent backgrounds** for OBS browser sources.
- Metric formatting, coloring, and totals go through **`lib/metricRegistry.ts`** — `FormatSpec`,
  `ColorSpec` (`static` / `plus` / `inverted_value`), `TotalsStrategy`, `higherBetter`, `tip`.
  `GROUP_COLUMNS` maps group keys to ordered column arrays. **Adding a metric column = one registry
  entry, not a hardcoded column at the call site.**

## The Surfaces

| Area | Entry point | Notes |
|---|---|---|
| Pitching dashboard | `app/(research)/player/[id]/page.tsx` | Main analyst surface; client-side filtering |
| Reports Builder | `app/(research)/reports/page.tsx` | Tile-based; `components/reports/TileViz.tsx` |
| Trends / research | `app/(research)/trends/page.tsx` | |
| Compete (athlete-facing) | `app/(compete)/compete/**` | Amber theme, left sidebar, athlete hard-lock |
| Broadcast editor | `app/(broadcast)/broadcast/[projectId]` | Canvas, assets, scenes, timeline |
| Producer panel | `app/(broadcast)/producer/[sessionId]` | Pushes stat overlays live |
| Overlay output | `app/overlay/[sessionId]` | 1920×1080 OBS browser source |
| Work app | `app/(work)/work/**` | Kanban, channels, DMs, sprints |
| Mobile | `components/mobile/` | `MobilePlayerDashboard`, `MobileTrends` |

**Rendering split (important):** single-player views filter **client-side**; cross-player reports
aggregate **server-side** in SQL (`/api/report`, `/api/player-data` via the `run_query` RPC).
Derived fields (VAA/HAA, `pfx_x_in`/`pfx_z_in`, `vs_team`, `batter_name`) are computed client-side
in `fetchData` / `lib/enrichData.ts`.

## Caching & Realtime

- `lib/queryCache.ts` — application-level cache with `getCached` / `cached` / `invalidateBySource` /
  `purgeExpired`. The pitch crons call `invalidateBySource('pitches')` after new rows land.
- Supabase **Realtime** drives the whole broadcast system: `lib/useOverlaySession.ts`,
  `lib/useProducerOverlay.ts`, `lib/useProducerControls.ts`, `lib/useChatConnection.ts`. Producer
  panels share the same channel as the main overlay.
- `system_metadata` holds `mv_last_refreshed` — the closest thing to a staleness signal the UI has.

## Testing Reality *(re-measured 2026-08-21 by running `npm test` — unchanged since 2026-08-11)*

- 7 test files, **122 tests: 93 passing, 5 failing, 24 skipped**.
- **4** of the 5 failures are in `__tests__/lib/queryCache.test.ts` — the Supabase mock lacks
  `.maybeSingle()`, so `getCached` throws. The **5th is different in kind and was misattributed here
  until 2026-08-22**: `__tests__/lib/leagueStats.test.ts:37-41` asserts `computePlus` returns
  `Infinity` when stddev is zero, and gets `100` — an approval test pinned to a divide-by-zero bug
  that `lib/leagueStats.ts:1322` has since fixed. It is red because the code got better, so it needs
  a judgement call about the intended contract, not a mock fix. **All 5 mask new failures and should
  be resolved.**
- Coverage is thin: `__tests__/api/playerData.test.ts` is the only API-route test. There are no
  tests for the metric registry, no golden-file tests for metric output, no contract tests against
  the MLB/Savant APIs, and no idempotency tests for backfills.
- **`/api/admin/backfill-stuff-plus` shipped broken and stayed broken** because nothing exercised
  it: its `hasMore` probe was `SELECT COUNT(*) ... LIMIT 1 OFFSET n`, which returns zero rows for
  any `n > 0`, so it always stopped after one batch. This is Cas's founding case study.

## Known Presentation Hazards — Cas Owns These

### 1. The display can manufacture a trend *(the defining hazard)*

`AVG()` skips NULLs. When `pitches.stuff_plus` coverage collapsed from 99.5% to 0% between April and
August 2026, every dashboard kept rendering a smooth, plausible Stuff+ line — computed over a
shrinking, non-random subset of surviving rows. Nothing on any screen indicated the denominator was
evaporating.

**Standing rule: any aggregate on a surface must be able to state its coverage and sample size.**
A tile that can't say how many rows it averaged shouldn't render a number.

### 2. "No data" vs "zero" *(open)*

Legitimate NULL regions exist everywhere: deception is 2017+, MiLB is 2023+, `stuff_plus` is NULL
for pitches without `release_speed`, `player_season_stats` IR/IRS is NULL ≤1970. These must never
render as `0`, an empty cell, or a dash that reads as zero.

### 3. Cross-level axis mixing *(open)*

MLB and MiLB Stuff+ use different baseline populations. Placing both on one chart without explicit
separation is a category error — see `Li/context/triton-context.md`.

### 4. Small-sample display *(open)*

The UI makes a two-start window trivially easy to view and gives no signal that the sample is
unstable. No stabilization thresholds are encoded anywhere in the repo.

### 5. Stale cache with no staleness signal on any analyst surface *(open)*

`queryCache` can serve old data and no analyst surface says so. `mv_last_refreshed` **is** surfaced,
but only to admins: `app/(admin)/admin/page.tsx:67` fetches `/api/admin/cron-health` and `:207-209`
renders `MV last refreshed`. No player dashboard, report, trend, or overlay reads it. Corrected
2026-08-21 — the earlier wording ("exists but is not surfaced") was half-false.

### 6. Overlay legibility

Broadcast overlays are viewed at distance, over live video, at variable bitrate, often on mobile.
Contrast, stroke, and minimum type size matter far more than on the analyst surfaces — and
transparent backgrounds mean text sits on unpredictable video.

## Conventions Cas Must Follow

- Test runner is **Vitest**. Verify a new regression test fails against the broken code first.
- Metric display goes through `lib/metricRegistry.ts`.
- Every ad-hoc DB query logged to **`docs/Queries.md`**; metric/param changes update
  **`docs/VARIABLES.md`** in the same commit.
- Significant work updates `planning.md`.
- Never push without explicit approval; ask clarifying questions (AskUserQuestion) first.

## Cas's Standing Priorities for This Platform

1. **Fix the 5 masking test failures** in `queryCache.test.ts` so the suite is trustworthy.
2. **Coverage/sample-size affordance in `lib/metricRegistry.ts`**, so every tile can render its n
   without per-call-site work.
3. **Golden-file tests for metric output** — the cheapest possible defense against silent formula
   drift.
4. **Idempotency + contract tests** for the ingest and backfill paths.
5. **Surface staleness** (`mv_last_refreshed`, cache age) somewhere the analyst can see it.
