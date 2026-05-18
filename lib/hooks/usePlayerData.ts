'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { supabase } from '@/lib/supabase'
import { loadGlossary } from '@/lib/glossary'
import { applyFiltersToData, type ActiveFilter } from '@/lib/filterEngineCore'
import { fetchDeployedModels, getDashboardModels, type DeployedModel } from '@/lib/deployedModels'
import type { LahmanPlayerData } from '@/lib/lahman-stats'
import { enrichDerivedFields } from '@/lib/enrichDerivedFields'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlayerInfo {
  player_name: string
  pitcher: number
  total_pitches: number
  games: number
  last_date: string
  avg_velo: number
  avg_spin: number
  team: string
  pitch_types: string[]
  latest_season: number
  first_date: string
}

export type SeasonType = 'regular' | 'spring' | 'postseason' | 'all'

export const BASE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'movement', label: 'Movement' },
  { id: 'viz', label: 'Visualizations' },
  { id: 'velocity', label: 'Velocity' },
  { id: 'results', label: 'Results' },
  { id: 'pitchlog', label: 'Pitch Log' },
  { id: 'splits', label: 'Splits' },
  { id: 'gamelog', label: 'Game Log' },
  { id: 'percentile', label: 'Ranks' },
  { id: 'pitchlevel', label: 'Pitch Level' },
]

export interface UsePlayerDataReturn {
  // Player info & loading state
  info: PlayerInfo | null
  loading: boolean
  dataLoading: boolean

  // Data
  data: any[]
  allData: any[]
  seasonFilteredData: any[]
  filteredData: any[]
  resultCount: number

  // MLB / Lahman / SOS
  mlbStats: any[]
  lahmanData: LahmanPlayerData | null
  sosScores: Record<number, { sos: number }>

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
    batter_name: buildOpts('batter_name'),
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePlayerData(pitcherId: number): UsePlayerDataReturn {
  const [data, setData] = useState<any[]>([])
  const [tab, setTab] = useState('overview')
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [seasonType, setSeasonType] = useState<SeasonType>('regular')
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  // ── Player info query ──────────────────────────────────────────────────

  const { data: info = null, isLoading: infoLoading } = useQuery({
    queryKey: queryKeys.playerInfo(pitcherId),
    queryFn: async () => {
      await loadGlossary()
      const { data: pData } = await supabase
        .from('player_summary')
        .select('*')
        .eq('pitcher', pitcherId)
        .single()
      return (pData as PlayerInfo) || null
    },
  })

  // ── Pitch data query ──────────────────────────────────────────────────

  const { data: pitchQueryData, isLoading: pitchesLoading } = useQuery({
    queryKey: queryKeys.playerPitches(pitcherId, selectedYear),
    queryFn: async () => {
      const yearParam = selectedYear != null ? `&year=${selectedYear}` : ''
      const res = await fetch(`/api/player-data?id=${pitcherId}&col=pitcher${yearParam}`)
      if (!res.ok) throw new Error('Failed to fetch player data')
      const { rows: allRows } = (await res.json()) as { rows: any[] }
      enrichDerivedFields(allRows)
      const cleaned = allRows.filter((r: any) => r.pitch_type !== 'PO' && r.pitch_type !== 'IN')
      const opts = buildOptionsCache(allRows)
      return { cleaned, opts }
    },
  })

  const allData = pitchQueryData?.cleaned ?? []
  const optionsCache = pitchQueryData?.opts ?? {}

  // ── Available years query ──────────────────────────────────────────────

  const { data: filterYears } = useQuery({
    queryKey: queryKeys.playerFilterOptions(pitcherId, 'pitcher'),
    queryFn: async () => {
      const res = await fetch(`/api/player-filter-options?id=${pitcherId}&col=pitcher`)
      const d = await res.json()
      return d.game_year ? (d.game_year as string[]).map(Number) : []
    },
    enabled: selectedYear != null,
    staleTime: Infinity,
  })

  const availableYears = selectedYear != null
    ? (filterYears ?? [])
    : (optionsCache.game_year ?? []).map(Number)

  // ── MLB stats query ────────────────────────────────────────────────────

  const { data: mlbStats = [] } = useQuery({
    queryKey: queryKeys.playerMlbStats(pitcherId),
    queryFn: async () => {
      const res = await fetch(`/api/mlbstats?pitcher=${pitcherId}`)
      const d = await res.json()
      return d.seasons || []
    },
    enabled: !!info,
  })

  // ── Lahman query ───────────────────────────────────────────────────────

  const { data: lahmanData = null } = useQuery({
    queryKey: queryKeys.playerLahman(pitcherId),
    queryFn: async () => {
      const res = await fetch(`/api/lahman/player?mlb_id=${pitcherId}`)
      if (!res.ok) return null
      const d = await res.json()
      return d.player ? (d as LahmanPlayerData) : null
    },
    enabled: !!info,
  })

  // ── SOS scores query ──────────────────────────────────────────────────

  const { data: sosScores = {} } = useQuery({
    queryKey: queryKeys.playerSos(pitcherId),
    queryFn: async () => {
      const { data: sosData } = await supabase
        .from('sos_scores')
        .select('game_year, sos')
        .eq('player_id', pitcherId)
        .eq('role', 'pitcher')
      const map: Record<number, { sos: number }> = {}
      if (sosData) sosData.forEach((r: any) => { map[r.game_year] = { sos: Number(r.sos) } })
      return map
    },
    enabled: !!info,
  })

  // ── Model tabs query ──────────────────────────────────────────────────

  const { data: modelTabs = [] } = useQuery({
    queryKey: queryKeys.deployedModels('pitcher'),
    queryFn: async () => {
      const models = await fetchDeployedModels()
      return getDashboardModels(models, 'pitcher')
    },
    staleTime: Infinity,
  })

  // ── Composite loading states ──────────────────────────────────────────

  const loading = infoLoading
  const dataLoading = pitchesLoading

  // ── Reset on pitcherId change ─────────────────────────────────────────

  useEffect(() => {
    setSelectedYear(null)
    setActiveFilters([])
  }, [pitcherId])

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
    mlbStats,
    lahmanData,
    sosScores,
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
