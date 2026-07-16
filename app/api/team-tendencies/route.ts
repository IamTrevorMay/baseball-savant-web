import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

// Team-level IR/IRS. The MLB team-stats endpoint omits inherited runners, so
// aggregate the league-wide per-player season splits by team (a traded
// pitcher's full-season IR counts toward his listed/current team). Season
// splits are regular-season only, so callers skip this for spring/postseason
// or date-filtered requests.
async function fetchTeamInheritedRunners(
  season: number
): Promise<Record<string, { ir: number; irs: number; irs_pct: number | null }>> {
  try {
    const [statsResp, teamsResp] = await Promise.all([
      fetch(
        `https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season=${season}&sportIds=1&playerPool=all&limit=5000`,
        { signal: AbortSignal.timeout(15000) }
      ),
      // No season param: the pitches table / team MVs use *current* abbreviations
      // for historical seasons too (e.g. 2015 A's are ATH, not OAK)
      fetch(`https://statsapi.mlb.com/api/v1/teams?sportId=1`, {
        signal: AbortSignal.timeout(15000),
      }),
    ])
    if (!statsResp.ok || !teamsResp.ok) return {}
    const statsData = await statsResp.json()
    const teamsData = await teamsResp.json()

    const abbrevById = new Map<number, string>()
    for (const t of teamsData.teams || []) abbrevById.set(t.id, t.abbreviation)

    const totals: Record<string, { ir: number; irs: number }> = {}
    for (const split of statsData.stats?.[0]?.splits || []) {
      const abbrev = abbrevById.get(split.team?.id)
      const ir = split.stat?.inheritedRunners
      if (!abbrev || typeof ir !== 'number') continue
      const t = (totals[abbrev] ??= { ir: 0, irs: 0 })
      t.ir += ir
      t.irs += split.stat?.inheritedRunnersScored ?? 0
    }
    return Object.fromEntries(
      Object.entries(totals).map(([team, { ir, irs }]) => [
        team,
        { ir, irs, irs_pct: ir > 0 ? Math.round((1000 * irs) / ir) / 10 : null },
      ])
    )
  } catch {
    return {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const { season = 2025, tab = 'pitching', gameType = 'all', startDate, endDate } = await req.json()
    const safeSeason = parseInt(season)
    if (isNaN(safeSeason)) return NextResponse.json({ error: 'Invalid season' }, { status: 400 })

    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    const safeStart = typeof startDate === 'string' && dateRe.test(startDate) ? startDate : null
    const safeEnd = typeof endDate === 'string' && dateRe.test(endDate) ? endDate : null
    const dateFilter = (safeStart ? ` AND game_date >= '${safeStart}'` : '') + (safeEnd ? ` AND game_date <= '${safeEnd}'` : '')

    const gtMap: Record<string, string> = {
      regular: "AND game_type = 'R'",
      spring: "AND game_type = 'S'",
      postseason: "AND game_type IN ('D','L','W','F','P')",
    }
    const gtFilter = gtMap[gameType] || ''

    const yearFilter = `game_year = ${safeSeason} AND pitch_type NOT IN ('PO', 'IN') ${gtFilter}${dateFilter}`

    // Use materialized views for regular-season full-season queries (no date filters)
    const canUseMV = (gameType === 'regular' || gameType === 'all') && !safeStart && !safeEnd

    if (canUseMV && tab === 'pitching') {
      const { data, error } = await q(`
        SELECT team, pitches, games, pa, avg_velo, whiff_pct, k_pct, bb_pct, avg_xwoba, csw_pct, zone_pct, chase_pct
        FROM mv_team_pitching_stats WHERE game_year = ${safeSeason} ORDER BY avg_xwoba ASC
      `)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rows: data || [] })
    }

    if (canUseMV && tab === 'hitting') {
      const { data, error } = await q(`
        SELECT team, pitches, games, pa, runs, avg_ev, ba, slg, k_pct, bb_pct, avg_xwoba, hard_hit_pct, barrel_pct
        FROM mv_team_batting_stats WHERE game_year = ${safeSeason} ORDER BY avg_xwoba DESC
      `)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rows: data || [] })
    }

    if (canUseMV && tab === 'bullpen') {
      const [{ data, error }, irMap] = await Promise.all([
        q(`
          SELECT team, games, unique_pitchers, pitchers_per_game, pitches, avg_velo, whiff_pct, k_pct, avg_xwoba
          FROM mv_team_bullpen_stats WHERE game_year = ${safeSeason} ORDER BY whiff_pct DESC
        `),
        fetchTeamInheritedRunners(safeSeason),
      ])
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const rows = (data || []).map((r: any) => ({
        ...r,
        ...(irMap[r.team] ?? { ir: null, irs: null, irs_pct: null }),
      }))
      return NextResponse.json({ rows })
    }

    if (canUseMV && tab === 'platoon') {
      const { data, error } = await q(`
        SELECT team, p_throws, pitches, pa, k_pct, bb_pct, whiff_pct, avg_xwoba, ba, slg
        FROM mv_team_platoon_stats WHERE game_year = ${safeSeason} ORDER BY team, p_throws
      `)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rows: data || [] })
    }

    if (tab === 'momentum' || tab === 'leverage') {
      // Momentum: Shutdowns & Responses (for + against). Spring is excluded even on "All".
      const momentumGt =
        gameType === 'regular' ? "game_type = 'R'"
        : gameType === 'spring' ? "game_type = 'S'"
        : gameType === 'postseason' ? "game_type IN ('D','L','W','F','P')"
        : "game_type IN ('R','D','L','W','F','P')"
      const momentumQuery = q(`
        WITH half_innings AS (
          SELECT game_pk, inning, inning_topbot,
            CASE WHEN inning_topbot = 'Top' THEN MIN(away_team) ELSE MIN(home_team) END AS off_team,
            CASE WHEN inning_topbot = 'Top' THEN MIN(home_team) ELSE MIN(away_team) END AS def_team,
            MAX(post_bat_score) - MIN(bat_score) AS runs,
            -- leverage event: batting team went from (behind or tied) -> (tied or ahead) AND scored >=1.
            CASE
              WHEN MIN(bat_score) <= MIN(fld_score)
                AND MAX(post_bat_score) >= MIN(fld_score)
                AND MAX(post_bat_score) - MIN(bat_score) >= 1
              THEN 1 ELSE 0 END AS lev
          FROM pitches
          WHERE game_year = ${safeSeason} AND ${momentumGt}${dateFilter}
            AND events IS NOT NULL
          GROUP BY game_pk, inning, inning_topbot
        ),
        sequenced AS (
          SELECT *,
            LAG(runs) OVER w AS prev_runs,
            LAG(lev) OVER w AS prev_lev
          FROM half_innings
          WINDOW w AS (PARTITION BY game_pk ORDER BY inning, CASE WHEN inning_topbot = 'Top' THEN 0 ELSE 1 END)
        ),
        opps AS (
          -- Prev-batting team (now fielding): SD-For + R-Against opps.
          SELECT def_team AS team,
            1 AS sd_for_opp, CASE WHEN runs = 0 THEN 1 ELSE 0 END AS sd_for_succ,
            1 AS r_against_opp, CASE WHEN runs >= 1 THEN 1 ELSE 0 END AS r_against_succ,
            0 AS sd_against_opp, 0 AS sd_against_succ, 0 AS r_for_opp, 0 AS r_for_succ,
            prev_lev AS lev_sd_for_opp,
            CASE WHEN runs = 0 THEN prev_lev ELSE 0 END AS lev_sd_for_succ,
            prev_lev AS lev_r_against_opp,
            CASE WHEN runs >= 1 THEN prev_lev ELSE 0 END AS lev_r_against_succ,
            0 AS lev_sd_against_opp, 0 AS lev_sd_against_succ, 0 AS lev_r_for_opp, 0 AS lev_r_for_succ
          FROM sequenced WHERE prev_runs >= 1
          UNION ALL
          -- Prev-fielding team (now batting): SD-Against + R-For opps.
          SELECT off_team AS team,
            0, 0, 0, 0,
            1 AS sd_against_opp, CASE WHEN runs = 0 THEN 1 ELSE 0 END AS sd_against_succ,
            1 AS r_for_opp, CASE WHEN runs >= 1 THEN 1 ELSE 0 END AS r_for_succ,
            0, 0, 0, 0,
            prev_lev AS lev_sd_against_opp,
            CASE WHEN runs = 0 THEN prev_lev ELSE 0 END AS lev_sd_against_succ,
            prev_lev AS lev_r_for_opp,
            CASE WHEN runs >= 1 THEN prev_lev ELSE 0 END AS lev_r_for_succ
          FROM sequenced WHERE prev_runs >= 1
        ),
        team_totals AS (
          SELECT team,
            SUM(sd_for_succ)::int AS sd_for_succ, SUM(sd_for_opp)::int AS sd_for_opp,
            1.0 * SUM(sd_for_succ) / NULLIF(SUM(sd_for_opp), 0) AS sd_for_rate,
            SUM(sd_against_succ)::int AS sd_against_succ, SUM(sd_against_opp)::int AS sd_against_opp,
            1.0 * SUM(sd_against_succ) / NULLIF(SUM(sd_against_opp), 0) AS sd_against_rate,
            SUM(r_for_succ)::int AS r_for_succ, SUM(r_for_opp)::int AS r_for_opp,
            1.0 * SUM(r_for_succ) / NULLIF(SUM(r_for_opp), 0) AS r_for_rate,
            SUM(r_against_succ)::int AS r_against_succ, SUM(r_against_opp)::int AS r_against_opp,
            1.0 * SUM(r_against_succ) / NULLIF(SUM(r_against_opp), 0) AS r_against_rate,
            SUM(lev_sd_for_succ)::int AS lev_sd_for_succ, SUM(lev_sd_for_opp)::int AS lev_sd_for_opp,
            1.0 * SUM(lev_sd_for_succ) / NULLIF(SUM(lev_sd_for_opp), 0) AS lev_sd_for_rate,
            SUM(lev_sd_against_succ)::int AS lev_sd_against_succ, SUM(lev_sd_against_opp)::int AS lev_sd_against_opp,
            1.0 * SUM(lev_sd_against_succ) / NULLIF(SUM(lev_sd_against_opp), 0) AS lev_sd_against_rate,
            SUM(lev_r_for_succ)::int AS lev_r_for_succ, SUM(lev_r_for_opp)::int AS lev_r_for_opp,
            1.0 * SUM(lev_r_for_succ) / NULLIF(SUM(lev_r_for_opp), 0) AS lev_r_for_rate,
            SUM(lev_r_against_succ)::int AS lev_r_against_succ, SUM(lev_r_against_opp)::int AS lev_r_against_opp,
            1.0 * SUM(lev_r_against_succ) / NULLIF(SUM(lev_r_against_opp), 0) AS lev_r_against_rate
          FROM opps
          GROUP BY team
        ),
        lg AS (
          SELECT
            AVG(sd_for_rate) AS lg_sd_for, NULLIF(STDDEV_SAMP(sd_for_rate), 0) AS sd_for_sd,
            AVG(r_for_rate) AS lg_r_for, NULLIF(STDDEV_SAMP(r_for_rate), 0) AS r_for_sd,
            AVG(lev_sd_for_rate) AS lg_lev_sd_for, NULLIF(STDDEV_SAMP(lev_sd_for_rate), 0) AS lev_sd_for_sd,
            AVG(lev_r_for_rate) AS lg_lev_r_for, NULLIF(STDDEV_SAMP(lev_r_for_rate), 0) AS lev_r_for_sd
          FROM team_totals
        )
        SELECT t.team,
          ROUND(100 + 15 * (
            ((t.sd_for_rate - lg.lg_sd_for) / lg.sd_for_sd
             + (t.r_for_rate - lg.lg_r_for) / lg.r_for_sd) / 2.0
          ))::int AS momentum_plus,
          ROUND(100 + 15 * (
            ((t.lev_sd_for_rate - lg.lg_lev_sd_for) / lg.lev_sd_for_sd
             + (t.lev_r_for_rate - lg.lg_lev_r_for) / lg.lev_r_for_sd) / 2.0
          ))::int AS leverage_plus,
          t.sd_for_succ, t.sd_for_opp,
          ROUND(100.0 * t.sd_for_rate, 1) AS sd_for_pct,
          t.sd_against_succ, t.sd_against_opp,
          ROUND(100.0 * t.sd_against_rate, 1) AS sd_against_pct,
          t.r_for_succ, t.r_for_opp,
          ROUND(100.0 * t.r_for_rate, 1) AS r_for_pct,
          t.r_against_succ, t.r_against_opp,
          ROUND(100.0 * t.r_against_rate, 1) AS r_against_pct,
          t.lev_sd_for_succ, t.lev_sd_for_opp,
          ROUND(100.0 * t.lev_sd_for_rate, 1) AS lev_sd_for_pct,
          t.lev_sd_against_succ, t.lev_sd_against_opp,
          ROUND(100.0 * t.lev_sd_against_rate, 1) AS lev_sd_against_pct,
          t.lev_r_for_succ, t.lev_r_for_opp,
          ROUND(100.0 * t.lev_r_for_rate, 1) AS lev_r_for_pct,
          t.lev_r_against_succ, t.lev_r_against_opp,
          ROUND(100.0 * t.lev_r_against_rate, 1) AS lev_r_against_pct
        FROM team_totals t CROSS JOIN lg
        ORDER BY momentum_plus DESC NULLS LAST
      `)
      // SOS+: opponent xwOBA quality faced, ex-X (each opp's stats exclude games vs team being rated).
      const sosQuery = q(`
        WITH pa_grain AS (
          SELECT
            CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END AS bat_team,
            CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END AS pitch_team,
            estimated_woba_using_speedangle AS xwoba
          FROM pitches
          WHERE game_year = ${safeSeason} AND ${momentumGt}${dateFilter}
            AND events IS NOT NULL AND estimated_woba_using_speedangle IS NOT NULL
        ),
        matchup AS (
          SELECT bat_team, pitch_team, SUM(xwoba) AS xs, COUNT(*) AS pa
          FROM pa_grain GROUP BY bat_team, pitch_team
        ),
        team_bat_tot AS (SELECT bat_team AS team, SUM(xs) AS xs, SUM(pa) AS pa FROM matchup GROUP BY bat_team),
        team_pitch_tot AS (SELECT pitch_team AS team, SUM(xs) AS xs, SUM(pa) AS pa FROM matchup GROUP BY pitch_team),
        sos_pitch AS (
          SELECT m.bat_team AS team,
            (SUM((tp.xs - m.xs) / NULLIF(tp.pa - m.pa, 0) * m.pa) / NULLIF(SUM(m.pa), 0))::numeric AS opp_pitch_xwoba
          FROM matchup m JOIN team_pitch_tot tp ON tp.team = m.pitch_team
          GROUP BY m.bat_team
        ),
        sos_bat AS (
          SELECT m.pitch_team AS team,
            (SUM((tb.xs - m.xs) / NULLIF(tb.pa - m.pa, 0) * m.pa) / NULLIF(SUM(m.pa), 0))::numeric AS opp_bat_xwoba
          FROM matchup m JOIN team_bat_tot tb ON tb.team = m.bat_team
          GROUP BY m.pitch_team
        ),
        sos AS (SELECT p.team, p.opp_pitch_xwoba, b.opp_bat_xwoba FROM sos_pitch p JOIN sos_bat b USING (team)),
        sos_lg AS (
          SELECT AVG(opp_pitch_xwoba) AS lg_p, NULLIF(STDDEV_SAMP(opp_pitch_xwoba), 0) AS sd_p,
            AVG(opp_bat_xwoba) AS lg_b, NULLIF(STDDEV_SAMP(opp_bat_xwoba), 0) AS sd_b FROM sos
        )
        SELECT s.team,
          ROUND(100 + 15 * (
            (- (s.opp_pitch_xwoba - sos_lg.lg_p) / sos_lg.sd_p
             + (s.opp_bat_xwoba - sos_lg.lg_b) / sos_lg.sd_b) / 2.0
          ))::int AS sos_plus
        FROM sos s CROSS JOIN sos_lg
      `)
      const [momRes, sosRes] = await Promise.all([momentumQuery, sosQuery])
      if (momRes.error) return NextResponse.json({ error: momRes.error.message }, { status: 500 })
      if (sosRes.error) return NextResponse.json({ error: sosRes.error.message }, { status: 500 })
      const sosByTeam = new Map<string, number>(
        ((sosRes.data as any[]) || []).map((r) => [r.team, r.sos_plus])
      )
      const rows = ((momRes.data as any[]) || []).map((r) => ({
        ...r,
        sos_plus: sosByTeam.get(r.team) ?? null,
      }))
      return NextResponse.json({ rows }, {
        headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' },
      })
    }

    if (tab === 'bullpen') {
      const { data, error } = await q(`
        SELECT CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END as team,
          COUNT(DISTINCT game_pk) as games,
          COUNT(DISTINCT pitcher) as unique_pitchers,
          ROUND(COUNT(DISTINCT pitcher)::numeric / NULLIF(COUNT(DISTINCT game_pk), 0), 1) as pitchers_per_game,
          COUNT(*) as pitches,
          ROUND(AVG(release_speed)::numeric, 1) as avg_velo,
          ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt' OR description = 'swinging_pitchout')
            / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description LIKE 'hit_into_play%' OR description = 'missed_bunt' OR description = 'swinging_pitchout'), 0), 1) as whiff_pct,
          ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%')
            / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as k_pct,
          ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as avg_xwoba
        FROM pitches
        WHERE ${yearFilter} AND inning >= 6
        GROUP BY 1 ORDER BY whiff_pct DESC
      `)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rows: data || [] })
    }

    if (tab === 'platoon') {
      const teamExpr = tab === 'platoon'
        ? "CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END"
        : "CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END"

      const { data, error } = await q(`
        SELECT ${teamExpr} as team, p_throws,
          COUNT(*) as pitches,
          COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
          ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%')
            / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as k_pct,
          ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk')
            / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as bb_pct,
          ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt' OR description = 'swinging_pitchout')
            / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description LIKE 'hit_into_play%' OR description = 'missed_bunt' OR description = 'swinging_pitchout'), 0), 1) as whiff_pct,
          ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as avg_xwoba,
          ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::numeric
            / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as ba,
          ROUND((COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric
            / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as slg
        FROM pitches
        WHERE ${yearFilter}
        GROUP BY 1, p_throws ORDER BY team, p_throws
      `)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rows: data || [] })
    }

    // Pitching or Hitting tab — use team expression
    const isPitching = tab === 'pitching'
    const teamExpr = isPitching
      ? "CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END"
      : "CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END"

    const metricsSQL = isPitching
      ? `COUNT(*) as pitches,
         COUNT(DISTINCT game_pk) as games,
         COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
         ROUND(AVG(release_speed)::numeric, 1) as avg_velo,
         ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt' OR description = 'swinging_pitchout')
           / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description LIKE 'hit_into_play%' OR description = 'missed_bunt' OR description = 'swinging_pitchout'), 0), 1) as whiff_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%')
           / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as k_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk')
           / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as bb_pct,
         ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as avg_xwoba,
         ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'called_strike')
           / NULLIF(COUNT(*), 0), 1) as csw_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9)
           / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0), 1) as zone_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE zone > 9 AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description LIKE 'hit_into_play%' OR description = 'missed_bunt' OR description = 'swinging_pitchout'))
           / NULLIF(COUNT(*) FILTER (WHERE zone > 9), 0), 1) as chase_pct`
      : `COUNT(*) as pitches,
         COUNT(DISTINCT game_pk) as games,
         COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
         SUM(COALESCE(post_bat_score, 0) - COALESCE(bat_score, 0)) FILTER (WHERE events IS NOT NULL) as runs,
         ROUND(AVG(launch_speed)::numeric, 1) as avg_ev,
         ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::numeric
           / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as ba,
         ROUND((COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric
           / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as slg,
         ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%')
           / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as k_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk')
           / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as bb_pct,
         ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as avg_xwoba,
         ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95 AND bb_type IS NOT NULL)
           / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1) as hard_hit_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed_angle::text = '6')
           / NULLIF(COUNT(*) FILTER (WHERE launch_speed_angle IS NOT NULL), 0), 1) as barrel_pct`

    const sortCol = isPitching ? 'avg_xwoba' : 'avg_xwoba'
    const sortDir = isPitching ? 'ASC' : 'DESC'

    const { data, error } = await q(`
      SELECT ${teamExpr} as team, ${metricsSQL}
      FROM pitches WHERE ${yearFilter}
      GROUP BY 1 ORDER BY ${sortCol} ${sortDir}
    `)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
