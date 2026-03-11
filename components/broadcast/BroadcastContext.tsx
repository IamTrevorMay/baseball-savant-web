'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react'
import { BroadcastProject, BroadcastAsset, BroadcastSession, BroadcastProjectSettings, BroadcastScene, BroadcastSceneAsset, TemplateDataValues } from '@/lib/broadcastTypes'
import { createClient } from '@supabase/supabase-js'

interface BroadcastContextValue {
  project: BroadcastProject | null
  assets: BroadcastAsset[]
  session: BroadcastSession | null
  visibleAssetIds: Set<string>
  selectedAssetId: string | null
  previewingAssetId: string | null
  loading: boolean
  slideshowSlideIndexes: Map<string, number>

  // Scene state
  scenes: BroadcastScene[]
  sceneAssets: Map<string, BroadcastSceneAsset[]>
  activeSceneId: string | null
  switchingScene: boolean

  setProject: (p: BroadcastProject) => void
  setAssets: (a: BroadcastAsset[]) => void
  setSelectedAssetId: (id: string | null) => void
  addAsset: (a: BroadcastAsset) => void
  updateAsset: (id: string, updates: Partial<BroadcastAsset>) => void
  removeAsset: (id: string) => void
  toggleAssetVisibility: (id: string) => void
  previewAsset: (id: string) => void
  goLive: () => Promise<string | null>
  endSession: () => Promise<void>
  sendEvent: (event: string, payload: any) => void
  slideshowGoto: (assetId: string, index: number) => void
  slideshowNext: (assetId: string) => void
  slideshowPrev: (assetId: string) => void
  getSlideshowIndex: (assetId: string) => number
  updateProjectSettings: (updates: Partial<BroadcastProjectSettings>) => void

  // Scene methods
  setScenes: (s: BroadcastScene[]) => void
  addScene: (s: BroadcastScene) => void
  updateScene: (id: string, updates: Partial<BroadcastScene>) => void
  removeScene: (id: string) => void
  switchScene: (toSceneId: string) => void
  addSceneAsset: (sa: BroadcastSceneAsset) => void
  updateSceneAsset: (id: string, updates: Partial<BroadcastSceneAsset>) => void
  removeSceneAsset: (id: string) => void
  reloadSceneAssets: () => Promise<void>
}

const BroadcastCtx = createContext<BroadcastContextValue | null>(null)

export function useBroadcast() {
  const ctx = useContext(BroadcastCtx)
  if (!ctx) throw new Error('useBroadcast must be used within BroadcastProvider')
  return ctx
}

export function BroadcastProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [project, setProject] = useState<BroadcastProject | null>(null)
  const [assets, setAssets] = useState<BroadcastAsset[]>([])
  const [session, setSession] = useState<BroadcastSession | null>(null)
  const [visibleAssetIds, setVisibleAssetIds] = useState<Set<string>>(new Set())
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [previewingAssetId, setPreviewingAssetId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [slideshowSlideIndexes, setSlideshowSlideIndexes] = useState<Map<string, number>>(new Map())
  const channelRef = useRef<any>(null)
  const supabaseRef = useRef<any>(null)

  // Scene state
  const [scenes, setScenes] = useState<BroadcastScene[]>([])
  const [sceneAssets, setSceneAssets] = useState<Map<string, BroadcastSceneAsset[]>>(new Map())
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [switchingScene, setSwitchingScene] = useState(false)

  // Initialize supabase client for Realtime
  useEffect(() => {
    supabaseRef.current = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }, [])

  // Fetch project, assets, and scenes
  useEffect(() => {
    async function load() {
      try {
        const [projRes, assetsRes, scenesRes, sceneAssetsRes] = await Promise.all([
          fetch(`/api/broadcast/projects/${projectId}`),
          fetch(`/api/broadcast/assets?project_id=${projectId}`),
          fetch(`/api/broadcast/scenes?project_id=${projectId}`),
          fetch(`/api/broadcast/scene-assets?project_id=${projectId}`),
        ])
        const projData = await projRes.json()
        const assetsData = await assetsRes.json()
        const scenesData = await scenesRes.json()
        const sceneAssetsData = await sceneAssetsRes.json()

        if (projData.project) setProject(projData.project)
        if (assetsData.assets) setAssets(assetsData.assets)
        if (scenesData.scenes) setScenes(scenesData.scenes)

        if (sceneAssetsData.sceneAssets) {
          const map = new Map<string, BroadcastSceneAsset[]>()
          for (const sa of sceneAssetsData.sceneAssets) {
            const list = map.get(sa.scene_id) || []
            list.push(sa)
            map.set(sa.scene_id, list)
          }
          setSceneAssets(map)
        }
      } catch (err) {
        console.error('Failed to load broadcast project:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  const reloadSceneAssets = useCallback(async () => {
    try {
      const res = await fetch(`/api/broadcast/scene-assets?project_id=${projectId}`)
      const data = await res.json()
      if (data.sceneAssets) {
        const map = new Map<string, BroadcastSceneAsset[]>()
        for (const sa of data.sceneAssets) {
          const list = map.get(sa.scene_id) || []
          list.push(sa)
          map.set(sa.scene_id, list)
        }
        setSceneAssets(map)
      }
    } catch (err) {
      console.error('Failed to reload scene assets:', err)
    }
  }, [projectId])

  const addAsset = useCallback((asset: BroadcastAsset) => {
    setAssets(prev => [...prev, asset])
  }, [])

  const updateAsset = useCallback((id: string, updates: Partial<BroadcastAsset>) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }, [])

  const removeAsset = useCallback((id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id))
    setSelectedAssetId(prev => prev === id ? null : prev)
  }, [])

  const sendEvent = useCallback((event: string, payload: any) => {
    if (!channelRef.current) return
    channelRef.current.send({
      type: 'broadcast',
      event,
      payload: { ...payload, source: 'manager', timestamp: Date.now() },
    })
  }, [])

  const flashTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const persistActiveState = useCallback((visibleIds: Set<string>, sceneId: string | null) => {
    if (!session) return
    fetch(`/api/broadcast/sessions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: session.id,
        active_state: { visibleAssets: Array.from(visibleIds), activeSceneId: sceneId },
      }),
    }).catch(console.error)
  }, [session])

  const showAsset = useCallback((assetId: string) => {
    setVisibleAssetIds(prev => {
      const next = new Set(prev)
      next.add(assetId)
      sendEvent('asset:show', { assetId })
      persistActiveState(next, activeSceneId)
      return next
    })
  }, [sendEvent, persistActiveState, activeSceneId])

  const hideAsset = useCallback((assetId: string) => {
    setVisibleAssetIds(prev => {
      const next = new Set(prev)
      next.delete(assetId)
      sendEvent('asset:hide', { assetId })
      persistActiveState(next, activeSceneId)
      return next
    })
  }, [sendEvent, persistActiveState, activeSceneId])

  const toggleAssetVisibility = useCallback((assetId: string) => {
    const asset = assets.find(a => a.id === assetId)
    const mode = asset?.trigger_mode || 'toggle'
    const isVisible = visibleAssetIds.has(assetId)

    switch (mode) {
      case 'show':
        if (!isVisible) showAsset(assetId)
        break
      case 'hide':
        if (isVisible) hideAsset(assetId)
        break
      case 'flash': {
        const existing = flashTimersRef.current.get(assetId)
        if (existing) clearTimeout(existing)
        showAsset(assetId)
        const duration = (asset?.trigger_duration || 3) * 1000
        const timer = setTimeout(() => {
          hideAsset(assetId)
          flashTimersRef.current.delete(assetId)
        }, duration)
        flashTimersRef.current.set(assetId, timer)
        break
      }
      default: // toggle
        if (isVisible) hideAsset(assetId)
        else showAsset(assetId)
    }
  }, [assets, visibleAssetIds, showAsset, hideAsset])

  const previewAsset = useCallback((id: string) => {
    if (previewingAssetId) return
    setPreviewingAssetId(id)
    const asset = assets.find(a => a.id === id)
    const enterFrames = asset?.enter_transition?.durationFrames || 15
    const exitFrames = asset?.exit_transition?.durationFrames || 15
    const fps = project?.settings?.fps || 30
    const enterMs = (enterFrames / fps) * 1000
    const exitMs = (exitFrames / fps) * 1000
    const holdMs = 1000

    setTimeout(() => {
      setPreviewingAssetId(`${id}:exit`)
      setTimeout(() => {
        setPreviewingAssetId(null)
      }, exitMs + 100)
    }, enterMs + holdMs)
  }, [previewingAssetId, assets, project])

  // Scene CRUD
  const addScene = useCallback((scene: BroadcastScene) => {
    setScenes(prev => [...prev, scene])
  }, [])

  const updateScene = useCallback((id: string, updates: Partial<BroadcastScene>) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }, [])

  const removeScene = useCallback((id: string) => {
    setScenes(prev => prev.filter(s => s.id !== id))
    setSceneAssets(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    if (activeSceneId === id) setActiveSceneId(null)
  }, [activeSceneId])

  // Scene-asset CRUD
  const addSceneAsset = useCallback((sa: BroadcastSceneAsset) => {
    setSceneAssets(prev => {
      const next = new Map(prev)
      const list = [...(next.get(sa.scene_id) || []), sa]
      next.set(sa.scene_id, list)
      return next
    })
  }, [])

  const updateSceneAsset = useCallback((id: string, updates: Partial<BroadcastSceneAsset>) => {
    setSceneAssets(prev => {
      const next = new Map<string, BroadcastSceneAsset[]>()
      for (const [sceneId, list] of prev) {
        next.set(sceneId, list.map(sa => sa.id === id ? { ...sa, ...updates } : sa))
      }
      return next
    })
  }, [])

  const removeSceneAsset = useCallback((id: string) => {
    setSceneAssets(prev => {
      const next = new Map<string, BroadcastSceneAsset[]>()
      for (const [sceneId, list] of prev) {
        next.set(sceneId, list.filter(sa => sa.id !== id))
      }
      return next
    })
  }, [])

  // Switch scene — the core logic
  const switchScene = useCallback((toSceneId: string) => {
    if (switchingScene || !session) return
    if (toSceneId === activeSceneId) return

    const targetScene = scenes.find(s => s.id === toSceneId)
    if (!targetScene) return

    setSwitchingScene(true)

    // Compute which assets to hide (old scene) and show (new scene)
    const oldSceneAssetList = activeSceneId ? sceneAssets.get(activeSceneId) || [] : []
    const newSceneAssetList = sceneAssets.get(toSceneId) || []

    const assetsToHide = oldSceneAssetList
      .filter(sa => sa.is_visible)
      .map(sa => sa.asset_id)
    const assetsToShow = newSceneAssetList
      .filter(sa => sa.is_visible)
      .map(sa => sa.asset_id)

    // Build overrides map
    const overrides: Record<string, any> = {}
    for (const sa of newSceneAssetList) {
      if (sa.override_x != null || sa.override_y != null || sa.override_width != null ||
          sa.override_height != null || sa.override_layer != null || sa.override_opacity != null) {
        overrides[sa.asset_id] = {
          ...(sa.override_x != null && { x: sa.override_x }),
          ...(sa.override_y != null && { y: sa.override_y }),
          ...(sa.override_width != null && { width: sa.override_width }),
          ...(sa.override_height != null && { height: sa.override_height }),
          ...(sa.override_layer != null && { layer: sa.override_layer }),
          ...(sa.override_opacity != null && { opacity: sa.override_opacity }),
        }
      }
    }

    const stingerUrl = targetScene.stinger_enabled
      ? (targetScene.stinger_video_url || targetScene.stinger_storage_path)
      : null

    // Send scene:switch event
    sendEvent('scene:switch', {
      sceneId: toSceneId,
      assetsToHide,
      assetsToShow,
      overrides,
      stingerUrl: stingerUrl || undefined,
      stingerCutPoint: stingerUrl ? targetScene.stinger_cut_point : undefined,
    })

    // Perform the local swap
    const performSwap = () => {
      setVisibleAssetIds(prev => {
        const next = new Set(prev)
        for (const id of assetsToHide) next.delete(id)
        for (const id of assetsToShow) next.add(id)
        return next
      })
      setActiveSceneId(toSceneId)
      setSwitchingScene(false)

      // Persist
      const newVisible = new Set<string>()
      for (const id of assetsToShow) newVisible.add(id)
      // Keep non-scene assets that were already visible
      setVisibleAssetIds(prev => {
        const merged = new Set(prev)
        for (const id of assetsToHide) merged.delete(id)
        for (const id of assetsToShow) merged.add(id)
        persistActiveState(merged, toSceneId)
        return merged
      })
    }

    if (stingerUrl) {
      // Wait for cut point duration before performing swap
      const cutDelay = (targetScene.stinger_cut_point || 0.5) * 2000 // Assume ~2s stinger
      setTimeout(performSwap, cutDelay)
    } else {
      // Immediate swap
      performSwap()
    }
  }, [switchingScene, session, activeSceneId, scenes, sceneAssets, sendEvent, persistActiveState])

  // Keyboard hotkey listener — assets + scenes
  useEffect(() => {
    if (!session) return
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const key = e.key.toLowerCase()

      // Check scene hotkeys first
      const scene = scenes.find(s => s.hotkey_key === key)
      if (scene) {
        e.preventDefault()
        switchScene(scene.id)
        return
      }

      // Then asset hotkeys
      const asset = assets.find(a => a.hotkey_key === key)
      if (asset) {
        e.preventDefault()
        toggleAssetVisibility(asset.id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [session, assets, scenes, toggleAssetVisibility, switchScene])

  const getSlideshowIndex = useCallback((assetId: string): number => {
    return slideshowSlideIndexes.get(assetId) || 0
  }, [slideshowSlideIndexes])

  const slideshowGoto = useCallback((assetId: string, index: number) => {
    setSlideshowSlideIndexes(prev => new Map(prev).set(assetId, index))
    sendEvent('slideshow:goto', { assetId, slideIndex: index })
  }, [sendEvent])

  const slideshowNext = useCallback((assetId: string) => {
    const asset = assets.find(a => a.id === assetId)
    const slideCount = asset?.slideshow_config?.slides?.length || 0
    if (slideCount === 0) return
    const current = slideshowSlideIndexes.get(assetId) || 0
    const next = (current + 1) % slideCount
    slideshowGoto(assetId, next)
  }, [assets, slideshowSlideIndexes, slideshowGoto])

  const slideshowPrev = useCallback((assetId: string) => {
    const asset = assets.find(a => a.id === assetId)
    const slideCount = asset?.slideshow_config?.slides?.length || 0
    if (slideCount === 0) return
    const current = slideshowSlideIndexes.get(assetId) || 0
    const prev = (current - 1 + slideCount) % slideCount
    slideshowGoto(assetId, prev)
  }, [assets, slideshowSlideIndexes, slideshowGoto])

  const updateProjectSettings = useCallback((updates: Partial<BroadcastProjectSettings>) => {
    if (!project) return
    const newSettings = { ...project.settings, ...updates }
    setProject({ ...project, settings: newSettings })
    fetch(`/api/broadcast/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: newSettings }),
    }).catch(console.error)
  }, [project])

  const goLive = useCallback(async () => {
    if (!project) return null
    try {
      const channelName = `broadcast:${crypto.randomUUID()}`
      const res = await fetch('/api/broadcast/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          channel_name: channelName,
        }),
      })
      const data = await res.json()
      if (data.session) {
        setSession(data.session)

        // Subscribe to channel and listen for overlay events
        const sessionId = data.session.id
        const channel = supabaseRef.current.channel(channelName)
        channel
          .on('broadcast', { event: 'ad:ended' }, (payload: any) => {
            const assetId = payload.payload?.assetId
            if (assetId) {
              setVisibleAssetIds(prev => {
                const next = new Set(prev)
                next.delete(assetId)
                fetch('/api/broadcast/sessions', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: sessionId, active_state: { visibleAssets: Array.from(next) } }),
                }).catch(console.error)
                return next
              })
            }
          })
          .on('broadcast', { event: 'asset:show' }, (payload: any) => {
            if (payload.payload?.source === 'trigger-api') {
              const assetId = payload.payload.assetId
              if (assetId) setVisibleAssetIds(prev => new Set(prev).add(assetId))
            }
          })
          .on('broadcast', { event: 'asset:hide' }, (payload: any) => {
            if (payload.payload?.source === 'trigger-api') {
              const assetId = payload.payload.assetId
              if (assetId) {
                setVisibleAssetIds(prev => {
                  const next = new Set(prev)
                  next.delete(assetId)
                  return next
                })
              }
            }
          })
          .on('broadcast', { event: 'slideshow:goto' }, (payload: any) => {
            if (payload.payload?.source === 'trigger-api') {
              const { assetId, slideIndex } = payload.payload
              if (assetId !== undefined && slideIndex !== undefined) {
                setSlideshowSlideIndexes(prev => new Map(prev).set(assetId, slideIndex))
              }
            }
          })
          .subscribe()
        channelRef.current = channel

        return sessionId
      }
      return null
    } catch (err) {
      console.error('Failed to go live:', err)
      return null
    }
  }, [project])

  const endSession = useCallback(async () => {
    if (!session) return
    try {
      await fetch('/api/broadcast/sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: session.id,
          is_live: false,
          ended_at: new Date().toISOString(),
        }),
      })
      if (channelRef.current) {
        supabaseRef.current.removeChannel(channelRef.current)
        channelRef.current = null
      }
      setSession(null)
      setVisibleAssetIds(new Set())
      setActiveSceneId(null)
    } catch (err) {
      console.error('Failed to end session:', err)
    }
  }, [session])

  return (
    <BroadcastCtx.Provider value={{
      project, assets, session, visibleAssetIds, selectedAssetId, previewingAssetId, loading,
      slideshowSlideIndexes,
      scenes, sceneAssets, activeSceneId, switchingScene,
      setProject, setAssets, setSelectedAssetId, addAsset, updateAsset, removeAsset,
      toggleAssetVisibility, previewAsset, goLive, endSession, sendEvent,
      slideshowGoto, slideshowNext, slideshowPrev, getSlideshowIndex,
      updateProjectSettings,
      setScenes, addScene, updateScene, removeScene, switchScene,
      addSceneAsset, updateSceneAsset, removeSceneAsset, reloadSceneAssets,
    }}>
      {children}
    </BroadcastCtx.Provider>
  )
}
