'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Scene, createDefaultScene } from '@/lib/sceneTypes'
import { useSceneHistory } from '@/lib/useSceneHistory'
import { exportScenePNG } from '@/components/visualize/scene-composer/exportScene'
import ReportCardBuilder from '@/components/report-cards/ReportCardBuilder'
import ReportCardGenerator from '@/components/report-cards/ReportCardGenerator'

const STORAGE_KEY = 'triton-report-card-draft'

type Mode = 'builder' | 'generator'

export default function ReportCardsPage() {
  const [mode, setMode] = useState<Mode>('builder')
  const [scene, setScene, { undo, redo, canUndo, canRedo }] = useSceneHistory<Scene>(createDefaultScene())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(0.5)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('Untitled Report Card')

  // Load draft from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.scene) setScene(parsed.scene)
        if (parsed.savedId) setSavedId(parsed.savedId)
        if (parsed.templateName) setTemplateName(parsed.templateName)
      }
    } catch {}
    setLoaded(true)
  }, [])

  // Auto-save draft
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ scene, savedId, templateName }))
    } catch {}
  }, [scene, loaded, savedId, templateName])

  // Save template to Supabase
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const payload = {
        name: templateName,
        width: scene.width,
        height: scene.height,
        background: scene.background,
        elements: scene.elements,
      }

      if (savedId) {
        await fetch(`/api/report-card-templates/${savedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        const res = await fetch('/api/report-card-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (data.id) setSavedId(data.id)
      }
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [scene, savedId, templateName])

  // New template
  const handleNew = useCallback(() => {
    setScene(createDefaultScene())
    setSavedId(null)
    setTemplateName('Untitled Report Card')
    setSelectedId(null)
    setSelectedIds(new Set())
  }, [setScene])

  // Export PNG
  const handleExportPNG = useCallback(async () => {
    await exportScenePNG(scene, `${templateName.replace(/\s+/g, '-').toLowerCase()}.png`)
  }, [scene, templateName])

  // Load a saved template into the builder
  const handleLoadTemplate = useCallback((t: { id: string; name: string; width: number; height: number; background: string; elements: any[] }) => {
    setScene({ id: t.id, name: t.name, width: t.width, height: t.height, background: t.background, elements: t.elements || [] })
    setSavedId(t.id)
    setTemplateName(t.name)
    setSelectedId(null)
    setSelectedIds(new Set())
  }, [setScene])

  // Canvas size
  const handleResize = useCallback((w: number, h: number) => {
    setScene(prev => ({ ...prev, width: w, height: h }))
  }, [setScene])

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      {/* Top Toolbar */}
      <div className="h-12 shrink-0 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4">
        {/* Left: Mode tabs */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="text-zinc-500 hover:text-white text-xs transition mr-2"
          >
            &larr; Back
          </button>
          <div className="flex bg-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setMode('builder')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                mode === 'builder' ? 'bg-cyan-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Builder
            </button>
            <button
              onClick={() => setMode('generator')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                mode === 'generator' ? 'bg-cyan-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Generator
            </button>
          </div>
        </div>

        {/* Center: Template name (builder only) */}
        {mode === 'builder' && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              className="bg-transparent text-sm text-zinc-200 font-medium text-center border-b border-transparent hover:border-zinc-700 focus:border-cyan-500/50 focus:outline-none transition w-56"
            />
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {mode === 'builder' && (
            <>
              {/* Canvas size selector */}
              <select
                value={`${scene.width}x${scene.height}`}
                onChange={e => {
                  const [w, h] = e.target.value.split('x').map(Number)
                  handleResize(w, h)
                }}
                className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 focus:outline-none"
              >
                <option value="1920x1080">1920x1080</option>
                <option value="1080x1350">1080x1350</option>
                <option value="1080x1920">1080x1920</option>
                <option value="1080x1080">1080x1080</option>
                <option value="1200x628">1200x628</option>
                <option value="1280x720">1280x720</option>
              </select>

              {/* Background color */}
              <input
                type="color"
                value={scene.background || '#09090b'}
                onChange={e => setScene(prev => ({ ...prev, background: e.target.value }))}
                className="w-6 h-6 cursor-pointer bg-transparent border border-zinc-700 rounded"
                title="Background color"
              />

              <button
                onClick={handleNew}
                className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 hover:text-white transition"
              >
                New
              </button>
              <button
                onClick={handleExportPNG}
                className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 hover:text-white transition"
              >
                Export PNG
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 rounded text-[10px] text-white font-medium transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : savedId ? 'Update' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {mode === 'builder' ? (
        <ReportCardBuilder
          scene={scene}
          setScene={setScene}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          zoom={zoom}
          setZoom={setZoom}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onLoadTemplate={handleLoadTemplate}
          activeTemplateId={savedId}
        />
      ) : (
        <ReportCardGenerator />
      )}
    </div>
  )
}
