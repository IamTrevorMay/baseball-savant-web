import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const { data: audience, error } = await supabaseAdmin
      .from('email_audiences')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !audience) {
      return NextResponse.json({ error: 'Audience not found' }, { status: 404 })
    }

    // Get active subscriber count
    const { count, error: countError } = await supabaseAdmin
      .from('email_audience_members')
      .select('*', { count: 'exact', head: true })
      .eq('audience_id', id)
      .eq('is_active', true)

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    return NextResponse.json({
      audience: { ...audience, subscriber_count: count ?? 0 },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('email_audiences')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Audience not found' }, { status: 404 })

    return NextResponse.json({ audience: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // Delete audience members first (cascade)
    await supabaseAdmin
      .from('email_audience_members')
      .delete()
      .eq('audience_id', id)

    // Delete the audience
    const { error } = await supabaseAdmin
      .from('email_audiences')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
