'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const TEAMS = ['ARI','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET','HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK','PHI','PIT','SD','SF','SEA','STL','TB','TEX','TOR','WSH']

interface Props {
  playerId: number
  playerName: string
  playerData: any[]
  dashboardType: 'pitching' | 'hitting'
  templateId: string | null
  templateName: string | null
  onClose: () => void
}

export default function GenerateReportModal({
  playerId, playerName, playerData, dashboardType,
  templateId, templateName, onClose
}: Props) {
  const router = useRouter()

  // Mode
  const [mode, setMode] = useState<'default' | 'vs_similar_stuff'>('default')

  // Years
  const availableYears = useMemo(() => {
    const years = [...new Set(playerData.map(d => d.game_year).filter(Boolean))].sort((a, b) => b - a)
    return years.map(String)
  }, [playerData])
  const [selectedYears, setSelectedYears] = useState<string[]>([])
  const [useCustomDates, setUseCustomDates] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Opposition
  const [oppType, setOppType] = useState<'none' | 'hitter' | 'pitcher' | 'team'>('none')
  const [oppSearch, setOppSearch] = useState('')
  const [oppResults, setOppResults] = useState<any[]>([])
  const [oppSelected, setOppSelected] = useState<{ id: number; name: string } | null>(null)
  const [oppTeam, setOppTeam] = useState('')

  function toggleYear(y: string) {
    setSelectedYears(prev => prev.includes(y) ? prev.filter(v => v !== y) : [...prev, y])
  }

  async function searchOpposition(q: string) {
    setOppSearch(q)
    if (q.trim().length < 2) { setOppResults([]); return }
    const ptype = oppType === 'hitter' ? 'hitter' : 'pitcher'
    try {
      const { data } = await supabase.rpc('search_all_players', { search_term: q.trim(), player_type: ptype, result_limit: 6 })
      setOppResults(data || [])
    } catch { setOppResults([]) }
  }

  function selectOpp(p: any) {
    setOppSelected({ id: p.player_id, name: p.player_name })
    setOppSearch('')
    setOppResults([])
  }

  function generate() {
    const params = new URLSearchParams()
    params.set('playerId', String(playerId))
    params.set('playerName', playerName)
    params.set('type', dashboardType)
    if (templateId) params.set('templateId', templateId)
    params.set('mode', mode)
    if (selectedYears.length > 0) params.set('years', selectedYears.join(','))
    if (useCustomDates) {
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
    }
    if (oppType !== 'none') {
      params.set('oppType', oppType)
      if (oppType === 'team' && oppTeam) {
        params.set('oppId', oppTeam)
        params.set('oppName', oppTeam)
      } else if (oppSelected) {
        params.set('oppId', String(oppSelected.id))
        params.set('oppName', oppSelected.name)
      }
    }
    router.push(`/reports?${params.toString()}`)
  }

  const oppLabel = dashboardType === 'pitching' ? 'vs. Hitter' : 'vs. Pitcher'
  const oppSearchType = dashboardType === 'pitching' ? 'hitter' : 'pitcher'

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-[480px] max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Generate Report</h2>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              {playerName} &middot; {dashboardType}
              {templateName && <span className="text-emerald-400 ml-1">&middot; {templateName}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition text-lg">&times;</button>
        </div>

        {/* Mode Selector (pitching only) */}
        {dashboardType === 'pitching' && (
          <div className="mb-5">
            <label className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider block mb-2">Mode</label>
            <div className="flex gap-2">
              <button onClick={() => setMode('default')}
                className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-medium border transition ${
                  mode === 'default'
                    ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}>
                Default
              </button>
              <button onClick={() => setMode('vs_similar_stuff')}
                className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-medium border transition ${
                  mode === 'vs_similar_stuff'
                    ? 'bg-amber-600/20 border-amber-600 text-amber-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}>
                vs. Similar Stuff
              </button>
            </div>
            {mode === 'vs_similar_stuff' && (
              <p className="text-[10px] text-amber-400/60 mt-1.5">
                Auto-generates velocity/movement range filters from {playerName}&apos;s pitch averages
              </p>
            )}
          </div>
        )}

        {/* Year / Date */}
        <div className="mb-5">
          <label className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider block mb-2">Season</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {availableYears.map(y => (
              <button key={y} onClick={() => toggleYear(y)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition ${
                  selectedYears.includes(y)
                    ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}>{y}</button>
            ))}
            {selectedYears.length > 0 && (
              <button onClick={() => setSelectedYears([])} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition ml-1">Clear</button>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={useCustomDates} onChange={e => setUseCustomDates(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 w-3.5 h-3.5" />
            <span className="text-[11px] text-zinc-400">Custom date range</span>
          </label>
          {useCustomDates && (
            <div className="flex gap-2 mt-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:border-emerald-600 focus:outline-none" />
              <span className="text-zinc-600 self-center text-[11px]">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:border-emerald-600 focus:outline-none" />
            </div>
          )}
        </div>

        {/* Opposition */}
        <div className="mb-6">
          <label className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider block mb-2">Opposition</label>
          <div className="flex gap-2 mb-3">
            <button onClick={() => { setOppType('none'); setOppSelected(null); setOppTeam('') }}
              className={`px-3 py-1.5 rounded text-[11px] font-medium border transition ${
                oppType === 'none' ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}>None</button>
            <button onClick={() => { setOppType(oppSearchType as any); setOppSelected(null) }}
              className={`px-3 py-1.5 rounded text-[11px] font-medium border transition ${
                oppType === oppSearchType ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}>{oppLabel}</button>
            <button onClick={() => { setOppType('team'); setOppSelected(null) }}
              className={`px-3 py-1.5 rounded text-[11px] font-medium border transition ${
                oppType === 'team' ? 'bg-emerald-600/20 border-emerald-600 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}>vs. Team</button>
          </div>

          {(oppType === 'hitter' || oppType === 'pitcher') && (
            <div className="relative">
              {oppSelected ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg">
                  <span className="text-[12px] text-white flex-1">{oppSelected.name}</span>
                  <button onClick={() => setOppSelected(null)} className="text-zinc-500 hover:text-red-400 transition text-sm">&times;</button>
                </div>
              ) : (
                <>
                  <input type="text" value={oppSearch} onChange={e => searchOpposition(e.target.value)}
                    placeholder={`Search ${oppType}...`}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-[12px] text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none" />
                  {oppResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                      {oppResults.map((p: any) => (
                        <button key={p.player_id} onClick={() => selectOpp(p)}
                          className="w-full text-left px-3 py-2 text-[12px] text-zinc-300 hover:bg-zinc-700 hover:text-white transition border-b border-zinc-700/30 last:border-0">
                          {p.player_name}
                          <span className="text-zinc-500 ml-2 text-[10px]">{p.player_position}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {oppType === 'team' && (
            <select value={oppTeam} onChange={e => setOppTeam(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-[12px] text-white focus:border-emerald-600 focus:outline-none">
              <option value="">Select team...</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {/* Generate */}
        <button onClick={generate}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">
          Generate Report
        </button>
      </div>
    </div>
  )
}
