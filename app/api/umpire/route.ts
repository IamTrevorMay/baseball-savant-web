import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'leaderboard') {
    const { data, error } = await supabase.rpc('run_query', {
      query_text: `
        SELECT u.hp_umpire,
          COUNT(DISTINCT u.game_pk) as games,
          MIN(u.game_date)::text as first_date,
          MAX(u.game_date)::text as last_date,
          COUNT(*) FILTER (WHERE p.type IN ('B','S')) as called_pitches,
          COUNT(*) FILTER (WHERE
            (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top AND p.type = 'S')
            OR (NOT (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top) AND p.type = 'B')
          ) as correct_calls
        FROM game_umpires u
        JOIN pitches p ON p.game_pk = u.game_pk
        WHERE p.type IN ('B', 'S') AND p.plate_x IS NOT NULL AND p.sz_top IS NOT NULL
        GROUP BY u.hp_umpire
        ORDER BY games DESC
        LIMIT 50
      `
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'search') {
    const searchQuery = (body.query || '').trim().toLowerCase().replace(/'/g, "''")
    if (!searchQuery) return NextResponse.json([])

    const { data, error } = await supabase.rpc('run_query', {
      query_text: `
        SELECT hp_umpire, COUNT(DISTINCT game_pk) as games
        FROM game_umpires
        WHERE LOWER(hp_umpire) LIKE '%${searchQuery}%'
        GROUP BY hp_umpire
        ORDER BY games DESC
        LIMIT 8
      `
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
