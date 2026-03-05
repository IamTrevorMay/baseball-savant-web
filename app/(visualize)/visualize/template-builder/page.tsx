'use client'

import { useState, useRef, useCallback } from 'react'
import { Scene, SceneElement, ElementType, TemplateInputField, DataQueryConfig, createElement, createDefaultScene, SCENE_PRESETS } from '@/lib/sceneTypes'
import { useSceneHistory } from '@/lib/useSceneHistory'
import SceneCanvas from '@/components/visualize/scene-composer/SceneCanvas'
import ElementLibrary from '@/components/visualize/scene-composer/ElementLibrary'
import PropertiesPanel from '@/components/visualize/scene-composer/PropertiesPanel'
import TemplateBuilderSetup from '@/components/visualize/template-builder/TemplateBuilderSetup'
import InputFieldEditor from '@/components/visualize/template-builder/InputFieldEditor'
import DataQueryPanel from '@/components/visualize/template-builder/DataQueryPanel'
import { Keyframe, EasingFunction, DataBinding } from '@/lib/sceneTypes'

type Step = 'setup' | 'inputs' | 'data' | 'canvas' | 'save'

const STEPS: { key: Step; label: string; num: number }[] = [
  { key: 'setup', label: 'Setup', num: 1 },
  { key: 'inputs', label: 'Input Fields', num: 2 },
  { key: 'data', label: 'Data Source', num: 3 },
  { key: 'canvas', label: 'Canvas Editor', num: 4 },
  { key: 'save', label: 'Save', num: 5 },
]

export default function TemplateBuilderPage() {
  const [step, setStep] = useState<Step>('setup')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // Setup
  const [setupData, setSetupData] = useState({
    name: '',
    description: '',
    icon: '\u26a1',
    width: 1920,
    height: 1080,
    background: '#09090b',
  })

  // Input fields
  const [inputFields, setInputFields] = useState<TemplateInputField[]>([])

  // Data query
  const [dataQuery, setDataQuery] = useState<DataQueryConfig | null>(null)

  // Canvas
  const [scene, setScene, { undo, redo, canUndo, canRedo }] = useSceneHistory<Scene>({
    ...createDefaultScene(),
    width: 1920,
    height: 1080,
    background: '#09090b',
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(0.5)
  const [bindingLoading, setBindingLoading] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  const selectedElement = scene.elements.find(e => e.id === selectedId) ?? null

  // Sync canvas dimensions with setup
  function goToStep(s: Step) {
    if (s === 'canvas') {
      setScene(prev => ({
        ...prev,
        width: setupData.width,
        height: setupData.height,
        background: setupData.background,
        name: setupData.name || 'Untitled Template',
      }))
    }
    setStep(s)
  }

  // Element CRUD
  const addElement = useCallback(
    (type: ElementType) => {
      const el = createElement(type, scene.width / 2, scene.height / 2)
      setScene(prev => ({ ...prev, elements: [...prev.elements, el] }))
      setSelectedId(el.id)
      setSelectedIds(new Set([el.id]))
    },
    [scene.width, scene.height]
  )

  const addDirectElement = useCallback((el: SceneElement) => {
    setScene(prev => ({ ...prev, elements: [...prev.elements, el] }))
    setSelectedId(el.id)
    setSelectedIds(new Set([el.id]))
  }, [])

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

  const handleSelect = useCallback((id: string | null, additive?: boolean) => {
    if (!id) {
      setSelectedId(null)
      setSelectedIds(new Set())
      return
    }
    if (additive) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else {
      setSelectedIds(new Set([id]))
    }
    setSelectedId(id)
  }, [])

  const handleSelectMany = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setSelectedIds(new Set(ids))
    setSelectedId(ids[0])
  }, [])

  const updateElementKeyframes = useCallback((id: string, keyframes: Keyframe[]) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, keyframes } : e)),
    }))
  }, [])

  const updateBinding = useCallback((id: string, binding: DataBinding | undefined) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, dataBinding: binding } : e)),
    }))
  }, [])

  const loadTemplateScene = useCallback((templateScene: Scene) => {
    setScene({ ...templateScene, templateConfig: undefined, templateData: undefined })
    setSelectedId(null)
    setSelectedIds(new Set())
  }, [])

  // Save
  async function handleSaveTemplate() {
    setSaving(true)
    try {
      const body = {
        name: setupData.name || 'Untitled Template',
        description: setupData.description,
        icon: setupData.icon,
        width: setupData.width,
        height: setupData.height,
        background: setupData.background,
        elements: scene.elements,
        input_fields: inputFields,
        data_query: dataQuery,
      }

      if (savedId) {
        await fetch(`/api/custom-templates/${savedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        const res = await fetch('/api/custom-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.id) setSavedId(data.id)
      }
    } catch (err) {
      console.error('Save template error:', err)
    } finally {
      setSaving(false)
    }
  }

  const currentStepIdx = STEPS.findIndex(s => s.key === step)

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Top bar */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex items-center gap-4 shrink-0">
        <a href="/visualize" className="text-zinc-500 hover:text-zinc-300 transition text-sm">
          {'\u2190'} Visualize
        </a>
        <span className="text-zinc-700">/</span>
        <span className="text-sm font-semibold text-white">Template Builder</span>
        <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
          Builder
        </span>

        <div className="flex-1" />

        {/* Step nav */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => goToStep(s.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition ${
                step === s.key
                  ? 'bg-cyan-600/20 border border-cyan-600/50 text-cyan-300 font-medium'
                  : i <= currentStepIdx
                    ? 'text-zinc-300 hover:text-white'
                    : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center ${
                step === s.key ? 'bg-cyan-500 text-white' :
                i < currentStepIdx ? 'bg-emerald-500 text-white' :
                'bg-zinc-700 text-zinc-400'
              }`}>{i < currentStepIdx && step !== s.key ? '\u2713' : s.num}</span>
              <span className="hidden lg:inline">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {step === 'canvas' ? (
        // Full canvas editor
        <div className="flex-1 flex min-h-0">
          <div className="w-52 border-r border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0">
            <ElementLibrary onAdd={addElement} onAddElement={addDirectElement} onLoadScene={loadTemplateScene} />
          </div>

          <div className="flex-1 min-w-0 overflow-hidden">
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

          {selectedElement ? (
            <div className="w-64 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0">
              <PropertiesPanel
                element={selectedElement}
                onUpdate={updates => updateElement(selectedElement.id, updates)}
                onUpdateProps={propUpdates => updateElementProps(selectedElement.id, propUpdates)}
                onUpdateBinding={binding => updateBinding(selectedElement.id, binding)}
                onFetchBinding={() => {}}
                onDelete={() => deleteElement(selectedElement.id)}
                onDuplicate={() => duplicateElement(selectedElement.id)}
                onUpdateKeyframes={kfs => updateElementKeyframes(selectedElement.id, kfs)}
                bindingLoading={bindingLoading}
                fps={30}
              />
            </div>
          ) : (
            <div className="w-64 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0 p-3">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Token Guide</h3>
              <p className="text-[10px] text-zinc-600 mb-3 leading-relaxed">
                Use token syntax in text elements to create dynamic placeholders. Tokens get replaced with real data when the template is loaded.
              </p>
              {inputFields.length > 0 ? (
                <div className="space-y-1">
                  {inputFields.map(f => (
                    <div key={f.id} className="flex items-center gap-2">
                      <code className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-cyan-400 border border-zinc-700/50">{`{${f.id}}`}</code>
                      <span className="text-[10px] text-zinc-500">{f.label}</span>
                    </div>
                  ))}
                  {inputFields.some(f => f.type === 'player') && (
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-zinc-700/50">{'{player_name}'}</code>
                      <span className="text-[10px] text-zinc-500">Auto</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-zinc-700 italic">No input fields defined yet. Go to Step 2 to add some.</p>
              )}

              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => { const idx = ZOOM_STEPS.findIndex(z => z >= zoom); if (idx > 0) setZoom(ZOOM_STEPS[idx - 1]) }} className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400 hover:text-white transition">{'\u2212'}</button>
                  <span className="text-[10px] text-zinc-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => { const idx = ZOOM_STEPS.findIndex(z => z >= zoom); if (idx < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[idx + 1]) }} className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400 hover:text-white transition">+</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Form steps
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            {step === 'setup' && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Template Setup</h2>
                <p className="text-sm text-zinc-500 mb-6">Define the basic properties of your template.</p>
                <TemplateBuilderSetup
                  data={setupData}
                  onChange={updates => setSetupData(prev => ({ ...prev, ...updates }))}
                />
              </div>
            )}

            {step === 'inputs' && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Input Fields</h2>
                <p className="text-sm text-zinc-500 mb-6">Define what inputs users will see when loading this template.</p>
                <InputFieldEditor
                  fields={inputFields}
                  onChange={setInputFields}
                />
              </div>
            )}

            {step === 'data' && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Data Source</h2>
                <p className="text-sm text-zinc-500 mb-6">Optionally connect a data source to auto-populate template values.</p>
                <DataQueryPanel
                  config={dataQuery}
                  inputFields={inputFields}
                  onChange={setDataQuery}
                />
              </div>
            )}

            {step === 'save' && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Save Template</h2>
                <p className="text-sm text-zinc-500 mb-6">Review and save your template.</p>

                <div className="space-y-4">
                  {/* Summary */}
                  <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{setupData.icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-white">{setupData.name || 'Untitled Template'}</div>
                        {setupData.description && <div className="text-[11px] text-zinc-500">{setupData.description}</div>}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-[11px]">
                      <div>
                        <div className="text-zinc-600 uppercase tracking-wider text-[9px] mb-0.5">Size</div>
                        <div className="text-zinc-300">{setupData.width} {'\u00d7'} {setupData.height}</div>
                      </div>
                      <div>
                        <div className="text-zinc-600 uppercase tracking-wider text-[9px] mb-0.5">Elements</div>
                        <div className="text-zinc-300">{scene.elements.length}</div>
                      </div>
                      <div>
                        <div className="text-zinc-600 uppercase tracking-wider text-[9px] mb-0.5">Input Fields</div>
                        <div className="text-zinc-300">{inputFields.length}</div>
                      </div>
                    </div>

                    {inputFields.length > 0 && (
                      <div>
                        <div className="text-[10px] text-zinc-600 mb-1">Inputs:</div>
                        <div className="flex flex-wrap gap-1">
                          {inputFields.map(f => (
                            <span key={f.id} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300 border border-zinc-600/40">
                              {f.label} ({f.type})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {dataQuery && (
                      <div className="text-[10px] text-zinc-500">
                        Data source: <span className="text-cyan-400">{dataQuery.type}</span> via <code className="text-zinc-400">{dataQuery.endpoint}</code>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleSaveTemplate}
                    disabled={saving || !setupData.name.trim()}
                    className="w-full py-3 rounded-xl bg-cyan-600/20 border border-cyan-600/50 text-sm font-semibold text-cyan-300 hover:bg-cyan-600/30 disabled:opacity-40 transition"
                  >
                    {saving ? 'Saving...' : savedId ? 'Update Template' : 'Save Template'}
                  </button>

                  {savedId && (
                    <div className="text-center">
                      <span className="text-[11px] text-emerald-400">Template saved successfully!</span>
                      <a
                        href="/visualize/scene-composer"
                        className="block mt-2 text-[11px] text-cyan-400 hover:text-cyan-300 transition"
                      >
                        Open in Scene Composer {'\u2192'}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
              {currentStepIdx > 0 ? (
                <button
                  onClick={() => goToStep(STEPS[currentStepIdx - 1].key)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:text-white transition"
                >
                  {'\u2190'} {STEPS[currentStepIdx - 1].label}
                </button>
              ) : <div />}

              {currentStepIdx < STEPS.length - 1 && (
                <button
                  onClick={() => goToStep(STEPS[currentStepIdx + 1].key)}
                  className="px-4 py-2 rounded-lg bg-cyan-600/20 border border-cyan-600/50 text-sm font-medium text-cyan-300 hover:bg-cyan-600/30 transition"
                >
                  {STEPS[currentStepIdx + 1].label} {'\u2192'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1.0]
