import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { renderCardToPNG } from '@/lib/serverRenderCard'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('daily_cards')
    .select('scene')
    .eq('id', id)
    .maybeSingle()

  if (error || !data?.scene) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  }

  try {
    const png = await renderCardToPNG(data.scene)

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Render failed', detail: msg }, { status: 500 })
  }
}
