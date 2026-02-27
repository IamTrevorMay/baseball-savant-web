import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Whitelisted stats to prevent SQL injection
const BATTING_STATS: Record<string, { col: string; agg: string; order: string; label: string }> = {
  hr:      { col: 'hr', agg: 'SUM(hr)', order: 'DESC', label: 'HR' },
  h:       { col: 'h', agg: 'SUM(h)', order: 'DESC', label: 'Hits' },
  r:       { col: 'r', agg: 'SUM(r)', order: 'DESC', label: 'Runs' },
  rbi:     { col: 'rbi', agg: 'SUM(rbi)', order: 'DESC', label: 'RBI' },
  sb:      { col: 'sb', agg: 'SUM(sb)', order: 'DESC', label: 'SB' },
  bb:      { col: 'bb', agg: 'SUM(bb)', order: 'DESC', label: 'BB' },
  so:      { col: 'so', agg: 'SUM(so)', order: 'DESC', label: 'SO' },
  doubles: { col: 'doubles', agg: 'SUM(doubles)', order: 'DESC', label: '2B' },
  triples: { col: 'triples', agg: 'SUM(triples)', order: 'DESC', label: '3B' },
  g:       { col: 'g', agg: 'SUM(g)', order: 'DESC', label: 'G' },
  ab:      { col: 'ab', agg: 'SUM(ab)', order: 'DESC', label: 'AB' },
  pa:      { col: 'pa', agg: 'SUM(pa)', order: 'DESC', label: 'PA' },
  ba:      { col: 'ba', agg: 'ROUND(SUM(h)::numeric / NULLIF(SUM(ab),0), 3)', order: 'DESC', label: 'BA' },
  obp:     { col: 'obp', agg: 'ROUND((SUM(h)+SUM(COALESCE(bb,0))+SUM(COALESCE(hbp,0)))::numeric / NULLIF(SUM(ab)+SUM(COALESCE(bb,0))+SUM(COALESCE(hbp,0))+SUM(COALESCE(sf,0)),0), 3)', order: 'DESC', label: 'OBP' },
  slg:     { col: 'slg', agg: 'ROUND((SUM(h)+SUM(doubles)+2*SUM(triples)+3*SUM(hr))::numeric / NULLIF(SUM(ab),0), 3)', order: 'DESC', label: 'SLG' },
  ops:     { col: 'ops', agg: 'ROUND((SUM(h)+SUM(COALESCE(bb,0))+SUM(COALESCE(hbp,0)))::numeric / NULLIF(SUM(ab)+SUM(COALESCE(bb,0))+SUM(COALESCE(hbp,0))+SUM(COALESCE(sf,0)),0) + (SUM(h)+SUM(doubles)+2*SUM(triples)+3*SUM(hr))::numeric / NULLIF(SUM(ab),0), 3)', order: 'DESC', label: 'OPS' },
}

const PITCHING_STATS: Record<string, { col: string; agg: string; order: string; label: string }> = {
  w:    { col: 'w', agg: 'SUM(w)', order: 'DESC', label: 'W' },
  so:   { col: 'so', agg: 'SUM(so)', order: 'DESC', label: 'SO' },
  sv:   { col: 'sv', agg: 'SUM(sv)', order: 'DESC', label: 'SV' },
  g:    { col: 'g', agg: 'SUM(g)', order: 'DESC', label: 'G' },
  gs:   { col: 'gs', agg: 'SUM(gs)', order: 'DESC', label: 'GS' },
  cg:   { col: 'cg', agg: 'SUM(cg)', order: 'DESC', label: 'CG' },
  sho:  { col: 'sho', agg: 'SUM(sho)', order: 'DESC', label: 'SHO' },
  ip:   { col: 'ipouts', agg: 'ROUND(SUM(ipouts)::numeric/3, 1)', order: 'DESC', label: 'IP' },
  era:  { col: 'era', agg: 'ROUND(9.0*SUM(er)::numeric / NULLIF(SUM(ipouts)::numeric/3, 0), 2)', order: 'ASC', label: 'ERA' },
  whip: { col: 'whip', agg: 'ROUND((SUM(bb)+SUM(h))::numeric / NULLIF(SUM(ipouts)::numeric/3, 0), 2)', order: 'ASC', label: 'WHIP' },
  k9:   { col: 'k9', agg: 'ROUND(9.0*SUM(so)::numeric / NULLIF(SUM(ipouts)::numeric/3, 0), 1)', order: 'DESC', label: 'K/9' },
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const stat = sp.get('stat') || 'hr'
  const type = sp.get('type') || 'career' // career or season
  const category = sp.get('category') || 'batting' // batting or pitching
  const limit = Math.min(Number(sp.get('limit') || 25), 100)
  const startYear = Number(sp.get('startYear') || 0)
  const endYear = Number(sp.get('endYear') || 9999)
  const league = sp.get('league') || ''
  const minPA = Number(sp.get('minPA') || 0)
  const minIP = Number(sp.get('minIP') || 0)

  const statsMap = category === 'pitching' ? PITCHING_STATS : BATTING_STATS
  const statDef = statsMap[stat]
  if (!statDef) {
    return NextResponse.json({ error: `Unknown stat: ${stat}` }, { status: 400 })
  }

  const table = category === 'pitching' ? 'lahman_pitching' : 'lahman_batting'
  const isSeason = type === 'season'

  // Build WHERE clause
  const wheres: string[] = []
  if (startYear > 0) wheres.push(`t.year >= ${startYear}`)
  if (endYear < 9999) wheres.push(`t.year <= ${endYear}`)
  if (league === 'AL' || league === 'NL') wheres.push(`t.lg_id = '${league}'`)
  const whereClause = wheres.length > 0 ? 'AND ' + wheres.join(' AND ') : ''

  // Build qualifier HAVING clause
  const havings: string[] = []
  if (category === 'batting' && minPA > 0) {
    havings.push(`SUM(COALESCE(t.ab,0)) + SUM(COALESCE(t.bb,0)) + SUM(COALESCE(t.hbp,0)) + SUM(COALESCE(t.sf,0)) + SUM(COALESCE(t.sh,0)) >= ${minPA}`)
  }
  if (category === 'pitching' && minIP > 0) {
    havings.push(`SUM(COALESCE(t.ipouts,0)) >= ${minIP * 3}`)
  }
  const havingClause = havings.length > 0 ? 'HAVING ' + havings.join(' AND ') : ''

  let sql: string
  if (isSeason) {
    // Season leaderboard: group by player + year
    sql = `
      SELECT p.lahman_id, p.mlb_id, p.name_first, p.name_last, t.year,
             string_agg(DISTINCT t.team_id, '/' ORDER BY t.team_id) AS team_id,
             ${statDef.agg} AS stat_value
      FROM ${table} t
      JOIN lahman_people p ON p.lahman_id = t.lahman_id
      WHERE 1=1 ${whereClause}
      GROUP BY p.lahman_id, p.mlb_id, p.name_first, p.name_last, t.year
      ${havingClause}
      ORDER BY stat_value ${statDef.order} NULLS LAST
      LIMIT ${limit}
    `
  } else {
    // Career leaderboard: group by player only
    sql = `
      SELECT p.lahman_id, p.mlb_id, p.name_first, p.name_last,
             MIN(t.year) AS first_year, MAX(t.year) AS last_year,
             string_agg(DISTINCT t.team_id, '/' ORDER BY t.team_id) AS teams,
             ${statDef.agg} AS stat_value
      FROM ${table} t
      JOIN lahman_people p ON p.lahman_id = t.lahman_id
      WHERE 1=1 ${whereClause}
      GROUP BY p.lahman_id, p.mlb_id, p.name_first, p.name_last
      ${havingClause}
      ORDER BY stat_value ${statDef.order} NULLS LAST
      LIMIT ${limit}
    `
  }

  try {
    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data || [], stat, type, category, label: statDef.label })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
