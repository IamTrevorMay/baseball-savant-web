import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { METRICS, TRITON_PLUS_METRIC_KEYS, DECEPTION_METRIC_KEYS, ERA_METRIC_KEYS, COMPUTED_METRIC_KEYS } from '@/lib/reportMetrics'
import { SEASON_CONSTANTS, LATEST_SEASON_YEAR, PARK_FACTORS } from '@/lib/constants-data'
import { computeXDeceptionScore, isFastball } from '@/lib/leagueStats'
import {
  TRITON_COLUMNS, TRITON_COL,
  ERA_COMPONENTS_SQL,
  computeFIP, computeXERA, computeWRCPlus,
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

    // ── Team Stats mode (team-level aggregation with league ranks) ──────
    if (sp.get('teamStats') === 'true') {
      const team = sp.get('team')
      const statScope = sp.get('statScope') || 'pitching'
      const pitcherRole = sp.get('pitcherRole') // 'starter' | 'reliever' | null (all)
      const metricList = (sp.get('metrics') || '').split(',').filter(Boolean)
      const gameYear = sp.get('gameYear')
      const dateFrom = sp.get('dateFrom')
      const dateTo = sp.get('dateTo')

      if (!team || metricList.length === 0) {
        return NextResponse.json({ error: 'team and metrics required' }, { status: 400 })
      }

      // Team column: derived from home_team/away_team + inning_topbot
      // Pitching team = fielding team; Batting team = at-bat team
      const teamExpr = statScope === 'hitting'
        ? "CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END"
        : "CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END"

      const where: string[] = ["p.pitch_type NOT IN ('PO', 'IN')", "p.game_type = 'R'"]
      if (gameYear) where.push(`p.game_year = ${parseInt(gameYear)}`)
      if (dateFrom) where.push(`p.game_date >= '${dateFrom.replace(/'/g, "''")}'`)
      if (dateTo) where.push(`p.game_date <= '${dateTo.replace(/'/g, "''")}'`)

      // SP/RP filter: pre-fetch starter IDs then filter in JavaScript.
      // Embedding pitcher filters (IN/CTE/JOIN) into the main pitches
      // aggregation query exceeds Supabase statement timeouts, so we
      // run unfiltered per-pitcher queries and post-filter in JS.
      let starterIds: Set<number> | null = null
      if (statScope === 'pitching' && (pitcherRole === 'starter' || pitcherRole === 'reliever')) {
        const roleYear = parseInt(gameYear || String(new Date().getFullYear()))
        // Identify starters from player_season_stats (tiny table, instant).
        // Heuristic: IP >= 10 with no saves/holds → starter.
        const { data: sid, error: se } = await q(
          `SELECT player_id as pitcher FROM player_season_stats WHERE season = ${roleYear} AND stat_group = 'pitching' AND innings_pitched >= 10 AND COALESCE(saves, 0) = 0 AND COALESCE(holds, 0) = 0`
        )
        if (se) throw new Error(se.message)
        starterIds = new Set((sid || []).map((r: any) => Number(r.pitcher)))
      }
      const keepPitcher = (pid: number) =>
        !starterIds ? true : pitcherRole === 'starter' ? starterIds.has(pid) : !starterIds.has(pid)

      // Split metrics by source: pitches-table vs ERA vs computed (wRC+)
      const pitchesMetrics = metricList.filter(m => METRICS[m] && !ERA_METRIC_KEYS.has(m))
      const eraMetrics = metricList.filter(m => ERA_METRIC_KEYS.has(m))
      const computedMetrics = metricList.filter(m => COMPUTED_METRIC_KEYS.has(m))
      const validMetrics = [...pitchesMetrics, ...eraMetrics, ...computedMetrics]

      if (validMetrics.length === 0) {
        return NextResponse.json({ error: 'No valid metrics' }, { status: 400 })
      }

      // Run pitches-table query and ERA components query in parallel
      const tasks: Promise<void>[] = []
      let allTeams: Record<string, any>[] = []

      // 1. Standard pitches-table metrics
      if (pitchesMetrics.length > 0) {
        const selects = pitchesMetrics.map(m => `${METRICS[m]} as ${m}`)
        if (starterIds) {
          // Per-pitcher aggregation → JS filter + re-aggregate by team
          // Additive metrics (like IP) are summed; rate metrics use weighted average.
          const ADDITIVE = new Set(['ip'])
          const sql = `
            SELECT p.pitcher, (${teamExpr}) as team, COUNT(*) as n, ${selects.join(', ')}
            FROM pitches p
            WHERE ${where.join(' AND ')}
            GROUP BY p.pitcher, (${teamExpr})
          `
          tasks.push((async () => {
            const { data, error: err } = await q(sql)
            if (err) throw new Error(err.message)
            const teamMap = new Map<string, { n: number; sums: Record<string, number> }>()
            for (const row of (data || []) as any[]) {
              if (!keepPitcher(Number(row.pitcher))) continue
              if (!teamMap.has(row.team)) teamMap.set(row.team, { n: 0, sums: {} })
              const agg = teamMap.get(row.team)!
              const cnt = Number(row.n)
              agg.n += cnt
              for (const m of pitchesMetrics) {
                if (row[m] != null) {
                  agg.sums[m] = (agg.sums[m] || 0) + (ADDITIVE.has(m) ? Number(row[m]) : Number(row[m]) * cnt)
                }
              }
            }
            allTeams = Array.from(teamMap.entries())
              .filter(([, a]) => a.n >= 100)
              .map(([t, a]) => {
                const r: Record<string, any> = { team: t }
                for (const m of pitchesMetrics) {
                  r[m] = a.sums[m] != null ? (ADDITIVE.has(m) ? a.sums[m] : a.sums[m] / a.n) : null
                }
                return r
              })
          })())
        } else {
          // Direct team aggregation (no role filter)
          const sql = `
            SELECT (${teamExpr}) as team, ${selects.join(', ')}
            FROM pitches p
            WHERE ${where.join(' AND ')}
            GROUP BY (${teamExpr})
            HAVING COUNT(*) >= 100
          `
          tasks.push((async () => {
            const { data, error: err } = await q(sql)
            if (err) throw new Error(err.message)
            allTeams = (data || []) as Record<string, any>[]
          })())
        }
      }

      // 2. ERA/FIP/xERA: compute from components per team
      const eraByTeam = new Map<string, Record<string, any>>()
      if (eraMetrics.length > 0) {
        if (starterIds) {
          // Per-pitcher ERA components → JS filter + sum components by team
          const eraSql = `
            SELECT p.pitcher, (${teamExpr}) as team,
              ${ERA_COMPONENTS_SQL},
              COUNT(estimated_woba_using_speedangle) as xwoba_n
            FROM pitches p
            WHERE ${where.join(' AND ')}
            GROUP BY p.pitcher, (${teamExpr})
          `
          tasks.push((async () => {
            const { data, error: err } = await q(eraSql)
            if (err) throw new Error(err.message)
            const yr = parseInt(gameYear || String(new Date().getFullYear()))
            const constants = SEASON_CONSTANTS[yr] || SEASON_CONSTANTS[LATEST_SEASON_YEAR]
            // Sum ERA components per team (counts are additive; xwoba needs weighted avg)
            const tc = new Map<string, { k: number; bb: number; hbp: number; hr: number; ip: number; pa: number; xwoba_sum: number; xwoba_n: number }>()
            for (const row of (data || []) as any[]) {
              if (!keepPitcher(Number(row.pitcher))) continue
              const t = row.team
              if (!tc.has(t)) tc.set(t, { k: 0, bb: 0, hbp: 0, hr: 0, ip: 0, pa: 0, xwoba_sum: 0, xwoba_n: 0 })
              const c = tc.get(t)!
              c.k += Number(row.k) || 0
              c.bb += Number(row.bb) || 0
              c.hbp += Number(row.hbp) || 0
              c.hr += Number(row.hr) || 0
              c.ip += Number(row.ip) || 0
              c.pa += Number(row.pa) || 0
              const xn = Number(row.xwoba_n) || 0
              if (row.xwoba != null && xn > 0) { c.xwoba_sum += Number(row.xwoba) * xn; c.xwoba_n += xn }
            }
            for (const [t, c] of tc) {
              const xwoba = c.xwoba_n > 0 ? c.xwoba_sum / c.xwoba_n : null
              const comps = { k: c.k, bb: c.bb, hbp: c.hbp, hr: c.hr, ip: c.ip, pa: c.pa, xwoba }
              const fip = computeFIP(comps, constants)
              const xera = computeXERA(comps, constants)
              eraByTeam.set(t, { era: fip, fip, xera })
            }
          })())
        } else {
          const eraSql = `
            SELECT (${teamExpr}) as team, ${ERA_COMPONENTS_SQL}
            FROM pitches p
            WHERE ${where.join(' AND ')}
            GROUP BY (${teamExpr})
            HAVING COUNT(*) >= 100
          `
          tasks.push((async () => {
            const { data, error: err } = await q(eraSql)
            if (err) throw new Error(err.message)
            const yr = parseInt(gameYear || String(new Date().getFullYear()))
            const constants = SEASON_CONSTANTS[yr] || SEASON_CONSTANTS[LATEST_SEASON_YEAR]
            for (const row of (data || []) as Record<string, any>[]) {
              const fip = computeFIP(row as any, constants)
              const xera = computeXERA(row as any, constants)
              eraByTeam.set(row.team, { era: fip, fip, xera })
            }
          })())
        }
      }

      // 3. Runs: sum player_season_stats.runs grouped by team derived from pitches
      const runsByTeam = new Map<string, Record<string, any>>()
      if (computedMetrics.includes('runs')) {
        const yr = parseInt(gameYear || String(new Date().getFullYear()))
        const group = statScope === 'hitting' ? 'hitting' : 'pitching'
        const playerCol = statScope === 'hitting' ? 'batter' : 'pitcher'
        if (starterIds) {
          // Per-pitcher runs → JS filter + sum by team
          const runsSql = `
            SELECT pss.player_id, pt.team, pss.runs
            FROM player_season_stats pss
            JOIN (
              SELECT ${playerCol} as pid,
                MODE() WITHIN GROUP (ORDER BY (${teamExpr})) as team
              FROM pitches p
              WHERE ${where.join(' AND ')}
              GROUP BY ${playerCol}
            ) pt ON pt.pid = pss.player_id
            WHERE pss.season = ${yr} AND pss.stat_group = '${group}'
          `
          tasks.push((async () => {
            const { data, error: err } = await q(runsSql)
            if (err) throw new Error(err.message)
            for (const row of (data || []) as any[]) {
              if (!keepPitcher(Number(row.player_id))) continue
              const prev = runsByTeam.get(row.team)?.runs || 0
              runsByTeam.set(row.team, { runs: prev + Number(row.runs || 0) })
            }
          })())
        } else {
          const runsSql = `
            SELECT pt.team, SUM(pss.runs) as runs
            FROM player_season_stats pss
            JOIN (
              SELECT ${playerCol} as pid,
                MODE() WITHIN GROUP (ORDER BY (${teamExpr})) as team
              FROM pitches p
              WHERE ${where.join(' AND ')}
              GROUP BY ${playerCol}
            ) pt ON pt.pid = pss.player_id
            WHERE pss.season = ${yr} AND pss.stat_group = '${group}'
            GROUP BY pt.team
          `
          tasks.push((async () => {
            const { data, error: err } = await q(runsSql)
            if (err) throw new Error(err.message)
            for (const row of (data || []) as Record<string, any>[]) {
              runsByTeam.set(row.team, { runs: Number(row.runs) })
            }
          })())
        }
      }

      // 4. wRC+: compute per team from wOBA + park factors (no role filter)
      const wrcByTeam = new Map<string, Record<string, any>>()
      if (computedMetrics.includes('wrc_plus')) {
        // For team wRC+ we always use the batting team perspective
        const battingTeamExpr = "CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END"
        const wrcSql = `
          SELECT (${battingTeamExpr}) as team,
            AVG(woba_value) as woba,
            COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa
          FROM pitches p
          WHERE ${where.join(' AND ')}
          GROUP BY (${battingTeamExpr})
          HAVING COUNT(*) >= 100
        `
        tasks.push((async () => {
          const { data, error: err } = await q(wrcSql)
          if (err) throw new Error(err.message)
          const yr = parseInt(gameYear || String(new Date().getFullYear()))
          const constants = SEASON_CONSTANTS[yr] || SEASON_CONSTANTS[LATEST_SEASON_YEAR]
          for (const row of (data || []) as Record<string, any>[]) {
            const woba = row.woba != null ? Number(row.woba) : null
            if (woba == null) continue
            const pf = PARK_FACTORS[row.team]?.basic || 100
            const wrcPlus = computeWRCPlus(woba, constants, pf)
            wrcByTeam.set(row.team, { wrc_plus: wrcPlus })
          }
        })())
      }

      // When role-filtered, per-pitcher queries are heavier — run sequentially
      // to avoid Supabase resource contention that causes statement timeouts.
      if (starterIds) {
        for (const task of tasks) await task
      } else {
        await Promise.all(tasks)
      }

      // Merge ERA values into allTeams
      if (eraByTeam.size > 0) {
        if (allTeams.length === 0) {
          allTeams = Array.from(eraByTeam.entries()).map(([t, vals]) => ({ team: t, ...vals }))
        } else {
          for (const row of allTeams) {
            const eraVals = eraByTeam.get(row.team)
            if (eraVals) Object.assign(row, eraVals)
          }
          for (const [t, vals] of eraByTeam) {
            if (!allTeams.find(r => r.team === t)) {
              allTeams.push({ team: t, ...vals })
            }
          }
        }
      }

      // Merge wRC+ values into allTeams
      if (wrcByTeam.size > 0) {
        if (allTeams.length === 0) {
          allTeams = Array.from(wrcByTeam.entries()).map(([t, vals]) => ({ team: t, ...vals }))
        } else {
          for (const row of allTeams) {
            const wrcVals = wrcByTeam.get(row.team)
            if (wrcVals) Object.assign(row, wrcVals)
          }
          for (const [t, vals] of wrcByTeam) {
            if (!allTeams.find(r => r.team === t)) {
              allTeams.push({ team: t, ...vals })
            }
          }
        }
      }

      // Merge runs values into allTeams
      if (runsByTeam.size > 0) {
        if (allTeams.length === 0) {
          allTeams = Array.from(runsByTeam.entries()).map(([t, vals]) => ({ team: t, ...vals }))
        } else {
          for (const row of allTeams) {
            const runsVals = runsByTeam.get(row.team)
            if (runsVals) Object.assign(row, runsVals)
          }
          for (const [t, vals] of runsByTeam) {
            if (!allTeams.find(r => r.team === t)) {
              allTeams.push({ team: t, ...vals })
            }
          }
        }
      }
      const thisTeam = allTeams.find(r => r.team === team)

      // Compute rank for each metric
      // Determine sort direction per metric (higher is better for most rate stats)
      const LOWER_IS_BETTER = new Set(['bb_pct', 'avg_xba', 'avg_xwoba', 'avg_xslg', 'avg_woba', 'era', 'fip', 'xera'])
      const ranks: Record<string, { rank: number; total: number }> = {}

      for (const m of validMetrics) {
        const vals = allTeams
          .filter(r => r[m] != null)
          .map(r => ({ team: r.team, val: Number(r[m]) }))
          .sort((a, b) => LOWER_IS_BETTER.has(m)
            ? a.val - b.val   // lower is better → ascending
            : b.val - a.val   // higher is better → descending
          )

        const idx = vals.findIndex(v => v.team === team)
        ranks[m] = { rank: idx >= 0 ? idx + 1 : vals.length + 1, total: vals.length }
      }

      // For pitching context, invert certain metrics (lower is better for pitchers)
      if (statScope === 'pitching') {
        const PITCHER_LOWER_BETTER = new Set(['ba', 'slg', 'obp', 'ops', 'avg_ev', 'max_ev', 'avg_la', 'avg_dist', 'hard_hit_pct', 'barrel_pct', 'avg_xba', 'avg_xwoba', 'avg_xslg', 'avg_woba', 'bb_pct'])
        for (const m of validMetrics) {
          if (PITCHER_LOWER_BETTER.has(m) && !LOWER_IS_BETTER.has(m)) {
            // Re-rank: lower is better for pitchers on these batting-against metrics
            const vals = allTeams
              .filter(r => r[m] != null)
              .map(r => ({ team: r.team, val: Number(r[m]) }))
              .sort((a, b) => a.val - b.val)
            const idx = vals.findIndex(v => v.team === team)
            ranks[m] = { rank: idx >= 0 ? idx + 1 : vals.length + 1, total: vals.length }
          }
        }
      }

      // For hitting context, invert certain metrics (lower is better for hitters)
      if (statScope === 'hitting') {
        const HITTER_LOWER_BETTER = new Set(['k_pct', 'chase_pct', 'whiff_pct', 'swstr_pct'])
        for (const m of validMetrics) {
          if (HITTER_LOWER_BETTER.has(m)) {
            const vals = allTeams
              .filter(r => r[m] != null)
              .map(r => ({ team: r.team, val: Number(r[m]) }))
              .sort((a, b) => a.val - b.val)
            const idx = vals.findIndex(v => v.team === team)
            ranks[m] = { rank: idx >= 0 ? idx + 1 : vals.length + 1, total: vals.length }
          }
        }
      }

      const TEAM_NAMES: Record<string, string> = {
        ARI:'Arizona Diamondbacks',ATL:'Atlanta Braves',BAL:'Baltimore Orioles',BOS:'Boston Red Sox',
        CHC:'Chicago Cubs',CWS:'Chicago White Sox',CIN:'Cincinnati Reds',CLE:'Cleveland Guardians',
        COL:'Colorado Rockies',DET:'Detroit Tigers',HOU:'Houston Astros',KC:'Kansas City Royals',
        LAA:'Los Angeles Angels',LAD:'Los Angeles Dodgers',MIA:'Miami Marlins',MIL:'Milwaukee Brewers',
        MIN:'Minnesota Twins',NYM:'New York Mets',NYY:'New York Yankees',OAK:'Oakland Athletics',
        PHI:'Philadelphia Phillies',PIT:'Pittsburgh Pirates',SD:'San Diego Padres',SF:'San Francisco Giants',
        SEA:'Seattle Mariners',STL:'St. Louis Cardinals',TB:'Tampa Bay Rays',TEX:'Texas Rangers',
        TOR:'Toronto Blue Jays',WSH:'Washington Nationals',
      }

      const stats: Record<string, any> = {}
      if (thisTeam) {
        for (const m of validMetrics) stats[m] = thisTeam[m] ?? null
      }

      return NextResponse.json({
        teamStats: {
          team,
          teamName: TEAM_NAMES[team] || team,
          stats,
          ranks,
        },
      })
    }

    // ── Trends mode (Surges & Concerns from /api/trends) ────────────────
    if (sp.get('trends') === 'true') {
      const season = sp.get('season') || new Date().getFullYear()
      const earlyMonth = new Date().getMonth() + 1 <= 4
      const minPitches = earlyMonth ? 50 : 500

      // Fetch both pitcher and hitter alerts in parallel
      const baseUrl = req.nextUrl.origin
      const [pitcherRes, hitterRes] = await Promise.all([
        fetch(`${baseUrl}/api/trends`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season: Number(season), playerType: 'pitcher', minPitches }),
        }),
        fetch(`${baseUrl}/api/trends`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season: Number(season), playerType: 'hitter', minPitches }),
        }),
      ])

      const [pd, hd] = await Promise.all([pitcherRes.json(), hitterRes.json()])
      const pitcherAlerts = (pd.rows || []).map((a: any) => ({ ...a, type: 'pitcher' }))
      const hitterAlerts = (hd.rows || []).map((a: any) => ({ ...a, type: 'hitter' }))
      const all = [...pitcherAlerts, ...hitterAlerts]

      const surgeAll = all.filter((a: any) => a.sentiment === 'good').sort((a: any, b: any) => Math.abs(b.sigma) - Math.abs(a.sigma))
      const concernAll = all.filter((a: any) => a.sentiment === 'bad').sort((a: any, b: any) => Math.abs(b.sigma) - Math.abs(a.sigma))

      // Deduplicate: one per player, highest |sigma|
      const pickUnique = (list: any[], n: number) => {
        const seen = new Set<number>()
        const result: any[] = []
        for (const item of list) {
          if (seen.has(item.player_id)) continue
          seen.add(item.player_id)
          result.push(item)
          if (result.length >= n) break
        }
        return result
      }

      return NextResponse.json({
        trends: {
          surges: pickUnique(surgeAll, 5),
          concerns: pickUnique(concernAll, 5),
        },
      })
    }

    // ── Top Performances mode (daily brief topPerformances) ────────────
    if (sp.get('topPerformances') === 'true') {
      const { data } = await supabase
        .from('briefs')
        .select('date, metadata')
        .order('date', { ascending: false })
        .limit(1)
        .single()

      const topPerformances = data?.metadata?.claude_sections?.topPerformances || null
      return NextResponse.json({
        brief: {
          date: data?.date || null,
          topPerformances,
        },
      })
    }

    // ── Top Pitchers mode (daily highlights proxy) ────────────────────
    if (sp.get('topPitchers') === 'true') {
      const baseUrl = req.nextUrl.origin
      const res = await fetch(`${baseUrl}/api/daily-highlights`)
      const json = await res.json()
      if (!res.ok) return NextResponse.json({ error: json.error || 'Failed to fetch highlights' }, { status: res.status })
      return NextResponse.json({ highlights: json })
    }

    // ── Yesterday's Scores mode (MLB Schedule API) ──────────────────────
    if (sp.get('yesterdayScores') === 'true') {
      const date = sp.get('date') || (() => {
        const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10)
      })()
      const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=team,linescore,decisions`
      const res = await fetch(url, { next: { revalidate: 300 } })
      if (!res.ok) return NextResponse.json({ error: `MLB API returned ${res.status}` }, { status: 502 })
      const data = await res.json()

      const allGames = data.dates?.[0]?.games || []
      const finalGames = allGames.filter((g: any) =>
        g.status?.abstractGameState === 'Final' || g.status?.detailedState === 'Final'
      )

      const games = finalGames.map((g: any) => {
        const away = g.teams?.away
        const home = g.teams?.home
        // Map MLB abbreviation quirks
        const fixAbbrev = (a: string) => {
          if (a === 'AZ') return 'ARI'
          if (a === 'WSN') return 'WSH'
          return a
        }
        return {
          awayAbbrev: fixAbbrev(away?.team?.abbreviation || '???'),
          homeAbbrev: fixAbbrev(home?.team?.abbreviation || '???'),
          awayName: away?.team?.name || '',
          homeName: home?.team?.name || '',
          awayScore: away?.score ?? 0,
          homeScore: home?.score ?? 0,
          winPitcher: g.decisions?.winner?.fullName?.split(', ').pop()?.split(' ').pop() || '',
          losePitcher: g.decisions?.loser?.fullName?.split(', ').pop()?.split(' ').pop() || '',
          savePitcher: g.decisions?.save?.fullName?.split(', ').pop()?.split(' ').pop() || '',
        }
      })

      // Format date
      const d = new Date(date + 'T12:00:00')
      const dateFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

      return NextResponse.json({
        scores: {
          date,
          dateFormatted,
          games,
        },
      })
    }

    // ── Depth Chart mode (MLB Stats API roster) ──────────────────────────
    if (sp.get('depthChart') === 'true') {
      const TEAM_IDS: Record<string, number> = {
        AZ:109,ATL:144,BAL:110,BOS:111,CHC:112,CWS:145,CIN:113,CLE:114,COL:115,DET:116,
        HOU:117,KC:118,LAA:108,LAD:119,MIA:146,MIL:158,MIN:142,NYM:121,NYY:147,OAK:133,
        PHI:143,PIT:134,SD:135,SF:137,SEA:136,STL:138,TB:139,TEX:140,TOR:141,WSH:120,
      }
      const TEAM_NAMES: Record<string, string> = {
        AZ:'Arizona Diamondbacks',ATL:'Atlanta Braves',BAL:'Baltimore Orioles',BOS:'Boston Red Sox',
        CHC:'Chicago Cubs',CWS:'Chicago White Sox',CIN:'Cincinnati Reds',CLE:'Cleveland Guardians',
        COL:'Colorado Rockies',DET:'Detroit Tigers',HOU:'Houston Astros',KC:'Kansas City Royals',
        LAA:'Los Angeles Angels',LAD:'Los Angeles Dodgers',MIA:'Miami Marlins',MIL:'Milwaukee Brewers',
        MIN:'Minnesota Twins',NYM:'New York Mets',NYY:'New York Yankees',OAK:'Oakland Athletics',
        PHI:'Philadelphia Phillies',PIT:'Pittsburgh Pirates',SD:'San Diego Padres',SF:'San Francisco Giants',
        SEA:'Seattle Mariners',STL:'St. Louis Cardinals',TB:'Tampa Bay Rays',TEX:'Texas Rangers',
        TOR:'Toronto Blue Jays',WSH:'Washington Nationals',
      }
      const team = (sp.get('team') || '').toUpperCase()
      const teamId = TEAM_IDS[team]
      if (!teamId) return NextResponse.json({ error: 'Unknown team' }, { status: 400 })
      const year = sp.get('gameYear') || new Date().getFullYear()

      const res = await fetch(
        `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=depthChart&season=${year}`,
        { next: { revalidate: 3600 } }
      )
      if (!res.ok) return NextResponse.json({ error: `MLB API returned ${res.status}` }, { status: 502 })
      const data = await res.json()

      const starters = (data.roster || [])
        .filter((p: any) => p.position?.code === 'S')
        .map((p: any, i: number) => ({
          player_id: p.person?.id,
          player_name: p.person?.fullName || '',
          jersey_number: p.jerseyNumber || '',
          order: i + 1,
        }))

      // Bullpen depth chart mode — return closer/setup/relief from roster
      if (sp.get('bullpenChart') === 'true') {
        const relievers = (data.roster || [])
          .filter((p: any) => p.position?.code === 'R')
          .map((p: any, i: number) => ({
            player_id: p.person?.id,
            player_name: p.person?.fullName || '',
            jersey_number: p.jerseyNumber || '',
            order: i + 1,
          }))

        return NextResponse.json({
          bullpenChart: {
            teamAbbrev: team,
            teamName: TEAM_NAMES[team] || team,
            closer: relievers.slice(0, 1),
            setup: relievers.slice(1, 3),
            relief: relievers.slice(3, 8),
          },
        })
      }

      return NextResponse.json({
        depthChart: {
          teamAbbrev: team,
          teamName: TEAM_NAMES[team] || team,
          rotation: starters.slice(0, 5),
          depth: starters.slice(5, 8),
        },
      })
    }

    // ── Player Check-In mode ──────────────────────────────────────────────
    if (sp.get('playerCheckin') === 'true') {
      const playerIdsRaw = sp.get('playerIds') || ''
      const playerIds = playerIdsRaw.split(',').map(Number).filter(Boolean)
      if (playerIds.length === 0) return NextResponse.json({ error: 'Missing playerIds' }, { status: 400 })
      const gameYear = sp.get('gameYear') || new Date().getFullYear()
      const playerType = sp.get('playerType') || 'pitcher'
      const col = playerType === 'batter' ? 'batter' : 'pitcher'

      // Fetch aggregated stats from pitches table
      const where = `p.${col} IN (${playerIds.join(',')}) AND p.game_year = ${gameYear} AND p.game_type = 'R' AND p.pitch_type NOT IN ('PO','IN')`
      const sql = `SELECT
        p.${col} as player_id,
        p.player_name,
        COUNT(DISTINCT game_pk) as games,
        (COUNT(DISTINCT CASE WHEN events IS NOT NULL AND events NOT IN ('single','double','triple','home_run','walk','hit_by_pitch','catcher_interf','field_error') THEN game_pk::bigint * 10000 + at_bat_number END)
         + COUNT(DISTINCT CASE WHEN events LIKE '%double_play%' THEN game_pk::bigint * 10000 + at_bat_number END)
         + 2 * COUNT(DISTINCT CASE WHEN events = 'triple_play' THEN game_pk::bigint * 10000 + at_bat_number END))::numeric / 3.0 as ip,
        COUNT(*) FILTER (WHERE events LIKE '%strikeout%') as k,
        COUNT(*) FILTER (WHERE events = 'walk') as bb,
        ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::numeric
          / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as baa,
        ROUND((COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run','walk','hit_by_pitch')))::numeric
          / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL AND events NOT IN ('sac_bunt','catcher_interf') THEN game_pk::bigint * 10000 + at_bat_number END), 0)
          + (COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric
          / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as ops
      FROM pitches p
      WHERE ${where}
      GROUP BY p.${col}, p.player_name`

      const { data: rows, error } = await q(sql)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Fetch ERA + R from player_season_stats table
      const mlbStats: Record<number, { era: string; r: number }> = {}
      const group = playerType === 'batter' ? 'hitting' : 'pitching'
      const { data: pssData } = await supabase
        .from('player_season_stats')
        .select('player_id, era, runs')
        .in('player_id', playerIds)
        .eq('season', gameYear)
        .eq('stat_group', group)
      for (const row of (pssData || []) as any[]) {
        mlbStats[row.player_id] = {
          era: row.era != null ? Number(row.era).toFixed(2) : '0.00',
          r: row.runs ?? 0,
        }
      }

      // Build player data in the order requested
      const playerMap = new Map((rows as any[]).map((r: any) => [r.player_id, r]))
      const players = playerIds.map(id => {
        const r = playerMap.get(id) || {} as any
        const mlb = mlbStats[id] || { era: '0.00', r: 0 }
        const ip = Number(r.ip) || 0
        const fullInnings = Math.floor(ip)
        const remainder = Math.round((ip - fullInnings) * 3)
        const ipDisplay = `${fullInnings}.${remainder}`
        const fmtAvg = (v: any) => {
          const n = Number(v)
          if (isNaN(n)) return '.000'
          if (n >= 1) return n.toFixed(3)
          return '.' + n.toFixed(3).split('.')[1]
        }
        // Format name: "Last, First" -> "First Last"
        const raw = r.player_name || ''
        const name = raw.includes(',') ? raw.split(',').map((s: string) => s.trim()).reverse().join(' ') : raw

        return {
          player_id: id,
          player_name: name,
          stats: [ipDisplay, mlb.era, String(mlb.r), String(r.k || 0), String(r.bb || 0), fmtAvg(r.baa), fmtAvg(r.ops)],
        }
      })

      return NextResponse.json({
        checkin: {
          title: playerType === 'batter' ? 'HITTING CHECK IN' : 'PITCHING CHECK IN',
          subtitle: `Regular Season  •  ${gameYear} Season Check In`,
          statHeaders: playerType === 'batter' ? ['AVG', 'SLG', 'OPS', 'HR', 'RBI', 'K', 'BB'] : ['IP', 'ERA', 'R', 'K', 'BB', 'BAA', 'OPS'],
          players,
        },
      })
    }

    // ── Leaderboard mode (for data-driven templates) ─────────────────────
    if (sp.get('leaderboard') === 'true') {
      const metric = sp.get('metric')
      const playerType = sp.get('playerType') || 'pitcher'
      const gameYear = sp.get('gameYear')
      const dateFrom = sp.get('dateFrom')
      const dateTo = sp.get('dateTo')
      const pitchType = sp.get('pitchType')
      const pitcherRole = sp.get('pitcherRole') // 'starter' | 'reliever' | null
      const limit = Math.min(parseInt(sp.get('limit') || '5'), 25)
      const sortDir = sp.get('sortDir') === 'asc' ? 'ASC' : 'DESC'
      const secondaryMetric = sp.get('secondaryMetric')
      const tertiaryMetric = sp.get('tertiaryMetric')

      if (!metric) return NextResponse.json({ error: 'metric required' }, { status: 400 })

      // Build pitcher role subquery filter
      // Starter = has ≥3 games with 50+ pitches in the season
      // Reliever = has <3 games with 50+ pitches
      const pitcherRoleYear = parseInt(gameYear || '2026')
      const roleSubquery = `SELECT pitcher FROM pitches WHERE game_year = ${pitcherRoleYear} AND pitch_type NOT IN ('PO','IN') GROUP BY pitcher, game_pk HAVING COUNT(*) >= 50`
      const starterSubquery = pitcherRole === 'starter'
        ? `AND pitcher IN (SELECT pitcher FROM (${roleSubquery}) gs GROUP BY pitcher HAVING COUNT(*) >= 3)`
        : pitcherRole === 'reliever'
        ? `AND pitcher NOT IN (SELECT pitcher FROM (${roleSubquery}) gs GROUP BY pitcher HAVING COUNT(*) >= 3)`
        : ''

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

        // Apply pitcher role filter
        if (pitcherRole === 'starter' || pitcherRole === 'reliever') {
          const rsq = `SELECT pitcher FROM pitches WHERE game_year = ${year} AND pitch_type NOT IN ('PO','IN') GROUP BY pitcher, game_pk HAVING COUNT(*) >= 50`
          const roleRes = await q(`SELECT pitcher FROM (${rsq}) gs GROUP BY pitcher HAVING COUNT(*) >= 3`)
          const starterIds = new Set((roleRes.data || []).map((r: any) => r.pitcher))
          rows = rows.filter(r => pitcherRole === 'starter' ? starterIds.has(r.player_id) : !starterIds.has(r.player_id))
        }

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

        // Apply pitcher role filter
        if (pitcherRole === 'starter' || pitcherRole === 'reliever') {
          const rsq = `SELECT pitcher FROM pitches WHERE game_year = ${year} AND pitch_type NOT IN ('PO','IN') GROUP BY pitcher, game_pk HAVING COUNT(*) >= 50`
          const roleRes = await q(`SELECT pitcher FROM (${rsq}) gs GROUP BY pitcher HAVING COUNT(*) >= 3`)
          const starterIds = new Set((roleRes.data || []).map((r: any) => r.pitcher))
          rows = rows.filter(r => pitcherRole === 'starter' ? starterIds.has(r.player_id) : !starterIds.has(r.player_id))
        }

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

      // ── Runs leaderboard (from player_season_stats) ──────────────────────
      if (metric === 'runs') {
        const year = parseInt(gameYear || '2025')
        const group = playerType === 'batter' ? 'hitting' : 'pitching'

        const runsSql = `
          SELECT pss.player_id, pl.name as player_name, pss.runs
          FROM player_season_stats pss
          JOIN players pl ON pl.id = pss.player_id
          WHERE pss.season = ${year}
            AND pss.stat_group = '${group}'
            AND pss.runs IS NOT NULL
        `
        const { data, error } = await q(runsSql)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        let rows = ((data || []) as any[]).map(r => ({
          player_id: r.player_id, player_name: r.player_name, runs: Number(r.runs),
        }))

        const jsSortDir = sortDir === 'ASC' ? 1 : -1
        rows.sort((a, b) => (a.runs - b.runs) * jsSortDir)
        rows = rows.slice(0, limit)

        const result = rows.map(r => {
          const out: Record<string, any> = { player_id: r.player_id, player_name: r.player_name, primary_value: r.runs }
          for (const m of allMetrics) { if (m.alias !== 'primary_value') out[m.alias] = null }
          return out
        })

        // Backfill secondary/tertiary from pitches
        const pitchesBackfill = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !COMPUTED_METRIC_KEYS.has(m.key))
        const extraWhereRuns = [`game_year = ${year}`, ...(pitchType ? [`pitch_type = '${pitchType.replace(/'/g, "''")}'`] : [])]
        await backfillPitchesMetrics(q, result, pitchesBackfill, playerType === 'batter' ? 'batter' : 'pitcher', extraWhereRuns)

        return NextResponse.json({ leaderboard: result })
      }

      // ── wRC+ leaderboard (computed from wOBA + park factors) ────────────
      if (metric === 'wrc_plus') {
        const year = parseInt(gameYear || '2025')
        const constants = SEASON_CONSTANTS[year] || SEASON_CONSTANTS[LATEST_SEASON_YEAR]
        const minSample = parseInt(sp.get('minSample') || '150')

        const where: string[] = ["pitch_type NOT IN ('PO', 'IN')", "game_type = 'R'"]
        if (gameYear) where.push(`game_year = ${year}`)
        if (dateFrom) where.push(`game_date >= '${dateFrom.replace(/'/g, "''")}'`)
        if (dateTo) where.push(`game_date <= '${dateTo.replace(/'/g, "''")}'`)

        // Query all batters' wOBA, PA, and primary team
        const wrcSql = `
          SELECT p.batter as player_id, pl.name as player_name,
            AVG(woba_value) as woba,
            COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
            MODE() WITHIN GROUP (ORDER BY CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END) as primary_team
          FROM pitches p
          JOIN players pl ON pl.id = p.batter
          WHERE ${where.join(' AND ')}
          GROUP BY p.batter, pl.name
          HAVING COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) >= ${minSample}
        `
        const { data, error } = await q(wrcSql)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        let rows = ((data || []) as any[]).map(r => {
          const woba = r.woba != null ? Number(r.woba) : null
          const pf = PARK_FACTORS[r.primary_team]?.basic || 100
          const wrcPlus = woba != null ? computeWRCPlus(woba, constants, pf) : null
          return { player_id: r.player_id, player_name: r.player_name, wrc_plus: wrcPlus }
        }).filter(r => r.wrc_plus != null)

        const jsSortDir = sortDir === 'ASC' ? 1 : -1
        rows.sort((a, b) => {
          if (a.wrc_plus == null && b.wrc_plus == null) return 0
          if (a.wrc_plus == null) return 1; if (b.wrc_plus == null) return -1
          return (a.wrc_plus - b.wrc_plus) * jsSortDir
        })
        rows = rows.slice(0, limit)

        const result = rows.map(r => {
          const out: Record<string, any> = { player_id: r.player_id, player_name: r.player_name, primary_value: r.wrc_plus }
          for (const m of allMetrics) { if (m.alias !== 'primary_value') out[m.alias] = null }
          return out
        })

        // Backfill secondary/tertiary from pitches
        const pitchesBackfill = allMetrics.filter(m => m.alias !== 'primary_value' && METRICS[m.key] && !COMPUTED_METRIC_KEYS.has(m.key))
        const extraWhereWrc = [`game_year = ${year}`, ...(pitchType ? [`pitch_type = '${pitchType.replace(/'/g, "''")}'`] : [])]
        await backfillPitchesMetrics(q, result, pitchesBackfill, 'batter', extraWhereWrc)

        return NextResponse.json({ leaderboard: result })
      }

      // ── ERA from player_season_stats table ─────────────────────────────
      if (metric === 'era') {
        const year = parseInt(gameYear || '2025')
        const minIP = parseFloat(sp.get('minSample') || '30')

        // Query player_season_stats joined with players for name,
        // filtered by IP qualification and pitcher role
        let eraSql = `
          SELECT pss.player_id, pl.name as player_name, pss.era,
            pss.innings_pitched as ip
          FROM player_season_stats pss
          JOIN players pl ON pl.id = pss.player_id
          WHERE pss.season = ${year}
            AND pss.stat_group = 'pitching'
            AND pss.era IS NOT NULL
            AND pss.innings_pitched >= ${minIP}
        `
        // Apply pitcher role filter
        if (pitcherRole === 'starter' || pitcherRole === 'reliever') {
          eraSql += ` AND pss.player_id ${pitcherRole === 'starter' ? 'IN' : 'NOT IN'} (SELECT pitcher FROM (${roleSubquery}) gs GROUP BY pitcher HAVING COUNT(*) >= 3)`
        }

        const { data, error } = await q(eraSql)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        let rows = ((data || []) as any[]).map(r => ({
          player_id: r.player_id,
          player_name: r.player_name,
          era: Number(r.era),
        }))

        const jsSortDir = sortDir === 'ASC' ? 1 : -1
        rows.sort((a, b) => {
          if (a.era == null && b.era == null) return 0
          if (a.era == null) return 1; if (b.era == null) return -1
          return (a.era - b.era) * jsSortDir
        })
        rows = rows.slice(0, limit)

        const result = rows.map(r => {
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
          WHERE ${where.join(' AND ')} ${starterSubquery}
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
        WHERE ${where.join(' AND ')} ${playerType === 'pitcher' ? starterSubquery : ''}
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
    const playerType = sp.get('playerType') || 'pitcher'
    const groupCol = playerType === 'batter' ? 'batter' : 'pitcher'
    const where: string[] = [`${groupCol} = ${parseInt(playerId)}`, "pitch_type NOT IN ('PO', 'IN')"]
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

    // Stats mode — supports pitches, ERA, Triton+, Deception, and computed metrics
    const metricList = (sp.get('metrics') || 'avg_velo,whiff_pct').split(',')
    const pitchesMetrics = metricList.filter(m => METRICS[m] && !ERA_METRIC_KEYS.has(m) && !TRITON_PLUS_METRIC_KEYS.has(m) && !DECEPTION_METRIC_KEYS.has(m))
    const eraMetrics = metricList.filter(m => ERA_METRIC_KEYS.has(m))
    const tritonMetrics = metricList.filter(m => TRITON_PLUS_METRIC_KEYS.has(m))
    const deceptionMetrics = metricList.filter(m => DECEPTION_METRIC_KEYS.has(m))
    const computedMetrics = metricList.filter(m => COMPUTED_METRIC_KEYS.has(m))

    const hasAny = pitchesMetrics.length + eraMetrics.length + tritonMetrics.length + deceptionMetrics.length + computedMetrics.length > 0
    if (!hasAny) return NextResponse.json({ error: 'No valid metrics' }, { status: 400 })

    const pid = parseInt(playerId)
    const year = parseInt(gameYear || '2025')
    const stats: Record<string, any> = {}

    // Run all sources in parallel
    const tasks: Promise<void>[] = []

    // 1. Pitches-table metrics
    if (pitchesMetrics.length > 0) {
      tasks.push((async () => {
        const selectParts = pitchesMetrics.map(m => `${METRICS[m]} AS ${m}`)
        const sql2 = `SELECT ${selectParts.join(', ')} FROM pitches ${whereClause}`
        const { data: d } = await q(sql2)
        const row = d?.[0] || {}
        for (const m of pitchesMetrics) stats[m] = row[m] ?? null
      })())
    }

    // 2. ERA / FIP / xERA (computed from pitches ERA components)
    if (eraMetrics.length > 0) {
      tasks.push((async () => {
        const constants = SEASON_CONSTANTS[year] || SEASON_CONSTANTS[LATEST_SEASON_YEAR]
        const eraWhere = [...where]
        const sql2 = `SELECT ${ERA_COMPONENTS_SQL} FROM pitches p WHERE ${eraWhere.map(w => w.replace(/^pitcher/, 'p.pitcher').replace(/^batter/, 'p.batter')).join(' AND ')}`
        const { data: d } = await q(sql2)
        if (d?.[0]) {
          const row = d[0]
          if (eraMetrics.includes('fip')) stats.fip = computeFIP(row, constants)
          if (eraMetrics.includes('xera')) stats.xera = computeXERA(row, constants)
          if (eraMetrics.includes('era')) {
            // ERA from player_season_stats table (populated by cron), FIP fallback
            try {
              const { data: eraData } = await supabase
                .from('player_season_stats')
                .select('era')
                .eq('player_id', pid)
                .eq('season', year)
                .eq('stat_group', 'pitching')
                .single()
              stats.era = eraData?.era != null ? Number(eraData.era) : computeFIP(row, constants)
            } catch {
              stats.era = computeFIP(row, constants)
            }
          }
        }
      })())
    }

    // 3. Triton command metrics (from pitcher_season_command)
    if (tritonMetrics.length > 0) {
      tasks.push((async () => {
        const sql2 = `SELECT pitches, ${TRITON_COLUMNS.join(', ')} FROM pitcher_season_command WHERE game_year = ${year} AND pitcher = ${pid}`
        const { data: d } = await q(sql2)
        if (d && d.length > 0) {
          const tMap = pivotTritonRows((d as any[]).map(r => ({ ...r, pitcher: pid })))
          const t = tMap.get(pid)
          if (t) {
            for (const m of tritonMetrics) {
              stats[m] = t[TRITON_COL[m] || m] ?? null
            }
          }
        }
      })())
    }

    // 4. Deception metrics (from pitcher_season_deception)
    if (deceptionMetrics.length > 0) {
      tasks.push((async () => {
        const sql2 = `SELECT pitch_type, pitches, deception_score, unique_score,
          z_vaa, z_haa, z_vb, z_hb, z_ext
          FROM pitcher_season_deception WHERE game_year = ${year} AND pitcher = ${pid}`
        const { data: d } = await q(sql2)
        if (d && d.length > 0) {
          let uniqSum = 0, uniqW = 0, decSum = 0, decW = 0
          const fbZ = { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 }
          const osZ = { vaa: 0, haa: 0, vb: 0, hb: 0, ext: 0, w: 0 }
          for (const row of d as any[]) {
            const n = Number(row.pitches) || 0
            if (row.unique_score != null) { uniqSum += Number(row.unique_score) * n; uniqW += n }
            if (row.deception_score != null) { decSum += Number(row.deception_score) * n; decW += n }
            const bucket = isFastball(row.pitch_type) ? fbZ : osZ
            if (row.z_vaa != null) {
              bucket.vaa += Number(row.z_vaa) * n; bucket.haa += Number(row.z_haa) * n
              bucket.vb += Number(row.z_vb) * n; bucket.hb += Number(row.z_hb) * n
              bucket.ext += (row.z_ext != null ? Number(row.z_ext) : 0) * n; bucket.w += n
            }
          }
          if (deceptionMetrics.includes('unique_score')) stats.unique_score = uniqW > 0 ? Math.round((uniqSum / uniqW) * 1000) / 1000 : null
          if (deceptionMetrics.includes('deception_score')) stats.deception_score = decW > 0 ? Math.round((decSum / decW) * 1000) / 1000 : null
          if (deceptionMetrics.includes('xdeception_score')) {
            if (fbZ.w > 0 && osZ.w > 0) {
              const fb = { vaa: fbZ.vaa / fbZ.w, haa: fbZ.haa / fbZ.w, vb: fbZ.vb / fbZ.w, hb: fbZ.hb / fbZ.w, ext: fbZ.ext / fbZ.w }
              const os = { vaa: osZ.vaa / osZ.w, haa: osZ.haa / osZ.w, vb: osZ.vb / osZ.w, hb: osZ.hb / osZ.w, ext: osZ.ext / osZ.w }
              stats.xdeception_score = Math.round(computeXDeceptionScore(fb, os) * 1000) / 1000
            } else { stats.xdeception_score = null }
          }
        }
      })())
    }

    // 5. Runs (from player_season_stats)
    if (computedMetrics.includes('runs')) {
      tasks.push((async () => {
        const group = playerType === 'batter' ? 'hitting' : 'pitching'
        const { data: d } = await supabase
          .from('player_season_stats')
          .select('runs')
          .eq('player_id', pid)
          .eq('season', year)
          .eq('stat_group', group)
          .single()
        stats.runs = d?.runs ?? null
      })())
    }

    // 6. wRC+ (computed from wOBA + park factors)
    if (computedMetrics.includes('wrc_plus')) {
      tasks.push((async () => {
        const constants = SEASON_CONSTANTS[year] || SEASON_CONSTANTS[LATEST_SEASON_YEAR]
        // Get wOBA and derive primary team for park factor
        const col = playerType === 'batter' ? 'batter' : 'pitcher'
        const teamCol = playerType === 'batter'
          ? "CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END"
          : "CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END"
        const wrcSql = `SELECT AVG(woba_value) as woba,
          MODE() WITHIN GROUP (ORDER BY (${teamCol})) as primary_team
          FROM pitches WHERE ${col} = ${pid} AND pitch_type NOT IN ('PO','IN')${gameYear ? ` AND game_year = ${year}` : ''}`
        const { data: d } = await q(wrcSql)
        if (d?.[0]?.woba != null) {
          const woba = Number(d[0].woba)
          const pf = PARK_FACTORS[d[0].primary_team]?.basic || 100
          stats.wrc_plus = computeWRCPlus(woba, constants, pf)
        } else {
          stats.wrc_plus = null
        }
      })())
    }

    await Promise.all(tasks)

    // Include player_name if requested
    if (metricList.includes('player_name') && !stats.player_name) {
      const { data: pData } = await q(`SELECT name FROM players WHERE id = ${pid} LIMIT 1`)
      stats.player_name = pData?.[0]?.name || null
    }

    return NextResponse.json({ stats }, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
