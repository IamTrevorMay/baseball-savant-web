'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ResearchNav from '@/components/ResearchNav'
import FilterEngine, { ActiveFilter, FILTER_CATALOG } from '@/components/FilterEngine'
import ExplainBubble from '@/components/ExplainBubble'
import {
  View, StatSet, STAT_SETS, COLUMNS, TRITON_RAW_COLUMNS, TRITON_PLUS_COLUMNS, DECEPTION_COLUMNS,
  DEFENCE_STAT_SETS,
  getMetricsForStatSet, getGroupBy, filtersToReportFormat,
  formatValue, getCellColor, defaultQualifier,
  type ColumnDef,
} from '@/lib/leaderboardColumns'

const GAME_TYPES: { key: string; label: string }[] = [
  { key: 'S', label: 'Spring Training' },
  { key: 'R', label: 'Regular Season' },
  { key: 'P', label: 'Postseason' },
]

const TRITON_TABS = new Set(['triton_raw', 'triton_plus', 'deception'])

const VIEWS: { key: View; label: string }[] = [
  { key: 'pitching', label: 'Pitching' },
  { key: 'hitting', label: 'Hitting' },
  { key: 'team', label: 'Team' },
  { key: 'defence', label: 'Defence' },
]

// Default to current year, but fall back to previous year if season hasn't started
const now = new Date()
const currentYear = (now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear()).toString()

const VALID_VIEWS = new Set(['pitching', 'hitting', 'team', 'defence'])

export default function ExplorePage() {
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
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number
    playerName: string; metricLabel: string; value: string
    colKey: string; row: any
  } | null>(null)
  const [explainRequest, setExplainRequest] = useState<{
    playerName: string; metricLabel: string; value: string
    prompt: string
  } | null>(null)
  const batterNamesRef = useRef<Record<number, string>>({})
  const limit = 50
  const fetchRef = useRef(0)

  // Load filter options on mount
  useEffect(() => {
    async function loadOptions() {
      const o: Record<string, string[]> = {}

      // Static options for known Statcast vocabularies (avoids slow DISTINCT scans on 7M+ rows)
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

      // Only query DISTINCT for columns that genuinely vary (teams, events, descriptions, alignments, years)
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
        // Defence uses separate leaderboard API
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
        // Triton / Deception use separate APIs
        const yearFilter = activeFilters.find(f => f.def.key === 'game_year')
        const gameYear = yearFilter?.values?.[0] ? parseInt(yearFilter.values[0]) : parseInt(currentYear)

        const endpoint = statSet === 'deception' ? '/api/leaderboard-deception' : '/api/leaderboard-triton'
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameYear,
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
        // Standard report API
        const metrics = getMetricsForStatSet(view, statSet)
        const groupBy = getGroupBy(view)
        const filters = filtersToReportFormat(activeFilters)
        if (gameType) {
          filters.push({ column: 'game_type', op: '=', value: gameType })
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

  // Get the visible columns (hide empty isGroup columns like pitcher/batter IDs)
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

  function buildExplainPrompt(playerName: string, metricLabel: string, value: string, colKey: string) {
    // Extract pitch type from column key if present (e.g. ff_brink_plus → FF)
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

  if (initialLoading) {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-6" />
          <h3 className="text-lg font-medium text-white mb-2">Leaderboard</h3>
          <p className="text-zinc-500 text-sm">Loading filters...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-200 overflow-hidden">
      <ResearchNav active="/explore" />

      {/* View toggles */}
      <div className="bg-zinc-900/80 border-b border-zinc-800 px-6 py-2 flex items-center gap-6">
        <div className="flex items-center gap-1">
          {VIEWS.map(v => (
            <button key={v.key} onClick={() => handleViewChange(v.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                view === v.key
                  ? 'bg-emerald-600 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}>
              {v.label}
            </button>
          ))}
        </div>
        {view !== 'defence' && (
          <>
          <div className="h-5 w-px bg-zinc-700 mx-1" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider mr-0.5">Season</span>
            {GAME_TYPES.map(gt => (
              <button key={gt.key} onClick={() => { setGameType(gt.key); setPage(0) }}
                className={`px-2.5 py-1 rounded text-[10px] font-medium transition ${
                  gameType === gt.key
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                }`}>
                {gt.label}
              </button>
            ))}
          </div>
          </>
        )}
        {view !== 'defence' && (
          <div className="flex items-center gap-4 ml-auto text-[11px]">
            <label className="flex items-center gap-1.5 text-zinc-500">
              Min Pitches
              <input type="number" value={qualifier.minPitches}
                onChange={e => { setQualifier(q => ({ ...q, minPitches: parseInt(e.target.value) || 0 })); setPage(0) }}
                className="w-16 px-1.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-[11px] focus:border-emerald-600 focus:outline-none" />
            </label>
            <label className="flex items-center gap-1.5 text-zinc-500">
              Min PA
              <input type="number" value={qualifier.minPA}
                onChange={e => { setQualifier(q => ({ ...q, minPA: parseInt(e.target.value) || 0 })); setPage(0) }}
                className="w-16 px-1.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-[11px] focus:border-emerald-600 focus:outline-none" />
            </label>
          </div>
        )}
      </div>

      {/* Filter engine */}
      <FilterEngine
        activeFilters={activeFilters}
        onFiltersChange={handleFiltersChange}
        optionsCache={optionsCache}
      />

      <>
          {/* Stat set tabs */}
          <div className="bg-zinc-950 border-b border-zinc-800 px-6 flex items-center gap-1 h-9">
            {STAT_SETS[view].map(ss => (
              <button key={ss.key} onClick={() => { setStatSet(ss.key); setPage(0); setSortBy(DEFENCE_STAT_SETS.has(ss.key) ? 'player_name' : 'pitches'); setSortDir('DESC') }}
                className={`px-3 py-1 rounded-t text-[11px] font-medium transition border-b-2 ${
                  statSet === ss.key
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}>
                {ss.label}
              </button>
            ))}
            <div className="flex-1" />
            {/* Refresh + Row count + pagination */}
            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
              <button onClick={() => fetchData()} disabled={loading}
                title="Refresh data"
                className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition">
                <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              {loading && <span className="text-emerald-400 animate-pulse">Loading...</span>}
              <span>{rows.length} rows</span>
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400 disabled:opacity-30 hover:text-white transition">
                &larr;
              </button>
              <span>Page {page + 1}</span>
              <button onClick={() => setPage(page + 1)} disabled={rows.length < limit}
                className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400 disabled:opacity-30 hover:text-white transition">
                &rarr;
              </button>
            </div>
          </div>

          {/* Triton/Deception regular-season-only banner */}
          {gameType !== 'R' && TRITON_TABS.has(statSet) && (
            <div className="px-6 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-400">
              Triton and Deception metrics are computed from Regular Season data only.
            </div>
          )}

          {/* Data table */}
          <div className="flex-1 overflow-auto">
            {rows.length > 0 ? (
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="bg-zinc-900 text-left text-[11px] font-medium px-3 py-2 border-b border-zinc-800 text-zinc-500 w-8">#</th>
                    {visibleCols.map(col => (
                      <th key={col.key}
                        onClick={() => handleSort(col.key)}
                        className={`bg-zinc-900 text-left text-[11px] font-medium px-3 py-2 border-b border-zinc-800 whitespace-nowrap cursor-pointer hover:text-zinc-200 transition ${
                          sortBy === col.key ? 'text-emerald-400' : 'text-zinc-400'
                        }`}>
                        {col.label} {sortBy === col.key ? (sortDir === 'DESC' ? '\u2193' : '\u2191') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="px-3 py-1.5 text-[11px] text-zinc-600 font-mono">{page * limit + i + 1}</td>
                      {visibleCols.map(col => {
                        const val = row[col.key]
                        const colorClass = getCellColor(col, val, view)
                        const clickable = col.isName && view !== 'team'
                        return (
                          <td key={col.key}
                            onClick={() => clickable && handleRowClick(row, col)}
                            onContextMenu={(e) => {
                              if (TRITON_TABS.has(statSet) && !col.isName && !col.isGroup && val != null) {
                                e.preventDefault()
                                setContextMenu({
                                  x: e.clientX, y: e.clientY,
                                  playerName: row.player_name,
                                  metricLabel: col.label,
                                  value: formatValue(val, col.format),
                                  colKey: col.key, row,
                                })
                              }
                            }}
                            className={`px-3 py-1.5 text-[11px] whitespace-nowrap ${
                              col.isName ? '' : 'font-mono'
                            } ${colorClass} ${clickable ? 'cursor-pointer hover:text-emerald-400' : ''}`}>
                            {formatValue(val, col.format)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : !loading ? (
              <div className="flex items-center justify-center h-full text-zinc-600">
                <div className="text-center">
                  <p className="text-lg mb-2">No data</p>
                  <p className="text-sm">Try adjusting filters or lowering the qualifier threshold</p>
                </div>
              </div>
            ) : null}
          </div>
        </>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]"
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              const prompt = buildExplainPrompt(
                contextMenu.playerName, contextMenu.metricLabel,
                contextMenu.value, contextMenu.colKey
              )
              setExplainRequest({
                playerName: contextMenu.playerName,
                metricLabel: contextMenu.metricLabel,
                value: contextMenu.value,
                prompt,
              })
              setContextMenu(null)
            }}
            className="w-full px-3 py-1.5 text-left text-[12px] text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 transition"
          >
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.617 1.738 4.346a1 1 0 01-.025.846 3.746 3.746 0 01-3.373 2.046 3.746 3.746 0 01-3.373-2.046 1 1 0 01-.025-.846l1.738-4.346-.949-.474V9a1 1 0 01-2 0V7.038l-.949.474 1.738 4.346a1 1 0 01-.025.846 3.746 3.746 0 01-3.373 2.046 3.746 3.746 0 01-3.373-2.046 1 1 0 01-.025-.846l1.738-4.346-1.233-.617a1 1 0 11.894-1.79l1.599.8L9 4.323V3a1 1 0 011-1zm-4.446 8.354L4 13.746c.67.37 1.404.504 2.108.504s1.438-.134 2.108-.504l-1.554-3.892h-2.216zm8.892 0h-2.216l-1.554 3.892c.67.37 1.404.504 2.108.504s1.438-.134 2.108-.504l-1.554-3.892h1.108z" />
            </svg>
            Explain this
          </button>
        </div>
      )}

      {/* Explain bubble */}
      {explainRequest && (
        <ExplainBubble
          playerName={explainRequest.playerName}
          metricLabel={explainRequest.metricLabel}
          value={explainRequest.value}
          prompt={explainRequest.prompt}
          onClose={() => setExplainRequest(null)}
        />
      )}
    </div>
  )
}
