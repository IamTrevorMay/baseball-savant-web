'use client'

// Player search for Compare. Searches two rosters at once and merges them:
//
//   lahman_people   — all of history, and the only place a lahman_id comes
//                     from, which is what every Lahman stat query needs
//   players         — the Statcast roster, which has this season's rookies
//                     before the Lahman import catches up
//
// Merged on mlb_id, Lahman record winning because it carries both ids. A
// player found only in `players` still works — they just have no Lahman
// sections until the next import.

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { CompareGroup } from '@/lib/compareMetrics'

export interface ComparePlayerRef {
  /** Stable client key: the mlb id when we have one, else the lahman id. */
  key: string
  name: string
  mlbId: number | null
  lahmanId: string | null
  /** "1959–1980", or null when we only know them from Statcast. */
  years: string | null
  team: string | null
  hasStatcast: boolean
}

interface LahmanHit {
  lahman_id: string
  mlb_id: number | null
  name_first: string | null
  name_last: string | null
  debut: string | null
  final_game: string | null
  has_statcast: boolean
}

const yearOf = (d: string | null) => (d ? d.slice(0, 4) : null)

function lahmanToRef(h: LahmanHit): ComparePlayerRef {
  const from = yearOf(h.debut)
  const to = yearOf(h.final_game)
  return {
    key: h.mlb_id != null ? String(h.mlb_id) : h.lahman_id,
    name: `${h.name_first ?? ''} ${h.name_last ?? ''}`.trim(),
    mlbId: h.mlb_id != null ? Number(h.mlb_id) : null,
    lahmanId: h.lahman_id,
    years: from ? (to && to !== from ? `${from}–${to}` : from) : null,
    team: null,
    hasStatcast: !!h.has_statcast,
  }
}

/** "Last, First" -> "First Last"; the Statcast roster stores the flipped form. */
function flip(name: string): string {
  const i = name.indexOf(',')
  return i === -1 ? name : `${name.slice(i + 1).trim()} ${name.slice(0, i).trim()}`
}

interface Props {
  group: CompareGroup
  onSelect: (player: ComparePlayerRef) => void
  onCancel?: () => void
  autoFocus?: boolean
  /** Keys already in the comparison, greyed out in the list. */
  takenKeys?: string[]
}

export default function ComparePlayerPicker({ group, onSelect, onCancel, autoFocus, takenKeys = [] }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ComparePlayerRef[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  // Results derive from the query, so a too-short query clears them at
  // render time rather than via a setState-in-effect cascade.
  const term = query.trim()
  const active = term.length >= 2
  const shownResults = active ? results : []

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    const t = setTimeout(async () => {
      setSearching(true)
      const rpc = group === 'hitting' ? 'search_batters' : 'search_players'
      const [lahmanRes, statcastRes] = await Promise.all([
        fetch(`/api/lahman/search?q=${encodeURIComponent(term)}&limit=10`)
          .then(r => r.json())
          .catch(() => ({ results: [] })),
        supabase.rpc(rpc, { search_term: term, result_limit: 8 }).then(
          r => r.data as Record<string, unknown>[] | null,
          () => null,
        ),
      ])
      if (cancelled) return

      const merged: ComparePlayerRef[] = ((lahmanRes?.results || []) as LahmanHit[]).map(lahmanToRef)
      const seen = new Set(merged.map(r => (r.mlbId != null ? String(r.mlbId) : r.key)))

      for (const row of statcastRes || []) {
        const id = Number(row.pitcher ?? row.batter)
        if (!isFinite(id) || seen.has(String(id))) continue
        seen.add(String(id))
        merged.push({
          key: String(id),
          name: flip(String(row.player_name ?? '')),
          mlbId: id,
          lahmanId: null,
          years: row.latest_season != null ? String(row.latest_season) : null,
          team: row.team ? String(row.team) : null,
          hasStatcast: true,
        })
      }

      setResults(merged.slice(0, 12))
      setSearching(false)
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [active, term, group])

  const taken = new Set(takenKeys)

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${group === 'hitting' ? 'hitters' : 'pitchers'}…`}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
        />
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-zinc-600 hover:text-zinc-300 text-sm px-1"
            title="Cancel"
          >
            ✕
          </button>
        )}
      </div>

      {active && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-72 overflow-y-auto">
          {searching && shownResults.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-500">Searching…</div>
          )}
          {!searching && shownResults.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-500">No players found.</div>
          )}
          {shownResults.map(r => {
            const already = taken.has(r.key)
            return (
              <button
                key={`${r.key}-${r.lahmanId ?? ''}`}
                disabled={already}
                onClick={() => { onSelect(r); setQuery('') }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition ${
                  already ? 'opacity-40 cursor-default' : 'hover:bg-zinc-700/40'
                }`}
              >
                <span className="text-sm text-zinc-200 flex-1 truncate">{r.name}</span>
                {r.team && <span className="text-[10px] text-zinc-500">{r.team}</span>}
                {r.years && <span className="text-[10px] text-zinc-500 tabular-nums">{r.years}</span>}
                {r.hasStatcast && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Has Statcast data" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
