import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { buildNewsletterHtml, highlightsToStandouts, fetchLatestSubstackPost } from '@/lib/newsletterHtml'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tritonapex.io'

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get('date')

  // Default to yesterday in ET
  let briefDate: string
  if (dateParam) {
    briefDate = dateParam
  } else {
    const now = new Date()
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    et.setDate(et.getDate() - 1)
    briefDate = et.toISOString().slice(0, 10)
  }

  // Fetch the brief
  const { data: brief } = await supabaseAdmin
    .from('briefs')
    .select('title, metadata')
    .eq('date', briefDate)
    .maybeSingle()

  if (!brief) {
    return NextResponse.json({ error: 'No brief found for ' + briefDate }, { status: 404 })
  }

  const meta = brief.metadata as any || {}

  // Fetch latest Substack post (optional)
  let latestPost = null
  try { latestPost = await fetchLatestSubstackPost() } catch { /* optional */ }

  const html = buildNewsletterHtml({
    date: briefDate,
    title: brief.title || 'Mayday Daily',
    scores: meta.scores || [],
    standouts: highlightsToStandouts(meta.daily_highlights),
    surges: meta.trend_alerts?.surges || [],
    concerns: meta.trend_alerts?.concerns || [],
    topPerformances: meta.claude_sections?.topPerformances || '',
    worstPerformances: meta.claude_sections?.worstPerformances || '',
    injuries: meta.claude_sections?.injuries || '',
    transactions: meta.claude_sections?.transactions || '',
    latestPost,
    unsubscribeUrl: `${SITE_URL}/api/newsletter/unsubscribe?token=preview`,
  })

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
