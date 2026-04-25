/**
 * POST /api/imagine/render
 *
 * Body: { widget_id: string, filters: object, size: { width, height, label } }
 * Returns: image/png bytes.
 *
 * Used both for the Imagine live preview and the Export button.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renderCardToPNG } from '@/lib/serverRenderCard'
import { getWidget } from '@/lib/imagine/registry'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { widget_id, filters, size } = body || {}
  if (!widget_id || !filters || !size) {
    return NextResponse.json({ error: 'Missing widget_id, filters, or size' }, { status: 400 })
  }

  const widget = getWidget(widget_id)
  if (!widget) {
    return NextResponse.json({ error: `Unknown widget: ${widget_id}` }, { status: 404 })
  }

  const origin = req.nextUrl.origin

  try {
    const data = await widget.fetchData(filters, origin)
    const scene = widget.buildScene(filters, data, size)
    const png = await renderCardToPNG(scene)

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Render failed', detail: msg }, { status: 500 })
  }
}
