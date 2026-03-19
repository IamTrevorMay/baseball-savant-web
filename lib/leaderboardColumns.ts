/**
 * Leaderboard column definitions, stat sets, and helpers.
 */
import type { ActiveFilter } from '@/components/FilterEngine'

// ── Types ────────────────────────────────────────────────────────────────────
export type View = 'pitching' | 'hitting' | 'team' | 'defence'
export type StatSet = 'traditional' | 'advanced' | 'stuff' | 'battedball' | 'discipline' | 'triton_raw' | 'triton_plus' | 'deception' | 'oaa' | 'outfield_oaa' | 'catch_probability' | 'arm_strength' | 'run_value' | 'catcher_framing'

export interface ColumnDef {
  key: string          // metric key or group key (e.g. 'player_name', 'avg_velo')
  label: string        // display header
  colorClass: string   // tailwind text-color class
  format?: 'int' | 'dec1' | 'dec2' | 'dec3' | 'pct1' | 'plus' | 'pctRed'
  isName?: boolean     // clickable player name
  isGroup?: boolean    // group-by column (not a metric)
  conditionalColor?: (v: number, view: View) => string
}

// ── Stat sets available per view ─────────────────────────────────────────────
export const STAT_SETS: Record<View, { key: StatSet; label: string }[]> = {
  pitching: [
    { key: 'traditional', label: 'Traditional' },
    { key: 'advanced', label: 'Advanced' },
    { key: 'stuff', label: 'Stuff/Arsenal' },
    { key: 'battedball', label: 'Batted Ball' },
    { key: 'discipline', label: 'Plate Discipline' },
    { key: 'triton_raw', label: 'Triton' },
    { key: 'triton_plus', label: 'Triton+' },
    { key: 'deception', label: 'Deception' },
  ],
  hitting: [
    { key: 'traditional', label: 'Traditional' },
    { key: 'advanced', label: 'Advanced' },
    { key: 'battedball', label: 'Batted Ball' },
    { key: 'discipline', label: 'Plate Discipline' },
  ],
  team: [
    { key: 'traditional', label: 'Traditional' },
    { key: 'advanced', label: 'Advanced' },
    { key: 'battedball', label: 'Batted Ball' },
    { key: 'discipline', label: 'Plate Discipline' },
  ],
  defence: [
    { key: 'oaa', label: 'OAA' },
    { key: 'run_value', label: 'Run Value' },
    { key: 'arm_strength', label: 'Arm Strength' },
    { key: 'catch_probability', label: 'Catch Prob' },
    { key: 'outfield_oaa', label: 'OF Directional' },
    { key: 'catcher_framing', label: 'Framing' },
  ],
}

// ── Conditional color helpers ────────────────────────────────────────────────
function plusColor(v: number): string {
  if (v >= 115) return 'text-emerald-300'
  if (v >= 100) return 'text-teal-400'
  if (v >= 85) return 'text-orange-400'
  return 'text-red-400'
}

function oaaColor(v: number): string {
  if (v >= 10) return 'text-emerald-300'
  if (v > 0) return 'text-emerald-400'
  if (v === 0) return 'text-zinc-400'
  if (v > -10) return 'text-red-400'
  return 'text-red-300'
}

function runsColor(v: number): string {
  if (v >= 5) return 'text-emerald-300'
  if (v > 0) return 'text-emerald-400'
  if (v === 0) return 'text-zinc-400'
  if (v > -5) return 'text-red-400'
  return 'text-red-300'
}

function re24Color(v: number, view: View): string {
  // For pitching: negative RE24 = good (prevented runs)
  // For hitting: positive RE24 = good
  const isGood = view === 'pitching' ? v < 0 : v > 0
  if (Math.abs(v) < 1) return 'text-zinc-400'
  return isGood ? 'text-emerald-400' : 'text-red-400'
}

// ── Column definitions ───────────────────────────────────────────────────────
// Pitching name column
const pitcherName: ColumnDef = { key: 'player_name', label: 'Name', colorClass: 'text-white font-medium', isName: true, isGroup: true }
const pitcherId: ColumnDef = { key: 'pitcher', label: '', colorClass: '', isGroup: true }
// Hitting name column
const batterName: ColumnDef = { key: '_batter_name', label: 'Name', colorClass: 'text-white font-medium', isName: true }
const batterId: ColumnDef = { key: 'batter', label: '', colorClass: '', isGroup: true }
// Team column
const teamCol: ColumnDef = { key: 'pitch_team', label: 'Team', colorClass: 'text-white font-medium', isGroup: true }
const batTeamCol: ColumnDef = { key: 'bat_team', label: 'Team', colorClass: 'text-white font-medium', isGroup: true }

// Shared counting
const games: ColumnDef = { key: 'games', label: 'G', colorClass: 'text-zinc-400', format: 'int' }
const pa: ColumnDef = { key: 'pa', label: 'PA', colorClass: 'text-zinc-400', format: 'int' }
const pitches: ColumnDef = { key: 'pitches', label: 'Pitches', colorClass: 'text-zinc-400', format: 'int' }
const h: ColumnDef = { key: 'h', label: 'H', colorClass: 'text-zinc-300', format: 'int' }
const doubles: ColumnDef = { key: 'doubles', label: '2B', colorClass: 'text-zinc-300', format: 'int' }
const triples: ColumnDef = { key: 'triples', label: '3B', colorClass: 'text-zinc-300', format: 'int' }
const hr: ColumnDef = { key: 'hr_count', label: 'HR', colorClass: 'text-zinc-300', format: 'int' }
const bb: ColumnDef = { key: 'bb_count', label: 'BB', colorClass: 'text-zinc-300', format: 'int' }
const k: ColumnDef = { key: 'k_count', label: 'K', colorClass: 'text-zinc-300', format: 'int' }
const hbp: ColumnDef = { key: 'hbp_count', label: 'HBP', colorClass: 'text-zinc-300', format: 'int' }

// Batting rates
const ba: ColumnDef = { key: 'ba', label: 'BA', colorClass: 'text-rose-400', format: 'dec3' }
const obp: ColumnDef = { key: 'obp', label: 'OBP', colorClass: 'text-rose-400', format: 'dec3' }
const slg: ColumnDef = { key: 'slg', label: 'SLG', colorClass: 'text-rose-400', format: 'dec3' }
const ops: ColumnDef = { key: 'ops', label: 'OPS', colorClass: 'text-rose-400', format: 'dec3' }
const kPct: ColumnDef = { key: 'k_pct', label: 'K%', colorClass: 'text-emerald-400', format: 'dec1' }
const bbPct: ColumnDef = { key: 'bb_pct', label: 'BB%', colorClass: 'text-red-400', format: 'dec1' }
const kMinusBb: ColumnDef = { key: 'k_minus_bb', label: 'K-BB%', colorClass: 'text-emerald-400', format: 'dec1' }
const whiffPct: ColumnDef = { key: 'whiff_pct', label: 'Whiff%', colorClass: 'text-emerald-400', format: 'dec1' }
const swstrPct: ColumnDef = { key: 'swstr_pct', label: 'SwStr%', colorClass: 'text-emerald-400', format: 'dec1' }
const cswPct: ColumnDef = { key: 'csw_pct', label: 'CSW%', colorClass: 'text-emerald-400', format: 'dec1' }
const re24: ColumnDef = { key: 'total_re24', label: 'RE24', colorClass: 'text-zinc-400', format: 'dec1', conditionalColor: re24Color }
const sos: ColumnDef = { key: '_sos', label: 'SOS', colorClass: '', format: 'dec1', conditionalColor: (v) => plusColor(v) }

// Expected
const xba: ColumnDef = { key: 'avg_xba', label: 'xBA', colorClass: 'text-rose-400', format: 'dec3' }
const xwoba: ColumnDef = { key: 'avg_xwoba', label: 'xwOBA', colorClass: 'text-rose-400', format: 'dec3' }
const xslg: ColumnDef = { key: 'avg_xslg', label: 'xSLG', colorClass: 'text-rose-400', format: 'dec3' }
const woba: ColumnDef = { key: 'avg_woba', label: 'wOBA', colorClass: 'text-rose-400', format: 'dec3' }

// Stuff / arsenal
const velo: ColumnDef = { key: 'avg_velo', label: 'Velo', colorClass: 'text-amber-400', format: 'dec1' }
const maxVelo: ColumnDef = { key: 'max_velo', label: 'Max Velo', colorClass: 'text-amber-400', format: 'dec1' }
const spin: ColumnDef = { key: 'avg_spin', label: 'Spin', colorClass: 'text-sky-400', format: 'int' }
const hBreak: ColumnDef = { key: 'avg_hbreak_in', label: 'HB (in)', colorClass: 'text-purple-400', format: 'dec1' }
const ivb: ColumnDef = { key: 'avg_ivb_in', label: 'IVB (in)', colorClass: 'text-purple-400', format: 'dec1' }
const ext: ColumnDef = { key: 'avg_ext', label: 'Ext', colorClass: 'text-purple-400', format: 'dec2' }
const armAngle: ColumnDef = { key: 'avg_arm_angle', label: 'Arm Angle', colorClass: 'text-purple-400', format: 'dec1' }

// Batted ball
const avgEv: ColumnDef = { key: 'avg_ev', label: 'Avg EV', colorClass: 'text-orange-400', format: 'dec1' }
const maxEv: ColumnDef = { key: 'max_ev', label: 'Max EV', colorClass: 'text-orange-400', format: 'dec1' }
const avgLa: ColumnDef = { key: 'avg_la', label: 'Avg LA', colorClass: 'text-orange-400', format: 'dec1' }
const hardHit: ColumnDef = { key: 'hard_hit_pct', label: 'Hard Hit%', colorClass: 'text-orange-400', format: 'dec1' }
const barrel: ColumnDef = { key: 'barrel_pct', label: 'Barrel%', colorClass: 'text-orange-400', format: 'dec1' }
const gbPct: ColumnDef = { key: 'gb_pct', label: 'GB%', colorClass: 'text-orange-400', format: 'dec1' }
const fbPct: ColumnDef = { key: 'fb_pct', label: 'FB%', colorClass: 'text-orange-400', format: 'dec1' }
const ldPct: ColumnDef = { key: 'ld_pct', label: 'LD%', colorClass: 'text-orange-400', format: 'dec1' }
const puPct: ColumnDef = { key: 'pu_pct', label: 'PU%', colorClass: 'text-orange-400', format: 'dec1' }
const batSpeed: ColumnDef = { key: 'avg_bat_speed', label: 'Bat Speed', colorClass: 'text-orange-400', format: 'dec1' }
const swingLen: ColumnDef = { key: 'avg_swing_length', label: 'Swing Len', colorClass: 'text-orange-400', format: 'dec2' }
const attackAngle: ColumnDef = { key: 'avg_attack_angle', label: 'Atk Angle', colorClass: 'text-orange-400', format: 'dec1' }
const swingPathTilt: ColumnDef = { key: 'avg_swing_path_tilt', label: 'Swing Tilt', colorClass: 'text-orange-400', format: 'dec1' }
const fastSwingRate: ColumnDef = { key: 'fast_swing_rate', label: 'Fast Sw%', colorClass: 'text-orange-400', format: 'dec1' }
const squaredUpRate: ColumnDef = { key: 'squared_up_rate', label: 'Sq Up%', colorClass: 'text-orange-400', format: 'dec1' }
const blastRate: ColumnDef = { key: 'blast_rate', label: 'Blast%', colorClass: 'text-orange-400', format: 'dec1' }
const idealAARate: ColumnDef = { key: 'ideal_attack_angle_rate', label: 'Ideal AA%', colorClass: 'text-orange-400', format: 'dec1' }

// Discipline
const zonePct: ColumnDef = { key: 'zone_pct', label: 'Zone%', colorClass: 'text-sky-400', format: 'dec1' }
const chasePct: ColumnDef = { key: 'chase_pct', label: 'Chase%', colorClass: 'text-sky-400', format: 'dec1' }
const contactPct: ColumnDef = { key: 'contact_pct', label: 'Contact%', colorClass: 'text-sky-400', format: 'dec1' }
const zSwingPct: ColumnDef = { key: 'z_swing_pct', label: 'Z-Swing%', colorClass: 'text-sky-400', format: 'dec1' }
const oContactPct: ColumnDef = { key: 'o_contact_pct', label: 'O-Contact%', colorClass: 'text-sky-400', format: 'dec1' }

// ── Column arrays keyed by "view:statset" ────────────────────────────────────
export const COLUMNS: Record<string, ColumnDef[]> = {
  // ── PITCHING ───────────────────────────────────────────────────
  'pitching:traditional': [pitcherName, pitcherId, games, pa, pitches, h, doubles, triples, hr, bb, k, hbp, ba, obp, slg, ops, kPct, bbPct, re24],
  'pitching:advanced': [pitcherName, pitcherId, pitches, kPct, bbPct, kMinusBb, whiffPct, swstrPct, cswPct, xba, xwoba, xslg, woba, re24, sos],
  'pitching:stuff': [pitcherName, pitcherId, pitches, velo, maxVelo, spin, hBreak, ivb, ext, armAngle, whiffPct, cswPct],
  'pitching:battedball': [pitcherName, pitcherId, pitches, avgEv, maxEv, avgLa, hardHit, barrel, gbPct, fbPct, ldPct, puPct],
  'pitching:discipline': [pitcherName, pitcherId, pitches, zonePct, chasePct, whiffPct, swstrPct, cswPct, contactPct, zSwingPct, oContactPct],

  // ── HITTING ────────────────────────────────────────────────────
  'hitting:traditional': [batterName, batterId, games, pa, h, doubles, triples, hr, bb, k, ba, obp, slg, ops],
  'hitting:advanced': [batterName, batterId, pa, kPct,
    { ...bbPct, colorClass: 'text-emerald-400' }, // flipped polarity for hitting
    woba, xba, xwoba, xslg, re24, sos],
  'hitting:battedball': [batterName, batterId, pa, avgEv, maxEv, avgLa, hardHit, barrel, gbPct, fbPct, ldPct, batSpeed, swingLen, attackAngle, swingPathTilt, fastSwingRate, squaredUpRate, blastRate, idealAARate],
  'hitting:discipline': [batterName, batterId, pitches, zonePct, chasePct, whiffPct, contactPct, zSwingPct, oContactPct],

  // ── TEAM (pitching perspective — grouped by pitch_team) ────────
  'team:traditional': [teamCol, games, pa, pitches, h, doubles, triples, hr, bb, k, hbp, ba, obp, slg, ops, kPct, bbPct, re24],
  'team:advanced': [teamCol, pitches, kPct, bbPct, kMinusBb, whiffPct, swstrPct, cswPct, xba, xwoba, xslg, woba, re24],
  'team:battedball': [teamCol, pitches, avgEv, maxEv, avgLa, hardHit, barrel, gbPct, fbPct, ldPct, puPct],
  'team:discipline': [teamCol, pitches, zonePct, chasePct, whiffPct, swstrPct, cswPct, contactPct, zSwingPct, oContactPct],

  // ── DEFENCE ─────────────────────────────────────────────────────
  'defence:oaa': [
    { key: 'player_name', label: 'Name', colorClass: 'text-white font-medium', isName: true },
    { key: 'player_id', label: '', colorClass: '', isGroup: true },
    { key: 'team', label: 'Team', colorClass: 'text-zinc-400' },
    { key: 'position', label: 'Pos', colorClass: 'text-zinc-400' },
    { key: 'outs_above_average', label: 'OAA', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'fielding_runs_prevented', label: 'FRP', colorClass: '', format: 'int', conditionalColor: (v) => runsColor(v) },
    { key: 'oaa_infront', label: 'In Front', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_lateral_3b', label: '3B Side', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_lateral_1b', label: '1B Side', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_behind', label: 'Behind', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_rhh', label: 'vs RHH', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_lhh', label: 'vs LHH', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'actual_success_rate', label: 'Actual%', colorClass: 'text-sky-400', format: 'dec1' },
    { key: 'estimated_success_rate', label: 'Expected%', colorClass: 'text-sky-400', format: 'dec1' },
    { key: 'diff_success_rate', label: 'Diff%', colorClass: '', format: 'dec1', conditionalColor: (v) => oaaColor(v) },
  ],
  'defence:outfield_oaa': [
    { key: 'player_name', label: 'Name', colorClass: 'text-white font-medium', isName: true },
    { key: 'player_id', label: '', colorClass: '', isGroup: true },
    { key: 'attempts', label: 'Attempts', colorClass: 'text-zinc-400', format: 'int' },
    { key: 'oaa', label: 'OAA', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_back_left', label: 'Back-L', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_back', label: 'Back', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_back_right', label: 'Back-R', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_back_all', label: 'Back All', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_in_left', label: 'In-L', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_in', label: 'In', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_in_right', label: 'In-R', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'oaa_in_all', label: 'In All', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
  ],
  'defence:catch_probability': [
    { key: 'player_name', label: 'Name', colorClass: 'text-white font-medium', isName: true },
    { key: 'player_id', label: '', colorClass: '', isGroup: true },
    { key: 'oaa', label: 'OAA', colorClass: '', format: 'int', conditionalColor: (v) => oaaColor(v) },
    { key: 'five_star_plays', label: '5★ Made', colorClass: 'text-emerald-400', format: 'int' },
    { key: 'five_star_opps', label: '5★ Opps', colorClass: 'text-zinc-400', format: 'int' },
    { key: 'five_star_pct', label: '5★%', colorClass: 'text-emerald-400', format: 'dec1' },
    { key: 'four_star_plays', label: '4★ Made', colorClass: 'text-teal-400', format: 'int' },
    { key: 'four_star_opps', label: '4★ Opps', colorClass: 'text-zinc-400', format: 'int' },
    { key: 'four_star_pct', label: '4★%', colorClass: 'text-teal-400', format: 'dec1' },
    { key: 'three_star_plays', label: '3★ Made', colorClass: 'text-sky-400', format: 'int' },
    { key: 'three_star_opps', label: '3★ Opps', colorClass: 'text-zinc-400', format: 'int' },
    { key: 'three_star_pct', label: '3★%', colorClass: 'text-sky-400', format: 'dec1' },
    { key: 'two_star_plays', label: '2★ Made', colorClass: 'text-amber-400', format: 'int' },
    { key: 'two_star_opps', label: '2★ Opps', colorClass: 'text-zinc-400', format: 'int' },
    { key: 'two_star_pct', label: '2★%', colorClass: 'text-amber-400', format: 'dec1' },
    { key: 'one_star_plays', label: '1★ Made', colorClass: 'text-orange-400', format: 'int' },
    { key: 'one_star_opps', label: '1★ Opps', colorClass: 'text-zinc-400', format: 'int' },
    { key: 'one_star_pct', label: '1★%', colorClass: 'text-orange-400', format: 'dec1' },
  ],
  'defence:arm_strength': [
    { key: 'player_name', label: 'Name', colorClass: 'text-white font-medium', isName: true },
    { key: 'player_id', label: '', colorClass: '', isGroup: true },
    { key: 'team', label: 'Team', colorClass: 'text-zinc-400' },
    { key: 'position', label: 'Pos', colorClass: 'text-zinc-400' },
    { key: 'total_throws', label: 'Throws', colorClass: 'text-zinc-400', format: 'int' },
    { key: 'max_arm_strength', label: 'Max Arm', colorClass: 'text-amber-400', format: 'dec1' },
    { key: 'arm_overall', label: 'Overall', colorClass: 'text-amber-400', format: 'dec1' },
    { key: 'arm_inf', label: 'IF Avg', colorClass: 'text-sky-400', format: 'dec1' },
    { key: 'arm_of', label: 'OF Avg', colorClass: 'text-sky-400', format: 'dec1' },
    { key: 'arm_1b', label: '1B', colorClass: 'text-zinc-300', format: 'dec1' },
    { key: 'arm_2b', label: '2B', colorClass: 'text-zinc-300', format: 'dec1' },
    { key: 'arm_3b', label: '3B', colorClass: 'text-zinc-300', format: 'dec1' },
    { key: 'arm_ss', label: 'SS', colorClass: 'text-zinc-300', format: 'dec1' },
    { key: 'arm_lf', label: 'LF', colorClass: 'text-zinc-300', format: 'dec1' },
    { key: 'arm_cf', label: 'CF', colorClass: 'text-zinc-300', format: 'dec1' },
    { key: 'arm_rf', label: 'RF', colorClass: 'text-zinc-300', format: 'dec1' },
  ],
  'defence:run_value': [
    { key: 'player_name', label: 'Name', colorClass: 'text-white font-medium', isName: true },
    { key: 'player_id', label: '', colorClass: '', isGroup: true },
    { key: 'team', label: 'Team', colorClass: 'text-zinc-400' },
    { key: 'total_runs', label: 'Total Runs', colorClass: '', format: 'int', conditionalColor: (v) => runsColor(v) },
    { key: 'inf_of_runs', label: 'IF/OF Runs', colorClass: '', format: 'int', conditionalColor: (v) => runsColor(v) },
    { key: 'range_runs', label: 'Range', colorClass: '', format: 'int', conditionalColor: (v) => runsColor(v) },
    { key: 'arm_runs', label: 'Arm', colorClass: '', format: 'int', conditionalColor: (v) => runsColor(v) },
    { key: 'dp_runs', label: 'DP', colorClass: '', format: 'int', conditionalColor: (v) => runsColor(v) },
    { key: 'catching_runs', label: 'Catching', colorClass: '', format: 'int', conditionalColor: (v) => runsColor(v) },
    { key: 'framing_runs', label: 'Framing', colorClass: '', format: 'int', conditionalColor: (v) => runsColor(v) },
    { key: 'throwing_runs', label: 'Throwing', colorClass: '', format: 'int', conditionalColor: (v) => runsColor(v) },
    { key: 'blocking_runs', label: 'Blocking', colorClass: '', format: 'int', conditionalColor: (v) => runsColor(v) },
    { key: 'outs_total', label: 'Outs', colorClass: 'text-zinc-400', format: 'int' },
    { key: 'tot_pa', label: 'PA', colorClass: 'text-zinc-400', format: 'int' },
  ],
  'defence:catcher_framing': [
    { key: 'player_name', label: 'Name', colorClass: 'text-white font-medium', isName: true },
    { key: 'player_id', label: '', colorClass: '', isGroup: true },
    { key: 'team', label: 'Team', colorClass: 'text-zinc-400' },
    { key: 'pitches', label: 'Pitches', colorClass: 'text-zinc-400', format: 'int' },
    { key: 'pitches_shadow', label: 'Shadow', colorClass: 'text-zinc-400', format: 'int' },
    { key: 'rv_total', label: 'Framing Runs', colorClass: '', format: 'dec1', conditionalColor: (v) => runsColor(v) },
    { key: 'pct_total', label: 'Strike Rate+', colorClass: '', format: 'dec1', conditionalColor: (v) => oaaColor(v) },
  ],
}

// ── Triton pitch types & per-pitch-type column generation ─────────────────────
export const TRITON_PITCH_TYPES = [
  { abbrev: 'ff', name: '4-Seam Fastball', label: 'FF' },
  { abbrev: 'si', name: 'Sinker', label: 'SI' },
  { abbrev: 'fc', name: 'Cutter', label: 'FC' },
  { abbrev: 'sl', name: 'Slider', label: 'SL' },
  { abbrev: 'sw', name: 'Sweeper', label: 'SW' },
  { abbrev: 'cu', name: 'Curveball', label: 'CU' },
  { abbrev: 'ch', name: 'Changeup', label: 'CH' },
  { abbrev: 'fs', name: 'Split-Finger', label: 'FS' },
  { abbrev: 'kc', name: 'Knuckle Curve', label: 'KC' },
  { abbrev: 'sv', name: 'Slurve', label: 'SV' },
] as const

const RAW_METRICS = [
  { suffix: 'brink', label: 'Brink' },
  { suffix: 'cluster', label: 'Cluster' },
  { suffix: 'hdev', label: 'HDev' },
  { suffix: 'vdev', label: 'VDev' },
  { suffix: 'missfire', label: 'Missfire' },
  { suffix: 'close_pct', label: 'Close%' },
  { suffix: 'waste_pct', label: 'Waste%' },
]

const PLUS_METRICS = [
  { suffix: 'cmd_plus', label: 'Cmd+', hasPlus: true },
  { suffix: 'rpcom_plus', label: 'RPCom+', hasPlus: true },
  { suffix: 'stuff_plus', label: 'Stuff+', hasPlus: true },
  { suffix: 'brink_plus', label: 'Brink+', hasPlus: true },
  { suffix: 'cluster_plus', label: 'Cluster+', hasPlus: true },
  { suffix: 'hdev_plus', label: 'HDev+', hasPlus: true },
  { suffix: 'vdev_plus', label: 'VDev+', hasPlus: true },
  { suffix: 'missfire_plus', label: 'Missfire+', hasPlus: true },
  { suffix: 'close_pct_plus', label: 'Close+', hasPlus: true },
  { suffix: 'waste_pct', label: 'Waste%', hasPlus: false },
]

export const TRITON_RAW_COLUMNS: ColumnDef[] = [
  { key: 'player_name', label: 'Name', colorClass: 'text-white font-medium', isName: true },
  { key: 'pitcher', label: '', colorClass: '', isGroup: true },
  { key: 'pitches', label: 'Pitches', colorClass: 'text-zinc-400', format: 'int' },
  ...TRITON_PITCH_TYPES.flatMap(pt =>
    RAW_METRICS.map(m => ({
      key: `${pt.abbrev}_${m.suffix}`,
      label: `${pt.label} ${m.label}`,
      colorClass: m.suffix === 'waste_pct' ? 'text-red-400' : 'text-zinc-300',
      format: 'dec1' as const,
    }))
  ),
]

export const TRITON_PLUS_COLUMNS: ColumnDef[] = [
  { key: 'player_name', label: 'Name', colorClass: 'text-white font-medium', isName: true },
  { key: 'pitcher', label: '', colorClass: '', isGroup: true },
  { key: 'pitches', label: 'Pitches', colorClass: 'text-zinc-400', format: 'int' },
  { key: 'cmd_plus', label: 'Cmd+', colorClass: '', format: 'dec1', conditionalColor: (v) => plusColor(v) },
  { key: 'rpcom_plus', label: 'RPCom+', colorClass: '', format: 'dec1', conditionalColor: (v) => plusColor(v) },
  ...TRITON_PITCH_TYPES.flatMap(pt =>
    PLUS_METRICS.map(m => ({
      key: `${pt.abbrev}_${m.suffix}`,
      label: `${pt.label} ${m.label}`,
      colorClass: m.suffix === 'waste_pct' ? 'text-red-400' : '',
      format: 'dec1' as const,
      ...(m.hasPlus ? { conditionalColor: (v: number) => plusColor(v) } : {}),
    }))
  ),
]

// ── Deception pitch types & per-pitch-type column generation ──────────────────
export const DECEPTION_PITCH_TYPES = [
  { abbrev: 'ff', label: 'FF' },
  { abbrev: 'si', label: 'SI' },
  { abbrev: 'fc', label: 'FC' },
  { abbrev: 'sl', label: 'SL' },
  { abbrev: 'sw', label: 'SW' },
  { abbrev: 'cu', label: 'CU' },
  { abbrev: 'ch', label: 'CH' },
  { abbrev: 'fs', label: 'FS' },
  { abbrev: 'kc', label: 'KC' },
  { abbrev: 'sv', label: 'SV' },
] as const

function deceptionColor(v: number): string {
  if (v >= 1.0) return 'text-emerald-300'
  if (v >= 0.5) return 'text-teal-400'
  if (v >= 0.0) return 'text-zinc-300'
  if (v >= -0.5) return 'text-orange-400'
  return 'text-red-400'
}

export const DECEPTION_COLUMNS: ColumnDef[] = [
  { key: 'player_name', label: 'Name', colorClass: 'text-white font-medium', isName: true },
  { key: 'pitcher', label: '', colorClass: '', isGroup: true },
  { key: 'pitches', label: 'Pitches', colorClass: 'text-zinc-400', format: 'int' },
  // Overall scores
  { key: 'unique_score', label: 'Unique', colorClass: '', format: 'dec2', conditionalColor: (v) => deceptionColor(v) },
  { key: 'deception_score', label: 'Deception', colorClass: '', format: 'dec2', conditionalColor: (v) => deceptionColor(v) },
  { key: 'xdeception_score', label: 'xDeception', colorClass: '', format: 'dec2', conditionalColor: (v) => deceptionColor(v) },
  // Per pitch type: unique + deception
  ...DECEPTION_PITCH_TYPES.flatMap(pt => [
    {
      key: `${pt.abbrev}_unique`,
      label: `${pt.label} Uniq`,
      colorClass: '',
      format: 'dec2' as const,
      conditionalColor: (v: number) => deceptionColor(v),
    },
    {
      key: `${pt.abbrev}_deception`,
      label: `${pt.label} Dec`,
      colorClass: '',
      format: 'dec2' as const,
      conditionalColor: (v: number) => deceptionColor(v),
    },
  ]),
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Defence stat sets that use the separate defence leaderboard API */
export const DEFENCE_STAT_SETS = new Set(['oaa', 'outfield_oaa', 'catch_probability', 'arm_strength', 'run_value', 'catcher_framing'])

/** Get metric keys needed for a stat set (excludes group-by columns) */
export function getMetricsForStatSet(view: View, statSet: StatSet): string[] {
  if (statSet === 'triton_raw' || statSet === 'triton_plus' || statSet === 'deception') return [] // uses separate API
  if (DEFENCE_STAT_SETS.has(statSet)) return [] // uses defence API
  const cols = COLUMNS[`${view}:${statSet}`] || []
  return cols.filter(c => !c.isGroup && c.key !== '_batter_name').map(c => c.key)
}

/** Get GROUP BY columns for a view */
export function getGroupBy(view: View): string[] {
  switch (view) {
    case 'pitching': return ['player_name', 'pitcher']
    case 'hitting': return ['batter']
    case 'team': return ['pitch_team']
    case 'defence': return ['player_name', 'player_id']
    default: return ['player_name']
  }
}

/** Convert ActiveFilter[] → report API filter format */
export function filtersToReportFormat(filters: ActiveFilter[]): { column: string; op: string; value: any }[] {
  const result: { column: string; op: string; value: any }[] = []
  for (const f of filters) {
    const col = f.def.dbColumn || f.def.key
    if (f.def.type === 'multi' && f.values && f.values.length > 0) {
      const vals = f.def.numberCast ? f.values.map(Number) : f.values
      result.push({ column: col, op: 'in', value: vals })
    }
    if (f.def.type === 'range') {
      if (f.min) result.push({ column: col, op: 'gte', value: parseFloat(f.min) })
      if (f.max) result.push({ column: col, op: 'lte', value: parseFloat(f.max) })
    }
    if (f.def.type === 'date') {
      if (f.startDate) result.push({ column: 'game_date', op: 'gte', value: f.startDate })
      if (f.endDate) result.push({ column: 'game_date', op: 'lte', value: f.endDate })
    }
  }
  return result
}

/** Format a cell value */
export function formatValue(v: any, format?: ColumnDef['format']): string {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  if (isNaN(n) && typeof v === 'string') return v
  switch (format) {
    case 'int': return Math.round(n).toLocaleString()
    case 'dec1': return n.toFixed(1)
    case 'dec2': return n.toFixed(2)
    case 'dec3': return n.toFixed(3).replace(/^0/, '') // .300 style
    case 'pct1': return n.toFixed(1) + '%'
    case 'plus': return n.toFixed(0)
    case 'pctRed': return n.toFixed(1)
    default: return typeof v === 'number' && !Number.isInteger(v) ? n.toFixed(2) : String(v)
  }
}

/** Get the CSS class for a cell */
export function getCellColor(col: ColumnDef, value: any, view: View): string {
  if (col.conditionalColor && value != null && !isNaN(Number(value))) {
    return col.conditionalColor(Number(value), view)
  }
  return col.colorClass
}

/** Default qualifier for each view */
export function defaultQualifier(view: View): { minPitches: number; minPA: number } {
  switch (view) {
    case 'pitching': return { minPitches: 500, minPA: 0 }
    case 'hitting': return { minPitches: 0, minPA: 200 }
    case 'team': return { minPitches: 0, minPA: 0 }
    default: return { minPitches: 0, minPA: 0 }
  }
}
