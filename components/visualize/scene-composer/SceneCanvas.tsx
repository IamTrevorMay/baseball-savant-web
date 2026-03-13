'use client'

import { useCallback, useState, useRef, useEffect } from 'react'
import { Scene, SceneElement, Guide, Effect } from '@/lib/sceneTypes'
import renderElementContent from './ElementRenderer'

// ── Snap Guides ──────────────────────────────────────────────────────────────

const SNAP_THRESHOLD = 6

interface SnapGuide {
  axis: 'x' | 'y'
  position: number
}

function computeSnapGuides(
  draggingEl: SceneElement,
  newX: number, newY: number,
  elements: SceneElement[],
  sceneW: number, sceneH: number,
  customGuides?: Guide[],
  snapToElements = true,
  snapToGuides = true,
): { x: number; y: number; guides: SnapGuide[] } {
  const guides: SnapGuide[] = []
  let snapX = newX
  let snapY = newY

  // Edges and center of the dragging element
  const myL = newX
  const myR = newX + draggingEl.width
  const myCX = newX + draggingEl.width / 2
  const myT = newY
  const myB = newY + draggingEl.height
  const myCY = newY + draggingEl.height / 2

  // Scene center
  const sceneCX = sceneW / 2
  const sceneCY = sceneH / 2

  // Check snap to scene center
  if (Math.abs(myCX - sceneCX) < SNAP_THRESHOLD) {
    snapX = sceneCX - draggingEl.width / 2
    guides.push({ axis: 'x', position: sceneCX })
  }
  if (Math.abs(myCY - sceneCY) < SNAP_THRESHOLD) {
    snapY = sceneCY - draggingEl.height / 2
    guides.push({ axis: 'y', position: sceneCY })
  }

  // Check snap to other elements
  if (snapToElements) {
    for (const other of elements) {
      if (other.id === draggingEl.id) continue

      const oL = other.x
      const oR = other.x + other.width
      const oCX = other.x + other.width / 2
      const oT = other.y
      const oB = other.y + other.height
      const oCY = other.y + other.height / 2

      // X-axis snaps
      const xSnaps = [
        { my: myL, target: oL },
        { my: myR, target: oR },
        { my: myL, target: oR },
        { my: myR, target: oL },
        { my: myCX, target: oCX },
      ]
      for (const s of xSnaps) {
        if (Math.abs(s.my - s.target) < SNAP_THRESHOLD) {
          snapX = newX + (s.target - s.my)
          guides.push({ axis: 'x', position: s.target })
          break
        }
      }

      // Y-axis snaps
      const ySnaps = [
        { my: myT, target: oT },
        { my: myB, target: oB },
        { my: myT, target: oB },
        { my: myB, target: oT },
        { my: myCY, target: oCY },
      ]
      for (const s of ySnaps) {
        if (Math.abs(s.my - s.target) < SNAP_THRESHOLD) {
          snapY = newY + (s.target - s.my)
          guides.push({ axis: 'y', position: s.target })
          break
        }
      }
    }
  }

  // Check snap to custom guides
  if (snapToGuides && customGuides) {
    for (const g of customGuides) {
      if (g.axis === 'x') {
        const edges = [myL, myR, myCX]
        for (const e of edges) {
          if (Math.abs(e - g.position) < SNAP_THRESHOLD) {
            snapX = newX + (g.position - e)
            guides.push({ axis: 'x', position: g.position })
            break
          }
        }
      } else {
        const edges = [myT, myB, myCY]
        for (const e of edges) {
          if (Math.abs(e - g.position) < SNAP_THRESHOLD) {
            snapY = newY + (g.position - e)
            guides.push({ axis: 'y', position: g.position })
            break
          }
        }
      }
    }
  }

  return { x: Math.round(snapX), y: Math.round(snapY), guides }
}

// ── Interaction types ────────────────────────────────────────────────────────

type DragState =
  | { type: 'move'; id: string; startX: number; startY: number; elX: number; elY: number }
  | { type: 'resize'; id: string; handle: string; startX: number; startY: number; elX: number; elY: number; elW: number; elH: number }
  | { type: 'marquee'; startX: number; startY: number; curX: number; curY: number }
  | { type: 'group-resize'; handle: string; startX: number; startY: number; bbox: { x: number; y: number; w: number; h: number }; snapshots: { id: string; x: number; y: number; w: number; h: number }[] }
  | null

const HANDLES = ['nw', 'ne', 'sw', 'se'] as const
const HANDLE_CURSORS: Record<string, string> = { nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize' }

// ── Bounding box for multi-select ────────────────────────────────────────────

function getGroupBBox(ids: Set<string>, elements: SceneElement[]): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let count = 0
  for (const el of elements) {
    if (!ids.has(el.id)) continue
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + el.width)
    maxY = Math.max(maxY, el.y + el.height)
    count++
  }
  if (count === 0) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// ── SceneCanvas ──────────────────────────────────────────────────────────────

// ── Effects to CSS boxShadow ─────────────────────────────────────────────────

function effectsToCss(effects?: Effect[]): string | undefined {
  if (!effects || effects.length === 0) return undefined
  return effects.map(e => {
    const inset = e.type === 'inner-shadow' || e.type === 'inner-glow' ? 'inset ' : ''
    const ox = e.type === 'outer-glow' || e.type === 'inner-glow' ? 0 : (e.offsetX || 0)
    const oy = e.type === 'outer-glow' || e.type === 'inner-glow' ? 0 : (e.offsetY || 0)
    const hex = (e.color || '#000000').replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16) || 0
    const g = parseInt(hex.substring(2, 4), 16) || 0
    const b = parseInt(hex.substring(4, 6), 16) || 0
    const a = e.opacity ?? 1
    return `${inset}${ox}px ${oy}px ${e.blur || 0}px ${e.spread || 0}px rgba(${r},${g},${b},${a})`
  }).join(', ')
}

interface Props {
  scene: Scene
  selectedId: string | null
  selectedIds?: Set<string>
  highlightedIds?: Set<string>
  zoom: number
  onSelect: (id: string | null, additive?: boolean) => void
  onSelectMany: (ids: string[]) => void
  onUpdateElement: (id: string, updates: Partial<SceneElement>) => void
  canvasRef: React.RefObject<HTMLDivElement | null>
  showGrid?: boolean
  showGuides?: boolean
  snapToElements?: boolean
  snapToGuides?: boolean
  customGuides?: Guide[]
  onAddGuide?: (guide: Guide) => void
  onRemoveGuide?: (id: string) => void
  showRulers?: boolean
  penToolActive?: boolean
  enteredGroupId?: string | null
}

export default function SceneCanvas({ scene, selectedId, selectedIds, highlightedIds, zoom, onSelect, onSelectMany, onUpdateElement, canvasRef, showGrid = true, showGuides = true, snapToElements = true, snapToGuides = true, customGuides, enteredGroupId }: Props) {
  const [drag, _setDrag] = useState<DragState>(null)
  const dragRef = useRef<DragState>(null)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])

  // Keep ref in sync so event handlers always see latest drag state
  function setDrag(d: DragState) {
    dragRef.current = d
    _setDrag(d)
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const el = scene.elements.find(el => el.id === id)
      if (!el) return
      // If element is already in a multi-selection, don't change selection — just drag
      const alreadyInGroup = selectedIds && selectedIds.size > 1 && selectedIds.has(id)
      if (!alreadyInGroup) {
        onSelect(id, e.shiftKey)
      }
      if (el.locked) return
      setDrag({ type: 'move', id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y })
    },
    [scene.elements, onSelect, selectedIds]
  )

  const handleResizeDown = useCallback(
    (e: React.MouseEvent, id: string, handle: string) => {
      e.stopPropagation()
      e.preventDefault()
      const el = scene.elements.find(el => el.id === id)
      if (!el) return
      setDrag({ type: 'resize', id, handle, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y, elW: el.width, elH: el.height })
    },
    [scene.elements]
  )

  // Start group resize from bounding-box handles
  const handleGroupResizeDown = useCallback(
    (e: React.MouseEvent, handle: string) => {
      e.stopPropagation()
      e.preventDefault()
      if (!selectedIds || selectedIds.size < 2) return
      const bbox = getGroupBBox(selectedIds, scene.elements)
      if (!bbox) return
      const snapshots = scene.elements
        .filter(el => selectedIds.has(el.id))
        .map(el => ({ id: el.id, x: el.x, y: el.y, w: el.width, h: el.height }))
      setDrag({ type: 'group-resize', handle, startX: e.clientX, startY: e.clientY, bbox, snapshots })
    },
    [selectedIds, scene.elements]
  )

  // Start marquee selection on empty canvas area
  // Element mousedown handlers call stopPropagation, so if we reach here
  // the click is on empty space (or pointer-events-none overlays)
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      // Ignore if click landed on an element (shouldn't happen due to stopPropagation, but safety)
      const target = e.target as HTMLElement
      if (target !== e.currentTarget && !target.hasAttribute('data-canvas-overlay')) return
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = (e.clientX - rect.left) / zoom
      const y = (e.clientY - rect.top) / zoom
      if (!e.shiftKey) onSelect(null)
      setDrag({ type: 'marquee', startX: x, startY: y, curX: x, curY: y })
    },
    [zoom, onSelect, canvasRef]
  )

  // Start marquee from workspace area outside the canvas
  const handleWorkspaceMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      if (e.target !== e.currentTarget) return
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = (e.clientX - rect.left) / zoom
      const y = (e.clientY - rect.top) / zoom
      if (!e.shiftKey) onSelect(null)
      setDrag({ type: 'marquee', startX: x, startY: y, curX: x, curY: y })
    },
    [zoom, onSelect, canvasRef]
  )

  // Use native listener on document for mousemove/mouseup to avoid stale closure issues
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return

      const dx = (e.clientX - d.startX) / zoom
      const dy = (e.clientY - d.startY) / zoom

      if (d.type === 'marquee') {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return
        const curX = (e.clientX - rect.left) / zoom
        const curY = (e.clientY - rect.top) / zoom
        setDrag({ ...d, curX, curY })
        return
      }

      if (d.type === 'move') {
        const el = scene.elements.find(el => el.id === d.id)
        if (!el) return

        const rawX = d.elX + dx
        const rawY = d.elY + dy

        const { x: snappedX, y: snappedY, guides } = computeSnapGuides(
          el, rawX, rawY, scene.elements, scene.width, scene.height,
          customGuides || scene.guides, snapToElements, snapToGuides,
        )
        setSnapGuides(guides)

        const offsetX = snappedX - el.x
        const offsetY = snappedY - el.y
        onUpdateElement(d.id, { x: snappedX, y: snappedY })

        if (selectedIds && selectedIds.size > 1 && selectedIds.has(d.id)) {
          for (const otherId of selectedIds) {
            if (otherId === d.id) continue
            const other = scene.elements.find(e => e.id === otherId)
            if (other && !other.locked) {
              onUpdateElement(otherId, { x: other.x + offsetX, y: other.y + offsetY })
            }
          }
        }
      } else if (d.type === 'resize') {
        const { handle, elX, elY, elW, elH } = d
        let nx = elX, ny = elY, nw = elW, nh = elH
        if (handle.includes('e')) nw = Math.max(20, elW + dx)
        if (handle.includes('w')) { nw = Math.max(20, elW - dx); nx = elX + (elW - nw) }
        if (handle.includes('s')) nh = Math.max(20, elH + dy)
        if (handle.includes('n')) { nh = Math.max(20, elH - dy); ny = elY + (elH - nh) }
        onUpdateElement(d.id, { x: Math.round(nx), y: Math.round(ny), width: Math.round(nw), height: Math.round(nh) })
      } else if (d.type === 'group-resize') {
        const { handle, bbox, snapshots } = d
        let nbx = bbox.x, nby = bbox.y, nbw = bbox.w, nbh = bbox.h
        if (handle.includes('e')) nbw = Math.max(20, bbox.w + dx)
        if (handle.includes('w')) { nbw = Math.max(20, bbox.w - dx); nbx = bbox.x + (bbox.w - nbw) }
        if (handle.includes('s')) nbh = Math.max(20, bbox.h + dy)
        if (handle.includes('n')) { nbh = Math.max(20, bbox.h - dy); nby = bbox.y + (bbox.h - nbh) }

        const scaleX = nbw / bbox.w
        const scaleY = nbh / bbox.h

        for (const snap of snapshots) {
          const relX = snap.x - bbox.x
          const relY = snap.y - bbox.y
          onUpdateElement(snap.id, {
            x: Math.round(nbx + relX * scaleX),
            y: Math.round(nby + relY * scaleY),
            width: Math.max(10, Math.round(snap.w * scaleX)),
            height: Math.max(10, Math.round(snap.h * scaleY)),
          })
        }
      }
    }

    function onMouseUp() {
      const d = dragRef.current
      if (d?.type === 'marquee') {
        const x1 = Math.min(d.startX, d.curX)
        const y1 = Math.min(d.startY, d.curY)
        const x2 = Math.max(d.startX, d.curX)
        const y2 = Math.max(d.startY, d.curY)
        if (x2 - x1 > 4 || y2 - y1 > 4) {
          const hit = scene.elements
            .filter(el => el.x + el.width > x1 && el.x < x2 && el.y + el.height > y1 && el.y < y2)
            .map(el => el.id)
          if (hit.length > 0) onSelectMany(hit)
        }
      }
      setDrag(null)
      setSnapGuides([])
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [zoom, onUpdateElement, scene.elements, scene.width, scene.height, selectedIds, canvasRef, onSelectMany, customGuides, scene.guides, snapToElements, snapToGuides])

  const allSelected = selectedIds || new Set(selectedId ? [selectedId] : [])
  const multiSelected = allSelected.size > 1
  const groupBBox = multiSelected ? getGroupBBox(allSelected, scene.elements) : null

  return (
    <div
      className="w-full h-full overflow-auto flex items-center justify-center"
      style={{ background: 'radial-gradient(circle at center, #1a1a1e 0%, #09090b 100%)' }}
      onMouseDown={handleWorkspaceMouseDown}
    >
      {/* Scene canvas */}
      <div
        ref={canvasRef}
        className="relative shrink-0 shadow-2xl"
        style={{
          width: scene.width,
          height: scene.height,
          backgroundColor: scene.background === 'transparent' ? undefined : scene.background,
          ...(scene.background === 'transparent' ? {
            backgroundImage: 'repeating-conic-gradient(#27272a 0% 25%, #18181b 0% 50%)',
            backgroundSize: '20px 20px',
          } : {}),
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
        }}
        onMouseDown={handleCanvasMouseDown}
      >
        {/* Grid overlay */}
        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
              backgroundSize: '80px 80px',
            }}
          />
        )}

        {/* Center crosshair */}
        <div className="absolute pointer-events-none" style={{ left: scene.width / 2 - 0.5, top: 0, width: 1, height: scene.height, background: 'rgba(255,255,255,0.03)' }} />
        <div className="absolute pointer-events-none" style={{ top: scene.height / 2 - 0.5, left: 0, width: scene.width, height: 1, background: 'rgba(255,255,255,0.03)' }} />

        {/* Snap guides */}
        {snapGuides.map((guide, i) => (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={
              guide.axis === 'x'
                ? { left: guide.position, top: 0, width: 1, height: scene.height, background: '#f97316', opacity: 0.6, zIndex: 9998 }
                : { top: guide.position, left: 0, height: 1, width: scene.width, background: '#f97316', opacity: 0.6, zIndex: 9998 }
            }
          />
        ))}

        {/* Custom guides */}
        {showGuides && (scene.guides || customGuides || []).map(guide => {
          const g = guide as Guide
          return (
            <div
              key={g.id}
              className="absolute pointer-events-none"
              style={
                g.axis === 'x'
                  ? { left: g.position, top: 0, width: 1, height: scene.height, borderLeft: '1px dashed #8b5cf6', opacity: 0.7, zIndex: 9995 }
                  : { top: g.position, left: 0, height: 1, width: scene.width, borderTop: '1px dashed #8b5cf6', opacity: 0.7, zIndex: 9995 }
              }
            />
          )
        })}

        {/* Marquee selection rectangle */}
        {drag?.type === 'marquee' && (() => {
          const x = Math.min(drag.startX, drag.curX)
          const y = Math.min(drag.startY, drag.curY)
          const w = Math.abs(drag.curX - drag.startX)
          const h = Math.abs(drag.curY - drag.startY)
          return w > 2 || h > 2 ? (
            <div
              className="absolute pointer-events-none"
              style={{
                left: x, top: y, width: w, height: h,
                border: '1px solid #06b6d4',
                backgroundColor: 'rgba(6,182,212,0.08)',
                zIndex: 9997,
              }}
            />
          ) : null
        })()}

        {/* Group bounding box + resize handles */}
        {groupBBox && !drag && (
          <>
            <div
              className="absolute pointer-events-none"
              style={{
                left: groupBBox.x - 4, top: groupBBox.y - 4,
                width: groupBBox.w + 8, height: groupBBox.h + 8,
                border: '1px dashed #06b6d480',
                zIndex: 9996,
              }}
            />
            {HANDLES.map(h => (
              <div
                key={`group-${h}`}
                className="absolute w-2.5 h-2.5 bg-cyan-500 border border-cyan-300 rounded-sm"
                style={{
                  left: h.includes('w') ? groupBBox.x - 9 : groupBBox.x + groupBBox.w + 3,
                  top: h.includes('n') ? groupBBox.y - 9 : groupBBox.y + groupBBox.h + 3,
                  cursor: HANDLE_CURSORS[h],
                  zIndex: 9999,
                }}
                onMouseDown={e => handleGroupResizeDown(e, h)}
              />
            ))}
          </>
        )}

        {/* Elements */}
        {[...scene.elements].sort((a, b) => a.zIndex - b.zIndex).map(el => {
          const selected = allSelected.has(el.id)
          const isPrimary = el.id === selectedId
          const showHandles = isPrimary && !el.locked && !multiSelected
          const p = el.props

          // Universal style props
          const wrapperStyle: React.CSSProperties = {
            left: el.x,
            top: el.y,
            width: el.width,
            height: el.height,
            opacity: el.opacity,
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            zIndex: el.zIndex,
            outline: selected
              ? `2px solid ${isPrimary ? '#06b6d4' : '#06b6d480'}`
              : highlightedIds?.has(el.id)
                ? '2px solid #10b981'
                : '1px solid rgba(255,255,255,0.12)',
            outlineOffset: 2,
          }

          // Blend mode
          if (el.blendMode && el.blendMode !== 'normal') {
            wrapperStyle.mixBlendMode = el.blendMode as any
          }

          // Effects → CSS boxShadow
          const effectsShadow = effectsToCss(el.effects)
          const universalShadow = p.shadowBlur > 0
            ? `${p.shadowOffsetX || 0}px ${p.shadowOffsetY || 0}px ${p.shadowBlur}px ${p.shadowColor || '#000000'}`
            : null

          if (effectsShadow && universalShadow) {
            wrapperStyle.boxShadow = `${universalShadow}, ${effectsShadow}`
          } else if (effectsShadow) {
            wrapperStyle.boxShadow = effectsShadow
          } else if (universalShadow) {
            wrapperStyle.boxShadow = universalShadow
          }

          // Clip mask
          if (el.clipMaskId) {
            const maskEl = scene.elements.find(m => m.id === el.clipMaskId)
            if (maskEl) {
              // Build clip path relative to this element
              const rx = maskEl.x - el.x
              const ry = maskEl.y - el.y
              if (maskEl.type === 'shape' && maskEl.props.shape === 'circle') {
                wrapperStyle.clipPath = `ellipse(${maskEl.width / 2}px ${maskEl.height / 2}px at ${rx + maskEl.width / 2}px ${ry + maskEl.height / 2}px)`
              } else {
                wrapperStyle.clipPath = `inset(${Math.max(0, ry)}px ${Math.max(0, el.width - rx - maskEl.width)}px ${Math.max(0, el.height - ry - maskEl.height)}px ${Math.max(0, rx)}px round ${maskEl.props.borderRadius || 0}px)`
              }
            }
          }

          if (p.borderWidth > 0) {
            wrapperStyle.border = `${p.borderWidth}px solid ${p.borderColor || '#06b6d4'}`
          }
          if (p.borderRadius > 0) {
            wrapperStyle.borderRadius = `${p.borderRadius}px`
          }
          if (p.blurAmount > 0) {
            wrapperStyle.backdropFilter = `blur(${p.blurAmount}px)`
            wrapperStyle.WebkitBackdropFilter = `blur(${p.blurAmount}px)`
          }
          if (p.bgColor && p.bgColor !== 'transparent') {
            const opacity = p.bgOpacity ?? 1
            if (opacity < 1) {
              // Convert hex to rgba
              const hex = p.bgColor.replace('#', '')
              const r = parseInt(hex.substring(0, 2), 16) || 0
              const g = parseInt(hex.substring(2, 4), 16) || 0
              const b2 = parseInt(hex.substring(4, 6), 16) || 0
              wrapperStyle.backgroundColor = `rgba(${r},${g},${b2},${opacity})`
            } else {
              wrapperStyle.backgroundColor = p.bgColor
            }
          }
          // Overflow hidden to clip content to border radius
          if (p.borderRadius > 0 || p.borderWidth > 0) {
            wrapperStyle.overflow = 'hidden'
          }

          return (
            <div
              key={el.id}
              className={`absolute select-none ${el.locked ? 'cursor-default' : drag?.type === 'move' && drag.id === el.id ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={wrapperStyle}
              onMouseDown={e => handleMouseDown(e, el.id)}
            >
              {renderElementContent(el)}

              {/* Resize handles — single selection only */}
              {showHandles &&
                HANDLES.map(h => (
                  <div
                    key={h}
                    className="absolute w-2.5 h-2.5 bg-cyan-500 border border-cyan-300 rounded-sm"
                    style={{
                      ...(h.includes('n') ? { top: -5 } : { bottom: -5 }),
                      ...(h.includes('w') ? { left: -5 } : { right: -5 }),
                      cursor: HANDLE_CURSORS[h],
                      zIndex: 9999,
                    }}
                    onMouseDown={e => handleResizeDown(e, el.id, h)}
                  />
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
