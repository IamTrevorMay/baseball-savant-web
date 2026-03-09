'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Scene, SceneElement, ElementType, DataBinding, DynamicSlot, Keyframe, EasingFunction, TemplateConfig, TemplateDataRow, CustomTemplateRecord, InputSection, SectionBinding, createElement, createDefaultScene, SCENE_PRESETS } from '@/lib/sceneTypes'
import { interpolateScene } from '@/lib/sceneInterpolation'
import { useSceneHistory } from '@/lib/useSceneHistory'
import { DATA_DRIVEN_TEMPLATES, type DataDrivenTemplate } from '@/lib/sceneTemplates'
import { createCustomRebuild } from '@/lib/customTemplateRebuild'
import { MLB_TEAM_COLORS } from '@/lib/reportMetrics'
import SceneCanvas from '@/components/visualize/scene-composer/SceneCanvas'
import ElementLibrary from '@/components/visualize/scene-composer/ElementLibrary'
import InputSectionsPanel from '@/components/visualize/template-builder/InputSectionsPanel'
import DynamicSlotsPanel from '@/components/visualize/scene-composer/DynamicSlotsPanel'
import PropertiesPanel from '@/components/visualize/scene-composer/PropertiesPanel'
import TemplateConfigPanel from '@/components/visualize/scene-composer/TemplateConfigPanel'
import OutingConfigPanel from '@/components/visualize/scene-composer/OutingConfigPanel'
import PercentileConfigPanel from '@/components/visualize/scene-composer/PercentileConfigPanel'
import Timeline from '@/components/visualize/scene-composer/Timeline'
import SceneGallery from '@/components/visualize/scene-composer/SceneGallery'
import { exportScenePNG, exportSceneJSON, exportImageSequence, exportWebM, exportMP4 } from '@/components/visualize/scene-composer/exportScene'

const STORAGE_KEY = 'triton-scene-composer'
const ZOOM_STEPS = [0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1.0]

export default function SceneComposerPage() {
  const [scene, setScene, { undo, redo, canUndo, canRedo }] = useSceneHistory<Scene>(createDefaultScene())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(0.5)
  const [loaded, setLoaded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [bindingLoading, setBindingLoading] = useState(false)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('unsaved')
  const [showSaveMenu, setShowSaveMenu] = useState(false)
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false)
  const [customTemplateId, setCustomTemplateId] = useState<string | null>(null)
  const [customTemplateRecord, setCustomTemplateRecord] = useState<CustomTemplateRecord | null>(null)
  const [showBroadcastExport, setShowBroadcastExport] = useState(false)
  const [broadcastProjects, setBroadcastProjects] = useState<{id:string;name:string}[]>([])
  const [broadcastExporting, setBroadcastExporting] = useState(false)

  // Input sections (from custom templates)
  const [inputSections, setInputSections] = useState<InputSection[]>([])
  const [sectionFetchLoading, setSectionFetchLoading] = useState<string | null>(null)
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())

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

  const loadTemplateScene = useCallback(
    (templateScene: Scene) => {
      setScene({ ...templateScene, templateConfig: undefined, templateData: undefined })
      setSelectedId(null)
      setSelectedIds(new Set())
      setCurrentFrame(0)
      setPlaying(false)
    },
    []
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

  const handleSelect = useCallback((id: string | null, additive?: boolean) => {
    if (!id) {
      setSelectedId(null)
      setSelectedIds(new Set())
      return
    }
    if (additive) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) { next.delete(id) } else { next.add(id) }
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

  // ── Data Binding ──────────────────────────────────────────────────────────

  const updateBinding = useCallback((id: string, binding: DataBinding | undefined) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, dataBinding: binding } : e)),
    }))
  }, [])

  function applyStatToElement(elId: string, elType: ElementType, metric: string, val: any, playerName: string, sublabel: string) {
    if (val === null || val === undefined) return
    if (elType === 'stat-card') {
      updateElementProps(elId, { value: String(val), label: metric.replace(/_/g, ' ').toUpperCase(), sublabel })
    } else if (elType === 'comparison-bar') {
      updateElementProps(elId, { value: Number(val), label: `${playerName} - ${metric.replace(/_/g, ' ')}` })
    } else if (elType === 'text') {
      updateElementProps(elId, { text: String(val) })
    } else if (elType === 'ticker') {
      updateElementProps(elId, { text: `${playerName} ${metric.replace(/_/g, ' ')}: ${val}` })
    } else {
      // Generic fallback: set value prop
      updateElementProps(elId, { value: String(val) })
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
          ...(b.pitchType && { pitchType: b.pitchType }),
        })
        const res = await fetch(`/api/scene-stats?${params}`)
        const data = await res.json()
        const val = data.stats?.[b.metric]
        applyStatToElement(id, el.type, b.metric, val, b.playerName, `${b.playerName} ${b.gameYear || ''}`.trim())
      } else if (b.source === 'lahman') {
        const res = await fetch(`/api/lahman/player?playerId=${b.playerId}`)
        const data = await res.json()
        const stat = b.lahmanStat || 'era'
        const row = data.pitching?.[0] || data.batting?.[0]
        if (row && row[stat] !== undefined) {
          applyStatToElement(id, el.type, stat, row[stat], b.playerName, b.playerName)
        }
      }
    } catch (err) {
      console.error('Fetch binding error:', err)
    } finally {
      setBindingLoading(false)
    }
  }, [scene.elements, scene.dynamicSlots, updateElementProps])

  // ── Dynamic Slots ──────────────────────────────────────────────────────────

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
      // Clear bindings referencing this slot
      elements: prev.elements.map(e =>
        e.dataBinding?.dynamicSlot === id
          ? { ...e, dataBinding: undefined }
          : e
      ),
    }))
  }, [])

  const [dynamicFetchLoading, setDynamicFetchLoading] = useState(false)

  const fetchAllDynamic = useCallback(async () => {
    const slots = scene.dynamicSlots
    if (!slots?.length) return

    // Collect all dynamic elements grouped by slot
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
      // Fetch for each slot
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

        // Apply results to each element
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
  }, [scene.dynamicSlots, scene.elements, updateElementProps])

  // ── Input Sections (custom templates) ────────────────────────────────────

  const addInputSection = useCallback((name: string, elementIds: string[]) => {
    const sectionId = Math.random().toString(36).slice(2, 10)
    const section: InputSection = {
      id: sectionId,
      label: name,
      elementIds,
      enabledInputs: [],
      playerType: 'pitcher',
      gameYear: 2025,
    }
    setInputSections(prev => [...prev, section])
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
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e =>
        e.sectionBinding?.sectionId === id ? { ...e, sectionBinding: undefined } : e
      ),
    }))
  }, [])

  const updateSectionBinding = useCallback((id: string, binding: SectionBinding | undefined) => {
    setScene(prev => ({
      ...prev,
      elements: prev.elements.map(e => (e.id === id ? { ...e, sectionBinding: binding } : e)),
    }))
  }, [])

  const fetchInputSection = useCallback(async (sectionId: string) => {
    const section = inputSections.find(s => s.id === sectionId)
    if (!section) return

    const sectionElements = scene.elements.filter(e =>
      e.sectionBinding?.sectionId === sectionId
    )
    if (sectionElements.length === 0) return

    setSectionFetchLoading(sectionId)
    try {
      // ── Live Game branch ──
      if (section.globalInputType === 'live-game' && section.gamePk) {
        const res = await fetch(`/api/scores?date=${section.gameDate || ''}`)
        const data = await res.json()
        const games = data.games || []
        const game = games.find((g: any) => g.gamePk === section.gamePk)
        if (!game) { setSectionFetchLoading(null); return }

        const half = game.inningHalf === 'Top' ? 'TOP' : game.inningHalf === 'Bottom' ? 'BOT' : ''
        const awayAbbrev = game.away.abbrev || ''
        const homeAbbrev = game.home.abbrev || ''
        const outsNum = game.outs ?? 0

        const stats: Record<string, string> = {
          away_abbrev: awayAbbrev,
          home_abbrev: homeAbbrev,
          away_name: game.away.name || '',
          home_name: game.home.name || '',
          away_abbrev_themed: awayAbbrev,
          home_abbrev_themed: homeAbbrev,
          matchup_themed: `${awayAbbrev} - ${homeAbbrev}`,
          away_score: String(Math.round(game.away.score ?? 0)),
          home_score: String(Math.round(game.home.score ?? 0)),
          inning_display: game.inningHalf && game.inningOrdinal ? `${game.inningHalf} ${game.inningOrdinal}` : '',
          inning_half: game.inningHalf || '',
          inning_ordinal: game.inningOrdinal || '',
          outs: `${outsNum} ${outsNum === 1 ? 'out' : 'outs'}`,
          game_state: game.state || '',
          detailed_state: game.detailedState || '',
          state_line: game.inningOrdinal ? `${half} ${game.inningOrdinal} \u00b7 ${outsNum} OUT` : game.detailedState || '',
          on_first: game.onFirst ? '\u25c9' : '\u25cb',
          on_second: game.onSecond ? '\u25c9' : '\u25cb',
          on_third: game.onThird ? '\u25c9' : '\u25cb',
          pitcher_name: game.pitcher?.name || '',
          batter_name: game.batter?.name || '',
          probable_away: game.probableAway?.name || '',
          probable_home: game.probableHome?.name || '',
        }

        const awayColor = MLB_TEAM_COLORS[awayAbbrev] || '#ffffff'
        const homeColor = MLB_TEAM_COLORS[homeAbbrev] || '#ffffff'
        const themedColors: Record<string, string> = {
          away_abbrev_themed: awayColor,
          home_abbrev_themed: homeColor,
          matchup_themed: awayColor,
        }

        for (const el of sectionElements) {
          if (!el.sectionBinding) continue
          const { metric } = el.sectionBinding
          const val = stats[metric] ?? ''
          applyStatToElement(el.id, el.type, metric, val, '', '')
          if (themedColors[metric]) {
            updateElementProps(el.id, { color: themedColors[metric] })
          }
        }
        setSectionFetchLoading(null)
        return
      }

      // ── Player / standard branch ──
      if (!section.playerId) { setSectionFetchLoading(null); return }

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

      for (const el of sectionElements) {
        if (!el.sectionBinding) continue
        const { metric, format } = el.sectionBinding
        if (metric === '__player__') {
          updateElementProps(el.id, { playerId: section.playerId, playerName: section.playerName || '' })
        } else {
          const val = stats[metric]
          const sublabel = `${section.playerName || ''} ${section.gameYear}`.trim()
          applyStatToElement(el.id, el.type, metric, val, section.playerName || '', sublabel)
        }
      }
    } catch (err) {
      console.error('Section fetch error:', err)
    } finally {
      setSectionFetchLoading(null)
    }
  }, [inputSections, scene.elements, updateElementProps])

  // Live game auto-refresh
  const liveGameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (liveGameIntervalRef.current) {
      clearInterval(liveGameIntervalRef.current)
      liveGameIntervalRef.current = null
    }
    const liveGameSections = inputSections.filter(
      s => s.globalInputType === 'live-game' && s.gamePk
    )
    if (liveGameSections.length === 0) return
    liveGameIntervalRef.current = setInterval(() => {
      for (const section of liveGameSections) {
        fetchInputSection(section.id)
      }
    }, 30_000)
    return () => {
      if (liveGameIntervalRef.current) {
        clearInterval(liveGameIntervalRef.current)
        liveGameIntervalRef.current = null
      }
    }
  }, [inputSections, fetchInputSection])

  const highlightSectionElements = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setSelectedIds(new Set(ids))
    setSelectedId(ids[0])
  }, [])

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
    setCustomTemplateId(null)
    setCustomTemplateRecord(null)
    setInputSections([])
  }

  async function handleUpdateTemplate() {
    setShowSaveMenu(false)
    // Save scene locally
    handleSave()
    setShowUpdateConfirm(false)
  }

  // ── Data-Driven Templates ────────────────────────────────────────────────

  const activeDataTemplate = scene.templateConfig
    ? DATA_DRIVEN_TEMPLATES.find(t => t.id === scene.templateConfig!.templateId)
    : null

  async function fetchAndRebuildTemplate(config: TemplateConfig) {
    // ── Custom templates ─────────────────────────────────────────────────
    if (config.templateId.startsWith('custom:') && customTemplateRecord) {
      setTemplateLoading(true)
      try {
        const rebuild = createCustomRebuild(customTemplateRecord)
        const schemaType = customTemplateRecord.schemaType

        if (schemaType === 'outing' || schemaType === 'starter-card') {
          if (!config.playerId || !config.gamePk) {
            const rebuilt = rebuild(config, null)
            setScene({ ...rebuilt, templateConfig: config })
            setSelectedId(null)
            setSelectedIds(new Set())
            return
          }
          const endpoint = schemaType === 'starter-card' ? '/api/starter-card' : '/api/pitcher-outing'
          const res = await fetch(`${endpoint}?pitcherId=${config.playerId}&gamePk=${config.gamePk}`)
          const json = await res.json()
          const data = schemaType === 'starter-card' ? json.data : json.outing
          const rebuilt = rebuild(config, data || null)
          setScene({ ...rebuilt, templateConfig: config })
          setSelectedId(null)
          setSelectedIds(new Set())
          return
        }

        if (schemaType === 'percentile') {
          if (!config.playerId) {
            const rebuilt = rebuild(config, [])
            setScene({ ...rebuilt, templateConfig: config })
            setSelectedId(null)
            setSelectedIds(new Set())
            return
          }
          const year = config.dateRange.type === 'season' ? config.dateRange.year : 2025
          const res = await fetch(`/api/scene-stats?percentile=true&playerId=${config.playerId}&playerType=${config.playerType}&gameYear=${year}`)
          const json = await res.json()
          const rebuilt = rebuild(config, json.percentiles || [])
          setScene({ ...rebuilt, templateConfig: config })
          setSelectedId(null)
          setSelectedIds(new Set())
          return
        }

        // Default: leaderboard / generic fetch
        const params = new URLSearchParams({
          leaderboard: 'true',
          metric: config.primaryStat,
          playerType: config.playerType,
          limit: String(config.count || 5),
          sortDir: config.sortDir || 'desc',
          minSample: String(config.minSample ?? (config.playerType === 'batter' ? 150 : 300)),
        })
        if (config.dateRange.type === 'season') {
          params.set('gameYear', String(config.dateRange.year))
        } else {
          params.set('dateFrom', config.dateRange.from)
          params.set('dateTo', config.dateRange.to)
        }
        if (config.pitchType) params.set('pitchType', config.pitchType)
        if (config.secondaryStat) params.set('secondaryMetric', config.secondaryStat)
        if (config.tertiaryStat) params.set('tertiaryMetric', config.tertiaryStat)

        const res = await fetch(`/api/scene-stats?${params}`)
        const data = await res.json()
        const rows: TemplateDataRow[] = data.leaderboard || []
        const rebuilt = rebuild(config, rows)
        setScene({ ...rebuilt, templateConfig: config })
        setSelectedId(null)
        setSelectedIds(new Set())
        return
      } catch (err) {
        console.error('Custom template fetch error:', err)
      } finally {
        setTemplateLoading(false)
      }
      return
    }

    const template = DATA_DRIVEN_TEMPLATES.find(t => t.id === config.templateId)
    if (!template) return

    setTemplateLoading(true)
    try {
      // ── Pitcher Outing Report ──────────────────────────────────────────
      if (config.templateId === 'pitcher-outing-report') {
        if (!config.playerId || !config.gamePk) {
          const rebuilt = template.rebuild(config, null)
          setScene(rebuilt)
          setSelectedId(null)
          setSelectedIds(new Set())
          return
        }
        const res = await fetch(`/api/pitcher-outing?pitcherId=${config.playerId}&gamePk=${config.gamePk}`)
        const json = await res.json()
        const rebuilt = template.rebuild(config, json.outing || null)
        setScene(rebuilt)
        setSelectedId(null)
        setSelectedIds(new Set())
        return
      }

      // ── Starter Card ──────────────────────────────────────────────────
      if (config.templateId === 'starter-card') {
        if (!config.playerId || !config.gamePk) {
          const rebuilt = template.rebuild(config, null)
          setScene(rebuilt)
          setSelectedId(null)
          setSelectedIds(new Set())
          return
        }
        const res = await fetch(`/api/starter-card?pitcherId=${config.playerId}&gamePk=${config.gamePk}`)
        const json = await res.json()
        const rebuilt = template.rebuild(config, json.data || null)
        setScene(rebuilt)
        setSelectedId(null)
        setSelectedIds(new Set())
        return
      }

      // ── Percentile Rankings ──────────────────────────────────────────
      if (config.templateId === 'percentile-rankings') {
        if (!config.playerId) {
          const rebuilt = template.rebuild(config, [])
          setScene(rebuilt)
          setSelectedId(null)
          setSelectedIds(new Set())
          return
        }
        const year = config.dateRange.type === 'season' ? config.dateRange.year : 2025
        const res = await fetch(`/api/scene-stats?percentile=true&playerId=${config.playerId}&playerType=${config.playerType}&gameYear=${year}`)
        const json = await res.json()
        const rebuilt = template.rebuild(config, json.percentiles || [])
        setScene(rebuilt)
        setSelectedId(null)
        setSelectedIds(new Set())
        return
      }

      // ── Default leaderboard logic ──────────────────────────────────────
      const params = new URLSearchParams({
        leaderboard: 'true',
        metric: config.primaryStat,
        playerType: config.playerType,
        limit: String(config.count || 5),
        sortDir: config.sortDir || 'desc',
        minSample: String(config.minSample ?? (config.playerType === 'batter' ? 150 : 300)),
      })
      if (config.dateRange.type === 'season') {
        params.set('gameYear', String(config.dateRange.year))
      } else {
        params.set('dateFrom', config.dateRange.from)
        params.set('dateTo', config.dateRange.to)
      }
      if (config.pitchType) params.set('pitchType', config.pitchType)
      if (config.secondaryStat) params.set('secondaryMetric', config.secondaryStat)
      if (config.tertiaryStat) params.set('tertiaryMetric', config.tertiaryStat)

      const res = await fetch(`/api/scene-stats?${params}`)
      const data = await res.json()
      const rows: TemplateDataRow[] = data.leaderboard || []

      const rebuilt = template.rebuild(config, rows)
      setScene(rebuilt)
      setSelectedId(null)
      setSelectedIds(new Set())
    } catch (err) {
      console.error('Template fetch error:', err)
    } finally {
      setTemplateLoading(false)
    }
  }

  function loadDataDrivenTemplate(template: DataDrivenTemplate) {
    const config: TemplateConfig = { templateId: template.id, ...template.defaultConfig }
    // Build initial scene with empty data, then auto-fetch
    const initial = template.rebuild(config, [])
    setScene(initial)
    setSelectedId(null)
    setSelectedIds(new Set())
    setCurrentFrame(0)
    setPlaying(false)
    setInputSections([])
    // Auto-fetch data
    fetchAndRebuildTemplate(config)
  }

  function loadCustomTemplate(template: CustomTemplateRecord) {
    const rebuild = createCustomRebuild(template)
    const config: TemplateConfig = {
      templateId: `custom:${template.id}`,
      playerType: 'pitcher',
      primaryStat: 'avg_velo',
      dateRange: { type: 'season', year: 2025 },
    }
    const initial = rebuild(config, [])
    setScene({ ...initial, templateConfig: config })
    setSelectedId(null)
    setSelectedIds(new Set())
    setCurrentFrame(0)
    setPlaying(false)
    setCustomTemplateId(template.id)
    setCustomTemplateRecord(template)
    setInputSections(template.inputSections || [])
  }

  function updateTemplateConfig(updates: Partial<TemplateConfig>) {
    if (!scene.templateConfig) return
    const newConfig = { ...scene.templateConfig, ...updates }
    setScene(prev => ({ ...prev, templateConfig: newConfig }))
    fetchAndRebuildTemplate(newConfig)
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
        return
      }

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
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          // Delete all selected elements
          if (selectedIds.size > 1) {
            for (const id of selectedIds) deleteElement(id)
            setSelectedId(null)
            setSelectedIds(new Set())
          } else {
            deleteElement(selectedId)
          }
          return
        }
        if (e.key === 'Escape') {
          setSelectedId(null)
          setSelectedIds(new Set())
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
        // Select all
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
          e.preventDefault()
          const allIds = scene.elements.map(el => el.id)
          if (allIds.length > 0) {
            setSelectedIds(new Set(allIds))
            setSelectedId(allIds[0])
          }
          return
        }

        const step = e.shiftKey ? 10 : 1
        const isArrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
        if (isArrow) {
          e.preventDefault()
          // Move all selected elements
          const idsToMove = selectedIds.size > 1 ? selectedIds : new Set([selectedId])
          for (const id of idsToMove) {
            const el = scene.elements.find(el => el.id === id)
            if (!el || el.locked) continue
            if (e.key === 'ArrowLeft') updateElement(id, { x: el.x - step })
            if (e.key === 'ArrowRight') updateElement(id, { x: el.x + step })
            if (e.key === 'ArrowUp') updateElement(id, { y: el.y - step })
            if (e.key === 'ArrowDown') updateElement(id, { y: el.y + step })
          }
        }
      } else {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault()
          handleSave()
        }
        // Select all even when nothing selected
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
          e.preventDefault()
          const allIds = scene.elements.map(el => el.id)
          if (allIds.length > 0) {
            setSelectedIds(new Set(allIds))
            setSelectedId(allIds[0])
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, selectedIds, scene.elements, deleteElement, duplicateElement, updateElement, showTimeline, currentFrame, addKeyframe, undo, redo])

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

  async function handleExportMP4() {
    setExporting(true)
    setShowExportMenu(false)
    try {
      await exportMP4(scene, pct => setExportProgress(pct))
    } catch (err) {
      console.error('Export MP4 error:', err)
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
    setScene(prev => ({ ...prev, elements: [], templateConfig: undefined, templateData: undefined }))
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
          {scene.background === 'transparent' ? (
            <button
              onClick={() => setScene(prev => ({ ...prev, background: '#09090b' }))}
              className="w-6 h-6 rounded border border-zinc-700 text-[8px] text-zinc-500 hover:text-zinc-300 transition"
              style={{ background: 'repeating-conic-gradient(#27272a 0% 25%, #18181b 0% 50%) 50% / 8px 8px' }}
              title="Transparent — click to set solid"
            />
          ) : (
            <input
              type="color"
              value={scene.background}
              onChange={e => setScene(prev => ({ ...prev, background: e.target.value }))}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border border-zinc-700"
            />
          )}
          <button
            onClick={() => setScene(prev => ({ ...prev, background: prev.background === 'transparent' ? '#09090b' : 'transparent' }))}
            className={`px-1.5 py-0.5 rounded text-[9px] border transition ${
              scene.background === 'transparent'
                ? 'bg-cyan-600/20 border-cyan-600/40 text-cyan-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
            title="Toggle transparent background"
          >
            {scene.background === 'transparent' ? 'Clear' : 'Clear'}
          </button>
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="px-1.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-xs transition disabled:opacity-30 disabled:cursor-default"
            title="Undo (\u2318Z)"
          >
            {'\u21a9'}
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="px-1.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-xs transition disabled:opacity-30 disabled:cursor-default"
            title="Redo (\u2318\u21e7Z)"
          >
            {'\u21aa'}
          </button>
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

        {/* Save dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSaveMenu(p => !p)}
            className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-600 transition"
          >
            Save {'\u25BE'}
          </button>
          {showSaveMenu && (
            <div className="absolute right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 py-1 w-44">
              <button onClick={() => { setShowSaveMenu(false); handleSave() }} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700 transition">
                Save Scene
              </button>
              <button onClick={() => { setShowSaveMenu(false); handleSaveAs() }} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700 transition">
                Save As...
              </button>
              {(scene.templateConfig || customTemplateId) && (
                <>
                  <div className="border-t border-zinc-700 my-1" />
                  <button onClick={() => { setShowSaveMenu(false); setShowUpdateConfirm(true) }} className="w-full text-left px-3 py-1.5 text-[11px] text-emerald-400 hover:bg-zinc-700 transition">
                    Update Template
                  </button>
                </>
              )}
            </div>
          )}
        </div>
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

        {/* Export to Broadcast */}
        <button
          onClick={async () => {
            setShowBroadcastExport(true)
            try {
              const res = await fetch('/api/broadcast/projects')
              const data = await res.json()
              setBroadcastProjects(data.projects || [])
            } catch {}
          }}
          className="px-3 py-1 rounded bg-red-500/15 border border-red-500/40 text-[11px] font-medium text-red-400 hover:bg-red-500/25 transition"
        >
          Broadcast
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
              <button onClick={handleExportMP4} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700 transition">
                MP4 Video (H.264)
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
          <ElementLibrary onAdd={addElement} onAddElement={addDirectElement} onLoadScene={loadTemplateScene} onLoadDataDriven={loadDataDrivenTemplate} onLoadCustomTemplate={loadCustomTemplate} />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <SceneCanvas
            scene={displayScene}
            selectedId={selectedId}
            selectedIds={selectedIds}
            highlightedIds={highlightedIds}
            zoom={zoom}
            onSelect={handleSelect}
            onSelectMany={handleSelectMany}
            onUpdateElement={updateElement}
            canvasRef={canvasRef}
          />
        </div>

        {/* Right: Properties or Template Config or Input Sections */}
        {selectedElement && selectedIds.size <= 1 ? (
          <div className="w-64 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0">
            <PropertiesPanel
              element={selectedElement}
              onUpdate={updates => updateElement(selectedElement.id, updates)}
              onUpdateProps={propUpdates => updateElementProps(selectedElement.id, propUpdates)}
              onUpdateBinding={binding => updateBinding(selectedElement.id, binding)}
              onFetchBinding={() => fetchBinding(selectedElement.id)}
              onDelete={() => deleteElement(selectedElement.id)}
              onDuplicate={() => duplicateElement(selectedElement.id)}
              onUpdateKeyframes={kfs => updateElementKeyframes(selectedElement.id, kfs)}
              bindingLoading={bindingLoading}
              fps={scene.fps || 30}
              dynamicSlots={scene.dynamicSlots}
              onAddDynamicSlot={addDynamicSlot}
              inputSections={inputSections}
              onUpdateSectionBinding={binding => updateSectionBinding(selectedElement.id, binding)}
            />
          </div>
        ) : inputSections.length > 0 || selectedIds.size > 1 ? (
          <div className="w-64 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0 p-3">
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
              onHoverElement={(id) => setHighlightedIds(id ? new Set([id]) : new Set())}
              fetchLoading={sectionFetchLoading}
            />
          </div>
        ) : (scene.dynamicSlots?.length ?? 0) > 0 ? (
          <div className="w-64 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0">
            <DynamicSlotsPanel
              slots={scene.dynamicSlots!}
              onUpdateSlot={updateDynamicSlot}
              onAddSlot={addDynamicSlot}
              onRemoveSlot={removeDynamicSlot}
              onFetchAll={fetchAllDynamic}
              fetchLoading={dynamicFetchLoading}
            />
          </div>
        ) : scene.templateConfig ? (
          <div className="w-64 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto shrink-0">
            {(scene.templateConfig.templateId === 'pitcher-outing-report' || scene.templateConfig.templateId === 'starter-card') ? (
              <OutingConfigPanel
                config={scene.templateConfig}
                onUpdateConfig={updateTemplateConfig}
                onRefresh={() => fetchAndRebuildTemplate(scene.templateConfig!)}
                loading={templateLoading}
              />
            ) : scene.templateConfig.templateId === 'percentile-rankings' ? (
              <PercentileConfigPanel
                config={scene.templateConfig}
                onUpdateConfig={updateTemplateConfig}
                onRefresh={() => fetchAndRebuildTemplate(scene.templateConfig!)}
                loading={templateLoading}
              />
            ) : (
              <TemplateConfigPanel
                config={scene.templateConfig}
                onUpdateConfig={updateTemplateConfig}
                onRefresh={() => fetchAndRebuildTemplate(scene.templateConfig!)}
                loading={templateLoading}
              />
            )}
          </div>
        ) : null}
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

      {/* Click-away for save menu */}
      {showSaveMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSaveMenu(false)} />
      )}

      {/* Update Template confirmation modal */}
      {showUpdateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-2">Update Template</h3>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Overwrite template &ldquo;{activeDataTemplate?.name || scene.templateConfig?.templateId}&rdquo; with the current layout?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowUpdateConfirm(false)}
                className="px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateTemplate}
                className="px-3 py-1.5 rounded bg-cyan-600/20 border border-cyan-600/50 text-[11px] font-medium text-cyan-300 hover:bg-cyan-600/30 transition"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Export to Broadcast modal */}
      {showBroadcastExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowBroadcastExport(false)}>
          <div className="w-[420px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Export to Broadcast</h3>
            <p className="text-[11px] text-zinc-500 mb-4">Send this scene as a triggerable overlay asset</p>
            {broadcastProjects.length === 0 ? (
              <div className="text-center py-6 text-zinc-500 text-xs">
                No broadcast projects found. Create one in the Broadcast tool first.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {broadcastProjects.map(proj => (
                  <button
                    key={proj.id}
                    disabled={broadcastExporting}
                    onClick={async () => {
                      setBroadcastExporting(true)
                      try {
                        await fetch('/api/broadcast/assets', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            project_id: proj.id,
                            name: scene.name,
                            asset_type: 'scene',
                            scene_config: {
                              width: scene.width,
                              height: scene.height,
                              background: scene.background,
                              elements: scene.elements,
                            },
                            canvas_width: scene.width,
                            canvas_height: scene.height,
                          }),
                        })
                        setShowBroadcastExport(false)
                      } catch (err) {
                        console.error('Failed to export:', err)
                      }
                      setBroadcastExporting(false)
                    }}
                    className="w-full text-left px-4 py-3 bg-zinc-800 border border-zinc-700 hover:border-red-500/40 rounded-lg transition disabled:opacity-50"
                  >
                    <div className="text-xs font-medium text-white">{proj.name}</div>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowBroadcastExport(false)} className="mt-4 w-full px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
