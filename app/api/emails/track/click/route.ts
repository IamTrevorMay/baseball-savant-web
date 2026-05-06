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

  // Validate URL
  try {
    new URL(targetUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (sid) {
    // Record click event (fire-and-forget)
    void (async () => {
      try {
        await supabaseAdmin.from('email_events').insert({
          send_id: sid,
          subscriber_id: sub || null,
          event_type: 'click',
          link_url: targetUrl,
        })
        await supabaseAdmin.rpc('increment_email_send_counter', {
          p_send_id: sid,
          p_column: 'clicked_count',
        })
      } catch { /* fire-and-forget */ }
    })()
  }

  return NextResponse.redirect(targetUrl, 302)
}
