'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react'
import { BroadcastProject, BroadcastAsset, BroadcastSession, BroadcastProjectSettings, BroadcastSegment, BroadcastSegmentAsset, TemplateDataValues, TransitionConfig, OBSConnectionConfig } from '@/lib/broadcastTypes'
import { createClient } from '@supabase/supabase-js'
import { useOBSWebSocket, OBSState } from '@/lib/useOBSWebSocket'

export interface LiveStinger {
  assetId: string
  videoUrl: string
  enterTransition: TransitionConfig | null
}

export interface VideoTimeInfo {
  remaining: number
  duration: number
}

interface BroadcastContextValue {
  project: BroadcastProject | null
  assets: BroadcastAsset[]
  session: BroadcastSession | null
  visibleAssetIds: Set<string>
  animatingAssets: Map<string, 'entering' | 'exiting'>
  selectedAssetId: string | null
  previewingAssetId: string | null
  loading: boolean
  slideshowSlideIndexes: Map<string, number>

  // Live stinger + video time
  liveStinger: LiveStinger | null
  videoTimeRemaining: Map<string, VideoTimeInfo>

  // Segment state
  segments: BroadcastSegment[]
  segmentAssets: Map<string, BroadcastSegmentAsset[]>
  activeSegmentId: string | null
  switchingSegment: boolean
  selectedSegmentId: string | null

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
  handleStingerCutPoint: () => void
  handleStingerComplete: () => void
  handleAdEnded: (assetId: string) => void
  setVideoTimeInfo: (assetId: string, remaining: number, duration: number) => void
  clearVideoTimeInfo: (assetId: string) => void

  // OBS WebSocket
  obsState: OBSState
  obsConnect: (config: OBSConnectionConfig) => Promise<void>
  obsDisconnect: () => Promise<void>
  obsSetupScene: () => Promise<void>
  obsCleanup: () => Promise<number>
  isOBSConnected: boolean

  // Segment methods
  setSegments: (s: BroadcastSegment[]) => void
  setSelectedSegmentId: (id: string | null) => void
  addSegment: (s: BroadcastSegment) => void
  updateSegment: (id: string, updates: Partial<BroadcastSegment>) => void
  removeSegment: (id: string) => void
  switchSegment: (toSegmentId: string) => void
  addSegmentAsset: (sa: BroadcastSegmentAsset) => void
  updateSegmentAsset: (id: string, updates: Partial<BroadcastSegmentAsset>) => void
  removeSegmentAsset: (id: string) => void
  reloadSegmentAssets: () => Promise<void>
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
  const [animatingAssets, setAnimatingAssets] = useState<Map<string, 'entering' | 'exiting'>>(new Map())
  const [liveStinger, setLiveStinger] = useState<LiveStinger | null>(null)
  const [videoTimeRemaining, setVideoTimeRemaining] = useState<Map<string, VideoTimeInfo>>(new Map())
  const channelRef = useRef<any>(null)
  const supabaseRef = useRef<any>(null)

  // Segment state
  const [segments, setSegments] = useState<BroadcastSegment[]>([])
  const [segmentAssets, setSegmentAssets] = useState<Map<string, BroadcastSegmentAsset[]>>(new Map())
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [switchingSegment, setSwitchingSegment] = useState(false)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)

  // ── OBS WebSocket integration ──────────────────────────────────────────
  const obs = useOBSWebSocket({
    onMediaEnded: (sourceName: string) => {
      // Extract assetId from 'triton-media-{assetId}'
      const assetId = sourceName.replace('triton-media-', '')
      const asset = assets.find(a => a.id === assetId)
      if (asset?.asset_type === 'advertisement') {
        handleAdEndedRef.current(assetId)
      }
    },
    onDisconnected: () => {
      // Send obs:status to overlay so it resumes rendering videos
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'obs:status',
          payload: { connected: false, source: 'manager', timestamp: Date.now() },
        })
      }
    },
  })

  // Ref for handleAdEnded to avoid circular dependency
  const handleAdEndedRef = useRef<(assetId: string) => void>(() => {})

  // Helper: resolve local file path for OBS playback
  const resolveOBSFilePath = useCallback((asset: BroadcastAsset): string | null => {
    const dir = project?.settings?.obsMediaDir
    if (!dir) return null
    const filename = asset.ad_config?.source_filename
    if (!filename) return null
    return `${dir.replace(/\/$/, '')}/${filename}`
  }, [project])

  // OBS connect/disconnect wrappers
  const obsConnect = useCallback(async (config: OBSConnectionConfig) => {
    await obs.connect(config)
  }, [obs])

  const obsDisconnect = useCallback(async () => {
    await obs.disconnect()
  }, [obs])

  const obsSetupScene = useCallback(async () => {
    if (!session) return
    const overlayUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/overlay/${session.id}`
    await obs.setupTritonScene(overlayUrl)
  }, [obs, session])

  const obsCleanup = useCallback(async () => {
    return await obs.cleanupAllTritonSources()
  }, [obs])

  // Video time polling for OBS media sources
  useEffect(() => {
    if (!obs.isConnected || !session) return

    const interval = setInterval(async () => {
      const visibleVideoAds = assets.filter(
        a => visibleAssetIds.has(a.id) && (a.asset_type === 'video' || a.asset_type === 'advertisement')
      )
      for (const asset of visibleVideoAds) {
        const filePath = resolveOBSFilePath(asset)
        if (!filePath) continue
        const time = await obs.getMediaTime(`triton-media-${asset.id}`)
        if (time && time.duration > 0) {
          setVideoTimeRemaining(prev => {
            const next = new Map(prev)
            next.set(asset.id, { remaining: time.duration - time.currentTime, duration: time.duration })
            return next
          })
        }
      }
    }, 500)

    return () => clearInterval(interval)
  }, [obs.isConnected, session, assets, visibleAssetIds, resolveOBSFilePath, obs])

  // Initialize supabase client for Realtime
  useEffect(() => {
    supabaseRef.current = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }, [])

  // Fetch project, assets, and segments
  useEffect(() => {
    async function load() {
      try {
        const [projRes, assetsRes, segmentsRes, segmentAssetsRes] = await Promise.all([
          fetch(`/api/broadcast/projects/${projectId}`),
          fetch(`/api/broadcast/assets?project_id=${projectId}`),
          fetch(`/api/broadcast/scenes?project_id=${projectId}`),
          fetch(`/api/broadcast/scene-assets?project_id=${projectId}`),
        ])
        const projData = await projRes.json()
        const assetsData = await assetsRes.json()
        const segmentsData = await segmentsRes.json()
        const segmentAssetsData = await segmentAssetsRes.json()

        if (projData.project) setProject(projData.project)
        if (assetsData.assets) setAssets(assetsData.assets)
        if (segmentsData.scenes) setSegments(segmentsData.scenes)

        if (segmentAssetsData.sceneAssets) {
          const map = new Map<string, BroadcastSegmentAsset[]>()
          for (const sa of segmentAssetsData.sceneAssets) {
            const list = map.get(sa.scene_id) || []
            list.push(sa)
            map.set(sa.scene_id, list)
          }
          setSegmentAssets(map)
        }
      } catch (err) {
        console.error('Failed to load broadcast project:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  const reloadSegmentAssets = useCallback(async () => {
    try {
      const res = await fetch(`/api/broadcast/scene-assets?project_id=${projectId}`)
      const data = await res.json()
      if (data.sceneAssets) {
        const map = new Map<string, BroadcastSegmentAsset[]>()
        for (const sa of data.sceneAssets) {
          const list = map.get(sa.scene_id) || []
          list.push(sa)
          map.set(sa.scene_id, list)
        }
        setSegmentAssets(map)
      }
    } catch (err) {
      console.error('Failed to reload segment assets:', err)
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

  const persistActiveState = useCallback((visibleIds: Set<string>, segmentId: string | null) => {
    if (!session) return
    fetch(`/api/broadcast/sessions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: session.id,
        active_state: { visibleAssets: Array.from(visibleIds), activeSegmentId: segmentId },
      }),
    }).catch(console.error)
  }, [session])

  const showAsset = useCallback((assetId: string) => {
    const asset = assets.find(a => a.id === assetId)
    const stingerUrl = asset?.stinger_enabled ? asset.stinger_video_url : null
    const fps = project?.settings?.fps || 30

    // Always send event to overlay (it manages its own stinger independently)
    sendEvent('asset:show', {
      assetId,
      ...(stingerUrl ? {
        assetStingerUrl: stingerUrl,
        stingerEnterTransition: asset!.enter_transition,
      } : {}),
    })

    // OBS native playback for video/ad when connected and file path is available
    if (obs.isConnected && asset && (asset.asset_type === 'video' || asset.asset_type === 'advertisement')) {
      const filePath = resolveOBSFilePath(asset)
      console.log(`[OBS] showAsset: type=${asset.asset_type}, source_filename=${asset.ad_config?.source_filename}, mediaDir=${project?.settings?.obsMediaDir}, resolved=${filePath}`)
      if (filePath) {
        const sourceName = `triton-media-${asset.id}`
        obs.createMediaSource(sourceName, filePath, {
          x: asset.canvas_x,
          y: asset.canvas_y,
          width: asset.canvas_width,
          height: asset.canvas_height,
        }).then(() => {
          if (asset.asset_type === 'advertisement' && asset.ad_config?.volume !== undefined) {
            obs.setMediaVolume(sourceName, asset.ad_config.volume)
          }
        })
      }
    }

    if (stingerUrl) {
      // Stinger mode: DON'T add asset to visible yet.
      // Stinger plays fully, then when it ends and slides left,
      // handleStingerCutPoint adds the asset to visibleAssetIds.
      setLiveStinger({
        assetId,
        videoUrl: stingerUrl,
        enterTransition: asset!.enter_transition,
      })
    } else {
      // No stinger — show immediately with enter animation
      setVisibleAssetIds(prev => {
        const next = new Set(prev)
        next.add(assetId)
        persistActiveState(next, activeSegmentId)
        return next
      })

      // Track entering animation for studio preview
      if (asset?.enter_transition) {
        setAnimatingAssets(prev => new Map(prev).set(assetId, 'entering'))
        const enterMs = (asset.enter_transition.durationFrames / fps) * 1000
        setTimeout(() => {
          setAnimatingAssets(prev => {
            const next = new Map(prev)
            if (next.get(assetId) === 'entering') next.delete(assetId)
            return next
          })
        }, enterMs + 50)
      }
    }
  }, [assets, project, sendEvent, persistActiveState, activeSegmentId, obs, resolveOBSFilePath])

  const hideAsset = useCallback((assetId: string) => {
    const asset = assets.find(a => a.id === assetId)
    const fps = project?.settings?.fps || 30

    sendEvent('asset:hide', { assetId })

    // Hide OBS media source for video/ad (keeps source for reuse)
    if (obs.isConnected && asset && (asset.asset_type === 'video' || asset.asset_type === 'advertisement')) {
      obs.hideMediaSource(`triton-media-${assetId}`)
    }

    if (asset?.exit_transition) {
      // Start exit animation, then remove
      setAnimatingAssets(prev => new Map(prev).set(assetId, 'exiting'))
      const exitMs = (asset.exit_transition.durationFrames / fps) * 1000
      setTimeout(() => {
        setVisibleAssetIds(prev => {
          const next = new Set(prev)
          next.delete(assetId)
          persistActiveState(next, activeSegmentId)
          return next
        })
        setAnimatingAssets(prev => {
          const next = new Map(prev)
          next.delete(assetId)
          return next
        })
      }, exitMs + 50)
    } else {
      setVisibleAssetIds(prev => {
        const next = new Set(prev)
        next.delete(assetId)
        persistActiveState(next, activeSegmentId)
        return next
      })
    }
  }, [assets, project, sendEvent, persistActiveState, activeSegmentId, obs])

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

  // Segment CRUD
  const addSegment = useCallback((segment: BroadcastSegment) => {
    setSegments(prev => [...prev, segment])
  }, [])

  const updateSegment = useCallback((id: string, updates: Partial<BroadcastSegment>) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }, [])

  const removeSegment = useCallback((id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id))
    setSegmentAssets(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    if (activeSegmentId === id) setActiveSegmentId(null)
    if (selectedSegmentId === id) setSelectedSegmentId(null)
  }, [activeSegmentId, selectedSegmentId])

  // Segment-asset CRUD
  const addSegmentAsset = useCallback((sa: BroadcastSegmentAsset) => {
    setSegmentAssets(prev => {
      const next = new Map(prev)
      const list = [...(next.get(sa.scene_id) || []), sa]
      next.set(sa.scene_id, list)
      return next
    })
  }, [])

  const updateSegmentAsset = useCallback((id: string, updates: Partial<BroadcastSegmentAsset>) => {
    setSegmentAssets(prev => {
      const next = new Map<string, BroadcastSegmentAsset[]>()
      for (const [segmentId, list] of prev) {
        next.set(segmentId, list.map(sa => sa.id === id ? { ...sa, ...updates } : sa))
      }
      return next
    })
  }, [])

  const removeSegmentAsset = useCallback((id: string) => {
    setSegmentAssets(prev => {
      const next = new Map<string, BroadcastSegmentAsset[]>()
      for (const [segmentId, list] of prev) {
        next.set(segmentId, list.filter(sa => sa.id !== id))
      }
      return next
    })
  }, [])

  // Switch segment — the core logic
  const switchSegment = useCallback((toSegmentId: string) => {
    if (switchingSegment || !session) return
    if (toSegmentId === activeSegmentId) return

    const targetSegment = segments.find(s => s.id === toSegmentId)
    if (!targetSegment) return

    setSwitchingSegment(true)

    // Compute which assets to hide (old segment) and show (new segment)
    const oldSegmentAssetList = activeSegmentId ? segmentAssets.get(activeSegmentId) || [] : []
    const newSegmentAssetList = segmentAssets.get(toSegmentId) || []

    const assetsToHide = oldSegmentAssetList
      .filter(sa => sa.is_visible)
      .map(sa => sa.asset_id)
    const assetsToShow = newSegmentAssetList
      .filter(sa => sa.is_visible)
      .map(sa => sa.asset_id)

    // Build overrides map
    const overrides: Record<string, any> = {}
    for (const sa of newSegmentAssetList) {
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

    const stingerUrl = targetSegment.stinger_enabled
      ? (targetSegment.stinger_video_url || targetSegment.stinger_storage_path)
      : null

    // Send segment:switch event
    sendEvent('segment:switch', {
      segmentId: toSegmentId,
      assetsToHide,
      assetsToShow,
      overrides,
      stingerUrl: stingerUrl || undefined,
      stingerEnterTransition: stingerUrl ? (targetSegment.enter_transition || targetSegment.transition_override) : undefined,
    })

    // OBS: clean up old video/ad sources, create new ones
    if (obs.isConnected) {
      for (const id of assetsToHide) {
        const asset = assets.find(a => a.id === id)
        if (asset && (asset.asset_type === 'video' || asset.asset_type === 'advertisement')) {
          obs.hideMediaSource(`triton-media-${id}`)
        }
      }
      for (const id of assetsToShow) {
        const asset = assets.find(a => a.id === id)
        if (asset && (asset.asset_type === 'video' || asset.asset_type === 'advertisement')) {
          const filePath = resolveOBSFilePath(asset)
          if (filePath) {
            const sourceName = `triton-media-${id}`
            // Use overrides if available
            const ov = overrides[id]
            obs.createMediaSource(sourceName, filePath, {
              x: ov?.x ?? asset.canvas_x,
              y: ov?.y ?? asset.canvas_y,
              width: ov?.width ?? asset.canvas_width,
              height: ov?.height ?? asset.canvas_height,
            }).then(() => {
              if (asset.asset_type === 'advertisement' && asset.ad_config?.volume !== undefined) {
                obs.setMediaVolume(sourceName, asset.ad_config.volume)
              }
            })
          }
        }
      }
    }

    // Perform the local swap
    const performSwap = () => {
      setVisibleAssetIds(prev => {
        const next = new Set(prev)
        for (const id of assetsToHide) next.delete(id)
        for (const id of assetsToShow) next.add(id)
        return next
      })
      setActiveSegmentId(toSegmentId)
      setSwitchingSegment(false)

      // Persist
      setVisibleAssetIds(prev => {
        const merged = new Set(prev)
        for (const id of assetsToHide) merged.delete(id)
        for (const id of assetsToShow) merged.add(id)
        persistActiveState(merged, toSegmentId)
        return merged
      })
    }

    if (stingerUrl) {
      // Stinger plays fully then slides left — swap immediately (stinger covers the transition visually)
      performSwap()
    } else {
      performSwap()
    }
  }, [switchingSegment, session, activeSegmentId, segments, segmentAssets, sendEvent, persistActiveState, assets, obs, resolveOBSFilePath])

  // Keyboard hotkey listener — assets + segments
  useEffect(() => {
    if (!session) return
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const key = e.key.toLowerCase()

      // Check segment hotkeys first
      const segment = segments.find(s => s.hotkey_key === key)
      if (segment) {
        e.preventDefault()
        switchSegment(segment.id)
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
  }, [session, assets, segments, toggleAssetVisibility, switchSegment])

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

  // Stinger ended: stinger is sliding away, NOW add the asset to visible
  const handleStingerCutPoint = useCallback(() => {
    const stinger = liveStinger
    if (!stinger) return
    setVisibleAssetIds(prev => {
      const next = new Set(prev)
      next.add(stinger.assetId)
      persistActiveState(next, activeSegmentId)
      return next
    })
  }, [liveStinger, persistActiveState, activeSegmentId])

  // Stinger complete: stinger has finished its exit animation, remove it
  const handleStingerComplete = useCallback(() => {
    setLiveStinger(null)
  }, [])

  // Ad video ended — trigger exit transition
  const handleAdEnded = useCallback((assetId: string) => {
    setVideoTimeRemaining(prev => {
      const next = new Map(prev)
      next.delete(assetId)
      return next
    })
    hideAsset(assetId)
  }, [hideAsset])

  // Keep ref in sync for OBS callback
  handleAdEndedRef.current = handleAdEnded

  const setVideoTimeInfo = useCallback((assetId: string, remaining: number, duration: number) => {
    setVideoTimeRemaining(prev => {
      const next = new Map(prev)
      next.set(assetId, { remaining, duration })
      return next
    })
  }, [])

  const clearVideoTimeInfo = useCallback((assetId: string) => {
    setVideoTimeRemaining(prev => {
      const next = new Map(prev)
      next.delete(assetId)
      return next
    })
  }, [])

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

        const sessionId = data.session.id
        const channel = supabaseRef.current.channel(channelName)
        channel
          .on('broadcast', { event: 'ad:ended' }, (payload: any) => {
            const assetId = payload.payload?.assetId
            if (assetId) {
              // Trigger proper exit transition (hideAsset handles animation + removal)
              hideAsset(assetId)
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

        // Notify overlay about OBS connection status
        if (obs.isConnected) {
          setTimeout(() => {
            channel.send({
              type: 'broadcast',
              event: 'obs:status',
              payload: { connected: true, source: 'manager', timestamp: Date.now() },
            })
          }, 1000) // Small delay to let overlay subscribe first
        }

        return sessionId
      }
      return null
    } catch (err) {
      console.error('Failed to go live:', err)
      return null
    }
  }, [project, obs.isConnected])

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
      setActiveSegmentId(null)
    } catch (err) {
      console.error('Failed to end session:', err)
    }
  }, [session])

  return (
    <BroadcastCtx.Provider value={{
      project, assets, session, visibleAssetIds, animatingAssets, selectedAssetId, previewingAssetId, loading,
      slideshowSlideIndexes, liveStinger, videoTimeRemaining,
      segments, segmentAssets, activeSegmentId, switchingSegment, selectedSegmentId,
      setProject, setAssets, setSelectedAssetId, addAsset, updateAsset, removeAsset,
      toggleAssetVisibility, previewAsset, goLive, endSession, sendEvent,
      slideshowGoto, slideshowNext, slideshowPrev, getSlideshowIndex,
      updateProjectSettings,
      handleStingerCutPoint, handleStingerComplete, handleAdEnded, setVideoTimeInfo, clearVideoTimeInfo,
      obsState: obs.state, obsConnect, obsDisconnect, obsSetupScene, obsCleanup, isOBSConnected: obs.isConnected,
      setSegments, setSelectedSegmentId, addSegment, updateSegment, removeSegment, switchSegment,
      addSegmentAsset, updateSegmentAsset, removeSegmentAsset, reloadSegmentAssets,
    }}>
      {children}
    </BroadcastCtx.Provider>
  )
}
