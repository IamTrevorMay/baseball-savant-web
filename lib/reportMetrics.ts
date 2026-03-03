/**
 * Shared SQL metric definitions used by /api/report and /api/scene-stats.
 */

export const METRICS: Record<string, string> = {
  // Counting
  pitches: 'COUNT(*)',
  pa: "COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END)",
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
  k_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)",
  bb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)",
  whiff_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%') / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip'), 0), 1)",
  csw_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'called_strike') / NULLIF(COUNT(*), 0), 1)",
  zone_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9) / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0), 1)",
  chase_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone > 9 AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play')) / NULLIF(COUNT(*) FILTER (WHERE zone > 9), 0), 1)",
  // Batting
  ba: "ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::numeric / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3)",
  slg: "ROUND((COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3)",
  obp: "ROUND((COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run','walk','hit_by_pitch')))::numeric / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 3)",
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
  // Counting — hit outcomes
  h: "COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))",
  singles: "COUNT(*) FILTER (WHERE events = 'single')",
  doubles: "COUNT(*) FILTER (WHERE events = 'double')",
  triples: "COUNT(*) FILTER (WHERE events = 'triple')",
  hr_count: "COUNT(*) FILTER (WHERE events = 'home_run')",
  bb_count: "COUNT(*) FILTER (WHERE events = 'walk')",
  k_count: "COUNT(*) FILTER (WHERE events LIKE '%strikeout%')",
  hbp_count: "COUNT(*) FILTER (WHERE events = 'hit_by_pitch')",
  // Rate — additional
  k_minus_bb: "ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0) - 100.0 * COUNT(*) FILTER (WHERE events = 'walk') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)",
  swstr_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%') / NULLIF(COUNT(*), 0), 1)",
  hard_hit_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95) / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0), 1)",
  barrel_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 98 AND launch_angle BETWEEN 8 AND 32) / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0), 1)",
  ops: "ROUND((COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run','walk','hit_by_pitch')))::numeric / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0) + (COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3)",
  contact_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description IN ('foul','foul_tip','hit_into_play','foul_bunt')) / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description IN ('foul','foul_tip','hit_into_play','foul_bunt')), 0), 1)",
  z_swing_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9 AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play')) / NULLIF(COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9), 0), 1)",
  o_contact_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone > 9 AND description IN ('foul','foul_tip','hit_into_play','foul_bunt')) / NULLIF(COUNT(*) FILTER (WHERE zone > 9 AND (description LIKE '%swinging_strike%' OR description IN ('foul','foul_tip','hit_into_play','foul_bunt'))), 0), 1)",
  // Usage
  usage_pct: 'ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY player_name), 0), 1)',
  // Swing
  avg_bat_speed: 'ROUND(AVG(bat_speed)::numeric, 1)',
  avg_swing_length: 'ROUND(AVG(swing_length)::numeric, 2)',
}

/** Subset of metrics available for scene data binding */
export const SCENE_METRICS: { value: string; label: string; group?: string }[] = [
  // Stuff / Arsenal
  { value: 'avg_velo', label: 'Avg Velocity', group: 'Stuff' },
  { value: 'max_velo', label: 'Max Velocity', group: 'Stuff' },
  { value: 'avg_spin', label: 'Avg Spin Rate', group: 'Stuff' },
  { value: 'avg_hbreak_in', label: 'H-Break (in)', group: 'Stuff' },
  { value: 'avg_ivb_in', label: 'IVB (in)', group: 'Stuff' },
  { value: 'avg_ext', label: 'Extension', group: 'Stuff' },
  { value: 'avg_arm_angle', label: 'Arm Angle', group: 'Stuff' },
  // Rates
  { value: 'whiff_pct', label: 'Whiff %', group: 'Rates' },
  { value: 'k_pct', label: 'K %', group: 'Rates' },
  { value: 'bb_pct', label: 'BB %', group: 'Rates' },
  { value: 'k_minus_bb', label: 'K-BB %', group: 'Rates' },
  { value: 'csw_pct', label: 'CSW %', group: 'Rates' },
  { value: 'swstr_pct', label: 'SwStr %', group: 'Rates' },
  { value: 'zone_pct', label: 'Zone %', group: 'Rates' },
  { value: 'chase_pct', label: 'Chase %', group: 'Rates' },
  { value: 'contact_pct', label: 'Contact %', group: 'Rates' },
  { value: 'z_swing_pct', label: 'Z-Swing %', group: 'Rates' },
  { value: 'o_contact_pct', label: 'O-Contact %', group: 'Rates' },
  // Batting
  { value: 'ba', label: 'AVG', group: 'Batting' },
  { value: 'obp', label: 'OBP', group: 'Batting' },
  { value: 'slg', label: 'SLG', group: 'Batting' },
  { value: 'ops', label: 'OPS', group: 'Batting' },
  // Expected
  { value: 'avg_xba', label: 'xBA', group: 'Expected' },
  { value: 'avg_xwoba', label: 'xwOBA', group: 'Expected' },
  { value: 'avg_xslg', label: 'xSLG', group: 'Expected' },
  { value: 'avg_woba', label: 'wOBA', group: 'Expected' },
  { value: 'total_re24', label: 'RE24', group: 'Expected' },
  // Batted Ball
  { value: 'avg_ev', label: 'Avg Exit Velo', group: 'Batted Ball' },
  { value: 'max_ev', label: 'Max Exit Velo', group: 'Batted Ball' },
  { value: 'avg_la', label: 'Avg Launch Angle', group: 'Batted Ball' },
  { value: 'avg_dist', label: 'Avg Distance', group: 'Batted Ball' },
  { value: 'hard_hit_pct', label: 'Hard Hit %', group: 'Batted Ball' },
  { value: 'barrel_pct', label: 'Barrel %', group: 'Batted Ball' },
  { value: 'gb_pct', label: 'GB %', group: 'Batted Ball' },
  { value: 'fb_pct', label: 'FB %', group: 'Batted Ball' },
  { value: 'ld_pct', label: 'LD %', group: 'Batted Ball' },
  { value: 'pu_pct', label: 'PU %', group: 'Batted Ball' },
  // Swing
  { value: 'avg_bat_speed', label: 'Bat Speed', group: 'Swing' },
  { value: 'avg_swing_length', label: 'Swing Length', group: 'Swing' },
  // Counting
  { value: 'pitches', label: 'Pitch Count', group: 'Counting' },
  { value: 'pa', label: 'PA', group: 'Counting' },
  { value: 'games', label: 'Games', group: 'Counting' },
  { value: 'h', label: 'Hits', group: 'Counting' },
  { value: 'hr_count', label: 'Home Runs', group: 'Counting' },
  { value: 'k_count', label: 'Strikeouts', group: 'Counting' },
  { value: 'bb_count', label: 'Walks', group: 'Counting' },
  { value: 'doubles', label: 'Doubles', group: 'Counting' },
  { value: 'triples', label: 'Triples', group: 'Counting' },
  { value: 'hbp_count', label: 'HBP', group: 'Counting' },
  { value: 'usage_pct', label: 'Usage %', group: 'Counting' },
  // Triton (Raw Command)
  { value: 'avg_brink', label: 'Brink', group: 'Triton' },
  { value: 'avg_cluster', label: 'Cluster', group: 'Triton' },
  { value: 'avg_hdev', label: 'HDev', group: 'Triton' },
  { value: 'avg_vdev', label: 'VDev', group: 'Triton' },
  { value: 'avg_missfire', label: 'Missfire %', group: 'Triton' },
  { value: 'waste_pct', label: 'Waste %', group: 'Triton' },
  // Triton+ (Command)
  { value: 'cmd_plus', label: 'Cmd+', group: 'Triton+' },
  { value: 'rpcom_plus', label: 'RPCom+', group: 'Triton+' },
  { value: 'brink_plus', label: 'Brink+', group: 'Triton+' },
  { value: 'cluster_plus', label: 'Cluster+', group: 'Triton+' },
  { value: 'hdev_plus', label: 'HDev+', group: 'Triton+' },
  { value: 'vdev_plus', label: 'VDev+', group: 'Triton+' },
  { value: 'missfire_plus', label: 'Miss+', group: 'Triton+' },
  // Deception
  { value: 'deception_score', label: 'Deception', group: 'Deception' },
  { value: 'unique_score', label: 'Unique', group: 'Deception' },
  { value: 'xdeception_score', label: 'xDeception', group: 'Deception' },
  // ERA Estimators
  { value: 'era', label: 'ERA', group: 'ERA Estimators' },
  { value: 'fip', label: 'FIP', group: 'ERA Estimators' },
  { value: 'xera', label: 'xERA', group: 'ERA Estimators' },
]

/** Set of metrics that come from pre-computed tables instead of pitches aggregation */
export const TRITON_PLUS_METRIC_KEYS = new Set([
  'cmd_plus', 'rpcom_plus', 'brink_plus', 'cluster_plus', 'hdev_plus', 'vdev_plus', 'missfire_plus',
  'avg_brink', 'avg_cluster', 'avg_hdev', 'avg_vdev', 'avg_missfire', 'waste_pct',
])
export const DECEPTION_METRIC_KEYS = new Set(['deception_score', 'unique_score', 'xdeception_score'])
export const ERA_METRIC_KEYS = new Set(['era', 'fip', 'xera'])
