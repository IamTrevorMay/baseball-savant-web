import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

/**
 * GET /api/admin/backfill-stuff-plus?year=YYYY
 *
 * Backfills stuff_plus for all pitches in the given year using baselines from pitch_baselines.
 * Processes in batches of 50,000 rows via OFFSET to avoid timeouts.
 */
export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get('year')
    if (!yearParam || isNaN(parseInt(yearParam, 10))) {
      return NextResponse.json({ error: 'year parameter required (e.g. ?year=2025)' }, { status: 400 })
    }
    const year = parseInt(yearParam, 10)

    // Check baselines exist for this year
    const { data: baselineCheck, error: bcErr } = await q(`
      SELECT COUNT(*) AS cnt FROM pitch_baselines WHERE game_year = ${year}
    `)
    if (bcErr) return NextResponse.json({ error: bcErr.message }, { status: 500 })
    const baselineCount = Number(baselineCheck?.[0]?.cnt ?? 0)
    if (baselineCount === 0) {
      return NextResponse.json({
        error: `No baselines found for year ${year}. Run /api/admin/compute-stuff-baselines?year=${year} first.`
      }, { status: 400 })
    }

    let offset = 0
    let batches = 0
    let totalUpdated = 0
    const BATCH_SIZE = 50000

    while (true) {
      const sql = `
        UPDATE pitches p
        SET stuff_plus = GREATEST(0, LEAST(200, ROUND(
          100
          + COALESCE((p.release_speed - b.avg_velo) / NULLIF(b.std_velo, 0), 0) * 4.5
          + COALESCE((SQRT(POWER(p.pfx_x * 12, 2) + POWER(p.pfx_z * 12, 2)) - b.avg_movement) / NULLIF(b.std_movement, 0), 0) * 3.5
          + COALESCE((p.release_extension - b.avg_ext) / NULLIF(b.std_ext, 0), 0) * 2.0
        )::numeric))
        FROM pitch_baselines b
        WHERE p.pitch_name = b.pitch_name
          AND p.game_year = b.game_year
          AND p.game_year = ${year}
          AND p.release_speed IS NOT NULL
          AND p.ctid = ANY(
            SELECT ctid FROM pitches
            WHERE game_year = ${year} AND release_speed IS NOT NULL
            LIMIT ${BATCH_SIZE} OFFSET ${offset}
          )
      `

      const { data: updateResult, error: updateErr } = await q(sql)
      if (updateErr) {
        return NextResponse.json({
          error: updateErr.message,
          year,
          batches,
          total_updated: totalUpdated,
        }, { status: 500 })
      }

      // run_query returns affected rows as an array with a single object { rows_affected } or rowcount
      // The RPC returns query results; for UPDATE it typically returns empty array or rowcount
      // We use a SELECT to check progress instead
      const rowsUpdated = Array.isArray(updateResult) ? updateResult.length : 0

      // Since UPDATE via run_query doesn't return row count directly, check by fetching count
      const { data: countResult } = await q(`
        SELECT COUNT(*) AS cnt FROM pitches
        WHERE game_year = ${year} AND release_speed IS NOT NULL
        LIMIT 1 OFFSET ${offset + BATCH_SIZE}
      `)
      const hasMore = Number(countResult?.[0]?.cnt ?? 0) > 0

      batches++
      offset += BATCH_SIZE

      // If no more rows at next offset, we're done
      if (!hasMore) {
        // Count total updated
        const { data: totalResult } = await q(`
          SELECT COUNT(*) AS cnt FROM pitches
          WHERE game_year = ${year} AND stuff_plus IS NOT NULL
        `)
        totalUpdated = Number(totalResult?.[0]?.cnt ?? 0)
        break
      }

      // Safety limit: max 500 batches (25M rows)
      if (batches >= 500) break
    }

    return NextResponse.json({ year, batches, total_updated: totalUpdated })
  } catch (err: any) {
    console.error('backfill-stuff-plus error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
