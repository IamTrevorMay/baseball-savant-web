import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { METRICS } from '@/lib/reportMetrics'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/scene-stats?playerId=543037&metrics=avg_velo,whiff_pct&gameYear=2024&pitchType=FF
 * Also supports kinematics=true mode for pitch flight elements.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const playerId = sp.get('playerId')
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

    const gameYear = sp.get('gameYear')
    const pitchType = sp.get('pitchType')
    const dateFrom = sp.get('dateFrom')
    const dateTo = sp.get('dateTo')
    const kinematics = sp.get('kinematics') === 'true'

    // Build WHERE clauses
    const where: string[] = [`pitcher = ${parseInt(playerId)}`]
    if (gameYear) where.push(`game_year = ${parseInt(gameYear)}`)
    if (pitchType) where.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)
    if (dateFrom) where.push(`game_date >= '${dateFrom.replace(/'/g, "''")}'`)
    if (dateTo) where.push(`game_date <= '${dateTo.replace(/'/g, "''")}'`)
    const whereClause = `WHERE ${where.join(' AND ')}`

    if (kinematics) {
      // Return avg kinematics per pitch type for trajectory rendering
      const sql = `
        SELECT pitch_type, pitch_name,
          ROUND(AVG(vx0)::numeric, 3) as vx0,
          ROUND(AVG(vy0)::numeric, 3) as vy0,
          ROUND(AVG(vz0)::numeric, 3) as vz0,
          ROUND(AVG(ax)::numeric, 3) as ax,
          ROUND(AVG(ay)::numeric, 3) as ay,
          ROUND(AVG(az)::numeric, 3) as az,
          ROUND(AVG(release_pos_x)::numeric, 3) as release_pos_x,
          ROUND(AVG(release_pos_z)::numeric, 3) as release_pos_z,
          ROUND(AVG(release_extension)::numeric, 2) as release_extension,
          ROUND(AVG(release_speed)::numeric, 1) as avg_velo,
          COUNT(*) as pitches
        FROM pitches ${whereClause}
        GROUP BY pitch_type, pitch_name
        HAVING COUNT(*) >= 10
        ORDER BY COUNT(*) DESC
      `.trim()

      const { data, error } = await supabase.rpc('run_query', { query_text: sql })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ kinematics: data })
    }

    // Stats mode
    const metricList = (sp.get('metrics') || 'avg_velo,whiff_pct').split(',')
    const validMetrics = metricList.filter(m => METRICS[m])
    if (validMetrics.length === 0) return NextResponse.json({ error: 'No valid metrics' }, { status: 400 })

    const selectParts = validMetrics.map(m => `${METRICS[m]} AS ${m}`)
    const sql = `SELECT ${selectParts.join(', ')} FROM pitches ${whereClause}`.trim()

    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const row = data?.[0] || {}
    const stats: Record<string, any> = {}
    for (const m of validMetrics) stats[m] = row[m] ?? null
    return NextResponse.json({ stats })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
