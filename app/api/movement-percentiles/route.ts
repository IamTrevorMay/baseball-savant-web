import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'
import { getCached, setCache } from '@/lib/queryCache'
import { parseMovementPercentilesRows } from '@/lib/schemas/movementPercentiles'

/**
 * GET /api/movement-percentiles?season=2026&hand=R&entries=FF:95.5,SI:93.2,SL:87.1
 *
 * For each pitch_type:avg_velo entry, compute percentile breakpoints (p1–p99)
 * for ABS horizontal break and ABS induced vertical break among all pitchers
 * with the same hand throwing that pitch type at ±1 mph, with ≥10 pitches.
 * Skip pitch types whose pool has < 20 qualified pitchers.
 *
 * Uses a single table scan with a compound OR filter instead of one CTE per
 * pitch type, avoiding N separate full-table scans.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const season = Number(params.get('season'))
  const hand = params.get('hand')
  const entriesRaw = params.get('entries')

  if (!season || !hand || !entriesRaw) {
    return NextResponse.json(
      { error: 'season, hand, and entries params required' },
      { status: 400 }
    )
  }

  // Parse entries: "FF:95.5,SI:93.2,SL:87.1". Bucket velo to integer mph so the
  // cache key (and the ±1 mph band) is stable — raw floats produced a unique
  // single-use key per request and the cache almost never hit.
  const entries = entriesRaw.split(',').map(e => {
    const [pt, vStr] = e.split(':')
    return { pitch_type: pt, velo: Math.round(Number(vStr)) }
  }).filter(e => e.pitch_type && !isNaN(e.velo) && /^[A-Z0-9]{1,4}$/.test(e.pitch_type))

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No valid entries' }, { status: 400 })
  }

  // DB cache (6h TTL) — percentile breakpoints only change nightly
  const cacheKey = `mvpct:${season}:${hand}:${entries.map(e => `${e.pitch_type}:${e.velo}`).join(',')}`
  const cached = await getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  }

  // Build a single-scan query: compound OR for velo bands, then GROUP BY pitch_type
  const orClauses = entries.map(({ pitch_type, velo }) => {
    const lo = (velo - 1).toFixed(1)
    const hi = (velo + 1).toFixed(1)
    return `(pitch_type = '${pitch_type}' AND release_speed BETWEEN ${lo} AND ${hi})`
  }).join('\n      OR ')

  const sql = `WITH pool AS (
  SELECT pitcher, pitch_type,
         ABS(AVG(pfx_x) * 12) AS hb_abs,
         ABS(AVG(pfx_z) * 12) AS ivb_abs,
         AVG(pfx_x) * 12 AS hb_signed,
         AVG(pfx_z) * 12 AS ivb_signed
  FROM pitches
  WHERE game_year = ${season}
    AND p_throws = '${hand}'
    AND pfx_x IS NOT NULL AND pfx_z IS NOT NULL
    AND (${orClauses})
  GROUP BY pitcher, pitch_type
  HAVING COUNT(*) >= 10
)
SELECT pitch_type,
  CASE WHEN COUNT(*) >= 20 THEN
    percentile_cont(ARRAY(SELECT s/100.0 FROM generate_series(1,99) s))
      WITHIN GROUP (ORDER BY hb_abs)
  ELSE NULL END AS hb_breakpoints,
  CASE WHEN COUNT(*) >= 20 THEN
    percentile_cont(ARRAY(SELECT s/100.0 FROM generate_series(1,99) s))
      WITHIN GROUP (ORDER BY ivb_abs)
  ELSE NULL END AS ivb_breakpoints,
  COUNT(*)::int AS n_qualified,
  AVG(hb_signed) AS pool_avg_hb,
  AVG(ivb_signed) AS pool_avg_ivb
FROM pool
GROUP BY pitch_type`

  const { data, error } = await supabase.rpc('run_query', { query_text: sql })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Validate schema, then filter out pitch types that didn't meet the 20-pitcher minimum
  const validated = parseMovementPercentilesRows(data || [])
  const results = (validated as any[]).filter(
    (r: any) => r.hb_breakpoints != null && r.ivb_breakpoints != null
  )

  if (results.length > 0) {
    setCache(cacheKey, results, { ttlSeconds: 21600 }).catch(() => {})
  }

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}
