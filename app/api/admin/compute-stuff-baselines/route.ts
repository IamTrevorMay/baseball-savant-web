import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

/**
 * GET /api/admin/compute-stuff-baselines?year=YYYY
 *
 * Computes AVG/STDDEV baselines per pitch_name + game_year and upserts into pitch_baselines.
 * Pass year=all to process all years.
 */
export async function GET(req: NextRequest) {
  try {
    const year = req.nextUrl.searchParams.get('year') || 'all'

    const yearFilter = year === 'all' ? '' : `AND game_year = ${parseInt(year, 10)}`

    const sql = `
      INSERT INTO pitch_baselines (pitch_name, game_year, avg_velo, std_velo, avg_movement, std_movement, avg_ext, std_ext, pitch_count)
      SELECT
        pitch_name,
        game_year,
        ROUND(AVG(release_speed)::numeric, 4)                                        AS avg_velo,
        ROUND(STDDEV(release_speed)::numeric, 4)                                     AS std_velo,
        ROUND(AVG(SQRT(POWER(pfx_x * 12, 2) + POWER(pfx_z * 12, 2)))::numeric, 4)  AS avg_movement,
        ROUND(STDDEV(SQRT(POWER(pfx_x * 12, 2) + POWER(pfx_z * 12, 2)))::numeric, 4) AS std_movement,
        ROUND(AVG(release_extension)::numeric, 4)                                    AS avg_ext,
        ROUND(STDDEV(release_extension)::numeric, 4)                                 AS std_ext,
        COUNT(*)::int                                                                  AS pitch_count
      FROM pitches
      WHERE pitch_name IS NOT NULL
        AND release_speed IS NOT NULL
        AND pfx_x IS NOT NULL
        AND pfx_z IS NOT NULL
        AND release_extension IS NOT NULL
        ${yearFilter}
      GROUP BY pitch_name, game_year
      ON CONFLICT (pitch_name, game_year) DO UPDATE SET
        avg_velo      = EXCLUDED.avg_velo,
        std_velo      = EXCLUDED.std_velo,
        avg_movement  = EXCLUDED.avg_movement,
        std_movement  = EXCLUDED.std_movement,
        avg_ext       = EXCLUDED.avg_ext,
        std_ext       = EXCLUDED.std_ext,
        pitch_count   = EXCLUDED.pitch_count
      RETURNING pitch_name, game_year, pitch_count
    `

    const { data, error } = await q(sql)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data || []
    return NextResponse.json({
      year,
      rows_upserted: rows.length,
      baselines: rows.map((r: any) => ({
        pitch_name: r.pitch_name,
        game_year: r.game_year,
        pitch_count: r.pitch_count,
      })),
    })
  } catch (err: any) {
    console.error('compute-stuff-baselines error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
