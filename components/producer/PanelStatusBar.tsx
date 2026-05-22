'use client'

import { useProducer } from './ProducerContext'

export default function PanelStatusBar() {
  const { panels, hidePanel, connected } = useProducer()

  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900/80 rounded-lg border border-zinc-800">
      {/* Connection status */}
      <div className="flex items-center gap-1.5 mr-2">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
          {connected ? 'Live' : 'Offline'}
        </span>
      </div>

      <div className="w-px h-4 bg-zinc-700" />

      {/* Lower bar status */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0">Lower</span>
        {panels['lower-bar'].live && panels['lower-bar'].content ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-emerald-400 truncate">
              {panels['lower-bar'].content.title || panels['lower-bar'].content.presetType}
            </span>
            <button
              onClick={() => hidePanel('lower-bar')}
              className="text-[10px] text-zinc-500 hover:text-red-400 transition shrink-0"
            >
              &#x2715;
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-zinc-600">Empty</span>
        )}
      </div>

      <div className="w-px h-4 bg-zinc-700" />

      {/* Right panel status */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0">Right</span>
        {panels['right-panel'].live && panels['right-panel'].content ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-emerald-400 truncate">
              {panels['right-panel'].content.title || panels['right-panel'].content.presetType}
            </span>
            <button
              onClick={() => hidePanel('right-panel')}
              className="text-[10px] text-zinc-500 hover:text-red-400 transition shrink-0"
            >
              &#x2715;
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-zinc-600">Empty</span>
        )}
      </div>
    </div>
  )
}
