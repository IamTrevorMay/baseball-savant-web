-- refresh_league_averages(p_season)
-- Populates league_averages for one season across both MLB and MiLB, for roles
-- hitter / SP / RP. Qualification is 20% of the role's counting-stat leader,
-- with a hard floor of 25 AB (hitters) or 5 IP (pitchers). SP vs RP is
-- determined by pitch-count-per-game: a pitcher is SP if they have >= 3 games
-- with 50+ pitches thrown (excluding pitch_type PO/IN). Mirrors the convention
-- in app/api/scene-stats/route.ts.
--
-- Scope (Phase 1): metrics directly derivable from pitches / milb_pitches.
-- Excludes anything ending in `_plus`, counting stats, and metrics sourced from
-- other tables (Triton raw command, deception scores, ERA estimators) — those
-- will be added in a follow-up.
--
-- milb_pitches differences handled here:
--   1. Missing columns: arm_angle, attack_angle, attack_direction,
--      swing_path_tilt, estimated_slg_using_speedangle → substituted with
--      NULL::numeric; corresponding metrics drop via WHERE m.val IS NOT NULL.
--   2. `events` column uses Title Case values ('Strikeout', 'Groundout',
--      'Home Run', etc.) vs MLB's lowercase ('strikeout', 'field_out'). A
--      CTE-level CASE normalizes to MLB vocabulary so downstream filters work
--      against a single canonical set. MLB rows pass through unchanged via
--      ELSE events.

CREATE OR REPLACE FUNCTION refresh_league_averages(p_season integer)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_level text;
  v_table text;
  v_start date;
  v_end   date;
  e_arm_angle       text;
  e_attack_angle    text;
  e_attack_dir      text;
  e_swing_tilt      text;
  e_xslg            text;
  e_ideal_aa_rate   text;
  -- Season constants for ERA estimators (mirrors lib/constants-data.ts).
  -- 2026 falls back to 2025 values (matches getConstants() in expected-stats.ts).
  v_cfip       numeric;
  v_lg_era     numeric;
  v_lg_woba    numeric;
  v_woba_scale numeric;
  v_lg_hr_fb   numeric;
BEGIN
  v_start := make_date(p_season, 1, 1);
  v_end   := make_date(p_season + 1, 1, 1);
  DELETE FROM league_averages WHERE season = p_season;

  CASE p_season
    WHEN 2015 THEN v_cfip := 3.134; v_lg_era := 3.96; v_lg_woba := 0.313; v_woba_scale := 1.251; v_lg_hr_fb := 0.114;
    WHEN 2016 THEN v_cfip := 3.147; v_lg_era := 4.18; v_lg_woba := 0.318; v_woba_scale := 1.212; v_lg_hr_fb := 0.128;
    WHEN 2017 THEN v_cfip := 3.158; v_lg_era := 4.36; v_lg_woba := 0.321; v_woba_scale := 1.185; v_lg_hr_fb := 0.137;
    WHEN 2018 THEN v_cfip := 3.160; v_lg_era := 4.15; v_lg_woba := 0.315; v_woba_scale := 1.226; v_lg_hr_fb := 0.122;
    WHEN 2019 THEN v_cfip := 3.214; v_lg_era := 4.51; v_lg_woba := 0.320; v_woba_scale := 1.157; v_lg_hr_fb := 0.153;
    WHEN 2020 THEN v_cfip := 3.191; v_lg_era := 4.44; v_lg_woba := 0.320; v_woba_scale := 1.185; v_lg_hr_fb := 0.146;
    WHEN 2021 THEN v_cfip := 3.170; v_lg_era := 4.26; v_lg_woba := 0.314; v_woba_scale := 1.209; v_lg_hr_fb := 0.136;
    WHEN 2022 THEN v_cfip := 3.112; v_lg_era := 3.97; v_lg_woba := 0.310; v_woba_scale := 1.259; v_lg_hr_fb := 0.110;
    WHEN 2023 THEN v_cfip := 3.255; v_lg_era := 4.33; v_lg_woba := 0.318; v_woba_scale := 1.204; v_lg_hr_fb := 0.114;
    WHEN 2024 THEN v_cfip := 3.166; v_lg_era := 4.01; v_lg_woba := 0.310; v_woba_scale := 1.242; v_lg_hr_fb := 0.105;
    ELSE           v_cfip := 3.135; v_lg_era := 4.10; v_lg_woba := 0.313; v_woba_scale := 1.232; v_lg_hr_fb := 0.110; -- 2025 / future fallback
  END CASE;

  FOR v_level, v_table IN
    SELECT * FROM (VALUES ('MLB','pitches'),('MiLB','milb_pitches')) t(level, tbl)
  LOOP
    IF v_level = 'MLB' THEN
      e_arm_angle    := 'AVG(arm_angle)';
      e_attack_angle := 'AVG(attack_angle)';
      e_attack_dir   := 'AVG(attack_direction)';
      e_swing_tilt   := 'AVG(swing_path_tilt)';
      e_xslg         := 'AVG(estimated_slg_using_speedangle)';
      e_ideal_aa_rate := '100.0 * COUNT(*) FILTER (WHERE attack_angle BETWEEN 5 AND 20) '
                      || '/ NULLIF(COUNT(*) FILTER (WHERE attack_angle IS NOT NULL), 0)';
    ELSE
      e_arm_angle     := 'NULL::numeric';
      e_attack_angle  := 'NULL::numeric';
      e_attack_dir    := 'NULL::numeric';
      e_swing_tilt    := 'NULL::numeric';
      e_xslg          := 'NULL::numeric';
      e_ideal_aa_rate := 'NULL::numeric';
    END IF;

    -- ═════════════════════════════════════════════════════════════════════
    -- HITTER BLOCK — group by batter, qualify on AB
    -- ═════════════════════════════════════════════════════════════════════
    EXECUTE format($sql$
      WITH src AS (
        SELECT *,
          CASE events
            WHEN 'Strikeout'              THEN 'strikeout'
            WHEN 'Strikeout Double Play'  THEN 'strikeout_double_play'
            WHEN 'Walk'                   THEN 'walk'
            WHEN 'Hit By Pitch'           THEN 'hit_by_pitch'
            WHEN 'Groundout'              THEN 'field_out'
            WHEN 'Flyout'                 THEN 'field_out'
            WHEN 'Lineout'                THEN 'field_out'
            WHEN 'Pop Out'                THEN 'field_out'
            WHEN 'Bunt Groundout'         THEN 'field_out'
            WHEN 'Bunt Pop Out'           THEN 'field_out'
            WHEN 'Bunt Lineout'           THEN 'field_out'
            WHEN 'Double Play'            THEN 'double_play'
            WHEN 'Grounded Into DP'       THEN 'grounded_into_double_play'
            WHEN 'Forceout'               THEN 'force_out'
            WHEN 'Fielders Choice'        THEN 'fielders_choice'
            WHEN 'Fielders Choice Out'    THEN 'fielders_choice_out'
            WHEN 'Sac Fly'                THEN 'sac_fly'
            WHEN 'Sac Bunt'               THEN 'sac_bunt'
            WHEN 'Sac Fly Double Play'    THEN 'sac_fly_double_play'
            WHEN 'Triple Play'            THEN 'triple_play'
            WHEN 'Single'                 THEN 'single'
            WHEN 'Double'                 THEN 'double'
            WHEN 'Triple'                 THEN 'triple'
            WHEN 'Home Run'               THEN 'home_run'
            WHEN 'Catcher Interference'   THEN 'catcher_interf'
            ELSE events
          END AS events_n
        FROM %I
        WHERE game_date >= %L AND game_date < %L
      ),
      per_hitter AS (
        SELECT batter AS pid,
          COUNT(*) FILTER (
            WHERE events_n IS NOT NULL
              AND events_n NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')
          ) AS _ab,
          AVG(launch_speed)       AS avg_ev,
          MAX(launch_speed)       AS max_ev,
          AVG(launch_angle)       AS avg_la,
          AVG(hit_distance_sc)    AS avg_dist,
          AVG(bat_speed)          AS avg_bat_speed,
          AVG(swing_length)       AS avg_swing_length,
          %s                      AS avg_attack_angle,
          %s                      AS avg_attack_direction,
          %s                      AS avg_swing_path_tilt,
          100.0 * COUNT(*) FILTER (WHERE events_n IN ('strikeout','strikeout_double_play'))
            / NULLIF(COUNT(DISTINCT CASE WHEN events_n IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0) AS k_pct,
          100.0 * COUNT(*) FILTER (WHERE events_n = 'walk')
            / NULLIF(COUNT(DISTINCT CASE WHEN events_n IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0) AS bb_pct,
          100.0 * (COUNT(*) FILTER (WHERE events_n IN ('strikeout','strikeout_double_play')) - COUNT(*) FILTER (WHERE events_n = 'walk'))
            / NULLIF(COUNT(DISTINCT CASE WHEN events_n IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0) AS k_minus_bb,
          100.0 * COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','missed_bunt'))
            / NULLIF(COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','bunt_foul_tip','hit_into_play','missed_bunt')), 0) AS whiff_pct,
          100.0 * COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked'))
            / NULLIF(COUNT(*), 0) AS swstr_pct,
          100.0 * COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','called_strike'))
            / NULLIF(COUNT(*), 0) AS csw_pct,
          100.0 * COUNT(*) FILTER (WHERE zone > 9 AND description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','bunt_foul_tip','hit_into_play','missed_bunt'))
            / NULLIF(COUNT(*) FILTER (WHERE zone > 9), 0) AS chase_pct,
          100.0 * COUNT(*) FILTER (WHERE description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip'))
            / NULLIF(COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip','missed_bunt')), 0) AS contact_pct,
          100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9 AND description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','bunt_foul_tip','hit_into_play','missed_bunt'))
            / NULLIF(COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9), 0) AS z_swing_pct,
          100.0 * COUNT(*) FILTER (WHERE zone > 9 AND description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip'))
            / NULLIF(COUNT(*) FILTER (WHERE zone > 9 AND description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip','missed_bunt')), 0) AS o_contact_pct,
          100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95)
            / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0) AS hard_hit_pct,
          100.0 * COUNT(*) FILTER (WHERE launch_speed_angle::text = '6')
            / NULLIF(COUNT(*) FILTER (WHERE launch_speed_angle IS NOT NULL), 0) AS barrel_pct,
          100.0 * COUNT(*) FILTER (WHERE bat_speed >= 75)
            / NULLIF(COUNT(*) FILTER (WHERE bat_speed IS NOT NULL), 0) AS fast_swing_rate,
          100.0 * COUNT(*) FILTER (WHERE launch_speed >= 0.8 * (1.23 * bat_speed + 0.23 * release_speed) AND bat_speed IS NOT NULL AND launch_speed IS NOT NULL)
            / NULLIF(COUNT(*) FILTER (WHERE bat_speed IS NOT NULL AND launch_speed IS NOT NULL), 0) AS squared_up_rate,
          100.0 * COUNT(*) FILTER (WHERE launch_speed >= 0.8 * (1.23 * bat_speed + 0.23 * release_speed) AND bat_speed >= 75 AND bat_speed IS NOT NULL AND launch_speed IS NOT NULL)
            / NULLIF(COUNT(*) FILTER (WHERE bat_speed IS NOT NULL AND launch_speed IS NOT NULL), 0) AS blast_rate,
          %s AS ideal_attack_angle_rate,
          100.0 * COUNT(*) FILTER (WHERE bb_type = 'ground_ball')
            / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS gb_pct,
          100.0 * COUNT(*) FILTER (WHERE bb_type = 'fly_ball')
            / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS fb_pct,
          100.0 * COUNT(*) FILTER (WHERE bb_type = 'line_drive')
            / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS ld_pct,
          100.0 * COUNT(*) FILTER (WHERE bb_type = 'popup')
            / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS pu_pct,
          COUNT(*) FILTER (WHERE events_n IN ('single','double','triple','home_run'))::numeric
            / NULLIF(COUNT(*) FILTER (WHERE events_n IS NOT NULL AND events_n NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0) AS ba,
          (COUNT(*) FILTER (WHERE events_n = 'single') + 2 * COUNT(*) FILTER (WHERE events_n = 'double') + 3 * COUNT(*) FILTER (WHERE events_n = 'triple') + 4 * COUNT(*) FILTER (WHERE events_n = 'home_run'))::numeric
            / NULLIF(COUNT(*) FILTER (WHERE events_n IS NOT NULL AND events_n NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0) AS slg,
          COUNT(*) FILTER (WHERE events_n IN ('single','double','triple','home_run','walk','hit_by_pitch'))::numeric
            / NULLIF(COUNT(DISTINCT CASE WHEN events_n IS NOT NULL AND events_n NOT IN ('sac_bunt','catcher_interf') THEN game_pk::bigint * 10000 + at_bat_number END), 0) AS obp,
          AVG(estimated_ba_using_speedangle)    AS avg_xba,
          AVG(estimated_woba_using_speedangle)  AS avg_xwoba,
          %s                                    AS avg_xslg,
          AVG(woba_value)                       AS avg_woba
        FROM src
        WHERE batter IS NOT NULL
        GROUP BY batter
      ),
      lead_ab  AS (SELECT MAX(_ab) AS v FROM per_hitter),
      floor_ab AS (SELECT GREATEST(25.0, 0.20 * COALESCE(v,0)) AS v FROM lead_ab),
      qualified AS (
        SELECT h.*, h.slg + h.obp AS ops
        FROM per_hitter h
        WHERE h._ab >= (SELECT v FROM floor_ab)
      ),
      agg AS (
        SELECT
          COUNT(*) AS n,
          AVG(avg_ev) AS avg_ev,                             STDDEV_SAMP(avg_ev) AS avg_ev_std,
          AVG(max_ev) AS max_ev,                             STDDEV_SAMP(max_ev) AS max_ev_std,
          AVG(avg_la) AS avg_la,                             STDDEV_SAMP(avg_la) AS avg_la_std,
          AVG(avg_dist) AS avg_dist,                         STDDEV_SAMP(avg_dist) AS avg_dist_std,
          AVG(avg_bat_speed) AS avg_bat_speed,               STDDEV_SAMP(avg_bat_speed) AS avg_bat_speed_std,
          AVG(avg_swing_length) AS avg_swing_length,         STDDEV_SAMP(avg_swing_length) AS avg_swing_length_std,
          AVG(avg_attack_angle) AS avg_attack_angle,         STDDEV_SAMP(avg_attack_angle) AS avg_attack_angle_std,
          AVG(avg_attack_direction) AS avg_attack_direction, STDDEV_SAMP(avg_attack_direction) AS avg_attack_direction_std,
          AVG(avg_swing_path_tilt) AS avg_swing_path_tilt,   STDDEV_SAMP(avg_swing_path_tilt) AS avg_swing_path_tilt_std,
          AVG(k_pct) AS k_pct,                               STDDEV_SAMP(k_pct) AS k_pct_std,
          AVG(bb_pct) AS bb_pct,                             STDDEV_SAMP(bb_pct) AS bb_pct_std,
          AVG(k_minus_bb) AS k_minus_bb,                     STDDEV_SAMP(k_minus_bb) AS k_minus_bb_std,
          AVG(whiff_pct) AS whiff_pct,                       STDDEV_SAMP(whiff_pct) AS whiff_pct_std,
          AVG(swstr_pct) AS swstr_pct,                       STDDEV_SAMP(swstr_pct) AS swstr_pct_std,
          AVG(csw_pct) AS csw_pct,                           STDDEV_SAMP(csw_pct) AS csw_pct_std,
          AVG(chase_pct) AS chase_pct,                       STDDEV_SAMP(chase_pct) AS chase_pct_std,
          AVG(contact_pct) AS contact_pct,                   STDDEV_SAMP(contact_pct) AS contact_pct_std,
          AVG(z_swing_pct) AS z_swing_pct,                   STDDEV_SAMP(z_swing_pct) AS z_swing_pct_std,
          AVG(o_contact_pct) AS o_contact_pct,               STDDEV_SAMP(o_contact_pct) AS o_contact_pct_std,
          AVG(hard_hit_pct) AS hard_hit_pct,                 STDDEV_SAMP(hard_hit_pct) AS hard_hit_pct_std,
          AVG(barrel_pct) AS barrel_pct,                     STDDEV_SAMP(barrel_pct) AS barrel_pct_std,
          AVG(fast_swing_rate) AS fast_swing_rate,           STDDEV_SAMP(fast_swing_rate) AS fast_swing_rate_std,
          AVG(squared_up_rate) AS squared_up_rate,           STDDEV_SAMP(squared_up_rate) AS squared_up_rate_std,
          AVG(blast_rate) AS blast_rate,                     STDDEV_SAMP(blast_rate) AS blast_rate_std,
          AVG(ideal_attack_angle_rate) AS ideal_attack_angle_rate, STDDEV_SAMP(ideal_attack_angle_rate) AS ideal_attack_angle_rate_std,
          AVG(gb_pct) AS gb_pct,                             STDDEV_SAMP(gb_pct) AS gb_pct_std,
          AVG(fb_pct) AS fb_pct,                             STDDEV_SAMP(fb_pct) AS fb_pct_std,
          AVG(ld_pct) AS ld_pct,                             STDDEV_SAMP(ld_pct) AS ld_pct_std,
          AVG(pu_pct) AS pu_pct,                             STDDEV_SAMP(pu_pct) AS pu_pct_std,
          AVG(ba) AS ba,                                     STDDEV_SAMP(ba) AS ba_std,
          AVG(obp) AS obp,                                   STDDEV_SAMP(obp) AS obp_std,
          AVG(slg) AS slg,                                   STDDEV_SAMP(slg) AS slg_std,
          AVG(ops) AS ops,                                   STDDEV_SAMP(ops) AS ops_std,
          AVG(avg_xba) AS avg_xba,                           STDDEV_SAMP(avg_xba) AS avg_xba_std,
          AVG(avg_xwoba) AS avg_xwoba,                       STDDEV_SAMP(avg_xwoba) AS avg_xwoba_std,
          AVG(avg_xslg) AS avg_xslg,                         STDDEV_SAMP(avg_xslg) AS avg_xslg_std,
          AVG(avg_woba) AS avg_woba,                         STDDEV_SAMP(avg_woba) AS avg_woba_std
        FROM qualified
      )
      INSERT INTO league_averages (season, level, role, metric, value, stddev, n_qualified, leader_value, qual_floor, updated_at)
      SELECT %L, %L, 'hitter', m.metric, m.val, m.val_std,
             a.n, (SELECT v FROM lead_ab), (SELECT v FROM floor_ab), now()
      FROM agg a
      CROSS JOIN LATERAL (VALUES
        ('avg_ev', a.avg_ev, a.avg_ev_std), ('max_ev', a.max_ev, a.max_ev_std),
        ('avg_la', a.avg_la, a.avg_la_std), ('avg_dist', a.avg_dist, a.avg_dist_std),
        ('avg_bat_speed', a.avg_bat_speed, a.avg_bat_speed_std), ('avg_swing_length', a.avg_swing_length, a.avg_swing_length_std),
        ('avg_attack_angle', a.avg_attack_angle, a.avg_attack_angle_std),
        ('avg_attack_direction', a.avg_attack_direction, a.avg_attack_direction_std),
        ('avg_swing_path_tilt', a.avg_swing_path_tilt, a.avg_swing_path_tilt_std),
        ('k_pct', a.k_pct, a.k_pct_std), ('bb_pct', a.bb_pct, a.bb_pct_std),
        ('k_minus_bb', a.k_minus_bb, a.k_minus_bb_std),
        ('whiff_pct', a.whiff_pct, a.whiff_pct_std), ('swstr_pct', a.swstr_pct, a.swstr_pct_std),
        ('csw_pct', a.csw_pct, a.csw_pct_std),
        ('chase_pct', a.chase_pct, a.chase_pct_std), ('contact_pct', a.contact_pct, a.contact_pct_std),
        ('z_swing_pct', a.z_swing_pct, a.z_swing_pct_std), ('o_contact_pct', a.o_contact_pct, a.o_contact_pct_std),
        ('hard_hit_pct', a.hard_hit_pct, a.hard_hit_pct_std), ('barrel_pct', a.barrel_pct, a.barrel_pct_std),
        ('fast_swing_rate', a.fast_swing_rate, a.fast_swing_rate_std),
        ('squared_up_rate', a.squared_up_rate, a.squared_up_rate_std),
        ('blast_rate', a.blast_rate, a.blast_rate_std),
        ('ideal_attack_angle_rate', a.ideal_attack_angle_rate, a.ideal_attack_angle_rate_std),
        ('gb_pct', a.gb_pct, a.gb_pct_std), ('fb_pct', a.fb_pct, a.fb_pct_std),
        ('ld_pct', a.ld_pct, a.ld_pct_std), ('pu_pct', a.pu_pct, a.pu_pct_std),
        ('ba', a.ba, a.ba_std), ('obp', a.obp, a.obp_std),
        ('slg', a.slg, a.slg_std), ('ops', a.ops, a.ops_std),
        ('avg_xba', a.avg_xba, a.avg_xba_std), ('avg_xwoba', a.avg_xwoba, a.avg_xwoba_std),
        ('avg_xslg', a.avg_xslg, a.avg_xslg_std), ('avg_woba', a.avg_woba, a.avg_woba_std)
      ) m(metric, val, val_std)
      WHERE m.val IS NOT NULL;
    $sql$, v_table, v_start, v_end,
           e_attack_angle, e_attack_dir, e_swing_tilt, e_ideal_aa_rate, e_xslg,
           p_season, v_level);

    -- ═════════════════════════════════════════════════════════════════════
    -- PITCHER BLOCK (SP + RP) — group by pitcher, qualify on IP per role
    -- ═════════════════════════════════════════════════════════════════════
    EXECUTE format($sql$
      WITH src AS (
        SELECT *,
          CASE events
            WHEN 'Strikeout'              THEN 'strikeout'
            WHEN 'Strikeout Double Play'  THEN 'strikeout_double_play'
            WHEN 'Walk'                   THEN 'walk'
            WHEN 'Hit By Pitch'           THEN 'hit_by_pitch'
            WHEN 'Groundout'              THEN 'field_out'
            WHEN 'Flyout'                 THEN 'field_out'
            WHEN 'Lineout'                THEN 'field_out'
            WHEN 'Pop Out'                THEN 'field_out'
            WHEN 'Bunt Groundout'         THEN 'field_out'
            WHEN 'Bunt Pop Out'           THEN 'field_out'
            WHEN 'Bunt Lineout'           THEN 'field_out'
            WHEN 'Double Play'            THEN 'double_play'
            WHEN 'Grounded Into DP'       THEN 'grounded_into_double_play'
            WHEN 'Forceout'               THEN 'force_out'
            WHEN 'Fielders Choice'        THEN 'fielders_choice'
            WHEN 'Fielders Choice Out'    THEN 'fielders_choice_out'
            WHEN 'Sac Fly'                THEN 'sac_fly'
            WHEN 'Sac Bunt'               THEN 'sac_bunt'
            WHEN 'Sac Fly Double Play'    THEN 'sac_fly_double_play'
            WHEN 'Triple Play'            THEN 'triple_play'
            WHEN 'Single'                 THEN 'single'
            WHEN 'Double'                 THEN 'double'
            WHEN 'Triple'                 THEN 'triple'
            WHEN 'Home Run'               THEN 'home_run'
            WHEN 'Catcher Interference'   THEN 'catcher_interf'
            ELSE events
          END AS events_n
        FROM %I
        WHERE game_date >= %L AND game_date < %L
      ),
      per_game AS (
        SELECT pitcher, game_pk, COUNT(*) AS pc
        FROM src
        WHERE pitcher IS NOT NULL AND pitch_type NOT IN ('PO','IN')
        GROUP BY pitcher, game_pk
      ),
      roles AS (
        SELECT pitcher,
          CASE WHEN COUNT(*) FILTER (WHERE pc >= 50) >= 3 THEN 'SP' ELSE 'RP' END AS role
        FROM per_game GROUP BY pitcher
      ),
      per_pitcher AS (
        SELECT s.pitcher AS pid,
          COUNT(*) FILTER (
            WHERE events_n IN ('strikeout','strikeout_double_play','field_out','double_play',
                               'grounded_into_double_play','force_out','fielders_choice',
                               'fielders_choice_out','sac_fly','sac_bunt','sac_fly_double_play','triple_play')
          )::numeric / 3.0 AS _ip,
          r.role,
          AVG(release_speed)       AS avg_velo,
          MAX(release_speed)       AS max_velo,
          AVG(release_spin_rate)   AS avg_spin,
          AVG(release_extension)   AS avg_ext,
          %s                       AS avg_arm_angle,
          AVG(pfx_x * 12)          AS avg_hbreak_in,
          AVG(pfx_z * 12)          AS avg_ivb_in,
          100.0 * COUNT(*) FILTER (WHERE events_n IN ('strikeout','strikeout_double_play'))
            / NULLIF(COUNT(DISTINCT CASE WHEN events_n IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0) AS k_pct,
          100.0 * COUNT(*) FILTER (WHERE events_n = 'walk')
            / NULLIF(COUNT(DISTINCT CASE WHEN events_n IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0) AS bb_pct,
          100.0 * (COUNT(*) FILTER (WHERE events_n IN ('strikeout','strikeout_double_play')) - COUNT(*) FILTER (WHERE events_n = 'walk'))
            / NULLIF(COUNT(DISTINCT CASE WHEN events_n IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0) AS k_minus_bb,
          100.0 * COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','missed_bunt'))
            / NULLIF(COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','bunt_foul_tip','hit_into_play','missed_bunt')), 0) AS whiff_pct,
          100.0 * COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked'))
            / NULLIF(COUNT(*), 0) AS swstr_pct,
          100.0 * COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','called_strike'))
            / NULLIF(COUNT(*), 0) AS csw_pct,
          100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9)
            / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0) AS zone_pct,
          100.0 * COUNT(*) FILTER (WHERE zone > 9 AND description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','bunt_foul_tip','hit_into_play','missed_bunt'))
            / NULLIF(COUNT(*) FILTER (WHERE zone > 9), 0) AS chase_pct,
          100.0 * COUNT(*) FILTER (WHERE description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip'))
            / NULLIF(COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip','missed_bunt')), 0) AS contact_pct,
          100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9 AND description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','bunt_foul_tip','hit_into_play','missed_bunt'))
            / NULLIF(COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9), 0) AS z_swing_pct,
          100.0 * COUNT(*) FILTER (WHERE zone > 9 AND description IN ('foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip'))
            / NULLIF(COUNT(*) FILTER (WHERE zone > 9 AND description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','foul_bunt','bunt_foul_tip','missed_bunt')), 0) AS o_contact_pct,
          100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95)
            / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0) AS hard_hit_pct,
          100.0 * COUNT(*) FILTER (WHERE launch_speed_angle::text = '6')
            / NULLIF(COUNT(*) FILTER (WHERE launch_speed_angle IS NOT NULL), 0) AS barrel_pct,
          100.0 * COUNT(*) FILTER (WHERE bb_type = 'ground_ball')
            / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS gb_pct,
          100.0 * COUNT(*) FILTER (WHERE bb_type = 'fly_ball')
            / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS fb_pct,
          100.0 * COUNT(*) FILTER (WHERE bb_type = 'line_drive')
            / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS ld_pct,
          100.0 * COUNT(*) FILTER (WHERE bb_type = 'popup')
            / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS pu_pct,
          COUNT(*) FILTER (WHERE events_n IN ('single','double','triple','home_run'))::numeric
            / NULLIF(COUNT(*) FILTER (WHERE events_n IS NOT NULL AND events_n NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0) AS ba,
          (COUNT(*) FILTER (WHERE events_n = 'single') + 2 * COUNT(*) FILTER (WHERE events_n = 'double') + 3 * COUNT(*) FILTER (WHERE events_n = 'triple') + 4 * COUNT(*) FILTER (WHERE events_n = 'home_run'))::numeric
            / NULLIF(COUNT(*) FILTER (WHERE events_n IS NOT NULL AND events_n NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0) AS slg,
          COUNT(*) FILTER (WHERE events_n IN ('single','double','triple','home_run','walk','hit_by_pitch'))::numeric
            / NULLIF(COUNT(DISTINCT CASE WHEN events_n IS NOT NULL AND events_n NOT IN ('sac_bunt','catcher_interf') THEN game_pk::bigint * 10000 + at_bat_number END), 0) AS obp,
          AVG(estimated_ba_using_speedangle)    AS avg_xba,
          AVG(estimated_woba_using_speedangle)  AS avg_xwoba,
          %s                                    AS avg_xslg,
          AVG(woba_value)                       AS avg_woba
        FROM src s
        JOIN roles r ON r.pitcher = s.pitcher
        WHERE s.pitcher IS NOT NULL
        GROUP BY s.pitcher, r.role
      ),
      with_ops AS (
        SELECT p.*, p.slg + p.obp AS ops FROM per_pitcher p
      ),
      leaders AS (
        SELECT MAX(_ip) FILTER (WHERE role='SP') AS sp_lead,
               MAX(_ip) FILTER (WHERE role='RP') AS rp_lead
        FROM with_ops
      ),
      floors AS (
        SELECT GREATEST(5.0, 0.20 * COALESCE(sp_lead,0)) AS sp_floor,
               GREATEST(5.0, 0.20 * COALESCE(rp_lead,0)) AS rp_floor,
               sp_lead, rp_lead
        FROM leaders
      ),
      qual AS (
        SELECT w.*,
               CASE WHEN w.role='SP' AND w._ip >= f.sp_floor THEN true
                    WHEN w.role='RP' AND w._ip >= f.rp_floor THEN true
                    ELSE false END AS qualified
        FROM with_ops w CROSS JOIN floors f
      ),
      agg AS (
        SELECT role,
          COUNT(*) AS n,
          AVG(avg_velo) AS avg_velo,             STDDEV_SAMP(avg_velo) AS avg_velo_std,
          AVG(max_velo) AS max_velo,             STDDEV_SAMP(max_velo) AS max_velo_std,
          AVG(avg_spin) AS avg_spin,             STDDEV_SAMP(avg_spin) AS avg_spin_std,
          AVG(avg_ext) AS avg_ext,               STDDEV_SAMP(avg_ext) AS avg_ext_std,
          AVG(avg_arm_angle) AS avg_arm_angle,   STDDEV_SAMP(avg_arm_angle) AS avg_arm_angle_std,
          AVG(avg_hbreak_in) AS avg_hbreak_in,   STDDEV_SAMP(avg_hbreak_in) AS avg_hbreak_in_std,
          AVG(avg_ivb_in) AS avg_ivb_in,         STDDEV_SAMP(avg_ivb_in) AS avg_ivb_in_std,
          AVG(k_pct) AS k_pct,                   STDDEV_SAMP(k_pct) AS k_pct_std,
          AVG(bb_pct) AS bb_pct,                 STDDEV_SAMP(bb_pct) AS bb_pct_std,
          AVG(k_minus_bb) AS k_minus_bb,         STDDEV_SAMP(k_minus_bb) AS k_minus_bb_std,
          AVG(whiff_pct) AS whiff_pct,           STDDEV_SAMP(whiff_pct) AS whiff_pct_std,
          AVG(swstr_pct) AS swstr_pct,           STDDEV_SAMP(swstr_pct) AS swstr_pct_std,
          AVG(csw_pct) AS csw_pct,               STDDEV_SAMP(csw_pct) AS csw_pct_std,
          AVG(zone_pct) AS zone_pct,             STDDEV_SAMP(zone_pct) AS zone_pct_std,
          AVG(chase_pct) AS chase_pct,           STDDEV_SAMP(chase_pct) AS chase_pct_std,
          AVG(contact_pct) AS contact_pct,       STDDEV_SAMP(contact_pct) AS contact_pct_std,
          AVG(z_swing_pct) AS z_swing_pct,       STDDEV_SAMP(z_swing_pct) AS z_swing_pct_std,
          AVG(o_contact_pct) AS o_contact_pct,   STDDEV_SAMP(o_contact_pct) AS o_contact_pct_std,
          AVG(hard_hit_pct) AS hard_hit_pct,     STDDEV_SAMP(hard_hit_pct) AS hard_hit_pct_std,
          AVG(barrel_pct) AS barrel_pct,         STDDEV_SAMP(barrel_pct) AS barrel_pct_std,
          AVG(gb_pct) AS gb_pct,                 STDDEV_SAMP(gb_pct) AS gb_pct_std,
          AVG(fb_pct) AS fb_pct,                 STDDEV_SAMP(fb_pct) AS fb_pct_std,
          AVG(ld_pct) AS ld_pct,                 STDDEV_SAMP(ld_pct) AS ld_pct_std,
          AVG(pu_pct) AS pu_pct,                 STDDEV_SAMP(pu_pct) AS pu_pct_std,
          AVG(ba) AS ba,                         STDDEV_SAMP(ba) AS ba_std,
          AVG(obp) AS obp,                       STDDEV_SAMP(obp) AS obp_std,
          AVG(slg) AS slg,                       STDDEV_SAMP(slg) AS slg_std,
          AVG(ops) AS ops,                       STDDEV_SAMP(ops) AS ops_std,
          AVG(avg_xba) AS avg_xba,               STDDEV_SAMP(avg_xba) AS avg_xba_std,
          AVG(avg_xwoba) AS avg_xwoba,           STDDEV_SAMP(avg_xwoba) AS avg_xwoba_std,
          AVG(avg_xslg) AS avg_xslg,             STDDEV_SAMP(avg_xslg) AS avg_xslg_std,
          AVG(avg_woba) AS avg_woba,             STDDEV_SAMP(avg_woba) AS avg_woba_std
        FROM qual
        WHERE qualified
        GROUP BY role
      )
      INSERT INTO league_averages (season, level, role, metric, value, stddev, n_qualified, leader_value, qual_floor, updated_at)
      SELECT %L, %L, a.role, m.metric, m.val, m.val_std, a.n,
             CASE WHEN a.role='SP' THEN (SELECT sp_lead FROM floors) ELSE (SELECT rp_lead FROM floors) END,
             CASE WHEN a.role='SP' THEN (SELECT sp_floor FROM floors) ELSE (SELECT rp_floor FROM floors) END,
             now()
      FROM agg a
      CROSS JOIN LATERAL (VALUES
        ('avg_velo', a.avg_velo, a.avg_velo_std), ('max_velo', a.max_velo, a.max_velo_std),
        ('avg_spin', a.avg_spin, a.avg_spin_std),
        ('avg_ext', a.avg_ext, a.avg_ext_std), ('avg_arm_angle', a.avg_arm_angle, a.avg_arm_angle_std),
        ('avg_hbreak_in', a.avg_hbreak_in, a.avg_hbreak_in_std),
        ('avg_ivb_in', a.avg_ivb_in, a.avg_ivb_in_std),
        ('k_pct', a.k_pct, a.k_pct_std), ('bb_pct', a.bb_pct, a.bb_pct_std),
        ('k_minus_bb', a.k_minus_bb, a.k_minus_bb_std),
        ('whiff_pct', a.whiff_pct, a.whiff_pct_std), ('swstr_pct', a.swstr_pct, a.swstr_pct_std),
        ('csw_pct', a.csw_pct, a.csw_pct_std),
        ('zone_pct', a.zone_pct, a.zone_pct_std), ('chase_pct', a.chase_pct, a.chase_pct_std),
        ('contact_pct', a.contact_pct, a.contact_pct_std),
        ('z_swing_pct', a.z_swing_pct, a.z_swing_pct_std),
        ('o_contact_pct', a.o_contact_pct, a.o_contact_pct_std),
        ('hard_hit_pct', a.hard_hit_pct, a.hard_hit_pct_std),
        ('barrel_pct', a.barrel_pct, a.barrel_pct_std),
        ('gb_pct', a.gb_pct, a.gb_pct_std), ('fb_pct', a.fb_pct, a.fb_pct_std),
        ('ld_pct', a.ld_pct, a.ld_pct_std), ('pu_pct', a.pu_pct, a.pu_pct_std),
        ('ba', a.ba, a.ba_std), ('obp', a.obp, a.obp_std),
        ('slg', a.slg, a.slg_std), ('ops', a.ops, a.ops_std),
        ('avg_xba', a.avg_xba, a.avg_xba_std), ('avg_xwoba', a.avg_xwoba, a.avg_xwoba_std),
        ('avg_xslg', a.avg_xslg, a.avg_xslg_std), ('avg_woba', a.avg_woba, a.avg_woba_std)
      ) m(metric, val, val_std)
      WHERE m.val IS NOT NULL;
    $sql$, v_table, v_start, v_end,
           e_arm_angle, e_xslg,
           p_season, v_level);

    -- ═════════════════════════════════════════════════════════════════════
    -- TRITON + DECEPTION BLOCK (MLB only, SP/RP) — sourced from
    -- pitcher_season_command and pitcher_season_deception. Both tables are
    -- pitch-type-partitioned, so we take a pitch-weighted mean across pitch
    -- types before averaging across qualified pitchers. IP and SP/RP come
    -- from the pitches table (same season).
    -- ═════════════════════════════════════════════════════════════════════
    IF v_level = 'MLB' THEN
      EXECUTE format($sql$
        WITH season_pitches AS (
          SELECT * FROM pitches
          WHERE game_date >= %L AND game_date < %L AND pitcher IS NOT NULL
        ),
        per_game AS (
          SELECT pitcher, game_pk, COUNT(*) AS pc
          FROM season_pitches
          WHERE pitch_type NOT IN ('PO','IN')
          GROUP BY pitcher, game_pk
        ),
        roles AS (
          SELECT pitcher,
            CASE WHEN COUNT(*) FILTER (WHERE pc >= 50) >= 3 THEN 'SP' ELSE 'RP' END AS role
          FROM per_game GROUP BY pitcher
        ),
        per_pitcher AS (
          SELECT s.pitcher AS pid,
            COUNT(*) FILTER (
              WHERE events IN ('strikeout','strikeout_double_play','field_out','double_play',
                               'grounded_into_double_play','force_out','fielders_choice',
                               'fielders_choice_out','sac_fly','sac_bunt','sac_fly_double_play','triple_play')
            )::numeric / 3.0 AS _ip,
            r.role
          FROM season_pitches s
          JOIN roles r ON r.pitcher = s.pitcher
          GROUP BY s.pitcher, r.role
        ),
        triton AS (
          SELECT pitcher,
            SUM(avg_brink     * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE avg_brink     IS NOT NULL), 0) AS avg_brink,
            SUM(avg_cluster   * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE avg_cluster   IS NOT NULL), 0) AS avg_cluster,
            SUM(avg_cluster_r * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE avg_cluster_r IS NOT NULL), 0) AS avg_cluster_r,
            SUM(avg_cluster_l * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE avg_cluster_l IS NOT NULL), 0) AS avg_cluster_l,
            SUM(avg_hdev      * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE avg_hdev      IS NOT NULL), 0) AS avg_hdev,
            SUM(avg_vdev      * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE avg_vdev      IS NOT NULL), 0) AS avg_vdev,
            SUM(avg_missfire  * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE avg_missfire  IS NOT NULL), 0) AS avg_missfire,
            SUM(close_pct::numeric * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE close_pct IS NOT NULL), 0) AS close_pct,
            SUM(waste_pct     * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE waste_pct     IS NOT NULL), 0) AS waste_pct
          FROM pitcher_season_command
          WHERE game_year = %L
          GROUP BY pitcher
        ),
        deception AS (
          SELECT pitcher,
            SUM(deception_score::numeric * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE deception_score IS NOT NULL), 0) AS deception_score,
            SUM(unique_score::numeric    * pitches::numeric) / NULLIF(SUM(pitches) FILTER (WHERE unique_score    IS NOT NULL), 0) AS unique_score
          FROM pitcher_season_deception
          WHERE game_year = %L
          GROUP BY pitcher
        ),
        merged AS (
          SELECT p.*,
            t.avg_brink, t.avg_cluster, t.avg_cluster_r, t.avg_cluster_l,
            t.avg_hdev, t.avg_vdev, t.avg_missfire, t.close_pct, t.waste_pct,
            d.deception_score, d.unique_score
          FROM per_pitcher p
          LEFT JOIN triton    t ON t.pitcher = p.pid
          LEFT JOIN deception d ON d.pitcher = p.pid
        ),
        leaders AS (
          SELECT MAX(_ip) FILTER (WHERE role='SP') AS sp_lead,
                 MAX(_ip) FILTER (WHERE role='RP') AS rp_lead
          FROM merged
        ),
        floors AS (
          SELECT GREATEST(5.0, 0.20 * COALESCE(sp_lead,0)) AS sp_floor,
                 GREATEST(5.0, 0.20 * COALESCE(rp_lead,0)) AS rp_floor,
                 sp_lead, rp_lead
          FROM leaders
        ),
        qual AS (
          SELECT m.*,
            CASE WHEN m.role='SP' AND m._ip >= f.sp_floor THEN true
                 WHEN m.role='RP' AND m._ip >= f.rp_floor THEN true
                 ELSE false END AS qualified
          FROM merged m CROSS JOIN floors f
        ),
        agg AS (
          SELECT role, COUNT(*) AS n,
            AVG(avg_brink)       AS avg_brink,       STDDEV_SAMP(avg_brink)       AS avg_brink_std,
            AVG(avg_cluster)     AS avg_cluster,     STDDEV_SAMP(avg_cluster)     AS avg_cluster_std,
            AVG(avg_cluster_r)   AS avg_cluster_r,   STDDEV_SAMP(avg_cluster_r)   AS avg_cluster_r_std,
            AVG(avg_cluster_l)   AS avg_cluster_l,   STDDEV_SAMP(avg_cluster_l)   AS avg_cluster_l_std,
            AVG(avg_hdev)        AS avg_hdev,        STDDEV_SAMP(avg_hdev)        AS avg_hdev_std,
            AVG(avg_vdev)        AS avg_vdev,        STDDEV_SAMP(avg_vdev)        AS avg_vdev_std,
            AVG(avg_missfire)    AS avg_missfire,    STDDEV_SAMP(avg_missfire)    AS avg_missfire_std,
            AVG(close_pct)       AS close_pct,       STDDEV_SAMP(close_pct)       AS close_pct_std,
            AVG(waste_pct)       AS waste_pct,       STDDEV_SAMP(waste_pct)       AS waste_pct_std,
            AVG(deception_score) AS deception_score, STDDEV_SAMP(deception_score) AS deception_score_std,
            AVG(unique_score)    AS unique_score,    STDDEV_SAMP(unique_score)    AS unique_score_std
          FROM qual WHERE qualified GROUP BY role
        )
        INSERT INTO league_averages (season, level, role, metric, value, stddev, n_qualified, leader_value, qual_floor, updated_at)
        SELECT %L, %L, a.role, m.metric, m.val, m.val_std, a.n,
          CASE WHEN a.role='SP' THEN (SELECT sp_lead FROM floors) ELSE (SELECT rp_lead FROM floors) END,
          CASE WHEN a.role='SP' THEN (SELECT sp_floor FROM floors) ELSE (SELECT rp_floor FROM floors) END,
          now()
        FROM agg a
        CROSS JOIN LATERAL (VALUES
          ('avg_brink', a.avg_brink, a.avg_brink_std),
          ('avg_cluster', a.avg_cluster, a.avg_cluster_std),
          ('avg_cluster_r', a.avg_cluster_r, a.avg_cluster_r_std),
          ('avg_cluster_l', a.avg_cluster_l, a.avg_cluster_l_std),
          ('avg_hdev', a.avg_hdev, a.avg_hdev_std),
          ('avg_vdev', a.avg_vdev, a.avg_vdev_std),
          ('avg_missfire', a.avg_missfire, a.avg_missfire_std),
          ('close_pct', a.close_pct, a.close_pct_std),
          ('waste_pct', a.waste_pct, a.waste_pct_std),
          ('deception_score', a.deception_score, a.deception_score_std),
          ('unique_score', a.unique_score, a.unique_score_std)
        ) m(metric, val, val_std)
        WHERE m.val IS NOT NULL;
      $sql$, v_start, v_end, p_season, p_season, p_season, v_level);
    END IF;

    -- ═════════════════════════════════════════════════════════════════════
    -- ERA ESTIMATORS BLOCK (MLB + MiLB, SP/RP) — FIP, xFIP, xERA, SIERA
    -- Formulas mirror lib/expected-stats.ts. Skips ERA proper (requires
    -- earned-runs data not available in pitches). For MiLB, xERA drops out
    -- because estimated_woba_using_speedangle is usually NULL.
    -- ═════════════════════════════════════════════════════════════════════
    EXECUTE format($sql$
      WITH src AS (
        SELECT *,
          CASE events
            WHEN 'Strikeout'              THEN 'strikeout'
            WHEN 'Strikeout Double Play'  THEN 'strikeout_double_play'
            WHEN 'Walk'                   THEN 'walk'
            WHEN 'Hit By Pitch'           THEN 'hit_by_pitch'
            WHEN 'Groundout'              THEN 'field_out'
            WHEN 'Flyout'                 THEN 'field_out'
            WHEN 'Lineout'                THEN 'field_out'
            WHEN 'Pop Out'                THEN 'field_out'
            WHEN 'Bunt Groundout'         THEN 'field_out'
            WHEN 'Bunt Pop Out'           THEN 'field_out'
            WHEN 'Bunt Lineout'           THEN 'field_out'
            WHEN 'Double Play'            THEN 'double_play'
            WHEN 'Grounded Into DP'       THEN 'grounded_into_double_play'
            WHEN 'Forceout'               THEN 'force_out'
            WHEN 'Fielders Choice'        THEN 'fielders_choice'
            WHEN 'Fielders Choice Out'    THEN 'fielders_choice_out'
            WHEN 'Sac Fly'                THEN 'sac_fly'
            WHEN 'Sac Bunt'               THEN 'sac_bunt'
            WHEN 'Sac Fly Double Play'    THEN 'sac_fly_double_play'
            WHEN 'Triple Play'            THEN 'triple_play'
            WHEN 'Single'                 THEN 'single'
            WHEN 'Double'                 THEN 'double'
            WHEN 'Triple'                 THEN 'triple'
            WHEN 'Home Run'               THEN 'home_run'
            WHEN 'Catcher Interference'   THEN 'catcher_interf'
            ELSE events
          END AS events_n
        FROM %I
        WHERE game_date >= %L AND game_date < %L
      ),
      per_game AS (
        SELECT pitcher, game_pk, COUNT(*) AS pc
        FROM src
        WHERE pitcher IS NOT NULL AND pitch_type NOT IN ('PO','IN')
        GROUP BY pitcher, game_pk
      ),
      roles AS (
        SELECT pitcher,
          CASE WHEN COUNT(*) FILTER (WHERE pc >= 50) >= 3 THEN 'SP' ELSE 'RP' END AS role
        FROM per_game GROUP BY pitcher
      ),
      per_pitcher AS (
        SELECT s.pitcher AS pid,
          COUNT(*) FILTER (
            WHERE events_n IN ('strikeout','strikeout_double_play','field_out','double_play',
                               'grounded_into_double_play','force_out','fielders_choice',
                               'fielders_choice_out','sac_fly','sac_bunt','sac_fly_double_play','triple_play')
          )::numeric / 3.0 AS _ip,
          r.role,
          COUNT(*) FILTER (WHERE events_n IN ('strikeout','strikeout_double_play')) AS _k,
          COUNT(*) FILTER (WHERE events_n = 'walk')          AS _bb,
          COUNT(*) FILTER (WHERE events_n = 'hit_by_pitch')  AS _hbp,
          COUNT(*) FILTER (WHERE events_n = 'home_run')      AS _hr,
          COUNT(*) FILTER (WHERE bb_type = 'ground_ball')    AS _gb,
          COUNT(*) FILTER (WHERE bb_type = 'fly_ball')       AS _fb,
          COUNT(*) FILTER (WHERE bb_type = 'popup')          AS _pu,
          COUNT(DISTINCT CASE WHEN events_n IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) AS _pa,
          AVG(estimated_woba_using_speedangle) AS _xwoba
        FROM src s JOIN roles r ON r.pitcher = s.pitcher
        WHERE s.pitcher IS NOT NULL
        GROUP BY s.pitcher, r.role
      ),
      leaders AS (
        SELECT MAX(_ip) FILTER (WHERE role='SP') AS sp_lead,
               MAX(_ip) FILTER (WHERE role='RP') AS rp_lead
        FROM per_pitcher
      ),
      floors AS (
        SELECT GREATEST(5.0, 0.20 * COALESCE(sp_lead,0)) AS sp_floor,
               GREATEST(5.0, 0.20 * COALESCE(rp_lead,0)) AS rp_floor,
               sp_lead, rp_lead
        FROM leaders
      ),
      qual AS (
        SELECT p.*, f.sp_floor, f.rp_floor,
          CASE WHEN p.role='SP' AND p._ip >= f.sp_floor THEN true
               WHEN p.role='RP' AND p._ip >= f.rp_floor THEN true
               ELSE false END AS qualified,
          -- FIP
          CASE WHEN p._ip > 0
               THEN ((13.0 * p._hr + 3.0 * (p._bb + p._hbp) - 2.0 * p._k) / p._ip) + %L::numeric
               ELSE NULL END AS fip,
          -- xFIP (uses league HR/FB)
          CASE WHEN p._ip > 0 AND p._fb > 0
               THEN ((13.0 * (p._fb::numeric * %L::numeric) + 3.0 * (p._bb + p._hbp) - 2.0 * p._k) / p._ip) + %L::numeric
               ELSE NULL END AS xfip,
          -- xERA
          CASE WHEN p._ip > 0 AND p._pa > 0 AND p._xwoba IS NOT NULL
               THEN ((p._xwoba - %L::numeric) / %L::numeric) * (p._pa::numeric / p._ip) * 9.0 + %L::numeric
               ELSE NULL END AS xera,
          -- SIERA
          CASE WHEN p._ip > 0 AND p._pa > 0 THEN
            6.145
            - 16.986 * (p._k::numeric  / p._pa)
            + 11.434 * (p._bb::numeric / p._pa)
            - 1.858  * ((p._gb - p._fb - p._pu)::numeric / p._pa)
            + 7.653  * power(p._k::numeric / p._pa, 2)
            + 6.664  * power((p._gb - p._fb - p._pu)::numeric / p._pa, 2)
            + 10.130 * (p._k::numeric  / p._pa) * ((p._gb - p._fb - p._pu)::numeric / p._pa)
            -  5.195 * (p._bb::numeric / p._pa) * ((p._gb - p._fb - p._pu)::numeric / p._pa)
            -  0.986 * ln(GREATEST(p._ip, 1))
          ELSE NULL END AS siera
        FROM per_pitcher p CROSS JOIN floors f
      ),
      agg AS (
        SELECT role, COUNT(*) AS n,
          AVG(fip)   AS fip,   STDDEV_SAMP(fip)   AS fip_std,
          AVG(xfip)  AS xfip,  STDDEV_SAMP(xfip)  AS xfip_std,
          AVG(xera)  AS xera,  STDDEV_SAMP(xera)  AS xera_std,
          AVG(siera) AS siera, STDDEV_SAMP(siera) AS siera_std
        FROM qual WHERE qualified GROUP BY role
      )
      INSERT INTO league_averages (season, level, role, metric, value, stddev, n_qualified, leader_value, qual_floor, updated_at)
      SELECT %L, %L, a.role, m.metric, m.val, m.val_std, a.n,
        CASE WHEN a.role='SP' THEN (SELECT sp_lead FROM floors) ELSE (SELECT rp_lead FROM floors) END,
        CASE WHEN a.role='SP' THEN (SELECT sp_floor FROM floors) ELSE (SELECT rp_floor FROM floors) END,
        now()
      FROM agg a
      CROSS JOIN LATERAL (VALUES
        ('fip', a.fip, a.fip_std), ('xfip', a.xfip, a.xfip_std),
        ('xera', a.xera, a.xera_std), ('siera', a.siera, a.siera_std)
      ) m(metric, val, val_std)
      WHERE m.val IS NOT NULL;
    $sql$, v_table, v_start, v_end,
           v_cfip, v_lg_hr_fb, v_cfip, v_lg_woba, v_woba_scale, v_lg_era,
           p_season, v_level);

  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION refresh_league_averages(integer) IS
  'Recomputes league_averages for one season across MLB + MiLB × hitter/SP/RP. Idempotent: deletes and reinserts rows for p_season. Includes pitches-derivable metrics plus MLB-only Triton raw command (pitcher_season_command) and deception scores (pitcher_season_deception).';
