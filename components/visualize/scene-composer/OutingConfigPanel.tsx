'use client'

import { useState, useEffect } from 'react'
import { TemplateConfig } from '@/lib/sceneTypes'
import { supabase } from '@/lib/supabase'

interface GameOption {
  game_pk: number
  game_date: string
  opponent: string
  pitches: number
  ip: string
}

interface Props {
  config: TemplateConfig
  onUpdateConfig: (updates: Partial<TemplateConfig>) => void
  onRefresh: () => void
  loading: boolean
}

const YEARS = Array.from({ length: 11 }, (_, i) => 2025 - i)

export default function OutingConfigPanel({ config, onUpdateConfig, onRefresh, loading }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [focused, setFocused] = useState(false)
  const [games, setGames] = useState<GameOption[]>([])
  const [gamesLoading, setGamesLoading] = useState(false)

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

  // Fetch game list when pitcher + season change
  useEffect(() => {
    if (!config.playerId) { setGames([]); return }
    let cancelled = false
    setGamesLoading(true)

    fetch(`/api/pitcher-outing?games=true&pitcherId=${config.playerId}&season=${season}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setGames(data.games || [])
      })
      .catch(() => { if (!cancelled) setGames([]) })
      .finally(() => { if (!cancelled) setGamesLoading(false) })

    return () => { cancelled = true }
  }, [config.playerId, season])

  function selectPlayer(p: any) {
    const id = p.pitcher || p.batter
    onUpdateConfig({ playerId: id, playerName: p.player_name, gamePk: undefined, gameLabel: undefined })
    setQuery('')
    setResults([])
  }

  function clearPlayer() {
    onUpdateConfig({ playerId: undefined, playerName: undefined, gamePk: undefined, gameLabel: undefined })
    setGames([])
  }

  function selectGame(g: GameOption) {
    const label = `${g.game_date} vs ${g.opponent}`
    onUpdateConfig({ gamePk: g.game_pk, gameLabel: label })
  }

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Outing Report</h3>
        <button
          onClick={onRefresh}
          disabled={loading || !config.gamePk}
          className="text-[10px] px-2 py-1 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-40 transition"
        >
          {loading ? 'Loading\u2026' : 'Refresh'}
        </button>
      </div>

      {/* Pitcher Search */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Pitcher</label>
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
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              placeholder="Search pitcher\u2026"
              className="w-full h-8 px-2.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
            {focused && results.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-auto">
                {results.map((p: any) => (
                  <button
                    key={p.pitcher || p.player_name}
                    onMouseDown={e => { e.preventDefault(); selectPlayer(p) }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-700 flex items-center gap-2"
                  >
                    <span className="text-[11px] text-white">{p.player_name}</span>
                    <span className="text-[9px] text-zinc-500">{p.team}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Season */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Season</label>
        <select
          value={season}
          onChange={e => onUpdateConfig({ dateRange: { type: 'season', year: Number(e.target.value) }, gamePk: undefined, gameLabel: undefined })}
          className="w-full h-8 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-emerald-500/50"
        >
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Game Picker */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">
          Game {gamesLoading && <span className="text-emerald-400 ml-1">loading\u2026</span>}
        </label>
        <select
          value={config.gamePk || ''}
          onChange={e => {
            const gp = Number(e.target.value)
            const g = games.find(x => x.game_pk === gp)
            if (g) selectGame(g)
          }}
          disabled={!config.playerId || games.length === 0}
          className="w-full h-8 px-2 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
        >
          <option value="">Select game\u2026</option>
          {games.map(g => (
            <option key={g.game_pk} value={g.game_pk}>
              {g.game_date} vs {g.opponent} ({g.ip} IP, {g.pitches}P)
            </option>
          ))}
        </select>
      </div>

      {/* Title Override */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Title Override</label>
        <input
          value={config.title || ''}
          onChange={e => onUpdateConfig({ title: e.target.value || undefined })}
          placeholder="Auto-generated"
          className="w-full h-8 px-2.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
        />
      </div>

      {/* Status */}
      {config.gamePk && config.gameLabel && (
        <div className="text-[10px] text-zinc-500 bg-zinc-800/50 rounded px-2 py-1.5 border border-zinc-700/50">
          Selected: <span className="text-emerald-400">{config.gameLabel}</span>
        </div>
      )}
    </div>
  )
}
