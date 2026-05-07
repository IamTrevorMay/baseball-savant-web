'use client'

import { useState } from 'react'
import MobileShell from '@/components/mobile/MobileShell'
import MobilePlayerCard from '@/components/mobile/MobilePlayerCard'
import MobileFilterSheet from '@/components/mobile/MobileFilterSheet'
import {
  type UseExploreDataReturn,
  VIEWS, GAME_TYPES,
} from '@/lib/hooks/useExploreData'
import {
  STAT_SETS, DEFENCE_STAT_SETS,
  formatValue,
  type View,
} from '@/lib/leaderboardColumns'

interface Props {
  explore: UseExploreDataReturn
}

/** Pick the 3-4 most interesting stat columns for the card view. */
function pickCardStats(explore: UseExploreDataReturn) {
  const { visibleCols } = explore
  // Skip name/group columns, take up to 4 metric columns
  return visibleCols.filter(c => !c.isName && !c.isGroup).slice(0, 4)
}

/** Resolve player ID from a row depending on view/statSet. */
function getPlayerId(row: any, view: View, statSet: string): number | null {
  if (view === 'defence') return row.player_id || null
  if (view === 'hitting') return row.batter || null
  return row.pitcher || null
}

/** Resolve display name from a row. */
function getPlayerName(row: any, view: View): string {
  if (view === 'hitting') return row._batter_name || row.player_name || '—'
  return row.player_name || row.pitch_team || '—'
}

/** Resolve team abbreviation from a row. */
function getTeam(row: any, view: View): string {
  if (view === 'team') return row.pitch_team || ''
  return row.team || row.pitch_team || row.bat_team || ''
}

export default function MobileExplore({ explore }: Props) {
  const {
    view, statSet, activeFilters, optionsCache, rows, loading, initialLoading,
    sortBy, sortDir, page, qualifier, gameType, visibleCols, limit,
    handleViewChange, handleFiltersChange, handleSort,
    setStatSet, setPage, setGameType, setQualifier,
    setSortBy, setSortDir, fetchData, loadMore, removeFilter,
  } = explore

  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)
  const [statSetOpen, setStatSetOpen] = useState(false)

  const cardStats = pickCardStats(explore)
  const isTeamView = view === 'team'
  const sortableCols = visibleCols.filter(c => !c.isName && !c.isGroup)

  if (initialLoading) {
    return (
      <MobileShell title="Explore">
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-zinc-500">Loading filters...</p>
          </div>
        </div>
      </MobileShell>
    )
  }

  return (
    <MobileShell title="Explore">
      <div className="px-3 pt-3 pb-2 space-y-2">
        {/* View pills — horizontal scroll */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => handleViewChange(v.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                view === v.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Stat set dropdown + Game type pills — single row */}
        <div className="flex items-center gap-2">
          {/* Stat set dropdown */}
          <div className="relative">
            <button
              onClick={() => setStatSetOpen(!statSetOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:text-white transition"
            >
              <span className="text-emerald-400 font-medium">
                {STAT_SETS[view].find(ss => ss.key === statSet)?.label || 'Stats'}
              </span>
              <svg className={`w-3 h-3 text-zinc-500 transition-transform ${statSetOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {statSetOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setStatSetOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl min-w-[160px] py-1">
                  {STAT_SETS[view].map(ss => (
                    <button
                      key={ss.key}
                      onClick={() => {
                        setStatSet(ss.key)
                        setPage(0)
                        setSortBy(DEFENCE_STAT_SETS.has(ss.key) ? 'player_name' : 'pitches')
                        setSortDir('DESC')
                        setStatSetOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-[11px] transition ${
                        statSet === ss.key
                          ? 'text-emerald-400 bg-zinc-700/30'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-700/20'
                      }`}
                    >
                      {ss.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Game type pills (not for defence) */}
          {view !== 'defence' && (
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {GAME_TYPES.map(gt => (
                <button
                  key={gt.key}
                  onClick={() => { setGameType(gt.key); setPage(0) }}
                  className={`shrink-0 px-2 py-1 rounded text-[10px] font-medium transition ${
                    gameType === gt.key
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {gt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action row: Filter + Sort */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterSheetOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:text-white transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {activeFilters.length > 0 && (
              <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 rounded-full font-medium">
                {activeFilters.length}
              </span>
            )}
          </button>

          {/* Sort dropdown */}
          <div className="relative flex-1">
            <button
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:text-white transition w-full"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h12M3 17h6" />
              </svg>
              <span className="truncate">
                {sortableCols.find(c => c.key === sortBy)?.label || sortBy}
              </span>
              <span className="text-emerald-400 shrink-0">{sortDir === 'DESC' ? '\u2193' : '\u2191'}</span>
            </button>

            {sortDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortDropdownOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {/* ASC/DESC toggle */}
                  <div className="flex border-b border-zinc-700">
                    <button
                      onClick={() => { setSortDir('DESC'); setPage(0) }}
                      className={`flex-1 py-2 text-[10px] font-medium transition ${
                        sortDir === 'DESC' ? 'text-emerald-400 bg-zinc-700/50' : 'text-zinc-500'
                      }`}
                    >
                      Descending
                    </button>
                    <button
                      onClick={() => { setSortDir('ASC'); setPage(0) }}
                      className={`flex-1 py-2 text-[10px] font-medium transition ${
                        sortDir === 'ASC' ? 'text-emerald-400 bg-zinc-700/50' : 'text-zinc-500'
                      }`}
                    >
                      Ascending
                    </button>
                  </div>
                  {sortableCols.map(col => (
                    <button
                      key={col.key}
                      onClick={() => {
                        setSortBy(col.key)
                        setPage(0)
                        setSortDropdownOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-[11px] transition ${
                        sortBy === col.key
                          ? 'text-emerald-400 bg-zinc-700/30'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-700/20'
                      }`}
                    >
                      {col.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 transition"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Active filters — dismissible chips */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeFilters.map(f => {
              let label = f.def.label
              if (f.def.type === 'multi' && f.values && f.values.length > 0) {
                label += `: ${f.values.length > 2 ? `${f.values.slice(0, 2).join(', ')}+${f.values.length - 2}` : f.values.join(', ')}`
              } else if (f.def.type === 'range') {
                if (f.min && f.max) label += `: ${f.min}-${f.max}`
                else if (f.min) label += `: >=${f.min}`
                else if (f.max) label += `: <=${f.max}`
              } else if (f.def.type === 'date') {
                if (f.startDate) label += `: from ${f.startDate}`
                if (f.endDate) label += ` to ${f.endDate}`
              }
              return (
                <span
                  key={f.def.key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full text-[10px] text-zinc-300"
                >
                  {label}
                  <button
                    onClick={() => removeFilter(f.def.key)}
                    className="text-zinc-500 hover:text-red-400 transition"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* Qualifier controls for non-defence */}
        {view !== 'defence' && (
          <div className="flex gap-3 text-[10px]">
            <label className="flex items-center gap-1 text-zinc-500">
              Min Pitches
              <input
                type="number"
                value={qualifier.minPitches}
                onChange={e => { setQualifier(q => ({ ...q, minPitches: parseInt(e.target.value) || 0 })); setPage(0) }}
                className="w-14 px-1.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-[10px] focus:border-emerald-600 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1 text-zinc-500">
              Min PA
              <input
                type="number"
                value={qualifier.minPA}
                onChange={e => { setQualifier(q => ({ ...q, minPA: parseInt(e.target.value) || 0 })); setPage(0) }}
                className="w-14 px-1.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-[10px] focus:border-emerald-600 focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="px-3 pb-4">
        {/* Row count */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-zinc-500">
            {rows.length} results{page > 0 ? ` (page ${page + 1})` : ''}
          </span>
          {loading && (
            <span className="text-[10px] text-emerald-400 animate-pulse">Loading...</span>
          )}
        </div>

        {rows.length > 0 ? (
          <div className="grid grid-cols-1 gap-2">
            {rows.map((row, i) => {
              const playerId = getPlayerId(row, view, statSet)
              const name = getPlayerName(row, view)
              const team = getTeam(row, view)
              const stats = cardStats.map(col => ({
                label: col.label,
                value: formatValue(row[col.key], col.format),
              }))

              if (isTeamView) {
                // Team view: show as a simple card without headshot
                return (
                  <div
                    key={i}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-3"
                  >
                    <div className="text-sm font-medium text-white mb-2">{name}</div>
                    <div className="flex gap-3">
                      {stats.map(s => (
                        <div key={s.label} className="flex-1 text-center">
                          <div className="text-[9px] text-zinc-500 uppercase">{s.label}</div>
                          <div className="text-xs font-mono font-medium text-zinc-300">{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }

              return (
                <MobilePlayerCard
                  key={i}
                  playerId={playerId || 0}
                  name={name}
                  team={team}
                  stats={stats}
                  onClick={playerId ? () => {
                    if (view === 'defence') {
                      window.location.href = `/hitter/${playerId}`
                    } else {
                      window.location.href = `/player/${playerId}`
                    }
                  } : undefined}
                />
              )
            })}
          </div>
        ) : !loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-600">
            <div className="text-center">
              <p className="text-base mb-1">No data</p>
              <p className="text-xs">Try adjusting filters or lowering the qualifier threshold</p>
            </div>
          </div>
        ) : null}

        {/* Load more button */}
        {rows.length >= limit && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="w-full mt-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:border-zinc-600 disabled:opacity-30 transition"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        )}
      </div>

      {/* Filter bottom sheet */}
      <MobileFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        activeFilters={activeFilters}
        onFiltersChange={handleFiltersChange}
        optionsCache={optionsCache}
      />
    </MobileShell>
  )
}
