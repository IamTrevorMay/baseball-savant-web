import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get('product_id')
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    let countQuery = supabaseAdmin
      .from('email_sends')
      .select('*', { count: 'exact', head: true })

    let dataQuery = supabaseAdmin
      .from('email_sends')
      .select('id, product_id, template_id, send_type, subject, date, recipient_count, delivered_count, opened_count, clicked_count, bounced_count, audience_ids, status, sent_at, error, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (productId) {
      countQuery = countQuery.eq('product_id', productId)
      dataQuery = dataQuery.eq('product_id', productId)
    }

    const [{ count }, { data, error }] = await Promise.all([countQuery, dataQuery])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      sends: data,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
