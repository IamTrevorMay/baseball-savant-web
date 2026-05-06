import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/encryption'
import { renderEmail } from '@/lib/emails/renderBlock'
import { resolveAllBindings } from '@/lib/emails/resolveBindings'
import type { EmailProduct, EmailTemplate, ProductBranding, TemplateSettings } from '@/lib/emailTypes'

export const maxDuration = 120

const resend = new Resend(process.env.RESEND_API_KEY)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tritonapex.io'
const BATCH_SIZE = 100

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Compute yesterday's date in ET
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  et.setDate(et.getDate() - 1)
  const sendDate = et.toISOString().slice(0, 10)
  const month = et.getMonth() + 1

  // Fetch all active recurring products
  const { data: products } = await supabaseAdmin
    .from('email_products')
    .select('*')
    .eq('is_active', true)
    .eq('product_type', 'recurring')

  if (!products || products.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_active_products' })
  }

  const results: Record<string, unknown>[] = []

  for (const rawProduct of products) {
    const product = rawProduct as unknown as EmailProduct
    const schedule = product.schedule

    // Skip if month is in skipMonths
    if (schedule?.skipMonths?.includes(month)) {
      results.push({ product: product.name, skipped: true, reason: 'skip_month' })
      continue
    }

    // Idempotency: check if already sent today for this product
    const { data: existingSend } = await supabaseAdmin
      .from('email_sends')
      .select('id, status')
      .eq('product_id', product.id)
      .eq('date', sendDate)
      .eq('send_type', 'recurring')
      .eq('status', 'sent')
      .maybeSingle()

    if (existingSend) {
      results.push({ product: product.name, skipped: true, reason: 'already_sent' })
      continue
    }

    // Fetch active template
    const { data: template } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (!template) {
      results.push({ product: product.name, skipped: true, reason: 'no_active_template' })
      continue
    }

    const tmpl = template as unknown as EmailTemplate
    const branding = product.branding as ProductBranding
    const settings = tmpl.settings as TemplateSettings

    try {
      // Resolve data bindings
      const bindingData = await resolveAllBindings(tmpl.blocks, sendDate)

      // Build subject
      const dateShort = new Date(sendDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const subject = tmpl.subject_template
        .replace(/\{\{title\}\}/g, product.name)
        .replace(/\{\{date_short\}\}/g, dateShort)
        .replace(/\{\{date\}\}/g, sendDate)

      // Fetch subscribers from all audiences for this product
      const { data: audiences } = await supabaseAdmin
        .from('email_audiences')
        .select('id')
        .eq('product_id', product.id)

      const audienceIds = (audiences || []).map((a: any) => a.id)

      let recipients: { email: string; subscriber_id: string; unsubscribe_token: string }[] = []

      if (audienceIds.length > 0) {
        const { data: members } = await supabaseAdmin
          .from('email_audience_members')
          .select('subscriber_id, email_subscribers(id, encrypted_email, unsubscribe_token)')
          .eq('is_active', true)
          .in('audience_id', audienceIds)

        const seen = new Set<string>()
        for (const m of (members || [])) {
          const sub = (m as any).email_subscribers
          if (!sub || seen.has(sub.id)) continue
          seen.add(sub.id)
          try {
            recipients.push({
              email: decrypt(sub.encrypted_email),
              subscriber_id: sub.id,
              unsubscribe_token: sub.unsubscribe_token,
            })
          } catch { /* skip */ }
        }
      }

      // Create send record
      const { data: sendRecord } = await supabaseAdmin
        .from('email_sends')
        .insert({
          product_id: product.id,
          template_id: tmpl.id,
          send_type: 'recurring',
          subject,
          date: sendDate,
          audience_ids: audienceIds,
          status: recipients.length === 0 ? 'sent' : 'sending',
          recipient_count: 0,
        })
        .select('id')
        .single()

      if (!sendRecord || recipients.length === 0) {
        results.push({ product: product.name, recipients: 0, status: 'sent' })
        continue
      }

      const sendId = sendRecord.id

      // Render base HTML
      const baseHtml = renderEmail({
        blocks: tmpl.blocks,
        branding,
        settings,
        data: bindingData,
        subject,
        date: sendDate,
        unsubscribeUrl: '{{unsubscribe_url}}',
      })

      // Add open tracking pixel and rewrite links for click tracking
      const trackedHtml = addTracking(baseHtml, sendId)

      // Send in batches
      let totalSent = 0
      const errors: string[] = []

      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE)

        const emails = batch.map(r => {
          const unsubUrl = `${SITE_URL}/api/emails/unsubscribe?token=${r.unsubscribe_token}`
          let html = trackedHtml
            .replace(/\{\{unsubscribe_url\}\}/g, unsubUrl)
          // Add per-recipient open pixel
          html = html.replace(
            '</body>',
            `<img src="${SITE_URL}/api/emails/track/open?sid=${sendId}&sub=${r.subscriber_id}" width="1" height="1" style="display:none;" alt="" /></body>`
          )

          return {
            from: `${branding.fromName} <${branding.fromEmail || 'noreply@tritonapex.io'}>`,
            to: r.email,
            subject,
            html,
            headers: {
              'List-Unsubscribe': `<${unsubUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        })

        try {
          const { error: batchError } = await resend.batch.send(emails)
          if (batchError) {
            errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${batchError.message}`)
          } else {
            totalSent += batch.length
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${msg}`)
        }
      }

      const status = errors.length === 0 ? 'sent' : (totalSent > 0 ? 'sent' : 'failed')
      await supabaseAdmin
        .from('email_sends')
        .update({
          status,
          recipient_count: totalSent,
          rendered_html: baseHtml.slice(0, 500000),
          sent_at: new Date().toISOString(),
          error: errors.length > 0 ? errors.join('; ') : null,
        })
        .eq('id', sendId)

      results.push({ product: product.name, send_id: sendId, recipients: totalSent, status, errors: errors.length > 0 ? errors : undefined })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ product: product.name, error: msg })
    }
  }

  return NextResponse.json({ ok: true, date: sendDate, results })
}

/**
 * Rewrite <a href="..."> links to pass through click tracking.
 * Skips unsubscribe links and mailto: links.
 */
function addTracking(html: string, sendId: string): string {
  return html.replace(
    /<a\s([^>]*?)href="([^"]+)"([^>]*?)>/gi,
    (match, before, url, after) => {
      // Skip unsubscribe, mailto, and tracking URLs
      if (url.includes('unsubscribe') || url.startsWith('mailto:') || url.includes('/api/emails/track/')) {
        return match
      }
      const encodedUrl = Buffer.from(url).toString('base64url')
      const trackUrl = `${SITE_URL}/api/emails/track/click?sid=${sendId}&r=${encodedUrl}`
      return `<a ${before}href="${trackUrl}"${after}>`
    }
  )
}
