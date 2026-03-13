'use client'

import { useBroadcast } from '../BroadcastContext'

export default function LowerThirdControls() {
  const { widgetState, clearLowerThird } = useBroadcast()
  const { lowerThird, lowerThirdVisible } = widgetState

  return (
    <div className="space-y-2">
      {lowerThirdVisible && lowerThird ? (
        <div className="p-2 bg-zinc-800/50 border border-cyan-500/30 rounded">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[10px] font-medium" style={{ color: lowerThird.color }}>
              {lowerThird.displayName}
            </span>
            <span className="text-[8px] text-zinc-500 uppercase">{lowerThird.provider}</span>
          </div>
          <div className="text-[10px] text-zinc-300">
            {lowerThird.content.map((part, i) =>
              part.type === 'text' ? (
                <span key={i}>{part.text}</span>
              ) : (
                <img key={i} src={part.url} alt="" className="inline h-4 mx-0.5" />
              )
            )}
          </div>
          {lowerThird.expiresAt > 0 && (
            <div className="text-[9px] text-zinc-500 mt-1">
              Auto-clear in {Math.max(0, Math.ceil((lowerThird.expiresAt - Date.now()) / 1000))}s
            </div>
          )}
        </div>
      ) : (
        <div className="p-2 bg-zinc-800/30 border border-zinc-700/50 rounded text-center">
          <span className="text-[10px] text-zinc-500">No message highlighted</span>
        </div>
      )}

      <div className="flex gap-1.5">
        <button
          onClick={clearLowerThird}
          disabled={!lowerThirdVisible}
          className="flex-1 px-2 py-1 text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-700 disabled:opacity-40 transition"
        >
          Clear
        </button>
      </div>

      <p className="text-[9px] text-zinc-600">Click a chat message to highlight it as a lower third.</p>
    </div>
  )
}
