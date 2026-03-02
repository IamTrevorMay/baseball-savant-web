'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ResearchNav from '@/components/ResearchNav'
import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

interface UmpireSummary {
  games: number
  first_date: string
  last_date: string
  called_pitches: number
  correct_calls: number
  true_accuracy: number
  real_called_pitches: number
  real_correct_calls: number
  real_accuracy: number
  called_strikes: number
  called_balls: number
  true_strikes: number
  true_balls: number
  incorrect_strikes: number
  incorrect_balls: number
}

interface GameRow {
  game_pk: number
  game_date: string
  home_team: string
  away_team: string
  called: number
  correct: number
  true_accuracy: number
  real_called: number
  real_correct: number
  real_accuracy: number
}

interface MissedCall {
  plate_x: number
  plate_z: number
  type: string
}

interface ZoneCell {
  zone_cell: string
  total: number
  correct: number
}

function accColor(pct: number): string {
  if (pct >= 92) return 'text-emerald-400'
  if (pct >= 89) return 'text-yellow-400'
  return 'text-red-400'
}

function realAccColor(pct: number): string {
  if (pct >= 97) return 'text-emerald-400'
  if (pct >= 95) return 'text-yellow-400'
  return 'text-red-400'
}

type GameSortField = 'game_date' | 'true_accuracy' | 'real_accuracy' | 'called'

export default function UmpireScorecardPage() {
  const params = useParams()
  const router = useRouter()
  const umpireName = decodeURIComponent(params.name as string)

  const [summary, setSummary] = useState<UmpireSummary | null>(null)
  const [missedCalls, setMissedCalls] = useState<MissedCall[]>([])
  const [zoneGrid, setZoneGrid] = useState<ZoneCell[]>([])
  const [games, setGames] = useState<GameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [seasons, setSeasons] = useState<number[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [gameSortField, setGameSortField] = useState<GameSortField>('game_date')
  const [gameSortDir, setGameSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => { loadData() }, [umpireName, selectedSeason])

  async function loadData() {
    setLoading(true)
    try {
      const res = await fetch('/api/umpire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scorecard', name: umpireName, season: selectedSeason }),
      })
      if (!res.ok) {
        console.error('Scorecard error:', await res.text())
        setLoading(false)
        return
      }
      const data = await res.json()

      if (data.summary) {
        const s = data.summary
        const cp = Number(s.called_pitches)
        const cc = Number(s.correct_calls)
        const rcp = Number(s.real_called_pitches)
        const rcc = Number(s.real_correct_calls)
        setSummary({
          games: Number(s.games),
          first_date: s.first_date,
          last_date: s.last_date,
          called_pitches: cp,
          correct_calls: cc,
          true_accuracy: cp > 0 ? (cc / cp) * 100 : 0,
          real_called_pitches: rcp,
          real_correct_calls: rcc,
          real_accuracy: rcp > 0 ? (rcc / rcp) * 100 : 0,
          called_strikes: Number(s.called_strikes),
          called_balls: Number(s.called_balls),
          true_strikes: Number(s.true_strikes),
          true_balls: cp - Number(s.true_strikes),
          incorrect_strikes: Number(s.incorrect_strikes),
          incorrect_balls: Number(s.incorrect_balls),
        })
      } else {
        setSummary(null)
      }

      setMissedCalls(data.missedCalls || [])
      setZoneGrid(data.zoneGrid || [])
      setSeasons(data.seasons || [])

      const gameRows: GameRow[] = (data.gameLog || []).map((g: any) => {
        const called = Number(g.called)
        const correct = Number(g.correct)
        const realCalled = Number(g.real_called)
        const realCorrect = Number(g.real_correct)
        return {
          game_pk: Number(g.game_pk),
          game_date: g.game_date,
          home_team: g.home_team,
          away_team: g.away_team,
          called,
          correct,
          true_accuracy: called > 0 ? (correct / called) * 100 : 0,
          real_called: realCalled,
          real_correct: realCorrect,
          real_accuracy: realCalled > 0 ? (realCorrect / realCalled) * 100 : 0,
        }
      })
      setGames(gameRows)
    } catch (err) {
      console.error('Failed to load scorecard:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch(value: string) {
    setSearchQuery(value)
    if (!value.trim()) { setSearchResults([]); return }
    try {
      const res = await fetch('/api/umpire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query: value }),
      })
      const data = res.ok ? await res.json() : []
      setSearchResults(data)
      setShowSearch(true)
    } catch { setSearchResults([]) }
  }

  const incorrectStrikes = missedCalls.filter(p => p.type === 'S')
  const incorrectBalls = missedCalls.filter(p => p.type === 'B')

  function handleGameSort(field: GameSortField) {
    if (gameSortField === field) {
      setGameSortDir(prev => prev === 'desc' ? 'asc' : 'desc')
    } else {
      setGameSortField(field)
      setGameSortDir(field === 'game_date' ? 'desc' : 'desc')
    }
  }

  const sortedGames = [...games].sort((a, b) => {
    const mul = gameSortDir === 'desc' ? -1 : 1
    if (gameSortField === 'game_date') return a.game_date.localeCompare(b.game_date) * mul
    return (a[gameSortField] - b[gameSortField]) * mul
  })

  const sortArrow = (field: string) => {
    if (gameSortField !== field) return ''
    return gameSortDir === 'desc' ? ' \u25BC' : ' \u25B2'
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-500 text-sm">Loading umpire scorecard...</p>
        <p className="text-zinc-600 text-xs mt-1">Analyzing called pitches for {umpireName}</p>
      </div>
    </div>
  )

  if (!summary) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">No data found for umpire: {umpireName}</p>
    </div>
  )

  const szTop = 3.5, szBot = 1.5, szLeft = -0.83, szRight = 0.83

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      <ResearchNav active="/umpire">
        <div className="relative ml-4 hidden sm:block">
          <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
            onFocus={() => searchQuery && setShowSearch(true)}
            placeholder="Search umpire..."
            className="w-64 pl-3 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl z-50">
              {searchResults.map((u: any) => (
                <div key={u.hp_umpire} onClick={() => { router.push(`/umpire/${encodeURIComponent(u.hp_umpire)}`); setShowSearch(false); setSearchQuery('') }}
                  className="px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer flex justify-between">
                  <span className="text-white">{u.hp_umpire}</span>
                  <span className="text-zinc-500 text-xs">{u.games} games</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ResearchNav>

      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center text-lg font-bold text-white">HP</div>
            <div>
              <h1 className="text-2xl font-bold text-white">{umpireName}</h1>
              <div className="flex gap-4 text-sm text-zinc-400 mt-1">
                <span>{summary.games} games</span>
                <span>{summary.called_pitches.toLocaleString()} called pitches</span>
                <span>{summary.first_date} — {summary.last_date}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Season selector */}
            {seasons.length > 0 && (
              <select value={selectedSeason ?? ''} onChange={e => setSelectedSeason(e.target.value ? Number(e.target.value) : null)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-emerald-600 focus:outline-none">
                <option value="">All Seasons</option>
                {seasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <div className="text-right">
              <div className={`text-2xl font-bold tabular-nums ${accColor(summary.true_accuracy)}`}>
                {summary.true_accuracy.toFixed(1)}%
              </div>
              <div className="text-[10px] text-zinc-500">True Accuracy</div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold tabular-nums ${realAccColor(summary.real_accuracy)}`}>
                {summary.real_accuracy.toFixed(1)}%
              </div>
              <div className="text-[10px] text-zinc-500">Real Accuracy</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: 'True Accuracy', value: `${summary.true_accuracy.toFixed(1)}%`, color: accColor(summary.true_accuracy) },
              { label: 'Real Accuracy', value: `${summary.real_accuracy.toFixed(1)}%`, color: realAccColor(summary.real_accuracy) },
              { label: 'Called Pitches', value: summary.called_pitches.toLocaleString(), color: 'text-white' },
              { label: 'Shadow Pitches', value: (summary.called_pitches - summary.real_called_pitches).toLocaleString(), color: 'text-zinc-400' },
              { label: 'Correct Calls', value: summary.correct_calls.toLocaleString(), color: 'text-emerald-400' },
              { label: 'Missed Calls', value: (summary.called_pitches - summary.correct_calls).toLocaleString(), color: 'text-red-400' },
              { label: 'Bad Strikes', value: summary.incorrect_strikes.toLocaleString(), color: 'text-orange-400' },
              { label: 'Bad Balls', value: summary.incorrect_balls.toLocaleString(), color: 'text-sky-400' },
            ].map(c => (
              <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{c.label}</div>
                <div className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Visualizations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Missed Calls Strike Zone */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Missed Calls — Strike Zone View</h3>
              <Plot
                data={[
                  {
                    x: incorrectStrikes.map(p => p.plate_x),
                    y: incorrectStrikes.map(p => p.plate_z),
                    mode: 'markers', type: 'scatter',
                    name: 'Called Strike (ball)',
                    marker: { color: '#f97316', size: 5, opacity: 0.6 },
                  },
                  {
                    x: incorrectBalls.map(p => p.plate_x),
                    y: incorrectBalls.map(p => p.plate_z),
                    mode: 'markers', type: 'scatter',
                    name: 'Called Ball (strike)',
                    marker: { color: '#38bdf8', size: 5, opacity: 0.6 },
                  },
                ]}
                layout={{
                  width: 450, height: 500,
                  paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                  font: { color: '#a1a1aa', size: 10 },
                  xaxis: { title: 'Plate X (ft)', range: [-2.5, 2.5], zeroline: false, gridcolor: '#27272a' },
                  yaxis: { title: 'Plate Z (ft)', range: [0, 5], zeroline: false, gridcolor: '#27272a' },
                  legend: { orientation: 'h', y: -0.15, font: { size: 10 } },
                  margin: { t: 10, b: 60, l: 50, r: 20 },
                  shapes: [
                    // Hard zone
                    { type: 'rect', x0: szLeft, x1: szRight, y0: szBot, y1: szTop, line: { color: '#52525b', width: 2 } },
                    // Shadow zone (1" buffer)
                    { type: 'rect', x0: -0.913, x1: 0.913, y0: szBot - 0.083, y1: szTop + 0.083, line: { color: '#3f3f46', width: 1, dash: 'dot' } },
                  ],
                }}
                config={{ displayModeBar: false }}
              />
            </div>

            {/* Accuracy by Zone */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Accuracy by Zone</h3>
              <ZoneAccuracyGrid zoneData={zoneGrid} />
            </div>
          </div>

          {/* Accuracy Trend */}
          {games.length > 1 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Accuracy Trend (Game by Game)</h3>
              <Plot
                data={[
                  {
                    x: [...games].reverse().map(g => g.game_date),
                    y: [...games].reverse().map(g => g.true_accuracy),
                    type: 'scatter', mode: 'lines+markers',
                    name: 'True Accuracy',
                    line: { color: '#10b981', width: 1.5 },
                    marker: { size: 3, color: '#10b981' },
                  },
                  {
                    x: [...games].reverse().map(g => g.game_date),
                    y: [...games].reverse().map(g => g.real_accuracy),
                    type: 'scatter', mode: 'lines+markers',
                    name: 'Real Accuracy',
                    line: { color: '#8b5cf6', width: 1.5 },
                    marker: { size: 3, color: '#8b5cf6' },
                  },
                ]}
                layout={{
                  width: undefined, height: 250,
                  paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                  font: { color: '#a1a1aa', size: 10 },
                  xaxis: { gridcolor: '#27272a' },
                  yaxis: { title: 'Accuracy %', range: [80, 100], gridcolor: '#27272a' },
                  margin: { t: 10, b: 40, l: 50, r: 20 },
                  legend: { orientation: 'h', y: 1.1, font: { size: 10 } },
                  shapes: [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 92, y1: 92, line: { color: '#52525b', dash: 'dot', width: 1 } }],
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {/* Game Log Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left cursor-pointer hover:text-zinc-300" onClick={() => handleGameSort('game_date')}>
                    Date{sortArrow('game_date')}
                  </th>
                  <th className="px-4 py-2 text-left">Matchup</th>
                  <th className="px-4 py-2 text-right cursor-pointer hover:text-zinc-300" onClick={() => handleGameSort('called')}>
                    Called{sortArrow('called')}
                  </th>
                  <th className="px-4 py-2 text-right">Correct</th>
                  <th className="px-4 py-2 text-right">Missed</th>
                  <th className="px-4 py-2 text-right cursor-pointer hover:text-zinc-300" onClick={() => handleGameSort('true_accuracy')}>
                    True Acc{sortArrow('true_accuracy')}
                  </th>
                  <th className="px-4 py-2 text-right cursor-pointer hover:text-zinc-300" onClick={() => handleGameSort('real_accuracy')}>
                    Real Acc{sortArrow('real_accuracy')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedGames.map(g => (
                  <tr key={g.game_pk} className="border-t border-zinc-800/50 hover:bg-zinc-800/30 transition">
                    <td className="px-4 py-2 text-sm font-mono text-white">{g.game_date}</td>
                    <td className="px-4 py-2 text-sm text-zinc-400">{g.away_team} @ {g.home_team}</td>
                    <td className="px-4 py-2 text-sm text-right text-zinc-400 tabular-nums">{g.called}</td>
                    <td className="px-4 py-2 text-sm text-right text-emerald-400 tabular-nums">{g.correct}</td>
                    <td className="px-4 py-2 text-sm text-right text-red-400 tabular-nums">{g.called - g.correct}</td>
                    <td className={`px-4 py-2 text-sm text-right font-mono tabular-nums ${accColor(g.true_accuracy)}`}>
                      {g.true_accuracy.toFixed(1)}%
                    </td>
                    <td className={`px-4 py-2 text-sm text-right font-mono tabular-nums ${realAccColor(g.real_accuracy)}`}>
                      {g.real_accuracy.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="text-[11px] text-zinc-600 space-y-1 px-1">
            <p><span className="text-zinc-400 font-medium">True Accuracy</span> — correct calls / all called pitches (hard zone boundaries, no buffer)</p>
            <p><span className="text-zinc-400 font-medium">Real Accuracy</span> — correct calls / non-shadow pitches (excludes pitches within 1&quot; of zone edge)</p>
            <p><span className="text-zinc-400 font-medium">Shadow Zone</span> — the 1&quot; band around the zone boundary where calls are genuinely borderline</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ZoneAccuracyGrid({ zoneData }: { zoneData: ZoneCell[] }) {
  const cellMap: Record<string, { total: number; correct: number }> = {}
  for (const z of zoneData) {
    cellMap[z.zone_cell] = { total: Number(z.total), correct: Number(z.correct) }
  }

  const grid = [
    [cellMap['r0c0'] || { total: 0, correct: 0 }, cellMap['r0c1'] || { total: 0, correct: 0 }, cellMap['r0c2'] || { total: 0, correct: 0 }],
    [cellMap['r1c0'] || { total: 0, correct: 0 }, cellMap['r1c1'] || { total: 0, correct: 0 }, cellMap['r1c2'] || { total: 0, correct: 0 }],
    [cellMap['r2c0'] || { total: 0, correct: 0 }, cellMap['r2c1'] || { total: 0, correct: 0 }, cellMap['r2c2'] || { total: 0, correct: 0 }],
  ]
  const outside = cellMap['outside'] || { total: 0, correct: 0 }

  const pct = (cell: { total: number; correct: number }) =>
    cell.total > 0 ? ((cell.correct / cell.total) * 100).toFixed(1) : '—'

  const cellColor = (cell: { total: number; correct: number }) => {
    if (cell.total === 0) return 'bg-zinc-800'
    const acc = (cell.correct / cell.total) * 100
    if (acc >= 95) return 'bg-emerald-900/50'
    if (acc >= 90) return 'bg-emerald-900/30'
    if (acc >= 85) return 'bg-yellow-900/30'
    return 'bg-red-900/30'
  }

  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <div className="grid grid-cols-3 gap-1" style={{ width: 240 }}>
        {grid.map((row, ri) =>
          row.map((cell, ci) => (
            <div key={`${ri}-${ci}`}
              className={`aspect-square flex flex-col items-center justify-center rounded ${cellColor(cell)} border border-zinc-700/50`}>
              <span className={`text-lg font-bold tabular-nums ${cell.total > 0 ? ((cell.correct / cell.total) * 100 >= 90 ? 'text-emerald-400' : 'text-yellow-400') : 'text-zinc-600'}`}>
                {pct(cell)}%
              </span>
              <span className="text-[9px] text-zinc-500">{cell.total}</span>
            </div>
          ))
        )}
      </div>
      <div className="text-center text-[11px] text-zinc-500">
        Outside zone: {outside.total > 0 ? `${((outside.correct / outside.total) * 100).toFixed(1)}%` : '—'} ({outside.total.toLocaleString()} pitches)
      </div>
    </div>
  )
}
