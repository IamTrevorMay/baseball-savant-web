'use client'

import { RepeaterConfig } from '@/lib/sceneTypes'

interface Props {
  repeater: RepeaterConfig | null
  selectedIds: Set<string>
  onCreateRepeater: () => void
  onUpdateRepeater: (repeater: RepeaterConfig | null) => void
  onClearRepeater: () => void
}

export default function RepeaterPanel({ repeater, selectedIds, onCreateRepeater, onUpdateRepeater, onClearRepeater }: Props) {
  const hasRepeater = repeater?.enabled

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Repeater</div>

      {!hasRepeater ? (
        <div className="space-y-3">
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Select elements that form a single repeating row, then click "Create Repeater" to duplicate them for each data entry.
          </p>
          <button
            onClick={onCreateRepeater}
            disabled={selectedIds.size === 0}
            className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition ${
              selectedIds.size > 0
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-600/40 hover:bg-emerald-600/30'
                : 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed'
            }`}
          >
            Create Repeater ({selectedIds.size} elements selected)
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-2.5 rounded-lg bg-emerald-900/10 border border-emerald-800/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-400 border border-emerald-600/30">
                Active
              </span>
              <span className="text-[10px] text-zinc-500">
                {repeater!.elementIds.length} elements
              </span>
            </div>

            {/* Count */}
            <label className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] text-zinc-500">Count</span>
              <input
                type="number"
                value={repeater!.count}
                onChange={e => onUpdateRepeater({ ...repeater!, count: Math.max(1, parseInt(e.target.value) || 1) })}
                min={1}
                max={20}
                className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-right focus:border-emerald-600 outline-none"
              />
            </label>

            {/* Direction */}
            <label className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] text-zinc-500">Direction</span>
              <select
                value={repeater!.direction}
                onChange={e => onUpdateRepeater({ ...repeater!, direction: e.target.value as 'vertical' | 'horizontal' })}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:border-emerald-600 outline-none"
              >
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </label>

            {/* Offset */}
            <label className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-500">Offset (px)</span>
              <input
                type="number"
                value={repeater!.offset}
                onChange={e => onUpdateRepeater({ ...repeater!, offset: parseInt(e.target.value) || 0 })}
                className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-right focus:border-emerald-600 outline-none"
              />
            </label>
          </div>

          <button
            onClick={onClearRepeater}
            className="w-full px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-500 hover:text-red-400 hover:border-red-600/40 transition"
          >
            Remove Repeater
          </button>
        </div>
      )}
    </div>
  )
}
