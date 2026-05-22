'use client'

import { useState, useEffect } from 'react'
import PlayerQuickPicker from '../PlayerQuickPicker'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import type { StatLineConfig as StatLineConfigType } from '@/lib/producerTypes'

interface Props {
  onChange: (config: StatLineConfigType | null) => void
}

const PITCHER_DEFAULTS = ['avg_velo', 'whiff_pct', 'k_pct', 'bb_pct', 'csw_pct']
const BATTER_DEFAULTS = ['ba', 'obp', 'slg', 'avg_ev', 'hard_hit_pct']

export default function StatLineConfig({ onChange }: Props) {
  const [player, setPlayer] = useState<{ player_id: number; player_name: string; team: string } | null>(null)
  const [playerType, setPlayerType] = useState<'pitcher' | 'batter'>('pitcher')
  const [season, setSeason] = useState(new Date().getFullYear())
  const [metrics, setMetrics] = useState<string[]>(PITCHER_DEFAULTS)

  useEffect(() => {
    if (!player) { onChange(null); return }
    onChange({
      playerId: player.player_id,
      playerName: player.player_name,
      playerType,
      metrics,
      season,
    })
  }, [player, playerType, season, metrics, onChange])

  const availableMetrics = SCENE_METRICS.filter(m => m.group && m.value !== 'player_name')

  const toggleMetric = (val: string) => {
    setMetrics(prev =>
      prev.includes(val) ? prev.filter(m => m !== val) : prev.length < 8 ? [...prev, val] : prev
    )
  }

  return (
    <div className="space-y-3">
      {/* Player type toggle */}
      <div className="flex gap-1 p-0.5 bg-zinc-800 rounded">
        {(['pitcher', 'batter'] as const).map(t => (
          <button
            key={t}
            onClick={() => {
              setPlayerType(t)
              setMetrics(t === 'pitcher' ? PITCHER_DEFAULTS : BATTER_DEFAULTS)
              setPlayer(null)
            }}
            className={`flex-1 text-xs py-1.5 rounded transition
              ${playerType === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t === 'pitcher' ? 'Pitcher' : 'Batter'}
          </button>
        ))}
      </div>

      {/* Player picker */}
      <PlayerQuickPicker
        type={playerType}
        value={player}
        onSelect={setPlayer}
        onClear={() => setPlayer(null)}
        label="Player"
      />

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

      {/* Metric selection */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">Metrics (max 8)</label>
        <div className="flex flex-wrap gap-1 max-h-32 overflow-auto">
          {availableMetrics.map(m => (
            <button
              key={m.value}
              onClick={() => toggleMetric(m.value)}
              className={`text-[10px] px-2 py-1 rounded transition
                ${metrics.includes(m.value)
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300'
                }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
