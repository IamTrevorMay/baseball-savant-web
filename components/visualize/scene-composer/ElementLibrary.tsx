'use client'

import { useState } from 'react'
import { ElementType, SceneElement, Scene, ELEMENT_CATALOG } from '@/lib/sceneTypes'
import { SCENE_TEMPLATES, TEXT_PRESETS, loadElementPresets, deleteElementPreset, instantiatePreset, type SceneTemplate, type SavedElementPreset } from '@/lib/sceneTemplates'

type Tab = 'elements' | 'templates' | 'presets'

interface Props {
  onAdd: (type: ElementType) => void
  onAddElement?: (el: SceneElement) => void
  onLoadScene?: (scene: Scene) => void
}

export default function ElementLibrary({ onAdd, onAddElement, onLoadScene }: Props) {
  const [tab, setTab] = useState<Tab>('elements')
  const [templateCategory, setTemplateCategory] = useState<string>('all')
  const [elementPresets, setElementPresets] = useState<SavedElementPreset[]>(() => loadElementPresets())

  function handleLoadTemplate(template: SceneTemplate) {
    if (!onLoadScene) return
    onLoadScene(template.build())
  }

  function handleAddPreset(preset: SavedElementPreset) {
    if (!onAddElement) return
    onAddElement(instantiatePreset(preset, 960, 540))
  }

  function handleDeletePreset(id: string) {
    deleteElementPreset(id)
    setElementPresets(loadElementPresets())
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-zinc-800 shrink-0">
        {(['elements', 'templates', 'presets'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-2 py-2 text-[10px] uppercase tracking-wider font-medium transition ${
              tab === t ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* ── Elements Tab ──────────────────────────────────────────────── */}
        {tab === 'elements' && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-3">Elements</div>
            <div className="space-y-1.5">
              {ELEMENT_CATALOG.map(item => (
                <button
                  key={item.type}
                  onClick={() => onAdd(item.type)}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-800 hover:border-cyan-600/40 hover:bg-zinc-800 transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded bg-zinc-700/60 text-zinc-400 flex items-center justify-center text-sm font-mono group-hover:bg-cyan-600/20 group-hover:text-cyan-400 transition">
                      {item.icon}
                    </span>
                    <div>
                      <div className="text-xs font-medium text-zinc-200 group-hover:text-white transition">{item.name}</div>
                      <div className="text-[10px] text-zinc-600">{item.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Text Presets */}
            <div className="mt-5 text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Text Presets</div>
            <div className="space-y-1">
              {TEXT_PRESETS.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => onAddElement?.(preset.build(960, 540))}
                  className="w-full text-left px-3 py-2 rounded-lg bg-zinc-800/30 border border-zinc-800/60 hover:border-emerald-600/40 hover:bg-zinc-800/60 transition group"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-zinc-700/40 text-zinc-500 flex items-center justify-center text-[9px] font-mono group-hover:text-emerald-400 transition">
                      {preset.icon}
                    </span>
                    <span className="text-[11px] text-zinc-300 group-hover:text-white transition">{preset.name}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Shortcuts */}
            <div className="mt-5 text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Shortcuts</div>
            <div className="space-y-1 text-[10px] text-zinc-600">
              <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">Del</kbd> Delete selected</div>
              <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{'\u2318'}D</kbd> Duplicate</div>
              <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{'\u2318'}Z</kbd> Undo</div>
              <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{'\u2318\u21e7'}Z</kbd> Redo</div>
              <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{'\u2190\u2191\u2192\u2193'}</kbd> Nudge 1px</div>
              <div><kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{'\u21e7'}+Arrow</kbd> Nudge 10px</div>
            </div>
          </>
        )}

        {/* ── Templates Tab ─────────────────────────────────────────────── */}
        {tab === 'templates' && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Scene Templates</div>
            <p className="text-[10px] text-zinc-600 mb-3">Click to load a prebuilt scene. Customize players and stats after loading.</p>

            {/* Category filter */}
            <div className="flex gap-1 mb-3 flex-wrap">
              {['all', 'pitcher', 'batter', 'comparison', 'social', 'overlay'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setTemplateCategory(cat)}
                  className={`px-2 py-1 rounded text-[10px] transition ${
                    templateCategory === cat
                      ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-600/40'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              {SCENE_TEMPLATES
                .filter(t => templateCategory === 'all' || t.category === templateCategory)
                .map(template => (
                <button
                  key={template.id}
                  onClick={() => handleLoadTemplate(template)}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-800 hover:border-emerald-600/40 hover:bg-zinc-800 transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded bg-zinc-700/60 text-zinc-400 flex items-center justify-center text-sm group-hover:bg-emerald-600/20 group-hover:text-emerald-400 transition">
                      {template.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-200 group-hover:text-white transition">{template.name}</div>
                      <div className="text-[10px] text-zinc-600 truncate">{template.description}</div>
                      <div className="text-[9px] text-zinc-700 mt-0.5">{template.width}{'\u00d7'}{template.height}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Presets Tab ───────────────────────────────────────────────── */}
        {tab === 'presets' && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Saved Element Presets</div>
            <p className="text-[10px] text-zinc-600 mb-3">
              Save any element as a preset from its properties panel, then reuse it here.
            </p>

            {elementPresets.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-zinc-700 text-2xl mb-2">{'\u2605'}</div>
                <p className="text-[11px] text-zinc-600">No saved presets yet</p>
                <p className="text-[10px] text-zinc-700 mt-1">Select an element and click &quot;Save as Preset&quot; in the properties panel</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {elementPresets.map(preset => (
                  <div key={preset.id} className="flex items-center gap-1">
                    <button
                      onClick={() => handleAddPreset(preset)}
                      className="flex-1 text-left px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-800 hover:border-cyan-600/40 hover:bg-zinc-800 transition"
                    >
                      <div className="text-[11px] text-zinc-200">{preset.name}</div>
                      <div className="text-[9px] text-zinc-600">{preset.element.type} | {preset.element.width}{'\u00d7'}{preset.element.height}</div>
                    </button>
                    <button
                      onClick={() => handleDeletePreset(preset.id)}
                      className="px-1.5 py-2 text-zinc-600 hover:text-red-400 transition text-[10px]"
                      title="Delete preset"
                    >
                      {'\u2715'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setElementPresets(loadElementPresets())}
              className="w-full mt-3 px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-500 hover:text-zinc-300 transition"
            >
              Refresh
            </button>
          </>
        )}
      </div>
    </div>
  )
}
