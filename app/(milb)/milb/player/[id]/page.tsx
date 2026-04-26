'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadGlossary } from '@/lib/glossary'
import MilbNav from '@/components/MilbNav'
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
import GenerateReportDropdown from '@/components/reports/GenerateReportDropdown'
import ModelMetricTab from '@/components/dashboard/ModelMetricTab'
import PercentileTab from '@/components/dashboard/PercentileTab'
import PitchLevelTab from '@/components/dashboard/PitchLevelTab'
import PlayerBadges from '@/components/PlayerBadges'
import { fetchDeployedModels, getDashboardModels, type DeployedModel } from '@/lib/deployedModels'
import { TEAM_COLORS } from '@/lib/constants'

interface PlayerInfo {
  player_name: string; pitcher: number; total_pitches: number
  games: number; last_date: string; avg_velo: number; avg_spin: number
  team: string; pitch_types: string[]; latest_season: number; first_date: string
  parent_org?: string; parent_org_abbrev?: string
}


const BASE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'movement', label: 'Movement' },
  { id: 'viz', label: 'Visualizations' },
  { id: 'velocity', label: 'Velocity' },
  { id: 'results', label: 'Results' },
  { id: 'pitchlog', label: 'Pitch Log' },
  { id: 'splits', label: 'Splits' },
  { id: 'gamelog', label: 'Game Log' },
  { id: 'percentile', label: 'Ranks' },
  { id: 'pitchlevel', label: 'Pitch Level' },
]

export default function MilbPlayerDashboard() {
  const params = useParams()
  const router = useRouter()
  const pitcherId = Number(params.id)

  const [info, setInfo] = useState<PlayerInfo | null>(null)
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [tab, setTab] = useState('overview')
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])
  const [allData, setAllData] = useState<any[]>([])
  const [optionsCache, setOptionsCache] = useState<Record<string, string[]>>({})
  const [resultCount, setResultCount] = useState(0)
  const [seasonType, setSeasonType] = useState<'regular'|'spring'|'postseason'|'all'>('regular')

  // Model tabs
  const [modelTabs, setModelTabs] = useState<DeployedModel[]>([])

  // SOS scores per year
  const [sosScores, setSosScores] = useState<Record<number, { sos: number }>>({})

  // Search bar state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => { loadPlayer(); loadModelTabs() }, [pitcherId])

  async function loadModelTabs() {
    const models = await fetchDeployedModels()
    setModelTabs(getDashboardModels(models, 'pitcher'))
  }

  // Partition by season type before user filters
  const seasonFilteredData = useMemo(() => {
    if (seasonType === 'all') return allData
    return allData.filter((r: any) => {
      const gt = r.game_type
      if (seasonType === 'regular') return gt === 'R'
      if (seasonType === 'spring') return gt === 'S' || gt === 'E'
      if (seasonType === 'postseason') return ['P','F','D','L','W'].includes(gt)
      return true
    })
  }, [allData, seasonType])

  // Client-side filtered data
  const filteredData = useMemo(() => {
    if (activeFilters.length === 0) return seasonFilteredData
    return applyFiltersToData(seasonFilteredData, activeFilters)
  }, [seasonFilteredData, activeFilters])

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

    // Get player info from MiLB summary
    const { data: pData } = await supabase
      .from('milb_player_summary').select('*').eq('pitcher', pitcherId).single()
    if (pData) setInfo(pData as PlayerInfo)

    // Load pitches
    await fetchData()

    // Fetch SOS scores (no MLB official stats or Lahman for MiLB)
    try {
      const sosRes = await supabase.from('milb_sos_scores').select('game_year, sos').eq('player_id', pitcherId).eq('role', 'pitcher')
      if (sosRes.data) {
        const map: Record<number, { sos: number }> = {}
        sosRes.data.forEach((r: any) => { map[r.game_year] = { sos: Number(r.sos) } })
        setSosScores(map)
      }
    } catch (e) { console.error("Stats fetch failed:", e) }
    setLoading(false)
  }


  async function handleSearch(value: string) {
    setSearchQuery(value)
    if (!value.trim()) { setSearchResults([]); return }
    const { data } = await supabase.rpc("search_milb_players", { search_term: value.trim(), result_limit: 6 })
    setSearchResults(data || [])
    setShowSearch(true)
  }
  async function fetchData() {
    setDataLoading(true)
    try {
      const res = await fetch(`/api/milb/player-data?id=${pitcherId}&col=pitcher`)
      if (!res.ok) throw new Error('Failed to fetch player data')
      const { rows: allRows } = await res.json() as { rows: any[] }



      // Load batter names from players table
      const batterIds = [...new Set(allRows.map((r: any) => r.batter).filter(Boolean))]
      const batterNames: Record<number, string> = {}
      for (let i = 0; i < batterIds.length; i += 500) {
        const batch = batterIds.slice(i, i + 500)
        const { data: players } = await supabase.from("players").select("id, name").in("id", batch)
        if (players) players.forEach((p: any) => { batterNames[p.id] = p.name })
      }
      // Enrich with derived fields
      allRows.forEach((p: any) => {
        // Vertical Approach Angle (degrees)
        if (p.vz0 != null && p.vy0 != null && p.az != null && p.ay != null && p.release_extension != null) {
          const t = (-p.vy0 - Math.sqrt(p.vy0*p.vy0 - 2*p.ay*(50-p.release_extension))) / p.ay
          const vzf = p.vz0 + p.az * t
          const vyf = p.vy0 + p.ay * t
          p.vaa = Math.atan2(vzf, -vyf) * (180 / Math.PI)
        }
        // Horizontal Approach Angle (degrees)
        if (p.vx0 != null && p.vy0 != null && p.ax != null && p.ay != null && p.release_extension != null) {
          const t = (-p.vy0 - Math.sqrt(p.vy0*p.vy0 - 2*p.ay*(50-p.release_extension))) / p.ay
          const vxf = p.vx0 + p.ax * t
          const vyf = p.vy0 + p.ay * t
          p.haa = Math.atan2(vxf, -vyf) * (180 / Math.PI)
        }
        // Movement in inches
        if (p.pfx_x != null) p.pfx_x_in = +(p.pfx_x * 12).toFixed(1)
        if (p.pfx_z != null) p.pfx_z_in = +(p.pfx_z * 12).toFixed(1)
        // Brink — signed distance to nearest strike zone edge (inches)
        if (p.plate_x != null && p.plate_z != null && p.sz_top != null && p.sz_bot != null) {
          const dLeft = p.plate_x + 0.83, dRight = 0.83 - p.plate_x
          const dBot = p.plate_z - p.sz_bot, dTop = p.sz_top - p.plate_z
          p.brink = +(Math.min(dLeft, dRight, dBot, dTop) * 12).toFixed(1)
        }
        // vs Team (batting team)
        if (p.inning_topbot === "Top") p.vs_team = p.away_team
        else if (p.inning_topbot === "Bot") p.vs_team = p.home_team
        // Batter name
        if (p.batter && batterNames[p.batter]) p.batter_name = batterNames[p.batter]
      })
      // Cluster / HDev / VDev — distance from year-partitioned pitch-type centroid (inches)
      const cBuckets: Record<string, { sx: number; sz: number; n: number }> = {}
      allRows.forEach((p: any) => {
        if (p.pitch_name && p.plate_x != null && p.plate_z != null) {
          const key = p.game_year != null ? `${p.game_year}::${p.pitch_name}` : p.pitch_name
          if (!cBuckets[key]) cBuckets[key] = { sx: 0, sz: 0, n: 0 }
          cBuckets[key].sx += p.plate_x
          cBuckets[key].sz += p.plate_z
          cBuckets[key].n++
        }
      })
      const cCentroids: Record<string, { cx: number; cz: number }> = {}
      for (const name in cBuckets) {
        const b = cBuckets[name]
        cCentroids[name] = { cx: b.sx / b.n, cz: b.sz / b.n }
      }
      allRows.forEach((p: any) => {
        if (p.pitch_name && p.plate_x != null && p.plate_z != null) {
          const key = p.game_year != null ? `${p.game_year}::${p.pitch_name}` : p.pitch_name
          const c = cCentroids[key]
          if (c) {
            p.cluster = +(Math.sqrt((p.plate_x - c.cx) ** 2 + (p.plate_z - c.cz) ** 2) * 12).toFixed(1)
            p.hdev = +((c.cx - p.plate_x) * 12).toFixed(1)
            p.vdev = +((p.plate_z - c.cz) * 12).toFixed(1)
          }
        }
      })
      const cleaned = allRows.filter((r: any) => r.pitch_type !== 'PO' && r.pitch_type !== 'IN')
      setAllData(cleaned)
      setData(cleaned)
      setResultCount(cleaned.length)

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
        vs_team: buildOpts("vs_team"),
        batter_name: buildOpts("batter_name"),
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
      <MilbNav active="/milb/pitchers">
        <div className="relative ml-4 hidden sm:block">
          <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
            onFocus={() => searchQuery && setShowSearch(true)}
            placeholder="Search pitcher..."
            className="w-64 pl-3 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl z-50">
              {searchResults.map(p => (
                <div key={p.pitcher} onClick={() => { router.push(`/milb/player/${p.pitcher}`); setShowSearch(false); setSearchQuery('') }}
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
              style={{ backgroundColor: TEAM_COLORS[info.parent_org_abbrev || info.team] || '#52525b' }}>
              {info.team}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{info.player_name}</h1>
              <div className="flex items-center gap-4 text-sm text-zinc-400 mt-1">
                <select value={seasonType} onChange={e => setSeasonType(e.target.value as any)}
                  className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1 focus:border-emerald-600 focus:outline-none">
                  <option value="regular">Regular Season</option>
                  <option value="spring">Spring Training</option>
                  <option value="postseason">Postseason</option>
                  <option value="all">All Games</option>
                </select>
                {info.parent_org_abbrev && info.parent_org_abbrev !== info.team && (
                  <span className="text-emerald-400 font-medium">{info.parent_org_abbrev} org</span>
                )}
                <span>{seasonFilteredData.length.toLocaleString()} pitches</span>
                <span>{new Set(seasonFilteredData.map((r: any) => r.game_pk)).size.toLocaleString()} games</span>
                <span>{info.first_date} — {info.last_date}</span>
              </div>
            </div>
          </div>
          <GenerateReportDropdown playerId={info.pitcher} playerName={info.player_name} playerData={allData} dashboardType="pitching" />
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
          {tab === 'overview' && <OverviewTab data={data} info={info} mlbStats={[]} sosScores={sosScores} />}
          {tab === 'movement' && <MovementTab data={data} />}
          {tab === 'viz' && <LocationTab data={data} subjectType="pitching" level="MiLB" />}
          {tab === 'velocity' && <VelocityTab data={data} />}
          {tab === 'results' && <ResultsTab data={data} />}
          {tab === 'pitchlog' && <PitchLogTab data={data} mode="pitcher" />}
          {tab === 'splits' && <SplitsTab data={data} />}
          {tab === 'gamelog' && <GameLogTab data={data} />}
          {tab === 'percentile' && <PercentileTab data={data} />}
          {tab === 'pitchlevel' && <PitchLevelTab data={data} />}
          {modelTabs.map(m => tab === `model_${m.column_name}` && <ModelMetricTab key={m.id} data={data} model={m} />)}
        </div>
      </div>
    </div>
  )
}
