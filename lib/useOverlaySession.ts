'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { BroadcastAsset, BroadcastSession } from './broadcastTypes'

interface OverlayState {
  session: BroadcastSession | null
  assets: BroadcastAsset[]
  visibleAssetIds: Set<string>
  animatingAssets: Map<string, 'entering' | 'exiting'>
  slideshowIndexes: Map<string, number>
  connected: boolean
  error: string | null
  activeSegmentId: string | null
  segmentOverrides: Record<string, Partial<{ x: number; y: number; width: number; height: number; layer: number; opacity: number }>>
  obsActive: boolean
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
    activeSegmentId: null,
    segmentOverrides: {},
    obsActive: false,
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

    setTimeout(() => {
      setState(prev => {
        const next = { ...prev }
        next.animatingAssets = new Map(prev.animatingAssets)
        next.animatingAssets.delete(assetId)
        return next
      })
    }, 2000)
  }, [])

  // Hide asset callback
  const hideAsset = useCallback((assetId: string) => {
    setState(prev => {
      const next = { ...prev }
      next.animatingAssets = new Map(prev.animatingAssets)
      next.animatingAssets.set(assetId, 'exiting')
      return next
    })

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

  // Perform segment swap — hide old assets, show new with overrides
  const performSegmentSwap = useCallback((
    assetsToHide: string[],
    assetsToShow: string[],
    overrides: Record<string, any>,
    segmentId: string,
  ) => {
    for (const id of assetsToHide) {
      hideAsset(id)
    }

    setTimeout(() => {
      setState(prev => ({
        ...prev,
        segmentOverrides: overrides || {},
        activeSegmentId: segmentId,
      }))

      for (const id of assetsToShow) {
        showAsset(id)
      }
    }, 100)
  }, [hideAsset, showAsset])

  useEffect(() => {
    async function init() {
      try {
        const sessionRes = await fetch(`/api/broadcast/sessions?id=${sessionId}`)
        const sessionData = await sessionRes.json()
        if (!sessionData.session) {
          setState(prev => ({ ...prev, error: 'Session not found' }))
          return
        }

        const session = sessionData.session as BroadcastSession

        const assetsRes = await fetch(`/api/broadcast/assets?project_id=${session.project_id}`)
        const assetsData = await assetsRes.json()
        const assets = (assetsData.assets || []) as BroadcastAsset[]

        const activeVisible = new Set<string>(session.active_state?.visibleAssets || [])
        const restoredSegmentId = session.active_state?.activeSegmentId || null

        setState(prev => ({
          ...prev,
          session,
          assets,
          visibleAssetIds: activeVisible,
          activeSegmentId: restoredSegmentId,
        }))

        supabaseRef.current = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const channel = supabaseRef.current.channel(session.channel_name)

        channel
          .on('broadcast', { event: 'asset:show' }, (payload: any) => {
            const { assetId } = payload.payload || {}
            if (assetId) showAsset(assetId)
          })
          .on('broadcast', { event: 'asset:hide' }, (payload: any) => {
            const assetId = payload.payload?.assetId
            if (assetId) hideAsset(assetId)
          })
          .on('broadcast', { event: 'asset:update' }, (payload: any) => {
            const { assetId, elementUpdates, sceneConfig } = payload.payload || {}
            if (assetId && sceneConfig) {
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
          .on('broadcast', { event: 'segment:switch' }, (payload: any) => {
            const {
              segmentId, assetsToHide = [], assetsToShow = [], overrides = {},
            } = payload.payload || {}

            performSegmentSwap(assetsToHide, assetsToShow, overrides, segmentId)
          })
          .on('broadcast', { event: 'session:sync' }, (payload: any) => {
            const visibleAssets = payload.payload?.visibleAssets || []
            setState(prev => ({
              ...prev,
              visibleAssetIds: new Set(visibleAssets),
              animatingAssets: new Map(),
            }))
          })
          .on('broadcast', { event: 'obs:status' }, (payload: any) => {
            const connected = payload.payload?.connected ?? false
            setState(prev => ({ ...prev, obsActive: connected }))
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
  }, [sessionId, showAsset, hideAsset, performSegmentSwap])

  const notifyAdEnded = useCallback((assetId: string) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'ad:ended',
        payload: { assetId, timestamp: Date.now() },
      })
    }
  }, [])

  return { ...state, hideAsset, notifyAdEnded }
}
