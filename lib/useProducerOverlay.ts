'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import type { BroadcastSession } from './broadcastTypes'
import type {
  PanelPosition,
  ProducerPanelState,
  ProducerPanelShowPayload,
  ProducerPanelHidePayload,
  ProducerPanelUpdatePayload,
} from './producerTypes'

interface ProducerOverlayState {
  session: BroadcastSession | null
  connected: boolean
  error: string | null
  panels: Record<PanelPosition, ProducerPanelState>
}

const ENTER_DURATION = 400
const EXIT_DURATION = 350

function emptyPanel(): ProducerPanelState {
  return { visible: false, animating: null, content: null }
}

export function useProducerOverlay(sessionId: string) {
  const [state, setState] = useState<ProducerOverlayState>({
    session: null,
    connected: false,
    error: null,
    panels: {
      'lower-bar': emptyPanel(),
      'right-panel': emptyPanel(),
    },
  })

  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef<any>(null)
  const exitTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const showPanel = useCallback((position: PanelPosition, payload: ProducerPanelShowPayload) => {
    // Clear any pending exit timer
    if (exitTimers.current[position]) {
      clearTimeout(exitTimers.current[position])
      delete exitTimers.current[position]
    }

    setState(prev => ({
      ...prev,
      panels: {
        ...prev.panels,
        [position]: {
          visible: true,
          animating: 'entering',
          content: payload.content,
        },
      },
    }))

    setTimeout(() => {
      setState(prev => ({
        ...prev,
        panels: {
          ...prev.panels,
          [position]: {
            ...prev.panels[position],
            animating: null,
          },
        },
      }))
    }, ENTER_DURATION)
  }, [])

  const hidePanel = useCallback((position: PanelPosition) => {
    setState(prev => {
      if (!prev.panels[position].visible) return prev
      return {
        ...prev,
        panels: {
          ...prev.panels,
          [position]: {
            ...prev.panels[position],
            animating: 'exiting',
          },
        },
      }
    })

    exitTimers.current[position] = setTimeout(() => {
      setState(prev => ({
        ...prev,
        panels: {
          ...prev.panels,
          [position]: emptyPanel(),
        },
      }))
      delete exitTimers.current[position]
    }, EXIT_DURATION)
  }, [])

  const updatePanel = useCallback((position: PanelPosition, payload: ProducerPanelUpdatePayload) => {
    setState(prev => ({
      ...prev,
      panels: {
        ...prev.panels,
        [position]: {
          ...prev.panels[position],
          content: payload.content,
        },
      },
    }))
  }, [])

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

        setState(prev => ({ ...prev, session }))

        supabaseRef.current = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const channel = supabaseRef.current.channel(session.channel_name)

        channel
          .on('broadcast', { event: 'producer:panel-show' }, (payload: any) => {
            const p = payload.payload as ProducerPanelShowPayload
            if (p?.position && p?.content) {
              showPanel(p.position, p)
            }
          })
          .on('broadcast', { event: 'producer:panel-hide' }, (payload: any) => {
            const p = payload.payload as ProducerPanelHidePayload
            if (p?.position) {
              hidePanel(p.position)
            }
          })
          .on('broadcast', { event: 'producer:panel-update' }, (payload: any) => {
            const p = payload.payload as ProducerPanelUpdatePayload
            if (p?.position && p?.content) {
              updatePanel(p.position, p)
            }
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
      // Clear all exit timers
      Object.values(exitTimers.current).forEach(clearTimeout)
      exitTimers.current = {}

      if (channelRef.current && supabaseRef.current) {
        supabaseRef.current.removeChannel(channelRef.current)
      }
    }
  }, [sessionId, showPanel, hidePanel, updatePanel])

  return state
}
