import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(request: NextRequest) {
  const sid = request.nextUrl.searchParams.get('sid')
  const sub = request.nextUrl.searchParams.get('sub')

  if (sid) {
    // Record open event (fire-and-forget, don't block the pixel response)
    void (async () => {
      try {
        await supabaseAdmin.from('email_events').insert({
          send_id: sid,
          subscriber_id: sub || null,
          event_type: 'open',
        })
        await supabaseAdmin.rpc('increment_email_send_counter', {
          p_send_id: sid,
          p_column: 'opened_count',
        })
      } catch { /* fire-and-forget */ }
    })()
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
