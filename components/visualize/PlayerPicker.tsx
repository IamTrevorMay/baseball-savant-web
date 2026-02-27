'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface PlayerResult {
  id: number
  name: string
  team?: string
  position?: string
}

interface Props {
  label?: string
  playerType?: 'pitcher' | 'hitter'
  onSelect: (playerId: number, playerName: string) => void
}

export default function PlayerPicker({ label = 'Search for a player...', playerType = 'pitcher', onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const search = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([])
      setShowDropdown(false)
      return
    }
    setLoading(true)
    try {
      if (playerType === 'hitter') {
        const { data, error } = await supabase.rpc('search_all_players', {
          search_term: term.trim(),
          player_type: 'hitter',
          result_limit: 8,
        })
        if (!error && data) {
          setResults((data as any[]).map(d => ({
            id: d.player_id,
            name: d.player_name,
            team: d.team,
            position: undefined,
          })))
          setShowDropdown(true)
        }
      } else {
        const { data, error } = await supabase.rpc('search_players', {
          search_term: term.trim(),
          result_limit: 8,
        })
        if (!error && data) {
          setResults((data as any[]).map(d => ({
            id: d.pitcher,
            name: d.player_name,
            team: d.team,
            position: undefined,
          })))
          setShowDropdown(true)
        }
      }
    } catch (err) {
      console.error('PlayerPicker search error:', err)
    } finally {
      setLoading(false)
    }
  }, [playerType])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    setSelectedName(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 250)
  }

  function handleSelect(player: PlayerResult) {
    setSelectedName(player.name)
    setQuery(player.name)
    setShowDropdown(false)
    setResults([])
    onSelect(player.id, player.name)
  }

  function handleFocus() {
    if (results.length > 0) setShowDropdown(true)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder={label}
          autoComplete="off"
          className="
            w-full px-3 py-2 pl-9
            bg-zinc-800 border border-zinc-700 rounded-lg
            text-sm text-zinc-100 placeholder-zinc-500
            focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30
            transition
          "
        />
        {/* Search icon */}
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        {/* Loading spinner */}
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        )}
        {/* Clear / selected indicator */}
        {selectedName && !loading && (
          <button
            onClick={() => { setQuery(''); setSelectedName(null); setResults([]) }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {showDropdown && results.length > 0 && (
        <div className="
          absolute top-full left-0 right-0 mt-1 z-50
          bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl
          overflow-hidden
        ">
          {results.map((player) => (
            <button
              key={player.id}
              onClick={() => handleSelect(player)}
              className="
                w-full text-left px-3 py-2
                hover:bg-zinc-700/70 transition
                flex items-center justify-between gap-2
                border-b border-zinc-700/50 last:border-b-0
              "
            >
              <span className="text-sm text-zinc-100 truncate">{player.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                {player.position && (
                  <span className="text-[10px] text-zinc-500 font-mono uppercase">
                    {player.position}
                  </span>
                )}
                {player.team && (
                  <span className="text-[10px] text-cyan-400/80 font-medium">
                    {player.team}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results state */}
      {showDropdown && !loading && query.trim() && results.length === 0 && (
        <div className="
          absolute top-full left-0 right-0 mt-1 z-50
          bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl
          px-3 py-3
        ">
          <p className="text-xs text-zinc-500 text-center">No players found for &quot;{query}&quot;</p>
        </div>
      )}
    </div>
  )
}
