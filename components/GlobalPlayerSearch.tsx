'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Result { id: number; player_name: string; team: string }

export default function GlobalPlayerSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [pitchers, setPitchers] = useState<Result[]>([])
  const [hitters, setHitters] = useState<Result[]>([])
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0) // discard stale responses

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const doSearch = useCallback(async (term: string) => {
    const seq = ++seqRef.current
    const [pRes, hRes] = await Promise.all([
      supabase.rpc('search_all_players', { search_term: term, player_type: 'pitcher', result_limit: 4 }),
      supabase.rpc('search_all_players', { search_term: term, player_type: 'hitter', result_limit: 4 }),
    ])
    if (seq !== seqRef.current) return // stale
    setPitchers(pRes.data || [])
    setHitters(hRes.data || [])
    setShow(true)
  }, [])

  function handleChange(value: string) {
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    const trimmed = value.trim()
    if (trimmed.length < 2) { setPitchers([]); setHitters([]); setShow(false); return }
    timerRef.current = setTimeout(() => doSearch(trimmed), 250)
  }

  function navigate(id: number, type: 'pitcher' | 'hitter') {
    router.push(type === 'pitcher' ? `/player/${id}` : `/hitter/${id}`)
    setShow(false)
    setQuery('')
    setPitchers([])
    setHitters([])
  }

  const hasResults = pitchers.length > 0 || hitters.length > 0

  return (
    <div className="relative ml-4 hidden sm:block" ref={ref}>
      <input
        type="text"
        value={query}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => query.trim().length >= 2 && hasResults && setShow(true)}
        placeholder="Search player..."
        className="w-64 pl-3 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-emerald-600 focus:outline-none"
      />
      {show && hasResults && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl z-50">
          {pitchers.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-800/80">Pitchers</div>
              {pitchers.map((p: any) => (
                <div key={`p-${p.id}`} onClick={() => navigate(p.id, 'pitcher')}
                  className="px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer flex justify-between">
                  <span className="text-white">{p.player_name}</span>
                  <span className="text-zinc-500 text-xs">{p.team}</span>
                </div>
              ))}
            </>
          )}
          {hitters.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-800/80">Hitters</div>
              {hitters.map((p: any) => (
                <div key={`h-${p.id}`} onClick={() => navigate(p.id, 'hitter')}
                  className="px-3 py-2 text-sm hover:bg-zinc-700 cursor-pointer flex justify-between">
                  <span className="text-white">{p.player_name}</span>
                  <span className="text-zinc-500 text-xs">{p.team}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
