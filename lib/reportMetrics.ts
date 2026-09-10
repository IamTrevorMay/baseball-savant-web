/**
 * Shared SQL metric definitions used by /api/report and /api/scene-stats.
 *
 * Conventions: FanGraphs-standard accounting stats with Savant-standard
 * measurement metrics (Trevor, 2026-09-11): FB% folds popups in (GB+LD+FB =
 * 100) and iffb_pct (popups / all fly balls) replaces pu_pct — everything
 * else matches Baseball Savant where Savant publishes the metric
 * (verified 2026-09-09 by reproducing Savant's displayed values exactly for
 * Skenes/Skubal/Judge — see docs/VARIABLES.md):
 * - Whiff counts foul tips (foul_tip, bunt_foul_tip) as swinging strikes.
 * - PA excludes truncated_pa and baserunning-only events (matches batters faced).
 * - BB / OBP include intentional walks; wOBA and xwOBA exclude them entirely.
 * - AB is a positive event list (intent_walk / truncated_pa never count as AB).
 * - Barrel%, Hard-Hit%, GB/FB/LD/PU% are per batted-ball event (bb_type set).
 * - xBA/xSLG divide summed per-BBE estimates by AB (strikeouts add 0).
 * - xwOBA = (Σ est_wOBA over BBE + 0.7·uBB + 0.7·HBP) / (AB + uBB + SF + HBP).
 * - wOBA is derived from events with static Statcast-style weights
 *   (.7/.7/.9/1.25/1.6/2.0) — not the stored woba_value column, which
 *   miscredits errors/fielder's choice. Savant's seasonal weights differ by
 *   ~.003; documented approximation.
 * Contact%/O-Contact%/Z-Swing% stay FanGraphs-style (foul tip = contact) and
 * CSW%/SwStr%/FPS% keep their conventional definitions — Savant publishes no
 * equivalent, so whiff% + contact% intentionally exceeds 100 by the foul-tip share.
 */

// Events that end a plate appearance but do not count as one (or are
// baserunning/administrative rows): excluded from every PA denominator.
export const NON_PA_EVENTS = "'truncated_pa','game_advisory','ejection','wild_pitch','passed_ball','other_advance','runner_double_play','caught_stealing_2b','caught_stealing_3b','caught_stealing_home','pickoff_1b','pickoff_2b','pickoff_3b','pickoff_caught_stealing_2b','pickoff_caught_stealing_3b','pickoff_caught_stealing_home','stolen_base_2b','stolen_base_3b','stolen_base_home'"
export const PA_COUNT = `COUNT(DISTINCT CASE WHEN events IS NOT NULL AND events NOT IN (${NON_PA_EVENTS}) THEN game_pk::bigint * 10000 + at_bat_number END)`

// Official at-bats as a positive list (reproduces Savant AB exactly).
export const AB_EVENTS = "'single','double','triple','home_run','field_out','strikeout','strikeout_double_play','grounded_into_double_play','force_out','double_play','field_error','fielders_choice','fielders_choice_out','triple_play','other_out'"
export const AB_COUNT = `COUNT(*) FILTER (WHERE events IN (${AB_EVENTS}))`

// wOBA/xwOBA denominator: AB + unintentional BB + SF + HBP (no IBB, no CI).
export const WOBA_DENOM = `COUNT(*) FILTER (WHERE events IN (${AB_EVENTS},'walk','hit_by_pitch','sac_fly','sac_fly_double_play'))`

// Savant xwOBA numerator+denominator as one expression, reusable outside METRICS.
export const XWOBA_SQL = `ROUND((COALESCE(SUM(estimated_woba_using_speedangle) FILTER (WHERE description LIKE 'hit_into_play%'), 0) + 0.7 * COUNT(*) FILTER (WHERE events = 'walk') + 0.7 * COUNT(*) FILTER (WHERE events = 'hit_by_pitch'))::numeric / NULLIF(${WOBA_DENOM}, 0), 3)`

// Event-derived wOBA with static Statcast-style weights (stored woba_value
// miscredits errors/FC/CI). IBB excluded from numerator and denominator.
export const WOBA_EVENT_SQL = `ROUND((0.7 * COUNT(*) FILTER (WHERE events = 'walk') + 0.7 * COUNT(*) FILTER (WHERE events = 'hit_by_pitch') + 0.9 * COUNT(*) FILTER (WHERE events = 'single') + 1.25 * COUNT(*) FILTER (WHERE events = 'double') + 1.6 * COUNT(*) FILTER (WHERE events = 'triple') + 2.0 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric / NULLIF(${WOBA_DENOM}, 0), 3)`

// Savant whiff: swing-and-miss plus foul tips.
export const WHIFFS = "COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description IN ('missed_bunt','swinging_pitchout','foul_tip','bunt_foul_tip'))"
export const SWINGS = "COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description LIKE 'hit_into_play%' OR description = 'missed_bunt' OR description = 'swinging_pitchout')"

export const METRICS: Record<string, string> = {
  // Counting
  pitches: 'COUNT(*)',
  pa: PA_COUNT,
  games: 'COUNT(DISTINCT game_pk)',
  ip: "ROUND((COUNT(*) FILTER (WHERE events IN ('strikeout','field_out','force_out','fielders_choice','fielders_choice_out','sac_fly','sac_bunt')) + 2 * COUNT(*) FILTER (WHERE events IN ('strikeout_double_play','double_play','grounded_into_double_play','sac_fly_double_play')) + 3 * COUNT(*) FILTER (WHERE events = 'triple_play'))::numeric / 3, 1)",
  // Averages
  avg_velo: 'ROUND(AVG(release_speed)::numeric, 1)',
  max_velo: 'ROUND(MAX(release_speed)::numeric, 1)',
  avg_spin: 'ROUND(AVG(release_spin_rate)::numeric, 0)',
  avg_ext: 'ROUND(AVG(release_extension)::numeric, 2)',
  avg_hbreak_in: 'ROUND(AVG(pfx_x * 12)::numeric, 1)',
  avg_ivb_in: 'ROUND(AVG(pfx_z * 12)::numeric, 1)',
  avg_arm_angle: 'ROUND(AVG(arm_angle)::numeric, 1)',
  // Batted Ball — gated to batted-ball events: fouls can carry tracked
  // launch_speed/launch_angle, and Savant averages over BBE only.
  avg_ev: 'ROUND(AVG(launch_speed) FILTER (WHERE bb_type IS NOT NULL)::numeric, 1)',
  max_ev: 'ROUND(MAX(launch_speed) FILTER (WHERE bb_type IS NOT NULL)::numeric, 1)',
  avg_la: 'ROUND(AVG(launch_angle) FILTER (WHERE bb_type IS NOT NULL)::numeric, 1)',
  avg_dist: 'ROUND(AVG(hit_distance_sc) FILTER (WHERE bb_type IS NOT NULL)::numeric, 0)',
  // Rates
  k_pct: `ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(${PA_COUNT}, 0), 1)`,
  bb_pct: `ROUND(100.0 * COUNT(*) FILTER (WHERE events IN ('walk','intent_walk')) / NULLIF(${PA_COUNT}, 0), 1)`,
  whiff_pct: `ROUND(100.0 * ${WHIFFS} / NULLIF(${SWINGS}, 0), 1)`,
  csw_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'called_strike' OR description = 'swinging_pitchout') / NULLIF(COUNT(*), 0), 1)",
  cs_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description = 'called_strike') / NULLIF(COUNT(*), 0), 1)",
  fps_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE pitch_number = 1 AND (description = 'called_strike' OR description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description LIKE 'hit_into_play%' OR description = 'missed_bunt' OR description = 'swinging_pitchout')) / NULLIF(COUNT(*) FILTER (WHERE pitch_number = 1), 0), 1)",
  zone_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9) / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0), 1)",
  chase_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone > 9 AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description LIKE 'hit_into_play%' OR description = 'missed_bunt' OR description = 'swinging_pitchout')) / NULLIF(COUNT(*) FILTER (WHERE zone > 9), 0), 1)",
  // Batting
  ba: `ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::numeric / NULLIF(${AB_COUNT}, 0), 3)`,
  slg: `ROUND((COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric / NULLIF(${AB_COUNT}, 0), 3)`,
  obp: `ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run','walk','intent_walk','hit_by_pitch'))::numeric / NULLIF(COUNT(*) FILTER (WHERE events IN (${AB_EVENTS},'walk','intent_walk','hit_by_pitch','sac_fly','sac_fly_double_play')), 0), 3)`,
  // Expected
  avg_xba: `ROUND(SUM(estimated_ba_using_speedangle)::numeric / NULLIF(${AB_COUNT}, 0), 3)`,
  avg_xwoba: XWOBA_SQL,
  // estimated_slg_using_speedangle is NULL on every non-batted-ball event;
  // divide the per-BBE sum by at-bats so strikeouts count as 0, matching avg_xba.
  avg_xslg: `ROUND(SUM(estimated_slg_using_speedangle)::numeric / NULLIF(${AB_COUNT}, 0), 3)`,
  avg_woba: WOBA_EVENT_SQL,
  total_re24: 'ROUND(SUM(delta_run_exp)::numeric, 1)',
  // GB/FB/LD
  gb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'ground_ball') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  // FG convention (2026-09-11): FB% folds popups in, so GB+LD+FB = 100
  fb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type IN ('fly_ball','popup')) / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  ld_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'line_drive') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  iffb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'popup') / NULLIF(COUNT(*) FILTER (WHERE bb_type IN ('fly_ball','popup')), 0), 1)",
  // Counting — hit outcomes
  h: "COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))",
  singles: "COUNT(*) FILTER (WHERE events = 'single')",
  doubles: "COUNT(*) FILTER (WHERE events = 'double')",
  triples: "COUNT(*) FILTER (WHERE events = 'triple')",
  hr_count: "COUNT(*) FILTER (WHERE events = 'home_run')",
  bb_count: "COUNT(*) FILTER (WHERE events IN ('walk','intent_walk'))",
  k_count: "COUNT(*) FILTER (WHERE events LIKE '%strikeout%')",
  hbp_count: "COUNT(*) FILTER (WHERE events = 'hit_by_pitch')",
  // Rate — additional
  k_minus_bb: `ROUND(100.0 * (COUNT(*) FILTER (WHERE events LIKE '%strikeout%') - COUNT(*) FILTER (WHERE events IN ('walk','intent_walk'))) / NULLIF(${PA_COUNT}, 0), 1)`,
  swstr_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'swinging_pitchout') / NULLIF(COUNT(*), 0), 1)",
  hard_hit_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95 AND bb_type IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  barrel_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed_angle::text = '6') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  ops: `ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run','walk','intent_walk','hit_by_pitch'))::numeric / NULLIF(COUNT(*) FILTER (WHERE events IN (${AB_EVENTS},'walk','intent_walk','hit_by_pitch','sac_fly','sac_fly_double_play')), 0) + (COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric / NULLIF(${AB_COUNT}, 0), 3)`,
  contact_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description IN ('foul','foul_tip','hit_into_play','hit_into_play_no_out','hit_into_play_score','foul_bunt','bunt_foul_tip','foul_pitchout')) / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description IN ('foul','foul_tip','hit_into_play','hit_into_play_no_out','hit_into_play_score','foul_bunt','bunt_foul_tip','foul_pitchout','missed_bunt') OR description = 'swinging_pitchout'), 0), 1)",
  z_swing_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9 AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description LIKE 'hit_into_play%' OR description = 'missed_bunt' OR description = 'swinging_pitchout')) / NULLIF(COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9), 0), 1)",
  o_contact_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone > 9 AND description IN ('foul','foul_tip','hit_into_play','hit_into_play_no_out','hit_into_play_score','foul_bunt','bunt_foul_tip','foul_pitchout')) / NULLIF(COUNT(*) FILTER (WHERE zone > 9 AND (description LIKE '%swinging_strike%' OR description IN ('foul','foul_tip','hit_into_play','hit_into_play_no_out','hit_into_play_score','foul_bunt','bunt_foul_tip','foul_pitchout','missed_bunt') OR description = 'swinging_pitchout')), 0), 1)",
  // Usage
  // {{USAGE_PARTITION}} is substituted by the query builder with the active groupBy
  // columns minus pitch_name. A hardcoded player_name partition summed across every
  // other grouped dimension (season, hand, ...), deflating usage to a fraction of true.
  usage_pct: 'ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY {{USAGE_PARTITION}}), 0), 1)',
  // Swing
  avg_bat_speed: 'ROUND(AVG(bat_speed)::numeric, 1)',
  avg_swing_length: 'ROUND(AVG(swing_length)::numeric, 2)',
  avg_attack_angle: 'ROUND(AVG(attack_angle)::numeric, 1)',
  avg_attack_direction: 'ROUND(AVG(attack_direction)::numeric, 1)',
  avg_swing_path_tilt: 'ROUND(AVG(swing_path_tilt)::numeric, 1)',
  fast_swing_rate: "ROUND(100.0 * COUNT(*) FILTER (WHERE bat_speed >= 75) / NULLIF(COUNT(*) FILTER (WHERE bat_speed IS NOT NULL), 0), 1)",
  squared_up_rate: "ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 0.8 * (1.23 * bat_speed + 0.23 * release_speed) AND bat_speed IS NOT NULL AND bb_type IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE bat_speed IS NOT NULL AND bb_type IS NOT NULL), 0), 1)",
  blast_rate: "ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 0.8 * (1.23 * bat_speed + 0.23 * release_speed) AND bat_speed >= 75 AND bat_speed IS NOT NULL AND bb_type IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE bat_speed IS NOT NULL AND bb_type IS NOT NULL), 0), 1)",
  ideal_attack_angle_rate: "ROUND(100.0 * COUNT(*) FILTER (WHERE attack_angle BETWEEN 5 AND 20) / NULLIF(COUNT(*) FILTER (WHERE attack_angle IS NOT NULL), 0), 1)",
}

/** MLB team primary colors for themed bindings */
export const MLB_TEAM_COLORS: Record<string, string> = {
  ARI: '#A71930', ATL: '#CE1141', BAL: '#DF4601', BOS: '#BD3039',
  CHC: '#0E3386', CWS: '#27251F', CIN: '#C6011F', CLE: '#E31937',
  COL: '#33006F', DET: '#0C2340', HOU: '#EB6E1F', KC: '#004687',
  LAA: '#BA0021', LAD: '#005A9C', MIA: '#00A3E0', MIL: '#FFC52F',
  MIN: '#D31145', NYM: '#FF5910', NYY: '#003087', OAK: '#003831',
  PHI: '#E81828', PIT: '#FDB827', SD: '#2F241D', SF: '#FD5A1E',
  SEA: '#005C5C', STL: '#C41E3A', TB: '#092C5C', TEX: '#003278',
  TOR: '#134A8E', WSH: '#AB0003',
}

/** Game metrics for live-game data binding */
export const GAME_METRICS: { value: string; label: string; group: string }[] = [
  // Teams
  { value: 'away_abbrev', label: 'Away Team', group: 'Teams' },
  { value: 'home_abbrev', label: 'Home Team', group: 'Teams' },
  { value: 'away_name', label: 'Away Full Name', group: 'Teams' },
  { value: 'home_name', label: 'Home Full Name', group: 'Teams' },
  // Themed
  { value: 'away_abbrev_themed', label: 'Away Team (Themed)', group: 'Themed' },
  { value: 'home_abbrev_themed', label: 'Home Team (Themed)', group: 'Themed' },
  { value: 'matchup_themed', label: 'Away - Home (Themed)', group: 'Themed' },
  // Score
  { value: 'away_score', label: 'Away Score', group: 'Score' },
  { value: 'home_score', label: 'Home Score', group: 'Score' },
  // Game State
  { value: 'inning_display', label: 'Inning (e.g. Top 5th)', group: 'State' },
  { value: 'inning_half', label: 'Inning Half', group: 'State' },
  { value: 'inning_ordinal', label: 'Inning Ordinal', group: 'State' },
  { value: 'outs', label: 'Outs', group: 'State' },
  { value: 'game_state', label: 'Game State', group: 'State' },
  { value: 'detailed_state', label: 'Detailed State', group: 'State' },
  { value: 'state_line', label: 'State Line (e.g. BOT 7 · 2 OUT)', group: 'State' },
  // Runners
  { value: 'on_first', label: 'Runner on 1B', group: 'Runners' },
  { value: 'on_second', label: 'Runner on 2B', group: 'Runners' },
  { value: 'on_third', label: 'Runner on 3B', group: 'Runners' },
  // Players
  { value: 'pitcher_name', label: 'Current Pitcher', group: 'Players' },
  { value: 'batter_name', label: 'Current Batter', group: 'Players' },
  { value: 'probable_away', label: 'Probable Pitcher (Away)', group: 'Players' },
  { value: 'probable_home', label: 'Probable Pitcher (Home)', group: 'Players' },
]

/** Subset of metrics available for scene data binding */
export const SCENE_METRICS: { value: string; label: string; group?: string }[] = [
  // Player Info
  { value: 'player_name', label: 'Player Name', group: 'Info' },
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
  { value: 'wrc_plus', label: 'wRC+', group: 'Batting' },
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
  { value: 'iffb_pct', label: 'IFFB %', group: 'Batted Ball' },
  // Swing
  { value: 'avg_bat_speed', label: 'Bat Speed', group: 'Swing' },
  { value: 'avg_swing_length', label: 'Swing Length', group: 'Swing' },
  { value: 'avg_attack_angle', label: 'Attack Angle', group: 'Swing' },
  { value: 'avg_attack_direction', label: 'Attack Direction', group: 'Swing' },
  { value: 'avg_swing_path_tilt', label: 'Swing Path Tilt', group: 'Swing' },
  { value: 'fast_swing_rate', label: 'Fast Swing %', group: 'Swing' },
  { value: 'squared_up_rate', label: 'Squared Up %', group: 'Swing' },
  { value: 'blast_rate', label: 'Blast %', group: 'Swing' },
  { value: 'ideal_attack_angle_rate', label: 'Ideal AA %', group: 'Swing' },
  // Counting
  { value: 'pitches', label: 'Pitch Count', group: 'Counting' },
  { value: 'pa', label: 'PA', group: 'Counting' },
  { value: 'games', label: 'Games', group: 'Counting' },
  { value: 'ip', label: 'IP', group: 'Counting' },
  { value: 'h', label: 'Hits', group: 'Counting' },
  { value: 'hr_count', label: 'Home Runs', group: 'Counting' },
  { value: 'k_count', label: 'Strikeouts', group: 'Counting' },
  { value: 'bb_count', label: 'Walks', group: 'Counting' },
  { value: 'doubles', label: 'Doubles', group: 'Counting' },
  { value: 'triples', label: 'Triples', group: 'Counting' },
  { value: 'hbp_count', label: 'HBP', group: 'Counting' },
  { value: 'usage_pct', label: 'Usage %', group: 'Counting' },
  { value: 'runs', label: 'Runs', group: 'Counting' },
  // Triton (Raw Command)
  { value: 'avg_brink', label: 'Brink', group: 'Triton' },
  { value: 'avg_cluster', label: 'Cluster', group: 'Triton' },
  { value: 'avg_cluster_r', label: 'ClusterR', group: 'Triton' },
  { value: 'avg_cluster_l', label: 'ClusterL', group: 'Triton' },
  { value: 'avg_hdev', label: 'HDev', group: 'Triton' },
  { value: 'avg_vdev', label: 'VDev', group: 'Triton' },
  { value: 'avg_missfire', label: 'Missfire', group: 'Triton' },
  { value: 'close_pct', label: 'Close %', group: 'Triton' },
  { value: 'waste_pct', label: 'Waste %', group: 'Triton' },
  // Triton+ (Command)
  { value: 'cmd_plus', label: 'Cmd+', group: 'Triton+' },
  { value: 'rpcom_plus', label: 'RPCom+', group: 'Triton+' },
  { value: 'brink_plus', label: 'Brink+', group: 'Triton+' },
  { value: 'cluster_plus', label: 'Cluster+', group: 'Triton+' },
  { value: 'cluster_r_plus', label: 'ClusterR+', group: 'Triton+' },
  { value: 'cluster_l_plus', label: 'ClusterL+', group: 'Triton+' },
  { value: 'hdev_plus', label: 'HDev+', group: 'Triton+' },
  { value: 'vdev_plus', label: 'VDev+', group: 'Triton+' },
  { value: 'missfire_plus', label: 'Missfire+', group: 'Triton+' },
  { value: 'close_pct_plus', label: 'Close+', group: 'Triton+' },
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
  'cmd_plus', 'rpcom_plus', 'brink_plus', 'cluster_plus', 'cluster_r_plus', 'cluster_l_plus',
  'hdev_plus', 'vdev_plus', 'missfire_plus', 'close_pct_plus',
  'avg_brink', 'avg_cluster', 'avg_cluster_r', 'avg_cluster_l',
  'avg_hdev', 'avg_vdev', 'avg_missfire', 'close_pct', 'waste_pct',
])
export const DECEPTION_METRIC_KEYS = new Set(['deception_score', 'unique_score', 'xdeception_score'])
export const ERA_METRIC_KEYS = new Set(['era', 'fip', 'xera'])
/** Metrics computed in JS from pitches + constants (not simple SQL expressions) */
export const COMPUTED_METRIC_KEYS = new Set(['wrc_plus', 'runs'])
