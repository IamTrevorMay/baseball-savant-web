import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 10), 50)

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  // Sanitize query for use in SQL
  const safeQ = q.replace(/'/g, "''")

  // Search with trigram similarity, prioritize exact prefix matches,
  // then Statcast players, then by recency
  const sql = `
    SELECT
      p.lahman_id, p.mlb_id, p.name_first, p.name_last,
      p.birth_year, p.debut, p.final_game, p.bats, p.throws,
      (p.mlb_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM players pl WHERE pl.id = p.mlb_id
      )) AS has_statcast,
      CASE
        WHEN LOWER(p.name_last) = LOWER('${safeQ}') THEN 0
        WHEN LOWER(p.name_last) LIKE LOWER('${safeQ}%') THEN 1
        WHEN LOWER(p.name_first || ' ' || p.name_last) LIKE LOWER('${safeQ}%') THEN 2
        ELSE 3
      END AS match_rank,
      similarity(p.name_last || ', ' || p.name_first, '${safeQ}') AS sim
    FROM lahman_people p
    WHERE
      (p.name_last || ', ' || p.name_first) % '${safeQ}'
      OR LOWER(p.name_last) LIKE LOWER('${safeQ}%')
      OR LOWER(p.name_first || ' ' || p.name_last) LIKE LOWER('%${safeQ}%')
    ORDER BY
      match_rank ASC,
      has_statcast DESC,
      COALESCE(EXTRACT(YEAR FROM p.final_game::date), p.birth_year, 0) DESC,
      sim DESC
    LIMIT ${limit}
  `

  try {
    const { data, error } = await supabase.rpc('run_query', { query_text: sql.trim() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ results: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
