import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const mlbId = req.nextUrl.searchParams.get('mlb_id')
  const lahmanId = req.nextUrl.searchParams.get('lahman_id')

  if (!mlbId && !lahmanId) {
    return NextResponse.json({ error: 'mlb_id or lahman_id required' }, { status: 400 })
  }

  try {
    // Resolve lahman_id
    let resolvedLahmanId = lahmanId
    if (mlbId && !lahmanId) {
      const { data: p } = await supabase
        .from('lahman_people')
        .select('lahman_id')
        .eq('mlb_id', Number(mlbId))
        .single()
      if (!p) return NextResponse.json({ error: 'Player not found in Lahman database' }, { status: 404 })
      resolvedLahmanId = p.lahman_id
    }

    // Fetch all data in parallel
    const [playerRes, battingRes, pitchingRes, fieldingRes, awardsRes, allstarsRes, hofRes] = await Promise.all([
      supabase.from('lahman_people').select('*').eq('lahman_id', resolvedLahmanId!).single(),
      supabase.from('lahman_batting_calc').select('*').eq('lahman_id', resolvedLahmanId!).order('year', { ascending: false }),
      supabase.from('lahman_pitching_calc').select('*').eq('lahman_id', resolvedLahmanId!).order('year', { ascending: false }),
      supabase.from('lahman_fielding').select('*').eq('lahman_id', resolvedLahmanId!).order('year', { ascending: false }),
      supabase.from('lahman_awards').select('*').eq('lahman_id', resolvedLahmanId!).order('year', { ascending: false }),
      supabase.from('lahman_allstars').select('*').eq('lahman_id', resolvedLahmanId!).order('year', { ascending: false }),
      supabase.from('lahman_halloffame').select('*').eq('lahman_id', resolvedLahmanId!).order('year', { ascending: false }),
    ])

    if (!playerRes.data) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    return NextResponse.json({
      player: playerRes.data,
      batting: battingRes.data || [],
      pitching: pitchingRes.data || [],
      fielding: fieldingRes.data || [],
      awards: awardsRes.data || [],
      allstars: allstarsRes.data || [],
      hof: hofRes.data || [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
