# Triton Tools Memory

## CRITICAL RULES
- **Change logging**: After every update, fix, or feature — automatically log a short summary in `memory/changelog.md` with date, what changed, why, and key files touched. Do this without being asked.
- **Commit memory files**: When pushing to git, also stage and include the memory files (`MEMORY.md`, `changelog.md`, etc.) from the project's `.claude/` memory directory. Copy them into the repo (e.g. `.claude-memory/`) so they're tracked in git.
- **When creating new templates**: ALWAYS wire them into ALL surfaces. Full checklist:
  1. Add a `StarterTemplate` in `lib/starterTemplates.ts` + add to `STARTER_TEMPLATES` array (THIS IS THE STARTING POINT SCREEN)
  2. Add a `DataDrivenTemplate` entry in `lib/sceneTemplates.ts` (auto-appears in ElementLibrary)
  3. Add `GlobalFilterType` union member in `lib/sceneTypes.ts` if new filter type
  4. Add fork logic in `app/(design)/design/template-builder/page.tsx`
  5. Add data-fetch handler for the globalFilter type in template-builder page
  6. Add filter field schema cases in `lib/filterFieldSchemas.ts` (getFilterFields + getSampleDataForFilter)
  7. Add render section + sections map entry in `components/visualize/template-builder/GlobalFilterPanel.tsx`
  8. Add fetch/rebuild handler in `app/(design)/design/scene-composer/page.tsx`
  9. Add config panel routing in scene-composer if needed (DepthChartConfigPanel etc.)
  10. Add API endpoint/param in `app/api/scene-stats/route.ts` if new data source needed

## Key Template Wiring Files
- `lib/starterTemplates.ts` — STARTER_TEMPLATES array (Starting Point picker screen)
- `lib/sceneTemplates.ts` — DATA_DRIVEN_TEMPLATES array with rebuild() functions
- `lib/sceneTypes.ts` — GlobalFilterType union
- `components/visualize/scene-composer/ElementLibrary.tsx` — Scene Composer template menu (auto from DATA_DRIVEN_TEMPLATES)
- `app/(design)/design/template-builder/page.tsx` — Template Builder fork + data fetch logic
- `app/(design)/design/scene-composer/page.tsx` — Scene Composer fetch/rebuild + config panel routing
- `lib/filterFieldSchemas.ts` — getFilterFields() and getSampleDataForFilter() switch statements
- `components/visualize/template-builder/GlobalFilterPanel.tsx` — filter type UI sections
- `components/visualize/scene-composer/DepthChartConfigPanel.tsx` — depth chart config panel
- `app/api/scene-stats/route.ts` — data fetching API

## Existing Templates
- `rotation-depth-chart` — Starting Rotation Depth Chart
- `bullpen-depth-chart` — Bullpen Depth Chart (closer/setup/relief tiers)

## Broadcast System Architecture

### Key Files
- `app/(broadcast)/broadcast/[projectId]/page.tsx` — Main broadcast manager
- `components/broadcast/BroadcastContext.tsx` — State management, realtime events, hotkeys
- `components/broadcast/ClipMarkerPanel.tsx` — In/Out clip marking UI
- `app/api/broadcast/trigger/route.ts` — Remote trigger API (no auth, session ID as capability token)
- `app/api/broadcast/sessions/route.ts` — Session CRUD
- `app/api/broadcast/widget-state/route.ts` — Widget state persistence
- `app/api/broadcast/clip-markers/route.ts` — Clip marker CRUD
- `lib/useOBSWebSocket.ts` — Local OBS WebSocket connection
- `lib/useStreamDeck.ts` — Local Stream Deck USB integration
- `lib/clipMarkerTypes.ts` — ClipMarker + OBSRecordingState types

### Communication: Manager → Overlay
- Supabase Realtime channel `broadcast:{sessionId}`
- Events: `asset:show/hide`, `asset:update`, `slideshow:goto`, `segment:switch`, `session:sync`, `widget:*`, `clip:marker-update`, `ad:ended`
- Both manager UI and trigger API send events through same Realtime channel

### Trigger API Actions (remote, no auth)
- Asset: `toggle`, `show`, `hide`
- Slideshow: `slideshow_next/prev`, `slideshow_visible_next/prev`
- Countdown: `countdown_start/stop`, `countdown_preset`
- Topics: `topic_next/prev`
- Lower third: `lowerthird_clear` (clear only, can't set text)
- Clips: `clip_short_in/out`, `clip_long_in/out`

### Local-Only (cannot be remotely controlled)
- OBS WebSocket (local network to OBS on same machine)
- Stream Deck (physical USB device)
- Keyboard hotkeys (`[`/`]` short clips, `{`/`}` long clips, alphanumeric asset/segment hotkeys)
- Canvas asset editing (drag/drop, resize, properties)
- Segment switching (hotkeys only, not in trigger API yet)

### Clip Marker System
- Two types: `short` and `long`
- Timestamps = elapsed seconds from OBS recording start, pause-adjusted
- Keyboard: `[`/`]` short, `{`/`}` long
- Export: JSON with HH:MM:SS times + metadata
- DB table: `broadcast_clip_markers`

### State Persistence
- `broadcast_sessions.active_state`: visibleAssets, slideshowIndexes, activeSegmentId, recording timestamps
- `broadcast_widget_state`: topics, countdown, lower third, notifications, chat config, panel order

### Remote Producer Page Plan (not yet built)
**Goal**: Lightweight mobile-friendly page at `/broadcast/[projectId]/remote` for a producer to control a live session without OBS/Stream Deck access.

**New trigger actions needed**:
- `segment_switch` — switch active segment (requires `segment_id` param)
- `lowerthird_set` — set lower third text + subtitle (requires `text`, optional `subtitle`)
- `countdown_set` — start countdown from arbitrary seconds (requires `seconds`)

**Remote producer page UI**:
- Grid of asset toggle buttons (show/hide) with live visibility state
- Segment switcher (buttons per segment, highlight active)
- Slideshow next/prev controls
- Countdown controls (presets + custom time input)
- Topic navigator (prev/next + current topic display)
- Lower third controls (text input + show/clear)
- Clip marker buttons (short/long in/out)
- All state synced in real-time via Supabase Realtime subscription on `broadcast:{sessionId}`

**Auth**: Reuse existing broadcast user auth, or optionally a shareable link with session ID token.

**Not in scope** (always local-only): OBS control, Stream Deck, canvas asset editing, asset creation/deletion.

## Newsletter System (Mayday Daily)

### Architecture
- **Pitch sync cron** (`app/api/cron/pitches`): `0 9 * * *` (1 AM PST). Syncs Statcast data + computes Stuff+ (Triton-custom, NOT Statcast model).
- **Brief cron** (`app/api/cron/briefs/route.ts`): `0 11 * * *` (3 AM PST). Generates daily briefs. Stores `claude_sections`, `daily_highlights`, and `scores` in metadata JSONB. Use `?force=true` to regenerate.
- **Newsletter cron** (`app/api/cron/newsletter/route.ts`): `0 12 * * *` (4 AM PST). Reads brief + fetches trends + Substack RSS, builds per-subscriber emails, sends via Resend batch API.
- **Email template** (`lib/newsletterHtml.ts`): Table-based HTML (email-client safe). Dark theme (#09090b bg, #18181b cards). 640px max-width, responsive via `@media` for mobile.
- **Signup page**: `app/(newsletter)/newsletter/page.tsx` — public landing page, no auth required
- **Domain**: `daily.mayday.show` → rewrites to `/newsletter` (configured in `lib/supabase/middleware.ts`)

### Cron Schedule (UTC → PST)
1. `0 9 * * *` — Pitch sync (1 AM PST) — syncs raw data + computes Stuff+
2. `0 11 * * *` — Briefs (3 AM PST) — depends on pitch sync having run
3. `0 12 * * *` — Newsletter send (4 AM PST) — depends on brief existing

### Key Files
- `lib/newsletterHtml.ts` — `buildNewsletterHtml()`, `highlightsToStandouts()`, `fetchLatestSubstackPost()`
- `app/api/cron/newsletter/route.ts` — Main send cron (auth, idempotency, batch send)
- `app/api/newsletter/subscribe/route.ts` — POST `{ email, name? }` to subscribe
- `app/api/newsletter/unsubscribe/route.ts` — GET (browser link) + POST (RFC 8058 one-click)
- `app/api/newsletter/preview/route.ts` — GET `?date=YYYY-MM-DD` renders HTML in browser
- `scripts/render-newsletter.ts` — Local preview script, outputs to Desktop
- `app/(newsletter)/layout.tsx` — Minimal dark layout (no nav/auth)
- `app/(newsletter)/newsletter/page.tsx` — Signup page (email input → `/api/newsletter/subscribe`)
- `lib/supabase/middleware.ts` — `DAILY_HOSTS` domain routing + `/newsletter` in publicPaths

### Domain Routing
- `daily.mayday.show` / `www.daily.mayday.show` → rewrite `/` to `/newsletter`, allow `/newsletter*` and `/api/newsletter/*`, block everything else
- Same pattern as `mayday.games` → `/game`

### DB Tables
- `newsletter_subscribers` — email (unique), name, is_active, unsubscribe_token (UUID), source
- `newsletter_sends` — date (unique), recipient_count, status, error (idempotency)

### Email Sections (top to bottom)
1. **Header**: MAYDAY DAILY + formatted date
2. **Scores**: Compact game cards, 4 per row (team abbrevs, bold scores, W/L/SV decisions)
3. **The Day in Baseball**: Claude narrative recap (from `claude_sections.dayRundown`)
4. **Yesterday's Standouts**: 2x2 grid of Stuff+/Cmd+ cards with headshots (from `daily_highlights`)
5. **Top Performances**: Claude stat table (from `claude_sections.topPerformances`)
6. **Surges / Concerns**: Side-by-side trend alerts with sigma badges (from `/api/trends`)
7. **Injuries / Transactions**: Side-by-side (from `claude_sections`)
8. **Latest from Mayday**: Most recent Substack post from `mayday.show/feed` (RSS)
9. **Footer**: Unsubscribe link

### Brief Metadata Fields (saved by briefs cron)
- `scores[]` — `{ away, home, awayScore, homeScore, winner, loser, save }`
- `claude_sections` — `{ dayRundown, topPerformances, worstPerformances, injuries, transactions }`
- `daily_highlights` — stuff_starter/reliever, cmd_starter/reliever, new_pitches
- `games_count`, `finished_count`, `is_off_day`

### Stuff+ Note
- Stuff+ is **Triton-custom** (computed during pitch sync in `app/api/cron/pitches`), NOT Statcast's model column
- Briefs cron depends on pitch sync having already run to populate stuff_plus values
- Cmd+ is computed client-side from pitch locations (independent of Statcast model scores)

### Idempotency & Re-running
- **Briefs**: Skip if brief already exists for date. Use `?force=true` to delete + regenerate.
- **Newsletter**: Skip if `newsletter_sends` row exists with `status=sent`. Must delete the row from DB to re-send.
- Both crons auth via `Authorization: Bearer $CRON_SECRET` (production-only env var)

### Substack Integration
- Feed URL: `https://www.mayday.show/feed`
- Parsed via `rss-parser` — extracts title, link, description, author, image
- Image from `enclosure.url` or first `<img>` in `content:encoded`

### Sending
- Resend batch API, chunks of 100
- Per-subscriber unsubscribe URLs with unique tokens
- `List-Unsubscribe` + `List-Unsubscribe-Post` headers (RFC 8058)
- From: `Mayday Daily <noreply@tritonapex.io>`

## Daily Graphics System
- **Cron**: `app/api/cron/daily-graphics/route.ts` — generates 5 graphics daily at `30 12 * * *` (4:30 AM PST, after briefs + newsletter)
- **GET API**: `app/api/daily-graphics/route.ts` — public, no auth, renders PNG on-demand
- **DB table**: `daily_graphics` — `(id, date, type, scene JSONB, metadata JSONB, created_at)`, unique index on `(date, type)`
- **5 graphic types**: `ig-starter-card`, `trends`, `yesterday-scores`, `top-pitchers`, `top-performances`
- **All 1080x1350** (IG portrait format)
- **API modes**:
  - `?date=YYYY-MM-DD&type=...` → PNG
  - `?latest=true&type=...` → PNG of latest date
  - `?latest=true` (no type) → JSON index with URLs for all 5
  - `?list=true` → JSON of all available dates/types
- **Cache**: `public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800`
- **CORS**: Wide open (for Mayday Studio cross-origin access)
- **Data sources**: MLB Schedule API (scores, boxscores), `trends` table, `briefs` table (highlights, claude_sections), `/api/starter-card` (IG card grades), `report_card_templates` (IG card template)
- **Pattern**: Same as daily_cards — cron stores scene JSON, GET renders via `renderCardToPNG()` from `lib/serverRenderCard.ts`
- **Idempotent**: Skips if all 5 exist for date, `?force=true` to regenerate
- **Offseason**: Skips Dec/Jan
- **Timing**: Runs after briefs (3 AM PST) so `daily_highlights` and `claude_sections` are ready

## Testing (Vitest)
- **Runner**: Vitest (`npm test` / `npm run test:watch`), config in `vitest.config.ts`
- **75 tests** in `__tests__/` dir, node environment, `@/` alias resolved
- `__tests__/lib/leagueStats.test.ts` — 30 tests: computePlus, normalCDF, plusToPercentile, valueToPercentile, computePercentile, percentileColor, getLeagueBaseline, computeCommandPlus, computeRPComPlus, computeYearWeightedPlus
- `__tests__/lib/reportQueryBuilder.test.ts` — 16 tests: WHERE clause building (in/gte/lte/eq/between), SQL injection escaping, indexed filter guard, SELECT aliasing, constants
- `__tests__/lib/queryCache.test.ts` — 5 tests: cache hit/miss, TTL, cached wrapper (mocks supabaseAdmin)
- `__tests__/api/playerData.test.ts` — 5 tests: column prefixing logic
- **Extracted for testability**: `lib/reportQueryBuilder.ts` (GROUP_COLS, FILTER_COLS, INDEXED_FILTER_COLS, buildWhereParts, hasIndexedFilter, buildSelectParts) — imported by `app/api/report/route.ts`
- **Exported**: `normalCDF` from `lib/leagueStats.ts` (was private)
- **Known edge case**: `computePlus` returns `Infinity` when `stddev=0` (no guard)

## Query Optimization
- See `memory/changelog.md` for full details (2026-04-07 entry)
- Year filter on player-data (`?year=`), inline JOINs for player names, batched compute-triton
- Indexed filter guard on report route (requires pitcher/batter/year/date/team)
- DB-backed query cache (`lib/queryCache.ts`, table: `query_cache`)
- Client-side year selector on player/hitter pages
- `app/api/player-filter-options/route.ts` — lightweight distinct values endpoint
- `app/api/player-data/route.ts` uses `run_query_long` RPC (longer timeout)

## Daily Cards System
- **Cron**: `app/api/cron/daily-cards/route.ts` — generates cards for latest Statcast date, auth via `CRON_SECRET`
- **GET API**: `app/api/daily-cards/route.ts` — supports `?latest=true`, `?date=`, `?bucket=` params
- **Starter Card API**: `app/api/starter-card/route.ts` — returns full outing data + `grades` (letters) + `numeric_grades` (raw numbers)
- **4 buckets**: `top_ip` (IP desc), `top_start` (triton+ desc), `top_cmd` (cmd+ desc), `top_stuff` (stuff+ desc)
- **Config**: `daily_cards_config` table stores `template_id` and `top_n` (default 5)
- **DB table**: `daily_cards` — columns include `bucket`, `rank`, `scene` (populated template JSON), `template_id`
- **Template population**: `lib/reportCardPopulate.ts` — `populateReportCard(templateScene, data)`
