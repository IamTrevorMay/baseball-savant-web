/**
 * Backfill pitch_videos with Savant play_ids for a season.
 * Run: npx tsx scripts/backfill-pitch-videos.ts [year] [--limit N] [--force]
 *
 * For each distinct game_pk in `pitches` for the year, fetches the Savant game
 * feed (https://baseballsavant.mlb.com/gf?game_pk=...) once and upserts one
 * pitch_videos row per pitch with its play_id (status 'pending').
 *
 * Resumable: games already present in pitch_videos are skipped unless --force.
 * Upserts ignore conflicts, so rows already marked downloaded are never reset.
 * Rate-limited: 500ms between game feed requests (~15 min for a full season).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Parse .env.local manually
const envPath = resolve(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx)
  let val = trimmed.slice(eqIdx + 1)
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  if (!process.env[key]) process.env[key] = val
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(120000) })
    }
  }
)

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface FeedPitch {
  ab_number: number
  pitch_number: number
  play_id?: string
}

async function fetchGamePlayIds(gamePk: number): Promise<Map<string, string>> {
  const res = await fetch(`https://baseballsavant.mlb.com/gf?game_pk=${gamePk}`, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  if (!res.ok) throw new Error(`gf feed ${res.status}`)
  const feed = await res.json()

  const map = new Map<string, string>()
  for (const team of [feed.team_home, feed.team_away]) {
    if (!Array.isArray(team)) continue
    for (const p of team as FeedPitch[]) {
      if (p.ab_number == null || p.pitch_number == null) continue
      if (!p.play_id || !UUID_RE.test(p.play_id)) continue
      map.set(`${p.ab_number}|${p.pitch_number}`, p.play_id)
    }
  }
  return map
}

async function main() {
  const args = process.argv.slice(2)
  const year = parseInt(args.find(a => /^\d{4}$/.test(a)) || '') || new Date().getFullYear()
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : Infinity
  const force = args.includes('--force')

  console.log(`=== Backfilling pitch_videos play_ids for ${year} ===`)

  const { data: gameRows, error: gameErr } = await q(
    `SELECT DISTINCT game_pk FROM pitches WHERE game_year = ${year} ORDER BY game_pk`
  )
  if (gameErr) throw gameErr
  let gamePks = (gameRows || []).map((r: any) => Number(r.game_pk)).filter(Boolean)
  console.log(`${gamePks.length} games in pitches`)

  if (!force) {
    const { data: doneRows, error: doneErr } = await q(
      `SELECT DISTINCT game_pk FROM pitch_videos`
    )
    if (doneErr) throw doneErr
    const done = new Set((doneRows || []).map((r: any) => Number(r.game_pk)))
    gamePks = gamePks.filter((pk: number) => !done.has(pk))
    console.log(`${done.size} games already indexed, ${gamePks.length} to process`)
  }

  if (gamePks.length > limit) {
    gamePks = gamePks.slice(0, limit)
    console.log(`--limit: processing first ${limit}`)
  }

  let gamesOk = 0
  let gamesFailed = 0
  let rowsUpserted = 0

  for (let i = 0; i < gamePks.length; i++) {
    const gamePk = gamePks[i]
    try {
      const playIds = await fetchGamePlayIds(gamePk)
      if (playIds.size === 0) {
        console.log(`  ${gamePk}: no play_ids in feed, skipping`)
        gamesFailed++
        continue
      }

      const rows = Array.from(playIds.entries()).map(([key, playId]) => {
        const [ab, pitch] = key.split('|')
        return {
          game_pk: gamePk,
          at_bat_number: parseInt(ab),
          pitch_number: parseInt(pitch),
          play_id: playId,
          status: 'pending'
        }
      })

      // ignoreDuplicates: never reset rows the download worker already touched
      const { error: upErr } = await supabase
        .from('pitch_videos')
        .upsert(rows, {
          onConflict: 'game_pk,at_bat_number,pitch_number',
          ignoreDuplicates: true
        })
      if (upErr) throw upErr

      gamesOk++
      rowsUpserted += rows.length
    } catch (e: any) {
      console.log(`  ${gamePk}: FAILED — ${e.message}`)
      gamesFailed++
    }

    if ((i + 1) % 25 === 0 || i === gamePks.length - 1) {
      console.log(`[${i + 1}/${gamePks.length}] ok=${gamesOk} failed=${gamesFailed} rows=${rowsUpserted}`)
    }
    await sleep(500)
  }

  console.log(`\nDone. ${gamesOk} games, ${rowsUpserted} pitch rows, ${gamesFailed} failures.`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
