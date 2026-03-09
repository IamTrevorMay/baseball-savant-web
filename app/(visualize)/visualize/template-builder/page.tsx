'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Scene, SceneElement, ElementType, DataSchemaType, DataBinding, DynamicSlot,
  RepeaterConfig, TemplateBinding, CustomTemplateRecord, InputSection, SectionBinding,
  ALL_SECTION_INPUTS, createElement, SCENE_PRESETS,
} from '@/lib/sceneTypes'
import { SCENE_METRICS } from '@/lib/reportMetrics'
import { useSceneHistory } from '@/lib/useSceneHistory'
import { getSampleData } from '@/lib/templateBindingSchemas'
import { createCustomRebuild } from '@/lib/customTemplateRebuild'
import { DATA_DRIVEN_TEMPLATES, type DataDrivenTemplate } from '@/lib/sceneTemplates'
import SceneCanvas from '@/components/visualize/scene-composer/SceneCanvas'
import ElementLibrary from '@/components/visualize/scene-composer/ElementLibrary'
import PropertiesPanel from '@/components/visualize/scene-composer/PropertiesPanel'
import DynamicSlotsPanel from '@/components/visualize/scene-composer/DynamicSlotsPanel'
import DataSchemaSelector from '@/components/visualize/template-builder/DataSchemaSelector'
import TemplateBindingSection from '@/components/visualize/template-builder/TemplateBindingSection'
import RepeaterPanel from '@/components/visualize/template-builder/RepeaterPanel'
import InputSectionsPanel from '@/components/visualize/template-builder/InputSectionsPanel'

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

/** Ensure loaded sections have enabledInputs (backwards compat) */
function normalizeSections(sections: InputSection[]): InputSection[] {
  return sections.map(s => ({
    ...s,
    enabledInputs: s.enabledInputs ?? [...ALL_SECTION_INPUTS],
  }))
}

export default function TemplateBuilderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const forkId = searchParams.get('fork')

  const [scene, setScene, { undo, redo, canUndo, canRedo }] = useSceneHistory<Scene>(defaultScene())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(0.5)
  const [schemaType, setSchemaType] = useState<DataSchemaType>('leaderboard')
  const [repeater, setRepeater] = useState<RepeaterConfig | null>(null)
  const [inputSections, setInputSections] = useState<InputSection[]>([])
  const [sectionFetchLoading, setSectionFetchLoading] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveId, setSaveId] = useState<string | null>(editId)
  const [loaded, setLoaded] = useState(false)
  const [previewing, setPreviewing] = useState(false)

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
            setSchemaType(t.schemaType)
            setRepeater(t.repeater)
            setInputSections(normalizeSections(t.inputSections || []))
            setSaveId(t.id)
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
        setSchemaType('leaderboard')
      }
      setLoaded(true)
    } else {
      setLoaded(true)
    }
  }, [editId, forkId, loaded])

  // ── Element Management ────────────────────────────────────────────────────

  const selectedElement = scene.elements.find(e => e.id === selectedId) || null

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

  function formatStatValue(val: any, format?: string): string {
    if (val == null) return '—'
    const n = Number(val)
    if (isNaN(n)) return String(val)
    switch (format) {
      case '1f': return n.toFixed(1)
      case 'integer': return Math.round(n).toString()
      case 'percent': return `${n.toFixed(1)}%`
      case '3f': return n.toFixed(3)
      default: return String(val)
    }
  }

  function applyStatToElement(elId: string, elType: ElementType, metric: string, val: any, playerName: string, sublabel: string, format?: string) {
    const formatted = formatStatValue(val, format)
    if (elType === 'stat-card') {
      updateElementProps(elId, { value: formatted, label: metric.replace(/_/g, ' ').toUpperCase(), sublabel })
    } else if (elType === 'comparison-bar') {
      updateElementProps(elId, { value: val != null ? Number(val) : 0, label: `${playerName} - ${metric.replace(/_/g, ' ')}` })
    } else if (elType === 'text') {
      updateElementProps(elId, { text: formatted })
    } else {
      updateElementProps(elId, { value: formatted })
    }
  }

  const fetchBinding = useCallback(async (id: string) => {
    const el = scene.elements.find(e => e.id === id)
    if (!el?.dataBinding) return
    const b = el.dataBinding

    setBindingLoading(true)
    try {
      if (b.source === 'dynamic') {
        const slot = scene.dynamicSlots?.find(s => s.id === b.dynamicSlot)
        if (!slot?.playerId) return
        const params = new URLSearchParams({
          playerId: String(slot.playerId),
          metrics: b.metric,
          gameYear: String(slot.gameYear),
        })
        if (slot.pitchType) params.set('pitchType', slot.pitchType)
        const res = await fetch(`/api/scene-stats?${params}`)
        const data = await res.json()
        const val = data.stats?.[b.metric]
        applyStatToElement(id, el.type, b.metric, val, slot.playerName || '', `${slot.playerName || ''} ${slot.gameYear}`.trim())
      } else if (b.source === 'statcast') {
        const params = new URLSearchParams({
          playerId: String(b.playerId),
          metrics: b.metric,
          ...(b.gameYear && { gameYear: String(b.gameYear) }),
        })
        if (b.pitchType) params.set('pitchType', b.pitchType)
        const res = await fetch(`/api/scene-stats?${params}`)
        const data = await res.json()
        const val = data.stats?.[b.metric]
        applyStatToElement(id, el.type, b.metric, val, b.playerName, `${b.playerName} ${b.gameYear || ''}`.trim())
      }
    } catch (err) {
      console.error('Binding fetch error:', err)
    } finally {
      setBindingLoading(false)
    }
  }, [scene.elements, scene.dynamicSlots, updateElementProps])

  // ── Dynamic Slots ─────────────────────────────────────────────────────────

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

  const updateDynamicSlot = useCallback((id: string, updates: Partial<DynamicSlot>) => {
    setScene(prev => ({
      ...prev,
      dynamicSlots: (prev.dynamicSlots || []).map(s => s.id === id ? { ...s, ...updates } : s),
    }))
  }, [])

  const removeDynamicSlot = useCallback((id: string) => {
    setScene(prev => ({
      ...prev,
      dynamicSlots: (prev.dynamicSlots || []).filter(s => s.id !== id),
      elements: prev.elements.map(e =>
        e.dataBinding?.dynamicSlot === id ? { ...e, dataBinding: undefined } : e
      ),
    }))
  }, [])

  const [dynamicFetchLoading, setDynamicFetchLoading] = useState(false)

  const fetchAllDynamic = useCallback(async () => {
    const slots = scene.dynamicSlots
    if (!slots?.length) return

    const slotElements = new Map<string, { metrics: Set<string>; elements: SceneElement[] }>()
    for (const el of scene.elements) {
      if (el.dataBinding?.source !== 'dynamic' || !el.dataBinding.dynamicSlot) continue
      const slotId = el.dataBinding.dynamicSlot
      if (!slotElements.has(slotId)) slotElements.set(slotId, { metrics: new Set(), elements: [] })
      const entry = slotElements.get(slotId)!
      entry.metrics.add(el.dataBinding.metric)
      entry.elements.push(el)
    }

    if (slotElements.size === 0) return
    setDynamicFetchLoading(true)

    try {
      const fetches = Array.from(slotElements.entries()).map(async ([slotId, { metrics, elements }]) => {
        const slot = slots.find(s => s.id === slotId)
        if (!slot?.playerId) return

        const params = new URLSearchParams({
          playerId: String(slot.playerId),
          metrics: Array.from(metrics).join(','),
          gameYear: String(slot.gameYear),
        })
        if (slot.pitchType) params.set('pitchType', slot.pitchType)

        const res = await fetch(`/api/scene-stats?${params}`)
        const data = await res.json()
        const stats = data.stats || {}

        for (const el of elements) {
          const metric = el.dataBinding!.metric
          const val = stats[metric]
          applyStatToElement(el.id, el.type, metric, val, slot.playerName || '', `${slot.playerName || ''} ${slot.gameYear}`.trim())
        }
      })

      await Promise.all(fetches)
    } catch (err) {
      console.error('Fetch all dynamic error:', err)
    } finally {
      setDynamicFetchLoading(false)
    }
  }, [scene.elements, scene.dynamicSlots, updateElementProps])

  // ── Input Sections ─────────────────────────────────────────────────────

  const addInputSection = useCallback((name: string, elementIds: string[]) => {
    const sectionId = Math.random().toString(36).slice(2, 10)
    const section: InputSection = {
      id: sectionId,
      label: name,
      elementIds,
      enabledInputs: [...ALL_SECTION_INPUTS],
      playerType: 'pitcher',
      gameYear: 2025,
    }
    setInputSections(prev => [...prev, section])
    // Set sectionBinding on each element
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => {
        if (!elementIds.includes(e.id)) return e
        const binding: SectionBinding = e.type === 'player-image'
          ? { sectionId, metric: '__player__' }
          : { sectionId, metric: 'avg_velo', format: '1f' }
        return { ...e, sectionBinding: binding }
      }),
    }))
  }, [])

  const updateInputSection = useCallback((id: string, updates: Partial<InputSection>) => {
    setInputSections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }, [])

  const removeInputSection = useCallback((id: string) => {
    setInputSections(prev => prev.filter(s => s.id !== id))
    // Clear sectionBinding from elements that belong to this section
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e =>
        e.sectionBinding?.sectionId === id ? { ...e, sectionBinding: undefined } : e
      ),
    }))
  }, [])

  const fetchInputSection = useCallback(async (sectionId: string) => {
    const section = inputSections.find(s => s.id === sectionId)
    if (!section?.playerId) return

    const sectionElements = scene.elements.filter(e =>
      e.sectionBinding?.sectionId === sectionId
    )
    if (sectionElements.length === 0) return

    setSectionFetchLoading(sectionId)
    try {
      // Collect metrics (excluding __player__)
      const metrics = new Set<string>()
      for (const el of sectionElements) {
        if (el.sectionBinding && el.sectionBinding.metric !== '__player__') {
          metrics.add(el.sectionBinding.metric)
        }
      }

      let stats: Record<string, any> = {}
      if (metrics.size > 0) {
        const params = new URLSearchParams({
          playerId: String(section.playerId),
          playerType: section.playerType,
          metrics: Array.from(metrics).join(','),
          gameYear: String(section.gameYear),
        })
        if (section.pitchType) params.set('pitchType', section.pitchType)
        const res = await fetch(`/api/scene-stats?${params}`)
        const data = await res.json()
        stats = data.stats || {}
      }

      // Apply stats to elements
      for (const el of sectionElements) {
        if (!el.sectionBinding) continue
        const { metric, format } = el.sectionBinding

        if (metric === '__player__') {
          // Player-image: set playerId and playerName
          updateElementProps(el.id, { playerId: section.playerId, playerName: section.playerName || '' })
        } else {
          const val = stats[metric]
          const sublabel = `${section.playerName || ''} ${section.gameYear}`.trim()
          applyStatToElement(el.id, el.type, metric, val, section.playerName || '', sublabel, format)
        }
      }
    } catch (err) {
      console.error('Section fetch error:', err)
    } finally {
      setSectionFetchLoading(null)
    }
  }, [inputSections, scene.elements, updateElementProps])

  const highlightSectionElements = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setSelectedIds(new Set(ids))
    setSelectedId(ids[0])
  }, [])

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
      // Also remove from repeater if needed
      setRepeater(prev => {
        if (!prev) return prev
        const newIds = prev.elementIds.filter(eid => eid !== id)
        if (newIds.length === 0) return null
        return { ...prev, elementIds: newIds }
      })
      // Also remove from input sections; remove section if empty
      setInputSections(prev => {
        const updated = prev.map(s => ({
          ...s,
          elementIds: s.elementIds.filter(eid => eid !== id),
        }))
        return updated.filter(s => s.elementIds.length > 0)
      })
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

  // ── Template Binding ──────────────────────────────────────────────────────

  const updateTemplateBinding = useCallback((id: string, binding: TemplateBinding | undefined) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => {
        if (e.id !== id) return e
        const updated = { ...e, templateBinding: binding }
        // Update display text to show placeholder
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

  // ── Repeater ──────────────────────────────────────────────────────────────

  function createRepeater() {
    if (selectedIds.size === 0) return
    setRepeater({
      enabled: true,
      elementIds: Array.from(selectedIds),
      direction: 'vertical',
      offset: 160,
      count: 5,
    })
  }

  function clearRepeater() {
    setRepeater(null)
  }

  // ── Preview ───────────────────────────────────────────────────────────────

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
      created_at: '',
      updated_at: '',
    }

    const rebuild = createCustomRebuild(template)
    const sampleData = getSampleData(schemaType)
    const config = { templateId: 'preview', playerType: 'pitcher' as const, primaryStat: 'avg_velo', dateRange: { type: 'season' as const, year: 2025 } }
    return rebuild(config, sampleData)
  })()

  // ── Ghost elements for repeater preview on canvas ─────────────────────────

  const displayScene = (() => {
    if (previewing) return previewScene
    if (!repeater?.enabled) return scene

    // Add ghost copies at 30% opacity
    const repeaterIds = new Set(repeater.elementIds)
    const templateEls = scene.elements.filter(el => repeaterIds.has(el.id))
    const ghosts: SceneElement[] = []

    for (let i = 1; i < repeater.count; i++) {
      for (const tmplEl of templateEls) {
        const dx = repeater.direction === 'horizontal' ? repeater.offset * i : 0
        const dy = repeater.direction === 'vertical' ? repeater.offset * i : 0
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

  // ── Save ──────────────────────────────────────────────────────────────────

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
          // Update URL without full navigation
          window.history.replaceState(null, '', `/visualize/template-builder?edit=${data.id}`)
        }
      }
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setSaving(false)
    }
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

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

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

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

  // ── Template Loading ──────────────────────────────────────────────────────

  function loadSceneTemplate(loaded: Scene) {
    setScene({ ...loaded, templateConfig: undefined, templateData: undefined })
    setSelectedId(null)
    setSelectedIds(new Set())
    setSaveId(null)
    window.history.replaceState(null, '', '/visualize/template-builder')
  }

  function loadDataDrivenIntoBuilder(template: DataDrivenTemplate) {
    const config = { templateId: template.id, ...template.defaultConfig }
    const sampleData = getSampleData(template.defaultConfig.primaryStat ? 'leaderboard' : 'generic')
    const built = template.rebuild(config, sampleData)
    setScene({ ...built, name: `${template.name} (Custom)`, templateConfig: undefined, templateData: undefined })
    setSchemaType('leaderboard')
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
    setSchemaType(template.schemaType)
    setRepeater(template.repeater)
    setInputSections(normalizeSections(template.inputSections || []))
    setSaveId(template.id)
    setSelectedId(null)
    setSelectedIds(new Set())
    // Update URL
    window.history.replaceState(null, '', `/visualize/template-builder?edit=${template.id}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const boundCount = scene.elements.filter(e => e.templateBinding).length

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

        {/* Schema selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500">Schema</span>
          <DataSchemaSelector value={schemaType} onChange={setSchemaType} />
        </div>

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
        {/* Left: Element Library (elements + presets tabs only) */}
        {!previewing && (
          <div className="w-52 border-r border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0">
            <ElementLibrary onAdd={addElement} onAddElement={addDirectElement} onLoadScene={loadSceneTemplate} onLoadDataDriven={loadDataDrivenIntoBuilder} onLoadCustomTemplate={loadCustomIntoBuilder} />
          </div>
        )}

        {/* Center: Canvas */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <SceneCanvas
            scene={displayScene}
            selectedId={previewing ? null : selectedId}
            selectedIds={previewing ? undefined : selectedIds}
            zoom={zoom}
            onSelect={previewing ? () => {} : handleSelect}
            onSelectMany={previewing ? () => {} : handleSelectMany}
            onUpdateElement={previewing ? () => {} : updateElement}
            canvasRef={canvasRef}
          />
        </div>

        {/* Right: Properties Panel or Repeater Panel */}
        {!previewing && (
          <div className="w-64 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0">
            {selectedElement ? (
              <div>
                <PropertiesPanel
                  element={selectedElement}
                  onUpdate={updates => updateElement(selectedElement.id, updates)}
                  onUpdateProps={propUpdates => updateElementProps(selectedElement.id, propUpdates)}
                  onUpdateBinding={binding => updateBinding(selectedElement.id, binding)}
                  onFetchBinding={() => fetchBinding(selectedElement.id)}
                  onDelete={() => deleteElement(selectedElement.id)}
                  onDuplicate={() => duplicateElement(selectedElement.id)}
                  bindingLoading={bindingLoading}
                  dynamicSlots={scene.dynamicSlots}
                  onAddDynamicSlot={addDynamicSlot}
                  inputSections={inputSections}
                  onUpdateSectionBinding={binding => updateSectionBinding(selectedElement.id, binding)}
                />
                {/* Template binding section */}
                <div className="px-3 pb-3">
                  <TemplateBindingSection
                    element={selectedElement}
                    schemaType={schemaType}
                    onUpdateBinding={binding => updateTemplateBinding(selectedElement.id, binding)}
                  />
                </div>
              </div>
            ) : (
              <div className="p-3 space-y-4">
                <InputSectionsPanel
                  sections={inputSections}
                  selectedIds={selectedIds}
                  elements={scene.elements}
                  onAddSection={addInputSection}
                  onUpdateSection={updateInputSection}
                  onRemoveSection={removeInputSection}
                  onFetchSection={fetchInputSection}
                  onSelectElements={highlightSectionElements}
                  onUpdateElementBinding={(elId, binding) => updateSectionBinding(elId, binding)}
                  fetchLoading={sectionFetchLoading}
                />
                <div className="h-px bg-zinc-800" />
                <DynamicSlotsPanel
                  slots={scene.dynamicSlots || []}
                  onUpdateSlot={updateDynamicSlot}
                  onAddSlot={addDynamicSlot}
                  onRemoveSlot={removeDynamicSlot}
                  onFetchAll={fetchAllDynamic}
                  fetchLoading={dynamicFetchLoading}
                />
                <RepeaterPanel
                  repeater={repeater}
                  selectedIds={selectedIds}
                  onCreateRepeater={createRepeater}
                  onUpdateRepeater={setRepeater}
                  onClearRepeater={clearRepeater}
                />
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
          Schema: {schemaType}
        </span>
        {boundCount > 0 && (
          <span className="text-[10px] text-emerald-500">
            {boundCount} bound
          </span>
        )}
        {inputSections.length > 0 && (
          <span className="text-[10px] text-emerald-500">
            {inputSections.length} section{inputSections.length !== 1 ? 's' : ''}
          </span>
        )}
        {repeater?.enabled && (
          <span className="text-[10px] text-emerald-500">
            Repeater: {repeater.count} rows, {repeater.offset}px {repeater.direction}
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
