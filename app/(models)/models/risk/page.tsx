'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { computePURI } from '@/lib/engines/puri'
import { RiskDashboard } from '@/components/models/RiskDashboard'
import type { RiskData, PURIOutput } from '@/lib/engines/types'

interface PlayerResult {
  player_name: string
  pitcher?: number
  total_pitches: number
  team: string
}

const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020]

export default function RiskPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [selectedPitcher, setSelectedPitcher] = useState<PlayerResult | null>(null)
  const [focused, setFocused] = useState(false)
  const [season, setSeason] = useState(2025)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [riskData, setRiskData] = useState<RiskData | null>(null)

  // Debounced pitcher search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_players', {
        search_term: query.trim(),
        result_limit: 8,
      })
      if (data) setResults(data)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const handleAnalyze = useCallback(async () => {
    if (!selectedPitcher?.pitcher) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/models/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pitcherId: selectedPitcher.pitcher,
          season,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch risk data')
      }
      const data: RiskData = await res.json()
      setRiskData(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedPitcher, season])

  // Compute PURI from risk data
  const puriResult: PURIOutput | null = useMemo(() => {
    if (!riskData?.gameLog?.length) return null
    return computePURI({
      gameLog: riskData.gameLog,
      inningVelo: riskData.inningVelo,
      currentDate: new Date().toISOString().slice(0, 10),
    })
  }, [riskData])

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Search bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          {/* Pitcher search */}
          <div className="relative flex-1 min-w-[250px]">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Pitcher</label>
            {selectedPitcher ? (
              <div className="flex items-center gap-2 h-9 px-3 bg-zinc-800 rounded border border-zinc-700">
                <span className="text-sm text-white flex-1">{selectedPitcher.player_name}</span>
                <span className="text-[10px] text-zinc-500">{selectedPitcher.team}</span>
                <button
                  onClick={() => { setSelectedPitcher(null); setQuery(''); setRiskData(null) }}
                  className="text-zinc-500 hover:text-zinc-300 text-xs ml-1"
                >&#x2715;</button>
              </div>
            ) : (
              <>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setTimeout(() => setFocused(false), 200)}
                  placeholder="Search pitcher..."
                  className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                />
                {focused && results.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-auto">
                    {results.map(p => (
                      <button
                        key={p.pitcher}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setSelectedPitcher(p)
                          setQuery('')
                          setResults([])
                          setRiskData(null)
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-700/50 flex items-center justify-between"
                      >
                        <span className="text-sm text-white">{p.player_name}</span>
                        <span className="text-[10px] text-zinc-500">{p.team} &middot; {p.total_pitches} pitches</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Season */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Season</label>
            <select
              value={season}
              onChange={e => { setSeason(Number(e.target.value)); setRiskData(null) }}
              className="h-9 px-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={!selectedPitcher || loading}
            className="h-9 px-5 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded transition"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 mb-4 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Results */}
      {!loading && riskData && puriResult && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-white">{riskData.pitcherName}</h2>
            <span className="text-zinc-600 text-xs ml-auto">Season: {season}</span>
          </div>
          <RiskDashboard result={puriResult} pitcherName={riskData.pitcherName} season={season} />
        </div>
      )}

      {/* Empty state */}
      {!loading && !riskData && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <p className="text-zinc-500 text-sm max-w-md">
            Select a pitcher and season, then click Analyze to view workload risk assessment.
          </p>
        </div>
      )}
    </div>
  )
}
