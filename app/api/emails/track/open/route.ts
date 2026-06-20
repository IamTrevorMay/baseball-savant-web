import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(request: NextRequest) {
  const sid = request.nextUrl.searchParams.get('sid')
  const sub = request.nextUrl.searchParams.get('sub')

  if (sid) {
    // Await the write so the serverless function can't freeze before it lands.
    // opened_count tracks UNIQUE opens: only increment on a subscriber's first open
    // for this send. The Resend webhook no longer touches opened_count (this pixel
    // owns it), so opens aren't double-counted.
    try {
      let isFirstOpen = true
      if (sub) {
        const { count } = await supabaseAdmin
          .from('email_events')
          .select('id', { count: 'exact', head: true })
          .eq('send_id', sid)
          .eq('subscriber_id', sub)
          .eq('event_type', 'open')
        isFirstOpen = (count ?? 0) === 0
      }

      await supabaseAdmin.from('email_events').insert({
        send_id: sid,
        subscriber_id: sub || null,
        event_type: 'open',
      })

      if (isFirstOpen) {
        await supabaseAdmin.rpc('increment_email_send_counter', {
          p_send_id: sid,
          p_column: 'opened_count',
        })
      }
    } catch { /* best-effort tracking */ }
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
