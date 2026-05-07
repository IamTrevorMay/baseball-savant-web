'use client'
import { useParams } from 'next/navigation'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import { useHitterData, BASE_TABS } from '@/lib/hooks/useHitterData'
import ResearchNav from '@/components/ResearchNav'
import FilterEngine from '@/components/FilterEngine'
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
import MobileHitterDashboard from '@/components/mobile/MobileHitterDashboard'
import { TEAM_COLORS } from '@/lib/constants'

export default function HitterDashboard() {
  const params = useParams()
  const batterId = Number(params.id)
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const hitter = useHitterData(batterId)

  const {
    info, loading, dataLoading, data, allData, seasonFilteredData,
    resultCount, activeFilters, setActiveFilters, optionsCache,
    seasonType, setSeasonType, selectedYear, setSelectedYear,
    availableYears, tab, setTab, modelTabs, lahmanData, fetchData,
  } = hitter

  // Wait for device detection before rendering to avoid flash
  if (deviceLoading) return null

  // Mobile view
  if (isMobile) return <MobileHitterDashboard hitter={hitter} />

  // Loading state (desktop)
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
          {tab === 'viz' && <LocationTab data={data} subjectType="hitting" level="MLB" />}
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
