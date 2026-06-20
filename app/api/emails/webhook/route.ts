import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Resend webhook receiver for delivery, bounce, and complaint events.
 *
 * Resend signs webhooks with Svix. We verify the signature (when
 * RESEND_WEBHOOK_SECRET is configured) and dedupe on the Svix message id so
 * retries/replays can't insert duplicate events or double-count counters.
 *
 * Resend sends JSON payloads with:
 *   type: 'email.delivered' | 'email.bounced' | 'email.complained' | ...
 *   data: { email_id, from, to, subject, ... }
 */

/** Verify a Svix-signed payload (https://docs.svix.com/receiving/verifying-payloads/how-manual). */
function verifySvixSignature(secret: string, req: NextRequest, rawBody: string): boolean {
  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signatureHeader = req.headers.get('svix-signature')
  if (!id || !timestamp || !signatureHeader) return false

  // Secret is "whsec_<base64>"; the bytes after the prefix are the HMAC key.
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signedContent = `${id}.${timestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64')

  // Header is a space-separated list of "v1,<sig>" entries.
  return signatureHeader.split(' ').some(part => {
    const sig = part.split(',')[1]
    if (!sig) return false
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // Verify signature when a secret is configured. If unset, fail open with a
  // warning so event ingestion keeps working, but log it loudly.
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    if (!verifySvixSignature(secret, request, rawBody)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else {
    console.warn('[emails/webhook] RESEND_WEBHOOK_SECRET unset — skipping signature verification')
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

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
      // opened_count is owned by the open pixel (track/open), which dedupes per
      // subscriber. Recording the event here is fine; incrementing would double-count.
      break
    case 'email.clicked':
      ourType = 'click'
      // clicked_count is owned by the click redirect (track/click); don't double-count.
      break
    default:
      // Unhandled event type, acknowledge but don't process
      return NextResponse.json({ ok: true, ignored: true })
  }

  // Try to find the send_id from email headers/tags
  // Resend includes custom headers in the webhook data
  const tags = (data.tags as Record<string, string>) || {}
  const sendId = tags.send_id || null
  const eventId = request.headers.get('svix-id') // unique per webhook delivery → idempotency key

  if (sendId && ourType) {
    // Idempotent insert: a retry with the same svix-id is skipped (unique index on
    // provider_event_id), and we only bump the counter when the row is actually new.
    const { data: insertedRows, error } = await supabaseAdmin
      .from('email_events')
      .upsert(
        {
          send_id: sendId,
          event_type: ourType,
          provider_event_id: eventId,
          metadata: {
            resend_event: eventType,
            email_id: data.email_id,
            to: data.to,
          },
        },
        { onConflict: 'provider_event_id', ignoreDuplicates: true },
      )
      .select('id')

    const isNew = !error && (insertedRows?.length ?? 0) > 0

    // Increment counter only for newly-recorded events
    if (isNew && counterColumn) {
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
