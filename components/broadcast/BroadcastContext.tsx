'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react'
import { BroadcastProject, BroadcastAsset, BroadcastSession } from '@/lib/broadcastTypes'
import { createClient } from '@supabase/supabase-js'

interface BroadcastContextValue {
  project: BroadcastProject | null
  assets: BroadcastAsset[]
  session: BroadcastSession | null
  visibleAssetIds: Set<string>
  selectedAssetId: string | null
  loading: boolean

  setProject: (p: BroadcastProject) => void
  setAssets: (a: BroadcastAsset[]) => void
  setSelectedAssetId: (id: string | null) => void
  addAsset: (a: BroadcastAsset) => void
  updateAsset: (id: string, updates: Partial<BroadcastAsset>) => void
  removeAsset: (id: string) => void
  toggleAssetVisibility: (id: string) => void
  goLive: () => Promise<string | null>
  endSession: () => Promise<void>
  sendEvent: (event: string, payload: any) => void
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
  const [loading, setLoading] = useState(true)
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

  const toggleAssetVisibility = useCallback((assetId: string) => {
    setVisibleAssetIds(prev => {
      const next = new Set(prev)
      const isVisible = next.has(assetId)
      if (isVisible) {
        next.delete(assetId)
        sendEvent('asset:hide', { assetId })
      } else {
        next.add(assetId)
        sendEvent('asset:show', { assetId })
      }

      // Persist active state to session
      if (session) {
        const visibleAssets = Array.from(next)
        fetch(`/api/broadcast/sessions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: session.id, active_state: { visibleAssets } }),
        }).catch(console.error)
      }

      return next
    })
  }, [session, sendEvent])

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
      project, assets, session, visibleAssetIds, selectedAssetId, loading,
      setProject, setAssets, setSelectedAssetId, addAsset, updateAsset, removeAsset,
      toggleAssetVisibility, goLive, endSession, sendEvent,
    }}>
      {children}
    </BroadcastCtx.Provider>
  )
}
