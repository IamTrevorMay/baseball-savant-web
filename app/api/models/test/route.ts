import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b/i
const DANGEROUS = /(--|;)/

export async function POST(req: NextRequest) {
  const { formula } = await req.json()
  if (!formula) return NextResponse.json({ error: 'formula is required' }, { status: 400 })

  if (FORBIDDEN.test(formula) || DANGEROUS.test(formula)) {
    return NextResponse.json({ error: 'Formula contains forbidden SQL keywords' }, { status: 400 })
  }

  try {
    // Sample 200 rows with the formula computed
    const sampleSql = `SELECT player_name, pitch_name, game_date, release_speed, (${formula}) AS model_value FROM pitches WHERE release_speed IS NOT NULL ORDER BY random() LIMIT 200`
    const { data: sampleRows, error: sampleErr } = await supabase.rpc('run_query', { query_text: sampleSql })
    if (sampleErr) return NextResponse.json({ error: sampleErr.message }, { status: 500 })

    // Stats query
    const statsSql = `SELECT AVG((${formula})::numeric) AS mean, STDDEV((${formula})::numeric) AS stddev, MIN((${formula})::numeric) AS min, MAX((${formula})::numeric) AS max, COUNT(*) AS total_rows FROM (SELECT * FROM pitches WHERE release_speed IS NOT NULL ORDER BY random() LIMIT 10000) sub`
    const { data: statsData, error: statsErr } = await supabase.rpc('run_query', { query_text: statsSql })
    if (statsErr) return NextResponse.json({ error: statsErr.message }, { status: 500 })

    const stats = Array.isArray(statsData) && statsData.length > 0 ? statsData[0] : {}

    return NextResponse.json({ sampleRows: sampleRows || [], stats })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
