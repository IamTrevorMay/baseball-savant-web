'use client'

import { Guide } from '@/lib/sceneTypes'

interface Props {
  guides: Guide[]
  onAddGuide: (guide: Guide) => void
  onRemoveGuide: (id: string) => void
  zoom: number
  sceneWidth: number
  sceneHeight: number
  showRulers: boolean
  showGuides: boolean
}

const RULER_SIZE = 20

export default function RulerGuides({ guides, onAddGuide, onRemoveGuide, zoom, sceneWidth, sceneHeight, showRulers, showGuides }: Props) {
  if (!showRulers) return null

  const scaledW = sceneWidth * zoom
  const scaledH = sceneHeight * zoom

  // Tick interval: every 50px in scene coords, labels every 100px
  const tickInterval = 50
  const labelInterval = 100

  function handleHRulerClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const sceneX = Math.round((e.clientX - rect.left) / zoom)
    if (sceneX >= 0 && sceneX <= sceneWidth) {
      onAddGuide({ id: Math.random().toString(36).slice(2, 8), axis: 'x', position: sceneX })
    }
  }

  function handleVRulerClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const sceneY = Math.round((e.clientY - rect.top) / zoom)
    if (sceneY >= 0 && sceneY <= sceneHeight) {
      onAddGuide({ id: Math.random().toString(36).slice(2, 8), axis: 'y', position: sceneY })
    }
  }

  function handleContextMenu(e: React.MouseEvent, guideId: string) {
    e.preventDefault()
    onRemoveGuide(guideId)
  }

  const hTicks: number[] = []
  for (let x = 0; x <= sceneWidth; x += tickInterval) hTicks.push(x)

  const vTicks: number[] = []
  for (let y = 0; y <= sceneHeight; y += tickInterval) vTicks.push(y)

  return (
    <>
      {/* Horizontal ruler (top) */}
      <div
        className="absolute bg-zinc-900/90 border-b border-zinc-700 cursor-crosshair select-none overflow-hidden"
        style={{ left: RULER_SIZE, top: 0, width: scaledW, height: RULER_SIZE, zIndex: 9980 }}
        onMouseDown={handleHRulerClick}
      >
        {hTicks.map(x => {
          const isLabel = x % labelInterval === 0
          return (
            <div key={x} className="absolute" style={{ left: x * zoom, top: 0 }}>
              <div
                className="bg-zinc-600"
                style={{ width: 1, height: isLabel ? RULER_SIZE : RULER_SIZE / 2, position: 'absolute', top: isLabel ? 0 : RULER_SIZE / 2 }}
              />
              {isLabel && (
                <span className="absolute text-[8px] text-zinc-500 select-none" style={{ left: 3, top: 1 }}>
                  {x}
                </span>
              )}
            </div>
          )
        })}
        {/* Guide markers on ruler */}
        {showGuides && guides.filter(g => g.axis === 'x').map(g => (
          <div
            key={g.id}
            className="absolute w-0.5 bg-violet-500 cursor-pointer"
            style={{ left: g.position * zoom - 1, top: 0, height: RULER_SIZE }}
            onContextMenu={e => handleContextMenu(e, g.id)}
            title="Right-click to remove"
          />
        ))}
      </div>

      {/* Vertical ruler (left) */}
      <div
        className="absolute bg-zinc-900/90 border-r border-zinc-700 cursor-crosshair select-none overflow-hidden"
        style={{ left: 0, top: RULER_SIZE, width: RULER_SIZE, height: scaledH, zIndex: 9980 }}
        onMouseDown={handleVRulerClick}
      >
        {vTicks.map(y => {
          const isLabel = y % labelInterval === 0
          return (
            <div key={y} className="absolute" style={{ top: y * zoom, left: 0 }}>
              <div
                className="bg-zinc-600"
                style={{ height: 1, width: isLabel ? RULER_SIZE : RULER_SIZE / 2, position: 'absolute', left: isLabel ? 0 : RULER_SIZE / 2 }}
              />
              {isLabel && (
                <span className="absolute text-[8px] text-zinc-500 select-none" style={{ top: 2, left: 2, writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
                  {y}
                </span>
              )}
            </div>
          )
        })}
        {/* Guide markers on ruler */}
        {showGuides && guides.filter(g => g.axis === 'y').map(g => (
          <div
            key={g.id}
            className="absolute h-0.5 bg-violet-500 cursor-pointer"
            style={{ top: g.position * zoom - 1, left: 0, width: RULER_SIZE }}
            onContextMenu={e => handleContextMenu(e, g.id)}
            title="Right-click to remove"
          />
        ))}
      </div>

      {/* Corner square */}
      <div
        className="absolute bg-zinc-900/90 border-b border-r border-zinc-700"
        style={{ left: 0, top: 0, width: RULER_SIZE, height: RULER_SIZE, zIndex: 9981 }}
      />
    </>
  )
}
