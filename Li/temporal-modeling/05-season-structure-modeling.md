---
title: Season Structure — Which Games Count, and Which Season They Belong To
domain: temporal-modeling
tags:
  - season-structure
  - game-type
  - spring-training
  - postseason
  - the-2020-problem
  - milb-reorganization
  - service-time
  - season-dimension
sources_reviewed: 18
last_updated: 2026-08-12
---

# Season Structure — Which Games Count, and Which Season They Belong To

## TL;DR

- **MLB publishes eleven `gameType` codes; Triton's ingest requests three, and six files enumerate six different subsets. None matches the source.** (computed)
- **`pitch_baselines` has no `game_type` filter, so every Stuff+ z-score is measured against a population including spring training and the postseason — and the contamination fraction is not constant across seasons (~17% of 2019's games vs ~27% of 2020's), which breaks cross-season comparability.** (computed / estimated)
- **`refresh_league_averages` has zero `game_type` predicates — grep returns 0 — and windows on the calendar year, so every plus-stat's denominator pools February bullpens with October elimination games.** (computed)
- **`pitcher_season_command`'s real key has four columns including `game_type`; the glossary documents three, and three of its four readers omit the fourth** — `pivotTritonRows` then blends spring and regular rows and inflates `n`. (computed)
- **The nightly chain holds two definitions of "season" — `game_year` for baselines, `game_date` within the calendar year for league averages — nothing ties the columns together, and request vocabulary differs from storage (`P` vs `F`/`D`/`L`/`W`).** (computed)
- **2020 is five stacked anomalies** — 60 games, a four-month hole inside `game_year = 2020`, a 16-team postseason, seven-inning doubleheaders, the automatic runner. (established)
- **The 2021 MiLB reorganization is free for `milb_pitches` because the table starts 2023-03-31, and expensive the day anyone backfills 2019.** (established / computed)
- **"Rookie season" is not `MIN(game_year)`:** service time is a 172-day count Triton does not store, and unfiltered spring rows can move a `MIN` back a year. (established)

---

## 1. A season is three keys, and Triton stores one and a half

`game_date` says when a pitch happened, not which competition; `game_type` is the only key separating competition from exhibition; `game_year` is a **season identifier wearing a calendar fact's clothes**. It equals `EXTRACT(YEAR FROM game_date)` for every MLB row today, and that coincidence is why nothing enforces it — winter ball, any December-to-March competition, or an ingest bug breaks the identity. The columns arrive from independent code paths (MiLB ingest writes `game_year: meta.gameYear` and `game_date: meta.gameDate` separately) with **no constraint asserting they agree**, and downstream code splits on them: `pitch_baselines` groups by `game_year`, `refresh_league_averages` windows on `game_date`. One mismatched row is scored against one season's baseline and counted in another's benchmark. **(computed)**

```sql
ALTER TABLE pitches ADD CONSTRAINT pitches_year_matches_date
  CHECK (game_year = EXTRACT(YEAR FROM game_date)) NOT VALID;  -- VALIDATE off-peak
```

`NOT VALID` first so validation doesn't lock 8.9M rows mid-day (`Jo/postgres-performance/03-timeouts-locks-concurrency.md`). Do **not** make `game_year` generated: that permanently encodes "season = calendar year," the assumption you want breakable.

---

## 2. Eleven codes upstream, six vocabularies in the repo

`statsapi.mlb.com/api/v1/gameTypes` returns eleven (fetched 2026-08-12): `S` Spring, `R` Regular, `F` Wild Card, `D` Division Series, `L` LCS, `W` World Series, `C` Championship, `P` Postseason, `A` All-Star, `I` Intrasquad, `E` Exhibition. Savant's CSV docs expose seven (`E S R F D L W`) — no `P`, `A` or `I`. **`P` is a query alias, not a stored value:** `GAME_TYPE_MAP` asks Savant for `P|`; what returns is stored under its round-specific code. MiLB does the same and stores `gameData.game?.type || 'R'` verbatim — **a missing type silently becomes regular season**, a null collapsed into the column's most consequential value.

| Surface | Vocabulary | Where |
|---|---|---|
| MLB Stats API (truth) | 11 codes | `statsapi/v1/gameTypes` |
| Savant CSV (what lands) | `E S R F D L W` | `savant/csv-docs` |
| Ingest request map | `R S P` | `app/api/update/route.ts:11–15` |
| Player dashboard toggle | `R` / `S,E` / `P,F,D,L,W` | `lib/hooks/usePlayerData.ts:246–248` |
| Explore filter options | `D E F L P R S W` | `lib/hooks/useExploreData.ts:132` |
| Imagine heat-map panels | `R F D L W S E A` | `lib/imagine/widgets/HeatMapsPanel.tsx:31` |
| Team tendencies | `R` / `S` / `D L W F P` | `app/api/team-tendencies/route.ts:65–67` |
| LLM schema prompt | "R (regular), P (postseason)" | `app/api/chat/route.ts:140` |
| Canonical glossary | **no entry for the column** | `docs/VARIABLES.md` |

Six files, six subsets, none equal to the seven that can appear; three include `P`, which cannot be there, and three omit `A`, which can. Worst is the LLM schema prompt — it tells a model writing free-form SQL that the column holds two values, so the model filters `game_type = 'P'` and gets **zero rows, no error**, the failure class of the `'MLB'`/`mlb` casing trap in `metric-governance/01-metric-definition-semantics.md`. Fixed by one exported constant and a `CHECK`, not documentation; rendering the toggle is `Cas/analytics-ux/02-null-zero-unknown-ui.md`.

---

## 3. Where the filter is missing, and what it costs

### 3.1 `pitch_baselines` — no `game_type` predicate

`refreshPitchBaselines` filters on non-null inputs and `game_year = ${year}` — the entire `WHERE` clause. Spring training, exhibitions, the All-Star Game and every postseason round sit inside the mean and standard deviation defining **all three Stuff+ z-terms**. Its 206 rows are keyed only by `(pitch_name, game_year)`, so a game-type split has nowhere to live. **(computed)**

Bias direction is not in doubt — spring velocity runs below regular-season for the same arm — but **the mixture ratio is not constant across seasons**, so no constant correction exists:

| Season | Regular | Spring (est.) | Postseason | Non-regular |
|---|---|---|---|---|
| 2019 | 2,430 | ~450 | 37 | **~16.7%** |
| 2020 | 900 | ~285 | ~52 | **~27.2%** |

Spring estimated at ~30 games/team normally, ~19 in 2020 before the March 11 shutdown; the rest is published. A cross-season Stuff+ comparison therefore carries a term of **pure schedule structure**: 2020's baselines rest on a population 1.6× as contaminated as 2019's. This compounds the vintage drift in `metric-governance/02-metric-versioning-reproducibility.md` — that is about *when* a row was scored, this about *which games built the scorer*. **(estimated)**

### 3.2 `league_averages` — no `game_type` predicate either

`grep -c game_type scripts/create-refresh-league-averages.sql` returns **0**. The function windows on `game_date` across the calendar year and aggregates whatever it finds — the denominator of every plus-stat, computed over spring training. It interacts badly with `metric-governance/07-qualification-thresholds.md`: the floors `max(25, 0.20 × AB_leader)` and `max(5, 0.20 × IP_leader)` run over the same contaminated pool, so spring at-bats count toward clearing the bar, and neither `leader_value` nor `qual_floor` records which games produced it. It is also the one place season structure *is* modeled explicitly: a hardcoded `CASE p_season` of cFIP, league ERA, wOBA scale and HR/FB needing a new `WHEN` every January — a season dimension implemented as a `CASE`. **(computed)**

### 3.3 `pitcher_season_command` — the documented grain omits a key column

| Artifact | Grain | Where |
|---|---|---|
| Writer (`onConflict`) | `pitcher, game_year, pitch_name, game_type` | `app/api/compute-triton/route.ts:276` |
| Deception writer | `pitcher, game_year, pitch_type, game_type` | `app/api/compute-deception/route.ts:145` |
| Glossary | "pitcher × pitch_type × game_year" | `docs/VARIABLES.md:164, 440` |
| Reader ✅ | filters `game_year` **and** `game_type` | `app/api/leaderboard-triton/route.ts:57–59` |
| Readers ❌ | filter `game_year` only | `app/api/scene-stats/route.ts:868–870`, `:1592`; `lib/sql.ts:139` |

Two grain errors in one table: the documented key omits `game_type`, and command keys on `pitch_name` while deception keys on `pitch_type`, so the two "per pitcher × pitch × year" tables are not joinable on the grain the glossary claims. Worse than a duplicate-row error: `pivotTritonRows` **sums `pitches` and pitch-weights every metric across whatever rows it receives** — where a season carries both `S` and `R` rows the unfiltered readers return a spring-blended command value *and* an inflated `n`. Which seasons carry `S` rows is a cohort question: `/api/cron/refresh` computes Triton and deception only for game types ingested that night, so live-ingested springs produce `S` rows and backfilled ones may not. One query settles it, for `docs/Queries.md`:

```sql
SELECT game_year, game_type, COUNT(*) AS rows, COUNT(DISTINCT pitcher) AS pitchers
FROM pitcher_season_command GROUP BY 1, 2 ORDER BY 1, 2;
```

---

## 4. The 2020 problem is five problems

`metric-governance/07-qualification-thresholds.md` §4.2 settles the qualification half — the leader-proportional anchor gets 2020's *pool composition* right and its *per-player precision* wrong, inflating σ ~30%.

| Break | 2020 reality | Effect on a Triton number |
|---|---|---|
| **60-game schedule** | Jul 23 – Sep 27 | counting stats ~37% of normal; noise ↑ |
| **Four-month hole** | spring Feb 22 – Mar 11, nothing until July | `game_year = 2020` spans ~8 months with a gap; any "days since last outing" or rolling window on `game_date` reads a 130-day layoff as ordinary |
| **Summer Camp** | July restart exhibitions/intrasquads | rows plausibly typed `E` or `I` inside `game_year = 2020`; `I` is in **no** repo enumeration |
| **16-team postseason** | ~52 games, Sep 29 – Oct 27 | postseason ~5.8% of the season vs ~1.5% in 2019; baselines absorb ~4× the usual weight |
| **Rule changes** | 7-inning doubleheaders, auto runner | per-game and per-inning denominators differ; per-9 rates shift |

A 2019→2020→2021 trend moves for four reasons unrelated to pitchers: fewer observations per player, a different spring/regular mix in the baseline, heavier postseason weight, different game lengths. **Li's position: 2020 is not a season you adjust, it is a season you label** — no trend fitted across it without the difference-in-differences control from `statistical-inference/07-trend-detection-changepoints.md`.

---

## 5. Other breaks the season key hides

| Year | Break | Consequence for a season-keyed query |
|---|---|---|
| 1981 | strike split the season, separate half-champions | one season value, two competitions — the canonical sub-season case; Retrosheet/Lahman only |
| 1994–95 | 1994 ended Aug 11 with no postseason; 1995 ran 144 | two consecutive non-162 seasons |
| 2022 | universal DH | pitcher plate appearances effectively end — a hitter-side population change |
| 2023 | pitch timer, shift limits, bigger bases | league-wide step in pace and BABIP; needs a control |

None is a data error; all are reasons a season-over-season delta is not a player result. **They are attributes of the season, so they belong in a season table, not in an analyst's memory.**

---

## 6. MiLB 2021, the WBC, and seasons that are not in `pitches`

**The 2021 MiLB reorganization.** MLB cut 160 affiliates to 120, gave each organization one club per level, and replaced historic league names with placeholders, restored in 2022; Class A-Advanced became High-A, and the 2020 MiLB season was cancelled. For Triton this is **currently free**: `milb_pitches` starts **2023-03-31**, wholly after the reorganization, so its level and affiliate codes are internally consistent throughout. It stops being free the day anyone backfills 2019 — level labels then denote different competitive tiers, ~40 affiliates have no successor, and a 2020 gap appears in every MiLB career line that is not an injury (comparability: `metric-governance/08-cross-level-comparability.md`; presence: `Jo/data-reliability/03-volume-completeness-monitoring.md`).

**The WBC is a different sport, not a different `game_type`.** Triton fetches `sportId=51&leagueId=160` into a separate `wbc_pitches` table over `2023-03-07 → 2023-03-22` and `2026-03-01 → 2026-03-25` — both windows *inside* spring training. A March 2023 pitcher's workload splits across two tables with no union view, and any workload feature reading only `pitches` **undercounts every WBC participant** in the seasons the tournament ran. `pitch_baselines` is built from `pitches` alone, so WBC rows fall outside the Stuff+ reference population — correct by accident, and undocumented. Whether WBC stuff predicts regular-season stuff is `Soto/algorithm-design/01-stuff-models.md`.

**Service time is a dimension Triton does not have.** One service year is **172 days** on the active roster or IL — not a season, not a games count; Super Two turns on 86 days. None is derivable from pitch data. The tempting substitute, `MIN(game_year)` as debut or rookie season, is wrong twice: rookie status is a PA/IP/service-day rule, and with spring rows unfiltered **one February appearance moves a `MIN(game_year)` back a full year**. Take experience cuts from `player_season_stats` — `entity-resolution/05-temporal-identity-changes.md`. **(established / computed)**

---

## 7. The model: make the season a dimension

Retrosheet shipped the right model decades ago: game logs are regular-season files with **World Series, LCS, Division Series and All-Star games as separate downloads**. Game type is a partition of the universe, not a nuisance attribute; Kimball's date dimension says the same in warehouse terms.

```sql
CREATE TABLE game_types (   -- 11 rows from statsapi/v1/gameTypes
  code text PRIMARY KEY, description text NOT NULL,
  is_regular_season boolean NOT NULL, counts_toward_season_stats boolean NOT NULL);
CREATE TABLE seasons (      -- per game_year × level; notes = '7-inning DH', …
  season int, level text, scheduled_games int, postseason_teams int,
  regular_start date, regular_end date, notes text, PRIMARY KEY (season, level));
```

`seasons.scheduled_games` alone converts qualification from leader-proportional to rate-per-scheduled-game (recommendation 2 of `metric-governance/07-qualification-thresholds.md`) and makes 2020 handle itself. `game_types.counts_toward_season_stats` is the predicate every aggregation should join to instead of hardcoding `'R'` in twenty places. SCD mechanics for the affiliate side are `06-slowly-changing-dimensions.md`; replaying a past leaderboard is `11-reproducible-historical-queries.md`.

---

## 8. What Triton should do, in order

1. **Add `AND game_type = 'R'` to `refreshPitchBaselines` and `refresh_league_averages`, then rebuild both** — baselines, rescore, league averages. It moves every stored Stuff+ value and plus-stat denominator, so it is a **metric version bump**: dual-run and record it per `metric-governance/02-metric-versioning-reproducibility.md`.
2. **Fix the `pitcher_season_command` / `pitcher_season_deception` reads** at `scene-stats/route.ts:1592`, `:868–870` and `lib/sql.ts:139`; correct the documented grain to four columns in `docs/VARIABLES.md`, same commit.
3. **Publish one `GAME_TYPES` constant**, make every §2 enumeration import it (including both LLM schema prompts), and add `CHECK (game_type IN (…))` plus the `game_year = EXTRACT(YEAR FROM game_date)` check from §1 so bad codes fail loudly at ingest.
4. **Create `game_types` and `seasons`**, backfilling `scheduled_games`, the regular-season window and `notes` for 2020–2023.
5. **Label 2020 wherever a multi-season axis exists** — a marker for `Cas/analytics-ux/01-honest-data-presentation.md`, not a silent proration.
6. **Write the WBC policy down**: separate table, excluded from baselines and league averages, unioned only into labelled workload views.

### Anti-recommendation

**Do not "fix" 2020 by prorating it to 162 games.** The move everyone reaches for; it fails three independent ways:

- **It only repairs counting stats, and the flagship metrics are rates.** Stuff+, Cmd+ and Deception are z-composites; ×2.7 does nothing to them while corrupting the counting columns beside them, so one row becomes internally inconsistent.
- **It does not touch the actual defect, precision.** Each 2020 qualifier carries ~0.37× the observations, inflating σ ~30% (`07` §4.2). Proration scales the point estimate and leaves the interval alone: a noisy number that *looks* full-season is worse than a small one that is honestly small.
- **It cannot represent the structural breaks.** Seven-inning doubleheaders, the automatic runner, a regional schedule and a 16-team postseason are not quantity effects, and no scalar encodes them.

Label the season, carry `n`, refuse the trend line across the seam.

**Highest-leverage next action:** run the §3.3 query — `game_year × game_type` counts in `pitcher_season_command` — and log it in `docs/Queries.md`. It decides whether recommendation 2 fixes numbers currently on screen or hardens against a future spring ingest.

---

## Sources

1. [MLB Stats API — `/api/v1/gameTypes`](https://statsapi.mlb.com/api/v1/gameTypes) — fetched 2026-08-12; §2's eleven codes, incl. the `C`/`P`/`A`/`I` no Triton file carries.
2. [Savant — Statcast CSV Documentation](https://baseballsavant.mlb.com/csv-docs) — the seven `game_type` values that land in `pitches`; confirms `P` is not among them.
3. [Savant — Statcast Search](https://baseballsavant.mlb.com/statcast_search) — the `hfGT` parameter `GAME_TYPE_MAP` targets; §2's request-vs-storage split.
4. [Retrosheet — Game Logs](https://www.retrosheet.org/gamelogs/index.html) — 1871–2025 logs with World Series, LCS, DS and All-Star games as *separate files*; §7's precedent.
5. [Lahman Database (SABR)](https://sabr.org/lahman-database/) — season-grain tables with a `stint` column; a season that is not one block.
6. [Kimball Group — Dimensional Modeling Techniques](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/) — date dimension and grain; §7's vocabulary.
7. [PostgreSQL — Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — `CHECK` and `NOT VALID` semantics for §1 and recommendation 3.
8. [PostgreSQL — Generated Columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html) — the mechanism §1 rejects; it would freeze "season = calendar year."
9. [Wikipedia — 2020 MLB season](https://en.wikipedia.org/wiki/2020_Major_League_Baseball_season) — 60 games, Jul 23 – Sep 27, the Mar 11 shutdown and July restart; §4's hole.
10. [Wikipedia — 2020 MLB postseason](https://en.wikipedia.org/wiki/2020_Major_League_Baseball_postseason) — 16 teams, ~52 games; §3.1 and §4's postseason-share arithmetic.
11. [Baseball-Reference — 2020 MLB season](https://www.baseball-reference.com/leagues/majors/2020.shtml) — published totals behind the 900-game regular season.
12. [Wikipedia — Doubleheader](https://en.wikipedia.org/wiki/Doubleheader_(baseball)) — seven-inning doubleheaders 2020–2021; a per-game denominator change.
13. [Wikipedia — Extra innings](https://en.wikipedia.org/wiki/Extra_innings) — the automatic runner from 2020; shifts per-inning and per-9 rates across the seam.
14. [Wikipedia — Pitch clock](https://en.wikipedia.org/wiki/Pitch_clock) — the 2023 package as a league-wide step change needing a control.
15. [Wikipedia — Designated hitter](https://en.wikipedia.org/wiki/Designated_hitter) — the 2022 universal DH; §5's hitter-side population change.
16. [BR Bullpen — 2021 Minor League Reorganization](https://www.baseball-reference.com/bullpen/2021_Minor_League_Reorganization) — 160 → 120 affiliates, renaming, cancelled 2020 MiLB season.
17. [ESPN — MLB's 120-team regional minor league alignment](https://www.espn.com/mlb/story/_/id/30887636/mlb-announces-changes-minor-league-structure-featuring-120-team-regional-alignment) — the placeholder league names behind §6.
18. [MLB Glossary — Service Time](https://www.mlb.com/glossary/transactions/service-time) — 172 days per service year, Super Two at 86; §6's non-derivability argument.

**Triton-internal evidence.** Repo read 2026-08-12; **no database queries were run** — volumes from that date's central measurement packet: `pitches` 2015-03-03 → 2026-08-10 (~8,877,621 rows; the start date is spring training), `milb_pitches` 2023-03-31 → 2026-08-11 (~2,508,422), both carrying `game_date`/`game_year`/`game_type`/`game_pk`; `pitch_baselines` 206 rows keyed `(pitch_name, game_year)` → ~17 pitch types across 12 season-years; `league_averages` 1,806 rows keyed `(season, level, role, metric)`; `pitcher_season_command` ~27,119; `pitcher_season_deception` ~17,386. **Missing filters:** `refreshPitchBaselines`, `app/api/update/route.ts:245–276` (WHERE :259–268); `scripts/create-refresh-league-averages.sql` — `grep -c game_type` = 0, season window :47–48 applied at :120, :308, :490, :641, constants `CASE p_season` :51+; Stuff+ scoring `update/route.ts:319–333`. **Vocabularies** are the §2/§3.3 tables' `file:line` columns, plus `HeatMapOverlaysPanel.tsx:36`, `lib/autoComposeTools.ts:284, 297`, `data-export/route.ts:51`, `cron/janitor/route.ts:10–14`; blending in `pivotTritonRows`, `lib/sql.ts:64–89`; cohort fan-out `cron/refresh/route.ts:77–85`. **Ingest:** `cron/pitches/route.ts` (month-driven `S`/`R`/`P`, ET); MiLB schedule request `update/milb/route.ts:116`, `gameData.game?.type || 'R'` :165, stored :221; spring backfill windows `(YYYY-02-20, YYYY-03-30)` for 2015–2025, `scripts/backfill-spring-training.py:20`. **WBC:** `sportId=51&leagueId=160`, `scripts/backfill-wbc.ts:132–137`, `cron/wbc/route.ts:127`. The glossary's lone `game_type` mention, `docs/VARIABLES.md:377`, documents the `/hot` route, not the column.
