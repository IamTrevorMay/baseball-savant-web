import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { populateReportCard } from '@/lib/reportCardPopulate'
import { DATA_DRIVEN_TEMPLATES } from '@/lib/sceneTemplates'

export const maxDuration = 300

const GRAPHIC_TYPES = ['ig-starter-card', 'trends', 'yesterday-scores', 'top-pitchers', 'top-performances'] as const

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: corsHeaders })
}

function json(body: any, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: corsHeaders })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || (
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
  )
}

async function upsertGraphic(date: string, type: string, scene: any, metadata: any = {}) {
  const { error } = await supabaseAdmin
    .from('daily_graphics')
    .upsert({ date, type, scene, metadata }, { onConflict: 'date,type' })
  if (error) throw new Error(`upsert ${type}: ${error.message}`)
}

// ── 1. IG Starter Card ──────────────────────────────────────────────────────

async function generateIGStarterCard(date: string): Promise<any | null> {
  // Fetch IG Starter Card template
  const { data: template } = await supabaseAdmin
    .from('report_card_templates')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .ilike('name', '%IG Starter Card%')
    .limit(1)
    .maybeSingle()

  if (!template) throw new Error('IG Starter Card template not found')

  // Find finished games via MLB Schedule API
  const schedRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=team`)
  const schedData = await schedRes.json()
  const games = schedData.dates?.[0]?.games || []
  const finishedGames = games.filter((g: any) => g.status?.abstractGameState === 'Final')

  if (finishedGames.length === 0) return null

  // Get starting pitchers from boxscores
  interface StarterInfo { mlbId: number; name: string; gamePk: number }
  const starters: StarterInfo[] = []

  for (let i = 0; i < finishedGames.length; i += 5) {
    const batch = finishedGames.slice(i, i + 5)
    const results = await Promise.allSettled(
      batch.map(async (game: any) => {
        const boxRes = await fetch(`https://statsapi.mlb.com/api/v1/game/${game.gamePk}/boxscore`)
        if (!boxRes.ok) return
        const box = await boxRes.json()
        for (const side of ['away', 'home'] as const) {
          const pitcherIds = box.teams?.[side]?.pitchers || []
          if (pitcherIds.length > 0) {
            const starterId = pitcherIds[0]
            const pd = box.teams?.[side]?.players?.[`ID${starterId}`]
            if (pd) {
              starters.push({ mlbId: starterId, name: pd.person?.fullName || 'Unknown', gamePk: game.gamePk })
            }
          }
        }
      })
    )
  }

  if (starters.length === 0) return null

  // Fetch starter card data for each, find highest grade_start
  const baseUrl = getBaseUrl()
  let bestData: any = null
  let bestGrade = -999
  let bestBoxscoreName = ''

  for (let i = 0; i < starters.length; i += 5) {
    const batch = starters.slice(i, i + 5)
    const results = await Promise.allSettled(
      batch.map(async (st) => {
        const res = await fetch(`${baseUrl}/api/starter-card?pitcherId=${st.mlbId}&gamePk=${st.gamePk}`)
        if (!res.ok) return null
        const j = await res.json()
        if (!j.data) return null
        return { data: j.data, boxName: st.name }
      })
    )
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue
      const { data, boxName } = r.value
      const numericGrade = data.numeric_grades?.start ?? 0
      if (numericGrade > bestGrade) {
        bestGrade = numericGrade
        bestData = data
        bestBoxscoreName = boxName
      }
    }
  }

  if (!bestData) return null

  // Fix "Unknown" pitcher name
  if (bestData.pitcher_name === 'Unknown' && bestBoxscoreName) {
    bestData.pitcher_name = bestBoxscoreName
  }

  const scene = {
    id: template.id,
    name: template.name,
    width: template.width,
    height: template.height,
    background: template.background,
    elements: template.elements || [],
  }
  return populateReportCard(scene, bestData)
}

// ── 2. Trends ────────────────────────────────────────────────────────────────

async function generateTrends(): Promise<any> {
  const season = new Date().getFullYear()
  const earlyMonth = new Date().getMonth() + 1 <= 4
  const minPitches = earlyMonth ? 50 : 500

  // Fetch trends directly from DB (same logic as /api/trends)
  async function fetchAlerts(playerType: 'pitcher' | 'hitter') {
    const isPitcher = playerType === 'pitcher'
    const groupCol = isPitcher ? 'pitcher' : 'batter'

    const metrics = isPitcher
      ? [
          { key: 'velo', label: 'Avg Velo', higherIsBetter: true },
          { key: 'whiff', label: 'Whiff%', higherIsBetter: true },
          { key: 'k_pct', label: 'K%', higherIsBetter: true },
          { key: 'zone_pct', label: 'Zone%', higherIsBetter: false },
          { key: 'xwoba', label: 'xwOBA', higherIsBetter: false },
          { key: 'spin', label: 'Avg Spin', higherIsBetter: true },
        ]
      : [
          { key: 'ev', label: 'Avg EV', higherIsBetter: true },
          { key: 'xwoba', label: 'xwOBA', higherIsBetter: true },
          { key: 'k_pct', label: 'K%', higherIsBetter: false },
          { key: 'bb_pct', label: 'BB%', higherIsBetter: true },
          { key: 'hard_hit', label: 'Hard Hit%', higherIsBetter: true },
          { key: 'whiff', label: 'Whiff%', higherIsBetter: false },
        ]

    // Check if regular season data exists
    const regCheck = await supabaseAdmin.rpc('run_query', {
      query_text: `SELECT 1 FROM pitches WHERE game_year = ${season} AND game_type = 'R' LIMIT 1`,
    })
    const hasReg = (regCheck.data || []).length > 0
    const gtFilter = hasReg ? "AND game_type = 'R'" : ''

    // Get date range
    const dateRes = await supabaseAdmin.rpc('run_query', {
      query_text: `SELECT MIN(game_date) as earliest, MAX(game_date) as latest FROM pitches WHERE game_year = ${season} ${gtFilter}`,
    })
    const latestDate = dateRes.data?.[0]?.latest
    const earliestDate = dateRes.data?.[0]?.earliest
    if (!latestDate) return []

    const spanDays = Math.round((new Date(latestDate).getTime() - new Date(earliestDate).getTime()) / 86400000)
    const recentDays = spanDays < 21 ? Math.max(3, Math.floor(spanDays / 2)) : 14
    const recentDate = new Date(new Date(latestDate).getTime() - recentDays * 86400000).toISOString().slice(0, 10)

    // Build SQL for season + recent metrics
    const seasonSQLMap: Record<string, string> = {
      velo: 'ROUND(AVG(release_speed)::numeric, 1)',
      whiff: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt') / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt'), 0), 1)",
      k_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)",
      zone_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9) / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0), 1)",
      xwoba: 'ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3)',
      spin: 'ROUND(AVG(release_spin_rate)::numeric, 0)',
      ev: 'ROUND(AVG(launch_speed)::numeric, 1)',
      bb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1)",
      hard_hit: "ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95) / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0), 1)",
    }

    const seasonCols = metrics.map(m => `${seasonSQLMap[m.key]} as season_${m.key}`).join(', ')
    const recentCols = metrics.map(m => {
      const sql = seasonSQLMap[m.key]
      // Add game_date filter for recent window
      const recentSQL = sql.replace(/COUNT\(\*\)/g, `COUNT(*) FILTER (WHERE game_date >= '${recentDate}')`)
        .replace(/AVG\((\w+)\)/g, `AVG($1) FILTER (WHERE game_date >= '${recentDate}')`)
        .replace(/FILTER \(WHERE (.*?)\)/g, (_, cond) => {
          if (cond.includes('game_date')) return `FILTER (WHERE ${cond})`
          return `FILTER (WHERE game_date >= '${recentDate}' AND ${cond})`
        })
      return `${recentSQL} as recent_${m.key}`
    }).join(', ')

    const { data } = await supabaseAdmin.rpc('run_query', {
      query_text: `
        SELECT p.${groupCol} as player_id, pl.name as player_name,
          COUNT(*) as total_pitches,
          ${seasonCols}, ${recentCols}
        FROM pitches p
        JOIN players pl ON pl.id = p.${groupCol}
        WHERE game_year = ${season} AND pitch_type NOT IN ('PO', 'IN') ${gtFilter}
        GROUP BY p.${groupCol}, pl.name
        HAVING COUNT(*) >= ${minPitches}
          AND COUNT(*) FILTER (WHERE game_date >= '${recentDate}') >= 30
      `,
    })

    if (!data || data.length === 0) return []

    // Compute stddev per metric
    const stddevs: Record<string, number> = {}
    for (const m of metrics) {
      const vals = data.map((r: any) => r[`season_${m.key}`]).filter((v: any) => v != null) as number[]
      if (vals.length < 3) { stddevs[m.key] = 1; continue }
      const mean = vals.reduce((a: number, b: number) => a + b, 0) / vals.length
      const variance = vals.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / vals.length
      stddevs[m.key] = Math.sqrt(variance) || 1
    }

    // Build alerts
    const alerts: any[] = []
    for (const row of data as any[]) {
      for (const m of metrics) {
        const sv = row[`season_${m.key}`]
        const rv = row[`recent_${m.key}`]
        if (sv == null || rv == null) continue
        const delta = rv - sv
        const sigma = delta / stddevs[m.key]
        if (Math.abs(sigma) < 1.5) continue
        const direction = delta > 0 ? 'up' : 'down'
        const isGood = (delta > 0) === m.higherIsBetter
        alerts.push({
          player_id: row.player_id,
          player_name: row.player_name,
          type: playerType,
          metric: m.key,
          metric_label: m.label,
          season_val: sv,
          recent_val: rv,
          delta: Math.round(delta * 100) / 100,
          sigma: Math.round(sigma * 100) / 100,
          direction,
          sentiment: isGood ? 'good' : 'bad',
        })
      }
    }

    return alerts
  }

  const [pitcherAlerts, hitterAlerts] = await Promise.all([
    fetchAlerts('pitcher'),
    fetchAlerts('hitter'),
  ])
  const all = [...pitcherAlerts, ...hitterAlerts]

  const surgeAll = all.filter((a: any) => a.sentiment === 'good').sort((a: any, b: any) => Math.abs(b.sigma) - Math.abs(a.sigma))
  const concernAll = all.filter((a: any) => a.sentiment === 'bad').sort((a: any, b: any) => Math.abs(b.sigma) - Math.abs(a.sigma))

  // Deduplicate: one per player, highest |sigma|
  const pickUnique = (list: any[], n: number) => {
    const seen = new Set<number>()
    const result: any[] = []
    for (const item of list) {
      if (seen.has(item.player_id)) continue
      seen.add(item.player_id)
      result.push(item)
      if (result.length >= n) break
    }
    return result
  }

  const surges = pickUnique(surgeAll, 5)
  const concerns = pickUnique(concernAll, 5)

  if (surges.length === 0 && concerns.length === 0) {
    throw new Error('No trend data found')
  }

  const template = DATA_DRIVEN_TEMPLATES.find(t => t.id === 'trends')
  if (!template) throw new Error('Trends template not found')

  const conf = { templateId: template.id, ...template.defaultConfig }
  return template.rebuild(conf, { surges, concerns })
}

// ── 3. Yesterday's Scores ────────────────────────────────────────────────────

async function generateYesterdayScores(date: string): Promise<any | null> {
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=team,linescore,decisions`)
  const data = await res.json()
  const allGames = data.dates?.[0]?.games || []
  const finalGames = allGames.filter((g: any) =>
    g.status?.abstractGameState === 'Final' || g.status?.detailedState === 'Final'
  )

  if (finalGames.length === 0) return null

  const games = finalGames.map((g: any) => {
    const away = g.teams?.away
    const home = g.teams?.home
    return {
      awayAbbrev: away?.team?.abbreviation || '??',
      homeAbbrev: home?.team?.abbreviation || '??',
      awayScore: away?.score ?? 0,
      homeScore: home?.score ?? 0,
      winPitcher: g.decisions?.winner?.fullName?.split(' ').pop() || '',
      losePitcher: g.decisions?.loser?.fullName?.split(' ').pop() || '',
      savePitcher: g.decisions?.save?.fullName?.split(' ').pop() || undefined,
    }
  })

  const d = new Date(date + 'T12:00:00')
  const dateFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const template = DATA_DRIVEN_TEMPLATES.find(t => t.id === 'yesterday-scores')
  if (!template) throw new Error('Yesterday Scores template not found')

  const conf = { templateId: template.id, ...template.defaultConfig }
  return template.rebuild(conf, { date, dateFormatted, games })
}

// ── 4. Top Pitchers ──────────────────────────────────────────────────────────

async function generateTopPitchers(): Promise<any> {
  const { data: brief } = await supabaseAdmin
    .from('briefs')
    .select('date, metadata')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  const highlights = brief?.metadata?.daily_highlights || {}

  const template = DATA_DRIVEN_TEMPLATES.find(t => t.id === 'top-pitchers')
  if (!template) throw new Error('Top Pitchers template not found')

  const conf = { templateId: template.id, ...template.defaultConfig }
  return template.rebuild(conf, { date: brief?.date, ...highlights })
}

// ── 5. Top Performances ──────────────────────────────────────────────────────

async function generateTopPerformances(): Promise<any> {
  const { data: brief } = await supabaseAdmin
    .from('briefs')
    .select('date, metadata')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  const topPerformances = brief?.metadata?.claude_sections?.topPerformances || null

  const template = DATA_DRIVEN_TEMPLATES.find(t => t.id === 'top-performances')
  if (!template) throw new Error('Top Performances template not found')

  const conf = { templateId: template.id, ...template.defaultConfig }
  return template.rebuild(conf, { date: brief?.date, topPerformances })
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Yesterday's date
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const date = yesterday.toISOString().slice(0, 10)

  // Skip offseason (Dec, Jan)
  const month = yesterday.getMonth() + 1
  if (month === 12 || month === 1) {
    return json({ ok: true, skipped: true, reason: 'offseason' })
  }

  const force = req.nextUrl.searchParams.get('force') === 'true'

  if (force) {
    await supabaseAdmin.from('daily_graphics').delete().eq('date', date)
  }

  // Idempotency: skip if all 5 already exist
  const { data: existing } = await supabaseAdmin
    .from('daily_graphics')
    .select('type')
    .eq('date', date)

  if (!force && existing && existing.length >= GRAPHIC_TYPES.length) {
    return json({ ok: true, skipped: true, reason: 'already_exists', date })
  }

  const existingTypes = new Set((existing || []).map((r: any) => r.type))
  const results: { type: string; ok: boolean; error?: string }[] = []

  // Generate each graphic sequentially (avoid overloading APIs)
  const generators: { type: string; fn: () => Promise<any | null> }[] = [
    { type: 'ig-starter-card', fn: () => generateIGStarterCard(date) },
    { type: 'trends', fn: () => generateTrends() },
    { type: 'yesterday-scores', fn: () => generateYesterdayScores(date) },
    { type: 'top-pitchers', fn: () => generateTopPitchers() },
    { type: 'top-performances', fn: () => generateTopPerformances() },
  ]

  for (const { type, fn } of generators) {
    if (existingTypes.has(type)) {
      results.push({ type, ok: true, error: 'already existed' })
      continue
    }
    try {
      const scene = await fn()
      if (scene) {
        await upsertGraphic(date, type, scene)
        results.push({ type, ok: true })
      } else {
        results.push({ type, ok: false, error: 'no data' })
      }
    } catch (err: any) {
      results.push({ type, ok: false, error: err.message })
    }
  }

  return json({
    ok: true,
    date,
    count: results.filter(r => r.ok).length,
    types: results,
  })
}
