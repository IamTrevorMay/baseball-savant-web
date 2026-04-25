# Triton — Baseball Analytics Platform

## Project Overview
TruMedia-style baseball analytics platform for scouting reports and media content creation.

## Tech Stack
- React / Next.js 16 with Tailwind CSS
- Supabase (PostgreSQL) — project ID: xgzxfsqwtemlcosglhzr
- Plotly.js for visualizations
- Vercel deployment
- MLB Stats API for roster/standings data

## Key Files
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
- `scripts/create-league-averages.sql` — `league_averages` table DDL
- `scripts/create-refresh-league-averages.sql` — `refresh_league_averages(p_season)` function DDL
- `lib/supabase.ts` — Supabase client
- `app/(compete)/compete/performance/page.tsx` — TrackMan CSV upload + persistent session browser
- `app/api/compete/performance/{upload,sessions,pitches}/route.ts` — ingest + query routes for TrackMan pitch data
- `lib/compete/pitchSchema.ts` — `PitchRow` type plus `parseCsvRow` / `rowToDb` / `dbToRow` mappers
- `scripts/create-compete-pitches.sql` — `compete_pitch_sessions` + `compete_pitches` DDL and RLS

## Database
- `pitches` table: 7.4M+ Statcast rows (2015–2026), 90+ columns
- `milb_pitches` table: parallel MiLB data (2023+). Events column uses Title Case values (`Strikeout`, `Groundout`, `Home Run`, …) vs MLB's lowercase (`strikeout`, `field_out`, …); normalize in queries.
- `players` table: 4,017 players with id, name, position
- `glossary` table: stat definitions
- `filter_templates` table: saved filter configs
- `pitcher_season_command` table: per pitcher × pitch_type × year. Raw Triton command metrics + plus stats. Pitch-weighted aggregate for season-level values.
- `pitcher_season_deception` table: per pitcher × pitch_type × year. `deception_score`, `unique_score` (2017+).
- `league_averages` table: 50th-percentile benchmarks per (season, level, role, metric) for qualified players. Populated by `refresh_league_averages(p_season int)` — idempotent, called nightly by `/api/cron/pitches` for the current season. Consumers: percentile rankings and color-scale midpoints in heatmaps.
- `compete_pitch_sessions` / `compete_pitches` tables: TrackMan pitch data uploaded via the Compete → Performance page. One session row per upload, one pitch row per CSV line with all 73 TrackMan columns promoted. `tm_pitch_uid` is unique → idempotent re-uploads. RLS: admin/owner see all, others see `uploaded_by = auth.uid()`. See `docs/compete-performance.md`.
- Key RPCs: `run_query`, `search_players`, `search_all_players`, `refresh_league_averages`, `is_compete_admin`
- Indexes on: pitcher, batter, game_date

## Conventions
- **SP/RP classification** (canonical, used by `app/api/scene-stats/route.ts` and `refresh_league_averages`): a pitcher is **SP** if they have ≥3 games with 50+ pitches thrown (excluding `pitch_type` in `'PO','IN'`) in the season; **RP** otherwise.
- **League-average qualification**: hitter `AB >= max(25, 0.20 * AB_leader)`; SP/RP `IP >= max(5, 0.20 * IP_leader_for_role)`.
- **Plus-stats exclusion**: any metric name ending in `_plus` (Stuff+, Cmd+, Brink+, etc.) is excluded from `league_averages` — these already normalize to 100.
- **Variables glossary**: `docs/VARIABLES.md` is the canonical glossary of every metric key, query param, and schema type used in stats queries. **When you add or change anything in `lib/reportMetrics.ts`, `lib/sql.ts`, `lib/sceneTypes.ts`, or a new query param in a stats route, update `docs/VARIABLES.md` in the same commit.** See its §0 Maintenance section for the section-by-section mapping.

## Derived Fields (computed client-side in fetchData)
- VAA/HAA (approach angles from trajectory data)
- pfx_x_in / pfx_z_in (movement in inches)
- vs_team (opponent batting team)
- batter_name (from players lookup)

## Design Principles
- Dark theme (zinc-950 bg, emerald accents)
- TruMedia-style UI: chip filters, spectrum heatmaps, compact data tables
- Client-side filtering for single-player views
- Server-side SQL aggregation for cross-player reports
- All movement values in inches, not feet

## Deploy
