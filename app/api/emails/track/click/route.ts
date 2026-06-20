import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const sid = request.nextUrl.searchParams.get('sid')
  const sub = request.nextUrl.searchParams.get('sub')
  const r = request.nextUrl.searchParams.get('r')

  if (!r) {
    return NextResponse.json({ error: 'Missing redirect URL' }, { status: 400 })
  }

  // Decode the original URL
  let targetUrl: string
  try {
    targetUrl = Buffer.from(r, 'base64url').toString('utf-8')
  } catch {
    return NextResponse.json({ error: 'Invalid redirect URL' }, { status: 400 })
  }

  // Validate URL — restrict to http(s) so a crafted tracking link can't redirect
  // recipients to a javascript:/data:/other-scheme target. (Arbitrary external
  // hosts are allowed by design; emails legitimately link anywhere.)
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Disallowed redirect protocol' }, { status: 400 })
  }

  if (sid) {
    // Await the write so the serverless function can't freeze before it lands.
    // clicked_count tracks UNIQUE clickers: only increment on a subscriber's first
    // click for this send (individual link rows are still recorded for audit). The
    // Resend webhook no longer touches clicked_count (this redirect owns it).
    try {
      let isFirstClick = true
      if (sub) {
        const { count } = await supabaseAdmin
          .from('email_events')
          .select('id', { count: 'exact', head: true })
          .eq('send_id', sid)
          .eq('subscriber_id', sub)
          .eq('event_type', 'click')
        isFirstClick = (count ?? 0) === 0
      }

      await supabaseAdmin.from('email_events').insert({
        send_id: sid,
        subscriber_id: sub || null,
        event_type: 'click',
        link_url: targetUrl,
      })

      if (isFirstClick) {
        await supabaseAdmin.rpc('increment_email_send_counter', {
          p_send_id: sid,
          p_column: 'clicked_count',
        })
      }
    } catch { /* best-effort tracking */ }
  }

  return NextResponse.redirect(targetUrl, 302)
}
