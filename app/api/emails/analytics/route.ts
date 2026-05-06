import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
      .select('id')
      .eq('id', productId)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Fetch all sends for this product
    const { data: sends, error: sendsError } = await supabaseAdmin
      .from('email_sends')
      .select('id, subject, sent_at, recipient_count, delivered_count, opened_count, clicked_count, bounced_count, status')
      .eq('product_id', productId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })

    if (sendsError) {
      return NextResponse.json({ error: sendsError.message }, { status: 500 })
    }

    const allSends = sends || []

    // Aggregate totals
    let totalRecipients = 0
    let totalOpened = 0
    let totalClicked = 0
    let totalBounced = 0

    const recentSends = allSends.slice(0, 10).map(s => {
      const recipients = s.recipient_count || 0
      totalRecipients += recipients
      totalOpened += s.opened_count || 0
      totalClicked += s.clicked_count || 0
      totalBounced += s.bounced_count || 0

      return {
        id: s.id,
        subject: s.subject,
        sent_at: s.sent_at,
        recipient_count: recipients,
        open_rate: recipients > 0 ? (s.opened_count || 0) / recipients : 0,
        click_rate: recipients > 0 ? (s.clicked_count || 0) / recipients : 0,
        bounce_rate: recipients > 0 ? (s.bounced_count || 0) / recipients : 0,
      }
    })

    // For overall averages, use all sends
    for (let i = 10; i < allSends.length; i++) {
      const s = allSends[i]
      totalRecipients += s.recipient_count || 0
      totalOpened += s.opened_count || 0
      totalClicked += s.clicked_count || 0
      totalBounced += s.bounced_count || 0
    }

    const avgOpenRate = totalRecipients > 0 ? totalOpened / totalRecipients : 0
    const avgClickRate = totalRecipients > 0 ? totalClicked / totalRecipients : 0
    const avgBounceRate = totalRecipients > 0 ? totalBounced / totalRecipients : 0

    return NextResponse.json({
      product_id: productId,
      total_sends: allSends.length,
      total_recipients: totalRecipients,
      avg_open_rate: avgOpenRate,
      avg_click_rate: avgClickRate,
      avg_bounce_rate: avgBounceRate,
      recent_sends: recentSends,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
