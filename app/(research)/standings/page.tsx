'use client'

import { useDevice } from '@/lib/hooks/useDeviceContext'
import { useStandings } from '@/lib/hooks/useStandings'
import ResearchNav from '@/components/ResearchNav'
import DivisionTable, { LeagueTable, WildCardTable } from '@/components/standings/DivisionTable'
import MobileStandings from '@/components/mobile/MobileStandings'

export default function StandingsPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()
  const standings = useStandings()

  if (deviceLoading) return null
  if (isMobile) return <MobileStandings standings={standings} />

  const {
    standingsLoading, season, setSeason, view, setView,
    standingsType, setStandingsType, years, getDivisions, getWildCard, divisions,
  } = standings

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/standings" />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">MLB Standings</h2>
            <button
              onClick={() => setStandingsType(prev => prev === 'regular' ? 'spring' : 'regular')}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide transition ${
                standingsType === 'spring'
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
              }`}
            >
              Spring Training
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {(['division','league','wildcard'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                    view === v ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}>
                  {v === 'wildcard' ? 'Wild Card' : v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <select value={season} onChange={e => setSeason(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-white focus:border-emerald-600 focus:outline-none">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {standingsLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {view === 'division' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">American League</h3>
                  {getDivisions('AL').map(div => <DivisionTable key={div.division} division={div} />)}
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">National League</h3>
                  {getDivisions('NL').map(div => <DivisionTable key={div.division} division={div} />)}
                </div>
              </div>
            )}
            {view === 'league' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">American League</h3>
                  <LeagueTable teams={divisions.filter(d => d.league === 'AL').flatMap(d => d.teams).sort((a,b) => b.w - a.w || a.l - b.l)} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">National League</h3>
                  <LeagueTable teams={divisions.filter(d => d.league === 'NL').flatMap(d => d.teams).sort((a,b) => b.w - a.w || a.l - b.l)} />
                </div>
              </div>
            )}
            {view === 'wildcard' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">AL Wild Card</h3>
                  <WildCardTable teams={getWildCard('AL')} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">NL Wild Card</h3>
                  <WildCardTable teams={getWildCard('NL')} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
