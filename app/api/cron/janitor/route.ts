import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const maxDuration = 120

const EXPECTED_JOBS = ['pitches', 'milb-pitches', 'roster', 'player-stats', 'wbc'] as const
type Job = typeof EXPECTED_JOBS[number]

const SAVANT_GAME_TYPE_MAP: Record<string, string> = {
  R: 'R|',
  S: 'S|',
  P: 'P|',
}

// ── Pacific-time helpers ────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for "now" in America/Los_Angeles. */
function todayPacific(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA gives YYYY-MM-DD directly.
  return fmt.format(new Date())
}

/** Returns YYYY-MM-DD for "yesterday" in America/Los_Angeles. */
function yesterdayPacific(): string {
  const today = todayPacific()
  const [y, m, d] = today.split('-').map(Number)
  // Subtract one day in UTC space — safe because we're operating on a date-only value.
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Pacific timestamp for the report header, e.g. "2026-04-26 06:01 PT". */
function nowPacificStamp(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  // en-CA → "2026-04-26, 06:01"
  const parts = fmt.format(new Date()).replace(',', '')
  return `${parts} PT`
}

/** N days ago (YYYY-MM-DD) relative to today Pacific. */
function nDaysAgoPacific(n: number): string {
  const today = todayPacific()
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - n)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// ── CSV parser (RFC 4180) ───────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let i = 0
  while (i <= line.length) {
    if (i === line.length) { fields.push(''); break }
    if (line[i] === '"') {
      let val = ''
      i++
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { val += '"'; i += 2 }
          else { i++; break }
        } else { val += line[i]; i++ }
      }
      fields.push(val)
      if (i < line.length && line[i] === ',') i++
    } else {
      const next = line.indexOf(',', i)
      if (next === -1) { fields.push(line.slice(i)); break }
      fields.push(line.slice(i, next))
      i = next + 1
    }
  }
  return fields
}

/**
 * Fetches yesterday's Savant CSV (regular season only) using the same URL
 * shape as `syncPitches` in app/api/update/route.ts. Returns row count and
 * distinct pitcher/batter IDs. Throws on HTTP errors so the caller can flag.
 */
async function fetchSavantYesterday(date: string): Promise<{
  rowCount: number
  pitcherIds: number[]
  batterIds: number[]
  pitcherNames: Map<number, string>
}> {
  const hfGT = SAVANT_GAME_TYPE_MAP['R']
  const params = new URLSearchParams({
    all: 'true', hfPT: '', hfAB: '', hfGT, hfPR: '', hfZ: '',
    stadium: '', hfBBL: '', hfNewZones: '', hfPull: '', hfC: '',
    hfSea: '', hfSit: '', player_type: 'pitcher', hfOuts: '',
    opponent: '', pitcher_throws: '', batter_stands: '', hfSA: '',
    game_date_gt: date, game_date_lt: date,
    hfMo: '', team: '', home_road: '', hfRO: '', position: '',
    hfInfield: '', hfOutfield: '', hfInn: '', hfBBT: '', hfFlag: '',
    metric_1: '', group_by: 'name', min_pitches: '0',
    min_results: '0', min_pas: '0', sort_col: 'pitches',
    player_event_sort: 'api_p_release_speed', sort_order: 'desc',
    type: 'details',
  })
  const url = `https://baseballsavant.mlb.com/statcast_search/csv?${params}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(90000) })
  if (!resp.ok) throw new Error(`Savant returned ${resp.status}`)

  const csv = (await resp.text()).replace(/^﻿/, '')
  if (csv.length < 100) {
    return { rowCount: 0, pitcherIds: [], batterIds: [], pitcherNames: new Map() }
  }

  const lines = csv.split('\n')
  const headers = parseCSVLine(lines[0]).map(h => h.trim()).filter(h => h !== '')
  const idxPitcher = headers.indexOf('pitcher')
  const idxBatter = headers.indexOf('batter')
  const idxName = headers.indexOf('player_name')
  const idxGamePk = headers.indexOf('game_pk')

  const pitcherSet = new Set<number>()
  const batterSet = new Set<number>()
  const nameMap = new Map<number, string>()
  let rowCount = 0

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseCSVLine(lines[i])
    if (vals.length < headers.length) continue
    if (idxGamePk >= 0 && !vals[idxGamePk]?.trim()) continue
    rowCount++

    if (idxPitcher >= 0) {
      const p = Number(vals[idxPitcher])
      if (Number.isFinite(p) && p > 0) {
        pitcherSet.add(p)
        if (idxName >= 0) {
          const n = vals[idxName]?.trim()
          if (n) nameMap.set(p, n)
        }
      }
    }
    if (idxBatter >= 0) {
      const b = Number(vals[idxBatter])
      if (Number.isFinite(b) && b > 0) batterSet.add(b)
    }
  }

  return {
    rowCount,
    pitcherIds: [...pitcherSet],
    batterIds: [...batterSet],
    pitcherNames: nameMap,
  }
}

// ── Cron health (A) ─────────────────────────────────────────────────────────

interface CronHealthEntry {
  job: Job
  status: 'ok' | 'missing' | 'failed' | 'stuck' | 'slow'
  message: string
  durationMs?: number | null
  avg7dMs?: number | null
  errorMessage?: string | null
}

async function checkCronHealth(): Promise<CronHealthEntry[]> {
  const sinceIso = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
  const since7dIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Most recent run within last 20h per job.
  const { data: recentRows } = await supabaseAdmin
    .from('cron_runs')
    .select('job, started_at, finished_at, status, duration_ms, error_message')
    .gte('started_at', sinceIso)
    .order('started_at', { ascending: false })

  // Trailing 7-day successful runs (for avg duration).
  const { data: weekRows } = await supabaseAdmin
    .from('cron_runs')
    .select('job, status, duration_ms')
    .gte('started_at', since7dIso)
    .eq('status', 'success')

  const recentByJob = new Map<string, any>()
  for (const r of (recentRows || []) as any[]) {
    if (!recentByJob.has(r.job)) recentByJob.set(r.job, r)
  }

  const avgByJob = new Map<string, number>()
  const sumByJob = new Map<string, { sum: number; n: number }>()
  for (const r of (weekRows || []) as any[]) {
    if (typeof r.duration_ms !== 'number') continue
    const cur = sumByJob.get(r.job) || { sum: 0, n: 0 }
    cur.sum += r.duration_ms
    cur.n += 1
    sumByJob.set(r.job, cur)
  }
  for (const [job, { sum, n }] of sumByJob.entries()) {
    if (n > 0) avgByJob.set(job, sum / n)
  }

  const results: CronHealthEntry[] = []
  for (const job of EXPECTED_JOBS) {
    const row = recentByJob.get(job)
    const avg = avgByJob.get(job) ?? null

    if (!row) {
      results.push({
        job,
        status: 'missing',
        message: 'No run recorded in the last 20 hours (cron did not run, or has not been wired to trackCronRun yet).',
        avg7dMs: avg,
      })
      continue
    }

    if (row.status === 'error') {
      results.push({
        job,
        status: 'failed',
        message: `Failed at ${row.started_at}: ${row.error_message || 'unknown error'}`,
        durationMs: row.duration_ms,
        avg7dMs: avg,
        errorMessage: row.error_message || null,
      })
      continue
    }

    if (row.status === 'running') {
      const startedMs = new Date(row.started_at).getTime()
      const ageH = (Date.now() - startedMs) / (1000 * 60 * 60)
      if (!row.finished_at && ageH > 4) {
        results.push({
          job,
          status: 'stuck',
          message: `Running since ${row.started_at} (>4h old, no finished_at).`,
          avg7dMs: avg,
        })
        continue
      }
      // Still running but recent — treat as ok-ish but flag as missing-completed.
      results.push({
        job,
        status: 'ok',
        message: `In progress (started ${row.started_at}).`,
        avg7dMs: avg,
      })
      continue
    }

    // success
    const dur = row.duration_ms
    if (avg && typeof dur === 'number' && dur > avg * 3 && avg > 0) {
      results.push({
        job,
        status: 'slow',
        message: `Succeeded in ${dur}ms vs 7d-avg ${Math.round(avg)}ms (>3×).`,
        durationMs: dur,
        avg7dMs: avg,
      })
    } else {
      results.push({
        job,
        status: 'ok',
        message: typeof dur === 'number' ? `Succeeded in ${dur}ms.` : 'Succeeded.',
        durationMs: dur,
        avg7dMs: avg,
      })
    }
  }

  return results
}

// ── Volume sanity (B) ───────────────────────────────────────────────────────

interface VolumeEntry {
  table: string
  yesterdayCount: number
  avg7d: number
  pct: number
  flag: string | null
}

async function checkVolume(table: 'pitches' | 'milb_pitches', yesterday: string): Promise<VolumeEntry> {
  // Yesterday count
  const { count: yCount } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('game_date', yesterday)

  // Trailing 7-day, dates 2..8 ago.
  const days: string[] = []
  for (let i = 2; i <= 8; i++) days.push(nDaysAgoPacific(i))

  const counts: number[] = []
  for (const d of days) {
    const { count } = await supabaseAdmin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('game_date', d)
    counts.push(count ?? 0)
  }

  const avg = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0
  const yesterdayCount = yCount ?? 0
  const pct = avg > 0 ? yesterdayCount / avg : 0

  let flag: string | null = null
  if (avg >= 100) {
    if (pct < 0.5) {
      flag = `${table} volume yesterday: ${yesterdayCount} vs 7d-avg ${Math.round(avg)} (${Math.round(pct * 100)}% — possibly off-day or partial slate)`
    } else if (pct > 2.0) {
      flag = `${table} volume yesterday: ${yesterdayCount} vs 7d-avg ${Math.round(avg)} (${Math.round(pct * 100)}% — abnormally high)`
    }
  }

  return { table, yesterdayCount, avg7d: avg, pct, flag }
}

// ── Silent-drop / orphan detection (C) ──────────────────────────────────────

interface OrphanResult {
  csvRows: number
  dbRows: number
  delta: number
  unknownPitchers: number[]
  unknownBatters: number[]
  pitcherNames: Map<number, string>
  flags: string[]
}

async function checkOrphans(yesterday: string): Promise<OrphanResult> {
  const flags: string[] = []
  let csv: Awaited<ReturnType<typeof fetchSavantYesterday>>
  try {
    csv = await fetchSavantYesterday(yesterday)
  } catch (e: any) {
    flags.push(`Savant fetch failed for ${yesterday}: ${e?.message || String(e)}`)
    return {
      csvRows: 0, dbRows: 0, delta: 0,
      unknownPitchers: [], unknownBatters: [],
      pitcherNames: new Map(),
      flags,
    }
  }

  const { count: dbCount } = await supabaseAdmin
    .from('pitches')
    .select('*', { count: 'exact', head: true })
    .eq('game_date', yesterday)
    .eq('game_type', 'R')
  const dbRows = dbCount ?? 0

  const delta = csv.rowCount - dbRows
  if (delta > 0) {
    flags.push(`pitches CSV had ${csv.rowCount} rows; DB has ${dbRows} (${delta} missing)`)
  } else if (delta < 0) {
    flags.push(`pitches DB has ${dbRows} rows; CSV only ${csv.rowCount} (DB > CSV by ${-delta} — possibly stale game_pk)`)
  }

  // Find unknown player IDs.
  const allIds = [...new Set([...csv.pitcherIds, ...csv.batterIds])]
  const knownSet = new Set<number>()
  const chunkSize = 500
  for (let i = 0; i < allIds.length; i += chunkSize) {
    const batch = allIds.slice(i, i + chunkSize)
    if (batch.length === 0) continue
    const { data } = await supabaseAdmin
      .from('players')
      .select('id')
      .in('id', batch)
    for (const r of (data || []) as any[]) knownSet.add(r.id)
  }

  const unknownPitchers = csv.pitcherIds.filter(id => !knownSet.has(id))
  const unknownBatters = csv.batterIds.filter(id => !knownSet.has(id) && !csv.pitcherNames.has(id))

  return {
    csvRows: csv.rowCount,
    dbRows,
    delta,
    unknownPitchers,
    unknownBatters,
    pitcherNames: csv.pitcherNames,
    flags,
  }
}

// ── Auto-fix new players (D) ────────────────────────────────────────────────

interface AutoFixedPlayer {
  id: number
  name: string
  position: string | null
}

interface AutoFixOutcome {
  inserted: AutoFixedPlayer[]
  failed: { id: number; reason: string }[]
}

async function autoFixUnknownPlayers(
  pitcherIds: number[],
  batterIds: number[],
): Promise<AutoFixOutcome> {
  const inserted: AutoFixedPlayer[] = []
  const failed: { id: number; reason: string }[] = []

  const ids = [...new Set([...pitcherIds, ...batterIds])]
  if (ids.length === 0) return { inserted, failed }

  for (const id of ids) {
    try {
      const resp = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) {
        failed.push({ id, reason: `HTTP ${resp.status}` })
        continue
      }
      const data = await resp.json()
      const person = data?.people?.[0]
      if (!person || !person.fullName) {
        failed.push({ id, reason: 'malformed response' })
        continue
      }

      // Match the formatting convention used by roster cron (Last, First).
      const parts = String(person.fullName).split(' ')
      const formatted = parts.length > 1
        ? `${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(' ')}`
        : person.fullName

      const position: string | null = person.primaryPosition?.abbreviation || null

      const { error } = await supabaseAdmin
        .from('players')
        .upsert(
          { id, name: formatted, position, updated_at: new Date().toISOString() },
          { onConflict: 'id' },
        )
      if (error) {
        failed.push({ id, reason: `upsert: ${error.message}` })
        continue
      }
      inserted.push({ id, name: formatted, position })
    } catch (err: any) {
      failed.push({ id, reason: err?.message || String(err) })
    }
  }

  return { inserted, failed }
}

// ── Report builder (E) ──────────────────────────────────────────────────────

function statusEmoji(s: CronHealthEntry['status']): string {
  switch (s) {
    case 'ok': return '✅'
    case 'missing': return '❌'
    case 'failed': return '❌'
    case 'stuck': return '⚠️'
    case 'slow': return '⚠️'
  }
}

interface BuiltReport {
  body: string
  isClean: boolean
  needsReviewItems: string[]
  autoFixedItems: string[]
}

function buildReport(args: {
  stamp: string
  cron: CronHealthEntry[]
  volumes: VolumeEntry[]
  orphans: OrphanResult
  autoFix: AutoFixOutcome
}): BuiltReport {
  const { stamp, cron, volumes, orphans, autoFix } = args

  const cronLines = cron.map(c => `- ${c.job}: ${statusEmoji(c.status)} ${c.message}`)

  const autoFixedItems: string[] = []
  for (const p of autoFix.inserted) {
    const posLabel = p.position ? ` (${p.position})` : ''
    autoFixedItems.push(`Added player ${p.id} — ${p.name}${posLabel}`)
  }

  const needsReviewItems: string[] = []

  // Cron failures/missing/stuck/slow
  for (const c of cron) {
    if (c.status !== 'ok') {
      needsReviewItems.push(`${c.job}: ${statusEmoji(c.status)} ${c.message}`)
    }
  }

  // Volume flags
  for (const v of volumes) {
    if (v.flag) needsReviewItems.push(v.flag)
  }

  // Orphan / silent-drop flags
  for (const f of orphans.flags) needsReviewItems.push(f)
  for (const f of autoFix.failed) {
    needsReviewItems.push(`Could not auto-fix player ${f.id}: ${f.reason}`)
  }

  const isClean =
    cron.every(c => c.status === 'ok') &&
    needsReviewItems.length === 0 &&
    autoFixedItems.length === 0

  // Render markdown.
  const lines: string[] = []
  lines.push(`## 🧹 Janitor Report — ${stamp}`)
  lines.push('')

  if (isClean) {
    lines.push('✅ All checks passed.')
    return {
      body: lines.join('\n'),
      isClean: true,
      needsReviewItems,
      autoFixedItems,
    }
  }

  lines.push('### Cron Jobs')
  lines.push(...cronLines)
  lines.push('')

  if (autoFixedItems.length > 0) {
    lines.push('### Auto-fixed')
    for (const item of autoFixedItems) lines.push(`- ${item}`)
    lines.push('')
  }

  if (needsReviewItems.length > 0) {
    lines.push('### Needs Review')
    for (const item of needsReviewItems) lines.push(`- ${item}`)
    lines.push('')
  }

  lines.push('### Volume Check')
  for (const v of volumes) {
    const pctStr = v.avg7d > 0 ? `${Math.round(v.pct * 100)}%` : 'n/a'
    lines.push(`- ${v.table}: ${v.yesterdayCount} (7d-avg ${Math.round(v.avg7d)}) — ${pctStr}`)
  }

  return {
    body: lines.join('\n').replace(/\n+$/, ''),
    isClean: false,
    needsReviewItems,
    autoFixedItems,
  }
}

// ── Notification (F) ────────────────────────────────────────────────────────

async function postGitHubIssue(title: string, body: string, status: 'clean' | 'needs_review'): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return false
  try {
    const resp = await fetch('https://api.github.com/repos/IamTrevorMay/baseball-savant-web/issues', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title,
        body,
        labels: ['janitor', status === 'clean' ? 'clean' : 'review'],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      console.error('[janitor] GitHub issue failed:', resp.status, txt.slice(0, 500))
      return false
    }
    return true
  } catch (e: any) {
    console.error('[janitor] GitHub issue threw:', e?.message || String(e))
    return false
  }
}

async function sendEmail(title: string, body: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.JANITOR_NOTIFY_EMAIL
  if (!apiKey || !to) return false
  const from = process.env.JANITOR_FROM_EMAIL || 'Janitor <janitor@tritonapex.io>'
  try {
    const resend = new Resend(apiKey)
    const html = `<pre style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap">${escapeHtml(body)}</pre>`
    const result = await resend.emails.send({
      from,
      to,
      subject: title,
      html,
      text: body,
    })
    if ((result as any)?.error) {
      console.error('[janitor] resend error:', (result as any).error)
      return false
    }
    return true
  } catch (e: any) {
    console.error('[janitor] resend threw:', e?.message || String(e))
    return false
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ── Main handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stamp = nowPacificStamp()
  const yesterday = yesterdayPacific()
  const dateForTitle = todayPacific()

  // A. Cron health
  let cron: CronHealthEntry[]
  try {
    cron = await checkCronHealth()
  } catch (e: any) {
    cron = EXPECTED_JOBS.map(job => ({
      job,
      status: 'missing',
      message: `cron_runs query failed: ${e?.message || String(e)}`,
    }))
  }

  // B. Volume
  const volumes: VolumeEntry[] = []
  for (const tbl of ['pitches', 'milb_pitches'] as const) {
    try {
      volumes.push(await checkVolume(tbl, yesterday))
    } catch (e: any) {
      volumes.push({
        table: tbl,
        yesterdayCount: 0,
        avg7d: 0,
        pct: 0,
        flag: `${tbl} volume check failed: ${e?.message || String(e)}`,
      })
    }
  }

  // C. Orphan detection (MLB only)
  const orphans = await checkOrphans(yesterday)

  // D. Auto-fix unknown players
  const autoFix = await autoFixUnknownPlayers(orphans.unknownPitchers, orphans.unknownBatters)

  // E. Build report
  const report = buildReport({ stamp, cron, volumes, orphans, autoFix })

  const status: 'clean' | 'needs_review' = report.isClean ? 'clean' : 'needs_review'
  const title = `Janitor: ${dateForTitle} Pacific — ${status}`

  // Always log the full report.
  console.log(report.body)

  // F. Notify
  let channel: 'github' | 'email' | 'log-only' = 'log-only'
  const shouldNotify = status === 'needs_review' || process.env.JANITOR_ALWAYS_REPORT === '1'
  if (shouldNotify) {
    if (process.env.GITHUB_TOKEN) {
      const ok = await postGitHubIssue(title, report.body, status)
      if (ok) channel = 'github'
      else if (await sendEmail(title, report.body)) channel = 'email'
      else {
        console.warn('[janitor] no notification channel configured')
        channel = 'log-only'
      }
    } else if (process.env.RESEND_API_KEY && process.env.JANITOR_NOTIFY_EMAIL) {
      const ok = await sendEmail(title, report.body)
      if (ok) channel = 'email'
      else {
        console.warn('[janitor] no notification channel configured')
        channel = 'log-only'
      }
    } else {
      console.warn('[janitor] no notification channel configured')
      channel = 'log-only'
    }
  }

  return NextResponse.json({ status, report: report.body, channel })
}
