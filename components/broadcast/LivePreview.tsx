'use client'

import { useCallback, useState, useRef, useEffect } from 'react'
import { useBroadcast } from './BroadcastContext'
import { BroadcastAsset } from '@/lib/broadcastTypes'
import AssetPreview from './AssetPreview'
import { generateCSSAnimation, injectKeyframes, removeKeyframes } from '@/lib/overlayAnimationEngine'

const CANVAS_W = 1920
const CANVAS_H = 1080

function AnimatedAssetWrapper({
  asset,
  phase,
  fps,
  children,
}: {
  asset: BroadcastAsset
  phase: 'entering' | 'exiting' | null
  fps: number
  children: React.ReactNode
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    if (!phase || !wrapperRef.current) return

    const transition = phase === 'entering' ? asset.enter_transition : asset.exit_transition
    const result = generateCSSAnimation(
      transition,
      phase === 'entering' ? 'enter' : 'exit',
      asset.canvas_width,
      asset.canvas_height,
      asset.canvas_x,
      asset.canvas_y,
      fps,
    )

    if (result) {
      if (styleRef.current) removeKeyframes(styleRef.current)
      styleRef.current = injectKeyframes(result.keyframes)
      wrapperRef.current.style.animation = result.animation
      wrapperRef.current.style.willChange = 'transform, opacity'
    }

    return () => {
      if (styleRef.current) {
        removeKeyframes(styleRef.current)
        styleRef.current = null
      }
      if (wrapperRef.current) {
        wrapperRef.current.style.animation = ''
        wrapperRef.current.style.willChange = ''
      }
    }
  }, [phase, asset, fps])

  return <div ref={wrapperRef} className="w-full h-full">{children}</div>
}

export default function LivePreview() {
  const { assets, visibleAssetIds, animatingAssets, setSelectedAssetId, project } = useBroadcast()

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

  const fps = project?.settings?.fps || 30

  // Render visible assets + assets still in exit animation
  const renderedIds = new Set([...visibleAssetIds])
  for (const [id, phase] of animatingAssets) {
    if (phase === 'exiting') renderedIds.add(id)
  }

  const renderedAssets = assets.filter(a => renderedIds.has(a.id))

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
        {[...renderedAssets].sort((a, b) => a.layer - b.layer).map(asset => {
          const phase = animatingAssets.get(asset.id) || null
          return (
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
              <AnimatedAssetWrapper asset={asset} phase={phase} fps={fps}>
                <AssetPreview asset={asset} isVisible={true} />
              </AnimatedAssetWrapper>
            </div>
          )
        })}
      </div>
    </div>
  )
}
