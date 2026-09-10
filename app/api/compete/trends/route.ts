import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { supabaseAdminLong } from '@/lib/supabase-admin'
import { TREND_METRIC_BY_KEY, type TrendBucket, type TrendPoint, type TrendSeries } from '@/lib/compete/trendsCatalog'

/**
 * GET /api/compete/trends — bucketed athlete-history series for the Compete
 * Trends correlation tool.
 *
 * ?metrics=whoop.recovery,tm.rel_speed&bucket=day&start=…&end=…[&athleteId=…]
 *
 * Athletes get their own data only; owner/admin may pass athleteId. Buckets
 * are computed in JS for the athlete stores (row counts are small) and in
 * SQL for the pro pitches table. Vision series are plumbed but return empty
 * until pitches carry an athlete link.
 */
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function bucketKey(dateStr: string, bucket: TrendBucket): string {
  const d = dateStr.slice(0, 10)
  if (bucket === 'day') return d
  if (bucket === 'month') return d.slice(0, 7) + '-01'
  if (bucket === 'year') return d.slice(0, 4) + '-01-01'
  // week: ISO Monday
  const dt = new Date(d + 'T12:00:00Z')
  const dow = (dt.getUTCDay() + 6) % 7
  dt.setUTCDate(dt.getUTCDate() - dow)
  return dt.toISOString().slice(0, 10)
}

/** Average per bucket from raw (date, value) pairs; nulls dropped. */
function aggregate(rows: { date: string | null; value: number | null }[], bucket: TrendBucket): TrendPoint[] {
  const acc = new Map<string, { sum: number; n: number }>()
  for (const r of rows) {
    if (!r.date || r.value == null || !isFinite(Number(r.value))) continue
    const k = bucketKey(r.date, bucket)
    const a = acc.get(k) ?? { sum: 0, n: 0 }
    a.sum += Number(r.value); a.n += 1
    acc.set(k, a)
  }
  return [...acc.entries()]
    .map(([x, a]) => ({ x, value: a.sum / a.n, n: a.n }))
    .sort((a, b) => a.x.localeCompare(b.x))
}

const CYCLE_COLS: Record<string, string> = {
  'whoop.recovery': 'recovery_score', 'whoop.hrv': 'hrv_rmssd', 'whoop.rhr': 'resting_heart_rate',
  'whoop.strain': 'strain_score', 'whoop.spo2': 'spo2_pct', 'whoop.skin_temp': 'skin_temp_celsius',
}
const SLEEP_COLS: Record<string, string> = {
  'whoop.sleep_score': 'sleep_score', 'whoop.sleep_hours': 'total_duration_ms',
  'whoop.rem_hours': 'rem_duration_ms', 'whoop.sws_hours': 'sws_duration_ms',
  'whoop.sleep_eff': 'sleep_efficiency', 'whoop.resp_rate': 'respiratory_rate',
  'whoop.sleep_consistency': 'sleep_consistency',
}
const WORKOUT_COLS: Record<string, string> = {
  'whoop.workout_strain': 'strain_score', 'whoop.workout_max_hr': 'max_heart_rate',
}
const TM_COLS: Record<string, string> = {
  'tm.rel_speed': 'rel_speed', 'tm.spin_rate': 'spin_rate', 'tm.ivb': 'induced_vert_break',
  'tm.hb': 'horz_break', 'tm.extension': 'extension',
}
const PRO_EXPRS: Record<string, string> = {
  'pro.velo': 'AVG(release_speed)', 'pro.spin': 'AVG(release_spin_rate)',
  'pro.ivb': 'AVG(pfx_z * 12)', 'pro.hb': 'AVG(pfx_x * 12)', 'pro.ext': 'AVG(release_extension)',
  'pro.whiff': "100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description IN ('missed_bunt','swinging_pitchout','foul_tip','bunt_foul_tip')) / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description LIKE 'hit_into_play%' OR description = 'missed_bunt' OR description = 'swinging_pitchout'), 0)",
}
const MS_TO_HRS = new Set(['whoop.sleep_hours', 'whoop.rem_hours', 'whoop.sws_hours'])

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const metrics = (sp.get('metrics') || '').split(',').filter(k => TREND_METRIC_BY_KEY.has(k))
  const bucket = (['day', 'week', 'month', 'year'].includes(sp.get('bucket') || '') ? sp.get('bucket') : 'day') as TrendBucket
  const start = DATE_RE.test(sp.get('start') || '') ? sp.get('start')! : null
  const end = DATE_RE.test(sp.get('end') || '') ? sp.get('end')! : null
  if (!metrics.length) return NextResponse.json({ error: 'No valid metrics' }, { status: 400 })

  // Resolve whose data: athletes always themselves; owner/admin may pick.
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'
  let athleteId: string | null = null
  const requested = sp.get('athleteId')
  if (requested && isAdmin) {
    athleteId = requested
  } else {
    const { data: own } = await supabaseAdmin.from('athlete_profiles').select('id').eq('profile_id', user.id).single()
    athleteId = own?.id ?? null
  }
  if (!athleteId) return NextResponse.json({ error: 'No athlete profile' }, { status: 404 })

  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles').select('id, player_id').eq('id', athleteId).single()
  if (!athlete) return NextResponse.json({ error: 'Athlete not found' }, { status: 404 })

  const want = (prefix: string) => metrics.filter(k => k.startsWith(prefix))
  const series: TrendSeries = {}
  const dateFilter = <T,>(q: any, col: string) => {
    if (start) q = q.gte(col, start)
    if (end) q = q.lte(col, end)
    return q
  }

  const tasks: Promise<void>[] = []

  // ── Whoop ───────────────────────────────────────────────────────────────
  const cycleKeys = metrics.filter(k => CYCLE_COLS[k])
  if (cycleKeys.length) tasks.push((async () => {
    const cols = ['cycle_date', ...new Set(cycleKeys.map(k => CYCLE_COLS[k]))].join(',')
    const { data } = await dateFilter(
      supabaseAdmin.from('whoop_cycles').select(cols).eq('athlete_id', athleteId), 'cycle_date')
    for (const k of cycleKeys)
      series[k] = aggregate((data || []).map((r: any) => ({ date: r.cycle_date, value: r[CYCLE_COLS[k]] })), bucket)
  })())

  const sleepKeys = metrics.filter(k => SLEEP_COLS[k])
  if (sleepKeys.length) tasks.push((async () => {
    const cols = ['sleep_date', ...new Set(sleepKeys.map(k => SLEEP_COLS[k]))].join(',')
    const { data } = await dateFilter(
      supabaseAdmin.from('whoop_sleep').select(cols).eq('athlete_id', athleteId), 'sleep_date')
    for (const k of sleepKeys) {
      const div = MS_TO_HRS.has(k) ? 3_600_000 : 1
      series[k] = aggregate((data || []).map((r: any) => ({
        date: r.sleep_date, value: r[SLEEP_COLS[k]] == null ? null : r[SLEEP_COLS[k]] / div,
      })), bucket)
    }
  })())

  const workoutKeys = metrics.filter(k => WORKOUT_COLS[k])
  if (workoutKeys.length) tasks.push((async () => {
    const cols = ['workout_date', ...new Set(workoutKeys.map(k => WORKOUT_COLS[k]))].join(',')
    const { data } = await dateFilter(
      supabaseAdmin.from('whoop_workouts').select(cols).eq('athlete_id', athleteId), 'workout_date')
    for (const k of workoutKeys)
      series[k] = aggregate((data || []).map((r: any) => ({ date: r.workout_date, value: r[WORKOUT_COLS[k]] })), bucket)
  })())

  // ── Biomechanics (per published report; sparse) ─────────────────────────
  const bioKeys = want('bio.')
  if (bioKeys.length) tasks.push((async () => {
    const { data } = await dateFilter(
      supabaseAdmin.from('compete_reports')
        .select('report_date, metadata')
        .eq('athlete_id', athleteId).eq('subject_type', 'biomech'), 'report_date')
    const reports = (data || []).filter((r: any) => r.metadata?.kind === 'biomech')
    for (const k of bioKeys) {
      const rows = reports.map((r: any) => {
        const p = r.metadata
        const date = p.captureDate || r.report_date
        if (k === 'bio.movement_grade') return { date, value: p.movementGrade ?? null }
        if (k === 'bio.rel_speed') return { date, value: p.sessionMetrics?.outcome?.relSpeedMph ?? null }
        const mk = k.slice('bio.m.'.length)
        const pc = (p.percentiles || []).find((x: any) => x.key === mk)
        return { date, value: pc?.value ?? null }
      })
      series[k] = aggregate(rows, bucket)
    }
  })())

  // ── TrackMan CSV sessions (athlete-stamped compete_pitches) ─────────────
  const tmKeys = metrics.filter(k => TM_COLS[k])
  if (tmKeys.length) tasks.push((async () => {
    const cols = ['pitch_date', ...new Set(tmKeys.map(k => TM_COLS[k]))].join(',')
    const { data } = await dateFilter(
      supabaseAdmin.from('compete_pitches').select(cols).eq('athlete_profile_id', athleteId), 'pitch_date')
    for (const k of tmKeys)
      series[k] = aggregate((data || []).map((r: any) => ({ date: r.pitch_date, value: r[TM_COLS[k]] })), bucket)
  })())

  // ── Vision — plumbed, pending athlete identity link on trackman_pitches ─
  for (const k of want('vis.')) series[k] = []

  // ── Pro (Savant pitches, requires linked MLBAM id) ──────────────────────
  const proKeys = metrics.filter(k => PRO_EXPRS[k])
  if (proKeys.length) tasks.push((async () => {
    if (!athlete.player_id) { for (const k of proKeys) series[k] = []; return }
    const truncArg = bucket === 'day' ? 'day' : bucket === 'week' ? 'week' : bucket === 'month' ? 'month' : 'year'
    const where = [
      `pitcher = ${Number(athlete.player_id)}`, `game_type = 'R'`,
      ...(start ? [`game_date >= '${start}'`] : []), ...(end ? [`game_date <= '${end}'`] : []),
    ]
    const sql = `
      SELECT date_trunc('${truncArg}', game_date)::date::text AS x, COUNT(*) AS n,
        ${proKeys.map(k => `${PRO_EXPRS[k]} AS "${k}"`).join(', ')}
      FROM pitches WHERE ${where.join(' AND ')}
      GROUP BY 1 ORDER BY 1`
    const { data, error } = await supabaseAdminLong.rpc('run_query_long', { query_text: sql.trim() })
    if (error) throw new Error(error.message)
    for (const k of proKeys)
      series[k] = ((data || []) as any[])
        .filter(r => r[k] != null)
        .map(r => ({ x: r.x, value: Number(r[k]), n: Number(r.n) }))
  })())

  try {
    await Promise.all(tasks)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  return NextResponse.json({ athleteId, bucket, series, hasProLink: !!athlete.player_id })
}
