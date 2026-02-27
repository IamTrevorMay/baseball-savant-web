'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Scene, SceneElement, ElementType, createElement, createDefaultScene, SCENE_PRESETS } from '@/lib/sceneTypes'
import SceneCanvas from '@/components/visualize/scene-composer/SceneCanvas'
import ElementLibrary from '@/components/visualize/scene-composer/ElementLibrary'
import PropertiesPanel from '@/components/visualize/scene-composer/PropertiesPanel'
import { exportScenePNG, exportSceneJSON } from '@/components/visualize/scene-composer/exportScene'

const STORAGE_KEY = 'triton-scene-composer'
const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1.0]

export default function SceneComposerPage() {
  const [scene, setScene] = useState<Scene>(createDefaultScene())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.5)
  const [loaded, setLoaded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // ── Persistence ──────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setScene(JSON.parse(saved))
    } catch {}
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scene)) } catch {}
  }, [scene, loaded])

  // ── Element CRUD ─────────────────────────────────────────────────────────

  const selectedElement = scene.elements.find(e => e.id === selectedId) ?? null

  const updateElement = useCallback((id: string, updates: Partial<SceneElement>) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, ...updates } : e)),
    }))
  }, [])

  const updateElementProps = useCallback((id: string, propUpdates: Record<string, any>) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, props: { ...e.props, ...propUpdates } } : e)),
    }))
  }, [])

  const addElement = useCallback(
    (type: ElementType) => {
      const el = createElement(type, scene.width / 2, scene.height / 2)
      setScene(prev => ({ ...prev, elements: [...prev.elements, el] }))
      setSelectedId(el.id)
    },
    [scene.width, scene.height]
  )

  const deleteElement = useCallback(
    (id: string) => {
      setScene(prev => ({ ...prev, elements: prev.elements.filter(e => e.id !== id) }))
      if (selectedId === id) setSelectedId(null)
    },
    [selectedId]
  )

  const duplicateElement = useCallback(
    (id: string) => {
      const src = scene.elements.find(e => e.id === id)
      if (!src) return
      const dup: SceneElement = {
        ...src,
        id: Math.random().toString(36).slice(2, 10),
        x: src.x + 30,
        y: src.y + 30,
        zIndex: Math.max(...scene.elements.map(e => e.zIndex), 0) + 1,
        props: { ...src.props },
      }
      setScene(prev => ({ ...prev, elements: [...prev.elements, dup] }))
      setSelectedId(dup.id)
    },
    [scene.elements]
  )

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (selectedId) {
        const el = scene.elements.find(e => e.id === selectedId)
        if (!el) return

        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          deleteElement(selectedId)
          return
        }
        if (e.key === 'Escape') {
          setSelectedId(null)
          return
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
          e.preventDefault()
          duplicateElement(selectedId)
          return
        }

        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowLeft') { e.preventDefault(); updateElement(selectedId, { x: el.x - step }) }
        if (e.key === 'ArrowRight') { e.preventDefault(); updateElement(selectedId, { x: el.x + step }) }
        if (e.key === 'ArrowUp') { e.preventDefault(); updateElement(selectedId, { y: el.y - step }) }
        if (e.key === 'ArrowDown') { e.preventDefault(); updateElement(selectedId, { y: el.y + step }) }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, scene.elements, deleteElement, duplicateElement, updateElement])

  // ── Zoom ─────────────────────────────────────────────────────────────────

  function zoomIn() {
    const i = ZOOM_STEPS.findIndex(z => z >= zoom)
    if (i < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[i + 1])
  }
  function zoomOut() {
    const i = ZOOM_STEPS.findIndex(z => z >= zoom)
    if (i > 0) setZoom(ZOOM_STEPS[i - 1])
  }

  // ── Export ───────────────────────────────────────────────────────────────

  async function handleExportPNG() {
    setExporting(true)
    try {
      await exportScenePNG(scene, `${scene.name.replace(/\s+/g, '-').toLowerCase()}.png`)
    } catch (err) {
      console.error('Export error:', err)
    }
    setExporting(false)
  }

  function handleExportJSON() {
    const json = exportSceneJSON(scene)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${scene.name.replace(/\s+/g, '-').toLowerCase()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Scene settings ───────────────────────────────────────────────────────

  function handleDimensionChange(w: number, h: number) {
    setScene(prev => ({ ...prev, width: w, height: h }))
  }

  function handleClear() {
    if (!scene.elements.length) return
    setScene(prev => ({ ...prev, elements: [] }))
    setSelectedId(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Top bar */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-2 flex items-center gap-3 shrink-0">
        {/* Back */}
        <a href="/visualize" className="text-zinc-500 hover:text-zinc-300 transition shrink-0" title="Back to Visualize">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </a>

        {/* Scene name */}
        <input
          type="text"
          value={scene.name}
          onChange={e => setScene(prev => ({ ...prev, name: e.target.value }))}
          className="bg-transparent text-sm font-semibold text-white border-none outline-none min-w-0 max-w-[200px] hover:bg-zinc-800 focus:bg-zinc-800 px-2 py-1 rounded transition"
        />

        {/* Badge */}
        <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
          Composer
        </span>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-800" />

        {/* Dimensions */}
        <select
          value={`${scene.width}x${scene.height}`}
          onChange={e => {
            const [w, h] = e.target.value.split('x').map(Number)
            handleDimensionChange(w, h)
          }}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-300 outline-none"
        >
          {SCENE_PRESETS.map(p => (
            <option key={`${p.w}x${p.h}`} value={`${p.w}x${p.h}`}>
              {p.label}
            </option>
          ))}
        </select>

        {/* Background */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500">BG</span>
          <input
            type="color"
            value={scene.background}
            onChange={e => setScene(prev => ({ ...prev, background: e.target.value }))}
            className="w-6 h-6 rounded cursor-pointer bg-transparent border border-zinc-700"
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} className="px-1.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-xs transition">
            {'\u2212'}
          </button>
          <span className="text-[11px] text-zinc-400 w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="px-1.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-xs transition">
            +
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-800" />

        {/* Clear */}
        <button
          onClick={handleClear}
          className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-400 hover:text-red-400 hover:border-red-600/40 transition"
        >
          Clear
        </button>

        {/* Export */}
        <button
          onClick={handleExportPNG}
          disabled={exporting}
          className="px-3 py-1 rounded bg-cyan-600/20 border border-cyan-600/50 text-[11px] font-medium text-cyan-300 hover:bg-cyan-600/30 transition disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export PNG'}
        </button>
        <button
          onClick={handleExportJSON}
          className="px-3 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-600 transition"
        >
          JSON
        </button>
      </div>

      {/* Main workspace */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Element Library */}
        <div className="w-52 border-r border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0">
          <ElementLibrary onAdd={addElement} />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <SceneCanvas
            scene={scene}
            selectedId={selectedId}
            zoom={zoom}
            onSelect={setSelectedId}
            onUpdateElement={updateElement}
            canvasRef={canvasRef}
          />
        </div>

        {/* Right: Properties */}
        {selectedElement && (
          <div className="w-64 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0">
            <PropertiesPanel
              element={selectedElement}
              onUpdate={updates => updateElement(selectedElement.id, updates)}
              onUpdateProps={propUpdates => updateElementProps(selectedElement.id, propUpdates)}
              onDelete={() => deleteElement(selectedElement.id)}
              onDuplicate={() => duplicateElement(selectedElement.id)}
            />
          </div>
        )}
      </div>

      {/* Bottom status */}
      <div className="shrink-0 bg-zinc-900 border-t border-zinc-800 px-4 py-1.5 flex items-center gap-4">
        <span className="text-[10px] text-zinc-500">
          {scene.elements.length} element{scene.elements.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] text-zinc-600">
          {scene.width} {'\u00d7'} {scene.height}
        </span>
        {selectedElement && (
          <span className="text-[10px] text-cyan-500/60">
            {selectedElement.type} at ({selectedElement.x}, {selectedElement.y})
          </span>
        )}
      </div>
    </div>
  )
}
