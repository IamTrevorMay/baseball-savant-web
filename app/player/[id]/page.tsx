'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadGlossary } from '@/lib/glossary'
import VizPanel from '@/components/VizPanel'
import FilterEngine, { ActiveFilter, applyFiltersToData } from '@/components/FilterEngine'
import OverviewTab from '@/components/dashboard/OverviewTab'
import MovementTab from '@/components/dashboard/MovementTab'
import LocationTab from '@/components/dashboard/LocationTab'
import VelocityTab from '@/components/dashboard/VelocityTab'
import ResultsTab from '@/components/dashboard/ResultsTab'
import GameLogTab from "@/components/dashboard/GameLogTab"
import PitchLogTab from "@/components/dashboard/PitchLogTab"
import SplitsTab from "@/components/dashboard/SplitsTab"

interface PlayerInfo {
  player_name: string; pitcher: number; total_pitches: number
  games: number; last_date: string; avg_velo: number; avg_spin: number
  team: string; pitch_types: string[]; latest_season: number; first_date: string
}


const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'movement', label: 'Movement' },
  { id: 'viz', label: 'Visualizations' },
  { id: 'velocity', label: 'Velocity' },
  { id: 'results', label: 'Results' },
  { id: 'pitchlog', label: 'Pitch Log' },
  { id: 'splits', label: 'Splits' },
  { id: 'gamelog', label: 'Game Log' },
]

const TEAM_COLORS: Record<string, string> = {
  ARI:'#A71930',ATH:'#003831',ATL:'#CE1141',BAL:'#DF4601',BOS:'#BD3039',
  CHC:'#0E3386',CIN:'#C6011F',CLE:'#00385D',COL:'#333366',CWS:'#27251F',
  DET:'#0C2340',HOU:'#002D62',KC:'#004687',LAA:'#BA0021',LAD:'#005A9C',
  MIA:'#00A3E0',MIL:'#FFC52F',MIN:'#002B5C',NYM:'#002D72',NYY:'#003087',
  OAK:'#003831',PHI:'#E81828',PIT:'#27251F',SD:'#2F241D',SEA:'#0C2C56',
  SF:'#FD5A1E',STL:'#C41E3A',TB:'#092C5C',TEX:'#003278',TOR:'#134A8E',
  WSH:'#AB0003',
}

export default function PlayerDashboard() {
  const params = useParams()
  const router = useRouter()
  const pitcherId = Number(params.id)

  const [info, setInfo] = useState<PlayerInfo | null>(null)
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [mlbStats, setMlbStats] = useState<any[]>([])
  const [tab, setTab] = useState('overview')
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])
  const [allData, setAllData] = useState<any[]>([])
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({})
  const [resultCount, setResultCount] = useState(0)

  // Search bar state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => { loadPlayer() }, [pitcherId])

  // Client-side filtered data
  const filteredData = useMemo(() => {
    if (activeFilters.length === 0) return allData
    return applyFiltersToData(allData, activeFilters)
  }, [allData, activeFilters])

  // Debounced filter application
  useEffect(() => {
    const timer = setTimeout(() => {
      setData(filteredData)
      setResultCount(filteredData.length)
    }, 300)
    return () => clearTimeout(timer)
  }, [filteredData])

  async function loadPlayer() {
    setLoading(true)
    await loadGlossary()

    // Get player info from summary
    const { data: pData } = await supabase
      .from('player_summary').select('*').eq('pitcher', pitcherId).single()
    if (pData) setInfo(pData as PlayerInfo)

    // Load pitches
    await fetchData()

    // Fetch MLB official stats (W/L/ERA etc)
    try {
      const mlbRes = await fetch(`/api/mlbstats?pitcher=${pitcherId}`)
      const mlbData = await mlbRes.json()
      if (mlbData.seasons) setMlbStats(mlbData.seasons)
    } catch (e) { console.error("MLB stats fetch failed:", e) }
    setLoading(false)
  }


  async function handleSearch(value: string) {
    setSearchQuery(value)
    if (!value.trim()) { setSearchResults([]); return }
    const { data } = await supabase.rpc("search_players", { search_term: value.trim(), result_limit: 6 })
    setSearchResults(data || [])
    setShowSearch(true)
  }
  async function fetchData() {
    setDataLoading(true)
    try {
      let allRows: any[] = []
      let from = 0
      const pageSize = 1000

      while (true) {
        const { data: rows, error } = await supabase
          .from("pitches").select("*").eq("pitcher", pitcherId)
          .order("game_date", { ascending: false })
          .range(from, from + pageSize - 1)
        if (error) { console.error("Fetch error:", error.message); break }
        if (!rows || rows.length === 0) break
        allRows = allRows.concat(rows)
        if (rows.length < pageSize) break
        from += pageSize
        if (allRows.length >= 50000) break
      }

      setAllData(allRows)
      setData(allRows)
      setResultCount(allRows.length)

      // Build filter options from loaded data
      const buildOpts = (col: string) => [...new Set(allRows.map((r: any) => r[col]).filter(Boolean))].map(String).sort()
      setOptionsCache({
        game_year: buildOpts("game_year").sort().reverse(),
        pitch_name: buildOpts("pitch_name"),
        pitch_type: buildOpts("pitch_type"),
        stand: buildOpts("stand"),
        p_throws: buildOpts("p_throws"),
        balls: ["0","1","2","3"],
        strikes: ["0","1","2"],
        outs_when_up: ["0","1","2"],
        inning: Array.from({length:18},(_,i)=>String(i+1)),
        inning_topbot: ["Top","Bot"],
        type: buildOpts("type"),
        events: buildOpts("events"),
        description: buildOpts("description"),
        bb_type: buildOpts("bb_type"),
        game_type: buildOpts("game_type"),
        home_team: buildOpts("home_team"),
        away_team: buildOpts("away_team"),
        zone: Array.from({length:14},(_,i)=>String(i+1)),
        if_fielding_alignment: buildOpts("if_fielding_alignment"),
        of_fielding_alignment: buildOpts("of_fielding_alignment"),
      })
    } catch (e) {
      console.error("fetchData error:", e)
    }
    setDataLoading(false)
  }

  if (loading || !info) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-500 text-sm">Loading player data...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      {/* Top Nav */}
      <nav className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <a href="/" className="font-bold text-emerald-400 tracking-wide text-sm hover:text-emerald-300 transition">Triton</a>
          <div className="relative">
            <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
              onFocus={() => searchQuery && setShowSearch(true)}
              placeholder="Search pitcher..."
              className="w-64 pl-3 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
            {showSearch && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl z-50">
                {searchResults.map(p => (
                  <div key={p.pitcher} onClick={() => { router.push(`/player/${p.pitcher}`); setShowSearch(false); setSearchQuery('') }}
                    className="px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer flex justify-between">
                    <span className="text-white">{p.player_name}</span>
                    <span className="text-zinc-500 text-xs">{p.team}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-4"><a href="/standings" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Standings</a><a href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Pitchers</a><a href="/explore" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Explorer</a><a href="/analyst" className="text-xs text-zinc-500 hover:text-zinc-300 transition">Analyst</a></div>
      </nav>

      {/* Player Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white"
              style={{ backgroundColor: TEAM_COLORS[info.team] || '#52525b' }}>
              {info.team}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{info.player_name}</h1>
              <div className="flex gap-4 text-sm text-zinc-400 mt-1">
                <span>{info.total_pitches.toLocaleString()} pitches</span>
                <span>{info.games.toLocaleString()} games</span>
                <span>{info.first_date} — {info.last_date}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Engine */}
      <FilterEngine activeFilters={activeFilters} onFiltersChange={setActiveFilters} optionsCache={optionsCache} />

      {/* Tabs */}
      <div className="bg-zinc-900/50 border-b border-zinc-800 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                  tab === t.id ? "text-emerald-400 border-emerald-400" : "text-zinc-500 border-transparent hover:text-zinc-300"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {dataLoading && <div className="w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />}
            <span className="text-[11px] text-zinc-500">{resultCount.toLocaleString()} pitches{activeFilters.length > 0 ? " (filtered)" : ""}</span>
          </div>
        </div>
      </div>
      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {tab === 'overview' && <OverviewTab data={data} info={info} mlbStats={mlbStats} />}
          {tab === 'movement' && <MovementTab data={data} />}
          {tab === 'viz' && <LocationTab data={data} />}
          {tab === 'velocity' && <VelocityTab data={data} />}
          {tab === 'results' && <ResultsTab data={data} />}
          {tab === 'pitchlog' && <PitchLogTab data={data} />}
          {tab === 'splits' && <SplitsTab data={data} />}
          {tab === 'gamelog' && <GameLogTab data={data} />}
        </div>
      </div>
    </div>
  )
}
