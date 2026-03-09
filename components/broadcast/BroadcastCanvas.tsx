'use client'

import { useCallback, useRef, useState } from 'react'
import { BroadcastAsset } from '@/lib/broadcastTypes'
import { SceneElement } from '@/lib/sceneTypes'
import renderElementContent from '@/components/visualize/scene-composer/ElementRenderer'
import { useBroadcast } from './BroadcastContext'

const CANVAS_W = 1920
const CANVAS_H = 1080

function computeWrapperStyle(el: SceneElement): React.CSSProperties {
  const p = el.props
  const style: React.CSSProperties = {
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    opacity: el.opacity,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    zIndex: el.zIndex,
  }

  if (p.shadowBlur > 0) {
    style.boxShadow = `${p.shadowOffsetX || 0}px ${p.shadowOffsetY || 0}px ${p.shadowBlur}px ${p.shadowColor || '#000000'}`
  }
  if (p.borderWidth > 0) {
    style.border = `${p.borderWidth}px solid ${p.borderColor || '#06b6d4'}`
  }
  if (p.borderRadius > 0) {
    style.borderRadius = `${p.borderRadius}px`
  }
  if (p.blurAmount > 0) {
    style.backdropFilter = `blur(${p.blurAmount}px)`
    style.WebkitBackdropFilter = `blur(${p.blurAmount}px)`
  }
  if (p.bgColor && p.bgColor !== 'transparent') {
    const opacity = p.bgOpacity ?? 1
    if (opacity < 1) {
      const hex = p.bgColor.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16) || 0
      const g = parseInt(hex.substring(2, 4), 16) || 0
      const b = parseInt(hex.substring(4, 6), 16) || 0
      style.backgroundColor = `rgba(${r},${g},${b},${opacity})`
    } else {
      style.backgroundColor = p.bgColor
    }
  }
  if (p.borderRadius > 0 || p.borderWidth > 0) {
    style.overflow = 'hidden'
  }
  return style
}

function AssetPreview({ asset, isVisible }: { asset: BroadcastAsset; isVisible: boolean }) {
  if (asset.asset_type === 'scene' && asset.scene_config) {
    const elements = asset.scene_config.elements || []
    return (
      <div
        className="absolute"
        style={{
          left: asset.canvas_x,
          top: asset.canvas_y,
          width: asset.canvas_width,
          height: asset.canvas_height,
          opacity: isVisible ? 1 : 0.3,
        }}
      >
        <div className="relative w-full h-full" style={{ background: asset.scene_config.background === 'transparent' ? undefined : asset.scene_config.background }}>
          {[...elements].sort((a, b) => a.zIndex - b.zIndex).map(el => (
            <div key={el.id} className="absolute" style={computeWrapperStyle(el)}>
              {renderElementContent(el)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (asset.asset_type === 'image' && asset.storage_path) {
    return (
      <div
        className="absolute"
        style={{
          left: asset.canvas_x,
          top: asset.canvas_y,
          width: asset.canvas_width,
          height: asset.canvas_height,
          opacity: isVisible ? 1 : 0.3,
        }}
      >
        <img src={asset.storage_path} alt={asset.name} className="w-full h-full object-contain" draggable={false} />
      </div>
    )
  }

  if (asset.asset_type === 'video' && asset.storage_path) {
    return (
      <div
        className="absolute flex items-center justify-center bg-zinc-800/50"
        style={{
          left: asset.canvas_x,
          top: asset.canvas_y,
          width: asset.canvas_width,
          height: asset.canvas_height,
          opacity: isVisible ? 1 : 0.3,
        }}
      >
        <div className="text-zinc-500 text-sm flex flex-col items-center gap-1">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>{asset.name}</span>
        </div>
      </div>
    )
  }

  return null
}

export default function BroadcastCanvas() {
  const { assets, visibleAssetIds, selectedAssetId, setSelectedAssetId, updateAsset } = useBroadcast()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; assetX: number; assetY: number } | null>(null)

  // Compute zoom to fit canvas in container
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const zoom = containerSize.w > 0
    ? Math.min(containerSize.w / CANVAS_W, containerSize.h / CANVAS_H, 1) * 0.9
    : 0.5

  // Observe container size
  const measRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const obs = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  function handleAssetMouseDown(e: React.MouseEvent, asset: BroadcastAsset) {
    e.stopPropagation()
    setSelectedAssetId(asset.id)
    setDragging({
      id: asset.id,
      startX: e.clientX,
      startY: e.clientY,
      assetX: asset.canvas_x,
      assetY: asset.canvas_y,
    })

    function onMove(me: MouseEvent) {
      setDragging(prev => {
        if (!prev) return null
        const dx = (me.clientX - prev.startX) / zoom
        const dy = (me.clientY - prev.startY) / zoom
        const newX = Math.round(prev.assetX + dx)
        const newY = Math.round(prev.assetY + dy)
        updateAsset(prev.id, { canvas_x: newX, canvas_y: newY })
        return prev
      })
    }

    function onUp(me: MouseEvent) {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      // Persist final position
      setDragging(prev => {
        if (!prev) return null
        const dx = (me.clientX - prev.startX) / zoom
        const dy = (me.clientY - prev.startY) / zoom
        const newX = Math.round(prev.assetX + dx)
        const newY = Math.round(prev.assetY + dy)
        fetch('/api/broadcast/assets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: prev.id, canvas_x: newX, canvas_y: newY }),
        }).catch(console.error)
        return null
      })
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div ref={measRef} className="flex-1 overflow-hidden flex items-center justify-center bg-zinc-950">
      <div
        ref={containerRef}
        className="relative shrink-0 shadow-2xl"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          backgroundImage: 'repeating-conic-gradient(#27272a 0% 25%, #18181b 0% 50%)',
          backgroundSize: '20px 20px',
        }}
        onClick={() => setSelectedAssetId(null)}
      >
        {/* Grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />

        {/* Assets sorted by layer */}
        {[...assets].sort((a, b) => a.layer - b.layer).map(asset => (
          <div
            key={asset.id}
            className={`absolute cursor-grab ${selectedAssetId === asset.id ? 'ring-2 ring-red-400 ring-offset-1 ring-offset-transparent' : ''}`}
            style={{
              left: asset.canvas_x,
              top: asset.canvas_y,
              width: asset.canvas_width,
              height: asset.canvas_height,
              zIndex: asset.layer,
            }}
            onMouseDown={e => handleAssetMouseDown(e, asset)}
            onClick={e => { e.stopPropagation(); setSelectedAssetId(asset.id) }}
          >
            <AssetPreview asset={asset} isVisible={visibleAssetIds.has(asset.id)} />

            {/* Label */}
            <div className="absolute -top-5 left-0 text-[10px] font-medium text-zinc-400 bg-zinc-900/80 px-1.5 py-0.5 rounded truncate max-w-[200px]">
              {asset.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
