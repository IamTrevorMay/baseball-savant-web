import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkVisionAuth } from '@/lib/visionAuth'

// POST /api/pitch-area-stats
//
// Triton Vision area-stats lookup: given a pitch location (plate_x, plate_z in
// feet, catcher POV), a 2"-diameter circle is built around it and league
// hitting outcomes inside that circle are returned. Server-side cache keeps
// repeat queries cheap (5 min TTL).
//
// Body:
//   {
//     px: number,                      // feet
//     pz: number,                      // feet
//     year: number,                    // 2015..2025
//     pitch_names: string[],           // ['4-Seam Fastball', ...]
//     p_throws?: 'R' | 'L' | null,
//     stand?:    'R' | 'L' | null,
//     radius_ft?: number,              // default 1/12 (= 2" diameter)
//   }
//
// Response:
//   { n, pa, ab, bbe, swings, ooz, stats: { ba, obp, slg, ops, k_pct, bb_pct,
//     woba, xba, xslg, xwoba, whiff_pct, chase_pct, barrel_pct, hardhit_pct,
//     avg_ev, avg_la }, cached: bool }
//
// Auth: Bearer token via `checkVisionAuth` (shares VISION_INGEST_TOKEN).

const q = (sql: string) =>
  supabaseAdmin.rpc('run_query', { query_text: sql.trim() })

const VALID_PITCH_NAMES = new Set([
  '4-Seam Fastball', 'Changeup', 'Curveball', 'Cutter', 'Eephus', 'Forkball',
  'Knuckle Curve', 'Knuckleball', 'Other', 'Pitch Out', 'Screwball', 'Sinker',
  'Slider', 'Slow Curve', 'Slurve', 'Split-Finger', 'Sweeper',
])

const DEFAULT_RADIUS_FT = 1 / 12 // 2" diameter
const MAX_RADIUS_FT = 2.0
const CACHE_TTL_MS = 5 * 60 * 1000

type Cached = { ts: number; payload: any }
const cache = new Map<string, Cached>()

function cacheKey(args: {
  px: number; pz: number; year: number; pitch_names: string[];
  p_throws: string | null; stand: string | null; radius_ft: number;
}): string {
  const names = [...args.pitch_names].sort().join('|')
  const px = Math.round(args.px * 1000) / 1000
  const pz = Math.round(args.pz * 1000) / 1000
  const r = Math.round(args.radius_ft * 10000) / 10000
  return `${args.year}|${names}|${px}|${pz}|${r}|${args.p_throws ?? ''}|${args.stand ?? ''}`
}

function sqlEscapeString(s: string): string {
  return s.replace(/'/g, "''")
}

function buildSql(args: {
  px: number; pz: number; year: number; pitch_names: string[];
  p_throws: string | null; stand: string | null; radius_ft: number;
}): string {
  const { px, pz, year, pitch_names, p_throws, stand, radius_ft } = args
  const names = pitch_names.map(n => `'${sqlEscapeString(n)}'`).join(',')
  const r = radius_ft
  const r2 = r * r
  const handClause = [
    p_throws ? `AND p_throws = '${p_throws}'` : '',
    stand    ? `AND stand    = '${stand}'`    : '',
  ].join(' ')

  return `
SELECT
  COUNT(*)::int AS n,
  COUNT(*) FILTER (WHERE events IS NOT NULL)::int AS pa,
  COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run','strikeout','strikeout_double_play','field_out','force_out','grounded_into_double_play','fielders_choice','fielders_choice_out','double_play','triple_play','sac_fly_double_play'))::int AS ab,
  COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::int AS hits,
  COUNT(*) FILTER (WHERE events = 'walk')::int AS bb,
  COUNT(*) FILTER (WHERE events = 'hit_by_pitch')::int AS hbp,
  COUNT(*) FILTER (WHERE events IN ('strikeout','strikeout_double_play'))::int AS so,
  COALESCE(SUM(CASE events WHEN 'single' THEN 1 WHEN 'double' THEN 2 WHEN 'triple' THEN 3 WHEN 'home_run' THEN 4 ELSE 0 END), 0)::int AS tb,
  COALESCE(SUM(woba_value) FILTER (WHERE events IS NOT NULL), 0)::float AS sum_woba,
  AVG(estimated_ba_using_speedangle)   FILTER (WHERE launch_speed IS NOT NULL)::float AS xba,
  AVG(estimated_slg_using_speedangle)  FILTER (WHERE launch_speed IS NOT NULL)::float AS xslg,
  AVG(estimated_woba_using_speedangle) FILTER (WHERE launch_speed IS NOT NULL)::float AS xwoba,
  AVG(launch_speed) FILTER (WHERE launch_speed IS NOT NULL)::float AS avg_ev,
  AVG(launch_angle) FILTER (WHERE launch_speed IS NOT NULL)::float AS avg_la,
  COUNT(*) FILTER (WHERE launch_speed IS NOT NULL)::int AS bbe,
  COUNT(*) FILTER (WHERE launch_speed_angle = 6)::int AS barrels,
  COUNT(*) FILTER (WHERE launch_speed >= 95)::int AS hard_hits,
  COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play'))::int AS swings,
  COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked'))::int AS whiffs,
  COUNT(*) FILTER (WHERE zone >= 11)::int AS ooz,
  COUNT(*) FILTER (WHERE zone >= 11 AND description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play'))::int AS chases
FROM pitches
WHERE game_year = ${year}
  AND pitch_name IN (${names})
  AND plate_x BETWEEN ${px - r} AND ${px + r}
  AND plate_z BETWEEN ${pz - r} AND ${pz + r}
  AND ((plate_x - ${px})*(plate_x - ${px}) + (plate_z - ${pz})*(plate_z - ${pz})) <= ${r2}
  ${handClause}
  `.trim()
}

function deriveStats(row: any) {
  const n     = Number(row.n     ?? 0)
  const pa    = Number(row.pa    ?? 0)
  const ab    = Number(row.ab    ?? 0)
  const hits  = Number(row.hits  ?? 0)
  const bb    = Number(row.bb    ?? 0)
  const hbp   = Number(row.hbp   ?? 0)
  const so    = Number(row.so    ?? 0)
  const tb    = Number(row.tb    ?? 0)
  const sumW  = Number(row.sum_woba ?? 0)
  const bbe   = Number(row.bbe ?? 0)
  const bar   = Number(row.barrels ?? 0)
  const hh    = Number(row.hard_hits ?? 0)
  const swings = Number(row.swings ?? 0)
  const whiffs = Number(row.whiffs ?? 0)
  const ooz    = Number(row.ooz ?? 0)
  const chases = Number(row.chases ?? 0)

  const safeDiv = (num: number, den: number): number | null =>
    den > 0 ? num / den : null

  const ba  = safeDiv(hits, ab)
  const obp = safeDiv(hits + bb + hbp, pa)
  const slg = safeDiv(tb, ab)
  const ops = ba != null && obp != null && slg != null ? obp + slg : null

  return {
    n, pa, ab, bbe, swings, ooz,
    stats: {
      ba,
      obp,
      slg,
      ops,
      k_pct:       safeDiv(so, pa),
      bb_pct:      safeDiv(bb, pa),
      woba:        safeDiv(sumW, pa),
      xba:         row.xba   != null ? Number(row.xba)   : null,
      xslg:        row.xslg  != null ? Number(row.xslg)  : null,
      xwoba:       row.xwoba != null ? Number(row.xwoba) : null,
      avg_ev:      row.avg_ev != null ? Number(row.avg_ev) : null,
      avg_la:      row.avg_la != null ? Number(row.avg_la) : null,
      barrel_pct:  safeDiv(bar, bbe),
      hardhit_pct: safeDiv(hh, bbe),
      whiff_pct:   safeDiv(whiffs, swings),
      chase_pct:   safeDiv(chases, ooz),
    },
  }
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const auth = checkVisionAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return bad('Invalid JSON body')
  }
  if (!body || typeof body !== 'object') return bad('Body must be an object')

  const px = Number(body.px)
  const pz = Number(body.pz)
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return bad('px, pz required (numbers)')
  if (Math.abs(px) > 10 || Math.abs(pz) > 15)        return bad('px/pz out of plausible range')

  const year = Number.parseInt(body.year, 10)
  if (!Number.isInteger(year) || year < 2015 || year > 2026) {
    return bad('year required (2015..2026)')
  }

  if (!Array.isArray(body.pitch_names) || body.pitch_names.length === 0) {
    return bad('pitch_names required (non-empty array)')
  }
  const pitch_names: string[] = []
  for (const name of body.pitch_names) {
    if (typeof name !== 'string' || !VALID_PITCH_NAMES.has(name)) {
      return bad(`invalid pitch_name: ${JSON.stringify(name)}`)
    }
    pitch_names.push(name)
  }

  let p_throws: string | null = null
  if (body.p_throws != null && body.p_throws !== '') {
    if (body.p_throws !== 'R' && body.p_throws !== 'L') return bad("p_throws must be 'R' or 'L'")
    p_throws = body.p_throws
  }
  let stand: string | null = null
  if (body.stand != null && body.stand !== '') {
    if (body.stand !== 'R' && body.stand !== 'L') return bad("stand must be 'R' or 'L'")
    stand = body.stand
  }

  let radius_ft = DEFAULT_RADIUS_FT
  if (body.radius_ft != null) {
    const r = Number(body.radius_ft)
    if (!Number.isFinite(r) || r <= 0 || r > MAX_RADIUS_FT) {
      return bad(`radius_ft must be in (0, ${MAX_RADIUS_FT}]`)
    }
    radius_ft = r
  }

  const args = { px, pz, year, pitch_names, p_throws, stand, radius_ft }
  const key = cacheKey(args)

  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true })
  }

  const sql = buildSql(args)
  const { data, error } = await q(sql)
  if (error) {
    return NextResponse.json({ error: error.message || 'query failed' }, { status: 500 })
  }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : {}
  const payload = deriveStats(row)

  cache.set(key, { ts: Date.now(), payload })
  if (cache.size > 500) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }

  return NextResponse.json({ ...payload, cached: false })
}
