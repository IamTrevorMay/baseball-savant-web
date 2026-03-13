import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { BroadcastSession } from '@/lib/broadcastTypes'

const VALID_ACTIONS = ['toggle', 'show', 'hide', 'slideshow_next', 'slideshow_prev', 'slideshow_visible_next', 'slideshow_visible_prev', 'topic_next', 'topic_prev', 'countdown_start', 'countdown_stop', 'lowerthird_clear'] as const
type TriggerAction = typeof VALID_ACTIONS[number]

export async function GET(req: NextRequest) {
  try {
    const sid = req.nextUrl.searchParams.get('sid')
    const aid = req.nextUrl.searchParams.get('aid')
    const action = req.nextUrl.searchParams.get('action') as TriggerAction | null

    const aidOptionalActions: TriggerAction[] = ['slideshow_visible_next', 'slideshow_visible_prev', 'topic_next', 'topic_prev', 'countdown_start', 'countdown_stop', 'lowerthird_clear']
    if (!sid || !action) {
      return NextResponse.json({ error: 'sid and action are required' }, { status: 400 })
    }
    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
    }
    if (!aid && !aidOptionalActions.includes(action)) {
      return NextResponse.json({ error: 'aid is required for this action' }, { status: 400 })
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

    // ── Widget actions ─────────────────────────────────────────────────────
    if (action === 'topic_next' || action === 'topic_prev' || action === 'countdown_start' || action === 'countdown_stop' || action === 'lowerthird_clear') {
      const { data: ws } = await supabaseAdmin
        .from('broadcast_widget_state')
        .select('*')
        .eq('project_id', sess.project_id)
        .single()

      if (!ws) return NextResponse.json({ error: 'Widget state not found' }, { status: 404 })

      let eventName: string
      let eventPayload: Record<string, any> = { source: 'trigger-api' }
      const wsUpdates: Record<string, any> = { updated_at: new Date().toISOString() }

      if (action === 'topic_next' || action === 'topic_prev') {
        const topics = ws.topics || []
        if (topics.length === 0) return NextResponse.json({ error: 'No topics configured' }, { status: 400 })
        const current = ws.active_topic_index ?? -1
        const next = action === 'topic_next'
          ? Math.min(current + 1, topics.length - 1)
          : Math.max(current - 1, -1)
        wsUpdates.active_topic_index = next
        eventName = 'widget:topic-change'
        eventPayload = { ...eventPayload, topics, activeTopicIndex: next }
      } else if (action === 'countdown_start') {
        wsUpdates.countdown_running = true
        wsUpdates.countdown_started_at = new Date().toISOString()
        if (ws.countdown_remaining <= 0) wsUpdates.countdown_remaining = ws.countdown_total
        eventName = 'widget:countdown-sync'
        eventPayload = { ...eventPayload, running: true, remaining: wsUpdates.countdown_remaining ?? ws.countdown_remaining, total: ws.countdown_total, startedAt: wsUpdates.countdown_started_at }
      } else if (action === 'countdown_stop') {
        wsUpdates.countdown_running = false
        wsUpdates.countdown_started_at = null
        eventName = 'widget:countdown-sync'
        eventPayload = { ...eventPayload, running: false, remaining: ws.countdown_remaining, total: ws.countdown_total }
      } else {
        // lowerthird_clear
        wsUpdates.lower_third_visible = false
        wsUpdates.lower_third_message = null
        eventName = 'widget:lowerthird-hide'
      }

      await supabaseAdmin
        .from('broadcast_widget_state')
        .update(wsUpdates)
        .eq('project_id', sess.project_id)

      const channel = supabaseAdmin.channel(sess.channel_name)
      await channel.subscribe()
      await channel.send({
        type: 'broadcast',
        event: eventName,
        payload: { ...eventPayload, timestamp: Date.now() },
      })
      supabaseAdmin.removeChannel(channel)

      return NextResponse.json({ ok: true, action })
    }

    if (action === 'slideshow_visible_next' || action === 'slideshow_visible_prev') {
      // Find the first visible slideshow asset with 2+ slides
      const visibleIds = Array.from(visibleAssets)
      let targetId: string | null = null
      let slideCount = 0

      if (visibleIds.length > 0) {
        const { data: visibleAssetRows } = await supabaseAdmin
          .from('broadcast_assets')
          .select('id, asset_type, slideshow_config')
          .in('id', visibleIds)

        if (visibleAssetRows) {
          for (const row of visibleAssetRows) {
            if (row.asset_type === 'slideshow' && (row.slideshow_config?.slides?.length || 0) >= 2) {
              targetId = row.id
              slideCount = row.slideshow_config.slides.length
              break
            }
          }
        }
      }

      if (!targetId) {
        return NextResponse.json({ error: 'No visible slideshow found' }, { status: 400 })
      }

      const current = slideshowIndexes[targetId] || 0
      const next = action === 'slideshow_visible_next'
        ? (current + 1) % slideCount
        : (current - 1 + slideCount) % slideCount

      slideshowIndexes[targetId] = next
      resultIndex = next
      eventName = 'slideshow:goto'
      eventPayload = { assetId: targetId, slideIndex: next, source: 'trigger-api' }
    } else if (action === 'slideshow_next' || action === 'slideshow_prev') {
      // Need slide count from asset
      const { data: asset } = await supabaseAdmin
        .from('broadcast_assets')
        .select('slideshow_config')
        .eq('id', aid!)
        .single()

      const slideCount = asset?.slideshow_config?.slides?.length || 0
      if (slideCount === 0) {
        return NextResponse.json({ error: 'Asset has no slides' }, { status: 400 })
      }

      const current = slideshowIndexes[aid!] || 0
      const next = action === 'slideshow_next'
        ? (current + 1) % slideCount
        : (current - 1 + slideCount) % slideCount

      slideshowIndexes[aid!] = next
      resultIndex = next
      eventName = 'slideshow:goto'
      eventPayload = { assetId: aid!, slideIndex: next, source: 'trigger-api' }
    } else {
      // toggle / show / hide — aid is guaranteed non-null by validation above
      const isVisible = visibleAssets.has(aid!)

      if (action === 'show' || (action === 'toggle' && !isVisible)) {
        visibleAssets.add(aid!)
        resultVisible = true
        eventName = 'asset:show'
      } else if (action === 'hide' || (action === 'toggle' && isVisible)) {
        visibleAssets.delete(aid!)
        resultVisible = false
        eventName = 'asset:hide'
      } else {
        eventName = 'asset:hide'
        resultVisible = false
      }

      eventPayload = { assetId: aid!, source: 'trigger-api' }
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
