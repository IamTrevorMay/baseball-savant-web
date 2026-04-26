/**
 * Pure filter engine logic — server-safe.
 *
 * The catalog + types + apply* helpers used to live in
 * components/FilterEngine.tsx, which is a 'use client' module. Server
 * code (e.g. the Imagine Heat Maps widget's fetchData, which runs in
 * /api/imagine/render) needs `applyFiltersToData` without dragging in
 * the React UI, so the pure pieces live here and the React component
 * file re-exports them.
 */

// ── Filter Definitions ───────────────────────────────────────────────────────
export interface FilterDef {
  key: string
  label: string
  category: string
  type: 'multi' | 'range' | 'date'
  options?: string[]
  numberCast?: boolean
  dbColumn?: string
}

export interface ActiveFilter {
  def: FilterDef
  values?: string[]
  min?: string
  max?: string
  startDate?: string
  endDate?: string
  readonly?: boolean
}

export const FILTER_CATALOG: FilterDef[] = [
  // Situational
  { key: 'game_year', label: 'Season', category: 'Situational', type: 'multi', numberCast: true },
  { key: 'pitch_name', label: 'Pitch Type', category: 'Pitch', type: 'multi' },
  { key: 'pitch_type', label: 'Pitch Code', category: 'Pitch', type: 'multi' },
  { key: 'stand', label: 'Batter Side', category: 'Situational', type: 'multi' },
  { key: 'p_throws', label: 'Pitcher Hand', category: 'Situational', type: 'multi' },
  { key: 'balls', label: 'Balls', category: 'Count', type: 'multi', numberCast: true },
  { key: 'strikes', label: 'Strikes', category: 'Count', type: 'multi', numberCast: true },
  { key: 'outs_when_up', label: 'Outs', category: 'Count', type: 'multi', numberCast: true },
  { key: 'inning', label: 'Inning', category: 'Situational', type: 'multi', numberCast: true },
  { key: 'inning_topbot', label: 'Half Inning', category: 'Situational', type: 'multi' },
  { key: 'game_type', label: 'Game Type', category: 'Situational', type: 'multi' },
  { key: 'home_team', label: 'Home Team', category: 'Team', type: 'multi' },
  { key: 'away_team', label: 'Away Team', category: 'Team', type: 'multi' },
  { key: 'zone', label: 'Zone', category: 'Location', type: 'multi', numberCast: true },
  // Date
  { key: 'game_date', label: 'Date Range', category: 'Situational', type: 'date' },
  // Pitch Characteristics
  { key: 'release_speed', label: 'Velocity', category: 'Pitch', type: 'range' },
  { key: 'effective_speed', label: 'Effective Speed', category: 'Pitch', type: 'range' },
  { key: 'release_spin_rate', label: 'Spin Rate', category: 'Pitch', type: 'range' },
  { key: 'spin_axis', label: 'Spin Axis', category: 'Pitch', type: 'range' },
  { key: 'release_extension', label: 'Extension', category: 'Release', type: 'range' },
  { key: 'arm_angle', label: 'Arm Angle', category: 'Release', type: 'range' },
  { key: 'release_pos_x', label: 'Release X', category: 'Release', type: 'range' },
  { key: 'release_pos_z', label: 'Release Z', category: 'Release', type: 'range' },
  { key: 'plate_x', label: 'Plate X', category: 'Location', type: 'range' },
  { key: 'plate_z', label: 'Plate Z', category: 'Location', type: 'range' },
  // Outcomes
  { key: 'type', label: 'Pitch Result (B/S/X)', category: 'Outcome', type: 'multi' },
  { key: 'events', label: 'Play Result', category: 'Outcome', type: 'multi' },
  { key: 'description', label: 'Description', category: 'Outcome', type: 'multi' },
  { key: 'bb_type', label: 'Batted Ball Type', category: 'Outcome', type: 'multi' },
  // Batted Ball
  { key: 'launch_speed', label: 'Exit Velocity', category: 'Batted Ball', type: 'range' },
  { key: 'launch_angle', label: 'Launch Angle', category: 'Batted Ball', type: 'range' },
  { key: 'hit_distance_sc', label: 'Distance', category: 'Batted Ball', type: 'range' },
  // Swing
  { key: 'bat_speed', label: 'Bat Speed', category: 'Swing', type: 'range' },
  { key: 'swing_length', label: 'Swing Length', category: 'Swing', type: 'range' },
  { key: 'attack_angle', label: 'Attack Angle', category: 'Swing', type: 'range' },
  { key: 'attack_direction', label: 'Attack Direction', category: 'Swing', type: 'range' },
  { key: 'swing_path_tilt', label: 'Swing Path Tilt', category: 'Swing', type: 'range' },
  // Expected
  { key: 'estimated_ba_using_speedangle', label: 'xBA', category: 'Expected', type: 'range' },
  { key: 'estimated_woba_using_speedangle', label: 'xwOBA', category: 'Expected', type: 'range' },
  { key: 'estimated_slg_using_speedangle', label: 'xSLG', category: 'Expected', type: 'range' },
  { key: 'woba_value', label: 'wOBA Value', category: 'Expected', type: 'range' },
  { key: 'delta_run_exp', label: 'Run Expectancy', category: 'Expected', type: 'range' },
  // Game State
  { key: 'home_score', label: 'Home Score', category: 'Game State', type: 'range' },
  { key: 'away_score', label: 'Away Score', category: 'Game State', type: 'range' },
  { key: 'n_thruorder_pitcher', label: 'Times Thru Order', category: 'Situational', type: 'range' },
  // Alignment
  { key: 'if_fielding_alignment', label: 'IF Alignment', category: 'Alignment', type: 'multi' },
  { key: 'of_fielding_alignment', label: 'OF Alignment', category: 'Alignment', type: 'multi' },
  { key: 'pfx_x_in', label: 'Horizontal Movement (in)', category: 'Movement', type: 'range' },
  { key: 'pfx_z_in', label: 'Induced Vertical Break (in)', category: 'Movement', type: 'range' },
  { key: 'vaa', label: 'Vertical Approach Angle', category: 'Pitch', type: 'range' },
  { key: 'haa', label: 'Horizontal Approach Angle', category: 'Pitch', type: 'range' },
  { key: 'batter_name', label: 'vs Batter', category: 'Matchup', type: 'multi' },
  { key: 'vs_team', label: 'vs Team', category: 'Matchup', type: 'multi' },
  { key: 'brink', label: 'Brink (edge dist, in)', category: 'Location', type: 'range' },
  { key: 'cluster', label: 'Cluster (loc spread, in)', category: 'Location', type: 'range' },
  { key: 'cluster_r', label: 'ClusterR (vs RHB, in)', category: 'Location', type: 'range' },
  { key: 'cluster_l', label: 'ClusterL (vs LHB, in)', category: 'Location', type: 'range' },
  { key: 'hdev', label: 'HDev (horiz deviation, in)', category: 'Location', type: 'range' },
  { key: 'vdev', label: 'VDev (vert deviation, in)', category: 'Location', type: 'range' },
]

export function getFullCatalog(extraFilters: FilterDef[] = []): FilterDef[] {
  return [...FILTER_CATALOG, ...extraFilters]
}

/** Apply ActiveFilter[] to a Supabase query builder (server-side SQL). */
export function applyFiltersToQuery(q: any, filters: ActiveFilter[]) {
  for (const f of filters) {
    const col = f.def.dbColumn || f.def.key
    if (f.def.type === 'multi' && f.values && f.values.length > 0) {
      if (f.def.numberCast) {
        q = q.in(col, f.values.map(Number))
      } else {
        q = q.in(col, f.values)
      }
    }
    if (f.def.type === 'range') {
      if (f.min) q = q.gte(col, parseFloat(f.min))
      if (f.max) q = q.lte(col, parseFloat(f.max))
    }
    if (f.def.type === 'date') {
      if (f.startDate) q = q.gte('game_date', f.startDate)
      if (f.endDate) q = q.lte('game_date', f.endDate)
    }
  }
  return q
}

/** Apply ActiveFilter[] to a row array (server- or client-safe). */
export function applyFiltersToData(data: any[], filters: ActiveFilter[]): any[] {
  return data.filter(d => {
    for (const f of filters) {
      const col = f.def.key
      if (f.def.type === 'multi' && f.values && f.values.length > 0) {
        const val = f.def.numberCast ? Number(d[col]) : String(d[col])
        const check = f.def.numberCast ? f.values.map(Number) : f.values
        if (!(check as any[]).includes(val)) return false
      }
      if (f.def.type === 'range') {
        if (f.min && (d[col] == null || d[col] < parseFloat(f.min))) return false
        if (f.max && (d[col] == null || d[col] > parseFloat(f.max))) return false
      }
      if (f.def.type === 'date') {
        if (f.startDate && d.game_date < f.startDate) return false
        if (f.endDate && d.game_date > f.endDate) return false
      }
    }
    return true
  })
}
