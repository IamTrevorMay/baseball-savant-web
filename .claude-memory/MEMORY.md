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

## Daily Cards System
- **Cron**: `app/api/cron/daily-cards/route.ts` — generates cards for latest Statcast date, auth via `CRON_SECRET`
- **GET API**: `app/api/daily-cards/route.ts` — supports `?latest=true`, `?date=`, `?bucket=` params
- **Starter Card API**: `app/api/starter-card/route.ts` — returns full outing data + `grades` (letters) + `numeric_grades` (raw numbers)
- **4 buckets**: `top_ip` (IP desc), `top_start` (triton+ desc), `top_cmd` (cmd+ desc), `top_stuff` (stuff+ desc)
- **Config**: `daily_cards_config` table stores `template_id` and `top_n` (default 5)
- **DB table**: `daily_cards` — columns include `bucket`, `rank`, `scene` (populated template JSON), `template_id`
- **Template population**: `lib/reportCardPopulate.ts` — `populateReportCard(templateScene, data)`
