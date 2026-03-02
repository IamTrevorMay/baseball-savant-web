import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FASTBALL_TYPES = new Set(['FF', 'SI', 'FC'])

// Unique weights
const FB_UNIQUE_W = { vaa: 0.25, vb: 0.15, hb: 0.20, haa: 0.20, ext: 0.20 }
const OS_UNIQUE_W = { vaa: 0.30, vb: 0.20, hb: 0.25, haa: 0.25 }

// Deception weights (signed z-scores with directional value)
const FB_DECEPTION_W = { vaa: -0.25, ext: 0.35, vb: 0.20, hb: -0.10, haa: -0.10 }
const OS_DECEPTION_W = { vaa: 0.35, ext: 0.25, vb: 0.20, hb: -0.10, haa: 0.10 }

// xDeception regression coefficients
const XD = {
  fb_vaa: -1.2219, fb_haa: -0.2740, fb_vb: 0.3830, fb_hb: -0.2684, fb_ext: -0.8779,
  os_vaa: 1.1265, os_haa: 0.3900, os_vb: 0.0947, os_hb: -0.2621, os_ext: 1.2845,
}

/**
 * Batch compute Deception metrics and store in pitcher_season_deception.
 * POST /api/compute-deception?year=2025
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '2025')

  try {
    // Step 1: Compute per-pitcher, per-pitch-type averages
    const pitcherSql = `
      SELECT pitcher, player_name, pitch_type, pitch_name, p_throws,
        COUNT(*) as pitches,
        AVG(DEGREES(ATAN((release_pos_z - plate_z) / NULLIF(60.5 - release_extension, 0)))) as avg_vaa,
        AVG(DEGREES(ATAN((release_pos_x - plate_x) / NULLIF(60.5 - release_extension, 0)))) as avg_haa,
        AVG(pfx_z * 12) as avg_vb,
        AVG(pfx_x * 12) as avg_hb,
        AVG(release_extension) as avg_ext
      FROM pitches
      WHERE game_year = ${year}
        AND pitch_type IS NOT NULL
        AND pitch_type NOT IN ('PO', 'IN')
        AND release_extension IS NOT NULL
        AND release_pos_z IS NOT NULL
        AND plate_z IS NOT NULL
        AND release_pos_x IS NOT NULL
        AND plate_x IS NOT NULL
        AND pfx_z IS NOT NULL
        AND pfx_x IS NOT NULL
      GROUP BY pitcher, player_name, pitch_type, pitch_name, p_throws
      HAVING COUNT(*) >= 100
    `.trim()

    const { data: pitcherRows, error: pitcherErr } = await supabase.rpc('run_query', { query_text: pitcherSql })
    if (pitcherErr) return NextResponse.json({ error: pitcherErr.message }, { status: 500 })
    if (!pitcherRows?.length) return NextResponse.json({ message: 'No data found', year })

    // Step 2: Compute league baselines (per p_throws × pitch_type)
    const baselines: Record<string, { mean: Record<string, number>; sd: Record<string, number> }> = {}
    const groups: Record<string, any[]> = {}

    for (const row of pitcherRows) {
      const key = `${row.p_throws}:${row.pitch_type}`
      if (!groups[key]) groups[key] = []
      groups[key].push(row)
    }

    for (const [key, rows] of Object.entries(groups)) {
      const components = ['vaa', 'haa', 'vb', 'hb', 'ext'] as const
      const means: Record<string, number> = {}
      const sds: Record<string, number> = {}

      for (const comp of components) {
        const vals = rows.map(r => Number(r[`avg_${comp}`])).filter(v => !isNaN(v))
        if (vals.length < 2) continue
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length
        const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length - 1)
        const sd = Math.sqrt(variance)
        means[comp] = mean
        sds[comp] = sd
      }
      baselines[key] = { mean: means, sd: sds }
    }

    // Step 3: Compute z-scores and deception scores for each pitcher-pitch_type
    const upsertRows: any[] = []

    for (const row of pitcherRows) {
      const key = `${row.p_throws}:${row.pitch_type}`
      const bl = baselines[key]
      if (!bl) continue

      const zScores: Record<string, number | null> = {}
      for (const comp of ['vaa', 'haa', 'vb', 'hb', 'ext'] as const) {
        const val = Number(row[`avg_${comp}`])
        const mean = bl.mean[comp]
        const sd = bl.sd[comp]
        if (isNaN(val) || mean == null || sd == null || sd === 0) {
          zScores[comp] = null
        } else {
          zScores[comp] = (val - mean) / sd
        }
      }

      // Skip if any required z-score is missing
      const isFB = FASTBALL_TYPES.has(row.pitch_type)
      const requiredComps = isFB
        ? ['vaa', 'haa', 'vb', 'hb', 'ext']
        : ['vaa', 'haa', 'vb', 'hb']
      const hasAllZ = requiredComps.every(c => zScores[c] != null)
      if (!hasAllZ) continue

      // Unique score (absolute z-scores)
      let uniqueScore: number
      if (isFB) {
        uniqueScore =
          FB_UNIQUE_W.vaa * Math.abs(zScores.vaa!) +
          FB_UNIQUE_W.vb * Math.abs(zScores.vb!) +
          FB_UNIQUE_W.hb * Math.abs(zScores.hb!) +
          FB_UNIQUE_W.haa * Math.abs(zScores.haa!) +
          FB_UNIQUE_W.ext * Math.abs(zScores.ext!)
      } else {
        uniqueScore =
          OS_UNIQUE_W.vaa * Math.abs(zScores.vaa!) +
          OS_UNIQUE_W.vb * Math.abs(zScores.vb!) +
          OS_UNIQUE_W.hb * Math.abs(zScores.hb!) +
          OS_UNIQUE_W.haa * Math.abs(zScores.haa!)
      }

      // Deception score (signed z-scores with directional weights)
      let deceptionScore: number
      if (isFB) {
        deceptionScore =
          FB_DECEPTION_W.vaa * zScores.vaa! +
          FB_DECEPTION_W.ext * zScores.ext! +
          FB_DECEPTION_W.vb * zScores.vb! +
          FB_DECEPTION_W.hb * zScores.hb! +
          FB_DECEPTION_W.haa * zScores.haa!
      } else {
        deceptionScore =
          OS_DECEPTION_W.vaa * zScores.vaa! +
          (zScores.ext != null ? OS_DECEPTION_W.ext * zScores.ext! : 0) +
          OS_DECEPTION_W.vb * zScores.vb! +
          OS_DECEPTION_W.hb * zScores.hb! +
          OS_DECEPTION_W.haa * zScores.haa!
      }

      upsertRows.push({
        pitcher: Number(row.pitcher),
        player_name: row.player_name,
        game_year: year,
        pitch_type: row.pitch_type,
        pitch_name: row.pitch_name,
        p_throws: row.p_throws,
        pitches: Number(row.pitches),
        avg_vaa: row.avg_vaa != null ? +Number(row.avg_vaa).toFixed(4) : null,
        avg_haa: row.avg_haa != null ? +Number(row.avg_haa).toFixed(4) : null,
        avg_vb: row.avg_vb != null ? +Number(row.avg_vb).toFixed(4) : null,
        avg_hb: row.avg_hb != null ? +Number(row.avg_hb).toFixed(4) : null,
        avg_ext: row.avg_ext != null ? +Number(row.avg_ext).toFixed(4) : null,
        z_vaa: zScores.vaa != null ? +zScores.vaa.toFixed(4) : null,
        z_haa: zScores.haa != null ? +zScores.haa.toFixed(4) : null,
        z_vb: zScores.vb != null ? +zScores.vb.toFixed(4) : null,
        z_hb: zScores.hb != null ? +zScores.hb.toFixed(4) : null,
        z_ext: zScores.ext != null ? +zScores.ext.toFixed(4) : null,
        unique_score: +uniqueScore.toFixed(4),
        deception_score: +deceptionScore.toFixed(4),
      })
    }

    // Upsert in batches of 500
    let upserted = 0
    for (let i = 0; i < upsertRows.length; i += 500) {
      const batch = upsertRows.slice(i, i + 500)
      const { error: upsertErr } = await supabase
        .from('pitcher_season_deception')
        .upsert(batch, { onConflict: 'pitcher,game_year,pitch_type' })
      if (upsertErr) return NextResponse.json({ error: upsertErr.message, upserted }, { status: 500 })
      upserted += batch.length
    }

    return NextResponse.json({
      message: `Computed deception metrics for ${year}`,
      year,
      rowsUpserted: upserted,
      pitcherAvgs: pitcherRows.length,
      baselineGroups: Object.keys(baselines).length,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
