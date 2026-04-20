'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import ResearchNav from '@/components/ResearchNav'
import FilterEngine, { ActiveFilter, FILTER_CATALOG } from '@/components/FilterEngine'
import {
  View, StatSet, STAT_SETS, COLUMNS,
  getMetricsForStatSet, getGroupBy, filtersToReportFormat,
  formatValue, getCellColor, defaultQualifier,
  type ColumnDef,
} from '@/lib/leaderboardColumns'

/* ─── WBC Team Colors ─── */
const WBC_TEAM_COLORS: Record<string, string> = {
  // WBC country codes
  USA: '#002868', JPN: '#BC002D', KOR: '#003478', DOM: '#002D62',
  MEX: '#006847', CUB: '#002A8F', VEN: '#FFB81C', PUR: '#ED0A3F',
  COL: '#FCD116', CAN: '#FF0000', AUS: '#00843D', ITA: '#008C45',
  NED: '#FF6600', GBR: '#00247D', CZE: '#11457E', ISR: '#0038B8',
  PAN: '#D21034', NCA: '#0067C6', TPE: '#FE0000', CHN: '#DE2910',
  // MLB-style abbreviations that WBC might use
  PR: '#ED0A3F', DR: '#002D62', CRC: '#002B7F',
  // MLB team colors fallback
  ARI:'#A71930',ATH:'#003831',ATL:'#CE1141',BAL:'#DF4601',BOS:'#BD3039',
  CHC:'#0E3386',CIN:'#C6011F',CLE:'#00385D',COL2:'#333366',CWS:'#27251F',
  DET:'#0C2340',HOU:'#002D62',KC:'#004687',LAA:'#BA0021',LAD:'#005A9C',
  MIA:'#00A3E0',MIL:'#FFC52F',MIN:'#002B5C',NYM:'#002D72',NYY:'#003087',
  OAK:'#003831',PHI:'#E81828',PIT:'#27251F',SD:'#2F241D',SEA:'#0C2C56',
  SF:'#FD5A1E',STL:'#C41E3A',TB:'#092C5C',TEX:'#003278',TOR:'#134A8E',
  WSH:'#AB0003',
}

import type { GameTeam, PlayerRef, Game } from '@/lib/types'
interface BoxBatter {
  id: number; name: string; boxName: string; pos: string
  ab: number; r: number; h: number; rbi: number; bb: number; so: number
  avg: string; obp: string; slg: string; hr: number
}
interface BoxPitcher {
  id: number; name: string; boxName: string
  ip: string; h: number; r: number; er: number; bb: number; so: number
  hr: number; era: string; pitches: number; strikes: number
}
interface BoxTeam {
  team: { id: number; name: string; abbrev: string }
  batting: { totals: any }
  batters: BoxBatter[]; pitchers: BoxPitcher[]
}
interface InningLine { num: number; ordinal: string; away: { runs: number | null }; home: { runs: number | null } }
interface BoxScore {
  gamePk: string; away: BoxTeam; home: BoxTeam; innings: InningLine[]
  totals: { away: { runs: number; hits: number; errors: number }; home: { runs: number; hits: number; errors: number } }
}

/* ─── WBC Stat Sets (subset of full explore) ─── */
const WBC_VIEWS: { key: View; label: string }[] = [
  { key: 'pitching', label: 'Pitching' },
  { key: 'hitting', label: 'Hitting' },
]

const WBC_STAT_SETS: Record<string, { key: StatSet; label: string }[]> = {
  pitching: [
    { key: 'traditional', label: 'Traditional' },
    { key: 'advanced', label: 'Advanced' },
    { key: 'stuff', label: 'Stuff/Arsenal' },
    { key: 'battedball', label: 'Batted Ball' },
    { key: 'discipline', label: 'Plate Discipline' },
  ],
  hitting: [
    { key: 'traditional', label: 'Traditional' },
    { key: 'advanced', label: 'Advanced' },
    { key: 'battedball', label: 'Batted Ball' },
    { key: 'discipline', label: 'Plate Discipline' },
  ],
}

export default function WBCPage() {
  const [tab, setTab] = useState<'overview' | 'explore'>('overview')

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-200 overflow-hidden">
      <ResearchNav active="/wbc" />

      {/* Tab bar */}
      <div className="bg-zinc-900/80 border-b border-zinc-800 px-6 py-2 flex items-center gap-4">
        <h1 className="text-sm font-semibold text-white mr-4">World Baseball Classic</h1>
        {(['overview', 'explore'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              tab === t ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}>
            {t === 'overview' ? 'Overview' : 'Explore'}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <OverviewTab /> : <ExploreTab />}
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   OVERVIEW TAB
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function OverviewTab() {
  // Scores
  const [scoresDate, setScoresDate] = useState('2026-03-15')
  const [games, setGames] = useState<Game[]>([])
  const [scoresLoading, setScoresLoading] = useState(true)
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null)
  const [boxScore, setBoxScore] = useState<BoxScore | null>(null)
  const [boxLoading, setBoxLoading] = useState(false)
  const [boxTeamSide, setBoxTeamSide] = useState<'away' | 'home'>('away')
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Leaders
  const [leaderSeason, setLeaderSeason] = useState<number | null>(null)
  const [battingLeaders, setBattingLeaders] = useState<any[]>([])
  const [pitchingLeaders, setPitchingLeaders] = useState<any[]>([])
  const [leadersLoading, setLeadersLoading] = useState(true)

  const fetchScores = useCallback((date: string, showLoading = false) => {
    if (showLoading) setScoresLoading(true)
    fetch(`/api/wbc/scores?date=${date}`)
      .then(r => r.json())
      .then(d => { setGames(d.games || []); setScoresLoading(false) })
      .catch(() => setScoresLoading(false))
  }, [])

  const shiftDate = (days: number) => {
    const d = new Date(scoresDate + 'T12:00:00')
    d.setDate(d.getDate() + days)
    const next = d.toISOString().slice(0, 10)
    setScoresDate(next)
    setSelectedGamePk(null)
    setBoxScore(null)
    fetchScores(next, true)
  }

  useEffect(() => {
    fetchScores(scoresDate, true)
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [])

  // Auto-refresh if showing today's games
  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current)
    const today = new Date().toISOString().slice(0, 10)
    if (scoresDate === today) {
      refreshRef.current = setInterval(() => fetchScores(scoresDate), 30000)
    }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [scoresDate, fetchScores])

  // Box score
  useEffect(() => {
    if (!selectedGamePk) { setBoxScore(null); return }
    setBoxLoading(true)
    fetch(`/api/boxscore?gamePk=${selectedGamePk}`)
      .then(r => r.json())
      .then(d => { setBoxScore(d); setBoxTeamSide('away'); setBoxLoading(false) })
      .catch(() => setBoxLoading(false))
  }, [selectedGamePk])

  // Leaders
  useEffect(() => {
    setLeadersLoading(true)
    const seasonParam = leaderSeason ? { season: leaderSeason } : {}
    Promise.all([
      fetch('/api/wbc/leaders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'batting', limit: 10, ...seasonParam }),
      }).then(r => r.json()),
      fetch('/api/wbc/leaders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'pitching', limit: 10, sortBy: 'k_pct', sortDir: 'DESC', ...seasonParam }),
      }).then(r => r.json()),
    ]).then(([bat, pit]) => {
      setBattingLeaders(bat.rows || [])
      setPitchingLeaders(pit.rows || [])
      setLeadersLoading(false)
    }).catch(() => setLeadersLoading(false))
  }, [leaderSeason])

  const formatDate = (ds: string) => {
    const d = new Date(ds + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">

        {/* ─── Scores Section ─── */}
        <section>
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-lg font-semibold text-white">Scores</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => shiftDate(-1)} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-400 hover:text-white text-xs transition">&larr;</button>
              <span className="text-sm text-zinc-300 font-medium min-w-[140px] text-center">{formatDate(scoresDate)}</span>
              <button onClick={() => shiftDate(1)} className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-400 hover:text-white text-xs transition">&rarr;</button>
              <input type="date" value={scoresDate}
                onChange={e => { setScoresDate(e.target.value); setSelectedGamePk(null); setBoxScore(null); fetchScores(e.target.value, true) }}
                className="ml-2 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 text-xs focus:border-emerald-600 focus:outline-none" />
            </div>
          </div>

          {scoresLoading ? (
            <div className="flex items-center gap-3 text-zinc-500 text-sm py-8">
              <div className="w-5 h-5 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
              Loading scores...
            </div>
          ) : games.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4">No WBC games scheduled for this date.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {games.map(game => (
                <WBCScoreCard key={game.gamePk} game={game}
                  selected={selectedGamePk === game.gamePk}
                  onClick={() => setSelectedGamePk(selectedGamePk === game.gamePk ? null : game.gamePk)} />
              ))}
            </div>
          )}

          {/* Box Score */}
          {selectedGamePk && (
            <div className="mt-4">
              {boxLoading ? (
                <div className="flex items-center gap-3 text-zinc-500 text-sm py-4">
                  <div className="w-5 h-5 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
                  Loading box score...
                </div>
              ) : boxScore ? (
                <WBCBoxScorePanel box={boxScore} side={boxTeamSide} setSide={setBoxTeamSide} />
              ) : null}
            </div>
          )}
        </section>

        {/* ─── Leaders Section ─── */}
        <section>
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-lg font-semibold text-white">Tournament Leaders</h2>
            <div className="flex items-center gap-1">
              {[
                { val: null, label: 'All' },
                { val: 2023, label: '2023' },
                { val: 2026, label: '2026' },
              ].map(s => (
                <button key={s.label} onClick={() => setLeaderSeason(s.val)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    leaderSeason === s.val ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {leadersLoading ? (
            <div className="flex items-center gap-3 text-zinc-500 text-sm py-8">
              <div className="w-5 h-5 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
              Loading leaders...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Batting Leaders */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-800/50">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Batting Leaders</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-zinc-500 font-medium">
                        <th className="text-left px-3 py-2 w-8">#</th>
                        <th className="text-left px-2 py-2">Name</th>
                        <th className="text-right px-2 py-2">PA</th>
                        <th className="text-right px-2 py-2">H</th>
                        <th className="text-right px-2 py-2">HR</th>
                        <th className="text-right px-2 py-2">BA</th>
                        <th className="text-right px-2 py-2">OBP</th>
                        <th className="text-right px-2 py-2">SLG</th>
                        <th className="text-right px-2 py-2">OPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {battingLeaders.map((r, i) => (
                        <tr key={r.batter} className="border-t border-zinc-800/30 hover:bg-zinc-800/20 transition">
                          <td className="px-3 py-1.5 text-zinc-600 font-mono">{i + 1}</td>
                          <td className="px-2 py-1.5 text-white font-medium whitespace-nowrap">
                            <a href={`/player/${r.batter}`} className="hover:text-emerald-400 transition">{r.player_name || `ID ${r.batter}`}</a>
                          </td>
                          <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{r.pa}</td>
                          <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{r.h}</td>
                          <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{r.hr_count}</td>
                          <td className="text-right px-2 py-1.5 text-rose-400 font-mono">{Number(r.ba).toFixed(3).replace(/^0/, '')}</td>
                          <td className="text-right px-2 py-1.5 text-rose-400 font-mono">{Number(r.obp).toFixed(3).replace(/^0/, '')}</td>
                          <td className="text-right px-2 py-1.5 text-rose-400 font-mono">{Number(r.slg).toFixed(3).replace(/^0/, '')}</td>
                          <td className="text-right px-2 py-1.5 text-rose-400 font-mono">{Number(r.ops).toFixed(3).replace(/^0/, '')}</td>
                        </tr>
                      ))}
                      {battingLeaders.length === 0 && (
                        <tr><td colSpan={9} className="px-4 py-6 text-center text-zinc-600">No data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pitching Leaders */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-800/50">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Pitching Leaders</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-zinc-500 font-medium">
                        <th className="text-left px-3 py-2 w-8">#</th>
                        <th className="text-left px-2 py-2">Name</th>
                        <th className="text-right px-2 py-2">Pitches</th>
                        <th className="text-right px-2 py-2">K%</th>
                        <th className="text-right px-2 py-2">BB%</th>
                        <th className="text-right px-2 py-2">Whiff%</th>
                        <th className="text-right px-2 py-2">Velo</th>
                        <th className="text-right px-2 py-2">BA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pitchingLeaders.map((r, i) => (
                        <tr key={r.pitcher} className="border-t border-zinc-800/30 hover:bg-zinc-800/20 transition">
                          <td className="px-3 py-1.5 text-zinc-600 font-mono">{i + 1}</td>
                          <td className="px-2 py-1.5 text-white font-medium whitespace-nowrap">
                            <a href={`/player/${r.pitcher}`} className="hover:text-emerald-400 transition">{r.player_name}</a>
                          </td>
                          <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{r.pitches}</td>
                          <td className="text-right px-2 py-1.5 text-emerald-400 font-mono">{Number(r.k_pct).toFixed(1)}</td>
                          <td className="text-right px-2 py-1.5 text-red-400 font-mono">{Number(r.bb_pct).toFixed(1)}</td>
                          <td className="text-right px-2 py-1.5 text-emerald-400 font-mono">{r.whiff_pct != null ? Number(r.whiff_pct).toFixed(1) : '—'}</td>
                          <td className="text-right px-2 py-1.5 text-amber-400 font-mono">{r.avg_velo != null ? Number(r.avg_velo).toFixed(1) : '—'}</td>
                          <td className="text-right px-2 py-1.5 text-rose-400 font-mono">{Number(r.ba).toFixed(3).replace(/^0/, '')}</td>
                        </tr>
                      ))}
                      {pitchingLeaders.length === 0 && (
                        <tr><td colSpan={8} className="px-4 py-6 text-center text-zinc-600">No data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   EXPLORE TAB
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ExploreTab() {
  const [view, setView] = useState<View>('pitching')
  const [statSet, setStatSet] = useState<StatSet>('traditional')
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([
    { def: FILTER_CATALOG.find(f => f.key === 'game_year')!, values: ['2026'] },
  ])
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({})
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [sortBy, setSortBy] = useState('pitches')
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC')
  const [page, setPage] = useState(0)
  const [qualifier, setQualifier] = useState({ minPitches: 30, minPA: 0 })
  const batterNamesRef = useRef<Record<number, string>>({})
  const limit = 50
  const fetchRef = useRef(0)

  // Load filter options on mount
  useEffect(() => {
    const o: Record<string, string[]> = {}
    o.pitch_type = ['AB','CH','CS','CU','EP','FA','FC','FF','FO','FS','IN','KC','KN','PO','SC','SI','SL','ST','SV','UN']
    o.pitch_name = ['4-Seam Fastball','Changeup','Curveball','Cutter','Eephus','Forkball','Knuckle Curve','Knuckleball','Other','Screwball','Sinker','Slider','Slow Curve','Slurve','Split-Finger','Sweeper']
    o.stand = ['L', 'R']
    o.p_throws = ['L', 'R']
    o.game_type = ['W']
    o.inning_topbot = ['Bot', 'Top']
    o.bb_type = ['fly_ball', 'ground_ball', 'line_drive', 'popup']
    o.balls = ['0', '1', '2', '3']
    o.strikes = ['0', '1', '2']
    o.outs_when_up = ['0', '1', '2']
    o.inning = Array.from({ length: 14 }, (_, i) => String(i + 1))
    o.zone = Array.from({ length: 14 }, (_, i) => String(i + 1))
    o.game_year = ['2026', '2023']
    o.type = ['B', 'S', 'X']
    setOptionsCache(o)
    setInitialLoading(false)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const id = ++fetchRef.current

    try {
      const metrics = getMetricsForStatSet(view, statSet)
      const groupBy = getGroupBy(view)
      const filters = filtersToReportFormat(activeFilters)

      const res = await fetch('/api/wbc/report', {
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
    } catch {
      if (id === fetchRef.current) setRows([])
    }
    if (id === fetchRef.current) setLoading(false)
  }, [view, statSet, activeFilters, sortBy, sortDir, page, qualifier])

  useEffect(() => {
    if (!initialLoading) fetchData()
  }, [fetchData, initialLoading])

  function handleViewChange(v: View) {
    setView(v)
    const firstStat = WBC_STAT_SETS[v]?.[0]?.key || 'traditional'
    setStatSet(firstStat)
    setQualifier(v === 'pitching' ? { minPitches: 30, minPA: 0 } : { minPitches: 0, minPA: 5 })
    setSortBy('pitches')
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

  function handleRowClick(row: any, col: ColumnDef) {
    if (!col.isName) return
    if (view === 'pitching') {
      const id = row.pitcher
      if (id) window.location.href = `/player/${id}`
    } else if (view === 'hitting') {
      const id = row.batter
      if (id) window.location.href = `/player/${id}`
    }
  }

  const allCols = COLUMNS[`${view}:${statSet}`] || []
  const visibleCols = allCols.filter(c => c.label !== '')

  if (initialLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {/* View toggles */}
      <div className="bg-zinc-900/80 border-b border-zinc-800 px-6 py-2 flex items-center gap-6">
        <div className="flex items-center gap-1">
          {WBC_VIEWS.map(v => (
            <button key={v.key} onClick={() => handleViewChange(v.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                view === v.key ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}>
              {v.label}
            </button>
          ))}
        </div>
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
      </div>

      {/* Filter engine */}
      <FilterEngine
        activeFilters={activeFilters}
        onFiltersChange={handleFiltersChange}
        optionsCache={optionsCache}
      />

      {/* Stat set tabs */}
      <div className="bg-zinc-950 border-b border-zinc-800 px-6 flex items-center gap-1 h-9">
        {(WBC_STAT_SETS[view] || []).map(ss => (
          <button key={ss.key} onClick={() => { setStatSet(ss.key); setPage(0); setSortBy('pitches'); setSortDir('DESC') }}
            className={`px-3 py-1 rounded-t text-[11px] font-medium transition border-b-2 ${
              statSet === ss.key
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}>
            {ss.label}
          </button>
        ))}
        <div className="flex-1" />
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
                    const clickable = col.isName
                    return (
                      <td key={col.key}
                        onClick={() => clickable && handleRowClick(row, col)}
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
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SHARED COMPONENTS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function Diamond({ onFirst, onSecond, onThird, size = 20 }: { onFirst: boolean; onSecond: boolean; onThird: boolean; size?: number }) {
  const s = size
  const half = s / 2
  const baseSize = s * 0.26
  const bh = baseSize / 2
  const pad = s * 0.12
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="shrink-0">
      <path d={`M${half} ${pad} L${s - pad} ${half} L${half} ${s - pad} L${pad} ${half} Z`}
        fill="none" stroke="#3f3f46" strokeWidth={0.8} />
      <rect x={half - bh} y={pad - bh} width={baseSize} height={baseSize}
        transform={`rotate(45 ${half} ${pad})`}
        fill={onSecond ? '#34d399' : '#27272a'} stroke={onSecond ? '#34d399' : '#3f3f46'} strokeWidth={0.5} />
      <rect x={pad - bh} y={half - bh} width={baseSize} height={baseSize}
        transform={`rotate(45 ${pad} ${half})`}
        fill={onThird ? '#34d399' : '#27272a'} stroke={onThird ? '#34d399' : '#3f3f46'} strokeWidth={0.5} />
      <rect x={s - pad - bh} y={half - bh} width={baseSize} height={baseSize}
        transform={`rotate(45 ${s - pad} ${half})`}
        fill={onFirst ? '#34d399' : '#27272a'} stroke={onFirst ? '#34d399' : '#3f3f46'} strokeWidth={0.5} />
    </svg>
  )
}

function OutsDots({ outs }: { outs: number }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < outs ? 'bg-amber-400' : 'bg-zinc-700'}`} />
      ))}
    </div>
  )
}

function WBCScoreCard({ game, selected, onClick }: { game: Game; selected: boolean; onClick: () => void }) {
  const isLive = game.state === 'Live'
  const isFinal = game.state === 'Final'
  const isPreview = game.state === 'Preview'

  const awayWon = isFinal && game.away.score !== null && game.home.score !== null && game.away.score > game.home.score
  const homeWon = isFinal && game.away.score !== null && game.home.score !== null && game.home.score > game.away.score

  function gameTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  let statusText = ''
  let statusColor = 'text-zinc-500'
  if (isLive) {
    statusText = `${game.inningHalf === 'Top' ? '\u25B2' : '\u25BC'} ${game.inningOrdinal || ''}`
    statusColor = 'text-emerald-400'
  } else if (isFinal) {
    statusText = game.inning && game.inning > 9 ? `Final/${game.inning}` : 'Final'
  } else if (game.detailedState === 'Postponed') {
    statusText = 'PPD'
    statusColor = 'text-red-400'
  } else {
    statusText = gameTime(game.gameDate)
  }

  const lastName = (name: string) => name.split(' ').slice(-1)[0]

  return (
    <div onClick={onClick} className={`bg-zinc-900 border rounded-lg p-4 min-w-[240px] flex-shrink-0 cursor-pointer transition ${
      selected ? 'border-emerald-500 ring-1 ring-emerald-500/30' : isLive ? 'border-emerald-700/50 hover:border-emerald-700' : 'border-zinc-800 hover:border-zinc-700'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
          {isLive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse align-middle" />}
          {statusText}
        </span>
        {game.seriesDescription && (
          <span className="text-[9px] text-zinc-600 truncate max-w-[100px]">{game.seriesDescription}</span>
        )}
        {isLive && game.outs !== null && (
          <div className="flex items-center gap-2">
            <OutsDots outs={game.outs} />
            <Diamond onFirst={game.onFirst} onSecond={game.onSecond} onThird={game.onThird} />
          </div>
        )}
      </div>

      {/* Away team */}
      <div className={`flex items-center justify-between py-1 ${awayWon ? 'text-white' : 'text-zinc-400'}`}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
            style={{ backgroundColor: WBC_TEAM_COLORS[game.away.abbrev] || '#52525b' }}>
            {game.away.abbrev.slice(0, 3)}
          </div>
          <span className={`text-sm font-medium ${awayWon ? 'text-white' : ''}`}>{game.away.name || game.away.abbrev}</span>
        </div>
        <span className={`text-sm font-mono font-semibold ${awayWon ? 'text-white' : ''}`}>
          {game.away.score !== null ? game.away.score : ''}
        </span>
      </div>

      {/* Home team */}
      <div className={`flex items-center justify-between py-1 ${homeWon ? 'text-white' : 'text-zinc-400'}`}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
            style={{ backgroundColor: WBC_TEAM_COLORS[game.home.abbrev] || '#52525b' }}>
            {game.home.abbrev.slice(0, 3)}
          </div>
          <span className={`text-sm font-medium ${homeWon ? 'text-white' : ''}`}>{game.home.name || game.home.abbrev}</span>
        </div>
        <span className={`text-sm font-mono font-semibold ${homeWon ? 'text-white' : ''}`}>
          {game.home.score !== null ? game.home.score : ''}
        </span>
      </div>

      {/* Live: pitcher / batter */}
      {isLive && (game.pitcher || game.batter) && (
        <div className="mt-2 pt-2 border-t border-zinc-800 space-y-0.5">
          {game.pitcher && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-zinc-600 font-medium shrink-0">P</span>
              <span className="text-zinc-400 truncate">{lastName(game.pitcher.name)}</span>
            </div>
          )}
          {game.batter && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-zinc-600 font-medium shrink-0">AB</span>
              <span className="text-zinc-400 truncate">{lastName(game.batter.name)}</span>
            </div>
          )}
        </div>
      )}

      {/* Preview: probable pitchers */}
      {isPreview && (game.probableAway || game.probableHome) && (
        <div className="mt-2 pt-2 border-t border-zinc-800 space-y-0.5">
          {game.probableAway && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-zinc-600 font-medium">{game.away.abbrev}</span>
              <span className="text-zinc-400 truncate">{lastName(game.probableAway.name)}</span>
            </div>
          )}
          {game.probableHome && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-zinc-600 font-medium">{game.home.abbrev}</span>
              <span className="text-zinc-400 truncate">{lastName(game.probableHome.name)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function WBCBoxScorePanel({ box, side, setSide }: { box: BoxScore; side: 'away' | 'home'; setSide: (s: 'away' | 'home') => void }) {
  const team = side === 'away' ? box.away : box.home

  const minInnings = 9
  const inningCount = Math.max(minInnings, box.innings.length)
  const displayInnings = Array.from({ length: inningCount }, (_, i) => {
    const num = i + 1
    const existing = box.innings.find(inn => inn.num === num)
    return existing || { num, ordinal: String(num), away: { runs: null }, home: { runs: null } }
  })
  const lastPlayedInning = box.innings.length

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Line Score */}
      <div className="overflow-x-auto border-b border-zinc-800">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="text-zinc-500 bg-zinc-800/50">
              <th className="text-left px-3 py-2 w-20"></th>
              {displayInnings.map(inn => (
                <th key={inn.num} className="text-center px-2 py-2 min-w-[24px]">{inn.num}</th>
              ))}
              <th className="text-center px-3 py-2 font-bold">R</th>
              <th className="text-center px-3 py-2 font-bold">H</th>
              <th className="text-center px-3 py-2 font-bold">E</th>
            </tr>
          </thead>
          <tbody>
            {(['away', 'home'] as const).map(s => {
              const t = s === 'away' ? box.away : box.home
              const tot = box.totals[s]
              return (
                <tr key={s} className="border-t border-zinc-800/30">
                  <td className="px-3 py-1.5 flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                      style={{ backgroundColor: WBC_TEAM_COLORS[t.team.abbrev] || '#52525b' }}>{t.team.abbrev.slice(0, 3)}</div>
                    <span className="text-white font-medium text-[11px]">{t.team.abbrev}</span>
                  </td>
                  {displayInnings.map(inn => {
                    const runs = s === 'away' ? inn.away.runs : inn.home.runs
                    const played = inn.num <= lastPlayedInning
                    return (
                      <td key={inn.num} className={`text-center px-2 py-1.5 ${played ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        {runs !== null ? runs : played ? 0 : ''}
                      </td>
                    )
                  })}
                  <td className="text-center px-3 py-1.5 text-white font-bold">{tot.runs}</td>
                  <td className="text-center px-3 py-1.5 text-zinc-300">{tot.hits}</td>
                  <td className="text-center px-3 py-1.5 text-zinc-300">{tot.errors}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Team toggle */}
      <div className="flex justify-center gap-1 px-4 pt-3 pb-2">
        {(['away', 'home'] as const).map(s => {
          const t = s === 'away' ? box.away : box.home
          return (
            <button key={s} onClick={() => setSide(s)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition flex items-center gap-1.5 ${
                side === s ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}>
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                style={{ backgroundColor: WBC_TEAM_COLORS[t.team.abbrev] || '#52525b' }}>{t.team.abbrev.slice(0, 3)}</div>
              {t.team.name}
            </button>
          )
        })}
      </div>

      {/* Batting table */}
      <div className="px-4 pb-3">
        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Batting</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-zinc-500 font-medium">
                <th className="text-left px-2 py-1.5">Player</th>
                <th className="text-right px-2 py-1.5">AB</th>
                <th className="text-right px-2 py-1.5">R</th>
                <th className="text-right px-2 py-1.5">H</th>
                <th className="text-right px-2 py-1.5">RBI</th>
                <th className="text-right px-2 py-1.5">BB</th>
                <th className="text-right px-2 py-1.5">SO</th>
                <th className="text-right px-2 py-1.5 hidden md:table-cell">HR</th>
                <th className="text-right px-2 py-1.5 hidden md:table-cell">AVG</th>
                <th className="text-right px-2 py-1.5 hidden lg:table-cell">OBP</th>
                <th className="text-right px-2 py-1.5 hidden lg:table-cell">SLG</th>
              </tr>
            </thead>
            <tbody>
              {team.batters.map((b) => (
                <tr key={b.id} className="border-t border-zinc-800/30 hover:bg-zinc-800/20 transition">
                  <td className="px-2 py-1.5 text-white font-medium whitespace-nowrap">
                    <span className="text-zinc-500 mr-1.5">{b.pos}</span>{b.boxName || b.name}
                  </td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{b.ab}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{b.r}</td>
                  <td className="text-right px-2 py-1.5 text-white font-mono font-medium">{b.h}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{b.rbi}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{b.bb}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{b.so}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono hidden md:table-cell">{b.hr}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-400 font-mono hidden md:table-cell">{b.avg}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-400 font-mono hidden lg:table-cell">{b.obp}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-400 font-mono hidden lg:table-cell">{b.slg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pitching table */}
      <div className="px-4 pb-4">
        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Pitching</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-zinc-500 font-medium">
                <th className="text-left px-2 py-1.5">Pitcher</th>
                <th className="text-right px-2 py-1.5">IP</th>
                <th className="text-right px-2 py-1.5">H</th>
                <th className="text-right px-2 py-1.5">R</th>
                <th className="text-right px-2 py-1.5">ER</th>
                <th className="text-right px-2 py-1.5">BB</th>
                <th className="text-right px-2 py-1.5">SO</th>
                <th className="text-right px-2 py-1.5 hidden md:table-cell">HR</th>
                <th className="text-right px-2 py-1.5 hidden md:table-cell">P-S</th>
                <th className="text-right px-2 py-1.5 hidden lg:table-cell">ERA</th>
              </tr>
            </thead>
            <tbody>
              {team.pitchers.map(p => (
                <tr key={p.id} className="border-t border-zinc-800/30 hover:bg-zinc-800/20 transition">
                  <td className="px-2 py-1.5 text-white font-medium whitespace-nowrap">{p.boxName || p.name}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{p.ip}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{p.h}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{p.r}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{p.er}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono">{p.bb}</td>
                  <td className="text-right px-2 py-1.5 text-white font-mono font-medium">{p.so}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-300 font-mono hidden md:table-cell">{p.hr}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-400 font-mono hidden md:table-cell">{p.pitches}-{p.strikes}</td>
                  <td className="text-right px-2 py-1.5 text-zinc-400 font-mono hidden lg:table-cell">{p.era}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
