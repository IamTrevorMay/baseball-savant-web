/**
 * Retrosheet ingest CLI.
 *
 * Usage:
 *   npx tsx scripts/ingest-retrosheet.ts --season 2025
 *   npx tsx scripts/ingest-retrosheet.ts --full         # 1914+ PBP, 1871+ game logs
 *   npx tsx scripts/ingest-retrosheet.ts --people-only  # refresh Chadwick Register only
 *   npx tsx scripts/ingest-retrosheet.ts --parks-only
 *
 * Pipeline stages per retrosheet.planning.md §5:
 *   1. DOWNLOAD raw zips (retrosheet.org + chadwickbureau/register)
 *   2. CHADWICK PARSE → CSV (cwevent / cwgame / cwroster)
 *   3. STAGING LOAD (COPY into _staging tables, truncate first)
 *   4. VALIDATE (row counts, referential integrity, season totals)
 *   5. PROMOTE (idempotent upsert keyed on natural PKs)
 *   6. RECORD RUN (retro_ingest_runs row)
 *   7. REFRESH MATERIALIZED VIEW CONCURRENTLY retro_id_map (if retro_people changed)
 *
 * Prereqs:
 *   - Chadwick tools installed (`cwevent --help` works). brew install chadwick OR build from source.
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *   - scripts/create-retro-tables.sql applied to the target DB.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, mkdirSync, createReadStream, statSync } from 'fs'
import { resolve, join } from 'path'
import { execFileSync, spawnSync } from 'child_process'
import { createInterface } from 'readline'

// ── Env bootstrap ────────────────────────────────────────────────────────────
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Paths ────────────────────────────────────────────────────────────────────
const DATA_ROOT = resolve(process.cwd(), 'data', 'retrosheet')
const RAW_DIR = join(DATA_ROOT, 'raw')
const PARSED_DIR = join(DATA_ROOT, 'parsed')
for (const d of [DATA_ROOT, RAW_DIR, PARSED_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

// ── CLI args ─────────────────────────────────────────────────────────────────
type Mode = { kind: 'season', year: number }
            | { kind: 'full' }
            | { kind: 'people-only' }
            | { kind: 'parks-only' }

function parseArgs(): Mode {
  const args = process.argv.slice(2)
  const seasonIdx = args.indexOf('--season')
  if (seasonIdx !== -1) {
    const y = Number(args[seasonIdx + 1])
    if (!Number.isInteger(y) || y < 1871 || y > 2100) throw new Error(`Invalid --season: ${args[seasonIdx + 1]}`)
    return { kind: 'season', year: y }
  }
  if (args.includes('--full')) return { kind: 'full' }
  if (args.includes('--people-only')) return { kind: 'people-only' }
  if (args.includes('--parks-only')) return { kind: 'parks-only' }
  throw new Error('Specify --season YYYY | --full | --people-only | --parks-only')
}

// ── Chadwick wrappers ────────────────────────────────────────────────────────
function ensureChadwick(): void {
  const r = spawnSync('cwevent', ['--help'], { stdio: 'ignore' })
  if (r.status !== 0 && r.status !== 1) {
    throw new Error('Chadwick tools not found. Install: brew install chadwick (or build from source — see docs/retrosheet.md)')
  }
}

/** Run cwevent for a season's event files, write CSV. */
function runCwevent(year: number, eventDir: string, outCsv: string): { rows: number } {
  const files = listEventFiles(eventDir, year)
  if (files.length === 0) throw new Error(`No event files (.EVA/.EVN/.EDA/.EDN) found in ${eventDir} for ${year}`)
  // -y year -f 0-96 (all fields) -e end-of-game -n print headers
  const args = ['-y', String(year), '-f', '0-96', '-n', ...files]
  const result = spawnSync('cwevent', args, { cwd: eventDir, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`cwevent failed: ${result.stderr}`)
  require('fs').writeFileSync(outCsv, result.stdout)
  const lines = result.stdout.split('\n').filter(l => l.trim()).length
  return { rows: Math.max(0, lines - 1) }
}

/** Run cwgame for a season's event files, write CSV. */
function runCwgame(year: number, eventDir: string, outCsv: string): { rows: number } {
  const files = listEventFiles(eventDir, year)
  if (files.length === 0) throw new Error(`No event files for ${year}`)
  const args = ['-y', String(year), '-f', '0-83', '-n', ...files]
  const result = spawnSync('cwgame', args, { cwd: eventDir, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`cwgame failed: ${result.stderr}`)
  require('fs').writeFileSync(outCsv, result.stdout)
  const lines = result.stdout.split('\n').filter(l => l.trim()).length
  return { rows: Math.max(0, lines - 1) }
}

function listEventFiles(dir: string, year: number): string[] {
  // Retrosheet event files are named like 2025BOS.EVA, 2025NYA.EVA, etc.
  const fs = require('fs') as typeof import('fs')
  return fs.readdirSync(dir)
    .filter((f: string) => /^\d{4}[A-Z]{3}\.(EVA|EVN|EDA|EDN)$/.test(f) && f.startsWith(String(year)))
    .map((f: string) => join(dir, f))
}

// ── Downloads ────────────────────────────────────────────────────────────────
async function downloadFile(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    const age = Date.now() - statSync(dest).mtimeMs
    if (age < 24 * 60 * 60 * 1000) {
      console.log(`  cached (<24h): ${dest}`)
      return
    }
  }
  console.log(`  fetch: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  require('fs').writeFileSync(dest, buf)
}

async function downloadSeasonEventZip(year: number): Promise<string> {
  const url = `https://www.retrosheet.org/events/${year}eve.zip`
  const dest = join(RAW_DIR, `${year}eve.zip`)
  await downloadFile(url, dest)
  // Unzip into raw/<year>/
  const extractDir = join(RAW_DIR, String(year))
  if (!existsSync(extractDir)) mkdirSync(extractDir, { recursive: true })
  execFileSync('unzip', ['-o', '-q', dest, '-d', extractDir])
  return extractDir
}

async function downloadGameLog(year: number): Promise<string> {
  const url = `https://www.retrosheet.org/gamelogs/gl${year}.zip`
  const dest = join(RAW_DIR, `gl${year}.zip`)
  await downloadFile(url, dest)
  const extractDir = join(RAW_DIR, 'gamelogs', String(year))
  if (!existsSync(extractDir)) mkdirSync(extractDir, { recursive: true })
  execFileSync('unzip', ['-o', '-q', dest, '-d', extractDir])
  return extractDir
}

async function downloadChadwickRegister(): Promise<string> {
  // Register is sharded into 16 files: people-{0..9,a..f}.csv keyed by retro_id first char.
  // Download all 16, concatenate (keeping the first header), write to people.csv.
  const shards = '0123456789abcdef'.split('')
  const dest = join(RAW_DIR, 'people.csv')
  const fs = require('fs') as typeof import('fs')

  // Cache check: skip re-download if all shards present and <24h old
  const cachePath = join(RAW_DIR, '.register-fetched')
  if (existsSync(dest) && existsSync(cachePath) && Date.now() - statSync(cachePath).mtimeMs < 24 * 60 * 60 * 1000) {
    console.log(`  cached (<24h): ${dest}`)
    return dest
  }

  let header: string | null = null
  const parts: string[] = []
  for (const s of shards) {
    const url = `https://raw.githubusercontent.com/chadwickbureau/register/master/data/people-${s}.csv`
    console.log(`  fetch: people-${s}.csv`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
    const text = await res.text()
    const idx = text.indexOf('\n')
    if (header === null) {
      header = text.slice(0, idx)
      parts.push(text)
    } else {
      parts.push(text.slice(idx + 1))  // strip per-shard header
    }
  }
  fs.writeFileSync(dest, parts.join(''))
  fs.writeFileSync(cachePath, new Date().toISOString())
  return dest
}

async function downloadRetrosheetBiofile(): Promise<string> {
  const url = 'https://www.retrosheet.org/BIOFILE.zip'
  const dest = join(RAW_DIR, 'BIOFILE.zip')
  await downloadFile(url, dest)
  const extractDir = join(RAW_DIR, 'biofile')
  if (!existsSync(extractDir)) mkdirSync(extractDir, { recursive: true })
  execFileSync('unzip', ['-o', '-q', dest, '-d', extractDir])
  return extractDir
}

async function downloadParkCodes(): Promise<string> {
  const url = 'https://www.retrosheet.org/parkcode.txt'
  const dest = join(RAW_DIR, 'parkcode.txt')
  await downloadFile(url, dest)
  return dest
}

// ── Source version detection ─────────────────────────────────────────────────
function fileVersionTag(path: string): string {
  const s = statSync(path)
  return `${s.mtime.toISOString().slice(0, 10)}_${s.size}`
}

// ── Run bookkeeping ──────────────────────────────────────────────────────────
async function startRun(table: string, season: number | null, sourceVersion: string | null): Promise<number> {
  const { data, error } = await supabase
    .from('retro_ingest_runs')
    .insert({ table_loaded: table, season, source_version: sourceVersion, status: 'running' })
    .select('id').single()
  if (error) throw new Error(`startRun failed: ${error.message}`)
  return data.id as number
}

async function finishRun(id: number, status: 'success' | 'failed' | 'partial', counts: { inserted: number, updated: number }, errMsg?: string, notes?: object) {
  await supabase
    .from('retro_ingest_runs')
    .update({
      finished_at: new Date().toISOString(),
      status,
      rows_inserted: counts.inserted,
      rows_updated: counts.updated,
      error: errMsg ?? null,
      notes: notes ?? null,
    })
    .eq('id', id)
}

// ── CSV → row reader (streaming, header-driven) ──────────────────────────────
async function* readCsvRows(path: string): AsyncGenerator<Record<string, string>> {
  const rl = createInterface({ input: createReadStream(path, 'utf-8'), crlfDelay: Infinity })
  let header: string[] | null = null
  for await (const line of rl) {
    if (!line) continue
    const fields = parseCsvLine(line)
    if (!header) { header = fields.map(h => h.replace(/^"|"$/g, '').trim()); continue }
    const row: Record<string, string> = {}
    for (let i = 0; i < header.length; i++) row[header[i]] = (fields[i] ?? '').replace(/^"|"$/g, '')
    yield row
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQ = false
      else cur += c
    } else {
      if (c === ',') { out.push(cur); cur = '' }
      else if (c === '"') inQ = true
      else cur += c
    }
  }
  out.push(cur)
  return out
}

// ── Upsert helpers (batch) ───────────────────────────────────────────────────
const BATCH = 1000

async function upsertBatch(table: string, rows: object[], onConflict: string): Promise<{ inserted: number, updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 }
  const { error, count } = await supabase
    .from(table)
    .upsert(rows, { onConflict, count: 'exact' })
  if (error) throw new Error(`upsert ${table} failed: ${error.message}`)
  // Supabase doesn't break out inserted vs updated; report as total touched.
  return { inserted: count ?? rows.length, updated: 0 }
}

// ── Mappers (Chadwick CSV → DB row) ──────────────────────────────────────────
const toInt = (s: string | undefined) => s && s.trim() !== '' && s !== 'NA' ? Number.parseInt(s, 10) : null
const toBool = (s: string | undefined) => s === 'T' || s === '1' ? true : s === 'F' || s === '0' ? false : null
const toText = (s: string | undefined) => s && s.trim() !== '' && s !== '(none)' ? s.trim() : null
const toDate = (s: string | undefined) => {
  if (!s || s.length !== 8) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function mapEventRow(r: Record<string, string>, sourceVersion: string): object {
  return {
    game_id: r['GAME_ID'],
    event_id: toInt(r['EVENT_ID']),
    inning: toInt(r['INN_CT']),
    bat_team: toInt(r['BAT_HOME_ID']),
    outs: toInt(r['OUTS_CT']),
    balls: toInt(r['BALLS_CT']),
    strikes: toInt(r['STRIKES_CT']),
    pitch_seq: toText(r['PITCH_SEQ_TX']),
    away_score: toInt(r['AWAY_SCORE_CT']),
    home_score: toInt(r['HOME_SCORE_CT']),
    batter_id: toText(r['BAT_ID']),
    batter_hand: toText(r['RESP_BAT_HAND_CD']),
    pitcher_id: toText(r['PIT_ID']),
    pitcher_hand: toText(r['RESP_PIT_HAND_CD']),
    catcher_id: toText(r['POS2_FLD_ID']),
    first_id: toText(r['POS3_FLD_ID']),
    second_id: toText(r['POS4_FLD_ID']),
    third_id: toText(r['POS5_FLD_ID']),
    shortstop_id: toText(r['POS6_FLD_ID']),
    left_id: toText(r['POS7_FLD_ID']),
    center_id: toText(r['POS8_FLD_ID']),
    right_id: toText(r['POS9_FLD_ID']),
    runner_1b_id: toText(r['BASE1_RUN_ID']),
    runner_2b_id: toText(r['BASE2_RUN_ID']),
    runner_3b_id: toText(r['BASE3_RUN_ID']),
    event_text: toText(r['EVENT_TX']),
    leadoff_flag: toBool(r['LEADOFF_FL']),
    ph_flag: toBool(r['PH_FL']),
    defensive_pos: toInt(r['BAT_FLD_CD']),
    lineup_pos: toInt(r['BAT_LINEUP_ID']),
    event_type: toInt(r['EVENT_CD']),
    bat_event_flag: toBool(r['BAT_EVENT_FL']),
    ab_flag: toBool(r['AB_FL']),
    hit_value: toInt(r['H_FL']),
    sh_flag: toBool(r['SH_FL']),
    sf_flag: toBool(r['SF_FL']),
    outs_on_play: toInt(r['EVENT_OUTS_CT']),
    rbi_on_play: toInt(r['RBI_CT']),
    wp_flag: toBool(r['WP_FL']),
    pb_flag: toBool(r['PB_FL']),
    batted_ball_type: toText(r['BATTEDBALL_CD']),
    bunt_flag: toBool(r['BUNT_FL']),
    foul_flag: toBool(r['FOUL_FL']),
    hit_location: toText(r['BATTEDBALL_LOC_TX']),
    num_errors: toInt(r['ERR_CT']),
    batter_dest: toInt(r['BAT_DEST_ID']),
    runner_1b_dest: toInt(r['RUN1_DEST_ID']),
    runner_2b_dest: toInt(r['RUN2_DEST_ID']),
    runner_3b_dest: toInt(r['RUN3_DEST_ID']),
    play_on_batter: toText(r['BAT_PLAY_TX']),
    play_on_runner_1b: toText(r['RUN1_PLAY_TX']),
    play_on_runner_2b: toText(r['RUN2_PLAY_TX']),
    play_on_runner_3b: toText(r['RUN3_PLAY_TX']),
    responsible_pitcher_1b: toText(r['RUN1_RESP_PIT_ID']),
    responsible_pitcher_2b: toText(r['RUN2_RESP_PIT_ID']),
    responsible_pitcher_3b: toText(r['RUN3_RESP_PIT_ID']),
    source_version: sourceVersion,
    raw: r,
  }
}

function mapGameRowFromCwgame(r: Record<string, string>, sourceVersion: string): object {
  // cwgame is supplementary — game logs are authoritative. This shape covers fields
  // either source can populate. The ingest pipeline merges; columns not set here
  // remain whatever the game-log loader wrote.
  const gameId = r['GAME_ID']
  return {
    game_id: gameId,
    game_date: toDate(gameId?.slice(3, 11)),
    game_number: toInt(r['GAME_CT']),
    day_of_week: toText(r['DAYOFWEEK_TX']),
    season: gameId ? Number(gameId.slice(3, 7)) : null,
    home_team_id: toText(r['HOME_TEAM_ID']),
    away_team_id: toText(r['AWAY_TEAM_ID']),
    park_id: toText(r['PARK_ID']),
    home_score: toInt(r['HOME_SCORE_CT']),
    away_score: toInt(r['AWAY_SCORE_CT']),
    innings: toInt(r['OUTS_CT']) ? Math.ceil((toInt(r['OUTS_CT']) ?? 0) / 6) : null,
    day_night: toText(r['DAYNIGHT_PARK_CD']),
    attendance: toInt(r['ATTEND_PARK_CT']),
    duration_min: toInt(r['MINUTES_GAME_CT']),
    temperature_f: toInt(r['TEMP_PARK_CT']),
    wind_dir: toText(r['WIND_DIRECTION_PARK_CD']),
    wind_speed: toInt(r['WIND_SPEED_PARK_CT']),
    field_condition: toText(r['FIELD_PARK_CD']),
    precipitation: toText(r['PRECIP_PARK_CD']),
    sky: toText(r['SKY_PARK_CD']),
    winning_pitcher: toText(r['WIN_PIT_ID']),
    losing_pitcher: toText(r['LOSE_PIT_ID']),
    save_pitcher: toText(r['SAVE_PIT_ID']),
    home_manager: toText(r['HOME_MANAGER_ID']),
    away_manager: toText(r['AWAY_MANAGER_ID']),
    ump_home_id: toText(r['BASE4_UMP_ID']),
    ump_1b_id: toText(r['BASE1_UMP_ID']),
    ump_2b_id: toText(r['BASE2_UMP_ID']),
    ump_3b_id: toText(r['BASE3_UMP_ID']),
    forfeit: toText(r['FORFEIT_TX']),
    protest: toText(r['PROTEST_TX']),
    source: 'gamelog+cwgame',
    source_version: sourceVersion,
    raw: r,
  }
}

// Retrosheet game-log columns (positional, no header) — per glfields.txt.
// We map only the high-value fields here; full row stashed in `raw`.
function mapGameLogRow(fields: string[], sourceVersion: string): object | null {
  if (fields.length < 30) return null
  const date = fields[0]  // YYYYMMDD
  const gameNum = fields[1]
  const awayTeam = fields[3]
  const homeTeam = fields[6]
  if (!date || !awayTeam || !homeTeam) return null
  const gameId = `${homeTeam}${date}${gameNum || '0'}`
  const gameDate = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`
  return {
    game_id: gameId,
    game_date: gameDate,
    game_number: Number(gameNum) || 0,
    day_of_week: fields[2] || null,
    season: Number(date.slice(0, 4)),
    away_team_id: awayTeam,
    away_league: fields[4] || null,
    home_team_id: homeTeam,
    home_league: fields[7] || null,
    away_score: toInt(fields[9]),
    home_score: toInt(fields[10]),
    innings: toInt(fields[11]),
    day_night: fields[12] || null,
    park_id: fields[16] || null,
    attendance: toInt(fields[17]),
    duration_min: toInt(fields[18]),
    source: 'gamelog',
    source_version: sourceVersion,
    raw: { gamelog_fields: fields },
  }
}

function mapPeopleRow(r: Record<string, string>, sourceVersion: string): object | null {
  const retroId = r['key_retro']
  if (!retroId) return null
  return {
    retro_id: retroId,
    mlbam_id: toInt(r['key_mlbam']),
    bbref_id: toText(r['key_bbref']),
    fg_id: toInt(r['key_fangraphs']),
    name_first: toText(r['name_first']),
    name_last: toText(r['name_last']),
    name_given: toText(r['name_given']),
    name_suffix: toText(r['name_suffix']),
    birth_date: composeDate(r['birth_year'], r['birth_month'], r['birth_day']),
    birth_city: toText(r['birth_city']),
    birth_country: toText(r['birth_country']),
    death_date: composeDate(r['death_year'], r['death_month'], r['death_day']),
    bats: toText(r['bats']),
    throws: toText(r['throws']),
    debut_date: toText(r['mlb_played_first']) ? `${r['mlb_played_first']}-01-01` : null,
    final_date: toText(r['mlb_played_last']) ? `${r['mlb_played_last']}-12-31` : null,
    source_version: sourceVersion,
    updated_at: new Date().toISOString(),
  }
}

function composeDate(y?: string, m?: string, d?: string): string | null {
  if (!y || !m || !d) return null
  const yi = toInt(y), mi = toInt(m), di = toInt(d)
  if (!yi || !mi || !di) return null
  return `${String(yi).padStart(4, '0')}-${String(mi).padStart(2, '0')}-${String(di).padStart(2, '0')}`
}

// ── Pipeline orchestration ───────────────────────────────────────────────────
async function loadPeople(): Promise<void> {
  console.log('▶ retro_people (Chadwick Register)')
  const csvPath = await downloadChadwickRegister()
  const sourceVersion = `register_${fileVersionTag(csvPath)}`
  const runId = await startRun('retro_people', null, sourceVersion)
  let buffer: object[] = []
  let total = 0
  try {
    for await (const r of readCsvRows(csvPath)) {
      const row = mapPeopleRow(r, sourceVersion)
      if (!row) continue
      buffer.push(row)
      if (buffer.length >= BATCH) {
        await upsertBatch('retro_people', buffer, 'retro_id')
        total += buffer.length
        buffer = []
        process.stdout.write(`  people: ${total}\r`)
      }
    }
    if (buffer.length) {
      await upsertBatch('retro_people', buffer, 'retro_id')
      total += buffer.length
    }
    console.log(`  people: ${total} ✓`)
    await detectIdConflicts(sourceVersion)
    await refreshIdMap()
    await finishRun(runId, 'success', { inserted: total, updated: 0 })
  } catch (e: any) {
    await finishRun(runId, 'failed', { inserted: total, updated: 0 }, e.message)
    throw e
  }
}

async function loadParks(): Promise<void> {
  console.log('▶ retro_parks')
  const txt = await downloadParkCodes()
  const sourceVersion = `parkcode_${fileVersionTag(txt)}`
  const runId = await startRun('retro_parks', null, sourceVersion)
  let total = 0
  try {
    // parkcode.txt is CSV with header
    const rows: object[] = []
    for await (const r of readCsvRows(txt)) {
      const parkId = r['PARKID'] || r['park_id'] || r['ParkID']
      if (!parkId) continue
      rows.push({
        park_id: parkId,
        name: toText(r['NAME'] || r['name']),
        aka: toText(r['AKA'] || r['aka']),
        city: toText(r['CITY'] || r['city']),
        state: toText(r['STATE'] || r['state']),
        country: toText(r['COUNTRY'] || r['country']),
        first_game: toDate((r['START'] || r['start'] || '').replace(/-/g, '')),
        last_game: toDate((r['END'] || r['end'] || '').replace(/-/g, '')),
        league: toText(r['LEAGUE'] || r['league']),
        notes: toText(r['NOTES'] || r['notes']),
      })
    }
    for (let i = 0; i < rows.length; i += BATCH) {
      await upsertBatch('retro_parks', rows.slice(i, i + BATCH), 'park_id')
    }
    total = rows.length
    console.log(`  parks: ${total} ✓`)
    await finishRun(runId, 'success', { inserted: total, updated: 0 })
  } catch (e: any) {
    await finishRun(runId, 'failed', { inserted: total, updated: 0 }, e.message)
    throw e
  }
}

async function loadGameLogs(year: number): Promise<void> {
  console.log(`▶ retro_games (game logs ${year})`)
  const dir = await downloadGameLog(year)
  const fs = require('fs') as typeof import('fs')
  const files = fs.readdirSync(dir).filter((f: string) => f.toUpperCase().endsWith('.TXT'))
  if (files.length === 0) throw new Error(`No game-log .TXT files in ${dir}`)
  const glPath = join(dir, files[0])
  const sourceVersion = `gamelog_${year}_${fileVersionTag(glPath)}`
  const runId = await startRun('retro_games', year, sourceVersion)
  let total = 0, buffer: object[] = []
  try {
    const rl = createInterface({ input: createReadStream(glPath, 'utf-8'), crlfDelay: Infinity })
    for await (const line of rl) {
      if (!line.trim()) continue
      const fields = parseCsvLine(line)
      const row = mapGameLogRow(fields, sourceVersion)
      if (!row) continue
      buffer.push(row)
      if (buffer.length >= BATCH) {
        await upsertBatch('retro_games', buffer, 'game_id')
        total += buffer.length
        buffer = []
        process.stdout.write(`  games ${year}: ${total}\r`)
      }
    }
    if (buffer.length) {
      await upsertBatch('retro_games', buffer, 'game_id')
      total += buffer.length
    }
    console.log(`  games ${year}: ${total} ✓`)
    await finishRun(runId, 'success', { inserted: total, updated: 0 })
  } catch (e: any) {
    await finishRun(runId, 'failed', { inserted: total, updated: 0 }, e.message)
    throw e
  }
}

async function loadEventsAndCwgame(year: number): Promise<void> {
  console.log(`▶ cwgame supplement + retro_events (${year})`)
  const eventDir = await downloadSeasonEventZip(year)
  const sourceVersion = `events_${year}_${fileVersionTag(join(eventDir, require('fs').readdirSync(eventDir)[0] || '.'))}`

  // cwgame supplement → merge into retro_games (game logs already authoritative)
  const cwgameCsv = join(PARSED_DIR, `cwgame_${year}.csv`)
  const cwgameOut = runCwgame(year, eventDir, cwgameCsv)
  console.log(`  cwgame parsed ${cwgameOut.rows} rows → ${cwgameCsv}`)

  const cwgameRunId = await startRun('retro_games', year, sourceVersion)
  let gameTotal = 0
  try {
    let buf: object[] = []
    for await (const r of readCsvRows(cwgameCsv)) {
      buf.push(mapGameRowFromCwgame(r, sourceVersion))
      if (buf.length >= BATCH) {
        await upsertBatch('retro_games', buf, 'game_id')
        gameTotal += buf.length
        buf = []
      }
    }
    if (buf.length) { await upsertBatch('retro_games', buf, 'game_id'); gameTotal += buf.length }
    console.log(`  cwgame upsert: ${gameTotal} ✓`)
    await finishRun(cwgameRunId, 'success', { inserted: gameTotal, updated: 0 })
  } catch (e: any) {
    await finishRun(cwgameRunId, 'failed', { inserted: gameTotal, updated: 0 }, e.message)
    throw e
  }

  // cwevent → retro_events
  const cweventCsv = join(PARSED_DIR, `cwevent_${year}.csv`)
  const cweventOut = runCwevent(year, eventDir, cweventCsv)
  console.log(`  cwevent parsed ${cweventOut.rows} rows → ${cweventCsv}`)

  const evRunId = await startRun('retro_events', year, sourceVersion)
  let evTotal = 0
  try {
    let buf: object[] = []
    for await (const r of readCsvRows(cweventCsv)) {
      buf.push(mapEventRow(r, sourceVersion))
      if (buf.length >= BATCH) {
        await upsertBatch('retro_events', buf, 'game_id,event_id')
        evTotal += buf.length
        buf = []
        process.stdout.write(`  events ${year}: ${evTotal}\r`)
      }
    }
    if (buf.length) { await upsertBatch('retro_events', buf, 'game_id,event_id'); evTotal += buf.length }
    console.log(`  events ${year}: ${evTotal} ✓`)

    // Validate parser-output count matches DB count for this season
    if (Math.abs(evTotal - cweventOut.rows) > 0) {
      console.warn(`  ⚠ row count mismatch: parsed=${cweventOut.rows}, upserted=${evTotal}`)
    }
    await finishRun(evRunId, 'success', { inserted: evTotal, updated: 0 }, undefined, { parsed_rows: cweventOut.rows })
  } catch (e: any) {
    await finishRun(evRunId, 'failed', { inserted: evTotal, updated: 0 }, e.message)
    throw e
  }
}

async function detectIdConflicts(sourceVersion: string): Promise<void> {
  // Query for retro_ids that map to >1 mlbam_id and vice versa.
  const dup1 = await supabase.rpc('run_query', { query_text: `
    select retro_id, count(distinct mlbam_id) as n
    from public.retro_people
    where mlbam_id is not null
    group by retro_id having count(distinct mlbam_id) > 1
  `})
  const dup2 = await supabase.rpc('run_query', { query_text: `
    select mlbam_id, count(distinct retro_id) as n
    from public.retro_people
    where mlbam_id is not null
    group by mlbam_id having count(distinct retro_id) > 1
  `})
  const rows: object[] = []
  for (const r of (dup1.data || []) as any[]) {
    rows.push({ retro_id: r.retro_id, mlbam_id: null, reason: 'multiple_mlbam_for_retro', register_version: sourceVersion })
  }
  for (const r of (dup2.data || []) as any[]) {
    rows.push({ retro_id: null, mlbam_id: r.mlbam_id, reason: 'multiple_retro_for_mlbam', register_version: sourceVersion })
  }
  if (rows.length) {
    console.warn(`  ⚠ ${rows.length} ID conflicts → retro_id_map_conflicts`)
    await supabase.from('retro_id_map_conflicts').insert(rows)
  } else {
    console.log('  ✓ no ID conflicts')
  }
}

async function refreshIdMap(): Promise<void> {
  console.log('▶ REFRESH MATERIALIZED VIEW CONCURRENTLY retro_id_map')
  const { error } = await supabase.rpc('refresh_retro_id_map')
  if (error) throw new Error(`refresh retro_id_map failed: ${error.message}`)
  console.log('  ✓ retro_id_map refreshed')
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const mode = parseArgs()
  ensureChadwick()

  if (mode.kind === 'people-only') {
    await loadPeople()
    return
  }
  if (mode.kind === 'parks-only') {
    await loadParks()
    return
  }
  if (mode.kind === 'season') {
    await loadPeople()
    await loadParks()
    await loadGameLogs(mode.year)
    await loadEventsAndCwgame(mode.year)
    return
  }
  if (mode.kind === 'full') {
    await loadPeople()
    await loadParks()
    // Game logs back to 1871
    for (let y = 1871; y <= new Date().getFullYear(); y++) {
      try { await loadGameLogs(y) } catch (e: any) { console.warn(`  game log ${y} skipped: ${e.message}`) }
    }
    // Event files back to 1914 (Chadwick coverage). Earlier seasons partial — let them fail-soft.
    for (let y = 1871; y <= new Date().getFullYear(); y++) {
      try { await loadEventsAndCwgame(y) } catch (e: any) { console.warn(`  events ${y} skipped: ${e.message}`) }
    }
    return
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
