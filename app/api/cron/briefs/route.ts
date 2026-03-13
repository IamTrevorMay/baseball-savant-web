import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import Parser from 'rss-parser'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const rssParser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Triton Baseball News Aggregator' },
})

const FEEDS = [
  { name: 'MLB.com', url: 'https://www.mlb.com/feeds/news/rss.xml' },
  { name: 'FanGraphs', url: 'https://blogs.fangraphs.com/feed/' },
  { name: 'MLB Trade Rumors', url: 'https://www.mlbtraderumors.com/feed' },
  { name: 'Pitcher List', url: 'https://pitcherlist.com/feed' },
  { name: 'ESPN', url: 'https://www.espn.com/espn/rss/mlb/news' },
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

  // Skip offseason (mid-Nov through mid-Feb)
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
    // Fetch scores, news, standings in parallel
    const [scoresData, newsItems, standingsData] = await Promise.all([
      fetchScores(briefDate),
      fetchNews(),
      fetchStandings(),
    ])

    // Fetch box scores for finished games (batched in groups of 5)
    const finishedGames = scoresData.filter((g: any) => g.state === 'Final')
    const boxScores: any[] = []
    for (let i = 0; i < finishedGames.length; i += 5) {
      const batch = finishedGames.slice(i, i + 5)
      const results = await Promise.allSettled(
        batch.map((g: any) => fetchBoxScore(g.gamePk))
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) boxScores.push(r.value)
      }
    }

    // Build prompt payload
    const payload = {
      date: briefDate,
      games: scoresData,
      boxScores,
      news: newsItems.slice(0, 15),
      standings: standingsData,
    }

    const isOffDay = finishedGames.length === 0

    const prompt = isOffDay
      ? `Generate a brief MLB daily recap for ${briefDate} (off-day / no games completed). Focus on news and standings. Return JSON with { title, summary, html }.`
      : `Generate a comprehensive MLB daily recap for ${briefDate}. Return JSON with { title, summary, html }.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{ role: 'user', content: `${prompt}\n\nData:\n${JSON.stringify(payload)}` }],
      system: `You are a baseball analyst writing a daily brief for a professional scouting platform called Triton.

Generate a daily MLB recap as JSON with exactly three fields:
- "title": A catchy headline for the day (e.g., "Dodgers Walk Off, Yankees Sweep — March 11 Recap")
- "summary": A 1-2 sentence summary of the day's action
- "html": Full HTML content using the app's dark theme Tailwind classes

The HTML should include these sections (skip any that don't apply):
1. **Scoreboard** — compact grid of all final scores using a responsive grid. Use bg-zinc-900 cards with border-zinc-800.
2. **Game Highlights** — 2-3 sentences per game covering key pitching, clutch hitting, notable plays. Use prose text.
3. **Top Performances** — table of top 5 hitters + top 5 pitchers by impact. Use text-[11px] font-mono tables with zinc styling.
4. **Rough Outings** — 2-3 notably bad performances in a compact list.
5. **News Roundup** — 5-8 articles with source, linked title, 1-sentence summary. Use <a> tags with class "text-emerald-400 hover:text-emerald-300".
6. **Standings Snapshot** — division leaders with records in a compact table.

HTML styling rules:
- Use Tailwind classes only (no inline styles)
- Background: bg-zinc-900, borders: border-zinc-800
- Text: text-zinc-200 body, text-white headers, text-zinc-400 secondary
- Accents: emerald-400/500 for highlights
- Section headers: <h2 class="text-lg font-bold text-white mb-3 mt-6">
- Tables: text-[11px] or text-[12px] font-mono
- Responsive: grid-cols-2 md:grid-cols-3 lg:grid-cols-4 for scoreboards
- Cards: bg-zinc-800/50 rounded-lg p-3 border border-zinc-700

Return ONLY valid JSON, no markdown fences.`,
    })

    const textContent = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    // Parse JSON from response (handle potential markdown fences)
    let parsed: { title: string; summary: string; html: string }
    try {
      const cleaned = textContent.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Failed to parse Claude response', raw: textContent.slice(0, 500) }, { status: 500 })
    }

    // Insert into briefs table
    const { error: insertError } = await supabaseAdmin
      .from('briefs')
      .insert({
        date: briefDate,
        title: parsed.title,
        content: parsed.html,
        summary: parsed.summary,
        metadata: {
          games_count: scoresData.length,
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

/* ─── Data Fetchers ─── */

async function fetchScores(date: string) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=team,linescore`
  const resp = await fetch(url)
  if (!resp.ok) return []
  const data = await resp.json()
  const dateEntry = data?.dates?.[0]
  if (!dateEntry) return []

  return (dateEntry.games || []).map((g: any) => {
    const status = g.status || {}
    const away = g.teams?.away || {}
    const home = g.teams?.home || {}
    const ls = g.linescore || {}
    return {
      gamePk: g.gamePk,
      state: status.abstractGameState,
      detailedState: status.detailedState,
      away: { name: away.team?.name || '', abbrev: away.team?.abbreviation || '', score: away.score ?? null },
      home: { name: home.team?.name || '', abbrev: home.team?.abbreviation || '', score: home.score ?? null },
      inning: ls.currentInning ?? null,
    }
  })
}

async function fetchBoxScore(gamePk: number) {
  const [boxRes, lineRes] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`),
    fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`),
  ])
  if (!boxRes.ok || !lineRes.ok) return null

  const box = await boxRes.json()
  const line = await lineRes.json()

  function parseTeamBrief(side: any) {
    const players = side.players || {}
    const battingOrder = (side.battingOrder || []) as number[]
    const pitcherIds = (side.pitchers || []) as number[]

    const batters = battingOrder.slice(0, 9).map((id: number) => {
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

  const totals = line.teams || {}
  return {
    gamePk,
    away: parseTeamBrief(box.teams?.away || {}),
    home: parseTeamBrief(box.teams?.home || {}),
    totals: {
      away: { runs: totals.away?.runs ?? 0, hits: totals.away?.hits ?? 0 },
      home: { runs: totals.home?.runs ?? 0, hits: totals.home?.hits ?? 0 },
    },
  }
}

async function fetchNews() {
  const results = await Promise.allSettled(
    FEEDS.map(async (source) => {
      const feed = await rssParser.parseURL(source.url)
      return (feed.items || []).slice(0, 5).map(item => ({
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

async function fetchStandings() {
  const url = `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${new Date().getFullYear()}&standingsTypes=regularSeason`
  const resp = await fetch(url)
  if (!resp.ok) return []
  const data = await resp.json()
  return (data.records || []).map((rec: any) => ({
    division: rec.division?.name || '',
    leader: rec.teamRecords?.[0] ? {
      name: rec.teamRecords[0].team?.name || '',
      w: rec.teamRecords[0].wins,
      l: rec.teamRecords[0].losses,
    } : null,
  }))
}
