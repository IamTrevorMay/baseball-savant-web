'use client'

import { useState, useEffect } from 'react'
import PlayerQuickPicker from '../PlayerQuickPicker'
import type { MatchupConfig as MatchupConfigType } from '@/lib/producerTypes'

interface Props {
  onChange: (config: MatchupConfigType | null) => void
}

export default function MatchupConfig({ onChange }: Props) {
  const [pitcher, setPitcher] = useState<{ player_id: number; player_name: string; team: string } | null>(null)
  const [batter, setBatter] = useState<{ player_id: number; player_name: string; team: string } | null>(null)
  const [season, setSeason] = useState(new Date().getFullYear())

  useEffect(() => {
    if (!pitcher || !batter) { onChange(null); return }
    onChange({
      pitcherId: pitcher.player_id,
      pitcherName: pitcher.player_name,
      batterId: batter.player_id,
      batterName: batter.player_name,
      season,
    })
  }, [pitcher, batter, season, onChange])

  return (
    <div className="space-y-3">
      <PlayerQuickPicker
        type="pitcher"
        value={pitcher}
        onSelect={setPitcher}
        onClear={() => setPitcher(null)}
        label="Pitcher"
      />
      <PlayerQuickPicker
        type="batter"
        value={batter}
        onSelect={setBatter}
        onClear={() => setBatter(null)}
        label="Batter"
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
