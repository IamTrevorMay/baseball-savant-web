import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// MiLB sport IDs — start with AAA, expand later
const SPORT_IDS: Record<string, number> = {
  AAA: 11,
  // AA: 12,
  // 'High-A': 13,
  // 'Single-A': 14,
}

// Stats API pitch type code → Statcast pitch_name mapping
const PITCH_NAME_MAP: Record<string, string> = {
  FF: '4-Seam Fastball',
  SI: 'Sinker',
  FC: 'Cutter',
  SL: 'Slider',
  ST: 'Sweeper',
  SV: 'Sweeper',
  CU: 'Curveball',
  KC: 'Knuckle Curve',
  CS: 'Slow Curve',
  CH: 'Changeup',
  FS: 'Split-Finger',
  KN: 'Knuckleball',
  EP: 'Eephus',
  SC: 'Screwball',
  FA: 'Fastball',
  PO: 'Pitchout',
  IN: 'Intentional Ball',
  AB: 'Automatic Ball',
}

// Stats API description → Statcast description mapping
const DESCRIPTION_MAP: Record<string, string> = {
  'Called Strike': 'called_strike',
  'Swinging Strike': 'swinging_strike',
  'Swinging Strike (Blocked)': 'swinging_strike_blocked',
  'Foul': 'foul',
  'Foul Tip': 'foul_tip',
  'Foul Bunt': 'foul_bunt',
  'Missed Bunt': 'missed_bunt',
  'Ball': 'ball',
  'Ball In Dirt': 'ball',
  'Hit By Pitch': 'hit_by_pitch',
  'In play, no out': 'hit_into_play',
  'In play, out(s)': 'hit_into_play',
  'In play, run(s)': 'hit_into_play',
}

// Stats API call code → Statcast type (B/S/X)
const TYPE_MAP: Record<string, string> = {
  B: 'B',   // Ball
  C: 'S',   // Called strike
  S: 'S',   // Swinging strike
  F: 'S',   // Foul
  T: 'S',   // Foul tip
  L: 'S',   // Foul bunt
  M: 'S',   // Missed bunt
  X: 'X',   // In play
  D: 'B',   // Hit by pitch (counted as ball for type)
  E: 'S',   // Strike (unknown)
  W: 'B',   // Automatic ball
  '*B': 'B',
  V: 'B',   // Automatic ball (violation)
}

// hitData.trajectory → bb_type mapping
const BB_TYPE_MAP: Record<string, string> = {
  ground_ball: 'ground_ball',
  line_drive: 'line_drive',
  fly_ball: 'fly_ball',
  popup: 'popup',
}

// ─── Fetch game schedule for a date range + sport ─────────────────────────────

async function fetchGamePks(
  startDate: string,
  endDate: string,
  sportId: number,
  gameType: string
): Promise<{ gamePk: number; officialDate: string }[]> {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=${sportId}&startDate=${startDate}&endDate=${endDate}&gameType=${gameType}&fields=dates,date,games,gamePk,status,detailedState`
  const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!resp.ok) throw new Error(`Schedule fetch failed: ${resp.status}`)
  const data = await resp.json()

  const games: { gamePk: number; officialDate: string }[] = []
  for (const dateEntry of data.dates || []) {
    for (const game of dateEntry.games || []) {
      // Only include completed games
      if (game.status?.detailedState === 'Final' || game.status?.detailedState === 'Completed Early') {
        games.push({ gamePk: game.gamePk, officialDate: dateEntry.date })
      }
    }
  }
  return games
}

// ─── Extract pitches from a single game feed ──────────────────────────────────

interface GameMeta {
  gamePk: number
  gameDate: string
  gameYear: number
  gameType: string
  homeTeam: string
  awayTeam: string
  parentOrgHome: number | null
  parentOrgAway: number | null
  level: string
}

async function extractPitchesFromGame(
  gamePk: number,
  level: string
): Promise<any[]> {
  const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`
  const resp = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!resp.ok) return []

  const data = await resp.json()
  const gameData = data.gameData
  const allPlays = data.liveData?.plays?.allPlays || []

  if (!gameData || allPlays.length === 0) return []

  const meta: GameMeta = {
    gamePk,
    gameDate: gameData.datetime?.officialDate || '',
    gameYear: parseInt(gameData.game?.season || new Date().getFullYear().toString()),
    gameType: gameData.game?.type || 'R',
    homeTeam: gameData.teams?.home?.team?.abbreviation || '',
    awayTeam: gameData.teams?.away?.team?.abbreviation || '',
    parentOrgHome: gameData.teams?.home?.team?.parentOrgId || null,
    parentOrgAway: gameData.teams?.away?.team?.parentOrgId || null,
    level,
  }

  const rows: any[] = []

  for (const play of allPlays) {
    const matchup = play.matchup || {}
    const about = play.about || {}
    const result = play.result || {}
    const pitcherId = matchup.pitcher?.id
    const batterId = matchup.batter?.id
    if (!pitcherId || !batterId) continue

    const pitcherName = matchup.pitcher?.fullName || 'Unknown'
    const halfInning = about.halfInning // "top" or "bottom"
    const inningTopbot = halfInning === 'top' ? 'Top' : 'Bot'
    const atBatNumber = (about.atBatIndex ?? 0) + 1 // 0-indexed → 1-indexed

    const playEvents = play.playEvents || []
    for (const ev of playEvents) {
      if (!ev.isPitch) continue

      const pd = ev.pitchData || {}
      const coords = pd.coordinates || {}
      const breaks = pd.breaks || {}
      const details = ev.details || {}
      const pitchTypeCode = details.type?.code || null
      const hitData = ev.hitData || {}
      const count = ev.count || {}

      // Determine event — only on the last pitch of the at-bat
      const isLastPitch = ev.index === playEvents[playEvents.length - 1]?.index
      const event = isLastPitch ? result.event || null : null
      const eventType = isLastPitch ? result.eventType || null : null

      // Score tracking
      const isTopInning = halfInning === 'top'
      const homeScore = about.homeScore ?? null
      const awayScore = about.awayScore ?? null

      const row: any = {
        game_pk: gamePk,
        game_date: meta.gameDate,
        game_year: meta.gameYear,
        game_type: meta.gameType,
        at_bat_number: atBatNumber,
        pitch_number: ev.pitchNumber || 1,
        pitcher: pitcherId,
        batter: batterId,
        player_name: formatName(pitcherName),
        stand: matchup.batSide?.code || null,
        p_throws: matchup.pitchHand?.code || null,
        home_team: meta.homeTeam,
        away_team: meta.awayTeam,
        inning: about.inning || null,
        inning_topbot: inningTopbot,
        outs_when_up: count.outs ?? null,
        balls: count.balls ?? null,
        strikes: count.strikes ?? null,

        // Pitch classification
        pitch_type: pitchTypeCode,
        pitch_name: pitchTypeCode ? (PITCH_NAME_MAP[pitchTypeCode] || pitchTypeCode) : null,

        // Pitch result
        description: details.description ? (DESCRIPTION_MAP[details.description] || details.description) : null,
        type: details.call?.code ? (TYPE_MAP[details.call.code] || null) : null,
        events: event,

        // Velocity
        release_speed: pd.startSpeed ?? null,
        effective_speed: pd.endSpeed ?? null,

        // Location
        plate_x: coords.pX ?? null,
        plate_z: coords.pZ ?? null,
        sz_top: pd.strikeZoneTop ?? null,
        sz_bot: pd.strikeZoneBottom ?? null,
        zone: pd.zone ?? null,

        // Movement (Stats API gives feet, same as Savant raw)
        pfx_x: coords.pfxX ?? null,
        pfx_z: coords.pfxZ ?? null,

        // Trajectory
        vx0: coords.vX0 ?? null,
        vy0: coords.vY0 ?? null,
        vz0: coords.vZ0 ?? null,
        ax: coords.aX ?? null,
        ay: coords.aY ?? null,
        az: coords.aZ ?? null,
        release_pos_x: coords.x0 ?? null,
        release_pos_y: coords.y0 ?? null,
        release_pos_z: coords.z0 ?? null,

        // Spin & extension
        release_spin_rate: breaks.spinRate ?? null,
        spin_axis: breaks.spinDirection ?? null,
        release_extension: pd.extension ?? null,

        // Batted ball
        launch_speed: hitData.launchSpeed ?? null,
        launch_angle: hitData.launchAngle ?? null,
        hit_distance_sc: hitData.totalDistance ?? null,
        bb_type: hitData.trajectory ? (BB_TYPE_MAP[hitData.trajectory] || hitData.trajectory) : null,
        hc_x: hitData.coordinates?.coordX ?? null,
        hc_y: hitData.coordinates?.coordY ?? null,
        hit_location: hitData.location ? Number(hitData.location) : null,

        // Score context
        home_score: homeScore,
        away_score: awayScore,
        bat_score: isTopInning ? awayScore : homeScore,
        fld_score: isTopInning ? homeScore : awayScore,

        // Runners (we don't have runner IDs from game feed easily, leave null)
        on_1b: null,
        on_2b: null,
        on_3b: null,

        // MiLB-specific
        level: meta.level,
        parent_org_home: meta.parentOrgHome,
        parent_org_away: meta.parentOrgAway,
      }

      rows.push(row)
    }
  }

  return rows
}

function formatName(fullName: string): string {
  const parts = fullName.split(' ')
  if (parts.length > 1) {
    return `${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(' ')}`
  }
  return fullName
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncMilbPitches(
  startDate: string,
  endDate: string,
  gameType: string = 'R'
) {
  let totalFetched = 0
  let totalInserted = 0
  let totalErrors = 0
  const levelResults: Record<string, any> = {}

  for (const [level, sportId] of Object.entries(SPORT_IDS)) {
    const games = await fetchGamePks(startDate, endDate, sportId, gameType)
    if (games.length === 0) {
      levelResults[level] = { games: 0, fetched: 0, inserted: 0, errors: 0 }
      continue
    }

    let fetched = 0
    let inserted = 0
    let errors = 0

    // Process games in batches of 5 (parallel) to avoid rate limits
    for (let i = 0; i < games.length; i += 5) {
      const batch = games.slice(i, i + 5)
      const results = await Promise.all(
        batch.map(g => extractPitchesFromGame(g.gamePk, level).catch(() => []))
      )

      const allRows = results.flat()
      fetched += allRows.length

      if (allRows.length === 0) continue

      // Upsert in batches of 500
      for (let j = 0; j < allRows.length; j += 500) {
        const upsertBatch = allRows.slice(j, j + 500)
        const { error } = await supabase.from('milb_pitches').upsert(upsertBatch, {
          onConflict: 'game_pk,at_bat_number,pitch_number',
          ignoreDuplicates: false,
        })
        if (error) {
          console.error(`Upsert error (${level}):`, error.message)
          errors += upsertBatch.length
        } else {
          inserted += upsertBatch.length
        }
      }

      // Brief pause between batches to be kind to the API
      if (i + 5 < games.length) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    // Ensure new players are in the players table
    await ensurePlayers(supabase)

    levelResults[level] = { games: games.length, fetched, inserted, errors }
    totalFetched += fetched
    totalInserted += inserted
    totalErrors += errors
  }

  // Compute Stuff+ for the ingested date range
  const stuffResult = await computeMilbStuffPlus(startDate, endDate)
  if (!stuffResult.ok) {
    console.error('MiLB Stuff+ computation failed:', stuffResult.error)
  }

  // Compute SOS for affected years
  const sosResult = await computeMilbSOS(startDate, endDate)
  if (!sosResult.ok) {
    console.error('MiLB SOS computation failed:', sosResult.error)
  }

  // Refresh materialized views for player search
  try {
    await supabase.rpc('run_mutation', {
      query_text: 'REFRESH MATERIALIZED VIEW CONCURRENTLY milb_player_summary',
    })
  } catch {}
  try {
    await supabase.rpc('run_mutation', {
      query_text: 'REFRESH MATERIALIZED VIEW CONCURRENTLY milb_batter_summary',
    })
  } catch {}

  return {
    fetched: totalFetched,
    inserted: totalInserted,
    errors: totalErrors,
    levels: levelResults,
    stuff_plus: stuffResult,
    sos: sosResult,
    message: `MiLB sync: ${totalFetched} pitches fetched, ${totalInserted} processed`,
  }
}

// ─── Ensure new player IDs exist in players table ─────────────────────────────

async function ensurePlayers(sb: any) {
  // Find pitcher/batter IDs in milb_pitches that aren't in players table
  const { data: missing } = await sb.rpc('run_query', {
    query_text: `
      SELECT DISTINCT id FROM (
        SELECT DISTINCT pitcher AS id FROM milb_pitches
        UNION
        SELECT DISTINCT batter AS id FROM milb_pitches
      ) sub
      WHERE id NOT IN (SELECT id FROM players)
      LIMIT 200
    `,
  })

  if (!missing || missing.length === 0) return

  // Insert placeholder rows — the existing roster cron will resolve names
  const placeholders = missing.map((r: any) => ({
    id: r.id,
    name: 'Unknown',
    position: null,
  }))

  for (let i = 0; i < placeholders.length; i += 100) {
    await sb.from('players').upsert(placeholders.slice(i, i + 100), {
      onConflict: 'id',
      ignoreDuplicates: true,
    })
  }
}

// ─── Stuff+ for MiLB (identical formula, milb tables) ────────────────────────

async function computeMilbStuffPlus(startDate: string, endDate: string) {
  try {
    const m = async (sql: string) => {
      const res = await supabase.rpc('run_mutation', { query_text: sql.trim() })
      if (res.error) throw new Error(`run_mutation failed: ${res.error.message}`)
      return res
    }

    const startYear = new Date(startDate).getFullYear()
    const endYear = new Date(endDate).getFullYear()
    const years: number[] = []
    for (let y = startYear; y <= endYear; y++) years.push(y)

    for (const year of years) {
      await m(`
        INSERT INTO milb_pitch_baselines (pitch_name, game_year, avg_velo, std_velo, avg_movement, std_movement, avg_ext, std_ext, pitch_count)
        SELECT
          pitch_name,
          game_year,
          ROUND(AVG(release_speed)::numeric, 4),
          ROUND(STDDEV(release_speed)::numeric, 4),
          ROUND(AVG(SQRT(POWER(pfx_x * 12, 2) + POWER(pfx_z * 12, 2)))::numeric, 4),
          ROUND(STDDEV(SQRT(POWER(pfx_x * 12, 2) + POWER(pfx_z * 12, 2)))::numeric, 4),
          ROUND(AVG(release_extension)::numeric, 4),
          ROUND(STDDEV(release_extension)::numeric, 4),
          COUNT(*)::int
        FROM milb_pitches
        WHERE pitch_name IS NOT NULL
          AND release_speed IS NOT NULL
          AND pfx_x IS NOT NULL AND pfx_z IS NOT NULL
          AND release_extension IS NOT NULL
          AND game_year = ${year}
        GROUP BY pitch_name, game_year
        ON CONFLICT (pitch_name, game_year) DO UPDATE SET
          avg_velo     = EXCLUDED.avg_velo,
          std_velo     = EXCLUDED.std_velo,
          avg_movement = EXCLUDED.avg_movement,
          std_movement = EXCLUDED.std_movement,
          avg_ext      = EXCLUDED.avg_ext,
          std_ext      = EXCLUDED.std_ext,
          pitch_count  = EXCLUDED.pitch_count
      `)
    }

    await m(`
      UPDATE milb_pitches p
      SET stuff_plus = GREATEST(0, LEAST(200, ROUND(
        100
        + COALESCE((p.release_speed - b.avg_velo) / NULLIF(b.std_velo, 0), 0) * 4.5
        + COALESCE((SQRT(POWER(p.pfx_x * 12, 2) + POWER(p.pfx_z * 12, 2)) - b.avg_movement) / NULLIF(b.std_movement, 0), 0) * 3.5
        + COALESCE((p.release_extension - b.avg_ext) / NULLIF(b.std_ext, 0), 0) * 2.0
      )::numeric))
      FROM milb_pitch_baselines b
      WHERE p.pitch_name = b.pitch_name
        AND p.game_year = b.game_year
        AND p.game_date BETWEEN '${startDate}' AND '${endDate}'
        AND p.release_speed IS NOT NULL
    `)

    return { ok: true, years }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

// ─── SOS for MiLB (identical formula, milb tables) ───────────────────────────

const SOS_REGRESSION_K = 60

async function computeMilbSOS(startDate: string, endDate: string) {
  try {
    const q = async (sql: string) => {
      const res = await supabase.rpc('run_query_long', { query_text: sql.trim() })
      if (res.error) throw new Error(`run_query_long failed: ${res.error.message}`)
      return res.data || []
    }
    const m = async (sql: string) => {
      const res = await supabase.rpc('run_mutation', { query_text: sql.trim() })
      if (res.error) throw new Error(`run_mutation failed: ${res.error.message}`)
      return res
    }

    const startYear = parseInt(startDate.slice(0, 4), 10)
    const endYear = parseInt(endDate.slice(0, 4), 10)
    const years: number[] = []
    for (let y = startYear; y <= endYear; y++) years.push(y)

    let totalUpserted = 0

    for (const year of years) {
      const yStart = `${year}-01-01`
      const yEnd = `${year}-12-31`
      const f = `game_date BETWEEN '${yStart}' AND '${yEnd}' AND events IS NOT NULL AND game_type = 'R' AND pitch_type NOT IN ('PO','IN')`

      // ── Hitter SOS ──
      const hitterRows = await q(`
        WITH all_pitcher_stats AS (
          SELECT pitcher, COUNT(*) AS total_pa,
            SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS total_xwoba_sum
          FROM milb_pitches WHERE ${f} GROUP BY pitcher
        ),
        league AS (
          SELECT AVG(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_avg,
                 STDDEV(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_std
          FROM all_pitcher_stats WHERE total_pa >= 10
        ),
        matchup_stats AS (
          SELECT batter, pitcher, COUNT(*) AS mu_pa,
            SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS mu_xwoba_sum
          FROM milb_pitches WHERE ${f} GROUP BY batter, pitcher
        ),
        loo AS (
          SELECT m.batter, m.pitcher, m.mu_pa AS pas_vs,
            (a.total_pa - m.mu_pa) AS loo_n,
            CASE WHEN (a.total_pa - m.mu_pa) > 0
              THEN (a.total_xwoba_sum - COALESCE(m.mu_xwoba_sum, 0)) / (a.total_pa - m.mu_pa)
            END AS loo_xwoba
          FROM matchup_stats m
          JOIN all_pitcher_stats a ON m.pitcher = a.pitcher
        ),
        regressed AS (
          SELECT batter, pitcher, pas_vs,
            (loo_n * loo_xwoba + ${SOS_REGRESSION_K} * l.lg_avg) / (loo_n + ${SOS_REGRESSION_K}) AS reg_xwoba
          FROM loo CROSS JOIN league l WHERE loo_xwoba IS NOT NULL
        )
        SELECT
          r.batter AS player_id,
          SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) AS raw_sos,
          l.lg_avg, l.lg_std,
          100 + ((l.lg_avg - SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0)) / NULLIF(l.lg_std, 0)) * 10 AS sos,
          COUNT(DISTINCT r.pitcher) AS opp_count,
          SUM(r.pas_vs) AS total_pa
        FROM regressed r CROSS JOIN league l
        GROUP BY r.batter, l.lg_avg, l.lg_std
        HAVING SUM(r.pas_vs) >= 10
      `)

      if (hitterRows.length > 0) {
        const values = hitterRows.map((r: any) =>
          `(${r.player_id}, ${year}, 'hitter', ${r.sos != null ? Math.round(r.sos * 10) / 10 : 'NULL'}, ${r.raw_sos != null ? Math.round(r.raw_sos * 10000) / 10000 : 'NULL'}, ${r.lg_avg != null ? Math.round(r.lg_avg * 10000) / 10000 : 'NULL'}, ${r.lg_std != null ? Math.round(r.lg_std * 10000) / 10000 : 'NULL'}, ${r.opp_count}, ${r.total_pa}, NOW())`
        ).join(',\n')

        await m(`
          INSERT INTO milb_sos_scores (player_id, game_year, role, sos, raw_opponent_xwoba, league_avg_xwoba, league_std_xwoba, opponents_faced, total_pa, updated_at)
          VALUES ${values}
          ON CONFLICT (player_id, game_year, role) DO UPDATE SET
            sos = EXCLUDED.sos,
            raw_opponent_xwoba = EXCLUDED.raw_opponent_xwoba,
            league_avg_xwoba = EXCLUDED.league_avg_xwoba,
            league_std_xwoba = EXCLUDED.league_std_xwoba,
            opponents_faced = EXCLUDED.opponents_faced,
            total_pa = EXCLUDED.total_pa,
            updated_at = NOW()
        `)
        totalUpserted += hitterRows.length
      }

      // ── Pitcher SOS ──
      const pitcherRows = await q(`
        WITH all_batter_stats AS (
          SELECT batter, COUNT(*) AS total_pa,
            SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS total_xwoba_sum
          FROM milb_pitches WHERE ${f} GROUP BY batter
        ),
        league AS (
          SELECT AVG(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_avg,
                 STDDEV(total_xwoba_sum / NULLIF(total_pa, 0)) AS lg_std
          FROM all_batter_stats WHERE total_pa >= 10
        ),
        matchup_stats AS (
          SELECT pitcher, batter, COUNT(*) AS mu_pa,
            SUM(COALESCE(estimated_woba_using_speedangle, woba_value)) AS mu_xwoba_sum
          FROM milb_pitches WHERE ${f} GROUP BY pitcher, batter
        ),
        loo AS (
          SELECT m.pitcher, m.batter, m.mu_pa AS pas_vs,
            (a.total_pa - m.mu_pa) AS loo_n,
            CASE WHEN (a.total_pa - m.mu_pa) > 0
              THEN (a.total_xwoba_sum - COALESCE(m.mu_xwoba_sum, 0)) / (a.total_pa - m.mu_pa)
            END AS loo_xwoba
          FROM matchup_stats m
          JOIN all_batter_stats a ON m.batter = a.batter
        ),
        regressed AS (
          SELECT pitcher, batter, pas_vs,
            (loo_n * loo_xwoba + ${SOS_REGRESSION_K} * l.lg_avg) / (loo_n + ${SOS_REGRESSION_K}) AS reg_xwoba
          FROM loo CROSS JOIN league l WHERE loo_xwoba IS NOT NULL
        )
        SELECT
          r.pitcher AS player_id,
          SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) AS raw_sos,
          l.lg_avg, l.lg_std,
          100 + ((SUM(r.reg_xwoba * r.pas_vs) / NULLIF(SUM(r.pas_vs), 0) - l.lg_avg) / NULLIF(l.lg_std, 0)) * 10 AS sos,
          COUNT(DISTINCT r.batter) AS opp_count,
          SUM(r.pas_vs) AS total_pa
        FROM regressed r CROSS JOIN league l
        GROUP BY r.pitcher, l.lg_avg, l.lg_std
        HAVING SUM(r.pas_vs) >= 10
      `)

      if (pitcherRows.length > 0) {
        const values = pitcherRows.map((r: any) =>
          `(${r.player_id}, ${year}, 'pitcher', ${r.sos != null ? Math.round(r.sos * 10) / 10 : 'NULL'}, ${r.raw_sos != null ? Math.round(r.raw_sos * 10000) / 10000 : 'NULL'}, ${r.lg_avg != null ? Math.round(r.lg_avg * 10000) / 10000 : 'NULL'}, ${r.lg_std != null ? Math.round(r.lg_std * 10000) / 10000 : 'NULL'}, ${r.opp_count}, ${r.total_pa}, NOW())`
        ).join(',\n')

        await m(`
          INSERT INTO milb_sos_scores (player_id, game_year, role, sos, raw_opponent_xwoba, league_avg_xwoba, league_std_xwoba, opponents_faced, total_pa, updated_at)
          VALUES ${values}
          ON CONFLICT (player_id, game_year, role) DO UPDATE SET
            sos = EXCLUDED.sos,
            raw_opponent_xwoba = EXCLUDED.raw_opponent_xwoba,
            league_avg_xwoba = EXCLUDED.league_avg_xwoba,
            league_std_xwoba = EXCLUDED.league_std_xwoba,
            opponents_faced = EXCLUDED.opponents_faced,
            total_pa = EXCLUDED.total_pa,
            updated_at = NOW()
          `)
        totalUpserted += pitcherRows.length
      }
    }

    return { ok: true, years, upserted: totalUpserted }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

// ─── POST handler for manual triggers ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { start_date, end_date, game_type } = await req.json()
    const result = await syncMilbPitches(start_date, end_date, game_type || 'R')
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
