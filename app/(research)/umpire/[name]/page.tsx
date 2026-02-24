'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

interface UmpireSummary {
  games: number
  first_date: string
  last_date: string
  called_pitches: number
  correct_calls: number
  accuracy: number
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
  accuracy: number
}

export default function UmpireScorecardPage() {
  const params = useParams()
  const router = useRouter()
  const umpireName = decodeURIComponent(params.name as string)

  const [summary, setSummary] = useState<UmpireSummary | null>(null)
  const [pitchData, setPitchData] = useState<any[]>([])
  const [games, setGames] = useState<GameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => { loadData() }, [umpireName])

  async function loadData() {
    setLoading(true)

    // Get game pks for this umpire
    const { data: umpGames } = await supabase
      .from('game_umpires')
      .select('game_pk, game_date, home_team, away_team')
      .eq('hp_umpire', umpireName)
      .order('game_date', { ascending: false })

    if (!umpGames || umpGames.length === 0) {
      setLoading(false)
      return
    }

    const gamePks = umpGames.map(g => g.game_pk)

    // Fetch called pitches (B and S only) for these games
    // Limit to most recent 200 games for performance
    const recentPks = gamePks.slice(0, 200)
    let allPitches: any[] = []
    const pageSize = 1000
    for (let i = 0; i < recentPks.length; i += 50) {
      const batch = recentPks.slice(i, i + 50)
      let from = 0
      while (true) {
        const { data: rows } = await supabase
          .from('pitches')
          .select('game_pk,game_date,plate_x,plate_z,sz_top,sz_bot,type,home_team,away_team,stand')
          .in('game_pk', batch)
          .in('type', ['B', 'S'])
          .not('plate_x', 'is', null)
          .not('sz_top', 'is', null)
          .range(from, from + pageSize - 1)
        if (!rows || rows.length === 0) break
        allPitches = allPitches.concat(rows)
        if (rows.length < pageSize) break
        from += pageSize
      }
    }

    // Classify each pitch
    allPitches.forEach(p => {
      const inZone = Math.abs(p.plate_x) <= 0.83 && p.plate_z >= p.sz_bot && p.plate_z <= p.sz_top
      p.true_strike = inZone
      p.correct = (inZone && p.type === 'S') || (!inZone && p.type === 'B')
    })

    setPitchData(allPitches)

    // Summary stats
    const calledStrikes = allPitches.filter(p => p.type === 'S').length
    const calledBalls = allPitches.filter(p => p.type === 'B').length
    const trueStrikes = allPitches.filter(p => p.true_strike).length
    const trueBalls = allPitches.length - trueStrikes
    const correctCalls = allPitches.filter(p => p.correct).length
    const incorrectStrikes = allPitches.filter(p => p.type === 'S' && !p.true_strike).length
    const incorrectBalls = allPitches.filter(p => p.type === 'B' && p.true_strike).length

    setSummary({
      games: umpGames.length,
      first_date: umpGames[umpGames.length - 1].game_date,
      last_date: umpGames[0].game_date,
      called_pitches: allPitches.length,
      correct_calls: correctCalls,
      accuracy: allPitches.length > 0 ? (correctCalls / allPitches.length) * 100 : 0,
      called_strikes: calledStrikes,
      called_balls: calledBalls,
      true_strikes: trueStrikes,
      true_balls: trueBalls,
      incorrect_strikes: incorrectStrikes,
      incorrect_balls: incorrectBalls,
    })

    // Per-game breakdown
    const gameMap: Record<number, { date: string; home: string; away: string; called: number; correct: number }> = {}
    allPitches.forEach(p => {
      if (!gameMap[p.game_pk]) {
        gameMap[p.game_pk] = { date: p.game_date, home: p.home_team, away: p.away_team, called: 0, correct: 0 }
      }
      gameMap[p.game_pk].called++
      if (p.correct) gameMap[p.game_pk].correct++
    })
    const gameRows = Object.entries(gameMap).map(([pk, g]) => ({
      game_pk: Number(pk),
      game_date: g.date,
      home_team: g.home,
      away_team: g.away,
      called: g.called,
      correct: g.correct,
      accuracy: g.called > 0 ? (g.correct / g.called) * 100 : 0,
    })).sort((a, b) => b.game_date.localeCompare(a.game_date))
    setGames(gameRows)

    setLoading(false)
  }

  async function handleSearch(value: string) {
    setSearchQuery(value)
    if (!value.trim()) { setSearchResults([]); return }
    const { data } = await supabase.rpc('run_query', {
      query_text: `SELECT hp_umpire, COUNT(DISTINCT game_pk) as games FROM game_umpires WHERE LOWER(hp_umpire) LIKE '%${value.trim().toLowerCase().replace(/'/g, "''")}%' GROUP BY hp_umpire ORDER BY games DESC LIMIT 6`
    })
    setSearchResults(data || [])
    setShowSearch(true)
  }

  // Missed calls for visualization
  const missedCalls = useMemo(() => pitchData.filter(p => !p.correct), [pitchData])
  const incorrectStrikes = useMemo(() => missedCalls.filter(p => p.type === 'S'), [missedCalls])
  const incorrectBalls = useMemo(() => missedCalls.filter(p => p.type === 'B'), [missedCalls])

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

  const szTop = 3.5
  const szBot = 1.5
  const szLeft = -0.83
  const szRight = 0.83

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      {/* Nav */}
      <nav className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <a href="/" className="font-[family-name:var(--font-bebas)] text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wider transition">TRITON APEX</a>
          <a href="/home" className="font-[family-name:var(--font-bebas)] text-emerald-400 tracking-wide text-sm hover:text-emerald-300 transition">Research</a>
          <div className="relative">
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
        </div>
        <div className="flex gap-4"><a href="/home" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Home</a><a href="/pitchers" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Pitchers</a><a href="/hitters" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Hitters</a><a href="/reports" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Reports</a><a href="/umpire" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Umpires</a><a href="/explore" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Explorer</a><a href="/analyst" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Analyst</a></div>
      </nav>

      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center text-lg font-bold text-white">
              HP
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{umpireName}</h1>
              <div className="flex gap-4 text-sm text-zinc-400 mt-1">
                <span>{summary.games} games</span>
                <span>{summary.called_pitches.toLocaleString()} called pitches</span>
                <span>{summary.first_date} — {summary.last_date}</span>
              </div>
            </div>
          </div>
          <div className={`text-3xl font-bold tabular-nums ${summary.accuracy >= 92 ? 'text-emerald-400' : summary.accuracy >= 89 ? 'text-yellow-400' : 'text-red-400'}`}>
            {summary.accuracy.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'Accuracy', value: `${summary.accuracy.toFixed(1)}%`, color: summary.accuracy >= 92 ? 'text-emerald-400' : summary.accuracy >= 89 ? 'text-yellow-400' : 'text-red-400' },
              { label: 'Called Pitches', value: summary.called_pitches.toLocaleString(), color: 'text-white' },
              { label: 'Correct Calls', value: summary.correct_calls.toLocaleString(), color: 'text-emerald-400' },
              { label: 'Missed Calls', value: (summary.called_pitches - summary.correct_calls).toLocaleString(), color: 'text-red-400' },
              { label: 'Bad Strikes', value: summary.incorrect_strikes.toLocaleString(), color: 'text-orange-400' },
              { label: 'Bad Balls', value: summary.incorrect_balls.toLocaleString(), color: 'text-sky-400' },
            ].map(c => (
              <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{c.label}</div>
                <div className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</div>
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
                    mode: 'markers',
                    type: 'scatter',
                    name: 'Called Strike (ball)',
                    marker: { color: '#f97316', size: 5, opacity: 0.6 },
                  },
                  {
                    x: incorrectBalls.map(p => p.plate_x),
                    y: incorrectBalls.map(p => p.plate_z),
                    mode: 'markers',
                    type: 'scatter',
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
                  shapes: [{
                    type: 'rect', x0: szLeft, x1: szRight, y0: szBot, y1: szTop,
                    line: { color: '#52525b', width: 2 },
                  }],
                }}
                config={{ displayModeBar: false }}
              />
            </div>

            {/* Accuracy by Zone (3x3 grid) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Accuracy by Zone</h3>
              <ZoneAccuracyGrid pitches={pitchData} />
            </div>
          </div>

          {/* Game-by-Game Accuracy Trend */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">Accuracy Trend (Game by Game)</h3>
            <Plot
              data={[{
                x: [...games].reverse().map(g => g.game_date),
                y: [...games].reverse().map(g => g.accuracy),
                type: 'scatter',
                mode: 'lines+markers',
                line: { color: '#10b981', width: 1.5 },
                marker: { size: 4, color: [...games].reverse().map(g => g.accuracy >= 92 ? '#10b981' : g.accuracy >= 89 ? '#eab308' : '#ef4444') },
              }]}
              layout={{
                width: undefined, height: 250,
                paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
                font: { color: '#a1a1aa', size: 10 },
                xaxis: { gridcolor: '#27272a' },
                yaxis: { title: 'Accuracy %', range: [80, 100], gridcolor: '#27272a' },
                margin: { t: 10, b: 40, l: 50, r: 20 },
                shapes: [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 92, y1: 92, line: { color: '#52525b', dash: 'dot', width: 1 } }],
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%' }}
            />
          </div>

          {/* Game Log Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Matchup</th>
                  <th className="px-4 py-2 text-right">Called</th>
                  <th className="px-4 py-2 text-right">Correct</th>
                  <th className="px-4 py-2 text-right">Missed</th>
                  <th className="px-4 py-2 text-right">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {games.slice(0, 50).map(g => (
                  <tr key={g.game_pk} className="border-t border-zinc-800/50 hover:bg-zinc-800/30 transition">
                    <td className="px-4 py-2 text-sm font-mono text-white">{g.game_date}</td>
                    <td className="px-4 py-2 text-sm text-zinc-400">{g.away_team} @ {g.home_team}</td>
                    <td className="px-4 py-2 text-sm text-right text-zinc-400 tabular-nums">{g.called}</td>
                    <td className="px-4 py-2 text-sm text-right text-emerald-400 tabular-nums">{g.correct}</td>
                    <td className="px-4 py-2 text-sm text-right text-red-400 tabular-nums">{g.called - g.correct}</td>
                    <td className={`px-4 py-2 text-sm text-right font-mono tabular-nums ${g.accuracy >= 92 ? 'text-emerald-400' : g.accuracy >= 89 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {g.accuracy.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function ZoneAccuracyGrid({ pitches }: { pitches: any[] }) {
  // Divide into 3x3 grid based on plate_x and plate_z
  // Zone cols: left (-0.83 to -0.28), middle (-0.28 to 0.28), right (0.28 to 0.83)
  // Zone rows: top (3.0 to 3.5), middle (2.25 to 3.0), bottom (1.5 to 2.25)
  // Plus outside zones
  const xEdges = [-0.83, -0.28, 0.28, 0.83]
  const zEdges = [1.5, 2.17, 2.83, 3.5]

  const grid: { total: number; correct: number }[][] = Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => ({ total: 0, correct: 0 }))
  )

  let outsideTotal = 0, outsideCorrect = 0

  pitches.forEach(p => {
    const col = p.plate_x < xEdges[1] ? 0 : p.plate_x < xEdges[2] ? 1 : p.plate_x <= xEdges[3] ? 2 : -1
    const row = p.plate_z < zEdges[1] ? 2 : p.plate_z < zEdges[2] ? 1 : p.plate_z <= zEdges[3] ? 0 : -1

    if (col >= 0 && row >= 0 && p.plate_x >= xEdges[0] && p.plate_z >= zEdges[0]) {
      grid[row][col].total++
      if (p.correct) grid[row][col].correct++
    } else {
      outsideTotal++
      if (p.correct) outsideCorrect++
    }
  })

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
        Outside zone: {outsideTotal > 0 ? `${((outsideCorrect / outsideTotal) * 100).toFixed(1)}%` : '—'} ({outsideTotal.toLocaleString()} pitches)
      </div>
    </div>
  )
}
