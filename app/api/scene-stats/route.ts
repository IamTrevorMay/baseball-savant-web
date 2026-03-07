import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { METRICS, TRITON_PLUS_METRIC_KEYS, DECEPTION_METRIC_KEYS, ERA_METRIC_KEYS } from '@/lib/reportMetrics'
import { SEASON_CONSTANTS, LATEST_SEASON_YEAR } from '@/lib/constants-data'
import { computeXDeceptionScore, isFastball } from '@/lib/leagueStats'
import {
  TRITON_COLUMNS, TRITON_COL,
  ERA_COMPONENTS_SQL,
  computeFIP, computeXERA,
  pivotTritonRows, backfillFromLookup,
  backfillPitchesMetrics, backfillTritonMetrics, backfillEraMetrics,
} from '@/lib/sql'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

/**
 * GET /api/scene-stats?playerId=543037&metrics=avg_velo,whiff_pct&gameYear=2024&pitchType=FF
 * Also supports kinematics=true mode for pitch flight elements.
 * Also supports leaderboard=true mode for data-driven templates.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams

    // ── Leaderboard mode (for data-driven templates) ─────────────────────
    if (sp.get('leaderboard') === 'true') {
      const metric = sp.get('metric')
      const playerType = sp.get('playerType') || 'pitcher'
      const gameYear = sp.get('gameYear')
      const dateFrom = sp.get('dateFrom')
      const dateTo = sp.get('dateTo')
      const pitchType = sp.get('pitchType')
      const limit = Math.min(parseInt(sp.get('limit') || '5'), 25)
      const sortDir = sp.get('sortDir') === 'asc' ? 'ASC' : 'DESC'
      const secondaryMetric = sp.get('secondaryMetric')
      const tertiaryMetric = sp.get('tertiaryMetric')

      if (!metric) return NextResponse.json({ error: 'metric required' }, { status: 400 })

      // Determine which source each metric needs
      const allMetrics = [
        { key: metric, alias: 'primary_value' },
        ...(secondaryMetric ? [{ key: secondaryMetric, alias: 'secondary_value' }] : []),
        ...(tertiaryMetric ? [{ key: tertiaryMetric, alias: 'tertiary_value' }] : []),
      ]

      const isTritonPrimary = TRITON_PLUS_METRIC_KEYS.has(metric)
      const isDeceptionPrimary = DECEPTION_METRIC_KEYS.has(metric)

      // ── Triton leaderboard (primary metric from pitcher_season_command) ──
      if (isTritonPrimary) {
        const year = parseInt(gameYear || '2025')
        const minPitches = parseInt(sp.get('minSample') || '300')

        const sql = `
          SELECT pitcher, player_name, pitches, ${TRITON_COLUMNS.join(', ')}
          FROM pitcher_season_command
          WHERE game_year = ${year}
        `

        const { data, error } = await q(sql)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        const tMap = pivotTritonRows((data || []) as any[])
        let rows: Record<string, any>[] = Array.from(tMap.entries()).map(([id, p]) => ({ player_id: id, ...p }))
        rows = rows.filter(r => r.pitches >= minPitches)

        const jsSortDir = sortDir === 'ASC' ? 1 : -1
        const primaryCol = TRITON_COL[metric] || metric
        rows.sort((a, b) => {
          const va = a[primaryCol], vb = b[primaryCol]
          if (va == null && vb == null) return 0
          if (va == null) return 1
          if (vb == null) return -1
          return (va - vb) * jsSortDir
        })
        rows = rows.slice(0, limit)

        const result = rows.map(r => {
          const out: Record<string, any> = { player_id: r.player_id, player_name: r.player_name }
          for (const m of allMetrics) {
            if (TRITON_COL[m.key]) out[m.alias] = r[TRITON_COL[m.key]] ?? null
            else out[m.alias] = null
          }
          return out
        })

        // Parallel backfills for secondary/tertiary from other sources
        const pitchesMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !TRITON_PLUS_METRIC_KEYS.has(m.key) && !DECEPTION_METRIC_KEYS.has(m.key) && !ERA_METRIC_KEYS.has(m.key))
        const eraBackfill = allMetrics.filter(m => m.alias !== 'primary_value' && ERA_METRIC_KEYS.has(m.key))
        const extraWhere: string[] = []
        if (gameYear) extraWhere.push(`game_year = ${parseInt(gameYear)}`)
        if (pitchType) extraWhere.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)
        const groupCol = playerType === 'batter' ? 'batter' : 'pitcher'
        const yr = parseInt(gameYear || '2025')

        await Promise.all([
          backfillPitchesMetrics(q, result, pitchesMetrics, groupCol, extraWhere),
          backfillEraMetrics(q, result, eraBackfill, SEASON_CONSTANTS[yr] || SEASON_CONSTANTS[LATEST_SEASON_YEAR], gameYear ? [`game_year = ${yr}`] : []),
        ])

        return NextResponse.json({ leaderboard: result })
      }

      // ── Deception leaderboard (primary metric from pitcher_season_deception) ──
      if (isDeceptionPrimary) {
        const year = parseInt(gameYear || '2025')
        const minPitches = parseInt(sp.get('minSample') || '300')

        const sql = `
          SELECT pitcher, player_name, pitch_type, pitches,
            z_vaa, z_haa, z_vb, z_hb, z_ext,
            unique_score, deception_score
          FROM pitcher_season_deception
          WHERE game_year = ${year}
        `

        const { data, error } = await q(sql)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        // Pivot to one row per pitcher
        const map = new Map<number, Record<string, any>>()
        for (const row of (data || [])) {
          const id = row.pitcher
          if (!map.has(id)) {
            map.set(id, { player_id: id, player_name: row.player_name, pitches: 0,
              _uniq_sum: 0, _uniq_w: 0, _dec_sum: 0, _dec_w: 0,
              _fb_z: { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 },
              _os_z: { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 },
            })
          }
          const p = map.get(id)!
          const n = Number(row.pitches) || 0
          p.pitches += n
          if (row.unique_score != null) { p._uniq_sum += Number(row.unique_score) * n; p._uniq_w += n }
          if (row.deception_score != null) { p._dec_sum += Number(row.deception_score) * n; p._dec_w += n }

          // Accumulate z-scores for xDeception
          const isFB = isFastball(row.pitch_type)
          const bucket = isFB ? p._fb_z : p._os_z
          if (row.z_vaa != null && row.z_haa != null && row.z_vb != null && row.z_hb != null) {
            bucket.vaa += Number(row.z_vaa) * n
            bucket.haa += Number(row.z_haa) * n
            bucket.vb += Number(row.z_vb) * n
            bucket.hb += Number(row.z_hb) * n
            bucket.ext += (row.z_ext != null ? Number(row.z_ext) : 0) * n
            bucket.w += n
          }
        }

        let rows = Array.from(map.values())
        for (const r of rows) {
          r.unique_score = r._uniq_w > 0 ? Math.round((r._uniq_sum / r._uniq_w) * 1000) / 1000 : null
          r.deception_score = r._dec_w > 0 ? Math.round((r._dec_sum / r._dec_w) * 1000) / 1000 : null

          // xDeception from z-score regression
          const fb = r._fb_z, os = r._os_z
          if (fb.w > 0 && os.w > 0) {
            const fbZ = { vaa: fb.vaa / fb.w, haa: fb.haa / fb.w, vb: fb.vb / fb.w, hb: fb.hb / fb.w, ext: fb.ext / fb.w }
            const osZ = { vaa: os.vaa / os.w, haa: os.haa / os.w, vb: os.vb / os.w, hb: os.hb / os.w, ext: os.ext / os.w }
            r.xdeception_score = Math.round(computeXDeceptionScore(fbZ, osZ) * 1000) / 1000
          } else {
            r.xdeception_score = null
          }
        }
        rows = rows.filter(r => r.pitches >= minPitches)

        const DEC_COL: Record<string, string> = { deception_score: 'deception_score', unique_score: 'unique_score', xdeception_score: 'xdeception_score' }
        const primaryCol = DEC_COL[metric] || metric
        const jsSortDir = sortDir === 'ASC' ? 1 : -1
        rows.sort((a, b) => {
          const va = a[primaryCol], vb = b[primaryCol]
          if (va == null && vb == null) return 0
          if (va == null) return 1
          if (vb == null) return -1
          return (va - vb) * jsSortDir
        })
        rows = rows.slice(0, limit)

        const result = rows.map(r => {
          const out: Record<string, any> = { player_id: r.player_id, player_name: r.player_name }
          for (const m of allMetrics) {
            if (DEC_COL[m.key]) out[m.alias] = r[DEC_COL[m.key]] ?? null
            else out[m.alias] = null
          }
          return out
        })

        // Backfill pitches-based secondary/tertiary
        const pitchesMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !TRITON_PLUS_METRIC_KEYS.has(m.key) && !DECEPTION_METRIC_KEYS.has(m.key) && !ERA_METRIC_KEYS.has(m.key))
        if (pitchesMetrics.length > 0 && result.length > 0) {
          const ids = result.map(r => r.player_id)
          const where2 = [`p.pitcher IN (${ids.join(',')})`, "pitch_type NOT IN ('PO', 'IN')"]
          if (gameYear) where2.push(`game_year = ${parseInt(gameYear)}`)
          if (pitchType) where2.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)
          const selects2 = pitchesMetrics.map(m => `${METRICS[m.key]} as ${m.alias}`)
          const sql2 = `SELECT p.pitcher as player_id, ${selects2.join(', ')} FROM pitches p WHERE ${where2.join(' AND ')} GROUP BY p.pitcher`
          const { data: d2 } = await q(sql2)
          if (d2) backfillFromLookup(result, d2 as any[], pitchesMetrics)
        }

        return NextResponse.json({ leaderboard: result })
      }

      // ── ERA from MLB Stats API ──────────────────────────────────────────
      if (metric === 'era') {
        const year = parseInt(gameYear || '2025')
        // Fetch 50 leaders to have room after filtering; MLB API handles qualifying IP
        const mlbUrl = `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=earnedRunAverage&season=${year}&statGroup=pitching&limit=50`
        const mlbResp = await fetch(mlbUrl, { next: { revalidate: 3600 } })
        if (!mlbResp.ok) return NextResponse.json({ error: 'MLB API error' }, { status: 502 })
        const mlbData = await mlbResp.json()
        const leaders = mlbData?.leagueLeaders?.[0]?.leaders || []

        let rows = leaders.map((l: any) => ({
          player_id: l.person?.id,
          player_name: l.person?.fullName || '',
          era: parseFloat(l.value) || null,
        }))

        const jsSortDir = sortDir === 'ASC' ? 1 : -1
        rows.sort((a: any, b: any) => {
          if (a.era == null && b.era == null) return 0
          if (a.era == null) return 1; if (b.era == null) return -1
          return (a.era - b.era) * jsSortDir
        })
        rows = rows.slice(0, limit)

        const result = rows.map((r: any) => {
          const out: Record<string, any> = { player_id: r.player_id, player_name: r.player_name, primary_value: r.era }
          for (const m of allMetrics) { if (m.alias !== 'primary_value') out[m.alias] = null }
          return out
        })

        // Parallel backfills for secondary/tertiary from different sources
        const pitchesMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !ERA_METRIC_KEYS.has(m.key) && !TRITON_PLUS_METRIC_KEYS.has(m.key) && !DECEPTION_METRIC_KEYS.has(m.key))
        const tritonBackfill = allMetrics.filter(m => m.alias !== 'primary_value' && TRITON_PLUS_METRIC_KEYS.has(m.key))
        const eraBackfill = allMetrics.filter(m => m.alias !== 'primary_value' && (m.key === 'fip' || m.key === 'xera'))
        const extraWhere3 = [`game_year = ${year}`, ...(pitchType ? [`pitch_type = '${pitchType.replace(/'/g, "''")}'`] : [])]

        await Promise.all([
          backfillPitchesMetrics(q, result, pitchesMetrics, 'pitcher', extraWhere3),
          backfillTritonMetrics(q, result, tritonBackfill, year),
          backfillEraMetrics(q, result, eraBackfill, SEASON_CONSTANTS[year] || SEASON_CONSTANTS[LATEST_SEASON_YEAR], [`game_year = ${year}`]),
        ])

        return NextResponse.json({ leaderboard: result })
      }

      // ── FIP / xERA leaderboard (computed from pitches + year constants) ──
      const isFIPxERA = metric === 'fip' || metric === 'xera'
      if (isFIPxERA) {
        const year = parseInt(gameYear || '2025')
        const constants = SEASON_CONSTANTS[year] || SEASON_CONSTANTS[LATEST_SEASON_YEAR]
        const minPitches = parseInt(sp.get('minSample') || '300')

        const where: string[] = ["pitch_type NOT IN ('PO', 'IN')"]
        if (gameYear) where.push(`game_year = ${year}`)
        if (dateFrom) where.push(`game_date >= '${dateFrom.replace(/'/g, "''")}'`)
        if (dateTo) where.push(`game_date <= '${dateTo.replace(/'/g, "''")}'`)
        if (pitchType) where.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)

        const sql = `
          SELECT p.pitcher as player_id, pl.name as player_name, COUNT(*) as pitches,
            ${ERA_COMPONENTS_SQL}
          FROM pitches p JOIN players pl ON pl.id = p.pitcher
          WHERE ${where.join(' AND ')}
          GROUP BY p.pitcher, pl.name HAVING COUNT(*) >= ${minPitches}
        `

        const { data, error } = await q(sql)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        let rows = ((data || []) as any[]).map(r => {
          const fip = computeFIP(r, constants)
          const xera = computeXERA(r, constants)
          return { player_id: r.player_id, player_name: r.player_name, fip, xera }
        })

        const primaryCol = metric // 'fip' or 'xera'
        const jsSortDir = sortDir === 'ASC' ? 1 : -1
        rows.sort((a, b) => {
          const va = (a as any)[primaryCol], vb = (b as any)[primaryCol]
          if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1
          return (va - vb) * jsSortDir
        })
        rows = rows.slice(0, limit)

        const ERA_COL: Record<string, string> = { era: 'fip', fip: 'fip', xera: 'xera' }
        const result = rows.map(r => {
          const out: Record<string, any> = { player_id: r.player_id, player_name: r.player_name }
          for (const m of allMetrics) { out[m.alias] = (r as any)[ERA_COL[m.key] || ''] ?? null }
          return out
        })

        // Parallel backfills for secondary/tertiary from other sources
        const pitchesMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !ERA_METRIC_KEYS.has(m.key) && !TRITON_PLUS_METRIC_KEYS.has(m.key) && !DECEPTION_METRIC_KEYS.has(m.key))
        const tritonBackfill = allMetrics.filter(m => m.alias !== 'primary_value' && TRITON_PLUS_METRIC_KEYS.has(m.key))
        const extraWhere4: string[] = []
        if (gameYear) extraWhere4.push(`game_year = ${year}`)
        if (pitchType) extraWhere4.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)

        await Promise.all([
          backfillPitchesMetrics(q, result, pitchesMetrics, 'pitcher', extraWhere4),
          backfillTritonMetrics(q, result, tritonBackfill, year),
        ])

        return NextResponse.json({ leaderboard: result })
      }

      // ── Standard pitches-table leaderboard ────────────────────────────────
      if (!METRICS[metric]) return NextResponse.json({ error: 'Valid metric required' }, { status: 400 })

      const groupCol = playerType === 'batter' ? 'batter' : 'pitcher'
      const defaultMin = playerType === 'batter' ? 150 : 300
      const minSample = parseInt(sp.get('minSample') || String(defaultMin))

      const where: string[] = ["pitch_type NOT IN ('PO', 'IN')"]
      if (gameYear) where.push(`game_year = ${parseInt(gameYear)}`)
      if (dateFrom) where.push(`game_date >= '${dateFrom.replace(/'/g, "''")}'`)
      if (dateTo) where.push(`game_date <= '${dateTo.replace(/'/g, "''")}'`)
      if (pitchType) where.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)

      const selects = [`${METRICS[metric]} as primary_value`]
      if (secondaryMetric && METRICS[secondaryMetric]) selects.push(`${METRICS[secondaryMetric]} as secondary_value`)
      if (tertiaryMetric && METRICS[tertiaryMetric]) selects.push(`${METRICS[tertiaryMetric]} as tertiary_value`)

      const sql = `
        SELECT
          p.${groupCol} as player_id,
          pl.name as player_name,
          ${selects.join(',\n          ')}
        FROM pitches p
        JOIN players pl ON pl.id = p.${groupCol}
        WHERE ${where.join(' AND ')}
        GROUP BY p.${groupCol}, pl.name
        HAVING COUNT(*) >= ${minSample}
        ORDER BY primary_value ${sortDir} NULLS LAST
        LIMIT ${limit}
      `

      const { data, error } = await q(sql)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const result: any[] = data || []
      if (result.length === 0) return NextResponse.json({ leaderboard: result })

      // Cross-source backfill for secondary/tertiary metrics from non-pitches sources
      const ids = result.map((r: any) => r.player_id)
      const year = parseInt(gameYear || '2025')

      const tritonMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && TRITON_PLUS_METRIC_KEYS.has(m.key))
      const eraMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && ERA_METRIC_KEYS.has(m.key))

      if (playerType === 'pitcher') {
        const extraWhere5: string[] = []
        if (gameYear) extraWhere5.push(`game_year = ${year}`)
        if (pitchType) extraWhere5.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)

        await Promise.all([
          backfillTritonMetrics(q, result, tritonMetrics, year),
          backfillEraMetrics(q, result, eraMetrics, SEASON_CONSTANTS[year] || SEASON_CONSTANTS[LATEST_SEASON_YEAR], extraWhere5),
        ])
      }

      return NextResponse.json({ leaderboard: result })
    }

    // ── Percentile mode (for single-player percentile rankings) ─────────
    if (sp.get('percentile') === 'true') {
      const playerId = sp.get('playerId')
      const playerType = sp.get('playerType') || 'pitcher'
      const gameYear = parseInt(sp.get('gameYear') || '2025')

      if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
      const pid = parseInt(playerId)
      const groupCol = playerType === 'batter' ? 'batter' : 'pitcher'
      const minSample = playerType === 'batter' ? 150 : 300

      // Define metrics for each player type
      const pitcherMetrics: { key: string; label: string; expr: string; invert?: boolean }[] = [
        { key: 'avg_velo', label: 'FB Velo', expr: METRICS['avg_velo'] },
        { key: 'k_pct', label: 'K%', expr: METRICS['k_pct'] },
        { key: 'bb_pct', label: 'BB%', expr: METRICS['bb_pct'], invert: true },
        { key: 'whiff_pct', label: 'Whiff%', expr: METRICS['whiff_pct'] },
        { key: 'chase_pct', label: 'Chase Rate', expr: METRICS['chase_pct'] },
        { key: 'barrel_pct', label: 'Barrel% Against', expr: METRICS['barrel_pct'], invert: true },
        { key: 'hard_hit_pct', label: 'Hard Hit% Against', expr: METRICS['hard_hit_pct'], invert: true },
        { key: 'csw_pct', label: 'CSW%', expr: METRICS['csw_pct'] },
        { key: 'avg_xwoba', label: 'xwOBA Against', expr: METRICS['avg_xwoba'], invert: true },
        { key: 'avg_spin', label: 'FB Spin', expr: METRICS['avg_spin'] },
      ]

      const batterMetrics: { key: string; label: string; expr: string; invert?: boolean }[] = [
        { key: 'avg_ev', label: 'Avg EV', expr: METRICS['avg_ev'] },
        { key: 'max_ev', label: 'Max EV', expr: METRICS['max_ev'] },
        { key: 'barrel_pct', label: 'Barrel%', expr: METRICS['barrel_pct'] },
        { key: 'hard_hit_pct', label: 'Hard Hit%', expr: METRICS['hard_hit_pct'] },
        { key: 'k_pct', label: 'K%', expr: METRICS['k_pct'], invert: true },
        { key: 'bb_pct', label: 'BB%', expr: METRICS['bb_pct'] },
        { key: 'avg_xwoba', label: 'xwOBA', expr: METRICS['avg_xwoba'] },
        { key: 'avg_xba', label: 'xBA', expr: METRICS['avg_xba'] },
        { key: 'chase_pct', label: 'Chase Rate', expr: METRICS['chase_pct'], invert: true },
        { key: 'whiff_pct', label: 'Whiff%', expr: METRICS['whiff_pct'], invert: true },
      ]

      const metrics = playerType === 'batter' ? batterMetrics : pitcherMetrics

      // Run one query per metric in parallel
      const results = await Promise.all(metrics.map(async (m) => {
        const orderDir = m.invert ? 'DESC' : 'ASC'
        const sql = `
          SELECT player_id, metric_value,
            ROUND(PERCENT_RANK() OVER (ORDER BY metric_value ${orderDir}) * 100) AS pctl
          FROM (
            SELECT p.${groupCol} AS player_id, ${m.expr} AS metric_value
            FROM pitches p JOIN players pl ON pl.id = p.${groupCol}
            WHERE game_year = ${gameYear} AND pitch_type NOT IN ('PO','IN')
            GROUP BY p.${groupCol} HAVING COUNT(*) >= ${minSample}
          ) sub
        `
        const { data, error } = await q(sql)
        if (error) return { key: m.key, label: m.label, value: null, percentile: 50 }
        const row = (data || []).find((r: any) => r.player_id === pid)
        if (!row) return { key: m.key, label: m.label, value: null, percentile: 50 }
        return {
          key: m.key,
          label: m.label,
          value: row.metric_value,
          percentile: Number(row.pctl) || 0,
        }
      }))

      return NextResponse.json({ percentiles: results })
    }

    const playerId = sp.get('playerId')
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

    const gameYear = sp.get('gameYear')
    const pitchType = sp.get('pitchType')
    const dateFrom = sp.get('dateFrom')
    const dateTo = sp.get('dateTo')
    const kinematics = sp.get('kinematics') === 'true'
    const battedBalls = sp.get('battedBalls') === 'true'

    // ── Batted Balls mode (for Stadium element) ──────────────────────────
    if (battedBalls) {
      const batterId = sp.get('batterId') || playerId
      const events = sp.get('events')    // comma-sep: home_run,double,triple,single
      const bbType = sp.get('bbType')    // comma-sep: fly_ball,line_drive,ground_ball,popup
      const minEV = sp.get('minEV')
      const park = sp.get('park')        // home_team filter

      const where: string[] = [
        `batter = ${parseInt(batterId)}`,
        'hc_x IS NOT NULL',
        'hc_y IS NOT NULL',
        'launch_speed IS NOT NULL',
        'launch_angle IS NOT NULL',
        "pitch_type NOT IN ('PO', 'IN')",
      ]
      if (gameYear) where.push(`game_year = ${parseInt(gameYear)}`)
      if (dateFrom) where.push(`game_date >= '${dateFrom.replace(/'/g, "''")}'`)
      if (dateTo) where.push(`game_date <= '${dateTo.replace(/'/g, "''")}'`)
      if (events) {
        const evList = events.split(',').map(e => `'${e.trim().replace(/'/g, "''")}'`).join(',')
        where.push(`events IN (${evList})`)
      }
      if (bbType) {
        const bbList = bbType.split(',').map(b => `'${b.trim().replace(/'/g, "''")}'`).join(',')
        where.push(`bb_type IN (${bbList})`)
      }
      if (minEV) where.push(`launch_speed >= ${parseFloat(minEV)}`)
      if (park) where.push(`home_team = '${park.replace(/'/g, "''")}'`)

      const sql = `
        SELECT
          launch_speed, launch_angle, hc_x, hc_y,
          hit_distance_sc, events, bb_type, home_team, game_date,
          ROUND((ATAN2(hc_x - 125.42, 198.27 - hc_y) * 180 / PI())::numeric, 2) as spray_angle
        FROM pitches
        WHERE ${where.join(' AND ')}
        ORDER BY game_date DESC
        LIMIT 500
      `

      const { data, error } = await q(sql)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ battedBalls: data })
    }

    // Build WHERE clauses
    const where: string[] = [`pitcher = ${parseInt(playerId)}`, "pitch_type NOT IN ('PO', 'IN')"]
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
      `

      const { data, error } = await q(sql)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ kinematics: data })
    }

    // Stats mode
    const metricList = (sp.get('metrics') || 'avg_velo,whiff_pct').split(',')
    const validMetrics = metricList.filter(m => METRICS[m])
    if (validMetrics.length === 0) return NextResponse.json({ error: 'No valid metrics' }, { status: 400 })

    const selectParts = validMetrics.map(m => `${METRICS[m]} AS ${m}`)
    const sql = `SELECT ${selectParts.join(', ')} FROM pitches ${whereClause}`

    const { data, error } = await q(sql)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const row = data?.[0] || {}
    const stats: Record<string, any> = {}
    for (const m of validMetrics) stats[m] = row[m] ?? null
    return NextResponse.json({ stats })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
