-- refresh_league_averages(p_season)
-- Populates league_averages for one season across both MLB and MiLB, for roles
-- hitter / SP / RP. Qualification is 20% of the role's counting-stat leader,
-- with a hard floor of 25 AB (hitters) or 5 IP (pitchers). SP vs RP is
-- determined by first-inning game share > 0.5 (mirrors app/api/game/puzzle/route.ts).
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
          AVG(avg_ev) AS avg_ev, AVG(max_ev) AS max_ev, AVG(avg_la) AS avg_la, AVG(avg_dist) AS avg_dist,
          AVG(avg_bat_speed) AS avg_bat_speed, AVG(avg_swing_length) AS avg_swing_length,
          AVG(avg_attack_angle) AS avg_attack_angle, AVG(avg_attack_direction) AS avg_attack_direction,
          AVG(avg_swing_path_tilt) AS avg_swing_path_tilt,
          AVG(k_pct) AS k_pct, AVG(bb_pct) AS bb_pct, AVG(k_minus_bb) AS k_minus_bb,
          AVG(whiff_pct) AS whiff_pct, AVG(swstr_pct) AS swstr_pct, AVG(csw_pct) AS csw_pct,
          AVG(chase_pct) AS chase_pct, AVG(contact_pct) AS contact_pct,
          AVG(z_swing_pct) AS z_swing_pct, AVG(o_contact_pct) AS o_contact_pct,
          AVG(hard_hit_pct) AS hard_hit_pct, AVG(barrel_pct) AS barrel_pct,
          AVG(fast_swing_rate) AS fast_swing_rate, AVG(squared_up_rate) AS squared_up_rate,
          AVG(blast_rate) AS blast_rate, AVG(ideal_attack_angle_rate) AS ideal_attack_angle_rate,
          AVG(gb_pct) AS gb_pct, AVG(fb_pct) AS fb_pct, AVG(ld_pct) AS ld_pct, AVG(pu_pct) AS pu_pct,
          AVG(ba) AS ba, AVG(obp) AS obp, AVG(slg) AS slg, AVG(ops) AS ops,
          AVG(avg_xba) AS avg_xba, AVG(avg_xwoba) AS avg_xwoba,
          AVG(avg_xslg) AS avg_xslg, AVG(avg_woba) AS avg_woba
        FROM qualified
      )
      INSERT INTO league_averages (season, level, role, metric, value, n_qualified, leader_value, qual_floor, updated_at)
      SELECT %L, %L, 'hitter', m.metric, m.val,
             a.n, (SELECT v FROM lead_ab), (SELECT v FROM floor_ab), now()
      FROM agg a
      CROSS JOIN LATERAL (VALUES
        ('avg_ev', a.avg_ev), ('max_ev', a.max_ev), ('avg_la', a.avg_la), ('avg_dist', a.avg_dist),
        ('avg_bat_speed', a.avg_bat_speed), ('avg_swing_length', a.avg_swing_length),
        ('avg_attack_angle', a.avg_attack_angle), ('avg_attack_direction', a.avg_attack_direction),
        ('avg_swing_path_tilt', a.avg_swing_path_tilt),
        ('k_pct', a.k_pct), ('bb_pct', a.bb_pct), ('k_minus_bb', a.k_minus_bb),
        ('whiff_pct', a.whiff_pct), ('swstr_pct', a.swstr_pct), ('csw_pct', a.csw_pct),
        ('chase_pct', a.chase_pct), ('contact_pct', a.contact_pct),
        ('z_swing_pct', a.z_swing_pct), ('o_contact_pct', a.o_contact_pct),
        ('hard_hit_pct', a.hard_hit_pct), ('barrel_pct', a.barrel_pct),
        ('fast_swing_rate', a.fast_swing_rate), ('squared_up_rate', a.squared_up_rate),
        ('blast_rate', a.blast_rate), ('ideal_attack_angle_rate', a.ideal_attack_angle_rate),
        ('gb_pct', a.gb_pct), ('fb_pct', a.fb_pct), ('ld_pct', a.ld_pct), ('pu_pct', a.pu_pct),
        ('ba', a.ba), ('obp', a.obp), ('slg', a.slg), ('ops', a.ops),
        ('avg_xba', a.avg_xba), ('avg_xwoba', a.avg_xwoba),
        ('avg_xslg', a.avg_xslg), ('avg_woba', a.avg_woba)
      ) m(metric, val)
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
      per_pitcher AS (
        SELECT pitcher AS pid,
          COUNT(*) FILTER (
            WHERE events_n IN ('strikeout','strikeout_double_play','field_out','double_play',
                               'grounded_into_double_play','force_out','fielders_choice',
                               'fielders_choice_out','sac_fly','sac_bunt','sac_fly_double_play','triple_play')
          )::numeric / 3.0 AS _ip,
          CASE WHEN COUNT(DISTINCT CASE WHEN inning = 1 THEN game_pk END)::numeric
                    / NULLIF(COUNT(DISTINCT game_pk), 0) > 0.5 THEN 'SP' ELSE 'RP' END AS role,
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
        FROM src
        WHERE pitcher IS NOT NULL
        GROUP BY pitcher
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
          AVG(avg_velo) AS avg_velo, AVG(max_velo) AS max_velo, AVG(avg_spin) AS avg_spin,
          AVG(avg_ext) AS avg_ext, AVG(avg_arm_angle) AS avg_arm_angle,
          AVG(avg_hbreak_in) AS avg_hbreak_in, AVG(avg_ivb_in) AS avg_ivb_in,
          AVG(k_pct) AS k_pct, AVG(bb_pct) AS bb_pct, AVG(k_minus_bb) AS k_minus_bb,
          AVG(whiff_pct) AS whiff_pct, AVG(swstr_pct) AS swstr_pct, AVG(csw_pct) AS csw_pct,
          AVG(zone_pct) AS zone_pct, AVG(chase_pct) AS chase_pct, AVG(contact_pct) AS contact_pct,
          AVG(z_swing_pct) AS z_swing_pct, AVG(o_contact_pct) AS o_contact_pct,
          AVG(hard_hit_pct) AS hard_hit_pct, AVG(barrel_pct) AS barrel_pct,
          AVG(gb_pct) AS gb_pct, AVG(fb_pct) AS fb_pct, AVG(ld_pct) AS ld_pct, AVG(pu_pct) AS pu_pct,
          AVG(ba) AS ba, AVG(obp) AS obp, AVG(slg) AS slg, AVG(ops) AS ops,
          AVG(avg_xba) AS avg_xba, AVG(avg_xwoba) AS avg_xwoba,
          AVG(avg_xslg) AS avg_xslg, AVG(avg_woba) AS avg_woba
        FROM qual
        WHERE qualified
        GROUP BY role
      )
      INSERT INTO league_averages (season, level, role, metric, value, n_qualified, leader_value, qual_floor, updated_at)
      SELECT %L, %L, a.role, m.metric, m.val, a.n,
             CASE WHEN a.role='SP' THEN (SELECT sp_lead FROM floors) ELSE (SELECT rp_lead FROM floors) END,
             CASE WHEN a.role='SP' THEN (SELECT sp_floor FROM floors) ELSE (SELECT rp_floor FROM floors) END,
             now()
      FROM agg a
      CROSS JOIN LATERAL (VALUES
        ('avg_velo', a.avg_velo), ('max_velo', a.max_velo), ('avg_spin', a.avg_spin),
        ('avg_ext', a.avg_ext), ('avg_arm_angle', a.avg_arm_angle),
        ('avg_hbreak_in', a.avg_hbreak_in), ('avg_ivb_in', a.avg_ivb_in),
        ('k_pct', a.k_pct), ('bb_pct', a.bb_pct), ('k_minus_bb', a.k_minus_bb),
        ('whiff_pct', a.whiff_pct), ('swstr_pct', a.swstr_pct), ('csw_pct', a.csw_pct),
        ('zone_pct', a.zone_pct), ('chase_pct', a.chase_pct), ('contact_pct', a.contact_pct),
        ('z_swing_pct', a.z_swing_pct), ('o_contact_pct', a.o_contact_pct),
        ('hard_hit_pct', a.hard_hit_pct), ('barrel_pct', a.barrel_pct),
        ('gb_pct', a.gb_pct), ('fb_pct', a.fb_pct), ('ld_pct', a.ld_pct), ('pu_pct', a.pu_pct),
        ('ba', a.ba), ('obp', a.obp), ('slg', a.slg), ('ops', a.ops),
        ('avg_xba', a.avg_xba), ('avg_xwoba', a.avg_xwoba),
        ('avg_xslg', a.avg_xslg), ('avg_woba', a.avg_woba)
      ) m(metric, val)
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
        WITH per_pitcher AS (
          SELECT pitcher AS pid,
            COUNT(*) FILTER (
              WHERE events IN ('strikeout','strikeout_double_play','field_out','double_play',
                               'grounded_into_double_play','force_out','fielders_choice',
                               'fielders_choice_out','sac_fly','sac_bunt','sac_fly_double_play','triple_play')
            )::numeric / 3.0 AS _ip,
            CASE WHEN COUNT(DISTINCT CASE WHEN inning = 1 THEN game_pk END)::numeric
                      / NULLIF(COUNT(DISTINCT game_pk), 0) > 0.5 THEN 'SP' ELSE 'RP' END AS role
          FROM pitches
          WHERE game_date >= %L AND game_date < %L AND pitcher IS NOT NULL
          GROUP BY pitcher
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
            AVG(avg_brink)       AS avg_brink,
            AVG(avg_cluster)     AS avg_cluster,
            AVG(avg_cluster_r)   AS avg_cluster_r,
            AVG(avg_cluster_l)   AS avg_cluster_l,
            AVG(avg_hdev)        AS avg_hdev,
            AVG(avg_vdev)        AS avg_vdev,
            AVG(avg_missfire)    AS avg_missfire,
            AVG(close_pct)       AS close_pct,
            AVG(waste_pct)       AS waste_pct,
            AVG(deception_score) AS deception_score,
            AVG(unique_score)    AS unique_score
          FROM qual WHERE qualified GROUP BY role
        )
        INSERT INTO league_averages (season, level, role, metric, value, n_qualified, leader_value, qual_floor, updated_at)
        SELECT %L, %L, a.role, m.metric, m.val, a.n,
          CASE WHEN a.role='SP' THEN (SELECT sp_lead FROM floors) ELSE (SELECT rp_lead FROM floors) END,
          CASE WHEN a.role='SP' THEN (SELECT sp_floor FROM floors) ELSE (SELECT rp_floor FROM floors) END,
          now()
        FROM agg a
        CROSS JOIN LATERAL (VALUES
          ('avg_brink', a.avg_brink), ('avg_cluster', a.avg_cluster),
          ('avg_cluster_r', a.avg_cluster_r), ('avg_cluster_l', a.avg_cluster_l),
          ('avg_hdev', a.avg_hdev), ('avg_vdev', a.avg_vdev),
          ('avg_missfire', a.avg_missfire),
          ('close_pct', a.close_pct), ('waste_pct', a.waste_pct),
          ('deception_score', a.deception_score), ('unique_score', a.unique_score)
        ) m(metric, val)
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
      per_pitcher AS (
        SELECT pitcher AS pid,
          COUNT(*) FILTER (
            WHERE events_n IN ('strikeout','strikeout_double_play','field_out','double_play',
                               'grounded_into_double_play','force_out','fielders_choice',
                               'fielders_choice_out','sac_fly','sac_bunt','sac_fly_double_play','triple_play')
          )::numeric / 3.0 AS _ip,
          CASE WHEN COUNT(DISTINCT CASE WHEN inning = 1 THEN game_pk END)::numeric
                    / NULLIF(COUNT(DISTINCT game_pk), 0) > 0.5 THEN 'SP' ELSE 'RP' END AS role,
          COUNT(*) FILTER (WHERE events_n IN ('strikeout','strikeout_double_play')) AS _k,
          COUNT(*) FILTER (WHERE events_n = 'walk')          AS _bb,
          COUNT(*) FILTER (WHERE events_n = 'hit_by_pitch')  AS _hbp,
          COUNT(*) FILTER (WHERE events_n = 'home_run')      AS _hr,
          COUNT(*) FILTER (WHERE bb_type = 'ground_ball')    AS _gb,
          COUNT(*) FILTER (WHERE bb_type = 'fly_ball')       AS _fb,
          COUNT(*) FILTER (WHERE bb_type = 'popup')          AS _pu,
          COUNT(DISTINCT CASE WHEN events_n IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) AS _pa,
          AVG(estimated_woba_using_speedangle) AS _xwoba
        FROM src WHERE pitcher IS NOT NULL GROUP BY pitcher
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
          AVG(fip)   AS fip,
          AVG(xfip)  AS xfip,
          AVG(xera)  AS xera,
          AVG(siera) AS siera
        FROM qual WHERE qualified GROUP BY role
      )
      INSERT INTO league_averages (season, level, role, metric, value, n_qualified, leader_value, qual_floor, updated_at)
      SELECT %L, %L, a.role, m.metric, m.val, a.n,
        CASE WHEN a.role='SP' THEN (SELECT sp_lead FROM floors) ELSE (SELECT rp_lead FROM floors) END,
        CASE WHEN a.role='SP' THEN (SELECT sp_floor FROM floors) ELSE (SELECT rp_floor FROM floors) END,
        now()
      FROM agg a
      CROSS JOIN LATERAL (VALUES
        ('fip', a.fip), ('xfip', a.xfip), ('xera', a.xera), ('siera', a.siera)
      ) m(metric, val)
      WHERE m.val IS NOT NULL;
    $sql$, v_table, v_start, v_end,
           v_cfip, v_lg_hr_fb, v_cfip, v_lg_woba, v_woba_scale, v_lg_era,
           p_season, v_level);

  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION refresh_league_averages(integer) IS
  'Recomputes league_averages for one season across MLB + MiLB × hitter/SP/RP. Idempotent: deletes and reinserts rows for p_season. Includes pitches-derivable metrics plus MLB-only Triton raw command (pitcher_season_command) and deception scores (pitcher_season_deception).';
