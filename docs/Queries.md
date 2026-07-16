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

## 2026-06-20

### Vision↔Tools ingest pipeline status check
Confirmed the Triton Vision → Tools TrackMan ingest is live (not just built) before adding the Zone/Movement review plots.
```sql
SELECT id, source, started_at, finished_at, pitches_inserted, pitches_skipped, error_text
FROM public.trackman_ingest_log ORDER BY started_at DESC LIMIT 12;
```
**Result:** 9 `vision_live` ingests May 26 → Jun 9, all succeeded (error_text null), 51 pitches total — matches `trackman_pitches` rowcount. Token in macOS Keychain already matches Vercel `VISION_INGEST_TOKEN` (no 401s), so the pipeline is fully wired end-to-end.

## 2026-06-26

### Recreated 4 materialized views with corrected whiff/chase/CSW formulas

Part of the full metric-accuracy audit. All 4 MVs had the same bugs baked into their SQL definitions:
- Whiff numerator missing `swinging_pitchout`
- Swing denominator using `= 'hit_into_play'` (exact match, misses `_no_out` / `_score` variants)
- Swing denominator missing `swinging_pitchout`
- Redundant `= 'foul_tip'` (already caught by `LIKE '%foul%'`)
- `mv_team_pitching_stats` csw_pct missing `missed_bunt` and `swinging_pitchout`

```sql
-- Applied via Supabase migrations:
-- fix_mv_team_bullpen_stats_whiff
-- fix_mv_team_pitching_stats_whiff_csw_chase
-- fix_mv_team_platoon_stats_whiff
-- fix_mv_batter_season_stats_whiff_chase

-- Each: DROP MATERIALIZED VIEW + CREATE MATERIALIZED VIEW with corrected formulas + recreate indexes
-- Canonical whiff numerator: description LIKE '%swinging_strike%' OR description = 'missed_bunt' OR description = 'swinging_pitchout'
-- Canonical swing denominator: LIKE '%swinging_strike%' OR LIKE '%foul%' OR LIKE 'hit_into_play%' OR = 'missed_bunt' OR = 'swinging_pitchout'
```
**Result:** All 4 MVs recreated and populated. Verified `swinging_pitchout` present and `= 'hit_into_play'` exact match removed in all definitions.

## 2026-07-01

### Trade-video player pull (11 players): season stats + advanced metrics
Player ID lookup, traditional line from `player_season_stats`, and pitch-level aggregates for a batch of trade-candidate players.
```sql
-- IDs
SELECT id, name, position FROM players WHERE name IN ('Ryan, Joe','Ward, Taylor','Ray, Robbie','Detmers, Reid','Chapman, Aroldis','Whitlock, Garrett','Fairbanks, Pete','Wacha, Michael','Peralta, Freddy','Gray, Sonny','Skubal, Tarik');

-- Traditional line
SELECT player_id, era, wins, losses, saves, holds, innings_pitched, earned_runs
FROM player_season_stats WHERE season=2026 AND stat_group='pitching'
AND player_id IN (657746,592662,672282,547973,676477,664126,608379,642547,543243,669373);

-- Pitch-level advanced (K%, BB%, whiff%, CSW%, FF velo, xwOBAcon, EV, hardhit%, GB%) grouped by pitcher, game_year=2026 (run_query_long)
-- Taylor Ward (621493) hitting aggregate: PA/AB/H/HR/BB/K, slash components, xwOBA, EV, hardhit% (run_query_long)
```
**Result:** All 11 players returned 2026 mid-season data (through ~2026-06-29). Used to build trade-video writeups. Note: `get_player_stats` MCP tool errored (`syntax error near "FILTER"`) — aggregated manually from `pitches`.

### Trade-video follow-up: Statcast percentile rankings
Mapped each player's `mv_pitcher_season_stats` rate values to `league_percentiles` breakpoints (2026, MLB), role-split SP/RP; Taylor Ward's hitter metrics computed from `pitches` and mapped to hitter breakpoints.
```sql
-- Per player/metric: percentile = count of 99 breakpoints <= value (higher_better) or >= value (lower_better)
-- Roles: SP = Ryan/Ray/Detmers/Wacha/Peralta/Gray/Skubal; RP = Chapman/Whitlock/Fairbanks; hitter = Ward
```
**Result:** Full percentile tables built for all 11 players. Output written to `~/Desktop/Notes/trade-targets-2026.md`. Highlights: Skubal 98th-pct BB%/94th K-BB; Fairbanks 1st-pct GB% (explains 6.75 ERA vs 94th-pct K); Ryan 95th-pct BB%; Ward 98th-pct BB% but 33rd-pct SLG.

## 2026-07-06

### Scoped 2026 pitch video archive backfill

Sizing the new `pitch_videos` archive index (Savant clip archive on Mayday Cloud NAS).
```sql
SELECT count(DISTINCT game_pk) AS games, count(*) AS pitches FROM pitches WHERE game_year = 2026;
```
**Result:** 1,795 games, 530,763 pitches. At ~15–25MB/clip the full-season archive is ~8–13TB.

### Verified play_id backfill join coverage (3-game test)

After test run of `scripts/backfill-pitch-videos.ts` (new `pitch_videos` table, migration `create_pitch_videos`).
```sql
WITH g AS (SELECT DISTINCT game_pk FROM pitch_videos)
SELECT
  (SELECT count(*) FROM pitch_videos) AS video_rows,
  (SELECT count(*) FROM pitches p JOIN g ON p.game_pk = g.game_pk) AS pitch_rows,
  (SELECT count(*) FROM pitches p
     JOIN pitch_videos v ON v.game_pk = p.game_pk
      AND v.at_bat_number = p.at_bat_number
      AND v.pitch_number = p.pitch_number) AS matched;
```
**Result:** 976 video rows / 933 statcast pitches / 933 matched — 100% coverage; extra 43 feed rows are pickoffs/non-pitch events.

### Reset smoke-test rows in pitch_videos

Download-worker smoke test (`scripts/download-pitch-videos.ts --max-pitches 5 --root <scratchpad>`) marked 5 rows `downloaded` with files in a temp dir, not the NAS. Reset them.
```sql
UPDATE pitch_videos
SET status = 'pending', file_path = NULL, size_bytes = NULL, downloaded_at = NULL, attempts = 0
WHERE status = 'downloaded'
RETURNING game_pk, at_bat_number, pitch_number;
```
**Result:** 5 rows (game 822714, AB 1, pitches 1–5) back to pending. Test clips averaged ~5MB each → revised full-2026 archive estimate ~2.8TB.

### Picked a 2025 pitch to test /api/pitch-video on-demand cache path

```sql
SELECT game_pk, at_bat_number, pitch_number, player_name, pitch_type FROM pitches WHERE game_year = 2025 AND game_type = 'R' ORDER BY game_date DESC LIMIT 1;
```
**Result:** game 776136, AB 41, pitch 2 (Sears FF). API live-resolved play_id from the Savant game feed, inserted a `pending` row (`queued: true`), and served the row from the index on the second call — on-demand path verified.

### Verified /api/play-video on-demand queue insert

After archive-first rewrite of `/api/play-video`, confirmed a request for an unindexed 2025 pitch queued it.
```sql
SELECT game_pk, at_bat_number, pitch_number, status, play_id FROM pitch_videos WHERE game_pk = 776136 ORDER BY at_bat_number, pitch_number;
```
**Result:** 2 rows (AB 41 pitches 1–2), both `pending` with resolved play_ids — one from the /api/pitch-video test, one from the /api/play-video test.

### Full 2026 play_id backfill — final coverage

`scripts/backfill-pitch-videos.ts 2026` finished: 1,792 games, 528,915 rows, 0 failures.
```sql
SELECT
  (SELECT count(*) FROM pitch_videos) AS total_rows,
  (SELECT count(DISTINCT game_pk) FROM pitch_videos) AS games,
  (SELECT count(*) FROM pitches p WHERE p.game_year = 2026
     AND EXISTS (SELECT 1 FROM pitch_videos v
       WHERE v.game_pk = p.game_pk AND v.at_bat_number = p.at_bat_number
         AND v.pitch_number = p.pitch_number)) AS matched_2026,
  (SELECT count(*) FROM pitches WHERE game_year = 2026) AS pitches_2026;
```
**Result:** 529,893 index rows / 1,796 games; 529,390 of 530,763 2026 pitches matched = **99.74% coverage** (remainder = feed rows without play_id, mostly untracked pitches).

## 2026-07-07

### Download-worker test batch triage (5 games)
First NAS batch (`--limit 5`) reported 350 failures on game 822715 and a status-upsert error on 822716. Checked per-game status + sample errors.
```sql
SELECT status, count(*) AS n, min(error) AS sample_error
FROM pitch_videos WHERE game_pk IN (776136, 822714, 822715, 822716, 822717)
GROUP BY status ORDER BY status;

SELECT game_pk, status, count(*) AS n
FROM pitch_videos WHERE game_pk IN (776136, 822714, 822715, 822716, 822717)
GROUP BY game_pk, status ORDER BY game_pk, status;

-- Probe: first two play_ids of 822715 for manual Savant page + mp4 HEAD check
SELECT play_id, at_bat_number, pitch_number FROM pitch_videos
WHERE game_pk = 822715 ORDER BY at_bat_number, pitch_number LIMIT 2;
```
**Result:** 822715 = 350× `mp4 fetch 404` (Savant page 200 with an mp4 URL, but the sporty-clips asset 404s — MLB never published clips for that game; rows stay `failed` for the `--include-failed` retry pass). 822716 stuck `pending` because mixed downloaded/failed upsert batches wrote `attempts = NULL` (NOT NULL violation) — fixed by including `attempts` in every `processPitch` return path; re-run adopted the on-disk files and flipped all 309 rows.

### Worker game-list query needs run_query_long
Full-season run (no `--limit`) died on the game-list query with `57014 statement timeout`. Confirmed the join is index-backed and timed it on the long RPC.
```sql
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'pitches' AND indexdef ILIKE '%game_pk%';

-- run_query_long (120s):
SELECT v.game_pk, max(p.game_year) AS game_year, count(*) AS n
FROM pitch_videos v
LEFT JOIN pitches p ON p.game_pk = v.game_pk
  AND p.at_bat_number = v.at_bat_number AND p.pitch_number = v.pitch_number
WHERE v.status = 'pending'
GROUP BY v.game_pk ORDER BY v.game_pk;
```
**Result:** `pitches` has the unique `(game_pk, at_bat_number, pitch_number)` index; the query runs in 28s — just over the 30s `run_query` ceiling. Worker's game-list query switched to `run_query_long`; 1,791 pending games returned.

### Post-fix archive status
```sql
SELECT status, count(*) AS n FROM pitch_videos GROUP BY status ORDER BY status;
```
**Result:** 934 downloaded / 350 failed / 528,609 pending. Full-season download run started (concurrency 3, ~148 clips/min ≈ 2.5–3 days).

### Scoped-run failure triage (June 29+ run)
Cumulative log counters suggested game 823446 failed wholesale; checked per-game status + global failure reasons.
```sql
SELECT game_pk, error, count(*) FROM pitch_videos WHERE status='failed' AND game_pk IN (823446,823525) GROUP BY 1,2;
SELECT v.game_pk, v.status, count(*), min(p.game_date::text) FROM pitch_videos v
LEFT JOIN pitches p ON p.game_pk = v.game_pk AND p.at_bat_number = v.at_bat_number AND p.pitch_number = v.pitch_number
WHERE v.game_pk IN (823446,823525) GROUP BY 1,2;
SELECT error, count(*) FROM pitch_videos WHERE status='failed' GROUP BY 1 ORDER BY 2 DESC;
```
**Result:** 823446 fully downloaded (355/355 — log counters are cumulative, not per-game). 823525 (2026-07-05) = 311× `mp4 fetch 404`, same MLB-CDN-gap as 822715. Global failures: 1,203× mp4 404 + 14× transient Savant 500 — no worker bug.

### Player-search RPCs: anon permission fix
Mayday Studio's `/api/triton-search` proxy (anon key) got `permission denied for materialized view batter_summary` from `search_batters`.
```sql
SELECT proname, prosecdef FROM pg_proc ... WHERE proname IN ('search_players','search_batters','search_all_players');
-- Migration player_search_rpcs_security_definer:
ALTER FUNCTION search_batters(text,integer) SECURITY DEFINER SET search_path = public;  -- + search_players, search_all_players(text,text,integer)
```
**Result:** `search_batters`/`search_players` were SECURITY INVOKER (ran as anon → no MV grant) while `search_all_players` was already DEFINER. All three aligned to SECURITY DEFINER with pinned search_path; anon RPC call verified returning rows.

### Trevor May vs. José Abreu HBP lookup (video-search "how far back" question)
```sql
SELECT game_pk, game_date, at_bat_number, pitch_number, pitch_type, release_speed, description, events
FROM pitches
WHERE player_name = 'May, Trevor'
  AND batter = (SELECT id FROM players WHERE name ILIKE '%Abreu, Jos%' ORDER BY id LIMIT 1)
  AND (description = 'hit_by_pitch' OR events = 'hit_by_pitch');
```
**Result:** one row — **2016-05-06**, game 447301 AB 73 pitch 2, 97.4 mph FF HBP. Not findable in the video search because the `pitch_videos` index is 2026-only (pitches data goes back to 2015); resolved on-demand via `/api/pitch-video?game_pk=447301&ab=73&pitch=2&resolve_mp4=true` (clip exists on Savant's CDN; row queued).

### Pitch video archive — download progress check (laptop)
```sql
SELECT status, count(*) AS n, round(sum(size_bytes)/1e9::numeric, 1) AS gb, max(downloaded_at) AS last_download
FROM pitch_videos GROUP BY status ORDER BY n DESC;

SELECT count(*) FILTER (WHERE downloaded_at > now() - interval '1 hour') AS last_hour,
       count(*) FILTER (WHERE downloaded_at > now() - interval '24 hours') AS last_24h,
       min(downloaded_at) AS first_download
FROM pitch_videos WHERE status = 'downloaded';

SELECT left(coalesce(error,'(none)'), 80) AS err, count(*) AS n
FROM pitch_videos WHERE status = 'failed' GROUP BY 1 ORDER BY n DESC LIMIT 10;
```
**Result:** 30,257 downloaded (164.2 GB), 493,337 pending, 6,300 failed (6,282 `mp4 fetch 404`, 18 `sporty-videos 500`). Worker ran 14:34–21:47 UTC today (~4,200 clips/hr) then stopped — 0 downloads in last hour.

## 2026-07-09

### Backfill progress checks (status of the 2026 download run)
Point-in-time status counts for the running `pitch-video-worker` (checked twice, ~3.5h apart).
```sql
SELECT status, count(*) AS n FROM pitch_videos GROUP BY status ORDER BY n DESC;
SELECT attempts, count(*) AS n FROM pitch_videos WHERE status='failed' GROUP BY attempts ORDER BY attempts;
SELECT game_pk, count(*) AS n FROM pitch_videos WHERE status='failed' GROUP BY game_pk ORDER BY n DESC LIMIT 12;
```
**Result:** 12:40 — 158,287 downloaded / 362,860 pending / 15,976 failed / 6 missing (29.5%). 16:13 — 174,110 downloaded / 346,174 pending / 16,839 failed (32.4%, ~4,500 clips/h). Failures cluster as whole games (~320–356 rows each, e.g. 824980/825062/822715 — Savant pages not serving clips yet); all at attempts 1–3 of 6, retried by the nightly `--include-failed` runs.

## 2026-07-10

### Playlist port: schema pre-checks + migration
Verified target tables for the Videos-page playlist port from Mayday Studio.
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('profiles','pitch_video_searches','pitch_playlists','pitch_playlist_items');
SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position LIMIT 8;
```
**Result:** `profiles` (uuid id) + `pitch_video_searches` present; playlist tables absent → applied migration `pitch_playlists` (DDL in `scripts/create-pitch-playlists.sql`): `pitch_playlists` + `pitch_playlist_items`, RLS owner-only via `created_by = auth.uid()`.

### Pitch video archive — ingest progress check
```sql
SELECT status, count(*) AS n, round(sum(size_bytes)/1e9::numeric, 1) AS gb FROM pitch_videos GROUP BY status;
-- + rate: downloads in last hour / 24h, minutes since last download
SELECT left(coalesce(error,'(none)'),60) AS err, count(*) AS n
FROM pitch_videos WHERE status = 'failed' GROUP BY 1 ORDER BY n DESC LIMIT 8;
```
**Result:** 287,602 downloaded (1.54 TB), 229,507 pending, 24,208 failed, 35 missing. Worker live (last download 2 min ago), ~3,959/hr, 98,894 last 24h → ~2.3 days to drain. Failures 99.9% `mp4 fetch 404` (MLB CDN gaps), 34 transient (500/502/timeout/abort) for `--include-failed` retry pass.

## 2026-07-13

### Backfill complete — final accounting
Queue drained (0 pending). Split final statuses by season phase and checked what the remaining failures are.
```sql
SELECT status, count(*) AS n FROM pitch_videos GROUP BY status ORDER BY n DESC;
SELECT CASE WHEN p.game_date < '2026-03-25' THEN 'spring' ELSE 'regular' END AS phase, v.status, count(*) AS n
FROM pitch_videos v JOIN pitches p USING (game_pk, at_bat_number, pitch_number) GROUP BY 1,2 ORDER BY 1,2;
SELECT left(coalesce(error,'(none)'),60) AS err, count(*) AS n, min(attempts), max(attempts)
FROM pitch_videos WHERE status='failed' GROUP BY 1 ORDER BY n DESC;
SELECT round(sum(size_bytes)/1e12::numeric,2) AS tb, count(*) FROM pitch_videos WHERE status='downloaded';
```
**Result:** 389,330 downloaded (2.09 TB) / 142,052 missing / 22,209 failed / 0 pending. Missing is 93% spring training (132,412 rows Feb–Mar — Savant pages load but MLB never published clips; correct terminal state). **Regular season coverage: 388,051/419,891 = 92.4% downloaded**, 9,639 missing, 22,201 failed — every failure is `mp4 fetch 404` at attempts 2–5, retried by the nightly 4am pm2 run until attempt 6 settles them as missing.

### Auth model recon (for Athlete role build)
Checked existing role/tool distribution and the `profiles` schema before adding the `athlete` role.
```sql
SELECT 'role' AS kind, role AS val, count(*) AS n FROM profiles GROUP BY role
UNION ALL SELECT 'tool', tool, count(*) FROM tool_permissions GROUP BY tool
ORDER BY kind, n DESC;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
WHERE table_name='profiles' AND table_schema='public' ORDER BY ordinal_position;
```
**Result:** Roles: `user`×5, `owner`×1 (only two roles in use; `profiles.role` is plain text, default `'user'`). Tool grants: visualize×5, research×5, broadcast×2, compete/models/design/mechanics×1 each. **Missed a CHECK constraint here (see next entry) — `athlete` DID need DDL.**

### Athlete invite bug — role silently reset to `user`
Test athlete invite landed on the launcher with everything locked. Traced it: `invitations` recorded `role='athlete'` but `profiles.role='user'`, `updated_at==created_at` (the invite route's `upsert({role:'athlete'})` never took).
```sql
SELECT email, role, created_at, updated_at, (updated_at>created_at) AS was_updated
FROM profiles WHERE email='trevor.may.khs@gmail.com';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname='profiles_role_check';
```
**Result:** `profiles_role_check` = `CHECK (role IN ('user','admin','owner'))` — no `athlete`. The upsert violated the constraint; the invite route swallowed the error, so the trigger's default `'user'` stuck. Fix: migration `add_athlete_role` widened the constraint to include `athlete` + repaired the test account (see `scripts/add-athlete-role.sql`); invite route now checks the upsert error.

### 2025 backfill kicked off
Verified index scope before/after running `backfill-pitch-videos.ts 2025` (script fixed: game-list query moved from unindexed `game_year` to a `game_date` range on `run_query_long` after a 57014 statement timeout).
```sql
SELECT count(*) FROM pitches WHERE game_date >= '2026-01-01';  -- with indexed/games companions
SELECT status, count(*) AS n FROM pitch_videos GROUP BY status ORDER BY n DESC;
```
**Result:** 2026 index complete except the 15 Jul-12 games (nightly refresh handles them). 2025 indexing: 2,809/2,809 games, 823,420 rows queued (6 transient feed failures re-run clean). Post-index totals: 823,422 pending / 389,330 downloaded / 142,052 missing / 22,209 failed. Worker restarted via pm2 — run banner: 2,890 games / 845,631 pitches to process (2025 queue + 2026 retries + Jul-12 games), 45.4TB free on the NAS.

## 2026-07-14

### Compete Video page — schema + RLS recon
Building the Compete copy of the Research Videos page with an extended in-player pitch-data panel; verified the `pitches` columns feeding derived fields and the RLS on the shared playlist/search tables (Compete is athlete-facing, so cross-user exposure matters).
```sql
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='pitches'
  AND column_name IN ('release_spin_rate','spin_axis','release_extension','pfx_x','pfx_z','plate_x','plate_z',
    'zone','vx0','vy0','vz0','ax','ay','az','sz_top','sz_bot');
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) FROM pg_policy
WHERE polrelid IN ('pitch_video_searches','pitch_playlists','pitch_playlist_items')::regclass;
```
**Result:** All 16 pitch columns exist (exact names `ax/ay/az`, `vx0/vy0/vz0`) → added to `/api/pitch-video` META_COLS. `pitch_playlists`/`pitch_playlist_items` are owner-only (`created_by = auth.uid()`), so athletes get private playlists automatically. But `pitch_video_searches` SELECT is `USING (true)` (world-readable to authenticated) — the Compete copy scopes the History drawer to `user_id = own` to avoid leaking staff/other-athlete search activity.

### Video — Game finder query shape
Validated the `games_on` matchup-list query backing the new "Game" mode (both Video pages) before wiring `/api/pitch-video?games_on=DATE`.
```sql
SELECT p.game_pk, MAX(p.game_date) AS game_date, MAX(p.home_team) AS home_team,
  MAX(p.away_team) AS away_team, COUNT(*) AS pitch_count
FROM pitches p WHERE p.game_date = '2026-07-11' GROUP BY p.game_pk ORDER BY MAX(p.away_team);
```
**Result:** Clean matchup rows (e.g. `ATH @ CWS (239)`, `BOS @ NYM (305)`); per-game pitch counts 239–305 — all under the route's new 1000-row LIMIT, so a full game loads without truncation. `game_date` is indexed → fast (~15 games × ~300 pitches scanned).

## 2026-07-15

### 2025 archive backfill — progress check (~day 1)
Status counts, hourly download rate, and per-season split ~24h after kicking off the 2025 queue.
```sql
SELECT status, count(*) AS n, round(sum(size_bytes)/1e12::numeric,2) AS tb FROM pitch_videos GROUP BY status ORDER BY n DESC;
SELECT date_trunc('hour', downloaded_at) AS hr, count(*) AS downloaded FROM pitch_videos
WHERE status='downloaded' AND downloaded_at > now() - interval '8 hours' GROUP BY 1 ORDER BY 1;
SELECT left(coalesce(error,'(none)'),60) AS err, count(*) AS n FROM pitch_videos WHERE status='failed' GROUP BY 1 ORDER BY n DESC;
SELECT CASE WHEN p.game_date >= '2026-01-01' THEN '2026' ELSE '2025' END AS season, v.status, count(*) AS n
FROM pitch_videos v JOIN pitches p USING (game_pk, at_bat_number, pitch_number)
WHERE v.status IN ('failed','pending','downloaded') GROUP BY 1,2 ORDER BY 1,2;
```
**Result:** 581,189 downloaded (3.11 TB, +1.02 TB since kickoff) / 621,689 pending / 36,236 failed / 142,082 missing. Worker online (pm2, 9h uptime, 1 restart). 2025 season: 191,882 of ~823k downloaded (~23%), 617,031 pending, 14,027 failed — failures are all `mp4 fetch 404` (same pattern as 2026; retried nightly until attempt 6 settles them as missing). Steady rate ~4,200/hr → pending queue drains in ~6 days (~Jul 21).

## 2026-07-16

### Inherited runners — do we ingest it anywhere?
Schema sweep for inherited-runner / runner-on-base columns across all tables.
```sql
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'
  AND (column_name ILIKE '%inherit%' OR column_name ILIKE '%on_1b%' OR column_name ILIKE '%on_2b%'
       OR column_name ILIKE '%on_3b%' OR column_name ILIKE '%runner%') ORDER BY table_name, column_name;
```
**Result:** No `inherited*` column anywhere. Base-state columns exist: `on_1b/on_2b/on_3b` (pitches, milb_pitches, wbc_pitches) and `runner_*_id/dest` (retro_events) — enough to *derive* IR/IRS. Confirmed MLB Stats API season-pitching hydrate (already called by `/api/cron/player-stats`) returns `inheritedRunners` + `inheritedRunnersScored`, but the cron doesn't persist them.

### IR/IRS added — backfill verification
Migration `add_inherited_runners` added `inherited_runners`/`inherited_runners_scored` to `player_season_stats`; cron + `backfill-player-stats.ts` now persist them. Verified first backfill year while the 2015–2026 run progressed.
```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='player_season_stats' ORDER BY ordinal_position;
SELECT count(*) AS with_ir, sum(inherited_runners) AS total_ir, sum(inherited_runners_scored) AS total_irs
FROM player_season_stats WHERE season=2015 AND stat_group='pitching' AND inherited_runners IS NOT NULL;
```
**Result:** 2015 fully populated minutes into the run: 735 pitchers, 7,118 IR / 2,100 IRS (29.5% scored — matches league norms ~30%).
