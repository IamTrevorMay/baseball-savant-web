# Query Log

Auto-populated log of ad-hoc database queries run during exploration sessions.

---

## 2026-06-04

### Cristopher Sanchez — Deception & Unique Scores (2026)
```sql
SELECT pitch_type, pitch_name, pitches, avg_vaa, avg_haa, avg_vb, avg_hb, avg_ext,
  z_vaa, z_haa, z_vb, z_hb, z_ext, unique_score, deception_score
FROM pitcher_season_deception
WHERE pitcher = 650911 AND game_year = 2026
ORDER BY pitches DESC
```
**Result:** SI (0.86 unique, -0.23 deception), CH (0.93 unique, 0.31 deception), SL (0.72 unique, -0.17 deception)

### Cristopher Sanchez — Deception & Unique Scores (Career)
```sql
SELECT game_year, pitch_type, pitch_name, pitches, unique_score, deception_score,
  z_vaa, z_haa, z_vb, z_hb, z_ext
FROM pitcher_season_deception
WHERE pitcher = 650911
ORDER BY game_year, pitch_type
```
**Result:** 16 rows, 2021–2026. Sinker deception declined from 0.43 (2021) to -0.23 (2026), driven by extension drop (z_ext 1.95 → 0.94).

### Cristopher Sanchez — Chase% May 2026
```sql
SELECT
  COUNT(*) FILTER (WHERE plate_x < -0.83 OR plate_x > 0.83 OR plate_z < sz_bot OR plate_z > sz_top) AS pitches_outside_zone,
  COUNT(*) FILTER (WHERE (plate_x < -0.83 OR plate_x > 0.83 OR plate_z < sz_bot OR plate_z > sz_top)
    AND description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play')) AS chases,
  ROUND(100.0 * ... / NULLIF(..., 0), 1) AS chase_pct
FROM pitches
WHERE pitcher = 650911 AND game_year = 2026 AND EXTRACT(MONTH FROM game_date) = 5
  AND pitch_type NOT IN ('PO','IN')
```
**Result:** 40.6% chase rate (119 / 293)

### League Average Chase% — May 2026
```sql
-- Same chase% query but without pitcher filter
FROM pitches WHERE game_year = 2026 AND EXTRACT(MONTH FROM game_date) = 5 AND pitch_type NOT IN ('PO','IN')
```
**Result:** 32.6% league average (22,551 / 69,094). Sanchez +8.0 pp above average.

### Top 10 Teams — Momentum Differential (2022–2026)
```sql
WITH half_innings AS (
  SELECT game_pk, inning, inning_topbot, game_year,
    CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END AS off_team,
    CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END AS def_team,
    MAX(post_bat_score) - MIN(bat_score) AS runs
  FROM pitches
  WHERE game_year BETWEEN 2022 AND 2026 AND game_type IN ('R','D','L','W','F','P')
  GROUP BY game_pk, inning, inning_topbot, home_team, away_team, game_year
), ...
-- SD For% - SD Against% differential
ORDER BY diff DESC LIMIT 10
```
**Result:** LAD (+6.0), TOR (+4.7), NYY (+4.7), ATL (+3.4), SD (+2.9) top 5.

### All 30 Teams — Momentum Differential (2022–2026)
Same query without LIMIT.
**Result:** Full ranking LAD (+6.0) to COL (-6.8).

### Momentum Differential vs Win% Correlation (2022–2026)
```sql
-- Per team-season momentum diff joined to team win records
SELECT ROUND(CORR(diff, win_pct)::numeric, 3) AS r,
  ROUND(POWER(CORR(diff, win_pct), 2)::numeric, 3) AS r_squared,
  COUNT(*) AS n
FROM combined
```
**Result:** r = 0.649, R² = 0.422 across 150 team-seasons.

### Component-Level Correlations with Win% (2022–2026, per team-season)
```sql
-- Corrected query: SD For + R Against assigned to def_team, SD Against + R For to off_team
-- Individual components correlated with win_pct, plus cross-correlations
```
**Result (r values):** SD Diff = 0.649, Response Diff = 0.649, Full Mom Diff = 0.649 (all identical signal), Run Diff = 0.910, Close Win% = 0.658, Late SD Rate = 0.309. SD Diff vs Run Diff r = 0.669 (heavily correlated — momentum is mostly run differential). Leverage SD For = -0.017 (no signal).

### Weighted Composite Exploration — Run Diff + Close-Game + Momentum (z-scored)
```sql
-- Normalized each component to z-scores, tested weighted composites against win_pct
-- Close game = decided by ≤2 runs, 1-run game = decided by exactly 1 run
-- Tested weights: RD/Close (70/30, 80/20, 60/40), RD/1-run (70/30), RD/SD (70/30),
--   RD/Close/SD (55/25/20), RD/Close/LateSd (60/25/15)
```
**Result (R² values):**
- Run Diff alone: 0.828
- **Run Diff 70% + Close Win% 30%: 0.929** (best)
- Run Diff 60% + Close Win% 40%: 0.917
- Run Diff 80% + Close Win% 20%: 0.913
- Run Diff 70% + 1-Run Win% 30%: 0.902
- Run Diff 55% + Close 25% + Momentum 20%: 0.921
- Run Diff 60% + Close 25% + Late SD 15%: 0.907
- Run Diff 70% + Momentum 30%: 0.803 (worse than RD alone)
- Close vs 1-run correlation: 0.789

### Game-Level Momentum Conversion Buckets — All Teams 2025
```sql
-- Per game: count each team's SD For successes + R For successes (conversions).
-- Bucket into More/Even/Fewer vs opponent's conversions.
-- Aggregate W/L record and run differential per team per bucket.
WITH half_innings AS (...),
sequenced AS (...),
game_convs AS (
  SELECT game_pk, def_team AS team, CASE WHEN runs = 0 THEN 1 ELSE 0 END AS conv
  FROM sequenced WHERE prev_runs >= 1
  UNION ALL
  SELECT game_pk, off_team AS team, CASE WHEN runs >= 1 THEN 1 ELSE 0 END AS conv
  FROM sequenced WHERE prev_runs >= 1
), ...
GROUP BY team, bucket ORDER BY team, bucket
```
**Result:** 90 rows (30 teams x 3 buckets). Exported to `~/Desktop/momentum_buckets_2025.csv`.

### Conversion Edge Rate & Even-Bucket Win Rate — Individual Correlations (2022–2026)
```sql
-- Per team-season: edge_rate (% of games in More bucket), even_win_rate,
-- fewer_win_rate, run_diff, close_win_pct
-- Correlated each with win_pct, plus cross-correlations for independence
```
**Result (r with win%):** Edge Rate = 0.757, Even Win Rate = 0.638, Fewer Win Rate = 0.637, Run Diff = 0.910, Close Win% = 0.658.
**R² values:** Edge Rate = 0.572, Even Win Rate = 0.407, Fewer Win Rate = 0.406.
**Independence:** Edge vs Run Diff r = 0.750, Even vs Run Diff r = 0.552, Edge vs Even r = 0.369, Edge vs Close r = 0.345, Even vs Close r = 0.443.

### Conversion Edge Rate & Even-Bucket Win Rate — Composite Tests (2022–2026)
```sql
-- Z-scored composites of edge_rate, even_win_rate, fewer_win_rate, run_diff, close_win_pct
-- Tested various weight combinations against win_pct
```
**Result (R² with win%):**
- Edge 70% + Even 30%: 0.708
- Edge 60% + Even 40%: 0.722
- Edge 50% + Even 50%: 0.711
- Edge 50% + Even 20% + Fewer 30%: 0.871
- Edge 30% + Run Diff 70%: 0.834
- Edge 30% + Even 20% + Run Diff 50%: 0.863
- Edge 30% + Even 15% + Fewer 15% + Run Diff 40%: 0.907
- **Run Diff 70% + Close Win% 30%: 0.929 (still best)**

### Close-Game Win% Year-Over-Year Stability (2021–2026)
```sql
-- Per-pair and pooled autocorrelation of close_win_pct (≤2 run margin) vs win_pct and run_diff
-- Also: predictive power of year N metrics on year N+1 win%
```
**Result (per-pair r for close_win_pct YoY):** 2021→22: .270, 2022→23: -.116, 2023→24: -.001, 2024→25: .382, 2025→26: .098.
**Pooled (150 pairs):** Close Win% YoY r = .123, Win% YoY r = .523, Run Diff YoY r = .580.
**Predictive:** Close Win% → next year Win%: r = .190. Run Diff → next year Win%: r = .564. Run Diff → next year Close Win%: r = .314.

## 2026-06-16

### Validate /api/hot scoreless-streak logic (RP, 2026)
Sanity-check appearance aggregation + gaps-and-islands streak logic backing the new `/(research)/hot` page.
```sql
-- Appearance = (pitcher, game_pk). runs = SUM(post_bat_score-bat_score) on PA-ending pitches.
-- outs via events CASE. RP = <3 games of 50+ competitive pitches. Longest scoreless island per RP.
WITH app AS (
  SELECT pitcher, MAX(player_name) AS player_name, game_pk, MAX(game_date) AS game_date,
    SUM(CASE WHEN events IS NOT NULL THEN COALESCE(post_bat_score,0)-COALESCE(bat_score,0) ELSE 0 END) AS runs,
    SUM(CASE events WHEN 'strikeout' THEN 1 WHEN 'field_out' THEN 1 ... WHEN 'triple_play' THEN 3 ELSE 0 END) AS outs,
    COUNT(*) FILTER (WHERE pitch_type NOT IN ('PO','IN') OR pitch_type IS NULL) AS comp_pitches
  FROM pitches WHERE game_year=2026 AND game_type='R' GROUP BY pitcher, game_pk
), rp AS (SELECT pitcher FROM app GROUP BY pitcher HAVING COUNT(*) FILTER (WHERE comp_pitches>=50) < 3),
ord AS (SELECT *, SUM(CASE WHEN runs>0 THEN 1 ELSE 0 END)
    OVER (PARTITION BY pitcher ORDER BY game_date, game_pk ROWS UNBOUNDED PRECEDING) AS grp
  FROM app WHERE pitcher IN (SELECT pitcher FROM rp))
SELECT player_name, COUNT(*) outings, SUM(outs) outs, MIN(game_date), MAX(game_date)
FROM ord WHERE runs=0 GROUP BY pitcher, player_name, grp ORDER BY outs DESC LIMIT 12;
```
**Result:** 9,058 appearance rows / 688 pitchers / latest 2026-06-14 / 4,954 scoreless apps. Top completed RP streak: Luke Weaver 18.0 IP (16 G, 5/1–6/11). Iglesias, Miller, Chapman, Suarez follow — all legit RP, no starters leaking through. Logic confirmed.

## 2026-06-18

### Bat-tracking coverage audit + miss-distance leaderboard ingest
Confirmed `pitches` table holds every Savant pitch-level CSV column (diffed live 119-col header vs table — 0 missing; DB-only extras `id`, `stuff_plus`). Verified new `miss_distance` column populating daily.
```sql
-- non-null bat-tracking coverage by year
SELECT game_year, COUNT(miss_distance) miss_nonnull, COUNT(*) total,
  ROUND(100.0*COUNT(miss_distance)/COUNT(*),1) pct
FROM pitches WHERE game_year>=2023 GROUP BY game_year ORDER BY game_year;
```
**Result:** miss_distance present 2023+ (3.8% / 8.4% / 8.6% / 7.0% of all pitches — i.e. ~whiff rate, since miss only exists on swing-and-miss). Built `bat_tracking_swing_miss` table + daily cron snapshot of the swing-timing/miss-distance leaderboard (season-cumulative, no date slice). Initial snapshot 2026-06-18: 2,946 rows (pitcher/batter × overall/per-pitch). Sanity: Mason Miller #1 pitcher miss distance 6.9 in, matches MLB.com article.

### Bat Tracking leaderboard page — data-path verification
Verified `bat_tracking_swing_miss_latest` view feeds `/api/bat-tracking` for pitcher/batter × overall/per-pitch-type.
```sql
SELECT player_type, (pitch_type='ALL') AS overall, COUNT(*)
FROM bat_tracking_swing_miss_latest WHERE season=2026 GROUP BY 1,2 ORDER BY 1,2;
```
**Result:** pitcher ALL 311 / split 940; batter ALL 353 / split 1342 — matches the snapshot insert. Page added under nav More → Bat Tracking.
