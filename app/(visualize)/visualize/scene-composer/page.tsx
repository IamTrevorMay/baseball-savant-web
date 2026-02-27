'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Scene, SceneElement, ElementType, DataBinding, Keyframe, EasingFunction, createElement, createDefaultScene, SCENE_PRESETS } from '@/lib/sceneTypes'
import { interpolateScene } from '@/lib/sceneInterpolation'
import SceneCanvas from '@/components/visualize/scene-composer/SceneCanvas'
import ElementLibrary from '@/components/visualize/scene-composer/ElementLibrary'
import PropertiesPanel from '@/components/visualize/scene-composer/PropertiesPanel'
import Timeline from '@/components/visualize/scene-composer/Timeline'
import SceneGallery from '@/components/visualize/scene-composer/SceneGallery'
import { exportScenePNG, exportSceneJSON, exportImageSequence, exportWebM } from '@/components/visualize/scene-composer/exportScene'

const STORAGE_KEY = 'triton-scene-composer'
const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1.0]

export default function SceneComposerPage() {
  const [scene, setScene] = useState<Scene>(createDefaultScene())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.5)
  const [loaded, setLoaded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [bindingLoading, setBindingLoading] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('unsaved')

  // Timeline state
  const [showTimeline, setShowTimeline] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentFrame, setCurrentFrame] = useState(0)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef(0)

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
    setSaveStatus('unsaved')
  }, [scene, loaded])

  // ── Playback loop ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!playing) return
    const fps = scene.fps || 30
    const totalFrames = fps * (scene.duration || 5)

    function tick(timestamp: number) {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const delta = timestamp - lastTimeRef.current
      if (delta >= 1000 / fps) {
        lastTimeRef.current = timestamp
        setCurrentFrame(prev => {
          const next = prev + 1
          return next > totalFrames ? 0 : next
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    lastTimeRef.current = 0
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing, scene.fps, scene.duration])

  // ── Element CRUD ─────────────────────────────────────────────────────────

  const selectedElement = scene.elements.find(e => e.id === selectedId) ?? null

  // Elements to render: apply interpolation when timeline is active
  const displayElements = showTimeline
    ? interpolateScene(scene.elements, currentFrame)
    : scene.elements
  const displayScene = { ...scene, elements: displayElements }

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
        keyframes: src.keyframes ? [...src.keyframes] : undefined,
      }
      setScene(prev => ({ ...prev, elements: [...prev.elements, dup] }))
      setSelectedId(dup.id)
    },
    [scene.elements]
  )

  // ── Data Binding ──────────────────────────────────────────────────────────

  const updateBinding = useCallback((id: string, binding: DataBinding | undefined) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, dataBinding: binding } : e)),
    }))
  }, [])

  const fetchBinding = useCallback(async (id: string) => {
    const el = scene.elements.find(e => e.id === id)
    if (!el?.dataBinding) return
    const b = el.dataBinding

    setBindingLoading(true)
    try {
      if (b.source === 'statcast') {
        const params = new URLSearchParams({
          playerId: String(b.playerId),
          metrics: b.metric,
          ...(b.gameYear && { gameYear: String(b.gameYear) }),
          ...(b.pitchType && { pitchType: b.pitchType }),
        })
        const res = await fetch(`/api/scene-stats?${params}`)
        const data = await res.json()
        const val = data.stats?.[b.metric]
        if (val !== null && val !== undefined) {
          if (el.type === 'stat-card') {
            updateElementProps(id, { value: String(val), label: b.metric.replace(/_/g, ' ').toUpperCase(), sublabel: `${b.playerName} ${b.gameYear || ''}`.trim() })
          } else if (el.type === 'comparison-bar') {
            updateElementProps(id, { value: Number(val), label: `${b.playerName} - ${b.metric.replace(/_/g, ' ')}` })
          }
        }
      } else if (b.source === 'lahman') {
        const res = await fetch(`/api/lahman/player?playerId=${b.playerId}`)
        const data = await res.json()
        const stat = b.lahmanStat || 'era'
        const row = data.pitching?.[0] || data.batting?.[0]
        if (row && row[stat] !== undefined) {
          if (el.type === 'stat-card') {
            updateElementProps(id, { value: String(row[stat]), label: stat.toUpperCase(), sublabel: b.playerName })
          } else if (el.type === 'comparison-bar') {
            updateElementProps(id, { value: Number(row[stat]), label: `${b.playerName} - ${stat}` })
          }
        }
      }
    } catch (err) {
      console.error('Fetch binding error:', err)
    } finally {
      setBindingLoading(false)
    }
  }, [scene.elements, updateElementProps])

  // ── Keyframe management ──────────────────────────────────────────────────

  const addKeyframe = useCallback((elementId: string, frame: number) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => {
        if (e.id !== elementId) return e
        const kf: Keyframe = {
          frame,
          props: { x: e.x, y: e.y, width: e.width, height: e.height, opacity: e.opacity, rotation: e.rotation },
          easing: 'ease-in-out',
        }
        const existing = e.keyframes || []
        // Replace if keyframe at same frame exists
        const filtered = existing.filter(k => k.frame !== frame)
        return { ...e, keyframes: [...filtered, kf].sort((a, b) => a.frame - b.frame) }
      }),
    }))
  }, [])

  const deleteKeyframe = useCallback((elementId: string, kfIndex: number) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => {
        if (e.id !== elementId || !e.keyframes) return e
        return { ...e, keyframes: e.keyframes.filter((_, i) => i !== kfIndex) }
      }),
    }))
  }, [])

  const updateKeyframeEasing = useCallback((elementId: string, kfIndex: number, easing: EasingFunction) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => {
        if (e.id !== elementId || !e.keyframes) return e
        return {
          ...e,
          keyframes: e.keyframes.map((kf, i) => i === kfIndex ? { ...kf, easing } : kf),
        }
      }),
    }))
  }, [])

  // ── Save / Load ──────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveStatus('saving')
    try {
      const config = { ...scene }
      if (scene.savedId) {
        await fetch(`/api/scenes/${scene.savedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config, name: scene.name, width: scene.width, height: scene.height }),
        })
      } else {
        const res = await fetch('/api/scenes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config, name: scene.name, width: scene.width, height: scene.height }),
        })
        const data = await res.json()
        if (data.id) setScene(prev => ({ ...prev, savedId: data.id }))
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('unsaved')
    }
  }

  async function handleSaveAs() {
    setSaveStatus('saving')
    try {
      const config = { ...scene, savedId: undefined }
      const res = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, name: scene.name + ' (copy)', width: scene.width, height: scene.height }),
      })
      const data = await res.json()
      if (data.id) setScene(prev => ({ ...prev, savedId: data.id, name: prev.name + ' (copy)' }))
      setSaveStatus('saved')
    } catch {
      setSaveStatus('unsaved')
    }
  }

  async function handleLoadScene(id: string) {
    try {
      const res = await fetch(`/api/scenes/${id}`)
      const data = await res.json()
      if (data.scene?.config) {
        const loaded = data.scene.config as Scene
        setScene({ ...loaded, savedId: id })
        setSelectedId(null)
        setCurrentFrame(0)
        setPlaying(false)
      }
    } catch (err) {
      console.error('Load error:', err)
    }
    setShowGallery(false)
  }

  function handleNewScene() {
    setScene(createDefaultScene())
    setSelectedId(null)
    setCurrentFrame(0)
    setPlaying(false)
    setShowGallery(false)
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // Timeline shortcuts
      if (e.key === ' ' && showTimeline) {
        e.preventDefault()
        setPlaying(p => !p)
        return
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        setShowTimeline(p => !p)
        return
      }
      if (e.key === 'k' || e.key === 'K') {
        if (selectedId && showTimeline) {
          e.preventDefault()
          addKeyframe(selectedId, currentFrame)
        }
        return
      }

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
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault()
          handleSave()
          return
        }

        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowLeft') { e.preventDefault(); updateElement(selectedId, { x: el.x - step }) }
        if (e.key === 'ArrowRight') { e.preventDefault(); updateElement(selectedId, { x: el.x + step }) }
        if (e.key === 'ArrowUp') { e.preventDefault(); updateElement(selectedId, { y: el.y - step }) }
        if (e.key === 'ArrowDown') { e.preventDefault(); updateElement(selectedId, { y: el.y + step }) }
      } else {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault()
          handleSave()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, scene.elements, deleteElement, duplicateElement, updateElement, showTimeline, currentFrame, addKeyframe])

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
    setShowExportMenu(false)
    try {
      // If timeline is active, export the current frame's interpolated scene
      const sceneToExport = showTimeline
        ? { ...scene, elements: interpolateScene(scene.elements, currentFrame) }
        : scene
      await exportScenePNG(sceneToExport, `${scene.name.replace(/\s+/g, '-').toLowerCase()}.png`)
    } catch (err) {
      console.error('Export error:', err)
    }
    setExporting(false)
  }

  async function handleExportSequence() {
    setExporting(true)
    setShowExportMenu(false)
    try {
      await exportImageSequence(scene, pct => setExportProgress(pct))
    } catch (err) {
      console.error('Export sequence error:', err)
    }
    setExporting(false)
    setExportProgress(0)
  }

  async function handleExportWebM() {
    setExporting(true)
    setShowExportMenu(false)
    try {
      await exportWebM(scene, pct => setExportProgress(pct))
    } catch (err) {
      console.error('Export WebM error:', err)
    }
    setExporting(false)
    setExportProgress(0)
  }

  function handleExportJSON() {
    setShowExportMenu(false)
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

        {/* Save status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          saveStatus === 'saved' ? 'bg-emerald-400' :
          saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' :
          'bg-zinc-600'
        }`} title={saveStatus} />

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

        <div className="w-px h-5 bg-zinc-800" />

        {/* Timeline toggle */}
        <button
          onClick={() => setShowTimeline(p => !p)}
          className={`px-2.5 py-1 rounded border text-[11px] transition ${
            showTimeline
              ? 'bg-cyan-600/20 border-cyan-600/50 text-cyan-300'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
          }`}
          title="Toggle Timeline (T)"
        >
          Timeline
        </button>

        <div className="w-px h-5 bg-zinc-800" />

        {/* Save */}
        <button
          onClick={handleSave}
          className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-600 transition"
        >
          Save
        </button>
        <button
          onClick={handleSaveAs}
          className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-400 hover:text-white transition"
        >
          Save As
        </button>
        <button
          onClick={() => setShowGallery(true)}
          className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-600 transition"
        >
          Load
        </button>

        <div className="w-px h-5 bg-zinc-800" />

        {/* Clear */}
        <button
          onClick={handleClear}
          className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-400 hover:text-red-400 hover:border-red-600/40 transition"
        >
          Clear
        </button>

        {/* Export dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(p => !p)}
            disabled={exporting}
            className="px-3 py-1 rounded bg-cyan-600/20 border border-cyan-600/50 text-[11px] font-medium text-cyan-300 hover:bg-cyan-600/30 transition disabled:opacity-50"
          >
            {exporting
              ? exportProgress > 0 ? `${Math.round(exportProgress)}%` : 'Exporting...'
              : 'Export \u25BE'}
          </button>
          {showExportMenu && !exporting && (
            <div className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 py-1 w-44">
              <button onClick={handleExportPNG} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700 transition">
                PNG (Current Frame)
              </button>
              <button onClick={handleExportSequence} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700 transition">
                Image Sequence (ZIP)
              </button>
              <button onClick={handleExportWebM} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700 transition">
                WebM Video
              </button>
              <div className="border-t border-zinc-700 my-1" />
              <button onClick={handleExportJSON} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-400 hover:bg-zinc-700 transition">
                JSON Config
              </button>
            </div>
          )}
        </div>
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
            scene={displayScene}
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
              onUpdateBinding={binding => updateBinding(selectedElement.id, binding)}
              onFetchBinding={() => fetchBinding(selectedElement.id)}
              onDelete={() => deleteElement(selectedElement.id)}
              onDuplicate={() => duplicateElement(selectedElement.id)}
              bindingLoading={bindingLoading}
            />
          </div>
        )}
      </div>

      {/* Timeline */}
      {showTimeline && (
        <Timeline
          scene={scene}
          currentFrame={currentFrame}
          playing={playing}
          onSetFrame={setCurrentFrame}
          onTogglePlay={() => setPlaying(p => !p)}
          onAddKeyframe={addKeyframe}
          onDeleteKeyframe={deleteKeyframe}
          onUpdateKeyframeEasing={updateKeyframeEasing}
          onUpdateElement={updateElement}
          onUpdateScene={updates => setScene(prev => ({ ...prev, ...updates }))}
          selectedId={selectedId}
        />
      )}

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
        {showTimeline && (
          <span className="text-[10px] text-zinc-500 ml-auto font-mono">
            F{currentFrame} | {scene.fps || 30}fps | {scene.duration || 5}s
          </span>
        )}
        {scene.savedId && (
          <span className="text-[10px] text-zinc-600">Cloud saved</span>
        )}
      </div>

      {/* Gallery modal */}
      <SceneGallery
        open={showGallery}
        onClose={() => setShowGallery(false)}
        onLoad={handleLoadScene}
        onNew={handleNewScene}
      />

      {/* Click-away for export menu */}
      {showExportMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
      )}
    </div>
  )
}
