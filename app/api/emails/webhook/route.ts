import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Resend webhook receiver for delivery, bounce, and complaint events.
 *
 * Resend sends JSON payloads with:
 *   type: 'email.delivered' | 'email.bounced' | 'email.complained' | ...
 *   data: { email_id, from, to, subject, ... }
 */

export async function POST(request: NextRequest) {
  const body = await request.json()
  const eventType = body.type as string
  const data = body.data as Record<string, unknown>

  if (!eventType || !data) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  // Map Resend event types to our event types
  let ourType: string | null = null
  let counterColumn: string | null = null

  switch (eventType) {
    case 'email.delivered':
      ourType = 'delivered'
      counterColumn = 'delivered_count'
      break
    case 'email.bounced':
      ourType = 'bounce'
      counterColumn = 'bounced_count'
      break
    case 'email.complained':
      ourType = 'complaint'
      break
    case 'email.opened':
      ourType = 'open'
      counterColumn = 'opened_count'
      break
    case 'email.clicked':
      ourType = 'click'
      counterColumn = 'clicked_count'
      break
    default:
      // Unhandled event type, acknowledge but don't process
      return NextResponse.json({ ok: true, ignored: true })
  }

  // Try to find the send_id from email headers/tags
  // Resend includes custom headers in the webhook data
  const tags = (data.tags as Record<string, string>) || {}
  const sendId = tags.send_id || null

  if (sendId && ourType) {
    // Insert event
    await supabaseAdmin
      .from('email_events')
      .insert({
        send_id: sendId,
        event_type: ourType,
        metadata: {
          resend_event: eventType,
          email_id: data.email_id,
          to: data.to,
        },
      })

    // Increment counter
    if (counterColumn) {
      try {
        await supabaseAdmin.rpc('increment_email_send_counter', {
          p_send_id: sendId,
          p_column: counterColumn,
        })
      } catch { /* ignore counter failures */ }
    }
  }

  return NextResponse.json({ ok: true })
}
