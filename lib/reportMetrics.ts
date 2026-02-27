/**
 * Shared SQL metric definitions used by /api/report and /api/scene-stats.
 */

export const METRICS: Record<string, string> = {
  // Counting
  pitches: 'COUNT(*)',
  pa: "COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, '-', at_bat_number) END)",
  games: 'COUNT(DISTINCT game_pk)',
  // Averages
  avg_velo: 'ROUND(AVG(release_speed)::numeric, 1)',
  max_velo: 'ROUND(MAX(release_speed)::numeric, 1)',
  avg_spin: 'ROUND(AVG(release_spin_rate)::numeric, 0)',
  avg_ext: 'ROUND(AVG(release_extension)::numeric, 2)',
  avg_hbreak_in: 'ROUND(AVG(pfx_x * 12)::numeric, 1)',
  avg_ivb_in: 'ROUND(AVG(pfx_z * 12)::numeric, 1)',
  avg_arm_angle: 'ROUND(AVG(arm_angle)::numeric, 1)',
  // Batted Ball
  avg_ev: 'ROUND(AVG(launch_speed)::numeric, 1)',
  max_ev: 'ROUND(MAX(launch_speed)::numeric, 1)',
  avg_la: 'ROUND(AVG(launch_angle)::numeric, 1)',
  avg_dist: 'ROUND(AVG(hit_distance_sc)::numeric, 0)',
  // Rates
  k_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, '-', at_bat_number) END), 0), 1)",
  bb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, '-', at_bat_number) END), 0), 1)",
  whiff_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%') / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip'), 0), 1)",
  csw_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'called_strike') / NULLIF(COUNT(*), 0), 1)",
  zone_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9) / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0), 1)",
  chase_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone > 9 AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play')) / NULLIF(COUNT(*) FILTER (WHERE zone > 9), 0), 1)",
  // Batting
  ba: "ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::numeric / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3)",
  slg: "ROUND((COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3)",
  obp: "ROUND((COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run','walk','hit_by_pitch')))::numeric / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, '-', at_bat_number) END), 0), 3)",
  // Expected
  avg_xba: 'ROUND(AVG(estimated_ba_using_speedangle)::numeric, 3)',
  avg_xwoba: 'ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3)',
  avg_xslg: 'ROUND(AVG(estimated_slg_using_speedangle)::numeric, 3)',
  avg_woba: 'ROUND(AVG(woba_value)::numeric, 3)',
  total_re24: 'ROUND(SUM(delta_run_exp)::numeric, 1)',
  // GB/FB/LD
  gb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'ground_ball') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  fb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'fly_ball') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  ld_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'line_drive') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  pu_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'popup') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  // Usage
  usage_pct: 'ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY player_name), 0), 1)',
  // Swing
  avg_bat_speed: 'ROUND(AVG(bat_speed)::numeric, 1)',
  avg_swing_length: 'ROUND(AVG(swing_length)::numeric, 2)',
}

/** Subset of metrics available for scene data binding */
export const SCENE_METRICS: { value: string; label: string }[] = [
  { value: 'avg_velo', label: 'Avg Velocity' },
  { value: 'max_velo', label: 'Max Velocity' },
  { value: 'avg_spin', label: 'Avg Spin Rate' },
  { value: 'whiff_pct', label: 'Whiff %' },
  { value: 'k_pct', label: 'K %' },
  { value: 'bb_pct', label: 'BB %' },
  { value: 'csw_pct', label: 'CSW %' },
  { value: 'zone_pct', label: 'Zone %' },
  { value: 'chase_pct', label: 'Chase %' },
  { value: 'avg_ev', label: 'Avg Exit Velo' },
  { value: 'avg_la', label: 'Avg Launch Angle' },
  { value: 'ba', label: 'AVG' },
  { value: 'obp', label: 'OBP' },
  { value: 'slg', label: 'SLG' },
  { value: 'avg_xba', label: 'xBA' },
  { value: 'avg_xwoba', label: 'xwOBA' },
  { value: 'avg_hbreak_in', label: 'H-Break (in)' },
  { value: 'avg_ivb_in', label: 'IVB (in)' },
  { value: 'avg_ext', label: 'Extension' },
  { value: 'pitches', label: 'Pitch Count' },
  { value: 'games', label: 'Games' },
  { value: 'usage_pct', label: 'Usage %' },
  { value: 'gb_pct', label: 'GB %' },
  { value: 'fb_pct', label: 'FB %' },
]
