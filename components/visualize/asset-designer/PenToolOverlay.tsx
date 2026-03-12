'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

interface Point {
  x: number
  y: number
  cp?: { x: number; y: number } // control point for quadratic bezier
}

interface Props {
  canvasRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  sceneWidth: number
  sceneHeight: number
  onComplete: (pathData: string) => void
  onCancel: () => void
}

function pointsToPathData(points: Point[], closed: boolean): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const pt = points[i]
    if (pt.cp) {
      d += ` Q ${pt.cp.x} ${pt.cp.y} ${pt.x} ${pt.y}`
    } else {
      d += ` L ${pt.x} ${pt.y}`
    }
  }
  if (closed) d += ' Z'
  return d
}

export default function PenToolOverlay({ canvasRef, zoom, sceneWidth, sceneHeight, onComplete, onCancel }: Props) {
  const [points, setPoints] = useState<Point[]>([])
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const getSceneCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: Math.round((e.clientX - rect.left) / zoom),
      y: Math.round((e.clientY - rect.top) / zoom),
    }
  }, [canvasRef, zoom])

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const pos = getSceneCoords(e)

    // Close path if clicking near first point
    if (points.length >= 3) {
      const first = points[0]
      if (Math.abs(pos.x - first.x) < 8 && Math.abs(pos.y - first.y) < 8) {
        onComplete(pointsToPathData(points, true))
        return
      }
    }

    if (e.shiftKey && points.length > 0) {
      // Add bezier with control point at midpoint offset
      const prev = points[points.length - 1]
      const cpX = (prev.x + pos.x) / 2
      const cpY = (prev.y + pos.y) / 2 - 40
      setPoints(prev => [...prev, { ...pos, cp: { x: cpX, y: cpY } }])
    } else {
      setPoints(prev => [...prev, pos])
    }
  }, [points, getSceneCoords, onComplete])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (points.length >= 2) {
      onComplete(pointsToPathData(points, false))
    }
  }, [points, onComplete])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setCursorPos(getSceneCoords(e))
  }, [getSceneCoords])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (points.length >= 2) {
          onComplete(pointsToPathData(points, false))
        } else {
          onCancel()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [points, onComplete, onCancel])

  // Build the preview path
  let previewD = ''
  if (points.length > 0) {
    previewD = pointsToPathData(points, false)
    if (cursorPos) {
      previewD += ` L ${cursorPos.x} ${cursorPos.y}`
    }
  }

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 z-[9998]"
      style={{ width: sceneWidth * zoom, height: sceneHeight * zoom, cursor: 'crosshair' }}
      viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
    >
      {/* Preview path */}
      {previewD && (
        <path d={previewD} fill="none" stroke="#8b5cf6" strokeWidth={2 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} />
      )}

      {/* Vertices */}
      {points.map((pt, i) => (
        <g key={i}>
          <circle
            cx={pt.x} cy={pt.y} r={4 / zoom}
            fill={i === 0 && points.length >= 3 ? '#8b5cf6' : '#06b6d4'}
            stroke="#fff" strokeWidth={1 / zoom}
          />
          {/* Control point handles */}
          {pt.cp && (
            <>
              <line x1={points[i - 1]?.x || pt.x} y1={points[i - 1]?.y || pt.y} x2={pt.cp.x} y2={pt.cp.y} stroke="#8b5cf640" strokeWidth={1 / zoom} />
              <line x1={pt.cp.x} y1={pt.cp.y} x2={pt.x} y2={pt.y} stroke="#8b5cf640" strokeWidth={1 / zoom} />
              <circle cx={pt.cp.x} cy={pt.cp.y} r={3 / zoom} fill="#8b5cf6" stroke="#fff" strokeWidth={1 / zoom} />
            </>
          )}
        </g>
      ))}

      {/* Hint: cursor near first point */}
      {points.length >= 3 && cursorPos && (() => {
        const first = points[0]
        const near = Math.abs(cursorPos.x - first.x) < 8 && Math.abs(cursorPos.y - first.y) < 8
        return near ? (
          <circle cx={first.x} cy={first.y} r={6 / zoom} fill="none" stroke="#8b5cf6" strokeWidth={2 / zoom} />
        ) : null
      })()}
    </svg>
  )
}
