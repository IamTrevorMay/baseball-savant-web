import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // Fetch the send
    const { data: send, error } = await supabaseAdmin
      .from('email_sends')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !send) {
      return NextResponse.json({ error: 'Send not found' }, { status: 404 })
    }

    // Aggregate events for this send
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('email_events')
      .select('event_type, link_url, link_label')
      .eq('send_id', id)

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 })
    }

    // Compute event summary
    const eventCounts: Record<string, number> = {}
    const linkClicks: Record<string, { url: string; label: string | null; clicks: number }> = {}

    for (const event of events || []) {
      eventCounts[event.event_type] = (eventCounts[event.event_type] || 0) + 1

      if (event.event_type === 'click' && event.link_url) {
        if (!linkClicks[event.link_url]) {
          linkClicks[event.link_url] = {
            url: event.link_url,
            label: event.link_label,
            clicks: 0,
          }
        }
        linkClicks[event.link_url].clicks++
      }
    }

    // Sort top links by click count descending
    const topLinks = Object.values(linkClicks).sort((a, b) => b.clicks - a.clicks)

    // Calculate rates
    const recipientCount = send.recipient_count || 0
    const openRate = recipientCount > 0 ? (send.opened_count || 0) / recipientCount : 0
    const clickRate = recipientCount > 0 ? (send.clicked_count || 0) / recipientCount : 0
    const bounceRate = recipientCount > 0 ? (send.bounced_count || 0) / recipientCount : 0

    return NextResponse.json({
      send,
      analytics: {
        event_counts: eventCounts,
        top_links: topLinks,
        open_rate: openRate,
        click_rate: clickRate,
        bounce_rate: bounceRate,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
