import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')

    const { data, error } = await supabase
      .from('custom_templates')
      .select('id, name, description, category, icon, width, height, base_template_id, updated_at, created_at')
      .eq('user_id', DEFAULT_USER_ID)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ templates: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, description, category, icon, width, height, background, elements, input_fields, data_query, base_template_id } = body

    const { data, error } = await supabase
      .from('custom_templates')
      .insert({
        user_id: DEFAULT_USER_ID,
        name: name || 'Untitled Template',
        description: description || '',
        category: category || 'custom',
        icon: icon || '{}',
        width: width || 1920,
        height: height || 1080,
        background: background || '#09090b',
        elements: elements || [],
        input_fields: input_fields || [],
        data_query: data_query || null,
        base_template_id: base_template_id || null,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ id: data.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
