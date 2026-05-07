'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDevice } from '@/lib/hooks/useDeviceContext'
import { supabase } from '@/lib/supabase'
import { TEAM_COLORS } from '@/lib/constants'
import ResearchNav from '@/components/ResearchNav'
import MobileShell from '@/components/mobile/MobileShell'

interface PitcherResult { pitcher: number; player_name: string; team: string; total_pitches: number }
interface HitterResult { batter: number; player_name: string; team: string; total_pitches: number }

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

function PlayersContent() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [pitchers, setPitchers] = useState<PitcherResult[]>([])
  const [hitters, setHitters] = useState<HitterResult[]>([])
  const [searching, setSearching] = useState(false)
  const [recent, setRecent] = useState<ReturnType<typeof loadRecent>>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setRecent(loadRecent())
    // Auto-focus on mount
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const doSearch = useCallback(async (term: string) => {
    setSearching(true)
    const seq = ++seqRef.current
    const [pRes, hRes] = await Promise.all([
      supabase.rpc('search_players', { search_term: term, result_limit: 8 }),
      supabase.rpc('search_batters', { search_term: term, result_limit: 8 }),
    ])
    if (seq !== seqRef.current) return
    setPitchers(pRes.data || [])
    setHitters(hRes.data || [])
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
  }

  function navigateRecent(item: { id: number; name: string; team: string; type: 'pitcher' | 'hitter' }) {
    saveRecent(item)
    router.push(item.type === 'pitcher' ? `/player/${item.id}` : `/hitter/${item.id}`)
  }

  function clearRecent() {
    localStorage.removeItem(RECENT_KEY)
    setRecent([])
  }

  const hasResults = pitchers.length > 0 || hitters.length > 0

  return (
    <div className="px-4 py-4">
      {/* Search bar */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Search pitchers and hitters..."
          className="w-full pl-9 pr-9 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:border-emerald-600 focus:outline-none"
        />
        {query && (
          <button onClick={() => { setQuery(''); setPitchers([]); setHitters([]); inputRef.current?.focus() }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Loading */}
      {searching && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Search results */}
      {!searching && hasResults && (
        <div className="space-y-4">
          {pitchers.length > 0 && (
            <div>
              <div className="px-1 pb-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Pitchers</div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-800">
                {pitchers.map(p => (
                  <div key={`p-${p.pitcher}`}
                    onClick={() => navigate(p.pitcher, p.player_name, p.team, 'pitcher')}
                    className="flex items-center gap-3 px-4 py-3 active:bg-zinc-800/80 cursor-pointer">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                      style={{ backgroundColor: TEAM_COLORS[p.team] || '#52525b' }}>{p.team}</div>
                    <span className="text-sm text-white flex-1">{p.player_name}</span>
                    <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          )}
          {hitters.length > 0 && (
            <div>
              <div className="px-1 pb-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Hitters</div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-800">
                {hitters.map(p => (
                  <div key={`h-${p.batter}`}
                    onClick={() => navigate(p.batter, p.player_name, p.team, 'hitter')}
                    className="flex items-center gap-3 px-4 py-3 active:bg-zinc-800/80 cursor-pointer">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                      style={{ backgroundColor: TEAM_COLORS[p.team] || '#52525b' }}>{p.team}</div>
                    <span className="text-sm text-white flex-1">{p.player_name}</span>
                    <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No results */}
      {!searching && query.length >= 2 && !hasResults && (
        <div className="text-center py-12 text-sm text-zinc-500">No players found</div>
      )}

      {/* Recent searches (shown when no active search) */}
      {query.length < 2 && !searching && recent.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Recent Searches</span>
            <button onClick={clearRecent} className="text-[10px] text-zinc-600 hover:text-zinc-400">Clear</button>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-800">
            {recent.map(r => (
              <div key={`${r.type}-${r.id}`}
                onClick={() => navigateRecent(r)}
                className="flex items-center gap-3 px-4 py-3 active:bg-zinc-800/80 cursor-pointer">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                  style={{ backgroundColor: TEAM_COLORS[r.team] || '#52525b' }}>{r.team}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{r.name}</span>
                </div>
                <span className="text-[10px] text-zinc-600 uppercase">{r.type}</span>
                <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — no recent, no query */}
      {query.length < 2 && !searching && recent.length === 0 && (
        <div className="text-center py-16">
          <svg className="w-12 h-12 text-zinc-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <p className="text-sm text-zinc-500">Search for any pitcher or hitter</p>
          <p className="text-xs text-zinc-600 mt-1">Recent searches will appear here</p>
        </div>
      )}
    </div>
  )
}

export default function PlayersPage() {
  const { isMobile, isLoading: deviceLoading } = useDevice()

  if (deviceLoading) return null

  if (isMobile) {
    return (
      <MobileShell title="Players">
        <PlayersContent />
      </MobileShell>
    )
  }

  // Desktop — redirect to explore or show a minimal search page
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <ResearchNav active="/players" />
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold text-white mb-6">Player Search</h2>
        <PlayersContent />
      </div>
    </div>
  )
}
