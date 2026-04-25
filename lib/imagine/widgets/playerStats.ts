/**
 * Player Stats widget for Imagine.
 *
 * Single-player hero card: big headshot + name as the focal point at top,
 * followed by an adaptive grid of 1–8 user-selected metrics. Layout
 * follows the Leaderboard Standards (centered title/subtitle, centered
 * block of equal cells with uniform gutters) but applied to a stat grid
 * rather than ranked rows.
 *
 *   Landscape (aspect ≥ 1.5) / Square (0.8 ≤ aspect < 1.5):
 *     hero header on top, stat grid below, max 4 cols × 2 rows.
 *   Tall (aspect < 0.8):
 *     hero header on top, stat grid below, max 2 cols × 4 rows.
 *
 * The grid adapts to N stats (1–8): numCols = min(maxCols, N),
 * numRows = ceil(N / numCols). When the last row is partial, those
 * cells are centered horizontally within the row.
 */
import type { Scene, SceneElement } from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import type { Widget, SizePreset, FilterOption, PlayerSearchValue } from '@/lib/imagine/types'

/* ── Filter state shape ────────────────────────────────────────────────── */

export type PlayerStatsFilters = {
  title?: string
  player: PlayerSearchValue
  playerType: 'pitcher' | 'batter'
  dateRange:
    | { type: 'season'; year: number }
    | { type: 'custom'; from: string; to: string }
  pitchType?: string
  // 8 metric slots — empty string = slot inactive.
  metric1: string
  metric2: string
  metric3: string
  metric4: string
  metric5: string
  metric6: string
  metric7: string
  metric8: string
}

const METRIC_KEYS = ['metric1','metric2','metric3','metric4','metric5','metric6','metric7','metric8'] as const
type MetricKey = typeof METRIC_KEYS[number]

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

/** Same pitcher/batter compatibility rules as the leaderboard widget. */
const PITCHER_ONLY_GROUPS = new Set(['Stuff', 'Triton', 'Triton+', 'Deception', 'ERA Estimators'])
const PITCHER_ONLY_STATS = new Set(
  SCENE_METRICS.filter(m => m.group && PITCHER_ONLY_GROUPS.has(m.group)).map(m => m.value)
)
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

function defaultFirstStat(playerType: 'pitcher' | 'batter'): string {
  return playerType === 'batter' ? 'avg_ev' : 'avg_velo'
}

const SIZE_PRESETS: SizePreset[] = [
  { label: '1920×1080 (16:9)', width: 1920, height: 1080 },
  { label: '1080×1920 (9:16 Story)', width: 1080, height: 1920 },
  { label: '1080×1080 (1:1 Square)', width: 1080, height: 1080 },
  { label: '1080×1350 (4:5 IG Portrait)', width: 1080, height: 1350 },
  { label: '1200×630 (Twitter/OG)', width: 1200, height: 630 },
]

const STAT_COLORS = ['#06b6d4', '#a855f7', '#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#ef4444', '#fbbf24']

/* ── Helpers ───────────────────────────────────────────────────────────── */

function metricLabel(key: string): string {
  return SCENE_METRICS.find(m => m.value === key)?.label || key
}

function activeMetrics(f: PlayerStatsFilters): string[] {
  return METRIC_KEYS.map(k => f[k]).filter(Boolean)
}

function buildAutoTitle(f: PlayerStatsFilters): string {
  return f.player.playerName || 'Player Stats'
}

function buildSubtitle(f: PlayerStatsFilters): string {
  const parts: string[] = []
  if (f.dateRange.type === 'season') parts.push(`${f.dateRange.year} Season`)
  else parts.push(`${f.dateRange.from} – ${f.dateRange.to}`)
  if (f.pitchType) parts.push(f.pitchType)
  parts.push(f.playerType === 'batter' ? 'Hitting' : 'Pitching')
  return parts.join(' · ')
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export'
}

function buildAutoFilename(f: PlayerStatsFilters): string {
  const parts: string[] = ['player-stats', slug(f.player.playerName || 'no-player')]
  if (f.dateRange.type === 'season') parts.push(String(f.dateRange.year))
  else parts.push(`${f.dateRange.from}-to-${f.dateRange.to}`)
  if (f.pitchType) parts.push(slug(f.pitchType))
  return parts.join('-')
}

/** Convert a returned metric value to a display string. The scene-stats
 *  endpoint already pre-rounds via SQL for pitches metrics; this just
 *  guards against null and applies a fallback rounding for any raw numbers
 *  that slip through. */
function formatStatValue(v: any): string {
  if (v == null || v === '') return '--'
  if (typeof v === 'number' && !Number.isFinite(v)) return '--'
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v)
    // 2 decimals for sub-1 fractions (rates, percentages as decimals),
    // 1 decimal otherwise (velocity, spin, etc.).
    return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1)
  }
  return String(v)
}

/* ── Layout primitives ─────────────────────────────────────────────────── */

const BG_COLOR = '#09090b'

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

/* ── Scene builder ─────────────────────────────────────────────────────── */

function buildSceneInternal(
  filters: PlayerStatsFilters,
  data: { stats: Record<string, any>; player_name?: string },
  size: SizePreset,
): Scene {
  const { width, height } = size
  const aspect = width / height
  const isTall = aspect < 0.8

  const z = { current: 100 }
  const elements: SceneElement[] = []

  const userTitle = (filters.title || '').trim()
  const title = userTitle || buildAutoTitle(filters)
  const subtitle = buildSubtitle(filters)

  // ── Header (title + subtitle) ──
  const padX = Math.max(36, Math.round(width * 0.037))
  const titleY = Math.round(height * 0.025)
  const titleFs = Math.max(32, Math.round(Math.min(width, height * 1.5) * 0.045))
  const titleH = Math.round(titleFs * 1.3)
  const subtitleY = titleY + titleH + 4
  const subtitleFs = Math.max(14, Math.round(Math.min(width, height * 1.5) * 0.020))
  const subtitleH = Math.round(subtitleFs * 1.5)

  elements.push(makeEl(z, 'text', padX, titleY, width - padX * 2, titleH, {
    text: title, fontSize: titleFs, fontWeight: 800, color: '#ffffff', textAlign: 'center', bgColor: 'transparent',
  }))
  elements.push(makeEl(z, 'text', padX, subtitleY, width - padX * 2, subtitleH, {
    text: subtitle, fontSize: subtitleFs, fontWeight: 400, color: '#71717a', textAlign: 'center', bgColor: 'transparent',
  }))

  // ── Hero region (everything from below the header to the start of the grid) ──
  // Allocate more vertical space to the hero on tall canvases (where the
  // image gets the room) and less on landscape (where the grid needs room
  // for 2 rows of stats).
  const heroFraction = isTall ? 0.42 : 0.48
  const heroTop = subtitleY + subtitleH + Math.round(height * 0.012)
  const heroBottom = Math.round(height * heroFraction) + heroTop * 0  // anchored to top, height = canvas * heroFraction
  const heroH = Math.round(height * heroFraction) - (subtitleY + subtitleH)
  const heroAvailableH = Math.max(120, heroH)

  // Player image — sized to fit within the hero region (height-bounded), then
  // width-bounded by canvas with padding.
  const imgAspect = 0.83
  const maxImgH = Math.max(120, heroAvailableH - Math.round(height * 0.02))
  const maxImgW = Math.max(120, width - padX * 2)
  let imgH = maxImgH
  let imgW = Math.round(imgH * imgAspect)
  if (imgW > maxImgW) {
    imgW = maxImgW
    imgH = Math.round(imgW / imgAspect)
  }
  const imgX = Math.round((width - imgW) / 2)
  const imgY = heroTop

  const playerId = filters.player.playerId
  const playerName = data?.player_name || filters.player.playerName || ''
  const imgEl = makeEl(z, 'player-image', imgX, imgY, imgW, imgH, {
    playerId, playerName, borderColor: '#27272a', borderRadius: 12, showLabel: false, bgColor: 'transparent',
  })
  if (playerId) {
    imgEl.dataBinding = {
      playerId, playerName,
      metric: activeMetrics(filters)[0] || 'avg_velo',
      source: 'statcast',
      gameYear: filters.dateRange.type === 'season' ? filters.dateRange.year : undefined,
    }
  }
  elements.push(imgEl)

  // ── Stat grid ──
  const metrics = activeMetrics(filters)
  const N = metrics.length
  if (N === 0) {
    return finalize(elements, title, size)
  }

  const gridTop = imgY + imgH + Math.round(height * 0.025)
  const gridBottom = height - Math.round(height * 0.03)
  const gridAreaH = Math.max(120, gridBottom - gridTop)
  const gridAreaW = width - padX * 2

  // Adaptive grid: cap cols at 4 (landscape/square) or 2 (tall), then fill
  // row-by-row. Cell size scales to fill the available grid area, so:
  //   • 1 stat fills the whole grid area (very large value)
  //   • 8 stats split into the max grid (smaller cells)
  // The user-visible result is that the stat grid always uses the same
  // physical area; only the cell count changes.
  const maxCols = isTall ? 2 : 4
  const numCols = Math.min(maxCols, N)
  const numRows = Math.ceil(N / numCols)

  const gutter = Math.max(16, Math.round(Math.min(width, height) * 0.018))
  const cellW = Math.floor((gridAreaW - gutter * (numCols - 1)) / numCols)
  const cellH = Math.floor((gridAreaH - gutter * (numRows - 1)) / numRows)

  // Cell font sizing — value font scales with cell height; label font fixed.
  const valueFs = Math.max(28, Math.round(cellH * 0.42))
  const labelFs = Math.max(11, Math.round(cellH * 0.10))
  const labelH = Math.round(labelFs * 1.6)

  for (let i = 0; i < N; i++) {
    const m = metrics[i]
    const rowIdx = Math.floor(i / numCols)
    const colIdx = i % numCols

    // Cells in the last row may be fewer than numCols — center them.
    const rowStart = rowIdx * numCols
    const rowCount = Math.min(numCols, N - rowStart)
    const rowBlockW = rowCount * cellW + (rowCount - 1) * gutter
    const rowStartX = Math.round((width - rowBlockW) / 2)

    const x = rowStartX + colIdx * (cellW + gutter)
    const y = gridTop + rowIdx * (cellH + gutter)

    const color = STAT_COLORS[i % STAT_COLORS.length]
    const value = formatStatValue(data?.stats?.[m])
    const label = metricLabel(m).toUpperCase()

    // Label (top of cell)
    elements.push(makeEl(z, 'text', x, y + Math.round(cellH * 0.10), cellW, labelH, {
      text: label, fontSize: labelFs, fontWeight: 600, color: '#a1a1aa', textAlign: 'center', bgColor: 'transparent',
    }))
    // Value (bottom of cell, big)
    elements.push(makeEl(z, 'text', x, y + Math.round(cellH * 0.32), cellW, Math.round(cellH * 0.6), {
      text: value, fontSize: valueFs, fontWeight: 800, color, textAlign: 'center', bgColor: 'transparent',
    }))
  }

  return finalize(elements, title, size)
}

function finalize(elements: SceneElement[], title: string, size: SizePreset): Scene {
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
}

/* ── Widget definition ─────────────────────────────────────────────────── */

const playerStats: Widget<PlayerStatsFilters> = {
  id: 'player-stats',
  name: 'Player Stats',
  description: 'Single-player hero card with up to 8 metrics in an adaptive grid.',

  filterSchema: [
    // ── Column 1: scope ──
    {
      key: 'title',
      type: 'text',
      label: 'Title (optional)',
      placeholder: 'Auto-generated',
      dynamicPlaceholder: (f) => buildAutoTitle(f as PlayerStatsFilters),
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
      key: 'player',
      type: 'player-search',
      label: 'Player',
      playerTypeKey: 'playerType',
      placeholder: 'Search players...',
      column: 1,
    },
    // ── Column 2: data filters ──
    { key: 'dateRange', type: 'date-range-season-or-custom', label: 'Date Range', years: YEARS, column: 2 },
    { key: 'pitchType', type: 'select', label: 'Pitch Type (optional)', options: PITCH_TYPE_OPTIONS, column: 2 },
    // ── Column 3: stat slots — progressive disclosure ──
    // Slots 1 and 2 are always shown. Each subsequent slot is revealed only
    // once the previous slot has a value, so the UI grows as the user adds
    // stats and stops at whatever they picked. The re-shuffle in
    // normalizeFilters ensures empty slots always sit at the end, so a
    // hidden slot can never carry a stale value.
    { key: 'metric1', type: 'select',        label: 'Stat 1', options: STAT_OPTIONS, column: 3 },
    { key: 'metric2', type: 'toggle-select', label: 'Stat 2', options: STAT_OPTIONS, column: 3 },
    { key: 'metric3', type: 'toggle-select', label: 'Stat 3', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => !!f.metric2 },
    { key: 'metric4', type: 'toggle-select', label: 'Stat 4', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => !!f.metric3 },
    { key: 'metric5', type: 'toggle-select', label: 'Stat 5', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => !!f.metric4 },
    { key: 'metric6', type: 'toggle-select', label: 'Stat 6', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => !!f.metric5 },
    { key: 'metric7', type: 'toggle-select', label: 'Stat 7', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => !!f.metric6 },
    { key: 'metric8', type: 'toggle-select', label: 'Stat 8', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => !!f.metric7 },
  ],

  defaultFilters: {
    title: '',
    player: { playerId: null, playerName: '' },
    playerType: 'pitcher',
    dateRange: { type: 'season', year: CURRENT_YEAR },
    pitchType: '',
    metric1: 'avg_velo',
    metric2: 'whiff_pct',
    metric3: 'k_pct',
    metric4: 'avg_spin',
    metric5: '',
    metric6: '',
    metric7: '',
    metric8: '',
  },

  sizePresets: SIZE_PRESETS,
  defaultSize: SIZE_PRESETS[0],

  autoTitle: buildAutoTitle,
  autoFilename: buildAutoFilename,

  async fetchData(filters, origin) {
    if (!filters.player.playerId) {
      return { stats: {}, player_name: '' }
    }
    const metrics = activeMetrics(filters)
    if (metrics.length === 0) {
      return { stats: {}, player_name: filters.player.playerName }
    }
    const params = new URLSearchParams({
      playerId: String(filters.player.playerId),
      playerType: filters.playerType,
      metrics: metrics.join(','),
    })
    if (filters.dateRange.type === 'season') {
      params.set('gameYear', String(filters.dateRange.year))
    } else {
      params.set('dateFrom', filters.dateRange.from)
      params.set('dateTo', filters.dateRange.to)
    }
    if (filters.pitchType) params.set('pitchType', filters.pitchType)

    const res = await fetch(`${origin}/api/scene-stats?${params}`, {
      headers: { 'cache-control': 'no-store' },
    })
    if (!res.ok) throw new Error(`scene-stats fetch failed: ${res.status}`)
    const json = await res.json()
    return { stats: json.stats || {}, player_name: filters.player.playerName }
  },

  normalizeFilters(next, prev) {
    const out: PlayerStatsFilters = { ...next }

    // Player type change: clear incompatible stats and reset the player
    // (their id may not exist in the new type's search index).
    if (next.playerType !== prev.playerType) {
      const pt = next.playerType
      for (const k of METRIC_KEYS) {
        if (out[k] && !isStatCompatible(out[k], pt)) out[k] = ''
      }
      if (!out.metric1) out.metric1 = defaultFirstStat(pt)
      out.player = { playerId: null, playerName: '' }
    }

    // Re-shuffle stat slots so any cleared/empty slot in the middle is
    // closed by shifting subsequent values up. Empty slots always sit at
    // the end, which is what progressive disclosure expects (a hidden
    // slot can never carry a stale value that would still render).
    const values = METRIC_KEYS.map(k => out[k]).filter(Boolean) as string[]
    for (let i = 0; i < METRIC_KEYS.length; i++) {
      out[METRIC_KEYS[i]] = values[i] || ''
    }

    return out
  },

  buildScene(filters, data, size) {
    return buildSceneInternal(filters, data || { stats: {} }, size)
  },
}

export default playerStats
