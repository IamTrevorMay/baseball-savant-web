import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { METRICS, TRITON_PLUS_METRIC_KEYS, DECEPTION_METRIC_KEYS, ERA_METRIC_KEYS } from '@/lib/reportMetrics'
import { SEASON_CONSTANTS } from '@/lib/constants-data'

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

      // ── Triton leaderboard (primary metric from pitcher_season_command) ──
      if (isTritonPrimary) {
        const year = parseInt(gameYear || '2025')
        const minPitches = parseInt(sp.get('minSample') || '300')

        // Map metric keys to pivoted column names
        const TRITON_COL: Record<string, string> = {
          cmd_plus: 'cmd_plus', rpcom_plus: 'rpcom_plus',
          brink_plus: 'brink_plus', cluster_plus: 'cluster_plus',
          hdev_plus: 'hdev_plus', vdev_plus: 'vdev_plus', missfire_plus: 'missfire_plus',
          avg_brink: 'avg_brink', avg_cluster: 'avg_cluster',
          avg_hdev: 'avg_hdev', avg_vdev: 'avg_vdev',
          avg_missfire: 'avg_missfire', waste_pct: 'waste_pct',
        }

        // Fetch all columns we need (raw + plus)
        const sql = `
          SELECT pitcher, player_name, pitch_name, pitches,
            avg_brink, avg_cluster, avg_hdev, avg_vdev, avg_missfire, waste_pct,
            brink_plus, cluster_plus, hdev_plus, vdev_plus, missfire_plus,
            cmd_plus, rpcom_plus
          FROM pitcher_season_command
          WHERE game_year = ${year}
        `.trim()

        const { data, error } = await supabase.rpc('run_query', { query_text: sql })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        // All keys to accumulate (both raw and plus)
        const ACCUM_KEYS = [
          'cmd_plus', 'rpcom_plus', 'brink_plus', 'cluster_plus', 'hdev_plus', 'vdev_plus', 'missfire_plus',
          'avg_brink', 'avg_cluster', 'avg_hdev', 'avg_vdev', 'avg_missfire', 'waste_pct',
        ]

        // Pivot to one row per pitcher with usage-weighted averages
        const map = new Map<number, Record<string, any>>()
        for (const row of (data || [])) {
          const id = row.pitcher
          if (!map.has(id)) {
            const init: Record<string, any> = { player_id: id, player_name: row.player_name, pitches: 0 }
            for (const k of ACCUM_KEYS) { init[`_${k}_sum`] = 0; init[`_${k}_w`] = 0 }
            map.set(id, init)
          }
          const p = map.get(id)!
          const n = Number(row.pitches) || 0
          p.pitches += n
          for (const k of ACCUM_KEYS) {
            if (row[k] != null) { p[`_${k}_sum`] += Number(row[k]) * n; p[`_${k}_w`] += n }
          }
        }

        let rows = Array.from(map.values())
        for (const r of rows) {
          for (const k of ACCUM_KEYS) {
            const precision = k.startsWith('avg_') || k === 'waste_pct' ? 100 : 10
            r[k] = r[`_${k}_w`] > 0 ? Math.round((r[`_${k}_sum`] / r[`_${k}_w`]) * precision) / precision : null
          }
        }
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

        // Build result with aliases
        const result = rows.map(r => {
          const out: Record<string, any> = { player_id: r.player_id, player_name: r.player_name }
          for (const m of allMetrics) {
            if (TRITON_COL[m.key]) out[m.alias] = r[TRITON_COL[m.key]] ?? null
            else out[m.alias] = null
          }
          return out
        })

        // Backfill pitches-based secondary/tertiary
        const pitchesMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !TRITON_PLUS_METRIC_KEYS.has(m.key) && !DECEPTION_METRIC_KEYS.has(m.key) && !ERA_METRIC_KEYS.has(m.key))
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

        // Backfill ERA secondary/tertiary
        const eraBackfill = allMetrics.filter(m => m.alias !== 'primary_value' && ERA_METRIC_KEYS.has(m.key))
        if (eraBackfill.length > 0 && result.length > 0) {
          const ids = result.map(r => r.player_id)
          const yr = parseInt(gameYear || '2025')
          const constants = SEASON_CONSTANTS[yr] || SEASON_CONSTANTS[2025]
          const sql2 = `SELECT p.pitcher as player_id, COUNT(*) FILTER (WHERE events LIKE '%strikeout%') as k, COUNT(*) FILTER (WHERE events = 'walk') as bb, COUNT(*) FILTER (WHERE events = 'hit_by_pitch') as hbp, COUNT(*) FILTER (WHERE events = 'home_run') as hr, (COUNT(DISTINCT CASE WHEN events IS NOT NULL AND events NOT IN ('single','double','triple','home_run','walk','hit_by_pitch','catcher_interf','field_error') THEN game_pk::bigint * 10000 + at_bat_number END) + COUNT(DISTINCT CASE WHEN events LIKE '%double_play%' THEN game_pk::bigint * 10000 + at_bat_number END) + 2 * COUNT(DISTINCT CASE WHEN events = 'triple_play' THEN game_pk::bigint * 10000 + at_bat_number END))::numeric / 3.0 as ip, COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa, AVG(estimated_woba_using_speedangle) as xwoba FROM pitches p WHERE p.pitcher IN (${ids.join(',')}) AND pitch_type NOT IN ('PO','IN') ${gameYear ? `AND game_year = ${yr}` : ''} GROUP BY p.pitcher`.trim()
          const { data: d2 } = await supabase.rpc('run_query', { query_text: sql2 })
          if (d2) {
            const lookup = new Map((d2 as any[]).map((r: any) => [r.player_id, r]))
            for (const r of result) {
              const s = lookup.get(r.player_id)
              if (!s) continue
              const ip = Number(s.ip) || 0, pa = Number(s.pa) || 0
              const fipVal = ip > 0 ? Math.round(((13 * (Number(s.hr) || 0) + 3 * ((Number(s.bb) || 0) + (Number(s.hbp) || 0)) - 2 * (Number(s.k) || 0)) / ip + constants.cfip) * 100) / 100 : null
              const xwoba = s.xwoba != null ? Number(s.xwoba) : null
              const xeraVal = ip > 0 && pa > 0 && xwoba != null ? Math.round((((xwoba - constants.woba) / constants.woba_scale) * (pa / ip) * 9 + constants.lg_era) * 100) / 100 : null
              const ERA_VALS: Record<string, any> = { era: fipVal, fip: fipVal, xera: xeraVal }
              for (const m of eraBackfill) r[m.alias] = ERA_VALS[m.key] ?? null
            }
          }
        }

        return NextResponse.json({ leaderboard: result })
      }

      // ── Deception leaderboard (primary metric from pitcher_season_deception) ──
      if (isDeceptionPrimary) {
        const FASTBALL_TYPES = new Set(['FF', 'SI', 'FC'])
        const XD = {
          fb_vaa: -1.2219, fb_haa: -0.2740, fb_vb: 0.3830, fb_hb: -0.2684, fb_ext: -0.8779,
          os_vaa: 1.1265, os_haa: 0.3900, os_vb: 0.0947, os_hb: -0.2621, os_ext: 1.2845,
        }

        const year = parseInt(gameYear || '2025')
        const minPitches = parseInt(sp.get('minSample') || '300')

        const sql = `
          SELECT pitcher, player_name, pitch_type, pitches,
            z_vaa, z_haa, z_vb, z_hb, z_ext,
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
          const isFB = FASTBALL_TYPES.has(row.pitch_type)
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
            r.xdeception_score = Math.round((
              XD.fb_vaa * fbZ.vaa + XD.fb_haa * fbZ.haa + XD.fb_vb * fbZ.vb + XD.fb_hb * fbZ.hb + XD.fb_ext * fbZ.ext +
              XD.os_vaa * osZ.vaa + XD.os_haa * osZ.haa + XD.os_vb * osZ.vb + XD.os_hb * osZ.hb + XD.os_ext * osZ.ext
            ) * 1000) / 1000
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
          // Secondary/tertiary default to null — backfilled below
          for (const m of allMetrics) { if (m.alias !== 'primary_value') out[m.alias] = null }
          return out
        })

        // Backfill secondary/tertiary from pitches
        const pitchesMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !ERA_METRIC_KEYS.has(m.key) && !TRITON_PLUS_METRIC_KEYS.has(m.key) && !DECEPTION_METRIC_KEYS.has(m.key))
        if (pitchesMetrics.length > 0 && result.length > 0) {
          const ids = result.map((r: any) => r.player_id)
          const where2 = [`p.pitcher IN (${ids.join(',')})`, "pitch_type NOT IN ('PO', 'IN')", `game_year = ${year}`]
          if (pitchType) where2.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)
          const selects2 = pitchesMetrics.map(m => `${METRICS[m.key]} as ${m.alias}`)
          const sql2 = `SELECT p.pitcher as player_id, ${selects2.join(', ')} FROM pitches p WHERE ${where2.join(' AND ')} GROUP BY p.pitcher`.trim()
          const { data: d2 } = await supabase.rpc('run_query', { query_text: sql2 })
          if (d2) {
            const lookup = new Map((d2 as any[]).map((r: any) => [r.player_id, r]))
            for (const r of result) { const extra = lookup.get(r.player_id); if (extra) { for (const m of pitchesMetrics) r[m.alias] = extra[m.alias] ?? null } }
          }
        }

        // Backfill Triton secondary/tertiary
        const tritonBackfill = allMetrics.filter(m => m.alias !== 'primary_value' && TRITON_PLUS_METRIC_KEYS.has(m.key))
        if (tritonBackfill.length > 0 && result.length > 0) {
          const ids = result.map((r: any) => r.player_id)
          const TRI_COLS = ['cmd_plus','rpcom_plus','brink_plus','cluster_plus','hdev_plus','vdev_plus','missfire_plus','avg_brink','avg_cluster','avg_hdev','avg_vdev','avg_missfire','waste_pct']
          const sql2 = `SELECT pitcher, pitches, ${TRI_COLS.join(', ')} FROM pitcher_season_command WHERE game_year = ${year} AND pitcher IN (${ids.join(',')})`.trim()
          const { data: d2 } = await supabase.rpc('run_query', { query_text: sql2 })
          if (d2) {
            const tMap = new Map<number, Record<string, any>>()
            for (const row of d2 as any[]) {
              const id = row.pitcher; if (!tMap.has(id)) { const i: Record<string, any> = {}; for (const k of TRI_COLS) { i[`_${k}_s`] = 0; i[`_${k}_w`] = 0 }; tMap.set(id, i) }
              const p = tMap.get(id)!; const n = Number(row.pitches) || 0
              for (const k of TRI_COLS) { if (row[k] != null) { p[`_${k}_s`] += Number(row[k]) * n; p[`_${k}_w`] += n } }
            }
            for (const r of result) {
              const t = tMap.get(r.player_id); if (!t) continue
              for (const m of tritonBackfill) {
                const col = m.key; if (!TRI_COLS.includes(col)) continue
                const prec = col.startsWith('avg_') || col === 'waste_pct' ? 100 : 10
                r[m.alias] = t[`_${col}_w`] > 0 ? Math.round((t[`_${col}_s`] / t[`_${col}_w`]) * prec) / prec : null
              }
            }
          }
        }

        // Backfill FIP/xERA secondary/tertiary
        const eraBackfill = allMetrics.filter(m => m.alias !== 'primary_value' && (m.key === 'fip' || m.key === 'xera'))
        if (eraBackfill.length > 0 && result.length > 0) {
          const ids = result.map((r: any) => r.player_id)
          const constants = SEASON_CONSTANTS[year] || SEASON_CONSTANTS[2025]
          const sql2 = `SELECT p.pitcher as player_id, COUNT(*) FILTER (WHERE events LIKE '%strikeout%') as k, COUNT(*) FILTER (WHERE events = 'walk') as bb, COUNT(*) FILTER (WHERE events = 'hit_by_pitch') as hbp, COUNT(*) FILTER (WHERE events = 'home_run') as hr, (COUNT(DISTINCT CASE WHEN events IS NOT NULL AND events NOT IN ('single','double','triple','home_run','walk','hit_by_pitch','catcher_interf','field_error') THEN game_pk::bigint * 10000 + at_bat_number END) + COUNT(DISTINCT CASE WHEN events LIKE '%double_play%' THEN game_pk::bigint * 10000 + at_bat_number END) + 2 * COUNT(DISTINCT CASE WHEN events = 'triple_play' THEN game_pk::bigint * 10000 + at_bat_number END))::numeric / 3.0 as ip, COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa, AVG(estimated_woba_using_speedangle) as xwoba FROM pitches p WHERE p.pitcher IN (${ids.join(',')}) AND pitch_type NOT IN ('PO','IN') AND game_year = ${year} GROUP BY p.pitcher`.trim()
          const { data: d2 } = await supabase.rpc('run_query', { query_text: sql2 })
          if (d2) {
            const lookup = new Map((d2 as any[]).map((r: any) => [r.player_id, r]))
            for (const r of result) {
              const s = lookup.get(r.player_id); if (!s) continue
              const ip = Number(s.ip) || 0, pa = Number(s.pa) || 0
              const fipVal = ip > 0 ? Math.round(((13 * (Number(s.hr) || 0) + 3 * ((Number(s.bb) || 0) + (Number(s.hbp) || 0)) - 2 * (Number(s.k) || 0)) / ip + constants.cfip) * 100) / 100 : null
              const xwoba = s.xwoba != null ? Number(s.xwoba) : null
              const xeraVal = ip > 0 && pa > 0 && xwoba != null ? Math.round((((xwoba - constants.woba) / constants.woba_scale) * (pa / ip) * 9 + constants.lg_era) * 100) / 100 : null
              for (const m of eraBackfill) { if (m.key === 'fip') r[m.alias] = fipVal; if (m.key === 'xera') r[m.alias] = xeraVal }
            }
          }
        }

        return NextResponse.json({ leaderboard: result })
      }

      // ── FIP / xERA leaderboard (computed from pitches + year constants) ──
      const isFIPxERA = metric === 'fip' || metric === 'xera'
      if (isFIPxERA) {
        const year = parseInt(gameYear || '2025')
        const constants = SEASON_CONSTANTS[year] || SEASON_CONSTANTS[2025]
        const minPitches = parseInt(sp.get('minSample') || '300')

        const where: string[] = ["pitch_type NOT IN ('PO', 'IN')"]
        if (gameYear) where.push(`game_year = ${year}`)
        if (dateFrom) where.push(`game_date >= '${dateFrom.replace(/'/g, "''")}'`)
        if (dateTo) where.push(`game_date <= '${dateTo.replace(/'/g, "''")}'`)
        if (pitchType) where.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)

        const sql = `
          SELECT
            p.pitcher as player_id, pl.name as player_name, COUNT(*) as pitches,
            COUNT(*) FILTER (WHERE events LIKE '%strikeout%') as k,
            COUNT(*) FILTER (WHERE events = 'walk') as bb,
            COUNT(*) FILTER (WHERE events = 'hit_by_pitch') as hbp,
            COUNT(*) FILTER (WHERE events = 'home_run') as hr,
            (COUNT(DISTINCT CASE WHEN events IS NOT NULL AND events NOT IN ('single','double','triple','home_run','walk','hit_by_pitch','catcher_interf','field_error') THEN game_pk::bigint * 10000 + at_bat_number END) + COUNT(DISTINCT CASE WHEN events LIKE '%double_play%' THEN game_pk::bigint * 10000 + at_bat_number END) + 2 * COUNT(DISTINCT CASE WHEN events = 'triple_play' THEN game_pk::bigint * 10000 + at_bat_number END))::numeric / 3.0 as ip,
            COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
            AVG(estimated_woba_using_speedangle) as xwoba
          FROM pitches p JOIN players pl ON pl.id = p.pitcher
          WHERE ${where.join(' AND ')}
          GROUP BY p.pitcher, pl.name HAVING COUNT(*) >= ${minPitches}
        `.trim()

        const { data, error } = await supabase.rpc('run_query', { query_text: sql })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        let rows = ((data || []) as any[]).map(r => {
          const ip = Number(r.ip) || 0, pa = Number(r.pa) || 0
          const k = Number(r.k) || 0, bb = Number(r.bb) || 0, hbp = Number(r.hbp) || 0, hr = Number(r.hr) || 0
          const xwoba = r.xwoba != null ? Number(r.xwoba) : null
          const fip = ip > 0 ? Math.round(((13 * hr + 3 * (bb + hbp) - 2 * k) / ip + constants.cfip) * 100) / 100 : null
          const xera = ip > 0 && pa > 0 && xwoba != null ? Math.round((((xwoba - constants.woba) / constants.woba_scale) * (pa / ip) * 9 + constants.lg_era) * 100) / 100 : null
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

        // Backfill pitches-based secondary/tertiary
        const pitchesMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !ERA_METRIC_KEYS.has(m.key) && !TRITON_PLUS_METRIC_KEYS.has(m.key) && !DECEPTION_METRIC_KEYS.has(m.key))
        if (pitchesMetrics.length > 0 && result.length > 0) {
          const ids = result.map(r => r.player_id)
          const where2 = [`p.pitcher IN (${ids.join(',')})`, "pitch_type NOT IN ('PO', 'IN')"]
          if (gameYear) where2.push(`game_year = ${year}`)
          if (pitchType) where2.push(`pitch_type = '${pitchType.replace(/'/g, "''")}'`)
          const selects2 = pitchesMetrics.map(m => `${METRICS[m.key]} as ${m.alias}`)
          const sql2 = `SELECT p.pitcher as player_id, ${selects2.join(', ')} FROM pitches p WHERE ${where2.join(' AND ')} GROUP BY p.pitcher`.trim()
          const { data: d2 } = await supabase.rpc('run_query', { query_text: sql2 })
          if (d2) { const lk = new Map((d2 as any[]).map((r: any) => [r.player_id, r])); for (const r of result) { const e = lk.get(r.player_id); if (e) { for (const m of pitchesMetrics) r[m.alias] = e[m.alias] ?? null } } }
        }

        // Backfill Triton secondary/tertiary
        const tritonBackfill = allMetrics.filter(m => m.alias !== 'primary_value' && TRITON_PLUS_METRIC_KEYS.has(m.key))
        if (tritonBackfill.length > 0 && result.length > 0) {
          const ids = result.map(r => r.player_id)
          const TRI_COLS = ['cmd_plus','rpcom_plus','brink_plus','cluster_plus','hdev_plus','vdev_plus','missfire_plus','avg_brink','avg_cluster','avg_hdev','avg_vdev','avg_missfire','waste_pct']
          const sql2 = `SELECT pitcher, pitches, ${TRI_COLS.join(', ')} FROM pitcher_season_command WHERE game_year = ${year} AND pitcher IN (${ids.join(',')})`.trim()
          const { data: d2 } = await supabase.rpc('run_query', { query_text: sql2 })
          if (d2) {
            const tMap = new Map<number, Record<string, any>>()
            for (const row of d2 as any[]) { const id = row.pitcher; if (!tMap.has(id)) { const i: Record<string, any> = {}; for (const k of TRI_COLS) { i[`_${k}_s`] = 0; i[`_${k}_w`] = 0 }; tMap.set(id, i) }; const p = tMap.get(id)!; const n = Number(row.pitches) || 0; for (const k of TRI_COLS) { if (row[k] != null) { p[`_${k}_s`] += Number(row[k]) * n; p[`_${k}_w`] += n } } }
            for (const r of result) { const t = tMap.get(r.player_id); if (!t) continue; for (const m of tritonBackfill) { const col = m.key; if (!TRI_COLS.includes(col)) continue; const prec = col.startsWith('avg_') || col === 'waste_pct' ? 100 : 10; r[m.alias] = t[`_${col}_w`] > 0 ? Math.round((t[`_${col}_s`] / t[`_${col}_w`]) * prec) / prec : null } }
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

      const result: any[] = data || []
      if (result.length === 0) return NextResponse.json({ leaderboard: result })

      // Cross-source backfill for secondary/tertiary metrics from non-pitches sources
      const ids = result.map((r: any) => r.player_id)
      const year = parseInt(gameYear || '2025')

      // Backfill Triton metrics
      const tritonMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && TRITON_PLUS_METRIC_KEYS.has(m.key))
      if (tritonMetrics.length > 0 && playerType === 'pitcher') {
        const TRITON_COL: Record<string, string> = {
          cmd_plus: 'cmd_plus', rpcom_plus: 'rpcom_plus',
          brink_plus: 'brink_plus', cluster_plus: 'cluster_plus',
          hdev_plus: 'hdev_plus', vdev_plus: 'vdev_plus', missfire_plus: 'missfire_plus',
          avg_brink: 'avg_brink', avg_cluster: 'avg_cluster',
          avg_hdev: 'avg_hdev', avg_vdev: 'avg_vdev',
          avg_missfire: 'avg_missfire', waste_pct: 'waste_pct',
        }
        const ACCUM_KEYS = Object.keys(TRITON_COL)
        const sql2 = `SELECT pitcher, pitches, ${ACCUM_KEYS.join(', ')} FROM pitcher_season_command WHERE game_year = ${year} AND pitcher IN (${ids.join(',')})`.trim()
        const { data: d2 } = await supabase.rpc('run_query', { query_text: sql2 })
        if (d2) {
          // Pivot per pitcher
          const tMap = new Map<number, Record<string, any>>()
          for (const row of d2 as any[]) {
            const id = row.pitcher
            if (!tMap.has(id)) {
              const init: Record<string, any> = {}
              for (const k of ACCUM_KEYS) { init[`_${k}_s`] = 0; init[`_${k}_w`] = 0 }
              tMap.set(id, init)
            }
            const p = tMap.get(id)!
            const n = Number(row.pitches) || 0
            for (const k of ACCUM_KEYS) {
              if (row[k] != null) { p[`_${k}_s`] += Number(row[k]) * n; p[`_${k}_w`] += n }
            }
          }
          for (const r of result) {
            const t = tMap.get(r.player_id)
            if (!t) continue
            for (const m of tritonMetrics) {
              const col = TRITON_COL[m.key]
              if (!col) continue
              const precision = col.startsWith('avg_') || col === 'waste_pct' ? 100 : 10
              r[m.alias] = t[`_${col}_w`] > 0 ? Math.round((t[`_${col}_s`] / t[`_${col}_w`]) * precision) / precision : null
            }
          }
        }
      }

      // Backfill ERA metrics
      const eraMetrics = allMetrics.filter(m => m.alias !== 'primary_value' && ERA_METRIC_KEYS.has(m.key))
      if (eraMetrics.length > 0 && playerType === 'pitcher') {
        const constants = SEASON_CONSTANTS[year] || SEASON_CONSTANTS[2025]
        const sql2 = `
          SELECT p.pitcher as player_id,
            COUNT(*) FILTER (WHERE events LIKE '%strikeout%') as k,
            COUNT(*) FILTER (WHERE events = 'walk') as bb,
            COUNT(*) FILTER (WHERE events = 'hit_by_pitch') as hbp,
            COUNT(*) FILTER (WHERE events = 'home_run') as hr,
            (COUNT(DISTINCT CASE WHEN events IS NOT NULL AND events NOT IN ('single','double','triple','home_run','walk','hit_by_pitch','catcher_interf','field_error') THEN game_pk::bigint * 10000 + at_bat_number END) + COUNT(DISTINCT CASE WHEN events LIKE '%double_play%' THEN game_pk::bigint * 10000 + at_bat_number END) + 2 * COUNT(DISTINCT CASE WHEN events = 'triple_play' THEN game_pk::bigint * 10000 + at_bat_number END))::numeric / 3.0 as ip,
            COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
            AVG(estimated_woba_using_speedangle) as xwoba
          FROM pitches p WHERE p.pitcher IN (${ids.join(',')}) AND pitch_type NOT IN ('PO','IN') ${gameYear ? `AND game_year = ${year}` : ''} ${pitchType ? `AND pitch_type = '${pitchType.replace(/'/g, "''")}'` : ''}
          GROUP BY p.pitcher
        `.trim()
        const { data: d2 } = await supabase.rpc('run_query', { query_text: sql2 })
        if (d2) {
          const lookup = new Map((d2 as any[]).map((r: any) => [r.player_id, r]))
          for (const r of result) {
            const s = lookup.get(r.player_id)
            if (!s) continue
            const ip = Number(s.ip) || 0, pa = Number(s.pa) || 0
            const fipVal = ip > 0 ? Math.round(((13 * (Number(s.hr) || 0) + 3 * ((Number(s.bb) || 0) + (Number(s.hbp) || 0)) - 2 * (Number(s.k) || 0)) / ip + constants.cfip) * 100) / 100 : null
            const xwoba = s.xwoba != null ? Number(s.xwoba) : null
            const xeraVal = ip > 0 && pa > 0 && xwoba != null ? Math.round((((xwoba - constants.woba) / constants.woba_scale) * (pa / ip) * 9 + constants.lg_era) * 100) / 100 : null
            const ERA_VALS: Record<string, any> = { era: fipVal, fip: fipVal, xera: xeraVal }
            for (const m of eraMetrics) r[m.alias] = ERA_VALS[m.key] ?? null
          }
        }
      }

      return NextResponse.json({ leaderboard: result })
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
