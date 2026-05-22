'use client'

import { PRESET_METAS, type PresetType } from '@/lib/producerTypes'

interface Props {
  selected: PresetType | null
  onSelect: (type: PresetType) => void
}

export default function PresetPicker({ selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {PRESET_METAS.map(meta => {
        const active = selected === meta.type
        return (
          <button
            key={meta.type}
            onClick={() => onSelect(meta.type)}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition
              ${active
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-600'
              }`}
          >
            <span className="text-xl">{meta.icon}</span>
            <span className="text-xs font-medium">{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}
