'use client'

import { useState } from 'react'

interface Props {
  showGrid: boolean
  showRulers: boolean
  showGuides: boolean
  snapToElements: boolean
  snapToGuides: boolean
  onToggle: (key: 'showGrid' | 'showRulers' | 'showGuides' | 'snapToElements' | 'snapToGuides') => void
}

const SETTINGS: { key: Props extends { onToggle: (k: infer K) => void } ? K : never; label: string }[] = [
  { key: 'showGrid', label: 'Show Grid' },
  { key: 'showRulers', label: 'Show Rulers' },
  { key: 'showGuides', label: 'Show Guides' },
  { key: 'snapToElements', label: 'Snap to Elements' },
  { key: 'snapToGuides', label: 'Snap to Guides' },
]

export default function SnapSettings({ showGrid, showRulers, showGuides, snapToElements, snapToGuides, onToggle }: Props) {
  const [open, setOpen] = useState(false)

  const values: Record<string, boolean> = { showGrid, showRulers, showGuides, snapToElements, snapToGuides }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-1.5 py-1 rounded text-[11px] text-zinc-400 hover:text-violet-400 hover:bg-zinc-800 transition"
        title="Snap & Guide Settings"
      >
        {'\u2630'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 w-48 py-2 px-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Display & Snap</div>
            {SETTINGS.map(s => (
              <label key={s.key} className="flex items-center justify-between cursor-pointer">
                <span className="text-[11px] text-zinc-300">{s.label}</span>
                <input
                  type="checkbox"
                  checked={values[s.key]}
                  onChange={() => { onToggle(s.key as any) }}
                  className="accent-violet-500"
                />
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
