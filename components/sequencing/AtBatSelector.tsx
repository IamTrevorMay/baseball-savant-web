'use client'

import { useState, useMemo } from 'react'

export interface AtBatGroup {
  key: string            // game_pk + at_bat_number
  game_pk: number
  at_bat_number: number
  game_date: string
  batter_name: string
  inning: number
  inning_topbot: string
  stand: string
  result: string | null  // events from last pitch
  pitchCount: number
  pitches: any[]         // raw pitch rows
}

interface Props {
  atBats: AtBatGroup[]
  selected: AtBatGroup | null
  onSelect: (ab: AtBatGroup) => void
}

export default function AtBatSelector({ atBats, selected, onSelect }: Props) {
  const [showAll, setShowAll] = useState(false)
  const LIMIT = 200

  // Group by game_date for display
  const grouped = useMemo(() => {
    const map = new Map<string, AtBatGroup[]>()
    for (const ab of atBats) {
      const date = ab.game_date?.slice(0, 10) || 'Unknown'
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(ab)
    }
    return map
  }, [atBats])

  const visible = showAll ? atBats : atBats.slice(0, LIMIT)
  const visibleGrouped = useMemo(() => {
    const map = new Map<string, AtBatGroup[]>()
    for (const ab of visible) {
      const date = ab.game_date?.slice(0, 10) || 'Unknown'
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(ab)
    }
    return map
  }, [visible])

  if (atBats.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected?.key || ''}
        onChange={e => {
          const ab = atBats.find(a => a.key === e.target.value)
          if (ab) onSelect(ab)
        }}
        className="h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none max-w-md truncate"
      >
        <option value="" disabled>Select an at-bat...</option>
        {[...visibleGrouped.entries()].map(([date, abs]) => (
          <optgroup key={date} label={date}>
            {abs.map(ab => {
              const inn = `${ab.inning_topbot === 'Top' ? 'T' : 'B'}${ab.inning}`
              const result = ab.result?.replace(/_/g, ' ') || '—'
              return (
                <option key={ab.key} value={ab.key}>
                  vs. {ab.batter_name} — {inn} — {result} ({ab.pitchCount} pitches)
                </option>
              )
            })}
          </optgroup>
        ))}
      </select>

      {!showAll && atBats.length > LIMIT && (
        <button
          onClick={() => setShowAll(true)}
          className="text-[10px] text-emerald-400 hover:text-emerald-300 whitespace-nowrap"
        >
          Show all ({atBats.length})
        </button>
      )}
    </div>
  )
}
