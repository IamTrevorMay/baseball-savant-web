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

    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('product_id', productId)
      .order('version', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ templates: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { product_id, name, blocks, settings, subject_template, preheader_template } = body

    if (!product_id) {
      return NextResponse.json(
        { error: 'Missing required field: product_id' },
        { status: 400 }
      )
    }

    // Verify the product exists
    const { data: product } = await supabaseAdmin
      .from('email_products')
      .select('id')
      .eq('id', product_id)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Determine next version number
    const { data: latest } = await supabaseAdmin
      .from('email_templates')
      .select('version')
      .eq('product_id', product_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (latest?.version ?? 0) + 1

    const insert: Record<string, unknown> = {
      product_id,
      version: nextVersion,
      name: name || `v${nextVersion}`,
    }

    if (blocks) insert.blocks = blocks
    if (settings) insert.settings = settings
    if (subject_template !== undefined) insert.subject_template = subject_template
    if (preheader_template !== undefined) insert.preheader_template = preheader_template

    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .insert(insert)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ template: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
