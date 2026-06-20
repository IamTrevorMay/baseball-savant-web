/**
 * Build retro_starter_outings — one row per (game_id, starting pitcher) summarizing:
 *   - first inning a hit was allowed (NULL if none)
 *   - last inning pitched
 *   - total hits allowed
 *
 * Streamed per-season so each batch fits in DB timeout. Idempotent (delete-then-insert per season).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq)
    let v = t.slice(eq + 1)
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function buildChunk(prefix: string): Promise<number> {
  // Chunk by home-team prefix (first 3 chars of game_id). ~30 prefixes × ~8K games = manageable per call.
  // Uses btree on (game_id, event_id) for the starter range scan; aggregates only events matching prefix.
  const sql = `
    insert into public.retro_starter_outings (game_id, pitcher_id, first_hit_inning, last_inning, hits_allowed)
    select
      e.game_id,
      e.pitcher_id,
      min(e.inning) filter (where e.hit_value > 0) as first_hit_inning,
      max(e.inning) as last_inning,
      count(*) filter (where e.hit_value > 0) as hits_allowed
    from public.retro_events e
    join (
      select game_id, pitcher_id
      from public.retro_events
      where game_id >= '${prefix}' and game_id < '${nextPrefix(prefix)}'
        and event_id = 1
        and pitcher_id is not null
    ) s on s.game_id = e.game_id and s.pitcher_id = e.pitcher_id
    where e.game_id >= '${prefix}' and e.game_id < '${nextPrefix(prefix)}'
    group by e.game_id, e.pitcher_id
    on conflict (game_id, pitcher_id) do update set
      first_hit_inning = excluded.first_hit_inning,
      last_inning      = excluded.last_inning,
      hits_allowed     = excluded.hits_allowed
    returning 1
  `
  const { error, data } = await supabase.rpc('run_mutation', { query_text: sql.trim() })
  if (error) throw new Error(`prefix ${prefix} failed: ${error.message}`)
  return Array.isArray(data) ? data.length : 0
}

function nextPrefix(p: string): string {
  // Lexicographic next string of same length. For 'BOS' → 'BOT'.
  const arr = p.split('')
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] < 'Z') { arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1); return arr.join('') }
    arr[i] = 'A'
  }
  return p + 'A'  // overflow guard
}

async function main() {
  // 3-char team prefixes — all alphabetic combos. Most won't have games; quick fail-soft.
  const prefixes: string[] = []
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // Common Retrosheet 3-letter team codes — primary chunks. Fall back to A-Z scan if needed.
  const teams = [
    'ALT','ANA','ARI','ATL','BAL','BOS','BRO','BSN','BUF','CAL','CHA','CHF','CHN','CHP','CIN','CL1','CL2','CLE','CLP','COL',
    'DET','DTN','FLO','HAR','HOU','IND','KCA','KCF','KCN','LAA','LAN','MIA','MIL','MIN','MLA','MLN','MLU','MON','NEW','NY1',
    'NY2','NY4','NYA','NYN','NYP','OAK','PH1','PH2','PHA','PHI','PHN','PHP','PIT','PRO','RIC','RO1','SDN','SEA','SEP','SFN',
    'SL1','SL2','SLA','SLF','SLN','SR1','SR2','STL','SYR','TBA','TEX','TOR','TRO','WAS','WOR','WS1','WS2','WS7','WS8','WSF','WSU',
  ]
  for (const t of teams) prefixes.push(t)

  console.log(`Building for ${prefixes.length} team prefixes`)

  let totalRows = 0
  for (const p of prefixes) {
    const start = Date.now()
    try {
      const n = await buildChunk(p)
      const ms = Date.now() - start
      if (n > 0) console.log(`  ${p}: ${n} outings (${ms}ms)`)
      totalRows += n
    } catch (e: any) {
      console.warn(`  ${p}: FAILED — ${e.message}`)
    }
  }

  console.log(`Done. Total inserted: ${totalRows}`)
}

main().catch(e => { console.error(e); process.exit(1) })
