import { supabaseAdmin } from '@/lib/supabase/admin'
import { supabaseAdminLong } from '@/lib/supabase-admin'
import { PITCH_NAME_TO_ABBREV, SEASON_CONSTANTS } from '@/lib/constants-data'

// ── Types ───────────────────────────────────────────────────────────────────

export interface CheckResult {
  check_name: string
  status: 'pass' | 'warn' | 'fail' | 'remediated'
  found: number
  remediated: number
  details: Record<string, any>
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Format "First Last" → "Last, First" (same as cron/roster) */
function formatPlayerName(fullName: string): string {
  const parts = fullName.split(' ')
  return parts.length > 1
    ? `${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(' ')}`
    : fullName
}

/** Fetch a single player from the MLB People API. Returns null on failure. */
async function fetchMlbPerson(
  id: number,
): Promise<{ name: string; position: string | null } | null> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const person = data?.people?.[0]
    if (!person?.fullName) return null
    return {
      name: person.fullName,
      position: person.primaryPosition?.abbreviation || null,
    }
  } catch {
    return null
  }
}

// ── Check 1: Unknown Players ────────────────────────────────────────────────

export async function checkUnknownPlayers(): Promise<CheckResult> {
  const { data: unknowns } = await supabaseAdmin
    .from('players')
    .select('id')
    .eq('name', 'Unknown')
    .limit(200)

  if (!unknowns || unknowns.length === 0) {
    return { check_name: 'unknown_players', status: 'pass', found: 0, remediated: 0, details: {} }
  }

  let fixed = 0
  const failedIds: number[] = []

  for (let i = 0; i < unknowns.length; i += 10) {
    const batch = unknowns.slice(i, i + 10)
    const results = await Promise.all(batch.map((p) => fetchMlbPerson(p.id)))

    for (let j = 0; j < batch.length; j++) {
      const person = results[j]
      if (person && person.name !== 'Unknown') {
        const { error } = await supabaseAdmin
          .from('players')
          .update({
            name: formatPlayerName(person.name),
            position: person.position,
            updated_at: new Date().toISOString(),
          })
          .eq('id', batch[j].id)
        if (!error) fixed++
        else failedIds.push(batch[j].id)
      } else {
        failedIds.push(batch[j].id)
      }
    }
  }

  const remaining = unknowns.length - fixed
  return {
    check_name: 'unknown_players',
    status: fixed > 0 ? (remaining > 0 ? 'remediated' : 'remediated') : 'warn',
    found: unknowns.length,
    remediated: fixed,
    details: { remaining, failedIds: failedIds.slice(0, 50) },
  }
}

// ── Check 2: Orphaned Pitchers ──────────────────────────────────────────────

export async function checkOrphanedPitchers(year: number): Promise<CheckResult> {
  const { data: orphans, error } = await supabaseAdminLong.rpc('run_query_long', {
    query_text: `
      SELECT DISTINCT p.pitcher AS id
      FROM pitches p
      LEFT JOIN players pl ON p.pitcher = pl.id
      WHERE p.game_year = ${year} AND pl.id IS NULL
      LIMIT 200
    `,
  })

  if (error || !orphans || orphans.length === 0) {
    return {
      check_name: 'orphaned_pitchers',
      status: 'pass',
      found: 0,
      remediated: 0,
      details: error ? { queryError: error.message } : {},
    }
  }

  let inserted = 0
  const failedIds: number[] = []

  for (let i = 0; i < orphans.length; i += 10) {
    const batch = orphans.slice(i, i + 10)
    const results = await Promise.all(batch.map((o: any) => fetchMlbPerson(o.id)))

    for (let j = 0; j < batch.length; j++) {
      const person = results[j]
      const playerId = batch[j].id
      if (person) {
        const { error: upsertErr } = await supabaseAdmin.from('players').upsert(
          {
            id: playerId,
            name: formatPlayerName(person.name),
            position: person.position,
          },
          { onConflict: 'id' },
        )
        if (!upsertErr) inserted++
        else failedIds.push(playerId)
      } else {
        failedIds.push(playerId)
      }
    }
  }

  return {
    check_name: 'orphaned_pitchers',
    status: inserted > 0 ? 'remediated' : 'warn',
    found: orphans.length,
    remediated: inserted,
    details: { failedIds: failedIds.slice(0, 50) },
  }
}

// ── Check 3: Orphaned Batters ───────────────────────────────────────────────

export async function checkOrphanedBatters(year: number): Promise<CheckResult> {
  const { data: orphans, error } = await supabaseAdminLong.rpc('run_query_long', {
    query_text: `
      SELECT DISTINCT p.batter AS id
      FROM pitches p
      LEFT JOIN players pl ON p.batter = pl.id
      WHERE p.game_year = ${year} AND pl.id IS NULL
      LIMIT 200
    `,
  })

  if (error || !orphans || orphans.length === 0) {
    return {
      check_name: 'orphaned_batters',
      status: 'pass',
      found: 0,
      remediated: 0,
      details: error ? { queryError: error.message } : {},
    }
  }

  let inserted = 0
  const failedIds: number[] = []

  for (let i = 0; i < orphans.length; i += 10) {
    const batch = orphans.slice(i, i + 10)
    const results = await Promise.all(batch.map((o: any) => fetchMlbPerson(o.id)))

    for (let j = 0; j < batch.length; j++) {
      const person = results[j]
      const playerId = batch[j].id
      if (person) {
        const { error: upsertErr } = await supabaseAdmin.from('players').upsert(
          {
            id: playerId,
            name: formatPlayerName(person.name),
            position: person.position,
          },
          { onConflict: 'id' },
        )
        if (!upsertErr) inserted++
        else failedIds.push(playerId)
      } else {
        failedIds.push(playerId)
      }
    }
  }

  return {
    check_name: 'orphaned_batters',
    status: inserted > 0 ? 'remediated' : 'warn',
    found: orphans.length,
    remediated: inserted,
    details: { failedIds: failedIds.slice(0, 50) },
  }
}

// ── Check 4: New Pitch Names ────────────────────────────────────────────────

export async function checkNewPitchNames(year: number): Promise<CheckResult> {
  const { data: rows, error } = await supabaseAdminLong.rpc('run_query_long', {
    query_text: `
      SELECT DISTINCT pitch_name
      FROM pitches
      WHERE game_year = ${year} AND pitch_name IS NOT NULL
    `,
  })

  if (error || !rows) {
    return {
      check_name: 'new_pitch_names',
      status: 'warn',
      found: 0,
      remediated: 0,
      details: { queryError: error?.message ?? 'no data' },
    }
  }

  const knownNames = new Set(Object.keys(PITCH_NAME_TO_ABBREV))
  const unknown = rows
    .map((r: any) => r.pitch_name as string)
    .filter((name: string) => !knownNames.has(name))

  if (unknown.length === 0) {
    return { check_name: 'new_pitch_names', status: 'pass', found: 0, remediated: 0, details: {} }
  }

  return {
    check_name: 'new_pitch_names',
    status: 'warn',
    found: unknown.length,
    remediated: 0,
    details: { unknownPitchNames: unknown },
  }
}

// ── Check 5: Season Constants ───────────────────────────────────────────────

export async function checkSeasonConstants(year: number): Promise<CheckResult> {
  const hasYear = year in SEASON_CONSTANTS
  const latestAvailable = Math.max(...Object.keys(SEASON_CONSTANTS).map(Number))

  if (hasYear) {
    return { check_name: 'season_constants', status: 'pass', found: 0, remediated: 0, details: {} }
  }

  return {
    check_name: 'season_constants',
    status: 'warn',
    found: 1,
    remediated: 0,
    details: { currentYear: year, latestAvailable },
  }
}

// ── Check 6: Materialized Views ─────────────────────────────────────────────

export async function checkMaterializedViews(): Promise<CheckResult> {
  // Find a pitcher from recent games and check if they appear in player_summary
  const { data: recent } = await supabaseAdminLong.rpc('run_query_long', {
    query_text: `
      SELECT DISTINCT pitcher AS id
      FROM pitches
      WHERE game_date >= (CURRENT_DATE - INTERVAL '3 days')
      LIMIT 1
    `,
  })

  if (!recent || recent.length === 0) {
    return {
      check_name: 'materialized_views',
      status: 'pass',
      found: 0,
      remediated: 0,
      details: { note: 'no recent pitches to validate against' },
    }
  }

  const testId = recent[0].id
  const { data: summary } = await supabaseAdminLong.rpc('run_query_long', {
    query_text: `SELECT 1 FROM player_summary WHERE id = ${testId} LIMIT 1`,
  })

  if (summary && summary.length > 0) {
    return {
      check_name: 'materialized_views',
      status: 'pass',
      found: 0,
      remediated: 0,
      details: { testedPlayerId: testId },
    }
  }

  // View is stale — refresh (these are heavy operations)
  const errors: string[] = []
  try {
    const { error } = await supabaseAdminLong.rpc('refresh_player_summary')
    if (error) errors.push(`player_summary: ${error.message}`)
  } catch (e: any) {
    errors.push(`player_summary: ${e.message}`)
  }

  try {
    const { error } = await supabaseAdminLong.rpc('refresh_batter_summary')
    if (error) errors.push(`batter_summary: ${error.message}`)
  } catch (e: any) {
    errors.push(`batter_summary: ${e.message}`)
  }

  return {
    check_name: 'materialized_views',
    status: errors.length > 0 ? 'warn' : 'remediated',
    found: 1,
    remediated: errors.length > 0 ? 0 : 1,
    details: { testedPlayerId: testId, ...(errors.length > 0 && { errors }) },
  }
}

// ── Check 7: League Averages ────────────────────────────────────────────────

export async function checkLeagueAverages(year: number): Promise<CheckResult> {
  const { data: rows, error } = await supabaseAdmin.rpc('run_query', {
    query_text: `SELECT COUNT(*)::int AS cnt FROM league_averages WHERE season = ${year}`,
  })

  if (error) {
    return {
      check_name: 'league_averages',
      status: 'warn',
      found: 0,
      remediated: 0,
      details: { queryError: error.message },
    }
  }

  const count = rows?.[0]?.cnt ?? 0
  if (count > 0) {
    return {
      check_name: 'league_averages',
      status: 'pass',
      found: 0,
      remediated: 0,
      details: { rowCount: count },
    }
  }

  // No rows for current year — refresh
  try {
    const { error: rpcErr } = await supabaseAdmin.rpc('refresh_league_averages', {
      p_season: year,
    })
    if (rpcErr) {
      return {
        check_name: 'league_averages',
        status: 'warn',
        found: 1,
        remediated: 0,
        details: { refreshError: rpcErr.message },
      }
    }
  } catch (e: any) {
    return {
      check_name: 'league_averages',
      status: 'warn',
      found: 1,
      remediated: 0,
      details: { refreshError: e.message },
    }
  }

  return {
    check_name: 'league_averages',
    status: 'remediated',
    found: 1,
    remediated: 1,
    details: { action: 'refresh_league_averages called' },
  }
}

// ── Check 8: Pitch Baselines ────────────────────────────────────────────────

export async function checkPitchBaselines(year: number): Promise<CheckResult> {
  const { data: rows, error } = await supabaseAdmin.rpc('run_query', {
    query_text: `
      SELECT pitch_name, game_year, pitch_count
      FROM pitch_baselines
      WHERE game_year = ${year} AND (pitch_count < 5 OR std_velo = 0)
    `,
  })

  if (error) {
    return {
      check_name: 'pitch_baselines',
      status: 'warn',
      found: 0,
      remediated: 0,
      details: { queryError: error.message },
    }
  }

  if (!rows || rows.length === 0) {
    return { check_name: 'pitch_baselines', status: 'pass', found: 0, remediated: 0, details: {} }
  }

  return {
    check_name: 'pitch_baselines',
    status: 'warn',
    found: rows.length,
    remediated: 0,
    details: {
      issues: rows.map((r: any) => ({
        pitch_name: r.pitch_name,
        game_year: r.game_year,
        pitch_count: r.pitch_count,
      })),
    },
  }
}
