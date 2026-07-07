import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Pitch video archive helpers — play_id indexing into `pitch_videos`.
 *
 * The nightly refresh cron calls indexRecentPitchVideos() to queue new games'
 * pitches (status 'pending') for the download worker running on the Mayday
 * Cloud machine. scripts/backfill-pitch-videos.ts does the same for whole
 * seasons; scripts/download-pitch-videos.ts drains the queue.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One Savant game-feed fetch → map of "ab|pitch" → play_id for every pitch in the game. */
export async function fetchGamePlayIds(gamePk: number): Promise<Map<string, string>> {
  const res = await fetch(`https://baseballsavant.mlb.com/gf?game_pk=${gamePk}`, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`gf feed ${res.status}`)
  const feed = await res.json()

  const map = new Map<string, string>()
  for (const team of [feed.team_home, feed.team_away]) {
    if (!Array.isArray(team)) continue
    for (const p of team) {
      if (p.ab_number == null || p.pitch_number == null) continue
      if (!p.play_id || !UUID_RE.test(p.play_id)) continue
      map.set(`${p.ab_number}|${p.pitch_number}`, p.play_id)
    }
  }
  return map
}

/** Upsert one game's play_ids as pending rows. Never resets rows the worker touched. */
export async function indexGame(gamePk: number): Promise<number> {
  const playIds = await fetchGamePlayIds(gamePk)
  if (playIds.size === 0) return 0

  const rows = Array.from(playIds.entries()).map(([key, playId]) => {
    const [ab, pitch] = key.split('|')
    return {
      game_pk: gamePk,
      at_bat_number: parseInt(ab),
      pitch_number: parseInt(pitch),
      play_id: playId,
      status: 'pending',
    }
  })

  const { error } = await supabaseAdmin
    .from('pitch_videos')
    .upsert(rows, { onConflict: 'game_pk,at_bat_number,pitch_number', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  return rows.length
}

/**
 * Index play_ids for recently ingested games missing from pitch_videos.
 * Cheap no-op when everything is indexed (one SQL query). maxGames caps the
 * per-run work so the cron stays inside its time budget; leftovers are picked
 * up the next night.
 */
export async function indexRecentPitchVideos(daysBack = 4, maxGames = 40): Promise<{
  gamesIndexed: number
  rowsQueued: number
  gamesFailed: number
}> {
  const { data, error } = await supabaseAdmin.rpc('run_query', {
    query_text: `
      SELECT DISTINCT p.game_pk FROM pitches p
      WHERE p.game_date >= CURRENT_DATE - INTERVAL '${daysBack} days'
        AND NOT EXISTS (SELECT 1 FROM pitch_videos v WHERE v.game_pk = p.game_pk)
      ORDER BY p.game_pk LIMIT ${maxGames}`.trim(),
  })
  if (error) throw new Error(error.message)

  let gamesIndexed = 0
  let rowsQueued = 0
  let gamesFailed = 0
  for (const row of data || []) {
    try {
      rowsQueued += await indexGame(Number(row.game_pk))
      gamesIndexed++
    } catch {
      gamesFailed++
    }
  }
  return { gamesIndexed, rowsQueued, gamesFailed }
}
