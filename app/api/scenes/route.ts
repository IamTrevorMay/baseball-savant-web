import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// For now we use a hardcoded user ID since auth isn't wired up yet.
// Replace with real auth when Supabase Auth is integrated.
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')

    const { data, error } = await supabase
      .from('scenes')
      .select('id, name, thumbnail_url, width, height, updated_at, created_at')
      .eq('user_id', DEFAULT_USER_ID)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ scenes: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, config, width, height, thumbnail_url } = body

    const { data, error } = await supabase
      .from('scenes')
      .insert({
        user_id: DEFAULT_USER_ID,
        name: name || 'Untitled Scene',
        config,
        width: width || 1920,
        height: height || 1080,
        thumbnail_url: thumbnail_url || null,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ id: data.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
