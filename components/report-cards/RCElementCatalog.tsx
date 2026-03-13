'use client'

import { ElementType } from '@/lib/sceneTypes'
import { RC_ELEMENT_CATALOG, RC_LAYOUT_CATALOG } from '@/lib/reportCardDefaults'

interface Props {
  onAddElement: (type: ElementType) => void
}

export default function RCElementCatalog({ onAddElement }: Props) {
  return (
    <div className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto flex flex-col">
      {/* Data Objects */}
      <div className="p-3 border-b border-zinc-800">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Data Objects</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {RC_ELEMENT_CATALOG.map(item => (
            <button
              key={item.type}
              onClick={() => onAddElement(item.type)}
              className="
                text-left p-2 rounded-lg
                bg-zinc-800/50 border border-zinc-700/50
                hover:border-cyan-500/40 hover:bg-zinc-800
                transition text-xs group
              "
            >
              <span className="text-base block mb-0.5 text-zinc-400 group-hover:text-cyan-400 transition">{item.icon}</span>
              <span className="font-medium text-zinc-300 block leading-tight">{item.name}</span>
              <span className="text-[10px] text-zinc-600 block mt-0.5">{item.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Layout Elements */}
      <div className="p-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Layout</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {RC_LAYOUT_CATALOG.map(item => (
            <button
              key={item.type}
              onClick={() => onAddElement(item.type)}
              className="
                text-left p-2 rounded-lg
                bg-zinc-800/50 border border-zinc-700/50
                hover:border-zinc-600 hover:bg-zinc-800
                transition text-xs group
              "
            >
              <span className="text-base block mb-0.5 text-zinc-500">{item.icon}</span>
              <span className="font-medium text-zinc-400 block leading-tight">{item.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
