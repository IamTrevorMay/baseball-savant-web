import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('email_products')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ products: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, slug, product_type, branding, schedule } = body

    if (!name || !slug || !product_type) {
      return NextResponse.json(
        { error: 'Missing required fields: name, slug, product_type' },
        { status: 400 }
      )
    }

    if (!['recurring', 'campaign'].includes(product_type)) {
      return NextResponse.json(
        { error: 'product_type must be "recurring" or "campaign"' },
        { status: 400 }
      )
    }

    // Validate slug uniqueness
    const { data: existing } = await supabaseAdmin
      .from('email_products')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: `Slug "${slug}" is already in use` },
        { status: 409 }
      )
    }

    const insert: Record<string, unknown> = {
      name,
      slug,
      product_type,
    }

    if (branding) insert.branding = branding
    if (schedule) insert.schedule = schedule

    const { data, error } = await supabaseAdmin
      .from('email_products')
      .insert(insert)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ product: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
