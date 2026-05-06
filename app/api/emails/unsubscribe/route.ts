import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * GET  — Token-based unsubscribe (link in email). Returns HTML page.
 * POST — RFC 8058 one-click unsubscribe. Returns JSON.
 */

async function unsubscribeByToken(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!token) return { ok: false, error: 'Missing token' }

  // Find subscriber by unsubscribe_token
  const { data: subscriber, error } = await supabaseAdmin
    .from('email_subscribers')
    .select('id')
    .eq('unsubscribe_token', token)
    .single()

  if (error || !subscriber) {
    return { ok: false, error: 'Invalid or expired unsubscribe link' }
  }

  // Deactivate all audience memberships
  const { error: updateError } = await supabaseAdmin
    .from('email_audience_members')
    .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
    .eq('subscriber_id', subscriber.id)
    .eq('is_active', true)

  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  return { ok: true }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''

  const result = await unsubscribeByToken(token)

  // Return an HTML page regardless of success/error
  const html = result.ok
    ? `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unsubscribed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #09090b; color: #d4d4d8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 48px; max-width: 440px; text-align: center; }
    h1 { color: #34d399; font-size: 24px; margin: 0 0 16px; }
    p { font-size: 16px; line-height: 1.5; margin: 0; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="card">
    <h1>You've been unsubscribed</h1>
    <p>You will no longer receive emails from us. If this was a mistake, you can re-subscribe at any time.</p>
  </div>
</body>
</html>`
    : `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unsubscribe Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #09090b; color: #d4d4d8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 48px; max-width: 440px; text-align: center; }
    h1 { color: #f87171; font-size: 24px; margin: 0 0 16px; }
    p { font-size: 16px; line-height: 1.5; margin: 0; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Something went wrong</h1>
    <p>${escapeHtml(result.error || 'Unable to process your unsubscribe request. Please try again or contact support.')}</p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    status: result.ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = body.token || ''

    const result = await unsubscribeByToken(token)

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
