import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

/**
 * GET /api/movement-percentiles?season=2026&hand=R&entries=FF:95.5,SI:93.2,SL:87.1
 *
 * For each pitch_type:avg_velo entry, compute percentile breakpoints (p1–p99)
 * for ABS horizontal break and ABS induced vertical break among all pitchers
 * with the same hand throwing that pitch type at ±1 mph, with ≥10 pitches.
 * Skip pitch types whose pool has < 20 qualified pitchers.
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

  // Parse entries: "FF:95.5,SI:93.2,SL:87.1"
  const entries = entriesRaw.split(',').map(e => {
    const [pt, vStr] = e.split(':')
    return { pitch_type: pt, velo: Number(vStr) }
  }).filter(e => e.pitch_type && !isNaN(e.velo))

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No valid entries' }, { status: 400 })
  }

  // Build one CTE per pitch type, then UNION ALL the aggregations
  const ctes: string[] = []
  const selects: string[] = []

  for (let i = 0; i < entries.length; i++) {
    const { pitch_type, velo } = entries[i]
    const alias = `pool_${i}`
    const veloLo = (velo - 1).toFixed(1)
    const veloHi = (velo + 1).toFixed(1)

    // Sanitize pitch_type: only allow uppercase letters and digits
    if (!/^[A-Z0-9]{1,4}$/.test(pitch_type)) continue

    ctes.push(`${alias} AS (
  SELECT pitcher,
         ABS(AVG(pfx_x) * 12) AS hb_abs,
         ABS(AVG(pfx_z) * 12) AS ivb_abs,
         AVG(pfx_x) * 12 AS hb_signed,
         AVG(pfx_z) * 12 AS ivb_signed
  FROM pitches
  WHERE game_year = ${season}
    AND pitch_type = '${pitch_type}'
    AND release_speed BETWEEN ${veloLo} AND ${veloHi}
    AND p_throws = '${hand}'
    AND pitch_type NOT IN ('PO','IN')
    AND pfx_x IS NOT NULL AND pfx_z IS NOT NULL
  GROUP BY pitcher
  HAVING COUNT(*) >= 10
)`)

    selects.push(`SELECT
  '${pitch_type}' AS pitch_type,
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
FROM ${alias}`)
  }

  if (ctes.length === 0) {
    return NextResponse.json([])
  }

  const sql = `WITH ${ctes.join(',\n')}\n${selects.join('\nUNION ALL\n')}`

  const { data, error } = await supabase.rpc('run_query', { query_text: sql })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter out pitch types that didn't meet the 20-pitcher minimum
  const results = (data || []).filter(
    (r: any) => r.hb_breakpoints != null && r.ivb_breakpoints != null
  )

  return NextResponse.json(results)
}
