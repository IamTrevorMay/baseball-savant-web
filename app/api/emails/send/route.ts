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

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { product_id, template_id, send_type, audience_ids, test_emails, subject_override } = body

  if (!product_id || !template_id) {
    return NextResponse.json({ error: 'product_id and template_id required' }, { status: 400 })
  }

  // Fetch product + template
  const [{ data: product }, { data: template }] = await Promise.all([
    supabaseAdmin.from('email_products').select('*').eq('id', product_id).single(),
    supabaseAdmin.from('email_templates').select('*').eq('id', template_id).single(),
  ])

  if (!product || !template) {
    return NextResponse.json({ error: 'Product or template not found' }, { status: 404 })
  }

  const prod = product as unknown as EmailProduct
  const tmpl = template as unknown as EmailTemplate
  const branding = prod.branding as ProductBranding
  const settings = tmpl.settings as TemplateSettings

  // Compute date
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  et.setDate(et.getDate() - 1)
  const sendDate = et.toISOString().slice(0, 10)

  // Resolve data bindings
  const bindingData = await resolveAllBindings(tmpl.blocks, sendDate)

  // Build subject
  const dateShort = new Date(sendDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const subject = subject_override || tmpl.subject_template
    .replace(/\{\{title\}\}/g, prod.name)
    .replace(/\{\{date_short\}\}/g, dateShort)
    .replace(/\{\{date\}\}/g, sendDate)

  // Create send record
  const { data: sendRecord, error: sendErr } = await supabaseAdmin
    .from('email_sends')
    .insert({
      product_id,
      template_id,
      send_type: send_type || 'campaign',
      subject,
      date: sendDate,
      audience_ids: audience_ids || [],
      status: 'sending',
    })
    .select('id')
    .single()

  if (sendErr || !sendRecord) {
    return NextResponse.json({ error: 'Failed to create send record' }, { status: 500 })
  }

  const sendId = sendRecord.id

  try {
    // Determine recipients
    let recipients: { email: string; name?: string; subscriber_id?: string; unsubscribe_token?: string }[] = []

    if (send_type === 'test') {
      // Test send: use provided emails directly
      recipients = (test_emails || []).map((e: string) => ({ email: e }))
    } else {
      // Campaign send: fetch from audiences
      const targetAudiences = audience_ids && audience_ids.length > 0
        ? audience_ids
        : null

      let query = supabaseAdmin
        .from('email_audience_members')
        .select('subscriber_id, email_subscribers(id, encrypted_email, encrypted_name, unsubscribe_token)')
        .eq('is_active', true)

      if (targetAudiences) {
        query = query.in('audience_id', targetAudiences)
      }

      const { data: members } = await query

      // Dedupe by subscriber_id
      const seen = new Set<string>()
      for (const m of (members || [])) {
        const sub = (m as any).email_subscribers
        if (!sub || seen.has(sub.id)) continue
        seen.add(sub.id)
        try {
          recipients.push({
            email: decrypt(sub.encrypted_email),
            name: sub.encrypted_name ? decrypt(sub.encrypted_name) : undefined,
            subscriber_id: sub.id,
            unsubscribe_token: sub.unsubscribe_token,
          })
        } catch {
          // Skip subscribers with decryption errors
        }
      }
    }

    if (recipients.length === 0) {
      await supabaseAdmin
        .from('email_sends')
        .update({ status: 'sent', recipient_count: 0, sent_at: new Date().toISOString() })
        .eq('id', sendId)
      return NextResponse.json({ ok: true, send_id: sendId, recipients: 0 })
    }

    // Render a single HTML (shared for all recipients, with per-recipient unsubscribe swapped later)
    const baseHtml = renderEmail({
      blocks: tmpl.blocks,
      branding,
      settings,
      data: bindingData,
      subject,
      date: sendDate,
      unsubscribeUrl: '{{unsubscribe_url}}',
    })

    // Send in batches
    let totalSent = 0
    const errors: string[] = []

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE)

      const emails = batch.map(r => {
        const unsubUrl = r.unsubscribe_token
          ? `${SITE_URL}/api/emails/unsubscribe?token=${r.unsubscribe_token}`
          : ''
        const html = baseHtml.replace(/\{\{unsubscribe_url\}\}/g, unsubUrl)

        return {
          from: `${branding.fromName} <${branding.fromEmail || 'noreply@tritonapex.io'}>`,
          to: r.email,
          subject,
          html,
          headers: unsubUrl ? {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          } : undefined,
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

    // Update send record
    const status = errors.length === 0 ? 'sent' : (totalSent > 0 ? 'sent' : 'failed')
    await supabaseAdmin
      .from('email_sends')
      .update({
        status,
        recipient_count: totalSent,
        rendered_html: baseHtml.slice(0, 500000), // Cap stored HTML
        sent_at: new Date().toISOString(),
        error: errors.length > 0 ? errors.join('; ') : null,
      })
      .eq('id', sendId)

    return NextResponse.json({
      ok: true,
      send_id: sendId,
      recipients: totalSent,
      total: recipients.length,
      status,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabaseAdmin
      .from('email_sends')
      .update({ status: 'failed', error: msg, sent_at: new Date().toISOString() })
      .eq('id', sendId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
