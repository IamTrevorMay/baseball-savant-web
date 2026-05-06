import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * GET /api/emails/analytics/export?product_id=...
 *
 * Exports all sends for a product as a downloadable CSV file with columns:
 * date, subject, recipients, opens, clicks, bounces, open_rate, click_rate
 */
export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get('product_id')

    if (!productId) {
      return NextResponse.json(
        { error: 'Missing required query param: product_id' },
        { status: 400 }
      )
    }

    // Verify product exists
    const { data: product } = await supabaseAdmin
      .from('email_products')
      .select('id, name, slug')
      .eq('id', productId)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Fetch all sends
    const { data: sends, error: sendsError } = await supabaseAdmin
      .from('email_sends')
      .select('subject, sent_at, date, recipient_count, opened_count, clicked_count, bounced_count, status')
      .eq('product_id', productId)
      .order('sent_at', { ascending: false })

    if (sendsError) {
      return NextResponse.json({ error: sendsError.message }, { status: 500 })
    }

    // Build CSV
    const header = 'date,subject,recipients,opens,clicks,bounces,open_rate,click_rate'
    const rows = (sends || []).map(s => {
      const recipients = s.recipient_count || 0
      const opens = s.opened_count || 0
      const clicks = s.clicked_count || 0
      const bounces = s.bounced_count || 0
      const openRate = recipients > 0 ? (opens / recipients * 100).toFixed(1) : '0.0'
      const clickRate = recipients > 0 ? (clicks / recipients * 100).toFixed(1) : '0.0'
      const date = s.sent_at || s.date || ''

      // Escape subject for CSV (wrap in quotes, escape internal quotes)
      const escapedSubject = `"${(s.subject || '').replace(/"/g, '""')}"`

      return `${date},${escapedSubject},${recipients},${opens},${clicks},${bounces},${openRate}%,${clickRate}%`
    })

    const csv = [header, ...rows].join('\n')
    const filename = `${product.slug || 'email'}-analytics-${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
