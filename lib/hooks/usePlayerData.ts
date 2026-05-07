'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { loadGlossary } from '@/lib/glossary'
import { applyFiltersToData, type ActiveFilter } from '@/lib/filterEngineCore'
import { fetchDeployedModels, getDashboardModels, type DeployedModel } from '@/lib/deployedModels'
import type { LahmanPlayerData } from '@/lib/lahman-stats'

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
    // Brink — signed distance to nearest strike zone edge (inches)
    if (p.plate_x != null && p.plate_z != null && p.sz_top != null && p.sz_bot != null) {
      const dLeft = p.plate_x + 0.83, dRight = 0.83 - p.plate_x
      const dBot = p.plate_z - p.sz_bot, dTop = p.sz_top - p.plate_z
      p.brink = +(Math.min(dLeft, dRight, dBot, dTop) * 12).toFixed(1)
    }
    // vs Team (batting team)
    if (p.inning_topbot === 'Top') p.vs_team = p.away_team
    else if (p.inning_topbot === 'Bot') p.vs_team = p.home_team
  })

  // Cluster / HDev / VDev — distance from year-partitioned pitch-type centroid (inches)
  const cBuckets: Record<string, { sx: number; sz: number; n: number }> = {}
  allRows.forEach((p: any) => {
    if (p.pitch_name && p.plate_x != null && p.plate_z != null) {
      const key = p.game_year != null ? `${p.game_year}::${p.pitch_name}` : p.pitch_name
      if (!cBuckets[key]) cBuckets[key] = { sx: 0, sz: 0, n: 0 }
      cBuckets[key].sx += p.plate_x
      cBuckets[key].sz += p.plate_z
      cBuckets[key].n++
    }
  })
  const cCentroids: Record<string, { cx: number; cz: number }> = {}
  for (const name in cBuckets) {
    const b = cBuckets[name]
    cCentroids[name] = { cx: b.sx / b.n, cz: b.sz / b.n }
  }
  allRows.forEach((p: any) => {
    if (p.pitch_name && p.plate_x != null && p.plate_z != null) {
      const key = p.game_year != null ? `${p.game_year}::${p.pitch_name}` : p.pitch_name
      const c = cCentroids[key]
      if (c) {
        p.cluster = +(Math.sqrt((p.plate_x - c.cx) ** 2 + (p.plate_z - c.cz) ** 2) * 12).toFixed(1)
        p.hdev = +((c.cx - p.plate_x) * 12).toFixed(1)
        p.vdev = +((p.plate_z - c.cz) * 12).toFixed(1)
      }
    }
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
    batter_name: buildOpts('batter_name'),
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePlayerData(pitcherId: number): UsePlayerDataReturn {
  const [info, setInfo] = useState<PlayerInfo | null>(null)
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [mlbStats, setMlbStats] = useState<any[]>([])
  const [tab, setTab] = useState('overview')
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])
  const [allData, setAllData] = useState<any[]>([])
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({})
  const [resultCount, setResultCount] = useState(0)
  const [seasonType, setSeasonType] = useState<SeasonType>('regular')
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [availableYears, setAvailableYears] = useState<number[]>([])

  // Model tabs
  const [modelTabs, setModelTabs] = useState<DeployedModel[]>([])

  // SOS scores per year
  const [sosScores, setSosScores] = useState<Record<number, { sos: number }>>({})

  // Lahman historical data
  const [lahmanData, setLahmanData] = useState<LahmanPlayerData | null>(null)

  // ── Load model tabs ──────────────────────────────────────────────────────

  const loadModelTabs = useCallback(async () => {
    const models = await fetchDeployedModels()
    setModelTabs(getDashboardModels(models, 'pitcher'))
  }, [])

  // ── Fetch pitch data ─────────────────────────────────────────────────────

  const fetchData = useCallback(async (year?: number | null) => {
    setDataLoading(true)
    try {
      const yearParam = year != null ? `&year=${year}` : ''
      const res = await fetch(`/api/player-data?id=${pitcherId}&col=pitcher${yearParam}`)
      if (!res.ok) throw new Error('Failed to fetch player data')
      const { rows: allRows } = (await res.json()) as { rows: any[] }

      // Enrich with derived fields
      enrichDerivedFields(allRows)

      const cleaned = allRows.filter((r: any) => r.pitch_type !== 'PO' && r.pitch_type !== 'IN')
      setAllData(cleaned)
      setData(cleaned)
      setResultCount(cleaned.length)

      // Build filter options
      const opts = buildOptionsCache(allRows)
      const years = opts.game_year

      // If loading a single year, fetch available years from filter-options endpoint
      if (year != null) {
        fetch(`/api/player-filter-options?id=${pitcherId}&col=pitcher`)
          .then((r) => r.json())
          .then((d) => {
            if (d.game_year) setAvailableYears(d.game_year.map(Number))
          })
          .catch(() => {})
      } else {
        setAvailableYears(years.map(Number))
      }
      setOptionsCache(opts)
    } catch (e) {
      console.error('fetchData error:', e)
    }
    setDataLoading(false)
  }, [pitcherId])

  // ── Load player ──────────────────────────────────────────────────────────

  const loadPlayer = useCallback(async () => {
    setLoading(true)
    await loadGlossary()

    // Get player info from summary
    const { data: pData } = await supabase
      .from('player_summary')
      .select('*')
      .eq('pitcher', pitcherId)
      .single()
    if (pData) setInfo(pData as PlayerInfo)

    // Default to all seasons
    setSelectedYear(null)
    await fetchData(null)

    // Fetch MLB official stats, Lahman data, and SOS scores in parallel
    try {
      const [mlbRes, lahmanRes, sosRes] = await Promise.all([
        fetch(`/api/mlbstats?pitcher=${pitcherId}`),
        fetch(`/api/lahman/player?mlb_id=${pitcherId}`),
        supabase.from('sos_scores').select('game_year, sos').eq('player_id', pitcherId).eq('role', 'pitcher'),
      ])
      const mlbData = await mlbRes.json()
      if (mlbData.seasons) setMlbStats(mlbData.seasons)
      if (lahmanRes.ok) {
        const ld = await lahmanRes.json()
        if (ld.player) setLahmanData(ld)
      }
      if (sosRes.data) {
        const map: Record<number, { sos: number }> = {}
        sosRes.data.forEach((r: any) => {
          map[r.game_year] = { sos: Number(r.sos) }
        })
        setSosScores(map)
      }
    } catch (e) {
      console.error('Stats fetch failed:', e)
    }
    setLoading(false)
  }, [pitcherId, fetchData])

  // ── Trigger on pitcherId change ──────────────────────────────────────────

  useEffect(() => {
    loadPlayer()
    loadModelTabs()
  }, [pitcherId, loadPlayer, loadModelTabs])

  // ── Season-type filtering (before user filters) ──────────────────────────

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

  // ── Client-side filtered data ────────────────────────────────────────────

  const filteredData = useMemo(() => {
    if (activeFilters.length === 0) return seasonFilteredData
    return applyFiltersToData(seasonFilteredData, activeFilters)
  }, [seasonFilteredData, activeFilters])

  // ── Debounced filter application ─────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(filteredData)
      setResultCount(filteredData.length)
    }, 300)
    return () => clearTimeout(timer)
  }, [filteredData])

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
