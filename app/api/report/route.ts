import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'
import { buildReportQuery } from '@/lib/reportQueryBuilder'

// Explore's main aggregate: 8.2s over a season of pitches.
// Needs run_query_long (8s -> 120s statement_timeout) and room past the
// platform's default function timeout.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = buildReportQuery({ table: 'pitches' }, body)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

    const { data, error } = await supabase.rpc('run_query_long', { query_text: result.sql })
    if (error) return NextResponse.json({ error: error.message, sql: result.sql }, { status: 500 })

    return NextResponse.json({ rows: data, sql: result.sql, count: data?.length || 0 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
