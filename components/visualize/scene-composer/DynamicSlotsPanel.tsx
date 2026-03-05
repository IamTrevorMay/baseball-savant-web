'use client'

import { DynamicSlot } from '@/lib/sceneTypes'
import PlayerPicker from '@/components/visualize/PlayerPicker'

const PITCH_TYPES = [
  { value: '', label: 'All' },
  { value: 'FF', label: 'Four-Seam' }, { value: 'SI', label: 'Sinker' },
  { value: 'FC', label: 'Cutter' }, { value: 'SL', label: 'Slider' },
  { value: 'CU', label: 'Curveball' }, { value: 'CH', label: 'Changeup' },
  { value: 'FS', label: 'Splitter' }, { value: 'KC', label: 'Knuckle Curve' },
  { value: 'ST', label: 'Sweeper' }, { value: 'SV', label: 'Slurve' },
]

interface Props {
  slots: DynamicSlot[]
  onUpdateSlot: (id: string, updates: Partial<DynamicSlot>) => void
  onAddSlot: () => void
  onRemoveSlot: (id: string) => void
  onFetchAll: () => void
  fetchLoading?: boolean
}

export default function DynamicSlotsPanel({ slots, onUpdateSlot, onAddSlot, onRemoveSlot, onFetchAll, fetchLoading }: Props) {
  return (
    <div className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-3">Dynamic Slots</div>

      {slots.map(slot => (
        <div key={slot.id} className="mb-3 p-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50">
          {/* Editable label */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <input
              type="text"
              value={slot.label}
              onChange={e => onUpdateSlot(slot.id, { label: e.target.value })}
              className="flex-1 bg-transparent text-xs font-semibold text-white border-none outline-none hover:bg-zinc-700/50 focus:bg-zinc-700/50 px-1 py-0.5 rounded transition"
            />
            <button
              onClick={() => onRemoveSlot(slot.id)}
              className="text-zinc-600 hover:text-red-400 text-xs transition shrink-0"
              title="Remove slot"
            >
              {'\u2715'}
            </button>
          </div>

          {/* Player picker */}
          <div className="mb-2">
            <PlayerPicker
              label="Search player..."
              onSelect={(id, name) => onUpdateSlot(slot.id, { playerId: id, playerName: name })}
            />
            {slot.playerName && (
              <div className="text-[10px] text-cyan-400/70 truncate mt-1">{slot.playerName}</div>
            )}
          </div>

          {/* Player type toggle */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] text-zinc-500 shrink-0">Type</span>
            <div className="flex rounded overflow-hidden border border-zinc-700">
              <button
                onClick={() => onUpdateSlot(slot.id, { playerType: 'pitcher' })}
                className={`px-2 py-0.5 text-[10px] transition ${
                  slot.playerType === 'pitcher'
                    ? 'bg-cyan-600/20 text-cyan-300'
                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Pitcher
              </button>
              <button
                onClick={() => onUpdateSlot(slot.id, { playerType: 'batter' })}
                className={`px-2 py-0.5 text-[10px] transition ${
                  slot.playerType === 'batter'
                    ? 'bg-cyan-600/20 text-cyan-300'
                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Batter
              </button>
            </div>
          </div>

          {/* Season */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] text-zinc-500 shrink-0">Season</span>
            <select
              value={slot.gameYear}
              onChange={e => onUpdateSlot(slot.id, { gameYear: Number(e.target.value) })}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-cyan-600 outline-none"
            >
              {Array.from({ length: 11 }, (_, i) => 2025 - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Pitch type */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-500 shrink-0">Pitch Type</span>
            <select
              value={slot.pitchType || ''}
              onChange={e => onUpdateSlot(slot.id, { pitchType: e.target.value || undefined })}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-cyan-600 outline-none"
            >
              {PITCH_TYPES.map(pt => (
                <option key={pt.value} value={pt.value}>{pt.label}</option>
              ))}
            </select>
          </div>
        </div>
      ))}

      {/* Add Slot */}
      <button
        onClick={onAddSlot}
        className="w-full mb-2 px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-400 hover:text-white hover:border-zinc-600 transition"
      >
        + Add Slot
      </button>

      {/* Fetch All */}
      <button
        onClick={onFetchAll}
        disabled={fetchLoading || slots.every(s => !s.playerId)}
        className="w-full px-3 py-2 rounded bg-cyan-600/20 border border-cyan-600/50 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-600/30 transition disabled:opacity-40"
      >
        {fetchLoading ? 'Fetching...' : 'Fetch All'}
      </button>
    </div>
  )
}
