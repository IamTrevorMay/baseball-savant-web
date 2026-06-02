import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const role = params.get('role')
  if (!role || !['SP', 'RP', 'hitter'].includes(role)) {
    return NextResponse.json({ error: 'role param required (SP, RP, or hitter)' }, { status: 400 })
  }

  const season = Number(params.get('season') || new Date().getFullYear())
  const level = params.get('level') || 'MLB'

  const { data, error } = await supabase
    .from('league_percentiles')
    .select('metric, breakpoints, higher_better, n_qualified')
    .eq('season', season)
    .eq('level', level)
    .eq('role', role)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
