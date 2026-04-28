/**
 * Team Stats widget for Imagine.
 *
 * Same layout as Player Stats — hero image (team logo) + adaptive grid of
 * 1–8 user-selected metrics — but aggregated at the team level. Each metric
 * value shows the team's league rank in parentheses, color-coded by position:
 *   green = top 5, amber = middle, red = bottom 5.
 */
import type { Scene, SceneElement } from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import type { Widget, SizePreset, FilterOption } from '@/lib/imagine/types'

/* ── Team list (current 30 MLB teams) ────────────────────────────────────── */

interface TeamEntry { abbrev: string; name: string; id: number }

const MLB_TEAMS: TeamEntry[] = [
  { abbrev: 'ARI', name: 'Arizona Diamondbacks', id: 109 },
  { abbrev: 'ATL', name: 'Atlanta Braves', id: 144 },
  { abbrev: 'BAL', name: 'Baltimore Orioles', id: 110 },
  { abbrev: 'BOS', name: 'Boston Red Sox', id: 111 },
  { abbrev: 'CHC', name: 'Chicago Cubs', id: 112 },
  { abbrev: 'CWS', name: 'Chicago White Sox', id: 145 },
  { abbrev: 'CIN', name: 'Cincinnati Reds', id: 113 },
  { abbrev: 'CLE', name: 'Cleveland Guardians', id: 114 },
  { abbrev: 'COL', name: 'Colorado Rockies', id: 115 },
  { abbrev: 'DET', name: 'Detroit Tigers', id: 116 },
  { abbrev: 'HOU', name: 'Houston Astros', id: 117 },
  { abbrev: 'KC', name: 'Kansas City Royals', id: 118 },
  { abbrev: 'LAA', name: 'Los Angeles Angels', id: 108 },
  { abbrev: 'LAD', name: 'Los Angeles Dodgers', id: 119 },
  { abbrev: 'MIA', name: 'Miami Marlins', id: 146 },
  { abbrev: 'MIL', name: 'Milwaukee Brewers', id: 158 },
  { abbrev: 'MIN', name: 'Minnesota Twins', id: 142 },
  { abbrev: 'NYM', name: 'New York Mets', id: 121 },
  { abbrev: 'NYY', name: 'New York Yankees', id: 147 },
  { abbrev: 'OAK', name: 'Oakland Athletics', id: 133 },
  { abbrev: 'PHI', name: 'Philadelphia Phillies', id: 143 },
  { abbrev: 'PIT', name: 'Pittsburgh Pirates', id: 134 },
  { abbrev: 'SD', name: 'San Diego Padres', id: 135 },
  { abbrev: 'SF', name: 'San Francisco Giants', id: 137 },
  { abbrev: 'SEA', name: 'Seattle Mariners', id: 136 },
  { abbrev: 'STL', name: 'St. Louis Cardinals', id: 138 },
  { abbrev: 'TB', name: 'Tampa Bay Rays', id: 139 },
  { abbrev: 'TEX', name: 'Texas Rangers', id: 140 },
  { abbrev: 'TOR', name: 'Toronto Blue Jays', id: 141 },
  { abbrev: 'WSH', name: 'Washington Nationals', id: 120 },
]

function teamByAbbrev(abbrev: string): TeamEntry | undefined {
  return MLB_TEAMS.find(t => t.abbrev === abbrev)
}

function teamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/team-cap-on-dark/${teamId}.svg`
}

/* ── Filter state shape ──────────────────────────────────────────────────── */

export type TeamStatsFilters = {
  title?: string
  subtitle?: string
  team: string // team abbreviation
  statScope: 'pitching' | 'hitting'
  pitcherRole: 'all' | 'starter' | 'reliever'
  dateRange:
    | { type: 'season'; year: number }
    | { type: 'custom'; from: string; to: string }
  metric1: string
  metric2: string
  metric3: string
  metric4: string
  metric5: string
  metric6: string
  metric7: string
  metric8: string
  // Custom mode — manual labels/values instead of API-fetched data
  customMode: string          // 'dynamic' | 'custom'
  customData: { label: string; value: string; rank: string }[]
  // Style overrides (0 = auto, '' = default font)
  styleFontFamily?: string
  styleTitleSize?: number
  styleSubtitleSize?: number
  styleMetricValueSize?: number
  styleMetricLabelSize?: number
}

const METRIC_KEYS = ['metric1','metric2','metric3','metric4','metric5','metric6','metric7','metric8'] as const
type MetricKey = typeof METRIC_KEYS[number]

/* ── Constants ───────────────────────────────────────────────────────────── */

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR - i)

const TEAM_OPTIONS: FilterOption[] = MLB_TEAMS.map(t => ({
  value: t.abbrev, label: `${t.abbrev} — ${t.name}`,
}))

/** Filter stat options by scope: pitching-only groups excluded for hitting and vice versa */
const PITCHER_ONLY_GROUPS = new Set(['Stuff', 'Triton', 'Triton+', 'Deception', 'ERA Estimators'])
const BATTER_ONLY_GROUPS = new Set(['Swing'])

const PITCHER_ONLY_STATS = new Set(
  SCENE_METRICS.filter(m => m.group && PITCHER_ONLY_GROUPS.has(m.group)).map(m => m.value)
)
const BATTER_ONLY_STATS = new Set(
  SCENE_METRICS.filter(m => m.group && BATTER_ONLY_GROUPS.has(m.group)).map(m => m.value)
)

// Exclude Triton+/Deception — those are per-player, not team-aggregatable
const NON_TEAM_METRICS = new Set([
  ...SCENE_METRICS.filter(m => m.group && ['Triton+', 'Deception'].includes(m.group)).map(m => m.value),
  'player_name', 'usage_pct',
])

const STAT_OPTIONS: FilterOption[] = SCENE_METRICS
  .filter(m => m.value !== 'player_name' && !NON_TEAM_METRICS.has(m.value))
  .map(m => ({ value: m.value, label: m.label, group: m.group }))

function isStatCompatible(stat: string, scope: 'pitching' | 'hitting'): boolean {
  if (!stat) return true
  if (scope === 'pitching' && BATTER_ONLY_STATS.has(stat)) return false
  if (scope === 'hitting' && PITCHER_ONLY_STATS.has(stat)) return false
  return true
}

function defaultFirstStat(scope: 'pitching' | 'hitting'): string {
  return scope === 'hitting' ? 'avg_ev' : 'avg_velo'
}

const SIZE_PRESETS: SizePreset[] = [
  { label: '1920×1080 (16:9)', width: 1920, height: 1080 },
  { label: '1080×1920 (9:16 Story)', width: 1080, height: 1920 },
  { label: '1080×1080 (1:1 Square)', width: 1080, height: 1080 },
  { label: '1080×1350 (4:5 IG Portrait)', width: 1080, height: 1350 },
  { label: '1200×630 (Twitter/OG)', width: 1200, height: 630 },
]

const STAT_COLORS = ['#06b6d4', '#a855f7', '#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#ef4444', '#fbbf24']

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function metricLabel(key: string): string {
  return SCENE_METRICS.find(m => m.value === key)?.label || key
}

function activeMetrics(f: TeamStatsFilters): string[] {
  return METRIC_KEYS.map(k => f[k]).filter(Boolean)
}

function buildAutoTitle(f: TeamStatsFilters): string {
  const team = teamByAbbrev(f.team)
  return team ? team.name : 'Team Stats'
}

function buildSubtitle(f: TeamStatsFilters): string {
  const parts: string[] = []
  if (f.dateRange.type === 'season') parts.push(`${f.dateRange.year} Season`)
  else parts.push(`${f.dateRange.from} – ${f.dateRange.to}`)
  if (f.statScope === 'hitting') {
    parts.push('Team Hitting')
  } else {
    const roleLabel = f.pitcherRole === 'starter' ? 'SP' : f.pitcherRole === 'reliever' ? 'RP' : ''
    parts.push(roleLabel ? `Team Pitching (${roleLabel})` : 'Team Pitching')
  }
  return parts.join(' · ')
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export'
}

function buildAutoFilename(f: TeamStatsFilters): string {
  const parts: string[] = ['team-stats', slug(f.team)]
  if (f.dateRange.type === 'season') parts.push(String(f.dateRange.year))
  else parts.push(`${f.dateRange.from}-to-${f.dateRange.to}`)
  parts.push(f.statScope)
  return parts.join('-')
}

function formatStatValue(v: any): string {
  if (v == null || v === '') return '--'
  if (typeof v === 'number' && !Number.isFinite(v)) return '--'
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v)
    return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1)
  }
  return String(v)
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function rankColor(rank: number, total: number): string {
  if (rank <= 5) return '#34d399'       // green (top 5)
  if (rank > total - 5) return '#f87171' // red (bottom 5)
  return '#fbbf24'                       // amber (middle)
}

/* ── Layout primitives ───────────────────────────────────────────────────── */

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

/* ── Scene builder ───────────────────────────────────────────────────────── */

interface TeamData {
  stats: Record<string, any>
  ranks: Record<string, { rank: number; total: number }>
  teamName: string
}

function buildSceneInternal(
  filters: TeamStatsFilters,
  data: TeamData,
  size: SizePreset,
  labelOverrides?: Record<string, string>,
): Scene {
  const { width, height } = size
  const aspect = width / height
  const isTall = aspect < 0.8

  const z = { current: 100 }
  const elements: SceneElement[] = []

  const userTitle = (filters.title || '').trim()
  const title = userTitle || buildAutoTitle(filters)
  const subtitle = (filters.subtitle || '').trim() || buildSubtitle(filters)
  const ff = filters.styleFontFamily || undefined

  // ── Header (title + subtitle) ──
  const padX = Math.max(36, Math.round(width * 0.037))
  const titleY = Math.round(height * 0.025)
  const titleFs = filters.styleTitleSize || Math.max(32, Math.round(Math.min(width, height * 1.5) * 0.045))
  const titleH = Math.round(titleFs * 1.3)
  const subtitleY = titleY + titleH + 4
  const subtitleFs = filters.styleSubtitleSize || Math.max(14, Math.round(Math.min(width, height * 1.5) * 0.020))
  const subtitleH = Math.round(subtitleFs * 1.5)

  elements.push(makeEl(z, 'text', padX, titleY, width - padX * 2, titleH, {
    text: title, fontSize: titleFs, fontWeight: 800, color: '#ffffff', textAlign: 'center', bgColor: 'transparent', fontFamily: ff,
  }))
  elements.push(makeEl(z, 'text', padX, subtitleY, width - padX * 2, subtitleH, {
    text: subtitle, fontSize: subtitleFs, fontWeight: 400, color: '#71717a', textAlign: 'center', bgColor: 'transparent', fontFamily: ff,
  }))

  // ── Hero region (team logo) ──
  const heroFraction = isTall ? 0.38 : 0.42
  const heroTop = subtitleY + subtitleH + Math.round(height * 0.015)
  const heroH = Math.round(height * heroFraction) - (subtitleY + subtitleH)
  const heroAvailableH = Math.max(100, heroH)

  const team = teamByAbbrev(filters.team)
  if (team) {
    const logoSize = Math.min(heroAvailableH - 20, width * 0.25)
    const logoX = Math.round((width - logoSize) / 2)
    const logoY = heroTop + Math.round((heroAvailableH - logoSize) / 2)
    elements.push(makeEl(z, 'player-image', logoX, logoY, logoSize, logoSize, {
      customImageUrl: teamLogoUrl(team.id),
      playerName: '', showLabel: false, bgColor: 'transparent',
      borderWidth: 0, borderRadius: 0,
    }))
  }

  // ── Stat grid ──
  const metrics = activeMetrics(filters)
  const N = metrics.length
  if (N === 0) return finalize(elements, title, size)

  const gridTop = heroTop + heroAvailableH + Math.round(height * 0.02)
  const gridBottom = height - Math.round(height * 0.03)
  const gridAreaH = Math.max(120, gridBottom - gridTop)
  const gridAreaW = width - padX * 2

  const maxCols = isTall ? 2 : 4
  const numCols = Math.min(maxCols, N)
  const numRows = Math.ceil(N / numCols)

  const gutter = Math.max(16, Math.round(Math.min(width, height) * 0.018))
  const cellW = Math.floor((gridAreaW - gutter * (numCols - 1)) / numCols)
  const cellH = Math.floor((gridAreaH - gutter * (numRows - 1)) / numRows)

  const valueFs = filters.styleMetricValueSize || Math.min(72, Math.max(28, Math.round(cellH * 0.36)))
  const labelFs = filters.styleMetricLabelSize || Math.min(24, Math.max(11, Math.round(cellH * 0.10)))
  const rankFs = Math.min(28, Math.max(12, Math.round(valueFs * 0.40)))
  const labelH = Math.round(labelFs * 1.6)

  for (let i = 0; i < N; i++) {
    const m = metrics[i]
    const rowIdx = Math.floor(i / numCols)
    const colIdx = i % numCols

    const rowStart = rowIdx * numCols
    const rowCount = Math.min(numCols, N - rowStart)
    const rowBlockW = rowCount * cellW + (rowCount - 1) * gutter
    const rowStartX = Math.round((width - rowBlockW) / 2)

    const x = rowStartX + colIdx * (cellW + gutter)
    const y = gridTop + rowIdx * (cellH + gutter)

    const color = STAT_COLORS[i % STAT_COLORS.length]
    const value = formatStatValue(data?.stats?.[m])
    const label = (labelOverrides?.[m] || metricLabel(m)).toUpperCase()

    // Rank info
    const rankInfo = data?.ranks?.[m]
    const rankText = rankInfo ? ` (${ordinal(rankInfo.rank)})` : ''
    const rColor = rankInfo ? rankColor(rankInfo.rank, rankInfo.total) : '#71717a'

    // Label (top of cell)
    elements.push(makeEl(z, 'text', x, y + Math.round(cellH * 0.08), cellW, labelH, {
      text: label, fontSize: labelFs, fontWeight: 600, color: '#a1a1aa', textAlign: 'center', bgColor: 'transparent', fontFamily: ff,
    }))
    // Value (center of cell)
    elements.push(makeEl(z, 'text', x, y + Math.round(cellH * 0.26), cellW, Math.round(cellH * 0.40), {
      text: value, fontSize: valueFs, fontWeight: 800, color, textAlign: 'center', bgColor: 'transparent', fontFamily: ff,
    }))
    // Rank (below value)
    if (rankText) {
      elements.push(makeEl(z, 'text', x, y + Math.round(cellH * 0.66), cellW, Math.round(rankFs * 1.5), {
        text: rankText, fontSize: rankFs, fontWeight: 700, color: rColor, textAlign: 'center', bgColor: 'transparent', fontFamily: ff,
      }))
    }
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

/* ── Widget definition ───────────────────────────────────────────────────── */

const teamStats: Widget<TeamStatsFilters> = {
  id: 'team-stats',
  name: 'Team Stats',
  description: 'Team card with up to 8 metrics and league rank for each.',

  filterSchema: [
    // ── Column 1: scope ──
    {
      key: 'customMode',
      type: 'segmented',
      label: 'Mode',
      options: [
        { value: 'dynamic', label: 'Dynamic' },
        { value: 'custom', label: 'Custom' },
      ],
      column: 1,
    },
    {
      key: 'statScope',
      type: 'segmented',
      label: 'Stat Scope',
      options: [
        { value: 'pitching', label: 'Pitching' },
        { value: 'hitting', label: 'Hitting' },
      ],
      column: 1,
      visibleWhen: (f) => f.customMode !== 'custom',
    },
    {
      key: 'pitcherRole',
      type: 'segmented',
      label: 'Pitcher Role',
      options: [
        { value: 'all', label: 'All' },
        { value: 'starter', label: 'SP' },
        { value: 'reliever', label: 'RP' },
      ],
      visibleWhen: (f) => f.customMode !== 'custom' && f.statScope === 'pitching',
      column: 1,
    },
    {
      key: 'team',
      type: 'select',
      label: 'Team',
      options: TEAM_OPTIONS,
      placeholder: 'Select a team...',
      column: 1,
    },
    // ── Column 2: data filters ──
    { key: 'dateRange', type: 'date-range-season-or-custom', label: 'Date Range', years: YEARS, column: 2, visibleWhen: (f) => f.customMode !== 'custom' },
    // ── Column 3: stat slots ──
    { key: 'metric1', type: 'select',        label: 'Stat 1', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => f.customMode !== 'custom' },
    { key: 'metric2', type: 'toggle-select', label: 'Stat 2', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => f.customMode !== 'custom' },
    { key: 'metric3', type: 'toggle-select', label: 'Stat 3', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => f.customMode !== 'custom' && !!f.metric2 },
    { key: 'metric4', type: 'toggle-select', label: 'Stat 4', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => f.customMode !== 'custom' && !!f.metric3 },
    { key: 'metric5', type: 'toggle-select', label: 'Stat 5', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => f.customMode !== 'custom' && !!f.metric4 },
    { key: 'metric6', type: 'toggle-select', label: 'Stat 6', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => f.customMode !== 'custom' && !!f.metric5 },
    { key: 'metric7', type: 'toggle-select', label: 'Stat 7', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => f.customMode !== 'custom' && !!f.metric6 },
    { key: 'metric8', type: 'toggle-select', label: 'Stat 8', options: STAT_OPTIONS, column: 3, visibleWhen: (f) => f.customMode !== 'custom' && !!f.metric7 },
  ],

  defaultFilters: {
    title: '',
    subtitle: '',
    team: 'NYY',
    statScope: 'pitching',
    pitcherRole: 'all',
    dateRange: { type: 'season', year: CURRENT_YEAR },
    metric1: 'avg_velo',
    metric2: 'whiff_pct',
    metric3: 'k_pct',
    metric4: 'avg_spin',
    metric5: '',
    metric6: '',
    metric7: '',
    metric8: '',
    customMode: 'dynamic',
    customData: [
      { label: '', value: '', rank: '' },
      { label: '', value: '', rank: '' },
      { label: '', value: '', rank: '' },
      { label: '', value: '', rank: '' },
    ],
    styleFontFamily: '',
    styleTitleSize: 0,
    styleSubtitleSize: 0,
    styleMetricValueSize: 0,
    styleMetricLabelSize: 0,
  },

  sizePresets: SIZE_PRESETS,
  defaultSize: SIZE_PRESETS[0],

  autoTitle: buildAutoTitle,
  autoFilename: buildAutoFilename,

  async fetchData(filters, origin) {
    if (filters.customMode === 'custom') {
      const stats: Record<string, any> = {}
      const ranks: Record<string, { rank: number; total: number }> = {}
      for (let i = 0; i < (filters.customData || []).length; i++) {
        const e = filters.customData[i]
        if (e.label || e.value) {
          const key = `_c${i}`
          stats[key] = e.value || '--'
          if (e.rank) {
            const m = e.rank.match(/(\d+)\s*(?:of|\/)\s*(\d+)/)
            if (m) ranks[key] = { rank: parseInt(m[1]), total: parseInt(m[2]) }
          }
        }
      }
      const team = teamByAbbrev(filters.team)
      return { stats, ranks, teamName: team?.name || '' }
    }
    if (!filters.team) return { stats: {}, ranks: {}, teamName: '' }

    const metrics = activeMetrics(filters)
    if (metrics.length === 0) {
      const team = teamByAbbrev(filters.team)
      return { stats: {}, ranks: {}, teamName: team?.name || '' }
    }

    const params = new URLSearchParams({
      teamStats: 'true',
      team: filters.team,
      statScope: filters.statScope,
      metrics: metrics.join(','),
    })
    if (filters.statScope === 'pitching' && filters.pitcherRole && filters.pitcherRole !== 'all') {
      params.set('pitcherRole', filters.pitcherRole)
    }
    if (filters.dateRange.type === 'season') {
      params.set('gameYear', String(filters.dateRange.year))
    } else {
      params.set('dateFrom', filters.dateRange.from)
      params.set('dateTo', filters.dateRange.to)
    }

    const res = await fetch(`${origin}/api/scene-stats?${params}`, {
      headers: { 'cache-control': 'no-store' },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`scene-stats team fetch failed: ${res.status} ${body.slice(0, 200)}`)
    }
    const json = await res.json()
    return {
      stats: json.teamStats?.stats || {},
      ranks: json.teamStats?.ranks || {},
      teamName: json.teamStats?.teamName || filters.team,
    }
  },

  normalizeFilters(next, prev) {
    const out: TeamStatsFilters = { ...next }

    // Custom mode skips all dynamic-mode normalization
    if (next.customMode === 'custom') return out

    // Scope change: clear incompatible stats, reset pitcher role
    if (next.statScope !== prev.statScope) {
      const scope = next.statScope
      if (scope === 'hitting') out.pitcherRole = 'all'
      for (const k of METRIC_KEYS) {
        if (out[k] && !isStatCompatible(out[k], scope)) out[k] = ''
      }
      if (!out.metric1) out.metric1 = defaultFirstStat(scope)
    }

    // Compact empty slots
    const values = METRIC_KEYS.map(k => out[k]).filter(Boolean) as string[]
    for (let i = 0; i < METRIC_KEYS.length; i++) {
      out[METRIC_KEYS[i]] = values[i] || ''
    }

    return out
  },

  buildScene(filters, data, size) {
    if (filters.customMode === 'custom') {
      const entries = (filters.customData || []).filter((e: any) => e.label || e.value)
      const synth = { ...filters } as any
      const overrides: Record<string, string> = {}
      entries.forEach((e: any, i: number) => {
        synth[`metric${i + 1}`] = `_c${i}`
        overrides[`_c${i}`] = e.label || `Stat ${i + 1}`
      })
      for (let i = entries.length; i < 8; i++) synth[`metric${i + 1}`] = ''
      return buildSceneInternal(synth, data || { stats: {}, ranks: {}, teamName: '' }, size, overrides)
    }
    return buildSceneInternal(filters, data || { stats: {}, ranks: {}, teamName: '' }, size)
  },
}

export default teamStats
