'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadGlossary } from '@/lib/glossary'
import VizPanel from '@/components/VizPanel'
import { SidebarCheckboxes, Chips, RangeInput } from '@/components/FilterComponents'
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

interface Filters {
  game_year: string[] | null; pitch_name: string[] | null
  stand: string[] | null; balls: string[] | null; strikes: string[] | null
  game_date_start: string; game_date_end: string
}

const defaultFilters: Filters = {
  game_year: null, pitch_name: null, stand: null,
  balls: null, strikes: null, game_date_start: '', game_date_end: ''
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'movement', label: 'Movement' },
  { id: 'location', label: 'Location' },
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
  const [filters, setFilters] = useState<Filters>({ ...defaultFilters })
  const [filterOpen, setFilterOpen] = useState(false)
  const [resultCount, setResultCount] = useState(0)

  // Search bar state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => { loadPlayer() }, [pitcherId])

  async function loadPlayer() {
    setLoading(true)
    await loadGlossary()

    // Get player info from summary
    const { data: pData } = await supabase
      .from('player_summary').select('*').eq('pitcher', pitcherId).single()
    if (pData) setInfo(pData as PlayerInfo)

    // Load pitches
    await fetchData(defaultFilters)

    // Fetch MLB official stats (W/L/ERA etc)
    try {
      const mlbRes = await fetch(`/api/mlbstats?pitcher=${pitcherId}`)
      const mlbData = await mlbRes.json()
      if (mlbData.seasons) setMlbStats(mlbData.seasons)
    } catch (e) { console.error("MLB stats fetch failed:", e) }
    setLoading(false)
  }

  async function fetchData(f: Filters) {
    setDataLoading(true)
    try {
      // Get total count first
      let countQ = supabase.from("pitches").select("*", { count: "exact", head: true }).eq("pitcher", pitcherId)
      if (f.game_year?.length) countQ = countQ.in("game_year", f.game_year.map(Number))
      if (f.pitch_name?.length) countQ = countQ.in("pitch_name", f.pitch_name)
      if (f.stand?.length) countQ = countQ.in("stand", f.stand)
      if (f.balls?.length) countQ = countQ.in("balls", f.balls.map(Number))
      if (f.strikes?.length) countQ = countQ.in("strikes", f.strikes.map(Number))
      if (f.game_date_start) countQ = countQ.gte("game_date", f.game_date_start)
      if (f.game_date_end) countQ = countQ.lte("game_date", f.game_date_end)
      const { count } = await countQ
      setResultCount(count || 0)

      // Paginate data
      let allRows: any[] = []
      let from = 0
      const pageSize = 1000

      while (true) {
        let q = supabase.from("pitches").select("*").eq("pitcher", pitcherId)
        if (f.game_year?.length) q = q.in("game_year", f.game_year.map(Number))
        if (f.pitch_name?.length) q = q.in("pitch_name", f.pitch_name)
        if (f.stand?.length) q = q.in("stand", f.stand)
        if (f.balls?.length) q = q.in("balls", f.balls.map(Number))
        if (f.strikes?.length) q = q.in("strikes", f.strikes.map(Number))
        if (f.game_date_start) q = q.gte("game_date", f.game_date_start)
        if (f.game_date_end) q = q.lte("game_date", f.game_date_end)
        const { data: rows, error } = await q.order("game_date", { ascending: false }).range(from, from + pageSize - 1)
        if (error) { console.error("Fetch error:", error.message); break }
        if (!rows || rows.length === 0) break
        allRows = allRows.concat(rows)
        if (rows.length < pageSize) break
        from += pageSize
        if (allRows.length >= 50000) break
      }

      setData(allRows)
    } catch (e) {
      console.error("fetchData error:", e)
    }
    setDataLoading(false)
  }
  function clearFilters() { setFilters({ ...defaultFilters }); fetchData(defaultFilters) }

  function toggleFilter(key: keyof Filters, value: string) {
    setFilters(prev => {
      const current = (prev[key] as string[] | null) || []
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
      return { ...prev, [key]: updated.length > 0 ? updated : null }
    })
  }

  async function handleSearch(value: string) {
    setSearchQuery(value)
    if (!value.trim()) { setSearchResults([]); return }
    const { data } = await supabase.rpc('search_players', { search_term: value.trim(), result_limit: 6 })
    setSearchResults(data || [])
    setShowSearch(true)
  }

  function getActiveCount(): number {
    let c = 0
    if (filters.game_year?.length) c += filters.game_year.length
    if (filters.pitch_name?.length) c += filters.pitch_name.length
    if (filters.stand?.length) c += filters.stand.length
    if (filters.balls?.length) c += filters.balls.length
    if (filters.strikes?.length) c += filters.strikes.length
    if (filters.game_date_start) c++
    if (filters.game_date_end) c++
    return c
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

      {/* Filter Bar + Tabs */}
      <div className="bg-zinc-900/50 border-b border-zinc-800 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                  tab === t.id ? 'text-emerald-400 border-emerald-400' : 'text-zinc-500 border-transparent hover:text-zinc-300'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {dataLoading && <div className="w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />}
            <span className="text-[11px] text-zinc-500">{resultCount.toLocaleString()} pitches loaded</span>
            <button onClick={() => setFilterOpen(!filterOpen)}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition ${
                getActiveCount() > 0 ? 'bg-emerald-700/30 border-emerald-600/50 text-emerald-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-300'
              }`}>
              Filters {getActiveCount() > 0 ? `(${getActiveCount()})` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel (collapsible) */}
      {filterOpen && (
        <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <Chips label="Season" items={info.pitch_types ? [...new Set(data.map(d => String(d.game_year)).filter(Boolean))].sort().reverse() : []} selected={filters.game_year} onToggle={v => toggleFilter('game_year', v)} />
              <SidebarCheckboxes label="Pitch Type" items={info.pitch_types || []} selected={filters.pitch_name} onToggle={v => toggleFilter('pitch_name', v)} />
              <Chips label="Batter Side" items={['L','R']} selected={filters.stand} onToggle={v => toggleFilter('stand', v)} />
              <Chips label="Balls" items={['0','1','2','3']} selected={filters.balls} onToggle={v => toggleFilter('balls', v)} />
              <Chips label="Strikes" items={['0','1','2']} selected={filters.strikes} onToggle={v => toggleFilter('strikes', v)} />
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">From</label>
                <input type="date" value={filters.game_date_start} onChange={e => setFilters(p => ({...p, game_date_start: e.target.value}))}
                  className="w-full p-1.5 bg-zinc-950 border border-zinc-700 rounded text-[12px] text-white focus:border-emerald-600 focus:outline-none" />
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">To</label>
                <input type="date" value={filters.game_date_end} onChange={e => setFilters(p => ({...p, game_date_end: e.target.value}))}
                  className="w-full p-1.5 bg-zinc-950 border border-zinc-700 rounded text-[12px] text-white focus:border-emerald-600 focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-3">
              <button onClick={applyFilters} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded text-sm font-medium transition">Apply</button>
              <button onClick={clearFilters} className="text-zinc-500 hover:text-zinc-300 text-sm transition">Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {tab === 'overview' && <OverviewTab data={data} info={info} mlbStats={mlbStats} />}
          {tab === 'movement' && <MovementTab data={data} />}
          {tab === 'location' && <LocationTab data={data} />}
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
