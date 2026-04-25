'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PlayerSearchValue } from '@/lib/imagine/types'

/**
 * Compact, debounced player search input used inside Imagine filter
 * panels. Hits search_all_players / search_players / search_batters
 * via supabase.rpc and writes back { playerId, playerName } when a
 * result is picked.
 */
export default function PlayerSearchField({
  value, playerType, placeholder, onChange,
}: {
  value: PlayerSearchValue
  playerType: 'pitcher' | 'batter' | 'all'
  placeholder?: string
  onChange: (v: PlayerSearchValue) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ player_name: string; pitcher?: number; batter?: number; team?: string; total_pitches?: number }>>([])
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      const rpcName = playerType === 'batter' ? 'search_batters'
        : playerType === 'pitcher' ? 'search_players'
        : 'search_all_players'
      const { data } = await supabase.rpc(rpcName, { search_term: query.trim(), result_limit: 8 })
      if (data) setResults(data as any)
    }, 200)
    return () => clearTimeout(t)
  }, [query, playerType])

  const idKey = playerType === 'batter' ? 'batter' : 'pitcher'

  if (value.playerId) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs">
        <span className="flex-1 text-zinc-200 truncate">{value.playerName}</span>
        <button
          onClick={() => onChange({ playerId: null, playerName: '' })}
          className="text-zinc-500 hover:text-zinc-300"
          aria-label="Clear"
        >&#x2715;</button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 px-2 py-1.5 focus:outline-none focus:border-emerald-500"
        value={query}
        placeholder={placeholder || 'Search players...'}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
      />
      {focused && results.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl max-h-64 overflow-auto">
          {results.map((p, i) => {
            const id = (p as any)[idKey] ?? p.pitcher ?? p.batter
            return (
              <button
                key={`${id ?? p.player_name}-${i}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (id) onChange({ playerId: Number(id), playerName: p.player_name })
                  setQuery('')
                  setResults([])
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-800 flex items-center justify-between gap-2"
              >
                <span className="text-xs text-zinc-200 truncate">{p.player_name}</span>
                <span className="text-[10px] text-zinc-500 shrink-0">{p.team || ''}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
