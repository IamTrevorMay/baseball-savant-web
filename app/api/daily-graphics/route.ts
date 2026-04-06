import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { renderCardToPNG } from '@/lib/serverRenderCard'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: corsHeaders })
}

const VALID_TYPES = ['ig-starter-card', 'trends', 'yesterday-scores', 'top-pitchers', 'top-performances']

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const list = params.get('list')
  const latest = params.get('latest')
  const date = params.get('date')
  const type = params.get('type')

  // ── List mode: return available dates/types as JSON ──
  if (list === 'true') {
    const { data, error } = await supabaseAdmin
      .from('daily_graphics')
      .select('date, type, created_at')
      .order('date', { ascending: false })
      .limit(100)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
    }

    // Group by date
    const byDate: Record<string, string[]> = {}
    for (const row of (data || [])) {
      if (!byDate[row.date]) byDate[row.date] = []
      byDate[row.date].push(row.type)
    }

    return NextResponse.json({ dates: byDate }, { headers: corsHeaders })
  }

  // ── Latest without type: return JSON index of all graphics for most recent date ──
  if (latest === 'true' && !type) {
    const { data: recent } = await supabaseAdmin
      .from('daily_graphics')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!recent) {
      return NextResponse.json({ error: 'No graphics found' }, { status: 404, headers: corsHeaders })
    }

    const { data: graphics } = await supabaseAdmin
      .from('daily_graphics')
      .select('date, type, created_at')
      .eq('date', recent.date)

    const baseUrl = req.nextUrl.origin
    const items = (graphics || []).map(g => ({
      type: g.type,
      date: g.date,
      url: `${baseUrl}/api/daily-graphics?date=${g.date}&type=${g.type}`,
      created_at: g.created_at,
    }))

    return NextResponse.json({ date: recent.date, graphics: items }, { headers: corsHeaders })
  }

  // ── Render PNG mode: need a type ──
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type required, one of: ${VALID_TYPES.join(', ')}` },
      { status: 400, headers: corsHeaders }
    )
  }

  // Resolve the row
  let row: any = null

  if (latest === 'true') {
    const { data } = await supabaseAdmin
      .from('daily_graphics')
      .select('*')
      .eq('type', type)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    row = data
  } else if (date) {
    const { data } = await supabaseAdmin
      .from('daily_graphics')
      .select('*')
      .eq('date', date)
      .eq('type', type)
      .maybeSingle()
    row = data
  } else {
    return NextResponse.json(
      { error: 'Provide date=YYYY-MM-DD or latest=true' },
      { status: 400, headers: corsHeaders }
    )
  }

  if (!row) {
    return NextResponse.json(
      { error: 'Graphic not found' },
      { status: 404, headers: corsHeaders }
    )
  }

  // Render the scene to PNG
  try {
    const png = await renderCardToPNG(row.scene)
    return new NextResponse(new Uint8Array(png), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: `Render failed: ${err.message}` },
      { status: 500, headers: corsHeaders }
    )
  }
}
