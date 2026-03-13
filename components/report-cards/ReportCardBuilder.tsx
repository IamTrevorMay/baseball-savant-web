'use client'

import { useCallback, useRef } from 'react'
import { Scene, SceneElement, ElementType, createElement } from '@/lib/sceneTypes'
import { defaultReportCardBinding } from '@/lib/reportCardDefaults'
import SceneCanvas from '@/components/visualize/scene-composer/SceneCanvas'
import RCElementCatalog from './RCElementCatalog'
import RCPropertiesPanel from './RCPropertiesPanel'

interface Props {
  scene: Scene
  setScene: (s: Scene | ((prev: Scene) => Scene)) => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  selectedIds: Set<string>
  setSelectedIds: (ids: Set<string>) => void
  zoom: number
  setZoom: (z: number) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export default function ReportCardBuilder({
  scene, setScene, selectedId, setSelectedId, selectedIds, setSelectedIds,
  zoom, setZoom, undo, redo, canUndo, canRedo,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const selectedElement = scene.elements.find(e => e.id === selectedId) ?? null

  const addElement = useCallback((type: ElementType) => {
    const el = createElement(type, scene.width / 2, scene.height / 2)
    if (type.startsWith('rc-')) {
      (el as any).reportCardBinding = defaultReportCardBinding(type as any)
    }
    setScene(prev => ({ ...prev, elements: [...prev.elements, el] }))
    setSelectedId(el.id)
    setSelectedIds(new Set([el.id]))
  }, [scene.width, scene.height, setScene, setSelectedId, setSelectedIds])

  const updateElement = useCallback((id: string, updates: Partial<SceneElement>) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, ...updates } : e)),
    }))
  }, [setScene])

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id)
    setSelectedIds(new Set(id ? [id] : []))
  }, [setSelectedId, setSelectedIds])

  const handleSelectMany = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
    setSelectedId(ids.length > 0 ? ids[0] : null)
  }, [setSelectedId, setSelectedIds])

  // Keyboard delete
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      setScene(prev => ({
        ...prev,
        elements: prev.elements.filter(el => el.id !== selectedId),
      }))
      setSelectedId(null)
      setSelectedIds(new Set())
    }
  }, [selectedId, setScene, setSelectedId, setSelectedIds])

  return (
    <div className="flex flex-1 overflow-hidden" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Left: Element Catalog */}
      <RCElementCatalog onAddElement={addElement} />

      {/* Center: Canvas */}
      <div className="flex-1 relative overflow-hidden bg-zinc-950">
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-lg px-2 py-1">
          <button onClick={() => setZoom(Math.max(0.1, zoom - 0.1))} className="text-zinc-400 hover:text-white text-xs px-1">-</button>
          <span className="text-[10px] text-zinc-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(2, zoom + 0.1))} className="text-zinc-400 hover:text-white text-xs px-1">+</button>
        </div>

        {/* Undo/Redo */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="px-2 py-1 bg-zinc-800/80 border border-zinc-700 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30"
          >
            Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="px-2 py-1 bg-zinc-800/80 border border-zinc-700 rounded text-xs text-zinc-400 hover:text-white disabled:opacity-30"
          >
            Redo
          </button>
        </div>

        <SceneCanvas
          scene={scene}
          selectedId={selectedId}
          selectedIds={selectedIds}
          zoom={zoom}
          onSelect={handleSelect}
          onSelectMany={handleSelectMany}
          onUpdateElement={updateElement}
          canvasRef={canvasRef}
        />
      </div>

      {/* Right: Properties Panel */}
      <RCPropertiesPanel element={selectedElement} onUpdate={updateElement} />
    </div>
  )
}
