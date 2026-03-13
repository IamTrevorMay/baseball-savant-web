'use client'

import { useBroadcast } from '../BroadcastContext'

export default function UsernameStackControls() {
  const { widgetState, updateWidgetState } = useBroadcast()
  const { usernameStack } = widgetState

  function clearStack() {
    updateWidgetState({ usernameStack: [] })
  }

  return (
    <div className="space-y-2">
      <div className="max-h-32 overflow-y-auto space-y-0.5 bg-zinc-800/30 rounded p-1">
        {usernameStack.length === 0 ? (
          <div className="text-center py-3 text-[10px] text-zinc-600">No usernames</div>
        ) : (
          usernameStack.map((name, i) => (
            <div key={`${name}-${i}`} className="px-1 py-0.5 text-[10px] text-zinc-300">
              {name}
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-zinc-500">{usernameStack.length} names</span>
        <button
          onClick={clearStack}
          disabled={usernameStack.length === 0}
          className="px-2 py-1 text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-700 disabled:opacity-40 transition"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
