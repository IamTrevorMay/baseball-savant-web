'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { BroadcastAsset } from '@/lib/broadcastTypes'
import { SceneElement } from '@/lib/sceneTypes'
import renderElementContent from '@/components/visualize/scene-composer/ElementRenderer'
import { useBroadcast } from './BroadcastContext'
import { generateCSSAnimation, injectKeyframes, removeKeyframes } from '@/lib/overlayAnimationEngine'

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
  const assetOpacity = asset.opacity ?? 1
  const dimmedOpacity = isVisible ? assetOpacity : assetOpacity * 0.3

  if (asset.asset_type === 'scene' && asset.scene_config) {
    const elements = asset.scene_config.elements || []
    return (
      <div className="w-full h-full" style={{ opacity: dimmedOpacity }}>
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
      <div className="w-full h-full" style={{ opacity: dimmedOpacity }}>
        <img src={asset.storage_path} alt={asset.name} className="w-full h-full object-contain" draggable={false} />
      </div>
    )
  }

  if (asset.asset_type === 'video' && asset.storage_path) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-800/50" style={{ opacity: dimmedOpacity }}>
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

function PreviewAnimationWrapper({ asset, previewingAssetId, children }: { asset: BroadcastAsset; previewingAssetId: string | null; children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    if (!wrapperRef.current) return
    const isEnter = previewingAssetId === asset.id
    const isExit = previewingAssetId === `${asset.id}:exit`
    if (!isEnter && !isExit) {
      // Clean up any leftover animation
      if (styleRef.current) { removeKeyframes(styleRef.current); styleRef.current = null }
      wrapperRef.current.style.animation = ''
      return
    }

    const transition = isEnter ? asset.enter_transition : asset.exit_transition
    const result = generateCSSAnimation(
      transition,
      isEnter ? 'enter' : 'exit',
      asset.canvas_width,
      asset.canvas_height,
      asset.canvas_x,
      asset.canvas_y,
      30,
    )

    if (result) {
      if (styleRef.current) removeKeyframes(styleRef.current)
      styleRef.current = injectKeyframes(result.keyframes)
      wrapperRef.current.style.animation = result.animation
    }

    return () => {
      if (styleRef.current) { removeKeyframes(styleRef.current); styleRef.current = null }
      if (wrapperRef.current) wrapperRef.current.style.animation = ''
    }
  }, [previewingAssetId, asset])

  return <div ref={wrapperRef} className="w-full h-full">{children}</div>
}

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', sw: 'nesw-resize',
}

export default function BroadcastCanvas() {
  const { assets, visibleAssetIds, selectedAssetId, setSelectedAssetId, updateAsset, previewingAssetId } = useBroadcast()
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

  function handleResizeMouseDown(e: React.MouseEvent, asset: BroadcastAsset, handle: ResizeHandle) {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const origX = asset.canvas_x
    const origY = asset.canvas_y
    const origW = asset.canvas_width
    const origH = asset.canvas_height

    function onMove(me: MouseEvent) {
      const dx = (me.clientX - startX) / zoom
      const dy = (me.clientY - startY) / zoom

      let newX = origX, newY = origY, newW = origW, newH = origH

      // Horizontal
      if (handle.includes('e')) newW = Math.max(40, Math.round(origW + dx))
      if (handle.includes('w')) { newW = Math.max(40, Math.round(origW - dx)); newX = Math.round(origX + origW - newW) }
      // Vertical
      if (handle.includes('s')) newH = Math.max(40, Math.round(origH + dy))
      if (handle.includes('n')) { newH = Math.max(40, Math.round(origH - dy)); newY = Math.round(origY + origH - newH) }

      // Hold Shift for aspect-ratio lock
      if (me.shiftKey && (handle === 'se' || handle === 'sw' || handle === 'ne' || handle === 'nw')) {
        const ratio = origW / origH
        if (Math.abs(dx) > Math.abs(dy)) {
          newH = Math.round(newW / ratio)
          if (handle.includes('n')) newY = Math.round(origY + origH - newH)
        } else {
          newW = Math.round(newH * ratio)
          if (handle.includes('w')) newX = Math.round(origX + origW - newW)
        }
      }

      updateAsset(asset.id, { canvas_x: newX, canvas_y: newY, canvas_width: newW, canvas_height: newH })
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      // Persist
      const a = assets.find(a => a.id === asset.id)
      if (a) {
        fetch('/api/broadcast/assets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: a.id, canvas_x: a.canvas_x, canvas_y: a.canvas_y, canvas_width: a.canvas_width, canvas_height: a.canvas_height }),
        }).catch(console.error)
      }
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
        {[...assets].sort((a, b) => a.layer - b.layer).map(asset => {
          const isPreviewing = previewingAssetId === asset.id || previewingAssetId === `${asset.id}:exit`
          const isSelected = selectedAssetId === asset.id
          return (
            <div
              key={asset.id}
              className={`absolute ${isSelected ? '' : 'cursor-grab'}`}
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
              {isPreviewing ? (
                <PreviewAnimationWrapper asset={asset} previewingAssetId={previewingAssetId}>
                  <AssetPreview asset={asset} isVisible={true} />
                </PreviewAnimationWrapper>
              ) : (
                <AssetPreview asset={asset} isVisible={visibleAssetIds.has(asset.id)} />
              )}

              {/* Selection outline + resize handles */}
              {isSelected && (
                <>
                  <div className="absolute inset-0 border-2 border-red-400 pointer-events-none rounded-sm" />
                  {/* Corner handles */}
                  {(['nw', 'ne', 'sw', 'se'] as ResizeHandle[]).map(h => (
                    <div
                      key={h}
                      className="absolute w-3 h-3 bg-red-400 border border-red-300 rounded-sm"
                      style={{
                        cursor: HANDLE_CURSORS[h],
                        ...(h.includes('n') ? { top: -5 } : { bottom: -5 }),
                        ...(h.includes('w') ? { left: -5 } : { right: -5 }),
                      }}
                      onMouseDown={e => handleResizeMouseDown(e, asset, h)}
                    />
                  ))}
                  {/* Edge handles */}
                  {(['n', 's', 'e', 'w'] as ResizeHandle[]).map(h => (
                    <div
                      key={h}
                      className="absolute bg-red-400/80 rounded-sm"
                      style={{
                        cursor: HANDLE_CURSORS[h],
                        ...(h === 'n' || h === 's' ? { left: '50%', marginLeft: -8, width: 16, height: 3 } : { top: '50%', marginTop: -8, width: 3, height: 16 }),
                        ...(h === 'n' ? { top: -3 } : {}),
                        ...(h === 's' ? { bottom: -3 } : {}),
                        ...(h === 'e' ? { right: -3 } : {}),
                        ...(h === 'w' ? { left: -3 } : {}),
                      }}
                      onMouseDown={e => handleResizeMouseDown(e, asset, h)}
                    />
                  ))}
                  {/* Size label */}
                  <div className="absolute -bottom-5 right-0 text-[9px] text-zinc-500 bg-zinc-900/80 px-1 py-0.5 rounded font-mono">
                    {asset.canvas_width}x{asset.canvas_height}
                  </div>
                </>
              )}

              {/* Label */}
              <div className="absolute -top-5 left-0 text-[10px] font-medium text-zinc-400 bg-zinc-900/80 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                {asset.name}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
