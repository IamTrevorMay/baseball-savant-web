'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface UmpireResult {
  hp_umpire: string
  games: number
  first_date: string
  last_date: string
  called_pitches: number
  correct_calls: number
  accuracy: number
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

function accuracyBg(pct: number): string {
  if (pct >= 92) return 'bg-emerald-500/20 border-emerald-500/30'
  if (pct >= 89) return 'bg-yellow-500/20 border-yellow-500/30'
  return 'bg-red-500/20 border-red-500/30'
}

export default function UmpirePage() {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UmpireSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [leaderboard, setLeaderboard] = useState<UmpireResult[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [sortField, setSortField] = useState<'games' | 'accuracy' | 'called_pitches'>('games')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const router = useRouter()
  const debounceRef = useRef<NodeJS.Timeout>(null)

  useEffect(() => {
    loadLeaderboard()
  }, [])

  async function loadLeaderboard() {
    setLeaderboardLoading(true)
    try {
      const { data, error } = await supabase.rpc('run_query', {
        query_text: `
          SELECT u.hp_umpire,
            COUNT(DISTINCT u.game_pk) as games,
            MIN(u.game_date)::text as first_date,
            MAX(u.game_date)::text as last_date,
            COUNT(*) FILTER (WHERE p.type IN ('B','S')) as called_pitches,
            COUNT(*) FILTER (WHERE
              (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top AND p.type = 'S')
              OR (NOT (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top) AND p.type = 'B')
            ) as correct_calls
          FROM game_umpires u
          JOIN pitches p ON p.game_pk = u.game_pk
          WHERE p.type IN ('B', 'S') AND p.plate_x IS NOT NULL AND p.sz_top IS NOT NULL
          GROUP BY u.hp_umpire
          ORDER BY games DESC
          LIMIT 50
        `
      })
      if (error) {
        console.error('Leaderboard query error:', error)
        return
      }
      if (data) {
        const parsed: UmpireResult[] = data.map((row: Record<string, unknown>) => ({
          hp_umpire: row.hp_umpire as string,
          games: Number(row.games),
          first_date: row.first_date as string,
          last_date: row.last_date as string,
          called_pitches: Number(row.called_pitches),
          correct_calls: Number(row.correct_calls),
          accuracy: Number(row.called_pitches) > 0
            ? (Number(row.correct_calls) / Number(row.called_pitches)) * 100
            : 0,
        }))
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
        const { data } = await supabase.rpc('run_query', {
          query_text: `
            SELECT hp_umpire, COUNT(DISTINCT game_pk) as games
            FROM game_umpires
            WHERE LOWER(hp_umpire) LIKE '%${value.trim().toLowerCase().replace(/'/g, "''")}%'
            GROUP BY hp_umpire
            ORDER BY games DESC
            LIMIT 8
          `
        })
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

  function handleSort(field: 'games' | 'accuracy' | 'called_pitches') {
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
      {/* Nav */}
      <nav className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <a href="/" className="font-bold text-emerald-400 tracking-wide text-sm hover:text-emerald-300 transition">Triton</a>
          <div className="flex gap-4 text-xs text-zinc-500">
            <a href="/" className="hover:text-zinc-300 transition">Home</a>
            <a href="/pitchers" className="hover:text-zinc-300 transition">Pitchers</a>
            <a href="/hitters" className="hover:text-zinc-300 transition">Hitters</a>
            <a href="/reports" className="hover:text-zinc-300 transition">Reports</a>
            <a href="/umpire" className="text-emerald-400">Umpires</a>
            <a href="/explore" className="hover:text-zinc-300 transition">Explore</a>
            <a href="/analyst" className="hover:text-zinc-300 transition">Analyst</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex flex-col items-center justify-center pt-24 pb-16 px-4">
        <h1 className="text-4xl font-bold text-white mb-2">Umpire Search</h1>
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

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && query && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl z-50">
              {searchResults.map(u => (
                <div key={u.hp_umpire} onClick={() => goToUmpire(u.hp_umpire)}
                  className="px-4 py-3 flex items-center justify-between hover:bg-zinc-800 cursor-pointer transition border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-[11px] font-bold text-white">
                      HP
                    </div>
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
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Top 50 Umpires by Games Called</h2>
          <div className="flex gap-2 text-[11px] text-zinc-600">
            <button onClick={() => handleSort('games')}
              className={`px-2 py-1 rounded border transition ${sortField === 'games' ? 'border-emerald-600 text-emerald-400' : 'border-zinc-800 hover:border-zinc-700'}`}>
              Games{sortArrow('games')}
            </button>
            <button onClick={() => handleSort('accuracy')}
              className={`px-2 py-1 rounded border transition ${sortField === 'accuracy' ? 'border-emerald-600 text-emerald-400' : 'border-zinc-800 hover:border-zinc-700'}`}>
              Accuracy{sortArrow('accuracy')}
            </button>
            <button onClick={() => handleSort('called_pitches')}
              className={`px-2 py-1 rounded border transition ${sortField === 'called_pitches' ? 'border-emerald-600 text-emerald-400' : 'border-zinc-800 hover:border-zinc-700'}`}>
              Pitches{sortArrow('called_pitches')}
            </button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sortedLeaderboard.map((u, idx) => (
              <div key={u.hp_umpire} onClick={() => goToUmpire(u.hp_umpire)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 cursor-pointer transition group relative">
                {/* Rank badge */}
                <div className="absolute top-3 right-3 text-[10px] text-zinc-600 font-mono">
                  #{idx + 1}
                </div>

                {/* Name row */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300">
                    HP
                  </div>
                  <span className="text-white font-medium text-sm group-hover:text-emerald-400 transition truncate pr-6">
                    {u.hp_umpire}
                  </span>
                </div>

                {/* Accuracy highlight */}
                <div className={`rounded-md border px-3 py-2 mb-3 ${accuracyBg(u.accuracy)}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] text-zinc-400">Accuracy</span>
                    <span className={`text-lg font-bold tabular-nums ${accuracyColor(u.accuracy)}`}>
                      {u.accuracy.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${u.accuracy >= 92 ? 'bg-emerald-500' : u.accuracy >= 89 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.max(0, (u.accuracy - 80) * 5)}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Games</span>
                    <span className="text-zinc-300 tabular-nums">{u.games.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Pitches</span>
                    <span className="text-zinc-300 tabular-nums">{u.called_pitches.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Correct</span>
                    <span className="text-zinc-300 tabular-nums">{u.correct_calls.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Missed</span>
                    <span className="text-zinc-300 tabular-nums">{(u.called_pitches - u.correct_calls).toLocaleString()}</span>
                  </div>
                </div>

                {/* Date range */}
                <div className="mt-2 text-[10px] text-zinc-600 flex justify-between">
                  <span>{u.first_date}</span>
                  <span>to</span>
                  <span>{u.last_date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
