import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data, error } = await supabase
      .from('custom_templates')
      .select('*')
      .eq('id', id)
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })

    const template = {
      id: data.id,
      name: data.name,
      description: data.description,
      category: data.category,
      icon: data.icon,
      width: data.width,
      height: data.height,
      background: data.background,
      elements: data.elements || [],
      schemaType: data.input_fields?.schemaType || 'generic',
      inputFields: data.input_fields?.configFields || [],
      repeater: data.data_query || null,
      base_template_id: data.base_template_id,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.category !== undefined) updates.category = body.category
    if (body.icon !== undefined) updates.icon = body.icon
    if (body.width !== undefined) updates.width = body.width
    if (body.height !== undefined) updates.height = body.height
    if (body.background !== undefined) updates.background = body.background
    if (body.elements !== undefined) updates.elements = body.elements
    if (body.schemaType !== undefined || body.inputFields !== undefined) {
      updates.input_fields = {
        schemaType: body.schemaType ?? 'generic',
        configFields: body.inputFields || [],
      }
    }
    if (body.repeater !== undefined) updates.data_query = body.repeater

    const { error } = await supabase
      .from('custom_templates')
      .update(updates)
      .eq('id', id)
      .eq('user_id', DEFAULT_USER_ID)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { error } = await supabase
      .from('custom_templates')
      .delete()
      .eq('id', id)
      .eq('user_id', DEFAULT_USER_ID)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
