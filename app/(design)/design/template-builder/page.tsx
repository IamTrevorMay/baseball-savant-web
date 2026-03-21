'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Scene, SceneElement, ElementType, DataSchemaType, DataBinding, DynamicSlot,
  RepeaterConfig, TemplateBinding, CustomTemplateRecord, InputSection, SectionBinding,
  GlobalFilter, GlobalFilterType, ElementBinding,
  createElement, SCENE_PRESETS,
} from '@/lib/sceneTypes'
import { SCENE_METRICS, MLB_TEAM_COLORS } from '@/lib/reportMetrics'
import { useSceneHistory } from '@/lib/useSceneHistory'
import { getSampleData } from '@/lib/templateBindingSchemas'
import { createCustomRebuild, migrateTemplate } from '@/lib/customTemplateRebuild'
import { DATA_DRIVEN_TEMPLATES, type DataDrivenTemplate } from '@/lib/sceneTemplates'
import { getSampleDataForFilter, fieldType as getFieldType } from '@/lib/filterFieldSchemas'
import { STARTER_TEMPLATES, type StarterTemplate, type StarterElementDef } from '@/lib/starterTemplates'
import SceneCanvas from '@/components/visualize/scene-composer/SceneCanvas'
import ElementLibrary from '@/components/visualize/scene-composer/ElementLibrary'
import PropertiesPanel from '@/components/visualize/scene-composer/PropertiesPanel'
import DynamicSlotsPanel from '@/components/visualize/scene-composer/DynamicSlotsPanel'
import GlobalFilterPanel from '@/components/visualize/template-builder/GlobalFilterPanel'
import DataFieldsPanel from '@/components/visualize/template-builder/DataFieldsPanel'
import StarterTemplatePicker from '@/components/visualize/template-builder/StarterTemplatePicker'
import ThemePickerPanel from '@/components/visualize/scene-composer/ThemePickerPanel'
import { THEME_PRESETS, applyThemeToScene, ensureThemeFontsLoaded } from '@/lib/themePresets'
import { getMetricFormat, formatValue, type FormatType } from '@/lib/templateBindingSchemas'

function defaultScene(): Scene {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: 'Untitled Template',
    width: 1920,
    height: 1080,
    background: '#09090b',
    elements: [],
    duration: 5,
    fps: 30,
  }
}

const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1.0]

export default function TemplateBuilderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const forkId = searchParams.get('fork')

  const [scene, setScene, { undo, redo, canUndo, canRedo }] = useSceneHistory<Scene>(defaultScene())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(0.5)

  // New: Global Filter replaces schemaType + inputSections + repeater
  const [globalFilter, setGlobalFilter] = useState<GlobalFilter>({ type: 'single-player', playerType: 'pitcher' })

  // Legacy state kept for backward compat during transition
  const [schemaType, setSchemaType] = useState<DataSchemaType>('leaderboard')
  const [repeater, setRepeater] = useState<RepeaterConfig | null>(null)
  const [inputSections, setInputSections] = useState<InputSection[]>([])

  const [saving, setSaving] = useState(false)
  const [saveId, setSaveId] = useState<string | null>(editId)
  const [loaded, setLoaded] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(false)
  const [showStarterPicker, setShowStarterPicker] = useState(!editId && !forkId)

  // Theme state
  const [activeThemeId, setActiveThemeId] = useState('')
  const [leftTab, setLeftTab] = useState<'objects' | 'themes'>('objects')

  const canvasRef = useRef<HTMLDivElement>(null)

  // ── Load existing template or fork ────────────────────────────────────────

  useEffect(() => {
    if (loaded) return

    if (editId) {
      fetch(`/api/custom-templates/${editId}`)
        .then(r => r.json())
        .then(json => {
          if (json.template) {
            const t: CustomTemplateRecord = json.template
            setScene({
              id: t.id,
              name: t.name,
              width: t.width,
              height: t.height,
              background: t.background,
              elements: t.elements,
              duration: 5,
              fps: 30,
            })
            // Load new globalFilter or fall back to old format
            if (t.globalFilter) {
              setGlobalFilter(t.globalFilter)
            } else {
              setSchemaType(t.schemaType)
              setRepeater(t.repeater)
              setInputSections(t.inputSections || [])
              // Auto-migrate for display
              const migrated = migrateTemplate(t)
              if (migrated.globalFilter) setGlobalFilter(migrated.globalFilter)
            }
            setSaveId(t.id)
            setShowStarterPicker(false)
          }
        })
        .catch(console.error)
        .finally(() => setLoaded(true))
    } else if (forkId) {
      const builtin = DATA_DRIVEN_TEMPLATES.find(t => t.id === forkId)
      if (builtin) {
        const config = { templateId: builtin.id, ...builtin.defaultConfig }
        const sample = getSampleData('leaderboard')
        const forked = builtin.rebuild(config, sample)
        setScene({ ...forked, name: `${builtin.name} (Custom)` })
        setGlobalFilter({ type: 'leaderboard', playerType: 'pitcher', count: 5, repeaterDirection: 'vertical', repeaterOffset: 160 })
      }
      setShowStarterPicker(false)
      setLoaded(true)
    } else {
      setLoaded(true)
    }
  }, [editId, forkId, loaded])

  // ── Element Management ────────────────────────────────────────────────────

  const selectedElement = scene.elements.find(e => e.id === selectedId) || null

  function handleApplyTheme(themeId: string) {
    setActiveThemeId(themeId)
    if (!themeId) return
    const theme = THEME_PRESETS.find(t => t.id === themeId)
    if (!theme) return
    ensureThemeFontsLoaded(theme)
    setScene(prev => applyThemeToScene(prev, theme))
  }

  const addElement = useCallback(
    (type: ElementType) => {
      const el = createElement(type, scene.width / 2, scene.height / 2)
      setScene(prev => ({ ...prev, elements: [...prev.elements, el] }))
      setSelectedId(el.id)
      setSelectedIds(new Set([el.id]))
    },
    [scene.width, scene.height]
  )

  const addDirectElement = useCallback(
    (el: SceneElement) => {
      setScene(prev => ({ ...prev, elements: [...prev.elements, el] }))
      setSelectedId(el.id)
      setSelectedIds(new Set([el.id]))
    },
    []
  )

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

  const [bindingLoading, setBindingLoading] = useState(false)

  const updateBinding = useCallback((id: string, binding: DataBinding | undefined) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, dataBinding: binding } : e)),
    }))
  }, [])

  // ── Drop field onto canvas: create or bind ────────────────────────────────

  const handleDropField = useCallback((field: string, fieldType: string, x: number, y: number, targetElementId?: string) => {
    if (targetElementId) {
      // Bind to existing element
      updateElement(targetElementId, { binding: { field } })
      // Apply placeholder text
      const el = scene.elements.find(e => e.id === targetElementId)
      if (el) {
        applyBindingPlaceholder(targetElementId, el.type, field)
      }
    } else {
      // Create new element at drop position
      const type: ElementType = fieldType === 'player_id' ? 'player-image'
        : fieldType === 'number' ? 'stat-card'
        : 'text'
      const el = createElement(type, x, y)
      el.binding = { field }
      // Set placeholder props
      if (type === 'stat-card') {
        el.props.label = field.replace(/_/g, ' ').toUpperCase()
        el.props.value = `{${field}}`
      } else if (type === 'text') {
        el.props.text = `{${field}}`
      } else if (type === 'player-image') {
        el.props.playerName = `{${field}}`
      }
      addDirectElement(el)
    }
  }, [scene.elements, updateElement, addDirectElement])

  const handleFieldClick = useCallback((field: string, fieldType: string) => {
    if (selectedIds.size === 0) return
    for (const id of selectedIds) {
      updateElement(id, { binding: { field } })
      const el = scene.elements.find(e => e.id === id)
      if (el) applyBindingPlaceholder(id, el.type, field)
    }
  }, [selectedIds, scene.elements, updateElement])

  function applyBindingPlaceholder(elId: string, elType: ElementType, field: string) {
    if (elType === 'stat-card') {
      updateElementProps(elId, { label: field.replace(/_/g, ' ').toUpperCase(), value: `{${field}}` })
    } else if (elType === 'text') {
      updateElementProps(elId, { text: `{${field}}` })
    } else if (elType === 'player-image') {
      updateElementProps(elId, { playerName: `{${field}}` })
    } else if (elType === 'comparison-bar') {
      updateElementProps(elId, { label: field.replace(/_/g, ' '), value: 0 })
    }
  }

  // ── Fetch data for current global filter ────────────────────────────────

  const handleFetchData = useCallback(async () => {
    setFetchLoading(true)
    try {
      const sampleData = getSampleDataForFilter(globalFilter.type, globalFilter.playerType)
      // For now, use sample data. Real fetch will come from API integration.
      // TODO: Replace with actual API calls based on globalFilter config
      const dataRows = Array.isArray(sampleData) ? sampleData : [sampleData]
      const row = dataRows[0] || {}

      // Apply data to bound elements
      setScene(prev => ({
        ...prev,
        elements: prev.elements.map(el => {
          if (!el.binding) return el
          const { field, format: explicitFormat, targetProp: targetOverride } = el.binding
          const newProps = { ...el.props }

          if (field === '__player__' || field === 'player_id' || el.type === 'player-image') {
            newProps.playerId = row.player_id || row.pitcher_id || null
            newProps.playerName = row.player_name || row.pitcher_name || ''
            return { ...el, props: newProps }
          }

          const rawValue = row[field]
          const format = getMetricFormat(field, explicitFormat as FormatType | undefined)
          const formatted = formatValue(rawValue, format)
          const target = targetOverride || autoTarget(el.type)
          newProps[target] = formatted

          if (el.type === 'stat-card' && !targetOverride) {
            newProps.label = field.replace(/_/g, ' ').toUpperCase()
          }
          return { ...el, props: newProps }
        }),
      }))
      setDataLoaded(true)
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setFetchLoading(false)
    }
  }, [globalFilter])

  // ── Dynamic Slots (kept for backward compat) ──────────────────────────────

  const addDynamicSlot = useCallback((): string => {
    const id = Math.random().toString(36).slice(2, 10)
    setScene(prev => {
      const existing = prev.dynamicSlots || []
      const label = `Player ${existing.length + 1}`
      const slot: DynamicSlot = { id, label, playerType: 'pitcher', gameYear: 2025 }
      return { ...prev, dynamicSlots: [...existing, slot] }
    })
    return id
  }, [])

  // ── Section Binding (legacy, kept for PropertiesPanel) ────────────────────

  const updateSectionBinding = useCallback((id: string, binding: SectionBinding | undefined) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, sectionBinding: binding } : e)),
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
        binding: src.binding ? { ...src.binding } : undefined,
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

  // ── Template Binding (legacy) ─────────────────────────────────────────────

  const updateTemplateBinding = useCallback((id: string, binding: TemplateBinding | undefined) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => {
        if (e.id !== id) return e
        const updated = { ...e, templateBinding: binding }
        if (binding) {
          const newProps = { ...e.props }
          const target = binding.targetProp || autoTarget(e.type)
          if (target === 'playerId') {
            newProps.playerName = `{${binding.fieldPath}}`
          } else {
            newProps[target] = `{${binding.fieldPath}}`
          }
          updated.props = newProps
        }
        return updated
      }),
    }))
  }, [])

  // ── Preview ─────────────────────────────────────────────────────────────

  function togglePreview() {
    setPreviewing(p => !p)
  }

  // Build preview scene with sample data
  const previewScene = (() => {
    if (!previewing) return scene

    const template: CustomTemplateRecord = {
      id: saveId || 'preview',
      name: scene.name,
      description: '',
      category: 'custom',
      icon: '',
      width: scene.width,
      height: scene.height,
      background: scene.background,
      elements: scene.elements,
      schemaType,
      repeater,
      globalFilter,
      created_at: '',
      updated_at: '',
    }

    const rebuild = createCustomRebuild(template)
    const sampleData = getSampleDataForFilter(globalFilter.type, globalFilter.playerType)
    const config = { templateId: 'preview', playerType: (globalFilter.playerType || 'pitcher') as 'pitcher' | 'batter', primaryStat: 'avg_velo', dateRange: { type: 'season' as const, year: 2025 } }
    return rebuild(config, sampleData)
  })()

  // ── Ghost elements for leaderboard repeater preview ──────────────────────

  const displayScene = (() => {
    if (previewing) return previewScene
    if (globalFilter.type !== 'leaderboard') return scene

    // Show ghost copies for leaderboard repeater
    const count = globalFilter.count || 5
    const direction = globalFilter.repeaterDirection || 'vertical'
    const offset = globalFilter.repeaterOffset || 140
    const boundEls = scene.elements.filter(el => el.binding)
    if (boundEls.length === 0) return scene

    const ghosts: SceneElement[] = []
    for (let i = 1; i < count; i++) {
      for (const tmplEl of boundEls) {
        const dx = direction === 'horizontal' ? offset * i : 0
        const dy = direction === 'vertical' ? offset * i : 0
        ghosts.push({
          ...tmplEl,
          id: `ghost_${tmplEl.id}_${i}`,
          x: tmplEl.x + dx,
          y: tmplEl.y + dy,
          opacity: 0.3,
          locked: true,
          props: { ...tmplEl.props },
        })
      }
    }

    return { ...scene, elements: [...scene.elements, ...ghosts] }
  })()

  // ── Save ────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        name: scene.name,
        description: '',
        category: 'custom',
        icon: '',
        width: scene.width,
        height: scene.height,
        background: scene.background,
        elements: scene.elements,
        schemaType,
        repeater,
        inputSections,
        globalFilter,
        base_template_id: forkId || undefined,
      }

      if (saveId) {
        await fetch(`/api/custom-templates/${saveId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        const res = await fetch('/api/custom-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (data.id) {
          setSaveId(data.id)
          window.history.replaceState(null, '', `/design/template-builder?edit=${data.id}`)
        }
      }
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setSaving(false)
    }
  }

  // ── Zoom ────────────────────────────────────────────────────────────────

  function zoomIn() {
    setZoom(z => {
      const next = ZOOM_STEPS.find(s => s > z)
      return next ?? z
    })
  }

  function zoomOut() {
    setZoom(z => {
      const prev = [...ZOOM_STEPS].reverse().find(s => s < z)
      return prev ?? z
    })
  }

  function handleDimensionChange(w: number, h: number) {
    setScene(prev => ({ ...prev, width: w, height: h }))
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); undo()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault(); redo()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault(); handleSave()
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) deleteElement(selectedId)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        if (selectedId) duplicateElement(selectedId)
      }
      // Nudge
      const nudge = e.shiftKey ? 10 : 1
      if (e.key === 'ArrowLeft' && selectedId) { e.preventDefault(); updateElement(selectedId, { x: (selectedElement?.x ?? 0) - nudge }) }
      if (e.key === 'ArrowRight' && selectedId) { e.preventDefault(); updateElement(selectedId, { x: (selectedElement?.x ?? 0) + nudge }) }
      if (e.key === 'ArrowUp' && selectedId) { e.preventDefault(); updateElement(selectedId, { y: (selectedElement?.y ?? 0) - nudge }) }
      if (e.key === 'ArrowDown' && selectedId) { e.preventDefault(); updateElement(selectedId, { y: (selectedElement?.y ?? 0) + nudge }) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // ── Starter Template instantiation ────────────────────────────────────────

  function instantiateStarter(starter: StarterTemplate) {
    const elements: SceneElement[] = starter.elements.map(def => {
      const el = createElement(def.type, def.x + def.width / 2, def.y + def.height / 2)
      el.width = def.width
      el.height = def.height
      el.x = def.x
      el.y = def.y
      if (def.props) el.props = { ...el.props, ...def.props }
      if (def.bindingField) el.binding = { field: def.bindingField }
      return el
    })

    setScene({
      id: Math.random().toString(36).slice(2, 10),
      name: starter.name,
      width: starter.canvasWidth,
      height: starter.canvasHeight,
      background: starter.background,
      elements,
      duration: 5,
      fps: 30,
    })
    setGlobalFilter(starter.defaultFilter)
    setShowStarterPicker(false)
  }

  // ── Template Loading ──────────────────────────────────────────────────────

  function loadSceneTemplate(loaded: Scene) {
    setScene({ ...loaded, templateConfig: undefined, templateData: undefined })
    setSelectedId(null)
    setSelectedIds(new Set())
    setSaveId(null)
    window.history.replaceState(null, '', '/design/template-builder')
  }

  function loadDataDrivenIntoBuilder(template: DataDrivenTemplate) {
    const config = { templateId: template.id, ...template.defaultConfig }
    const sampleData = getSampleData(template.defaultConfig.primaryStat ? 'leaderboard' : 'generic')
    const built = template.rebuild(config, sampleData)
    setScene({ ...built, name: `${template.name} (Custom)`, templateConfig: undefined, templateData: undefined })
    setGlobalFilter({ type: 'leaderboard', playerType: 'pitcher', count: 5, repeaterDirection: 'vertical', repeaterOffset: 160 })
    setSelectedId(null)
    setSelectedIds(new Set())
  }

  function loadCustomIntoBuilder(template: CustomTemplateRecord) {
    setScene({
      id: template.id,
      name: template.name,
      width: template.width,
      height: template.height,
      background: template.background,
      elements: template.elements,
      duration: 5,
      fps: 30,
    })
    if (template.globalFilter) {
      setGlobalFilter(template.globalFilter)
    } else {
      const migrated = migrateTemplate(template)
      if (migrated.globalFilter) setGlobalFilter(migrated.globalFilter)
    }
    setSchemaType(template.schemaType)
    setRepeater(template.repeater)
    setInputSections(template.inputSections || [])
    setSaveId(template.id)
    setSelectedId(null)
    setSelectedIds(new Set())
    window.history.replaceState(null, '', `/design/template-builder?edit=${template.id}`)
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const boundCount = scene.elements.filter(e => e.binding).length

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Starter Template Picker modal */}
      {showStarterPicker && (
        <StarterTemplatePicker
          onSelect={instantiateStarter}
          onBlank={() => setShowStarterPicker(false)}
          onClose={() => setShowStarterPicker(false)}
        />
      )}

      {/* Top bar */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-2 flex items-center gap-3 shrink-0">
        {/* Back */}
        <a href="/visualize" className="text-zinc-500 hover:text-zinc-300 transition shrink-0" title="Back to Visualize">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </a>

        {/* Template name */}
        <input
          type="text"
          value={scene.name}
          onChange={e => setScene(prev => ({ ...prev, name: e.target.value }))}
          className="bg-transparent text-sm font-semibold text-white border-none outline-none min-w-0 max-w-[200px] hover:bg-zinc-800 focus:bg-zinc-800 px-2 py-1 rounded transition"
        />

        {/* Badge */}
        <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
          Template Builder
        </span>

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
            value={scene.background === 'transparent' ? '#09090b' : scene.background}
            onChange={e => setScene(prev => ({ ...prev, background: e.target.value }))}
            className="w-6 h-6 rounded cursor-pointer bg-transparent border border-zinc-700"
          />
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <button onClick={undo} disabled={!canUndo} className="px-1.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-xs transition disabled:opacity-30 disabled:cursor-default" title="Undo">
            {'\u21a9'}
          </button>
          <button onClick={redo} disabled={!canRedo} className="px-1.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-xs transition disabled:opacity-30 disabled:cursor-default" title="Redo">
            {'\u21aa'}
          </button>
        </div>

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

        {/* Preview toggle */}
        <button
          onClick={togglePreview}
          className={`px-3 py-1.5 rounded text-xs font-medium transition ${
            previewing
              ? 'bg-emerald-600 text-white'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white'
          }`}
        >
          {previewing ? 'Edit' : 'Preview'}
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : saveId ? 'Save' : 'Save New'}
        </button>
      </div>

      {/* Main workspace */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel: Global Filter + Data Fields + Objects/Themes */}
        {!previewing && (
          <div className="w-56 border-r border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0 flex flex-col">
            {/* Global Filter */}
            <GlobalFilterPanel
              globalFilter={globalFilter}
              onChange={gf => { setGlobalFilter(gf); setDataLoaded(false) }}
              onFetchData={handleFetchData}
              dataLoaded={dataLoaded}
              fetchLoading={fetchLoading}
            />

            <div className="h-px bg-zinc-800 shrink-0" />

            {/* Data Fields */}
            <div className="shrink-0 max-h-[300px] overflow-y-auto">
              <DataFieldsPanel
                filterType={globalFilter.type}
                playerType={globalFilter.playerType}
                selectedIds={selectedIds}
                onFieldClick={handleFieldClick}
              />
            </div>

            <div className="h-px bg-zinc-800 shrink-0" />

            {/* Objects / Themes tabs */}
            <div className="flex border-b border-zinc-800 shrink-0">
              {(['objects', 'themes'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setLeftTab(tab)}
                  className={`flex-1 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider transition ${
                    leftTab === tab
                      ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/5'
                      : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {leftTab === 'objects'
                ? <ElementLibrary onAdd={addElement} onAddElement={addDirectElement} onLoadScene={loadSceneTemplate} onLoadDataDriven={loadDataDrivenIntoBuilder} onLoadCustomTemplate={loadCustomIntoBuilder} />
                : <ThemePickerPanel selectedThemeId={activeThemeId} onApply={handleApplyTheme} />
              }
            </div>
          </div>
        )}

        {/* Center: Canvas */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <SceneCanvas
            scene={displayScene}
            selectedId={previewing ? null : selectedId}
            selectedIds={previewing ? undefined : selectedIds}
            highlightedIds={previewing ? undefined : highlightedIds}
            zoom={zoom}
            onSelect={previewing ? () => {} : handleSelect}
            onSelectMany={previewing ? () => {} : handleSelectMany}
            onUpdateElement={previewing ? () => {} : updateElement}
            canvasRef={canvasRef}
            onDropField={previewing ? undefined : handleDropField}
            showBindingTags={!previewing}
          />
        </div>

        {/* Right: Properties Panel */}
        {!previewing && (
          <div className="w-64 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0">
            {selectedElement && selectedIds.size <= 1 ? (
              <div>
                <PropertiesPanel
                  element={selectedElement}
                  onUpdate={updates => updateElement(selectedElement.id, updates)}
                  onUpdateProps={propUpdates => updateElementProps(selectedElement.id, propUpdates)}
                  onUpdateBinding={binding => updateBinding(selectedElement.id, binding)}
                  onFetchBinding={() => {}}
                  onDelete={() => deleteElement(selectedElement.id)}
                  onDuplicate={() => duplicateElement(selectedElement.id)}
                  bindingLoading={bindingLoading}
                  dynamicSlots={scene.dynamicSlots}
                  onAddDynamicSlot={addDynamicSlot}
                  inputSections={inputSections}
                  onUpdateSectionBinding={binding => updateSectionBinding(selectedElement.id, binding)}
                />
                {/* Binding display */}
                {selectedElement.binding && (
                  <div className="px-3 pb-3">
                    <div className="bg-zinc-800/50 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Binding</span>
                        <button
                          onClick={() => updateElement(selectedElement.id, { binding: undefined })}
                          className="text-[10px] text-red-400 hover:text-red-300 transition"
                        >
                          Unbind
                        </button>
                      </div>
                      <div className="text-xs text-emerald-400 font-mono">{selectedElement.binding.field}</div>
                      {selectedElement.binding.format && (
                        <div className="text-[10px] text-zinc-500">Format: {selectedElement.binding.format}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 space-y-3">
                <div className="text-[11px] text-zinc-500">
                  {selectedIds.size > 1
                    ? `${selectedIds.size} elements selected — click a Data Field to bind all`
                    : 'Select an element to edit properties, or drag a Data Field onto the canvas'
                  }
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 bg-zinc-900 border-t border-zinc-800 px-4 py-1.5 flex items-center gap-4">
        <span className="text-[10px] text-zinc-600">
          {scene.elements.length} element{scene.elements.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] text-zinc-600">
          {scene.width}&times;{scene.height}
        </span>
        <span className="text-[10px] text-emerald-600">
          Filter: {globalFilter.type}
        </span>
        {boundCount > 0 && (
          <span className="text-[10px] text-emerald-500">
            {boundCount} bound
          </span>
        )}
        {globalFilter.type === 'leaderboard' && (
          <span className="text-[10px] text-emerald-500">
            Repeater: {globalFilter.count || 5} rows, {globalFilter.repeaterOffset || 140}px {globalFilter.repeaterDirection || 'vertical'}
          </span>
        )}
        {saveId && (
          <span className="text-[10px] text-zinc-700 ml-auto">
            ID: {saveId.slice(0, 8)}...
          </span>
        )}
      </div>
    </div>
  )
}

function autoTarget(type: ElementType): string {
  switch (type) {
    case 'text': return 'text'
    case 'stat-card': return 'value'
    case 'comparison-bar': return 'value'
    case 'player-image': return 'playerId'
    default: return 'text'
  }
}
