'use client'

import { useState, useRef } from 'react'
import { ElementType, SCENE_PRESETS } from '@/lib/sceneTypes'

interface Props {
  onAddElement: (type: ElementType) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  canvasWidth: number
  canvasHeight: number
  onResizeCanvas: (w: number, h: number) => void
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomFit: () => void
  onSave: () => void
  onExport: () => void
  onPushTo: () => void
  onOpenGallery: () => void
  saving: boolean
  sceneName: string
  onRenameSene: (name: string) => void
}

const DESIGNER_ELEMENTS: { type: ElementType; icon: string; label: string }[] = [
  { type: 'text', icon: 'T', label: 'Text' },
  { type: 'shape', icon: '\u25a1', label: 'Shape' },
  { type: 'image', icon: '\u25a3', label: 'Image' },
  { type: 'player-image', icon: '\u25c9', label: 'Player' },
  { type: 'stat-card', icon: '#', label: 'Stat Card' },
  { type: 'comparison-bar', icon: '\u25ac', label: 'Bar' },
]

export default function DesignerToolbar({
  onAddElement, onUndo, onRedo, canUndo, canRedo,
  canvasWidth, canvasHeight, onResizeCanvas,
  zoom, onZoomIn, onZoomOut, onZoomFit,
  onSave, onExport, onPushTo, onOpenGallery,
  saving, sceneName, onRenameSene,
}: Props) {
  const [showPresets, setShowPresets] = useState(false)
  const [customW, setCustomW] = useState(canvasWidth)
  const [customH, setCustomH] = useState(canvasHeight)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(sceneName)

  return (
    <div className="h-11 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 gap-1 shrink-0">
      {/* Gallery / Back */}
      <button
        onClick={onOpenGallery}
        className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-violet-400 hover:bg-zinc-800 transition"
        title="Designs Gallery"
      >
        {'\u2630'}
      </button>

      {/* Scene Name */}
      <div className="border-l border-zinc-800 pl-2 ml-1">
        {editingName ? (
          <input
            autoFocus
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={() => { onRenameSene(nameVal); setEditingName(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { onRenameSene(nameVal); setEditingName(false) } }}
            className="bg-zinc-800 border border-violet-600 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none w-32"
          />
        ) : (
          <button
            onClick={() => { setNameVal(sceneName); setEditingName(true) }}
            className="text-[11px] text-zinc-300 hover:text-violet-300 transition truncate max-w-[120px]"
          >
            {sceneName}
          </button>
        )}
      </div>

      {/* Separator */}
      <div className="border-l border-zinc-800 h-6 mx-1" />

      {/* Insert Elements */}
      {DESIGNER_ELEMENTS.map(({ type, icon, label }) => (
        <button
          key={type}
          onClick={() => onAddElement(type)}
          className="px-1.5 py-1 rounded text-[12px] text-zinc-400 hover:text-violet-400 hover:bg-zinc-800 transition"
          title={`Add ${label}`}
        >
          {icon}
        </button>
      ))}

      {/* Separator */}
      <div className="border-l border-zinc-800 h-6 mx-1" />

      {/* Undo/Redo */}
      <button onClick={onUndo} disabled={!canUndo} className="px-1.5 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-30" title="Undo (Cmd+Z)">
        {'\u21B6'}
      </button>
      <button onClick={onRedo} disabled={!canRedo} className="px-1.5 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-30" title="Redo (Cmd+Shift+Z)">
        {'\u21B7'}
      </button>

      {/* Separator */}
      <div className="border-l border-zinc-800 h-6 mx-1" />

      {/* Canvas Size */}
      <div className="relative">
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="px-2 py-1 rounded text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition font-mono"
        >
          {canvasWidth}&times;{canvasHeight}
        </button>
        {showPresets && (
          <div className="absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 w-56 py-1">
            {SCENE_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => { onResizeCanvas(p.w, p.h); setCustomW(p.w); setCustomH(p.h); setShowPresets(false) }}
                className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-800 transition ${
                  canvasWidth === p.w && canvasHeight === p.h ? 'text-violet-400' : 'text-zinc-300'
                }`}
              >
                {p.label}
              </button>
            ))}
            <div className="border-t border-zinc-800 mt-1 pt-1 px-3 pb-2">
              <div className="text-[10px] text-zinc-500 mb-1">Custom</div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={customW}
                  onChange={e => setCustomW(Number(e.target.value))}
                  className="w-16 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-200 focus:border-violet-600 outline-none"
                />
                <span className="text-zinc-600 text-[10px]">&times;</span>
                <input
                  type="number"
                  value={customH}
                  onChange={e => setCustomH(Number(e.target.value))}
                  className="w-16 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-200 focus:border-violet-600 outline-none"
                />
                <button
                  onClick={() => { onResizeCanvas(customW, customH); setShowPresets(false) }}
                  className="px-2 py-1 rounded bg-violet-600/20 border border-violet-600/40 text-[10px] text-violet-300 hover:bg-violet-600/30 transition"
                >
                  Set
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Zoom */}
      <button onClick={onZoomOut} className="px-1.5 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition" title="Zoom Out">
        {'\u2212'}
      </button>
      <span className="text-[10px] text-zinc-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
      <button onClick={onZoomIn} className="px-1.5 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition" title="Zoom In">
        +
      </button>
      <button onClick={onZoomFit} className="px-1.5 py-1 rounded text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition" title="Zoom to Fit">
        Fit
      </button>

      {/* Separator */}
      <div className="border-l border-zinc-800 h-6 mx-1" />

      {/* Actions */}
      <button
        onClick={onSave}
        disabled={saving}
        className="px-2.5 py-1 rounded bg-violet-600/20 border border-violet-600/40 text-[11px] font-medium text-violet-300 hover:bg-violet-600/30 transition disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button
        onClick={onExport}
        className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-600 transition"
      >
        Export PNG
      </button>
      <button
        onClick={onPushTo}
        className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 hover:text-emerald-400 hover:border-emerald-600/40 transition"
        title="Push to Scene Composer or Template Builder"
      >
        Push&hellip;
      </button>
    </div>
  )
}
