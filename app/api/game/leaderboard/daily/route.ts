import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { gameDay } from '@/lib/gameConstants'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const year = Number(params.get('year') || '2024')
  const type = params.get('type') || 'pitcher'
  const date = gameDay()

  const { data, error, count } = await supabaseAdmin
    .from('game_scores')
    .select('player_uuid, display_name, score, won, guesses, hints_used', { count: 'exact' })
    .eq('puzzle_date', date)
    .eq('puzzle_year', year)
    .eq('puzzle_type', type)
    .order('score', { ascending: false })
    .order('guesses', { ascending: true })
    .order('hints_used', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { scores: data ?? [], total: count ?? 0 },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=15' } }
  )
}
