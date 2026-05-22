'use client'

import { useState, useEffect } from 'react'
import PlayerQuickPicker from '../PlayerQuickPicker'
import type { ArsenalConfig as ArsenalConfigType } from '@/lib/producerTypes'

interface Props {
  onChange: (config: ArsenalConfigType | null) => void
}

export default function ArsenalConfig({ onChange }: Props) {
  const [player, setPlayer] = useState<{ player_id: number; player_name: string; team: string } | null>(null)
  const [season, setSeason] = useState(new Date().getFullYear())

  useEffect(() => {
    if (!player) { onChange(null); return }
    onChange({
      playerId: player.player_id,
      playerName: player.player_name,
      season,
    })
  }, [player, season, onChange])

  return (
    <div className="space-y-3">
      <PlayerQuickPicker
        type="pitcher"
        value={player}
        onSelect={setPlayer}
        onClear={() => setPlayer(null)}
        label="Pitcher"
      />
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
