'use client'

import { useCallback, useState } from 'react'
import { useBroadcast } from './BroadcastContext'
import AssetPreview from './AssetPreview'

const CANVAS_W = 1920
const CANVAS_H = 1080

export default function LivePreview() {
  const { assets, visibleAssetIds, setSelectedAssetId } = useBroadcast()

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const zoom = containerSize.w > 0
    ? Math.min(containerSize.w / CANVAS_W, containerSize.h / CANVAS_H, 1) * 0.95
    : 0.5

  const measRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const obs = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  const visibleAssets = assets.filter(a => visibleAssetIds.has(a.id))

  return (
    <div ref={measRef} className="flex-1 overflow-hidden flex items-center justify-center bg-zinc-950 relative">
      {/* LIVE badge */}
      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-red-600 rounded text-[10px] font-bold text-white tracking-wider">
        LIVE
      </div>

      <div
        className="relative shrink-0"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          background: '#000',
        }}
        onClick={() => setSelectedAssetId(null)}
      >
        {[...visibleAssets].sort((a, b) => a.layer - b.layer).map(asset => (
          <div
            key={asset.id}
            className="absolute cursor-pointer"
            style={{
              left: asset.canvas_x,
              top: asset.canvas_y,
              width: asset.canvas_width,
              height: asset.canvas_height,
              zIndex: asset.layer,
            }}
            onClick={e => { e.stopPropagation(); setSelectedAssetId(asset.id) }}
          >
            <AssetPreview asset={asset} isVisible={true} />
          </div>
        ))}
      </div>
    </div>
  )
}
