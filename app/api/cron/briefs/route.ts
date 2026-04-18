import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import Parser from 'rss-parser'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'
import { computeOutingCommand, PitchRow } from '@/lib/outingCommand'
import { computeTrendAlerts, type TrendAlertRow } from '@/lib/trendAlerts'

export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const rssParser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Triton Baseball News Aggregator' },
})

const maydaySupabase = createClient(
  process.env.MAYDAY_SUPABASE_URL!,
  process.env.MAYDAY_SUPABASE_ANON_KEY!
)

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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Compute yesterday's date in ET
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  et.setDate(et.getDate() - 1)
  const briefDate = et.toISOString().slice(0, 10)

  // Skip offseason (Dec, Jan)
  const month = et.getMonth() + 1
  if (month === 12 || month === 1) {
    return json({ ok: true, skipped: true, reason: 'offseason' })
  }

  // Force regeneration: delete existing brief for this date
  const force = req.nextUrl.searchParams.get('force') === 'true'
  if (force) {
    await supabaseAdmin.from('briefs').delete().eq('date', briefDate)
  }

  // Idempotency: skip if brief already exists
  const { data: existing } = await supabaseAdmin
    .from('briefs')
    .select('id')
    .eq('date', briefDate)
    .maybeSingle()

  if (existing) {
    return json({ ok: true, skipped: true, reason: 'already_exists', date: briefDate })
  }

  try {
    // Fetch games, news, transactions, daily highlights, standings, trends, and top start card in parallel
    const [gamesData, newsItems, transactions, dailyHighlights, standings, trendAlerts, topStartCard] = await Promise.all([
      fetchGamesWithLinescores(briefDate),
      fetchNews(),
      fetchTransactions(briefDate),
      fetchDailyHighlights(briefDate),
      fetchStandings(briefDate),
      fetchTrendAlerts(briefDate),
      fetchTopStartCard(briefDate),
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

    // Build player name → ID lookup from box score data (early, for box score HTML)
    const playerNameToIdEarly: Record<string, number> = {}
    for (const bs of boxScores) {
      for (const b of [...(bs.away.batters || []), ...(bs.home.batters || [])]) {
        if (b.name && b.id) playerNameToIdEarly[b.name] = b.id
      }
      for (const p of [...(bs.away.pitchers || []), ...(bs.home.pitchers || [])]) {
        if (p.name && p.id) playerNameToIdEarly[p.name] = p.id
      }
    }

    // Build box scores HTML (deterministic — no Claude needed)
    const boxScoresHtml = buildBoxScoresHtml(boxScores, playerNameToIdEarly)

    // Build news HTML (deterministic)
    // Ensure at least 8 headlines; show up to 12
    const topNews = newsItems.slice(0, Math.max(8, Math.min(newsItems.length, 12)))
    const newsHtml = buildNewsHtml(topNews)

    // Build news headlines for Claude context
    const newsHeadlines = newsItems.slice(0, 20).map(a => `${a.title} [${a.source}]`).join('\n')

    // Ask Claude for: title, summary, day rundown, performances, injuries
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
      ? `Generate a brief MLB daily recap for ${briefDate} (off-day / no games). Return JSON with { title, summary, dayRundown, aroundBaseball, topPerformances, worstPerformances, injuries, transactions }. dayRundown, aroundBaseball, topPerformances, and worstPerformances should be empty strings. For injuries and transactions, return empty strings.`
      : `Analyze these ${briefDate} MLB box scores, news headlines, and transaction data. Return JSON with exactly 8 fields:
- "title": Catchy headline (e.g., "Yankees Cruise, Dodgers Walk Off — March 11 Recap")
- "summary": 1-2 sentence summary of the day.
- "dayRundown": A narrative recap of the day's action, under 500 words. Tell the story of the day — the big wins, comebacks, dominant pitching performances, offensive explosions, and any notable storylines. Write it like a sportswriter's column, flowing naturally from game to game. Use HTML paragraphs with inline styles. Player names should be bold.
- "aroundBaseball": If notable non-MLB baseball news appears in the headlines (minor leagues, college, high school, international), write a brief HTML paragraph or two covering it. If no non-MLB baseball news is present, return an empty string.
- "topPerformances": HTML section of the 8-10 best individual performances (hitters and pitchers). Each entry MUST include the opponent abbreviation in the format "vs. OPP" (use "vs." for home games, "@" for away games — if the player is on the home team show "vs. AWAY", if on the away team show "@ HOME"). Use a styled list with player names, teams, and key stats.
- "worstPerformances": HTML section of the 4-5 worst individual performances. Same format with opponent.
- "injuries": HTML section for official IL placements from the transaction data. Include the IL type (10-Day, 15-Day, 60-Day) and injury description if available in the transaction text. Use color:#fbbf24 accent. If no IL placements, return an empty string.
- "transactions": HTML section for IL activations (players returning from injury) from the transaction data. Use green accent (#34d399). If no activations, return an empty string.

Box score data:\n${JSON.stringify(performanceData)}

News headlines:\n${newsHeadlines}

IL/Transaction data:\n${JSON.stringify(transactions)}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 6144,
      messages: [{ role: 'user', content: claudePrompt }],
      system: `You are a baseball analyst writing a daily brief for a professional scouting platform.

Return JSON with exactly these fields: title, summary, dayRundown, aroundBaseball, topPerformances, worstPerformances, injuries, transactions.

For dayRundown, write a narrative recap of the day under 500 words. Use HTML with inline styles. Format as 3-5 paragraphs wrapped in <p> tags with style="margin-bottom:14px;color:#d4d4d8;font-size:14px;line-height:1.7;". Bold player names using <strong style="color:#f0f0f0">Player Name</strong>. Tell the story of the day like a sportswriter — weave together the biggest moments, comebacks, dominant performances, and storylines.

For topPerformances and worstPerformances, generate HTML using INLINE STYLES (no CSS classes). Each performance entry should be a table row in this exact format (with opponent shown after the team abbrev):

<tr>
  <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
    <span style="font-weight:600;color:#f0f0f0">Player Name</span>
    <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">TEA</span>
    <span style="color:rgba(255,255,255,0.45);font-size:11px;margin-left:4px">vs. OPP</span>
  </td>
  <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.55);font-size:12px;text-align:right">
    3-for-4, 2 HR, 5 RBI
  </td>
</tr>

Wrap all rows in: <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>...</tbody></table>

For worst performances, use color:#f87171 on the stats td instead of the default.

For top performances, highlight dominant pitching (lots of K, low ER, deep outings) and big offensive games (multi-hit, HR, high RBI).
For worst performances, highlight blown starts (short outings, high ER), 0-for with multiple K, etc.

For injuries, generate HTML using the same table format for official IL placements ONLY (from the IL/Transaction data provided). Include the IL type (10-Day, 15-Day, 60-Day) and injury description if available in the transaction text. Use color:#fbbf24 for the status label. Each entry: player name (bold), team abbreviation, IL type, and injury if mentioned. If no IL placements in the data, return an empty string. Do NOT speculate about injuries from box score data.

For transactions, generate HTML using the same table format for IL activations (players returning from injury) from the transaction data. Use color:#34d399 for the status label. Each entry: player name (bold), team abbreviation, and description. If no activations in the data, return an empty string.

Return ONLY valid JSON, no markdown fences.`,
    })

    const textContent = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    let parsed: { title: string; summary: string; dayRundown: string; aroundBaseball: string; topPerformances: string; worstPerformances: string; injuries: string; transactions: string }
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/)
      const cleaned = jsonMatch ? jsonMatch[0] : textContent.trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return json({ error: 'Failed to parse Claude response', raw: textContent.slice(0, 500) }, { status: 500 })
    }

    // Assemble final HTML
    const finalHtml = assembleBriefHtml({
      dayRundown: parsed.dayRundown,
      aroundBaseball: parsed.aroundBaseball,
      boxScoresHtml,
      topPerformances: parsed.topPerformances,
      worstPerformances: parsed.worstPerformances,
      injuries: parsed.injuries,
      transactions: parsed.transactions,
      newsHtml,
      isOffDay,
      playerNameToId: playerNameToIdEarly,
      dailyHighlights,
      standings,
      trendAlerts,
      topStartCard,
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
          daily_highlights: dailyHighlights,
          trend_alerts: trendAlerts,
          claude_sections: {
            dayRundown: parsed.dayRundown,
            topPerformances: parsed.topPerformances,
            worstPerformances: parsed.worstPerformances,
            injuries: parsed.injuries,
            transactions: parsed.transactions,
          },
          scores: boxScores.map(bs => ({
            away: bs.away.team.abbrev,
            home: bs.home.team.abbrev,
            awayScore: bs.totals.away.runs,
            homeScore: bs.totals.home.runs,
            winner: bs.decisions.winner || null,
            loser: bs.decisions.loser || null,
            save: bs.decisions.save || null,
          })),
        },
      })

    if (insertError) {
      return json({ error: insertError.message }, { status: 500 })
    }

    return json({ ok: true, date: briefDate, title: parsed.title })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, { status: 500 })
  }
}

/* ─── HTML Builders ─── */

const S = {
  // Layout
  wrap: 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#d4d4d8;line-height:1.5;',
  section: 'margin-bottom:40px;',
  sectionTitle: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.35);margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);',
  // Box score cards
  cardGrid: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;',
  card: 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;',
  cardHeader: 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);',
  teamRow: 'display:flex;align-items:center;gap:8px;',
  teamAbbrev: 'font-size:13px;font-weight:700;width:36px;',
  teamScore: 'font-size:20px;font-weight:800;',
  scoreWin: 'color:#ffffff;',
  scoreLose: 'color:rgba(255,255,255,0.35);',
  atSymbol: 'color:rgba(255,255,255,0.2);font-size:11px;font-weight:400;margin:0 4px;',
  // Linescore
  linescoreWrap: 'padding:0 16px 10px;overflow-x:auto;',
  linescoreTable: 'width:100%;border-collapse:collapse;font-family:"SF Mono",SFMono-Regular,Menlo,monospace;font-size:10px;',
  lsHeader: 'color:rgba(255,255,255,0.25);font-weight:500;padding:4px 0;text-align:center;',
  lsHeaderTeam: 'color:rgba(255,255,255,0.25);font-weight:500;padding:4px 0;text-align:left;width:36px;',
  lsCell: 'padding:3px 0;text-align:center;min-width:18px;',
  lsCellScored: 'color:#ffffff;font-weight:600;',
  lsCellEmpty: 'color:rgba(255,255,255,0.2);',
  lsTotalR: 'font-weight:700;padding:3px 4px;text-align:center;border-left:1px solid rgba(255,255,255,0.08);',
  lsTotalHE: 'color:rgba(255,255,255,0.4);padding:3px 4px;text-align:center;',
  // Decisions
  decRow: 'padding:6px 16px 10px;font-size:11px;color:rgba(255,255,255,0.4);display:flex;gap:12px;flex-wrap:wrap;',
  decW: 'color:#34d399;',
  decL: 'color:#f87171;',
  decS: 'color:#38bdf8;',
  // Expanded box
  expandToggle: 'display:block;width:100%;padding:6px 16px;background:rgba(255,255,255,0.02);border:none;border-top:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.3);font-size:10px;font-family:inherit;cursor:pointer;text-align:center;',
  detailsInner: 'padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);',
  detailLabel: 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:rgba(255,255,255,0.3);margin:12px 0 4px;',
  detailTable: 'width:100%;border-collapse:collapse;font-family:"SF Mono",SFMono-Regular,Menlo,monospace;font-size:10px;',
  dtHead: 'color:rgba(255,255,255,0.25);font-weight:500;padding:3px 0;text-align:center;',
  dtHeadLeft: 'color:rgba(255,255,255,0.25);font-weight:500;padding:3px 0;text-align:left;',
  dtCell: 'padding:2px 0;text-align:center;color:rgba(255,255,255,0.55);border-bottom:1px solid rgba(255,255,255,0.04);',
  dtCellName: 'padding:2px 0;text-align:left;color:rgba(255,255,255,0.7);border-bottom:1px solid rgba(255,255,255,0.04);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;',
  dtCellHi: 'font-weight:600;color:#ffffff;',
  dtCellHr: 'font-weight:700;color:#fbbf24;',
  dtCellRbi: 'color:#34d399;',
  dtCellK: 'color:rgba(248,113,113,0.6);',
  dtCellSo: 'color:#34d399;',
  // Performances
  perfWrap: 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 20px;',
  // News
  newsItem: 'display:flex;align-items:start;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);',
  newsTitle: 'font-size:13px;font-weight:500;color:#e2e8f0;line-height:1.4;text-decoration:none;',
  newsDesc: 'font-size:11px;color:rgba(255,255,255,0.35);margin-top:3px;line-height:1.4;',
  newsBadge: 'flex-shrink:0;font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.35);white-space:nowrap;margin-top:1px;',
}

interface BriefGameLine {
  ip: string; h: number; r: number; er: number; bb: number; k: number
  pitches: number; decision: string
}

interface DailyHighlightsData {
  date: string
  stuff_starter: { player_id: number; player_name: string; team: string; pitch_name: string; stuff_plus: number; velo: number | null; hbreak_in: number | null; ivb_in: number | null; game_line: BriefGameLine | null } | null
  stuff_reliever: { player_id: number; player_name: string; team: string; pitch_name: string; stuff_plus: number; velo: number | null; hbreak_in: number | null; ivb_in: number | null; game_line: BriefGameLine | null } | null
  cmd_starter: { player_id: number; player_name: string; team: string; cmd_plus: number; pitches: number; game_line: BriefGameLine | null } | null
  cmd_reliever: { player_id: number; player_name: string; team: string; cmd_plus: number; pitches: number; game_line: BriefGameLine | null } | null
  new_pitches: Array<{
    player_id: number; player_name: string; team: string; pitch_name: string; count: number
    avg_hbreak: number | null; avg_ivb: number | null; avg_stuff_plus: number | null
    avg_brink: number | null; avg_cluster: number | null; avg_missfire: number | null; cmd_plus: number | null
  }>
}

function plusColorHex(val: number): string {
  if (val >= 130) return '#34d399'
  if (val >= 115) return '#6ee7b7'
  if (val >= 100) return '#d4d4d8'
  if (val >= 85) return '#fb923c'
  return '#f87171'
}

function buildDailyHighlightsHtml(data: DailyHighlightsData | null): string {
  if (!data) return ''
  const hasStuff = data.stuff_starter || data.stuff_reliever
  const hasCmd = data.cmd_starter || data.cmd_reliever
  const hasNew = data.new_pitches.length > 0
  if (!hasStuff && !hasCmd && !hasNew) return ''

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tritonapex.io'
  const headshot = (id: number) =>
    `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_100,q_auto:best/v1/people/${id}/headshot/67/current`

  const cardStyle = 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px 16px;text-decoration:none;display:block;color:inherit;'
  const labelStyle = 'font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35);margin-bottom:10px;'
  const nameStyle = 'font-size:13px;font-weight:600;color:#f0f0f0;'
  const subStyle = 'font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;'
  const valStyle = (c: string) => `font-size:22px;font-weight:800;font-family:"SF Mono",SFMono-Regular,Menlo,monospace;color:${c};`
  const imgStyle = 'width:44px;height:44px;border-radius:50%;object-fit:cover;background:rgba(255,255,255,0.05);'
  const lineStyle = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:6px;font-family:"SF Mono",SFMono-Regular,Menlo,monospace;'
  const decBadge = (d: string) => {
    const colors: Record<string, string> = { W: '#34d399', L: '#f87171', SV: '#38bdf8', HLD: '#fbbf24' }
    const c = colors[d]
    return c ? `<span style="font-size:9px;font-weight:700;color:${c};margin-right:4px;">${d}</span>` : ''
  }
  const fmtLine = (gl: BriefGameLine) => `${gl.ip} IP, ${gl.h} H, ${gl.er} ER, ${gl.bb} BB, ${gl.k} K`

  const stuffCard = (label: string, accentLabel: string, d: typeof data.stuff_starter) => {
    if (!d) return ''
    const glHtml = d.game_line ? `<div style="${lineStyle}">${decBadge(d.game_line.decision)}${fmtLine(d.game_line)}</div>` : ''
    return `
    <a href="${siteUrl}/player/${d.player_id}" style="${cardStyle}">
      <div style="${labelStyle}"><span style="color:#fbbf24">${accentLabel}</span> ${label}</div>
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${headshot(d.player_id)}" alt="" style="${imgStyle}" />
        <div style="flex:1;min-width:0;">
          <div style="${nameStyle}">${escapeHtml(d.player_name)}</div>
          <div style="${subStyle}">${escapeHtml(d.team)} · ${escapeHtml(d.pitch_name)}</div>
        </div>
        <div style="text-align:right;">
          <div style="${valStyle(plusColorHex(d.stuff_plus))}">${d.stuff_plus}</div>
          ${d.velo ? `<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:1px;">${d.velo} mph</div>` : ''}
        </div>
      </div>
      ${glHtml}
    </a>`
  }

  const cmdCard = (label: string, accentLabel: string, d: typeof data.cmd_starter) => {
    if (!d) return ''
    const glHtml = d.game_line ? `<div style="${lineStyle}">${decBadge(d.game_line.decision)}${fmtLine(d.game_line)}</div>` : ''
    return `
    <a href="${siteUrl}/player/${d.player_id}" style="${cardStyle}">
      <div style="${labelStyle}"><span style="color:#38bdf8">${accentLabel}</span> ${label}</div>
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${headshot(d.player_id)}" alt="" style="${imgStyle}" />
        <div style="flex:1;min-width:0;">
          <div style="${nameStyle}">${escapeHtml(d.player_name)}</div>
          <div style="${subStyle}">${escapeHtml(d.team)} · ${d.pitches} pitches</div>
        </div>
        <div style="${valStyle(plusColorHex(d.cmd_plus))}">${d.cmd_plus}</div>
      </div>
      ${glHtml}
    </a>`
  }

  // Top row: 4 cards in 2x2 grid
  const topCards = [
    stuffCard('Starter', 'Stuff+', data.stuff_starter),
    stuffCard('Reliever', 'Stuff+', data.stuff_reliever),
    cmdCard('Starter', 'Cmd+', data.cmd_starter),
    cmdCard('Reliever', 'Cmd+', data.cmd_reliever),
  ].filter(Boolean)

  let html = ''

  if (topCards.length > 0) {
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">${topCards.join('')}</div>`
  }

  // New pitch alerts table
  if (hasNew) {
    const thStyle = 'padding:5px 8px;font-size:10px;font-weight:600;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid rgba(255,255,255,0.08);'
    const tdStyle = 'padding:5px 8px;font-size:11px;color:rgba(255,255,255,0.55);border-bottom:1px solid rgba(255,255,255,0.04);font-family:"SF Mono",SFMono-Regular,Menlo,monospace;'
    const tdNameStyle = 'padding:5px 8px;font-size:11px;color:rgba(255,255,255,0.7);border-bottom:1px solid rgba(255,255,255,0.04);white-space:nowrap;'

    const rows = data.new_pitches.map(np => {
      const pLink = `<a href="${siteUrl}/player/${np.player_id}" style="color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2);text-underline-offset:2px;">${escapeHtml(np.player_name)}</a>`
      const stuffColor = np.avg_stuff_plus != null ? plusColorHex(np.avg_stuff_plus) : 'rgba(255,255,255,0.3)'
      const cmdColor = np.cmd_plus != null ? plusColorHex(np.cmd_plus) : 'rgba(255,255,255,0.3)'
      return `<tr>
        <td style="${tdNameStyle}">${pLink} <span style="font-size:9px;color:rgba(255,255,255,0.25)">${escapeHtml(np.team)}</span></td>
        <td style="${tdStyle}color:#fb923c;font-weight:600;">${escapeHtml(np.pitch_name)}</td>
        <td style="${tdStyle}text-align:right;">${np.count}</td>
        <td style="${tdStyle}text-align:right;">${np.avg_hbreak != null ? np.avg_hbreak + '"' : '—'}</td>
        <td style="${tdStyle}text-align:right;">${np.avg_ivb != null ? np.avg_ivb + '"' : '—'}</td>
        <td style="${tdStyle}text-align:right;color:${stuffColor};font-weight:600;">${np.avg_stuff_plus ?? '—'}</td>
        <td style="${tdStyle}text-align:right;">${np.avg_brink != null ? np.avg_brink.toFixed(1) : '—'}</td>
        <td style="${tdStyle}text-align:right;">${np.avg_cluster != null ? np.avg_cluster.toFixed(1) : '—'}</td>
        <td style="${tdStyle}text-align:right;">${np.avg_missfire != null ? np.avg_missfire.toFixed(1) : '—'}</td>
        <td style="${tdStyle}text-align:right;color:${cmdColor};font-weight:600;">${np.cmd_plus ?? '—'}</td>
      </tr>`
    }).join('')

    html += `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(251,146,60,0.15);border-radius:10px;overflow:hidden;">
      <div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:10px;font-weight:700;color:#fb923c;text-transform:uppercase;letter-spacing:0.08em;">
        New Pitch Alerts
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="${thStyle}text-align:left;">Pitcher</th>
          <th style="${thStyle}text-align:left;">Pitch</th>
          <th style="${thStyle}text-align:right;">N</th>
          <th style="${thStyle}text-align:right;">HBreak</th>
          <th style="${thStyle}text-align:right;">IVB</th>
          <th style="${thStyle}text-align:right;">Stuff+</th>
          <th style="${thStyle}text-align:right;">Brink</th>
          <th style="${thStyle}text-align:right;">Cluster</th>
          <th style="${thStyle}text-align:right;">Missfire</th>
          <th style="${thStyle}text-align:right;">Cmd+</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }

  return html
}

function assembleBriefHtml(parts: {
  dayRundown: string
  aroundBaseball: string
  boxScoresHtml: string
  topPerformances: string
  worstPerformances: string
  injuries: string
  transactions: string
  newsHtml: string
  isOffDay: boolean
  playerNameToId: Record<string, number>
  dailyHighlights: DailyHighlightsData | null
  standings: StandingsData | null
  trendAlerts: TrendAlertsData | null
  topStartCard: TopStartCardData | null
}) {
  const sections: string[] = []
  const halfGrid = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;'
  const noData = '<p style="color:rgba(255,255,255,0.4);font-size:13px">Nothing to report today.</p>'

  // 1. The Day in Baseball — narrative recap (TOP)
  if (parts.dayRundown || parts.aroundBaseball) {
    const aroundBlock = parts.aroundBaseball
      ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:10px;font-style:italic;">In Other News...</div>
          ${parts.aroundBaseball}
        </div>`
      : ''
    sections.push(`
<div style="${S.section}">
  <div style="${S.sectionTitle}">The Day in Baseball</div>
  <div style="${S.perfWrap}">${parts.dayRundown ? linkifyPlayerNames(parts.dayRundown, parts.playerNameToId) : ''}${aroundBlock}</div>
</div>`)
  }

  // 2. Yesterday's Pitching Standouts — daily highlights
  const highlightsHtml = buildDailyHighlightsHtml(parts.dailyHighlights)
  if (highlightsHtml) {
    sections.push(`
<div style="${S.section}">
  <div style="${S.sectionTitle}">Yesterday's Pitching Standouts</div>
  ${highlightsHtml}
  <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:rgba(255,255,255,0.4);line-height:1.5;">
    The top Stuff+ and Cmd+ outings from yesterday's games for both starters and relievers. <strong style="color:rgba(255,255,255,0.6);">Stuff+</strong> measures raw pitch quality (velocity, movement, extension) on a scale where 100 is league average. <strong style="color:rgba(255,255,255,0.6);">Cmd+</strong> measures location accuracy and intent.
  </div>
</div>`)
  }

  // 3. Surges / Concerns — top 5 each from trends
  const surgesConcernsHtml = buildSurgesConcernsHtml(parts.trendAlerts)
  if (surgesConcernsHtml) {
    sections.push(`
<div style="${S.section}">
  <div style="${halfGrid}">
    ${surgesConcernsHtml}
  </div>
  <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:rgba(255,255,255,0.4);line-height:1.5;">
    Players whose recent performance deviates significantly from their season average. <strong style="color:#34d399;">Surges</strong> are notable improvements; <strong style="color:#f87171;">Concerns</strong> are notable declines. Each row shows the season average and the recent value to highlight the trend.
  </div>
</div>`)
  }

  // 4. Start of the Day — top-ranked card from the daily_cards top_start bucket
  const startOfDayHtml = buildStartOfDayHtml(parts.topStartCard)
  if (startOfDayHtml) {
    sections.push(`
<div style="${S.section}">
  <div style="${S.sectionTitle}">Start of the Day</div>
  ${startOfDayHtml}
</div>`)
  }

  // 5 & 6. Top Performances + Rough Outings side by side
  if (parts.topPerformances || parts.worstPerformances) {
    sections.push(`
<div style="${S.section}">
  <div style="${halfGrid}">
    <div>
      <div style="${S.sectionTitle}">Top Performances</div>
      <div style="${S.perfWrap}">${parts.topPerformances ? linkifyPlayerNames(parts.topPerformances, parts.playerNameToId) : noData}</div>
    </div>
    <div>
      <div style="${S.sectionTitle}">Rough Outings</div>
      <div style="${S.perfWrap}">${parts.worstPerformances ? linkifyPlayerNames(parts.worstPerformances, parts.playerNameToId) : noData}</div>
    </div>
  </div>
</div>`)
  }

  // 7 & 8. Injuries + Transactions side by side
  sections.push(`
<div style="${S.section}">
  <div style="${halfGrid}">
    <div>
      <div style="${S.sectionTitle}">Injuries</div>
      <div style="${S.perfWrap}">${parts.injuries ? linkifyPlayerNames(parts.injuries, parts.playerNameToId) : noData}</div>
    </div>
    <div>
      <div style="${S.sectionTitle}">Transactions</div>
      <div style="${S.perfWrap}">${parts.transactions ? linkifyPlayerNames(parts.transactions, parts.playerNameToId) : noData}</div>
    </div>
  </div>
</div>`)

  // 9. Box Scores (4 per row, near bottom)
  if (!parts.isOffDay && parts.boxScoresHtml) {
    sections.push(`
<div style="${S.section}">
  <div style="${S.sectionTitle}">Box Scores</div>
  <div style="${S.cardGrid}">${parts.boxScoresHtml}</div>
</div>`)
  }

  // 10. Standings Snapshot (bottom)
  const standingsHtml = buildStandingsHtml(parts.standings)
  if (standingsHtml) {
    sections.push(`
<div style="${S.section}">
  <div style="${S.sectionTitle}">Standings Snapshot</div>
  ${standingsHtml}
</div>`)
  }

  return `<div style="${S.wrap}">${sections.join('')}</div>`
}

/** Replace player names in HTML with clickable links to their Triton research page. */
function linkifyPlayerNames(html: string, nameToId: Record<string, number>): string {
  // Sort by name length descending to match longer names first (e.g., "J.D. Martinez" before "Martinez")
  const names = Object.keys(nameToId).sort((a, b) => b.length - a.length)
  const linkStyle = 'color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2);text-underline-offset:2px;'
  let result = html
  for (const name of names) {
    if (!name || name.length < 4) continue // skip very short names to avoid false matches
    const id = nameToId[name]
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Replace name inside <strong> tags: <strong>Name</strong> → <strong><a>Name</a></strong>
    result = result.replace(
      new RegExp(`(<strong[^>]*>)(${escapedName})(</strong>)`, 'g'),
      `$1<a href="https://www.tritonapex.io/player/${id}" target="_blank" rel="noopener" style="${linkStyle}">$2</a>$3`
    )
    // Replace name inside <span> with font-weight:600 (performance tables): <span style="...">Name</span>
    result = result.replace(
      new RegExp(`(<span[^>]*font-weight:600[^>]*>)(${escapedName})(</span>)`, 'g'),
      `$1<a href="https://www.tritonapex.io/player/${id}" target="_blank" rel="noopener" style="${linkStyle}">$2</a>$3`
    )
  }
  return result
}

function playerLink(name: string, id: number | undefined): string {
  if (!id) return escapeHtml(name)
  const style = 'color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2);text-underline-offset:2px;'
  return `<a href="https://www.tritonapex.io/player/${id}" target="_blank" rel="noopener" style="${style}">${escapeHtml(name)}</a>`
}

function buildBoxScoresHtml(boxScores: any[], nameToId: Record<string, number>): string {
  return boxScores.map(bs => {
    const { away, home, innings, totals, decisions } = bs
    const numInnings = Math.max(innings.length, 9)
    const awayWon = totals.away.runs > totals.home.runs

    // Linescore header
    const innHeaders = Array.from({ length: numInnings }, (_, i) =>
      `<th style="${S.lsHeader}">${i + 1}</th>`
    ).join('')

    // Inning cells
    const makeInningCells = (side: 'away' | 'home') =>
      Array.from({ length: numInnings }, (_, i) => {
        const val = innings[i]?.[side]?.runs
        const scored = val != null && val > 0
        return `<td style="${S.lsCell}${scored ? S.lsCellScored : S.lsCellEmpty}">${val ?? '-'}</td>`
      }).join('')

    // Decisions
    const decParts: string[] = []
    if (decisions.winner) decParts.push(`<span><span style="${S.decW}">W</span> ${playerLink(decisions.winner, nameToId[decisions.winner])}</span>`)
    if (decisions.loser) decParts.push(`<span><span style="${S.decL}">L</span> ${playerLink(decisions.loser, nameToId[decisions.loser])}</span>`)
    if (decisions.save) decParts.push(`<span><span style="${S.decS}">S</span> ${playerLink(decisions.save, nameToId[decisions.save])}</span>`)

    // Expanded batting/pitching tables
    const makeBatterRows = (batters: any[]) => batters.map((b: any) =>
      `<tr>
        <td style="${S.dtCellName}">${playerLink(b.name, b.id || nameToId[b.name])}</td>
        <td style="${S.dtCell}">${b.ab}</td>
        <td style="${S.dtCell}">${b.r}</td>
        <td style="${S.dtCell}${b.h > 0 ? S.dtCellHi : ''}">${b.h}</td>
        <td style="${S.dtCell}${b.rbi > 0 ? S.dtCellRbi : ''}">${b.rbi}</td>
        <td style="${S.dtCell}${b.hr > 0 ? S.dtCellHr : ''}">${b.hr}</td>
        <td style="${S.dtCell}">${b.bb}</td>
        <td style="${S.dtCell}${b.so > 0 ? S.dtCellK : ''}">${b.so}</td>
      </tr>`
    ).join('')

    const makePitcherRows = (pitchers: any[]) => pitchers.map((p: any) =>
      `<tr>
        <td style="${S.dtCellName}">${playerLink(p.name, p.id || nameToId[p.name])}</td>
        <td style="${S.dtCell}">${p.ip}</td>
        <td style="${S.dtCell}">${p.h}</td>
        <td style="${S.dtCell}">${p.r}</td>
        <td style="${S.dtCell}">${p.er}</td>
        <td style="${S.dtCell}">${p.bb}</td>
        <td style="${S.dtCell}${p.so > 0 ? S.dtCellSo : ''}">${p.so}</td>
        <td style="${S.dtCell};color:rgba(255,255,255,0.25)">${p.pitches}</td>
      </tr>`
    ).join('')

    const batHeader = `<tr>
      <th style="${S.dtHeadLeft}">Batter</th>
      <th style="${S.dtHead}">AB</th><th style="${S.dtHead}">R</th><th style="${S.dtHead}">H</th>
      <th style="${S.dtHead}">RBI</th><th style="${S.dtHead}">HR</th><th style="${S.dtHead}">BB</th><th style="${S.dtHead}">SO</th>
    </tr>`

    const pitHeader = `<tr>
      <th style="${S.dtHeadLeft}">Pitcher</th>
      <th style="${S.dtHead}">IP</th><th style="${S.dtHead}">H</th><th style="${S.dtHead}">R</th>
      <th style="${S.dtHead}">ER</th><th style="${S.dtHead}">BB</th><th style="${S.dtHead}">SO</th><th style="${S.dtHead}">NP</th>
    </tr>`

    return `
<div style="${S.card}">
  <!-- Score header -->
  <div style="${S.cardHeader}">
    <div style="${S.teamRow}">
      <span style="${S.teamAbbrev}${awayWon ? S.scoreWin : S.scoreLose}">${away.team.abbrev}</span>
      <span style="${S.teamScore}${awayWon ? S.scoreWin : S.scoreLose}">${totals.away.runs}</span>
    </div>
    <span style="${S.atSymbol}">@</span>
    <div style="${S.teamRow}">
      <span style="${S.teamScore}${!awayWon ? S.scoreWin : S.scoreLose}">${totals.home.runs}</span>
      <span style="${S.teamAbbrev}${!awayWon ? S.scoreWin : S.scoreLose}">${home.team.abbrev}</span>
    </div>
  </div>
  <!-- Linescore -->
  <div style="${S.linescoreWrap}">
    <table style="${S.linescoreTable}">
      <thead><tr><th style="${S.lsHeaderTeam}"></th>${innHeaders}<th style="${S.lsHeader};border-left:1px solid rgba(255,255,255,0.08)">R</th><th style="${S.lsHeader}">H</th><th style="${S.lsHeader}">E</th></tr></thead>
      <tbody>
        <tr style="${awayWon ? 'color:#fff' : 'color:rgba(255,255,255,0.4)'}">
          <td style="text-align:left;font-weight:700;padding:3px 0;font-size:11px">${away.team.abbrev}</td>
          ${makeInningCells('away')}
          <td style="${S.lsTotalR}">${totals.away.runs}</td>
          <td style="${S.lsTotalHE}">${totals.away.hits}</td>
          <td style="${S.lsTotalHE}">${totals.away.errors}</td>
        </tr>
        <tr style="${!awayWon ? 'color:#fff' : 'color:rgba(255,255,255,0.4)'}">
          <td style="text-align:left;font-weight:700;padding:3px 0;font-size:11px">${home.team.abbrev}</td>
          ${makeInningCells('home')}
          <td style="${S.lsTotalR}">${totals.home.runs}</td>
          <td style="${S.lsTotalHE}">${totals.home.hits}</td>
          <td style="${S.lsTotalHE}">${totals.home.errors}</td>
        </tr>
      </tbody>
    </table>
  </div>
  ${decParts.length > 0 ? `<div style="${S.decRow}">${decParts.join('')}</div>` : ''}
  <!-- Expandable details -->
  <details>
    <summary style="${S.expandToggle}">Full Box Score</summary>
    <div style="${S.detailsInner}">
      <div style="${S.detailLabel}">${away.team.abbrev} Batting</div>
      <table style="${S.detailTable}">${batHeader}${makeBatterRows(away.batters || [])}</table>
      <div style="${S.detailLabel}">${away.team.abbrev} Pitching</div>
      <table style="${S.detailTable}">${pitHeader}${makePitcherRows(away.pitchers || [])}</table>
      <div style="${S.detailLabel};margin-top:16px">${home.team.abbrev} Batting</div>
      <table style="${S.detailTable}">${batHeader}${makeBatterRows(home.batters || [])}</table>
      <div style="${S.detailLabel}">${home.team.abbrev} Pitching</div>
      <table style="${S.detailTable}">${pitHeader}${makePitcherRows(home.pitchers || [])}</table>
    </div>
  </details>
</div>`
  }).join('')
}

function buildNewsHtml(articles: any[]): string {
  if (articles.length === 0) return ''
  return articles.map((a, i) => `
<a href="${a.link}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;display:block;">
  <div style="${S.newsItem}${i === articles.length - 1 ? 'border-bottom:none;' : ''}">
    <div style="flex:1;min-width:0;">
      <div style="${S.newsTitle}">${escapeHtml(a.title)}</div>
      ${a.description ? `<div style="${S.newsDesc}">${escapeHtml(a.description)}</div>` : ''}
    </div>
    <span style="${S.newsBadge}">${escapeHtml(a.source)}</span>
  </div>
</a>`).join('')
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return ''
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
        id, name: p.person?.fullName || '',
        ab: s.atBats ?? 0, r: s.runs ?? 0, h: s.hits ?? 0,
        rbi: s.rbi ?? 0, hr: s.homeRuns ?? 0, bb: s.baseOnBalls ?? 0, so: s.strikeOuts ?? 0,
      }
    }).filter(Boolean)

    const pitchers = pitcherIds.map((id: number) => {
      const p = players[`ID${id}`]
      if (!p) return null
      const s = p.stats?.pitching || {}
      return {
        id, name: p.person?.fullName || '',
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

async function fetchFeedUrls(): Promise<{ name: string; url: string }[]> {
  const { data } = await maydaySupabase
    .from('research_feeds')
    .select('name, url')
    .eq('enabled', true)
  return (data || []).map((f: any) => ({ name: f.name, url: f.url }))
}

const BASEBALL_KEYWORDS = /\b(mlb|baseball|pitcher|batting|homer|home run|strikeout|innings?|bullpen|roster|free agent|trade|minor league|spring training|world series|playoffs|postseason|mound|dugout|umpire|outfield|infield|shortstop|catcher|lineup|standings|wild card|no-hitter|perfect game|grand slam|double play|triple play|farm system|draft|arbitration|injured list|disabled list|designated hitter|pinch hit|relief pitcher|closer|starter|rotation|pitch clock|milb|college baseball|ncaa baseball|little league|wbc|world baseball)\b/i

async function fetchNews() {
  const feeds = await fetchFeedUrls()
  const results = await Promise.allSettled(
    feeds.map(async (source) => {
      const feed = await rssParser.parseURL(source.url)
      return (feed.items || []).slice(0, 8).map(item => ({
        title: item.title || '',
        link: item.link || '',
        source: source.name,
        description: (item.contentSnippet || '').slice(0, 150).replace(/<[^>]*>/g, ''),
        isGeneralFeed: source.name === 'NYT Baseball',
      }))
    })
  )
  return results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(item => item.title && item.link)
    // Only filter general feeds (NYT Baseball) for baseball keywords;
    // baseball-specific feeds (ESPN MLB, FanGraphs, etc.) pass through
    .filter(item => !item.isGeneralFeed || BASEBALL_KEYWORDS.test(item.title) || BASEBALL_KEYWORDS.test(item.description))
}

const qAdmin = (sql: string) => supabaseAdmin.rpc('run_query', { query_text: sql.trim() })

async function fetchDailyHighlights(briefDate: string): Promise<DailyHighlightsData | null> {
  // Preconditions — if these fail, we can't produce anything meaningful, so bail.
  let prevDay: string
  let briefYear: number
  try {
    briefYear = new Date(briefDate).getFullYear()
    const regCheck = await qAdmin(`SELECT 1 FROM pitches WHERE game_year = ${briefYear} AND game_type = 'R' LIMIT 1`)
    const hasRS = (regCheck.data || []).length > 0
    const gtFilter = hasRS ? "AND game_type = 'R'" : ''

    const dateRes = await qAdmin(`
      SELECT MAX(game_date::text) AS gd FROM pitches
      WHERE game_date <= '${briefDate}' AND game_year = ${briefYear} ${gtFilter}
    `)
    const gd = dateRes.data?.[0]?.gd
    if (!gd) {
      console.warn('[highlights] no prevDay for', briefDate)
      return null
    }
    prevDay = gd
  } catch (err) {
    console.error('[highlights] precondition failed:', err)
    return null
  }

  // Each subsequent step is independent — if one fails, the others still run and we
  // return a partial highlights object rather than nuking the whole section.

  // Step 1 — Best Stuff+ pitch (starter + reliever)
  let stuffStarter: any = null
  let stuffReliever: any = null
  try {
    const stuffRes = await qAdmin(`
      WITH starters AS (
        SELECT DISTINCT pitcher, game_pk FROM pitches
        WHERE game_date = '${prevDay}' AND inning = 1
      ),
      ranked AS (
        SELECT p.pitcher AS player_id, pl.name AS player_name, pl.team,
               p.game_pk, p.pitch_name, p.stuff_plus,
               ROUND((p.pfx_x * 12)::numeric, 1) AS hbreak_in,
               ROUND((p.pfx_z * 12)::numeric, 1) AS ivb_in,
               ROUND(p.release_speed::numeric, 1) AS velo,
               CASE WHEN s.pitcher IS NOT NULL THEN 'starter' ELSE 'reliever' END AS role,
               ROW_NUMBER() OVER (
                 PARTITION BY CASE WHEN s.pitcher IS NOT NULL THEN 'starter' ELSE 'reliever' END
                 ORDER BY p.stuff_plus DESC NULLS LAST
               ) AS rn
        FROM pitches p
        JOIN players pl ON pl.id = p.pitcher
        LEFT JOIN starters s ON s.pitcher = p.pitcher AND s.game_pk = p.game_pk
        WHERE p.game_date = '${prevDay}' AND p.stuff_plus IS NOT NULL AND p.pitch_name IS NOT NULL
      )
      SELECT * FROM ranked WHERE rn = 1
    `)
    if (stuffRes.error) throw new Error(stuffRes.error.message)
    stuffStarter = (stuffRes.data || []).find((r: any) => r.role === 'starter') || null
    stuffReliever = (stuffRes.data || []).find((r: any) => r.role === 'reliever') || null
  } catch (err) {
    console.error('[highlights] stuff query failed:', err)
  }

  // Step 2 — Outing pitches + player map (feeds Cmd+ computation and new-pitch enrichment)
  const outingGroups: Record<string, { playerId: number; gamePk: number; pitches: PitchRow[]; isStarter: boolean }> = {}
  const playerMap: Record<number, { name: string; team: string }> = {}
  try {
    const [outingPitchesRes, outingPlayerRes] = await Promise.all([
      qAdmin(`
        SELECT p.pitcher AS player_id, p.game_pk,
               p.plate_x, p.plate_z, p.pitch_name, p.sz_top, p.sz_bot,
               p.zone, p.game_year, p.description, p.stand, p.inning
        FROM pitches p
        WHERE p.game_date = '${prevDay}' AND p.pitch_name IS NOT NULL
          AND p.plate_x IS NOT NULL AND p.plate_z IS NOT NULL
      `),
      qAdmin(`
        SELECT DISTINCT p.pitcher AS player_id, pl.name AS player_name, pl.team
        FROM pitches p JOIN players pl ON pl.id = p.pitcher
        WHERE p.game_date = '${prevDay}'
      `),
    ])
    if (outingPitchesRes.error) throw new Error(`outingPitches: ${outingPitchesRes.error.message}`)
    if (outingPlayerRes.error) throw new Error(`outingPlayer: ${outingPlayerRes.error.message}`)

    for (const r of (outingPlayerRes.data || [])) {
      playerMap[r.player_id] = { name: r.player_name, team: r.team || '??' }
    }
    for (const r of (outingPitchesRes.data || [])) {
      const key = `${r.player_id}-${r.game_pk}`
      if (!outingGroups[key]) {
        outingGroups[key] = { playerId: r.player_id, gamePk: r.game_pk, pitches: [], isStarter: false }
      }
      outingGroups[key].pitches.push({
        plate_x: Number(r.plate_x), plate_z: Number(r.plate_z),
        pitch_name: r.pitch_name, sz_top: Number(r.sz_top), sz_bot: Number(r.sz_bot),
        zone: Number(r.zone), game_year: Number(r.game_year),
        description: r.description || '', stand: r.stand || '',
      })
      if (Number(r.inning) === 1) outingGroups[key].isStarter = true
    }
  } catch (err) {
    console.error('[highlights] outing pitches query failed:', err)
  }

  // Step 3 — Best Cmd+ outing (CPU — guard each outing; one bad outing shouldn't kill the rest)
  let bestCmdStarter: DailyHighlightsData['cmd_starter'] = null
  let bestCmdReliever: DailyHighlightsData['cmd_reliever'] = null
  for (const outing of Object.values(outingGroups)) {
    if (outing.pitches.length < 15) continue
    try {
      const cmd = computeOutingCommand(outing.pitches)
      const cmdPlus = cmd.overall_cmd_plus
      if (cmdPlus == null) continue
      const info = playerMap[outing.playerId]
      const entry = {
        player_id: outing.playerId,
        player_name: info?.name || 'Unknown',
        team: info?.team || '??',
        cmd_plus: +cmdPlus.toFixed(1),
        pitches: outing.pitches.length,
        game_line: null as BriefGameLine | null,
      }
      if (outing.isStarter) {
        if (!bestCmdStarter || cmdPlus > bestCmdStarter.cmd_plus) bestCmdStarter = entry
      } else {
        if (!bestCmdReliever || cmdPlus > bestCmdReliever.cmd_plus) bestCmdReliever = entry
      }
    } catch (err) {
      console.error(`[highlights] computeOutingCommand failed for player ${outing.playerId} game ${outing.gamePk}:`, err)
    }
  }

  // Step 4 — New pitch alerts
  const newPitches: DailyHighlightsData['new_pitches'] = []
  try {
    const newPitchRes = await qAdmin(`
      WITH today_types AS (
        SELECT pitcher, pitch_name, COUNT(*) AS count,
               ROUND(AVG(pfx_x * 12)::numeric, 1) AS avg_hbreak,
               ROUND(AVG(pfx_z * 12)::numeric, 1) AS avg_ivb,
               ROUND(AVG(stuff_plus)::numeric, 1) AS avg_stuff_plus
        FROM pitches WHERE game_date = '${prevDay}' AND pitch_name IS NOT NULL
        GROUP BY pitcher, pitch_name
      ),
      prior_types AS (
        SELECT DISTINCT pitcher, pitch_name FROM pitches
        WHERE game_year = ${briefYear} AND game_date < '${prevDay}' AND pitch_name IS NOT NULL
          AND pitcher IN (SELECT DISTINCT pitcher FROM pitches WHERE game_date = '${prevDay}')
      )
      SELECT t.pitcher AS player_id, pl.name AS player_name, pl.team,
             t.pitch_name, t.count, t.avg_hbreak, t.avg_ivb, t.avg_stuff_plus
      FROM today_types t
      JOIN players pl ON pl.id = t.pitcher
      LEFT JOIN prior_types pr ON pr.pitcher = t.pitcher AND pr.pitch_name = t.pitch_name
      WHERE pr.pitcher IS NULL AND t.count >= 3
      ORDER BY t.count DESC
    `)
    if (newPitchRes.error) throw new Error(newPitchRes.error.message)

    for (const r of (newPitchRes.data || [])) {
      let cmdData: { avg_brink?: number | null; avg_cluster?: number | null; avg_missfire?: number | null; cmd_plus?: number | null } = {}
      const outingKey = Object.keys(outingGroups).find(k => k.startsWith(`${r.player_id}-`))
      if (outingKey) {
        try {
          const cmd = computeOutingCommand(outingGroups[outingKey].pitches)
          const ptCmd = cmd.byPitch[r.pitch_name]
          if (ptCmd) cmdData = { avg_brink: ptCmd.avg_brink, avg_cluster: ptCmd.avg_cluster, avg_missfire: ptCmd.avg_missfire, cmd_plus: ptCmd.cmd_plus }
        } catch { /* enrichment is optional */ }
      }
      newPitches.push({
        player_id: r.player_id, player_name: r.player_name, team: r.team || '??',
        pitch_name: r.pitch_name, count: Number(r.count),
        avg_hbreak: r.avg_hbreak != null ? Number(r.avg_hbreak) : null,
        avg_ivb: r.avg_ivb != null ? Number(r.avg_ivb) : null,
        avg_stuff_plus: r.avg_stuff_plus != null ? Number(r.avg_stuff_plus) : null,
        ...cmdData as any,
      })
    }
  } catch (err) {
    console.error('[highlights] new pitches query failed:', err)
  }

  // Step 5 — Game lines from MLB boxscore API (each already wrapped; we Promise.allSettled the batch)
  const fetchLine = async (gamePk: number, pid: number): Promise<BriefGameLine | null> => {
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`)
      if (!res.ok) return null
      const box = await res.json()
      for (const side of ['home', 'away'] as const) {
        const pitchers = box?.teams?.[side]?.pitchers || []
        if (pitchers.includes(pid)) {
          const s = box?.teams?.[side]?.players?.[`ID${pid}`]?.stats?.pitching
          if (!s) return null
          let decision = 'ND'
          const note: string = s.note || ''
          if (s.wins >= 1 || note.includes('W')) decision = 'W'
          else if (s.losses >= 1 || note.includes('L')) decision = 'L'
          else if (s.holds >= 1 || note.includes('H')) decision = 'HLD'
          else if (s.saves >= 1 || note.includes('S')) decision = 'SV'
          return { ip: s.inningsPitched || '0.0', h: s.hits ?? 0, r: s.runs ?? 0, er: s.earnedRuns ?? 0, bb: s.baseOnBalls ?? 0, k: s.strikeOuts ?? 0, pitches: s.numberOfPitches ?? 0, decision }
        }
      }
      return null
    } catch (err) {
      console.error(`[highlights] fetchLine failed for ${pid}@${gamePk}:`, err)
      return null
    }
  }

  const lineKeys: string[] = []
  const linePromises: Promise<BriefGameLine | null>[] = []
  if (stuffStarter) { lineKeys.push('ss'); linePromises.push(fetchLine(stuffStarter.game_pk, stuffStarter.player_id)) }
  if (stuffReliever) { lineKeys.push('sr'); linePromises.push(fetchLine(stuffReliever.game_pk, stuffReliever.player_id)) }
  const cmdStarterGpk = bestCmdStarter ? Object.values(outingGroups).find(o => o.playerId === bestCmdStarter!.player_id && o.isStarter)?.gamePk : undefined
  const cmdRelieverGpk = bestCmdReliever ? Object.values(outingGroups).find(o => o.playerId === bestCmdReliever!.player_id && !o.isStarter)?.gamePk : undefined
  if (bestCmdStarter && cmdStarterGpk) { lineKeys.push('cs'); linePromises.push(fetchLine(cmdStarterGpk, bestCmdStarter.player_id)) }
  if (bestCmdReliever && cmdRelieverGpk) { lineKeys.push('cr'); linePromises.push(fetchLine(cmdRelieverGpk, bestCmdReliever.player_id)) }

  const lineResults = await Promise.allSettled(linePromises)
  const lines: Record<string, BriefGameLine | null> = {}
  lineKeys.forEach((k, i) => {
    const r = lineResults[i]
    lines[k] = r.status === 'fulfilled' ? r.value : null
  })

  // Step 6 — Assemble. If every step failed, return null (nothing to show); otherwise return partial.
  const mapStuff = (r: any, lineKey: string) => r ? {
    player_id: r.player_id, player_name: r.player_name, team: r.team,
    pitch_name: r.pitch_name, stuff_plus: Number(r.stuff_plus),
    velo: r.velo != null ? Number(r.velo) : null,
    hbreak_in: r.hbreak_in != null ? Number(r.hbreak_in) : null,
    ivb_in: r.ivb_in != null ? Number(r.ivb_in) : null,
    game_line: lines[lineKey] || null,
  } : null

  if (bestCmdStarter) bestCmdStarter.game_line = lines['cs'] || null
  if (bestCmdReliever) bestCmdReliever.game_line = lines['cr'] || null

  const mappedStuffStarter = mapStuff(stuffStarter, 'ss')
  const mappedStuffReliever = mapStuff(stuffReliever, 'sr')

  if (!mappedStuffStarter && !mappedStuffReliever && !bestCmdStarter && !bestCmdReliever && newPitches.length === 0) {
    console.warn('[highlights] all sub-steps returned empty for', prevDay)
    return null
  }

  return {
    date: prevDay,
    stuff_starter: mappedStuffStarter,
    stuff_reliever: mappedStuffReliever,
    cmd_starter: bestCmdStarter,
    cmd_reliever: bestCmdReliever,
    new_pitches: newPitches,
  }
}

async function fetchTransactions(date: string) {
  const d = new Date(date)
  const formatted = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
  const url = `https://statsapi.mlb.com/api/v1/transactions?startDate=${formatted}&endDate=${formatted}&sportId=1`
  try {
    const resp = await fetch(url)
    if (!resp.ok) return { ilPlacements: [], ilActivations: [] }
    const data = await resp.json()
    const txns = data?.transactions || []

    const ilPlacements: { player: string; team: string; description: string }[] = []
    const ilActivations: { player: string; team: string; description: string }[] = []

    for (const tx of txns) {
      if (tx.typeCode !== 'SC') continue
      const desc: string = tx.description || ''
      const descLower = desc.toLowerCase()
      const player = tx.person?.fullName || ''
      const team = tx.toTeam?.name || tx.fromTeam?.name || ''

      if (descLower.includes('placed on') && descLower.includes('injured list')) {
        ilPlacements.push({ player, team, description: desc })
      } else if (descLower.includes('activated') && descLower.includes('injured list')) {
        ilActivations.push({ player, team, description: desc })
      }
    }

    return { ilPlacements, ilActivations }
  } catch {
    return { ilPlacements: [], ilActivations: [] }
  }
}

// ── Standings ──────────────────────────────────────────────────────────────

interface StandingsTeam { abbrev: string; name: string; w: number; l: number; gb: string; streak: string }
interface StandingsDivision { name: string; teams: StandingsTeam[] }
interface StandingsData { divisions: StandingsDivision[] }

const DIVISION_NAMES: Record<number, string> = {
  200: 'AL West', 201: 'AL East', 202: 'AL Central',
  203: 'NL West', 204: 'NL East', 205: 'NL Central',
}

const TEAM_ID_TO_ABBREV: Record<number, string> = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE',
  115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM',
  133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA', 137: 'SF', 138: 'STL', 139: 'TB',
  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS', 146: 'MIA',
  147: 'NYY', 158: 'MIL',
}

async function fetchStandings(date: string): Promise<StandingsData | null> {
  try {
    const year = date.slice(0, 4)
    const url = `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${year}&date=${date}&standingsTypes=regularSeason`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json()
    const divisions: StandingsDivision[] = []
    for (const rec of data?.records || []) {
      const divId = rec?.division?.id
      const divName = DIVISION_NAMES[divId] || rec?.division?.name || ''
      const teams: StandingsTeam[] = (rec?.teamRecords || []).map((t: any) => ({
        abbrev: TEAM_ID_TO_ABBREV[t.team?.id] || t.team?.name || '',
        name: t.team?.name || '',
        w: t.wins || 0,
        l: t.losses || 0,
        gb: t.gamesBack || '-',
        streak: t.streak?.streakCode || '',
      }))
      divisions.push({ name: divName, teams })
    }
    // Sort divisions by traditional order
    const order = ['AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West']
    divisions.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
    return { divisions }
  } catch (err) {
    console.error('fetchStandings error:', err)
    return null
  }
}

function buildStandingsHtml(data: StandingsData | null): string {
  if (!data || !data.divisions.length) return ''
  const divCard = (div: StandingsDivision) => {
    const rows = div.teams.map((t, i) => {
      const isLeader = i === 0
      const streakColor = t.streak.startsWith('W') ? '#34d399' : t.streak.startsWith('L') ? '#f87171' : 'rgba(255,255,255,0.4)'
      return `
        <tr>
          <td style="padding:5px 8px;color:${isLeader ? '#f0f0f0' : 'rgba(255,255,255,0.7)'};font-weight:${isLeader ? '700' : '500'};font-size:11px;">${escapeHtml(t.abbrev)}</td>
          <td style="padding:5px 8px;text-align:right;color:${isLeader ? '#f0f0f0' : 'rgba(255,255,255,0.6)'};font-size:11px;font-family:monospace;">${t.w}-${t.l}</td>
          <td style="padding:5px 8px;text-align:right;color:rgba(255,255,255,0.45);font-size:11px;font-family:monospace;">${t.gb === '-' ? '—' : t.gb}</td>
          <td style="padding:5px 8px;text-align:right;color:${streakColor};font-size:10px;font-family:monospace;font-weight:600;">${escapeHtml(t.streak)}</td>
        </tr>`
    }).join('')
    return `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;">
        <div style="padding:8px 12px;background:rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.06);font-size:10px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(div.name)}</div>
        <table style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody></table>
      </div>`
  }
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">${data.divisions.map(divCard).join('')}</div>`
}

// ── Trends Surges/Concerns ─────────────────────────────────────────────────

type TrendAlert = TrendAlertRow
interface TrendAlertsData { surges: TrendAlert[]; concerns: TrendAlert[] }

async function fetchTrendAlerts(_date: string): Promise<TrendAlertsData | null> {
  const year = new Date().getFullYear()
  const minPitches = (new Date().getMonth() + 1) <= 4 ? 50 : 200

  // Call trendAlerts lib directly instead of self-fetching /api/trends — the self-fetch
  // was failing silently on cron runs (cold start / deploy race) and producing empty
  // surges/concerns. See feedback_trend_alerts_direct.md in memory.
  let pitcherRows: TrendAlertRow[] = []
  let hitterRows: TrendAlertRow[] = []
  const [pResult, hResult] = await Promise.allSettled([
    computeTrendAlerts({ supabase: supabaseAdmin, season: year, playerType: 'pitcher', minPitches }),
    computeTrendAlerts({ supabase: supabaseAdmin, season: year, playerType: 'hitter', minPitches }),
  ])

  if (pResult.status === 'fulfilled') pitcherRows = pResult.value.rows
  else console.error('fetchTrendAlerts pitcher failed:', pResult.reason)

  if (hResult.status === 'fulfilled') hitterRows = hResult.value.rows
  else console.error('fetchTrendAlerts hitter failed:', hResult.reason)

  // If BOTH sides failed, return null so caller can distinguish error from "no alerts"
  if (pResult.status === 'rejected' && hResult.status === 'rejected') return null

  const all: TrendAlert[] = [...pitcherRows, ...hitterRows]

  const pickUnique = (list: TrendAlert[], n: number) => {
    const seen = new Set<number>()
    const result: TrendAlert[] = []
    for (const item of list) {
      if (!seen.has(item.player_id)) { seen.add(item.player_id); result.push(item) }
      if (result.length >= n) break
    }
    return result
  }

  const surges = pickUnique(all.filter(a => a.sentiment === 'good').sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma)), 5)
  const concerns = pickUnique(all.filter(a => a.sentiment === 'bad').sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma)), 5)
  return { surges, concerns }
}

function fmtTrendVal(metric: string, val: number): string {
  if (metric === 'xwoba') return val.toFixed(3)
  if (metric === 'spin') return String(Math.round(val))
  if (metric === 'velo' || metric === 'ev') return val.toFixed(1)
  return val.toFixed(1) + '%'
}

function buildSurgesConcernsHtml(data: TrendAlertsData | null): string {
  if (!data || (!data.surges.length && !data.concerns.length)) return ''
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tritonapex.io'

  const renderRow = (a: TrendAlert, color: string) => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <a href="${siteUrl}/player/${a.player_id}" style="color:#f0f0f0;text-decoration:none;font-weight:600;font-size:12px;">${escapeHtml(a.player_name)}</a>
      </td>
      <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);font-size:11px;">${escapeHtml(a.metric_label)}</td>
      <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);text-align:right;color:rgba(255,255,255,0.45);font-size:11px;font-family:monospace;">${fmtTrendVal(a.metric, a.season_val)}</td>
      <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);text-align:right;color:${color};font-size:11px;font-family:monospace;font-weight:700;">${fmtTrendVal(a.metric, a.recent_val)}</td>
    </tr>`

  const surgeRows = data.surges.map(a => renderRow(a, '#34d399')).join('')
  const concernRows = data.concerns.map(a => renderRow(a, '#f87171')).join('')

  const surgesSection = data.surges.length ? `
    <div>
      <div style="${S.sectionTitle}"><span style="color:#34d399">▲</span> Surges</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="text-align:left;font-size:9px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;">Player</th>
          <th style="text-align:left;font-size:9px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;">Metric</th>
          <th style="text-align:right;font-size:9px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;">Season</th>
          <th style="text-align:right;font-size:9px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;">Recent</th>
        </tr></thead>
        <tbody>${surgeRows}</tbody>
      </table>
    </div>` : '<div></div>'

  const concernsSection = data.concerns.length ? `
    <div>
      <div style="${S.sectionTitle}"><span style="color:#f87171">▼</span> Concerns</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="text-align:left;font-size:9px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;">Player</th>
          <th style="text-align:left;font-size:9px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;">Metric</th>
          <th style="text-align:right;font-size:9px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;">Season</th>
          <th style="text-align:right;font-size:9px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;">Recent</th>
        </tr></thead>
        <tbody>${concernRows}</tbody>
      </table>
    </div>` : '<div></div>'

  return surgesSection + concernsSection
}

// ── Start of the Day (top-ranked daily card from top_start bucket) ─────────

interface TopStartCardData {
  id: string
  pitcher_id: number | null
  pitcher_name: string | null
  game_info: string | null
}

async function fetchTopStartCard(date: string): Promise<TopStartCardData | null> {
  try {
    const { data } = await supabaseAdmin
      .from('daily_cards')
      .select('id, pitcher_id, pitcher_name, game_info')
      .eq('date', date)
      .eq('bucket', 'top_start')
      .eq('rank', 1)
      .maybeSingle()
    if (!data) return null
    return data as TopStartCardData
  } catch (err) {
    console.error('fetchTopStartCard error:', err)
    return null
  }
}

function buildStartOfDayHtml(card: TopStartCardData | null): string {
  if (!card) return ''
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tritonapex.io'
  const imgUrl = `${siteUrl}/api/card-image?id=${card.id}`
  const playerLink = card.pitcher_id ? `${siteUrl}/player/${card.pitcher_id}` : '#'
  return `
  <a href="${playerLink}" style="display:block;text-decoration:none;color:inherit;">
    <img src="${imgUrl}" alt="${escapeHtml(card.pitcher_name || 'Top Start')}" style="display:block;width:100%;max-width:100%;height:auto;border-radius:12px;border:1px solid rgba(255,255,255,0.08);" />
  </a>`
}
