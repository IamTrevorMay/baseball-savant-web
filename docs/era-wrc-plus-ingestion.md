# ERA & wRC+ Database Ingestion Plan

## Problem

ERA and wRC+ cannot be computed from the `pitches` table alone:
- **ERA** requires earned runs, which aren't tracked per-pitch in Statcast (only total runs via `delta_run_exp`). FIP/xERA are computable from pitches but are estimators, not actual ERA.
- **wRC+** requires park factors, league run environment, and linear weights — stats the MLB Stats API already computes.

Currently, ERA is fetched live from the MLB Stats API on each request (slow, not filterable by date range). wRC+ isn't available anywhere in the platform.

## Solution: `player_season_stats` Table

A single table storing per-player, per-season stats fetched from the MLB Stats API. Populated nightly by cron and backfillable for historical seasons.

### Table DDL

```sql
CREATE TABLE player_season_stats (
  player_id   INT NOT NULL,
  season      INT NOT NULL,
  stat_group  TEXT NOT NULL,  -- 'pitching' | 'hitting'
  -- Pitching
  era         NUMERIC,
  wins        INT,
  losses      INT,
  saves       INT,
  holds       INT,
  innings_pitched NUMERIC,
  earned_runs INT,
  -- Hitting
  wrc_plus    NUMERIC,
  ops_plus    NUMERIC,
  batting_avg NUMERIC,
  on_base_pct NUMERIC,
  slugging    NUMERIC,
  home_runs   INT,
  rbi         INT,
  runs        INT,
  stolen_bases INT,
  war         NUMERIC,
  -- Meta
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (player_id, season, stat_group)
);

CREATE INDEX idx_pss_season_group ON player_season_stats (season, stat_group);
```

### MLB Stats API Source

**Endpoint:** `https://statsapi.mlb.com/api/v1/sports/1/players?season={year}&gameType=R&fields=people,id,stats`

Or per-player: `https://statsapi.mlb.com/api/v1/people/{id}/stats?stats=season&season={year}&group=pitching,hitting`

**Batch approach (preferred):** Use the stats leaders endpoint to get all qualified players at once:
- `https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season={year}&sportIds=1&limit=500&fields=stats,splits,stat,player`
- `https://statsapi.mlb.com/api/v1/stats?stats=season&group=hitting&season={year}&sportIds=1&limit=500&fields=stats,splits,stat,player`

These return all players with season stats in a single request.

### Cron Job: `/api/cron/player-stats`

**Schedule:** Daily at 09:30 UTC (after pitch sync at 09:00)

**Logic:**
1. Determine current season from date
2. Fetch all pitching season stats (batch endpoint, ~500 players)
3. Fetch all hitting season stats (batch endpoint, ~500 players)
4. Extract relevant fields per player
5. Upsert to `player_season_stats` in 500-row batches (same pattern as pitch sync)

**Fields to extract:**

| API Field (pitching) | DB Column |
|---------------------|-----------|
| `stat.era` | `era` |
| `stat.wins` | `wins` |
| `stat.losses` | `losses` |
| `stat.saves` | `saves` |
| `stat.holds` | `holds` |
| `stat.inningsPitched` | `innings_pitched` |
| `stat.earnedRuns` | `earned_runs` |

| API Field (hitting) | DB Column |
|--------------------|-----------|
| `stat.ops` | (already computed from pitches) |
| `stat.homeRuns` | `home_runs` |
| `stat.rbi` | `rbi` |
| `stat.runs` | `runs` |
| `stat.stolenBases` | `stolen_bases` |
| `stat.avg` | `batting_avg` |
| `stat.obp` | `on_base_pct` |
| `stat.slg` | `slugging` |

**wRC+ source:** The MLB Stats API doesn't directly provide wRC+. Options:
1. **FanGraphs API** — unreliable/rate-limited
2. **Compute from components** — use wOBA from pitches + park factors from MLB API + league constants from `SEASON_CONSTANTS`
3. **Store wOBA and compute wRC+ on read** — simplest, uses existing `avg_woba` from pitches

**Recommended for wRC+:** Compute at query time using the formula:
```
wRC+ = ((wRAA/PA + lgR/PA) / (parkFactor * lgR/PA)) * 100
```
Where `wRAA = (wOBA - lgwOBA) / wOBA_scale * PA`, and all league constants are in `SEASON_CONSTANTS`. Park factors can be fetched from MLB API once per season and cached.

This avoids a dependency on FanGraphs and uses data we already have.

### Park Factors Table

```sql
CREATE TABLE park_factors (
  season   INT NOT NULL,
  team     TEXT NOT NULL,  -- team abbreviation
  factor   NUMERIC NOT NULL DEFAULT 100,  -- 100 = neutral
  PRIMARY KEY (season, team)
);
```

**Source:** `https://statsapi.mlb.com/api/v1/venues?season={year}&sportId=1&hydrate=parkFactors`

Or manually maintained from FanGraphs park factors (more accurate, published annually).

### Backfill Script: `scripts/backfill-player-stats.ts`

```
npx tsx scripts/backfill-player-stats.ts [startYear] [endYear]
```

- Iterates each season from startYear to endYear
- Fetches batch stats from MLB API
- Upserts to `player_season_stats`
- Rate-limited (1 req/sec) to avoid MLB API throttling

### Integration Points

1. **Team Stats widget** — for ERA metric, query `player_season_stats` instead of MLB API live:
   ```sql
   SELECT team, AVG(era) as era
   FROM player_season_stats pss
   JOIN pitches_team_lookup ptl ON ptl.player_id = pss.player_id
   WHERE season = 2026 AND stat_group = 'pitching'
   GROUP BY team
   ```
   (Requires mapping players to teams, which the `pitches` table already provides via the team CASE expression)

2. **Player Stats widget** — ERA from `player_season_stats` instead of live MLB API call

3. **Leaderboard widget** — ERA leaderboard from `player_season_stats` instead of MLB leaders endpoint

4. **wRC+ as a new SCENE_METRIC** — computed at query time from `avg_woba` (already in pitches) + park factors + league constants

### Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/create-player-season-stats.sql` | DDL for new table |
| `scripts/create-park-factors.sql` | DDL for park factors table |
| `app/api/cron/player-stats/route.ts` | Nightly cron job |
| `scripts/backfill-player-stats.ts` | Historical backfill |
| `vercel.json` | Add cron schedule entry |
| `lib/reportMetrics.ts` | Add `wrc_plus` to METRICS and SCENE_METRICS |
| `app/api/scene-stats/route.ts` | Use `player_season_stats` for ERA; add wRC+ computation |

### Phases

**Phase 1: ERA from database** (immediate value)
- Create `player_season_stats` table
- Build cron job for nightly sync
- Backfill 2015-2026
- Replace live MLB API calls with table lookups

**Phase 2: wRC+** (depends on park factors)
- Create `park_factors` table
- Populate park factors (manual or API)
- Add wRC+ computation to scene-stats
- Add `wrc_plus` metric to widgets

**Phase 3: RBI/Runs (batting counting stats)**
- With `player_season_stats` populated, RBI and runs scored become available
- Add to SCENE_METRICS as lookups from the new table
