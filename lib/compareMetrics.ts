// Catalog for the Compare page — which rows exist, where each number comes
// from, how it prints, and which direction is "better".
//
// Three sources, three coverages, and the page keeps them in separate
// sections rather than blending them:
//   lahman   — all of history, box-score stats (lahman_batting_calc /
//              lahman_pitching_calc), plus the awards tables
//   statcast — 2015+ only, aggregated from `pitches` via reportMetrics.METRICS
//   triton   — 2015+ only, pitch-weighted from pitcher_season_command
//
// A player with no rows for a source shows "—" for that whole section. That
// is the honest answer for Willie McCovey's whiff rate, not a zero.
//
// Note: we store neither WAR nor OPS+ anywhere, so neither can be a row here.

// 'pitch' compares pitchers on a single pitch type — pitch-level stats only,
// so no Lahman/official/awards sections exist for it.
export type CompareSource = 'lahman' | 'statcast' | 'triton' | 'awards'
/** Sections the API serves as per-pitch-type rows rather than single values. */
export type SpecialSection = 'arsenal' | 'vspitch' | 'movement'
export type CompareGroup = 'hitting' | 'pitching' | 'pitch'

export type CompareFormat =
  | 'int'      // 2,588
  | 'rate3'    // .296 / 1.024 — leading zero dropped, baseball style
  | 'dec1'     // 94.3
  | 'dec2'     // 6.42
  | 'pct1'     // 31.2%
  | 'plus'     // 108 (already normalized to 100)
  | 'ip'       // 213.1 — thirds, not decimal innings
  | 'check'    // ✓ / blank, for Hall of Fame

export interface CompareMetric {
  /** Unique within its group. Also the id used by custom rows. */
  key: string
  label: string
  source: CompareSource
  /** Field name inside the source's payload object. */
  field: string
  format: CompareFormat
  /** null = never highlight a winner (context rows like G or GS). */
  higherBetter: boolean | null
  /**
   * Client-side derivation from the statcast bag (K/9 and friends). Derived
   * metrics are skipped by the API's fetch list; their components ride along
   * via EXTRA_STATCAST_FIELDS.
   */
  derive?: (statcast: Record<string, number | null>) => number | null
}

export interface CompareSection {
  id: string
  label: string
  /** Kept for grouping/notes; a section's metrics may span several sources. */
  source: CompareSource
  /** Set for per-pitch-type sections (Arsenal / vs Pitch Type). */
  special?: SpecialSection
  /** Coverage caveat, printed small under the section banner. */
  note?: string
  metrics: string[]
  defaultOn?: boolean
}

/**
 * Statcast fields the API must always fetch even though no plain metric
 * names them — components of the client-derived rows (K/9, BB/9, HR/9).
 */
export const EXTRA_STATCAST_FIELDS = ['k_count', 'bb_count', 'hr_count', 'ip'] as const

/** 9 * count / IP, from the statcast bag. */
const per9 = (countKey: string) => (sc: Record<string, number | null>): number | null => {
  const n = sc[countKey]
  const ip = sc.ip
  return n == null || !ip ? null : (9 * n) / ip
}

const m = (
  key: string,
  label: string,
  source: CompareSource,
  format: CompareFormat,
  higherBetter: boolean | null,
  field?: string,
  derive?: CompareMetric['derive'],
): CompareMetric => ({ key, label, source, field: field ?? key, format, higherBetter, derive })

const STATCAST_NOTE = 'Statcast era only — 2015 onward'
const SWING_NOTE = 'Bat-tracking era only — 2023 onward'
// Official lines come from the MLB Stats API (always current, all of history);
// the Lahman sums only fill in for players with no MLBAM id. Awards, though,
// are Lahman-only — and that import ends at 2021 (checked 2026-09-08).
const LAHMAN_NOTE = 'Awards via Lahman — through 2021'
const MIXED_NOTE = 'Official totals via MLB Stats API; pitch-level rates from Statcast (2015+)'
const OFFICIAL_NOTE = 'Official totals via MLB Stats API'

// ── Pitch types ─────────────────────────────────────────────────────────────
// Codes are Statcast `pitch_type`; names match `pitches.pitch_name` and
// `pitcher_season_command.pitch_name` (vocabulary verified 2026-09-08).
export const PITCH_TYPES: { code: string; name: string }[] = [
  { code: 'FF', name: '4-Seam Fastball' },
  { code: 'SI', name: 'Sinker' },
  { code: 'FC', name: 'Cutter' },
  { code: 'SL', name: 'Slider' },
  { code: 'ST', name: 'Sweeper' },
  { code: 'SV', name: 'Slurve' },
  { code: 'CU', name: 'Curveball' },
  { code: 'KC', name: 'Knuckle Curve' },
  { code: 'CH', name: 'Changeup' },
  { code: 'FS', name: 'Split-Finger' },
  { code: 'FO', name: 'Forkball' },
  { code: 'KN', name: 'Knuckleball' },
]

// ── Hitting ─────────────────────────────────────────────────────────────────

export const HITTING_METRICS: Record<string, CompareMetric> = Object.fromEntries(
  [
    // Overall (Lahman)
    m('g', 'G', 'lahman', 'int', null),
    m('pa', 'PA', 'lahman', 'int', null),
    m('ab', 'AB', 'lahman', 'int', null),
    m('r', 'R', 'lahman', 'int', true),
    m('h', 'H', 'lahman', 'int', true),
    m('doubles', '2B', 'lahman', 'int', true),
    m('triples', '3B', 'lahman', 'int', true),
    m('hr', 'HR', 'lahman', 'int', true),
    m('rbi', 'RBI', 'lahman', 'int', true),
    m('sb', 'SB', 'lahman', 'int', true),
    m('cs', 'CS', 'lahman', 'int', null),
    m('bb', 'BB', 'lahman', 'int', true),
    m('so', 'SO', 'lahman', 'int', null),
    m('hbp', 'HBP', 'lahman', 'int', null),
    m('ba', 'BA', 'lahman', 'rate3', true),
    m('obp', 'OBP', 'lahman', 'rate3', true),
    m('slg', 'SLG', 'lahman', 'rate3', true),
    m('ops', 'OPS', 'lahman', 'rate3', true),

    // Batted ball (Statcast)
    m('avg_ev', 'Avg EV', 'statcast', 'dec1', true),
    m('max_ev', 'Max EV', 'statcast', 'dec1', true),
    m('avg_la', 'Avg LA', 'statcast', 'dec1', null),
    m('avg_dist', 'Avg Distance', 'statcast', 'int', true),
    m('hard_hit_pct', 'Hard-Hit%', 'statcast', 'pct1', true),
    m('barrel_pct', 'Barrel%', 'statcast', 'pct1', true),
    m('gb_pct', 'GB%', 'statcast', 'pct1', null),
    m('ld_pct', 'LD%', 'statcast', 'pct1', true),
    m('fb_pct', 'FB%', 'statcast', 'pct1', null),
    m('pu_pct', 'PU%', 'statcast', 'pct1', false),

    // Plate discipline (Statcast)
    m('k_pct', 'K%', 'statcast', 'pct1', false),
    m('bb_pct', 'BB%', 'statcast', 'pct1', true),
    m('whiff_pct', 'Whiff%', 'statcast', 'pct1', false),
    m('chase_pct', 'Chase%', 'statcast', 'pct1', false),
    m('z_swing_pct', 'Z-Swing%', 'statcast', 'pct1', null),
    m('contact_pct', 'Contact%', 'statcast', 'pct1', true),
    m('o_contact_pct', 'O-Contact%', 'statcast', 'pct1', true),
    m('swstr_pct', 'SwStr%', 'statcast', 'pct1', false),

    // Expected (Statcast)
    m('avg_xba', 'xBA', 'statcast', 'rate3', true),
    m('avg_xslg', 'xSLG', 'statcast', 'rate3', true),
    m('avg_xwoba', 'xwOBA', 'statcast', 'rate3', true),
    m('avg_woba', 'wOBA', 'statcast', 'rate3', true),

    // Swing tracking (Statcast, 2023+)
    m('avg_bat_speed', 'Bat Speed', 'statcast', 'dec1', true),
    m('avg_swing_length', 'Swing Length', 'statcast', 'dec2', null),
    m('avg_attack_angle', 'Attack Angle', 'statcast', 'dec1', null),
    m('fast_swing_rate', 'Fast Swing%', 'statcast', 'pct1', true),
    m('squared_up_rate', 'Squared-Up%', 'statcast', 'pct1', true),
    m('blast_rate', 'Blast%', 'statcast', 'pct1', true),

    // Volume + run value (Statcast)
    m('pitches_seen', 'Pitches', 'statcast', 'int', null, 'pitches'),
    m('total_re24', 'RE24', 'statcast', 'dec1', true),

    // Awards
    m('hof', 'Hall of Fame', 'awards', 'check', true),
    m('allStar', 'All-Star', 'awards', 'int', true),
    m('mvp', 'MVP', 'awards', 'int', true),
    m('goldGlove', 'Gold Glove', 'awards', 'int', true),
    m('silverSlugger', 'Silver Slugger', 'awards', 'int', true),
    m('roy', 'Rookie of the Year', 'awards', 'int', true),
  ].map(x => [x.key, x]),
)

export const HITTING_SECTIONS: CompareSection[] = [
  {
    // Mirrors the hitter Overview page's Traditional table, column for column.
    id: 'hit_traditional',
    label: 'Traditional',
    source: 'lahman',
    note: MIXED_NOTE,
    metrics: ['g', 'pa', 'h', 'doubles', 'triples', 'hr', 'bb', 'so', 'hbp', 'ba', 'obp', 'slg', 'ops', 'pitches_seen'],
  },
  {
    // Mirrors the hitter Overview page's Advanced table.
    id: 'hit_advanced',
    label: 'Advanced',
    source: 'statcast',
    note: STATCAST_NOTE,
    metrics: [
      'pitches_seen', 'k_pct', 'bb_pct', 'whiff_pct', 'contact_pct', 'zone_pct', 'chase_pct',
      'avg_ev', 'max_ev', 'avg_la', 'hard_hit_pct', 'barrel_pct', 'gb_pct', 'fb_pct', 'ld_pct',
      'avg_xba', 'avg_xwoba', 'avg_xslg', 'avg_woba', 'total_re24',
    ],
  },
  {
    // Per-pitch-type mini table, one per player — rows can't align across
    // different arsenals faced, so each column renders its own table.
    id: 'hit_vspitch',
    label: 'vs Pitch Type',
    source: 'statcast',
    special: 'vspitch',
    note: STATCAST_NOTE,
    metrics: [],
  },
  {
    id: 'hit_overall',
    label: 'Overall Stats',
    source: 'lahman',
    note: OFFICIAL_NOTE,
    metrics: ['g', 'pa', 'ab', 'r', 'h', 'doubles', 'triples', 'hr', 'rbi', 'sb', 'bb', 'so', 'ba', 'obp', 'slg', 'ops'],
    defaultOn: true,
  },
  {
    id: 'hit_batted',
    label: 'Batted Ball',
    source: 'statcast',
    note: STATCAST_NOTE,
    metrics: ['avg_ev', 'max_ev', 'avg_la', 'avg_dist', 'hard_hit_pct', 'barrel_pct', 'gb_pct', 'ld_pct', 'fb_pct'],
  },
  {
    id: 'hit_discipline',
    label: 'Plate Discipline',
    source: 'statcast',
    note: STATCAST_NOTE,
    metrics: ['k_pct', 'bb_pct', 'whiff_pct', 'chase_pct', 'z_swing_pct', 'contact_pct', 'o_contact_pct', 'swstr_pct'],
  },
  {
    id: 'hit_expected',
    label: 'Expected',
    source: 'statcast',
    note: STATCAST_NOTE,
    metrics: ['avg_xba', 'avg_xslg', 'avg_xwoba', 'avg_woba'],
  },
  {
    id: 'hit_swing',
    label: 'Swing Tracking',
    source: 'statcast',
    note: SWING_NOTE,
    metrics: ['avg_bat_speed', 'avg_swing_length', 'avg_attack_angle', 'fast_swing_rate', 'squared_up_rate', 'blast_rate'],
  },
  {
    id: 'hit_awards',
    label: 'Awards & Honors',
    source: 'awards',
    note: LAHMAN_NOTE,
    metrics: ['hof', 'allStar', 'mvp', 'goldGlove', 'silverSlugger', 'roy'],
    defaultOn: true,
  },
]

// ── Pitching ────────────────────────────────────────────────────────────────

export const PITCHING_METRICS: Record<string, CompareMetric> = Object.fromEntries(
  [
    // Overall (Lahman)
    m('w', 'W', 'lahman', 'int', true),
    m('l', 'L', 'lahman', 'int', null),
    m('g', 'G', 'lahman', 'int', null),
    m('gs', 'GS', 'lahman', 'int', null),
    m('cg', 'CG', 'lahman', 'int', true),
    m('sho', 'SHO', 'lahman', 'int', true),
    m('sv', 'SV', 'lahman', 'int', true),
    m('ip', 'IP', 'lahman', 'ip', true, 'ipouts'),
    m('h', 'H', 'lahman', 'int', null),
    m('r', 'R', 'lahman', 'int', null),
    m('er', 'ER', 'lahman', 'int', null),
    m('hr', 'HR', 'lahman', 'int', null),
    m('bb', 'BB', 'lahman', 'int', null),
    m('so', 'SO', 'lahman', 'int', true),
    m('era', 'ERA', 'lahman', 'dec2', false),
    m('whip', 'WHIP', 'lahman', 'dec2', false),
    m('k9', 'K/9', 'lahman', 'dec1', true),
    m('bb9', 'BB/9', 'lahman', 'dec1', false),
    m('hr9', 'HR/9', 'lahman', 'dec1', false),

    // Stuff (Statcast)
    m('pitches', 'Pitches', 'statcast', 'int', null),
    m('avg_velo', 'Avg Velo', 'statcast', 'dec1', true),
    m('max_velo', 'Max Velo', 'statcast', 'dec1', true),
    m('avg_spin', 'Avg Spin', 'statcast', 'int', true),
    m('avg_ext', 'Extension', 'statcast', 'dec2', true),
    m('avg_ivb_in', 'IVB (in)', 'statcast', 'dec1', null),
    m('avg_hbreak_in', 'HB (in)', 'statcast', 'dec1', null),
    m('avg_arm_angle', 'Arm Angle', 'statcast', 'dec1', null),

    // Results (Statcast)
    m('k_pct', 'K%', 'statcast', 'pct1', true),
    m('bb_pct', 'BB%', 'statcast', 'pct1', false),
    m('k_minus_bb', 'K-BB%', 'statcast', 'pct1', true),
    m('whiff_pct', 'Whiff%', 'statcast', 'pct1', true),
    m('csw_pct', 'CSW%', 'statcast', 'pct1', true),
    m('chase_pct', 'Chase%', 'statcast', 'pct1', true),
    m('zone_pct', 'Zone%', 'statcast', 'pct1', null),
    m('swstr_pct', 'SwStr%', 'statcast', 'pct1', true),

    // Contact allowed (Statcast)
    m('avg_ev', 'Avg EV', 'statcast', 'dec1', false),
    m('hard_hit_pct', 'Hard-Hit%', 'statcast', 'pct1', false),
    m('barrel_pct', 'Barrel%', 'statcast', 'pct1', false),
    m('gb_pct', 'GB%', 'statcast', 'pct1', true),
    m('fb_pct', 'FB%', 'statcast', 'pct1', null),
    m('avg_xwoba', 'xwOBA', 'statcast', 'rate3', false),
    m('ba', 'BA Against', 'statcast', 'rate3', false),

    // Traditional extras (Lahman counting + Statcast splits the box score lacks)
    m('bf', 'BF', 'lahman', 'int', null, 'bfp'),
    m('hbp_against', 'HBP', 'lahman', 'int', null, 'hbp'),
    m('doubles_against', '2B', 'statcast', 'int', null, 'doubles'),
    m('triples_against', '3B', 'statcast', 'int', null, 'triples'),
    m('obp_against', 'OBP Against', 'statcast', 'rate3', false, 'obp'),
    m('slg_against', 'SLG Against', 'statcast', 'rate3', false, 'slg'),
    m('ops_against', 'OPS Against', 'statcast', 'rate3', false, 'ops'),

    // Advanced extras (Statcast)
    m('sc_ip', 'IP (SC)', 'statcast', 'dec1', null, 'ip'),
    m('cs_pct', 'CSt%', 'statcast', 'pct1', true),
    m('fps_pct', 'FPS%', 'statcast', 'pct1', true),
    m('avg_la', 'Avg LA', 'statcast', 'dec1', null),
    m('max_ev', 'Max EV', 'statcast', 'dec1', false),
    m('ld_pct', 'LD%', 'statcast', 'pct1', false),
    m('avg_xba', 'xBA Against', 'statcast', 'rate3', false),
    m('avg_xslg', 'xSLG Against', 'statcast', 'rate3', false),
    m('avg_woba', 'wOBA Against', 'statcast', 'rate3', false),
    // Sum of delta_run_exp is from the batting team's side: negative = good pitching.
    m('total_re24', 'RE24', 'statcast', 'dec1', false),
    m('sc_k9', 'K/9 (SC)', 'statcast', 'dec1', true, '', per9('k_count')),
    m('sc_bb9', 'BB/9 (SC)', 'statcast', 'dec1', false, '', per9('bb_count')),
    m('sc_hr9', 'HR/9 (SC)', 'statcast', 'dec1', false, '', per9('hr_count')),

    // Deception (pitcher_season_deception, merged into the triton payload)
    m('deception_score', 'Deception', 'triton', 'dec1', true),
    m('unique_score', 'Uniqueness', 'triton', 'dec1', true),

    // Triton+ (pitcher_season_command)
    m('cmd_plus', 'Cmd+', 'triton', 'plus', true),
    m('rpcom_plus', 'rpCom+', 'triton', 'plus', true),
    m('brink_plus', 'Brink+', 'triton', 'plus', true),
    m('cluster_plus', 'Cluster+', 'triton', 'plus', true),
    m('hdev_plus', 'hDev+', 'triton', 'plus', true),
    m('vdev_plus', 'vDev+', 'triton', 'plus', true),
    m('missfire_plus', 'Missfire+', 'triton', 'plus', true),
    m('close_pct_plus', 'Close%+', 'triton', 'plus', true),

    // Awards
    m('hof', 'Hall of Fame', 'awards', 'check', true),
    m('allStar', 'All-Star', 'awards', 'int', true),
    m('cyYoung', 'Cy Young', 'awards', 'int', true),
    m('mvp', 'MVP', 'awards', 'int', true),
    m('goldGlove', 'Gold Glove', 'awards', 'int', true),
    m('roy', 'Rookie of the Year', 'awards', 'int', true),
  ].map(x => [x.key, x]),
)

export const PITCHING_SECTIONS: CompareSection[] = [
  {
    // Mirrors the pitcher Overview page's Traditional table, column for
    // column: box-score line from Lahman, the against-splits the box score
    // lacks (2B/3B, OBP/SLG/OPS against, rates) from Statcast.
    id: 'pit_traditional',
    label: 'Traditional',
    source: 'lahman',
    note: MIXED_NOTE,
    metrics: [
      'w', 'l', 'era', 'g', 'gs', 'sv', 'ip', 'bf',
      'h', 'doubles_against', 'triples_against', 'hr', 'bb', 'so', 'hbp_against',
      'ba', 'obp_against', 'slg_against', 'ops_against', 'whip',
      'k_pct', 'bb_pct', 'whiff_pct', 'pitches',
    ],
  },
  {
    // Mirrors the pitcher Overview page's Advanced table, minus the ERA
    // estimators (FIP/xFIP/xERA/SIERA) and SOS — no defensible multi-season
    // aggregation for those yet.
    id: 'pit_advanced',
    label: 'Advanced',
    source: 'statcast',
    note: STATCAST_NOTE,
    metrics: [
      'pitches', 'sc_ip',
      'k_pct', 'bb_pct', 'k_minus_bb', 'whiff_pct', 'swstr_pct', 'cs_pct', 'fps_pct', 'zone_pct',
      'avg_ev', 'max_ev', 'avg_la', 'gb_pct', 'fb_pct', 'ld_pct',
      'avg_xba', 'avg_xwoba', 'avg_xslg', 'avg_woba',
      'sc_k9', 'sc_bb9', 'sc_hr9', 'total_re24',
      'cmd_plus', 'rpcom_plus', 'deception_score', 'unique_score',
    ],
  },
  {
    // Movement is only meaningful per pitch type — a whole-arsenal average
    // IVB mixes fastball ride with curveball drop — so this renders like
    // Arsenal: a per-player mini table off the same byPitch payload.
    id: 'pit_movement',
    label: 'Pitch Movement',
    source: 'statcast',
    special: 'movement',
    note: STATCAST_NOTE,
    metrics: [],
  },
  {
    // Per-pitch-type mini table, one per player — arsenals differ, so rows
    // can't align across columns; each player renders their own table.
    id: 'pit_arsenal',
    label: 'Arsenal',
    source: 'statcast',
    special: 'arsenal',
    note: STATCAST_NOTE,
    metrics: [],
  },
  {
    id: 'pit_overall',
    label: 'Overall Stats',
    source: 'lahman',
    note: OFFICIAL_NOTE,
    metrics: ['w', 'l', 'g', 'gs', 'cg', 'sho', 'sv', 'ip', 'h', 'r', 'er', 'hr', 'bb', 'so', 'era', 'whip', 'k9', 'bb9'],
    defaultOn: true,
  },
  {
    id: 'pit_stuff',
    label: 'Stuff',
    source: 'statcast',
    note: STATCAST_NOTE,
    metrics: ['pitches', 'avg_velo', 'max_velo', 'avg_spin', 'avg_ext', 'avg_ivb_in', 'avg_hbreak_in', 'avg_arm_angle'],
  },
  {
    id: 'pit_results',
    label: 'Results',
    source: 'statcast',
    note: STATCAST_NOTE,
    metrics: ['k_pct', 'bb_pct', 'k_minus_bb', 'whiff_pct', 'csw_pct', 'chase_pct', 'zone_pct', 'swstr_pct'],
  },
  {
    id: 'pit_contact',
    label: 'Contact Allowed',
    source: 'statcast',
    note: STATCAST_NOTE,
    metrics: ['avg_ev', 'hard_hit_pct', 'barrel_pct', 'gb_pct', 'fb_pct', 'ba', 'avg_xwoba'],
  },
  {
    id: 'pit_triton',
    label: 'Triton+ Command',
    source: 'triton',
    note: 'Pitch-weighted from pitcher_season_command — 2015 onward. 100 = league average.',
    metrics: ['cmd_plus', 'rpcom_plus', 'brink_plus', 'cluster_plus', 'hdev_plus', 'vdev_plus', 'missfire_plus', 'close_pct_plus'],
  },
  {
    id: 'pit_awards',
    label: 'Awards & Honors',
    source: 'awards',
    note: LAHMAN_NOTE,
    metrics: ['hof', 'allStar', 'cyYoung', 'mvp', 'goldGlove', 'roy'],
    defaultOn: true,
  },
]

// ── Pitch (one pitch type, pitcher vs pitcher) ──────────────────────────────
// All statcast fields come from the route's fetchPitchLevel aggregation over
// `pitches` filtered to the selected pitch_type; usage% is that pitch's share
// of the pitcher's total pitches in the window. Triton fields are the command
// table's rows for that pitch (pitch-weighted across years) plus the pitch's
// deception scores.

export const PITCH_METRICS: Record<string, CompareMetric> = Object.fromEntries(
  [
    // Traits
    m('count', 'Pitches', 'statcast', 'int', null),
    m('usage_pct', 'Usage%', 'statcast', 'pct1', null),
    m('avg_velo', 'Avg Velo', 'statcast', 'dec1', true),
    m('max_velo', 'Max Velo', 'statcast', 'dec1', true),
    m('avg_spin', 'Avg Spin', 'statcast', 'int', true),
    m('ivb', 'IVB (in)', 'statcast', 'dec1', null),
    m('hb', 'HB (in)', 'statcast', 'dec1', null),
    m('ext', 'Extension', 'statcast', 'dec2', true),
    m('arm_angle', 'Arm Angle', 'statcast', 'dec1', null),
    m('rel_h', 'Rel Height', 'statcast', 'dec2', null),
    m('rel_s', 'Rel Side', 'statcast', 'dec2', null),

    // Results
    m('whiff_pct', 'Whiff%', 'statcast', 'pct1', true),
    m('csw_pct', 'CSW%', 'statcast', 'pct1', true),
    m('cs_pct', 'CSt%', 'statcast', 'pct1', true),
    m('chase_pct', 'Chase%', 'statcast', 'pct1', true),
    m('zone_pct', 'Zone%', 'statcast', 'pct1', null),
    m('ba', 'BA Against', 'statcast', 'rate3', false),
    m('slg', 'SLG Against', 'statcast', 'rate3', false),
    m('avg_woba', 'wOBA Against', 'statcast', 'rate3', false),
    m('avg_xwoba', 'xwOBA Against', 'statcast', 'rate3', false),
    m('avg_ev', 'Avg EV', 'statcast', 'dec1', false),
    m('hard_hit_pct', 'Hard-Hit%', 'statcast', 'pct1', false),
    m('barrel_pct', 'Barrel%', 'statcast', 'pct1', false),

    // Triton (stuff from pitches; command/deception from the season tables)
    m('stuff_plus', 'Stuff+', 'statcast', 'plus', true),
    m('brink', 'Brink', 'triton', 'dec1', true),
    m('cluster', 'Cluster', 'triton', 'dec1', false),
    m('brink_plus', 'Brink+', 'triton', 'plus', true),
    m('cluster_plus', 'Cluster+', 'triton', 'plus', true),
    m('deception_score', 'Deception', 'triton', 'dec1', true),
    m('unique_score', 'Uniqueness', 'triton', 'dec1', true),
  ].map(x => [x.key, x]),
)

export const PITCH_SECTIONS: CompareSection[] = [
  {
    id: 'ptc_traits',
    label: 'Traits',
    source: 'statcast',
    note: STATCAST_NOTE,
    metrics: ['count', 'usage_pct', 'avg_velo', 'max_velo', 'avg_spin', 'ivb', 'hb', 'ext', 'arm_angle', 'rel_h', 'rel_s'],
    defaultOn: true,
  },
  {
    id: 'ptc_results',
    label: 'Results',
    source: 'statcast',
    note: STATCAST_NOTE,
    metrics: ['whiff_pct', 'csw_pct', 'cs_pct', 'chase_pct', 'zone_pct', 'ba', 'slg', 'avg_woba', 'avg_xwoba', 'avg_ev', 'hard_hit_pct', 'barrel_pct'],
    defaultOn: true,
  },
  {
    id: 'ptc_triton',
    label: 'Triton',
    source: 'triton',
    note: 'Stuff+ from pitch data; command/deception pitch-weighted from the season tables (2015+)',
    metrics: ['stuff_plus', 'brink', 'cluster', 'brink_plus', 'cluster_plus', 'deception_score', 'unique_score'],
  },
]

// ── Lookups ─────────────────────────────────────────────────────────────────

export const metricsFor = (group: CompareGroup) =>
  group === 'hitting' ? HITTING_METRICS : group === 'pitch' ? PITCH_METRICS : PITCHING_METRICS

export const sectionsFor = (group: CompareGroup) =>
  group === 'hitting' ? HITTING_SECTIONS : group === 'pitch' ? PITCH_SECTIONS : PITCHING_SECTIONS

/**
 * Every source a set of sections needs, so the API only runs those queries.
 * Sections may mix sources (Traditional = Lahman totals + Statcast rates),
 * so this walks the metrics rather than trusting the section's banner source.
 */
export function sourcesForSections(group: CompareGroup, sectionIds: string[]): CompareSource[] {
  const catalog = metricsFor(group)
  const wanted = new Set<CompareSource>()
  for (const s of sectionsFor(group)) {
    if (!sectionIds.includes(s.id)) continue
    if (s.special) wanted.add('statcast')
    for (const key of s.metrics) {
      const mt = catalog[key]
      if (mt) wanted.add(mt.source)
    }
  }
  return [...wanted]
}

/** Whether any active section wants the per-pitch-type payload. */
export function needsPitchTypeRows(group: CompareGroup, sectionIds: string[]): boolean {
  return sectionsFor(group).some(s => s.special && sectionIds.includes(s.id))
}

/**
 * Innings from Lahman's `ipouts`: 640 outs is 213.1 (213 and a third), not
 * 213.3. Formatting it as a plain decimal would silently misread thirds.
 */
export function formatIPFromOuts(outs: number | null): string {
  if (outs == null || !isFinite(outs)) return '—'
  const whole = Math.floor(outs / 3)
  return `${whole}.${outs % 3}`
}

/** Baseball rate style: .296, 1.024 — the leading zero goes away. */
function rate3(v: number): string {
  const s = v.toFixed(3)
  return s.startsWith('0.') ? s.slice(1) : s
}

export function formatCompareValue(metric: CompareMetric, value: unknown): string {
  if (metric.format === 'check') return value ? '✓' : ''
  if (value == null || value === '') return '—'
  if (metric.format === 'ip') {
    // The API sends outs; IP is derived so thirds survive the round trip.
    return formatIPFromOuts(Number(value))
  }
  const n = Number(value)
  if (!isFinite(n)) return '—'
  switch (metric.format) {
    case 'int': return n.toLocaleString()
    case 'rate3': return rate3(n)
    case 'dec1': return n.toFixed(1)
    case 'dec2': return n.toFixed(2)
    case 'pct1': return `${n.toFixed(1)}%`
    case 'plus': return n.toFixed(0)
    default: return String(n)
  }
}

/**
 * Indices of the winning cells for one row. Empty when the metric has no
 * direction, fewer than two players have a value, or the best value is tied —
 * highlighting a tie would claim a winner that isn't there.
 */
export function winningIndices(metric: CompareMetric, values: unknown[]): number[] {
  if (metric.higherBetter == null) return []
  if (metric.format === 'check') {
    const idx = values.map((v, i) => (v ? i : -1)).filter(i => i >= 0)
    // Every player having it is not a distinction worth shading.
    return idx.length === values.filter(v => v !== undefined).length ? [] : idx
  }
  const nums = values.map(v => (v == null || v === '' ? null : Number(v)))
  const present = nums.filter((n): n is number => n != null && isFinite(n))
  if (present.length < 2) return []
  const best = metric.higherBetter ? Math.max(...present) : Math.min(...present)
  const winners = nums.map((n, i) => (n === best ? i : -1)).filter(i => i >= 0)
  return winners.length === present.length ? [] : winners
}
