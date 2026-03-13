import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('report_card_templates')
      .select('*')
      .eq('user_id', DEFAULT_USER_ID)
      .order('updated_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const templates = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      width: row.width,
      height: row.height,
      background: row.background,
      elements: row.elements || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))

    return NextResponse.json({ templates })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { data, error } = await supabase
      .from('report_card_templates')
      .insert({
        user_id: DEFAULT_USER_ID,
        name: body.name || 'Untitled Report Card',
        description: body.description || '',
        category: body.category || 'custom',
        width: body.width || 1920,
        height: body.height || 1080,
        background: body.background || '#09090b',
        elements: body.elements || [],
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ id: data.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
