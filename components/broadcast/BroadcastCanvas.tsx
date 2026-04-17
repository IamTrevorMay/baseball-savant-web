'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { BroadcastAsset } from '@/lib/broadcastTypes'
import { useBroadcast } from './BroadcastContext'
import { generateCSSAnimation, injectKeyframes, removeKeyframes } from '@/lib/overlayAnimationEngine'
import AssetPreview from './AssetPreview'

const CANVAS_W = 1920
const CANVAS_H = 1080
const SNAP_THRESHOLD = 6

// ── Snap Guides ──────────────────────────────────────────────────────────────

interface SnapGuide {
  axis: 'x' | 'y'
  position: number
}

function computeAssetSnapGuides(
  currentId: string,
  newX: number, newY: number,
  newW: number, newH: number,
  allAssets: BroadcastAsset[],
  canvasW: number, canvasH: number,
  gridSize: number,
): { x: number; y: number; guides: SnapGuide[] } {
  const guides: SnapGuide[] = []
  let snapX = newX
  let snapY = newY
  let snappedX = false, snappedY = false

  // Edges and center of the dragging asset
  const myL = newX, myR = newX + newW, myCX = newX + newW / 2
  const myT = newY, myB = newY + newH, myCY = newY + newH / 2

  // Canvas center
  const cx = canvasW / 2, cy = canvasH / 2

  // 1. Snap to canvas center (highest priority)
  if (Math.abs(myCX - cx) < SNAP_THRESHOLD) {
    snapX = cx - newW / 2; guides.push({ axis: 'x', position: cx }); snappedX = true
  }
  if (Math.abs(myCY - cy) < SNAP_THRESHOLD) {
    snapY = cy - newH / 2; guides.push({ axis: 'y', position: cy }); snappedY = true
  }

  // 2. Snap to canvas edges
  if (!snappedX) {
    const edgeXSnaps = [
      { my: myL, target: 0 }, { my: myR, target: canvasW },
    ]
    for (const s of edgeXSnaps) {
      if (Math.abs(s.my - s.target) < SNAP_THRESHOLD) {
        snapX = newX + (s.target - s.my)
        guides.push({ axis: 'x', position: s.target })
        snappedX = true
        break
      }
    }
  }
  if (!snappedY) {
    const edgeYSnaps = [
      { my: myT, target: 0 }, { my: myB, target: canvasH },
    ]
    for (const s of edgeYSnaps) {
      if (Math.abs(s.my - s.target) < SNAP_THRESHOLD) {
        snapY = newY + (s.target - s.my)
        guides.push({ axis: 'y', position: s.target })
        snappedY = true
        break
      }
    }
  }

  // 3. Snap to other assets
  for (const other of allAssets) {
    if (other.id === currentId) continue
    const oL = other.canvas_x, oR = other.canvas_x + other.canvas_width, oCX = other.canvas_x + other.canvas_width / 2
    const oT = other.canvas_y, oB = other.canvas_y + other.canvas_height, oCY = other.canvas_y + other.canvas_height / 2

    if (!snappedX) {
      const xSnaps = [
        { my: myL, target: oL }, { my: myR, target: oR },
        { my: myL, target: oR }, { my: myR, target: oL },
        { my: myCX, target: oCX },
      ]
      for (const s of xSnaps) {
        if (Math.abs(s.my - s.target) < SNAP_THRESHOLD) {
          snapX = newX + (s.target - s.my)
          guides.push({ axis: 'x', position: s.target })
          snappedX = true
          break
        }
      }
    }

    if (!snappedY) {
      const ySnaps = [
        { my: myT, target: oT }, { my: myB, target: oB },
        { my: myT, target: oB }, { my: myB, target: oT },
        { my: myCY, target: oCY },
      ]
      for (const s of ySnaps) {
        if (Math.abs(s.my - s.target) < SNAP_THRESHOLD) {
          snapY = newY + (s.target - s.my)
          guides.push({ axis: 'y', position: s.target })
          snappedY = true
          break
        }
      }
    }
  }

  // 4. Snap to grid (lowest priority)
  if (!snappedX) {
    const gridSnapX = Math.round(newX / gridSize) * gridSize
    if (Math.abs(newX - gridSnapX) < SNAP_THRESHOLD) {
      snapX = gridSnapX
    }
  }
  if (!snappedY) {
    const gridSnapY = Math.round(newY / gridSize) * gridSize
    if (Math.abs(newY - gridSnapY) < SNAP_THRESHOLD) {
      snapY = gridSnapY
    }
  }

  return { x: Math.round(snapX), y: Math.round(snapY), guides }
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

interface BroadcastCanvasProps {
  referenceImage?: string
  referenceImageOpacity?: number
  showReferenceImage?: boolean
  gridSize?: number
  snapEnabled?: boolean
  showGrid?: boolean
}

export default function BroadcastCanvas({ referenceImage, referenceImageOpacity = 50, showReferenceImage = false, gridSize = 20, snapEnabled = true, showGrid = true }: BroadcastCanvasProps) {
  const { assets, visibleAssetIds, selectedAssetId, setSelectedAssetId, updateAsset, previewingAssetId } = useBroadcast()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; assetX: number; assetY: number } | null>(null)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const assetsRef = useRef(assets)
  assetsRef.current = assets

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
        const rawX = Math.round(prev.assetX + dx)
        const rawY = Math.round(prev.assetY + dy)
        const currentAsset = assetsRef.current.find(a => a.id === prev.id)
        const w = currentAsset?.canvas_width || 100
        const h = currentAsset?.canvas_height || 100

        if (!snapEnabled || me.altKey) {
          updateAsset(prev.id, { canvas_x: rawX, canvas_y: rawY })
          setSnapGuides([])
        } else {
          const snap = computeAssetSnapGuides(prev.id, rawX, rawY, w, h, assetsRef.current, CANVAS_W, CANVAS_H, gridSize)
          updateAsset(prev.id, { canvas_x: snap.x, canvas_y: snap.y })
          setSnapGuides(snap.guides)
        }
        return prev
      })
    }

    function onUp(me: MouseEvent) {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setSnapGuides([])
      // Persist final position
      setDragging(prev => {
        if (!prev) return null
        const dx = (me.clientX - prev.startX) / zoom
        const dy = (me.clientY - prev.startY) / zoom
        const rawX = Math.round(prev.assetX + dx)
        const rawY = Math.round(prev.assetY + dy)
        const currentAsset = assetsRef.current.find(a => a.id === prev.id)
        const w = currentAsset?.canvas_width || 100
        const h = currentAsset?.canvas_height || 100
        const snap = (!snapEnabled || me.altKey)
          ? { x: rawX, y: rawY }
          : computeAssetSnapGuides(prev.id, rawX, rawY, w, h, assetsRef.current, CANVAS_W, CANVAS_H, gridSize)
        fetch('/api/broadcast/assets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: prev.id, canvas_x: snap.x, canvas_y: snap.y }),
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

      // Aspect-ratio lock: always for slideshows, Shift for others
      const forceAspectLock = asset.asset_type === 'slideshow' || asset.asset_type === 'advertisement'
      if ((me.shiftKey || forceAspectLock) && (handle === 'se' || handle === 'sw' || handle === 'ne' || handle === 'nw')) {
        const ratio = origW / origH
        if (Math.abs(dx) > Math.abs(dy)) {
          newH = Math.round(newW / ratio)
          if (handle.includes('n')) newY = Math.round(origY + origH - newH)
        } else {
          newW = Math.round(newH * ratio)
          if (handle.includes('w')) newX = Math.round(origX + origW - newW)
        }
      }

      // Snap resized edges (unless Alt held or snap disabled)
      if (snapEnabled && !me.altKey) {
        const snap = computeAssetSnapGuides(asset.id, newX, newY, newW, newH, assetsRef.current, CANVAS_W, CANVAS_H, gridSize)
        // Apply snapped position (adjusting width/height to match)
        const dxSnap = snap.x - newX, dySnap = snap.y - newY
        if (handle.includes('w')) { newX = snap.x; newW -= dxSnap }
        else if (dxSnap !== 0 && handle.includes('e')) { newW += dxSnap }
        if (handle.includes('n')) { newY = snap.y; newH -= dySnap }
        else if (dySnap !== 0 && handle.includes('s')) { newH += dySnap }
        setSnapGuides(snap.guides)
      } else {
        setSnapGuides([])
      }

      updateAsset(asset.id, { canvas_x: newX, canvas_y: newY, canvas_width: newW, canvas_height: newH })
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setSnapGuides([])
      // Persist
      const a = assetsRef.current.find(a => a.id === asset.id)
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
        {/* Reference image */}
        {showReferenceImage && referenceImage && (
          <img
            src={referenceImage}
            alt="Reference"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ zIndex: -1, opacity: referenceImageOpacity / 100 }}
            draggable={false}
          />
        )}

        {/* Grid */}
        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
              backgroundSize: `${gridSize}px ${gridSize}px`,
            }}
          />
        )}

        {/* Snap guides */}
        {snapGuides.map((guide, i) => (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={
              guide.axis === 'x'
                ? { left: guide.position, top: 0, width: 1, height: CANVAS_H, background: '#f97316', opacity: 0.6, zIndex: 9998 }
                : { top: guide.position, left: 0, height: 1, width: CANVAS_W, background: '#f97316', opacity: 0.6, zIndex: 9998 }
            }
          />
        ))}

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
