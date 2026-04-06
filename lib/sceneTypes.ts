export type ElementType = 'stat-card' | 'text' | 'shape' | 'player-image' | 'image' | 'comparison-bar' | 'pitch-flight' | 'stadium' | 'ticker' | 'zone-plot' | 'movement-plot' | 'path' | 'curved-text' | 'group' | 'rc-table' | 'rc-heatmap' | 'rc-zone-plot' | 'rc-movement-plot' | 'rc-stat-box' | 'rc-bar-chart' | 'rc-donut-chart' | 'rc-statline'

// ── Effects ─────────────────────────────────────────────────────────────────

export interface Effect {
  id: string
  type: 'shadow' | 'inner-shadow' | 'outer-glow' | 'inner-glow'
  color: string
  blur: number
  offsetX: number
  offsetY: number
  spread: number
  opacity: number
}

// ── Guide ───────────────────────────────────────────────────────────────────

export interface Guide {
  id: string
  axis: 'x' | 'y'
  position: number
}

// ── Dynamic Slots ───────────────────────────────────────────────────────────

export interface DynamicSlot {
  id: string
  label: string         // "Player 1", "Player 2", etc.
  playerId?: number
  playerName?: string
  playerType: 'pitcher' | 'batter'
  gameYear: number
  pitchType?: string
}

// ── Data Binding ────────────────────────────────────────────────────────────

export interface DataBinding {
  playerId: number
  playerName: string
  metric: string
  source: 'statcast' | 'lahman' | 'dynamic'
  gameYear?: number
  pitchType?: string
  lahmanStat?: string
  dynamicSlot?: string  // slot ID reference
}

// ── Animation ───────────────────────────────────────────────────────────────

export type EasingFunction = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface Keyframe {
  frame: number
  props: Partial<{ x: number; y: number; width: number; height: number; opacity: number; rotation: number }>
  easing: EasingFunction
}

// ── Template Binding (for custom template builder) ──────────────────────────

export interface TemplateBinding {
  fieldPath: string          // e.g. 'player_name', 'primary_value'
  targetProp?: string        // which prop to fill (auto-detected if omitted)
  format?: 'raw' | '1f' | '2f' | 'integer' | 'percent' | '3f'
}

export type DataSchemaType = 'leaderboard' | 'outing' | 'starter-card' | 'percentile' | 'generic'

// ── Report Card Binding ──────────────────────────────────────────────────────

export type ReportCardObjectType = 'rc-table' | 'rc-heatmap' | 'rc-zone-plot' | 'rc-movement-plot' | 'rc-stat-box' | 'rc-bar-chart' | 'rc-donut-chart' | 'rc-statline'

export interface ReportCardBinding {
  objectType: ReportCardObjectType
  metric?: string
  format?: string  // '1f', '2f', 'integer', 'percent'
  columns?: { key: string; label: string; format?: string }[]
  colorBy?: 'pitch_type' | 'metric'
  colorMetric?: string
  dataSource?: 'starter-card' | 'player-data'
}

// ── Input Sections (for template builder) ────────────────────────────────

export const MAX_INPUT_SECTIONS = 5

export type SectionInputKey =
  | 'playerPicker' | 'playerType' | 'season' | 'pitchType'
  | 'primaryStat' | 'secondaryStat' | 'tertiaryStat'
  | 'dateRange' | 'sortDir' | 'count' | 'minSample' | 'title'

export type GlobalInputType = 'player' | 'live-game' | 'leaderboard' | 'team'

export interface InputSection {
  id: string
  label: string            // user-chosen name, e.g. "Player One"
  elementIds: string[]     // SceneElement IDs bound to this section
  enabledInputs: SectionInputKey[]  // kept for backwards compat — auto-derived from globalInputType
  globalInputType?: GlobalInputType
  leaderboardType?: 'players' | 'team'  // for leaderboard: players vs team ranking
  gameDate?: string        // for live game date picker
  gamePk?: number          // for live game selection
  playerType: 'pitcher' | 'batter'
  playerId?: number
  playerName?: string
  gameYear: number         // default 2025
  pitchType?: string       // undefined = all
  // Extended fields
  primaryStat?: string
  secondaryStat?: string
  tertiaryStat?: string
  dateRange?: { type: 'season'; year: number } | { type: 'custom'; from: string; to: string }
  sortDir?: 'asc' | 'desc'
  count?: number
  minSample?: number
  title?: string
}

export interface SectionBinding {
  sectionId: string
  metric: string           // SCENE_METRICS key, e.g. 'avg_velo'; '__player__' for player-image
  format?: 'raw' | '1f' | '2f' | 'integer' | 'percent' | '3f'
  targetProp?: string      // auto-detected if omitted
}

export interface RepeaterConfig {
  enabled: boolean
  elementIds: string[]
  direction: 'vertical' | 'horizontal'
  offset: number
  count: number
}

export interface CustomTemplateRecord {
  id: string
  name: string
  description: string
  category: string
  icon: string
  width: number
  height: number
  background: string
  elements: SceneElement[]
  schemaType: DataSchemaType
  repeater: RepeaterConfig | null
  inputSections?: InputSection[]
  globalFilter?: GlobalFilter
  base_template_id?: string
  created_at: string
  updated_at: string
}

// ── Element Binding (new simplified binding) ─────────────────────────────

export interface ElementBinding {
  field: string        // 'avg_velo', 'player_name', '__player__', etc.
  format?: FormatType  // auto-detected from METRIC_DEFAULT_FORMAT if omitted
  targetProp?: string  // auto-detected from element type if omitted
}

export type FormatType = 'raw' | '1f' | '2f' | 'integer' | 'percent' | '3f'

// ── Global Filter ──────────────────────────────────────────────────────

export type GlobalFilterType = 'single-player' | 'team' | 'leaderboard' | 'live-game' | 'matchup' | 'depth-chart' | 'bullpen-depth-chart' | 'player-checkin' | 'yesterday-scores' | 'trends' | 'top-pitchers'

export interface GlobalFilter {
  type: GlobalFilterType
  playerType?: 'pitcher' | 'batter'
  playerId?: number
  playerName?: string
  teamAbbrev?: string
  dateRange?: { type: 'season'; year: number } | { type: 'custom'; from: string; to: string }
  pitchType?: string
  // Leaderboard-specific
  rankStat?: string
  count?: number
  minSample?: number
  sortDir?: 'asc' | 'desc'
  // Leaderboard repeater (embedded)
  repeaterDirection?: 'vertical' | 'horizontal'
  repeaterOffset?: number
  // Live Game
  gameDate?: string
  gamePk?: number
  // Matchup
  playerA?: { id: number; name: string; type: 'pitcher' | 'batter' }
  playerB?: { id: number; name: string; type: 'pitcher' | 'batter' }
  // Player Check-In (multi-player)
  players?: { id: number; name: string; type: 'pitcher' | 'batter' }[]
  // Yesterday Scores
  scoreDate?: string
}

// ── Scene Element ───────────────────────────────────────────────────────────

export interface SceneElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  zIndex: number
  locked: boolean
  props: Record<string, any>
  dataBinding?: DataBinding
  templateBinding?: TemplateBinding
  binding?: ElementBinding
  sectionBinding?: SectionBinding
  reportCardBinding?: ReportCardBinding
  enterFrame?: number
  exitFrame?: number
  keyframes?: Keyframe[]
  blendMode?: string
  effects?: Effect[]
  clipMaskId?: string
  parentGroupId?: string
}

// ── Template Data Binding ────────────────────────────────────────────────────

export interface TemplateConfig {
  templateId: string              // e.g. 'top-5-leaderboard'
  playerType: 'pitcher' | 'batter'
  primaryStat: string             // metric key from METRICS
  secondaryStat?: string
  tertiaryStat?: string
  dateRange:
    | { type: 'season'; year: number }
    | { type: 'custom'; from: string; to: string }
  pitchType?: string
  title?: string
  sortDir?: 'asc' | 'desc'       // default 'desc'
  count?: number                  // default 5
  minSample?: number              // min pitches/PA qualifier
  // Outing template fields
  playerId?: number
  playerName?: string
  gamePk?: number
  gameLabel?: string
  // Depth chart / team fields
  teamAbbrev?: string
}

export interface TemplateDataRow {
  player_id: number
  player_name: string
  primary_value: number | string | null
  secondary_value?: number | string | null
  tertiary_value?: number | string | null
}

export interface OutingData {
  pitcher_id: number
  pitcher_name: string
  game_date: string
  opponent: string
  game_line: { ip: string; h: number; r: number; er: number; bb: number; k: number; pitches: number }
  arsenal: { pitch_name: string; count: number; avg_velo: number; avg_ivb: number; avg_hbreak: number; avg_arm_angle: number; avg_ext: number; whiffs: number; stuff_plus: number | null; unique_score: number | null; deception_score: number | null; cmd_plus: number | null }[]
  locations: { plate_x: number; plate_z: number; pitch_name: string }[]
  command: { waste_pct: number | null; avg_cluster: number | null; avg_brink: number | null }
}

export interface StarterCardData {
  pitcher_id: number
  pitcher_name: string
  p_throws: string
  team: string
  age: number | null
  game_date: string
  opponent: string
  game_line: { ip: string; er: number; h: number; hr: number; bb: number; k: number; whiffs: number; csw_pct: number; pitches: number; r: number; decision: string; era: string }
  grades: { start: string; stuff: string; command: string; triton: string }
  primary_fastball: { name: string; avg_velo: number; avg_ext: number; avg_ivb: number; avg_hb: number; avg_havaa: number } | null
  usage: { pitch_name: string; outing_pct: number; vs_lhb_pct: number; vs_rhb_pct: number; season_pct: number }[]
  movement: { hb: number; ivb: number; pitch_name: string }[]
  season_movement: { pitch_name: string; avg_hb: number; avg_ivb: number; std_hb: number; std_ivb: number }[]
  locations_lhb: { plate_x: number; plate_z: number; pitch_name: string }[]
  locations_rhb: { plate_x: number; plate_z: number; pitch_name: string }[]
  pitch_metrics: { pitch_name: string; count: number; avg_velo: number; velo_diff: number; avg_ivb: number; avg_hb: number; avg_ext: number; str_pct: number; swstr_pct: number; csw_pct: number; xslgcon: number; stuff_plus: number | null; whiffs: number; unique_score: number | null; deception_score: number | null; cmd_plus: number | null; avg_missfire: number | null; avg_cluster: number | null; avg_brink: number | null; triton_plus: number | null }[]
  command: { waste_pct: number | null; avg_cluster: number | null; avg_brink: number | null; cmd_plus: number | null; avg_missfire: number | null }
}

// ── Scene ───────────────────────────────────────────────────────────────────

export interface Scene {
  id: string
  name: string
  width: number
  height: number
  background: string
  elements: SceneElement[]
  savedId?: string
  duration?: number // seconds, default 5
  fps?: number      // default 30
  templateConfig?: TemplateConfig
  templateData?: TemplateDataRow[]
  dynamicSlots?: DynamicSlot[]
  guides?: Guide[]
}

// ── Catalog ─────────────────────────────────────────────────────────────────

export const ELEMENT_CATALOG: { type: ElementType; name: string; desc: string; icon: string }[] = [
  { type: 'stat-card', name: 'Stat Card', desc: 'Bold stat with label', icon: '#' },
  { type: 'text', name: 'Text', desc: 'Custom text block', icon: 'T' },
  { type: 'shape', name: 'Shape', desc: 'Rectangle or circle', icon: '\u25a1' },
  { type: 'player-image', name: 'Player', desc: 'MLB headshot', icon: '\u25c9' },
  { type: 'image', name: 'Image', desc: 'Upload JPG/PNG', icon: '\u25a3' },
  { type: 'comparison-bar', name: 'Stat Bar', desc: 'Horizontal bar', icon: '\u25ac' },
  { type: 'pitch-flight', name: 'Pitch Flight', desc: 'Animated trajectory', icon: '\u2312' },
  { type: 'stadium', name: 'Stadium', desc: '3D field with hit trajectories', icon: '\u26be' },
  { type: 'ticker', name: 'Ticker', desc: 'Scrolling text crawl', icon: '\u21c4' },
  { type: 'zone-plot', name: 'Zone Plot', desc: 'Pitch locations with zone overlay', icon: '\u25ce' },
  { type: 'movement-plot', name: 'Movement Plot', desc: 'HB vs IVB scatter with season shapes', icon: '\u25c8' },
  { type: 'path', name: 'Path', desc: 'Custom SVG path', icon: '\u2710' },
  { type: 'curved-text', name: 'Curved Text', desc: 'Text along an arc', icon: '\u223F' },
  { type: 'group', name: 'Group', desc: 'Group container', icon: '\u29C9' },
]

// ── Shared style defaults ───────────────────────────────────────────────────

const UNIVERSAL_STYLE = {
  bgColor: '', bgOpacity: 1,
  shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 4, shadowColor: '#000000',
  borderWidth: 0, borderColor: '#06b6d4', borderRadius: 12,
  blurAmount: 0, blendMode: 'normal',
}

const TEXT_STYLE = {
  fontFamily: '', textTransform: 'none',
  textShadowBlur: 0, textShadowColor: '#06b6d4',
  textShadowOffsetX: 0, textShadowOffsetY: 0,
  letterSpacing: 0, lineHeight: 1.2,
}

const DEFAULTS: Record<ElementType, { w: number; h: number; props: Record<string, any> }> = {
  'stat-card': {
    w: 280, h: 160,
    props: { ...UNIVERSAL_STYLE, ...TEXT_STYLE, label: 'ERA', value: '2.89', sublabel: '2024', color: '#06b6d4', fontSize: 48, variant: 'glass', bgColor: 'transparent' },
  },
  'text': {
    w: 400, h: 80,
    props: { ...UNIVERSAL_STYLE, ...TEXT_STYLE, text: 'Title Text', fontSize: 36, fontWeight: 700, color: '#ffffff', textAlign: 'center', bgColor: 'transparent', borderRadius: 0 },
  },
  'shape': {
    w: 200, h: 200,
    props: { ...UNIVERSAL_STYLE, shape: 'rect', fill: '#18181b', stroke: '#06b6d4', strokeWidth: 1, borderRadius: 12, gradient: '' },
  },
  'player-image': {
    w: 180, h: 220,
    props: { ...UNIVERSAL_STYLE, playerId: null, playerName: '', borderColor: '#06b6d4', showLabel: true, bgColor: 'transparent' },
  },
  'image': {
    w: 300, h: 200,
    props: { ...UNIVERSAL_STYLE, src: '', objectFit: 'cover' },
  },
  'comparison-bar': {
    w: 400, h: 48,
    props: { ...UNIVERSAL_STYLE, ...TEXT_STYLE, label: 'Fastball', value: 96.2, maxValue: 105, color: '#06b6d4', showValue: true, barBgColor: '#27272a', bgColor: 'transparent', borderRadius: 0 },
  },
  'pitch-flight': {
    w: 400, h: 300,
    props: {
      ...UNIVERSAL_STYLE,
      pitches: [
        { id: 'p1', playerId: null, playerName: '', pitchType: 'FF', pitchColor: '#06b6d4', mode: 'player', customPitch: null, showInKey: true },
      ],
      viewMode: 'catcher', showZone: true, animate: true,
      bgColor: '#09090b', showGrid: true, loopDuration: 1.5, showKey: true,
    },
  },
  'stadium': {
    w: 500, h: 400,
    props: {
      ...UNIVERSAL_STYLE,
      hits: [
        { id: 'h1', batterId: null, batterName: '', eventFilter: '', bbTypeFilter: '', color: '#06b6d4', showInKey: true },
      ],
      viewMode: 'overhead', park: 'generic', animate: true, showKey: true,
      bgColor: '#09090b', showWall: true, showField: true, loopDuration: 3,
      animMode: 'simultaneous', displayMode: 'all', singleHitIndex: 0,
    },
  },
  'ticker': {
    w: 800, h: 48,
    props: {
      ...UNIVERSAL_STYLE, ...TEXT_STYLE,
      text: 'Breaking: Player Name hits 3 home runs in tonight\'s game \u2022 Team clinches playoff spot \u2022 Trade deadline approaching',
      fontSize: 20, fontWeight: 600, color: '#ffffff',
      bgColor: '#09090b', speed: 60, direction: 'left',
      separator: ' \u2022 ', showBg: true,
    },
  },
  'zone-plot': {
    w: 400, h: 450,
    props: {
      ...UNIVERSAL_STYLE, pitches: [], showZone: true, dotSize: 8, dotOpacity: 0.85,
      bgColor: '#09090b', showKey: true, zoneColor: '#52525b', zoneLineWidth: 2,
    },
  },
  'movement-plot': {
    w: 340, h: 320,
    props: {
      ...UNIVERSAL_STYLE, pitches: [], seasonShapes: [], bgColor: '#09090b',
      dotSize: 10, dotOpacity: 0.85, showKey: false, showSeasonShapes: true, maxRange: 24,
    },
  },
  'path': {
    w: 300, h: 300,
    props: {
      ...UNIVERSAL_STYLE, pathData: 'M 50 150 L 150 50 L 250 150 L 200 250 L 100 250 Z',
      stroke: '#06b6d4', strokeWidth: 2, fill: 'transparent', closed: true,
      bgColor: '', borderWidth: 0, borderRadius: 0,
    },
  },
  'curved-text': {
    w: 300, h: 200,
    props: {
      ...UNIVERSAL_STYLE, ...TEXT_STYLE, text: 'Curved Text', fontSize: 24,
      color: '#ffffff', arc: 180, radius: 120, startAngle: 0,
      bgColor: '', borderWidth: 0, borderRadius: 0,
    },
  },
  'group': {
    w: 100, h: 100,
    props: { childIds: [] },
  },
  'rc-stat-box': {
    w: 220, h: 120,
    props: { ...UNIVERSAL_STYLE, ...TEXT_STYLE, label: 'Stat', value: '--', format: '1f', color: '#06b6d4', fontSize: 44, bgColor: 'rgba(255,255,255,0.04)', borderRadius: 12 },
  },
  'rc-table': {
    w: 600, h: 300,
    props: {
      ...UNIVERSAL_STYLE, ...TEXT_STYLE, bgColor: '#09090b', borderRadius: 12,
      columns: [
        { key: 'pitch_name', label: 'Pitch', format: 'raw' },
        { key: 'count', label: '#', format: 'integer' },
        { key: 'avg_velo', label: 'Velo', format: '1f' },
        { key: 'avg_ivb', label: 'IVB', format: '1f' },
        { key: 'avg_hb', label: 'HB', format: '1f' },
        { key: 'swstr_pct', label: 'SwStr%', format: '1f' },
      ],
      rows: [], headerColor: '#a1a1aa', textColor: '#e4e4e7', fontSize: 13, headerFontSize: 11, title: '',
    },
  },
  'rc-heatmap': {
    w: 300, h: 340,
    props: { ...UNIVERSAL_STYLE, bgColor: '#09090b', borderRadius: 8, metric: 'count', binsX: 5, binsY: 5, colorLow: '#18181b', colorHigh: '#ef4444', showZone: true, locations: [], title: '', fontSize: 12 },
  },
  'rc-zone-plot': {
    w: 300, h: 340,
    props: { ...UNIVERSAL_STYLE, bgColor: '#09090b', borderRadius: 8, dotSize: 8, dotOpacity: 0.85, showZone: true, zoneColor: '#52525b', colorBy: 'pitch_type', pitches: [], title: '', fontSize: 12 },
  },
  'rc-movement-plot': {
    w: 340, h: 320,
    props: { ...UNIVERSAL_STYLE, bgColor: '#09090b', borderRadius: 8, dotSize: 10, dotOpacity: 0.85, maxRange: 24, showSeasonShapes: true, pitches: [], seasonShapes: [], fontSize: 10 },
  },
  'rc-bar-chart': {
    w: 400, h: 250,
    props: { ...UNIVERSAL_STYLE, bgColor: '#09090b', borderRadius: 12, metric: 'avg_velo', orientation: 'horizontal', barColor: '#06b6d4', barData: [], fontSize: 12, showValues: true, title: '' },
  },
  'rc-donut-chart': {
    w: 280, h: 280,
    props: { ...UNIVERSAL_STYLE, bgColor: '#09090b', borderRadius: 12, innerRadius: 0.55, showLabels: true, fontSize: 12, usageData: [], title: '' },
  },
  'rc-statline': {
    w: 700, h: 60,
    props: {
      ...UNIVERSAL_STYLE, bgColor: 'rgba(255,255,255,0.04)', borderRadius: 8,
      fontSize: 18, fontFamily: '', color: '#ffffff', headerColor: '#a1a1aa',
      statline: { ip: '?', h: 0, r: 0, k: 0, bb: 0, decision: 'ND', era: '--' },
      title: '',
    },
  },
}

let zCounter = 100

export function createElement(type: ElementType, centerX: number, centerY: number): SceneElement {
  const d = DEFAULTS[type]
  return {
    id: Math.random().toString(36).slice(2, 10),
    type,
    x: Math.round(centerX - d.w / 2),
    y: Math.round(centerY - d.h / 2),
    width: d.w,
    height: d.h,
    rotation: 0,
    opacity: 1,
    zIndex: ++zCounter,
    locked: false,
    props: { ...d.props },
  }
}

export function createDefaultScene(): Scene {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: 'Untitled Scene',
    width: 1920,
    height: 1080,
    background: '#09090b',
    elements: [],
    duration: 5,
    fps: 30,
  }
}

export const SCENE_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '1920\u00d71080 (16:9)', w: 1920, h: 1080 },
  { label: '1080\u00d71920 (9:16)', w: 1080, h: 1920 },
  { label: '1080\u00d71080 (1:1)', w: 1080, h: 1080 },
  { label: '3840\u00d72160 (4K)', w: 3840, h: 2160 },
  { label: '1280\u00d7720 (YouTube)', w: 1280, h: 720 },
  { label: '1200\u00d7628 (Twitter)', w: 1200, h: 628 },
  { label: '1080\u00d71350 (IG Portrait)', w: 1080, h: 1350 },
  { label: '1920\u00d7200 (Lower Third)', w: 1920, h: 200 },
]
