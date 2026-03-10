'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react'
import { BroadcastProject, BroadcastAsset, BroadcastSession, TemplateDataValues } from '@/lib/broadcastTypes'
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

  // Initialize supabase client for Realtime
  useEffect(() => {
    supabaseRef.current = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }, [])

  // Fetch project and assets
  useEffect(() => {
    async function load() {
      try {
        const [projRes, assetsRes] = await Promise.all([
          fetch(`/api/broadcast/projects/${projectId}`),
          fetch(`/api/broadcast/assets?project_id=${projectId}`),
        ])
        const projData = await projRes.json()
        const assetsData = await assetsRes.json()
        if (projData.project) setProject(projData.project)
        if (assetsData.assets) setAssets(assetsData.assets)
      } catch (err) {
        console.error('Failed to load broadcast project:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
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
      payload: { ...payload, timestamp: Date.now() },
    })
  }, [])

  const flashTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const showAsset = useCallback((assetId: string) => {
    setVisibleAssetIds(prev => {
      const next = new Set(prev)
      next.add(assetId)
      sendEvent('asset:show', { assetId })
      if (session) {
        fetch(`/api/broadcast/sessions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: session.id, active_state: { visibleAssets: Array.from(next) } }),
        }).catch(console.error)
      }
      return next
    })
  }, [session, sendEvent])

  const hideAsset = useCallback((assetId: string) => {
    setVisibleAssetIds(prev => {
      const next = new Set(prev)
      next.delete(assetId)
      sendEvent('asset:hide', { assetId })
      if (session) {
        fetch(`/api/broadcast/sessions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: session.id, active_state: { visibleAssets: Array.from(next) } }),
        }).catch(console.error)
      }
      return next
    })
  }, [session, sendEvent])

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
        // Clear any existing flash timer
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
    if (previewingAssetId) return // already previewing
    setPreviewingAssetId(id)
    const asset = assets.find(a => a.id === id)
    const enterFrames = asset?.enter_transition?.durationFrames || 15
    const exitFrames = asset?.exit_transition?.durationFrames || 15
    const fps = project?.settings?.fps || 30
    const enterMs = (enterFrames / fps) * 1000
    const exitMs = (exitFrames / fps) * 1000
    const holdMs = 1000

    // enter → hold → exit → clear
    setTimeout(() => {
      setPreviewingAssetId(`${id}:exit`)
      setTimeout(() => {
        setPreviewingAssetId(null)
      }, exitMs + 100)
    }, enterMs + holdMs)
  }, [previewingAssetId, assets, project])

  // Keyboard hotkey listener
  useEffect(() => {
    if (!session) return
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const key = e.key.toLowerCase()
      const asset = assets.find(a => a.hotkey_key === key)
      if (asset) {
        e.preventDefault()
        toggleAssetVisibility(asset.id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [session, assets, toggleAssetVisibility])

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

        // Subscribe to channel
        const channel = supabaseRef.current.channel(channelName)
        channel.subscribe()
        channelRef.current = channel

        return data.session.id
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
    } catch (err) {
      console.error('Failed to end session:', err)
    }
  }, [session])

  return (
    <BroadcastCtx.Provider value={{
      project, assets, session, visibleAssetIds, selectedAssetId, previewingAssetId, loading,
      slideshowSlideIndexes,
      setProject, setAssets, setSelectedAssetId, addAsset, updateAsset, removeAsset,
      toggleAssetVisibility, previewAsset, goLive, endSession, sendEvent,
      slideshowGoto, slideshowNext, slideshowPrev, getSlideshowIndex,
    }}>
      {children}
    </BroadcastCtx.Provider>
  )
}
