import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { BroadcastSession } from '@/lib/broadcastTypes'

const VALID_ACTIONS = ['toggle', 'show', 'hide', 'slideshow_next', 'slideshow_prev'] as const
type TriggerAction = typeof VALID_ACTIONS[number]

export async function GET(req: NextRequest) {
  try {
    const sid = req.nextUrl.searchParams.get('sid')
    const aid = req.nextUrl.searchParams.get('aid')
    const action = req.nextUrl.searchParams.get('action') as TriggerAction | null

    if (!sid || !aid || !action) {
      return NextResponse.json({ error: 'sid, aid, and action are required' }, { status: 400 })
    }
    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
    }

    // Fetch session — session ID acts as capability token (no auth required)
    const { data: session, error: sessErr } = await supabaseAdmin
      .from('broadcast_sessions')
      .select('*')
      .eq('id', sid)
      .single()

    if (sessErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const sess = session as BroadcastSession
    if (!sess.is_live) {
      return NextResponse.json({ error: 'Session is not live' }, { status: 409 })
    }

    const activeState = sess.active_state || { visibleAssets: [] }
    const visibleAssets = new Set<string>(activeState.visibleAssets || [])
    const slideshowIndexes: Record<string, number> = activeState.slideshowIndexes || {}

    let eventName: string
    let eventPayload: Record<string, any>
    let resultVisible: boolean | undefined
    let resultIndex: number | undefined

    if (action === 'slideshow_next' || action === 'slideshow_prev') {
      // Need slide count from asset
      const { data: asset } = await supabaseAdmin
        .from('broadcast_assets')
        .select('slideshow_config')
        .eq('id', aid)
        .single()

      const slideCount = asset?.slideshow_config?.slides?.length || 0
      if (slideCount === 0) {
        return NextResponse.json({ error: 'Asset has no slides' }, { status: 400 })
      }

      const current = slideshowIndexes[aid] || 0
      const next = action === 'slideshow_next'
        ? (current + 1) % slideCount
        : (current - 1 + slideCount) % slideCount

      slideshowIndexes[aid] = next
      resultIndex = next
      eventName = 'slideshow:goto'
      eventPayload = { assetId: aid, slideIndex: next, source: 'trigger-api' }
    } else {
      // toggle / show / hide
      const isVisible = visibleAssets.has(aid)

      if (action === 'show' || (action === 'toggle' && !isVisible)) {
        visibleAssets.add(aid)
        resultVisible = true
        eventName = 'asset:show'
      } else if (action === 'hide' || (action === 'toggle' && isVisible)) {
        visibleAssets.delete(aid)
        resultVisible = false
        eventName = 'asset:hide'
      } else {
        eventName = 'asset:hide'
        resultVisible = false
      }

      eventPayload = { assetId: aid, source: 'trigger-api' }
    }

    // Update active_state in DB
    const newActiveState = {
      visibleAssets: Array.from(visibleAssets),
      slideshowIndexes,
    }

    const { error: updateErr } = await supabaseAdmin
      .from('broadcast_sessions')
      .update({ active_state: newActiveState })
      .eq('id', sid)

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to update session state' }, { status: 500 })
    }

    // Broadcast realtime event on session channel
    const channel = supabaseAdmin.channel(sess.channel_name)
    await channel.subscribe()
    await channel.send({
      type: 'broadcast',
      event: eventName,
      payload: { ...eventPayload, timestamp: Date.now() },
    })
    supabaseAdmin.removeChannel(channel)

    // Return result
    if (resultIndex !== undefined) {
      return NextResponse.json({ ok: true, index: resultIndex })
    }
    return NextResponse.json({ ok: true, visible: resultVisible })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
