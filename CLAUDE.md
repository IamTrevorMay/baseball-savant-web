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
- `lib/supabase.ts` — Supabase client

## Database
- `pitches` table: 7.4M+ Statcast rows (2015–2025), 90+ columns
- `players` table: 4,017 players with id, name, position
- `glossary` table: stat definitions
- `filter_templates` table: saved filter configs
- Key RPCs: `run_query`, `search_players`, `search_all_players`
- Indexes on: pitcher, batter, game_date

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
