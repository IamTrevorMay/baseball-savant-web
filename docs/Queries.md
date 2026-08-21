# Query Log

Auto-populated log of ad-hoc database queries run during exploration sessions.

---

## 2026-07-19

**MEchanics build — schema inspection + demo seed verification.**

Inspected report/athlete schema before building:
```sql
select table_name, column_name, data_type, is_nullable from information_schema.columns
where table_schema='public' and table_name in ('athlete_profiles','compete_reports','athlete_notifications','profiles')
order by table_name, ordinal_position;
```
Result: `compete_reports(athlete_id,title,subject_type,report_date,pdf_url,metadata,…)`, `athlete_profiles(id,profile_id,player_id,height_in,throws,…)`.

Found the CHECK blocking biomech reports:
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.compete_reports'::regclass and contype='c';
```
Result: `compete_reports_subject_type_check CHECK (subject_type = ANY (ARRAY['pitching','hitting']))` → widened to include `'biomech'` (migration `compete_reports_allow_biomech_subject`).

Verified demo seed:
```sql
select report_date, player_name, metadata->>'movementGrade' grade,
       jsonb_array_length(metadata->'flags') flags, (pdf_url is not null) has_pdf
from compete_reports where subject_type='biomech' order by player_name, report_date;
```
Result: 6 biomech reports (Trevor May + EJ), grade 43→58/59, flags 3→0, all with PDFs. 6 captures / 48 throws / 68 assessment_norms rows.

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

## 2026-07-11

### Pitch video archive — ingest progress check
```sql
SELECT status, count(*) AS n, round(sum(size_bytes)/1e9::numeric, 1) AS gb FROM pitch_videos GROUP BY status;
-- + rate: downloads in last hour / 24h, minutes since last download
```
**Result:** 343,706 downloaded (1.84 TB), 173,036 pending, 28,271 failed, 35 missing (63% by count). Worker live (last download 1 min ago), 4,598/hr last hour, 96,683 last 24h → pending drains in ~1.8 days.

## 2026-07-12

### Pitch video archive — pending drained; missing spike triage
Status check showed 0 pending but `missing` jumped 35 → 133,340. Traced the spike.
```sql
SELECT status, count(*) AS n, round(sum(size_bytes)/1e9::numeric, 1) AS gb FROM pitch_videos GROUP BY status;
SELECT left(coalesce(error,'(none)'),70) AS err, count(*) AS n, min(attempts), max(attempts)
FROM pitch_videos WHERE status = 'missing' GROUP BY 1 ORDER BY n DESC;
-- whole-game pattern: 455 games, 208 fully missing, 98.2% avg within affected games
-- game dates: all Feb–Mar 2026
SELECT p.game_type, v.status, count(*) FROM pitch_videos v
JOIN pitches p USING (game_pk, at_bat_number, pitch_number)
WHERE p.game_year = 2026 GROUP BY 1,2;
```
**Result:** 384,780 downloaded (2.06 TB), 30,930 failed, 133,340 missing, 0 pending. Missing spike = **spring training** (game_type S: 132,412 missing — Savant publishes no clips for most ST games; benign). Regular season: 383,504 downloaded / 30,919 failed / 927 missing = **92.3% of R pitches archived**. Worker still live at 816/hr — retry pass draining failed rows.

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

### Backfill complete + found nightly player-stats cron silently broken
All 12 seasons verified 100% populated (with_ir == pitchers every year; IRS% 29.5–34.5, sane). But the log's `2026: 0 batters` line led to a stale-data discovery: 2026 hitting rows last touched **June 10**, and `cron_runs` shows the nightly job reporting "success" with `batters: 0` every day (pitchers also 0 on Jul 13–16) — the script swallows query errors.
```sql
SELECT season, count(*) AS pitchers, count(inherited_runners) AS with_ir, sum(inherited_runners) AS ir,
  sum(inherited_runners_scored) AS irs,
  round(100.0*sum(inherited_runners_scored)/nullif(sum(inherited_runners),0),1) AS irs_pct
FROM player_season_stats WHERE stat_group='pitching' GROUP BY season ORDER BY season;
SELECT count(*) AS hitting_rows, max(updated_at) FROM player_season_stats WHERE season=2026 AND stat_group='hitting';
SELECT job, started_at, status, counts FROM cron_runs WHERE job='player-stats' ORDER BY started_at DESC LIMIT 8;
SELECT count(DISTINCT batter) FROM pitches WHERE game_year = 2026 AND game_type = 'R';  -- timeout
SELECT count(DISTINCT batter) AS b, count(DISTINCT pitcher) AS p FROM pitches
WHERE game_date >= '2026-01-01' AND game_date < '2027-01-01' AND game_type = 'R';  -- timeout on run_query, OK on run_query_long
```
**Result:** Diagnosis — the `SELECT DISTINCT pitcher/batter … WHERE game_year = N` scans outgrew `run_query`'s timeout (same class as the backfill-pitch-videos 57014). Even the indexed `game_date` range needs `run_query_long` (597 batters / 744 pitchers in ~15s). Fix: cron + backfill script now use `run_query_long` + `game_date` range and **throw** on id-query errors so `cron_runs` records real failures. Re-ran 2026 backfill to repair the month-stale hitting rows.

### Worst pitchers by inherited runners, 2015–2026
Top-25 worst strand rates (IRS%, min 50 career IR) plus the most-total-IRS leaders, from the freshly backfilled IR/IRS columns.
```sql
SELECT COALESCE(p.name, s.player_id::text) AS pitcher,
  SUM(s.inherited_runners) AS ir, SUM(s.inherited_runners_scored) AS irs,
  ROUND(100.0 * SUM(s.inherited_runners_scored) / NULLIF(SUM(s.inherited_runners),0), 1) AS irs_pct,
  COUNT(*) FILTER (WHERE s.inherited_runners > 0) AS seasons
FROM player_season_stats s LEFT JOIN players p ON p.id = s.player_id
WHERE s.stat_group = 'pitching' AND s.inherited_runners IS NOT NULL
GROUP BY s.player_id, p.name
HAVING SUM(s.inherited_runners) >= 50
ORDER BY irs_pct DESC LIMIT 25;
-- same aggregate ORDER BY irs DESC LIMIT 5 for raw totals
```
**Result:** Worst strand rate: Joey Wentz 51.9% (27/52), Albert Abreu 51.0%, Jake Woodford 50.7% — vs ~31% league norm. Most total IRS: Steve Cishek & Andrew Chafin 94 each (Chafin on a huge 364 IR workload at a *good* 25.8%).

### Historical backfill to 1974 — API boundary probe + first-year verification
Probed the MLB Stats API league-wide season endpoint decade-by-decade: IR/IRS complete **1974+** (344/344 pitchers non-null), fragmentary 1971–73 (34/9/4 pitchers), null ≤1970. Rewrote `backfill-player-stats.ts` to use the league-wide endpoint (one call per season per group, no pitches-table ID dependency) + insert-if-missing historical players. Verified 1974 after the test run:
```sql
SELECT p.name, s.inherited_runners AS ir, s.inherited_runners_scored AS irs, s.saves, s.era
FROM player_season_stats s JOIN players p ON p.id = s.player_id
WHERE s.season = 1974 AND s.stat_group='pitching' AND s.inherited_runners > 0
ORDER BY s.inherited_runners DESC LIMIT 5;
```
**Result:** 344 pitching + 741 hitting rows for 1974; 861 historical players inserted. Leaders look right for the era: Tom Murphy 95 IR (1.90 ERA, 20 SV), Steve Foucault 93, Rollie Fingers 78, Terry Forster 77, Sparky Lyle 76. Full 1975–2014 run kicked off.

### 1974–2014 backfill complete — coverage verification
Full run + re-runs for 13 transient `fetch failed` chunk drops (12 years, then 2002 hitting once more). Final coverage check:
```sql
WITH per_season AS (
  SELECT season,
    count(*) FILTER (WHERE stat_group='pitching') AS pitchers,
    count(*) FILTER (WHERE stat_group='hitting') AS hitters,
    sum(inherited_runners) AS ir, sum(inherited_runners_scored) AS irs
  FROM player_season_stats WHERE season BETWEEN 1974 AND 2026 GROUP BY season)
SELECT count(*) AS seasons, min(season), max(season), min(pitchers), min(hitters),
  count(*) FILTER (WHERE ir IS NULL OR ir = 0) AS seasons_without_ir,
  sum(ir), sum(irs), round(100.0*sum(irs)/sum(ir),1) AS irs_pct FROM per_season;
SELECT season, count(*) FROM player_season_stats WHERE stat_group='hitting'
  AND season BETWEEN 1974 AND 2026 GROUP BY season HAVING count(*) < 750 ORDER BY season;
-- + all-time worst-IRS% leaderboard (min 150 IR) on the expanded data
```
**Result:** All 53 seasons 1974–2026 populated, zero seasons without IR. 339,570 IR / 110,630 IRS (32.6% all-time). Low-count seasons all explainable (1970s roster sizes, 2020 COVID, universal-DH era). 6,619 historical players inserted into `players` total. All-time worst strand rate (min 150 IR): Dale Murray 44.6% on a huge 392 IR (1974–85), Joe Beckwith 43.4%, Reggie Cleveland 43.2%.

### Top-25 worst IRS% re-run on full 1974–2026 data
Same leaderboard as the 2015+ version (min 50 IR), now over all 53 seasons, with career span added.
```sql
SELECT COALESCE(p.name, s.player_id::text) AS pitcher, MIN(s.season) AS from_yr, MAX(s.season) AS to_yr,
  SUM(s.inherited_runners) AS ir, SUM(s.inherited_runners_scored) AS irs,
  ROUND(100.0 * SUM(s.inherited_runners_scored) / NULLIF(SUM(s.inherited_runners),0), 1) AS irs_pct
FROM player_season_stats s LEFT JOIN players p ON p.id = s.player_id
WHERE s.stat_group = 'pitching' AND s.inherited_runners IS NOT NULL
GROUP BY s.player_id, p.name
HAVING SUM(s.inherited_runners) >= 50
ORDER BY irs_pct DESC LIMIT 25;
```
**Result:** Blaine Neal is the runaway all-time worst: 65.5% (38 of 58, 2001–05) — 8 pts clear of Brad Thomas 57.7%. Only three 2015+ names survive on the all-time list (Wentz, Abreu, Woodford). Highest-volume offenders in the 25: Nelson Cruz (the pitcher) 67/135 (49.6%), Carlos Almánzar 58/117, Rich Folkers 54/104.

### Top-25 worst IRS%, min 150 IR + "are those hitters?" check
Same leaderboard at min 150 IR (tiebreak `irs_pct DESC, ir DESC`), plus a position/career-IP audit after names like Reggie Cleveland / Nelson Cruz read as hitters.
```sql
-- leaderboard: same aggregate as above, HAVING SUM(inherited_runners) >= 150, ORDER BY irs_pct DESC, ir DESC
-- audit: same grouping, selecting p.position, SUM(innings_pitched), SUM(wins), SUM(saves)
```
**Result:** All 25 are position `P` with 297–1,952 career IP — no hitters, just name doppelgängers (Reggie Cleveland '70s SP, Doug Bird, Miguel Batista, the '80s reliever Bob Gibson, reliever Nelson Cruz). Hitters can't qualify structurally: IR only exists on `stat_group='pitching'` rows, and position players who pitch never approach 50+ IR. Min-150 leaders: Dale Murray 44.6% (175/392, 1974–85), Joe Beckwith 43.4%, Reggie Cleveland 43.2%; active-era names: Derek Law 40.4%, Alex Wilson 40.1%.
## 2026-07-18

### Create pitch_telestrations table (migration)
Additive table for saved telestrator markups (Videos page). RLS owner-only, mirrors `pitch_playlists`. DDL in `scripts/create-pitch-telestrations.sql`.
```sql
create table if not exists public.pitch_telestrations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references public.profiles(id) on delete cascade,
  row_key text not null, clip jsonb not null, strokes jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- + owner/row_key index, RLS enable, owner-only policy
```
**Result:** applied (migration `pitch_telestrations`). Verified: 0 rows, rls_enabled=true, policy_count=1.

### Pitch-video backfill status check
```sql
select status, count(*), pg_size_pretty(sum(size_bytes)), max(downloaded_at) from pitch_videos group by status;
select count(*) filter (where downloaded_at > now()-interval '1 hour') as dl_1h,
       count(*) filter (where downloaded_at > now()-interval '24 hours') as dl_24h from pitch_videos;
```
**Result:** downloaded 850,364 (4.23 TB) · pending 333,931 · missing 153,584 · failed 43,596. Rate 4,298/hr (88k/24h). Last download 2026-07-18 17:16 UTC — worker live. failed@6attempts=0 (still retrying).

## 2026-07-25

### Scoping: offense-vs-pitcher-quality analysis (data availability)
```sql
-- column presence in pitches
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='pitches' AND column_name IN
 ('events','description','type','woba_value','woba_denom','estimated_woba_using_speedangle',
  'launch_speed','launch_angle','home_team','away_team','inning_topbot','pitcher','batter',
  'game_date','game_year','p_throws','stand','pitch_type','babip_value','iso_value');
-- 2026 volume
SELECT count(*) AS pitches_2026, max(game_date) AS last_game FROM pitches WHERE game_date>='2026-01-01';
-- Triton command/stuff 2026 coverage
SELECT count(*) rows_2026, count(DISTINCT pitcher) pitchers_2026,
       count(*) FILTER (WHERE stuff_plus IS NOT NULL) with_stuff
FROM pitcher_season_command WHERE game_year=2026;
```
**Result:** all needed cols present (woba_value, woba_denom, estimated_woba_using_speedangle=xwOBA, launch_speed, home/away_team+inning_topbot). 2026 = 587,979 pitches through 2026-07-23 (~2/3 season, ~150k PA). `pitcher_season_command` 2026 = 663 pitchers but **stuff_plus NULL for all** → Stuff+ unusable for 2026; quality metric will use xwOBA-against instead.

### Offense-vs-pitcher-quality: build + final aggregation (2026)
Staging tables (`tmp_ovpq_*`, dropped after): role classification (canonical ≥3 games 50+ pitches → SP), PA-level facts (batting team from `inning_topbot`, per-PA `xnum = COALESCE(estimated_woba_using_speedangle, woba_value)`), pitcher totals, per-(pitcher,team) totals, PA-weighted quintile cutpoints of xwOBA-against within role, and leave-one-team-out pitcher quality.
```sql
-- final: team × role × tier, LOO-tiered, min 100 out-of-sample PA
WITH tiered AS (
  SELECT pa.bat_team, l.role,
    CASE WHEN l.q_excl<=c.c1 THEN 1 WHEN l.q_excl<=c.c2 THEN 2
         WHEN l.q_excl<=c.c3 THEN 3 WHEN l.q_excl<=c.c4 THEN 4 ELSE 5 END AS tier,
    pa.woba_value, pa.woba_denom, pa.is_k, pa.is_bip, pa.is_hh
  FROM tmp_ovpq_pa pa
  JOIN tmp_ovpq_loo l ON l.pitcher=pa.pitcher AND l.bat_team=pa.bat_team
  JOIN tmp_ovpq_cut c ON c.role=l.role
  WHERE l.den_excl>=100)
SELECT bat_team, role, tier, count(*) n_pa,
  sum(woba_value) sum_wv, sum(woba_denom) sum_wd, stddev_samp(woba_value) sd_wv,
  sum(is_k) sum_k, sum(is_bip) sum_bip, sum(is_hh) sum_hh
FROM tiered GROUP BY bat_team, role, tier;
```
**Result:** 300 rows (30 teams × 2 roles × 5 tiers). Cutpoints — SP `.289/.310/.329/.346`, RP `.277/.297/.319/.348`. League SP gradient clean: aces wOBA .290 / K% 26.6 → back-end .341 / K% 18.9. RP wOBA gradient weak/non-monotonic, K% still declines. ~13% PA dropped by ≥100 out-of-sample filter. Built into interactive artifact (gradient / who-beats-aces / expectation matrix). Staging tables dropped.

## 2026-07-31

### MEchanics pipeline readiness audit
```sql
-- table existence
select ... information_schema.tables for biomech_captures/biomech_throws/assessment_norms/athlete_profiles/compete_reports;
-- data readiness
select (select count(*) from assessment_norms) as norms_rows,
       (select count(distinct level) from assessment_norms) as norms_levels,
       (select count(*) from athlete_profiles) as athletes_total,
       (select count(*) from athlete_profiles where height_in is not null and throws is not null) as athletes_ready,
       (select count(*) from biomech_captures) as captures_so_far,
       (select count(*) from storage.buckets where id in ('biomech-captures','biomech-reports')) as biomech_buckets;
-- capture provenance (synthetic vs real)
select c.status, c.capture_system, c.frame_rate, c.throw_count, (c.raw_file_path is not null) as has_raw_file,
       count(t.id) as throw_rows,
       (select count(*) from compete_reports r where r.subject_type='biomech' and r.metadata->>'captureId'=c.id::text) as reports
from biomech_captures c left join biomech_throws t on t.capture_id=c.id group by c.id,... ;
```
**Result:** All 5 tables deployed; both storage buckets present. Norms seeded (68 rows, 4 levels). 3 athlete_profiles, all with height_in+throws. 6 captures exist but **all `has_raw_file=false`** → synthetic seed (processCanonical), 8 throws + 1 report each, frame_rate 240, capture_system `captury_optitrack`. Conclusion: downstream pipeline proven end-to-end on synthetic data; real-C3D ingest path (parseC3D + label mapping) never exercised with an actual Captury file.

## 2026-08-04

### 1st-inning pitch count for 2026-08-03 (pitch-clip download prep)
```sql
SELECT count(*) AS pitches, count(DISTINCT game_pk) AS games
FROM pitches
WHERE game_date = '2026-08-03' AND inning = 1;
```
**Result:** 0 pitches / 0 games — Aug 3 not yet ingested.

### Ingest freshness check
```sql
SELECT max(game_date) AS max_pitch_date,
       count(*) FILTER (WHERE game_date >= '2026-07-28') AS last_week_rows
FROM pitches;
```
**Result:** max_pitch_date `2026-08-02`, 25,344 rows in the trailing week. Nightly cron is one day behind, so the 8/3 clip pull sourced play_ids directly from the Savant `/gf` feed instead of `pitches`.

### `pitch_videos` column list
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'pitch_videos' ORDER BY ordinal_position;
```
**Result:** 11 columns — `game_pk, at_bat_number, pitch_number, play_id, status, file_path, size_bytes, attempts, error, requested_at, downloaded_at`. No `game_date`/`inning`, so date-scoped filtering requires joining `pitches`.

## 2026-08-05

### athlete_profiles lookup for demo C3D generation
```sql
select column_name, data_type from information_schema.columns
where table_name = 'athlete_profiles' order by ordinal_position;

select ap.id, p.full_name, ap.throws, ap.height_in, ap.weight_lbs, ap.position, ap.current_team
from athlete_profiles ap
left join profiles p on p.id = ap.profile_id
order by ap.created_at;
```
**Result:** 3 profiles. Trevor May `da83a6a6…` R, 77", 265 lb, RHP; EJ `d52e66fe…` R, 74", 190 lb, RHP; unnamed `e409d7f0…` R, 77". Needed because `/api/mechanics/upload` derives hand + `heightMm` from this row, and `heightMm` directly scales `strideLengthPct` — the generated capture geometry must match the athlete it will be uploaded against. (Schema note: columns are `weight_lbs`/`height_in`; names live on `profiles.full_name`, not `athlete_profiles`.)

## 2026-08-11

### Cade Povich (700249) Stuff+ trend investigation
```sql
-- monthly Stuff+ / coverage for Povich, MLB
select date_trunc('month', game_date)::date as month, count(*) as pitches,
       round(avg(stuff_plus)::numeric,1) as stuff_plus, count(stuff_plus) as stuff_n, max(game_date)
from pitches where pitcher = 700249 and game_date >= '2026-01-01' group by 1 order by 1;

-- league-wide stuff_plus coverage by month (is this Povich-specific?)
select date_trunc('month', game_date)::date as month, count(*) as total_pitches,
       count(stuff_plus) as with_stuff, count(distinct game_pk) as games
from pitches where game_date >= '2026-04-01' group by 1 order by 1;

-- Povich MLB game log + MiLB game log
select game_date, count(*), count(stuff_plus), round(avg(stuff_plus)::numeric,1), round(avg(release_speed)::numeric,1)
from pitches where pitcher = 700249 and game_date >= '2026-04-01' group by 1 order by 1;
select game_date, count(*), round(avg(release_speed)::numeric,1)
from milb_pitches where pitcher = 700249 and game_date >= '2026-04-01' group by 1 order by 1;

-- MiLB Stuff+ by month (is it populated where MLB is not?)
select date_trunc('month', game_date)::date as month, count(*), count(stuff_plus), round(avg(stuff_plus)::numeric,1)
from milb_pitches where pitcher = 700249 and game_date >= '2026-04-01' group by 1 order by 1;

-- pitch-type stuff inputs, Apr-May vs Aug (MLB)
select case when game_date < '2026-06-01' then 'Apr-May' else 'Aug' end as period, pitch_type, count(*),
       avg(release_speed), avg(release_spin_rate), avg(pfx_x*12), avg(pfx_z*12),
       avg(release_extension), avg(release_pos_x), avg(release_pos_z)
from pitches where pitcher = 700249 and game_date >= '2026-04-01' and pitch_type not in ('PO','IN')
group by 1,2 order by 2,1 desc;

-- rule out null inputs as cause of missing stuff_plus
select date_trunc('month', game_date)::date as month, count(*), count(pitch_name), count(release_extension), count(stuff_plus)
from pitches where game_date >= '2026-05-01' group by 1 order by 1;
```
**Result:** Premise not supported — Povich has **zero** MLB Stuff+ values after 2026-05-01. League-wide `pitches.stuff_plus` coverage decays Apr 99.5% → May 90% → Jun 18% → Jul 4% → **Aug 0%**, so this is a pipeline failure in `computeStuffPlusForDateRange` (`app/api/update/route.ts:205`), not a player trend. `pitch_name`/`release_extension` are ~100% populated, so inputs are fine — likely the per-year `pitch_baselines` refresh scanning all of `game_year=2026` and timing out under `run_mutation` (error is caught and swallowed at line 277). MiLB path (`app/api/update/milb/route.ts:499`) is unaffected: Povich's July Triple-A Stuff+ = **100.0** vs April 99.5 (flat). Underlying stuff did change in August: arm slot dropped (FF rel_z 6.05→5.87, rel_x 1.08→1.29) with FF IVB 19.5"→18.0", SI IVB 15.0"→12.2", SL IVB 7.6"→4.6", CU depth -16.3"→-15.0"; cutter (12 pitches in Apr–May) not thrown at all in August. Small sample: 2 MLB starts, 149 pitches.

### stuff_plus backfill — repairing Jun–Aug 2026 gap
```sql
-- confirm game_year is indexed (it is: idx_pitches_game_year, idx_pitches_year_date)
select indexname, indexdef from pg_indexes where tablename = 'pitches';

-- repair, run in date-scoped chunks (2026-05-01..2026-06-01, then 10-day windows
-- through 2026-07-31, then 2026-08-01..2026-08-03 and 2026-08-04+)
update pitches p
set stuff_plus = greatest(0, least(200, round(
  100
  + coalesce((p.release_speed - b.avg_velo) / nullif(b.std_velo,0), 0) * 4.5
  + coalesce((sqrt(power(p.pfx_x*12,2) + power(p.pfx_z*12,2)) - b.avg_movement) / nullif(b.std_movement,0), 0) * 3.5
  + coalesce((p.release_extension - b.avg_ext) / nullif(b.std_ext,0), 0) * 2.0
)::numeric))
from pitch_baselines b
where p.pitch_name = b.pitch_name and p.game_year = b.game_year
  and p.game_date >= '<chunk_start>' and p.game_date < '<chunk_end>'
  and p.release_speed is not null
  and p.stuff_plus is null;   -- only unscored rows: narrower, resumable, leaves Apr/May untouched
```
**Result:** `/api/admin/backfill-stuff-plus?year=2026` **failed** — even batch 0 hit `statement timeout`. Not a missing index (`game_year` is indexed); it rewrites all 657k 2026 rows against 29 indexes. Date-scoped chunks with `stuff_plus IS NULL` succeeded in 8 calls. Coverage restored: May 90.2%→**99.7%**, Jun 17.8%→**99.6%**, Jul 4.1%→**99.6%**, Aug 0%→**99.6%** (residual gaps are rows with null `release_speed`, matching April's healthy 99.5%). Monthly league avg Stuff+ stayed ~100.2–101.0 throughout, confirming the backfill didn't skew the scale. Note the admin route is still broken for whole-year use — it needs date chunking + a `stuff_plus IS NULL` guard.

### Cade Povich Stuff+ — post-backfill (answers the original question)
```sql
select 'MLB' as lvl, date_trunc('month', game_date)::date as month, count(*), round(avg(stuff_plus)::numeric,1)
from pitches where pitcher = 700249 and game_year = 2026 group by 1,2
union all
select 'MiLB', date_trunc('month', game_date)::date, count(*), round(avg(stuff_plus)::numeric,1)
from milb_pitches where pitcher = 700249 and game_date >= '2026-01-01' group by 1,2 order by 2,1;

select pitch_type,
  count(*) filter (where game_date < '2026-06-01') as n_apr_may,
  round(avg(stuff_plus) filter (where game_date < '2026-06-01')::numeric,1) as stuff_apr_may,
  count(*) filter (where game_date >= '2026-08-01') as n_aug,
  round(avg(stuff_plus) filter (where game_date >= '2026-08-01')::numeric,1) as stuff_aug
from pitches where pitcher = 700249 and game_date >= '2026-04-01' and pitch_type not in ('PO','IN')
group by 1 order by 4 desc nulls last;
```
**Result:** Premise confirmed once data was repaired. MLB Stuff+ by month: Feb 98.2, Mar 98.8, Apr 98.2, May 100.0, **Aug 97.7** — August is his season low. July Triple-A was 100.0, so the drop appeared on his return, not as a gradual slide. Driver is the four-seam: **FF 98.4 → 95.8** at rising usage (43% → 49% of pitches), plus SI 100.5 → 98.3 and SL 102.7 → 101.3. CU (97.6 → 98.8) and CH (98.5 → 99.9) both improved. Consistent with the lower arm slot found earlier (FF rel_z 6.05→5.87, rel_x 1.08→1.29): less IVB hurts the ride-dependent FF/SI while the CU gains depth/sweep. Sample: 2 starts, 149 pitches.

### Root cause of the stuff_plus decay — 8s RPC statement timeout
```sql
-- why identical SQL succeeded over the direct connection but timed out from the app
select rolname, rolconfig from pg_roles
where rolname in ('authenticator','service_role','anon','authenticated','postgres');
```
**Result:** `authenticator` = `statement_timeout=8s`, `lock_timeout=8s`; `service_role` = **null** (no override). PostgREST logs in as `authenticator` then `SET ROLE service_role`, and `SET ROLE` does not re-apply rolconfig, so the session keeps **8s** — every `run_query`/`run_mutation` call is capped there. `supabaseAdminLong`'s 120s is a client-side *fetch* timeout and does not extend it; that's why the same UPDATE ran instantly over the MCP direct connection and timed out through the app.

This is the actual cause of the coverage decay, superseding the earlier "baseline scan starves the UPDATE" reading: the nightly UPDATE covered the ingest's full 3-day window (~12k rows × 29 indexes) in one statement, and crossed 8s as the 2026 table grew. Empirical threshold on 2026 data (via `/api/admin/backfill-stuff-plus?mode=rescore`): `chunkDays=1` (~4k rows) **ok**, `chunkDays=2` (~8k) **ok**, `chunkDays=3` (~11k) **timeout**. Post-fix, `applyStuffPlusForDateRange('2026-08-04','2026-08-06')` runs 3 per-day statements in **4.2s** total.

Verified idempotent: rescoring 2026-08-04..08-06 reproduced identical monthly averages (Aug 100.19 before and after), so the Povich figures above are unaffected.

### Expectation-suite research — `integrity_checks` history, has any check ever failed?
```sql
SELECT check_name, status, count(*) AS n, min(created_at)::date AS first_seen,
       max(created_at)::date AS last_seen, max(found) AS max_found
FROM integrity_checks GROUP BY 1,2 ORDER BY 1,2;

SELECT (SELECT max(game_date) FROM pitches)                              AS max_pitch_date,
       (SELECT count(*) FROM players)                                    AS players_rows,
       (SELECT count(*) FROM integrity_checks)                           AS integrity_rows,
       (SELECT count(*) FROM integrity_checks WHERE status='fail')       AS fails,
       (SELECT count(DISTINCT created_at::date) FROM integrity_checks)   AS run_days;
```
**Result:** 776 check rows over **95 distinct run days** (2026-05-08 → 2026-08-11) across 8 checks, and **zero rows with `status='fail'` — ever.** Chronic un-actioned warns: `materialized_views` warn ×56 since 2026-06-14, `new_pitch_names` warn ×54 (max 8 unknown pitch names), `pitch_baselines` warn ×47 since 2026-06-26. Also: `players` = **16,924 rows** (CLAUDE.md says 4,017 — stale) and `max(pitches.game_date)` = 2026-08-09 vs today 2026-08-11, i.e. a **2-day** normal lag, so a naive `max(game_date) >= today - 1` freshness assertion would false-alarm.

### Assertion cost benchmarking on `pitches` — do candidate expectations fit under the 8s cap?
```sql
-- coverage (trailing 7 days)
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) AS total, count(stuff_plus) AS scored
FROM pitches WHERE game_date >= CURRENT_DATE - INTERVAL '7 days';

-- uniqueness (trailing 7 days vs trailing 2 days)
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM (
  SELECT game_pk, at_bat_number, pitch_number FROM pitches
  WHERE game_date >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY 1,2,3 HAVING count(*) > 1) d;

-- referential (trailing 7 days)
EXPLAIN (ANALYZE, BUFFERS) SELECT count(DISTINCT p.pitcher)
FROM pitches p LEFT JOIN players pl ON pl.id = p.pitcher
WHERE p.game_date >= CURRENT_DATE - INTERVAL '7 days' AND pl.id IS NULL;

-- combined coverage + range, scoped to the 3-day ingest window
EXPLAIN (ANALYZE, BUFFERS) SELECT game_date, count(*) AS n, count(stuff_plus) AS scored,
       min(stuff_plus) AS lo, max(stuff_plus) AS hi
FROM pitches WHERE game_date >= CURRENT_DATE - INTERVAL '3 days' GROUP BY 1;
```
**Result:** All plans use `idx_pitches_game_date` — no seq scans on `pitches`. Timings: **coverage 7d = 9,923 ms cold / 529 ms warm** (5,536 vs 67 shared reads) — the cold run *exceeds the 8s cap*; **uniqueness 7d = 18,302 ms cold / 4,509 ms warm** (25,506 rows, 0 duplicates) — over the cap even warm-ish; **uniqueness 2d = 16.4 ms** (4,535 rows, 467 buffers); **referential 7d = 1,346 ms** warm (Hash Anti Join, but seq-scans `players` at 16,924 rows, 135 reads), 0 orphans; **coverage+range 3d = 15.3 ms** (9,078 rows, 1,166 buffers). Current trailing-7d Stuff+ coverage: **25,400/25,506 = 99.6%** (post-fix, healthy). Conclusion: assertion cost is dominated by cold buffer reads, not row count, and the 7-day window is *not* safely runnable through `run_query`. Scope assertions to the 2–3 day ingest window and roll trailing-week checks off a persisted daily metrics table.

### Live Postgres monitoring survey (Jo — `Jo/postgres-performance/10-monitoring-postgres.md`)

Server/extension inventory, statistics-view survey, and a timeout-censoring experiment, run to ground the monitoring reference doc in measured values rather than assumptions. Read-only except the `pg_sleep` probes.

```sql
-- 1. Server + monitoring config inventory
SELECT version(), current_setting('server_version_num'),
  (SELECT setting FROM pg_settings WHERE name='shared_preload_libraries'),
  (SELECT setting FROM pg_settings WHERE name='pg_stat_statements.max'),
  (SELECT setting FROM pg_settings WHERE name='track_io_timing'),
  (SELECT to_regclass('pg_stat_io')::text);

-- 2. auto_explain + autovacuum + memory settings
SELECT name, setting, unit FROM pg_settings
WHERE name LIKE 'auto_explain%' OR name IN ('statement_timeout','lock_timeout',
  'idle_in_transaction_session_timeout','shared_buffers','effective_cache_size','work_mem',
  'max_connections','autovacuum_vacuum_scale_factor','autovacuum_vacuum_threshold') ORDER BY name;

-- 3. Role config (the 8s ceiling, from the catalog)
SELECT rolname, coalesce(array_to_string(rolconfig,', '),'(none)')
FROM pg_roles WHERE rolname IN ('authenticator','service_role');

-- 4. Dead tuples / HOT ratio / autovacuum staleness per table
SELECT relname, n_live_tup, n_dead_tup,
  round(100.0*n_dead_tup/nullif(n_live_tup+n_dead_tup,0),2) AS dead_pct,
  seq_scan, idx_scan, n_tup_upd, n_tup_hot_upd, last_autovacuum, autovacuum_count
FROM pg_stat_user_tables WHERE n_live_tup > 10000 ORDER BY n_dead_tup DESC LIMIT 15;

-- 5. All 29 indexes on pitches, by usage
SELECT i.indexrelname, s.idx_scan, pg_relation_size(i.indexrelid) AS bytes,
  ix.indisunique, ix.indisprimary
FROM pg_stat_user_indexes i JOIN pg_stat_user_indexes s USING (indexrelid)
JOIN pg_index ix ON ix.indexrelid = i.indexrelid
WHERE i.relname = 'pitches' ORDER BY s.idx_scan ASC, bytes DESC;

-- 6. pg_stat_statements: window, top by total time, and saturation vs the 8s cap
SELECT stats_reset, dealloc FROM extensions.pg_stat_statements_info;
SELECT calls, total_exec_time, mean_exec_time, max_exec_time, stddev_exec_time, query
FROM extensions.pg_stat_statements ORDER BY total_exec_time DESC LIMIT 12;
SELECT round((max_exec_time/8000.0*100)::numeric,1) AS pct_of_8s, calls, mean_exec_time, max_exec_time
FROM extensions.pg_stat_statements WHERE max_exec_time BETWEEN 7000 AND 8100 AND calls > 5
ORDER BY max_exec_time DESC;

-- 7. Cache hit ratio, connections, wait events
SELECT round((sum(heap_blks_hit)*100.0/nullif(sum(heap_blks_hit)+sum(heap_blks_read),0))::numeric,3)
FROM pg_statio_user_tables;
SELECT wait_event_type, wait_event, state, count(*) FROM pg_stat_activity GROUP BY 1,2,3 ORDER BY 4 DESC;

-- 8. Does run_query reach pg_stat_statements? (search_path = public, extensions)
SELECT public.run_query('select count(*) as n from pg_stat_statements');

-- 9. EXPERIMENT: are timed-out statements recorded in pg_stat_statements?
SET LOCAL statement_timeout = '300ms';
SELECT pg_sleep(5)   /* jo_timeout_probe_A */;          -- expect ERROR 57014
SELECT pg_sleep(0.2) /* jo_timeout_probe_B_control */;  -- expect success
SELECT calls, mean_exec_time, query FROM extensions.pg_stat_statements
WHERE query ILIKE '%jo_timeout_probe%';
```
**Result:** PostgreSQL **17.6**; `pg_stat_statements` **1.11 installed** (schema `extensions`, `max=5000`, `track=top`), window `2026-04-07 23:39` → `2026-08-11 20:04 UTC` with **`dealloc = 0`** (2,470/5,000 entries — no eviction, complete window). `auto_explain` **is** in `shared_preload_libraries` but `log_min_duration = 10000 ms`, i.e. **above the 8s `authenticator` cap — it can never fire on the `run_query` path**; `log_nested_statements = off` also hides RPC bodies. `track_io_timing = off` (all I/O timing columns are zero). `authenticator` rolconfig confirmed as `statement_timeout=8s, lock_timeout=8s`; `service_role` = `(none)`. **Saturation:** `run_query` 50,548 calls / mean 381.0 ms / **max 7,997.0 ms (99.96% of 8,000)**; second `run_query` shape max 7,881.5 ms (98.5%); **`pitches` ingest upsert max 7,587.6 ms (94.8%)**; `refresh_player_summary()` mean 103,311 ms / **max 119,926.5 ms (99.94% of the 120s ceiling)**. **`pitches`:** 8,891,054 live / **1,437,923 dead (13.92%)**, autovacuum trigger `50+0.2×8.89M = 1,778,261` so it sits at **80.9% of threshold**, `autovacuum_count=1`, `last_autovacuum` **2026-05-17** (86 days); HOT ratio **4.0%** (85,867/2,142,692) vs `sos_scores` **96.1%** and `player_season_stats` 77.1%; seq_scan 781 vs idx_scan 14,032,565. **Indexes:** 9 of 29 have `idx_scan = 0` totalling **~1.48 GB**, of which **~1.02 GB droppable** (the 9th is `pitches_pkey` — constraint-backing, keep); largest dead ones `idx_pitches_seq` 367 MB and `idx_pitches_stuff_plus` 261 MB; busiest is `pitches_game_pk_at_bat_number_pitch_number_key` at 13,943,600 scans. Table cache hit ratio **38.51%** (`shared_buffers` 256 MB vs ~35 GB of data); 22/60 connections, 0 idle-in-transaction; wait sample = 5× `IO/DataFileRead` active, 6× `Client/ClientRead` idle. `run_query` reads `pg_stat_statements` unqualified (search_path includes `extensions`). **Experiment (key finding):** `probe_A` raised `ERROR: 57014: canceling statement due to statement timeout` and left **zero rows** in `pg_stat_statements`, while `probe_B_control` was recorded (`calls=1, mean_exec_time=201.3`) — **timed-out statements are never recorded**, so `max_exec_time` is a *censored* distribution and the Stuff+ UPDATE's three months of nightly timeouts left no trace. Note: the database became unreachable (Cloudflare 522) at ~20:13 UTC mid-survey, so `pg_stat_database` rollback/deadlock counters were not captured.

### Materialized-view / rollup refresh audit (Jo brain doc `postgres-performance/08`)

Function-level timeout config for every refresh + `run_*` RPC:
```sql
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig AS function_settings,
       pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('refresh_materialized_views','refresh_league_averages','refresh_league_percentiles',
                    'refresh_player_summary','refresh_batter_summary','run_query','run_query_long','run_mutation')
ORDER BY p.proname;
```
**Result:** `refresh_materialized_views`, `refresh_league_averages`, `refresh_league_percentiles` all have `proconfig = NULL` (no `statement_timeout` override) → capped at `authenticator`'s 8s. `refresh_player_summary`/`refresh_batter_summary`/`run_query_long` carry `{statement_timeout=120s, search_path=...}`. `run_query`/`run_mutation` are SECURITY DEFINER but have **no** timeout override — confirming SECURITY DEFINER alone does not raise the cap.

Role-level timeout config:
```sql
SELECT rolname, rolconfig FROM pg_roles
WHERE rolname IN ('authenticator','service_role','anon','authenticated','postgres');
```
**Result:** `authenticator` = `{session_preload_libraries=safeupdate, statement_timeout=8s, lock_timeout=8s}`; `service_role` = NULL; `authenticated` = 8s; `anon` = 3s. Confirms `SET ROLE service_role` does not escape the 8s cap.

Nightly refresh cron outcomes:
```sql
SELECT date_trunc('day', started_at)::date AS d, count(*) AS runs,
       count(*) FILTER (WHERE counts->'materializedViews'->>'error' IS NOT NULL) AS mv_timeout,
       count(*) FILTER (WHERE counts->'materializedViews'->>'ok' IS NOT NULL) AS mv_ok,
       count(*) FILTER (WHERE counts->'materializedViews'->>'skipped' IS NOT NULL) AS mv_skipped,
       min(status) AS status
FROM cron_runs WHERE job = 'refresh' GROUP BY 1 ORDER BY 1;
```
**Result:** **52 runs 2026-06-21 → 2026-08-11: 50 timed out (`canceling statement due to statement timeout`), 2 skipped, 0 succeeded — `status='success'` on all 52.** `leagueAverages` and `leaguePercentiles` carry the identical error on the same 50 nights. Cron `duration_ms` 41,670–60,150 ms, so Vercel budget was never the constraint.

Marker + staleness corroboration:
```sql
SELECT key, value::text, updated_at FROM system_metadata
WHERE key IN ('mv_last_refreshed','pitches_last_run');

SELECT season, count(*) n, max(updated_at) AS last_updated
FROM league_averages GROUP BY season ORDER BY season DESC LIMIT 5;

SELECT c.relname, c.relkind, pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
       s.n_live_tup, s.last_analyze, s.last_autoanalyze, s.last_vacuum, s.last_autovacuum
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
WHERE n.nspname = 'public' AND (c.relkind = 'm' OR c.relname LIKE 'mv\_%'
  OR c.relname IN ('player_summary','batter_summary','league_averages','league_percentiles',
                   'pitcher_season_command','pitcher_season_deception'))
ORDER BY c.relkind, c.relname;
```
**Result:** `mv_last_refreshed` **does not exist** in `system_metadata` (only `pitches_last_run`, 2026-08-11, totalInserted 9,078) — the marker is written only on success and has never succeeded. `league_averages` season 2026 last updated **2026-06-26 19:48** (46 days stale). All six CONCURRENTLY-refreshed matviews last autoanalyzed 2026-06-26 19:43–19:57; `league_percentiles` 2026-06-03. Control group: `player_summary` autovacuumed 2026-08-05 and `batter_summary` 2026-08-11 — both refreshed by the two functions that carry `statement_timeout=120s`.

Matview dependency graph (ordering-hazard check):
```sql
SELECT dependent.relname AS dependent_view, source.relname AS depends_on, source.relkind AS src_kind
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class dependent ON dependent.oid = r.ev_class
JOIN pg_class source ON source.oid = d.refobjid
JOIN pg_namespace n ON n.oid = dependent.relnamespace
WHERE d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass
  AND dependent.relkind = 'm' AND n.nspname = 'public' AND dependent.oid <> source.oid
  AND source.relkind IN ('r','m','v')
GROUP BY 1,2,3 ORDER BY 1,2;
```
**Result:** Flat graph, depth 1 — all six `mv_*` plus `batter_summary` read `pitches` directly; `retro_id_map` reads `retro_people`. No matview-on-matview, so no catalog ordering hazard. (Data-level ordering hazard remains: `mv_pitcher_pitch_stats` aggregates `stuff_plus`, so it must refresh after the nightly scoring UPDATE.)

**Note:** an `EXPLAIN (ANALYZE, BUFFERS)` of the `mv_pitcher_pitch_stats` defining aggregate (full scan + GROUP BY over `pitches`) did **not** return within ~2 minutes and briefly saturated the connection pool (Cloudflare 522s on subsequent calls). Do not run that shape ad hoc; it self-cancelled at the session's 120s `statement_timeout`.

### Partitioning feasibility study for `pitches` / `retro_events` (Jo brain doc `06-partitioning-large-tables.md`)
```sql
-- 1. Full index inventory + usage for pitches (and same for retro_events)
SELECT i.relname AS indexname, pg_size_pretty(pg_relation_size(i.oid)) AS sz,
       s.idx_scan, pg_get_indexdef(i.oid) AS def
FROM pg_class t
JOIN pg_index x ON x.indrelid = t.oid
JOIN pg_class i ON i.oid = x.indexrelid
LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
WHERE t.relname = 'pitches'          -- then 'retro_events'
ORDER BY pg_relation_size(i.oid) DESC;

-- 2. Candidate partition-key distribution
SELECT game_year, count(*) AS pitches FROM pitches GROUP BY game_year ORDER BY game_year;  -- run_query_long

-- 3. Partitioning-relevant GUCs, extension availability, existing partitioned tables
SELECT version(), current_setting('enable_partition_pruning'), current_setting('enable_partitionwise_join'),
       current_setting('enable_partitionwise_aggregate'), current_setting('work_mem'),
       current_setting('max_locks_per_transaction'),
       (SELECT count(*) FROM pg_available_extensions WHERE name='pg_partman') AS partman_available,
       (SELECT count(*) FROM pg_extension WHERE extname='pg_partman')        AS partman_installed,
       (SELECT count(*) FROM pg_class WHERE relkind='p')                     AS partitioned_tables;
SELECT n.nspname, c.relname, pg_get_partkeydef(c.oid) AS partkey,
       (SELECT count(*) FROM pg_inherits WHERE inhparent=c.oid) AS nparts
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='p';

-- 4. Size + bloat + autovacuum history
SELECT relname, n_live_tup, n_dead_tup, round(100.0*n_dead_tup/NULLIF(n_live_tup,0),1) AS dead_pct,
       last_autovacuum, autovacuum_count, vacuum_count
FROM pg_stat_user_tables WHERE relname IN ('pitches','retro_events','milb_pitches');

-- 5. Does retro_events even have a time column?
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='retro_events'
  AND (column_name ILIKE '%year%' OR column_name ILIKE '%season%'
       OR column_name ILIKE '%date%' OR column_name='game_id');

-- 6. Would pruning add anything? (plans quoted verbatim in the brain doc)
EXPLAIN SELECT count(*), avg(release_speed) FROM pitches WHERE game_year=2026 AND pitch_type='FF';
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM pitches WHERE pitcher=605483 AND game_year=2025;
```
**Result:** PG **17.6**; `enable_partition_pruning=on`, both partition-wise GUCs `off`, `work_mem=3500kB`, `max_locks_per_transaction=64`. `pg_partman` **available but not installed**; the only partitioned table in the cluster is Supabase's own `realtime.messages` (RANGE `inserted_at`, 7 partitions). `pitches` = 8,891,054 live / **1,437,923 dead (16.2%)**, 9,707 MB total with **4,833 MB of index across 29 indexes**, and **`autovacuum_count = 1`** (last 2026-05-17) — versus 28 for `milb_pitches` and 25 for `retro_events`. **Nine `pitches` indexes have `idx_scan = 0`, totalling 1,417 MB (29% of index footprint)**, including `pitches_pkey` on `id` (370 MB, never scanned); the upsert key `(game_pk, at_bat_number, pitch_number)` has **13,943,600** scans. `retro_events` has **no date/year/season column** — only `game_id` (text). Plans: `game_year=2026 AND pitch_type='FF'` → `Index Only Scan using idx_pitches_movement`, no seq scan (so partition pruning would add ~nothing); `pitcher=605483 AND game_year=2025` → 1,063 rows but **`Heap Fetches: 914`**, 6,573.974 ms cold / 1,765.924 ms warm — stale visibility map from the missing autovacuum. Conclusion: **do not partition**; drop the 1,417 MB of unused indexes and vacuum instead.

### PostgREST/Supabase architecture research (Jo brain doc 07) — 2026-08-11

Role config, RPC metadata, `SET ROLE` semantics, RLS policy census, and the `jsonb_agg` wrapper cost.

```sql
-- 1. Role config: the source of the 8s ceiling
SELECT rolname, rolconfig, rolcanlogin, rolbypassrls FROM pg_roles
WHERE rolname IN ('authenticator','anon','authenticated','service_role','postgres',
                  'supabase_admin','supabase_auth_admin','supabase_storage_admin','dashboard_user','pgbouncer');

-- 2. The three RPCs: proconfig, security, owner, grants, source
SELECT p.proname, p.proconfig, p.prosecdef, p.provolatile, p.proparallel,
       pg_get_userbyid(p.proowner) AS owner, p.prosrc
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('run_query','run_mutation','run_query_long');

-- 3. Proof that SET ROLE does not re-apply rolconfig (both directions)
BEGIN; SET LOCAL statement_timeout='8s'; SET LOCAL ROLE service_role;
       SELECT current_user, current_setting('statement_timeout'); COMMIT;
SET LOCAL ROLE authenticated; SELECT current_setting('statement_timeout');

-- 4. RLS policy census + auth.uid() wrapping
SELECT count(*) total,
       count(*) FILTER (WHERE q ~* 'auth\.(uid|jwt|role)\(\)') uses_auth_fn,
       count(*) FILTER (WHERE q ~* '\(\s*select\s+auth\.(uid|jwt|role)\(\)') wrapped
FROM (SELECT coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') q
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') s;

-- 5. RLS cost: authenticated vs service_role on pitches
BEGIN; SET LOCAL ROLE authenticated;
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM pitches WHERE game_date >= '2026-08-01'; ROLLBACK;
-- (repeated with SET LOCAL ROLE service_role)

-- 6. initPlan A/B on auth.uid()
EXPLAIN ANALYZE SELECT count(*) FROM generate_series(1,200000) g WHERE g::text = auth.uid()::text;
EXPLAIN ANALYZE SELECT count(*) FROM generate_series(1,200000) g WHERE g::text = (SELECT auth.uid())::text;

-- 7. The run_query jsonb_agg wrapper cost (warm)
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM (SELECT * FROM pitches WHERE game_date>='2026-08-01' LIMIT 5000) t;
EXPLAIN (ANALYZE, BUFFERS) SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM pitches WHERE game_date>='2026-08-01' LIMIT 5000) t;
EXPLAIN (ANALYZE, BUFFERS) SELECT jsonb_agg(row_to_json(t)) FROM (SELECT pitcher, game_date, pitch_type, release_speed FROM pitches WHERE game_date>='2026-08-01' LIMIT 5000) t;
-- same at LIMIT 10000 and 20000 (both aborted >120s)

-- 8. Cluster settings
SELECT name, setting, unit, source FROM pg_settings
WHERE name IN ('max_connections','statement_timeout','lock_timeout','idle_in_transaction_session_timeout',
               'shared_buffers','work_mem','session_preload_libraries','max_parallel_workers_per_gather');
```
**Result:** `authenticator` = `statement_timeout=8s, lock_timeout=8s, session_preload_libraries=safeupdate` and is the **only** login role; `anon`=3s, `authenticated`=8s, **`service_role`=NULL** (BYPASSRLS). `SET ROLE` confirmed **not** to re-apply `rolconfig` in either direction (8s survived a switch to `service_role`; 2min survived a switch to `authenticated`) — so every `run_query`/`run_mutation` call is capped at 8s. All three RPCs are `SECURITY DEFINER`, owner `postgres`, `PARALLEL UNSAFE`, EXECUTE granted to `service_role` only; only `run_query_long` carries `proconfig statement_timeout=120s`. RLS: **258 policies in `public`, 170 call `auth.uid()`/`auth.jwt()`/`auth.role()`, 0 wrapped in `(SELECT …)`**; `pitches` has a `USING (true)` policy that folds the auth check away — identical plans and 43.6/43.5 ms as `authenticated` vs `service_role`. initPlan A/B: 84.343 ms unwrapped → 50.633 ms wrapped over 200k rows. **`jsonb_agg` wrapper cost (warm, 5,000 rows): 11.9 ms unwrapped → 849 ms at 90 columns → 33.4 ms at 4 columns; 10k and 20k wide rows both exceeded 120 s and briefly took the REST API offline (Cloudflare 522, 15 statement-timeout cancellations in the Postgres log).** Cluster: `max_connections=60`, `statement_timeout=120s`, `shared_buffers=256MB`, `work_mem=3500kB`, `max_parallel_workers_per_gather=1`, PG 17.6.1 — Micro-class compute. Also found: **`pitch_videos` has RLS enabled with zero policies** (deny-all for anon/authenticated), and `auto_explain` is enabled on this project.

### Capacity & storage survey (Jo — brain doc `Jo/postgres-performance/11-capacity-storage-planning.md`)
```sql
-- 1. Database size + version
SELECT pg_size_pretty(pg_database_size(current_database())), pg_database_size(current_database()), version();

-- 2. Per-table total/heap/index/TOAST size and bytes-per-row (public schema, top 30)
SELECT c.relname, c.reltuples, pg_total_relation_size(c.oid), pg_indexes_size(c.oid),
       pg_total_relation_size(c.reltoastrelid),
       round((pg_relation_size(c.oid)/c.reltuples)::numeric,1)       AS heap_bytes_per_row,
       round((pg_total_relation_size(c.oid)/c.reltuples)::numeric,1) AS total_bytes_per_row
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','m','p')
ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 30;

-- 3. Scan counts, dead tuples, autovacuum recency on the large tables
SELECT relname, seq_scan, idx_scan, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
WHERE relname IN ('retro_events','pitches','milb_pitches','retro_games','pitch_videos',
                  'retro_rosters','retro_starter_outings','bat_tracking_swing_miss');

-- 4. pitches rows per season, and 2026 daily rate
SELECT date_part('year', game_date)::int AS season, count(*) FROM pitches WHERE game_date IS NOT NULL GROUP BY 1 ORDER BY 1;
SELECT count(DISTINCT game_pk), count(*), count(DISTINCT game_date),
       round(count(*)::numeric/NULLIF(count(DISTINCT game_date),0),0), min(game_date), max(game_date)
FROM pitches WHERE game_date >= '2026-01-01';

-- 5. Per-index size and scan counts on retro_events / retro_games
SELECT relname, indexrelname, idx_scan, pg_relation_size(indexrelid)
FROM pg_stat_user_indexes WHERE relname IN ('retro_events','retro_games')
ORDER BY relname, pg_relation_size(indexrelid) DESC;

-- 6. Column count, fixed-width byte total, EXTENDED (varlena) column count
SELECT c.relname, count(*), count(*) FILTER (WHERE a.attstorage='x'),
       sum(CASE WHEN a.attlen>0 THEN a.attlen ELSE 0 END)
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
  AND c.relname IN ('retro_events','pitches','milb_pitches','retro_games','pitch_videos') GROUP BY 1;

-- 7. Storage-relevant server settings
SELECT name, setting, unit FROM pg_settings WHERE name IN
 ('default_toast_compression','wal_compression','shared_buffers','max_wal_size',
  'autovacuum_vacuum_scale_factor','work_mem','maintenance_work_mem','effective_cache_size','block_size');

-- 8. Installed extensions
SELECT string_agg(extname||' '||extversion, ', ') FROM pg_extension;
```
**Result:** DB = **34,703,805,587 B (32.3 GiB)**, PG **17.6**, `us-east-2`. Top five tables are **99.2% of the database**: `retro_events` 20.84 GB (14,915,507 rows; heap ~17 GB, idx 2,480 MB; **1,222.5 B/row heap**), `pitches` 10.18 GB (8,877,621 rows; heap 4,874 MB, **idx 4,833 MB**; **575.5 B/row heap + 570.8 B/row index = 1,146.5 total**), `milb_pitches` 2.48 GB, `retro_games` 467 MB, `pitch_videos` 451 MB — total 34.42 GB. **This contradicts the "8GB plan / disk pressure" guidance in `CLAUDE.md`, `Soto/context/triton-context.md:47` and `planning.md:115` by ~4×.** **TOAST size is 8,192 bytes (one empty page) on all five** — zero rows have ever been TOASTed, so compression settings are inert. `pitches` seasons: ~794k/yr mean over ten non-COVID seasons, 817.8k over the last three; **2026 YTD 657,570 pitches / 168 game days = 3,914/day** over 2,224 `game_pk`. Dead tuples: `pitches` **1,437,923 (16.2%)**, `retro_events` 194,912, `retro_games` 26,723, `milb_pitches` 112,916, `pitch_videos` 51,024 ≈ **1.17 GB recoverable**; `pitches` last autovacuumed **2026-05-17 (86 days)** at **80.9% of its 1,778,261 trigger**. **`retro_events` read evidence: 12 lifetime seq scans**; `retro_events_natural_key` 15,109,674 scans is the *ingest upsert probe*, while `event_type_idx` (96 MB) has **0 scans**, `batter_game_idx` (378 MB) **2**, `game_inning_idx` (431 MB) **112** → **~905 MB of dead index**. Settings: `shared_buffers` 256 MB, `effective_cache_size` 768 MB, `work_mem` 3,500 kB, `maintenance_work_mem` 64 MB, `max_wal_size` 4 GB, `default_toast_compression` **pglz**, `wal_compression` **zstd**, `autovacuum_vacuum_scale_factor` 0.2. Extensions: `plpgsql`, `pg_stat_statements` 1.11, `uuid-ossp`, `pgcrypto`, `supabase_vault`, `pg_trgm` — **no `pg_repack`, `pgstattuple`, `pg_cron`, or `pg_partman`**. **Not captured:** `pg_ls_waldir()` and `pg_available_extensions` — the database became unreachable (connection timeout) partway through, same symptom as the earlier survey.

### Distribution-drift research — pitch-type mix drift and categorical taxonomy history
```sql
-- 1. pitch-mix share by season (reference vs current windows for PSI/chi-square)
SELECT game_year,
       COUNT(*) FILTER (WHERE pitch_type='ST') AS st,
       COUNT(*) FILTER (WHERE pitch_type='SL') AS sl,
       COUNT(*) FILTER (WHERE pitch_type='SV') AS sv,
       COUNT(*) FILTER (WHERE pitch_type='CU') AS cu,
       COUNT(*) FILTER (WHERE pitch_type='KC') AS kc,
       COUNT(*) AS total,
       ROUND(100.0*COUNT(*) FILTER (WHERE pitch_type='ST')/COUNT(*),2) AS st_pct,
       ROUND(100.0*COUNT(*) FILTER (WHERE pitch_type='SL')/COUNT(*),2) AS sl_pct
FROM pitches WHERE game_year BETWEEN 2020 AND 2026 GROUP BY 1 ORDER BY 1;

-- 2. new-category / disappeared-category detection: lifetime span of every pitch_type
SELECT pitch_type, MIN(game_year) AS first_year, MAX(game_year) AS last_year, COUNT(*) AS n
FROM pitches WHERE pitch_type IS NOT NULL GROUP BY 1 ORDER BY first_year, n DESC;
```
**Result:** Sweeper (`ST`) share of all pitches: **1.06% (2020) → 1.81 → 3.89 (2022) → 5.50 (2023) → 6.33 → 6.66 → 7.79% (2026)**; `SL` fell 16.36% → 14.07%. PSI computed from these six buckets (`SL`,`ST`,`SV`,`CU`,`KC`,other): **2022→2023 = 0.0082**, **2025→2026 = 0.0020** (both "no substantial change" on conventional bands), **2020→2026 = 0.144** ("moderate"). Two-sample χ² on the same 2025-vs-2026 buckets = **720.4 on 5 df, p < 10⁻¹⁰⁰** — the p-value measures sample size (n₁=826,259, n₂=657,570), not drift. **21 distinct `pitch_type` values.** `ST` (266,453) and `SV` (26,876) both have `MIN(game_year)=2015`, which is impossible under the taxonomy in force then — evidence that Savant retro-applied a newer classifier to history and Triton re-ingested it *(inferred; confirm against Savant changelog)*. `FT` (legacy two-seam code) has `MIN=MAX=2026` with **13 rows** — a retired code reappearing. `UN` first appears 2025 (5 rows); `IN`/`AB` last seen 2016. **Not captured:** league four-seam velocity by season and a recomputed `stuff_plus` histogram — the Supabase origin began returning Cloudflare **522** at 20:19 UTC after two concurrent full-column aggregates on `pitches` and did not recover during the session. Lesson: do not run heavy analytical scans against the production origin in parallel.

### Schema-design research — row width, alignment padding, TOAST, and column types (Jo brain doc `postgres-performance/09`)
```sql
-- 1. Full column inventory for pitches: type, alignment, width, null fraction
SELECT a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS type,
       t.typalign, t.typlen, a.attnotnull, s.avg_width, s.null_frac
FROM pg_attribute a
JOIN pg_type t ON t.oid = a.atttypid
LEFT JOIN pg_stats s ON s.schemaname='public' AND s.tablename='pitches' AND s.attname=a.attname
WHERE a.attrelid='public.pitches'::regclass AND a.attnum>0 AND NOT a.attisdropped
ORDER BY a.attnum;

-- 2. Table geometry: pages, bytes/row, heap vs index vs toast
SELECT c.relname, c.reltuples::bigint AS est_rows, c.relpages,
       pg_size_pretty(pg_relation_size(c.oid)) AS heap,
       pg_size_pretty(pg_indexes_size(c.oid)) AS idx,
       pg_size_pretty(COALESCE(pg_total_relation_size(c.reltoastrelid),0)) AS toast,
       round((pg_relation_size(c.oid)::numeric / NULLIF(c.reltuples::numeric,0)),1) AS heap_bytes_per_row,
       (SELECT count(*) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS ncols
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND c.relname IN ('pitches','retro_events','milb_pitches','compete_pitches','pitch_videos',
                    'whoop_cycles','whoop_sleep','whoop_workouts','player_season_stats','players')
ORDER BY pg_total_relation_size(c.oid) DESC;

-- 3. Null-weighted payload vs naive sum(avg_width)
SELECT tablename,
  round(sum(avg_width * (1-null_frac))::numeric,1) AS est_payload_bytes,
  round(sum(avg_width)::numeric,1) AS naive_sum_width,
  count(*) AS ncols, ceil(count(*)/8.0) AS null_bitmap_bytes,
  count(*) FILTER (WHERE null_frac = 1) AS all_null_cols,
  count(*) FILTER (WHERE null_frac > 0.7) AS mostly_null_cols
FROM pg_stats WHERE schemaname='public'
  AND tablename IN ('pitches','retro_events','milb_pitches','compete_pitches','pitch_videos')
GROUP BY tablename ORDER BY 2 DESC;

-- 4. Encrypted Whoop raw_data: stored size vs text length (TOAST compression check)
SELECT 'whoop_sleep' AS t, count(*) n, round(avg(pg_column_size(raw_data)),0) AS avg_bytes,
       max(pg_column_size(raw_data)) AS max_bytes FROM whoop_sleep
UNION ALL SELECT 'whoop_cycles', count(*), round(avg(pg_column_size(raw_data)),0), max(pg_column_size(raw_data)) FROM whoop_cycles
UNION ALL SELECT 'whoop_workouts', count(*), round(avg(pg_column_size(raw_data)),0), max(pg_column_size(raw_data)) FROM whoop_workouts;

SELECT octet_length(raw_data::text) AS raw_json_chars, pg_column_size(raw_data) AS stored_bytes
FROM whoop_sleep LIMIT 5;

-- 5. Per-type on-disk size (subtract the 24-byte composite header)
SELECT pg_column_size(row(1::int2)) AS r_int2, pg_column_size(row(1::int4)) AS r_int4,
       pg_column_size(row(1::int8)) AS r_int8, pg_column_size(row(1::float4)) AS r_float4,
       pg_column_size(row(1::float8)) AS r_float8, pg_column_size(row(100.4::numeric)) AS r_numeric,
       pg_column_size(row(true)) AS r_bool, pg_column_size(row(now())) AS r_timestamptz,
       pg_column_size(row(gen_random_uuid())) AS r_uuid, pg_column_size(row('FF'::text)) AS r_text2,
       pg_column_size(row('FF'::varchar(2))) AS r_varchar2, pg_column_size(row('FF'::char(2))) AS r_char2;

-- 6. EXPERIMENT A — alignment padding (SCRATCH TABLES, must be dropped)
CREATE TABLE _jo_align_bad (a int8,b int4,c int8,d int4,e int8,f int4,g int8,h int4,
                            i int8,j int4,k int8,l int4,m int8,n int4,o int8,p int4);
CREATE TABLE _jo_align_good (a int8,c int8,e int8,g int8,i int8,k int8,m int8,o int8,
                             b int4,d int4,f int4,h int4,j int4,l int4,n int4,p int4);
INSERT INTO _jo_align_bad  SELECT s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s FROM generate_series(1,300000) s;
INSERT INTO _jo_align_good SELECT s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s FROM generate_series(1,300000) s;
ANALYZE _jo_align_bad; ANALYZE _jo_align_good;
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) SELECT sum(b) FROM _jo_align_bad;
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) SELECT sum(b) FROM _jo_align_good;

-- 7. EXPERIMENT B — float8 vs real, 20 measurement columns (SCRATCH)
CREATE TABLE _jo_f8 AS SELECT s AS id, (s%100)::float8 c1, ... , (s%100)::float8 c20 FROM generate_series(1,200000) s;
CREATE TABLE _jo_f4 AS SELECT s AS id, (s%100)::real   c1, ... , (s%100)::real   c20 FROM generate_series(1,200000) s;

-- 8. EXPERIMENT C — numeric vs real vs float8 aggregate cost (SCRATCH)
CREATE TABLE _jo_num AS SELECT s AS id, (90+(s%2000)/100.0)::numeric(6,2) AS v_num,
       (90+(s%2000)/100.0)::real AS v_f4, (90+(s%2000)/100.0)::float8 AS v_f8
FROM generate_series(1,2000000) s;
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) SELECT sum(v_num), avg(v_num) FROM _jo_num;
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) SELECT sum(v_f4),  avg(v_f4)  FROM _jo_num;
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) SELECT sum(v_f8),  avg(v_f8)  FROM _jo_num;
```
**Result:** `pitches` = **121 columns** (1 `bigint`, 99 fixed 4-byte, 21 varlena), 623,662 pages / 8,877,621 rows = **575.5 heap bytes per live row, 14.23 rows/page**; `sum(avg_width)`=540 but null-weighted payload = **397.6 B**, so the perfectly-packed ideal is ~440 B/row (18.4 rows/page). Gap is dominated by **1,437,923 dead tuples (13.9%, `last_autovacuum` 2026-05-17)**, not by alignment (~10 varlena→fixed transitions ≈ 15–20 B/row, ~3%). `retro_events` 14.9M rows / 1,222.5 B/row / 6.70 rows/page, only 1.3% dead. **`compete_pitches` has 47 `double precision` columns, 27 columns 100% NULL, and `pitch_time` typed `text`.** `pitches.stuff_plus` is `numeric`. Experiments: alignment **5,770 → 4,616 pages (−20.0%)**, seq-scan buffers 5,770 vs 4,616 (execution 128.5 vs 137.6 ms — not comparable, one run got a parallel worker); float8→real **4,928 → 2,880 pages (−41.6%)**; `sum()+avg()` over 2M rows at equal buffers **numeric 4,889 ms / real 2,485 ms / float8 2,001 ms**. Whoop `raw_data` avg 1,207 B (sleep) with an **empty (8 kB) TOAST relation**, and `pg_column_size` **exceeds** `octet_length(raw_data::text)` (1,088 vs 932) — pglz compression is being rejected on AES-256-GCM base64 ciphertext. Instance: PG **17.6**, `shared_buffers` 256MB, `default_toast_compression` **pglz**.
**⚠️ OUTSTANDING CLEANUP:** the scratch tables `_jo_align_bad`, `_jo_align_good`, `_jo_f8`, `_jo_f4`, `_jo_num`, `_jo_p_actual`, `_jo_p_packed` (~500 MB total) were **not dropped** — the Supabase origin started returning Cloudflare **522** at ~20:19 UTC (same outage logged in the distribution-drift entry above; at least two agent sessions were running heavy scans against production concurrently) and never recovered during the session. Run `DROP TABLE IF EXISTS _jo_align_bad, _jo_align_good, _jo_f8, _jo_f4, _jo_num, _jo_p_actual, _jo_p_packed;` as soon as the origin is back.

### Jo — data-quality dimensions doc: constraint inventory, validity spot-check, MiLB event-vocabulary audit

Ran while writing `Jo/data-quality/01-data-quality-dimensions.md`. All read-only; `run_query_long` required (the first two timed out at the 8s `authenticator` cap).

```sql
-- 1. Constraint inventory on pitches (what validity is actually enforced?)
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE conrelid = 'pitches'::regclass ORDER BY contype, conname;

-- 2. Validity + completeness spot-check on 2026 pitches
SELECT count(*) AS rows_2026,
       count(stuff_plus) AS with_sp,
       round(100.0*count(stuff_plus)/count(*),2) AS sp_cov_pct,
       count(*) FILTER (WHERE stuff_plus < 0 OR stuff_plus > 200) AS sp_out_of_range,
       count(*) FILTER (WHERE release_speed IS NOT NULL
                          AND (release_speed < 40 OR release_speed > 110)) AS velo_absurd,
       count(*) FILTER (WHERE pitch_type IS NULL) AS null_pitch_type
FROM pitches WHERE game_date >= '2026-01-01';

-- 3. Cross-level event vocabulary (top values, MLB vs MiLB, 2026)
SELECT 'MLB_pitches' AS src, events, count(*) AS n FROM pitches
  WHERE game_date >= '2026-01-01' AND events IS NOT NULL GROUP BY 2
UNION ALL
SELECT 'MiLB_pitches', events, count(*) FROM milb_pitches
  WHERE game_date >= '2026-01-01' AND events IS NOT NULL GROUP BY 2
ORDER BY 1, 3 DESC LIMIT 20;

-- 4. MiLB events casing by season — the finding
SELECT extract(year from game_date)::int AS yr,
       count(*) FILTER (WHERE events IS NOT NULL) AS ev_rows,
       count(*) FILTER (WHERE events ~ '^[A-Z]') AS title_case,
       count(*) FILTER (WHERE events ~ '^[a-z]') AS lower_case,
       round(100.0*count(*) FILTER (WHERE events ~ '^[A-Z]')
             /nullif(count(*) FILTER (WHERE events IS NOT NULL),0),1) AS pct_title
FROM milb_pitches GROUP BY 1 ORDER BY 1;
```

**Result:** (1) `pitches` has **exactly two constraints** — `pitches_pkey` PRIMARY KEY (id) and `pitches_game_pk_at_bat_number_pitch_number_key` UNIQUE (game_pk, at_bat_number, pitch_number) — and **zero CHECK constraints**, despite `stuff_plus` being clamped to [0,200] in three separate SQL strings (`app/api/update/route.ts:322`, `app/api/update/milb/route.ts:499`, `app/api/admin/backfill-stuff-plus/route.ts:124`). (2) 2026 `pitches`: 657,570 rows, 654,833 with `stuff_plus` = **99.58% coverage** (the per-day chunking fix is holding), **0** values outside [0,200], 198 `release_speed` outside 40–110 mph, 2,733 NULL `pitch_type`. (3)+(4) **`milb_pitches.events` now contains two vocabularies at once.** 2023/2024/2025 are **100.0% Title Case** (172,713 / 172,435 / 171,545 rows, zero lowercase); 2026 is **70,266 Title Case / 61,044 lowercase = 53.5% Title**. Both encodings coexist: `field_out` (23,457) alongside `Groundout` (11,209)/`Flyout` (7,684), `Strikeout` (15,824) alongside `strikeout` (13,128), `Single` (10,067) alongside `single` (8,976). Cause: commit `410212b` (2026-06-08) added `EVENT_NORMALIZE_MAP` at `app/api/update/milb/route.ts:244`, normalizing MiLB → MLB vocabulary at ingest, **with no backfill of history** — so the column split along an *ingest-date* seam. **`CLAUDE.md` ("MiLB uses Title Case… normalize in queries") and `Jo/data-quality/06-reconciliation-source-of-truth.md` both now document the wrong rule**: a query matching Title Case or calling `initcap()` silently drops ~46.5% of 2026 MiLB events. Detector proposed in the new doc §5 (`count(DISTINCT events) > count(DISTINCT lower(replace(events,' ','_')))`) would have fired 2026-06-09. Several follow-up queries (monthly seam breakdown) never completed — the Supabase origin returned Cloudflare 520/522 from ~20:13 UTC (same outage logged above), so the exact seam date is unverified.

### CORRECTION — Povich Stuff+ analysis (issued 2026-08-11, corrected same day)

The earlier conclusion "MLB Stuff+ May 100.0 → Aug 97.7 is the defensible MLB-to-MLB comparison"
**is contaminated by the repair run performed that same day**, and was reported with more confidence
than the data supports.

1. **The comparison crosses a rescore seam.** The Jun–Aug repair rescored those rows against
   *then-current* `pitch_baselines`, while Feb–May retained their original within-season vintages.
   Estimated vintage bias ±0.3–0.6 points — roughly **26% of the observed 2.3-point move**. Only a
   Jun→Aug comparison is vintage-clean.
2. **The residual effect is weak.** After a design-effect correction for intra-outing correlation,
   2.3 points is ≈**1.3–2.1 SE** on a 149-pitch, 2-start sample. Suggestive, not conclusive.
3. **What does survive is the mechanical finding.** `stuff_plus` has **no release-position term**,
   so the measured arm-slot change (FF release height 6.05→5.87 ft, release side 1.08→1.29) is
   *independent* evidence rather than a restatement of the same number — as is the pitch-type
   pattern (FF 98.4→95.8 at rising usage; CU and CH improving), which is what a lower slot predicts.

**Revised answer:** the arm-slot drop and its four-seam consequences are well supported. The
headline "Stuff+ fell 2.3 points" is not — it is partly an artifact of the same-day repair and is
within ~2 SE regardless. Report the mechanics, not the composite.

### Baseline vintage drift — MEASURED (settles the open Li hazard)

Compares each row's **stored** `stuff_plus` against what it would be if rescored today against the
**current** `pitch_baselines`. Non-zero drift = the row was scored against an older vintage.

```sql
SELECT p.game_date, count(*) AS n,
       round(avg(p.stuff_plus)::numeric,2) AS stored_avg,
       round(avg(GREATEST(0, LEAST(200, ROUND(
         100 + COALESCE((p.release_speed - b.avg_velo)/NULLIF(b.std_velo,0),0)*4.5
             + COALESCE((SQRT(POWER(p.pfx_x*12,2)+POWER(p.pfx_z*12,2)) - b.avg_movement)
                        /NULLIF(b.std_movement,0),0)*3.5
             + COALESCE((p.release_extension - b.avg_ext)/NULLIF(b.std_ext,0),0)*2.0
       )::numeric)))::numeric,2) AS current_vintage_avg
FROM pitches p JOIN pitch_baselines b
  ON b.pitch_name = p.pitch_name AND b.game_year = p.game_year
WHERE p.game_date IN ('2026-04-15','2026-05-15','2026-06-15','2026-07-15','2026-08-05')
  AND p.stuff_plus IS NOT NULL AND p.release_speed IS NOT NULL
GROUP BY 1 ORDER BY 1;
```

**Result:**

| Date | n | stored | current-vintage | drift |
|---|---|---|---|---|
| 2026-04-15 | 4,330 | 100.50 | 99.91 | **+0.594** |
| 2026-05-15 | 4,337 | 101.18 | 100.89 | **+0.291** |
| 2026-06-15 | 2,788 | 100.87 | 100.87 | **0.000** |
| 2026-08-05 | 4,372 | 100.03 | 100.03 | **0.000** |

(2026-07-15 returned zero rows — no games that date.)

**Conclusions.**
1. **Vintage drift is real, measured, and small.** Feb–May rows carry **+0.29 to +0.59** points of
   upward bias relative to a current-baseline recompute. The magnitude is below the earlier
   *(estimated)* range of 0.6–1.2 and near the ≤0.5-point "forward-only versioning" decision
   threshold — **a full historical rescore is not warranted.**
2. **The rescore seam is confirmed exactly where predicted.** June and August drift is **0.000** to
   three decimals, because those rows were rescored against current baselines on 2026-08-11.
   April and May retain their original vintages.
3. **Refines the Povich correction (logged above).** The May→August comparison is inflated by
   **~0.29 points**, not the ±0.3–0.6 previously estimated as a range — so vintage accounts for
   ~13% of the observed 2.3-point drop, not ~26%. The vintage-adjusted move is ≈**2.0 points**,
   still only ~1.2–1.8 SE on 149 pitches. The earlier correction was directionally right and
   overstated the contamination.
4. **Jo's Apr→Jul league-average decline (100.97 → 100.13) is NOT evidence of vintage drift** — that
   window is confounded by the coverage collapse. This probe is unconfounded because it recomputes
   the same rows both ways.

**Recommendation:** forward-only versioning (stamp `baseline_version`/`scored_at` going forward);
do **not** rescore history — it would erase the only remaining evidence of what the vintages were,
for a ≤0.6-point correction.

## 2026-08-12

Central measurement pass for the Jo/Li/Cas agent-brain build (`.claude/agents/BUILD.md` requires
production numbers be gathered **once**, centrally, and pasted into subagent prompts — subagents
must never query production). All read-only. Two queries timed out and were rewritten.

### Identity / master-data shape of `players`

```sql
SELECT
  count(*) AS players_total,
  count(lahman_id) AS with_lahman_id,
  round(100.0*count(lahman_id)/count(*),2) AS pct_lahman,
  count(team) AS with_team,
  count(position) AS with_position,
  min(id) AS min_id, max(id) AS max_id,
  count(*) FILTER (WHERE name ~ '[^ -~]') AS names_with_non_ascii,
  count(*) FILTER (WHERE name LIKE '%,%') AS names_with_comma,
  count(DISTINCT name) AS distinct_names
FROM players;
```

Result: **16,931 rows** (CLAUDE.md documents 4,017 — stale by ~4×); `lahman_id` on 3,228 (19.07%);
`team` on **0 rows (0%)**; `position` on 10,899 (64.4%); id range 110001–842249; 553 names with
non-ASCII characters; 16,474 names in `"Last, First"` form (so 457 in `"First Last"` form);
16,418 distinct names → **513 duplicate-name collisions**.

### Duplicate-name collisions

```sql
SELECT name, count(*) AS n, array_agg(id ORDER BY id) AS ids
FROM players GROUP BY name HAVING count(*) > 1
ORDER BY count(*) DESC, name LIMIT 25;
```

Result: six four-way collisions — `Gonzalez, Jose` (114931, 467102, 681275, 683681), `Jackson, Alex`,
`Perez, Fernando`, `Vázquez, Christian`, `Williams, Matt`, `Wilson, Jacob`. Confirms `name` is not a
viable natural key.

### Non-comma name format sample

```sql
SELECT name FROM players WHERE name NOT LIKE '%,%' ORDER BY id LIMIT 20;
```

Result: MiLB-style `"First Last"` entries (`Mel Rojas Jr.`, `C.J. Hinojosa`, `Santiago Chávez`, …) —
two name formats coexist in one column.

### Table sizes and planner-statistics freshness

```sql
SELECT c.relname, c.reltuples::bigint AS est_rows, c.relpages,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
       s.last_analyze, s.last_autoanalyze
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
WHERE n.nspname='public' AND c.relkind='r'
  AND c.relname IN ('pitches','milb_pitches','players','compete_pitches','player_season_stats',
                    'pitch_baselines','league_averages','pitcher_season_command','pitcher_season_deception')
ORDER BY c.reltuples DESC;
```

Result: `pitches` 8,877,621 rows / 9,711 MB / 623,662 pages; `milb_pitches` 2,508,422 / 2,366 MB;
`player_season_stats` 79,061; `pitcher_season_command` 27,119; `pitcher_season_deception` 17,386;
`players` 16,887; `league_averages` 1,806; `compete_pitches` 443; `pitch_baselines` 206.
**`last_analyze` and `last_autoanalyze` are NULL on every one of these tables** — planner statistics
have apparently never been refreshed. (`pg_stat_user_tables.n_live_tup` was correspondingly garbage:
it reported 3,001 rows for `pitches`. Use `reltuples`, not `n_live_tup`, on this database.)

### Date ranges (index-friendly form)

```sql
SELECT
  (SELECT game_date FROM pitches ORDER BY game_date ASC LIMIT 1) AS min_date,
  (SELECT game_date FROM pitches ORDER BY game_date DESC LIMIT 1) AS max_date,
  (SELECT game_date FROM milb_pitches ORDER BY game_date ASC LIMIT 1) AS milb_min,
  (SELECT game_date FROM milb_pitches ORDER BY game_date DESC LIMIT 1) AS milb_max;
```

Result: `pitches` 2015-03-03 → 2026-08-10; `milb_pitches` 2023-03-31 → 2026-08-11. MLB trailing edge
was 2 days behind MiLB on the observation date. Note the 2015-03-03 start is spring training, so
`game_type` filtering is load-bearing from the first row.

**Timed out (8s):** the aggregate form `SELECT min(game_date), max(game_date), count(DISTINCT game_year),
count(DISTINCT game_type) FROM pitches` — `count(DISTINCT …)` forces a full scan of 623,662 pages.
The four-subquery form above returns instantly off the index.

### Orphan / referential-integrity rate

```sql
WITH ids AS (
  SELECT DISTINCT pitcher AS pid FROM pitches WHERE game_date >= '2026-08-01'
)
SELECT count(*) AS distinct_pitchers_aug2026,
       count(*) FILTER (WHERE pl.id IS NULL) AS orphans
FROM ids LEFT JOIN players pl ON pl.id = ids.pid;
```

(and the same shape against `milb_pitches.batter`)

Result: **0 orphans** — 453 distinct MLB pitchers and 444 distinct MiLB batters in Aug 2026 all
resolve to `players.id`. The ingest does backfill `players`.

**Timed out (8s):** the same check written with `NOT IN (SELECT id FROM players)` over a full-2026
window. `LEFT JOIN … WHERE IS NULL` over a one-month window returns fine; `NOT IN` against a
16.9k-row subquery does not.

### Facility-athlete linkage (`compete_pitches`)

```sql
SELECT count(*) AS rows_compete,
  count(athlete_profile_id) AS with_athlete_profile,
  count(tm_pitcher_id) AS with_tm_pitcher_id,
  count(DISTINCT pitcher_name) AS distinct_pitcher_names,
  count(DISTINCT tm_pitcher_id) AS distinct_tm_ids,
  count(DISTINCT athlete_profile_id) AS distinct_athletes,
  min(pitch_date) AS min_date, max(pitch_date) AS max_date
FROM compete_pitches;
```

Result: 443 rows, 6 distinct pitchers, **all 443 carry `tm_pitcher_id`, 0 carry `athlete_profile_id`**
— TrackMan data is 100% unlinked to canonical players. Single session date 2026-04-13.

## 2026-08-14

Research App integrity & accuracy audit — **central measurement pass** (scope:
`docs/research-app-audit-scope.md` §5). Read-only, run sequentially via the Supabase MCP by the main
session only; no subagent touched the database. Results become the briefing packet for Jo and Li.

### 1. Table sizes and planner-statistics state

```sql
SELECT relname, to_char(reltuples::numeric,'FM999,999,999') AS approx_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
       (SELECT last_analyze FROM pg_stat_user_tables s WHERE s.relid=c.oid) AS last_analyze,
       (SELECT last_autoanalyze FROM pg_stat_user_tables s WHERE s.relid=c.oid) AS last_autoanalyze
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND relname IN ('pitches','milb_pitches','players','player_season_stats',
  'pitch_baselines','league_averages','league_percentiles','pitcher_season_command',
  'pitcher_season_deception','glossary','filter_templates')
ORDER BY pg_total_relation_size(c.oid) DESC;
```

Result: `pitches` 8,877,620 rows / 9,716 MB; `milb_pitches` 2,508,420 / 2,367 MB; `player_season_stats`
79,061; `pitcher_season_command` 27,119; `pitcher_season_deception` 17,399; `players` 16,887;
`league_averages` 1,806; `league_percentiles` 216; `pitch_baselines` 206. **`last_analyze` is NULL on
all 11**; the only `last_autoanalyze` anywhere is `pitcher_season_deception` (2026-08-13).
`filter_templates.reltuples = -1` (never analyzed, count unknown).

### 2. Refresh-function timeout config — is the P0 still live?

```sql
SELECT p.proname, p.proconfig, l.lanname, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
WHERE n.nspname='public' AND p.proname IN ('refresh_materialized_views','refresh_league_averages',
  'refresh_league_percentiles','run_query','run_query_long','run_mutation');
```

Result: **P0 unchanged.** All three refresh functions still have `proconfig = NULL` and
`prosecdef = false`. `run_query_long` carries `statement_timeout=120s`; `run_query`/`run_mutation`
carry only `search_path`.

### 3. Derived-table staleness

```sql
SELECT 'league_averages' AS tbl, max(updated_at), min(updated_at),
       round(extract(epoch from (now()-max(updated_at)))/86400.0,1) AS days_stale, count(*) FROM league_averages
UNION ALL SELECT 'league_percentiles', max(updated_at), min(updated_at), round(...), count(*) FROM league_percentiles
UNION ALL SELECT 'player_season_stats', ... FROM player_season_stats
UNION ALL SELECT 'players', ... FROM players;
```

Result: `league_averages` **49.0 days stale** (newest 2026-06-26), `league_percentiles` **72.1 days**
(2026-06-03, all 216 rows one timestamp), `player_season_stats` 1.4 days, `players` 2.5 days. Both
stale figures are exactly +3 days on the 2026-08-11 measurement — the chain has done nothing since.

Also: `pitch_baselines`, `pitcher_season_command`, `pitcher_season_deception` have **no timestamp
column at all** (`information_schema.columns`), so their staleness is not directly measurable.

### 4. Materialized views

```sql
SELECT m.matviewname, m.ispopulated, pg_size_pretty(pg_total_relation_size(c.oid)),
       s.n_live_tup, s.last_analyze, s.last_autoanalyze, s.last_vacuum, s.last_autovacuum
FROM pg_matviews m JOIN pg_class c ON c.relname=m.matviewname
JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=m.schemaname
LEFT JOIN pg_stat_all_tables s ON s.relid=c.oid WHERE m.schemaname='public';
```

Result: **10 matviews, not the 6 previously recorded** — `batter_summary`, `milb_batter_summary`,
`milb_player_summary`, `mv_batter_season_stats`, `mv_pitcher_pitch_stats`, `mv_team_batting_stats`,
`mv_team_bullpen_stats`, `mv_team_pitching_stats`, `mv_team_platoon_stats`, `retro_id_map`. All
populated. Only `batter_summary` shows recent activity (autovacuum 2026-08-14 10:04). `pg_stat_file`
is permission-denied, so true last-refresh time is not obtainable this way.

### 5. Ingest lag, last 14 days

```sql
SELECT 'pitches' AS tbl, game_date, count(*) FROM pitches WHERE game_date >= current_date-14 GROUP BY game_date
UNION ALL SELECT 'milb_pitches', game_date, count(*) FROM milb_pitches WHERE game_date >= current_date-14 GROUP BY game_date
ORDER BY tbl, game_date DESC;
```

Result: `pitches` max `game_date` = **2026-08-11** (3 days behind); 08-12 and 08-13 absent.
`milb_pitches` max = **2026-08-12**. MiLB gaps on 08-03 and 08-10 are Mondays (league-wide off day),
not defects.

### 6. Stuff+ and input coverage by month, 2026

```sql
SELECT date_trunc('month', game_date)::date AS month, count(*),
       count(stuff_plus), round(100.0*count(stuff_plus)/count(*),1) AS stuff_plus_pct,
       round(100.0*count(release_speed)/count(*),1), round(100.0*count(pfx_x)/count(*),1),
       round(100.0*count(pitch_name)/count(*),1), round(100.0*count(stand)/count(*),1)
FROM pitches WHERE game_date >= '2026-01-01' GROUP BY 1 ORDER BY 1;
```

Result: Feb–Jul all **99.2–99.7%** `stuff_plus`. **August drops to 83.2%.** Inputs are unaffected
(velo/pfx_x/pitch_name 99.6%, `stand` 100%). Note `stuff_plus_n` **does not exist** on `pitches`,
contrary to a claim in `Li/metric-governance/04`.

### 7. Locating the August drop

```sql
SELECT game_date, count(*), count(stuff_plus),
       round(100.0*count(stuff_plus)/count(*),1) AS pct
FROM pitches WHERE game_date >= '2026-07-25' GROUP BY game_date ORDER BY game_date;
```

Result: **not a decay — a hard stop.** Every day through 2026-08-09 is 99.2–99.9%; **2026-08-10 and
2026-08-11 are 0.0%** (0 of 3,001 and 0 of 4,236). The two most recent ingested days are entirely
unscored.

### 8. Cron outcomes, last 30 days

```sql
SELECT job, status, count(*) AS runs, max(started_at) AS last_run
FROM cron_runs WHERE started_at >= now()-interval '30 days' GROUP BY job, status ORDER BY job, status;
```

Result: `refresh` logged **success 29/29** while `league_averages` sat 49 days stale — the dead-man
switch reports green on a chain doing nothing. `pitches` logged success on 2026-08-13 09:01 yet
ingested no 08-12 data. `roster` is the only job with any errors (2 error / 57 success). **Only 9
distinct jobs appear in `cron_runs`** against 17 crons on disk — 8 write no run record at all.

### 9. `refresh_league_averages` source

```sql
SELECT substring(prosrc from 1 for 3000) FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='refresh_league_averages';
```

Result: confirms `AVG(...)` throughout — **a mean, documented as a 50th percentile**. Also reveals
hardcoded per-season constants (`v_cfip`, `v_lg_era`, `v_lg_woba`, `v_woba_scale`, `v_lg_hr_fb`) with
cases only for **2015–2024**; 2025 and 2026 fall through to an `ELSE` branch (3.135 / 4.10 / 0.313 /
1.232 / 0.110). Confirms `DELETE FROM league_averages WHERE season = p_season` then re-INSERT (no
history). MiLB rows get `NULL` for arm_angle / attack_angle / attack_direction / swing_tilt / xSLG.

### 10. MiLB `events` casing split

```sql
SELECT game_year, count(*) FILTER (WHERE events IS NOT NULL) AS events_rows,
       count(*) FILTER (WHERE events ~ '^[A-Z]') AS title_case,
       count(*) FILTER (WHERE events ~ '^[a-z]') AS lower_case,
       round(100.0*count(*) FILTER (WHERE events ~ '^[A-Z]')/nullif(count(*) FILTER (WHERE events IS NOT NULL),0),1)
FROM milb_pitches WHERE game_year >= 2025 GROUP BY game_year ORDER BY game_year;
```

Result: 2025 = **100.0% Title Case** (171,545 rows). 2026 = **52.6% Title / 47.4% lowercase**
(70,266 / 63,275). Drifting from the 53.5/46.5 measured 2026-08-11. Matching `'Strikeout'` drops
47.4% of 2026; matching `'strikeout'` drops all of 2025 and 52.6% of 2026.

### 11. `players` key quality

```sql
SELECT count(*), count(*) FILTER (WHERE name LIKE '%,%') AS last_first,
       count(*) FILTER (WHERE name NOT LIKE '%,%') AS first_last,
       count(team), count(lahman_id), count(position),
       (SELECT count(*) FROM (SELECT name FROM players GROUP BY name HAVING count(*)>1) d) AS dup_names,
       (SELECT sum(c) FROM (SELECT count(*) c FROM players GROUP BY name HAVING count(*)>1) d2) AS rows_with_dup_name
FROM players;
```

Result: 16,931 rows. `team` **0 filled**. `lahman_id` 3,228 (19.1%). `position` 10,899 (64.4% — 6,032
null). Name forms: 16,474 `"Last, First"` vs 457 `"First Last"`. **459 duplicate names covering 972
rows** (previously recorded as 513 — re-measured).

### 12. Is stored `stuff_plus` centered?

```sql
SELECT game_year, pitch_name, count(*), round(avg(stuff_plus)::numeric,1),
       round(stddev_samp(stuff_plus)::numeric,1),
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY stuff_plus)::numeric,1)
FROM pitches WHERE game_year IN (2024,2026) AND stuff_plus IS NOT NULL
  AND pitch_name IN ('4-Seam Fastball','Slider','Changeup','Curveball','Sinker','Cutter','Sweeper')
GROUP BY game_year, pitch_name ORDER BY pitch_name, game_year;
```

Result: 2024 means are **exactly 100.0** on all seven pitch types. 2026 means run **100.3–100.6** —
the in-season baseline-vintage drift, small but systematic and in one direction. Pitch-level SD is
5.0–7.0.

### 13. Stuff+ coverage by season — the big one

```sql
SELECT game_year, count(*), min(game_date), max(game_date), count(DISTINCT game_date) AS days,
       round(100.0*count(stuff_plus)/count(*),1) AS stuff_plus_pct
FROM pitches GROUP BY game_year ORDER BY game_year;
```

Result: coverage is **not comparable across seasons** — 2015 44.4%, 2016 44.2%, 2017 43.9%, 2018
45.5%, 2019 90.2%, 2020 84.7%, 2021 89.6%, 2022 94.9%, 2023 87.8%, 2024 87.6%, 2025 85.8%, 2026 98.5%.

### 14. Is the low early-era coverage an input problem?

```sql
SELECT game_year, round(100.0*count(release_speed)/count(*),1) AS velo,
       round(100.0*count(pfx_x)/count(*),1), round(100.0*count(release_spin_rate)/count(*),1),
       round(100.0*count(release_extension)/count(*),1), round(100.0*count(spin_axis)/count(*),1),
       round(100.0*count(pitch_name)/count(*),1), round(100.0*count(stuff_plus)/count(*),1)
FROM pitches WHERE game_year BETWEEN 2015 AND 2020 GROUP BY game_year ORDER BY game_year;
```

Result: **no.** 2016–2018 carry velo/pfx_x/pitch_name at 90–94%, spin at 84–90%, `spin_axis` at
90–92% — yet `stuff_plus` is ~44%. Only 2015 has a genuine input gap (`spin_axis` **0.0%**). So for
2016–2018, roughly half the pitches are unscored **despite having complete inputs**.

### Slice A verification (same day, after Jo's findings)

**O1 — did the 2026-08-14 ingest run, and has 08-12 landed?**

```sql
SELECT (SELECT max(game_date) FROM pitches WHERE game_year=2026) AS max_pitch_date,
       (SELECT count(*) FROM pitches WHERE game_date='2026-08-12') AS d0812,
       (SELECT count(*) FROM pitches WHERE game_date='2026-08-13') AS d0813,
       (SELECT max(started_at) FROM cron_runs WHERE job='pitches') AS last_pitches_run,
       (SELECT counts FROM cron_runs WHERE job='pitches' ORDER BY started_at DESC LIMIT 1) AS last_counts,
       (SELECT counts FROM cron_runs WHERE job='refresh' ORDER BY started_at DESC LIMIT 1) AS last_refresh_counts;
```

Result: **A1 confirmed live.** `max_pitch_date = 2026-08-11`, 08-12 and 08-13 both **0**. Last
`pitches` run **2026-08-13 09:01** — the 2026-08-14 09:00 UTC invocation never happened, while
`wbc` ran 08:31 and `integrity` 10:01 the same morning. Last run inserted 7,237 = exactly
08-10 (3,001) + 08-11 (4,236), corroborating that Savant had no 08-12 rows at that time.

**Smoking gun for the P0 refresh chain**, from the same row — `cron_runs.counts` for `refresh`:
```json
{"leagueAverages":     {"error":"canceling statement due to statement timeout"},
 "leaguePercentiles":  {"error":"canceling statement due to statement timeout"},
 "materializedViews":  {"error":"canceling statement due to statement timeout"}}
```
The timeout is **caught, serialized, and persisted** — and `trackCronRun` still recorded
`status='success'`. This is stronger evidence than the `proconfig = NULL` inference.

**O2 — does the natural key exist?**

```sql
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE tablename IN ('pitches','milb_pitches') AND indexdef ILIKE '%at_bat_number%';
```

Result: both exist as **UNIQUE** — `pitches_game_pk_at_bat_number_pitch_number_key` and
`milb_pitches_game_pk_at_bat_number_pitch_number_key`. The `_key` suffix means they were created as
table constraints, from DDL that is **not in the repo**. Upgrades A8 from `inferred` to `measured`.

**O3 — MiLB Stuff+ coverage**

```sql
SELECT game_year, count(*) AS n, count(stuff_plus) AS scored,
       round(100.0*count(stuff_plus)/count(*),1) AS pct
FROM milb_pitches GROUP BY game_year ORDER BY game_year;

SELECT game_date, count(*) AS n, count(stuff_plus) AS scored,
       round(100.0*count(stuff_plus)/count(*),1) AS pct
FROM milb_pitches WHERE game_date >= '2026-08-01' GROUP BY game_date ORDER BY game_date;
```

Result: **A5 confirmed.** 2023 99.9% · 2024 100.0% · 2025 99.9% · **2026 96.2%**. Day level exposes
the mechanism: 08-01, 08-02, 08-04, 08-05 at 100%, then **08-06, 08-07, 08-08 at 0.0%** (13,702
pitches unscored), then 08-09, 08-11, 08-12 back at ~100%. Intermittent whole-window failure of the
single un-chunked `UPDATE`, swallowed by `console.error` — the MLB outage's exact pattern, still live
on the MiLB path.

**Baselines are not the cause of the low 2015–2018 MLB coverage**

```sql
SELECT game_year, count(*) AS baseline_rows, sum(pitch_count) AS total_pitch_count,
       count(*) FILTER (WHERE std_velo IS NULL OR std_velo = 0) AS bad_std_velo
FROM pitch_baselines GROUP BY game_year ORDER BY game_year;
```

Result: every season 2015–2026 has 16–19 baseline rows. 2015 baselines were built from 687,073
pitches against 747,843 rows in `pitches` (92%), yet only **44.4%** of 2015 carries `stuff_plus`. So
neither missing baselines nor missing inputs explains it — the historical scoring backfill appears
never to have completed for 2015–2018. **Hand to Slice D.** Three rows have `std_velo` NULL-or-zero
(2016, 2021, 2026); `NULLIF(std_velo,0)` → NULL → `COALESCE(...,0)` means those pitch types score a
flat 100 on the velocity term.
