'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import ResearchNav from '@/components/ResearchNav'

interface HitterResult {
  player_name: string
  batter: number
  total_pitches: number
  games: number
  last_date: string
  avg_exit_velo: number
  team: string
  bats: string
  latest_season: number
}

const TEAM_COLORS: Record<string, string> = {
  ARI:'#A71930',ATH:'#003831',ATL:'#CE1141',BAL:'#DF4601',BOS:'#BD3039',
  CHC:'#0E3386',CIN:'#C6011F',CLE:'#00385D',COL:'#333366',CWS:'#27251F',
  DET:'#0C2340',HOU:'#002D62',KC:'#004687',LAA:'#BA0021',LAD:'#005A9C',
  MIA:'#00A3E0',MIL:'#FFC52F',MIN:'#002B5C',NYM:'#002D72',NYY:'#003087',
  OAK:'#003831',PHI:'#E81828',PIT:'#27251F',SD:'#2F241D',SEA:'#0C2C56',
  SF:'#FD5A1E',STL:'#C41E3A',TB:'#092C5C',TEX:'#003278',TOR:'#134A8E',
  WSH:'#AB0003',
}

export default function HittersPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HitterResult[]>([])
  const [loading, setLoading] = useState(false)
  const [topHitters, setTopHitters] = useState<HitterResult[]>([])
  const [dbInfo, setDbInfo] = useState({ total: 0, lastDate: '' })
  const router = useRouter()
  const debounceRef = useRef<NodeJS.Timeout>(null)
  const reqCounterRef = useRef(0)

  useEffect(() => {
    loadDbInfo()
    loadTopHitters()
  }, [])

  async function loadDbInfo() {
    const { count } = await supabase.from('pitches').select('*', { count: 'exact', head: true })
    const { data: ld } = await supabase.from('pitches').select('game_date').order('game_date', { ascending: false }).limit(1)
    setDbInfo({ total: count || 0, lastDate: ld?.[0]?.game_date || '' })
  }

  async function loadTopHitters() {
    const { data } = await supabase.rpc('search_batters', { search_term: '', result_limit: 12 })
    if (data) setTopHitters(data)
  }

  function handleSearch(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      const reqId = ++reqCounterRef.current
      setLoading(true)
      const { data } = await supabase.rpc('search_batters', { search_term: value.trim(), result_limit: 8 })
      if (reqId === reqCounterRef.current) {
        setResults(data || [])
      }
      setLoading(false)
    }, 200)
  }

  function goToHitter(batter: number) {
    router.push(`/hitter/${batter}`)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* Nav */}
      <ResearchNav active="/hitters" rightContent={<span className="text-[11px] text-zinc-600 font-mono">{dbInfo.total.toLocaleString()} pitches</span>} />

      {/* Hero */}
      <div className="flex flex-col items-center justify-center pt-24 pb-16 px-4">
        <h1 className="text-4xl font-bold text-white mb-2">Hitter Search</h1>
        <p className="text-zinc-500 mb-10 text-sm">Search any hitter to view their complete Statcast dashboard</p>

        {/* Search */}
        <div className="w-full max-w-xl relative">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={query} onChange={e => handleSearch(e.target.value)}
              placeholder="Search for a hitter..."
              autoFocus
              className="w-full pl-12 pr-4 py-4 bg-zinc-900 border border-zinc-700 rounded-xl text-white text-lg placeholder-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600/50 transition"
            />
            {loading && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />}
          </div>

          {/* Search Results Dropdown */}
          {results.length > 0 && query && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl z-50">
              {results.map(p => (
                <div key={p.batter} onClick={() => goToHitter(p.batter)}
                  className="px-4 py-3 flex items-center justify-between hover:bg-zinc-800 cursor-pointer transition border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                      style={{ backgroundColor: TEAM_COLORS[p.team] || '#52525b' }}>
                      {p.team}
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">{p.player_name}</div>
                      <div className="text-zinc-500 text-xs">Bats {p.bats}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-zinc-600">{p.total_pitches.toLocaleString()} pitches seen</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Hitters Grid */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Most Data Available</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {topHitters.map(p => (
            <div key={p.batter} onClick={() => goToHitter(p.batter)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 hover:bg-zinc-800/50 cursor-pointer transition group">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: TEAM_COLORS[p.team] || '#52525b' }}>
                  {p.team}
                </div>
                <span className="text-white font-medium text-sm group-hover:text-emerald-400 transition">{p.player_name}</span>
              </div>
              <div className="text-[11px] text-zinc-500">
                <span>{p.games.toLocaleString()} G</span>
              </div>
              <div className="text-[11px] text-zinc-600 mt-1">{p.total_pitches.toLocaleString()} pitches seen</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
