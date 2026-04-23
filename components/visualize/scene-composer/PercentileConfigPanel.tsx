'use client'

import { useState, useEffect } from 'react'
import { TemplateConfig } from '@/lib/sceneTypes'
import { supabase } from '@/lib/supabase'

interface Props {
  config: TemplateConfig
  onUpdateConfig: (updates: Partial<TemplateConfig>) => void
  onRefresh: () => void
  loading: boolean
}

const YEARS = Array.from({ length: 12 }, (_, i) => 2026 - i)

export default function PercentileConfigPanel({ config, onUpdateConfig, onRefresh, loading }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [focused, setFocused] = useState(false)

  const season = config.dateRange?.type === 'season' ? config.dateRange.year : 2025

  // Debounced player search
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

  function selectPlayer(p: any) {
    const id = p.pitcher || p.batter
    onUpdateConfig({ playerId: id, playerName: p.player_name })
    setQuery('')
    setResults([])
  }

  function clearPlayer() {
    onUpdateConfig({ playerId: undefined, playerName: undefined })
  }

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Percentile Rankings</h3>
        <button
          onClick={onRefresh}
          disabled={loading || !config.playerId}
          className="text-[10px] px-2 py-1 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-40 transition"
        >
          {loading ? 'Loading\u2026' : 'Refresh'}
        </button>
      </div>

      {/* Player Search */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Player</label>
        {config.playerId && config.playerName ? (
          <div className="flex items-center gap-2 h-8 px-2.5 bg-zinc-800 rounded border border-zinc-700">
            <span className="text-[11px] text-white flex-1 truncate">{config.playerName}</span>
            <button onClick={clearPlayer} className="text-zinc-500 hover:text-zinc-300 text-xs">&#x2715;</button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder="Search player..."
              className="w-full h-8 px-2.5 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-600"
            />
            {focused && results.length > 0 && (
              <div className="absolute z-50 w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded shadow-lg max-h-48 overflow-y-auto">
                {results.map((p: any) => (
                  <button
                    key={p.pitcher || p.batter}
                    onClick={() => selectPlayer(p)}
                    className="w-full px-2.5 py-1.5 text-left text-[11px] text-zinc-200 hover:bg-zinc-700/50 truncate"
                  >
                    {p.player_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player Type Toggle */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Type</label>
        <div className="flex gap-1">
          {(['pitcher', 'batter'] as const).map(t => (
            <button
              key={t}
              onClick={() => onUpdateConfig({ playerType: t })}
              className={`flex-1 h-7 text-[10px] rounded transition ${
                config.playerType === t
                  ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-600/50'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
              }`}
            >
              {t === 'pitcher' ? 'Pitcher' : 'Batter'}
            </button>
          ))}
        </div>
      </div>

      {/* Season */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Season</label>
        <select
          value={season}
          onChange={e => onUpdateConfig({ dateRange: { type: 'season', year: parseInt(e.target.value) } })}
          className="w-full h-8 px-2 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-white focus:outline-none focus:border-emerald-600"
        >
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  )
}
