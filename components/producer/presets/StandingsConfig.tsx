'use client'

import { useState, useEffect } from 'react'
import type { StandingsConfig as StandingsConfigType } from '@/lib/producerTypes'

interface Props {
  onChange: (config: StandingsConfigType | null) => void
}

const DIVISIONS = [
  { value: 'ALE', label: 'AL East' },
  { value: 'ALC', label: 'AL Central' },
  { value: 'ALW', label: 'AL West' },
  { value: 'NLE', label: 'NL East' },
  { value: 'NLC', label: 'NL Central' },
  { value: 'NLW', label: 'NL West' },
  { value: 'AL', label: 'Full AL' },
  { value: 'NL', label: 'Full NL' },
  { value: 'MLB', label: 'Full MLB' },
]

export default function StandingsConfig({ onChange }: Props) {
  const [division, setDivision] = useState('ALE')
  const [season, setSeason] = useState(new Date().getFullYear())

  useEffect(() => {
    onChange({ division, season })
  }, [division, season, onChange])

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Division</label>
        <div className="grid grid-cols-3 gap-1">
          {DIVISIONS.map(d => (
            <button
              key={d.value}
              onClick={() => setDivision(d.value)}
              className={`text-xs py-1.5 rounded transition
                ${division === d.value
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300'
                }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Season</label>
        <input
          type="number"
          value={season}
          onChange={e => setSeason(parseInt(e.target.value) || season)}
          className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:border-emerald-500/50"
        />
      </div>
    </div>
  )
}
