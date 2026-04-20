'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadGlossary } from '@/lib/glossary'
import MilbNav from '@/components/MilbNav'
import FilterEngine, { ActiveFilter, applyFiltersToData } from '@/components/FilterEngine'
import HitterOverviewTab from '@/components/dashboard/HitterOverviewTab'
import LocationTab from '@/components/dashboard/LocationTab'
import ResultsTab from '@/components/dashboard/ResultsTab'
import PitchLogTab from '@/components/dashboard/PitchLogTab'
import HitterSplitsTab from '@/components/dashboard/HitterSplitsTab'
import HitterGameLogTab from '@/components/dashboard/HitterGameLogTab'
import HitterFieldingTab from '@/components/dashboard/HitterFieldingTab'
import GenerateReportDropdown from '@/components/reports/GenerateReportDropdown'
import ModelMetricTab from '@/components/dashboard/ModelMetricTab'
import { fetchDeployedModels, getDashboardModels, type DeployedModel } from '@/lib/deployedModels'
import { TEAM_COLORS } from '@/lib/constants'

interface HitterInfo {
  player_name: string; batter: number; total_pitches: number
  games: number; last_date: string; avg_exit_velo: number; avg_launch_angle: number
  team: string; bats: string; latest_season: number; first_date: string
}

const BASE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'viz', label: 'Visualizations' },
  { id: 'results', label: 'Results' },
  { id: 'pitchlog', label: 'Pitch Log' },
  { id: 'splits', label: 'Splits' },
  { id: 'gamelog', label: 'Game Log' },
  { id: 'fielding', label: 'Fielding' },
]

export default function MilbHitterDashboard() {
  const params = useParams()
  const router = useRouter()
  const batterId = Number(params.id)

  const [info, setInfo] = useState<HitterInfo | null>(null)
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [tab, setTab] = useState('overview')
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])
  const [allData, setAllData] = useState<any[]>([])
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({})
  const [resultCount, setResultCount] = useState(0)

  // Model tabs
  const [modelTabs, setModelTabs] = useState<DeployedModel[]>([])

  // Search bar state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => { loadPlayer(); loadModelTabs() }, [batterId])

  async function loadModelTabs() {
    const models = await fetchDeployedModels()
    setModelTabs(getDashboardModels(models, 'hitter'))
  }

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

    // Get hitter info from milb_batter_summary
    const { data: pData } = await supabase
      .from('milb_batter_summary').select('*').eq('batter', batterId).single()
    if (pData) setInfo(pData as HitterInfo)

    await fetchData()
    setLoading(false)
  }

  async function handleSearch(value: string) {
    setSearchQuery(value)
    if (!value.trim()) { setSearchResults([]); return }
    const { data } = await supabase.rpc("search_milb_batters", { search_term: value.trim(), result_limit: 6 })
    setSearchResults(data || [])
    setShowSearch(true)
  }

  async function fetchData() {
    setDataLoading(true)
    try {
      const res = await fetch(`/api/milb/player-data?id=${batterId}&col=batter`)
      if (!res.ok) throw new Error('Failed to fetch player data')
      const { rows: allRows } = await res.json() as { rows: any[] }

      // Look up pitcher names
      const pitcherIds = [...new Set(allRows.map((r: any) => r.pitcher).filter(Boolean))]
      const pitcherNames: Record<number, string> = {}
      for (let i = 0; i < pitcherIds.length; i += 500) {
        const batch = pitcherIds.slice(i, i + 500)
        const { data: players } = await supabase.from("players").select("id, name").in("id", batch)
        if (players) players.forEach((p: any) => { pitcherNames[p.id] = p.name })
      }

      // Enrich with derived fields
      allRows.forEach((p: any) => {
        // VAA (approach angle context)
        if (p.vz0 != null && p.vy0 != null && p.az != null && p.ay != null && p.release_extension != null) {
          const t = (-p.vy0 - Math.sqrt(p.vy0*p.vy0 - 2*p.ay*(50-p.release_extension))) / p.ay
          const vzf = p.vz0 + p.az * t
          const vyf = p.vy0 + p.ay * t
          p.vaa = Math.atan2(vzf, -vyf) * (180 / Math.PI)
        }
        // HAA
        if (p.vx0 != null && p.vy0 != null && p.ax != null && p.ay != null && p.release_extension != null) {
          const t = (-p.vy0 - Math.sqrt(p.vy0*p.vy0 - 2*p.ay*(50-p.release_extension))) / p.ay
          const vxf = p.vx0 + p.ax * t
          const vyf = p.vy0 + p.ay * t
          p.haa = Math.atan2(vxf, -vyf) * (180 / Math.PI)
        }
        // Movement in inches
        if (p.pfx_x != null) p.pfx_x_in = +(p.pfx_x * 12).toFixed(1)
        if (p.pfx_z != null) p.pfx_z_in = +(p.pfx_z * 12).toFixed(1)
        // vs Team (opposing pitching team)
        if (p.inning_topbot === "Top") p.vs_team = p.home_team
        else if (p.inning_topbot === "Bot") p.vs_team = p.away_team
        // Pitcher name
        if (p.pitcher && pitcherNames[p.pitcher]) p.pitcher_name = pitcherNames[p.pitcher]
      })

      const cleaned = allRows.filter((r: any) => r.pitch_type !== 'PO' && r.pitch_type !== 'IN')
      setAllData(cleaned)
      setData(cleaned)
      setResultCount(cleaned.length)

      // Build filter options from loaded data
      const buildOpts = (col: string) => [...new Set(cleaned.map((r: any) => r[col]).filter(Boolean))].map(String).sort()
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
        vs_team: buildOpts("vs_team"),
        pitcher_name: buildOpts("pitcher_name"),
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
        <p className="text-zinc-500 text-sm">Loading hitter data...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col">
      {/* Top Nav */}
      <MilbNav active="/milb/hitters">
        <div className="relative ml-4 hidden sm:block">
          <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
            onFocus={() => searchQuery && setShowSearch(true)}
            placeholder="Search hitter..."
            className="w-64 pl-3 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl z-50">
              {searchResults.map((p: any) => (
                <div key={p.batter} onClick={() => { router.push(`/milb/hitter/${p.batter}`); setShowSearch(false); setSearchQuery('') }}
                  className="px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer flex justify-between">
                  <span className="text-white">{p.player_name}</span>
                  <span className="text-zinc-500 text-xs">{p.team}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </MilbNav>

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
                <span>Bats {info.bats}</span>
                <span>{info.total_pitches.toLocaleString()} pitches seen</span>
                <span>{info.games.toLocaleString()} games</span>
                <span>{info.first_date} — {info.last_date}</span>
              </div>
            </div>
          </div>
          <GenerateReportDropdown playerId={info.batter} playerName={info.player_name} playerData={allData} dashboardType="hitting" />
        </div>
      </div>

      {/* Filter Engine */}
      <FilterEngine activeFilters={activeFilters} onFiltersChange={setActiveFilters} optionsCache={optionsCache} />

      {/* Tabs */}
      <div className="bg-zinc-900/50 border-b border-zinc-800 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex overflow-x-auto">
            {[...BASE_TABS, ...modelTabs.map(m => ({ id: `model_${m.column_name}`, label: m.name }))].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
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
          {tab === 'overview' && <HitterOverviewTab data={data} info={info} />}
          {tab === 'viz' && <LocationTab data={data} />}
          {tab === 'results' && <ResultsTab data={data} />}
          {tab === 'pitchlog' && <PitchLogTab data={data} mode="hitter" />}
          {tab === 'splits' && <HitterSplitsTab data={data} />}
          {tab === 'gamelog' && <HitterGameLogTab data={data} />}
          {tab === 'fielding' && <HitterFieldingTab batterId={batterId} />}
          {modelTabs.map(m => tab === `model_${m.column_name}` && <ModelMetricTab key={m.id} data={data} model={m} />)}
        </div>
      </div>
    </div>
  )
}
