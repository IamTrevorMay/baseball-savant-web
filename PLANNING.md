# Triton — Planning

## Recently Completed

### Performance Optimization (June 2026)
Three-tier speed improvement plan for the analytics platform (8.65M-row `pitches` table).

**Tier 1 — Materialized Views** (`e077bed`)
- 7 materialized view stores for pre-aggregated analytics
- Nightly refresh configured in `/api/cron/pitches`
- API routes updated with MV fast paths (leaderboards, park-adjusted, scene-stats)

**Tier 2 — Composite & Partial Indexes** (`89ae1cb`)
- 7 new composite/partial indexes on `pitches`:
  - `idx_pitches_batter_year_date` — batter page loads (182ms → 34ms)
  - `idx_pitches_year_type_pitcher` / `idx_pitches_year_type_batter` — season scans
  - `idx_pitches_seq` — sequencing queries (pitcher × game × at-bat × pitch order)
  - `idx_pitches_movement` — movement-percentiles velo band lookups
  - `idx_pitches_year_pitcher_bb` / `idx_pitches_year_batter_bb` — partial indexes for batted ball queries (~30% of rows)
- 8 redundant single-column indexes dropped
- Net storage: +57 MB
- Script: `scripts/create-tier2-indexes.sql`

**Tier 3 — Query-Specific Optimizations** (`0b8fa67`)
- HTTP Cache-Control headers added to 6+ API routes
- DB caching (6h TTL) for expensive `percentile_cont()` in movement-percentiles
- Pitcher-outing: merged 4 overlapping queries into 1 (6 → 3 DB round-trips)
- Matchup route: player name lookup switched from 8.6M-row pitches scan to 4k-row players table

### Analytics Features (May–June 2026)
- **Empirical percentiles** (`d2d6d07`) — replaced z-score approximations with rank-based percentiles
- **Percentile key mapping** (`67c809f`) — fixed component keys to DB column name mismatches
- **Foul ball / xBA fix** (`a7b6bd4`, `358b6b3`) — swept foul ball inclusion fix across all views and API routes
- **Velo-matched movement percentiles** (`888d868`) — per-pitch-type HB/IVB percentile view in PercentileTab, compared against all pitchers at ±1 mph
- **Deception & Unique scores** (`c778a6f`) — added columns to pitcher Overview Advanced tab
- **Pitch area stats** (`b36fd49`, `b2f6a78`) — `/api/pitch-area-stats` for Vision area-lookup popout with radial query indexes
- **Custom date range filter** (`9afe008`) — added to Teams page
- **Data app restructure** (`c1a469e`) — hub + Console + Trackman browser

### Research & Metrics (June 2026)
- **Momentum Differential analysis** — found it's largely redundant with Run Differential (r = 0.669)
- **Resilience Score composite** — Run Diff (70%) + Close-Game Win% (30%) → R² = 0.929, best predictor tested
- **Conversion Bucket Metrics** — Edge Rate strongest single momentum-derived metric (r = 0.757)

### Infrastructure Quick Wins (June 2026)
7 items from the inefficiency audit implemented in a single batch:

1. **Toast notifications + Error boundaries** — `ToastProvider` in root layout, `ErrorBoundary` wrapping Work, Broadcast, and Data route groups
2. **Cron pipeline hardening** — skip downstream steps when no new pitches ingested; dependency gate (all compute failures → skip league_averages); MV freshness tracked in `system_metadata` table
3. **Cache invalidation tags** — `CACHE_TAG_REGISTRY` in `lib/queryCache.ts` maps data sources → cache key prefixes; `invalidateBySource()` replaces manual prefix invalidation
4. **MiLB event normalization** — `EVENT_NORMALIZE_MAP` in MiLB ingest converts Title Case events to MLB lowercase at write time
5. **Rate limiting on broadcast trigger** — in-memory sliding window limiter (`lib/rateLimit.ts`), 60 req/min per session ID, returns 429 with Retry-After header
6. **Unit tests for core math** — `computeFIP`, `computeXERA`, `computeWRCPlus` (sql.ts) and `computeOutingCommand` (outingCommand.ts) — 23 new tests
7. **Zod schema validation** — schemas for player-data, pitcher-outing, movement-percentiles, scene-stats routes; graceful degradation (log + return raw on validation failure)

## Planned

### Near-term
- Fix Work board duplicate card creation (`onKeyDown` + `onBlur` both fire `createTask`; needs `useRef` guard)
- Fix Work board delete failing silently (no error surfaced to user)
- Add drag-and-drop to MyBoard (only WorkBoard sprint view has DnD currently)

### Long-term
- Build out Work app placeholder pages (Resources, Jobs, Assessments)

---

## Improvement Priorities

Findings from the June 2026 inefficiency audit. Items below are validated recommendations — speculative or inapplicable suggestions from the original report have been filtered out.

### ~~Agreed — Cron Pipeline Hardening~~ ✓ Done
Freshness check, dependency gating, MV timestamp tracking in `system_metadata`.

### ~~Agreed — Cache Invalidation Strategy~~ ✓ Done
`CACHE_TAG_REGISTRY` + `invalidateBySource()` in `lib/queryCache.ts`.

### Agreed — Broadcast Context Decomposition
`BroadcastContext.tsx` manages project, assets, segments, sessions, visibility, animations, slideshows, widgets, OBS, clip markers, and access control in a single context. This is the most bloated single component in the codebase.

**Action items:**
- Split into focused stores: assets, session/visibility, widgets, OBS/recording
- Use React context composition (multiple providers) to reduce re-render blast radius

### ~~Agreed — MiLB Event Normalization at Ingest~~ ✓ Done
`EVENT_NORMALIZE_MAP` applied at write time in `app/api/update/milb/route.ts`.

### Agreed — Observability
No structured logging, no request tracing, no error aggregation, no query performance monitoring. `cron_runs` tracking and `console.error` are the only signals.

**Action items:**
- Add Sentry (or similar) for error aggregation with source maps
- Add structured logging for API routes (request duration, query count, cache hit/miss)
- Surface cron job health in admin dashboard (last run, duration, error count)

### ~~Additional — Error Boundaries & User Feedback~~ ✓ Done
`ToastProvider` + `useToast()` in root layout; `ErrorBoundary` wrapping Work, Broadcast, Data route groups.

### ~~Additional — Type Safety on `run_query` Results~~ ✓ Done
Zod schemas in `lib/schemas/` for player-data, pitcher-outing, movement-percentiles, scene-stats. Graceful degradation on validation failure.

### ~~Additional — Test Coverage~~ ✓ Partially Done
Unit tests added for `lib/sql.ts` (FIP, xERA, wRC+) and `lib/outingCommand.ts`. Remaining: integration tests for API routes, CI setup.

### ~~Additional — Rate Limiting on Public Endpoints~~ ✓ Done
In-memory sliding window limiter in `lib/rateLimit.ts`, applied to broadcast trigger (60/min per session ID).

### Additional — Connection Pooling
`supabaseAdminLong` uses 120s timeouts for season-wide scans. Multiple concurrent users hitting heavy routes could exhaust Supabase's connection pool.

**Action items:**
- Enable Supabase pgBouncer mode for connection pooling
- Add request-level queuing or concurrency limits for expensive queries

## Known Issues

| Issue | Area | Notes |
|-------|------|-------|
| Work board: duplicate card creation | Work | `onKeyDown` + `onBlur` both fire `createTask`; needs `useRef` guard |
| Work board: delete fails silently | Work | No error surfaced to user on delete failure |
| Work board: no drag-and-drop on MyBoard | Work | Only WorkBoard (sprint view) has DnD via `@hello-pangea/dnd` |
| Work app placeholder pages | Work | Resources, Jobs, Assessments are placeholder pages |

## Architecture Notes

### Product Areas
| Area | Description | Status |
|------|-------------|--------|
| **Analytics** | Pitcher/hitter dashboards, scouting reports, leaderboards | Active |
| **Broadcast** | OBS overlay system, producer panels, Stream Deck, widgets | Active |
| **Work** | Internal ops — sprints, Kanban, channels, DMs, calendar, goals | Active |
| **Compete** | TrackMan CSV upload, session browser, pitch data | Active |
| **Data** | Console, Trackman browser, hub | Active |
| **Research** | Teams page, AI analyst | Active |

### Database
- **pitches**: 8.65M rows, 90+ columns, 4.9GB data, ~5GB indexes (29 indexes after Tier 2)
- **milb_pitches**: parallel MiLB data (2023+), events normalized to MLB lowercase at ingest
- **system_metadata**: key/value store for freshness tracking (e.g., `mv_last_refreshed`)
- **players**: 4,017 rows — use for name lookups instead of pitches table
- **Materialized views**: 7 MVs refreshed nightly by cron job
- **league_averages**: 50th-percentile benchmarks, refreshed by `refresh_league_averages(p_season)`

### API Patterns
- `run_query` RPC for analytics SQL (30s timeout via `supabaseAdmin`)
- `run_query_long` via `supabaseAdminLong` for season-wide scans (120s timeout)
- `getCached` / `setCache` from `lib/queryCache` for DB-level result caching
- HTTP `Cache-Control` headers for CDN/browser caching on stable endpoints
- MLB Stats API for boxscores, rosters, standings (external)

### Client Patterns
- `useDevice()` hook for mobile/desktop detection
- Separate mobile components in `components/mobile/`
- Client-side filtering for single-player views
- Server-side SQL aggregation for cross-player reports
- `toPitcherX()` for converting horizontal break to pitcher perspective

### Conventions
- SP/RP classification: SP if ≥3 games with 50+ pitches in season
- All movement values in inches
- Plus-stats (ending `_plus`) excluded from league_averages
- Dark theme: zinc-950 bg, emerald accents (analytics), sky accents (broadcast/work), violet (messaging)
- Work tables prefixed `work_`, RLS via `is_work_admin()` / `is_work_staff()` / `has_work_access()`

## Open Risks

- Work board bugs (duplicate creation, silent delete failure) affect daily use
- Work app placeholder pages give incomplete impression of the product
- No error aggregation (Sentry, etc.) — production errors visible only in Vercel logs
- Integration test and CI coverage still needed (unit tests added for core math)
- `BroadcastContext.tsx` (1,438 lines) — needs decomposition into focused stores
