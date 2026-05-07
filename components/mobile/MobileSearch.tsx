'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TEAM_COLORS } from '@/lib/constants'

interface Result { id: number; player_name: string; team: string }

const RECENT_KEY = 'triton-recent-searches'
const MAX_RECENT = 8

function loadRecent(): { id: number; name: string; team: string; type: 'pitcher' | 'hitter' }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch { return [] }
}

function saveRecent(item: { id: number; name: string; team: string; type: 'pitcher' | 'hitter' }) {
  const existing = loadRecent().filter(r => !(r.id === item.id && r.type === item.type))
  const next = [item, ...existing].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

interface Props {
  autoFocus?: boolean
}

export default function MobileSearch({ autoFocus }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [pitchers, setPitchers] = useState<Result[]>([])
  const [hitters, setHitters] = useState<Result[]>([])
  const [searching, setSearching] = useState(false)
  const [focused, setFocused] = useState(false)
  const [recent, setRecent] = useState<ReturnType<typeof loadRecent>>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setRecent(loadRecent())
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const doSearch = useCallback(async (term: string) => {
    setSearching(true)
    const seq = ++seqRef.current
    const [pRes, hRes] = await Promise.all([
      supabase.rpc('search_players', { search_term: term, result_limit: 5 }),
      supabase.rpc('search_batters', { search_term: term, result_limit: 5 }),
    ])
    if (seq !== seqRef.current) return
    setPitchers((pRes.data || []).map((p: any) => ({ id: p.pitcher, player_name: p.player_name, team: p.team })))
    setHitters((hRes.data || []).map((p: any) => ({ id: p.batter, player_name: p.player_name, team: p.team })))
    setSearching(false)
  }, [])

  function handleChange(value: string) {
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    const trimmed = value.trim()
    if (trimmed.length < 2) { setPitchers([]); setHitters([]); setSearching(false); return }
    setSearching(true)
    timerRef.current = setTimeout(() => doSearch(trimmed), 250)
  }

  function navigate(id: number, name: string, team: string, type: 'pitcher' | 'hitter') {
    saveRecent({ id, name, team, type })
    router.push(type === 'pitcher' ? `/player/${id}` : `/hitter/${id}`)
    setQuery('')
    setPitchers([])
    setHitters([])
    setFocused(false)
  }

  function navigateRecent(item: { id: number; name: string; team: string; type: 'pitcher' | 'hitter' }) {
    saveRecent(item)
    router.push(item.type === 'pitcher' ? `/player/${item.id}` : `/hitter/${item.id}`)
    setFocused(false)
  }

  const hasResults = pitchers.length > 0 || hitters.length > 0
  const showResults = focused && (hasResults || searching || (query.length < 2 && recent.length > 0))

  return (
    <div className="relative">
      {/* Search bar */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search players..."
          className="w-full pl-9 pr-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-emerald-600 focus:outline-none"
        />
        {query && (
          <button onClick={() => { setQuery(''); setPitchers([]); setHitters([]); inputRef.current?.focus() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Results overlay */}
      {showResults && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFocused(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-[70vh] overflow-y-auto">
            {searching && (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            )}

            {!searching && query.length < 2 && recent.length > 0 && (
              <>
                <div className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Recent</span>
                  <button onClick={() => { localStorage.removeItem(RECENT_KEY); setRecent([]) }} className="text-zinc-600 hover:text-zinc-400">Clear</button>
                </div>
                {recent.map(r => (
                  <div key={`${r.type}-${r.id}`}
                    onClick={() => navigateRecent(r)}
                    className="flex items-center gap-3 px-4 py-2.5 active:bg-zinc-700/50 cursor-pointer">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                      style={{ backgroundColor: TEAM_COLORS[r.team] || '#52525b' }}>{r.team}</div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white">{r.name}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 uppercase">{r.type}</span>
                  </div>
                ))}
              </>
            )}

            {!searching && hasResults && (
              <>
                {pitchers.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-800/80">Pitchers</div>
                    {pitchers.map(p => (
                      <div key={`p-${p.id}`}
                        onClick={() => navigate(p.id, p.player_name, p.team, 'pitcher')}
                        className="flex items-center gap-3 px-4 py-2.5 active:bg-zinc-700/50 cursor-pointer">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                          style={{ backgroundColor: TEAM_COLORS[p.team] || '#52525b' }}>{p.team}</div>
                        <span className="text-sm text-white flex-1">{p.player_name}</span>
                        <span className="text-[10px] text-zinc-600">{p.team}</span>
                      </div>
                    ))}
                  </>
                )}
                {hitters.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-800/80">Hitters</div>
                    {hitters.map(p => (
                      <div key={`h-${p.id}`}
                        onClick={() => navigate(p.id, p.player_name, p.team, 'hitter')}
                        className="flex items-center gap-3 px-4 py-2.5 active:bg-zinc-700/50 cursor-pointer">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                          style={{ backgroundColor: TEAM_COLORS[p.team] || '#52525b' }}>{p.team}</div>
                        <span className="text-sm text-white flex-1">{p.player_name}</span>
                        <span className="text-[10px] text-zinc-600">{p.team}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {!searching && query.length >= 2 && !hasResults && (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No players found</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
