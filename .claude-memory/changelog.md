# Changelog

## 2026-04-07

### Unit Test Suite Setup
- **What**: Added Vitest test runner with 75 tests covering core math/logic functions
- **Why**: First automated tests for the codebase — validates pure logic after query optimization refactor
- **Files created**:
  - `vitest.config.ts` — test runner config with `@/` path alias
  - `lib/reportQueryBuilder.ts` — extracted WHERE/SELECT/filter logic from report route (testable pure functions)
  - `__tests__/lib/leagueStats.test.ts` — 30 tests (computePlus, normalCDF, percentiles, Command+, RPCom+, year-weighted plus)
  - `__tests__/lib/reportQueryBuilder.test.ts` — 16 tests (WHERE clause building, SQL injection escaping, indexed filter guard, SELECT aliasing)
  - `__tests__/lib/queryCache.test.ts` — 5 tests (cache hit/miss, TTL math, cached wrapper)
  - `__tests__/api/playerData.test.ts` — 5 tests (column prefixing logic)
- **Files modified**:
  - `package.json` — added vitest devDep + `test`/`test:watch` scripts
  - `lib/leagueStats.ts` — exported `normalCDF` (was private)
  - `app/api/report/route.ts` — imports from `lib/reportQueryBuilder.ts` instead of inline constants

### Query System Optimization (Phases 1-4)
- **What**: Comprehensive performance optimization to fix player data timeouts (500/520 errors on 7.4M+ row pitches table)
- **Why**: Queries combining filters + ORDER BY + large result sets forced PostgreSQL into sequential scans

**Phase 1 — Database Indexes (SQL provided, run manually)**:
- 8 composite indexes: pitcher+game_date, batter+game_date, sequencing (pitcher+year+game+ab+pitch), season aggregation (year+game_type+pitcher/batter), game-level (pitcher/batter+game_pk), batted ball partial index

**Phase 2 — Server-Side Query Optimizations**:
- `app/api/player-data/route.ts` — Added `?year=` param (50K→5K rows), inline LEFT JOIN for batter/pitcher_name (eliminates client waterfall requests)
- `app/api/sequencing/route.ts` — Added `b.pitcher` + `b.game_year` to JOIN ON clause for composite index usage
- `app/api/compute-triton/route.ts` — Batch by 50 pitchers instead of one massive query
- `app/api/report/route.ts` — Guard requiring at least one indexed filter column (pitcher, batter, game_year, game_date, team)

**Phase 3 — Client-Side Loading**:
- `app/(research)/player/[id]/page.tsx` — Default to current year, year selector dropdown, removed client-side batter name batch lookups
- `app/(research)/hitter/[id]/page.tsx` — Same: year selector, removed pitcher name batch lookups
- `app/api/player-filter-options/route.ts` — **New** lightweight endpoint for distinct filter values (<100ms)

**Phase 4 — Caching**:
- Cache-Control headers on player-data (5min), trends (1h), scene-stats (1h), player-filter-options (1h)
- `lib/queryCache.ts` — **New** DB-backed cache utility (get/set/invalidate/purge/cached wrapper)
- `app/api/trends/route.ts` — DB cache with 6h TTL
- `app/api/cron/pitches/route.ts` — Invalidates trends cache + purges expired entries after data sync
- **DB table needed**: `query_cache (cache_key TEXT PK, response JSONB, expires_at TIMESTAMPTZ)`

## 2026-04-06

### Daily Graphics Cron + On-Demand API
- **What**: Automated daily generation of 5 social media graphics + on-demand PNG rendering API
- **Why**: Previously rendered manually via `scripts/render-all-yesterday.ts`. Now runs automatically at 4:30 AM PST and serves PNGs for Mayday Studio.
- **DB**: Created `daily_graphics` table (date, type, scene JSONB, metadata) with unique index on (date, type)
- **Files created**:
  - `app/api/cron/daily-graphics/route.ts` — Cron generating 5 graphics: ig-starter-card, trends, yesterday-scores, top-pitchers, top-performances. Sequential generation, idempotent, offseason skip, `?force=true` support.
  - `app/api/daily-graphics/route.ts` — Public GET endpoint. Renders PNG from scene JSON via `renderCardToPNG()`. Supports `?date=&type=`, `?latest=true&type=`, `?latest=true` (JSON index), `?list=true` (all dates). Cache headers for CDN.
- **Files modified**: `vercel.json` — added cron at `30 12 * * *` (4:30 AM PST, after briefs + newsletter)
- **Pattern**: Same as daily_cards system — cron stores scene JSON, GET endpoint renders on-demand

### Top Performances template wired into Scene Composer
- Added `'top-performances'` to `GlobalFilterType` union in `lib/sceneTypes.ts`
- Added `topPerformances` StarterTemplate in `lib/starterTemplates.ts` (1080×1350, IG Portrait)
- Added DataDrivenTemplate with `rebuild()` in `lib/sceneTemplates.ts` — parses HTML topPerformances from brief, renders up to 10 ranked rows (gold top 3, emerald rest)
- Added filter field schema + sample data in `lib/filterFieldSchemas.ts`
- Wired into `StarterTemplatePicker.tsx` (Custom group, amber badge)
- Added to `GlobalFilterPanel.tsx` filter options + sections map
- Added fork logic + data fetch handler in template-builder `page.tsx`
- Added `topPerformances` mode in `app/api/scene-stats/route.ts` — fetches latest brief from Supabase
- Added fetchAndRebuildTemplate case + config panel routing in scene-composer `page.tsx`

### Newsletter Signup Landing Page (`daily.mayday.show`)
- **What**: Public signup page for Mayday Daily newsletter at `/newsletter`, served as root on `daily.mayday.show`
- **Files**:
  - `lib/supabase/middleware.ts` — Added `DAILY_HOSTS` domain routing (rewrite `/` → `/newsletter`, allow `/api/newsletter/*`, block rest) + `/newsletter` to publicPaths
  - `middleware.ts` — Added `daily.mayday.show` favicon check
  - `app/(newsletter)/layout.tsx` — Minimal dark layout, centered, no nav/auth (new)
  - `app/(newsletter)/newsletter/page.tsx` — Email input + subscribe button, posts to `/api/newsletter/subscribe`, success/error states (new)
- **Next steps**: Add `daily.mayday.show` domain in Vercel

### Top Pitchers Template (Scene Composer)
- **What**: New "Top Pitchers" data-driven template — 1080x1350 IG Portrait showing 4 daily highlight cards (Stuff+ Starter, Stuff+ Reliever, Cmd+ Starter, Cmd+ Reliever) from `/api/daily-highlights`
- **Files modified**:
  1. `lib/sceneTypes.ts` — added `'top-pitchers'` to GlobalFilterType union
  2. `lib/starterTemplates.ts` — added topPitchers StarterTemplate + STARTER_TEMPLATES entry
  3. `lib/sceneTemplates.ts` — added DataDrivenTemplate with rebuild() function
  4. `lib/filterFieldSchemas.ts` — added getFilterFields + getSampleDataForFilter cases
  5. `components/visualize/template-builder/StarterTemplatePicker.tsx` — added to FILTER_LABELS, BADGE_COLORS, grouped under Custom
  6. `components/visualize/template-builder/GlobalFilterPanel.tsx` — added filter type pill + info section
  7. `app/(design)/design/template-builder/page.tsx` — fork logic + data fetch handler
  8. `app/api/scene-stats/route.ts` — topPitchers mode proxying /api/daily-highlights
  9. `app/(design)/design/scene-composer/page.tsx` — fetchAndRebuildTemplate case + config panel routing
  10. `scripts/render-top-pitchers.ts` — standalone render script (new)
- **Features**: Plus value color coding (130+ emerald, 115+ green, 100+ white, 85+ orange, <85 red), decision badges (W/L/SV/HLD with colors)

### Mayday Daily Newsletter System
- **What**: Auto-sends a branded "Mayday Daily" newsletter email every morning via Resend, pulling data from the Triton DB
- **Changes**:
  1. Modified `app/api/cron/briefs/route.ts` — saves `claude_sections`, `scores` (compact game results with W/L/SV), and `daily_highlights` in brief metadata
  2. Updated `vercel.json` — moved brief cron to `0 11 * * *` (3 AM PST), added newsletter cron at `0 12 * * *` (4 AM PST)
  3. Created `newsletter_subscribers` + `newsletter_sends` DB tables (Supabase migration)
  4. Created `lib/newsletterHtml.ts` — table-based email HTML template builder with: compact score cards (4 per row with W/L/SV decisions), standout cards, surges/concerns sigma badges, Substack RSS integration (`mayday.show/feed`)
  5. Created `app/api/cron/newsletter/route.ts` — main cron: fetches brief + trends + Substack post, builds per-subscriber emails with unsubscribe links, sends via Resend batch API with idempotency
  6. Created `app/api/newsletter/subscribe/route.ts` — POST endpoint for email subscription
  7. Created `app/api/newsletter/unsubscribe/route.ts` — GET (browser link) + POST (RFC 8058 one-click) unsubscribe
  8. Created `app/api/newsletter/preview/route.ts` — GET endpoint to preview newsletter HTML in browser
  9. Created `scripts/render-newsletter.ts` — local preview script, renders to Desktop with sample data + live Substack fetch
- **Email sections**: Scores (4-col grid) → Day in Baseball → Standouts (2x2 cards) → Top Performances → Surges/Concerns → Injuries/Transactions → Latest from Mayday (Substack) → Footer
- **Files**: `app/api/cron/briefs/route.ts`, `vercel.json`, `lib/newsletterHtml.ts`, `app/api/cron/newsletter/route.ts`, `app/api/newsletter/subscribe/route.ts`, `app/api/newsletter/unsubscribe/route.ts`, `app/api/newsletter/preview/route.ts`, `scripts/render-newsletter.ts`

### Add "Trends" Template
- New Scene Composer template showing Surges & Concerns from Trends data (1080x1350 IG portrait)
- Two stacked sections: SURGES (green) with up to 5 players, CONCERNS (red) with up to 5 players
- Three-column layout: Player Name + type/metric, Change (large centered colored text with units), Season value
- Data from `/api/trends` (pitcher + hitter), deduplicated per player, sorted by |sigma| descending
- Wired into all 9 surfaces following same pattern as yesterday-scores template
- Standalone render script: `scripts/render-trends.ts` (sample data fallback)
- **Files**: same 9-file pattern as yesterday-scores + `scripts/render-trends.ts`

### Add "Yesterday's Scores" Template
- New Scene Composer template showing final MLB scores for any date (1080x1350 IG portrait)
- 2-column grid of score cards with team color bars, bold winner, FINAL label, W/L/S pitcher decisions
- Data from MLB Schedule API with `decisions` hydration, filtered to Final games
- Wired into all 9 surfaces: sceneTypes, starterTemplates, sceneTemplates (rebuild), filterFieldSchemas, StarterTemplatePicker (Custom group), GlobalFilterPanel (date picker), template-builder (fork + fetch), scene-stats API, scene-composer (fetch/rebuild + config panel)
- **Files**: `lib/sceneTypes.ts`, `lib/starterTemplates.ts`, `lib/sceneTemplates.ts`, `lib/filterFieldSchemas.ts`, `components/visualize/template-builder/StarterTemplatePicker.tsx`, `components/visualize/template-builder/GlobalFilterPanel.tsx`, `app/(design)/design/template-builder/page.tsx`, `app/api/scene-stats/route.ts`, `app/(design)/design/scene-composer/page.tsx`

### Add Daily Brief Tool to Auto Compose Agent
- Added `get_daily_brief` tool to Auto Compose agent — fetches structured Daily Brief data for building graphics
- Returns: brief metadata, game scores (MLB schedule API), Stuff+ leaders (top 5 pitches), new pitch alerts (first-time pitch types with ≥3 count), IL transactions
- Direct DB queries (no auth needed), parallel fetches for speed
- Data-only tool (no scene updates) — agent uses returned data with add_elements/build_from_template
- **Files**: `lib/autoComposeTools.ts` (tool def + handler), `lib/autoComposePrompt.ts` (system prompt)

### Add Trends, ABS, and Umpire Tools to Auto Compose Agent
- Added 3 new data tools (`get_trends`, `get_abs_summary`, `get_umpire_stats`) to the Auto Compose AI agent
- These are data-only tools (no scene updates) — agent uses returned data to build graphics
- `get_trends`: fetches surges/concerns from `/api/trends` (pitcher + hitter)
- `get_abs_summary`: fetches ABS dashboard + umpire ABS data from `/api/abs`
- `get_umpire_stats`: fetches umpire leaderboard or individual scorecard from `/api/umpire`
- Updated system prompt in `autoComposePrompt.ts` to document the new tools
- **Files**: `lib/autoComposeTools.ts`, `lib/autoComposePrompt.ts`

## 2026-04-01

### Fix Explore Page: Qualifiers, Game Type Filtering, and Daily Refresh
- **What**: Three bugs on the Explore leaderboard page: (1) zero players qualifying with early-season data, (2) Triton/Deception tabs ignoring game_type filter, (3) Triton/Deception tables never auto-recomputed
- **Root causes**: (1) Hardcoded qualifiers (500 pitches, 200 PA) too high for 1 week of Regular Season data; (2) compute-triton/deception queried ALL pitches regardless of game_type, leaderboard APIs didn't filter by game_type; (3) daily cron only synced pitches, never triggered compute endpoints
- **Fixes**:
  1. **Smart qualifiers**: `defaultQualifier()` now scales proportionally based on days into the season (Apr–Sep = 182 days). Floor of 50 pitches / 20 PA. Mid-season reaches full 500/200.
  2. **game_type in Triton/Deception**: Added `game_type` column to `pitcher_season_command` and `pitcher_season_deception` tables (new PK includes game_type). `compute-triton` and `compute-deception` accept `?gameType=` param and filter source pitches + store game_type. `leaderboard-triton` and `leaderboard-deception` accept `gameType` in POST body and filter results. Explore page passes `gameType` to both APIs.
  3. **Daily cron recomputation**: `cron/pitches` now calls `compute-triton` and `compute-deception` for each active game type after syncing pitches.
- **Database**: Added `game_type` column to both tables, updated PKs to `(pitcher, game_year, pitch_name/pitch_type, game_type)`, added indexes
- **Files**: `lib/leaderboardColumns.ts`, `app/api/compute-triton/route.ts`, `app/api/compute-deception/route.ts`, `app/api/leaderboard-triton/route.ts`, `app/api/leaderboard-deception/route.ts`, `app/(research)/explore/page.tsx`, `app/api/cron/pitches/route.ts`

### Fix Movement Plot Not Rendering in Auto Compose
- **What**: Movement plots created by Auto Compose showed empty — no data points visible despite data being populated
- **Root cause**: Two issues: (1) System prompt told agent to use `pfx_x`/`pfx_z` field names, but `MovementPlotRenderer` expects `hb`/`ivb`; (2) Statcast values are in feet, renderer expects inches
- **Fix**: (1) Updated system prompt to specify correct field names (`hb`/`ivb`) and document the feet→inches conversion (`* 12`); (2) Added defensive normalization in `MovementPlotRenderer` that auto-detects `pfx_x`/`pfx_z` fallback and converts feet to inches using a heuristic (values < 5 = likely feet)
- **Files**: `lib/autoComposePrompt.ts` (prompt fix), `components/visualize/scene-composer/MovementPlotRenderer.tsx` (normalizer)

### Design Rules Learning System for Auto Compose
- **What**: Auto Compose agent now has persistent design rules that accumulate over time, improving graphic quality with each session
- **Why**: Without memory of past preferences, the agent starts from scratch each time. Design rules let it learn patterns like "always use glass panels behind stat groups" and apply them automatically.
- **Database**: Created `design_rules` table (id, rule, category, source, created_at) with RLS policies
- **3 new tools**: `save_design_rule` (agent saves a pattern), `list_design_rules` (review rules before building), `remove_design_rule` (forget a rule)
- **Categories**: layout, typography, color, spacing, composition, data-viz, general
- **System prompt**: Rules fetched from DB and injected as "LEARNED DESIGN RULES" section. Agent instructed to: (1) review rules before complex builds, (2) propose rules after approved designs, (3) save rules when user says "remember this"
- **Files**: `lib/autoComposePrompt.ts` (async rule fetch + inject), `lib/autoComposeTools.ts` (3 new tools + handlers), `app/api/auto-compose/route.ts` (await async prompt builder)

### Upgrade Auto Compose Agent — Streaming, Caching, Thinking, Model Upgrade
- **What**: Major upgrade to the Auto Compose AI agent powering Scene Composer's Auto Mode
- **Why**: Original implementation was a basic synchronous Claude call — slow, expensive, no feedback during tool loops
- **Changes**:
  1. **Model**: `claude-sonnet-4-5-20250929` → `claude-sonnet-4-6` (latest, better tool use)
  2. **Prompt caching**: Static system prompt instructions + tool definitions cached via `cache_control: { type: 'ephemeral' }` — saves re-processing ~2K tokens per iteration (up to 15 iterations/request)
  3. **SSE streaming**: Replaced JSON response with Server-Sent Events. Real-time `text_delta` for text streaming, `tool_start`/`tool_done` for live tool feedback, `new_turn` to reset between iterations, `done` with final scene
  4. **Extended thinking**: `thinking: { type: 'enabled', budget_tokens: 4096 }` on all iterations for better planning before tool calls
- **Files**: `app/api/auto-compose/route.ts` (SSE stream + model + thinking + caching), `lib/autoComposePrompt.ts` (split static/dynamic system prompt blocks with cache_control), `lib/autoComposeTools.ts` (cache_control on last tool def), `components/auto-compose/AutoChatPanel.tsx` (activeTools prop for live tool indicators), `app/(design)/design/scene-composer/page.tsx` (SSE parser, streaming text state, active tools state)

### Scene Composer — Auto Mode (AI-Powered Graphic Builder)
- **What**: Added AI-powered "Auto Mode" to Scene Composer. Users describe graphics in natural language and an AI agent builds them iteratively using Statcast data, templates, and scene elements.
- **Why**: Enables rapid graphic creation via chat instead of manual element placement. The AI queries real data and populates templates automatically.
- **Files created**:
  - `lib/autoComposeTools.ts` — 13 AI tools (data, template, scene manipulation, save)
  - `lib/autoComposePrompt.ts` — System prompt builder with scene summary
  - `app/api/auto-compose/route.ts` — Core agentic loop endpoint
  - `app/api/auto-sessions/route.ts` — Session list + create
  - `app/api/auto-sessions/[id]/route.ts` — Session CRUD (GET/PATCH/DELETE)
  - `components/auto-compose/AutoChatPanel.tsx` — Chat panel with message history
  - `components/auto-compose/AutoSessionsPanel.tsx` — Render snapshots + session list
- **Files modified**: `app/(design)/design/scene-composer/page.tsx` (Manual/Auto mode toggle, conditional panel rendering, auto mode state + handlers)
- **Database**: Created `auto_sessions` and `auto_session_messages` tables with RLS policies
- **Details**: Manual/Auto toggle in toolbar. Auto mode replaces left panel with chat, right panel with render history + past sessions. Scene state is shared between modes — manual edits are visible to AI. Each AI response stores a scene snapshot for rewind. 13 tools include: query_database, search_players, get_team_roster, list_templates, build_from_template, load_custom_template, set_scene_properties, add_elements, update_elements, remove_elements, get_scene_info, save_as_template, fetch_player_headshot_url.

## 2026-03-31

### Fix Scores Timezone — Use Local Time Instead of UTC
- **What**: Live Scores on the home page were rolling to the next day's games prematurely (showing tomorrow's schedule while today's games were still on)
- **Why**: `new Date().toISOString().slice(0,10)` returns UTC date, which is ahead of US timezones in the evening. Also, `useState(todayStr)` captures the SSR-computed (UTC) value and persists through hydration.
- **Files**: `app/(research)/home/page.tsx`, `app/api/scores/route.ts`
- **Fix**: (1) Extracted `localToday()` helper using `getFullYear/getMonth/getDate` (always local time); (2) Added mount `useEffect` to correct date if SSR computed a different UTC value; (3) Changed `shiftDate` and "Today" button to use `localToday()`; (4) API fallback uses `America/New_York` timezone; (5) Disabled stale `{ next: { revalidate: 30 } }` cache on MLB API fetch, switched to `{ cache: 'no-store' }`

### Teams Page — Auto-Load + Game Type Filter
- **What**: Teams page now auto-fetches on mount and when controls change. Added Spring Training / Regular Season / Postseason toggle.
- **Why**: Previously required clicking "Load" button manually, showed all game types combined with no way to filter, and tab switching didn't re-fetch if initial load returned 0 rows.
- **Files**: `app/(research)/teams/page.tsx`, `app/api/team-tendencies/route.ts`
- **Fix**: (1) Added `useEffect` to auto-fetch when tab/season/gameType changes; (2) Removed manual "Load" button; (3) Added `GAME_TYPES` toggle (All, Spring Training, Regular Season, Postseason) defaulting to Regular Season; (4) API accepts `gameType` param mapping to `game_type` column filter (`R`, `S`, `D/L/W/F/P`); (5) Default season is now `new Date().getFullYear()` instead of hardcoded '2025'; (6) Added '2026' to seasons list

## 2026-03-30

### Multi-Bucket Daily Cards with Numeric Grade Sorting
- **What**: Daily cards cron now generates 4 buckets of 5 cards each (20 total), sorted by IP, Start Grade, Cmd+, and Stuff+. Previously only generated top 5 by IP.
- **Why**: Enables surfacing top performers by different quality metrics, not just workload
- **Files**: `app/api/starter-card/route.ts` (added `numeric_grades` to response), `app/api/cron/daily-cards/route.ts` (multi-bucket generation), `app/api/daily-cards/route.ts` (bucket query param filtering)
- **Database**: Added `bucket` column (`text NOT NULL DEFAULT 'top_ip'`) to `daily_cards` table
- **Details**: Starter-card API now returns `numeric_grades: { start, stuff, command, triton }` alongside letter grades. Cron fetches all starters' card data first, then sorts 4 ways. Daily-cards GET supports `?bucket=top_stuff` filtering. Archive limit raised to 600 (4x buckets). Bucket values: `top_ip`, `top_start`, `top_cmd`, `top_stuff`.

### Auto-Sync New Players from Statcast Data
- **What**: New players (rookies, callups) appearing in Statcast pitch data are now automatically added to the `players` table during pitch ingestion. The `batter_summary` materialized view is also refreshed after ingestion.
- **Why**: Players in `pitches` but missing from `players` were invisible in search, player pickers, and batter name enrichment. The `batter_summary` view was never refreshed after pitch ingestion.
- **Files**: `app/api/update/route.ts` (added `syncNewPlayers()`), `app/api/cron/roster/route.ts` (added mat view refreshes after player name sync)
- **Database**: Created `refresh_batter_summary` RPC to refresh the `batter_summary` materialized view concurrently
- **Details**: `syncNewPlayers()` extracts pitcher IDs+names from CSV `player_name` column, fetches missing batter names from MLB Stats API in batches of 50, and upserts all missing players. Pattern taken from WBC cron's `syncPlayers()`. Roster cron now refreshes both `player_summary` and `batter_summary` views when player names are updated.

### Fix Admin Tool Permissions Save (eeb2438)
- **What**: Saving user tool access from the Admin panel silently failed whenever 'broadcast' was selected
- **Root cause**: The `tool_permissions` table had a CHECK constraint (`tool_permissions_tool_check`) that only allowed `research`, `mechanics`, `models`, `compete`, `visualize` — missing `broadcast`. Since permissions are batch-inserted, selecting broadcast caused the entire insert to fail. The PATCH endpoint had zero error handling, always returning `{ success: true }`.
- **Files**: `app/api/admin/users/[id]/route.ts`, `app/(admin)/admin/page.tsx`, `app/api/admin/users/route.ts`
- **Fix**: (1) Updated DB CHECK constraint to include `broadcast`; (2) Added error handling to PATCH endpoint for all three Supabase operations; (3) Client-side `handleSaveEdit` now checks response status and shows error banner; (4) Fixed admin/owner hardcoded all-access list missing `broadcast` in GET handler

## 2026-03-27

### Report Card PNG Export Fixes
- **What**: Fixed two bugs in Report Card PNG export: (1) movement plot and zone plot were completely missing from exports, (2) pitch table columns had equal widths causing the Pitch column to shrink and overlap with pitch numbers
- **Why**: The canvas export switch statement had no draw handlers for `rc-movement-plot` and `rc-zone-plot` (just a comment). The table used `w / cols.length` for equal column widths instead of measuring content.
- **Files**: `components/visualize/scene-composer/exportScene.ts`
- **Details**: Added `drawRCMovementPlot()` and `drawRCZonePlot()` static canvas renderers (ported from the React canvas components). Rewrote `drawRCTable()` to measure content widths and allocate columns proportionally, add color dots for pitch_name, and use dynamic font sizing matching the preview renderer.

## 2026-03-25

### Game Log Detail Expansion
- **What**: Added expandable detail panel to Game Log tab — click any game row to see rich per-game stats inline
- **Why**: Users wanted deeper game-level analysis without leaving the tab
- **Files**: `components/dashboard/GameDetail.tsx` (new), `components/dashboard/GameLogTab.tsx`, `components/chartConfig.ts`, `components/dashboard/LocationTab.tsx`
- **Details**: 6 sections — summary pills, pitch arsenal table, 3 Plotly charts (zone scatter, movement, velo by pitch #), inning-by-inning, at-bat results, batted ball summary. Moved `ZONE_SHAPES` to `chartConfig.ts` to deduplicate.

### Fix Auth Flows — Cookie Propagation + Token Hash (ed14801)
- **What**: Invite and reset-password emails sent users to sign-in instead of set-password page
- **Root cause**: Two issues — (1) auth callback Route Handler set session cookies via `cookies()` but returned `NextResponse.redirect()` which didn't carry them, so middleware on `/set-password` found no session and bounced to `/login`; (2) `action_link` (attempted fix) went through Supabase's verify endpoint which redirects with fragment tokens (`#access_token=...`) invisible to server-side handlers
- **Files**: `app/(auth)/auth/callback/route.ts`, `app/api/admin/invite/route.ts`, `app/api/admin/reset-password/route.ts`
- **Fix**: (1) Rewrote callback to create Supabase client with `setAll` writing directly to the `NextResponse.redirect()` object; (2) Reverted invite to `token_hash` query param approach; (3) Switched reset-password from `resetPasswordForEmail` (Supabase email with fragment tokens) to `generateLink({ type: 'recovery' })` + Resend email with `token_hash`
- **Also needed**: Added `https://www.tritonapex.io/auth/callback?next=/set-password` to Supabase dashboard Redirect URLs allowlist

### Fix Build Errors (pre-existing)
- **What**: Vercel deployment was failing due to two pre-existing type/dependency issues
- **Files**: `app/api/batch-render/route.ts`, `package.json`
- **Fix**: Wrapped `Buffer` with `new Uint8Array()` for Next.js 16 `BodyInit` compatibility. Installed missing `recharts` dependency used by `ExploreCharts.tsx`.
