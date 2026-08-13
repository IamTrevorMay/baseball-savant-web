# Cas's Brain — Index

> Read `CAS.md` for the persona and `context/triton-context.md` for the surfaces, stack, and
> operator this brain serves. This index is the map: **44 reference docs across 4 domains**, plus
> **4 applied playbooks** that translate each domain into specific Triton recommendations.
> Each doc has a TL;DR up top, inline evidence grades (verified/documented/inferred/cargo-cult),
> and cited sources at the bottom.
>
> **Cas owns: "is it verified and honestly presented."** Not "is the data there" (→ `Jo`) or "is
> the number defensible" (→ `Li`) or "should this metric exist" (→ `Soto`).

**Build status: 22/44 reference docs** (2026-08-13) — `[ ]` = planned, `[x]` = built, researched, and
verified against `.claude/agents/BUILD.md`. Domains 1–2 complete; `frontend-data-scale/` and
`caching-state/` are next, then the 4 applied playbooks.

**Two tiers, by domain** (see `BUILD.md` § Doc tiers). `testing-data-systems/` is **standard** tier
(22 KiB, 17–24 sources); `analytics-ux/` onward is **light** tier (15.5 KiB, 10–14 sources) — same
structure, less depth. Verify with the matching flag:

```bash
./.claude/agents/check-doc.sh Cas --links          testing-data-systems/*.md
./.claude/agents/check-doc.sh Cas --light --links  analytics-ux/*.md
```

**Correction from the Domain 1 build:** `context/triton-context.md` says all 5 suite failures are the
`.maybeSingle()` mock chain — only **4** are. The 5th (`__tests__/lib/leagueStats.test.ts:40`) asserts
`computePlus(91,90,0) === Infinity` while `lib/leagueStats.ts:1322` now guards zero stddev and returns
100: an approval test pinned to a fixed bug. See `testing-data-systems/11-vitest-nextjs-patterns.md`.

## Context
- [triton-context.md](context/triton-context.md) — Ground truth on Triton's surfaces: the stack
  (Next.js 16, Plotly, Vitest, Supabase Realtime), the design system and accent-by-area rules, the
  client-filter vs server-aggregate split, real test-suite state, and the open presentation hazards
  (the display can manufacture a trend; null-vs-zero; stale cache with no signal).
  **Read before any applied advice.**

## Applied Playbooks (start here for "what should we do?")
- [ ] [testing-applied.md](applied/testing-applied.md) — Fixing the 5 masking `queryCache` failures,
  golden-file tests for metric output, contract tests for MLB/Savant, idempotency tests for the
  backfill paths, a realistic CI shape for this repo.
- [ ] [analytics-ux-applied.md](applied/analytics-ux-applied.md) — A coverage/sample-size affordance
  in `lib/metricRegistry.ts`, null-vs-zero rules per metric, uncertainty display for short windows,
  cross-level axis policy, overlay legibility spec.
- [ ] [frontend-data-scale-applied.md](applied/frontend-data-scale-applied.md) — Where Triton's
  client-filter boundary should sit, Plotly render budgets, virtualizing the dense tables, mobile
  constraints, a profiling protocol.
- [ ] [caching-state-applied.md](applied/caching-state-applied.md) — `queryCache` invalidation audit,
  surfacing `mv_last_refreshed`, Realtime coherence between producer and overlay, optimistic-update
  rollback rules.

## Domain 1: Testing for Data Systems (`testing-data-systems/`)
- [x] [01-testing-strategy-data-apps.md](testing-data-systems/01-testing-strategy-data-apps.md) — What to test in a data app vs a normal app, the test pyramid's poor fit, risk-based prioritization, what "coverage" means when the risk is numeric.
- [x] [02-sql-query-testing.md](testing-data-systems/02-sql-query-testing.md) — Testing SQL: fixture databases, transactional rollback, seeded snapshots, testing against real Postgres vs mocks, pgTAP, testcontainers.
- [x] [03-contract-testing-external-apis.md](testing-data-systems/03-contract-testing-external-apis.md) — Contract tests against MLB Stats API and Savant, recorded fixtures vs live smoke tests, detecting upstream drift before it corrupts data, Pact-style approaches.
- [x] [04-idempotency-backfill-testing.md](testing-data-systems/04-idempotency-backfill-testing.md) — Proving a backfill is idempotent and resumable, double-run tests, partial-failure injection, verifying a repair actually repaired.
- [x] [05-golden-file-metric-testing.md](testing-data-systems/05-golden-file-metric-testing.md) — Snapshot/golden-file tests for metric outputs, choosing fixtures, updating goldens safely, catching silent formula drift.
- [x] [06-property-based-testing.md](testing-data-systems/06-property-based-testing.md) — Property/invariant testing for numeric code (fast-check), metamorphic testing, invariants worth asserting on baseball metrics.
- [x] [07-integration-e2e-testing.md](testing-data-systems/07-integration-e2e-testing.md) — API-route testing in Next.js, Playwright for critical flows, testing Realtime/overlay behavior, flake management.
- [x] [08-test-data-management.md](testing-data-systems/08-test-data-management.md) — Fixtures at scale, deriving small representative slices from 8.9M rows, anonymization for athlete data, fixture drift.
- [x] [09-numeric-regression-detection.md](testing-data-systems/09-numeric-regression-detection.md) — Float comparison and tolerances, detecting drift in aggregate outputs, distribution-level assertions in CI, approval-testing patterns.
- [x] [10-ci-cd-for-data-apps.md](testing-data-systems/10-ci-cd-for-data-apps.md) — CI shape for a Vercel/Supabase app, migration testing, preview environments and seeded data, gating deploys on data checks.
- [x] [11-vitest-nextjs-patterns.md](testing-data-systems/11-vitest-nextjs-patterns.md) — Vitest configuration for Next.js App Router, mocking Supabase clients correctly (the `.maybeSingle()` chain failure), RSC/route-handler testing, coverage tooling.

## Domain 2: Analytics UX & Honest Presentation (`analytics-ux/`)
- [x] [01-honest-data-presentation.md](analytics-ux/01-honest-data-presentation.md) — The ethics and mechanics of not lying with data: sample size, provenance, coverage, denominators, and the failure mode where a shrinking sample renders as a smooth trend.
- [x] [02-null-zero-unknown-ui.md](analytics-ux/02-null-zero-unknown-ui.md) — Distinguishing no-data, zero, not-applicable, and not-yet-covered in tables and charts; conventions, glyphs, and tooltip design.
- [x] [03-visualization-principles.md](analytics-ux/03-visualization-principles.md) — Chart-type selection, perceptual accuracy (position > length > angle > color), data-ink, axis truncation ethics, small multiples.
- [x] [04-uncertainty-visualization.md](analytics-ux/04-uncertainty-visualization.md) — Error bars, confidence bands, gradient/violin encodings, hypothetical outcome plots, communicating instability without paralyzing the reader.
- [x] [05-dashboard-information-architecture.md](analytics-ux/05-dashboard-information-architecture.md) — Layout hierarchy, scanning patterns, grouping, the analyst's question-first flow, avoiding the wall-of-tiles.
- [x] [06-color-encoding-accessibility.md](analytics-ux/06-color-encoding-accessibility.md) — Sequential/diverging/categorical palettes, colorblind safety, dark-theme contrast, spectrum heatmaps for strike-zone data, WCAG for data viz.
- [x] [07-dense-table-design.md](analytics-ux/07-dense-table-design.md) — TruMedia-style dense tables: alignment, numeric formatting, sticky headers, sorting affordances, conditional coloring, scannability at density.
- [x] [08-loading-empty-error-states.md](analytics-ux/08-loading-empty-error-states.md) — States that don't lie: skeletons vs spinners, partial data, error recovery, empty-vs-filtered-to-empty, stale-data indicators.
- [x] [09-comparative-display-benchmarks.md](analytics-ux/09-comparative-display-benchmarks.md) — Showing league context: plus-stats, percentile bars, rank badges, benchmark lines, and making the comparison population explicit.
- [x] [10-progressive-disclosure-drilldown.md](analytics-ux/10-progressive-disclosure-drilldown.md) — Overview→detail flows, drill-down affordances, tooltip vs panel vs modal, keeping context on navigation.
- [x] [11-broadcast-overlay-legibility.md](analytics-ux/11-broadcast-overlay-legibility.md) — Type size, contrast, stroke/shadow over live video, safe areas, motion and dwell time, compression artifacts, 1920×1080 transparent overlays for OBS.

## Domain 3: Frontend Performance at Data Scale (`frontend-data-scale/`)
- [ ] [01-rendering-large-datasets.md](frontend-data-scale/01-rendering-large-datasets.md) — Virtualization/windowing, incremental rendering, DOM node budgets, when to stop rendering rows and start aggregating.
- [ ] [02-plotly-performance.md](frontend-data-scale/02-plotly-performance.md) — Plotly.js render cost, scattergl vs scatter, trace count, `Plotly.react` vs re-mount, bundle size, alternatives and when to switch.
- [ ] [03-client-vs-server-computation.md](frontend-data-scale/03-client-vs-server-computation.md) — Where the boundary belongs; Triton filters client-side for single players and aggregates server-side for reports — the tradeoffs, payload sizes, and when to move the line.
- [ ] [04-pagination-streaming-patterns.md](frontend-data-scale/04-pagination-streaming-patterns.md) — Offset vs keyset pagination, cursor design, streaming responses, incremental hydration, infinite scroll pitfalls.
- [ ] [05-react-rendering-performance.md](frontend-data-scale/05-react-rendering-performance.md) — Re-render control, memoization that actually helps, context-induced renders, list keys, React Compiler implications, profiling before optimizing.
- [ ] [06-nextjs-data-fetching.md](frontend-data-scale/06-nextjs-data-fetching.md) — App Router data fetching, RSC vs client components, streaming and Suspense, route handlers, caching semantics in Next 15/16.
- [ ] [07-bundle-size-code-splitting.md](frontend-data-scale/07-bundle-size-code-splitting.md) — Dynamic import, route-level splitting, heavy dependency management (Plotly), tree-shaking, measuring bundle impact.
- [ ] [08-web-workers-offthread.md](frontend-data-scale/08-web-workers-offthread.md) — Moving derived-field computation and filtering off the main thread, transferable objects, Comlink, when the transfer cost dominates.
- [ ] [09-mobile-performance-constraints.md](frontend-data-scale/09-mobile-performance-constraints.md) — Memory and CPU limits on mobile, touch responsiveness, the separate-mobile-component tradeoff, network variability.
- [ ] [10-perceived-performance.md](frontend-data-scale/10-perceived-performance.md) — Skeletons, optimistic rendering, progressive data reveal, response-time thresholds, making a slow query feel intentional.
- [ ] [11-profiling-measurement.md](frontend-data-scale/11-profiling-measurement.md) — React DevTools Profiler, Chrome performance traces, Core Web Vitals/INP, Lighthouse, RUM, establishing a before/after protocol.

## Domain 4: Caching & State Consistency (`caching-state/`)
- [ ] [01-cache-invalidation-strategies.md](caching-state/01-cache-invalidation-strategies.md) — TTL vs event-driven vs versioned keys, tag-based invalidation, the correctness/staleness tradeoff, why invalidation is genuinely hard.
- [ ] [02-http-caching-cdn.md](caching-state/02-http-caching-cdn.md) — Cache-Control semantics, ETags, Vercel edge caching and ISR, stale-while-revalidate at the CDN, purging.
- [ ] [03-application-cache-design.md](caching-state/03-application-cache-design.md) — Designing an app-level query cache (Triton's `lib/queryCache.ts`): key design, source tagging, eviction, expiry, and its failure modes.
- [ ] [04-realtime-sync-consistency.md](caching-state/04-realtime-sync-consistency.md) — Supabase Realtime semantics, channel design, ordering and delivery guarantees, reconnection/resync, missed-message recovery for live overlays.
- [ ] [05-optimistic-updates-rollback.md](caching-state/05-optimistic-updates-rollback.md) — Optimistic UI, conflict handling, rollback UX, idempotent mutations, drag-and-drop reordering correctness.
- [ ] [06-state-management-patterns.md](caching-state/06-state-management-patterns.md) — Context vs store vs server state, avoiding context-render storms, colocating state, the BroadcastContext pattern.
- [ ] [07-stale-while-revalidate.md](caching-state/07-stale-while-revalidate.md) — SWR/React Query/TanStack patterns, background refetch, focus revalidation, dedup, and how they interact with a server-side cache.
- [ ] [08-multiuser-cache-coherence.md](caching-state/08-multiuser-cache-coherence.md) — Multiple viewers of one live session, producer/overlay divergence, last-writer-wins vs authoritative state, clock and ordering issues.
- [ ] [09-offline-resilience.md](caching-state/09-offline-resilience.md) — Network loss during a live broadcast, reconnect strategy, queued mutations, degraded-mode UX.
- [ ] [10-cache-observability.md](caching-state/10-cache-observability.md) — Hit/miss instrumentation, age tracking, debugging "why am I seeing old data," surfacing staleness to users.
- [ ] [11-pipeline-cache-invalidation.md](caching-state/11-pipeline-cache-invalidation.md) — Tying ingest completion to cache busting (`invalidateBySource`), matview refresh coordination, avoiding serving pre-refresh data, cross-layer coherence.
