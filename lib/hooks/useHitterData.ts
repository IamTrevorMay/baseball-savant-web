'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'
import { loadGlossary } from '@/lib/glossary'
import { applyFiltersToData, type ActiveFilter } from '@/lib/filterEngineCore'
import { fetchDeployedModels, getDashboardModels, type DeployedModel } from '@/lib/deployedModels'
import type { LahmanPlayerData } from '@/lib/lahman-stats'

// ── Types ────────────────────────────────────────────────────────────────────

export interface HitterInfo {
  player_name: string
  batter: number
  total_pitches: number
  games: number
  last_date: string
  avg_exit_velo: number
  avg_launch_angle: number
  team: string
  bats: string
  latest_season: number
  first_date: string
}

export type SeasonType = 'regular' | 'spring' | 'postseason' | 'all'

export const BASE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'viz', label: 'Visualizations' },
  { id: 'results', label: 'Results' },
  { id: 'pitchlog', label: 'Pitch Log' },
  { id: 'splits', label: 'Splits' },
  { id: 'gamelog', label: 'Game Log' },
  { id: 'fielding', label: 'Fielding' },
]

export interface UseHitterDataReturn {
  // Player info & loading state
  info: HitterInfo | null
  loading: boolean
  dataLoading: boolean

  // Data
  data: any[]
  allData: any[]
  seasonFilteredData: any[]
  filteredData: any[]
  resultCount: number

  // Lahman
  lahmanData: LahmanPlayerData | null

  // Filters
  activeFilters: ActiveFilter[]
  setActiveFilters: (filters: ActiveFilter[]) => void
  optionsCache: Record<string, string[]>

  // Season & year controls
  seasonType: SeasonType
  setSeasonType: (type: SeasonType) => void
  selectedYear: number | null
  setSelectedYear: (year: number | null) => void
  availableYears: number[]

  // Tabs
  tab: string
  setTab: (tab: string) => void
  modelTabs: DeployedModel[]

  // Actions
  fetchData: (year?: number | null) => Promise<void>
}

// ── Derived-field enrichment ─────────────────────────────────────────────────

function enrichDerivedFields(allRows: any[]): void {
  allRows.forEach((p: any) => {
    // Vertical Approach Angle (degrees)
    if (p.vz0 != null && p.vy0 != null && p.az != null && p.ay != null && p.release_extension != null) {
      const t = (-p.vy0 - Math.sqrt(p.vy0 * p.vy0 - 2 * p.ay * (50 - p.release_extension))) / p.ay
      const vzf = p.vz0 + p.az * t
      const vyf = p.vy0 + p.ay * t
      p.vaa = Math.atan2(vzf, -vyf) * (180 / Math.PI)
    }
    // Horizontal Approach Angle (degrees)
    if (p.vx0 != null && p.vy0 != null && p.ax != null && p.ay != null && p.release_extension != null) {
      const t = (-p.vy0 - Math.sqrt(p.vy0 * p.vy0 - 2 * p.ay * (50 - p.release_extension))) / p.ay
      const vxf = p.vx0 + p.ax * t
      const vyf = p.vy0 + p.ay * t
      p.haa = Math.atan2(vxf, -vyf) * (180 / Math.PI)
    }
    // Movement in inches
    if (p.pfx_x != null) p.pfx_x_in = +(p.pfx_x * 12).toFixed(1)
    if (p.pfx_z != null) p.pfx_z_in = +(p.pfx_z * 12).toFixed(1)
    // vs Team (opposing pitching team — hitter perspective)
    // Top = visiting team batting → opposing team is home_team
    // Bot = home team batting → opposing team is away_team
    if (p.inning_topbot === 'Top') p.vs_team = p.home_team
    else if (p.inning_topbot === 'Bot') p.vs_team = p.away_team
  })
}

// ── Build filter options from loaded data ────────────────────────────────────

function buildOptionsCache(allRows: any[]): Record<string, string[]> {
  const buildOpts = (col: string) =>
    [...new Set(allRows.map((r: any) => r[col]).filter(Boolean))].map(String).sort()

  return {
    game_year: buildOpts('game_year').sort().reverse(),
    pitch_name: buildOpts('pitch_name'),
    pitch_type: buildOpts('pitch_type'),
    stand: buildOpts('stand'),
    p_throws: buildOpts('p_throws'),
    balls: ['0', '1', '2', '3'],
    strikes: ['0', '1', '2'],
    outs_when_up: ['0', '1', '2'],
    inning: Array.from({ length: 18 }, (_, i) => String(i + 1)),
    inning_topbot: ['Top', 'Bot'],
    type: buildOpts('type'),
    events: buildOpts('events'),
    description: buildOpts('description'),
    bb_type: buildOpts('bb_type'),
    game_type: buildOpts('game_type'),
    home_team: buildOpts('home_team'),
    away_team: buildOpts('away_team'),
    zone: Array.from({ length: 14 }, (_, i) => String(i + 1)),
    if_fielding_alignment: buildOpts('if_fielding_alignment'),
    of_fielding_alignment: buildOpts('of_fielding_alignment'),
    vs_team: buildOpts('vs_team'),
    pitcher_name: buildOpts('pitcher_name'),
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useHitterData(batterId: number): UseHitterDataReturn {
  const [data, setData] = useState<any[]>([])
  const [tab, setTab] = useState('overview')
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [seasonType, setSeasonType] = useState<SeasonType>('regular')
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  // ── Hitter info query ──────────────────────────────────────────────────

  const { data: info = null, isLoading: infoLoading } = useQuery({
    queryKey: queryKeys.hitterInfo(batterId),
    queryFn: async () => {
      await loadGlossary()
      const { data: pData } = await supabase
        .from('batter_summary')
        .select('*')
        .eq('batter', batterId)
        .single()
      return (pData as HitterInfo) || null
    },
  })

  // Set initial year from info when it first loads
  useEffect(() => {
    if (info && selectedYear === null) {
      setSelectedYear(info.latest_season || new Date().getFullYear())
    }
  }, [info, selectedYear])

  // ── Pitch data query ──────────────────────────────────────────────────

  const { data: pitchQueryData, isLoading: pitchesLoading } = useQuery({
    queryKey: queryKeys.hitterPitches(batterId, selectedYear),
    queryFn: async () => {
      const yearParam = selectedYear != null ? `&year=${selectedYear}` : ''
      const res = await fetch(`/api/player-data?id=${batterId}&col=batter${yearParam}`)
      if (!res.ok) throw new Error('Failed to fetch player data')
      const { rows: allRows } = (await res.json()) as { rows: any[] }
      enrichDerivedFields(allRows)
      const cleaned = allRows.filter((r: any) => r.pitch_type !== 'PO' && r.pitch_type !== 'IN')
      const opts = buildOptionsCache(cleaned)
      return { cleaned, opts }
    },
    enabled: selectedYear !== null,
  })

  const allData = pitchQueryData?.cleaned ?? []
  const optionsCache = pitchQueryData?.opts ?? {}

  // ── Available years query ──────────────────────────────────────────────

  const { data: filterYears } = useQuery({
    queryKey: queryKeys.playerFilterOptions(batterId, 'batter'),
    queryFn: async () => {
      const res = await fetch(`/api/player-filter-options?id=${batterId}&col=batter`)
      const d = await res.json()
      return d.game_year ? (d.game_year as string[]).map(Number) : []
    },
    enabled: selectedYear != null,
    staleTime: Infinity,
  })

  const availableYears = selectedYear != null
    ? (filterYears ?? (optionsCache.game_year ?? []).map(Number))
    : (optionsCache.game_year ?? []).map(Number)

  // ── Lahman query ───────────────────────────────────────────────────────

  const { data: lahmanData = null } = useQuery({
    queryKey: queryKeys.hitterLahman(batterId),
    queryFn: async () => {
      const res = await fetch(`/api/lahman/player?mlb_id=${batterId}`)
      if (!res.ok) return null
      const d = await res.json()
      return d.player ? (d as LahmanPlayerData) : null
    },
    enabled: !!info,
  })

  // ── Model tabs query ──────────────────────────────────────────────────

  const { data: modelTabs = [] } = useQuery({
    queryKey: queryKeys.deployedModels('hitter'),
    queryFn: async () => {
      const models = await fetchDeployedModels()
      return getDashboardModels(models, 'hitter')
    },
    staleTime: Infinity,
  })

  // ── Composite loading states ──────────────────────────────────────────

  const loading = infoLoading
  const dataLoading = pitchesLoading

  // ── Reset on batterId change ──────────────────────────────────────────

  useEffect(() => {
    setSelectedYear(null)
    setActiveFilters([])
  }, [batterId])

  // ── Season-type filtering (before user filters) ──────────────────────

  const seasonFilteredData = useMemo(() => {
    if (seasonType === 'all') return allData
    return allData.filter((r: any) => {
      const gt = r.game_type
      if (seasonType === 'regular') return gt === 'R'
      if (seasonType === 'spring') return gt === 'S' || gt === 'E'
      if (seasonType === 'postseason') return ['P', 'F', 'D', 'L', 'W'].includes(gt)
      return true
    })
  }, [allData, seasonType])

  // ── Client-side filtered data ────────────────────────────────────────

  const filteredData = useMemo(() => {
    if (activeFilters.length === 0) return seasonFilteredData
    return applyFiltersToData(seasonFilteredData, activeFilters)
  }, [seasonFilteredData, activeFilters])

  // ── Debounced filter application ─────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(filteredData)
      setResultCount(filteredData.length)
    }, 300)
    return () => clearTimeout(timer)
  }, [filteredData])

  // ── fetchData wrapper (preserves interface) ──────────────────────────

  const fetchData = useCallback(async (year?: number | null) => {
    setSelectedYear(year ?? null)
  }, [])

  return {
    info,
    loading,
    dataLoading,
    data,
    allData,
    seasonFilteredData,
    filteredData,
    resultCount,
    lahmanData,
    activeFilters,
    setActiveFilters,
    optionsCache,
    seasonType,
    setSeasonType,
    selectedYear,
    setSelectedYear,
    availableYears,
    tab,
    setTab,
    modelTabs,
    fetchData,
  }
}
