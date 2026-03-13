import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import Parser from 'rss-parser'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const rssParser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Triton Baseball News Aggregator' },
})

const FEEDS = [
  { name: 'The Athletic', url: 'https://theathletic.com/feeds/rss/news/?sport=baseball' },
  { name: 'FanGraphs', url: 'https://blogs.fangraphs.com/feed/' },
  { name: 'ESPN', url: 'https://www.espn.com/espn/rss/mlb/news' },
  { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/mlb/rss.xml' },
  { name: 'MLB.com', url: 'https://www.mlb.com/feeds/news/rss.xml' },
]

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Compute yesterday's date in ET
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  et.setDate(et.getDate() - 1)
  const briefDate = et.toISOString().slice(0, 10)

  // Skip offseason (Dec, Jan)
  const month = et.getMonth() + 1
  if (month === 12 || month === 1) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'offseason' })
  }

  // Idempotency: skip if brief already exists
  const { data: existing } = await supabaseAdmin
    .from('briefs')
    .select('id')
    .eq('date', briefDate)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already_exists', date: briefDate })
  }

  try {
    // Fetch games and news in parallel
    const [gamesData, newsItems] = await Promise.all([
      fetchGamesWithLinescores(briefDate),
      fetchNews(),
    ])

    // Fetch full box scores for finished games (batched)
    const finishedGames = gamesData.filter((g: any) => g.state === 'Final')
    const boxScores: any[] = []
    for (let i = 0; i < finishedGames.length; i += 5) {
      const batch = finishedGames.slice(i, i + 5)
      const results = await Promise.allSettled(
        batch.map((g: any) => fetchFullBoxScore(g.gamePk))
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) boxScores.push(r.value)
      }
    }

    const isOffDay = finishedGames.length === 0

    // Build box scores HTML (deterministic — no Claude needed)
    const boxScoresHtml = buildBoxScoresHtml(boxScores)

    // Build news HTML (deterministic)
    const topNews = newsItems.slice(0, 10)
    const newsHtml = buildNewsHtml(topNews)

    // Ask Claude only for: title, summary, top performances, worst performances
    const performanceData = boxScores.map(bs => ({
      away: bs.away.team.abbrev,
      home: bs.home.team.abbrev,
      awayScore: bs.totals.away.runs,
      homeScore: bs.totals.home.runs,
      awayBatters: bs.away.batters,
      homeBatters: bs.home.batters,
      awayPitchers: bs.away.pitchers,
      homePitchers: bs.home.pitchers,
    }))

    const claudePrompt = isOffDay
      ? `Generate a brief MLB daily recap for ${briefDate} (off-day / no games). Return JSON with { title, summary, topPerformances, worstPerformances }. topPerformances and worstPerformances should be empty strings.`
      : `Analyze these ${briefDate} MLB box scores and return JSON with exactly 4 fields:
- "title": Catchy headline (e.g., "Yankees Cruise, Dodgers Walk Off — March 11 Recap")
- "summary": 1-2 sentence summary of the day
- "topPerformances": HTML section of the 8-10 best individual performances (hitters and pitchers). Use a styled list with player names, teams, and key stats.
- "worstPerformances": HTML section of the 4-5 worst individual performances. Same format.

Box score data:\n${JSON.stringify(performanceData)}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{ role: 'user', content: claudePrompt }],
      system: `You are a baseball analyst writing a daily brief for a professional scouting platform.

Return JSON with exactly these fields: title, summary, topPerformances, worstPerformances.

For topPerformances and worstPerformances, generate HTML using these styling rules:
- Each performance is a div with class "flex items-start gap-3 py-2 border-b border-zinc-800/50 last:border-0"
- Player name: <span class="font-semibold text-white">Name</span>
- Team: <span class="text-zinc-500 text-xs ml-1">TEA</span>
- Stats line: <span class="text-zinc-400 text-xs">3-for-4, 2 HR, 5 RBI</span> or <span class="text-zinc-400 text-xs">7.0 IP, 1 ER, 10 K</span>
- For worst performances use <span class="text-red-400/70 text-xs"> for the stats line
- Wrap each section in a div, no section headers needed (the parent will add them)

For top performances, highlight dominant pitching (lots of K, low ER, deep outings) and big offensive games (multi-hit, HR, high RBI).
For worst performances, highlight blown starts (short outings, high ER), 0-for with multiple K, etc.

Return ONLY valid JSON, no markdown fences.`,
    })

    const textContent = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    let parsed: { title: string; summary: string; topPerformances: string; worstPerformances: string }
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/)
      const cleaned = jsonMatch ? jsonMatch[0] : textContent.trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Failed to parse Claude response', raw: textContent.slice(0, 500) }, { status: 500 })
    }

    // Assemble final HTML
    const finalHtml = assembleBriefHtml({
      boxScoresHtml,
      topPerformances: parsed.topPerformances,
      worstPerformances: parsed.worstPerformances,
      newsHtml,
      isOffDay,
    })

    // Insert into briefs table
    const { error: insertError } = await supabaseAdmin
      .from('briefs')
      .insert({
        date: briefDate,
        title: parsed.title,
        content: finalHtml,
        summary: parsed.summary,
        metadata: {
          games_count: gamesData.length,
          finished_count: finishedGames.length,
          is_off_day: isOffDay,
        },
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, date: briefDate, title: parsed.title })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/* ─── HTML Builders ─── */

function assembleBriefHtml(parts: {
  boxScoresHtml: string
  topPerformances: string
  worstPerformances: string
  newsHtml: string
  isOffDay: boolean
}) {
  const sections: string[] = []

  if (!parts.isOffDay && parts.boxScoresHtml) {
    sections.push(`
<div class="mb-8">
  <h2 class="text-lg font-bold text-white mb-4">Box Scores</h2>
  <div class="space-y-3">${parts.boxScoresHtml}</div>
</div>`)
  }

  if (parts.topPerformances) {
    sections.push(`
<div class="mb-8">
  <h2 class="text-lg font-bold text-white mb-3">Top Performances</h2>
  <div class="bg-zinc-900 rounded-lg border border-zinc-800 p-4">${parts.topPerformances}</div>
</div>`)
  }

  if (parts.worstPerformances) {
    sections.push(`
<div class="mb-8">
  <h2 class="text-lg font-bold text-white mb-3">Worst Performances</h2>
  <div class="bg-zinc-900 rounded-lg border border-zinc-800 p-4">${parts.worstPerformances}</div>
</div>`)
  }

  if (parts.newsHtml) {
    sections.push(`
<div class="mb-8">
  <h2 class="text-lg font-bold text-white mb-3">Latest Headlines</h2>
  <div class="space-y-2">${parts.newsHtml}</div>
</div>`)
  }

  return `<div class="space-y-2">${sections.join('')}</div>`
}

function buildBoxScoresHtml(boxScores: any[]): string {
  return boxScores.map(bs => {
    const { away, home, innings, totals, decisions } = bs
    const numInnings = Math.max(innings.length, 9)

    // Inning headers
    const inningHeaders = Array.from({ length: numInnings }, (_, i) =>
      `<th class="px-1.5 py-1 text-center text-zinc-500 font-normal w-7">${i + 1}</th>`
    ).join('')

    // Team inning cells
    const awayInnings = Array.from({ length: numInnings }, (_, i) => {
      const val = innings[i]?.away?.runs
      return `<td class="px-1.5 py-1 text-center ${val != null && val > 0 ? 'text-white font-medium' : 'text-zinc-500'}">${val ?? '-'}</td>`
    }).join('')

    const homeInnings = Array.from({ length: numInnings }, (_, i) => {
      const val = innings[i]?.home?.runs
      return `<td class="px-1.5 py-1 text-center ${val != null && val > 0 ? 'text-white font-medium' : 'text-zinc-500'}">${val ?? '-'}</td>`
    }).join('')

    // Decisions line
    const decParts: string[] = []
    if (decisions.winner) decParts.push(`<span class="text-emerald-400">W:</span> ${decisions.winner}`)
    if (decisions.loser) decParts.push(`<span class="text-red-400">L:</span> ${decisions.loser}`)
    if (decisions.save) decParts.push(`<span class="text-cyan-400">S:</span> ${decisions.save}`)
    const decisionsHtml = decParts.length > 0
      ? `<div class="text-xs text-zinc-400 mt-2 flex gap-4">${decParts.join(' ')}</div>`
      : ''

    // Expandable full box score
    const awayBattersHtml = (away.batters || []).map((b: any) =>
      `<tr class="border-b border-zinc-800/30">
        <td class="py-0.5 pr-3 text-zinc-300">${b.name}</td>
        <td class="px-1.5 text-center">${b.ab}</td>
        <td class="px-1.5 text-center">${b.r}</td>
        <td class="px-1.5 text-center ${b.h > 0 ? 'text-white font-medium' : ''}">${b.h}</td>
        <td class="px-1.5 text-center ${b.rbi > 0 ? 'text-emerald-400' : ''}">${b.rbi}</td>
        <td class="px-1.5 text-center ${b.hr > 0 ? 'text-amber-400 font-bold' : ''}">${b.hr}</td>
        <td class="px-1.5 text-center">${b.bb}</td>
        <td class="px-1.5 text-center ${b.so > 0 ? 'text-red-400/60' : ''}">${b.so}</td>
      </tr>`
    ).join('')

    const homeBattersHtml = (home.batters || []).map((b: any) =>
      `<tr class="border-b border-zinc-800/30">
        <td class="py-0.5 pr-3 text-zinc-300">${b.name}</td>
        <td class="px-1.5 text-center">${b.ab}</td>
        <td class="px-1.5 text-center">${b.r}</td>
        <td class="px-1.5 text-center ${b.h > 0 ? 'text-white font-medium' : ''}">${b.h}</td>
        <td class="px-1.5 text-center ${b.rbi > 0 ? 'text-emerald-400' : ''}">${b.rbi}</td>
        <td class="px-1.5 text-center ${b.hr > 0 ? 'text-amber-400 font-bold' : ''}">${b.hr}</td>
        <td class="px-1.5 text-center">${b.bb}</td>
        <td class="px-1.5 text-center ${b.so > 0 ? 'text-red-400/60' : ''}">${b.so}</td>
      </tr>`
    ).join('')

    const awayPitchersHtml = (away.pitchers || []).map((p: any) =>
      `<tr class="border-b border-zinc-800/30">
        <td class="py-0.5 pr-3 text-zinc-300">${p.name}</td>
        <td class="px-1.5 text-center">${p.ip}</td>
        <td class="px-1.5 text-center">${p.h}</td>
        <td class="px-1.5 text-center">${p.r}</td>
        <td class="px-1.5 text-center">${p.er}</td>
        <td class="px-1.5 text-center">${p.bb}</td>
        <td class="px-1.5 text-center ${p.so > 0 ? 'text-emerald-400' : ''}">${p.so}</td>
        <td class="px-1.5 text-center text-zinc-500">${p.pitches}</td>
      </tr>`
    ).join('')

    const homePitchersHtml = (home.pitchers || []).map((p: any) =>
      `<tr class="border-b border-zinc-800/30">
        <td class="py-0.5 pr-3 text-zinc-300">${p.name}</td>
        <td class="px-1.5 text-center">${p.ip}</td>
        <td class="px-1.5 text-center">${p.h}</td>
        <td class="px-1.5 text-center">${p.r}</td>
        <td class="px-1.5 text-center">${p.er}</td>
        <td class="px-1.5 text-center">${p.bb}</td>
        <td class="px-1.5 text-center ${p.so > 0 ? 'text-emerald-400' : ''}">${p.so}</td>
        <td class="px-1.5 text-center text-zinc-500">${p.pitches}</td>
      </tr>`
    ).join('')

    const batterHeader = `<tr class="text-zinc-500 text-[10px] uppercase tracking-wider">
      <th class="text-left py-1 pr-3 font-medium">Batter</th>
      <th class="px-1.5 text-center font-medium">AB</th>
      <th class="px-1.5 text-center font-medium">R</th>
      <th class="px-1.5 text-center font-medium">H</th>
      <th class="px-1.5 text-center font-medium">RBI</th>
      <th class="px-1.5 text-center font-medium">HR</th>
      <th class="px-1.5 text-center font-medium">BB</th>
      <th class="px-1.5 text-center font-medium">SO</th>
    </tr>`

    const pitcherHeader = `<tr class="text-zinc-500 text-[10px] uppercase tracking-wider">
      <th class="text-left py-1 pr-3 font-medium">Pitcher</th>
      <th class="px-1.5 text-center font-medium">IP</th>
      <th class="px-1.5 text-center font-medium">H</th>
      <th class="px-1.5 text-center font-medium">R</th>
      <th class="px-1.5 text-center font-medium">ER</th>
      <th class="px-1.5 text-center font-medium">BB</th>
      <th class="px-1.5 text-center font-medium">SO</th>
      <th class="px-1.5 text-center font-medium">NP</th>
    </tr>`

    const winnerAbbrev = totals.away.runs > totals.home.runs ? away.team.abbrev : home.team.abbrev
    const loserAbbrev = totals.away.runs > totals.home.runs ? home.team.abbrev : away.team.abbrev

    return `
<details class="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden group">
  <summary class="cursor-pointer hover:bg-zinc-800/50 transition px-4 py-3">
    <div class="inline-flex items-center gap-0 w-full">
      <!-- Linescore table -->
      <div class="overflow-x-auto flex-1">
        <table class="text-[11px] font-mono w-full">
          <thead>
            <tr class="text-zinc-600">
              <th class="text-left pr-3 py-1 font-medium w-12">Team</th>
              ${inningHeaders}
              <th class="px-2 py-1 text-center font-bold text-zinc-400 w-8">R</th>
              <th class="px-2 py-1 text-center font-medium text-zinc-500 w-8">H</th>
              <th class="px-2 py-1 text-center font-medium text-zinc-500 w-8">E</th>
            </tr>
          </thead>
          <tbody>
            <tr class="${totals.away.runs > totals.home.runs ? 'text-white' : 'text-zinc-400'}">
              <td class="pr-3 py-1 font-bold text-xs">${away.team.abbrev}</td>
              ${awayInnings}
              <td class="px-2 py-1 text-center font-bold text-sm">${totals.away.runs}</td>
              <td class="px-2 py-1 text-center text-zinc-400">${totals.away.hits}</td>
              <td class="px-2 py-1 text-center text-zinc-500">${totals.away.errors}</td>
            </tr>
            <tr class="${totals.home.runs > totals.away.runs ? 'text-white' : 'text-zinc-400'}">
              <td class="pr-3 py-1 font-bold text-xs">${home.team.abbrev}</td>
              ${homeInnings}
              <td class="px-2 py-1 text-center font-bold text-sm">${totals.home.runs}</td>
              <td class="px-2 py-1 text-center text-zinc-400">${totals.home.hits}</td>
              <td class="px-2 py-1 text-center text-zinc-500">${totals.home.errors}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="shrink-0 ml-3 text-zinc-600 group-open:rotate-180 transition-transform">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4.5l3 3 3-3"/></svg>
      </div>
    </div>
    ${decisionsHtml}
  </summary>
  <!-- Expanded details -->
  <div class="border-t border-zinc-800 px-4 py-3 space-y-4">
    <!-- Away batters -->
    <div>
      <div class="text-xs font-bold text-zinc-400 mb-1">${away.team.abbrev} Batting</div>
      <table class="text-[11px] font-mono w-full">${batterHeader}${awayBattersHtml}</table>
    </div>
    <!-- Away pitchers -->
    <div>
      <div class="text-xs font-bold text-zinc-400 mb-1">${away.team.abbrev} Pitching</div>
      <table class="text-[11px] font-mono w-full">${pitcherHeader}${awayPitchersHtml}</table>
    </div>
    <!-- Home batters -->
    <div>
      <div class="text-xs font-bold text-zinc-400 mb-1">${home.team.abbrev} Batting</div>
      <table class="text-[11px] font-mono w-full">${batterHeader}${homeBattersHtml}</table>
    </div>
    <!-- Home pitchers -->
    <div>
      <div class="text-xs font-bold text-zinc-400 mb-1">${home.team.abbrev} Pitching</div>
      <table class="text-[11px] font-mono w-full">${pitcherHeader}${homePitchersHtml}</table>
    </div>
  </div>
</details>`
  }).join('')
}

function buildNewsHtml(articles: any[]): string {
  if (articles.length === 0) return ''
  return articles.map(a => `
<a href="${a.link}" target="_blank" rel="noopener noreferrer"
   class="block bg-zinc-900 rounded-lg border border-zinc-800 p-3 hover:border-zinc-700 hover:bg-zinc-800/50 transition">
  <div class="flex items-start justify-between gap-3">
    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium text-zinc-200 leading-snug mb-1">${escapeHtml(a.title)}</div>
      <div class="text-xs text-zinc-500 line-clamp-1">${escapeHtml(a.description)}</div>
    </div>
    <span class="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">${escapeHtml(a.source)}</span>
  </div>
</a>`).join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ─── Data Fetchers ─── */

async function fetchGamesWithLinescores(date: string) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=team,linescore,decisions`
  const resp = await fetch(url)
  if (!resp.ok) return []
  const data = await resp.json()
  const dateEntry = data?.dates?.[0]
  if (!dateEntry) return []

  return (dateEntry.games || []).map((g: any) => {
    const status = g.status || {}
    const away = g.teams?.away || {}
    const home = g.teams?.home || {}
    return {
      gamePk: g.gamePk,
      state: status.abstractGameState,
      detailedState: status.detailedState,
      away: { name: away.team?.name || '', abbrev: away.team?.abbreviation || '', score: away.score ?? null },
      home: { name: home.team?.name || '', abbrev: home.team?.abbreviation || '', score: home.score ?? null },
    }
  })
}

async function fetchFullBoxScore(gamePk: number) {
  const [boxRes, lineRes] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`),
    fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`),
  ])
  if (!boxRes.ok || !lineRes.ok) return null

  const box = await boxRes.json()
  const line = await lineRes.json()

  function parseTeam(side: any) {
    const players = side.players || {}
    const battingOrder = (side.battingOrder || []) as number[]
    const pitcherIds = (side.pitchers || []) as number[]

    const batters = battingOrder.map((id: number) => {
      const p = players[`ID${id}`]
      if (!p) return null
      const s = p.stats?.batting || {}
      return {
        name: p.person?.fullName || '',
        ab: s.atBats ?? 0, r: s.runs ?? 0, h: s.hits ?? 0,
        rbi: s.rbi ?? 0, hr: s.homeRuns ?? 0, bb: s.baseOnBalls ?? 0, so: s.strikeOuts ?? 0,
      }
    }).filter(Boolean)

    const pitchers = pitcherIds.map((id: number) => {
      const p = players[`ID${id}`]
      if (!p) return null
      const s = p.stats?.pitching || {}
      return {
        name: p.person?.fullName || '',
        ip: s.inningsPitched || '0.0', h: s.hits ?? 0, r: s.runs ?? 0,
        er: s.earnedRuns ?? 0, so: s.strikeOuts ?? 0, bb: s.baseOnBalls ?? 0,
        pitches: s.numberOfPitches ?? 0,
      }
    }).filter(Boolean)

    return {
      team: { name: side.team?.name || '', abbrev: side.team?.abbreviation || '' },
      batters,
      pitchers,
    }
  }

  // Parse innings
  const innings = (line.innings || []).map((inn: any) => ({
    num: inn.num,
    away: { runs: inn.away?.runs ?? null },
    home: { runs: inn.home?.runs ?? null },
  }))

  // Totals with errors
  const totals = {
    away: { runs: line.teams?.away?.runs ?? 0, hits: line.teams?.away?.hits ?? 0, errors: line.teams?.away?.errors ?? 0 },
    home: { runs: line.teams?.home?.runs ?? 0, hits: line.teams?.home?.hits ?? 0, errors: line.teams?.home?.errors ?? 0 },
  }

  // Decisions (W/L/S)
  const dec = box.info?.find((i: any) => i.label === 'Decisions') || {}
  const decisions: { winner?: string; loser?: string; save?: string } = {}

  // Try to get decisions from the game endpoint
  const awayPlayers = box.teams?.away?.players || {}
  const homePlayers = box.teams?.home?.players || {}
  const allPlayers = { ...awayPlayers, ...homePlayers }

  // Check each pitcher for W/L/S note
  for (const key of Object.keys(allPlayers)) {
    const p = allPlayers[key]
    const note = p.stats?.pitching?.note
    if (!note) continue
    const name = p.person?.fullName || ''
    if (note.includes('W,') || note === 'W') decisions.winner = name
    if (note.includes('L,') || note === 'L') decisions.loser = name
    if (note.includes('S,') || note === 'S' || note.includes('SV')) decisions.save = name
  }

  return {
    gamePk,
    away: parseTeam(box.teams?.away || {}),
    home: parseTeam(box.teams?.home || {}),
    innings,
    totals,
    decisions,
  }
}

async function fetchNews() {
  const results = await Promise.allSettled(
    FEEDS.map(async (source) => {
      const feed = await rssParser.parseURL(source.url)
      return (feed.items || []).slice(0, 4).map(item => ({
        title: item.title || '',
        link: item.link || '',
        source: source.name,
        description: (item.contentSnippet || '').slice(0, 150).replace(/<[^>]*>/g, ''),
      }))
    })
  )
  return results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(item => item.title && item.link)
}
