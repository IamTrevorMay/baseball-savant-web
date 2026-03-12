'use client'

import { SceneElement } from '@/lib/sceneTypes'

interface Props {
  element: SceneElement
  allElements: SceneElement[]
  onUpdate: (updates: Partial<SceneElement>) => void
}

const MASK_TYPES = new Set(['shape', 'path'])

export default function ClipMaskSection({ element, allElements, onUpdate }: Props) {
  // Available mask elements: shapes and paths (excluding self)
  const maskOptions = allElements.filter(
    e => e.id !== element.id && MASK_TYPES.has(e.type)
  )

  const currentMask = element.clipMaskId
    ? allElements.find(e => e.id === element.clipMaskId)
    : null

  if (maskOptions.length === 0 && !currentMask) return null

  return (
    <div className="border-b border-zinc-800 pb-3 mb-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Clip Mask</div>

      {currentMask ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-zinc-800/50 rounded p-2">
            <div>
              <div className="text-[11px] text-zinc-300">
                {currentMask.props._layerName || currentMask.type.replace('-', ' ')}
              </div>
              <div className="text-[10px] text-zinc-500">
                {currentMask.width}x{currentMask.height}
              </div>
            </div>
            <button
              onClick={() => onUpdate({ clipMaskId: undefined })}
              className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-red-400 hover:text-red-300 transition"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <select
            value=""
            onChange={e => {
              if (e.target.value) onUpdate({ clipMaskId: e.target.value })
            }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[11px] text-zinc-300 focus:border-violet-600 outline-none"
          >
            <option value="">Select mask element...</option>
            {maskOptions.map(m => (
              <option key={m.id} value={m.id}>
                {m.props._layerName || m.type.replace('-', ' ')} ({m.width}x{m.height})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
