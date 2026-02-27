'use client'

import { useCallback, useState, useRef, useEffect } from 'react'
import { Scene, SceneElement } from '@/lib/sceneTypes'
import PitchFlightRenderer from './PitchFlightRenderer'
import StadiumRenderer from './StadiumRenderer'

// ── Ticker Renderer ──────────────────────────────────────────────────────────

function TickerRenderer({ props: p, width, height }: { props: Record<string, any>; width: number; height: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const speed = (p.speed || 60) / 60 // pixels per frame at 60fps
    const dir = p.direction === 'right' ? 1 : -1
    let last = 0

    function tick(ts: number) {
      if (!last) last = ts
      const dt = ts - last
      last = ts
      setOffset(prev => {
        const next = prev + dir * speed * (dt / 16.67)
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [p.speed, p.direction])

  const text = p.text || 'Ticker text here'
  const doubled = `${text}${p.separator || ' \u2022 '}${text}${p.separator || ' \u2022 '}`

  return (
    <div
      className="w-full h-full overflow-hidden flex items-center"
      style={{ backgroundColor: p.showBg !== false ? (p.bgColor || '#09090b') : 'transparent' }}
    >
      <div
        ref={scrollRef}
        className="whitespace-nowrap"
        style={{
          fontSize: p.fontSize || 20,
          fontWeight: p.fontWeight || 600,
          color: p.color || '#ffffff',
          transform: `translateX(${offset % (width * 2)}px)`,
        }}
      >
        {doubled}
      </div>
    </div>
  )
}

// ── Element Renderers ──────────────────────────────────────────────────────────

function StatCardRenderer({ props: p }: { props: Record<string, any> }) {
  const styles: Record<string, React.CSSProperties> = {
    glass: {
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderLeft: `3px solid ${p.color}`,
    },
    solid: {
      background: 'rgba(0,0,0,0.7)',
      borderTop: `3px solid ${p.color}`,
    },
    outline: {
      background: 'transparent',
      border: `2px solid ${p.color}`,
    },
  }
  const style = styles[p.variant] || styles.glass

  return (
    <div className="w-full h-full rounded-xl flex flex-col justify-center px-5 overflow-hidden" style={style}>
      <div
        className="font-semibold uppercase tracking-wider text-zinc-400"
        style={{ fontSize: Math.max(10, p.fontSize * 0.26) }}
      >
        {p.label}
      </div>
      <div
        className="font-bold leading-none mt-1"
        style={{ fontSize: p.fontSize, color: p.color, fontVariantNumeric: 'tabular-nums' }}
      >
        {p.value}
      </div>
      {p.sublabel && (
        <div className="text-zinc-500 mt-1.5" style={{ fontSize: Math.max(10, p.fontSize * 0.28) }}>
          {p.sublabel}
        </div>
      )}
    </div>
  )
}

function TextRenderer({ props: p }: { props: Record<string, any> }) {
  return (
    <div
      className="w-full h-full flex items-center overflow-hidden"
      style={{
        justifyContent: p.textAlign === 'center' ? 'center' : p.textAlign === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          fontSize: p.fontSize,
          fontWeight: p.fontWeight,
          color: p.color,
          textAlign: p.textAlign,
          width: '100%',
          lineHeight: 1.2,
        }}
      >
        {p.text}
      </div>
    </div>
  )
}

function ShapeRenderer({ props: p }: { props: Record<string, any> }) {
  return (
    <div
      className="w-full h-full"
      style={{
        backgroundColor: p.fill,
        border: p.strokeWidth > 0 ? `${p.strokeWidth}px solid ${p.stroke}` : undefined,
        borderRadius: p.shape === 'circle' ? '50%' : p.borderRadius,
      }}
    />
  )
}

function PlayerImageRenderer({ props: p, width, height }: { props: Record<string, any>; width: number; height: number }) {
  const imgUrl = p.playerId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.playerId}/headshot/67/current`
    : null
  const imgH = p.showLabel && p.playerName ? height - 28 : height

  return (
    <div className="w-full h-full flex flex-col items-center">
      <div
        className="flex-1 w-full flex items-center justify-center overflow-hidden rounded-xl"
        style={{ border: `2px solid ${p.borderColor}`, height: imgH }}
      >
        {imgUrl ? (
          <img src={imgUrl} alt={p.playerName} className="w-full h-full object-cover" />
        ) : (
          <div className="text-zinc-600 text-4xl">{'\u25c9'}</div>
        )}
      </div>
      {p.showLabel && p.playerName && (
        <div className="text-xs font-medium text-white text-center truncate w-full mt-1">{p.playerName}</div>
      )}
    </div>
  )
}

function ComparisonBarRenderer({ props: p, height }: { props: Record<string, any>; height: number }) {
  const pct = Math.min(100, Math.max(0, (p.value / p.maxValue) * 100))
  const labelSize = Math.max(10, Math.min(16, height * 0.28))
  const barH = Math.max(6, height * 0.35)
  const gap = Math.max(2, height * 0.06)

  return (
    <div className="w-full h-full flex flex-col justify-center px-1" style={{ gap }}>
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 font-medium" style={{ fontSize: labelSize }}>{p.label}</span>
        {p.showValue && (
          <span className="text-white font-bold" style={{ fontSize: labelSize, fontVariantNumeric: 'tabular-nums' }}>
            {p.value}
          </span>
        )}
      </div>
      <div className="w-full bg-zinc-800 rounded-full overflow-hidden" style={{ height: barH }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
      </div>
    </div>
  )
}

function renderElementContent(el: SceneElement) {
  switch (el.type) {
    case 'stat-card':
      return <StatCardRenderer props={el.props} />
    case 'text':
      return <TextRenderer props={el.props} />
    case 'shape':
      return <ShapeRenderer props={el.props} />
    case 'player-image':
      return <PlayerImageRenderer props={el.props} width={el.width} height={el.height} />
    case 'comparison-bar':
      return <ComparisonBarRenderer props={el.props} height={el.height} />
    case 'pitch-flight':
      return <PitchFlightRenderer props={el.props} width={el.width} height={el.height} />
    case 'stadium':
      return <StadiumRenderer props={el.props} width={el.width} height={el.height} />
    case 'ticker':
      return <TickerRenderer props={el.props} width={el.width} height={el.height} />
    default:
      return <div className="w-full h-full bg-zinc-800/50 border border-dashed border-zinc-700 flex items-center justify-center text-zinc-500 text-xs">Unknown</div>
  }
}

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
      { my: myL, target: oL },  // left-to-left
      { my: myR, target: oR },  // right-to-right
      { my: myL, target: oR },  // left-to-right
      { my: myR, target: oL },  // right-to-left
      { my: myCX, target: oCX }, // center-to-center
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

  return { x: Math.round(snapX), y: Math.round(snapY), guides }
}

// ── Interaction types ────────────────────────────────────────────────────────

type DragState =
  | { type: 'move'; id: string; startX: number; startY: number; elX: number; elY: number }
  | { type: 'resize'; id: string; handle: string; startX: number; startY: number; elX: number; elY: number; elW: number; elH: number }
  | null

const HANDLES = ['nw', 'ne', 'sw', 'se'] as const
const HANDLE_CURSORS: Record<string, string> = { nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize' }

// ── SceneCanvas ──────────────────────────────────────────────────────────────

interface Props {
  scene: Scene
  selectedId: string | null
  selectedIds?: Set<string>
  zoom: number
  onSelect: (id: string | null, additive?: boolean) => void
  onUpdateElement: (id: string, updates: Partial<SceneElement>) => void
  canvasRef: React.RefObject<HTMLDivElement | null>
}

export default function SceneCanvas({ scene, selectedId, selectedIds, zoom, onSelect, onUpdateElement, canvasRef }: Props) {
  const [drag, setDrag] = useState<DragState>(null)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const el = scene.elements.find(el => el.id === id)
      if (!el) return
      onSelect(id, e.shiftKey)
      if (el.locked) return
      setDrag({ type: 'move', id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y })
    },
    [scene.elements, onSelect]
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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drag) return
      const dx = (e.clientX - drag.startX) / zoom
      const dy = (e.clientY - drag.startY) / zoom

      if (drag.type === 'move') {
        const el = scene.elements.find(el => el.id === drag.id)
        if (!el) return

        const rawX = drag.elX + dx
        const rawY = drag.elY + dy

        // Compute snap guides
        const { x: snappedX, y: snappedY, guides } = computeSnapGuides(
          el, rawX, rawY, scene.elements, scene.width, scene.height
        )
        setSnapGuides(guides)

        // Move selected element
        const offsetX = snappedX - el.x
        const offsetY = snappedY - el.y
        onUpdateElement(drag.id, { x: snappedX, y: snappedY })

        // Move other selected elements (multi-select group move)
        if (selectedIds && selectedIds.size > 1 && selectedIds.has(drag.id)) {
          for (const otherId of selectedIds) {
            if (otherId === drag.id) continue
            const other = scene.elements.find(e => e.id === otherId)
            if (other && !other.locked) {
              onUpdateElement(otherId, { x: other.x + offsetX, y: other.y + offsetY })
            }
          }
        }
      } else if (drag.type === 'resize') {
        const { handle, elX, elY, elW, elH } = drag
        let nx = elX, ny = elY, nw = elW, nh = elH
        if (handle.includes('e')) nw = Math.max(20, elW + dx)
        if (handle.includes('w')) { nw = Math.max(20, elW - dx); nx = elX + (elW - nw) }
        if (handle.includes('s')) nh = Math.max(20, elH + dy)
        if (handle.includes('n')) { nh = Math.max(20, elH - dy); ny = elY + (elH - nh) }
        onUpdateElement(drag.id, { x: Math.round(nx), y: Math.round(ny), width: Math.round(nw), height: Math.round(nh) })
      }
    },
    [drag, zoom, onUpdateElement, scene.elements, scene.width, scene.height, selectedIds]
  )

  const handleMouseUp = useCallback(() => {
    setDrag(null)
    setSnapGuides([])
  }, [])

  const allSelected = selectedIds || new Set(selectedId ? [selectedId] : [])

  return (
    <div
      className="w-full h-full overflow-auto flex items-center justify-center"
      style={{ background: 'radial-gradient(circle at center, #1a1a1e 0%, #09090b 100%)' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Scene canvas */}
      <div
        ref={canvasRef}
        className="relative shrink-0 shadow-2xl"
        style={{
          width: scene.width,
          height: scene.height,
          backgroundColor: scene.background,
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
        }}
        onMouseDown={e => {
          if (e.target === e.currentTarget) onSelect(null)
        }}
      >
        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />

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

        {/* Elements */}
        {[...scene.elements].sort((a, b) => a.zIndex - b.zIndex).map(el => {
          const selected = allSelected.has(el.id)
          const isPrimary = el.id === selectedId
          return (
            <div
              key={el.id}
              className={`absolute select-none ${el.locked ? 'cursor-default' : drag?.type === 'move' && drag.id === el.id ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{
                left: el.x,
                top: el.y,
                width: el.width,
                height: el.height,
                opacity: el.opacity,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                zIndex: el.zIndex,
                outline: selected ? `2px solid ${isPrimary ? '#06b6d4' : '#06b6d480'}` : undefined,
                outlineOffset: 2,
              }}
              onMouseDown={e => handleMouseDown(e, el.id)}
            >
              {renderElementContent(el)}

              {/* Resize handles */}
              {isPrimary && !el.locked &&
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
