'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadGlossary } from '@/lib/glossary'
import ResearchNav from '@/components/ResearchNav'
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
import PlayerBadges from '@/components/PlayerBadges'
import { fetchDeployedModels, getDashboardModels, type DeployedModel } from '@/lib/deployedModels'
import type { LahmanPlayerData } from '@/lib/lahman-stats'

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

const TEAM_COLORS: Record<string, string> = {
  ARI:'#A71930',ATH:'#003831',ATL:'#CE1141',BAL:'#DF4601',BOS:'#BD3039',
  CHC:'#0E3386',CIN:'#C6011F',CLE:'#00385D',COL:'#333366',CWS:'#27251F',
  DET:'#0C2340',HOU:'#002D62',KC:'#004687',LAA:'#BA0021',LAD:'#005A9C',
  MIA:'#00A3E0',MIL:'#FFC52F',MIN:'#002B5C',NYM:'#002D72',NYY:'#003087',
  OAK:'#003831',PHI:'#E81828',PIT:'#27251F',SD:'#2F241D',SEA:'#0C2C56',
  SF:'#FD5A1E',STL:'#C41E3A',TB:'#092C5C',TEX:'#003278',TOR:'#134A8E',
  WSH:'#AB0003',
}

export default function HitterDashboard() {
  const params = useParams()
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
  const [selectedYear, setSelectedYear] = useState<number | null>(new Date().getFullYear())
  const [availableYears, setAvailableYears] = useState<number[]>([])

  // Model tabs
  const [modelTabs, setModelTabs] = useState<DeployedModel[]>([])

  // Lahman historical data
  const [lahmanData, setLahmanData] = useState<LahmanPlayerData | null>(null)

  const [seasonType, setSeasonType] = useState<'regular'|'spring'|'postseason'|'all'>('regular')

  useEffect(() => { loadPlayer(); loadModelTabs() }, [batterId])

  async function loadModelTabs() {
    const models = await fetchDeployedModels()
    setModelTabs(getDashboardModels(models, 'hitter'))
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

    // Get hitter info from batter_summary
    const { data: pData } = await supabase
      .from('batter_summary').select('*').eq('batter', batterId).single()
    if (pData) setInfo(pData as HitterInfo)

    // Default to player's latest season (handles retired players correctly)
    const initialYear = pData?.latest_season || new Date().getFullYear()
    setSelectedYear(initialYear)

    // Load pitches + Lahman data in parallel
    const lahmanPromise = fetch(`/api/lahman/player?mlb_id=${batterId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.player) setLahmanData(d) })
      .catch(() => {})
    await Promise.all([fetchData(initialYear), lahmanPromise])
    setLoading(false)
  }

  async function fetchData(year?: number | null) {
    setDataLoading(true)
    try {
      const yearParam = year != null ? `&year=${year}` : ''
      const res = await fetch(`/api/player-data?id=${batterId}&col=batter${yearParam}`)
      if (!res.ok) throw new Error('Failed to fetch player data')
      const { rows: allRows } = await res.json() as { rows: any[] }

      // Enrich with derived fields (pitcher_name now comes from server-side JOIN)
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
      })

      const cleaned = allRows.filter((r: any) => r.pitch_type !== 'PO' && r.pitch_type !== 'IN')
      setAllData(cleaned)
      setData(cleaned)
      setResultCount(cleaned.length)

      // Build filter options from loaded data
      const buildOpts = (col: string) => [...new Set(cleaned.map((r: any) => r[col]).filter(Boolean))].map(String).sort()
      const years = buildOpts("game_year").sort().reverse()
      if (year != null && availableYears.length === 0) {
        fetch(`/api/player-filter-options?id=${batterId}&col=batter`)
          .then(r => r.json())
          .then(d => { if (d.game_year) setAvailableYears(d.game_year.map(Number)) })
          .catch(() => {})
      } else if (year == null) {
        setAvailableYears(years.map(Number))
      }
      setOptionsCache({
        game_year: years,
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
      <ResearchNav active="/hitters" />

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
              <div className="flex items-center gap-4 text-sm text-zinc-400 mt-1">
                <select value={selectedYear ?? 'all'} onChange={e => {
                  const v = e.target.value === 'all' ? null : parseInt(e.target.value)
                  setSelectedYear(v)
                  fetchData(v)
                }}
                  className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1 focus:border-emerald-600 focus:outline-none">
                  <option value="all">All Seasons</option>
                  {(availableYears.length > 0 ? availableYears : [new Date().getFullYear()]).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select value={seasonType} onChange={e => setSeasonType(e.target.value as any)}
                  className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1 focus:border-emerald-600 focus:outline-none">
                  <option value="regular">Regular Season</option>
                  <option value="spring">Spring Training</option>
                  <option value="postseason">Postseason</option>
                  <option value="all">All Games</option>
                </select>
                <span>Bats {info.bats}</span>
                <span>{seasonFilteredData.length.toLocaleString()} pitches seen</span>
                <span>{new Set(seasonFilteredData.map((r: any) => r.game_pk)).size.toLocaleString()} games</span>
                <span>{info.first_date} — {info.last_date}</span>
                {lahmanData?.player?.debut && <span>Debut: {lahmanData.player.debut}</span>}
              </div>
              {lahmanData && <PlayerBadges awards={lahmanData.awards} allstars={lahmanData.allstars} hof={lahmanData.hof} />}
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
          {tab === 'overview' && <HitterOverviewTab data={data} info={info} lahmanBatting={lahmanData?.batting} />}
          {tab === 'viz' && <LocationTab data={data} />}
          {tab === 'results' && <ResultsTab data={data} />}
          {tab === 'pitchlog' && <PitchLogTab data={data} mode="hitter" />}
          {tab === 'splits' && <HitterSplitsTab data={data} />}
          {tab === 'gamelog' && <HitterGameLogTab data={data} />}
          {tab === 'fielding' && <HitterFieldingTab batterId={batterId} lahmanFielding={lahmanData?.fielding} />}
          {modelTabs.map(m => tab === `model_${m.column_name}` && <ModelMetricTab key={m.id} data={data} model={m} />)}
        </div>
      </div>
    </div>
  )
}
