import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/compete/review/stats
 * Aggregate CQR stats for the authenticated user.
 */
export async function GET() {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: reviews, error } = await sb
      .from('cqr_reviews')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (!reviews || reviews.length === 0) {
      return NextResponse.json({
        summary: { total: 0, avg: 0, best: 0, worst: 0 },
        byPitcher: [],
        reviews: [],
      })
    }

    const scores = reviews.map(r => r.cqr_score)
    const summary = {
      total: reviews.length,
      avg: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
      best: Math.max(...scores),
      worst: Math.min(...scores),
    }

    // Group by pitcher
    const pitcherMap: Record<string, { name: string; scores: number[] }> = {}
    for (const r of reviews) {
      const key = String(r.pitcher_id)
      if (!pitcherMap[key]) pitcherMap[key] = { name: r.pitcher_name, scores: [] }
      pitcherMap[key].scores.push(r.cqr_score)
    }

    const byPitcher = Object.entries(pitcherMap).map(([id, d]) => ({
      pitcher_id: Number(id),
      pitcher_name: d.name,
      reviews: d.scores.length,
      avg: Math.round(d.scores.reduce((s, v) => s + v, 0) / d.scores.length),
      best: Math.max(...d.scores),
    })).sort((a, b) => b.reviews - a.reviews)

    return NextResponse.json({
      summary,
      byPitcher,
      reviews: reviews.map(r => ({
        id: r.id,
        pitcher_name: r.pitcher_name,
        game_date: r.game_date,
        opponent: r.opponent,
        cqr_score: r.cqr_score,
        pitch_count: r.pitch_count,
        breakdown: r.breakdown,
        results: r.results,
        created_at: r.created_at,
      })),
    })
  } catch (err: any) {
    console.error('compete/review/stats error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
