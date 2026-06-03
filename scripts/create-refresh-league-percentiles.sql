-- refresh_league_percentiles(p_season)
-- Companion to refresh_league_averages. Populates league_percentiles for one
-- season across MLB and MiLB, for roles hitter / SP / RP.
--
-- Uses the same per-player aggregation CTEs and qualification logic as
-- refresh_league_averages, but instead of computing AVG/STDDEV, it:
--   1. Unpivots qualified player values into (metric, val, higher_better) rows
--   2. Collects values into sorted arrays: array_agg(val ORDER BY val)
--   3. Picks percentile positions via nearest-rank: vals[ceil(p * n / 100)]
--   4. INSERTs into league_percentiles
--
-- Idempotent: deletes and reinserts for p_season.

CREATE OR REPLACE FUNCTION refresh_league_percentiles(p_season integer)
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
  v_cfip       numeric;
  v_lg_era     numeric;
  v_lg_woba    numeric;
  v_woba_scale numeric;
  v_lg_hr_fb   numeric;
BEGIN
  v_start := make_date(p_season, 1, 1);
  v_end   := make_date(p_season + 1, 1, 1);
  DELETE FROM league_percentiles WHERE season = p_season;

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
    ELSE           v_cfip := 3.135; v_lg_era := 4.10; v_lg_woba := 0.313; v_woba_scale := 1.232; v_lg_hr_fb := 0.110;
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
          AVG(CASE WHEN bb_type IS NOT NULL THEN launch_speed END) AS avg_ev,
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
          100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95 AND bb_type IS NOT NULL)
            / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS hard_hit_pct,
          100.0 * COUNT(*) FILTER (WHERE launch_speed_angle::text = '6')
            / NULLIF(COUNT(*) FILTER (WHERE launch_speed_angle IS NOT NULL), 0) AS barrel_pct,
          100.0 * COUNT(*) FILTER (WHERE bat_speed >= 75)
            / NULLIF(COUNT(*) FILTER (WHERE bat_speed IS NOT NULL), 0) AS fast_swing_rate,
          100.0 * COUNT(*) FILTER (WHERE launch_speed >= 0.8 * (1.23 * bat_speed + 0.23 * release_speed) AND bat_speed IS NOT NULL AND bb_type IS NOT NULL)
            / NULLIF(COUNT(*) FILTER (WHERE bat_speed IS NOT NULL AND bb_type IS NOT NULL), 0) AS squared_up_rate,
          100.0 * COUNT(*) FILTER (WHERE launch_speed >= 0.8 * (1.23 * bat_speed + 0.23 * release_speed) AND bat_speed >= 75 AND bat_speed IS NOT NULL AND bb_type IS NOT NULL)
            / NULLIF(COUNT(*) FILTER (WHERE bat_speed IS NOT NULL AND bb_type IS NOT NULL), 0) AS blast_rate,
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
          SUM(estimated_ba_using_speedangle) / NULLIF(COUNT(*) FILTER (WHERE events_n IS NOT NULL AND events_n NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0) AS avg_xba,
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
      unpivoted AS (
        SELECT m.metric, m.val, m.higher_better
        FROM qualified q
        CROSS JOIN LATERAL (VALUES
          ('avg_ev',       q.avg_ev,       true),
          ('max_ev',       q.max_ev,       true),
          ('avg_la',       q.avg_la,       true),
          ('avg_dist',     q.avg_dist,     true),
          ('avg_bat_speed', q.avg_bat_speed, true),
          ('avg_swing_length', q.avg_swing_length, false),
          ('avg_attack_angle', q.avg_attack_angle, true),
          ('avg_attack_direction', q.avg_attack_direction, true),
          ('avg_swing_path_tilt', q.avg_swing_path_tilt, true),
          ('k_pct',        q.k_pct,        false),
          ('bb_pct',       q.bb_pct,       true),
          ('k_minus_bb',   q.k_minus_bb,   false),
          ('whiff_pct',    q.whiff_pct,    false),
          ('swstr_pct',    q.swstr_pct,    false),
          ('csw_pct',      q.csw_pct,      false),
          ('chase_pct',    q.chase_pct,    false),
          ('contact_pct',  q.contact_pct,  true),
          ('z_swing_pct',  q.z_swing_pct,  true),
          ('o_contact_pct', q.o_contact_pct, true),
          ('hard_hit_pct', q.hard_hit_pct, true),
          ('barrel_pct',   q.barrel_pct,   true),
          ('fast_swing_rate', q.fast_swing_rate, true),
          ('squared_up_rate', q.squared_up_rate, true),
          ('blast_rate',   q.blast_rate,   true),
          ('ideal_attack_angle_rate', q.ideal_attack_angle_rate, true),
          ('gb_pct',       q.gb_pct,       true),
          ('fb_pct',       q.fb_pct,       true),
          ('ld_pct',       q.ld_pct,       true),
          ('pu_pct',       q.pu_pct,       false),
          ('ba',           q.ba,           true),
          ('obp',          q.obp,          true),
          ('slg',          q.slg,          true),
          ('ops',          q.ops,          true),
          ('avg_xba',      q.avg_xba,      true),
          ('avg_xwoba',    q.avg_xwoba,    true),
          ('avg_xslg',     q.avg_xslg,     true),
          ('avg_woba',     q.avg_woba,     true)
        ) m(metric, val, higher_better)
        WHERE m.val IS NOT NULL
      ),
      sorted AS (
        SELECT metric, higher_better,
          array_agg(val ORDER BY val) AS vals,
          COUNT(*) AS n
        FROM unpivoted
        GROUP BY metric, higher_better
      )
      INSERT INTO league_percentiles (season, level, role, metric, breakpoints, higher_better, n_qualified, updated_at)
      SELECT %L, %L, 'hitter', s.metric,
        ARRAY(
          SELECT s.vals[GREATEST(1, LEAST(s.n::int, ceil(p.p * s.n / 100.0)::int))]
          FROM generate_series(1, 99) AS p(p)
        ),
        s.higher_better,
        s.n::int,
        now()
      FROM sorted s;
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
          100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95 AND bb_type IS NOT NULL)
            / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS hard_hit_pct,
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
          AVG(CASE WHEN bb_type IS NOT NULL THEN launch_speed END) AS avg_ev,
          SUM(estimated_ba_using_speedangle) / NULLIF(COUNT(*) FILTER (WHERE events_n IS NOT NULL AND events_n NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0) AS avg_xba,
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
               GREATEST(5.0, 0.20 * COALESCE(rp_lead,0)) AS rp_floor
        FROM leaders
      ),
      qualified AS (
        SELECT w.*
        FROM with_ops w CROSS JOIN floors f
        WHERE (w.role='SP' AND w._ip >= f.sp_floor)
           OR (w.role='RP' AND w._ip >= f.rp_floor)
      ),
      unpivoted AS (
        SELECT q.role, m.metric, m.val, m.higher_better
        FROM qualified q
        CROSS JOIN LATERAL (VALUES
          ('avg_velo',     q.avg_velo,     true),
          ('max_velo',     q.max_velo,     true),
          ('avg_spin',     q.avg_spin,     true),
          ('avg_ext',      q.avg_ext,      true),
          ('avg_arm_angle', q.avg_arm_angle, true),
          ('avg_hbreak_in', q.avg_hbreak_in, true),
          ('avg_ivb_in',   q.avg_ivb_in,   true),
          ('k_pct',        q.k_pct,        true),
          ('bb_pct',       q.bb_pct,       false),
          ('k_minus_bb',   q.k_minus_bb,   true),
          ('whiff_pct',    q.whiff_pct,    true),
          ('swstr_pct',    q.swstr_pct,    true),
          ('csw_pct',      q.csw_pct,      true),
          ('zone_pct',     q.zone_pct,     true),
          ('chase_pct',    q.chase_pct,    true),
          ('contact_pct',  q.contact_pct,  false),
          ('z_swing_pct',  q.z_swing_pct,  true),
          ('o_contact_pct', q.o_contact_pct, false),
          ('avg_ev',       q.avg_ev,       false),
          ('hard_hit_pct', q.hard_hit_pct, false),
          ('barrel_pct',   q.barrel_pct,   false),
          ('gb_pct',       q.gb_pct,       true),
          ('fb_pct',       q.fb_pct,       true),
          ('ld_pct',       q.ld_pct,       false),
          ('pu_pct',       q.pu_pct,       true),
          ('ba',           q.ba,           false),
          ('obp',          q.obp,          false),
          ('slg',          q.slg,          false),
          ('ops',          q.ops,          false),
          ('avg_xba',      q.avg_xba,      false),
          ('avg_xwoba',    q.avg_xwoba,    false),
          ('avg_xslg',     q.avg_xslg,     false),
          ('avg_woba',     q.avg_woba,     false)
        ) m(metric, val, higher_better)
        WHERE m.val IS NOT NULL
      ),
      sorted AS (
        SELECT role, metric, higher_better,
          array_agg(val ORDER BY val) AS vals,
          COUNT(*) AS n
        FROM unpivoted
        GROUP BY role, metric, higher_better
      )
      INSERT INTO league_percentiles (season, level, role, metric, breakpoints, higher_better, n_qualified, updated_at)
      SELECT %L, %L, s.role, s.metric,
        ARRAY(
          SELECT s.vals[GREATEST(1, LEAST(s.n::int, ceil(p.p * s.n / 100.0)::int))]
          FROM generate_series(1, 99) AS p(p)
        ),
        s.higher_better,
        s.n::int,
        now()
      FROM sorted s;
    $sql$, v_table, v_start, v_end,
           e_arm_angle, e_xslg,
           p_season, v_level);

    -- ═════════════════════════════════════════════════════════════════════
    -- TRITON + DECEPTION BLOCK (MLB only, SP/RP)
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
                 GREATEST(5.0, 0.20 * COALESCE(rp_lead,0)) AS rp_floor
          FROM leaders
        ),
        qualified AS (
          SELECT m.*
          FROM merged m CROSS JOIN floors f
          WHERE (m.role='SP' AND m._ip >= f.sp_floor)
             OR (m.role='RP' AND m._ip >= f.rp_floor)
        ),
        unpivoted AS (
          SELECT q.role, m.metric, m.val, m.higher_better
          FROM qualified q
          CROSS JOIN LATERAL (VALUES
            ('avg_brink',       q.avg_brink,       true),
            ('avg_cluster',     q.avg_cluster,     false),
            ('avg_cluster_r',   q.avg_cluster_r,   false),
            ('avg_cluster_l',   q.avg_cluster_l,   false),
            ('avg_hdev',        q.avg_hdev,        false),
            ('avg_vdev',        q.avg_vdev,        false),
            ('avg_missfire',    q.avg_missfire,    false),
            ('close_pct',       q.close_pct,       true),
            ('waste_pct',       q.waste_pct,       false),
            ('deception_score', q.deception_score, true),
            ('unique_score',    q.unique_score,    true)
          ) m(metric, val, higher_better)
          WHERE m.val IS NOT NULL
        ),
        sorted AS (
          SELECT role, metric, higher_better,
            array_agg(val ORDER BY val) AS vals,
            COUNT(*) AS n
          FROM unpivoted
          GROUP BY role, metric, higher_better
        )
        INSERT INTO league_percentiles (season, level, role, metric, breakpoints, higher_better, n_qualified, updated_at)
        SELECT %L, %L, s.role, s.metric,
          ARRAY(
            SELECT s.vals[GREATEST(1, LEAST(s.n::int, ceil(p.p * s.n / 100.0)::int))]
            FROM generate_series(1, 99) AS p(p)
          ),
          s.higher_better,
          s.n::int,
          now()
        FROM sorted s;
      $sql$, v_start, v_end, p_season, p_season, p_season, v_level);
    END IF;

    -- ═════════════════════════════════════════════════════════════════════
    -- ERA ESTIMATORS BLOCK (MLB + MiLB, SP/RP) — FIP, xFIP, xERA, SIERA
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
               GREATEST(5.0, 0.20 * COALESCE(rp_lead,0)) AS rp_floor
        FROM leaders
      ),
      qual AS (
        SELECT p.*,
          CASE WHEN p._ip > 0
               THEN ((13.0 * p._hr + 3.0 * (p._bb + p._hbp) - 2.0 * p._k) / p._ip) + %L::numeric
               ELSE NULL END AS fip,
          CASE WHEN p._ip > 0 AND p._fb > 0
               THEN ((13.0 * (p._fb::numeric * %L::numeric) + 3.0 * (p._bb + p._hbp) - 2.0 * p._k) / p._ip) + %L::numeric
               ELSE NULL END AS xfip,
          CASE WHEN p._ip > 0 AND p._pa > 0 AND p._xwoba IS NOT NULL
               THEN ((p._xwoba - %L::numeric) / %L::numeric) * (p._pa::numeric / p._ip) * 9.0 + %L::numeric
               ELSE NULL END AS xera,
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
        WHERE (p.role='SP' AND p._ip >= f.sp_floor)
           OR (p.role='RP' AND p._ip >= f.rp_floor)
      ),
      unpivoted AS (
        SELECT q.role, m.metric, m.val, m.higher_better
        FROM qual q
        CROSS JOIN LATERAL (VALUES
          ('fip',   q.fip,   false),
          ('xfip',  q.xfip,  false),
          ('xera',  q.xera,  false),
          ('siera', q.siera, false)
        ) m(metric, val, higher_better)
        WHERE m.val IS NOT NULL
      ),
      sorted AS (
        SELECT role, metric, higher_better,
          array_agg(val ORDER BY val) AS vals,
          COUNT(*) AS n
        FROM unpivoted
        GROUP BY role, metric, higher_better
      )
      INSERT INTO league_percentiles (season, level, role, metric, breakpoints, higher_better, n_qualified, updated_at)
      SELECT %L, %L, s.role, s.metric,
        ARRAY(
          SELECT s.vals[GREATEST(1, LEAST(s.n::int, ceil(p.p * s.n / 100.0)::int))]
          FROM generate_series(1, 99) AS p(p)
        ),
        s.higher_better,
        s.n::int,
        now()
      FROM sorted s;
    $sql$, v_table, v_start, v_end,
           v_cfip, v_lg_hr_fb, v_cfip, v_lg_woba, v_woba_scale, v_lg_era,
           p_season, v_level);

  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION refresh_league_percentiles(integer) IS
  'Recomputes league_percentiles for one season across MLB + MiLB × hitter/SP/RP. Idempotent: deletes and reinserts rows for p_season. Produces 99 empirical breakpoints per metric from the actual qualified-player pool.';
