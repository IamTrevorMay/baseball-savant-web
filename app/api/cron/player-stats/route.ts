import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseAdminLong } from '@/lib/supabase-admin'
import { trackCronRun } from '@/lib/cronTracker'

/**
 * GET /api/cron/player-stats
 * Nightly cron (09:30 UTC) — fetches pitching/hitting season stats from MLB
 * Stats API and upserts to player_season_stats. Only stores fields that can't
 * be derived from the pitches table (ERA, W, L, SV, HLD, IP, ER, R, RBI, SB, IR, IRS).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const year = new Date().getFullYear()

  try {
    const payload = await trackCronRun('player-stats', async () => {
      const results = await syncPlayerStats(year)
      return {
        result: { ok: true as const, year, ...results },
        counts: {
          year,
          pitchers: results.pitchers,
          batters: results.batters,
          pitchingUpserted: results.pitchingUpserted,
          hittingUpserted: results.hittingUpserted,
        },
      }
    })
    return NextResponse.json(payload)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function syncPlayerStats(year: number) {
  // DISTINCT scans over a season of pitches outgrew run_query's timeout
  // (game_year is unindexed; even the game_date index needs the 120s RPC)
  const qLong = (sql: string) => supabaseAdminLong.rpc('run_query_long', { query_text: sql.trim() })
  const seasonRange = `game_date >= '${year}-01-01' AND game_date < '${year + 1}-01-01'`

  // Get all unique pitcher IDs for the season
  const { data: pitcherRows, error: pitcherErr } = await qLong(
    `SELECT DISTINCT pitcher FROM pitches WHERE ${seasonRange} AND game_type = 'R'`
  )
  if (pitcherErr) throw new Error(`pitcher id query failed: ${pitcherErr.message}`)
  const pitcherIds = (pitcherRows || []).map((r: any) => r.pitcher).filter(Boolean) as number[]

  // Get all unique batter IDs for the season
  const { data: batterRows, error: batterErr } = await qLong(
    `SELECT DISTINCT batter FROM pitches WHERE ${seasonRange} AND game_type = 'R'`
  )
  if (batterErr) throw new Error(`batter id query failed: ${batterErr.message}`)
  const batterIds = (batterRows || []).map((r: any) => r.batter).filter(Boolean) as number[]

  let pitchingUpserted = 0
  let hittingUpserted = 0

  // Fetch pitching stats in batches of 50
  for (let i = 0; i < pitcherIds.length; i += 50) {
    const batch = pitcherIds.slice(i, i + 50)
    const ids = batch.join(',')
    try {
      const resp = await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${ids}&hydrate=stats(group=[pitching],type=[season],season=${year})`,
        { signal: AbortSignal.timeout(15000) }
      )
      if (!resp.ok) continue

      const data = await resp.json()
      const rows: any[] = []

      for (const person of data.people || []) {
        const stat = person.stats?.[0]?.splits?.[0]?.stat
        if (!stat) continue
        rows.push({
          player_id: person.id,
          season: year,
          stat_group: 'pitching',
          era: stat.era != null ? parseFloat(stat.era) : null,
          wins: stat.wins ?? null,
          losses: stat.losses ?? null,
          saves: stat.saves ?? null,
          holds: stat.holds ?? null,
          innings_pitched: stat.inningsPitched != null ? parseFloat(stat.inningsPitched) : null,
          earned_runs: stat.earnedRuns ?? null,
          runs: stat.runs ?? null,
          rbi: null,
          stolen_bases: null,
          inherited_runners: stat.inheritedRunners ?? null,
          inherited_runners_scored: stat.inheritedRunnersScored ?? null,
          updated_at: new Date().toISOString(),
        })
      }

      if (rows.length > 0) {
        const { error } = await supabaseAdmin
          .from('player_season_stats')
          .upsert(rows, { onConflict: 'player_id,season,stat_group' })
        if (error) console.error('[cron/player-stats] pitching upsert failed:', error.message)
        else pitchingUpserted += rows.length
      }
    } catch (e: any) { console.error('[cron/player-stats] pitching batch error:', e?.message ?? e) }
  }

  // Fetch hitting stats in batches of 50
  for (let i = 0; i < batterIds.length; i += 50) {
    const batch = batterIds.slice(i, i + 50)
    const ids = batch.join(',')
    try {
      const resp = await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${ids}&hydrate=stats(group=[hitting],type=[season],season=${year})`,
        { signal: AbortSignal.timeout(15000) }
      )
      if (!resp.ok) continue

      const data = await resp.json()
      const rows: any[] = []

      for (const person of data.people || []) {
        const stat = person.stats?.[0]?.splits?.[0]?.stat
        if (!stat) continue
        rows.push({
          player_id: person.id,
          season: year,
          stat_group: 'hitting',
          era: null,
          wins: null,
          losses: null,
          saves: null,
          holds: null,
          innings_pitched: null,
          earned_runs: null,
          runs: stat.runs ?? null,
          rbi: stat.rbi ?? null,
          stolen_bases: stat.stolenBases ?? null,
          inherited_runners: null,
          inherited_runners_scored: null,
          updated_at: new Date().toISOString(),
        })
      }

      if (rows.length > 0) {
        const { error } = await supabaseAdmin
          .from('player_season_stats')
          .upsert(rows, { onConflict: 'player_id,season,stat_group' })
        if (error) console.error('[cron/player-stats] hitting upsert failed:', error.message)
        else hittingUpserted += rows.length
      }
    } catch (e: any) { console.error('[cron/player-stats] hitting batch error:', e?.message ?? e) }
  }

  return {
    pitchers: pitcherIds.length,
    batters: batterIds.length,
    pitchingUpserted,
    hittingUpserted,
  }
}
