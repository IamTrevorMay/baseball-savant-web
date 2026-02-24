'use client'
import { useState, useRef, useCallback, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Annotation {
  id: string
  type: 'text' | 'arrow' | 'circle' | 'rect' | 'triangle'
  x: number  // % of container
  y: number  // % of container
  width?: number   // % for shapes
  height?: number  // %
  text?: string
  fontSize?: number
  color: string
  fillColor?: string
  strokeWidth: number
  locked: boolean
  x2?: number  // arrow endpoint %
  y2?: number  // arrow endpoint %
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0
function uid() { return `ann-${++idCounter}-${Date.now()}` }

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

function ToolBtn({ label, icon, onClick, active }: { label: string; icon: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-7 h-7 flex items-center justify-center rounded text-xs transition
        ${active ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-600/50' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-600'}`}
    >
      {icon}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Single annotation renderer
// ---------------------------------------------------------------------------

function AnnotationEl({
  ann, selected, onSelect, onUpdate, onDelete, containerW, containerH,
}: {
  ann: Annotation
  selected: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<Annotation>) => void
  onDelete: () => void
  containerW: number
  containerH: number
}) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const px = (ann.x / 100) * containerW
  const py = (ann.y / 100) * containerH

  function handlePointerDown(e: React.PointerEvent) {
    if (ann.locked) return
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: ann.x, origY: ann.y }
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const dx = ((ev.clientX - dragRef.current.startX) / containerW) * 100
      const dy = ((ev.clientY - dragRef.current.startY) / containerH) * 100
      onUpdate({
        x: clamp(dragRef.current.origX + dx, 0, 100),
        y: clamp(dragRef.current.origY + dy, 0, 100),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const outline = selected ? 'ring-1 ring-cyan-400/60' : ''
  const common = `absolute pointer-events-auto cursor-move ${outline}`

  // Delete / lock controls
  const controls = selected && !ann.locked ? (
    <div className="absolute -top-6 left-0 flex gap-1 pointer-events-auto" style={{ zIndex: 1 }}>
      <button onClick={(e) => { e.stopPropagation(); onUpdate({ locked: true }) }}
        className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 text-[9px] flex items-center justify-center hover:text-white"
        title="Lock">L</button>
      <button onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 text-red-400 text-[9px] flex items-center justify-center hover:text-red-300"
        title="Delete">&times;</button>
    </div>
  ) : selected && ann.locked ? (
    <div className="absolute -top-6 left-0 flex gap-1 pointer-events-auto" style={{ zIndex: 1 }}>
      <button onClick={(e) => { e.stopPropagation(); onUpdate({ locked: false }) }}
        className="w-5 h-5 rounded bg-zinc-800 border border-zinc-700 text-amber-400 text-[9px] flex items-center justify-center hover:text-amber-300"
        title="Unlock">U</button>
    </div>
  ) : null

  if (ann.type === 'text') {
    return (
      <div
        className={common}
        style={{ left: px, top: py, fontSize: ann.fontSize || 14, color: ann.color, minWidth: 20 }}
        onPointerDown={handlePointerDown}
        onClick={(e) => { e.stopPropagation(); onSelect() }}
      >
        {controls}
        <div
          contentEditable={!ann.locked}
          suppressContentEditableWarning
          onBlur={e => onUpdate({ text: e.currentTarget.textContent || '' })}
          className="outline-none whitespace-pre-wrap select-text"
          style={{ pointerEvents: ann.locked ? 'none' : 'auto', fontWeight: 600 }}
        >
          {ann.text || 'Text'}
        </div>
      </div>
    )
  }

  if (ann.type === 'arrow') {
    const x2p = ((ann.x2 ?? ann.x + 10) / 100) * containerW
    const y2p = ((ann.y2 ?? ann.y) / 100) * containerH
    return (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        {controls && <foreignObject x={px - 5} y={py - 24} width="60" height="20">{controls}</foreignObject>}
        <defs>
          <marker id={`ah-${ann.id}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill={ann.color} />
          </marker>
        </defs>
        <line
          x1={px} y1={py} x2={x2p} y2={y2p}
          stroke={ann.color} strokeWidth={ann.strokeWidth}
          markerEnd={`url(#ah-${ann.id})`}
          className="pointer-events-auto cursor-move"
          onPointerDown={handlePointerDown as any}
          onClick={(e) => { e.stopPropagation(); onSelect() }}
        />
      </svg>
    )
  }

  // Shape dimensions
  const w = ((ann.width || 8) / 100) * containerW
  const h = ((ann.height || 6) / 100) * containerH

  if (ann.type === 'circle') {
    return (
      <div
        className={common}
        style={{
          left: px - w / 2, top: py - h / 2, width: w, height: h,
          borderRadius: '50%',
          border: `${ann.strokeWidth}px solid ${ann.color}`,
          backgroundColor: ann.fillColor || 'transparent',
        }}
        onPointerDown={handlePointerDown}
        onClick={(e) => { e.stopPropagation(); onSelect() }}
      >
        {controls}
      </div>
    )
  }

  if (ann.type === 'rect') {
    return (
      <div
        className={common}
        style={{
          left: px, top: py, width: w, height: h,
          border: `${ann.strokeWidth}px solid ${ann.color}`,
          backgroundColor: ann.fillColor || 'transparent',
          borderRadius: 2,
        }}
        onPointerDown={handlePointerDown}
        onClick={(e) => { e.stopPropagation(); onSelect() }}
      >
        {controls}
      </div>
    )
  }

  if (ann.type === 'triangle') {
    const points = `${w / 2},0 ${w},${h} 0,${h}`
    return (
      <div
        className={`${common}`}
        style={{ left: px, top: py, width: w, height: h }}
        onPointerDown={handlePointerDown}
        onClick={(e) => { e.stopPropagation(); onSelect() }}
      >
        {controls}
        <svg width={w} height={h} className="overflow-visible">
          <polygon
            points={points}
            stroke={ann.color} strokeWidth={ann.strokeWidth}
            fill={ann.fillColor || 'transparent'}
          />
        </svg>
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// AnnotationLayer
// ---------------------------------------------------------------------------

export default function AnnotationLayer({ containerRef }: { containerRef: React.RefObject<HTMLDivElement> }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  // Track container size
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [containerRef])

  const addAnnotation = useCallback((type: Annotation['type']) => {
    const ann: Annotation = {
      id: uid(),
      type,
      x: 10 + Math.random() * 30,
      y: 10 + Math.random() * 30,
      width: type === 'text' || type === 'arrow' ? undefined : 8,
      height: type === 'text' || type === 'arrow' ? undefined : 6,
      text: type === 'text' ? 'Text' : undefined,
      fontSize: 14,
      color: '#06b6d4',
      fillColor: undefined,
      strokeWidth: 2,
      locked: false,
      x2: type === 'arrow' ? 10 + Math.random() * 30 + 15 : undefined,
      y2: type === 'arrow' ? 10 + Math.random() * 30 : undefined,
    }
    setAnnotations(prev => [...prev, ann])
    setSelectedId(ann.id)
  }, [])

  const updateAnnotation = useCallback((id: string, patch: Partial<Annotation>) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }, [])

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id))
    if (selectedId === id) setSelectedId(null)
  }, [selectedId])

  return (
    <>
      {/* Floating mini-toolbar */}
      <div className="absolute top-2 right-2 z-10 flex gap-1 pointer-events-auto">
        <ToolBtn label="Text" icon="T" onClick={() => addAnnotation('text')} />
        <ToolBtn label="Arrow" icon="→" onClick={() => addAnnotation('arrow')} />
        <ToolBtn label="Circle" icon="○" onClick={() => addAnnotation('circle')} />
        <ToolBtn label="Rectangle" icon="□" onClick={() => addAnnotation('rect')} />
        <ToolBtn label="Triangle" icon="△" onClick={() => addAnnotation('triangle')} />
      </div>

      {/* Annotation overlay — pointer-events: none so clicks pass through to viz */}
      <div
        className="absolute inset-0 z-[5] pointer-events-none overflow-hidden"
        onClick={() => setSelectedId(null)}
      >
        {annotations.map(ann => (
          <AnnotationEl
            key={ann.id}
            ann={ann}
            selected={selectedId === ann.id}
            onSelect={() => setSelectedId(ann.id)}
            onUpdate={patch => updateAnnotation(ann.id, patch)}
            onDelete={() => deleteAnnotation(ann.id)}
            containerW={containerSize.w}
            containerH={containerSize.h}
          />
        ))}
      </div>
    </>
  )
}
