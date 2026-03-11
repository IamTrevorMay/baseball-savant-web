'use client'

import { useBroadcast } from './BroadcastContext'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function LiveControlGrid() {
  const {
    assets, visibleAssetIds, toggleAssetVisibility,
    slideshowPrev, slideshowNext, getSlideshowIndex,
    videoTimeRemaining,
  } = useBroadcast()

  const sorted = [...assets].sort((a, b) => a.sort_order - b.sort_order)
  const activeCount = assets.filter(a => visibleAssetIds.has(a.id)).length

  // Collect all active video countdowns
  const activeTimers = Array.from(videoTimeRemaining.entries())
    .filter(([id]) => visibleAssetIds.has(id))

  return (
    <div className="h-64 shrink-0 border-t border-zinc-800 bg-zinc-900 flex flex-col">
      <div className="px-3 py-1.5 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Controls</span>
        <span className="text-[10px] text-zinc-500">{activeCount} active</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
        {sorted.map(asset => {
          const isOn = visibleAssetIds.has(asset.id)
          const isSlideshow = asset.asset_type === 'slideshow'
          const slideCount = asset.slideshow_config?.slides?.length || 0
          const timeInfo = videoTimeRemaining.get(asset.id)

          return (
            <div key={asset.id} className="flex items-center gap-1.5">
              <button
                onClick={() => toggleAssetVisibility(asset.id)}
                className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] font-medium transition ${
                  isOn
                    ? 'bg-red-600/20 text-red-300 border border-red-600/40'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50 hover:bg-zinc-750 hover:text-zinc-400'
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${isOn ? 'bg-red-500' : 'bg-zinc-600'}`} />
                <span className="truncate">{asset.name}</span>
                {/* Video time remaining badge */}
                {isOn && timeInfo && timeInfo.remaining > 0 && (
                  <span className="ml-auto text-[9px] font-mono text-amber-400 tabular-nums shrink-0">
                    {formatTime(timeInfo.remaining)}
                  </span>
                )}
                {asset.hotkey_key && !timeInfo && (
                  <span className="ml-auto text-[9px] text-zinc-600 font-mono uppercase">{asset.hotkey_key}</span>
                )}
              </button>

              {isSlideshow && slideCount > 1 && isOn && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => slideshowPrev(asset.id)}
                    className="w-6 h-6 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs"
                  >
                    &lt;
                  </button>
                  <span className="text-[9px] text-zinc-500 font-mono w-7 text-center">
                    {getSlideshowIndex(asset.id) + 1}/{slideCount}
                  </span>
                  <button
                    onClick={() => slideshowNext(asset.id)}
                    className="w-6 h-6 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs"
                  >
                    &gt;
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Video time remaining bar at bottom */}
      {activeTimers.length > 0 && (
        <div className="px-3 py-1.5 border-t border-zinc-800 space-y-0.5">
          {activeTimers.map(([assetId, info]) => {
            const asset = assets.find(a => a.id === assetId)
            if (!asset) return null
            const pct = info.duration > 0 ? ((info.duration - info.remaining) / info.duration) * 100 : 0
            return (
              <div key={assetId} className="flex items-center gap-2">
                <span className="text-[9px] text-zinc-500 truncate w-20 shrink-0">{asset.name}</span>
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-amber-400 tabular-nums w-10 text-right shrink-0">
                  {formatTime(info.remaining)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Compact slideshow-only controls for non-live canvas view */
export function SlideshowControlStrip() {
  const { assets, slideshowPrev, slideshowNext, getSlideshowIndex } = useBroadcast()

  const slideshows = assets.filter(a => a.asset_type === 'slideshow' && (a.slideshow_config?.slides?.length || 0) > 1)
  if (slideshows.length === 0) return null

  return (
    <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 px-2 py-1.5">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-medium mb-1">Slideshows</div>
      <div className="space-y-1">
        {slideshows.map(asset => {
          const slideCount = asset.slideshow_config?.slides?.length || 0
          return (
            <div key={asset.id} className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-400 truncate flex-1">{asset.name}</span>
              <button
                onClick={() => slideshowPrev(asset.id)}
                className="w-6 h-6 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs transition"
              >
                &lt;
              </button>
              <span className="text-[9px] text-zinc-500 font-mono w-7 text-center">
                {getSlideshowIndex(asset.id) + 1}/{slideCount}
              </span>
              <button
                onClick={() => slideshowNext(asset.id)}
                className="w-6 h-6 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs transition"
              >
                &gt;
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
