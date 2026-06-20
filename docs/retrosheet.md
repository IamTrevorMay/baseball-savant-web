# Retrosheet — Operator Guide

Backend historical database for Triton. Play-by-play 1914+, game logs 1871+, biofile, parks. Lives in the `retro_*` namespace, parallel to Statcast.

Spec: [retrosheet.planning.md](../retrosheet.planning.md). Memory: [project_retrosheet.md](../../.claude/projects/-Users-trevor-Desktop-Triton-Tools/memory/project_retrosheet.md).

## Attribution requirement

Every UI/API surface that displays `retro_*` data must show the Retrosheet attribution notice:

> The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at "www.retrosheet.org".

Source: [retrosheet.org/notice.txt](https://www.retrosheet.org/notice.txt). MCP tools enforce this automatically via `withRetroAttribution()` in `mcp-server/src/index.ts`.

---

## One-time setup

### 1. Install Chadwick tools

**Preferred (macOS):**
```bash
brew install chadwick
cwevent --help | head -1   # confirm install
```

**Fallback (build from source — any platform):**
```bash
git clone --depth=1 https://github.com/chadwickbureau/chadwick.git
cd chadwick
autoreconf -if
./configure
make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
sudo make install
cwevent --help | head -1
```

### 2. Apply schema
```bash
# Copy DDL into Supabase SQL editor, OR via psql:
psql "$DATABASE_URL" -f scripts/create-retro-tables.sql
```

### 3. Confirm env
`.env.local` must have:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 4. Initial seed (full history)

```bash
# Long-running. Plan for ~6-10 hours of Chadwick parsing + ~1-2 hours of upsert.
# Run overnight on a charged Mac plugged in.
npx tsx scripts/ingest-retrosheet.ts --full 2>&1 | tee logs/retro-seed.log
```

Order inside `--full`:
1. `retro_people` (Chadwick Register people.csv)
2. `retro_parks` (parkcode.txt)
3. `retro_games` (game logs 1871→current)
4. `retro_events` + cwgame supplement (1871→current; gaps before 1914 expected)

Failure on a single season is logged and skipped — the run continues. Check `retro_ingest_runs` for any `status='failed'` rows after seed.

### 5. Validate
```bash
npx tsx scripts/validate-retrosheet.ts --all
```
Exit code 0 = pass. Non-zero = investigate before relying on data.

### 6. Manually curate park ↔ MLBAM venue map
The `retro_parks.mlbam_venue_id` column ships NULL for all parks. For the ~30 currently-active MLB parks, populate via SQL:
```sql
UPDATE retro_parks SET mlbam_venue_id = 22  WHERE park_id = 'DEN02';  -- Coors Field
UPDATE retro_parks SET mlbam_venue_id = 31  WHERE park_id = 'BOS07';  -- Fenway
-- ... etc. Reference: statsapi.mlb.com/api/v1/venues
```
This is one-time; new parks added rarely. The list lives in [docs/VARIABLES.md §retro_parks](./VARIABLES.md).

---

## Recurring operations

### Annual update (manual)
```bash
# When Retrosheet publishes the new year's annual release (~early offseason):
npx tsx scripts/ingest-retrosheet.ts --season 2026
npx tsx scripts/validate-retrosheet.ts --season 2026
```
Idempotent — re-running the same season is a no-op if the source version hasn't changed.

### Refresh Chadwick Register only
```bash
npx tsx scripts/ingest-retrosheet.ts --people-only
```
Picks up monthly Chadwick Register releases (new MLBAM↔retro_id mappings as players debut).

### Refresh park database only
```bash
npx tsx scripts/ingest-retrosheet.ts --parks-only
```

---

## GitHub Actions (auto-detect new releases)

`.github/workflows/retro-ingest.yml` polls Retrosheet weekly. When a new event-zip is detected, it runs the full pipeline + validator.

### Repo secrets (Settings → Secrets and variables → Actions)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Manual trigger
```
Actions tab → retro-ingest → Run workflow
  - season: blank for auto-detect, or "2026" to force
  - force: true to ingest even if no release detected
```

### Why GH Actions, not Vercel
Chadwick is a C binary. Vercel serverless runtimes can't compile or run it. GH Actions Ubuntu runner has full apt + build tools.

---

## Troubleshooting

### `cwevent: command not found`
Chadwick install failed or PATH not updated. See setup §1. Confirm `which cwevent` resolves.

### Row count mismatch warning
The ingest CLI compares the row count Chadwick parsed vs the count actually upserted. A mismatch usually means a duplicate `(game_id, event_id)` natural key — Chadwick double-emitted, or two event files for the same season overlapped. Inspect `data/retrosheet/parsed/cwevent_<year>.csv` for duplicates.

### `REFRESH MATERIALIZED VIEW CONCURRENTLY` fails
Requires a UNIQUE index on `retro_id_map` (already in DDL). If the error is "cannot refresh materialized view concurrently", check the index exists:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'retro_id_map';
```

### Crosswalk coverage < 99.5%
Validator failed because a season has too many retro_ids missing from `retro_people`. Run `--people-only` first to refresh Chadwick Register, then re-run validation.

### ID conflicts in `retro_id_map_conflicts`
Chadwick flagged a multi-mapping. Inspect:
```sql
SELECT * FROM retro_id_map_conflicts ORDER BY detected_at DESC LIMIT 20;
```
Resolve manually by deciding which mapping is correct, updating `retro_people`, then `REFRESH MATERIALIZED VIEW CONCURRENTLY retro_id_map`. Most conflicts are 19th-century or Negro Leagues records.

### Storage pressure
Total retro footprint ~18 GB. Combined with the ~7 GB `pitches` table, requires Supabase Pro 25 GB tier or higher. Check disk:
```sql
SELECT pg_size_pretty(pg_database_size(current_database()));
```

---

## Schema summary

| Table                       | Rows         | Notes                                              |
|-----------------------------|--------------|----------------------------------------------------|
| `retro_people`              | ~22K         | Chadwick Register + Retrosheet biofile             |
| `retro_id_map` (MV)         | ~22K         | retro_id ↔ mlbam_id ↔ bbref_id ↔ fg_id              |
| `retro_id_map_conflicts`    | 0 (target)   | Multi-mapping ambiguities — empty = clean          |
| `retro_parks`               | ~300         | Retrosheet park codes + MLBAM venue crosswalk      |
| `retro_rosters`             | ~150K        | Per (player, team, season)                         |
| `retro_games`               | ~220K        | Game logs authoritative, cwgame supplements        |
| `retro_events`              | ~15M         | Play-by-play 1914+ complete, partial pre-1914      |
| `retro_ingest_runs`         | bookkeeping  | One row per ingest invocation                      |

See [docs/VARIABLES.md](./VARIABLES.md) for the full column glossary.

---

## MCP tools (exposed to assistant)

Live in `mcp-server/src/index.ts`:
- `query_database` — raw SQL passthrough; now mentions retro_ tables in description
- `retro_player_career` — full season-by-season career for a player (retro_id or mlbam_id)
- `retro_player_season` — single-season totals
- `retro_player_splits` — home/away, vs_hand, monthly splits
- `retro_game_lookup` — game header by game_id or (date, teams)
- `retro_game_events` — full event log for a game
- `retro_era_leaderboard` — top-N players by metric within season window
- `retro_team_season` — team record + R/RA for a season
- `retro_id_lookup` — find historical players by name (returns all crosswalk IDs)

**Breaking change (2026-06-14):** existing `search_players` MCP tool renamed to `search_statcast_players` to disambiguate. Same params, same handler. If a client config pinned the old name, update it.
