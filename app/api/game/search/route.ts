import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabaseGame } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const q = (url.searchParams.get('q') || '').trim()
  const year = parseInt(url.searchParams.get('year') || '2024')
  const type = url.searchParams.get('type') || 'pitcher'

  if (!q || q.length < 2) {
    return NextResponse.json([])
  }

  // Sanitize and escape for SQL single quotes
  const safeQ = q.replace(/[^a-zA-Z0-9 ,.\-]/g, '').replace(/'/g, "''")
  if (!safeQ) return NextResponse.json([])

  let sql: string

  if (type === 'pitcher') {
    sql = `
      SELECT pitcher AS id, player_name AS name
      FROM pitches
      WHERE game_year = ${year}
        AND pitch_type NOT IN ('PO','IN')
        AND player_name ILIKE '%${safeQ}%'
      GROUP BY pitcher, player_name
      HAVING COUNT(*) >= 500
      ORDER BY player_name
      LIMIT 8
    `
  } else {
    sql = `
      SELECT p.batter AS id, pl.name AS name
      FROM pitches p
      JOIN players pl ON pl.id = p.batter
      WHERE p.game_year = ${year}
        AND p.pitch_type NOT IN ('PO','IN')
        AND pl.name ILIKE '%${safeQ}%'
      GROUP BY p.batter, pl.name
      HAVING COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN CONCAT(p.game_pk, p.at_bat_number) END) >= 200
      ORDER BY pl.name
      LIMIT 8
    `
  }

  const { data, error } = await supabaseGame.rpc('run_query', { query_text: sql.trim() })
  if (error) {
    console.error('Game search error:', error)
    return NextResponse.json([])
  }

  return NextResponse.json(data || [], {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60' },
  })
}
