import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

/**
 * Lightweight endpoint to fetch distinct filter values for a player.
 * Much faster than loading all pitches just to build filter dropdowns.
 * GET /api/player-filter-options?id=575929&col=pitcher
 */
export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('id')
  const col = req.nextUrl.searchParams.get('col') || 'pitcher'

  if (!playerId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (col !== 'pitcher' && col !== 'batter') return NextResponse.json({ error: 'Invalid col' }, { status: 400 })

  const safeId = parseInt(playerId)
  if (isNaN(safeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const sql = `
      SELECT
        ARRAY_AGG(DISTINCT game_year ORDER BY game_year DESC) as game_year,
        ARRAY_AGG(DISTINCT pitch_name ORDER BY pitch_name) FILTER (WHERE pitch_name IS NOT NULL) as pitch_name,
        ARRAY_AGG(DISTINCT pitch_type ORDER BY pitch_type) FILTER (WHERE pitch_type IS NOT NULL AND pitch_type NOT IN ('PO', 'IN')) as pitch_type,
        ARRAY_AGG(DISTINCT stand ORDER BY stand) FILTER (WHERE stand IS NOT NULL) as stand,
        ARRAY_AGG(DISTINCT p_throws ORDER BY p_throws) FILTER (WHERE p_throws IS NOT NULL) as p_throws,
        ARRAY_AGG(DISTINCT home_team ORDER BY home_team) FILTER (WHERE home_team IS NOT NULL) as home_team,
        ARRAY_AGG(DISTINCT away_team ORDER BY away_team) FILTER (WHERE away_team IS NOT NULL) as away_team,
        ARRAY_AGG(DISTINCT game_type ORDER BY game_type) FILTER (WHERE game_type IS NOT NULL) as game_type
      FROM pitches
      WHERE ${col} = ${safeId} AND pitch_type NOT IN ('PO', 'IN')
    `
    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const row = data?.[0] || {}
    return NextResponse.json(row, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
