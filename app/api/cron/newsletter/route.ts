import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { buildNewsletterHtml, highlightsToStandouts, fetchLatestSubstackPost } from '@/lib/newsletterHtml'

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
  const briefDate = et.toISOString().slice(0, 10)

  // Skip offseason (Dec, Jan)
  const month = et.getMonth() + 1
  if (month === 12 || month === 1) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'offseason' })
  }

  // Idempotency: check newsletter_sends
  const { data: existingSend } = await supabaseAdmin
    .from('newsletter_sends')
    .select('id, status')
    .eq('date', briefDate)
    .maybeSingle()

  if (existingSend?.status === 'sent') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already_sent', date: briefDate })
  }

  try {
    // Fetch the brief for this date
    const { data: brief } = await supabaseAdmin
      .from('briefs')
      .select('title, content, summary, metadata')
      .eq('date', briefDate)
      .maybeSingle()

    if (!brief) {
      return NextResponse.json({ error: 'Brief not found for ' + briefDate, hint: 'Run /api/cron/briefs first' }, { status: 404 })
    }

    const meta = brief.metadata as any || {}

    // Fetch latest Substack post
    const latestPost = await fetchLatestSubstackPost()

    // Fetch active subscribers
    const { data: subscribers, error: subError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('email, name, unsubscribe_token')
      .eq('is_active', true)

    if (subError) {
      return NextResponse.json({ error: 'Failed to fetch subscribers: ' + subError.message }, { status: 500 })
    }

    if (!subscribers || subscribers.length === 0) {
      // Record send with 0 recipients
      await upsertSend(briefDate, 0, 'sent')
      return NextResponse.json({ ok: true, date: briefDate, recipients: 0, reason: 'no_subscribers' })
    }

    // Build and send emails in batches
    let totalSent = 0
    const errors: string[] = []

    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE)

      const emails = batch.map(sub => {
        const unsubscribeUrl = `${SITE_URL}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`

        const html = buildNewsletterHtml({
          date: briefDate,
          title: brief.title || 'Mayday Daily',
          scores: meta.scores || [],
          standouts: highlightsToStandouts(meta.daily_highlights),
          surges: meta.trend_alerts?.surges || [],
          concerns: meta.trend_alerts?.concerns || [],
          topPerformances: meta.claude_sections?.topPerformances || '',
          worstPerformances: meta.claude_sections?.worstPerformances || '',
          injuries: meta.claude_sections?.injuries || '',
          transactions: meta.claude_sections?.transactions || '',
          latestPost,
          unsubscribeUrl,
        })

        return {
          from: 'Mayday Daily <noreply@tritonapex.io>',
          to: sub.email,
          subject: `${brief.title || 'Mayday Daily'} — ${formatDateShort(briefDate)}`,
          html,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
      })

      try {
        const { data: batchResult, error: batchError } = await resend.batch.send(emails)
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

    // Record send
    const status = errors.length === 0 ? 'sent' : (totalSent > 0 ? 'partial' : 'failed')
    await upsertSend(briefDate, totalSent, status, errors.length > 0 ? errors.join('; ') : undefined)

    return NextResponse.json({
      ok: true,
      date: briefDate,
      recipients: totalSent,
      total_subscribers: subscribers.length,
      status,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    await upsertSend(briefDate, 0, 'failed', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function upsertSend(date: string, recipientCount: number, status: string, error?: string) {
  await supabaseAdmin
    .from('newsletter_sends')
    .upsert({
      date,
      recipient_count: recipientCount,
      status,
      error: error || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'date' })
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
