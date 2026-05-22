'use client'

import { useState, useEffect } from 'react'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import type { LeaderboardConfig as LeaderboardConfigType } from '@/lib/producerTypes'

interface Props {
  onChange: (config: LeaderboardConfigType | null) => void
}

const LEADERBOARD_METRICS = SCENE_METRICS.filter(m => m.group && m.value !== 'player_name')

export default function LeaderboardConfig({ onChange }: Props) {
  const [metric, setMetric] = useState('avg_velo')
  const [playerType, setPlayerType] = useState<'pitcher' | 'batter'>('pitcher')
  const [count, setCount] = useState(5)
  const [season, setSeason] = useState(new Date().getFullYear())

  useEffect(() => {
    const meta = SCENE_METRICS.find(m => m.value === metric)
    onChange({
      metric,
      metricLabel: meta?.label || metric,
      playerType,
      count,
      season,
    })
  }, [metric, playerType, count, season, onChange])

  return (
    <div className="space-y-3">
      {/* Player type toggle */}
      <div className="flex gap-1 p-0.5 bg-zinc-800 rounded">
        {(['pitcher', 'batter'] as const).map(t => (
          <button
            key={t}
            onClick={() => setPlayerType(t)}
            className={`flex-1 text-xs py-1.5 rounded transition
              ${playerType === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t === 'pitcher' ? 'Pitcher' : 'Batter'}
          </button>
        ))}
      </div>

      {/* Metric picker */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Metric</label>
        <select
          value={metric}
          onChange={e => setMetric(e.target.value)}
          className="w-full h-9 px-3 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:border-emerald-500/50"
        >
          {LEADERBOARD_METRICS.map(m => (
            <option key={m.value} value={m.value}>
              {m.label} {m.group ? `(${m.group})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Count */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Count</label>
        <div className="flex gap-1">
          {[3, 5, 7, 10].map(n => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={`flex-1 text-xs py-1.5 rounded transition
                ${count === n
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300'
                }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Season */}
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
