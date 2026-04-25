/**
 * Top 5 Leaderboard widget for Imagine.
 *
 * Reuses the existing data-driven `top-5-leaderboard` rebuild from sceneTemplates.ts
 * so the rendered output stays in sync with the Scene Composer.
 */
import type { Scene, TemplateConfig, TemplateDataRow } from '@/lib/sceneTypes'
import { DATA_DRIVEN_TEMPLATES } from '@/lib/sceneTemplates'
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

/* ── Widget definition ─────────────────────────────────────────────────── */

const topFiveLeaderboard: Widget<LeaderboardFilters> = {
  id: 'top-5-leaderboard',
  name: 'Top 5 Leaderboard',
  description: 'Ranked list with player headshots, names, and up to three stats per row.',

  filterSchema: [
    { key: 'title', type: 'text', label: 'Title (optional)', placeholder: 'Auto-generated', span: 4 },
    {
      key: 'playerType',
      type: 'segmented',
      label: 'Player Type',
      options: [
        { value: 'pitcher', label: 'Pitcher' },
        { value: 'batter', label: 'Batter' },
      ],
      span: 2,
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
      span: 2,
    },
    { key: 'primaryStat', type: 'select', label: 'Primary Stat', options: STAT_OPTIONS, span: 2 },
    {
      key: 'sortDir',
      type: 'segmented',
      label: 'Sort',
      options: [
        { value: 'desc', label: 'Descending' },
        { value: 'asc', label: 'Ascending' },
      ],
      span: 2,
    },
    {
      key: 'dateRange',
      type: 'date-range-season-or-custom',
      label: 'Date Range',
      years: YEARS,
      span: 2,
    },
    { key: 'pitchType', type: 'select', label: 'Pitch Type (optional)', options: PITCH_TYPE_OPTIONS, span: 2 },
    { key: 'minSample', type: 'number', label: 'Min Pitches (qualifier)', min: 1, span: 2 },
    { key: 'secondaryStat', type: 'toggle-select', label: 'Secondary Stat', options: STAT_OPTIONS, span: 2 },
    { key: 'tertiaryStat', type: 'toggle-select', label: 'Tertiary Stat', options: STAT_OPTIONS, span: 2 },
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

  autoTitle: (f) => `Top 5 by ${metricLabel(f.primaryStat)}`,

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

  buildScene(filters, rows: TemplateDataRow[], size: SizePreset): Scene {
    const dataDriven = DATA_DRIVEN_TEMPLATES.find(t => t.id === 'top-5-leaderboard')
    if (!dataDriven) throw new Error('top-5-leaderboard data-driven template not found')

    const config: TemplateConfig = {
      templateId: 'top-5-leaderboard',
      playerType: filters.playerType,
      primaryStat: filters.primaryStat,
      secondaryStat: filters.secondaryStat || undefined,
      tertiaryStat: filters.tertiaryStat || undefined,
      dateRange: filters.dateRange,
      pitchType: filters.pitchType || undefined,
      pitcherRole: filters.role,
      sortDir: filters.sortDir,
      count: 5,
      minSample: filters.minSample,
      title: filters.title || undefined,
    }

    const scene = dataDriven.rebuild(config, rows)
    // Override canvas size to match the user-selected aspect.
    return { ...scene, width: size.width, height: size.height }
  },
}

export default topFiveLeaderboard
