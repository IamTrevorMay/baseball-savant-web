'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FILTER_CATALOG, type ActiveFilter } from '@/lib/filterEngineCore'
import {
  View, StatSet, STAT_SETS, COLUMNS, TRITON_RAW_COLUMNS, TRITON_PLUS_COLUMNS, DECEPTION_COLUMNS,
  DEFENCE_STAT_SETS,
  getMetricsForStatSet, getGroupBy, filtersToReportFormat,
  formatValue, getCellColor, defaultQualifier,
  type ColumnDef,
} from '@/lib/leaderboardColumns'

// ── Constants ────────────────────────────────────────────────────────────────

export const GAME_TYPES: { key: string; label: string }[] = [
  { key: 'S', label: 'Spring Training' },
  { key: 'R', label: 'Regular Season' },
  { key: 'P', label: 'Postseason' },
]

export const TRITON_TABS = new Set(['triton_raw', 'triton_plus', 'deception'])

export const VIEWS: { key: View; label: string }[] = [
  { key: 'pitching', label: 'Pitching' },
  { key: 'hitting', label: 'Hitting' },
  { key: 'team', label: 'Team' },
  { key: 'defence', label: 'Defence' },
]

const now = new Date()
const currentYear = (now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear()).toString()

const VALID_VIEWS = new Set(['pitching', 'hitting', 'team', 'defence'])

// ── Return type ──────────────────────────────────────────────────────────────

export interface UseExploreDataReturn {
  // State
  view: View
  statSet: StatSet
  activeFilters: ActiveFilter[]
  optionsCache: Record<string, string[]>
  rows: any[]
  loading: boolean
  initialLoading: boolean
  sortBy: string
  sortDir: 'ASC' | 'DESC'
  page: number
  qualifier: { minPitches: number; minPA: number }
  gameType: string
  contextMenu: {
    x: number; y: number
    playerName: string; metricLabel: string; value: string
    colKey: string; row: any
  } | null
  explainRequest: {
    playerName: string; metricLabel: string; value: string
    prompt: string
  } | null

  // Computed
  visibleCols: ColumnDef[]
  allCols: ColumnDef[]
  limit: number

  // Setters
  setView: (v: View) => void
  setStatSet: (s: StatSet) => void
  setActiveFilters: (filters: ActiveFilter[]) => void
  setQualifier: React.Dispatch<React.SetStateAction<{ minPitches: number; minPA: number }>>
  setGameType: (gt: string) => void
  setPage: (p: number) => void
  setSortBy: (col: string) => void
  setSortDir: (dir: 'ASC' | 'DESC') => void
  setContextMenu: (menu: UseExploreDataReturn['contextMenu']) => void
  setExplainRequest: (req: UseExploreDataReturn['explainRequest']) => void

  // Actions
  handleViewChange: (v: View) => void
  handleSort: (col: string) => void
  handleFiltersChange: (filters: ActiveFilter[]) => void
  handleRowClick: (row: any, col: ColumnDef) => void
  buildExplainPrompt: (playerName: string, metricLabel: string, value: string, colKey: string) => string
  fetchData: () => void
  loadMore: () => void
  removeFilter: (key: string) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useExploreData(): UseExploreDataReturn {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Read initial state from URL params
  const initView = (VALID_VIEWS.has(searchParams.get('view') || '') ? searchParams.get('view') : 'pitching') as View
  const initTab = searchParams.get('tab') as StatSet | null
  const validTab = initTab && STAT_SETS[initView]?.some(s => s.key === initTab) ? initTab : (STAT_SETS[initView]?.[0]?.key || 'traditional')

  const [view, setView] = useState<View>(initView)
  const [statSet, setStatSet] = useState<StatSet>(validTab)
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([
    { def: FILTER_CATALOG.find(f => f.key === 'game_year')!, values: [currentYear] },
  ])
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({})
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [sortBy, setSortBy] = useState('pitches')
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC')
  const [page, setPage] = useState(0)
  const [qualifier, setQualifier] = useState(defaultQualifier(initView))
  const [gameType, setGameType] = useState<string>('R')
  const [contextMenu, setContextMenu] = useState<UseExploreDataReturn['contextMenu']>(null)
  const [explainRequest, setExplainRequest] = useState<UseExploreDataReturn['explainRequest']>(null)
  const batterNamesRef = useRef<Record<number, string>>({})
  const limit = 50
  const fetchRef = useRef(0)

  // Load filter options on mount
  useEffect(() => {
    async function loadOptions() {
      const o: Record<string, string[]> = {}

      // Static options for known Statcast vocabularies
      o.pitch_type = ['AB','CH','CS','CU','EP','FA','FC','FF','FO','FS','IN','KC','KN','PO','SC','SI','SL','ST','SV','UN']
      o.pitch_name = ['4-Seam Fastball','Changeup','Curveball','Cutter','Eephus','Forkball','Knuckle Curve','Knuckleball','Other','Screwball','Sinker','Slider','Slow Curve','Slurve','Split-Finger','Sweeper']
      o.stand = ['L', 'R']
      o.p_throws = ['L', 'R']
      o.game_type = ['D', 'E', 'F', 'L', 'P', 'R', 'S', 'W']
      o.inning_topbot = ['Bot', 'Top']
      o.bb_type = ['fly_ball', 'ground_ball', 'line_drive', 'popup']
      o.balls = ['0', '1', '2', '3']
      o.strikes = ['0', '1', '2']
      o.outs_when_up = ['0', '1', '2']
      o.inning = Array.from({ length: 18 }, (_, i) => String(i + 1))
      o.zone = Array.from({ length: 14 }, (_, i) => String(i + 1))

      // Only query DISTINCT for columns that genuinely vary
      const dynamicCols = ['type', 'events', 'description',
        'home_team', 'away_team',
        'if_fielding_alignment', 'of_fielding_alignment']
      const results = await Promise.all(
        dynamicCols.map(col => supabase.rpc('get_distinct_values', { col_name: col }).then(r => r, () => ({ data: null })))
      )
      dynamicCols.forEach((col, i) => {
        const data = (results[i] as any)?.data
        if (data) o[col] = data.map((r: any) => r.value).filter(Boolean).sort()
      })

      const { data: yd } = await supabase.rpc('get_distinct_values', { col_name: 'game_year' })
      if (yd) o.game_year = yd.map((r: any) => r.value).filter(Boolean).sort().reverse()
      setOptionsCache(o)
      setInitialLoading(false)
    }
    loadOptions()
  }, [])

  // Fetch data whenever view, statSet, filters, sort, page, or qualifier changes
  const fetchData = useCallback(async () => {
    setLoading(true)
    const id = ++fetchRef.current

    try {
      if (DEFENCE_STAT_SETS.has(statSet)) {
        const yearFilter = activeFilters.find(f => f.def.key === 'game_year')
        const season = yearFilter?.values?.[0] ? parseInt(yearFilter.values[0]) : parseInt(currentYear)

        const res = await fetch('/api/leaderboard-defence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season, statSet, sortBy, sortDir, limit, offset: page * limit }),
        })
        const data = await res.json()
        if (id !== fetchRef.current) return
        setRows(data.rows || [])
      } else if (statSet === 'triton_raw' || statSet === 'triton_plus' || statSet === 'deception') {
        const yearFilter = activeFilters.find(f => f.def.key === 'game_year')
        const gameYear = yearFilter?.values?.[0] ? parseInt(yearFilter.values[0]) : parseInt(currentYear)

        const endpoint = statSet === 'deception' ? '/api/leaderboard-deception' : '/api/leaderboard-triton'
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameYear,
            gameType: gameType || 'R',
            minPitches: qualifier.minPitches || 500,
            sortBy,
            sortDir,
            limit,
            offset: page * limit,
            ...(statSet !== 'deception' && { mode: statSet === 'triton_raw' ? 'raw' : 'plus' }),
          }),
        })
        const data = await res.json()
        if (id !== fetchRef.current) return
        setRows(data.rows || [])
      } else {
        const metrics = getMetricsForStatSet(view, statSet)
        const groupBy = getGroupBy(view)
        const filters = filtersToReportFormat(activeFilters)
        if (gameType) {
          filters.push({ column: 'game_type', op: 'eq', value: gameType })
        }

        const res = await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metrics,
            groupBy,
            filters,
            sortBy,
            sortDir,
            limit,
            offset: page * limit,
            minPitches: qualifier.minPitches,
            minPA: qualifier.minPA,
          }),
        })
        const data = await res.json()
        if (id !== fetchRef.current) return

        let fetchedRows = data.rows || []

        // Enrich with SOS scores from precomputed table
        if ((view === 'pitching' || view === 'hitting') && (statSet === 'advanced') && fetchedRows.length > 0) {
          const yearFilter = activeFilters.find(f => f.def.key === 'game_year')
          const gameYear = yearFilter?.values?.[0] ? parseInt(yearFilter.values[0]) : parseInt(currentYear)
          const role = view === 'pitching' ? 'pitcher' : 'hitter'
          const playerIds = fetchedRows.map((r: any) => view === 'pitching' ? r.pitcher : r.batter).filter(Boolean)
          if (playerIds.length > 0) {
            const { data: sosData } = await supabase
              .from('sos_scores')
              .select('player_id, sos')
              .in('player_id', playerIds)
              .eq('game_year', gameYear)
              .eq('role', role)
            if (sosData) {
              const sosMap: Record<number, number> = {}
              sosData.forEach((r: any) => { sosMap[r.player_id] = Number(r.sos) })
              fetchedRows = fetchedRows.map((r: any) => ({
                ...r,
                _sos: sosMap[view === 'pitching' ? r.pitcher : r.batter] ?? null,
              }))
            }
          }
        }

        // For hitting view, resolve batter names
        if (view === 'hitting' && fetchedRows.length > 0) {
          const ids = [...new Set(fetchedRows.map((r: any) => r.batter).filter(Boolean))] as number[]
          const uncached = ids.filter(id => !batterNamesRef.current[id])
          if (uncached.length > 0) {
            const { data: players } = await supabase
              .from('players')
              .select('id, name')
              .in('id', uncached)
            if (players) {
              players.forEach((p: any) => { batterNamesRef.current[p.id] = p.name })
            }
          }
          fetchedRows = fetchedRows.map((r: any) => ({
            ...r,
            _batter_name: batterNamesRef.current[r.batter] || `ID ${r.batter}`,
          }))
        }

        setRows(fetchedRows)
      }
    } catch {
      if (id === fetchRef.current) setRows([])
    }
    if (id === fetchRef.current) setLoading(false)
  }, [view, statSet, activeFilters, sortBy, sortDir, page, qualifier, gameType])

  useEffect(() => {
    if (!initialLoading) fetchData()
  }, [fetchData, initialLoading])

  // Sync view + tab to URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', view)
    params.set('tab', statSet)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [view, statSet])

  // When view changes, reset statSet and qualifier
  function handleViewChange(v: View) {
    setView(v)
    const firstStat = STAT_SETS[v]?.[0]?.key || 'traditional'
    setStatSet(firstStat)
    setQualifier(defaultQualifier(v))
    setSortBy(v === 'defence' ? 'outs_above_average' : 'pitches')
    setSortDir('DESC')
    setPage(0)
  }

  function handleSort(col: string) {
    if (col === sortBy) {
      setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC')
    } else {
      setSortBy(col)
      setSortDir('DESC')
    }
    setPage(0)
  }

  function handleFiltersChange(filters: ActiveFilter[]) {
    setActiveFilters(filters)
    setPage(0)
  }

  function removeFilter(key: string) {
    setActiveFilters(prev => prev.filter(f => f.def.key !== key))
    setPage(0)
  }

  function buildExplainPrompt(playerName: string, metricLabel: string, value: string, colKey: string) {
    const ptMatch = colKey.match(/^([a-z]{2})_/)
    const ptHint = ptMatch ? ` for their ${ptMatch[1].toUpperCase()} pitch type` : ''

    if (statSet === 'deception') {
      return `In one to two concise paragraphs, explain why ${playerName} has a ${metricLabel} of ${value}${ptHint}. This is a deception metric measuring how unusual/hard-to-read their pitches are. Query the database if needed to explain what about their pitch profile drives this number. Keep it short and analytical.`
    }
    return `In one to two concise paragraphs, explain why ${playerName} has a ${metricLabel} of ${value}${ptHint}. The metric is from the Triton command system. For context, 100 is league average and every 10 points is one standard deviation. Query the database if needed to provide specific context about their pitch characteristics. Keep it short and analytical.`
  }

  function handleRowClick(row: any, col: ColumnDef) {
    if (!col.isName) return
    if (view === 'defence') {
      const id = row.player_id
      if (id) window.location.href = `/hitter/${id}`
    } else if (view === 'pitching' || statSet === 'triton_raw' || statSet === 'triton_plus' || statSet === 'deception') {
      const id = row.pitcher
      if (id) window.location.href = `/player/${id}`
    } else if (view === 'hitting') {
      const id = row.batter
      if (id) window.location.href = `/player/${id}`
    }
  }

  // Load more for mobile (increments page)
  function loadMore() {
    setPage(p => p + 1)
  }

  // Get the visible columns
  const allCols = DEFENCE_STAT_SETS.has(statSet) ? (COLUMNS[`defence:${statSet}`] || [])
    : statSet === 'triton_raw' ? TRITON_RAW_COLUMNS
    : statSet === 'triton_plus' ? TRITON_PLUS_COLUMNS
    : statSet === 'deception' ? DECEPTION_COLUMNS
    : (COLUMNS[`${view}:${statSet}`] || [])
  const visibleCols = allCols.filter(c => c.label !== '')

  // Dismiss context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    function handleClick() { setContextMenu(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenu])

  return {
    // State
    view,
    statSet,
    activeFilters,
    optionsCache,
    rows,
    loading,
    initialLoading,
    sortBy,
    sortDir,
    page,
    qualifier,
    gameType,
    contextMenu,
    explainRequest,

    // Computed
    visibleCols,
    allCols,
    limit,

    // Setters
    setView,
    setStatSet,
    setActiveFilters,
    setQualifier,
    setGameType,
    setPage,
    setSortBy,
    setSortDir,
    setContextMenu,
    setExplainRequest,

    // Actions
    handleViewChange,
    handleSort,
    handleFiltersChange,
    handleRowClick,
    buildExplainPrompt,
    fetchData,
    loadMore,
    removeFilter,
  }
}
