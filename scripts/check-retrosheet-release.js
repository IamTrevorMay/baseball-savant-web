#!/usr/bin/env node
/**
 * check-retrosheet-release.js
 *
 * Polled by .github/workflows/retro-ingest.yml. Compares the Last-Modified header
 * on Retrosheet's most-recent annual event zip against the last `source_version`
 * recorded in `retro_ingest_runs` for that season. Emits GH Actions outputs:
 *   - new_release=true|false
 *   - season=YYYY (the season whose data appears updated)
 *
 * No Node deps beyond the stdlib + @supabase/supabase-js (already in repo).
 *
 * Env required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GITHUB_OUTPUT (set automatically by GH Actions)
 */
import { createClient } from '@supabase/supabase-js'
import { appendFileSync } from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function emit(key, value) {
  console.log(`${key}=${value}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
}

async function lastModified(url) {
  const res = await fetch(url, { method: 'HEAD' })
  if (!res.ok) throw new Error(`HEAD ${url} -> ${res.status}`)
  const lm = res.headers.get('last-modified')
  const sz = res.headers.get('content-length')
  if (!lm || !sz) throw new Error(`No Last-Modified/Content-Length on ${url}`)
  return { date: new Date(lm).toISOString().slice(0, 10), size: Number(sz) }
}

async function lastIngestedVersion(table, season) {
  const { data, error } = await supabase
    .from('retro_ingest_runs')
    .select('source_version')
    .eq('table_loaded', table)
    .eq('season', season)
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`query failed: ${error.message}`)
  return data?.[0]?.source_version ?? null
}

async function main() {
  // Check current + previous season. Retrosheet typically updates current-season
  // data through the year and freezes prior-season in the offseason.
  const year = new Date().getUTCFullYear()
  let detected = null

  for (const season of [year, year - 1]) {
    try {
      const url = `https://www.retrosheet.org/events/${season}eve.zip`
      const remote = await lastModified(url)
      const remoteTag = `events_${season}_${remote.date}_${remote.size}`
      const local = await lastIngestedVersion('retro_events', season)
      console.log(`  season ${season}: remote=${remoteTag} local=${local ?? '(none)'}`)
      if (local !== remoteTag) {
        detected = season
        break
      }
    } catch (e) {
      console.warn(`  season ${season}: ${e.message}`)
    }
  }

  if (detected) {
    emit('new_release', 'true')
    emit('season', String(detected))
  } else {
    emit('new_release', 'false')
    emit('season', '')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
