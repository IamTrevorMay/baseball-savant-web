import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const yearsParam = req.nextUrl.searchParams.get('years')
  if (!yearsParam) {
    return NextResponse.json({ error: 'years param required (comma-separated)' }, { status: 400 })
  }

  const years = yearsParam.split(',').map(Number).filter(y => y >= 2015 && y <= 2100)
  if (years.length === 0) {
    return NextResponse.json({ error: 'No valid years' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('league_metric_baselines')
    .select('metric, game_year, pitch_type, mean, stddev, higher_better')
    .in('game_year', years)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
