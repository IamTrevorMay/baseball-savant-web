import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const latest = req.nextUrl.searchParams.get('latest')
  const date = req.nextUrl.searchParams.get('date')

  // Full cards for a specific date
  if (date) {
    const { data, error } = await supabase
      .from('daily_cards')
      .select('*')
      .eq('date', date)
      .order('rank', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No cards found' }, { status: 404 })
    }
    return NextResponse.json({ cards: data })
  }

  // Latest date's cards
  if (latest === 'true') {
    // Find most recent date
    const { data: recent, error: recentErr } = await supabase
      .from('daily_cards')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentErr) return NextResponse.json({ error: recentErr.message }, { status: 500 })
    if (!recent) return NextResponse.json({ cards: [] })

    const { data, error } = await supabase
      .from('daily_cards')
      .select('*')
      .eq('date', recent.date)
      .order('rank', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ cards: data || [] })
  }

  // Archive: last 30 dates with pitcher names, no scene JSON
  const { data, error } = await supabase
    .from('daily_cards')
    .select('id, date, pitcher_id, pitcher_name, game_info, ip, pitch_count, rank')
    .order('date', { ascending: false })
    .order('rank', { ascending: true })
    .limit(150)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by date
  const byDate: Record<string, any[]> = {}
  for (const card of (data || [])) {
    if (!byDate[card.date]) byDate[card.date] = []
    byDate[card.date].push(card)
  }

  const archive = Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 30)
    .map(([date, cards]) => ({
      date,
      pitchers: cards.map(c => ({
        pitcher_name: c.pitcher_name,
        game_info: c.game_info,
        ip: c.ip,
        pitch_count: c.pitch_count,
        rank: c.rank,
      })),
    }))

  return NextResponse.json({ archive })
}
