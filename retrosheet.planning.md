# Retrosheet Integration — Planning Spec

**Status:** Draft, awaiting approval. **Do not build until signed off.**
**Owner:** Trevor
**Created:** 2026-06-14

---

## 1. Goal & Scope

Add Retrosheet as a **historical spine** for Triton — a parallel namespace of
tables that holds play-by-play data back to 1914 and game-level data back to 1871.
Statcast (`pitches`, 2015+) stays untouched. The two systems are joined only by
a player-ID crosswalk in v1; per-event joins are deferred.

Backend-only in v1: no UI surfaces. Exposed to the **Triton MCP server** so the
assistant (and any MCP client) can query the historical record via SQL and a
small set of curated tools.

### v1 Coverage (locked)
- **Play-by-play (PBP)** — 1914 to present (`retro_events`)
- **Game logs** — 1871 to present (`retro_games`)
- **Rosters** — per team per season (`retro_rosters`)
- **People / bio** — Chadwick Register `people.csv` + Retrosheet biofile (`retro_people`)
- **Parks** — Retrosheet park database (`retro_parks`)
- **Player ID crosswalk** — `retro_id` ↔ `mlbam_id` ↔ `bbref_id` ↔ `fg_id` (`retro_id_map`)

### Out of scope (v1)
- Per-event Statcast↔Retrosheet bridge (overlap join 2015+). ID-only crosswalk ships v1; event-level join is v2.
- Front-end views (no React pages, no Mayday-themed components).
- Real-time / nightly ingest. Retrosheet publishes ~annually → manual reruns are fine.
- Box-score reconstruction beyond what Chadwick `cwbox` emits as a side artifact.

---

## 2. Architecture Principles

1. **Separate namespace.** Every table prefixed `retro_`. No columns added to existing Statcast tables.
2. **Different grain.** Statcast = 1 row / pitch. Retrosheet `retro_events` = 1 row / play (≈ PA, but includes SB/CS/balks/etc.). Do not try to flatten them.
3. **Conventions match existing codebase.**
   - DDL lives in `scripts/create-retro-*.sql` (mirrors `create-compete-pitches.sql`, `create-league-averages.sql`).
   - Indexes named `<table>_<cols>_idx`.
   - RLS enabled, public read for authenticated, writes via service role only.
   - Helper functions `is_retro_admin()` style if needed (probably not for v1 since reads are public).
4. **Idempotent ingest.** Reruns by `(season, data_version)` are no-ops if data hasn't changed.
5. **No new infra.** Local CLI script + existing Supabase project (`xgzxfsqwtemlcosglhzr`). No new worker, no new cron, no new MCP server.

---

## 3. Schema

All tables in `public` schema, `retro_` prefix.

### 3.1 `retro_people`
Source: Chadwick Register `people.csv` + Retrosheet biofile (managers/umpires).
Grain: one row per person across all leagues/eras.

| Column                | Type        | Notes                                                           |
|-----------------------|-------------|-----------------------------------------------------------------|
| `retro_id`            | text PK     | 8-char Retrosheet ID, e.g. `ruthb101`                           |
| `mlbam_id`            | int         | Maps to `pitches.pitcher`/`batter`. Nullable (pre-MLBAM era).   |
| `bbref_id`            | text        | Baseball-Reference ID                                           |
| `fg_id`               | int         | FanGraphs ID                                                    |
| `name_first`          | text        |                                                                 |
| `name_last`           | text        |                                                                 |
| `name_given`          | text        | Full given name                                                 |
| `name_suffix`         | text        |                                                                 |
| `birth_date`          | date        |                                                                 |
| `birth_city`          | text        |                                                                 |
| `birth_country`       | text        |                                                                 |
| `death_date`          | date        |                                                                 |
| `bats`                | text        | `L`/`R`/`S`                                                     |
| `throws`              | text        | `L`/`R`/`S`                                                     |
| `height_in`           | int         |                                                                 |
| `weight_lb`           | int         |                                                                 |
| `debut_date`          | date        | MLB debut                                                       |
| `final_date`          | date        | Last MLB game                                                   |
| `source_version`      | text        | Chadwick Register release tag                                   |
| `updated_at`          | timestamptz | `default now()`                                                 |

**Indexes:** `retro_people_mlbam_idx (mlbam_id)`, `retro_people_bbref_idx (bbref_id)`, `retro_people_name_idx (name_last, name_first)`.

### 3.2 `retro_id_map` (the crosswalk)
**Materialized view** over `retro_people` — thin key-only projection for fast joins
from `pitches` ↔ `retro_events`. Refreshed by ingest pipeline (CONCURRENTLY, so reads
never block).

| Column      | Type    | Notes                       |
|-------------|---------|-----------------------------|
| `retro_id`  | text    | Unique index (required for CONCURRENTLY refresh) |
| `mlbam_id`  | int     | Indexed                     |
| `bbref_id`  | text    |                             |
| `fg_id`     | int     |                             |

```sql
CREATE MATERIALIZED VIEW retro_id_map AS
  SELECT retro_id, mlbam_id, bbref_id, fg_id
  FROM retro_people
  WHERE retro_id IS NOT NULL;

CREATE UNIQUE INDEX retro_id_map_retro_id_idx ON retro_id_map (retro_id);
CREATE INDEX retro_id_map_mlbam_idx ON retro_id_map (mlbam_id);
```

Refresh step appended to ingest pipeline (see §5 stage 7):
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY retro_id_map;
```

**Ambiguity flag:** Chadwick Register has known unresolved ID conflicts (~handful per
release, mostly 19th-century players + Negro Leagues). Spec calls for a
`retro_id_map_conflicts` table that lists any row where Chadwick reports
multiple candidate MLBAM IDs — populated by the ingest script, never silently
guessed. Empty in v1 = clean.

### 3.3 `retro_parks`
Source: Retrosheet park database (`parkcode.txt`).

| Column         | Type    | Notes                                |
|----------------|---------|--------------------------------------|
| `park_id`         | text PK | 5-char Retrosheet code, e.g. `BOS07`           |
| `name`            | text    | Stadium name                                   |
| `aka`             | text    | Alternate names                                |
| `city`            | text    |                                                |
| `state`           | text    |                                                |
| `country`         | text    |                                                |
| `first_game`      | date    |                                                |
| `last_game`       | date    | Nullable (active parks)                        |
| `league`          | text    | `AL`/`NL`/`FL`/etc.                            |
| `mlbam_venue_id`  | int     | MLBAM venue ID for cross-era park queries. Nullable for inactive/historical parks. Manually curated for ~30 active MLB parks during initial seed. |
| `notes`           | text    |                                                |

**Indexes:** `retro_parks_mlbam_venue_idx (mlbam_venue_id) WHERE mlbam_venue_id IS NOT NULL`.

### 3.4 `retro_rosters`
Source: Chadwick `cwroster` → CSV. One row per (player, team, season).

| Column         | Type    | Notes                                          |
|----------------|---------|------------------------------------------------|
| `id`           | bigserial PK |                                           |
| `season`       | int     |                                                |
| `team_id`      | text    | Retrosheet team code (e.g. `NYA`, `BOS`)       |
| `retro_id`     | text    | FK → `retro_people.retro_id`                   |
| `last_name`    | text    | Snapshot from roster file                      |
| `first_name`   | text    |                                                |
| `bats`         | text    |                                                |
| `throws`       | text    |                                                |
| `position`     | text    | Primary listed position                        |

**Indexes:** `retro_rosters_season_team_idx (season, team_id)`, `retro_rosters_retro_id_idx (retro_id)`.
**Unique:** `(season, team_id, retro_id)`.

### 3.5 `retro_games`
Source: **Retrosheet game logs are authoritative for all seasons.** Chadwick `cwgame`
fills supplementary fields game logs lack (e.g. umpire IDs in certain eras). On
conflict between game log and `cwgame` for the same field, game log wins.

Grain: one row per game. ~220K rows (1871–present).

| Column              | Type   | Notes                                                          |
|---------------------|--------|----------------------------------------------------------------|
| `game_id`           | text PK | Retrosheet game ID, e.g. `BOS201804040`                       |
| `game_date`         | date   |                                                                |
| `game_number`       | int    | 0 = single, 1/2 = doubleheader                                 |
| `day_of_week`       | text   |                                                                |
| `season`            | int    |                                                                |
| `home_team_id`      | text   | Retrosheet 3-char code                                         |
| `away_team_id`      | text   |                                                                |
| `home_league`       | text   |                                                                |
| `away_league`       | text   |                                                                |
| `park_id`           | text   | FK → `retro_parks.park_id`                                     |
| `home_score`        | int    |                                                                |
| `away_score`        | int    |                                                                |
| `innings`           | int    |                                                                |
| `day_night`         | text   | `D`/`N`                                                        |
| `attendance`        | int    |                                                                |
| `duration_min`      | int    | Game length in minutes                                         |
| `temperature_f`     | int    |                                                                |
| `wind_dir`          | text   |                                                                |
| `wind_speed`        | int    |                                                                |
| `field_condition`   | text   |                                                                |
| `precipitation`     | text   |                                                                |
| `sky`               | text   |                                                                |
| `winning_pitcher`   | text   | retro_id                                                       |
| `losing_pitcher`    | text   | retro_id                                                       |
| `save_pitcher`      | text   | retro_id                                                       |
| `home_manager`      | text   | retro_id                                                       |
| `away_manager`      | text   | retro_id                                                       |
| `ump_home_id`       | text   | retro_id                                                       |
| `ump_1b_id`         | text   |                                                                |
| `ump_2b_id`         | text   |                                                                |
| `ump_3b_id`         | text   |                                                                |
| `forfeit`           | text   | Forfeit indicator                                              |
| `protest`           | text   | Protest indicator                                              |
| `source`            | text   | `gamelog` (default, authoritative) or `gamelog+cwgame` when cwgame filled supplementary fields |
| `source_version`    | text   | Retrosheet release tag                                         |
| `raw`               | jsonb  | Full Chadwick row for forward-compat                           |

**Indexes:**
- `retro_games_date_idx (game_date)`
- `retro_games_season_idx (season)`
- `retro_games_home_team_idx (season, home_team_id)`
- `retro_games_away_team_idx (season, away_team_id)`
- `retro_games_park_idx (park_id)`

### 3.6 `retro_events`
Source: Chadwick `cwevent` → CSV. The big one.

Grain: one row per play (PA + SB/CS/PB/balk/etc.). ~15M rows (1914–present).

Column set chosen from `cwevent --help` output. Promote the high-value fields to typed columns; stash the rest in `raw jsonb` for forward-compat.

| Column              | Type   | Notes                                                              |
|---------------------|--------|--------------------------------------------------------------------|
| `id`                | bigserial PK |                                                              |
| `game_id`           | text   | FK → `retro_games.game_id`                                         |
| `event_id`          | int    | Sequence within game (Chadwick `EVENT_ID`)                         |
| `inning`            | int    |                                                                    |
| `bat_team`          | int    | 0 = away, 1 = home                                                 |
| `outs`              | int    | Outs at start of play (0/1/2)                                      |
| `balls`             | int    | Count at end of PA                                                 |
| `strikes`           | int    |                                                                    |
| `pitch_seq`         | text   | Pitch-by-pitch sequence (B/C/S/X/etc.)                             |
| `away_score`        | int    | Score at start of play                                             |
| `home_score`        | int    |                                                                    |
| `batter_id`         | text   | retro_id                                                           |
| `batter_hand`       | text   | `L`/`R`                                                            |
| `pitcher_id`        | text   |                                                                    |
| `pitcher_hand`      | text   |                                                                    |
| `catcher_id`        | text   |                                                                    |
| `first_id`          | text   | Defensive lineup at time of play                                   |
| `second_id`         | text   |                                                                    |
| `third_id`          | text   |                                                                    |
| `shortstop_id`      | text   |                                                                    |
| `left_id`           | text   |                                                                    |
| `center_id`         | text   |                                                                    |
| `right_id`          | text   |                                                                    |
| `runner_1b_id`      | text   |                                                                    |
| `runner_2b_id`      | text   |                                                                    |
| `runner_3b_id`      | text   |                                                                    |
| `event_text`        | text   | Raw event string (e.g. `S8/L`, `K`, `HR/F89D`)                     |
| `leadoff_flag`      | bool   |                                                                    |
| `ph_flag`           | bool   | Pinch hitter                                                       |
| `defensive_pos`     | int    | Batter's defensive position                                        |
| `lineup_pos`        | int    | 1–9                                                                |
| `event_type`        | int    | Chadwick coded event type (0–24)                                   |
| `bat_event_flag`    | bool   | True = PA-ending event                                             |
| `ab_flag`           | bool   | Counts as AB                                                       |
| `hit_value`         | int    | 0=out, 1=1B, 2=2B, 3=3B, 4=HR                                      |
| `sh_flag`           | bool   |                                                                    |
| `sf_flag`           | bool   |                                                                    |
| `outs_on_play`      | int    |                                                                    |
| `rbi_on_play`       | int    |                                                                    |
| `wp_flag`           | bool   | Wild pitch                                                         |
| `pb_flag`           | bool   | Passed ball                                                        |
| `batted_ball_type`  | text   | `F`/`G`/`L`/`P` (when known, post-~1989)                           |
| `bunt_flag`         | bool   |                                                                    |
| `foul_flag`         | bool   |                                                                    |
| `hit_location`      | text   | Fielding location code                                             |
| `num_errors`        | int    |                                                                    |
| `batter_dest`       | int    | 0=out, 1–4 = base reached/scored                                   |
| `runner_1b_dest`    | int    |                                                                    |
| `runner_2b_dest`    | int    |                                                                    |
| `runner_3b_dest`    | int    |                                                                    |
| `play_on_batter`    | text   | Fielding sequence                                                  |
| `play_on_runner_1b` | text   |                                                                    |
| `play_on_runner_2b` | text   |                                                                    |
| `play_on_runner_3b` | text   |                                                                    |
| `responsible_pitcher_1b` | text |                                                                  |
| `responsible_pitcher_2b` | text |                                                                  |
| `responsible_pitcher_3b` | text |                                                                  |
| `source_version`    | text   | Retrosheet release tag this row came from                          |
| `raw`               | jsonb  | Full `cwevent` row for forward-compat                              |

**Unique:** `(game_id, event_id)`.

**Indexes:**
- `retro_events_game_idx (game_id, event_id)` — implicit unique
- `retro_events_pitcher_season_idx (pitcher_id, game_id)` — career pitcher rollups
- `retro_events_batter_season_idx (batter_id, game_id)` — career batter rollups
- `retro_events_event_type_idx (event_type)` — event filtering (HR, K, BB, etc.)
- `retro_events_game_inning_idx (game_id, inning, bat_team)` — inning-state queries

Index size estimate: ~5–7 GB total on top of ~10 GB table. Within Supabase Pro budget but **must be added incrementally during load**, not before — bulk insert with all indexes live will blow load time.

### 3.7 `retro_ingest_runs`
Bookkeeping. One row per ingest invocation.

| Column           | Type        | Notes                              |
|------------------|-------------|------------------------------------|
| `id`             | bigserial PK |                                   |
| `started_at`     | timestamptz |                                    |
| `finished_at`    | timestamptz |                                    |
| `season`         | int         | Nullable for full-history runs     |
| `table_loaded`   | text        | `retro_events` / `retro_games`/etc.|
| `source_version` | text        | Retrosheet release tag             |
| `rows_inserted`  | int         |                                    |
| `rows_updated`   | int         |                                    |
| `status`         | text        | `success` / `failed` / `partial`   |
| `error`          | text        |                                    |
| `notes`          | jsonb       |                                    |

---

## 4. ID Crosswalk Strategy

### Source of truth
- **[Chadwick Register](https://github.com/chadwickbureau/register)** `people.csv` — the canonical cross-system ID file. Updated monthly. Has `key_retro`, `key_mlbam`, `key_bbref`, `key_fangraphs`, `key_npb`, `key_kbo`, etc.

### Load
- Pull `register/data/people.csv` from the Chadwick repo at ingest time.
- Insert/upsert into `retro_people` on `retro_id`.
- `retro_id_map` is a VIEW: `SELECT retro_id, mlbam_id, bbref_id, fg_id FROM retro_people WHERE retro_id IS NOT NULL`.

### Conflict handling
- Chadwick occasionally has multi-mapping cases (e.g. two retro_ids → one mlbam_id, or vice versa). When detected during load:
  - Log to `retro_id_map_conflicts (retro_id text, mlbam_id int, reason text, register_version text)`.
  - **Do not silently pick one.** The Statcast-side mapping is left NULL; queries that need to bridge will surface the gap.
- Expected count: handful per release. Real ambiguity (per Chadwick docs) lives in 19th-century and Negro Leagues records.

### Join pattern (when MCP needs a bridge)
```sql
-- Statcast pitcher → Retrosheet career events
SELECT e.*
FROM pitches p
JOIN retro_id_map m ON m.mlbam_id = p.pitcher
JOIN retro_events e ON e.pitcher_id = m.retro_id
WHERE p.pitcher = $1;
```

---

## 5. Chadwick Ingestion Pipeline

### Tools
- **Chadwick Baseball Bureau tools** (C binaries): `cwevent`, `cwgame`, `cwbox`, `cwroster`, `cwsub`.
  - Install on the local box (Trevor's Mac): `brew install chadwick` (Homebrew tap exists) OR build from source (`github.com/chadwickbureau/chadwick`).
- **Raw data:** Retrosheet annual event-file zips from `retrosheet.org/game.htm` + game logs from `retrosheet.org/gamelogs/index.html` + biofile + parks.

### Local script: `scripts/ingest-retrosheet.ts`
A single TS CLI run with `tsx` (matches the `import-lahman.ts`, `backfill-newsletter-encryption.ts` patterns already in `scripts/`).

```
Usage:
  pnpm tsx scripts/ingest-retrosheet.ts --season 2025
  pnpm tsx scripts/ingest-retrosheet.ts --full         # 1914+ PBP, 1871+ game logs
  pnpm tsx scripts/ingest-retrosheet.ts --people-only  # refresh Chadwick Register
  pnpm tsx scripts/ingest-retrosheet.ts --parks-only
```

### Pipeline stages (per season)

```
                ┌─────────────────────────────────────┐
                │ 1. DOWNLOAD                         │
                │  - retrosheet.org/{year}eve.zip     │
                │  - retrosheet.org/gl{year}.zip      │
                │  - chadwickbureau/register people   │
                │  - Retrosheet biofile + parkcode    │
                │  Store under: data/retrosheet/raw/  │
                └────────────┬────────────────────────┘
                             │
                ┌────────────▼────────────────────────┐
                │ 2. CHADWICK PARSE                   │
                │  cwevent -y YYYY -f 0-96 *.EVA > events.csv │
                │  cwgame  -y YYYY -f 0-83 *.EVA > games.csv  │
                │  cwroster   *.ROS              > rosters.csv │
                │  Store under: data/retrosheet/parsed/        │
                └────────────┬────────────────────────┘
                             │
                ┌────────────▼────────────────────────┐
                │ 3. STAGING LOAD                     │
                │  COPY into retro_events_staging,    │
                │             retro_games_staging,    │
                │             retro_rosters_staging   │
                │  (TEMP-like tables, truncate first) │
                └────────────┬────────────────────────┘
                             │
                ┌────────────▼────────────────────────┐
                │ 4. VALIDATE                         │
                │  - row counts match Chadwick stderr │
                │  - no orphan game_id refs           │
                │  - season totals vs Retrosheet      │
                │    published summaries              │
                │  - abort + log to retro_ingest_runs │
                │    if any check fails               │
                └────────────┬────────────────────────┘
                             │
                ┌────────────▼────────────────────────┐
                │ 5. PROMOTE (idempotent upsert)      │
                │  INSERT … ON CONFLICT (game_id,     │
                │    event_id) DO UPDATE              │
                │  Keyed by natural PK, so re-running │
                │  same season is a no-op.            │
                └────────────┬────────────────────────┘
                             │
                ┌────────────▼────────────────────────┐
                │ 6. RECORD RUN                       │
                │  INSERT INTO retro_ingest_runs …    │
                └────────────┬────────────────────────┘
                             │
                ┌────────────▼────────────────────────┐
                │ 7. REFRESH MATERIALIZED VIEW        │
                │  REFRESH MATERIALIZED VIEW          │
                │    CONCURRENTLY retro_id_map;       │
                │  (only when retro_people changed)   │
                └─────────────────────────────────────┘
```

### Row-count expectations
- `retro_events`: ~150–190K rows per modern season; ~15M total 1914–2025.
- `retro_games`: ~2,500 per modern season; ~220K total 1871–2025.
- `retro_rosters`: ~1,200 per modern season; ~150K total.
- `retro_people`: ~22K rows total (Chadwick Register).
- `retro_parks`: ~300 rows total.

### Validation step (concrete checks before promote)
1. **Row count vs Chadwick stderr** — `cwevent` prints counts; compare ±0.
2. **Game ↔ event referential integrity** — no `retro_events.game_id` missing from `retro_games`.
3. **Date sanity** — every `game_date` matches first 8 chars of `game_id` (Retrosheet convention).
4. **People crosswalk completeness** — % of `retro_events.batter_id` resolvable to `retro_people` ≥ 99.5%.
5. **Season totals vs Retrosheet published season stats** (HR, R, H totals within 0.1%).

Any failure → abort, mark `retro_ingest_runs.status = failed`, leave promoted tables untouched.

### Idempotency
- All upserts keyed on natural PKs: `retro_events (game_id, event_id)`, `retro_games (game_id)`, `retro_rosters (season, team_id, retro_id)`, `retro_people (retro_id)`.
- Re-running the same season is a no-op (rows already exist with same content).
- Re-running with a new Retrosheet release updates `source_version` and `raw`.

### Initial seed
Single full-history run: ~6–10 hours of Chadwick parsing on a modern Mac, ~1–2 hours of Supabase COPY. Run overnight from local CLI, validate, then enable GH Actions for ongoing detection.

### 5.X GitHub Actions workflow (annual auto-detection)
`.github/workflows/retro-ingest.yml` — weekly schedule, polls Retrosheet for new annual release, runs full pipeline when detected.

```yaml
name: retro-ingest
on:
  schedule:
    - cron: '0 12 * * 0'  # Sunday noon UTC, weekly poll
  workflow_dispatch:       # manual trigger
    inputs:
      season:
        description: 'Season to ingest (blank = auto-detect new release)'
        required: false
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Chadwick
        run: |
          sudo apt-get update
          sudo apt-get install -y autoconf automake libtool
          git clone --depth=1 https://github.com/chadwickbureau/chadwick.git
          cd chadwick && autoreconf -if && ./configure && make && sudo make install
      - name: Setup Node
        uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - name: Detect new Retrosheet release
        id: detect
        run: node scripts/check-retrosheet-release.js
      - name: Run ingest
        if: steps.detect.outputs.new_release == 'true' || inputs.season != ''
        env:
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
        run: npx tsx scripts/ingest-retrosheet.ts --season ${{ steps.detect.outputs.season || inputs.season }}
      - name: Notify on completion
        if: always() && steps.detect.outputs.new_release == 'true'
        run: node scripts/notify-retro-ingest.js --status ${{ job.status }}
```

**Secrets required (GH repo settings):** `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, optional `RETROSHEET_NOTIFY_WEBHOOK` for completion notifications.

**Why Ubuntu runner, not Vercel:** Chadwick is a C binary. Vercel serverless can't compile/run it. GitHub Actions Ubuntu runner has full apt + build tools.

**Why not local cron:** local machine may be off when Retrosheet drops. GH Actions runs unattended.

**Local CLI still supported** for ad-hoc reruns, debugging, and initial seed. The workflow just wraps the same `scripts/ingest-retrosheet.ts` entry point.

---

## 6. Statcast↔Retrosheet Bridge (v1 minimal)

**v1 ships:** `retro_id_map` (VIEW over `retro_people`). That's the player-ID bridge — sufficient to ask "show me Verlander's pre-2015 career events alongside his Statcast career."

**v1 does NOT ship:** per-event join (Retrosheet `event_id` ↔ Statcast `at_bat_number` × `pitch_number`).

### Why defer the event-level bridge
- Retrosheet `game_id` ≠ Statcast `game_pk`. Mapping requires a join through date + home/away team codes (Retrosheet 3-char vs Statcast numeric team IDs). Tractable but tedious — wants its own validation pass.
- Retrosheet `event_id` is "plays" not strictly PAs; Statcast `at_bat_number` is PAs. Match requires sequencing pitches within a PA → events within a half-inning, and reconciling cases (SB during AB, intentional walks pre/post-2017).
- No v1 product depends on it. The MCP "show me Verlander's full history" use case is solved by the player-ID bridge alone (one query against `pitches`, one against `retro_events`, UNION client-side).

### v2 scope (separate spec)
- `retro_statcast_game_map (retro_game_id text, mlb_game_pk int)` — populated for 2015+ overlap.
- `retro_statcast_event_map (retro_game_id text, retro_event_id int, mlb_game_pk int, at_bat_number int)` — populated for 2015+ overlap.
- Validation: spot-check known games (e.g. Verlander no-hitter 2019), verify event sequence aligns 1-to-1 within tolerance.

---

## 7. Indexing Plan

| Table          | Index                                          | Purpose                                       |
|----------------|------------------------------------------------|-----------------------------------------------|
| `retro_events` | PK `(id)`                                      | Surrogate key                                 |
| `retro_events` | UNIQUE `(game_id, event_id)`                   | Natural key, joins                            |
| `retro_events` | `(pitcher_id, game_id)`                        | Pitcher career rollups (most common query)    |
| `retro_events` | `(batter_id, game_id)`                         | Batter career rollups                         |
| `retro_events` | `(event_type)`                                 | Event filtering (HR, K, BB, etc.)             |
| `retro_events` | `(game_id, inning, bat_team)`                  | Inning-state queries                          |
| `retro_games`  | PK `(game_id)`                                 |                                               |
| `retro_games`  | `(game_date)`                                  | Date-range scans                              |
| `retro_games`  | `(season)`                                     | Season filtering                              |
| `retro_games`  | `(season, home_team_id)`                       | Team-season filtering                         |
| `retro_games`  | `(season, away_team_id)`                       |                                               |
| `retro_games`  | `(park_id)`                                    | Park-factor queries                           |
| `retro_rosters`| UNIQUE `(season, team_id, retro_id)`           | Natural key                                   |
| `retro_rosters`| `(season, team_id)`                            | Team-roster lookup                            |
| `retro_rosters`| `(retro_id)`                                   | Player team history                           |
| `retro_people` | PK `(retro_id)`                                |                                               |
| `retro_people` | `(mlbam_id)`                                   | Statcast bridge                               |
| `retro_people` | `(bbref_id)`                                   | External lookups                              |
| `retro_people` | `(name_last, name_first)`                      | Name search                                   |
| `retro_parks`  | PK `(park_id)`                                 |                                               |

### Build order (during initial seed)
1. Create tables, no indexes beyond PK.
2. COPY data in.
3. CREATE INDEX … (each as a separate statement, can run in parallel if disk allows).
4. ANALYZE.

For annual reruns, indexes stay live (insert volume is ~190K rows/season, well below the threshold where dropping indexes pays off).

### Storage budget
Rough estimate: **~18 GB total** (10 GB events table + 6 GB indexes + 2 GB everything else). The pitches table is already ~7.3 GB on an 8 GB plan ([MEMORY](memory/MEMORY.md)). **Action item:** confirm Supabase plan headroom before initial seed; may need to upgrade from Pro to Pro 25GB or Team plan. Flagged in §10 Open Questions.

---

## 8. MCP Exposure

### 8.1 Raw SQL passthrough
`query_database` tool in `mcp-server/src/index.ts` already exists — it calls
`run_query` RPC which is generic SELECT. **No new code needed for SQL access** —
the new `retro_*` tables become queryable as soon as they exist, because
`run_query` doesn't care about schema. Update the tool's description string to
mention the new tables.

### 8.2 Curated tools (8 new MCP tools + 1 rename)

**Breaking change:** rename existing `search_players` → `search_statcast_players` to disambiguate from new `retro_id_lookup`. Same handler, same params, just renamed. Update tool description to make Statcast-only era explicit.

Pre-rename checklist:
- `grep -r "search_players" mcp-server/ docs/ .claude/` to find any client config or docs referencing the old name
- Update Claude Desktop MCP config if it pins specific tool names (unlikely; usually wildcarded)
- Note in `PLANNING.md` "Recently Completed" entry

8 new tools added to `mcp-server/src/index.ts`. All read-only, all wrap a SQL pattern.

| Tool                       | Inputs                                        | Returns                                                |
|----------------------------|-----------------------------------------------|--------------------------------------------------------|
| `retro_player_career`      | `retro_id` OR `mlbam_id`, `as` = `bat`/`pit`  | Career line: PA, AB, H, HR, BB, K, etc. (or pitcher equivalents) by season |
| `retro_player_season`      | id, `season`                                  | Single-season totals across all events                 |
| `retro_player_splits`      | id, `season?`, `split` = `home_away`/`vs_hand`/`monthly` | Split table                                  |
| `retro_game_lookup`        | `game_id` OR (`date`, `home_team`, `away_team`) | Game header + box-score totals                       |
| `retro_game_events`        | `game_id`, `inning?`                          | Event log for that game                                |
| `retro_era_leaderboard`    | `start_season`, `end_season`, `metric`, `top` | Top-N players by metric in a window                   |
| `retro_team_season`        | `team_id`, `season`                           | Team record, R/RA, top hitters/pitchers               |
| `retro_id_lookup`          | `name` (partial)                              | Matching `retro_id`/`mlbam_id`/`bbref_id` rows         |

Each tool is ~30 lines of TS following the `get_player_stats` pattern already in
`index.ts`. Tools that need a Statcast bridge use `retro_id_map` view.

### 8.3 Tool descriptions
Critical for MCP usability — the description string is what the LLM reads to
decide which tool to call. Write them to disambiguate from existing
`query_database` / `get_player_stats` / `search_players` tools (those are
Statcast-only, 2015+).

Example:
```
retro_player_career: Get a player's full historical career (1914+ for PBP,
1871+ for game-level). Returns season-by-season totals. Use this for any
question about pre-2015 baseball or full-career stats that span the
Statcast era boundary. For pitch-level Statcast data (2015+), use
get_player_stats instead.
```

---

## 9. Attribution & Licensing

**Retrosheet license** (per [retrosheet.org/notice.txt](https://www.retrosheet.org/notice.txt)):
> The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at "www.retrosheet.org".

**Required:** the notice must appear "wherever Retrosheet data is displayed or distributed."

### Triton compliance plan

v1 is backend-only — no UI surfaces directly today. Future surfaces that read
from `retro_*` tables must surface the notice. Spec the placement now so
future work has a clear pattern:

1. **MCP tool output:** every curated MCP tool that returns retro data appends a single line: `"Source: Retrosheet (retrosheet.org)"` to the tool result text. Already a single common helper — add once in `index.ts`.
2. **API routes (when built):** any `app/api/retro/*` route returns `{ data, attribution: "Retrosheet — retrosheet.org" }` in the JSON envelope. Centralize in a `withRetroAttribution()` wrapper.
3. **UI views (when built):** components reading from `retro_*` must render an "About Retrosheet" footer or info-icon tooltip with the full notice text. Add a `<RetroAttribution />` component to the design system at first use.
4. **Newsletter / Medid content:** any rendered graphic that uses retro data includes a small "Source: Retrosheet" line in the corner. Codify in the render helpers.
5. **Database-level marker:** add a row to `system_metadata` (`key='retrosheet_attribution', value='retrosheet.org notice required on display'`) so future devs/agents see the requirement when browsing the DB.

**Not required:** no notice on the raw DB tables themselves. No notice on internal scripts. No notice on derived stats where source is mixed (e.g. a career line spanning Retrosheet + Statcast can carry a combined attribution).

### Chadwick Register license
[CC0 / public domain](https://github.com/chadwickbureau/register). No attribution required, but courtesy line recommended.

---

## 10. Resolved Decisions

All open questions decided 2026-06-14. Spec sections above already reflect these — this section is the audit trail.

| # | Question | Decision | Impact |
|---|----------|----------|--------|
| 1 | Storage headroom | **Upgrade Supabase plan** (Pro 25 GB or Team) before initial seed | Action item before BUILD MODE: confirm plan tier + cost with billing |
| 2 | Chadwick install | **`brew install chadwick`** first, fall back to source build if Darwin 25 issues | Operator guide `docs/retrosheet.md` documents both paths |
| 3 | Release cadence | **Full auto** — polling cron triggers full ingest pipeline | Pipeline runs on **GitHub Actions** (not Vercel — Chadwick C binaries don't run serverless). Workflow polls Retrosheet weekly, runs full ingest on new release. Adds `.github/workflows/retro-ingest.yml`. |
| 4 | `retro_id_map` | **Materialized view**, `REFRESH MATERIALIZED VIEW` step appended to ingest pipeline | Spec §3.2 updated to materialized, §5 pipeline gets a stage-7 refresh step |
| 5 | Negro Leagues | **Single `retro_events` table** with league flag on `retro_games.home_league`/`away_league` | First-class treatment. League codes (NNL, NAL, ECL, etc.) live on `retro_games`. Queries filter by league. |
| 6 | Game source 1914+ | **Game logs authoritative everywhere**, `cwgame` only for fields game logs lack (e.g. umpire IDs in some eras) | Spec §3.5 `source` column: `gamelog` default, `cwgame` fills supplementary fields. Reconciliation logic in ingest pipeline stage 5. |
| 7 | Pre-1914 PBP | **Load everything Chadwick can parse** — no strict cutoff | Earlier seasons have partial coverage. Document coverage gap in `retro_ingest_runs.notes`. |
| 8 | MCP tool naming | **Rename existing `search_players` → `search_statcast_players`**, add `retro_id_lookup` as new tool | Breaking change for any current `search_players` callers. Grep `mcp-server/` and any client configs before rename. BUILD MODE must include the rename in the same commit. |
| 9 | RLS policy | **`authenticated` read, service-role write** (matches `work_`/`broadcast_`/`compete_` convention) | Anon blocked. Logged-in users SELECT. Ingest script uses `SUPABASE_SERVICE_ROLE_KEY` to write. |
| 10 | Park ID bridge | **Add `mlbam_venue_id` column directly to `retro_parks`** (no separate map table) | Spec §3.3 gets a new column. Manually curate the ~30 active-park mappings during initial seed; nullable for inactive/historical parks. |

### Knock-on changes to fold into spec sections above (will apply on next edit pass)

- §3.2 `retro_id_map` becomes a materialized view; ingest pipeline gets `REFRESH MATERIALIZED VIEW CONCURRENTLY retro_id_map;` as final stage.
- §3.3 `retro_parks` gains `mlbam_venue_id int` column + index `retro_parks_mlbam_venue_idx`.
- §3.5 `retro_games.source` becomes `gamelog` default with `cwgame` reconciliation.
- §5 ingest pipeline becomes a **GitHub Actions** workflow, not just a local CLI. CLI still exists for manual runs; the workflow is the scheduled invocation. Add §5.X documenting the workflow file + secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RETROSHEET_NOTIFY_WEBHOOK`).
- §8.2 add **rename step** for existing `search_players` → `search_statcast_players` as part of BUILD MODE diff.
- §11 deliverables: add `.github/workflows/retro-ingest.yml`.

---

## 11. Deliverables Recap

When BUILD MODE is approved, v1 ships:

- [ ] `scripts/create-retro-tables.sql` — all DDL (7 tables + 1 materialized view + 1 conflicts table)
- [ ] `scripts/ingest-retrosheet.ts` — Chadwick pipeline CLI
- [ ] `scripts/validate-retrosheet.ts` — standalone validator
- [ ] `scripts/check-retrosheet-release.js` — release-detection helper (for GH Actions)
- [ ] `.github/workflows/retro-ingest.yml` — weekly poll + auto-ingest workflow
- [ ] `mcp-server/src/index.ts` — 8 new tools + `search_players` → `search_statcast_players` rename + `query_database` description update
- [ ] `docs/retrosheet.md` — operator guide (install Chadwick, run seeds, GH Actions setup, manual reruns)
- [ ] Update `docs/VARIABLES.md` with retro_ column glossary
- [ ] Update `PLANNING.md` "Recently Completed" with the integration entry (flag MCP tool rename as breaking)
- [ ] Update `MEMORY.md` index with a `project_retrosheet.md` memory file pointing to the operator guide

Out of v1: any UI, the event-level bridge, automated cron, attribution UI components (codify when first UI surface is built).
