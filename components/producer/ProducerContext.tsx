'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { useProducerControls } from '@/lib/useProducerControls'
import type { BroadcastSession } from '@/lib/broadcastTypes'
import type { PanelPosition, PanelContent, PresetType, ProducerPanelState } from '@/lib/producerTypes'

interface ProducerContextValue {
  session: BroadcastSession | null
  connected: boolean
  error: string | null
  loading: boolean
  // Panel state (mirrors what the output page shows)
  panels: Record<PanelPosition, { content: PanelContent | null; live: boolean }>
  // Controls
  pushPanel: (position: PanelPosition, presetType: PresetType, config: any) => Promise<PanelContent>
  hidePanel: (position: PanelPosition) => Promise<void>
  hideAllPanels: () => Promise<void>
  pushing: boolean
}

const ProducerCtx = createContext<ProducerContextValue | null>(null)

export function useProducer() {
  const ctx = useContext(ProducerCtx)
  if (!ctx) throw new Error('useProducer must be used inside ProducerProvider')
  return ctx
}

export function ProducerProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [session, setSession] = useState<BroadcastSession | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [panels, setPanels] = useState<Record<PanelPosition, { content: PanelContent | null; live: boolean }>>({
    'lower-bar': { content: null, live: false },
    'right-panel': { content: null, live: false },
  })

  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef<any>(null)

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`/api/broadcast/sessions?id=${sessionId}`)
        const data = await res.json()
        if (!data.session) {
          setError('Session not found')
          setLoading(false)
          return
        }

        const sess = data.session as BroadcastSession
        setSession(sess)

        supabaseRef.current = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const channel = supabaseRef.current.channel(sess.channel_name)

        // Listen for our own events to track live state
        channel
          .on('broadcast', { event: 'producer:panel-show' }, (payload: any) => {
            const p = payload.payload
            if (p?.position && p?.content) {
              setPanels(prev => ({
                ...prev,
                [p.position]: { content: p.content, live: true },
              }))
            }
          })
          .on('broadcast', { event: 'producer:panel-hide' }, (payload: any) => {
            const p = payload.payload
            if (p?.position) {
              setPanels(prev => ({
                ...prev,
                [p.position]: { content: null, live: false },
              }))
            }
          })
          .on('broadcast', { event: 'producer:panel-update' }, (payload: any) => {
            const p = payload.payload
            if (p?.position && p?.content) {
              setPanels(prev => ({
                ...prev,
                [p.position]: { content: p.content, live: true },
              }))
            }
          })
          .subscribe((status: string) => {
            setConnected(status === 'SUBSCRIBED')
          })

        channelRef.current = channel
        setLoading(false)
      } catch (err: any) {
        setError(err.message)
        setLoading(false)
      }
    }

    init()

    return () => {
      if (channelRef.current && supabaseRef.current) {
        supabaseRef.current.removeChannel(channelRef.current)
      }
    }
  }, [sessionId])

  const controls = useProducerControls(channelRef.current)

  const pushPanel = useCallback(async (position: PanelPosition, presetType: PresetType, config: any) => {
    setPushing(true)
    try {
      const content = await controls.pushPanel(position, presetType, config)
      return content
    } finally {
      setPushing(false)
    }
  }, [controls])

  const hidePanel = useCallback(async (position: PanelPosition) => {
    await controls.hidePanel(position)
  }, [controls])

  const hideAllPanels = useCallback(async () => {
    await controls.hideAllPanels()
  }, [controls])

  return (
    <ProducerCtx.Provider
      value={{
        session,
        connected,
        error,
        loading,
        panels,
        pushPanel,
        hidePanel,
        hideAllPanels,
        pushing,
      }}
    >
      {children}
    </ProducerCtx.Provider>
  )
}
