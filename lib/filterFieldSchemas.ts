/**
 * filterFieldSchemas — Field definitions, colors, and sample data for the new
 * Global Filter–based template binding system.
 */

import type { GlobalFilterType } from './sceneTypes'

export interface FilterField {
  key: string
  label: string
  shortLabel: string
  type: 'string' | 'number' | 'player_id'
}

export interface FilterFieldCategory {
  category: string
  fields: FilterField[]
}

// ── Field definitions per filter type ────────────────────────────────────

const PITCHER_FIELDS: FilterFieldCategory[] = [
  {
    category: 'Identity',
    fields: [
      { key: 'player_name', label: 'Player Name', shortLabel: 'Name', type: 'string' },
      { key: 'player_id', label: 'Player ID', shortLabel: 'ID', type: 'player_id' },
    ],
  },
  {
    category: 'Velocity',
    fields: [
      { key: 'avg_velo', label: 'Avg Velocity', shortLabel: 'Velo', type: 'number' },
      { key: 'max_velo', label: 'Max Velocity', shortLabel: 'Max Velo', type: 'number' },
    ],
  },
  {
    category: 'Movement',
    fields: [
      { key: 'avg_hbreak_in', label: 'Avg HB (in)', shortLabel: 'HB', type: 'number' },
      { key: 'avg_ivb_in', label: 'Avg IVB (in)', shortLabel: 'IVB', type: 'number' },
      { key: 'avg_spin', label: 'Avg Spin', shortLabel: 'Spin', type: 'number' },
      { key: 'avg_ext', label: 'Extension', shortLabel: 'Ext', type: 'number' },
    ],
  },
  {
    category: 'Rates',
    fields: [
      { key: 'whiff_pct', label: 'Whiff %', shortLabel: 'Whiff%', type: 'number' },
      { key: 'k_pct', label: 'K %', shortLabel: 'K%', type: 'number' },
      { key: 'bb_pct', label: 'BB %', shortLabel: 'BB%', type: 'number' },
      { key: 'csw_pct', label: 'CSW %', shortLabel: 'CSW%', type: 'number' },
      { key: 'zone_pct', label: 'Zone %', shortLabel: 'Zone%', type: 'number' },
      { key: 'chase_pct', label: 'Chase %', shortLabel: 'Chase%', type: 'number' },
    ],
  },
  {
    category: 'Results',
    fields: [
      { key: 'era', label: 'ERA', shortLabel: 'ERA', type: 'number' },
      { key: 'fip', label: 'FIP', shortLabel: 'FIP', type: 'number' },
      { key: 'xera', label: 'xERA', shortLabel: 'xERA', type: 'number' },
    ],
  },
  {
    category: 'Counting',
    fields: [
      { key: 'pitches', label: 'Pitches', shortLabel: 'Pitches', type: 'number' },
      { key: 'games', label: 'Games', shortLabel: 'G', type: 'number' },
      { key: 'pa', label: 'PA', shortLabel: 'PA', type: 'number' },
      { key: 'k_count', label: 'Strikeouts', shortLabel: 'K', type: 'number' },
      { key: 'bb_count', label: 'Walks', shortLabel: 'BB', type: 'number' },
    ],
  },
  {
    category: 'Command',
    fields: [
      { key: 'avg_brink', label: 'Avg Brink', shortLabel: 'Brink', type: 'number' },
      { key: 'avg_cluster', label: 'Avg Cluster', shortLabel: 'Cluster', type: 'number' },
      { key: 'cmd_plus', label: 'Cmd+', shortLabel: 'Cmd+', type: 'number' },
      { key: 'waste_pct', label: 'Waste %', shortLabel: 'Waste%', type: 'number' },
    ],
  },
  {
    category: 'Deception',
    fields: [
      { key: 'deception_score', label: 'Deception Score', shortLabel: 'Deception', type: 'number' },
      { key: 'unique_score', label: 'Unique Score', shortLabel: 'Unique', type: 'number' },
    ],
  },
]

const BATTER_FIELDS: FilterFieldCategory[] = [
  {
    category: 'Identity',
    fields: [
      { key: 'player_name', label: 'Player Name', shortLabel: 'Name', type: 'string' },
      { key: 'player_id', label: 'Player ID', shortLabel: 'ID', type: 'player_id' },
    ],
  },
  {
    category: 'Contact',
    fields: [
      { key: 'avg_ev', label: 'Avg Exit Velo', shortLabel: 'EV', type: 'number' },
      { key: 'max_ev', label: 'Max Exit Velo', shortLabel: 'Max EV', type: 'number' },
      { key: 'avg_la', label: 'Avg Launch Angle', shortLabel: 'LA', type: 'number' },
      { key: 'avg_dist', label: 'Avg Distance', shortLabel: 'Dist', type: 'number' },
      { key: 'avg_bat_speed', label: 'Bat Speed', shortLabel: 'Bat Spd', type: 'number' },
    ],
  },
  {
    category: 'Rates',
    fields: [
      { key: 'k_pct', label: 'K %', shortLabel: 'K%', type: 'number' },
      { key: 'bb_pct', label: 'BB %', shortLabel: 'BB%', type: 'number' },
      { key: 'hard_hit_pct', label: 'Hard Hit %', shortLabel: 'HH%', type: 'number' },
      { key: 'barrel_pct', label: 'Barrel %', shortLabel: 'Barrel%', type: 'number' },
    ],
  },
  {
    category: 'Slash',
    fields: [
      { key: 'ba', label: 'Batting Avg', shortLabel: 'AVG', type: 'number' },
      { key: 'obp', label: 'OBP', shortLabel: 'OBP', type: 'number' },
      { key: 'slg', label: 'SLG', shortLabel: 'SLG', type: 'number' },
      { key: 'ops', label: 'OPS', shortLabel: 'OPS', type: 'number' },
    ],
  },
  {
    category: 'Expected',
    fields: [
      { key: 'avg_xba', label: 'xBA', shortLabel: 'xBA', type: 'number' },
      { key: 'avg_xwoba', label: 'xwOBA', shortLabel: 'xwOBA', type: 'number' },
      { key: 'avg_xslg', label: 'xSLG', shortLabel: 'xSLG', type: 'number' },
    ],
  },
  {
    category: 'Counting',
    fields: [
      { key: 'pa', label: 'PA', shortLabel: 'PA', type: 'number' },
      { key: 'h', label: 'Hits', shortLabel: 'H', type: 'number' },
      { key: 'hr_count', label: 'Home Runs', shortLabel: 'HR', type: 'number' },
      { key: 'doubles', label: 'Doubles', shortLabel: '2B', type: 'number' },
      { key: 'triples', label: 'Triples', shortLabel: '3B', type: 'number' },
    ],
  },
]

const LEADERBOARD_FIELDS: FilterFieldCategory[] = [
  {
    category: 'Leaderboard',
    fields: [
      { key: 'rank', label: 'Rank', shortLabel: '#', type: 'number' },
      { key: 'player_name', label: 'Player Name', shortLabel: 'Name', type: 'string' },
      { key: 'player_id', label: 'Player ID', shortLabel: 'ID', type: 'player_id' },
      { key: 'primary_value', label: 'Primary Value', shortLabel: '1st', type: 'number' },
      { key: 'secondary_value', label: 'Secondary Value', shortLabel: '2nd', type: 'number' },
      { key: 'tertiary_value', label: 'Tertiary Value', shortLabel: '3rd', type: 'number' },
    ],
  },
]

const LIVE_GAME_FIELDS: FilterFieldCategory[] = [
  {
    category: 'Teams',
    fields: [
      { key: 'away_abbrev', label: 'Away Abbrev', shortLabel: 'Away', type: 'string' },
      { key: 'home_abbrev', label: 'Home Abbrev', shortLabel: 'Home', type: 'string' },
      { key: 'away_name', label: 'Away Name', shortLabel: 'Away Name', type: 'string' },
      { key: 'home_name', label: 'Home Name', shortLabel: 'Home Name', type: 'string' },
      { key: 'away_abbrev_themed', label: 'Away (Themed)', shortLabel: 'Away*', type: 'string' },
      { key: 'home_abbrev_themed', label: 'Home (Themed)', shortLabel: 'Home*', type: 'string' },
      { key: 'matchup_themed', label: 'Matchup (Themed)', shortLabel: 'Matchup*', type: 'string' },
    ],
  },
  {
    category: 'Score',
    fields: [
      { key: 'away_score', label: 'Away Score', shortLabel: 'A Score', type: 'number' },
      { key: 'home_score', label: 'Home Score', shortLabel: 'H Score', type: 'number' },
    ],
  },
  {
    category: 'State',
    fields: [
      { key: 'inning_display', label: 'Inning Display', shortLabel: 'Inning', type: 'string' },
      { key: 'outs', label: 'Outs', shortLabel: 'Outs', type: 'string' },
      { key: 'state_line', label: 'State Line', shortLabel: 'State', type: 'string' },
    ],
  },
  {
    category: 'Runners',
    fields: [
      { key: 'on_first', label: '1st Base', shortLabel: '1B', type: 'string' },
      { key: 'on_second', label: '2nd Base', shortLabel: '2B', type: 'string' },
      { key: 'on_third', label: '3rd Base', shortLabel: '3B', type: 'string' },
    ],
  },
  {
    category: 'Players',
    fields: [
      { key: 'pitcher_name', label: 'Pitcher Name', shortLabel: 'P', type: 'string' },
      { key: 'batter_name', label: 'Batter Name', shortLabel: 'B', type: 'string' },
      { key: 'probable_away', label: 'Probable Away', shortLabel: 'Prob Away', type: 'string' },
      { key: 'probable_home', label: 'Probable Home', shortLabel: 'Prob Home', type: 'string' },
    ],
  },
]

const MATCHUP_FIELDS: FilterFieldCategory[] = [
  {
    category: 'Players',
    fields: [
      { key: 'player_a_name', label: 'Player A Name', shortLabel: 'A Name', type: 'string' },
      { key: 'player_a_id', label: 'Player A ID', shortLabel: 'A ID', type: 'player_id' },
      { key: 'player_b_name', label: 'Player B Name', shortLabel: 'B Name', type: 'string' },
      { key: 'player_b_id', label: 'Player B ID', shortLabel: 'B ID', type: 'player_id' },
    ],
  },
  {
    category: 'Player A Stats',
    fields: [
      { key: 'a_avg_velo', label: 'A Avg Velo', shortLabel: 'A Velo', type: 'number' },
      { key: 'a_k_pct', label: 'A K%', shortLabel: 'A K%', type: 'number' },
      { key: 'a_bb_pct', label: 'A BB%', shortLabel: 'A BB%', type: 'number' },
      { key: 'a_era', label: 'A ERA', shortLabel: 'A ERA', type: 'number' },
      { key: 'a_whiff_pct', label: 'A Whiff%', shortLabel: 'A Whiff%', type: 'number' },
      { key: 'a_avg_ev', label: 'A Exit Velo', shortLabel: 'A EV', type: 'number' },
      { key: 'a_ba', label: 'A AVG', shortLabel: 'A AVG', type: 'number' },
      { key: 'a_ops', label: 'A OPS', shortLabel: 'A OPS', type: 'number' },
    ],
  },
  {
    category: 'Player B Stats',
    fields: [
      { key: 'b_avg_velo', label: 'B Avg Velo', shortLabel: 'B Velo', type: 'number' },
      { key: 'b_k_pct', label: 'B K%', shortLabel: 'B K%', type: 'number' },
      { key: 'b_bb_pct', label: 'B BB%', shortLabel: 'B BB%', type: 'number' },
      { key: 'b_era', label: 'B ERA', shortLabel: 'B ERA', type: 'number' },
      { key: 'b_whiff_pct', label: 'B Whiff%', shortLabel: 'B Whiff%', type: 'number' },
      { key: 'b_avg_ev', label: 'B Exit Velo', shortLabel: 'B EV', type: 'number' },
      { key: 'b_ba', label: 'B AVG', shortLabel: 'B AVG', type: 'number' },
      { key: 'b_ops', label: 'B OPS', shortLabel: 'B OPS', type: 'number' },
    ],
  },
]

// ── Public API ────────────────────────────────────────────────────────────

export function getFilterFields(type: GlobalFilterType, playerType?: 'pitcher' | 'batter'): FilterFieldCategory[] {
  switch (type) {
    case 'single-player':
      return playerType === 'batter' ? BATTER_FIELDS : PITCHER_FIELDS
    case 'team':
      return playerType === 'batter' ? BATTER_FIELDS : PITCHER_FIELDS
    case 'leaderboard':
      return LEADERBOARD_FIELDS
    case 'live-game':
      return LIVE_GAME_FIELDS
    case 'matchup':
      return MATCHUP_FIELDS
    case 'player-checkin':
    case 'depth-chart':
    case 'bullpen-depth-chart':
    default:
      return PITCHER_FIELDS
  }
}

// ── Deterministic field color ─────────────────────────────────────────────

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
  '#6366f1', '#10b981', '#e11d48', '#0ea5e9', '#a855f7',
]

export function fieldColor(field: string): string {
  let hash = 0
  for (let i = 0; i < field.length; i++) hash = ((hash << 5) - hash + field.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

// ── Short label lookup ────────────────────────────────────────────────────

const SHORT_LABEL_MAP: Record<string, string> = {}
function buildShortLabelMap() {
  if (Object.keys(SHORT_LABEL_MAP).length > 0) return
  const all = [
    ...PITCHER_FIELDS, ...BATTER_FIELDS, ...LEADERBOARD_FIELDS,
    ...LIVE_GAME_FIELDS, ...MATCHUP_FIELDS,
  ]
  for (const cat of all) {
    for (const f of cat.fields) {
      SHORT_LABEL_MAP[f.key] = f.shortLabel
    }
  }
}

export function fieldShortLabel(field: string): string {
  buildShortLabelMap()
  return SHORT_LABEL_MAP[field] || field.replace(/_/g, ' ')
}

export function fieldType(field: string): 'string' | 'number' | 'player_id' {
  buildShortLabelMap()
  // Check all field categories
  const all = [
    ...PITCHER_FIELDS, ...BATTER_FIELDS, ...LEADERBOARD_FIELDS,
    ...LIVE_GAME_FIELDS, ...MATCHUP_FIELDS,
  ]
  for (const cat of all) {
    for (const f of cat.fields) {
      if (f.key === field) return f.type
    }
  }
  return 'string'
}

// ── Sample data for preview ───────────────────────────────────────────────

export function getSampleDataForFilter(type: GlobalFilterType, playerType?: 'pitcher' | 'batter'): Record<string, any>[] | Record<string, any> {
  switch (type) {
    case 'single-player':
      if (playerType === 'batter') {
        return {
          player_name: 'Ohtani, Shohei', player_id: 660271,
          avg_ev: 93.4, max_ev: 118.7, avg_la: 12.3, avg_dist: 212, avg_bat_speed: 78.2,
          k_pct: 25.1, bb_pct: 11.4, hard_hit_pct: 52.3, barrel_pct: 18.2,
          ba: 0.304, obp: 0.390, slg: 0.621, ops: 1.011,
          avg_xba: 0.298, avg_xwoba: 0.415, avg_xslg: 0.605,
          pa: 650, h: 175, hr_count: 54, doubles: 26, triples: 2,
        }
      }
      return {
        player_name: 'Skenes, Paul', player_id: 669373,
        avg_velo: 98.2, max_velo: 101.5, avg_hbreak_in: 4.2, avg_ivb_in: 16.8,
        avg_spin: 2421, avg_ext: 6.7, whiff_pct: 34.1, k_pct: 31.2,
        bb_pct: 5.8, csw_pct: 33.5, zone_pct: 48.2, chase_pct: 35.1,
        era: 2.35, fip: 2.42, xera: 2.51,
        pitches: 2840, games: 25, pa: 680, k_count: 212, bb_count: 39,
        avg_brink: 12.1, avg_cluster: 6.4, cmd_plus: 115, waste_pct: 18.2,
        deception_score: 0.142, unique_score: 0.088,
      }
    case 'team':
      return {
        player_name: 'Team Stats', player_id: 0,
        avg_velo: 94.8, k_pct: 24.5, bb_pct: 7.2, era: 3.45,
        whiff_pct: 26.3, csw_pct: 29.1, zone_pct: 47.8, chase_pct: 31.2,
        pitches: 24500, games: 162, pa: 6200,
      }
    case 'leaderboard':
      return [
        { rank: 1, player_id: 669373, player_name: 'Skenes, Paul', primary_value: 98.2, secondary_value: 34.1, tertiary_value: 2.35 },
        { rank: 2, player_id: 543037, player_name: 'Cole, Gerrit', primary_value: 97.1, secondary_value: 31.2, tertiary_value: 2.63 },
        { rank: 3, player_id: 808967, player_name: 'Richardson, Sail', primary_value: 96.8, secondary_value: 29.5, tertiary_value: 3.12 },
        { rank: 4, player_id: 663556, player_name: 'Wheeler, Zack', primary_value: 96.4, secondary_value: 28.8, tertiary_value: 2.57 },
        { rank: 5, player_id: 665861, player_name: 'Glasnow, Tyler', primary_value: 96.1, secondary_value: 33.7, tertiary_value: 3.32 },
      ]
    case 'live-game':
      return {
        away_abbrev: 'NYY', home_abbrev: 'BOS',
        away_name: 'New York Yankees', home_name: 'Boston Red Sox',
        away_abbrev_themed: 'NYY', home_abbrev_themed: 'BOS',
        matchup_themed: 'NYY - BOS',
        away_score: 3, home_score: 2,
        inning_display: 'Top 7th', outs: '1 out',
        state_line: 'TOP 7th \u00b7 1 OUT',
        on_first: '\u25c9', on_second: '\u25cb', on_third: '\u25cb',
        pitcher_name: 'Cole, Gerrit', batter_name: 'Devers, Rafael',
        probable_away: 'Cole, Gerrit', probable_home: 'Sale, Chris',
      }
    case 'matchup':
      return {
        player_a_name: 'Skenes, Paul', player_a_id: 669373,
        player_b_name: 'Ohtani, Shohei', player_b_id: 660271,
        a_avg_velo: 98.2, a_k_pct: 31.2, a_bb_pct: 5.8, a_era: 2.35,
        a_whiff_pct: 34.1, a_avg_ev: 86.2, a_ba: 0.201, a_ops: 0.582,
        b_avg_velo: 0, b_k_pct: 25.1, b_bb_pct: 11.4, b_era: 0,
        b_whiff_pct: 0, b_avg_ev: 93.4, b_ba: 0.304, b_ops: 1.011,
      }
    case 'depth-chart':
      return {
        teamName: 'New York Yankees', teamAbbrev: 'NYY',
        rotation: [
          { player_id: 543037, player_name: 'Cole, Gerrit', jersey_number: '45', order: 1 },
          { player_id: 608331, player_name: 'Fried, Max', jersey_number: '32', order: 2 },
        ],
        depth: [],
      }
    case 'bullpen-depth-chart':
      return {
        teamName: 'New York Yankees', teamAbbrev: 'NYY',
        closer: [{ player_id: 677951, player_name: 'Bednar, David', jersey_number: '51', order: 1 }],
        setup: [
          { player_id: 642585, player_name: 'Doval, Camilo', jersey_number: '75', order: 1 },
          { player_id: 673540, player_name: 'Cruz, Fernando', jersey_number: '47', order: 2 },
        ],
        relief: [],
      }
    case 'player-checkin':
      return {
        title: 'PITCHING CHECK IN',
        subtitle: 'Regular Season  •  2026 Season Check In',
        statHeaders: ['IP', 'ERA', 'R', 'K', 'BB', 'BAA', 'OPS'],
        players: [
          { player_id: 657277, player_name: 'Logan Webb', stats: ['11.0', '7.36', '10', '12', '5', '.267', '.686'] },
          { player_id: 694973, player_name: 'Paul Skenes', stats: ['0.2', '67.50', '5', '1', '2', '.800', '2.178'] },
          { player_id: 690997, player_name: 'Nolan McLean', stats: ['5.0', '3.60', '2', '8', '2', '.211', '.739'] },
        ],
      }
  }
}
