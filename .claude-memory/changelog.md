# Changelog

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
