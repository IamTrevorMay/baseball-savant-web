import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// GET: browser-friendly unsubscribe via link click
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse(buildPage('Missing unsubscribe token.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const { error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)

  if (error) {
    return new NextResponse(buildPage('Something went wrong. Please try again.', false), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return new NextResponse(buildPage("You've been unsubscribed from Mayday Daily.", true), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// POST: one-click unsubscribe per RFC 8058 (List-Unsubscribe-Post header)
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, unsubscribed: true })
}

function buildPage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${success ? 'Unsubscribed' : 'Error'} — Mayday Daily</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px;max-width:400px;">
    <p style="font-size:24px;font-weight:800;color:#f0f0f0;margin:0 0 12px;">MAYDAY DAILY</p>
    <p style="font-size:14px;color:${success ? '#34d399' : '#f87171'};margin:0 0 24px;">${message}</p>
    <a href="https://www.tritonapex.io" style="font-size:12px;color:#71717a;text-decoration:none;">Back to Triton Apex</a>
  </div>
</body>
</html>`
}
