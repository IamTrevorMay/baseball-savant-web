# Umpire Performance Analytics + ABS Challenge System

## Context
The platform has two separate umpire-related systems that don't talk to each other:
1. **Umpire scorecard** — computes accuracy from `pitches` + `game_umpires` (zone geometry)
2. **ABS dashboard** — scrapes aggregate challenge/overturn data from Savant (league-wide, not per-umpire)

We want to: (A) add split-based accuracy analysis per umpire, and (B) collect per-umpire ABS challenge/overturn data. Then unify both into a comprehensive umpire performance dashboard.

---

## Phase 1: Umpire Accuracy Splits
**No new data needed — everything from existing `pitches` JOIN `game_umpires`.**

### API: Add `splits` action to `/app/api/umpire/route.ts`
- Accepts `name`, `season`, `gameType`, `splitBy`
- Computes accuracy grouped by the split dimension
- 8 split types:

| Split | GROUP BY | Values |
|-------|----------|--------|
| `pitcher_hand` | `p.p_throws` | L, R |
| `batter_side` | `p.stand` | L, R |
| `count` | `p.balls \|\| '-' \|\| p.strikes` | 0-0 through 3-2 |
| `inning` | `p.inning` | 1-9+ |
| `pitch_type` | `p.pitch_type` | FF, SL, CH, etc. |
| `outs` | `p.outs_when_up` | 0, 1, 2 |
| `home_away` | `CASE WHEN p.inning_topbot = 'Top' THEN 'away_pitcher' ELSE 'home_pitcher' END` | home/away |
| `zone_region` | CASE on plate_x/plate_z + stand | high, low, inside, outside, middle |

- Add `all_splits` action that runs all 8 in parallel (`Promise.all`)
- Each split includes league average for comparison (same query without umpire filter)

### Frontend: Add splits section to `/app/(research)/umpire/[name]/page.tsx`
- Chip selector for split type
- Table: Split Value, Called Pitches, True Accuracy, Real Accuracy, Bad Strikes, Bad Balls, vs Avg
- Horizontal bar chart (Plotly) with league avg reference line
- Color-coded deltas

### Leaderboard: Add LHB/RHB accuracy columns to `/app/(research)/umpire/page.tsx`
- Modify leaderboard SQL to include `FILTER (WHERE p.stand = 'L')` and `FILTER (WHERE p.stand = 'R')` accuracy

### Files
- `app/api/umpire/route.ts` — add splits + all_splits actions
- `app/(research)/umpire/[name]/page.tsx` — add splits UI
- `app/(research)/umpire/page.tsx` — add LHB/RHB columns

---

## Phase 2: Per-Umpire ABS Challenge Data Collection

### Step 2a: Spike — Investigate MLB API Challenge Structure
Before writing any parsing code, fetch 3-5 known game feeds where ABS challenges occurred and document the exact field paths. Look for:
- `liveData.plays.allPlays[].reviewDetails`
- `liveData.plays.allPlays[].playEvents[].reviewDetails`
- Text patterns in play descriptions ("challenge", "overturned")

### Step 2b: New Table `umpire_challenges`
```sql
CREATE TABLE umpire_challenges (
  id BIGSERIAL PRIMARY KEY,
  game_pk BIGINT NOT NULL,
  game_date DATE NOT NULL,
  hp_umpire TEXT NOT NULL,
  hp_umpire_id INT,
  inning INT,
  inning_topbot TEXT,
  at_bat_index INT,
  play_event_index INT,
  challenge_team TEXT,
  challenge_type TEXT,        -- 'ABS' or 'manager'
  is_overturned BOOLEAN,
  batter_id INT,
  pitcher_id INT,
  balls INT,
  strikes INT,
  outs INT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_pk, at_bat_index, play_event_index)
);
CREATE INDEX idx_ump_chal_umpire ON umpire_challenges (hp_umpire);
CREATE INDEX idx_ump_chal_date ON umpire_challenges (game_date);
```

### Step 2c: New Table `umpire_challenge_summary`
Pre-aggregated per umpire/year/game_type — refreshed by cron.
```sql
CREATE TABLE umpire_challenge_summary (
  hp_umpire TEXT NOT NULL,
  year INT NOT NULL,
  game_type TEXT NOT NULL DEFAULT 'R',
  games INT,
  total_challenges INT,
  total_overturns INT,
  overturn_rate NUMERIC(5,4),
  challenges_per_game NUMERIC(5,2),
  abs_challenges INT,
  abs_overturns INT,
  abs_overturn_rate NUMERIC(5,4),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (hp_umpire, year, game_type)
);
```

### Step 2d: Cron Route — `/app/api/cron/challenges/route.ts`
- Queries `game_umpires` for recent games missing from `umpire_challenges`
- Fetches game feed, parses challenge events
- Upserts into `umpire_challenges`
- Recomputes `umpire_challenge_summary` for affected umpires
- Schedule: daily after pitches + roster crons

### Step 2e: Backfill Route
- POST route (or script) to process all 2024+ games (ABS era)
- Reuse populate-umpires pattern: batch fetch, rate-limit, upsert
- ~7,300 games, ~18 min at rate-limited pace

### Step 2f: Add `challenges` action to `/app/api/umpire/route.ts`
Returns per-umpire challenge summary + individual events + league avg

### Files
- `app/api/cron/challenges/route.ts` — new cron route
- `app/api/umpire/route.ts` — add challenges action
- `app/api/populate-umpires/route.ts` — optionally extract challenges during backfill
- `vercel.json` — add cron schedule

---

## Phase 3: Unified Umpire Dashboard

### Restructure scorecard into tabs: `/app/(research)/umpire/[name]/page.tsx`

**Tab 1: Overview** (existing, enhanced)
- Existing 8 summary cards + 4 new: Challenges, Overturns, Overturn Rate, Challenges/Game
- Missed calls scatter (existing)
- Zone accuracy grid (existing)
- Accuracy trend (existing) + challenge event markers overlaid

**Tab 2: Splits** (Phase 1 content moved here)
- Split selector, table, bar chart
- Auto-generated "Notable Tendencies" summary

**Tab 3: Challenges** (Phase 2 data)
- Challenge summary cards
- Challenge timeline chart (season view, overturn/upheld color-coded)
- Breakdown by inning, count, batter side
- Individual challenge log table

**Tab 4: Game Log** (existing, enhanced)
- Add Challenges + Overturns columns per game

### Leaderboard Enhancement: `/app/(research)/umpire/page.tsx`
- Add Overturn Rate and Challenges/Game columns from `umpire_challenge_summary`
- LEFT JOIN leaderboard query with summary table

### Cross-link: `/app/(research)/abs/page.tsx`
- Umpires tab: add challenge count + overturn rate columns
- Umpire names already link to `/umpire/{name}`

### Files
- `app/(research)/umpire/[name]/page.tsx` — tab restructure + challenges tab
- `app/(research)/umpire/page.tsx` — leaderboard columns
- `app/(research)/abs/page.tsx` — umpires tab enhancement
- `app/api/umpire/route.ts` — enhanced scorecard response

---

## Phase 4: Advanced (Future)
- **Umpire Comparison**: `/umpire/compare?umpires=Name1,Name2` side-by-side
- **Consistency Score**: composite metric (accuracy + split variance + challenge rate)
- **Pregame Umpire Report**: auto-brief from today's scheduled HP umpire tendencies
- **Year-over-Year Trends**: multi-season accuracy + challenge rate per umpire

---

## Key Risks
1. **MLB API challenge structure is unknown** — Phase 2a spike is essential before building the parser
2. **Query performance** — splits join 7.4M+ rows; mitigated by `game_year` index filter. Add materialized view if needed.
3. **Backfill volume** — ~7,300 games for 2024-2026, ~18 min one-time. Acceptable.

## Verification
- Phase 1: Pick a known umpire, verify split accuracy sums match overall accuracy
- Phase 2: Cross-check challenge counts against Savant ABS page totals
- Phase 3: Visual QA on all 4 tabs, verify no data regressions from existing scorecard
