'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import ResearchNav from '@/components/ResearchNav'

interface UmpireResult {
  hp_umpire: string
  games: number
  first_date: string
  last_date: string
  called_pitches: number
  correct_calls: number
  true_accuracy: number
  real_called_pitches: number
  real_correct_calls: number
  real_accuracy: number
}

interface UmpireSearchHit {
  hp_umpire: string
  games: number
}

function accuracyColor(pct: number): string {
  if (pct >= 92) return 'text-emerald-400'
  if (pct >= 89) return 'text-yellow-400'
  return 'text-red-400'
}

function realAccuracyColor(pct: number): string {
  if (pct >= 97) return 'text-emerald-400'
  if (pct >= 95) return 'text-yellow-400'
  return 'text-red-400'
}

type SortField = 'games' | 'true_accuracy' | 'real_accuracy' | 'called_pitches'

export default function UmpirePage() {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UmpireSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [leaderboard, setLeaderboard] = useState<UmpireResult[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('games')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [seasons, setSeasons] = useState<number[]>([])
  const [selectedSeason, setSelectedSeason] = useState<number | null>(new Date().getFullYear())
  const [gameType, setGameType] = useState<string | null>(null)
  const router = useRouter()
  const debounceRef = useRef<NodeJS.Timeout>(null)

  useEffect(() => { loadSeasons() }, [])
  useEffect(() => { loadLeaderboard() }, [selectedSeason, gameType])

  async function loadSeasons() {
    try {
      const res = await fetch('/api/umpire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seasons' }),
      })
      if (res.ok) {
        const data = await res.json()
        setSeasons(data)
      }
    } catch {}
  }

  async function loadLeaderboard() {
    setLeaderboardLoading(true)
    try {
      const res = await fetch('/api/umpire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'leaderboard', season: selectedSeason, gameType }),
      })
      if (!res.ok) {
        console.error('Leaderboard query error:', await res.text())
        return
      }
      const data = await res.json()
      if (data) {
        const parsed: UmpireResult[] = data.map((row: Record<string, unknown>) => {
          const cp = Number(row.called_pitches)
          const cc = Number(row.correct_calls)
          const rcp = Number(row.real_called_pitches)
          const rcc = Number(row.real_correct_calls)
          return {
            hp_umpire: row.hp_umpire as string,
            games: Number(row.games),
            first_date: row.first_date as string,
            last_date: row.last_date as string,
            called_pitches: cp,
            correct_calls: cc,
            true_accuracy: cp > 0 ? (cc / cp) * 100 : 0,
            real_called_pitches: rcp,
            real_correct_calls: rcc,
            real_accuracy: rcp > 0 ? (rcc / rcp) * 100 : 0,
          }
        })
        setLeaderboard(parsed)
      }
    } catch (err) {
      console.error('Failed to load leaderboard:', err)
    } finally {
      setLeaderboardLoading(false)
    }
  }

  function handleSearch(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setSearchResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/umpire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'search', query: value }),
        })
        const data = res.ok ? await res.json() : null
        if (data) {
          setSearchResults(data.map((row: Record<string, unknown>) => ({
            hp_umpire: row.hp_umpire as string,
            games: Number(row.games),
          })))
        }
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setLoading(false)
      }
    }, 250)
  }

  function goToUmpire(name: string) {
    router.push(`/umpire/${encodeURIComponent(name)}`)
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortedLeaderboard = [...leaderboard].sort((a, b) => {
    const mul = sortDir === 'desc' ? -1 : 1
    return (a[sortField] - b[sortField]) * mul
  })

  const sortArrow = (field: string) => {
    if (sortField !== field) return ''
    return sortDir === 'desc' ? ' \u25BC' : ' \u25B2'
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/umpire" />

      {/* Hero */}
      <div className="flex flex-col items-center justify-center pt-24 pb-16 px-4">
        <h1 className="text-4xl font-bold text-white mb-2">Umpire Scorecards</h1>
        <p className="text-zinc-500 mb-10 text-sm">Search any home plate umpire to view their accuracy scorecard</p>

        {/* Search */}
        <div className="w-full max-w-xl relative">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={query} onChange={e => handleSearch(e.target.value)}
              placeholder="Search for an umpire..."
              autoFocus
              className="w-full pl-12 pr-4 py-4 bg-zinc-900 border border-zinc-700 rounded-xl text-white text-lg placeholder-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600/50 transition"
            />
            {loading && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />}
          </div>

          {searchResults.length > 0 && query && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl z-50">
              {searchResults.map(u => (
                <div key={u.hp_umpire} onClick={() => goToUmpire(u.hp_umpire)}
                  className="px-4 py-3 flex items-center justify-between hover:bg-zinc-800 cursor-pointer transition border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-[11px] font-bold text-white">HP</div>
                    <div>
                      <div className="text-white font-medium text-sm">{u.hp_umpire}</div>
                      <div className="text-zinc-500 text-xs">Home Plate Umpire</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-zinc-400">{u.games.toLocaleString()} games</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
            Top 50 Umpires by Games Called
          </h2>
          <div className="flex items-center gap-3">
            {/* Game type chips */}
            <div className="flex gap-1 text-[11px]">
              {([
                { value: null, label: 'All' },
                { value: 'S', label: 'Spring' },
                { value: 'R', label: 'Regular' },
                { value: 'P', label: 'Postseason' },
              ] as const).map(gt => (
                <button key={gt.label} onClick={() => setGameType(gt.value)}
                  className={`px-2 py-1 rounded border transition ${gameType === gt.value ? 'border-emerald-600 text-emerald-400 bg-emerald-950/30' : 'border-zinc-800 text-zinc-600 hover:border-zinc-700'}`}>
                  {gt.label}
                </button>
              ))}
            </div>
            {/* Season selector */}
            {seasons.length > 0 && (
              <select value={selectedSeason ?? ''} onChange={e => setSelectedSeason(e.target.value ? Number(e.target.value) : null)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-white focus:border-emerald-600 focus:outline-none">
                <option value="">All Seasons</option>
                {seasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <div className="flex gap-2 text-[11px] text-zinc-600">
              <button onClick={() => handleSort('games')}
                className={`px-2 py-1 rounded border transition ${sortField === 'games' ? 'border-emerald-600 text-emerald-400' : 'border-zinc-800 hover:border-zinc-700'}`}>
                Games{sortArrow('games')}
              </button>
              <button onClick={() => handleSort('true_accuracy')}
                className={`px-2 py-1 rounded border transition ${sortField === 'true_accuracy' ? 'border-emerald-600 text-emerald-400' : 'border-zinc-800 hover:border-zinc-700'}`}>
                True Acc{sortArrow('true_accuracy')}
              </button>
              <button onClick={() => handleSort('real_accuracy')}
                className={`px-2 py-1 rounded border transition ${sortField === 'real_accuracy' ? 'border-emerald-600 text-emerald-400' : 'border-zinc-800 hover:border-zinc-700'}`}>
                Real Acc{sortArrow('real_accuracy')}
              </button>
              <button onClick={() => handleSort('called_pitches')}
                className={`px-2 py-1 rounded border transition ${sortField === 'called_pitches' ? 'border-emerald-600 text-emerald-400' : 'border-zinc-800 hover:border-zinc-700'}`}>
                Pitches{sortArrow('called_pitches')}
              </button>
            </div>
          </div>
        </div>

        {leaderboardLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm">Loading umpire leaderboard...</p>
            <p className="text-zinc-600 text-xs">Aggregating accuracy across millions of pitches</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <p>No umpire data found.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort('games')}>Umpire</th>
                    <th className="px-3 py-2 text-center font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort('games')}>Games{sortArrow('games')}</th>
                    <th className="px-3 py-2 text-center font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort('called_pitches')}>Pitches{sortArrow('called_pitches')}</th>
                    <th className="px-3 py-2 text-center font-medium">Correct</th>
                    <th className="px-3 py-2 text-center font-medium">Missed</th>
                    <th className="px-3 py-2 text-center font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort('true_accuracy')}>True Acc{sortArrow('true_accuracy')}</th>
                    <th className="px-3 py-2 text-center font-medium cursor-pointer hover:text-zinc-300" onClick={() => handleSort('real_accuracy')}>Real Acc{sortArrow('real_accuracy')}</th>
                    <th className="px-3 py-2 text-center font-medium">Date Range</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLeaderboard.map((u, idx) => (
                    <tr key={u.hp_umpire} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer" onClick={() => goToUmpire(u.hp_umpire)}>
                      <td className="px-3 py-2 text-zinc-600 tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-2 text-left whitespace-nowrap">
                        <span className="text-emerald-400 hover:text-emerald-300 font-medium transition">{u.hp_umpire}</span>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{u.games}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{u.called_pitches.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-emerald-400">{u.correct_calls.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-red-400">{(u.called_pitches - u.correct_calls).toLocaleString()}</td>
                      <td className={`px-3 py-2 text-center tabular-nums font-medium ${accuracyColor(u.true_accuracy)}`}>{u.true_accuracy.toFixed(1)}%</td>
                      <td className={`px-3 py-2 text-center tabular-nums font-medium ${realAccuracyColor(u.real_accuracy)}`}>{u.real_accuracy.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-center text-zinc-600 text-[10px] whitespace-nowrap">{u.first_date} — {u.last_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 text-[11px] text-zinc-600 space-y-1 px-1">
          <p><span className="text-zinc-400 font-medium">True Accuracy</span> — correct calls / all called pitches (hard zone boundaries)</p>
          <p><span className="text-zinc-400 font-medium">Real Accuracy</span> — correct calls / non-shadow pitches (excludes pitches within 1&quot; of zone edge)</p>
        </div>
      </div>
    </div>
  )
}
