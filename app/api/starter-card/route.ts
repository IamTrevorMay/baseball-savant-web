import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { computeOutingCommand, PitchRow } from '@/lib/outingCommand'
import { plusToGrade, isFastball, computeStuffRV, computePlus, getLeagueBaseline } from '@/lib/leagueStats'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const pitcherId = sp.get('pitcherId')

    if (!pitcherId) return NextResponse.json({ error: 'pitcherId required' }, { status: 400 })

    // ── Game list mode ────────────────────────────────────────────────────
    if (sp.get('games') === 'true') {
      const season = sp.get('season') || '2026'
      const sql = `
        SELECT
          game_pk,
          game_date::text AS game_date,
          MODE() WITHIN GROUP (ORDER BY CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END) AS opponent,
          COUNT(*) AS pitches,
          ROUND(SUM(CASE WHEN COALESCE(events, '') != '' THEN 1 ELSE 0 END)::numeric / 3, 1) AS ip_est
        FROM pitches
        WHERE pitcher = ${pitcherId}
          AND game_year = ${season}
        GROUP BY game_pk, game_date
        ORDER BY game_date DESC
      `
      const { data, error } = await q(sql)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const games = (data || []).map((r: any) => ({
        game_pk: r.game_pk,
        game_date: r.game_date,
        opponent: r.opponent || '??',
        pitches: Number(r.pitches),
        ip: String(r.ip_est ?? '?'),
      }))
      return NextResponse.json({ games })
    }

    // ── Full starter card data ────────────────────────────────────────────
    const gamePk = sp.get('gamePk')
    if (!gamePk) return NextResponse.json({ error: 'gamePk required' }, { status: 400 })

    // Determine season from gamePk pitches
    const yearRes = await q(`SELECT game_year FROM pitches WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk} LIMIT 1`)
    const season = yearRes.data?.[0]?.game_year || 2025

    // Run all queries in parallel
    const [boxscoreRes, allPitchesRes, metaRes, playerRes, seasonUsageRes, seasonMovementRes, deceptionRes] = await Promise.all([
      // 1. MLB boxscore
      fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`).then(r => r.json()).catch(() => null),

      // 2. All pitches for the outing (full row set)
      q(`
        SELECT plate_x, plate_z, pitch_name, sz_top, sz_bot, zone, game_year, stand,
               description, pfx_x, pfx_z, release_speed, release_extension,
               estimated_slg_using_speedangle, stuff_plus, type,
               release_pos_x, release_pos_z, vx0, vy0, vz0, ax, ay, az,
               release_spin_rate, spin_axis, arm_angle, p_throws
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk}
          AND pitch_name IS NOT NULL
      `),

      // 3. Game metadata
      q(`
        SELECT
          game_date::text AS game_date,
          MODE() WITHIN GROUP (ORDER BY CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END) AS opponent
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_pk = ${gamePk}
        GROUP BY game_date
        LIMIT 1
      `),

      // 4. Player metadata
      q(`
        SELECT p.name AS player_name, p.team,
               lp.birth_year
        FROM players p
        LEFT JOIN lahman_people lp ON lp.key_mlbam = p.id
        WHERE p.id = ${pitcherId}
        LIMIT 1
      `),

      // 5. Season usage
      q(`
        SELECT pitch_name, COUNT(*) AS count
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_year = ${season}
          AND pitch_name IS NOT NULL
        GROUP BY pitch_name
      `),

      // 6. Season movement
      q(`
        SELECT pitch_name,
               AVG(pfx_x * 12) AS avg_hb,
               AVG(pfx_z * 12) AS avg_ivb,
               STDDEV(pfx_x * 12) AS std_hb,
               STDDEV(pfx_z * 12) AS std_ivb
        FROM pitches
        WHERE pitcher = ${pitcherId} AND game_year = ${season}
          AND pitch_name IS NOT NULL
          AND pfx_x IS NOT NULL AND pfx_z IS NOT NULL
        GROUP BY pitch_name
      `),

      // 7. Season-level deception scores
      q(`
        SELECT pitch_name, unique_score, deception_score
        FROM pitcher_season_deception
        WHERE pitcher = ${pitcherId} AND game_year = ${season}
      `),
    ])

    // Parse all pitches
    const rawPitches = allPitchesRes.data || []
    const pitches = rawPitches.map((r: any) => ({
      plate_x: r.plate_x != null ? Number(r.plate_x) : null,
      plate_z: r.plate_z != null ? Number(r.plate_z) : null,
      pitch_name: r.pitch_name,
      sz_top: Number(r.sz_top),
      sz_bot: Number(r.sz_bot),
      zone: Number(r.zone),
      game_year: Number(r.game_year),
      stand: r.stand,
      description: r.description || '',
      pfx_x: r.pfx_x != null ? Number(r.pfx_x) : null,
      pfx_z: r.pfx_z != null ? Number(r.pfx_z) : null,
      release_speed: r.release_speed != null ? Number(r.release_speed) : null,
      release_extension: r.release_extension != null ? Number(r.release_extension) : null,
      estimated_slg_using_speedangle: r.estimated_slg_using_speedangle != null ? Number(r.estimated_slg_using_speedangle) : null,
      stuff_plus: r.stuff_plus != null ? Number(r.stuff_plus) : null,
      type: r.type,
      release_pos_x: r.release_pos_x != null ? Number(r.release_pos_x) : null,
      release_pos_z: r.release_pos_z != null ? Number(r.release_pos_z) : null,
      vx0: r.vx0 != null ? Number(r.vx0) : null,
      vy0: r.vy0 != null ? Number(r.vy0) : null,
      vz0: r.vz0 != null ? Number(r.vz0) : null,
      ax: r.ax != null ? Number(r.ax) : null,
      ay: r.ay != null ? Number(r.ay) : null,
      az: r.az != null ? Number(r.az) : null,
      release_spin_rate: r.release_spin_rate != null ? Number(r.release_spin_rate) : null,
      spin_axis: r.spin_axis != null ? Number(r.spin_axis) : null,
      arm_angle: r.arm_angle != null ? Number(r.arm_angle) : null,
      p_throws: r.p_throws || null,
    }))

    // Get p_throws from first pitch
    const p_throws = rawPitches[0]?.stand ? (rawPitches[0].stand === 'L' ? 'R' : 'L') : 'R'
    // Actually p_throws should come from the pitcher side. Let's get it from the query.
    const pThrowsRes = await q(`SELECT p_throws FROM pitches WHERE pitcher = ${pitcherId} AND p_throws IS NOT NULL LIMIT 1`)
    const pThrows = pThrowsRes.data?.[0]?.p_throws || 'R'

    // Player info
    const playerInfo = playerRes.data?.[0] || {}
    const pitcherName = playerInfo.player_name || 'Unknown'
    const team = playerInfo.team || '??'
    const birthYear = playerInfo.birth_year ? Number(playerInfo.birth_year) : null
    const gameDate = metaRes.data?.[0]?.game_date || ''
    const gameDateYear = gameDate ? new Date(gameDate).getFullYear() : season
    const age = birthYear ? gameDateYear - birthYear : null
    const opponent = metaRes.data?.[0]?.opponent || '??'

    // ── Boxscore extraction ──────────────────────────────────────────────
    let gameLine = { ip: '?', er: 0, h: 0, hr: 0, bb: 0, k: 0, pitches: 0, r: 0, decision: 'ND', era: '--' }
    if (boxscoreRes) {
      const pid = Number(pitcherId)
      for (const side of ['home', 'away'] as const) {
        const pitchers = boxscoreRes?.teams?.[side]?.pitchers || []
        if (pitchers.includes(pid)) {
          const pStats = boxscoreRes?.teams?.[side]?.players?.[`ID${pid}`]?.stats?.pitching
          if (pStats) {
            // Determine W/L decision
            let decision = 'ND'
            if (pStats.wins >= 1) decision = 'W'
            else if (pStats.losses >= 1) decision = 'L'

            gameLine = {
              ip: pStats.inningsPitched || '?',
              h: pStats.hits ?? 0,
              r: pStats.runs ?? 0,
              er: pStats.earnedRuns ?? 0,
              hr: pStats.homeRuns ?? 0,
              bb: pStats.baseOnBalls ?? 0,
              k: pStats.strikeOuts ?? 0,
              pitches: pStats.numberOfPitches ?? 0,
              decision,
              era: pStats.era ?? '--',
            }
          }
          break
        }
      }
    }

    // ── Computed metrics ──────────────────────────────────────────────────
    const totalPitches = pitches.length

    // Whiffs and CSW
    let whiffs = 0
    let calledStrikes = 0
    let swingingStrikes = 0
    for (const p of pitches) {
      const desc = (p.description || '').toLowerCase()
      if (desc.includes('swinging_strike')) { swingingStrikes++; whiffs++ }
      if (desc.includes('called_strike')) calledStrikes++
    }
    const cswPct = totalPitches > 0 ? ((swingingStrikes + calledStrikes) / totalPitches) * 100 : 0

    // Per pitch type metrics
    const ptGroups: Record<string, any[]> = {}
    for (const p of pitches) {
      if (!ptGroups[p.pitch_name]) ptGroups[p.pitch_name] = []
      ptGroups[p.pitch_name].push(p)
    }

    // Season usage totals
    const seasonUsageData = seasonUsageRes.data || []
    const seasonTotal = seasonUsageData.reduce((s: number, r: any) => s + Number(r.count), 0)
    const seasonPctMap: Record<string, number> = {}
    for (const r of seasonUsageData) {
      seasonPctMap[r.pitch_name] = seasonTotal > 0 ? (Number(r.count) / seasonTotal) * 100 : 0
    }

    // Average fastball velo for velo_diff
    let fbVeloSum = 0, fbVeloN = 0
    for (const p of pitches) {
      if (isFastball(p.pitch_name) && p.release_speed != null) {
        fbVeloSum += p.release_speed
        fbVeloN++
      }
    }
    const avgFbVelo = fbVeloN > 0 ? fbVeloSum / fbVeloN : null

    // Build deception lookup
    const deceptionByType: Record<string, { unique_score: number | null; deception_score: number | null }> = {}
    for (const r of (deceptionRes.data || [])) {
      deceptionByType[r.pitch_name] = {
        unique_score: r.unique_score != null ? Number(r.unique_score) : null,
        deception_score: r.deception_score != null ? Number(r.deception_score) : null,
      }
    }

    const pitchMetrics: any[] = []
    const usageData: any[] = []

    // Sort pitch types by count descending
    const sortedTypes = Object.entries(ptGroups).sort((a, b) => b[1].length - a[1].length)

    for (const [ptName, pts] of sortedTypes) {
      const count = pts.length
      const veloArr = pts.filter((p: any) => p.release_speed != null).map((p: any) => p.release_speed)
      const avgVelo = veloArr.length > 0 ? veloArr.reduce((s: number, v: number) => s + v, 0) / veloArr.length : 0

      const ivbArr = pts.filter((p: any) => p.pfx_z != null).map((p: any) => p.pfx_z * 12)
      const avgIvb = ivbArr.length > 0 ? ivbArr.reduce((s: number, v: number) => s + v, 0) / ivbArr.length : 0

      const hbArr = pts.filter((p: any) => p.pfx_x != null).map((p: any) => p.pfx_x * 12)
      const avgHb = hbArr.length > 0 ? hbArr.reduce((s: number, v: number) => s + v, 0) / hbArr.length : 0

      // Str%
      let strikes = 0
      let ptSwStr = 0
      let ptCSW = 0
      for (const p of pts) {
        const desc = (p.description || '').toLowerCase()
        const inZone = p.zone >= 1 && p.zone <= 9
        const isStrike = inZone || desc.includes('strike') || desc.includes('foul')
        if (isStrike) strikes++
        if (desc.includes('swinging_strike')) ptSwStr++
        if (desc.includes('swinging_strike') || desc.includes('called_strike')) ptCSW++
      }
      const strPct = count > 0 ? (strikes / count) * 100 : 0
      const swstrPct = count > 0 ? (ptSwStr / count) * 100 : 0
      const ptCswPct = count > 0 ? (ptCSW / count) * 100 : 0

      // xSLGcon
      const bipPitches = pts.filter((p: any) => p.type === 'X' && p.estimated_slg_using_speedangle != null)
      const xslgcon = bipPitches.length > 0
        ? bipPitches.reduce((s: number, p: any) => s + p.estimated_slg_using_speedangle, 0) / bipPitches.length
        : 0

      // Stuff+: average DB column, fallback to computeStuffRV + computePlus
      const stuffArr = pts.filter((p: any) => p.stuff_plus != null).map((p: any) => p.stuff_plus)
      let avgStuff: number
      if (stuffArr.length > 0) {
        avgStuff = stuffArr.reduce((s: number, v: number) => s + v, 0) / stuffArr.length
      } else {
        const year = pts[0]?.game_year || 2025
        const rvArr = pts.map((p: any) => computeStuffRV(p)).filter((v: any): v is number => v != null)
        const league = getLeagueBaseline('stuff', ptName, year)
        if (rvArr.length > 0 && league) {
          const avgRV = rvArr.reduce((s: number, v: number) => s + v, 0) / rvArr.length
          avgStuff = computePlus(avgRV, league.mean, league.stddev)
        } else {
          avgStuff = 100
        }
      }

      const veloDiff = avgFbVelo != null ? avgVelo - avgFbVelo : 0

      // Avg extension
      const extArr = pts.filter((p: any) => p.release_extension != null).map((p: any) => p.release_extension)
      const avgExt = extArr.length > 0 ? extArr.reduce((s: number, v: number) => s + v, 0) / extArr.length : 0

      const dec = deceptionByType[ptName] || {}

      pitchMetrics.push({
        pitch_name: ptName,
        count,
        avg_velo: +avgVelo.toFixed(1),
        velo_diff: +veloDiff.toFixed(1),
        avg_ivb: +avgIvb.toFixed(1),
        avg_hb: +avgHb.toFixed(1),
        avg_ext: +avgExt.toFixed(1),
        str_pct: +strPct.toFixed(1),
        swstr_pct: +swstrPct.toFixed(1),
        csw_pct: +ptCswPct.toFixed(1),
        xslgcon: +xslgcon.toFixed(3),
        stuff_plus: +avgStuff.toFixed(0),
        whiffs: ptSwStr,
        unique_score: dec.unique_score ?? null,
        deception_score: dec.deception_score ?? null,
        cmd_plus: null as number | null, // filled in below
        avg_missfire: null as number | null, // filled in below
        avg_cluster: null as number | null, // filled in below
        avg_brink: null as number | null, // filled in below
        triton_plus: 0, // filled in below
      })

      // Usage splits by stand
      const lhbPitches = pts.filter((p: any) => p.stand === 'L')
      const rhbPitches = pts.filter((p: any) => p.stand === 'R')
      const lhbTotal = pitches.filter((p: any) => p.stand === 'L').length
      const rhbTotal = pitches.filter((p: any) => p.stand === 'R').length

      usageData.push({
        pitch_name: ptName,
        outing_pct: totalPitches > 0 ? +((count / totalPitches) * 100).toFixed(1) : 0,
        vs_lhb_pct: lhbTotal > 0 ? +((lhbPitches.length / lhbTotal) * 100).toFixed(1) : 0,
        vs_rhb_pct: rhbTotal > 0 ? +((rhbPitches.length / rhbTotal) * 100).toFixed(1) : 0,
        season_pct: +(seasonPctMap[ptName] || 0).toFixed(1),
      })
    }

    // ── Command metrics ──────────────────────────────────────────────────
    const cmdPitchRows: PitchRow[] = pitches
      .filter((p: any) => p.plate_x != null && p.plate_z != null)
      .map((p: any) => ({
        plate_x: p.plate_x,
        plate_z: p.plate_z,
        pitch_name: p.pitch_name,
        sz_top: p.sz_top,
        sz_bot: p.sz_bot,
        zone: p.zone,
        game_year: p.game_year,
      }))
    const cmd = computeOutingCommand(cmdPitchRows)

    // ── Grades ───────────────────────────────────────────────────────────
    // Stuff grade: weighted average from per-pitch-type stuff+ (already computed with fallback)
    let stuffWeightedSum = 0, stuffWeightedN = 0
    for (const pm of pitchMetrics) {
      stuffWeightedSum += pm.stuff_plus * pm.count
      stuffWeightedN += pm.count
    }
    const avgStuffPlus = stuffWeightedN > 0 ? stuffWeightedSum / stuffWeightedN : 100
    const cmdPlus = cmd.overall_cmd_plus ?? 100

    const stuffGrade = plusToGrade(avgStuffPlus)
    const cmdGrade = plusToGrade(cmdPlus)
    const tritonPlus = 0.5 * avgStuffPlus + 0.5 * cmdPlus
    const tritonGrade = plusToGrade(tritonPlus)
    const startGrade = tritonGrade

    // Fill in command metrics and triton_plus per pitch
    for (const pm of pitchMetrics) {
      const ptCmdData = cmd.byPitch[pm.pitch_name]
      const ptCmd = ptCmdData?.cmd_plus ?? null
      pm.cmd_plus = ptCmd != null ? +ptCmd.toFixed(0) : null
      pm.avg_missfire = ptCmdData?.avg_missfire ?? null
      pm.avg_cluster = ptCmdData?.avg_cluster ?? null
      pm.avg_brink = ptCmdData?.avg_brink ?? null
      pm.triton_plus = +((0.5 * pm.stuff_plus + 0.5 * (ptCmd ?? 100))).toFixed(0)
    }

    // ── Primary fastball ─────────────────────────────────────────────────
    let primaryFb: any = null
    for (const [ptName, pts] of sortedTypes) {
      if (isFastball(ptName)) {
        const veloArr = pts.filter((p: any) => p.release_speed != null).map((p: any) => p.release_speed)
        const extArr = pts.filter((p: any) => p.release_extension != null).map((p: any) => p.release_extension)
        const ivbArr = pts.filter((p: any) => p.pfx_z != null).map((p: any) => p.pfx_z * 12)
        const hbArr = pts.filter((p: any) => p.pfx_x != null).map((p: any) => p.pfx_x * 12)

        // HAVAA: horizontal approach angle
        const havaaArr = pts
          .filter((p: any) => p.release_pos_x != null && p.plate_x != null && p.release_extension != null)
          .map((p: any) => {
            const dx = p.release_pos_x - p.plate_x
            const dy = 60.5 - p.release_extension
            return Math.atan(dx / dy) * (180 / Math.PI)
          })

        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0

        primaryFb = {
          name: ptName,
          avg_velo: +avg(veloArr).toFixed(1),
          avg_ext: +avg(extArr).toFixed(1),
          avg_ivb: +avg(ivbArr).toFixed(1),
          avg_hb: +avg(hbArr).toFixed(1),
          avg_havaa: +avg(havaaArr).toFixed(1),
        }
        break
      }
    }

    // ── Movement scatter data ────────────────────────────────────────────
    const movement = pitches
      .filter((p: any) => p.pfx_x != null && p.pfx_z != null)
      .map((p: any) => ({
        hb: +(p.pfx_x * 12).toFixed(1),
        ivb: +(p.pfx_z * 12).toFixed(1),
        pitch_name: p.pitch_name,
      }))

    // Season movement shapes
    const seasonMovement = (seasonMovementRes.data || []).map((r: any) => ({
      pitch_name: r.pitch_name,
      avg_hb: r.avg_hb != null ? +Number(r.avg_hb).toFixed(1) : 0,
      avg_ivb: r.avg_ivb != null ? +Number(r.avg_ivb).toFixed(1) : 0,
      std_hb: r.std_hb != null ? +Number(r.std_hb).toFixed(1) : 3,
      std_ivb: r.std_ivb != null ? +Number(r.std_ivb).toFixed(1) : 3,
    }))

    // ── Locations split by stand ─────────────────────────────────────────
    const locationsLhb = pitches
      .filter((p: any) => p.stand === 'L' && p.plate_x != null && p.plate_z != null)
      .map((p: any) => ({ plate_x: p.plate_x, plate_z: p.plate_z, pitch_name: p.pitch_name }))

    const locationsRhb = pitches
      .filter((p: any) => p.stand === 'R' && p.plate_x != null && p.plate_z != null)
      .map((p: any) => ({ plate_x: p.plate_x, plate_z: p.plate_z, pitch_name: p.pitch_name }))

    const data = {
      pitcher_id: Number(pitcherId),
      pitcher_name: pitcherName,
      p_throws: pThrows,
      team,
      age,
      game_date: gameDate,
      opponent,
      game_line: {
        ...gameLine,
        whiffs,
        csw_pct: +cswPct.toFixed(1),
      },
      grades: {
        start: startGrade,
        stuff: stuffGrade,
        command: cmdGrade,
        triton: tritonGrade,
      },
      primary_fastball: primaryFb,
      usage: usageData,
      movement,
      season_movement: seasonMovement,
      locations_lhb: locationsLhb,
      locations_rhb: locationsRhb,
      pitch_metrics: pitchMetrics,
      command: { ...cmd.aggregate, cmd_plus: cmd.overall_cmd_plus, avg_missfire: (() => { let s = 0, n = 0; for (const pm of pitchMetrics) { if (pm.avg_missfire != null) { s += pm.avg_missfire * pm.count; n += pm.count } } return n > 0 ? s / n : null })() },
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('starter-card error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
