'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface PlayerResult {
  player_name: string
  pitcher?: number
  batter?: number
  total_pitches: number
  team: string
}

interface Props {
  type: 'pitcher' | 'batter' | 'all'
  onSelect: (player: PlayerResult) => void
  value: PlayerResult | null
  onClear?: () => void
  placeholder?: string
  label?: string
}

export default function PlayerSearchInput({ type, onSelect, value, onClear, placeholder, label }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      const rpcName = type === 'batter' ? 'search_batters'
        : type === 'all' ? 'search_all_players'
        : 'search_players'
      const { data } = await supabase.rpc(rpcName, {
        search_term: query.trim(),
        result_limit: 8,
      })
      if (data) setResults(data)
    }, 200)
    return () => clearTimeout(t)
  }, [query, type])

  const idKey = type === 'batter' ? 'batter' : 'pitcher'

  if (value) {
    return (
      <div className="relative flex-1 min-w-[200px]">
        {label && <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{label}</label>}
        <div className="flex items-center gap-2 h-9 px-3 bg-zinc-800 rounded border border-zinc-700">
          <span className="text-sm text-white flex-1">{value.player_name}</span>
          <span className="text-[10px] text-zinc-500">{value.team}</span>
          <button
            onClick={() => { onClear?.(); setQuery('') }}
            className="text-zinc-500 hover:text-zinc-300 text-xs ml-1"
          >&#x2715;</button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex-1 min-w-[200px]">
      {label && <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">{label}</label>}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder={placeholder || `Search ${type}...`}
        className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
      />
      {focused && results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-auto">
          {results.map(p => (
            <button
              key={p[idKey] || p.player_name}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(p)
                setQuery('')
                setResults([])
              }}
              className="w-full text-left px-3 py-2 hover:bg-zinc-700/50 flex items-center justify-between"
            >
              <span className="text-sm text-white">{p.player_name}</span>
              <span className="text-[10px] text-zinc-500">{p.team} &middot; {p.total_pitches} pitches</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
