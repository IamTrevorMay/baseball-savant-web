import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { buildNewsletterHtml, highlightsToStandouts, fetchLatestSubstackPost, type NewsletterData } from '@/lib/newsletterHtml'

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
    .select('title, content, summary, metadata')
    .eq('date', briefDate)
    .maybeSingle()

  if (!brief) {
    return NextResponse.json({ error: 'No brief found for ' + briefDate }, { status: 404 })
  }

  const metadata = brief.metadata || {}
  const claudeSections = metadata.claude_sections || {}
  const dailyHighlights = metadata.daily_highlights

  // Fetch trends
  const currentYear = new Date(briefDate).getFullYear()
  let surges: any[] = []
  let concerns: any[] = []

  try {
    const [pitcherTrends, hitterTrends] = await Promise.all([
      fetchTrends(currentYear, 'pitcher'),
      fetchTrends(currentYear, 'hitter'),
    ])
    const allTrends = [...pitcherTrends, ...hitterTrends]
    surges = allTrends.filter(t => t.sentiment === 'good').sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma)).slice(0, 5)
    concerns = allTrends.filter(t => t.sentiment === 'bad').sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma)).slice(0, 5)
  } catch {
    // Trends are optional — continue without them
  }

  const standouts = highlightsToStandouts(dailyHighlights)

  // Fetch latest Substack post
  let latestPost: NewsletterData['latestPost'] = null
  try { latestPost = await fetchLatestSubstackPost() } catch { /* optional */ }

  const newsletterData: NewsletterData = {
    date: briefDate,
    title: brief.title || 'Mayday Daily',
    scores: metadata.scores || [],
    topPerformances: claudeSections.topPerformances || '',
    worstPerformances: claudeSections.worstPerformances || '',
    injuries: claudeSections.injuries || '',
    transactions: claudeSections.transactions || '',
    standouts,
    surges,
    concerns,
    latestPost,
    unsubscribeUrl: `${SITE_URL}/api/newsletter/unsubscribe?token=preview`,
  }

  const html = buildNewsletterHtml(newsletterData)

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function fetchTrends(season: number, playerType: 'pitcher' | 'hitter') {
  try {
    const resp = await fetch(`${SITE_URL}/api/trends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season, playerType }),
    })
    if (!resp.ok) return []
    const data = await resp.json()
    return data.rows || []
  } catch {
    return []
  }
}
