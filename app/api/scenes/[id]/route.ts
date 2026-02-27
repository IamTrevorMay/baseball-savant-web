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
      .from('scenes')
      .select('*')
      .eq('id', id)
      .eq('user_id', DEFAULT_USER_ID)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ scene: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.config !== undefined) updates.config = body.config
    if (body.name !== undefined) updates.name = body.name
    if (body.thumbnail_url !== undefined) updates.thumbnail_url = body.thumbnail_url
    if (body.width !== undefined) updates.width = body.width
    if (body.height !== undefined) updates.height = body.height

    const { error } = await supabase
      .from('scenes')
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
      .from('scenes')
      .delete()
      .eq('id', id)
      .eq('user_id', DEFAULT_USER_ID)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
