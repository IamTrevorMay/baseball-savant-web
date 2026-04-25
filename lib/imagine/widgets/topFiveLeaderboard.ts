/**
 * Top 5 Leaderboard widget for Imagine.
 *
 * Owns its own canvas layout (rather than calling the shared sceneTemplates
 * rebuild, which is hand-laid for 1920×1080). Two layout buckets — landscape
 * (aspect ≥ 1) and portrait (aspect < 1) — adapt to every size preset.
 */
import type { Scene, SceneElement, TemplateDataRow } from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import type { Widget, SizePreset, FilterOption } from '@/lib/imagine/types'

/* ── Filter state shape ────────────────────────────────────────────────── */

export type LeaderboardFilters = {
  title?: string
  playerType: 'pitcher' | 'batter'
  role: 'all' | 'starter' | 'reliever'
  primaryStat: string
  sortDir: 'asc' | 'desc'
  dateRange:
    | { type: 'season'; year: number }
    | { type: 'custom'; from: string; to: string }
  pitchType?: string
  minSample: number
  secondaryStat?: string
  tertiaryStat?: string
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR - i)

const PITCH_TYPE_OPTIONS: FilterOption[] = [
  { value: '', label: 'All Pitch Types' },
  { value: 'FF', label: 'Four-Seam' },
  { value: 'SI', label: 'Sinker' },
  { value: 'FC', label: 'Cutter' },
  { value: 'SL', label: 'Slider' },
  { value: 'CU', label: 'Curveball' },
  { value: 'CH', label: 'Changeup' },
  { value: 'SW', label: 'Sweeper' },
  { value: 'KC', label: 'Knuckle Curve' },
  { value: 'FS', label: 'Splitter' },
]

const STAT_OPTIONS: FilterOption[] = SCENE_METRICS
  .filter(m => m.value !== 'player_name')
  .map(m => ({ value: m.value, label: m.label, group: m.group }))

/** Stat groups that only make sense in a pitching context. */
const PITCHER_ONLY_GROUPS = new Set(['Stuff', 'Triton', 'Triton+', 'Deception', 'ERA Estimators'])
const PITCHER_ONLY_STATS = new Set(
  SCENE_METRICS.filter(m => m.group && PITCHER_ONLY_GROUPS.has(m.group)).map(m => m.value)
)
/** Stat groups that only make sense in a batting context. */
const BATTER_ONLY_GROUPS = new Set(['Swing'])
const BATTER_ONLY_STATS = new Set(
  SCENE_METRICS.filter(m => m.group && BATTER_ONLY_GROUPS.has(m.group)).map(m => m.value)
)

function isStatCompatible(stat: string, playerType: 'pitcher' | 'batter'): boolean {
  if (!stat) return true
  if (playerType === 'pitcher' && BATTER_ONLY_STATS.has(stat)) return false
  if (playerType === 'batter' && PITCHER_ONLY_STATS.has(stat)) return false
  return true
}

function defaultPrimaryStat(playerType: 'pitcher' | 'batter'): string {
  return playerType === 'batter' ? 'avg_ev' : 'avg_velo'
}

const SIZE_PRESETS: SizePreset[] = [
  { label: '1920×1080 (16:9)', width: 1920, height: 1080 },
  { label: '1080×1920 (9:16 Story)', width: 1080, height: 1920 },
  { label: '1080×1080 (1:1 Square)', width: 1080, height: 1080 },
  { label: '1080×1350 (4:5 IG Portrait)', width: 1080, height: 1350 },
  { label: '1200×630 (Twitter/OG)', width: 1200, height: 630 },
]

/* ── Helpers ───────────────────────────────────────────────────────────── */

function metricLabel(key: string): string {
  return SCENE_METRICS.find(m => m.value === key)?.label || key
}

function defaultMinSample(playerType: 'pitcher' | 'batter'): number {
  return playerType === 'batter' ? 150 : 300
}

/** Short descriptor for the player slice — used in titles. */
function roleLabel(filters: LeaderboardFilters): string {
  if (filters.playerType === 'batter') return 'Batters'
  switch (filters.role) {
    case 'starter':  return 'SP'
    case 'reliever': return 'RP'
    default:         return 'Pitchers'
  }
}

/** Headline-style title that goes on the rendered canvas. Concise. */
function buildAutoTitle(f: LeaderboardFilters): string {
  return `Top 5 ${roleLabel(f)} by ${metricLabel(f.primaryStat)}`
}

/** Filesystem-safe slug for the Export filename. */
function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export'
}

/** Descriptive filename stem. Includes role, primary stat, season/range,
 *  and pitch type so re-exporting at different filters won't collide. */
function buildAutoFilename(f: LeaderboardFilters): string {
  const parts: string[] = ['top-5', slug(roleLabel(f)), slug(metricLabel(f.primaryStat))]
  if (f.dateRange.type === 'season') {
    parts.push(String(f.dateRange.year))
  } else {
    parts.push(`${f.dateRange.from}-to-${f.dateRange.to}`)
  }
  if (f.pitchType) parts.push(slug(f.pitchType))
  return parts.join('-')
}

/** Subtitle baked into the canvas (e.g. "2025 Season · FF · Pitchers"). */
function buildSubtitle(f: LeaderboardFilters): string {
  const parts: string[] = []
  if (f.dateRange.type === 'season') parts.push(`${f.dateRange.year} Season`)
  else parts.push(`${f.dateRange.from} – ${f.dateRange.to}`)
  if (f.pitchType) parts.push(f.pitchType)
  parts.push(f.playerType === 'batter' ? 'Batters' : 'Pitchers')
  return parts.join(' · ')
}

/* ── Layout primitives ──────────────────────────────────────────────────── */

const STAT_COLORS = ['#06b6d4', '#a855f7', '#f59e0b']
const BG_COLOR = '#09090b'
const STRIPE = 'rgba(39,39,42,0.3)'

function rankColor(i: number): string {
  if (i === 0) return '#fbbf24'  // gold
  if (i === 1) return '#94a3b8'  // silver
  if (i === 2) return '#d97706'  // bronze
  return '#71717a'
}

interface LayoutCtx {
  filters: LeaderboardFilters
  rows: TemplateDataRow[]
  width: number
  height: number
  title: string
  subtitle: string
}

function makeEl(
  z: { current: number },
  type: SceneElement['type'],
  x: number, y: number, w: number, h: number,
  props: Record<string, any>,
): SceneElement {
  return {
    id: Math.random().toString(36).slice(2, 10),
    type,
    x: Math.round(x), y: Math.round(y),
    width: Math.round(w), height: Math.round(h),
    rotation: 0, opacity: 1,
    zIndex: ++z.current,
    locked: false,
    props,
  }
}

/** Player-image element with the right dataBinding for the renderer. */
function playerImageEl(
  z: { current: number },
  x: number, y: number, w: number, h: number,
  playerId: number | null, playerName: string,
  filters: LeaderboardFilters,
): SceneElement {
  const base = makeEl(z, 'player-image', x, y, w, h, {
    playerId, playerName, borderColor: '#27272a', showLabel: false, bgColor: 'transparent',
  })
  if (playerId) {
    base.dataBinding = {
      playerId, playerName,
      metric: filters.primaryStat,
      source: 'statcast',
      gameYear: filters.dateRange.type === 'season' ? filters.dateRange.year : undefined,
    }
  }
  return base
}

/* ── Layout: landscape (aspect ≥ 1.5) ─────────────────────────────────────
   Used for 1920×1080, 1200×630. Same centered-block model as the vertical
   layout — (N + 1) equal cells centered horizontally — but the player cell
   uses a horizontal `rank | image | name+year` flow (the wider rows give it
   room) while the stat cells render their value centered with one shared
   header label row at the top.                                            */

function layoutLandscape(ctx: LayoutCtx): SceneElement[] {
  const { width, height, rows, filters, title, subtitle } = ctx
  const z = { current: 100 }
  const elements: SceneElement[] = []

  const padX = Math.max(40, Math.round(width * 0.042))
  const titleY = Math.round(height * 0.037)
  const titleFs = Math.max(28, Math.round(height * 0.048))
  const titleH = Math.round(titleFs * 1.35)
  const subtitleY = titleY + titleH + Math.round(height * 0.005)
  const subtitleFs = Math.max(14, Math.round(height * 0.020))
  const subtitleH = Math.round(subtitleFs * 1.6)
  const dividerY = subtitleY + subtitleH + Math.round(height * 0.014)

  // Title + subtitle + divider — centered
  elements.push(makeEl(z, 'text', padX, titleY, width - padX * 2, titleH, {
    text: title, fontSize: titleFs, fontWeight: 800, color: '#ffffff', textAlign: 'center', bgColor: 'transparent',
  }))
  elements.push(makeEl(z, 'text', padX, subtitleY, width - padX * 2, subtitleH, {
    text: subtitle, fontSize: subtitleFs, fontWeight: 400, color: '#71717a', textAlign: 'center', bgColor: 'transparent',
  }))
  elements.push(makeEl(z, 'shape', padX, dividerY, width - padX * 2, 2, {
    shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0,
  }))

  // Build column specs (primary/secondary/tertiary).
  const cols: { label: string; color: string; valueKey: 'primary_value' | 'secondary_value' | 'tertiary_value' }[] = [
    { label: metricLabel(filters.primaryStat), color: STAT_COLORS[0], valueKey: 'primary_value' },
  ]
  if (filters.secondaryStat) cols.push({ label: metricLabel(filters.secondaryStat), color: STAT_COLORS[1], valueKey: 'secondary_value' })
  if (filters.tertiaryStat)  cols.push({ label: metricLabel(filters.tertiaryStat),  color: STAT_COLORS[2], valueKey: 'tertiary_value' })

  // Centered block of (N + 1) equal cells, separated by a uniform gutter.
  // Cell width is locked to the 4-column division of the canvas, so:
  //   3 stats → 4 cells span the full content width
  //   2 stats → 3 cells, narrower block, centered
  //   1 stat  → 2 cells, narrower still, centered
  const numStats = cols.length
  const numCells = numStats + 1
  const gutter = Math.max(20, Math.round(width * 0.018))
  const cellW = Math.floor((width - padX * 2 - gutter * 3) / 4)
  const blockW = cellW * numCells + gutter * (numCells - 1)
  const blockStartX = Math.round((width - blockW) / 2)
  const playerX = blockStartX
  const playerColW = cellW
  const statCellW = cellW
  const statCellX = (i: number) => blockStartX + (i + 1) * (cellW + gutter)

  // Stat header row — labels once at the top, dim/uppercase, like a table head.
  const statLabelFs = Math.max(11, Math.round(height * 0.020))
  const headerRowY = dividerY + Math.round(height * 0.014)
  const headerRowH = Math.round(statLabelFs * 1.7)
  for (let i = 0; i < cols.length; i++) {
    elements.push(makeEl(z, 'text',
      statCellX(i), headerRowY, statCellW, headerRowH,
      { text: cols[i].label.toUpperCase(), fontSize: statLabelFs, fontWeight: 600, color: '#a1a1aa', textAlign: 'center', bgColor: 'transparent' },
    ))
  }

  // Per-row geometry
  const rowsTop = headerRowY + headerRowH + Math.round(height * 0.012)
  const rowGap = Math.max(6, Math.round(height * 0.009))
  const rowsAreaH = height - rowsTop - Math.round(height * 0.02)
  const rowH = Math.floor((rowsAreaH - rowGap * 4) / 5)

  const rankW = Math.max(40, Math.round(width * 0.026))
  const innerGap = Math.max(8, Math.round(width * 0.01))
  const imgH = Math.round(rowH * 0.85)
  const imgW = Math.round(imgH * 0.83)

  const rankFs = Math.max(20, Math.round(rowH * 0.34))
  const nameFs = Math.max(16, Math.round(rowH * 0.18))
  const yearFs = Math.max(11, Math.round(rowH * 0.10))
  const statValueFs = Math.max(20, Math.round(rowH * 0.32))

  for (let i = 0; i < 5; i++) {
    const row = rows[i]
    const yTop = rowsTop + i * (rowH + rowGap)
    const playerId = row?.player_id ?? null
    const playerName = row?.player_name ?? ''

    // Stripe for odd rows — spans the centered block.
    if (i % 2 === 1) {
      elements.push(makeEl(z, 'shape',
        blockStartX - 20, yTop - 5, blockW + 40, rowH + 5,
        { shape: 'rect', fill: STRIPE, stroke: 'transparent', strokeWidth: 0, borderRadius: 8 },
      ))
    }

    // Player cell: rank | image | name+year (horizontal flow within the cell)
    elements.push(makeEl(z, 'text',
      playerX, yTop + Math.round(rowH * 0.18), rankW, rowH * 0.6,
      { text: `${i + 1}`, fontSize: rankFs, fontWeight: 800, color: rankColor(i), textAlign: 'center', bgColor: 'transparent' },
    ))

    const imgX = playerX + rankW
    const imgY = yTop + Math.round(rowH * 0.05)
    elements.push(playerImageEl(z, imgX, imgY, imgW, imgH, playerId, playerName, filters))

    const nameStartX = imgX + imgW + innerGap
    const nameW = Math.max(60, (playerX + playerColW) - nameStartX)
    elements.push(makeEl(z, 'text',
      nameStartX, yTop + Math.round(rowH * 0.13), nameW, nameFs * 1.4,
      { text: playerName || 'Player Name', fontSize: nameFs, fontWeight: 700, color: '#ffffff', textAlign: 'left', bgColor: 'transparent' },
    ))
    if (filters.dateRange.type === 'season') {
      elements.push(makeEl(z, 'text',
        nameStartX, yTop + Math.round(rowH * 0.42), nameW, yearFs * 1.5,
        { text: String(filters.dateRange.year), fontSize: yearFs, fontWeight: 400, color: '#52525b', textAlign: 'left', bgColor: 'transparent' },
      ))
    }

    // Stat values — centered in each stat cell, vertically aligned with the image.
    for (let c = 0; c < cols.length; c++) {
      const v = row?.[cols[c].valueKey]
      const valStr = v != null ? String(v) : '--'
      elements.push(makeEl(z, 'text',
        statCellX(c), imgY, statCellW, imgH,
        { text: valStr, fontSize: statValueFs, fontWeight: 700, color: cols[c].color, textAlign: 'center', bgColor: 'transparent' },
      ))
    }
  }

  return elements
}

/* ── Layout: vertical (aspect < 1.5) ──────────────────────────────────────
   Used for 1080×1080 (square), 1080×1350 (IG portrait), 1080×1920 (story).
   Tabular template — column headers once at top; per row: rank + image
   stacked over name; stat values to the right (no per-row labels). */

function layoutVertical(ctx: LayoutCtx): SceneElement[] {
  const { width, height, rows, filters, title, subtitle } = ctx
  const z = { current: 100 }
  const elements: SceneElement[] = []

  const padX = Math.max(30, Math.round(width * 0.037))
  const titleY = Math.round(height * 0.022)
  const titleFs = Math.max(28, Math.round(width * 0.05))
  const titleH = Math.round(titleFs * 1.3)
  const subtitleY = titleY + titleH + 5
  const subtitleFs = Math.max(14, Math.round(width * 0.022))
  const subtitleH = Math.round(subtitleFs * 1.5)
  const dividerY = subtitleY + subtitleH + 8

  // Title + subtitle + divider — centered
  elements.push(makeEl(z, 'text', padX, titleY, width - padX * 2, titleH, {
    text: title, fontSize: titleFs, fontWeight: 800, color: '#ffffff', textAlign: 'center', bgColor: 'transparent',
  }))
  elements.push(makeEl(z, 'text', padX, subtitleY, width - padX * 2, subtitleH, {
    text: subtitle, fontSize: subtitleFs, fontWeight: 400, color: '#71717a', textAlign: 'center', bgColor: 'transparent',
  }))
  elements.push(makeEl(z, 'shape', padX, dividerY, width - padX * 2, 2, {
    shape: 'rect', fill: '#27272a', stroke: 'transparent', strokeWidth: 0, borderRadius: 0,
  }))

  // Build the column specs (primary/secondary/tertiary) once.
  const cols: { label: string; color: string; valueKey: 'primary_value' | 'secondary_value' | 'tertiary_value' }[] = [
    { label: metricLabel(filters.primaryStat), color: STAT_COLORS[0], valueKey: 'primary_value' },
  ]
  if (filters.secondaryStat) cols.push({ label: metricLabel(filters.secondaryStat), color: STAT_COLORS[1], valueKey: 'secondary_value' })
  if (filters.tertiaryStat)  cols.push({ label: metricLabel(filters.tertiaryStat),  color: STAT_COLORS[2], valueKey: 'tertiary_value' })

  // Layout model: one dynamic block of (N + 1) equal cells — player column
  // + N stat cells — separated by uniform gutters and centered horizontally
  // on the canvas. Cell width is fixed at the 4-column division of the
  // canvas, so:
  //   • 3 stats → 4 cells, span the full content width
  //   • 2 stats → 3 cells, the block is narrower and centered
  //   • 1 stat  → 2 cells, narrower still and centered
  // Cell sizing (image, stat font, etc.) stays consistent across stat counts;
  // only the block's horizontal offset changes.
  const numStats = cols.length
  const numCells = numStats + 1
  const gutter = Math.max(20, Math.round(width * 0.028))
  const cellW = Math.floor((width - padX * 2 - gutter * 3) / 4)
  const blockW = cellW * numCells + gutter * (numCells - 1)
  const blockStartX = Math.round((width - blockW) / 2)
  const playerX = blockStartX
  const playerColW = cellW
  const statCellW = cellW
  const statCellX = (i: number) => blockStartX + (i + 1) * (cellW + gutter)

  // Per-row dimensions — fonts first, since image height has to leave room
  // below it for the name+year stack within rowH.
  const rankW = Math.max(40, Math.round(width * 0.05))
  const rankFs = Math.max(22, Math.round(width * 0.045))
  const nameFs = Math.max(18, Math.round(width * 0.026))
  const yearFs = Math.max(11, Math.round(width * 0.016))
  const statValueFs = Math.max(28, Math.round(width * 0.046))
  const statLabelFs = Math.max(11, Math.round(width * 0.014))

  // Column header row — labels once at the top, dim/uppercase, like a table head.
  const headerRowY = dividerY + Math.round(height * 0.020)
  const headerRowH = Math.round(statLabelFs * 1.7)

  // Player rows — rank + image, then name + year stacked below image.
  const rowsTop = headerRowY + headerRowH + Math.round(height * 0.012)
  const rowGap = Math.max(10, Math.round(height * 0.014))
  const rowsAreaH = height - rowsTop - Math.round(height * 0.02)
  const rowH = Math.floor((rowsAreaH - rowGap * 4) / 5)

  // Image must fit inside the player slot (after rank) AND leave room beneath
  // it for the name+year stack within rowH.
  const nameStackH = Math.round(nameFs * 1.35) + Math.round(yearFs * 1.5) + Math.round(rowH * 0.04)
  const maxImgWByCol = Math.max(60, playerColW - rankW)
  const maxImgHByRow = Math.max(60, rowH - nameStackH)
  const imgH = Math.min(Math.round(maxImgWByCol / 0.83), maxImgHByRow)
  const imgW = Math.round(imgH * 0.83)

  // Stat column headers — centered above each stat cell.
  for (let i = 0; i < cols.length; i++) {
    elements.push(makeEl(z, 'text',
      statCellX(i), headerRowY, statCellW, headerRowH,
      { text: cols[i].label.toUpperCase(), fontSize: statLabelFs, fontWeight: 600, color: '#a1a1aa', textAlign: 'center', bgColor: 'transparent' },
    ))
  }

  for (let i = 0; i < 5; i++) {
    const row = rows[i]
    const yTop = rowsTop + i * (rowH + rowGap)
    const playerId = row?.player_id ?? null
    const playerName = row?.player_name ?? ''

    // Player column: rank on the left, image filling the rest.
    elements.push(makeEl(z, 'text',
      playerX, yTop + Math.round(rowH * 0.04), rankW, rankFs * 1.2,
      { text: `${i + 1}`, fontSize: rankFs, fontWeight: 800, color: rankColor(i), textAlign: 'left', bgColor: 'transparent' },
    ))

    const imgX = playerX + rankW
    const imgY = yTop + Math.round(rowH * 0.05)
    elements.push(playerImageEl(z, imgX, imgY, imgW, imgH, playerId, playerName, filters))

    // Name — directly below the image. nameW clamps to the player column so
    // the name never bleeds into the stats area regardless of length.
    const nameY = imgY + imgH + Math.round(rowH * 0.025)
    const nameW = (playerX + playerColW) - imgX
    elements.push(makeEl(z, 'text',
      imgX, nameY, nameW, nameFs * 1.3,
      { text: playerName || 'Player Name', fontSize: nameFs, fontWeight: 700, color: '#ffffff', textAlign: 'left', bgColor: 'transparent' },
    ))
    if (filters.dateRange.type === 'season') {
      elements.push(makeEl(z, 'text',
        imgX, nameY + Math.round(nameFs * 1.35), nameW, yearFs * 1.5,
        { text: String(filters.dateRange.year), fontSize: yearFs, fontWeight: 400, color: '#52525b', textAlign: 'left', bgColor: 'transparent' },
      ))
    }

    // Stat values — centered in each stat cell. Vertical center aligns with
    // the image (textBaseline=middle + element height = imgH).
    for (let c = 0; c < cols.length; c++) {
      const v = row?.[cols[c].valueKey]
      const valStr = v != null ? String(v) : '--'
      elements.push(makeEl(z, 'text',
        statCellX(c), imgY, statCellW, imgH,
        { text: valStr, fontSize: statValueFs, fontWeight: 700, color: cols[c].color, textAlign: 'center', bgColor: 'transparent' },
      ))
    }
  }

  return elements
}

/* ── Widget definition ─────────────────────────────────────────────────── */

const topFiveLeaderboard: Widget<LeaderboardFilters> = {
  id: 'top-5-leaderboard',
  name: 'Top 5 Leaderboard',
  description: 'Ranked list with player headshots, names, and up to three stats per row.',

  filterSchema: [
    // ── Column 1: scope ──
    {
      key: 'title',
      type: 'text',
      label: 'Title (optional)',
      placeholder: 'Auto-generated',
      dynamicPlaceholder: (f) => buildAutoTitle(f as LeaderboardFilters),
      column: 1,
    },
    {
      key: 'playerType',
      type: 'segmented',
      label: 'Player Type',
      options: [
        { value: 'pitcher', label: 'Pitcher' },
        { value: 'batter', label: 'Batter' },
      ],
      column: 1,
    },
    {
      key: 'role',
      type: 'segmented',
      label: 'Role',
      options: [
        { value: 'all', label: 'All' },
        { value: 'starter', label: 'SP' },
        { value: 'reliever', label: 'RP' },
      ],
      column: 1,
      visibleWhen: (f) => f.playerType !== 'batter',
    },
    // ── Column 2: data filters ──
    {
      key: 'sortDir',
      type: 'segmented',
      label: 'Sort',
      options: [
        { value: 'desc', label: 'Descending' },
        { value: 'asc', label: 'Ascending' },
      ],
      column: 2,
    },
    {
      key: 'dateRange',
      type: 'date-range-season-or-custom',
      label: 'Date Range',
      years: YEARS,
      column: 2,
    },
    { key: 'pitchType', type: 'select', label: 'Pitch Type (optional)', options: PITCH_TYPE_OPTIONS, column: 2 },
    { key: 'minSample', type: 'number', label: 'Min Pitches (qualifier)', min: 1, column: 2 },
    // ── Column 3: viewable stats (size/aspect appended by FilterBar) ──
    { key: 'primaryStat', type: 'select', label: 'Primary Stat', options: STAT_OPTIONS, column: 3 },
    { key: 'secondaryStat', type: 'toggle-select', label: 'Secondary Stat', options: STAT_OPTIONS, column: 3 },
    { key: 'tertiaryStat', type: 'toggle-select', label: 'Tertiary Stat', options: STAT_OPTIONS, column: 3 },
  ],

  defaultFilters: {
    title: '',
    playerType: 'pitcher',
    role: 'all',
    primaryStat: 'avg_velo',
    sortDir: 'desc',
    dateRange: { type: 'season', year: CURRENT_YEAR },
    pitchType: '',
    minSample: defaultMinSample('pitcher'),
    secondaryStat: '',
    tertiaryStat: '',
  },

  sizePresets: SIZE_PRESETS,
  defaultSize: SIZE_PRESETS[0],

  autoTitle: buildAutoTitle,
  autoFilename: buildAutoFilename,

  async fetchData(filters, origin) {
    const params = new URLSearchParams({
      leaderboard: 'true',
      metric: filters.primaryStat,
      playerType: filters.playerType,
      limit: '5',
      sortDir: filters.sortDir,
      minSample: String(filters.minSample),
    })
    if (filters.dateRange.type === 'season') {
      params.set('gameYear', String(filters.dateRange.year))
    } else {
      params.set('dateFrom', filters.dateRange.from)
      params.set('dateTo', filters.dateRange.to)
    }
    if (filters.pitchType) params.set('pitchType', filters.pitchType)
    if (filters.role !== 'all') params.set('pitcherRole', filters.role)
    if (filters.secondaryStat) params.set('secondaryMetric', filters.secondaryStat)
    if (filters.tertiaryStat) params.set('tertiaryMetric', filters.tertiaryStat)

    const res = await fetch(`${origin}/api/scene-stats?${params}`, {
      headers: { 'cache-control': 'no-store' },
    })
    if (!res.ok) throw new Error(`scene-stats fetch failed: ${res.status}`)
    const json = await res.json()
    return (json.leaderboard || []) as TemplateDataRow[]
  },

  normalizeFilters(next, prev) {
    // Only react to playerType flips; everything else passes through.
    if (next.playerType === prev.playerType) return next

    const pt = next.playerType
    const out: LeaderboardFilters = { ...next }

    // 1. Reset qualifier to a sensible per-type default. Batter pitches-seen
    //    qualifier (~150) is much lower than pitcher pitches-thrown (~300).
    out.minSample = defaultMinSample(pt)

    // 2. Role only applies to pitchers — force "all" so server-side queries
    //    don't accidentally filter on a stale starter/reliever flag.
    if (pt === 'batter') out.role = 'all'

    // 3. Reset incompatible stats. If the current pick is in the wrong context
    //    (e.g. avg_velo for a batter), swap to a context-appropriate default
    //    for primary; clear secondary/tertiary so the UI shows OFF.
    if (!isStatCompatible(out.primaryStat, pt)) {
      out.primaryStat = defaultPrimaryStat(pt)
    }
    if (out.secondaryStat && !isStatCompatible(out.secondaryStat, pt)) {
      out.secondaryStat = ''
    }
    if (out.tertiaryStat && !isStatCompatible(out.tertiaryStat, pt)) {
      out.tertiaryStat = ''
    }

    return out
  },

  buildScene(filters, rows: TemplateDataRow[], size: SizePreset): Scene {
    const userTitle = (filters.title || '').trim()
    const title = userTitle || buildAutoTitle(filters)
    const subtitle = buildSubtitle(filters)

    const layoutCtx: LayoutCtx = {
      filters, rows, width: size.width, height: size.height, title, subtitle,
    }

    // Bucket selection: only true wide aspects (≥ 1.5) use the row-flow
    // landscape layout — that's 1920×1080 (1.78) and 1200×630 (1.90). Square
    // (1.0) and tall (≤ 0.8) all use the vertical/tabular layout, which is
    // less busy and reads cleaner at narrow widths.
    const aspect = size.width / size.height
    const elements = aspect >= 1.5
      ? layoutLandscape(layoutCtx)
      : layoutVertical(layoutCtx)

    return {
      id: Math.random().toString(36).slice(2, 10),
      name: title,
      width: size.width,
      height: size.height,
      background: BG_COLOR,
      elements,
      duration: 5,
      fps: 30,
    }
  },
}

export default topFiveLeaderboard
