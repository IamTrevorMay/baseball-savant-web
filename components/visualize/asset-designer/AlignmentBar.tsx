'use client'

import { SceneElement } from '@/lib/sceneTypes'

type AlignType = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom' | 'distribute-h' | 'distribute-v'

interface Props {
  selectedIds: Set<string>
  elements: SceneElement[]
  onUpdateElement: (id: string, updates: Partial<SceneElement>) => void
}

const BUTTONS: { type: AlignType; icon: string; title: string }[] = [
  { type: 'left', icon: '\u2590', title: 'Align Left' },
  { type: 'center-h', icon: '\u2503', title: 'Center Horizontally' },
  { type: 'right', icon: '\u258C', title: 'Align Right' },
  { type: 'top', icon: '\u2581', title: 'Align Top' },
  { type: 'center-v', icon: '\u2501', title: 'Center Vertically' },
  { type: 'bottom', icon: '\u2594', title: 'Align Bottom' },
  { type: 'distribute-h', icon: '\u2261', title: 'Distribute Horizontally' },
  { type: 'distribute-v', icon: '\u2237', title: 'Distribute Vertically' },
]

export default function AlignmentBar({ selectedIds, elements, onUpdateElement }: Props) {
  if (selectedIds.size < 2) return null

  const selected = elements.filter(e => selectedIds.has(e.id))
  if (selected.length < 2) return null

  function handleAlign(type: AlignType) {
    const minX = Math.min(...selected.map(e => e.x))
    const maxX = Math.max(...selected.map(e => e.x + e.width))
    const minY = Math.min(...selected.map(e => e.y))
    const maxY = Math.max(...selected.map(e => e.y + e.height))
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    switch (type) {
      case 'left':
        selected.forEach(e => onUpdateElement(e.id, { x: minX }))
        break
      case 'center-h':
        selected.forEach(e => onUpdateElement(e.id, { x: Math.round(centerX - e.width / 2) }))
        break
      case 'right':
        selected.forEach(e => onUpdateElement(e.id, { x: maxX - e.width }))
        break
      case 'top':
        selected.forEach(e => onUpdateElement(e.id, { y: minY }))
        break
      case 'center-v':
        selected.forEach(e => onUpdateElement(e.id, { y: Math.round(centerY - e.height / 2) }))
        break
      case 'bottom':
        selected.forEach(e => onUpdateElement(e.id, { y: maxY - e.height }))
        break
      case 'distribute-h': {
        const sorted = [...selected].sort((a, b) => a.x - b.x)
        if (sorted.length < 3) break
        const first = sorted[0].x
        const last = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width
        const totalWidth = sorted.reduce((sum, e) => sum + e.width, 0)
        const gap = (last - first - totalWidth) / (sorted.length - 1)
        let cx = first
        sorted.forEach(e => {
          onUpdateElement(e.id, { x: Math.round(cx) })
          cx += e.width + gap
        })
        break
      }
      case 'distribute-v': {
        const sorted = [...selected].sort((a, b) => a.y - b.y)
        if (sorted.length < 3) break
        const first = sorted[0].y
        const last = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height
        const totalHeight = sorted.reduce((sum, e) => sum + e.height, 0)
        const gap = (last - first - totalHeight) / (sorted.length - 1)
        let cy = first
        sorted.forEach(e => {
          onUpdateElement(e.id, { y: Math.round(cy) })
          cy += e.height + gap
        })
        break
      }
    }
  }

  // Position above the multi-select bounding box
  const minX = Math.min(...selected.map(e => e.x))
  const minY = Math.min(...selected.map(e => e.y))

  return (
    <div
      className="absolute flex items-center gap-0.5 bg-zinc-900 border border-zinc-700 rounded-lg px-1 py-0.5 shadow-xl"
      style={{ left: minX, top: minY - 36, zIndex: 9990 }}
    >
      {BUTTONS.map(b => (
        <button
          key={b.type}
          onClick={() => handleAlign(b.type)}
          className="w-6 h-6 flex items-center justify-center rounded text-[11px] text-zinc-400 hover:text-violet-400 hover:bg-zinc-800 transition"
          title={b.title}
        >
          {b.icon}
        </button>
      ))}
    </div>
  )
}
