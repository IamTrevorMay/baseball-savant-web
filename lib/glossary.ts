import { supabase } from './supabase'

export interface GlossaryEntry {
  column_name: string
  display_name: string
  description: string | null
}

let glossaryCache: Record<string, GlossaryEntry> = {}

export async function loadGlossary() {
  if (Object.keys(glossaryCache).length > 0) return glossaryCache
  const { data } = await supabase.from('glossary').select('*')
  if (data) {
    data.forEach((entry: GlossaryEntry) => {
      glossaryCache[entry.column_name] = entry
    })
  }
  return glossaryCache
}

export function colName(col: string): string {
  return glossaryCache[col]?.display_name || col
}

export function colDesc(col: string): string {
  return glossaryCache[col]?.description || ''
}

// Descriptions for computed/aggregate metrics not in the DB glossary table
const METRIC_TIPS: Record<string, string> = {
  'Whiff%': 'Swinging strikes divided by total swings',
  'K%': 'Strikeout rate per plate appearance',
  'BB%': 'Walk rate per plate appearance',
  'CSt%': 'Called strike rate per pitch',
  'Sw%': 'Swing rate per pitch',
  'SwStr%': 'Swinging strike rate per pitch',
  'K-BB%': 'Strikeout rate minus walk rate',
  'Contact%': 'Contact rate on swings (1 minus Whiff%)',
  'Zone%': 'Percentage of pitches in the strike zone',
  'Chase%': 'Swing rate on pitches outside the zone',
  'GB%': 'Ground ball rate of batted balls',
  'FB%': 'Fly ball rate of batted balls',
  'LD%': 'Line drive rate of batted balls',
  'PU%': 'Popup rate of batted balls',
  'Hard Hit%': 'Batted balls with exit velo >= 95 mph',
  'Barrel%': 'Optimal exit velo + launch angle combination',
  'Velo': 'Average pitch velocity at release (mph)',
  'Max': 'Maximum pitch velocity (mph)',
  'Avg Velo': 'Average pitch velocity at release (mph)',
  'Max Velo': 'Maximum pitch velocity (mph)',
  'Pitch Velo': 'Average velocity of pitches faced (mph)',
  'Spin': 'Average spin rate after release (rpm)',
  'HB': 'Horizontal break from catcher view (in)',
  'IVB': 'Induced vertical break, gravity removed (in)',
  'Ext': 'Release extension from rubber (ft)',
  'Arm°': 'Pitcher arm angle at release',
  'xBA': 'Expected batting avg from exit velo + launch angle',
  'xwOBA': 'Expected wOBA from exit velo + launch angle',
  'xSLG': 'Expected slugging from exit velo + launch angle',
  'wOBA': 'Weighted on-base average',
  'Avg EV': 'Average exit velocity on batted balls (mph)',
  'Max EV': 'Maximum exit velocity (mph)',
  'Avg LA': 'Average launch angle on batted balls',
  'EV': 'Average exit velocity on batted balls (mph)',
  'BA': 'Batting average (hits / at-bats)',
  'OBP': 'On-base percentage',
  'SLG': 'Slugging percentage',
  'OPS': 'On-base plus slugging',
  'ERA': 'Earned run average',
  'WHIP': 'Walks + hits per inning pitched',
  'FIP': 'Fielding independent pitching',
  'xFIP': 'Expected FIP (normalizes HR/FB rate)',
  'xERA': 'Expected ERA from xwOBA',
  'SIERA': 'Skill-interactive ERA',
  'K/9': 'Strikeouts per 9 innings',
  'BB/9': 'Walks per 9 innings',
  'HR/9': 'Home runs per 9 innings',
  'RE24': 'Run expectancy change across 24 base-out states',
  'IP': 'Innings pitched',
  'PA': 'Plate appearances',
  'W': 'Wins', 'L': 'Losses', 'G': 'Games played', 'GS': 'Games started', 'SV': 'Saves',
  'H': 'Hits', '2B': 'Doubles', '3B': 'Triples', 'HR': 'Home runs',
  'BB': 'Walks (bases on balls)', 'K': 'Strikeouts', 'HBP': 'Hit by pitch',
  '#': 'Number of pitches',
  'Usage%': 'Percentage of total pitches thrown',
  'Faced%': 'Percentage of total pitches faced',
  'Pitches': 'Total number of pitches',
  'Brink': 'Avg distance to nearest zone edge (in). Higher = more edge pitching',
  'Cluster': 'Avg distance from pitch-type centroid (in). Lower = tighter grouping',
  'HDev': 'Avg horizontal deviation from centroid (in)',
  'VDev': 'Avg vertical deviation from centroid (in)',
  'Missfire': 'Avg distance of outside-zone pitches from zone edge (in)',
  'Waste%': 'Pitches more than 10" outside the zone',
  'Brink+': 'Brink plus stat (100 = league avg)',
  'Cluster+': 'Cluster plus stat (100 = league avg)',
  'HDev+': 'HDev plus stat (100 = league avg)',
  'VDev+': 'VDev plus stat (100 = league avg)',
  'Missfire+': 'Missfire plus stat (100 = league avg)',
  'Cmd+': 'Command+ composite: Brink+, Cluster+, Missfire+',
  'RPCom+': 'Run Prevention Command+: all 5 metrics weighted by xwOBA correlation',
  'Unique': 'How unusual the ball flight is (absolute z-scores)',
  'Deception': 'Signed z-scores with directional value for movement/release',
  'Swing%': 'Swing rate per pitch',
  'Opp': 'Opposing team',
  'AB': 'At-bats',
  'R': 'Runs scored',
  'RBI': 'Runs batted in',
  'SB': 'Stolen bases',
  'SO': 'Strikeouts',
  'CG': 'Complete games',
  'SHO': 'Shutouts',
  'ER': 'Earned runs',
  'Team': 'Team abbreviation',
  'Year': 'Season year',
  'Avg FB': 'Average fastball velocity (mph)',
  'Max FB': 'Maximum fastball velocity (mph)',
  'Inn': 'Innings pitched in appearance',
  'BF': 'Batters faced',
  'Rest': 'Days since last appearance',
  'Fade': 'Velocity drop from first to last inning',
  'HiLev': 'High-leverage appearance',
  'Flag': 'Workload flag triggered',
}

/** Look up tooltip description by column name or display label */
export function getTip(key: string): string {
  return glossaryCache[key]?.description || METRIC_TIPS[key] || ''
}
