import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'
import { METRICS } from '@/lib/reportMetrics'
import { GROUP_COLS, FILTER_COLS, INDEXED_FILTER_COLS, buildWhereParts, hasIndexedFilter, buildSelectParts } from '@/lib/reportQueryBuilder'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      metrics = ['pitches', 'avg_velo', 'whiff_pct'],
      groupBy = ['player_name'],
      filters = [],
      sortBy = 'pitches',
      sortDir = 'DESC',
      limit = 100,
      offset = 0,
      minPitches = 0,
      minPA = 0,
    } = body

    // Validate
    for (const m of metrics) {
      if (!METRICS[m]) return NextResponse.json({ error: `Unknown metric: ${m}` }, { status: 400 })
    }
    for (const g of groupBy) {
      if (!GROUP_COLS[g]) return NextResponse.json({ error: `Unknown group: ${g}` }, { status: 400 })
    }

    // Build SELECT — computed cols get aliased, bare cols stay bare
    const selectParts = buildSelectParts(groupBy, metrics, METRICS)

    // Build GROUP BY — use the raw expression (not alias)
    const groupByExprs = groupBy.map((g: string) => GROUP_COLS[g])

    // Build WHERE
    const whereParts = buildWhereParts(filters)
    whereParts.push("pitch_type NOT IN ('PO', 'IN')")

    // Guard: require at least one indexed column filter to prevent full table scans
    if (!hasIndexedFilter(filters)) {
      return NextResponse.json(
        { error: 'At least one filter on pitcher, batter, game_year, game_date, or team is required to prevent full table scans.' },
        { status: 400 }
      )
    }

    const whereClause = `WHERE ${whereParts.join(' AND ')}`
    const groupClause = `GROUP BY ${groupByExprs.join(', ')}`

    // HAVING — support both minPitches and minPA
    const havingParts: string[] = []
    const mp = parseInt(minPitches)
    if (mp > 0) havingParts.push(`COUNT(*) >= ${mp}`)
    const mpa = parseInt(minPA)
    if (mpa > 0) havingParts.push(`COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) >= ${mpa}`)
    const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(' AND ')}` : ''

    // Allow sorting by metrics OR group-by columns
    const safeSortBy = (METRICS[sortBy] || GROUP_COLS[sortBy]) ? sortBy : metrics[0] || 'pitches'
    const safeSortDir = sortDir === 'ASC' ? 'ASC' : 'DESC'
    const orderClause = `ORDER BY ${safeSortBy} ${safeSortDir}`
    const safeLimit = Math.min(Math.max(parseInt(limit), 1), 1000)
    const safeOffset = Math.max(parseInt(offset) || 0, 0)
    const limitClause = `LIMIT ${safeLimit} OFFSET ${safeOffset}`

    const sql = `SELECT ${selectParts.join(', ')} FROM pitches ${whereClause} ${groupClause} ${havingClause} ${orderClause} ${limitClause}`

    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message, sql }, { status: 500 })

    return NextResponse.json({ rows: data, sql, count: data?.length || 0 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
