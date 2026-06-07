# Triton — Project Planning

Living roadmap for the Triton baseball analytics platform. Tracks completed work, active initiatives, and upcoming priorities across all product areas.

---

## Product Areas

| Area | Description | Status |
|------|-------------|--------|
| **Analytics** | Pitcher/hitter dashboards, scouting reports, leaderboards | Active |
| **Broadcast** | OBS overlay system, producer panels, Stream Deck, widgets | Active |
| **Work** | Internal ops — sprints, Kanban, channels, DMs, calendar, goals | Active |
| **Compete** | TrackMan CSV upload, session browser, pitch data | Active |
| **Data** | Console, Trackman browser, hub | Active |
| **Research** | Teams page, AI analyst | Active |

---

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

---

## Known Issues

| Issue | Area | Notes |
|-------|------|-------|
| Work board: duplicate card creation | Work | `onKeyDown` + `onBlur` both fire `createTask`; needs `useRef` guard |
| Work board: delete fails silently | Work | No error surfaced to user on delete failure |
| Work board: no drag-and-drop on MyBoard | Work | Only WorkBoard (sprint view) has DnD via `@hello-pangea/dnd` |
| Work app placeholder pages | Work | Resources, Jobs, Assessments are placeholder pages |

---

## Architecture Notes

### Database
- **pitches**: 8.65M rows, 90+ columns, 4.9GB data, ~5GB indexes (29 indexes after Tier 2)
- **milb_pitches**: parallel MiLB data (2023+), Title Case events vs MLB lowercase
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
