'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { BroadcastAsset, BroadcastSession, BroadcastEvent } from './broadcastTypes'

interface OverlayState {
  session: BroadcastSession | null
  assets: BroadcastAsset[]
  visibleAssetIds: Set<string>
  animatingAssets: Map<string, 'entering' | 'exiting'>
  slideshowIndexes: Map<string, number>
  connected: boolean
  error: string | null
}

export function useOverlaySession(sessionId: string) {
  const [state, setState] = useState<OverlayState>({
    session: null,
    assets: [],
    visibleAssetIds: new Set(),
    animatingAssets: new Map(),
    slideshowIndexes: new Map(),
    connected: false,
    error: null,
  })

  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef<any>(null)

  // Show asset callback
  const showAsset = useCallback((assetId: string) => {
    setState(prev => {
      const next = { ...prev }
      next.animatingAssets = new Map(prev.animatingAssets)
      next.animatingAssets.set(assetId, 'entering')
      next.visibleAssetIds = new Set(prev.visibleAssetIds)
      next.visibleAssetIds.add(assetId)
      return next
    })

    // Clear animating state after animation completes
    setTimeout(() => {
      setState(prev => {
        const next = { ...prev }
        next.animatingAssets = new Map(prev.animatingAssets)
        next.animatingAssets.delete(assetId)
        return next
      })
    }, 2000) // Max animation duration
  }, [])

  // Hide asset callback
  const hideAsset = useCallback((assetId: string) => {
    setState(prev => {
      const next = { ...prev }
      next.animatingAssets = new Map(prev.animatingAssets)
      next.animatingAssets.set(assetId, 'exiting')
      return next
    })

    // Remove after exit animation
    setTimeout(() => {
      setState(prev => {
        const next = { ...prev }
        next.visibleAssetIds = new Set(prev.visibleAssetIds)
        next.visibleAssetIds.delete(assetId)
        next.animatingAssets = new Map(prev.animatingAssets)
        next.animatingAssets.delete(assetId)
        return next
      })
    }, 2000)
  }, [])

  useEffect(() => {
    async function init() {
      try {
        // Fetch session
        const sessionRes = await fetch(`/api/broadcast/sessions?id=${sessionId}`)
        const sessionData = await sessionRes.json()
        if (!sessionData.session) {
          setState(prev => ({ ...prev, error: 'Session not found' }))
          return
        }

        const session = sessionData.session as BroadcastSession

        // Fetch assets
        const assetsRes = await fetch(`/api/broadcast/assets?project_id=${session.project_id}`)
        const assetsData = await assetsRes.json()
        const assets = (assetsData.assets || []) as BroadcastAsset[]

        // Restore active state (no animations for reconnection)
        const activeVisible = new Set<string>(session.active_state?.visibleAssets || [])

        setState(prev => ({
          ...prev,
          session,
          assets,
          visibleAssetIds: activeVisible,
        }))

        // Connect to Realtime channel
        supabaseRef.current = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const channel = supabaseRef.current.channel(session.channel_name)

        channel
          .on('broadcast', { event: 'asset:show' }, (payload: any) => {
            const assetId = payload.payload?.assetId
            if (assetId) showAsset(assetId)
          })
          .on('broadcast', { event: 'asset:hide' }, (payload: any) => {
            const assetId = payload.payload?.assetId
            if (assetId) hideAsset(assetId)
          })
          .on('broadcast', { event: 'asset:update' }, (payload: any) => {
            const { assetId, elementUpdates, sceneConfig } = payload.payload || {}
            if (assetId && sceneConfig) {
              // Full scene_config replacement (template re-apply)
              setState(prev => ({
                ...prev,
                assets: prev.assets.map(a =>
                  a.id === assetId ? { ...a, scene_config: sceneConfig } : a
                ),
              }))
            } else if (assetId && elementUpdates) {
              setState(prev => ({
                ...prev,
                assets: prev.assets.map(a => {
                  if (a.id !== assetId || !a.scene_config) return a
                  return {
                    ...a,
                    scene_config: {
                      ...a.scene_config,
                      elements: a.scene_config.elements.map(el =>
                        elementUpdates[el.id]
                          ? { ...el, props: { ...el.props, ...elementUpdates[el.id] } }
                          : el
                      ),
                    },
                  }
                }),
              }))
            }
          })
          .on('broadcast', { event: 'slideshow:goto' }, (payload: any) => {
            const { assetId, slideIndex } = payload.payload || {}
            if (assetId != null && slideIndex != null) {
              setState(prev => {
                const next = { ...prev }
                next.slideshowIndexes = new Map(prev.slideshowIndexes)
                next.slideshowIndexes.set(assetId, slideIndex)
                return next
              })
            }
          })
          .on('broadcast', { event: 'session:sync' }, (payload: any) => {
            const visibleAssets = payload.payload?.visibleAssets || []
            setState(prev => ({
              ...prev,
              visibleAssetIds: new Set(visibleAssets),
              animatingAssets: new Map(),
            }))
          })
          .subscribe((status: string) => {
            setState(prev => ({ ...prev, connected: status === 'SUBSCRIBED' }))
          })

        channelRef.current = channel
      } catch (err: any) {
        setState(prev => ({ ...prev, error: err.message }))
      }
    }

    init()

    return () => {
      if (channelRef.current && supabaseRef.current) {
        supabaseRef.current.removeChannel(channelRef.current)
      }
    }
  }, [sessionId, showAsset, hideAsset])

  return state
}
