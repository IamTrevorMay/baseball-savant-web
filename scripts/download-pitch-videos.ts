/**
 * Download worker for the pitch video archive.
 * Run: npx tsx scripts/download-pitch-videos.ts [--limit N] [--concurrency N] [--root PATH] [--include-failed] [--max-pitches N]
 *
 * Drains `pitch_videos` rows with status 'pending' (and 'failed' with
 * attempts < 3 when --include-failed): resolves each play_id's mp4 via the
 * Savant sporty-videos page, downloads it to the archive root, and updates
 * the row. Designed to run on the machine with the Mayday Cloud NAS mounted
 * (/Volumes/May Server); override root with --root or PITCH_VIDEO_ROOT for
 * testing.
 *
 * Layout: {root}/PitchVideos/{year}/{game_pk}/{play_id}.mp4
 * file_path is stored relative to root (e.g. /PitchVideos/2026/745123/xxx.mp4)
 * so it plugs straight into Mayday's /api/nas/stream?path=... endpoint.
 *
 * Status transitions:
 *   pending → downloaded  (mp4 on disk, size recorded)
 *   pending → missing     (page loads but has no clip — terminal, not retried)
 *   pending → failed      (network/HTTP error; attempts++, retried up to 3x)
 *
 * Resumable + idempotent: --limit caps games per run, existing files on disk
 * are adopted without re-downloading. Stops if free space drops below 100GB.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, mkdirSync, statSync, renameSync, unlinkSync, createWriteStream } from 'fs'
import { resolve, dirname } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { execSync } from 'child_process'

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
// Season-wide game list joins 500k+ index rows against pitches — needs the 120s RPC
const qLong = (sql: string) => supabase.rpc('run_query_long', { query_text: sql.trim() })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const MAX_ATTEMPTS = 3
const MIN_FREE_GB = 100
const MP4_RE = /https:\/\/sporty-clips\.mlb\.com\/[^"'\s\\]+\.mp4/

interface VideoRow {
  game_pk: number
  at_bat_number: number
  pitch_number: number
  play_id: string
  status: string
  attempts: number
}

function freeSpaceGB(path: string): number {
  const out = execSync(`df -k "${path}" | tail -1`).toString().trim().split(/\s+/)
  return parseInt(out[3]) / 1024 / 1024
}

async function resolveMp4Url(playId: string): Promise<string | null> {
  const res = await fetch(`https://baseballsavant.mlb.com/sporty-videos?playId=${playId}`, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  if (!res.ok) throw new Error(`sporty-videos ${res.status}`)
  const html = await res.text()
  const m = html.match(MP4_RE)
  return m ? m[0] : null
}

async function downloadTo(url: string, dest: string): Promise<number> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(120000),
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  if (!res.ok || !res.body) throw new Error(`mp4 fetch ${res.status}`)
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = `${dest}.part`
  try {
    await pipeline(Readable.fromWeb(res.body as any), createWriteStream(tmp))
    const size = statSync(tmp).size
    if (size === 0) throw new Error('empty download')
    renameSync(tmp, dest)
    return size
  } catch (e) {
    try { unlinkSync(tmp) } catch {}
    throw e
  }
}

async function processPitch(row: VideoRow, year: number, root: string): Promise<Partial<VideoRow> & { file_path?: string; size_bytes?: number; error?: string | null; downloaded_at?: string }> {
  const relPath = `/PitchVideos/${year}/${row.game_pk}/${row.play_id}.mp4`
  const absPath = `${root}${relPath}`

  // Adopt files already on disk (crashed run, manual copy)
  if (existsSync(absPath) && statSync(absPath).size > 0) {
    return {
      status: 'downloaded',
      file_path: relPath,
      size_bytes: statSync(absPath).size,
      attempts: row.attempts,
      error: null,
      downloaded_at: new Date().toISOString()
    }
  }

  try {
    const mp4Url = await resolveMp4Url(row.play_id)
    if (!mp4Url) {
      return { status: 'missing', attempts: row.attempts + 1, error: 'no clip on savant page' }
    }
    const size = await downloadTo(mp4Url, absPath)
    return {
      status: 'downloaded',
      file_path: relPath,
      size_bytes: size,
      attempts: row.attempts + 1,
      error: null,
      downloaded_at: new Date().toISOString()
    }
  } catch (e: any) {
    const attempts = row.attempts + 1
    return {
      status: attempts >= MAX_ATTEMPTS ? 'missing' : 'failed',
      attempts,
      error: e.message?.slice(0, 500)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const argVal = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }
  const gameLimit = parseInt(argVal('--limit') || '') || Infinity
  const concurrency = parseInt(argVal('--concurrency') || '') || 3
  const root = argVal('--root') || process.env.PITCH_VIDEO_ROOT || '/Volumes/May Server'
  const includeFailed = args.includes('--include-failed')
  const maxPitches = parseInt(argVal('--max-pitches') || '') || Infinity
  // Only process games on/after this date (YYYY-MM-DD). Earlier games stay
  // pending and fill organically via the on-demand queue.
  const dateFrom = argVal('--date-from') || ''
  if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    console.error(`Invalid --date-from (want YYYY-MM-DD): ${dateFrom}`)
    process.exit(1)
  }

  if (!existsSync(root)) {
    console.error(`Archive root not found: ${root} — is the NAS mounted?`)
    process.exit(1)
  }
  console.log(`=== Pitch video download worker ===`)
  console.log(`root=${root} concurrency=${concurrency} limit=${gameLimit === Infinity ? 'none' : gameLimit} dateFrom=${dateFrom || 'none'} freeGB=${freeSpaceGB(root).toFixed(0)}`)

  const statusFilter = includeFailed
    ? `(status = 'pending' OR (status = 'failed' AND attempts < ${MAX_ATTEMPTS}))`
    : `status = 'pending'`

  // Work game by game: one year lookup per game, one status upsert per game
  const { data: gameRows, error: gameErr } = await qLong(`
    SELECT v.game_pk, max(p.game_year) AS game_year, count(*) AS n
    FROM pitch_videos v
    LEFT JOIN pitches p ON p.game_pk = v.game_pk
      AND p.at_bat_number = v.at_bat_number AND p.pitch_number = v.pitch_number
    WHERE ${statusFilter}
    GROUP BY v.game_pk
    ${dateFrom ? `HAVING max(p.game_date) >= '${dateFrom}'` : ''}
    ORDER BY v.game_pk
    ${gameLimit !== Infinity ? `LIMIT ${gameLimit}` : ''}
  `)
  if (gameErr) throw gameErr
  const games = (gameRows || []) as { game_pk: number; game_year: number | null; n: number }[]
  const totalPitches = games.reduce((s, g) => s + Number(g.n), 0)
  console.log(`${games.length} games, ${totalPitches} pitches to process`)

  let done = 0
  let downloaded = 0
  let missing = 0
  let failed = 0
  let bytes = 0

  for (const game of games) {
    if (freeSpaceGB(root) < MIN_FREE_GB) {
      console.error(`Free space below ${MIN_FREE_GB}GB — stopping. Resume after freeing space.`)
      break
    }

    const year = Number(game.game_year) || new Date().getFullYear()
    const { data: rows, error: rowErr } = await q(`
      SELECT game_pk, at_bat_number, pitch_number, play_id, status, attempts
      FROM pitch_videos
      WHERE game_pk = ${game.game_pk} AND ${statusFilter} AND play_id IS NOT NULL
    `)
    if (rowErr) { console.log(`  ${game.game_pk}: claim query failed`); continue }
    let pitchRows = (rows || []) as VideoRow[]
    const processedSoFar = downloaded + missing + failed
    if (processedSoFar + pitchRows.length > maxPitches) {
      pitchRows = pitchRows.slice(0, Math.max(0, maxPitches - processedSoFar))
      if (pitchRows.length === 0) break
    }

    const updates: any[] = []
    for (let i = 0; i < pitchRows.length; i += concurrency) {
      const batch = pitchRows.slice(i, i + concurrency)
      const results = await Promise.all(batch.map(r => processPitch(r, year, root)))
      results.forEach((res, j) => {
        const r = batch[j]
        updates.push({
          game_pk: r.game_pk,
          at_bat_number: r.at_bat_number,
          pitch_number: r.pitch_number,
          play_id: r.play_id,
          ...res
        })
        if (res.status === 'downloaded') { downloaded++; bytes += res.size_bytes || 0 }
        else if (res.status === 'missing') missing++
        else failed++
      })
      await sleep(300)
    }

    const { error: upErr } = await supabase
      .from('pitch_videos')
      .upsert(updates, { onConflict: 'game_pk,at_bat_number,pitch_number' })
    if (upErr) console.log(`  ${game.game_pk}: status upsert failed — ${upErr.message}`)

    done++
    console.log(`[${done}/${games.length}] game ${game.game_pk}: ok=${downloaded} missing=${missing} failed=${failed} total=${(bytes / 1e9).toFixed(1)}GB`)
  }

  console.log(`\nDone. downloaded=${downloaded} missing=${missing} failed=${failed} size=${(bytes / 1e9).toFixed(1)}GB`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
