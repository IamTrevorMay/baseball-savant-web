import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { METRICS, TRITON_PLUS_METRIC_KEYS, DECEPTION_METRIC_KEYS } from '@/lib/reportMetrics'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

      // ── Triton+ leaderboard (primary metric from pitcher_season_command) ──
      if (isTritonPrimary) {
        const year = parseInt(gameYear || '2025')
        const minPitches = parseInt(sp.get('minSample') || '300')

        // Map Triton+ metric keys to column expressions on pivoted data
        const TRITON_COL: Record<string, string> = {
          cmd_plus: 'cmd_plus', rpcom_plus: 'rpcom_plus',
          brink_plus: 'brink_plus', cluster_plus: 'cluster_plus',
          hdev_plus: 'hdev_plus', vdev_plus: 'vdev_plus', missfire_plus: 'missfire_plus',
        }

        // Fetch raw per-pitch-type rows and pivot in JS (matches leaderboard-triton pattern)
        const sql = `
          SELECT pitcher, player_name, pitch_name, pitches,
            brink_plus, cluster_plus, hdev_plus, vdev_plus, missfire_plus,
            cmd_plus, rpcom_plus
          FROM pitcher_season_command
          WHERE game_year = ${year}
        `.trim()

        const { data, error } = await supabase.rpc('run_query', { query_text: sql })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        // Pivot to one row per pitcher with usage-weighted composites
        const map = new Map<number, Record<string, any>>()
        for (const row of (data || [])) {
          const id = row.pitcher
          if (!map.has(id)) {
            map.set(id, { player_id: id, player_name: row.player_name, pitches: 0,
              _cmd_sum: 0, _cmd_w: 0, _rpcom_sum: 0, _rpcom_w: 0,
              _brink_sum: 0, _brink_w: 0, _cluster_sum: 0, _cluster_w: 0,
              _hdev_sum: 0, _hdev_w: 0, _vdev_sum: 0, _vdev_w: 0,
              _missfire_sum: 0, _missfire_w: 0,
            })
          }
          const p = map.get(id)!
          const n = Number(row.pitches) || 0
          p.pitches += n
          for (const k of ['cmd', 'rpcom', 'brink', 'cluster', 'hdev', 'vdev', 'missfire']) {
            const col = k === 'cmd' || k === 'rpcom' ? `${k}_plus` : `${k}_plus`
            if (row[col] != null) { p[`_${k}_sum`] += Number(row[col]) * n; p[`_${k}_w`] += n }
          }
        }

        let rows = Array.from(map.values())
        for (const r of rows) {
          for (const k of ['cmd', 'rpcom', 'brink', 'cluster', 'hdev', 'vdev', 'missfire']) {
            r[`${k}_plus`] = r[`_${k}_w`] > 0 ? Math.round((r[`_${k}_sum`] / r[`_${k}_w`]) * 10) / 10 : null
          }
        }
        rows = rows.filter(r => r.pitches >= minPitches)

        // Map primary/secondary/tertiary from Triton+ or fall back to pitches-based
        // For simplicity, secondary/tertiary that need pitches table are fetched separately
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

        // Build result with aliases
        const result = rows.map(r => {
          const out: Record<string, any> = { player_id: r.player_id, player_name: r.player_name }
          for (const m of allMetrics) {
            if (TRITON_COL[m.key]) out[m.alias] = r[TRITON_COL[m.key]] ?? null
            else out[m.alias] = null // secondary/tertiary from different source not available here
          }
          return out
        })

        // If secondary/tertiary are pitches-based metrics, fetch them for these player IDs
        const pitchesMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !TRITON_PLUS_METRIC_KEYS.has(m.key) && !DECEPTION_METRIC_KEYS.has(m.key))
        if (pitchesMetrics.length > 0 && result.length > 0) {
          const ids = result.map(r => r.player_id)
          const groupCol = playerType === 'batter' ? 'batter' : 'pitcher'
          const where2 = [`p.${groupCol} IN (${ids.join(',')})`, "pitch_type NOT IN ('PO', 'IN')"]
          if (gameYear) where2.push(`game_year = ${parseInt(gameYear)}`)
          if (pitchType) where2.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)
          const selects2 = pitchesMetrics.map(m => `${METRICS[m.key]} as ${m.alias}`)
          const sql2 = `SELECT p.${groupCol} as player_id, ${selects2.join(', ')} FROM pitches p WHERE ${where2.join(' AND ')} GROUP BY p.${groupCol}`.trim()
          const { data: d2 } = await supabase.rpc('run_query', { query_text: sql2 })
          if (d2) {
            const lookup = new Map((d2 as any[]).map(r => [r.player_id, r]))
            for (const r of result) {
              const extra = lookup.get(r.player_id)
              if (extra) { for (const m of pitchesMetrics) r[m.alias] = extra[m.alias] ?? null }
            }
          }
        }

        return NextResponse.json({ leaderboard: result })
      }

      // ── Deception leaderboard (primary metric from pitcher_season_deception) ──
      if (isDeceptionPrimary) {
        const year = parseInt(gameYear || '2025')
        const minPitches = parseInt(sp.get('minSample') || '300')

        const sql = `
          SELECT pitcher, player_name, pitch_type, pitches,
            unique_score, deception_score
          FROM pitcher_season_deception
          WHERE game_year = ${year}
        `.trim()

        const { data, error } = await supabase.rpc('run_query', { query_text: sql })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        // Pivot to one row per pitcher
        const map = new Map<number, Record<string, any>>()
        for (const row of (data || [])) {
          const id = row.pitcher
          if (!map.has(id)) {
            map.set(id, { player_id: id, player_name: row.player_name, pitches: 0,
              _uniq_sum: 0, _uniq_w: 0, _dec_sum: 0, _dec_w: 0 })
          }
          const p = map.get(id)!
          const n = Number(row.pitches) || 0
          p.pitches += n
          if (row.unique_score != null) { p._uniq_sum += Number(row.unique_score) * n; p._uniq_w += n }
          if (row.deception_score != null) { p._dec_sum += Number(row.deception_score) * n; p._dec_w += n }
        }

        let rows = Array.from(map.values())
        for (const r of rows) {
          r.unique_score = r._uniq_w > 0 ? Math.round((r._uniq_sum / r._uniq_w) * 100) / 100 : null
          r.deception_score = r._dec_w > 0 ? Math.round((r._dec_sum / r._dec_w) * 100) / 100 : null
          // xDeception not stored per-row in simple form, use deception_score as fallback
          r.xdeception_score = r.deception_score
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
        const pitchesMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !TRITON_PLUS_METRIC_KEYS.has(m.key) && !DECEPTION_METRIC_KEYS.has(m.key))
        if (pitchesMetrics.length > 0 && result.length > 0) {
          const ids = result.map(r => r.player_id)
          const where2 = [`p.pitcher IN (${ids.join(',')})`, "pitch_type NOT IN ('PO', 'IN')"]
          if (gameYear) where2.push(`game_year = ${parseInt(gameYear)}`)
          if (pitchType) where2.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)
          const selects2 = pitchesMetrics.map(m => `${METRICS[m.key]} as ${m.alias}`)
          const sql2 = `SELECT p.pitcher as player_id, ${selects2.join(', ')} FROM pitches p WHERE ${where2.join(' AND ')} GROUP BY p.pitcher`.trim()
          const { data: d2 } = await supabase.rpc('run_query', { query_text: sql2 })
          if (d2) {
            const lookup = new Map((d2 as any[]).map(r => [r.player_id, r]))
            for (const r of result) {
              const extra = lookup.get(r.player_id)
              if (extra) { for (const m of pitchesMetrics) r[m.alias] = extra[m.alias] ?? null }
            }
          }
        }

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
      `.trim()

      const { data, error } = await supabase.rpc('run_query', { query_text: sql })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ leaderboard: data || [] })
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
      `.trim()

      const { data, error } = await supabase.rpc('run_query', { query_text: sql })
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
