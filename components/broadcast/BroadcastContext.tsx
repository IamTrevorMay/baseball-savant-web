'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react'
import { BroadcastProject, BroadcastAsset, BroadcastSession, BroadcastProjectSettings, BroadcastSegment, BroadcastSegmentAsset, TemplateDataValues, TransitionConfig, OBSConnectionConfig, ProjectAccessLevel } from '@/lib/broadcastTypes'
import { WidgetState, DEFAULT_WIDGET_STATE, ChatMessage, Topic, LowerThirdMessage, Notification, TimerPreset } from '@/lib/widgetTypes'
import { useChatConnection } from '@/lib/useChatConnection'
import { createClient } from '@supabase/supabase-js'
import { useOBSWebSocket, OBSState } from '@/lib/useOBSWebSocket'
import { ClipMarker, OBSRecordingState, DEFAULT_RECORDING_STATE, ClipMarkerExport, ClipMarkerExportEntry, formatMarkerTime, getRecordingElapsed } from '@/lib/clipMarkerTypes'

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

  // Access control
  userRole: ProjectAccessLevel
  isReadOnly: boolean

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

  // Widget state
  widgetState: WidgetState
  updateWidgetState: (updates: Partial<WidgetState>) => void
  widgetPanelMode: 'properties' | 'widgets'
  setWidgetPanelMode: (mode: 'properties' | 'widgets') => void

  // Topic actions
  setTopics: (topics: Topic[]) => void
  goToTopic: (index: number) => void
  nextTopic: () => void
  prevTopic: () => void
  setTopicVariant: (topicId: string, variant: 'default' | 'breakingNews') => void

  // Countdown actions
  setCountdownTotal: (seconds: number) => void
  startCountdown: () => void
  stopCountdown: () => void
  resetCountdown: () => void

  // Timer preset actions
  activateTimerPreset: (preset: TimerPreset) => void

  // Lower third actions
  highlightChatMessage: (msg: ChatMessage) => void
  clearLowerThird: () => void

  // Clip markers
  clipMarkers: ClipMarker[]
  recordingState: OBSRecordingState
  getRecordingElapsedSeconds: () => number
  markClipIn: (clipType: 'short' | 'long') => void
  markClipOut: (clipType: 'short' | 'long') => void
  updateClipMarker: (id: string, updates: Partial<ClipMarker>) => void
  removeClipMarker: (id: string) => void
  exportClipMarkers: () => ClipMarkerExport | null
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
  const [userRole, setUserRole] = useState<ProjectAccessLevel>('none')
  const isReadOnly = userRole === 'viewer'
  const [visibleAssetIds, setVisibleAssetIds] = useState<Set<string>>(new Set())
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [previewingAssetId, setPreviewingAssetId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [slideshowSlideIndexes, setSlideshowSlideIndexes] = useState<Map<string, number>>(new Map())
  const [animatingAssets, setAnimatingAssets] = useState<Map<string, 'entering' | 'exiting'>>(new Map())
  const [videoTimeRemaining, setVideoTimeRemaining] = useState<Map<string, VideoTimeInfo>>(new Map())
  const channelRef = useRef<any>(null)
  const supabaseRef = useRef<any>(null)
  const syncChannelRef = useRef<any>(null)
  const reloadTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Segment state
  const [segments, setSegments] = useState<BroadcastSegment[]>([])
  const [segmentAssets, setSegmentAssets] = useState<Map<string, BroadcastSegmentAsset[]>>(new Map())
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [switchingSegment, setSwitchingSegment] = useState(false)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)

  // Widget state
  const [widgetState, setWidgetState] = useState<WidgetState>(DEFAULT_WIDGET_STATE)
  const [widgetPanelMode, setWidgetPanelMode] = useState<'properties' | 'widgets'>('properties')
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Clip marker state
  const [clipMarkers, setClipMarkers] = useState<ClipMarker[]>([])
  const [recordingState, setRecordingState] = useState<OBSRecordingState>(DEFAULT_RECORDING_STATE)

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
      setRecordingState(DEFAULT_RECORDING_STATE)
      // Send obs:status to overlay so it resumes rendering videos
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'obs:status',
          payload: { connected: false, source: 'manager', timestamp: Date.now() },
        })
      }
    },
    onRecordingStateChanged: (rec: OBSRecordingState) => {
      setRecordingState(rec)
      // Persist recording timing to session active_state for trigger API
      if (session) {
        fetch('/api/broadcast/sessions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: session.id,
            active_state: {
              ...session.active_state,
              recordingStartedAt: rec.recordingStartedAt,
              recordingTotalPausedMs: rec.totalPausedMs,
              recordingPausedAt: rec.lastPauseAt,
            },
          }),
        }).catch(console.error)
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

        if (projData.project) {
          setProject(projData.project)
          if (projData.project._userRole) setUserRole(projData.project._userRole)
        }
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

        // Load widget state
        try {
          const wsRes = await fetch(`/api/broadcast/widget-state?project_id=${projectId}`)
          const wsData = await wsRes.json()
          if (wsData.state) {
            setWidgetState(prev => ({
              ...prev,
              topics: wsData.state.topics || [],
              activeTopicIndex: wsData.state.active_topic_index ?? -1,
              countdown: {
                running: wsData.state.countdown_running || false,
                remaining: wsData.state.countdown_remaining || 0,
                total: wsData.state.countdown_total || 0,
                startedAt: wsData.state.countdown_started_at || null,
              },
              lowerThird: wsData.state.lower_third_message || null,
              lowerThirdVisible: wsData.state.lower_third_visible || false,
              notifications: wsData.state.notification_feed || [],
              usernameStack: wsData.state.username_stack || [],
              panelOrder: wsData.state.panel_order || DEFAULT_WIDGET_STATE.panelOrder,
              twitchChannel: wsData.state.twitch_channel || '',
              youtubeVideoId: wsData.state.youtube_video_id || '',
              chatConnected: wsData.state.chat_connected || false,
            }))
          }
        } catch (err) {
          console.error('Failed to load widget state:', err)
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

  // ── Project sync (multi-user collaboration) ────────────────────────────
  const reloadAssets = useCallback(async () => {
    try {
      const res = await fetch(`/api/broadcast/assets?project_id=${projectId}`)
      const data = await res.json()
      if (data.assets) {
        setAssets(data.assets)
        // Deselect if selected asset was deleted by another user
        setSelectedAssetId(prev =>
          prev && !(data.assets as BroadcastAsset[]).some(a => a.id === prev) ? null : prev
        )
      }
    } catch (err) {
      console.error('Failed to reload assets:', err)
    }
  }, [projectId])

  const reloadSegments = useCallback(async () => {
    try {
      const res = await fetch(`/api/broadcast/scenes?project_id=${projectId}`)
      const data = await res.json()
      if (data.scenes) setSegments(data.scenes)
    } catch (err) {
      console.error('Failed to reload segments:', err)
    }
  }, [projectId])

  const reloadAllRef = useRef<() => void>(() => {})
  reloadAllRef.current = () => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => {
      Promise.all([reloadAssets(), reloadSegments(), reloadSegmentAssets()])
    }, 300)
  }

  const notifyProjectChange = useCallback(() => {
    syncChannelRef.current?.send({
      type: 'broadcast',
      event: 'project:data-changed',
      payload: { timestamp: Date.now() },
    })
  }, [])

  // Subscribe to project-level sync channel for multi-user collaboration
  useEffect(() => {
    if (!supabaseRef.current) return

    const channel = supabaseRef.current.channel(`project-sync:${projectId}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'project:data-changed' }, () => {
        reloadAllRef.current()
      })
      .subscribe()

    syncChannelRef.current = channel

    return () => {
      supabaseRef.current?.removeChannel(channel)
      syncChannelRef.current = null
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    }
  }, [projectId])

  const addAsset = useCallback((asset: BroadcastAsset) => {
    setAssets(prev => [...prev, asset])
    notifyProjectChange()
  }, [notifyProjectChange])

  const updateAsset = useCallback((id: string, updates: Partial<BroadcastAsset>) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
    notifyProjectChange()
  }, [notifyProjectChange])

  const removeAsset = useCallback((id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id))
    setSelectedAssetId(prev => prev === id ? null : prev)
    notifyProjectChange()
  }, [notifyProjectChange])

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
    const fps = project?.settings?.fps || 30

    sendEvent('asset:show', { assetId })

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
    notifyProjectChange()
  }, [notifyProjectChange])

  const updateSegment = useCallback((id: string, updates: Partial<BroadcastSegment>) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
    notifyProjectChange()
  }, [notifyProjectChange])

  const removeSegment = useCallback((id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id))
    setSegmentAssets(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    if (activeSegmentId === id) setActiveSegmentId(null)
    if (selectedSegmentId === id) setSelectedSegmentId(null)
    notifyProjectChange()
  }, [activeSegmentId, selectedSegmentId, notifyProjectChange])

  // Segment-asset CRUD
  const addSegmentAsset = useCallback((sa: BroadcastSegmentAsset) => {
    setSegmentAssets(prev => {
      const next = new Map(prev)
      const list = [...(next.get(sa.scene_id) || []), sa]
      next.set(sa.scene_id, list)
      return next
    })
    notifyProjectChange()
  }, [notifyProjectChange])

  const updateSegmentAsset = useCallback((id: string, updates: Partial<BroadcastSegmentAsset>) => {
    setSegmentAssets(prev => {
      const next = new Map<string, BroadcastSegmentAsset[]>()
      for (const [segmentId, list] of prev) {
        next.set(segmentId, list.map(sa => sa.id === id ? { ...sa, ...updates } : sa))
      }
      return next
    })
    notifyProjectChange()
  }, [notifyProjectChange])

  const removeSegmentAsset = useCallback((id: string) => {
    setSegmentAssets(prev => {
      const next = new Map<string, BroadcastSegmentAsset[]>()
      for (const [segmentId, list] of prev) {
        next.set(segmentId, list.filter(sa => sa.id !== id))
      }
      return next
    })
    notifyProjectChange()
  }, [notifyProjectChange])

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

    // Send segment:switch event
    sendEvent('segment:switch', {
      segmentId: toSegmentId,
      assetsToHide,
      assetsToShow,
      overrides,
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
  }, [switchingSegment, session, activeSegmentId, segments, segmentAssets, sendEvent, persistActiveState, assets, obs, resolveOBSFilePath])

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

  // ── Widget Actions ────────────────────────────────────────────────────

  const updateWidgetState = useCallback((updates: Partial<WidgetState>) => {
    setWidgetState(prev => ({ ...prev, ...updates }))
    // Persist relevant fields to DB
    const dbUpdates: Record<string, any> = {}
    if ('topics' in updates) dbUpdates.topics = updates.topics
    if ('activeTopicIndex' in updates) dbUpdates.active_topic_index = updates.activeTopicIndex
    if ('notifications' in updates) dbUpdates.notification_feed = updates.notifications
    if ('usernameStack' in updates) dbUpdates.username_stack = updates.usernameStack
    if ('panelOrder' in updates) dbUpdates.panel_order = updates.panelOrder
    if ('twitchChannel' in updates) dbUpdates.twitch_channel = updates.twitchChannel
    if ('youtubeVideoId' in updates) dbUpdates.youtube_video_id = updates.youtubeVideoId
    if ('chatConnected' in updates) dbUpdates.chat_connected = updates.chatConnected
    if ('lowerThird' in updates) dbUpdates.lower_third_message = updates.lowerThird
    if ('lowerThirdVisible' in updates) dbUpdates.lower_third_visible = updates.lowerThirdVisible
    if (Object.keys(dbUpdates).length > 0) {
      fetch('/api/broadcast/widget-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, ...dbUpdates }),
      }).catch(console.error)
    }
  }, [projectId])

  // Topic actions
  const setTopics = useCallback((topics: Topic[]) => {
    updateWidgetState({ topics })
    sendEvent('widget:topic-change', { topics, activeTopicIndex: widgetState.activeTopicIndex })
  }, [updateWidgetState, sendEvent, widgetState.activeTopicIndex])

  const goToTopic = useCallback((index: number) => {
    setWidgetState(prev => {
      const newState = { ...prev, activeTopicIndex: index }
      sendEvent('widget:topic-change', { topics: prev.topics, activeTopicIndex: index })
      fetch('/api/broadcast/widget-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, active_topic_index: index }),
      }).catch(console.error)
      return newState
    })
  }, [sendEvent, projectId])

  const nextTopic = useCallback(() => {
    setWidgetState(prev => {
      const next = Math.min(prev.activeTopicIndex + 1, prev.topics.length - 1)
      sendEvent('widget:topic-change', { topics: prev.topics, activeTopicIndex: next })
      fetch('/api/broadcast/widget-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, active_topic_index: next }),
      }).catch(console.error)
      return { ...prev, activeTopicIndex: next }
    })
  }, [sendEvent, projectId])

  const prevTopic = useCallback(() => {
    setWidgetState(prev => {
      const next = Math.max(prev.activeTopicIndex - 1, -1)
      sendEvent('widget:topic-change', { topics: prev.topics, activeTopicIndex: next })
      fetch('/api/broadcast/widget-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, active_topic_index: next }),
      }).catch(console.error)
      return { ...prev, activeTopicIndex: next }
    })
  }, [sendEvent, projectId])

  const setTopicVariant = useCallback((topicId: string, variant: 'default' | 'breakingNews') => {
    setWidgetState(prev => {
      const newTopics = prev.topics.map(t => t.id === topicId ? { ...t, variant } : t)
      sendEvent('widget:topic-change', { topics: newTopics, activeTopicIndex: prev.activeTopicIndex })
      fetch('/api/broadcast/widget-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, topics: newTopics }),
      }).catch(console.error)
      return { ...prev, topics: newTopics }
    })
  }, [sendEvent, projectId])

  // Countdown actions
  const setCountdownTotal = useCallback((seconds: number) => {
    setWidgetState(prev => {
      const newCountdown = { ...prev.countdown, total: seconds, remaining: seconds }
      fetch('/api/broadcast/widget-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, countdown_total: seconds, countdown_remaining: seconds }),
      }).catch(console.error)
      return { ...prev, countdown: newCountdown }
    })
  }, [projectId])

  const startCountdown = useCallback(() => {
    const startedAt = new Date().toISOString()
    setWidgetState(prev => {
      const remaining = prev.countdown.remaining > 0 ? prev.countdown.remaining : prev.countdown.total
      const newCountdown = { ...prev.countdown, running: true, remaining, startedAt }
      sendEvent('widget:countdown-sync', { running: true, remaining, total: prev.countdown.total, startedAt })
      fetch('/api/broadcast/widget-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, countdown_running: true, countdown_remaining: remaining, countdown_started_at: startedAt }),
      }).catch(console.error)
      return { ...prev, countdown: newCountdown }
    })
  }, [sendEvent, projectId])

  const stopCountdown = useCallback(() => {
    setWidgetState(prev => {
      const newCountdown = { ...prev.countdown, running: false, startedAt: null }
      sendEvent('widget:countdown-sync', { running: false, remaining: prev.countdown.remaining, total: prev.countdown.total })
      fetch('/api/broadcast/widget-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, countdown_running: false, countdown_started_at: null, countdown_remaining: prev.countdown.remaining }),
      }).catch(console.error)
      return { ...prev, countdown: newCountdown }
    })
  }, [sendEvent, projectId])

  const resetCountdown = useCallback(() => {
    setWidgetState(prev => {
      const newCountdown = { running: false, remaining: prev.countdown.total, total: prev.countdown.total, startedAt: null }
      sendEvent('widget:countdown-sync', { running: false, remaining: prev.countdown.total, total: prev.countdown.total })
      fetch('/api/broadcast/widget-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, countdown_running: false, countdown_remaining: prev.countdown.total, countdown_started_at: null }),
      }).catch(console.error)
      return { ...prev, countdown: newCountdown }
    })
  }, [sendEvent, projectId])

  // Timer preset activation
  const activateTimerPreset = useCallback((preset: TimerPreset) => {
    // Find the first countdown widget asset
    const countdownAsset = assets.find(a => a.asset_type === 'widget' && (a.widget_config as any)?.widget_type === 'countdown')

    // If autoShow and we have a countdown asset, show it
    if (preset.autoShow && countdownAsset) {
      if (!visibleAssetIds.has(countdownAsset.id)) {
        showAsset(countdownAsset.id)
      }
    }

    // Set countdown total and remaining to preset seconds
    const startedAt = new Date().toISOString()
    setWidgetState(prev => {
      const newCountdown = {
        running: true,
        remaining: preset.seconds,
        total: preset.seconds,
        startedAt,
      }
      sendEvent('widget:countdown-sync', { running: true, remaining: preset.seconds, total: preset.seconds, startedAt })
      fetch('/api/broadcast/widget-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          countdown_running: true,
          countdown_remaining: preset.seconds,
          countdown_total: preset.seconds,
          countdown_started_at: startedAt,
        }),
      }).catch(console.error)
      return {
        ...prev,
        countdown: newCountdown,
        countdownAutoHide: preset.autoHide,
        countdownSourceAssetId: countdownAsset?.id || null,
      }
    })
  }, [assets, visibleAssetIds, showAsset, sendEvent, projectId])

  // Countdown tick
  useEffect(() => {
    if (widgetState.countdown.running) {
      countdownIntervalRef.current = setInterval(() => {
        setWidgetState(prev => {
          if (!prev.countdown.running || prev.countdown.remaining <= 0) {
            if (prev.countdown.remaining <= 0 && prev.countdown.running) {
              sendEvent('widget:countdown-sync', { running: false, remaining: 0, total: prev.countdown.total })
              fetch('/api/broadcast/widget-state', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id: projectId, countdown_running: false, countdown_remaining: 0, countdown_started_at: null }),
              }).catch(console.error)
              // Auto-hide countdown widget if preset had autoHide enabled
              if (prev.countdownAutoHide && prev.countdownSourceAssetId) {
                setTimeout(() => hideAsset(prev.countdownSourceAssetId!), 500)
              }
              return { ...prev, countdown: { ...prev.countdown, running: false, remaining: 0, startedAt: null }, countdownAutoHide: false, countdownSourceAssetId: null }
            }
            return prev
          }
          const newRemaining = prev.countdown.remaining - 1
          // Sync every 5 seconds to keep overlay in sync without flooding
          if (newRemaining % 5 === 0) {
            sendEvent('widget:countdown-sync', { running: true, remaining: newRemaining, total: prev.countdown.total, startedAt: prev.countdown.startedAt })
          }
          return { ...prev, countdown: { ...prev.countdown, remaining: newRemaining } }
        })
      }, 1000)
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
    }
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
    }
  }, [widgetState.countdown.running, sendEvent, projectId, hideAsset])

  // Lower third actions
  const highlightChatMessage = useCallback((msg: ChatMessage) => {
    const lt: LowerThirdMessage = {
      displayName: msg.displayName,
      content: msg.content,
      provider: msg.provider,
      color: msg.color,
      expiresAt: Date.now() + 14000,
    }
    setWidgetState(prev => ({ ...prev, lowerThird: lt, lowerThirdVisible: true }))
    sendEvent('widget:lowerthird-show', lt)
    fetch('/api/broadcast/widget-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, lower_third_message: lt, lower_third_visible: true }),
    }).catch(console.error)
    // Auto-clear after 14s
    setTimeout(() => {
      setWidgetState(prev => {
        if (prev.lowerThird?.expiresAt === lt.expiresAt) {
          sendEvent('widget:lowerthird-hide', {})
          fetch('/api/broadcast/widget-state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, lower_third_visible: false, lower_third_message: null }),
          }).catch(console.error)
          return { ...prev, lowerThird: null, lowerThirdVisible: false }
        }
        return prev
      })
    }, 14000)
  }, [sendEvent, projectId])

  const clearLowerThird = useCallback(() => {
    setWidgetState(prev => ({ ...prev, lowerThird: null, lowerThirdVisible: false }))
    sendEvent('widget:lowerthird-hide', {})
    fetch('/api/broadcast/widget-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, lower_third_visible: false, lower_third_message: null }),
    }).catch(console.error)
  }, [sendEvent, projectId])

  // Chat connection handlers
  const handleChatMessage = useCallback((msg: ChatMessage) => {
    setWidgetState(prev => ({
      ...prev,
      chatMessages: [...prev.chatMessages.slice(-499), msg],
    }))
    sendEvent('widget:chat-message', msg)
  }, [sendEvent])

  const handleChatBatch = useCallback((msgs: ChatMessage[]) => {
    setWidgetState(prev => ({
      ...prev,
      chatMessages: [...prev.chatMessages, ...msgs].slice(-500),
    }))
    sendEvent('widget:chat-batch', { messages: msgs })
  }, [sendEvent])

  const handleChatNotification = useCallback((notif: Notification) => {
    setWidgetState(prev => ({
      ...prev,
      notifications: [...prev.notifications, notif],
    }))
    sendEvent('widget:notification', notif)
    fetch('/api/broadcast/widget-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, notification_feed: [...widgetState.notifications, notif] }),
    }).catch(console.error)
  }, [sendEvent, projectId, widgetState.notifications])

  const handleUsernameStackUpdate = useCallback((name: string) => {
    setWidgetState(prev => {
      const stack = prev.usernameStack.filter(n => n !== name)
      stack.push(name)
      const trimmed = stack.slice(-50)
      sendEvent('widget:username-stack', { stack: trimmed })
      return { ...prev, usernameStack: trimmed }
    })
  }, [sendEvent])

  useChatConnection({
    twitchChannel: widgetState.twitchChannel,
    youtubeVideoId: widgetState.youtubeVideoId,
    connected: widgetState.chatConnected && !!session,
    onMessage: handleChatMessage,
    onBatch: handleChatBatch,
    onNotification: handleChatNotification,
    onUsernameStackUpdate: handleUsernameStackUpdate,
  })

  // Auto-switch to widgets panel when widget asset selected
  const wrappedSetSelectedAssetId = useCallback((id: string | null) => {
    setSelectedAssetId(id)
    if (id) {
      const asset = assets.find(a => a.id === id)
      if (asset?.asset_type === 'widget') {
        setWidgetPanelMode('widgets')
      }
    }
  }, [assets])

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

  // ── Clip Marker Actions ─────────────────────────────────────────────────

  const getRecordingElapsedSeconds = useCallback(() => {
    return getRecordingElapsed(recordingState)
  }, [recordingState])

  const markClipIn = useCallback(async (clipType: 'short' | 'long') => {
    if (!session || !project) return
    const elapsed = getRecordingElapsed(recordingState)
    const sortOrder = clipMarkers.length

    try {
      const res = await fetch('/api/broadcast/clip-markers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          project_id: project.id,
          start_time: elapsed,
          clip_type: clipType,
          sort_order: sortOrder,
        }),
      })
      const data = await res.json()
      if (data.marker) {
        setClipMarkers(prev => [...prev, data.marker])
      }
    } catch (err) {
      console.error('Failed to create clip marker:', err)
    }
  }, [session, project, recordingState, clipMarkers.length])

  const markClipOut = useCallback(async (clipType: 'short' | 'long') => {
    if (!session) return
    const elapsed = getRecordingElapsed(recordingState)

    // Find most recent open marker of this type
    const openMarker = [...clipMarkers].reverse().find(m => m.clip_type === clipType && m.status === 'open')
    if (!openMarker) return

    try {
      const res = await fetch('/api/broadcast/clip-markers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: openMarker.id,
          end_time: elapsed,
          status: 'closed',
        }),
      })
      const data = await res.json()
      if (data.marker) {
        setClipMarkers(prev => prev.map(m => m.id === data.marker.id ? data.marker : m))
      }
    } catch (err) {
      console.error('Failed to close clip marker:', err)
    }
  }, [session, recordingState, clipMarkers])

  const updateClipMarker = useCallback(async (id: string, updates: Partial<ClipMarker>) => {
    try {
      const res = await fetch('/api/broadcast/clip-markers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      const data = await res.json()
      if (data.marker) {
        setClipMarkers(prev => prev.map(m => m.id === data.marker.id ? data.marker : m))
      }
    } catch (err) {
      console.error('Failed to update clip marker:', err)
    }
  }, [])

  const removeClipMarker = useCallback(async (id: string) => {
    try {
      await fetch(`/api/broadcast/clip-markers?id=${id}`, { method: 'DELETE' })
      setClipMarkers(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      console.error('Failed to remove clip marker:', err)
    }
  }, [])

  const exportClipMarkers = useCallback((): ClipMarkerExport | null => {
    if (!session || !project) return null

    const closedMarkers = clipMarkers.filter(m => m.status === 'closed')
    const markers: ClipMarkerExportEntry[] = closedMarkers.map(m => ({
      id: m.id,
      title: m.title,
      start_time: formatMarkerTime(m.start_time || 0),
      end_time: formatMarkerTime(m.end_time || 0),
      clip_type: m.clip_type,
      assignee: m.assignee,
      time_sensitive: m.time_sensitive,
      post_by_date: m.post_by_date,
      notes: m.notes,
    }))

    return {
      version: 1,
      session_id: session.id,
      project_id: project.id,
      show_date: new Date().toISOString().split('T')[0],
      recording_filename: recordingState.outputPath?.split('/').pop() || null,
      markers,
    }
  }, [session, project, clipMarkers, recordingState.outputPath])

  // Keyboard hotkey listener — assets + segments + clip markers
  useEffect(() => {
    if (!session) return
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // Clip marker shortcuts: [ ] for short, { } for long
      if (e.key === '[') {
        e.preventDefault()
        markClipIn('short')
        return
      }
      if (e.key === ']') {
        e.preventDefault()
        markClipOut('short')
        return
      }
      if (e.key === '{') {
        e.preventDefault()
        markClipIn('long')
        return
      }
      if (e.key === '}') {
        e.preventDefault()
        markClipOut('long')
        return
      }

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
  }, [session, assets, segments, toggleAssetVisibility, switchSegment, markClipIn, markClipOut])

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

        // Fetch any existing clip markers for this session
        try {
          const markersRes = await fetch(`/api/broadcast/clip-markers?session_id=${data.session.id}`)
          const markersData = await markersRes.json()
          if (markersData.markers) setClipMarkers(markersData.markers)
        } catch {}

        const sessionId = data.session.id
        const channel = supabaseRef.current.channel(channelName)
        channel
          .on('broadcast', { event: 'clip:marker-update' }, (payload: any) => {
            // Sync clip markers when trigger API creates/updates them
            const marker = payload.payload?.marker
            if (marker) {
              setClipMarkers(prev => {
                const idx = prev.findIndex(m => m.id === marker.id)
                if (idx >= 0) return prev.map(m => m.id === marker.id ? marker : m)
                return [...prev, marker]
              })
            }
          })
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
      setClipMarkers([])
    } catch (err) {
      console.error('Failed to end session:', err)
    }
  }, [session])

  return (
    <BroadcastCtx.Provider value={{
      project, assets, session, visibleAssetIds, animatingAssets, selectedAssetId, previewingAssetId, loading,
      slideshowSlideIndexes, videoTimeRemaining,
      userRole, isReadOnly,
      segments, segmentAssets, activeSegmentId, switchingSegment, selectedSegmentId,
      setProject, setAssets, setSelectedAssetId: wrappedSetSelectedAssetId, addAsset, updateAsset, removeAsset,
      toggleAssetVisibility, previewAsset, goLive, endSession, sendEvent,
      slideshowGoto, slideshowNext, slideshowPrev, getSlideshowIndex,
      updateProjectSettings,
      handleAdEnded, setVideoTimeInfo, clearVideoTimeInfo,
      obsState: obs.state, obsConnect, obsDisconnect, obsSetupScene, obsCleanup, isOBSConnected: obs.isConnected,
      setSegments, setSelectedSegmentId, addSegment, updateSegment, removeSegment, switchSegment,
      addSegmentAsset, updateSegmentAsset, removeSegmentAsset, reloadSegmentAssets,
      widgetState, updateWidgetState, widgetPanelMode, setWidgetPanelMode,
      setTopics, goToTopic, nextTopic, prevTopic, setTopicVariant,
      setCountdownTotal, startCountdown, stopCountdown, resetCountdown,
      activateTimerPreset,
      highlightChatMessage, clearLowerThird,
      clipMarkers, recordingState, getRecordingElapsedSeconds: getRecordingElapsedSeconds,
      markClipIn, markClipOut, updateClipMarker, removeClipMarker, exportClipMarkers,
    }}>
      {children}
    </BroadcastCtx.Provider>
  )
}
