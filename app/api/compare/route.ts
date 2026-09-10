import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'
import { buildReportQuery } from '@/lib/reportQueryBuilder'
import { pivotTritonRows } from '@/lib/sql'
import { METRICS } from '@/lib/reportMetrics'
import { metricsFor, EXTRA_STATCAST_FIELDS, PITCH_TYPES, type CompareGroup, type CompareSource } from '@/lib/compareMetrics'
import { modernTeamCode } from '@/lib/lahman-stats'

/**
 * POST /api/compare
 *
 * Side-by-side stats for up to 4 players, from whichever sources the visible
 * sections need. Body:
 *
 *   { group: 'hitting' | 'pitching',
 *     scope: 'career' | 'season',
 *     season?: number,
 *     sources: ('lahman'|'statcast'|'triton'|'awards')[],
 *     players: [{ mlbId?: number|null, lahmanId?: string|null }] }
 *
 * Returns one entry per input player, in input order.
 *
 * Career rate stats are recomputed from summed components — averaging a
 * player's season BAs would weight a 20-AB September the same as a full year.
 */
export const maxDuration = 60

const MAX_PLAYERS = 4

const q = (sql: string) => supabase.rpc('run_query_long', { query_text: sql.trim() })

/** Lahman ids are alphanumeric (`mccovwi01`); anything else is not an id. */
const safeLahmanId = (v: unknown): string | null => {
  const s = String(v ?? '')
  return /^[a-z0-9]{2,20}$/i.test(s) ? s : null
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

const div = (a: number | null, b: number | null): number | null =>
  a == null || !b ? null : a / b

interface PlayerInput { mlbId: number | null; lahmanId: string | null; window: TimeWindow }

/**
 * The time slice a player's numbers cover. All-null = career. `season` and
 * the date pair are mutually exclusive; dates come pre-validated. Seasonal
 * tables (Lahman, Triton, Deception, Awards) approximate a date range as
 * "every season the range touches" — yearFrom/yearTo — which the UI notes.
 */
interface TimeWindow {
  season: number | null
  from: string | null
  to: string | null
}

const CAREER: TimeWindow = { season: null, from: null, to: null }
const windowKey = (w: TimeWindow) => `${w.season ?? ''}|${w.from ?? ''}|${w.to ?? ''}`
const yearOfDate = (d: string) => parseInt(d.slice(0, 4), 10)

/** Season filter for per-year tables (col = game_year or year). */
const seasonClause = (w: TimeWindow, col: string): string => {
  if (w.season != null) return ` AND ${col} = ${w.season}`
  if (w.from && w.to) return ` AND ${col} BETWEEN ${yearOfDate(w.from)} AND ${yearOfDate(w.to)}`
  return ''
}

/** Date filter for the pitches table (raw SQL paths). */
const dateClause = (w: TimeWindow): string => {
  if (w.season != null) return ` AND game_year = ${w.season}`
  if (w.from && w.to) return ` AND game_date BETWEEN '${w.from}' AND '${w.to}'`
  return ''
}

export interface ComparePlayerPayload {
  mlbId: number | null
  lahmanId: string | null
  name: string | null
  debut: string | null
  finalGame: string | null
  active: boolean
  team: string | null
  lahman: Record<string, number | null> | null
  statcast: Record<string, number | null> | null
  triton: Record<string, number | null> | null
  awards: Record<string, number | boolean> | null
  /** Per-pitch-type rows (pitcher arsenal / hitter vs-pitch-type), most-used first. */
  byPitch: Record<string, unknown>[] | null
}

// ── Lahman ──────────────────────────────────────────────────────────────────

const BATTING_SUMS = [
  'g', 'ab', 'r', 'h', 'doubles', 'triples', 'hr', 'rbi', 'sb', 'cs',
  'bb', 'so', 'ibb', 'hbp', 'sh', 'sf', 'gidp', 'pa',
]

const PITCHING_SUMS = [
  'w', 'l', 'g', 'gs', 'cg', 'sho', 'sv', 'ipouts', 'h', 'er', 'hr',
  'bb', 'so', 'ibb', 'wp', 'hbp', 'bk', 'bfp', 'gf', 'r',
]

async function fetchLahman(
  group: CompareGroup,
  ids: string[],
  window: TimeWindow,
): Promise<Map<string, Record<string, number | null>>> {
  const table = group === 'hitting' ? 'lahman_batting_calc' : 'lahman_pitching_calc'
  const cols = group === 'hitting' ? BATTING_SUMS : PITCHING_SUMS
  const sql = `
    SELECT lahman_id, ${cols.map(c => `SUM(${c})::numeric AS ${c}`).join(', ')}
    FROM ${table}
    WHERE lahman_id IN (${ids.map(i => `'${i}'`).join(',')})${seasonClause(window, 'year')}
    GROUP BY lahman_id
  `
  const { data, error } = await q(sql)
  if (error) throw new Error(error.message)

  const out = new Map<string, Record<string, number | null>>()
  for (const row of (data || []) as Record<string, unknown>[]) {
    const r: Record<string, number | null> = {}
    for (const c of cols) r[c] = num(row[c])

    if (group === 'hitting') {
      const ab = r.ab, h = r.h, bb = r.bb, hbp = r.hbp, sf = r.sf
      const tb = h != null ? h + (r.doubles || 0) + 2 * (r.triples || 0) + 3 * (r.hr || 0) : null
      r.ba = div(h, ab)
      // Sacrifice bunts are excluded from OBP's denominator; sac flies are not.
      const obpDen = (ab || 0) + (bb || 0) + (hbp || 0) + (sf || 0)
      r.obp = obpDen ? ((h || 0) + (bb || 0) + (hbp || 0)) / obpDen : null
      r.slg = div(tb, ab)
      r.ops = r.obp != null && r.slg != null ? r.obp + r.slg : null
    } else {
      const ip = r.ipouts != null ? r.ipouts / 3 : null
      r.era = ip ? (9 * (r.er || 0)) / ip : null
      r.whip = ip ? ((r.bb || 0) + (r.h || 0)) / ip : null
      r.k9 = ip ? (9 * (r.so || 0)) / ip : null
      r.bb9 = ip ? (9 * (r.bb || 0)) / ip : null
      r.hr9 = ip ? (9 * (r.hr || 0)) / ip : null
    }
    out.set(String(row.lahman_id), r)
  }
  return out
}

// ── MLB Stats API — the profile's source for the official line ──────────────
//
// The Overview page's W/L/ERA/GS/SV/WHIP come from statsapi (via /api/mlbstats),
// not Lahman — statsapi is always current and covers all of history. Compare
// uses the same upstream, career or single-season, and only falls back to the
// Lahman sums for players with no MLBAM id.

const MLB_TEAM_ABBREV: Record<number, string> = {
  109: 'AZ', 144: 'ATL', 110: 'BAL', 111: 'BOS', 112: 'CHC', 145: 'CWS', 113: 'CIN',
  114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KC', 108: 'LAA', 119: 'LAD',
  146: 'MIA', 158: 'MIL', 142: 'MIN', 121: 'NYM', 147: 'NYY', 133: 'OAK', 143: 'PHI',
  134: 'PIT', 135: 'SD', 137: 'SF', 136: 'SEA', 138: 'STL', 139: 'TB', 140: 'TEX',
  141: 'TOR', 120: 'WSH',
}

/** Field mapping: statsapi stat name -> the bag key the catalog reads. */
const MLB_PITCHING_FIELDS: [string, string][] = [
  ['wins', 'w'], ['losses', 'l'], ['gamesPlayed', 'g'], ['gamesStarted', 'gs'],
  ['completeGames', 'cg'], ['shutouts', 'sho'], ['saves', 'sv'], ['outs', 'ipouts'],
  ['battersFaced', 'bfp'], ['hits', 'h'], ['runs', 'r'], ['earnedRuns', 'er'],
  ['homeRuns', 'hr'], ['baseOnBalls', 'bb'], ['strikeOuts', 'so'], ['hitBatsmen', 'hbp'],
  ['era', 'era'], ['whip', 'whip'],
  ['strikeoutsPer9Inn', 'k9'], ['walksPer9Inn', 'bb9'], ['homeRunsPer9', 'hr9'],
]

const MLB_HITTING_FIELDS: [string, string][] = [
  ['gamesPlayed', 'g'], ['plateAppearances', 'pa'], ['atBats', 'ab'], ['runs', 'r'],
  ['hits', 'h'], ['doubles', 'doubles'], ['triples', 'triples'], ['homeRuns', 'hr'],
  ['rbi', 'rbi'], ['stolenBases', 'sb'], ['caughtStealing', 'cs'],
  ['baseOnBalls', 'bb'], ['strikeOuts', 'so'], ['hitByPitch', 'hbp'],
  ['avg', 'ba'], ['obp', 'obp'], ['slg', 'slg'], ['ops', 'ops'],
]

async function fetchOfficial(
  group: CompareGroup,
  ids: number[],
  window: TimeWindow,
): Promise<Map<number, Record<string, number | null>>> {
  const statsGroup = group === 'hitting' ? 'hitting' : 'pitching'
  const statsQ = window.season != null
    ? `stats=season&season=${window.season}`
    : window.from && window.to
      ? `stats=byDateRange&startDate=${window.from}&endDate=${window.to}`
      : 'stats=career'
  const fields = group === 'hitting' ? MLB_HITTING_FIELDS : MLB_PITCHING_FIELDS

  const out = new Map<number, Record<string, number | null>>()
  await Promise.all(ids.map(async id => {
    try {
      const res = await fetch(
        `https://statsapi.mlb.com/api/v1/people/${id}/stats?${statsQ}&group=${statsGroup}`,
        { next: { revalidate: 1800 } },
      )
      if (!res.ok) return
      const json = await res.json()
      // A traded player gets one split per club plus a combined split with
      // no team key — take the combined one (single-team responses may also
      // duplicate their lone split, so [0] alone is not safe either way).
      const splits: Record<string, unknown>[] = json?.stats?.[0]?.splits || []
      const st = (splits.find(sp => !sp.team) ?? splits[0])?.stat as Record<string, unknown> | undefined
      if (!st) return
      const bag: Record<string, number | null> = {}
      for (const [from, to] of fields) bag[to] = num(st[from])
      out.set(id, bag)
    } catch {
      // A missed lookup just leaves the Lahman fallback in place.
    }
  }))
  return out
}

/** Bio: current team, debut year, and whether the player is still active. */
async function fetchPeople(
  ids: number[],
): Promise<Map<number, { team: string | null; debut: string | null; active: boolean }>> {
  const out = new Map<number, { team: string | null; debut: string | null; active: boolean }>()
  if (!ids.length) return out
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/people?personIds=${ids.join(',')}&hydrate=currentTeam`,
      { next: { revalidate: 3600 } },
    )
    if (!res.ok) return out
    const json = await res.json()
    for (const person of json?.people || []) {
      const teamId = person?.currentTeam?.id
      out.set(Number(person.id), {
        team: (teamId != null && MLB_TEAM_ABBREV[teamId]) || null,
        debut: person?.mlbDebutDate ? String(person.mlbDebutDate) : null,
        active: !!person?.active,
      })
    }
  } catch {
    // Bio is decoration; stats still render without it.
  }
  return out
}

// ── Awards ──────────────────────────────────────────────────────────────────

const AWARD_FIELDS: Record<string, string> = {
  'Most Valuable Player': 'mvp',
  'Cy Young Award': 'cyYoung',
  'Gold Glove': 'goldGlove',
  'Silver Slugger': 'silverSlugger',
  'Rookie of the Year': 'roy',
}

async function fetchAwards(
  ids: string[],
  window: TimeWindow,
): Promise<Map<string, Record<string, number | boolean>>> {
  const inList = ids.map(i => `'${i}'`).join(',')
  const yearAwards = seasonClause(window, 'year')
  const [awardsRes, allStarRes, hofRes] = await Promise.all([
    q(`SELECT lahman_id, award_id, COUNT(*)::int AS n FROM lahman_awards
       WHERE lahman_id IN (${inList})${yearAwards} GROUP BY lahman_id, award_id`),
    // Two All-Star games were played in 1959–62, so count years, not rows.
    q(`SELECT lahman_id, COUNT(DISTINCT year)::int AS n FROM lahman_allstars
       WHERE lahman_id IN (${inList})${yearAwards} GROUP BY lahman_id`),
    // Induction is a career fact — a season filter would blank it out.
    q(`SELECT DISTINCT lahman_id FROM lahman_halloffame
       WHERE lahman_id IN (${inList}) AND inducted = 'Y'`),
  ])

  const out = new Map<string, Record<string, number | boolean>>()
  const bucket = (id: string) => {
    if (!out.has(id)) {
      out.set(id, { hof: false, allStar: 0, mvp: 0, cyYoung: 0, goldGlove: 0, silverSlugger: 0, roy: 0 })
    }
    return out.get(id)!
  }
  for (const id of ids) bucket(id)

  for (const row of (awardsRes.data || []) as Record<string, unknown>[]) {
    const field = AWARD_FIELDS[String(row.award_id)]
    if (field) bucket(String(row.lahman_id))[field] = Number(row.n) || 0
  }
  for (const row of (allStarRes.data || []) as Record<string, unknown>[]) {
    bucket(String(row.lahman_id)).allStar = Number(row.n) || 0
  }
  for (const row of (hofRes.data || []) as Record<string, unknown>[]) {
    bucket(String(row.lahman_id)).hof = true
  }
  return out
}

/** Most recent club per player, for the header accent colour. */
async function fetchLastTeams(
  group: CompareGroup,
  ids: string[],
  window: TimeWindow,
): Promise<Map<string, string>> {
  const table = group === 'hitting' ? 'lahman_batting_calc' : 'lahman_pitching_calc'
  const { data } = await q(`
    SELECT DISTINCT ON (lahman_id) lahman_id, team_id
    FROM ${table}
    WHERE lahman_id IN (${ids.map(i => `'${i}'`).join(',')})${seasonClause(window, 'year')}
    ORDER BY lahman_id, year DESC, g DESC
  `)
  const out = new Map<string, string>()
  for (const row of (data || []) as Record<string, unknown>[]) {
    const code = modernTeamCode(row.team_id == null ? null : String(row.team_id))
    if (code) out.set(String(row.lahman_id), code)
  }
  return out
}

// ── Statcast ────────────────────────────────────────────────────────────────

async function fetchStatcast(
  group: CompareGroup,
  ids: number[],
  window: TimeWindow,
): Promise<Map<number, Record<string, number | null>>> {
  const idCol = group === 'hitting' ? 'batter' : 'pitcher'
  // Every statcast-sourced metric in the catalog, so switching sections on
  // does not cost another round trip.
  const metrics = [
    ...new Set([
      ...Object.values(metricsFor(group))
        .filter(mt => mt.source === 'statcast' && !mt.derive)
        .map(mt => mt.field),
      // Components of the client-derived rows (K/9 etc.) ride along.
      ...EXTRA_STATCAST_FIELDS,
    ]),
  ]
  const filters: { column: string; op: string; value: unknown }[] = [
    { column: idCol, op: 'in', value: ids },
  ]
  if (window.season != null) filters.push({ column: 'game_year', op: 'eq', value: window.season })
  else if (window.from && window.to) filters.push({ column: 'game_date', op: 'between', value: [window.from, window.to] })

  const built = buildReportQuery(
    { table: 'pitches' },
    { metrics, groupBy: [idCol], filters, sortBy: metrics[0], limit: MAX_PLAYERS },
  )
  if (built.error || !built.sql) throw new Error(built.error || 'query build failed')

  const { data, error } = await q(built.sql)
  if (error) throw new Error(error.message)

  const out = new Map<number, Record<string, number | null>>()
  for (const row of (data || []) as Record<string, unknown>[]) {
    const r: Record<string, number | null> = {}
    for (const k of metrics) r[k] = num(row[k])
    out.set(Number(row[idCol]), r)
  }
  return out
}

// ── Triton+ ─────────────────────────────────────────────────────────────────

async function fetchTriton(
  ids: number[],
  window: TimeWindow,
): Promise<Map<number, Record<string, number | null>>> {
  // Per-season tables: a date range widens to the seasons it touches.
  const yearClause = seasonClause(window, 'game_year')
  const sql = `
    SELECT pitcher, player_name, pitches,
      cmd_plus, rpcom_plus, brink_plus, cluster_plus,
      hdev_plus, vdev_plus, missfire_plus, close_pct_plus
    FROM pitcher_season_command
    WHERE pitcher IN (${ids.join(',')})${yearClause}
  `
  const decSql = `
    SELECT pitcher, pitches, deception_score, unique_score
    FROM pitcher_season_deception
    WHERE pitcher IN (${ids.join(',')})${yearClause}
  `
  const [{ data, error }, decRes] = await Promise.all([q(sql), q(decSql)])
  if (error) throw new Error(error.message)
  // Rows are per pitch type per year; pivotTritonRows pitch-weights them into
  // one line per pitcher, which is the documented season-level aggregation.
  const map = pivotTritonRows((data || []) as Record<string, unknown>[]) as unknown as Map<
    number,
    Record<string, number | null>
  >

  // Deception the same way: pitch-weighted across pitch types and years.
  const acc = new Map<number, { ds: number; dw: number; us: number; uw: number }>()
  for (const row of (decRes.data || []) as Record<string, unknown>[]) {
    const id = Number(row.pitcher)
    const n = Number(row.pitches) || 0
    const a = acc.get(id) || { ds: 0, dw: 0, us: 0, uw: 0 }
    if (row.deception_score != null) { a.ds += Number(row.deception_score) * n; a.dw += n }
    if (row.unique_score != null) { a.us += Number(row.unique_score) * n; a.uw += n }
    acc.set(id, a)
  }
  for (const [id, a] of acc) {
    const bag = map.get(id) || {}
    bag.deception_score = a.dw > 0 ? Math.round((a.ds / a.dw) * 10) / 10 : null
    bag.unique_score = a.uw > 0 ? Math.round((a.us / a.uw) * 10) / 10 : null
    map.set(id, bag)
  }
  return map
}

// ── Per-pitch-type rows (Arsenal / vs Pitch Type) ───────────────────────────

/**
 * The Overview page's Arsenal (pitchers) or vs-Pitch-Type (hitters) table,
 * per player. Statcast columns come straight from the shared METRICS
 * expressions; the pitcher variant adds avg Stuff+ from `pitches` and
 * pitch-weighted Brink/Cluster (+plus) from pitcher_season_command.
 */
async function fetchByPitch(
  group: CompareGroup,
  ids: number[],
  window: TimeWindow,
): Promise<Map<number, Record<string, unknown>[]>> {
  const idCol = group === 'hitting' ? 'batter' : 'pitcher'
  const yearClause = dateClause(window)
  const shareAlias = group === 'hitting' ? 'faced_pct' : 'usage_pct'

  const statCols = group === 'hitting'
    ? `${METRICS.avg_velo} AS avg_velo, ${METRICS.whiff_pct} AS whiff_pct, ${METRICS.ba} AS ba,
       ${METRICS.avg_ev} AS avg_ev, ${METRICS.max_ev} AS max_ev, ${METRICS.avg_la} AS avg_la,
       ${METRICS.avg_xba} AS avg_xba, ${METRICS.avg_xwoba} AS avg_xwoba`
    : `${METRICS.avg_velo} AS avg_velo, ${METRICS.max_velo} AS max_velo, ${METRICS.avg_spin} AS avg_spin,
       ${METRICS.avg_hbreak_in} AS hb, ${METRICS.avg_ivb_in} AS ivb,
       ${METRICS.avg_ext} AS ext, ${METRICS.avg_arm_angle} AS arm_angle,
       ${METRICS.whiff_pct} AS whiff_pct, ${METRICS.cs_pct} AS cs_pct,
       ${METRICS.avg_ev} AS avg_ev, ${METRICS.avg_xba} AS avg_xba,
       ROUND(AVG(release_pos_z)::numeric, 2) AS rel_h, ROUND(AVG(release_pos_x)::numeric, 2) AS rel_s,
       ROUND(AVG(stuff_plus)::numeric, 0) AS stuff_plus`

  const sql = `
    SELECT ${idCol} AS player_id, pitch_name, COUNT(*) AS count,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY ${idCol}), 1) AS ${shareAlias},
      ${statCols}
    FROM pitches
    WHERE ${idCol} IN (${ids.join(',')}) AND COALESCE(pitch_type, '') NOT IN ('PO','IN')
      AND pitch_name IS NOT NULL${yearClause}
    GROUP BY ${idCol}, pitch_name
    ORDER BY ${idCol}, count DESC
  `

  const cmdSql = group === 'pitching'
    ? `SELECT pitcher, pitch_name, pitches, avg_brink, avg_cluster, brink_plus, cluster_plus
       FROM pitcher_season_command
       WHERE pitcher IN (${ids.join(',')})${seasonClause(window, 'game_year')}`
    : null

  const [rowsRes, cmdRes] = await Promise.all([q(sql), cmdSql ? q(cmdSql) : Promise.resolve({ data: null, error: null })])
  if (rowsRes.error) throw new Error(rowsRes.error.message)

  // Command rows are per year; pitch-weight them into one line per
  // (pitcher, pitch_name) — same aggregation as pivotTritonRows, per pitch.
  const cmd = new Map<string, { bs: number; bw: number; cs: number; cw: number; bps: number; bpw: number; cps: number; cpw: number }>()
  for (const row of ((cmdRes.data || []) as Record<string, unknown>[])) {
    const key = `${row.pitcher}|${row.pitch_name}`
    const n = Number(row.pitches) || 0
    const a = cmd.get(key) || { bs: 0, bw: 0, cs: 0, cw: 0, bps: 0, bpw: 0, cps: 0, cpw: 0 }
    if (row.avg_brink != null) { a.bs += Number(row.avg_brink) * n; a.bw += n }
    if (row.avg_cluster != null) { a.cs += Number(row.avg_cluster) * n; a.cw += n }
    if (row.brink_plus != null) { a.bps += Number(row.brink_plus) * n; a.bpw += n }
    if (row.cluster_plus != null) { a.cps += Number(row.cluster_plus) * n; a.cpw += n }
    cmd.set(key, a)
  }

  const out = new Map<number, Record<string, unknown>[]>()
  for (const row of (rowsRes.data || []) as Record<string, unknown>[]) {
    const id = Number(row.player_id)
    const entry: Record<string, unknown> = { ...row }
    delete entry.player_id
    if (group === 'pitching') {
      const a = cmd.get(`${id}|${row.pitch_name}`)
      entry.brink = a && a.bw > 0 ? Math.round((a.bs / a.bw) * 10) / 10 : null
      entry.cluster = a && a.cw > 0 ? Math.round((a.cs / a.cw) * 10) / 10 : null
      entry.brink_plus = a && a.bpw > 0 ? Math.round(a.bps / a.bpw) : null
      entry.cluster_plus = a && a.cpw > 0 ? Math.round(a.cps / a.cpw) : null
    }
    if (!out.has(id)) out.set(id, [])
    out.get(id)!.push(entry)
  }
  return out
}

// ── Pitch view: one pitch type, pitcher vs pitcher ──────────────────────────

/**
 * Pitch-level line for the selected pitch type: physical traits, results,
 * and avg Stuff+, one row per pitcher. Usage% is the pitch's share of the
 * pitcher's total (non-PO/IN) pitches in the same window.
 */
async function fetchPitchLevel(
  ids: number[],
  window: TimeWindow,
  pitchType: string,
): Promise<Map<number, Record<string, number | null>>> {
  const w = dateClause(window)
  const sql = `
    WITH tot AS (
      SELECT pitcher, COUNT(*) AS n
      FROM pitches
      WHERE pitcher IN (${ids.join(',')}) AND COALESCE(pitch_type, '') NOT IN ('PO','IN')${w}
      GROUP BY pitcher
    )
    SELECT p.pitcher, COUNT(*) AS count,
      ROUND(100.0 * COUNT(*) / MAX(tot.n), 1) AS usage_pct,
      ${METRICS.avg_velo} AS avg_velo, ${METRICS.max_velo} AS max_velo, ${METRICS.avg_spin} AS avg_spin,
      ${METRICS.avg_ivb_in} AS ivb, ${METRICS.avg_hbreak_in} AS hb,
      ${METRICS.avg_ext} AS ext, ${METRICS.avg_arm_angle} AS arm_angle,
      ROUND(AVG(release_pos_z)::numeric, 2) AS rel_h, ROUND(AVG(release_pos_x)::numeric, 2) AS rel_s,
      ${METRICS.whiff_pct} AS whiff_pct, ${METRICS.csw_pct} AS csw_pct, ${METRICS.cs_pct} AS cs_pct,
      ${METRICS.chase_pct} AS chase_pct, ${METRICS.zone_pct} AS zone_pct,
      ${METRICS.ba} AS ba, ${METRICS.slg} AS slg, ${METRICS.avg_woba} AS avg_woba,
      ${METRICS.avg_xwoba} AS avg_xwoba, ${METRICS.avg_ev} AS avg_ev,
      ${METRICS.hard_hit_pct} AS hard_hit_pct, ${METRICS.barrel_pct} AS barrel_pct,
      ROUND(AVG(stuff_plus)::numeric, 0) AS stuff_plus
    FROM pitches p
    JOIN tot ON tot.pitcher = p.pitcher
    WHERE p.pitcher IN (${ids.join(',')}) AND p.pitch_type = '${pitchType}'${w.replace(/game_/g, 'p.game_')}
    GROUP BY p.pitcher
  `
  const { data, error } = await q(sql)
  if (error) throw new Error(error.message)
  const out = new Map<number, Record<string, number | null>>()
  for (const row of (data || []) as Record<string, unknown>[]) {
    const bag: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(row)) {
      if (k !== 'pitcher') bag[k] = num(v)
    }
    out.set(Number(row.pitcher), bag)
  }
  return out
}

/**
 * Command + deception for one pitch type: the season tables' rows for that
 * pitch, pitch-weighted across the window's years (same aggregation as the
 * arsenal band, narrowed to one pitch).
 */
async function fetchPitchTriton(
  ids: number[],
  window: TimeWindow,
  pitchType: string,
  pitchName: string,
): Promise<Map<number, Record<string, number | null>>> {
  const esc = pitchName.replace(/'/g, "''")
  const [cmdRes, decRes] = await Promise.all([
    q(`SELECT pitcher, pitches, avg_brink, avg_cluster, brink_plus, cluster_plus
       FROM pitcher_season_command
       WHERE pitcher IN (${ids.join(',')}) AND pitch_name = '${esc}'${seasonClause(window, 'game_year')}`),
    q(`SELECT pitcher, pitches, deception_score, unique_score
       FROM pitcher_season_deception
       WHERE pitcher IN (${ids.join(',')}) AND pitch_type = '${pitchType}'${seasonClause(window, 'game_year')}`),
  ])

  const acc = new Map<number, Record<string, { s: number; w: number }>>()
  const add = (id: number, key: string, val: unknown, n: number) => {
    if (val == null) return
    const bags = acc.get(id) || {}
    const a = bags[key] || { s: 0, w: 0 }
    a.s += Number(val) * n
    a.w += n
    bags[key] = a
    acc.set(id, bags)
  }
  for (const row of (cmdRes.data || []) as Record<string, unknown>[]) {
    const id = Number(row.pitcher)
    const n = Number(row.pitches) || 0
    add(id, 'brink', row.avg_brink, n)
    add(id, 'cluster', row.avg_cluster, n)
    add(id, 'brink_plus', row.brink_plus, n)
    add(id, 'cluster_plus', row.cluster_plus, n)
  }
  for (const row of (decRes.data || []) as Record<string, unknown>[]) {
    const id = Number(row.pitcher)
    const n = Number(row.pitches) || 0
    add(id, 'deception_score', row.deception_score, n)
    add(id, 'unique_score', row.unique_score, n)
  }

  const out = new Map<number, Record<string, number | null>>()
  for (const [id, bags] of acc) {
    const bag: Record<string, number | null> = {}
    for (const [k, a] of Object.entries(bags)) {
      const precision = k.endsWith('_plus') ? 1 : 10
      bag[k] = a.w > 0 ? Math.round((a.s / a.w) * precision) / precision : null
    }
    out.set(id, bag)
  }
  return out
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const group: CompareGroup =
      body.group === 'pitching' ? 'pitching' : body.group === 'pitch' ? 'pitch' : 'hitting'

    // Pitch view: pitchers compared on one pitch type. Statcast/Triton only —
    // there is no official box-score line or award for a single pitch.
    const pitch = group === 'pitch' ? PITCH_TYPES.find(pt => pt.code === body.pitchType) : null
    if (group === 'pitch' && !pitch) {
      return NextResponse.json({ error: 'valid pitchType required for pitch group' }, { status: 400 })
    }
    const scope = body.scope === 'season' ? 'season' : body.scope === 'range' ? 'range' : 'career'

    const parseSeason = (v: unknown): number | null => {
      const n = parseInt(String(v ?? ''), 10)
      return !isNaN(n) && n >= 1876 && n <= 2100 ? n : null
    }
    const parseDate = (v: unknown): string | null =>
      /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null

    /** Global window from scope; per-player overrides may replace it below. */
    const buildWindow = (season: unknown, from: unknown, to: unknown): TimeWindow | null => {
      if (scope === 'season') {
        const y = parseSeason(season)
        return y == null ? null : { season: y, from: null, to: null }
      }
      if (scope === 'range') {
        const f = parseDate(from)
        const t = parseDate(to)
        return f && t && f <= t ? { season: null, from: f, to: t } : null
      }
      return CAREER
    }

    const globalWindow = buildWindow(body.season, body.dateFrom, body.dateTo)
    if (!globalWindow) {
      return NextResponse.json(
        { error: scope === 'season' ? 'season required for season scope' : 'valid dateFrom/dateTo required for range scope' },
        { status: 400 },
      )
    }

    const sources = new Set<CompareSource>(
      (Array.isArray(body.sources) ? body.sources : ['lahman', 'statcast', 'awards', 'triton'])
        .filter((s: string): s is CompareSource =>
          s === 'lahman' || s === 'statcast' || s === 'triton' || s === 'awards'),
    )
    if (group === 'hitting') sources.delete('triton') // pitchers only
    if (group === 'pitch') { sources.delete('lahman'); sources.delete('awards') }
    const wantByPitch = body.byPitch === true

    const rawPlayers = Array.isArray(body.players) ? body.players.slice(0, MAX_PLAYERS) : []
    const players: PlayerInput[] = rawPlayers.map((p: Record<string, unknown>) => {
      const mlb = parseInt(String(p?.mlbId ?? ''), 10)
      // Individual mode: a player may carry their own season or date pair,
      // interpreted under the same scope; anything invalid falls back to the
      // global window rather than erroring the whole comparison.
      const own = buildWindow(p?.season, p?.dateFrom, p?.dateTo)
      return {
        mlbId: isNaN(mlb) ? null : mlb,
        lahmanId: safeLahmanId(p?.lahmanId),
        window: own ?? globalWindow,
      }
    })
    if (players.length === 0) return NextResponse.json({ players: [] })
    if (players.some(p => p.mlbId == null && p.lahmanId == null)) {
      return NextResponse.json({ error: 'each player needs an mlbId or a lahmanId' }, { status: 400 })
    }

    // ── Identity: lahman_people is the crosswalk. `players.lahman_id` is
    // populated on only ~19% of rows, so resolve from this side instead.
    const mlbIds = players.map(p => p.mlbId).filter((n): n is number => n != null)
    const lahmanIds = players.map(p => p.lahmanId).filter((s): s is string => s != null)
    const idConds = [
      lahmanIds.length ? `lahman_id IN (${lahmanIds.map(i => `'${i}'`).join(',')})` : null,
      mlbIds.length ? `mlb_id IN (${mlbIds.join(',')})` : null,
    ].filter(Boolean)

    const peopleRes = await q(`
      SELECT lahman_id, mlb_id, name_first, name_last, debut, final_game
      FROM lahman_people WHERE ${idConds.join(' OR ')}
    `)
    if (peopleRes.error) {
      return NextResponse.json({ error: peopleRes.error.message }, { status: 500 })
    }
    const byLahman = new Map<string, Record<string, unknown>>()
    const byMlb = new Map<number, Record<string, unknown>>()
    for (const row of (peopleRes.data || []) as Record<string, unknown>[]) {
      byLahman.set(String(row.lahman_id), row)
      if (row.mlb_id != null) byMlb.set(Number(row.mlb_id), row)
    }

    // Resolve each input to both ids where possible. A 2026 rookie may have no
    // Lahman row at all; a pre-integration player may have no MLBAM id.
    const resolved = players.map(p => {
      const person = (p.lahmanId && byLahman.get(p.lahmanId)) || (p.mlbId != null && byMlb.get(p.mlbId)) || null
      return {
        mlbId: p.mlbId ?? (person?.mlb_id != null ? Number(person.mlb_id) : null),
        lahmanId: p.lahmanId ?? (person ? String(person.lahman_id) : null),
        person,
      }
    })

    // Players with no Lahman row still get a name from the Statcast roster.
    const needName = resolved.filter(r => !r.person && r.mlbId != null).map(r => r.mlbId as number)
    const nameByMlb = new Map<number, string>()
    if (needName.length) {
      const { data } = await q(`SELECT id, name FROM players WHERE id IN (${needName.join(',')})`)
      for (const row of (data || []) as Record<string, unknown>[]) {
        nameByMlb.set(Number(row.id), String(row.name))
      }
    }

    const activeMlbIds = [...new Set(resolved.map(r => r.mlbId).filter((n): n is number => n != null))]

    // ── Fetch per unique time window. Global mode is one window (one batch of
    // queries, as before); individual mode runs a batch per distinct window.
    // Results stay keyed per window so the same player can appear in the
    // comparison twice with two different windows — the columns must not
    // share (or clobber) each other's numbers.
    interface WindowResults {
      lahman: Map<string, Record<string, number | null>>
      awards: Map<string, Record<string, number | boolean>>
      statcast: Map<number, Record<string, number | null>>
      triton: Map<number, Record<string, number | null>>
      team: Map<string, string>
      byPitch: Map<number, Record<string, unknown>[]>
      official: Map<number, Record<string, number | null>>
    }
    const resultsByWindow = new Map<string, WindowResults>()

    const windows = new Map<string, { window: TimeWindow; lahmanIds: string[]; mlbIds: number[] }>()
    resolved.forEach((r, i) => {
      const w = players[i].window
      const key = windowKey(w)
      const g = windows.get(key) || { window: w, lahmanIds: [], mlbIds: [] }
      if (r.lahmanId && !g.lahmanIds.includes(r.lahmanId)) g.lahmanIds.push(r.lahmanId)
      if (r.mlbId != null && !g.mlbIds.includes(r.mlbId)) g.mlbIds.push(r.mlbId)
      windows.set(key, g)
    })

    const peoplePromise = activeMlbIds.length
      ? fetchPeople(activeMlbIds)
      : Promise.resolve(new Map<number, { team: string | null; debut: string | null; active: boolean }>())

    await Promise.all([...windows.entries()].map(async ([key, { window: w, lahmanIds: lIds, mlbIds: mIds }]) => {
      const empty = <K, V>() => Promise.resolve(new Map<K, V>())
      const [lahman, awards, statcast, triton, team, byPitch, official] = await Promise.all([
        sources.has('lahman') && lIds.length ? fetchLahman(group, lIds, w) : empty<string, Record<string, number | null>>(),
        sources.has('awards') && lIds.length ? fetchAwards(lIds, w) : empty<string, Record<string, number | boolean>>(),
        sources.has('statcast') && mIds.length
          ? (pitch ? fetchPitchLevel(mIds, w, pitch.code) : fetchStatcast(group, mIds, w))
          : empty<number, Record<string, number | null>>(),
        sources.has('triton') && mIds.length
          ? (pitch ? fetchPitchTriton(mIds, w, pitch.code, pitch.name) : group === 'pitching' ? fetchTriton(mIds, w) : empty<number, Record<string, number | null>>())
          : empty<number, Record<string, number | null>>(),
        lIds.length ? fetchLastTeams(group === 'hitting' ? 'hitting' : 'pitching', lIds, w) : empty<string, string>(),
        wantByPitch && mIds.length ? fetchByPitch(group, mIds, w) : empty<number, Record<string, unknown>[]>(),
        sources.has('lahman') && mIds.length ? fetchOfficial(group, mIds, w) : empty<number, Record<string, number | null>>(),
      ])
      resultsByWindow.set(key, { lahman, awards, statcast, triton, team, byPitch, official })
    }))

    const peopleMap = await peoplePromise

    const payload: ComparePlayerPayload[] = resolved.map((r, i) => {
      const wr = resultsByWindow.get(windowKey(players[i].window))
      const person = r.person
      const bio = r.mlbId != null ? peopleMap.get(r.mlbId) : undefined
      const name = person
        ? `${person.name_first ?? ''} ${person.name_last ?? ''}`.trim()
        : (r.mlbId != null ? nameByMlb.get(r.mlbId) ?? null : null)

      // The official line: statsapi (always current, all of history) wins
      // field by field; the Lahman sums fill anything it lacks, and carry
      // players with no MLBAM id entirely.
      const lahmanBag = (r.lahmanId && wr?.lahman.get(r.lahmanId)) || null
      const officialBag = (r.mlbId != null && wr?.official.get(r.mlbId)) || null
      let official: Record<string, number | null> | null = lahmanBag
      if (officialBag) {
        const merged: Record<string, number | null> = { ...(lahmanBag || {}) }
        for (const [k, v] of Object.entries(officialBag)) {
          if (v != null) merged[k] = v
        }
        official = merged
      }

      return {
        mlbId: r.mlbId,
        lahmanId: r.lahmanId,
        name: name || null,
        debut: person?.debut ? String(person.debut) : bio?.debut ?? null,
        finalGame: bio?.active ? null : person?.final_game ? String(person.final_game) : null,
        active: bio?.active ?? false,
        team: bio?.team || (r.lahmanId && wr?.team.get(r.lahmanId)) || null,
        lahman: official,
        statcast: (r.mlbId != null && wr?.statcast.get(r.mlbId)) || null,
        triton: (r.mlbId != null && wr?.triton.get(r.mlbId)) || null,
        awards: (r.lahmanId && wr?.awards.get(r.lahmanId)) || null,
        byPitch: (r.mlbId != null && wr?.byPitch.get(r.mlbId)) || null,
      }
    })

    return NextResponse.json({ players: payload, group, scope })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Compare failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
