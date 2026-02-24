'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { GameCallPanel } from '@/components/models/GameCallPanel'
import type { GameCallData } from '@/lib/engines/types'

interface PlayerResult {
  player_name: string
  pitcher?: number
  batter?: number
  total_pitches: number
  team: string
}

const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020]

export default function GameCallPage() {
  const [pitcherQuery, setPitcherQuery] = useState('')
  const [batterQuery, setBatterQuery] = useState('')
  const [pitcherResults, setPitcherResults] = useState<PlayerResult[]>([])
  const [batterResults, setBatterResults] = useState<PlayerResult[]>([])
  const [selectedPitcher, setSelectedPitcher] = useState<PlayerResult | null>(null)
  const [selectedBatter, setSelectedBatter] = useState<PlayerResult | null>(null)
  const [pitcherFocused, setPitcherFocused] = useState(false)
  const [batterFocused, setBatterFocused] = useState(false)
  const [season, setSeason] = useState(2025)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<GameCallData | null>(null)

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
      const res = await fetch('/api/models/gamecall', {
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
        throw new Error(err.error || 'Failed to fetch game call data')
      }
      const result: GameCallData = await res.json()
      setData(result)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedPitcher, selectedBatter, season])

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
                  onClick={() => { setSelectedPitcher(null); setPitcherQuery(''); setData(null) }}
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
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setSelectedPitcher(p)
                          setPitcherQuery('')
                          setPitcherResults([])
                          setData(null)
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
                  onClick={() => { setSelectedBatter(null); setBatterQuery(''); setData(null) }}
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
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setSelectedBatter(p)
                          setBatterQuery('')
                          setBatterResults([])
                          setData(null)
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
              onChange={e => { setSeason(Number(e.target.value)); setData(null) }}
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-white">{data.pitcherName}</h2>
            <span className="text-zinc-600 text-sm">vs</span>
            <h2 className="text-lg font-bold text-white">{data.batterName}</h2>
            <span className="text-zinc-600 text-xs ml-auto">Season: {season}</span>
          </div>
          <GameCallPanel data={data} />
        </div>
      )}

      {/* Empty state */}
      {!loading && !data && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <p className="text-zinc-500 text-sm max-w-md">
            Select a pitcher and batter, then click Analyze to build pitch sequences and get real-time game calling recommendations.
          </p>
        </div>
      )}
    </div>
  )
}
