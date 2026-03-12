'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Scene, SceneElement, ElementType, createElement, createDefaultScene, SCENE_PRESETS } from '@/lib/sceneTypes'
import { useSceneHistory } from '@/lib/useSceneHistory'
import SceneCanvas from '@/components/visualize/scene-composer/SceneCanvas'
import { exportScenePNG } from '@/components/visualize/scene-composer/exportScene'
import DesignerToolbar from '@/components/visualize/asset-designer/DesignerToolbar'
import LayersPanel from '@/components/visualize/asset-designer/LayersPanel'
import DesignerPropertiesPanel from '@/components/visualize/asset-designer/DesignerPropertiesPanel'
import PushToDialog from '@/components/visualize/asset-designer/PushToDialog'
import DesignGallery from '@/components/visualize/asset-designer/DesignGallery'

const STORAGE_KEY = 'triton-asset-designer-draft'
const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1.0]

interface SavedDesign {
  id: string
  name: string
  type: string
  config: Scene
  created_at: string
}

export default function AssetDesignerPage() {
  const [scene, setScene, { undo, redo, canUndo, canRedo }] = useSceneHistory<Scene>(createDefaultScene())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(0.5)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [showPushDialog, setShowPushDialog] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const canvasRef = useRef<HTMLDivElement>(null)

  // ── Persistence (localStorage draft) ──────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setScene(parsed.scene || createDefaultScene())
        if (parsed.savedId) setSavedId(parsed.savedId)
      }
    } catch {}
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ scene, savedId }))
    } catch {}
  }, [scene, loaded, savedId])

  // ── Element CRUD ──────────────────────────────────────────────────────────

  const selectedElement = scene.elements.find(e => e.id === selectedId) ?? null

  const addElement = useCallback((type: ElementType) => {
    const el = createElement(type, scene.width / 2, scene.height / 2)
    setScene(prev => ({ ...prev, elements: [...prev.elements, el] }))
    setSelectedId(el.id)
    setSelectedIds(new Set([el.id]))
  }, [scene.width, scene.height, setScene])

  const updateElement = useCallback((id: string, updates: Partial<SceneElement>) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, ...updates } : e)),
    }))
  }, [setScene])

  const deleteElement = useCallback((id: string) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.filter(e => e.id !== id),
    }))
    if (selectedId === id) {
      setSelectedId(null)
      setSelectedIds(new Set())
    }
  }, [setScene, selectedId])

  const duplicateElement = useCallback((id: string) => {
    setScene(prev => {
      const el = prev.elements.find(e => e.id === id)
      if (!el) return prev
      const dup: SceneElement = {
        ...el,
        id: Math.random().toString(36).slice(2, 10),
        x: el.x + 20,
        y: el.y + 20,
        zIndex: el.zIndex + 1,
        props: { ...el.props },
      }
      setSelectedId(dup.id)
      setSelectedIds(new Set([dup.id]))
      return { ...prev, elements: [...prev.elements, dup] }
    })
  }, [setScene])

  const deleteSelected = useCallback(() => {
    if (selectedIds.size > 0) {
      setScene(prev => ({
        ...prev,
        elements: prev.elements.filter(e => !selectedIds.has(e.id)),
      }))
      setSelectedId(null)
      setSelectedIds(new Set())
    } else if (selectedId) {
      deleteElement(selectedId)
    }
  }, [selectedIds, selectedId, setScene, deleteElement])

  // ── Canvas batch updates (from SceneCanvas drag/resize) ────────────────

  const handleCanvasUpdate = useCallback((id: string, updates: Partial<SceneElement>) => {
    updateElement(id, updates)
  }, [updateElement])

  // ── Layers panel operations ────────────────────────────────────────────

  const handleReorder = useCallback((fromIdx: number, toIdx: number) => {
    const sorted = [...scene.elements].sort((a, b) => b.zIndex - a.zIndex)
    const [moved] = sorted.splice(fromIdx, 1)
    sorted.splice(toIdx, 0, moved)
    // Reassign zIndex from top to bottom
    const updates = sorted.map((el, i) => ({ ...el, zIndex: sorted.length - i }))
    setScene(prev => ({ ...prev, elements: prev.elements.map(e => {
      const u = updates.find(u => u.id === e.id)
      return u ? { ...e, zIndex: u.zIndex } : e
    }) }))
  }, [scene.elements, setScene])

  const handleRename = useCallback((id: string, name: string) => {
    updateElement(id, { props: { ...scene.elements.find(e => e.id === id)?.props, _layerName: name } } as any)
  }, [scene.elements, updateElement])

  const handleToggleVisibility = useCallback((id: string) => {
    setHiddenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleToggleLock = useCallback((id: string) => {
    const el = scene.elements.find(e => e.id === id)
    if (el) updateElement(id, { locked: !el.locked })
  }, [scene.elements, updateElement])

  // ── Zoom ──────────────────────────────────────────────────────────────────

  const zoomIn = useCallback(() => {
    setZoom(prev => {
      const idx = ZOOM_STEPS.findIndex(z => z >= prev)
      return ZOOM_STEPS[Math.min(idx + 1, ZOOM_STEPS.length - 1)]
    })
  }, [])

  const zoomOut = useCallback(() => {
    setZoom(prev => {
      const idx = ZOOM_STEPS.findIndex(z => z >= prev)
      return ZOOM_STEPS[Math.max(idx - 1, 0)]
    })
  }, [])

  const zoomFit = useCallback(() => {
    // Auto-fit canvas to available viewport
    const panelW = 200 + 280 // layers + properties
    const available = window.innerWidth - panelW - 40
    const z = Math.min(available / scene.width, (window.innerHeight - 80) / scene.height, 1)
    setZoom(Math.round(z * 100) / 100)
  }, [scene.width, scene.height])

  // ── Canvas resize ─────────────────────────────────────────────────────────

  const resizeCanvas = useCallback((w: number, h: number) => {
    setScene(prev => ({ ...prev, width: w, height: h }))
  }, [setScene])

  // ── Save/Load ─────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      if (savedId) {
        // Update existing
        await fetch('/api/scene-assets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedId, name: scene.name, config: scene }),
        })
      } else {
        // Create new
        const res = await fetch('/api/scene-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: scene.name, type: 'design', config: scene }),
        })
        const data = await res.json()
        if (data.id) setSavedId(data.id)
      }
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [savedId, scene])

  const handleExport = useCallback(() => {
    const filename = `${scene.name.replace(/\s+/g, '-').toLowerCase()}.png`
    exportScenePNG(scene, filename)
  }, [scene])

  const handleOpenDesign = useCallback((design: SavedDesign) => {
    setScene(design.config)
    setSavedId(design.id)
    setShowGallery(false)
    setSelectedId(null)
    setSelectedIds(new Set())
    setHiddenIds(new Set())
  }, [setScene])

  const handleNewDesign = useCallback(() => {
    const s = createDefaultScene()
    s.name = 'Untitled Design'
    setScene(s)
    setSavedId(null)
    setShowGallery(false)
    setSelectedId(null)
    setSelectedIds(new Set())
    setHiddenIds(new Set())
  }, [setScene])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (meta && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      if (meta && e.key === 'Z') { e.preventDefault(); redo() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target?.toString().includes('Input')) { deleteSelected() }
      if (meta && e.key === 'd') { e.preventDefault(); if (selectedId) duplicateElement(selectedId) }
      if (meta && e.key === 's') { e.preventDefault(); handleSave() }
      if (meta && e.key === 'e') { e.preventDefault(); handleExport() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [undo, redo, deleteSelected, selectedId, duplicateElement, handleSave, handleExport])

  // ── Visible elements (filter hidden) ──────────────────────────────────────

  const visibleScene = {
    ...scene,
    elements: scene.elements.filter(e => !hiddenIds.has(e.id)),
  }

  // ── Gallery view ──────────────────────────────────────────────────────────

  if (showGallery) {
    return (
      <div className="h-screen">
        <DesignGallery
          onOpen={handleOpenDesign}
          onNew={handleNewDesign}
          onClose={() => setShowGallery(false)}
        />
      </div>
    )
  }

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden">
      {/* Top Toolbar */}
      <DesignerToolbar
        onAddElement={addElement}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        canvasWidth={scene.width}
        canvasHeight={scene.height}
        onResizeCanvas={resizeCanvas}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
        onSave={handleSave}
        onExport={handleExport}
        onPushTo={() => setShowPushDialog(true)}
        onOpenGallery={() => setShowGallery(true)}
        saving={saving}
        sceneName={scene.name}
        onRenameSene={(name) => setScene(prev => ({ ...prev, name }))}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left — Layers Panel */}
        <div className="w-[200px] shrink-0 border-r border-zinc-800 overflow-hidden">
          <LayersPanel
            elements={scene.elements}
            selectedIds={selectedIds}
            onSelect={(id) => { setSelectedId(id); setSelectedIds(new Set([id])) }}
            onToggleVisibility={handleToggleVisibility}
            onToggleLock={handleToggleLock}
            onReorder={handleReorder}
            onRename={handleRename}
            hiddenIds={hiddenIds}
          />
        </div>

        {/* Center — Canvas */}
        <div className="flex-1 overflow-auto bg-zinc-950 relative" data-scene-canvas>
          <div className="flex items-center justify-center min-h-full p-8">
            <SceneCanvas
              scene={visibleScene}
              selectedId={selectedId}
              selectedIds={selectedIds}
              zoom={zoom}
              onSelect={(id: string | null) => { setSelectedId(id); setSelectedIds(new Set(id ? [id] : [])) }}
              onSelectMany={(ids: string[]) => { setSelectedIds(new Set(ids)); setSelectedId(ids.length > 0 ? ids[0] : null) }}
              onUpdateElement={handleCanvasUpdate}
              canvasRef={canvasRef}
            />
          </div>
        </div>

        {/* Right — Properties Panel */}
        <div className="w-[280px] shrink-0 border-l border-zinc-800 overflow-y-auto">
          {selectedElement ? (
            <DesignerPropertiesPanel
              element={selectedElement}
              onUpdate={(updates) => updateElement(selectedElement.id, updates)}
              onUpdateProps={(propUpdates) => {
                updateElement(selectedElement.id, {
                  props: { ...selectedElement.props, ...propUpdates },
                })
              }}
              onDelete={() => deleteElement(selectedElement.id)}
              onDuplicate={() => duplicateElement(selectedElement.id)}
            />
          ) : (
            <div className="p-4 text-center">
              <div className="text-zinc-600 text-sm mt-12">Select an element</div>
              <p className="text-zinc-700 text-[11px] mt-1">or add one from the toolbar</p>
              <div className="mt-8 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">Canvas</div>
                <label className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-zinc-500">Background</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={scene.background || '#09090b'}
                      onChange={e => setScene(prev => ({ ...prev, background: e.target.value }))}
                      className="w-6 h-6 rounded cursor-pointer bg-transparent border-none"
                    />
                    <input
                      type="text"
                      value={scene.background || '#09090b'}
                      onChange={e => setScene(prev => ({ ...prev, background: e.target.value }))}
                      className="w-[72px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-400 font-mono focus:border-violet-600 outline-none"
                    />
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Push Dialog */}
      {showPushDialog && (
        <PushToDialog
          scene={scene}
          onClose={() => setShowPushDialog(false)}
        />
      )}
    </div>
  )
}
