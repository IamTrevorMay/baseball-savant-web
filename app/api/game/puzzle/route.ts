import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SEASON_CONSTANTS } from '@/lib/constants-data'
import {
  PITCHER_TIERS, HITTER_TIERS,
  dailyPlayerIndex, pickStats, TIER_LABELS, leagueForTeam, gameDay, secondsUntilReset,
  type StatDef,
} from '@/lib/gameConstants'

const supabaseGame = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { global: { fetch: (input, init?) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(120000) }) } }
)

const cache = new Map<string, { data: PuzzleResponse; ts: number }>()

interface StatResult { key: string; label: string; value: number; percentile: number; unit: string }
interface PuzzleResponse {
  tiers: { level: number; label: string; stats: StatResult[] }[]
  hints: { league: string; hand: string; team: string }
  answer: { id: number; name: string }
  pool: { id: number; name: string }[]
  poolSize: number
  date: string
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const year = parseInt(url.searchParams.get('year') || '2024')
  const type = url.searchParams.get('type') || 'pitcher'
  if (![...Object.keys(SEASON_CONSTANTS)].map(Number).includes(year))
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  if (type !== 'pitcher' && type !== 'hitter')
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const dateStr = gameDay()
  const cacheKey = `${year}-${type}-${dateStr}`

  const ttl = secondsUntilReset()
  const cacheHeaders = { 'Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=60` }

  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < 3600_000) {
    return NextResponse.json(cached.data, { headers: cacheHeaders })
  }

  try {
    const data = type === 'pitcher'
      ? await buildPitcherPuzzle(year, dateStr)
      : await buildHitterPuzzle(year, dateStr)
    cache.set(cacheKey, { data, ts: Date.now() })
    for (const [k, v] of cache) { if (Date.now() - v.ts > 86400_000) cache.delete(k) }
    return NextResponse.json(data, { headers: cacheHeaders })
  } catch (e: unknown) {
    console.error('Puzzle API error:', e)
    return NextResponse.json({ error: 'Failed to build puzzle' }, { status: 500 })
  }
}

// ══════════════════════════════════════════
//  PITCHER PUZZLE (30 stats)
// ══════════════════════════════════════════
async function buildPitcherPuzzle(year: number, dateStr: string): Promise<PuzzleResponse> {
  const sc = SEASON_CONSTANTS[year] || SEASON_CONSTANTS[2024]

  const rawSub = `(
    SELECT
      pitcher AS player_id, player_name,
      MODE() WITHIN GROUP (ORDER BY p_throws) AS hand,
      MODE() WITHIN GROUP (ORDER BY CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END) AS team,
      CASE WHEN COUNT(DISTINCT CASE WHEN inning = 1 THEN game_pk END)::numeric / NULLIF(COUNT(DISTINCT game_pk), 0) > 0.5 THEN 'SP' ELSE 'RP' END AS role,
      -- T1: fb_hb, gb_pct, arm_angle, xba_against, first_strike_pct + traditional stats
      AVG(CASE WHEN pitch_type IN ('FF','SI','FC') THEN ABS(pfx_x) * 12 END) AS fb_hb,
      100.0 * COUNT(*) FILTER (WHERE bb_type = 'ground_ball') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0) AS gb_pct,
      AVG(CASE WHEN arm_angle IS NOT NULL THEN arm_angle END) AS arm_angle,
      AVG(estimated_ba_using_speedangle) AS xba_against,
      100.0 * COUNT(*) FILTER (WHERE pitch_number = 1 AND (zone BETWEEN 1 AND 9 OR description IN ('called_strike','swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt'))) / NULLIF(COUNT(*) FILTER (WHERE pitch_number = 1), 0) AS first_strike_pct,
      -- T2: fb_spin, fb_ivb, extension, zone_pct, breaking_spin, fb_usage_pct
      AVG(CASE WHEN pitch_type IN ('FF','SI') THEN release_spin_rate END) AS fb_spin,
      AVG(CASE WHEN pitch_type IN ('FF','SI') THEN pfx_z * 12 END) AS fb_ivb,
      AVG(release_extension) AS extension,
      100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9) / NULLIF(COUNT(*), 0) AS zone_pct,
      AVG(CASE WHEN pitch_type IN ('SL','CU','SW','KC','ST','SV') THEN release_spin_rate END) AS breaking_spin,
      100.0 * COUNT(*) FILTER (WHERE pitch_type IN ('FF','SI')) / NULLIF(COUNT(*), 0) AS fb_usage_pct,
      -- T3: csw_pct, chase_rate, avg_ev_against, swstr_pct, put_away_pct, contact_pct_against
      100.0 * COUNT(*) FILTER (WHERE description IN ('called_strike','swinging_strike','swinging_strike_blocked','foul_tip','missed_bunt')) / NULLIF(COUNT(*), 0) AS csw_pct,
      100.0 * COUNT(*) FILTER (WHERE zone > 9 AND description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','hit_into_play_no_out','hit_into_play_score')) / NULLIF(COUNT(*) FILTER (WHERE zone > 9), 0) AS chase_rate,
      AVG(CASE WHEN launch_speed IS NOT NULL THEN launch_speed END) AS avg_ev_against,
      100.0 * COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked')) / NULLIF(COUNT(*), 0) AS swstr_pct,
      100.0 * COUNT(DISTINCT CASE WHEN strikes = 2 AND events = 'strikeout' THEN CONCAT(game_pk, at_bat_number) END) / NULLIF(COUNT(DISTINCT CASE WHEN strikes = 2 AND events IS NOT NULL THEN CONCAT(game_pk, at_bat_number) END), 0) AS put_away_pct,
      100.0 * COUNT(*) FILTER (WHERE description IN ('foul','foul_tip','foul_bunt','hit_into_play','hit_into_play_no_out','hit_into_play_score')) / NULLIF(COUNT(*) FILTER (WHERE description IN ('foul','foul_tip','foul_bunt','hit_into_play','hit_into_play_no_out','hit_into_play_score','swinging_strike','swinging_strike_blocked','swinging_pitchout','foul_pitchout')), 0) AS contact_pct_against,
      -- T4: whiff_pct, barrel_pct_against, hard_hit_pct_against, fip(computed), xwoba_against, babip_against
      100.0 * COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','foul_tip')) / NULLIF(COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','foul_tip','foul','foul_bunt','hit_into_play','hit_into_play_no_out','hit_into_play_score','foul_pitchout','swinging_pitchout')), 0) AS whiff_pct,
      100.0 * COUNT(*) FILTER (WHERE launch_speed_angle = 6) / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL AND launch_angle IS NOT NULL), 0) AS barrel_pct_against,
      100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95) / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0) AS hard_hit_pct_against,
      AVG(estimated_woba_using_speedangle) AS xwoba_against,
      COUNT(DISTINCT CASE WHEN events IN ('single','double','triple') THEN CONCAT(game_pk, at_bat_number) END)::numeric / NULLIF(COUNT(DISTINCT CASE WHEN events IN ('single','double','triple','field_out','grounded_into_double_play','force_out','fielders_choice','fielders_choice_out','sac_fly','field_error','double_play') THEN CONCAT(game_pk, at_bat_number) END), 0) AS babip_against,
      -- T5: fb_velo, k_pct, bb_pct, xera(computed), k_minus_bb(computed), avg_velo
      AVG(CASE WHEN pitch_type IN ('FF','SI') THEN release_speed END) AS fb_velo,
      100.0 * COUNT(DISTINCT CASE WHEN events = 'strikeout' THEN CONCAT(game_pk, at_bat_number) END) / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, at_bat_number) END), 0) AS k_pct,
      100.0 * COUNT(DISTINCT CASE WHEN events = 'walk' THEN CONCAT(game_pk, at_bat_number) END) / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, at_bat_number) END), 0) AS bb_pct,
      AVG(release_speed) AS avg_velo,
      -- FIP/xERA components
      COUNT(DISTINCT CASE WHEN events = 'home_run' THEN CONCAT(game_pk, at_bat_number) END) AS hr,
      COUNT(DISTINCT CASE WHEN events IN ('walk','hit_by_pitch') THEN CONCAT(game_pk, at_bat_number) END) AS bb_hbp,
      COUNT(DISTINCT CASE WHEN events = 'strikeout' THEN CONCAT(game_pk, at_bat_number) END) AS k,
      COUNT(DISTINCT CASE WHEN events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','catcher_interf','sac_bunt','sac_fly') THEN CONCAT(game_pk, at_bat_number) END) / 3.0 AS ip_est,
      COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, at_bat_number) END) AS pa,
      AVG(estimated_woba_using_speedangle) AS xwoba_val,
      COUNT(DISTINCT CASE WHEN events = 'walk' THEN CONCAT(game_pk, at_bat_number) END) AS walks_count,
      COUNT(DISTINCT CASE WHEN events IN ('single','double','triple','home_run') THEN CONCAT(game_pk, at_bat_number) END) AS hits_count
    FROM pitches
    WHERE game_year = ${year} AND pitch_type NOT IN ('PO','IN')
    GROUP BY pitcher, player_name
    HAVING COUNT(*) >= 500
  ) raw_q`

  const computedSub = `(
    SELECT raw_q.*,
      CASE WHEN raw_q.ip_est > 0 THEN (13.0 * raw_q.hr + 3.0 * raw_q.bb_hbp - 2.0 * raw_q.k) / raw_q.ip_est + ${sc.cfip} ELSE NULL END AS fip,
      CASE WHEN raw_q.ip_est > 0 AND raw_q.xwoba_val IS NOT NULL THEN ((COALESCE(raw_q.xwoba_val, ${sc.woba}) - ${sc.woba}) / ${sc.woba_scale}) * (raw_q.pa / raw_q.ip_est) * 9.0 + ${sc.lg_era} ELSE NULL END AS xera,
      raw_q.k_pct - raw_q.bb_pct AS k_minus_bb,
      raw_q.walks_count AS walks,
      raw_q.hr AS hr_allowed,
      CASE WHEN raw_q.ip_est > 0 THEN (raw_q.walks_count + raw_q.hits_count) / raw_q.ip_est ELSE NULL END AS whip,
      CASE WHEN raw_q.ip_est > 0 THEN (raw_q.k * 9.0) / raw_q.ip_est ELSE NULL END AS k_per_9
    FROM ${rawSub}
  ) comp_q`

  // All 30 stat columns + 30 percentile columns
  const statKeys = [
    'fb_hb','gb_pct','arm_angle','xba_against','first_strike_pct','walks','hr_allowed','whip','k_per_9',
    'fb_spin','fb_ivb','extension','zone_pct','breaking_spin','fb_usage_pct',
    'csw_pct','chase_rate','avg_ev_against','swstr_pct','put_away_pct','contact_pct_against',
    'whiff_pct','barrel_pct_against','hard_hit_pct_against','fip','xwoba_against','babip_against',
    'fb_velo','k_pct','bb_pct','xera','k_minus_bb','avg_velo',
  ]
  const invertSet = new Set(['xba_against','avg_ev_against','contact_pct_against','barrel_pct_against','hard_hit_pct_against','fip','xwoba_against','babip_against','bb_pct','xera','walks','hr_allowed','whip'])

  const selectCols = statKeys.map(k => `comp_q.${k}`).join(', ')
  const pctlCols = statKeys.map(k => {
    const expr = k === 'fb_hb' ? `ABS(comp_q.${k})` : `comp_q.${k}`
    const inv = invertSet.has(k)
    return inv
      ? `ROUND((1 - PERCENT_RANK() OVER (ORDER BY ${expr}))::numeric * 100) AS ${k}_pctl`
      : `ROUND(PERCENT_RANK() OVER (ORDER BY ${expr})::numeric * 100) AS ${k}_pctl`
  }).join(',\n  ')

  const sql = `SELECT comp_q.player_id, comp_q.player_name, comp_q.hand, comp_q.team, comp_q.role,
  ${selectCols},
  ${pctlCols}
FROM ${computedSub}
ORDER BY comp_q.player_id`

  const { data, error } = await supabaseGame.rpc('run_query', { query_text: sql.trim() })
  if (error) throw error
  if (!data || data.length === 0) throw new Error('No qualified pitchers found')

  const pool = data as Record<string, unknown>[]
  const poolList = pool.map(p => ({ id: p.player_id as number, name: p.player_name as string, role: p.role as string }))
  const idx = dailyPlayerIndex(dateStr, year, 'pitcher', pool.length)
  const player = pool[idx]

  return { ...buildResponse(player, pool.length, dateStr, year, 'pitcher', PITCHER_TIERS), pool: poolList }
}

// ══════════════════════════════════════════
//  HITTER PUZZLE (30 stats)
// ══════════════════════════════════════════
async function buildHitterPuzzle(year: number, dateStr: string): Promise<PuzzleResponse> {
  const rawSub = `(
    SELECT
      p.batter AS player_id, pl.name AS player_name,
      CASE WHEN COUNT(DISTINCT p.stand) > 1 THEN 'S' ELSE MODE() WITHIN GROUP (ORDER BY p.stand) END AS hand,
      MODE() WITHIN GROUP (ORDER BY CASE WHEN p.inning_topbot = 'Top' THEN p.away_team ELSE p.home_team END) AS team,
      COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN CONCAT(p.game_pk, p.at_bat_number) END) AS pa,
      -- T1: gb_pct, fb_pct, pull_pct, oppo_pct, ld_pct, popup_pct
      100.0 * COUNT(*) FILTER (WHERE p.bb_type = 'ground_ball') / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0) AS gb_pct,
      100.0 * COUNT(*) FILTER (WHERE p.bb_type = 'fly_ball') / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0) AS fb_pct,
      100.0 * COUNT(*) FILTER (WHERE p.hc_x IS NOT NULL AND ((p.stand = 'L' AND DEGREES(ATAN2(p.hc_x - 125.42, 198.27 - p.hc_y)) > 15) OR (p.stand = 'R' AND DEGREES(ATAN2(p.hc_x - 125.42, 198.27 - p.hc_y)) < -15))) / NULLIF(COUNT(*) FILTER (WHERE p.hc_x IS NOT NULL), 0) AS pull_pct,
      100.0 * COUNT(*) FILTER (WHERE p.hc_x IS NOT NULL AND ((p.stand = 'L' AND DEGREES(ATAN2(p.hc_x - 125.42, 198.27 - p.hc_y)) < -15) OR (p.stand = 'R' AND DEGREES(ATAN2(p.hc_x - 125.42, 198.27 - p.hc_y)) > 15))) / NULLIF(COUNT(*) FILTER (WHERE p.hc_x IS NOT NULL), 0) AS oppo_pct,
      100.0 * COUNT(*) FILTER (WHERE p.bb_type = 'line_drive') / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0) AS ld_pct,
      100.0 * COUNT(*) FILTER (WHERE p.bb_type = 'popup') / NULLIF(COUNT(*) FILTER (WHERE p.bb_type IS NOT NULL), 0) AS popup_pct,
      -- T2: sweet_spot_pct, zone_contact_pct, hr_fb_pct, contact_pct, z_swing_pct, pitch_per_pa
      100.0 * COUNT(*) FILTER (WHERE p.launch_angle BETWEEN 8 AND 32) / NULLIF(COUNT(*) FILTER (WHERE p.launch_angle IS NOT NULL), 0) AS sweet_spot_pct,
      100.0 * COUNT(*) FILTER (WHERE p.zone BETWEEN 1 AND 9 AND p.description IN ('foul','foul_tip','hit_into_play','hit_into_play_no_out','hit_into_play_score')) / NULLIF(COUNT(*) FILTER (WHERE p.zone BETWEEN 1 AND 9 AND p.description IN ('foul','foul_tip','hit_into_play','hit_into_play_no_out','hit_into_play_score','swinging_strike','swinging_strike_blocked','foul_bunt','swinging_pitchout')), 0) AS zone_contact_pct,
      100.0 * COUNT(DISTINCT CASE WHEN p.events = 'home_run' THEN CONCAT(p.game_pk, p.at_bat_number) END) / NULLIF(COUNT(*) FILTER (WHERE p.bb_type = 'fly_ball'), 0) AS hr_fb_pct,
      100.0 * COUNT(*) FILTER (WHERE p.description IN ('foul','foul_tip','foul_bunt','hit_into_play','hit_into_play_no_out','hit_into_play_score')) / NULLIF(COUNT(*) FILTER (WHERE p.description IN ('foul','foul_tip','foul_bunt','hit_into_play','hit_into_play_no_out','hit_into_play_score','swinging_strike','swinging_strike_blocked','swinging_pitchout','foul_pitchout')), 0) AS contact_pct,
      100.0 * COUNT(*) FILTER (WHERE p.zone BETWEEN 1 AND 9 AND p.description IN ('foul','foul_tip','foul_bunt','hit_into_play','hit_into_play_no_out','hit_into_play_score','swinging_strike','swinging_strike_blocked')) / NULLIF(COUNT(*) FILTER (WHERE p.zone BETWEEN 1 AND 9), 0) AS z_swing_pct,
      COUNT(*)::numeric / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN CONCAT(p.game_pk, p.at_bat_number) END), 0) AS pitch_per_pa,
      -- T3: xba, sprint_speed(joined), whiff_pct, chase_rate, o_swing_pct, babip
      AVG(p.estimated_ba_using_speedangle) AS xba,
      100.0 * COUNT(*) FILTER (WHERE p.description IN ('swinging_strike','swinging_strike_blocked','foul_tip')) / NULLIF(COUNT(*) FILTER (WHERE p.description IN ('swinging_strike','swinging_strike_blocked','foul_tip','foul','foul_bunt','hit_into_play','hit_into_play_no_out','hit_into_play_score','foul_pitchout','swinging_pitchout')), 0) AS whiff_pct,
      100.0 * COUNT(*) FILTER (WHERE p.zone > 9 AND p.description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','hit_into_play_no_out','hit_into_play_score')) / NULLIF(COUNT(*) FILTER (WHERE p.zone > 9), 0) AS chase_rate,
      100.0 * COUNT(*) FILTER (WHERE p.zone > 9 AND p.description IN ('foul','foul_tip','foul_bunt','hit_into_play','hit_into_play_no_out','hit_into_play_score','swinging_strike','swinging_strike_blocked')) / NULLIF(COUNT(*) FILTER (WHERE p.zone > 9), 0) AS o_swing_pct,
      COUNT(DISTINCT CASE WHEN p.events IN ('single','double','triple') THEN CONCAT(p.game_pk, p.at_bat_number) END)::numeric / NULLIF(COUNT(DISTINCT CASE WHEN p.events IN ('single','double','triple','field_out','grounded_into_double_play','force_out','fielders_choice','fielders_choice_out','sac_fly','field_error','double_play') THEN CONCAT(p.game_pk, p.at_bat_number) END), 0) AS babip,
      -- T4: barrel_pct, max_ev, xslg, hard_hit_pct, iso_x(computed), woba
      100.0 * COUNT(*) FILTER (WHERE p.launch_speed_angle = 6) / NULLIF(COUNT(*) FILTER (WHERE p.launch_speed IS NOT NULL AND p.launch_angle IS NOT NULL), 0) AS barrel_pct,
      MAX(p.launch_speed) AS max_ev,
      AVG(p.estimated_slg_using_speedangle) AS xslg,
      100.0 * COUNT(*) FILTER (WHERE p.launch_speed >= 95) / NULLIF(COUNT(*) FILTER (WHERE p.launch_speed IS NOT NULL), 0) AS hard_hit_pct,
      AVG(p.estimated_woba_using_speedangle) AS woba,
      -- T5: avg_ev, k_pct, bb_pct, xwoba, k_minus_bb(computed), hr_per_pa
      AVG(CASE WHEN p.launch_speed IS NOT NULL THEN p.launch_speed END) AS avg_ev,
      100.0 * COUNT(DISTINCT CASE WHEN p.events = 'strikeout' THEN CONCAT(p.game_pk, p.at_bat_number) END) / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN CONCAT(p.game_pk, p.at_bat_number) END), 0) AS k_pct,
      100.0 * COUNT(DISTINCT CASE WHEN p.events = 'walk' THEN CONCAT(p.game_pk, p.at_bat_number) END) / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN CONCAT(p.game_pk, p.at_bat_number) END), 0) AS bb_pct,
      AVG(p.estimated_woba_using_speedangle) AS xwoba,
      AVG(p.estimated_ba_using_speedangle) AS xba_for_iso,
      AVG(p.estimated_slg_using_speedangle) AS xslg_for_iso,
      100.0 * COUNT(DISTINCT CASE WHEN p.events = 'home_run' THEN CONCAT(p.game_pk, p.at_bat_number) END)::numeric / NULLIF(COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN CONCAT(p.game_pk, p.at_bat_number) END), 0) AS hr_per_pa,
      -- Traditional stat components
      COUNT(DISTINCT CASE WHEN p.events = 'single' THEN CONCAT(p.game_pk, p.at_bat_number) END) AS singles,
      COUNT(DISTINCT CASE WHEN p.events = 'double' THEN CONCAT(p.game_pk, p.at_bat_number) END) AS doubles,
      COUNT(DISTINCT CASE WHEN p.events = 'triple' THEN CONCAT(p.game_pk, p.at_bat_number) END) AS triples,
      COUNT(DISTINCT CASE WHEN p.events = 'home_run' THEN CONCAT(p.game_pk, p.at_bat_number) END) AS hr_count,
      COUNT(DISTINCT CASE WHEN p.events IS NOT NULL AND p.events NOT IN ('walk','hit_by_pitch','sac_bunt','sac_fly','catcher_interf') THEN CONCAT(p.game_pk, p.at_bat_number) END) AS ab,
      COUNT(DISTINCT CASE WHEN p.events IN ('walk','hit_by_pitch') THEN CONCAT(p.game_pk, p.at_bat_number) END) AS bb_hbp_count,
      COUNT(DISTINCT CASE WHEN p.events = 'sac_fly' THEN CONCAT(p.game_pk, p.at_bat_number) END) AS sf,
      SUM(CASE WHEN p.events IS NOT NULL THEN COALESCE(p.post_bat_score, 0) - COALESCE(p.bat_score, 0) ELSE 0 END) AS rbi_raw
    FROM pitches p
    JOIN players pl ON pl.id = p.batter
    WHERE p.game_year = ${year} AND p.pitch_type NOT IN ('PO','IN')
    GROUP BY p.batter, pl.name
    HAVING COUNT(DISTINCT CASE WHEN p.events IS NOT NULL THEN CONCAT(p.game_pk, p.at_bat_number) END) >= 200
  ) raw_q`

  const withSpeedSub = `(
    SELECT raw_q.*,
      ss.sprint_speed,
      raw_q.xslg_for_iso - raw_q.xba_for_iso AS iso_x,
      raw_q.k_pct - raw_q.bb_pct AS k_minus_bb,
      raw_q.rbi_raw AS rbi,
      CASE WHEN raw_q.ab > 0 THEN (raw_q.singles + 2.0*raw_q.doubles + 3.0*raw_q.triples + 4.0*raw_q.hr_count)::numeric / raw_q.ab ELSE NULL END AS slg,
      CASE WHEN (raw_q.ab + raw_q.bb_hbp_count + raw_q.sf) > 0 THEN (raw_q.singles + raw_q.doubles + raw_q.triples + raw_q.hr_count + raw_q.bb_hbp_count)::numeric / (raw_q.ab + raw_q.bb_hbp_count + raw_q.sf) ELSE NULL END AS obp
    FROM ${rawSub}
    LEFT JOIN sprint_speed ss ON ss.player_id = raw_q.player_id AND ss.season = ${year}
  ) spd_q`

  const statKeys = [
    'gb_pct','fb_pct','pull_pct','oppo_pct','ld_pct','popup_pct','rbi','slg','obp',
    'sweet_spot_pct','zone_contact_pct','hr_fb_pct','contact_pct','z_swing_pct','pitch_per_pa',
    'xba','sprint_speed','whiff_pct','chase_rate','o_swing_pct','babip',
    'barrel_pct','max_ev','xslg','hard_hit_pct','iso_x','woba',
    'avg_ev','k_pct','bb_pct','xwoba','k_minus_bb','hr_per_pa',
  ]
  const invertSet = new Set(['whiff_pct','chase_rate','o_swing_pct','k_pct','popup_pct'])
  // pitch_per_pa inverted: lower = more aggressive/efficient. Let's keep it normal (higher = more patient)

  const selectCols = statKeys.map(k => `spd_q.${k}`).join(', ')
  const pctlCols = statKeys.map(k => {
    const inv = invertSet.has(k)
    return inv
      ? `ROUND((1 - PERCENT_RANK() OVER (ORDER BY spd_q.${k}))::numeric * 100) AS ${k}_pctl`
      : `ROUND(PERCENT_RANK() OVER (ORDER BY spd_q.${k})::numeric * 100) AS ${k}_pctl`
  }).join(',\n  ')

  const sql = `SELECT spd_q.player_id, spd_q.player_name, spd_q.hand, spd_q.team,
  ${selectCols},
  ${pctlCols}
FROM ${withSpeedSub}
ORDER BY spd_q.player_id`

  const { data, error } = await supabaseGame.rpc('run_query', { query_text: sql.trim() })
  if (error) throw error
  if (!data || data.length === 0) throw new Error('No qualified hitters found')

  const pool = data as Record<string, unknown>[]
  const poolList = pool.map(p => ({ id: p.player_id as number, name: p.player_name as string }))
  const idx = dailyPlayerIndex(dateStr, year, 'hitter', pool.length)
  const player = pool[idx]

  return { ...buildResponse(player, pool.length, dateStr, year, 'hitter', HITTER_TIERS), pool: poolList }
}

// ══════════════════════════════════════════
//  SHARED RESPONSE BUILDER
// ══════════════════════════════════════════
function buildResponse(
  player: Record<string, unknown>, poolSize: number, dateStr: string,
  year: number, type: string, tierDefs: StatDef[][],
) {
  const tiers = tierDefs.map((defs, i) => {
    const count = i === 0 ? 3 : 2 // 3 stats on first tier, 2 on rest
    const guaranteed = i === 0
      ? defs.map((d, idx) => d.traditional ? idx : -1).filter(idx => idx >= 0)
      : undefined
    const indices = pickStats(dateStr, year, type, i, defs.length, count, guaranteed)
    const picked = indices.map(idx => defs[idx])
    return {
      level: i,
      label: TIER_LABELS[i],
      stats: picked.map(d => ({
        key: d.key, label: d.label, unit: d.unit,
        value: round(player[d.key] as number, d.decimals),
        percentile: Math.round(player[`${d.key}_pctl`] as number ?? 50),
      })),
    }
  })

  return {
    tiers,
    hints: {
      league: leagueForTeam(player.team as string),
      hand: player.hand as string,
      team: player.team as string,
    },
    answer: { id: player.player_id as number, name: player.player_name as string },
    poolSize,
    date: dateStr,
  }
}

function round(v: number | null | undefined, d: number): number {
  if (v == null || isNaN(Number(v))) return 0
  return Math.round(Number(v) * 10 ** d) / 10 ** d
}
