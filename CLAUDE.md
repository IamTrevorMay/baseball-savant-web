# Triton — Baseball Analytics Platform

## Project Overview
TruMedia-style baseball analytics platform for scouting reports, media content creation, live broadcast production, and internal team operations.

## Tech Stack
- React / Next.js 16 with Tailwind CSS
- Supabase (PostgreSQL + Realtime) — project ID: xgzxfsqwtemlcosglhzr
- Plotly.js for visualizations
- Vercel deployment
- MLB Stats API for roster/standings data
- `@hello-pangea/dnd` for drag-and-drop (Work app Kanban board)

## Key Files — Analytics
- `app/player/[id]/page.tsx` — Pitching dashboard (main player page)
- `app/reports/page.tsx` — Reports Builder (tile-based scouting reports)
- `app/standings/page.tsx` — MLB standings
- `app/analyst/page.tsx` — AI analyst chat
- `components/FilterEngine.tsx` — Reusable 50+ field filter system
- `components/reports/TileViz.tsx` — Tile visualization components (heatmap, scatter, bar, strike zone, table)
- `components/reports/ReportTile.tsx` — Configurable report tile wrapper
- `app/api/player-data/route.ts` — Server-side player data fetch (uses run_query RPC)
- `app/api/report/route.ts` — Server-side SQL aggregation for reports
- `app/api/roster/route.ts` — MLB roster API proxy
- `app/api/cron/pitches/route.ts` — Daily MLB pitch ingest; also refreshes `league_averages` for current season
- `app/api/scene-stats/route.ts` — Player stats for broadcast scenes and producer presets
- `app/api/standings/route.ts` — Standings data for broadcast overlays
- `lib/supabase.ts` — Supabase client
- `lib/reportMetrics.ts` — Metric definitions for reports
- `lib/sql.ts` — SQL query builder utilities
- `lib/sceneTypes.ts` — Scene element types (21 element types for broadcast canvas)

## Key Files — Compete
- `app/(compete)/compete/performance/page.tsx` — TrackMan CSV upload + persistent session browser
- `app/api/compete/performance/{upload,sessions,pitches}/route.ts` — ingest + query routes for TrackMan pitch data
- `lib/compete/pitchSchema.ts` — `PitchRow` type plus `parseCsvRow` / `rowToDb` / `dbToRow` mappers
- `scripts/create-compete-pitches.sql` — `compete_pitch_sessions` + `compete_pitches` DDL and RLS

## Key Files — Broadcast System
- `app/(broadcast)/broadcast/page.tsx` — Projects list (create, rename, delete)
- `app/(broadcast)/broadcast/[projectId]/page.tsx` — Project editor (assets, scenes, timeline, widgets, OBS settings)
- `app/(broadcast)/producer/[sessionId]/page.tsx` — Producer control panel (push stat overlays to OBS)
- `app/overlay/[sessionId]/page.tsx` — Main overlay output (1920x1080 OBS browser source)
- `app/overlay/[sessionId]/producer-panels/page.tsx` — Producer panels overlay output (transparent, lower bar + right panel)
- `components/broadcast/BroadcastContext.tsx` — Global state (project, assets, sessions, visibility, segments)
- `components/broadcast/AssetLibrary.tsx` — Asset browser (scenes, images, videos, slideshows, ads, widgets)
- `components/broadcast/AssetProperties.tsx` — Property editor (position, layer, transitions, triggers, hotkeys)
- `components/broadcast/BroadcastCanvas.tsx` — Main editing canvas
- `components/broadcast/LiveControlGrid.tsx` — Live control grid for triggering assets
- `components/broadcast/StreamDeckSetup.tsx` — Stream Deck pairing + button mapping
- `components/broadcast/OBSSettings.tsx` — OBS WebSocket connection config
- `components/broadcast/ClipMarkerPanel.tsx` — Clip in/out marking for post-production
- `lib/broadcastTypes.ts` — All broadcast types (project, asset, session, events, transitions, widgets)
- `lib/producerTypes.ts` — Producer panel types (presets, panel positions, data shapes)
- `lib/clipMarkerTypes.ts` — Clip marker types and helpers
- `lib/widgetTypes.ts` — Widget system types (chat, lower third, countdown, topic, notifications, username stack)
- `lib/useOBSWebSocket.ts` — OBS 5.0+ WebSocket integration
- `lib/useOverlaySession.ts` — Realtime overlay session sync
- `lib/useProducerOverlay.ts` — Producer panel Realtime subscription (output side)
- `lib/useProducerControls.ts` — Producer fetch + publish hook (producer side)
- `lib/useStreamDeck.ts` — Stream Deck device enumeration + button mapping
- `lib/useChatConnection.ts` — YouTube/Twitch chat Realtime connection
- `lib/broadcast/checkProjectAccess.ts` — Access control helper (owner/producer/viewer/none)

### Producer Presets
8 preset types: `stat-line`, `standings`, `leaderboard`, `matchup`, `comparison`, `custom-text`, `arsenal`, `movement`. Each has a config form (`components/producer/presets/`) and renderer (`components/producer/renderers/`). Data fetched from `/api/scene-stats` and `/api/standings`.

### Broadcast API Routes (`app/api/broadcast/`)
- `projects/route.ts` — CRUD for broadcast projects
- `projects/[id]/route.ts` — Single project CRUD
- `project-members/route.ts` — Project sharing (owner/producer/viewer roles)
- `sessions/route.ts` — Live session management
- `assets/route.ts` — Asset CRUD
- `scenes/route.ts` — Scene/segment management
- `scene-assets/route.ts` — Asset-in-scene overrides
- `clip-markers/route.ts` — Post-production clip markers
- `widget-state/route.ts` — Widget state sync
- `trigger/route.ts` — Asset trigger commands (show, hide, flash, toggle) + producer panel actions
- `upload/route.ts` — Asset file upload to Supabase storage
- `chat-messages/route.ts` — Chat message fetch
- `youtube-chat/route.ts` — YouTube chat connection

## Key Files — Work App (Internal Ops)
- `app/(work)/work/page.tsx` — Dashboard with SprintPanel + WorkBoard
- `app/(work)/work/layout.tsx` — Auth layout with role checks (admin/assistant/member)
- `app/(work)/work/channels/page.tsx` — Slack-style team channels (real-time, pinning, @mentions, formatting)
- `app/(work)/work/messages/page.tsx` — Direct messaging (1-to-1 and group DMs, real-time)
- `app/(work)/work/myboard/page.tsx` — Personal task board
- `app/(work)/work/sprints/page.tsx` — Sprint planning, velocity tracking, goals, retro
- `app/(work)/work/calendar/page.tsx` — Event calendar
- `app/(work)/work/goals/page.tsx` — Personal + team goal tracking
- `app/(work)/work/resources/page.tsx` — Shared resources (placeholder)
- `app/(work)/work/jobs/page.tsx` — Job assignments (placeholder)
- `app/(work)/work/assessments/page.tsx` — Assessments (placeholder)
- `components/work/WorkNav.tsx` — Left sidebar navigation (192px)
- `components/work/WorkBoard.tsx` — Kanban board with drag-and-drop (Ready/In Progress/Holding/Done + Inbox/Backlog)
- `components/work/SprintPanel.tsx` — Sprint summary + velocity chart + sprint goals
- `components/work/SprintGoals.tsx` — Sprint goals CRUD (max 3 per sprint)
- `components/work/SprintRetroModal.tsx` — Sprint completion retro modal
- `components/work/VelocityChart.tsx` — SVG bar chart of past sprint velocities
- `lib/work/sprints.ts` — Sprint helpers (week calc, status labels, column configs)
- `lib/work/useWorkRole.ts` — Fetch user's work role

## Database

### Analytics Tables
- `pitches` table: 7.4M+ Statcast rows (2015–2026), 90+ columns
- `milb_pitches` table: parallel MiLB data (2023+). Events column uses Title Case values (`Strikeout`, `Groundout`, `Home Run`, …) vs MLB's lowercase (`strikeout`, `field_out`, …); normalize in queries.
- `players` table: 4,017 players with id, name, position
- `glossary` table: stat definitions
- `filter_templates` table: saved filter configs
- `pitcher_season_command` table: per pitcher × pitch_type × year. Raw Triton command metrics + plus stats. Pitch-weighted aggregate for season-level values.
- `pitcher_season_deception` table: per pitcher × pitch_type × year. `deception_score`, `unique_score` (2017+).
- `league_averages` table: 50th-percentile benchmarks per (season, level, role, metric) for qualified players. Populated by `refresh_league_averages(p_season int)` — idempotent, called nightly by `/api/cron/pitches` for the current season.
- `compete_pitch_sessions` / `compete_pitches` tables: TrackMan pitch data. See `docs/compete-performance.md`.
- Indexes on: pitcher, batter, game_date

### Broadcast Tables
- `broadcast_projects` — project metadata + settings (fps, transitions, OBS config)
- `broadcast_project_members` — sharing (owner/producer/viewer roles)
- `broadcast_assets` — assets with type, position, layer, transitions, triggers, hotkeys
- `broadcast_scenes` — named scenes with transition overrides
- `broadcast_scene_assets` — asset-in-scene position/layer overrides
- `broadcast_sessions` — live sessions with channel name, active state (visible assets, slideshow indexes, recording state)
- `broadcast_clip_markers` — post-production clip markers (start/end time, assignee, status)
- `broadcast_chat_messages` — chat messages per session

### Work Tables
- `work_roles` — user roles (admin/assistant/member)
- `work_sprints` — sprint periods with status (active/completed/planning) and velocity
- `work_sprint_goals` — sprint goals (max 3, with position ordering)
- `work_sprint_retros` — sprint retro entries (went_well, to_improve)
- `work_tasks` — tasks with status (inbox/today/this_week/done/backlog/ready/in_progress/holding), category, priority, due_date, position, recurrence
- `work_calendar_events` — events (session/meeting/assessment/admin/other)
- `work_goals` — personal + team goals with target/current values
- `work_admin_goals` — admin daily targets
- `work_channels` — team communication channels (name, description, is_default, sort_order)
- `work_channel_messages` — channel messages with mentions, pinning, editing
- `work_conversations` — DM conversations (1-to-1 or group, with name)
- `work_conversation_participants` — conversation membership
- `work_direct_messages` — direct messages within conversations

### Key RPCs
- `run_query` — generic SQL execution for analytics
- `search_players`, `search_all_players` — player search
- `refresh_league_averages(p_season)` — rebuild league averages
- `is_compete_admin` — check compete admin status
- `work_get_or_create_dm(other_user_id)` — idempotent 1-to-1 DM creation
- `is_work_admin()`, `is_work_staff()`, `has_work_access()` — work role checks

## Conventions
- **Clarifying questions first**: Whenever the user suggests changes, ask any clarifying questions using the multiple choice selector (AskUserQuestion tool) before moving forward with any work.
- **SP/RP classification** (canonical, used by `app/api/scene-stats/route.ts` and `refresh_league_averages`): a pitcher is **SP** if they have ≥3 games with 50+ pitches thrown (excluding `pitch_type` in `'PO','IN'`) in the season; **RP** otherwise.
- **League-average qualification**: hitter `AB >= max(25, 0.20 * AB_leader)`; SP/RP `IP >= max(5, 0.20 * IP_leader_for_role)`.
- **Plus-stats exclusion**: any metric name ending in `_plus` (Stuff+, Cmd+, Brink+, etc.) is excluded from `league_averages` — these already normalize to 100.
- **Variables glossary**: `docs/VARIABLES.md` is the canonical glossary of every metric key, query param, and schema type used in stats queries. **When you add or change anything in `lib/reportMetrics.ts`, `lib/sql.ts`, `lib/sceneTypes.ts`, or a new query param in a stats route, update `docs/VARIABLES.md` in the same commit.** See its §0 Maintenance section for the section-by-section mapping.
- **Broadcast Realtime**: All broadcast events flow through Supabase Realtime channels (one per session). Producer panels share the same channel as the main overlay.
- **Work table prefix**: All work app tables use the `work_` prefix. RLS uses `is_work_admin()`, `is_work_staff()`, `has_work_access()` functions.
- **Query logging**: Every ad-hoc database query run during a session must be appended to `docs/Queries.md` before returning results to the user. Log the date (as a `## YYYY-MM-DD` header if new day), a short description, the SQL (in a fenced code block), and a one-line result summary. Group queries under the same date header.
- **Ideas logging**: `docs/Ideas.md` is a living log of exploratory metric/algorithm conversations. Only add entries when the user explicitly asks.
- **Planning doc**: `planning.md` (repo root) is the living project roadmap. **Update it when completing significant features, performance work, or architectural changes.** Keep the "Recently Completed", "Known Issues", and "Architecture Notes" sections current.

## Derived Fields (computed client-side in fetchData)
- VAA/HAA (approach angles from trajectory data)
- pfx_x_in / pfx_z_in (movement in inches)
- vs_team (opponent batting team)
- batter_name (from players lookup)

## Design Principles
- Dark theme (zinc-950 bg, emerald accents for analytics, sky accents for broadcast/work)
- TruMedia-style UI: chip filters, spectrum heatmaps, compact data tables
- Client-side filtering for single-player views
- Server-side SQL aggregation for cross-player reports
- All movement values in inches, not feet
- Broadcast overlays use transparent backgrounds for OBS browser sources (1920x1080)
- Work app uses violet accents for messaging, sky accents for navigation
- Mobile-responsive: `useDevice()` hook for mobile/desktop detection, separate mobile components in `components/mobile/`

## Deploy
