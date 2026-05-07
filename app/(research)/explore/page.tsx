'use client'
import ResearchNav from '@/components/ResearchNav'
import FilterEngine from '@/components/FilterEngine'
import ExplainBubble from '@/components/ExplainBubble'
import MobileExplore from '@/components/mobile/MobileExplore'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import { useExploreData, VIEWS, GAME_TYPES, TRITON_TABS } from '@/lib/hooks/useExploreData'
import {
  STAT_SETS, DEFENCE_STAT_SETS,
  formatValue, getCellColor,
} from '@/lib/leaderboardColumns'

export default function ExplorePage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const explore = useExploreData()

  if (deviceLoading) return null

  if (isMobile) return <MobileExplore explore={explore} />

  const {
    view, statSet, activeFilters, optionsCache, rows, loading, initialLoading,
    sortBy, sortDir, page, qualifier, gameType, visibleCols, limit,
    contextMenu, explainRequest,
    setStatSet, setPage, setGameType, setQualifier, setSortBy, setSortDir,
    setContextMenu, setExplainRequest,
    handleViewChange, handleSort, handleFiltersChange, handleRowClick,
    buildExplainPrompt, fetchData,
  } = explore

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
