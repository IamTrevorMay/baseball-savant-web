/**
 * Render 5 graphics from yesterday's data to /Users/trevor/Desktop/Test/
 *
 * 1. IG Starter Card — highest grade_start from yesterday
 * 2. Trends — surges & concerns
 * 3. Yesterday's Scores
 * 4. Top Pitchers — daily highlights
 * 5. Top Performances — from daily brief
 *
 * Usage: npx tsx scripts/render-all-yesterday.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

const OUT_DIR = '/Users/trevor/Desktop/Test'
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

// Yesterday's date
const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
const YESTERDAY = yesterday.toISOString().slice(0, 10)

console.log(`Rendering all graphics for ${YESTERDAY}...`)

// ── Helpers ─────────────────────────────────────────────────────────────

async function saveScene(scene: any, filename: string) {
  // Dynamic import to avoid top-level ESM issues
  const { renderCardToPNG } = await import('../lib/serverRenderCard')
  const buf = await renderCardToPNG(scene)
  const outPath = join(OUT_DIR, filename)
  writeFileSync(outPath, buf)
  console.log(`  ✓ Saved ${filename} (${(buf.length / 1024).toFixed(0)} KB)`)
}

// ── 1. IG Starter Card (highest grade) ──────────────────────────────────

async function renderIGStarterCard() {
  console.log('\n1. IG Starter Card...')

  // Fetch the IG Starter Card template
  const { data: template } = await supabase
    .from('report_card_templates')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .ilike('name', '%IG Starter Card%')
    .limit(1)
    .maybeSingle()

  if (!template) {
    console.log('  ✗ IG Starter Card template not found')
    return
  }

  // Find yesterday's games via MLB Schedule API
  const schedRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?date=${YESTERDAY}&sportId=1&hydrate=team`)
  const schedData = await schedRes.json()
  const games = schedData.dates?.[0]?.games || []
  const finishedGames = games.filter((g: any) => g.status?.abstractGameState === 'Final')

  if (finishedGames.length === 0) {
    console.log('  ✗ No finished games yesterday')
    return
  }

  // Get starting pitchers from boxscores
  interface StarterInfo { mlbId: number; name: string; gamePk: number }
  const starters: StarterInfo[] = []

  for (const game of finishedGames) {
    try {
      const boxRes = await fetch(`https://statsapi.mlb.com/api/v1/game/${game.gamePk}/boxscore`)
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
    } catch {}
  }

  if (starters.length === 0) {
    console.log('  ✗ No starters found')
    return
  }

  // Fetch starter card data for each and find highest grade_start
  const baseUrl = `http://localhost:3333`
  let bestData: any = null
  let bestGrade = -999
  let bestBoxscoreName = ''

  // Batch API calls (5 at a time) across ALL starters
  for (let i = 0; i < starters.length; i += 5) {
    const batch = starters.slice(i, i + 5)
    const results = await Promise.allSettled(
      batch.map(async (st) => {
        const res = await fetch(`${baseUrl}/api/starter-card?pitcherId=${st.mlbId}&gamePk=${st.gamePk}`)
        if (!res.ok) return null
        const json = await res.json()
        if (!json.data) return null
        return { data: json.data, boxName: st.name }
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

  if (!bestData) {
    console.log('  ✗ Could not fetch any starter card data')
    return
  }

  // Fix "Unknown" pitcher name from boxscore
  if (bestData.pitcher_name === 'Unknown' && bestBoxscoreName) {
    bestData.pitcher_name = bestBoxscoreName
  }

  console.log(`  Best: ${bestData.pitcher_name} (grade: ${bestData.grades?.start}, numeric: ${bestGrade.toFixed(1)})`)

  // Populate template
  const { populateReportCard } = await import('../lib/reportCardPopulate')
  const scene = {
    id: template.id,
    name: template.name,
    width: template.width,
    height: template.height,
    background: template.background,
    elements: template.elements || [],
  }
  const populated = populateReportCard(scene, bestData)
  await saveScene(populated, 'ig-starter-card.png')
}

function parseGrade(g: string | number | null): number {
  if (g == null) return 0
  if (typeof g === 'number') return g
  const map: Record<string, number> = { 'A+': 97, 'A': 93, 'A-': 90, 'B+': 87, 'B': 83, 'B-': 80, 'C+': 77, 'C': 73, 'C-': 70, 'D+': 67, 'D': 63, 'D-': 60, 'F': 50 }
  return map[g] || 0
}

// ── 2. Trends ───────────────────────────────────────────────────────────

async function renderTrends() {
  console.log('\n2. Trends...')

  const { DATA_DRIVEN_TEMPLATES } = await import('../lib/sceneTemplates')

  // Fetch trends data
  const { data: trendRows } = await supabase.rpc('run_query', {
    query_text: `
      SELECT player_id, player_name, type, metric, metric_label,
             season_val, recent_val, delta, sigma, direction, sentiment
      FROM trends
      WHERE ABS(sigma) >= 1.5
      ORDER BY ABS(sigma) DESC
      LIMIT 30
    `,
  })

  const surges = (trendRows || []).filter((r: any) => r.sentiment === 'good').slice(0, 5)
  const concerns = (trendRows || []).filter((r: any) => r.sentiment === 'bad').slice(0, 5)

  const template = DATA_DRIVEN_TEMPLATES.find(t => t.id === 'trends')
  if (!template) { console.log('  ✗ Trends template not found'); return }

  const conf = { templateId: template.id, ...template.defaultConfig }
  const scene = template.rebuild(conf, { surges, concerns })
  await saveScene(scene, 'trends.png')
}

// ── 3. Yesterday's Scores ───────────────────────────────────────────────

async function renderYesterdayScores() {
  console.log('\n3. Yesterday\'s Scores...')

  const { DATA_DRIVEN_TEMPLATES } = await import('../lib/sceneTemplates')

  // Fetch scores from MLB API
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?date=${YESTERDAY}&sportId=1&hydrate=team,linescore,decisions`)
  const data = await res.json()
  const allGames = data.dates?.[0]?.games || []
  const finalGames = allGames.filter((g: any) =>
    g.status?.abstractGameState === 'Final' || g.status?.detailedState === 'Final'
  )

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

  const d = new Date(YESTERDAY + 'T12:00:00')
  const dateFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const template = DATA_DRIVEN_TEMPLATES.find(t => t.id === 'yesterday-scores')
  if (!template) { console.log('  ✗ Template not found'); return }

  const conf = { templateId: template.id, ...template.defaultConfig }
  const scene = template.rebuild(conf, { date: YESTERDAY, dateFormatted, games })
  await saveScene(scene, 'yesterday-scores.png')
}

// ── 4. Top Pitchers ─────────────────────────────────────────────────────

async function renderTopPitchers() {
  console.log('\n4. Top Pitchers...')

  const { DATA_DRIVEN_TEMPLATES } = await import('../lib/sceneTemplates')

  // Fetch daily highlights from the briefs table
  const { data: brief } = await supabase
    .from('briefs')
    .select('date, metadata')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  const highlights = brief?.metadata?.daily_highlights || {}

  const template = DATA_DRIVEN_TEMPLATES.find(t => t.id === 'top-pitchers')
  if (!template) { console.log('  ✗ Template not found'); return }

  const conf = { templateId: template.id, ...template.defaultConfig }
  const scene = template.rebuild(conf, { date: brief?.date, ...highlights })
  await saveScene(scene, 'top-pitchers.png')
}

// ── 5. Top Performances ─────────────────────────────────────────────────

async function renderTopPerformances() {
  console.log('\n5. Top Performances...')

  const { DATA_DRIVEN_TEMPLATES } = await import('../lib/sceneTemplates')

  // Fetch from brief
  const { data: brief } = await supabase
    .from('briefs')
    .select('date, metadata')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  const topPerformances = brief?.metadata?.claude_sections?.topPerformances || null

  const template = DATA_DRIVEN_TEMPLATES.find(t => t.id === 'top-performances')
  if (!template) { console.log('  ✗ Template not found'); return }

  const conf = { templateId: template.id, ...template.defaultConfig }
  const scene = template.rebuild(conf, { date: brief?.date, topPerformances })
  await saveScene(scene, 'top-performances.png')
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  await renderIGStarterCard()
  await renderTrends()
  await renderYesterdayScores()
  await renderTopPitchers()
  await renderTopPerformances()

  console.log(`\nDone! All files saved to ${OUT_DIR}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
