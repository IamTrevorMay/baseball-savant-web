'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { computePAIE } from '@/lib/engines/paie'
import { MatchupPanel } from '@/components/models/MatchupPanel'
import type { MatchupData, PAIEOutput } from '@/lib/engines/types'

interface PlayerResult {
  player_name: string
  pitcher?: number
  batter?: number
  total_pitches: number
  team: string
}

const COUNTS = [
  '0-0', '1-0', '2-0', '3-0',
  '0-1', '1-1', '2-1', '3-1',
  '0-2', '1-2', '2-2', '3-2',
]
const TTO_OPTIONS = [
  { label: '1st', value: 1 },
  { label: '2nd', value: 2 },
  { label: '3rd+', value: 3 },
]
const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020]

export default function MatchupPage() {
  // Player search state
  const [pitcherQuery, setPitcherQuery] = useState('')
  const [batterQuery, setBatterQuery] = useState('')
  const [pitcherResults, setPitcherResults] = useState<PlayerResult[]>([])
  const [batterResults, setBatterResults] = useState<PlayerResult[]>([])
  const [selectedPitcher, setSelectedPitcher] = useState<PlayerResult | null>(null)
  const [selectedBatter, setSelectedBatter] = useState<PlayerResult | null>(null)
  const [pitcherFocused, setPitcherFocused] = useState(false)
  const [batterFocused, setBatterFocused] = useState(false)

  // Analysis params
  const [count, setCount] = useState('0-0')
  const [tto, setTto] = useState(1)
  const [season, setSeason] = useState(2025)

  // Results
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matchupData, setMatchupData] = useState<MatchupData | null>(null)

  // Debounced pitcher search
  useEffect(() => {
    if (!pitcherQuery.trim()) { setPitcherResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_players', {
        search_term: pitcherQuery.trim(),
        result_limit: 8,
      })
      if (data) setPitcherResults(data)
    }, 200)
    return () => clearTimeout(t)
  }, [pitcherQuery])

  // Debounced batter search
  useEffect(() => {
    if (!batterQuery.trim()) { setBatterResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_batters', {
        search_term: batterQuery.trim(),
        result_limit: 8,
      })
      if (data) setBatterResults(data)
    }, 200)
    return () => clearTimeout(t)
  }, [batterQuery])

  const handleAnalyze = useCallback(async () => {
    if (!selectedPitcher?.pitcher || !selectedBatter?.batter) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/models/matchup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pitcherId: selectedPitcher.pitcher,
          batterId: selectedBatter.batter,
          season,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch matchup data')
      }
      const data: MatchupData = await res.json()
      setMatchupData(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedPitcher, selectedBatter, season])

  // Compute PAIE from matchup data + current count/TTO (instant re-computation)
  const paieResult: PAIEOutput | null = useMemo(() => {
    if (!matchupData?.arsenal?.length) return null
    const [balls, strikes] = count.split('-').map(Number)
    return computePAIE({
      arsenal: matchupData.arsenal,
      veloTrend: matchupData.veloTrend,
      batterZones: matchupData.batterZones,
      chaseProfile: matchupData.chaseProfile,
      countProfile: matchupData.countProfile,
      h2h: matchupData.h2h,
      count: { balls, strikes },
      tto,
    })
  }, [matchupData, count, tto])

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Search bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          {/* Pitcher search */}
          <div className="relative flex-1 min-w-[200px]">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Pitcher</label>
            {selectedPitcher ? (
              <div className="flex items-center gap-2 h-9 px-3 bg-zinc-800 rounded border border-zinc-700">
                <span className="text-sm text-white flex-1">{selectedPitcher.player_name}</span>
                <span className="text-[10px] text-zinc-500">{selectedPitcher.team}</span>
                <button
                  onClick={() => { setSelectedPitcher(null); setPitcherQuery(''); setMatchupData(null) }}
                  className="text-zinc-500 hover:text-zinc-300 text-xs ml-1"
                >&#x2715;</button>
              </div>
            ) : (
              <>
                <input
                  value={pitcherQuery}
                  onChange={e => setPitcherQuery(e.target.value)}
                  onFocus={() => setPitcherFocused(true)}
                  onBlur={() => setTimeout(() => setPitcherFocused(false), 200)}
                  placeholder="Search pitcher..."
                  className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                />
                {pitcherFocused && pitcherResults.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-auto">
                    {pitcherResults.map(p => (
                      <button
                        key={p.pitcher}
                        onClick={() => {
                          setSelectedPitcher(p)
                          setPitcherQuery('')
                          setPitcherResults([])
                          setMatchupData(null)
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

          <span className="text-zinc-600 text-lg font-bold pb-1">vs</span>

          {/* Batter search */}
          <div className="relative flex-1 min-w-[200px]">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Batter</label>
            {selectedBatter ? (
              <div className="flex items-center gap-2 h-9 px-3 bg-zinc-800 rounded border border-zinc-700">
                <span className="text-sm text-white flex-1">{selectedBatter.player_name}</span>
                <span className="text-[10px] text-zinc-500">{selectedBatter.team}</span>
                <button
                  onClick={() => { setSelectedBatter(null); setBatterQuery(''); setMatchupData(null) }}
                  className="text-zinc-500 hover:text-zinc-300 text-xs ml-1"
                >&#x2715;</button>
              </div>
            ) : (
              <>
                <input
                  value={batterQuery}
                  onChange={e => setBatterQuery(e.target.value)}
                  onFocus={() => setBatterFocused(true)}
                  onBlur={() => setTimeout(() => setBatterFocused(false), 200)}
                  placeholder="Search batter..."
                  className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                />
                {batterFocused && batterResults.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-auto">
                    {batterResults.map(p => (
                      <button
                        key={p.batter}
                        onClick={() => {
                          setSelectedBatter(p)
                          setBatterQuery('')
                          setBatterResults([])
                          setMatchupData(null)
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

          {/* Count */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Count</label>
            <select
              value={count}
              onChange={e => setCount(e.target.value)}
              className="h-9 px-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              {COUNTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* TTO */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">TTO</label>
            <select
              value={tto}
              onChange={e => setTto(Number(e.target.value))}
              className="h-9 px-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              {TTO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Season */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Season</label>
            <select
              value={season}
              onChange={e => { setSeason(Number(e.target.value)); setMatchupData(null) }}
              className="h-9 px-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={!selectedPitcher || !selectedBatter || loading}
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

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Results */}
      {!loading && matchupData && paieResult && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-white">{matchupData.pitcherName}</h2>
            <span className="text-zinc-600 text-sm">vs</span>
            <h2 className="text-lg font-bold text-white">{matchupData.batterName}</h2>
            <span className="text-zinc-600 text-xs ml-auto">
              Count: {count} &middot; TTO: {tto === 3 ? '3rd+' : tto === 2 ? '2nd' : '1st'} &middot; Season: {season}
            </span>
          </div>
          <MatchupPanel result={paieResult} data={matchupData} />
        </div>
      )}

      {/* Empty state */}
      {!loading && !matchupData && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="5" />
              <circle cx="16" cy="16" r="5" />
              <line x1="11.5" y1="4.5" x2="19.5" y2="12.5" />
            </svg>
          </div>
          <p className="text-zinc-500 text-sm max-w-md">
            Select a pitcher and batter, then click Analyze to get data-driven pitch recommendations.
          </p>
        </div>
      )}
    </div>
  )
}
