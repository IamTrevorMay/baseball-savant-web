'use client'

import { ElementType, ELEMENT_CATALOG } from '@/lib/sceneTypes'

interface Props {
  onAdd: (type: ElementType) => void
}

export default function ElementLibrary({ onAdd }: Props) {
  return (
    <div className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-3">Elements</div>
      <div className="space-y-1.5">
        {ELEMENT_CATALOG.map(item => (
          <button
            key={item.type}
            onClick={() => onAdd(item.type)}
            className="w-full text-left px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-800 hover:border-cyan-600/40 hover:bg-zinc-800 transition group"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded bg-zinc-700/60 text-zinc-400 flex items-center justify-center text-sm font-mono group-hover:bg-cyan-600/20 group-hover:text-cyan-400 transition">
                {item.icon}
              </span>
              <div>
                <div className="text-xs font-medium text-zinc-200 group-hover:text-white transition">{item.name}</div>
                <div className="text-[10px] text-zinc-600">{item.desc}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Shortcuts</div>
      <div className="space-y-1 text-[10px] text-zinc-600">
        <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">Del</kbd> Delete selected</div>
        <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{'\u2318'}D</kbd> Duplicate</div>
        <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{'\u2190\u2191\u2192\u2193'}</kbd> Nudge 1px</div>
        <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{'\u21e7'}+Arrow</kbd> Nudge 10px</div>
        <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">Esc</kbd> Deselect</div>
      </div>
    </div>
  )
}
